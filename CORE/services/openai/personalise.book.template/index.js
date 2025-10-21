import OpenAI from "openai";
import { config } from "@/config";
import ErrorHandler from "@/Error";
import BookTemplate from "../../../../API/BOOK_TEMPLATE/model/index.js";
import PersonalizedBook from "../../../../API/PERSONALISATION/model/index.js";
import S3Service from "../../s3/index.js";
import ImageValidator from "../validatePicture/index.js";

class StoryPersonalizer {
  constructor() {
    const apiKey = config.openai.API_KEY;
    if (!apiKey) {
      throw new ErrorHandler("OpenAI API key is required", 500);
    }

    this.openai = new OpenAI({ apiKey });
    this.s3Service = new S3Service();
    this.imageValidator = new ImageValidator();
  }

  async personalizeStory(templateId, personalizationDetails) {
    try {
      const {
        childName,
        childAge,
        skinTone,
        hairType,
        hairStyle,
        hairColor,
        eyeColor,
        clothing,
        gender,
        photoUrl,
        validationResult,
      } = personalizationDetails;

      if (!templateId || !childName) {
        throw new ErrorHandler("Template ID and child name are required", 400);
      }

      const template = await BookTemplate.findByIdWithChapters(templateId);
      if (!template) {
        throw new ErrorHandler("Book template not found", 404);
      }

      if (!template.is_personalizable) {
        throw new ErrorHandler("This book template is not personalizable", 400);
      }

      console.log(
        `Personalizing template "${template.book_title}" for ${childName}`,
      );
      console.log("Photo URL provided:", !!photoUrl);

      if (photoUrl && validationResult) {
        this.checkPersonalizationAccuracy(
          validationResult,
          personalizationDetails,
        );
      }

      const personalizedStory = await this.rewriteStoryWithAI(
        template,
        personalizationDetails,
      );

      const personalizedImages = await this.generatePersonalizedImagesWithGPT(
        template,
        personalizedStory,
        personalizationDetails,
      );

      const personalizedCover = await this.generatePersonalizedCoverWithGPT(
        personalizedStory,
        personalizationDetails,
      );

      const storybookContent = this.assemblePersonalizedBook(
        personalizedStory,
        personalizedImages,
        personalizedCover,
      );

      return {
        ...storybookContent,
        personalization_metadata: {
          personalized_for: childName,
          personalized_age: childAge,
          personalized_at: new Date().toISOString(),
          original_template_id: templateId,
          original_template_title: template.book_title,
          used_photo: !!photoUrl,
          data_quality:
            validationResult?.dataQuality?.overallConfidence || "manual_input",
          confidence_warnings: validationResult?.warnings || [],
        },
      };
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler(
        `Failed to personalize story: ${error.message}`,
        500,
      );
    }
  }

  checkPersonalizationAccuracy(validationResult, personalizationDetails) {
    const { dataQuality, warnings } = validationResult;

    if (dataQuality && dataQuality.overallConfidence === "low") {
      console.warn("LOW CONFIDENCE PERSONALIZATION:", {
        childName: personalizationDetails.childName,
        warnings: dataQuality.warnings,
        recommendations: dataQuality.recommendations,
      });

      if (!dataQuality.canProceed) {
        throw new ErrorHandler(
          "Image quality is too poor for accurate personalization. " +
            "Please use a different photo or manually specify characteristics.",
          400,
        );
      }
    }

    if (warnings && warnings.length > 0) {
      warnings.forEach((warning) => {
        console.warn(
          `Personalization Warning for ${personalizationDetails.childName}:`,
          warning,
        );
      });
    }
  }

  async rewriteStoryWithAI(template, personalizationDetails) {
    const { childName, childAge, gender, validationResult } =
      personalizationDetails;

    try {
      const originalStory = {
        book_title: template.book_title,
        chapters: template.chapters.map((chapter) => ({
          chapter_title: chapter.chapter_title,
          chapter_content: chapter.chapter_content,
          image_description: chapter.image_description,
          image_position: chapter.image_position,
        })),
      };

      let characteristicsNote = "";
      if (
        validationResult &&
        validationResult.dataQuality &&
        validationResult.dataQuality.overallConfidence === "low"
      ) {
        characteristicsNote = `\n\nNOTE: Image analysis had low confidence. Focus on the provided name, age, and gender rather than physical characteristics from the photo.`;
      }

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a expert children's story editor. Your task is to personalize an existing story by replacing the main character with a new child while preserving the EXACT same plot, story structure, and chapter flow.

**CRITICAL RULES:**
1. PRESERVE THE ORIGINAL PLOT: Do not change the storyline, events, or narrative flow
2. MAINTAIN CHAPTER STRUCTURE: Keep the same number of chapters and same chapter titles
3. KEEP IMAGE POSITIONS: Maintain the exact same image_position values from the original
4. ONLY CHANGE CHARACTER DETAILS: Replace the main character's name, age, and gender references
5. CONSISTENT CHARACTER: Ensure ${childName} appears as the main character in every chapter
6. RETURN FORMAT: You MUST return a valid JSON object with the exact structure below
7. AVOID PHYSICAL DESCRIPTIONS: If image quality is poor, avoid detailed physical descriptions${characteristicsNote}

**JSON Structure:**
{
  "book_title": "Personalized title",
  "chapters": [
    {
      "chapter_title": "Chapter title",
      "chapter_content": "Chapter content",
      "image_description": "Image description"
    }
  ]
}

**Personalization Guidelines:**
- Replace the original main character's name with "${childName}" everywhere
- Update age references to match: ${childAge} years old
- Update pronouns to match gender: ${gender}
- Keep all other characters, settings, and events exactly the same
- Maintain original image descriptions but ensure they reference ${childName}

Return ONLY the JSON object, no other text. NO MARKDOWN CODE BLOCKS.`,
          },
          {
            role: "user",
            content: `ORIGINAL STORY TO PERSONALIZE:
${JSON.stringify(originalStory, null, 2)}

PERSONALIZE FOR THIS CHILD:
- Name: ${childName}
- Age: ${childAge}
- Gender: ${gender}

Please personalize this story exactly, keeping the same plot and structure but making ${childName} the main character throughout. Return ONLY valid JSON.`,
          },
        ],
        max_tokens: 4000,
        temperature: 0.2,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0].message.content.trim();
      let personalizedStory;

      try {
        let jsonContent = content;
        if (jsonContent.startsWith("```json")) {
          jsonContent = jsonContent
            .replace(/```json\s*/, "")
            .replace(/\s*```$/, "");
        } else if (jsonContent.startsWith("```")) {
          jsonContent = jsonContent
            .replace(/```\s*/, "")
            .replace(/\s*```$/, "");
        }

        personalizedStory = JSON.parse(jsonContent);
      } catch (parseError) {
        console.error("Failed to parse personalized story JSON:", parseError);
        console.log("Raw response:", content);

        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            personalizedStory = JSON.parse(jsonMatch[0]);
          } catch (secondError) {
            console.error("Failed to parse extracted JSON:", secondError);
            throw new Error("Invalid JSON response from personalization AI");
          }
        } else {
          throw new Error("No JSON found in AI response");
        }
      }

      if (
        !personalizedStory.book_title ||
        !personalizedStory.chapters ||
        !Array.isArray(personalizedStory.chapters)
      ) {
        throw new Error("Invalid story structure in AI response");
      }

      return {
        ...template,
        book_title:
          personalizedStory.book_title ||
          this.generatePersonalizedTitle(template.book_title, childName),
        chapters: personalizedStory.chapters.map((chapter, index) => ({
          ...chapter,
          image_position:
            template.chapters[index]?.image_position || "full scene",
          image_description:
            chapter.image_description ||
            template.chapters[index]?.image_description,
        })),
        author: childName,
      };
    } catch (error) {
      console.error("Error rewriting story with AI:", error);
      throw new ErrorHandler("Failed to rewrite story with AI", 500);
    }
  }

  generatePersonalizedTitle(originalTitle, childName) {
    return originalTitle.replace(/\b\w+\b's/, `${childName}'s`);
  }

  async generatePersonalizedImagesWithGPT(
    template,
    personalizedStory,
    personalizationDetails,
  ) {
    const {
      childName,
      childAge,
      skinTone,
      hairType,
      hairStyle,
      hairColor,
      eyeColor,
      clothing,
      gender,
      photoUrl,
      validationResult,
    } = personalizationDetails;

    const imagePromises = template.chapters.map(
      async (originalChapter, index) => {
        try {
          const personalizedChapter = personalizedStory.chapters[index];

          let imageUrl;
          if (photoUrl) {
            // Only customize images to look like photo when photo URL is provided
            const canUsePhoto =
              !validationResult ||
              (validationResult.dataQuality &&
                validationResult.dataQuality.canProceed !== false);

            if (canUsePhoto) {
              imageUrl = await this.generateImageFromPhotoWithGPT(
                photoUrl,
                personalizedChapter.image_description,
                originalChapter.image_position,
                childName,
                childAge,
                gender,
                validationResult?.characteristics,
              );
            } else {
              // Fall back to description-based generation if photo quality is poor
              imageUrl = await this.generateImageFromDescriptionWithGPT(
                personalizedChapter.image_description,
                originalChapter.image_position,
                personalizationDetails,
              );
            }
          } else {
            // No photo URL provided - use description only
            imageUrl = await this.generateImageFromDescriptionWithGPT(
              personalizedChapter.image_description,
              originalChapter.image_position,
              personalizationDetails,
            );
          }

          const s3Key = this.s3Service.generateImageKey(
            `personalized-books/${childName}/chapters`,
            `chapter-${index + 1}`,
          );
          const s3Url = await this.s3Service.uploadImageFromUrl(
            imageUrl,
            s3Key,
          );

          return s3Url;
        } catch (error) {
          console.error(
            `Error generating image for chapter ${index + 1}:`,
            error,
          );
          return originalChapter.image_url;
        }
      },
    );

    return Promise.all(imagePromises);
  }

  async generateImageFromPhotoWithGPT(
    photoUrl,
    imageDescription,
    imagePosition,
    childName,
    childAge,
    gender,
    characteristics,
  ) {
    try {
      const enhancedPrompt = await this.createEnhancedPromptFromPhoto(
        photoUrl,
        imageDescription,
        imagePosition,
        childName,
        childAge,
        gender,
        characteristics,
      );

      return await this.generateDalleImage(enhancedPrompt);
    } catch (error) {
      console.error("Error generating image from photo with GPT:", error);
      throw error;
    }
  }

  async createEnhancedPromptFromPhoto(
    photoUrl,
    imageDescription,
    imagePosition,
    childName,
    childAge,
    gender,
    characteristics,
  ) {
    const appearanceDescription = await this.analyzePhotoWithGPT(photoUrl);

    let characteristicsText = "";
    if (characteristics) {
      const highConfidenceFeatures = [];

      Object.entries(characteristics).forEach(([key, value]) => {
        if (
          value &&
          typeof value === "object" &&
          value.confidence === "high" &&
          value.value !== "unknown"
        ) {
          highConfidenceFeatures.push(`${key}: ${value.value}`);
        }
      });

      if (highConfidenceFeatures.length > 0) {
        characteristicsText = `CONFIRMED FEATURES: ${highConfidenceFeatures.join(", ")}. `;
      }
    }

    return `Children's book illustration in Studio Ghibli style.

SCENE: ${imageDescription}
IMAGE POSITION: ${imagePosition}
MAIN CHARACTER: ${childName}, ${childAge} years old, ${gender}
${characteristicsText}
CHARACTER APPEARANCE: ${appearanceDescription}

CRITICAL REQUIREMENTS - DO NOT IGNORE:
- ABSOLUTELY NO TEXT: The image must contain zero text, words, letters, numbers, symbols, or writing of any kind
- NO SPEECH BUBBLES: Do not include speech bubbles or dialogue containers
- NO LABELS: Do not include any labels, captions, or text elements
- NO BOOK TITLES: Do not include any book titles or text on the image
- PURE ILLUSTRATION: This must be a pure illustration with only visual elements
- SINGLE IMAGE: Create exactly one image - no multiple images or panels
- CHARACTER LIKENESS: The main character must look like the reference photo

Style: Whimsical, magical Studio Ghibli animation style with soft lighting and vibrant colors.
Composition: Use ${imagePosition} layout as specified.
Focus on creating an engaging, professional children's book illustration that is completely free of any text elements and resembles the child in the reference photo.`;
  }

  async analyzePhotoWithGPT(photoUrl) {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Describe this child's appearance in detail, focusing on: skin tone, hair style, hair color, eye color, facial features, and clothing. Be specific and descriptive for illustration purposes. If any features are unclear, mention that they are not clearly visible.",
              },
              {
                type: "image_url",
                image_url: { url: photoUrl },
              },
            ],
          },
        ],
        max_tokens: 300,
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error("Error analyzing photo with GPT:", error);
      return "a child with typical features";
    }
  }

  async generateImageFromDescriptionWithGPT(
    imageDescription,
    imagePosition,
    personalizationDetails,
  ) {
    const {
      childName,
      childAge,
      skinTone,
      hairType,
      hairStyle,
      hairColor,
      eyeColor,
      clothing,
      gender,
    } = personalizationDetails;

    const prompt = `Children's book illustration in Studio Ghibli style.

SCENE: ${imageDescription}
IMAGE POSITION: ${imagePosition}
MAIN CHARACTER: ${childName}, ${childAge} years old, ${gender}
CHARACTER DETAILS:
${skinTone ? `- Skin tone: ${skinTone}` : ""}
${hairColor ? `- Hair color: ${hairColor}` : ""}
${hairStyle ? `- Hairstyle: ${hairStyle}` : ""}
${eyeColor ? `- Eye color: ${eyeColor}` : ""}
${clothing ? `- Clothing: ${clothing}` : ""}

CRITICAL REQUIREMENTS - DO NOT IGNORE:
- ABSOLUTELY NO TEXT: The image must contain zero text, words, letters, numbers, symbols, or writing of any kind
- NO SPEECH BUBBLES: Do not include speech bubbles or dialogue containers
- NO LABELS: Do not include any labels, captions, or text elements
- NO BOOK TITLES: Do not include any book titles or text on the image
- PURE ILLUSTRATION: This must be a pure illustration with only visual elements, without any text of any sort or kind
- SINGLE IMAGE: Create exactly one image - no multiple images or panels

Style: Whimsical, magical Studio Ghibli animation style with soft lighting and vibrant colors.
Composition: Use ${imagePosition} layout as specified.
Create a professional children's book illustration that is completely free of any text elements.`;

    return await this.generateDalleImage(prompt);
  }

  async generatePersonalizedCoverWithGPT(
    personalizedStory,
    personalizationDetails,
  ) {
    try {
      const { childName, photoUrl, validationResult } = personalizationDetails;

      let coverPrompt;

      if (photoUrl) {
        // Only customize cover to look like photo when photo URL is provided
        const canUsePhoto =
          !validationResult ||
          (validationResult.dataQuality &&
            validationResult.dataQuality.canProceed !== false);

        if (canUsePhoto) {
          const appearanceDescription =
            await this.analyzePhotoWithGPT(photoUrl);
          coverPrompt = `Children's book cover illustration in Studio Ghibli style.

MAIN CHARACTER: ${childName}
CHARACTER APPEARANCE: ${appearanceDescription}

CRITICAL REQUIREMENTS - DO NOT IGNORE:
- ABSOLUTELY NO TEXT: The image must contain zero text, words, letters, numbers, symbols, or writing of any kind
- NO SPEECH BUBBLES: Do not include speech bubbles or dialogue containers
- NO LABELS: Do not include any labels, captions, or text elements
- NO BOOK TITLES: Do not include any book titles or text on the image
- PURE ILLUSTRATION: This must be a pure illustration with only visual elements
- SINGLE IMAGE: Create exactly one image - no multiple images or panels
- COVER STYLE: Create a magical, engaging cover illustration that represents adventure and wonder
- CHARACTER LIKENESS: The main character must look like the reference photo

Style: Magical Studio Ghibli cover art, vibrant colors, engaging composition.
Create a cover illustration that represents the story's adventure and magic while being completely free of any text elements and resembles the child in the reference photo.`;
        } else {
          // Fall back to description-based cover
          const { skinTone, hairColor, eyeColor, clothing, gender, childAge } =
            personalizationDetails;

          coverPrompt = `Children's book cover illustration in Studio Ghibli style.

MAIN CHARACTER: ${childName}, ${childAge} years old, ${gender}
CHARACTER DETAILS:
${skinTone ? `- Skin tone: ${skinTone}` : ""}
${hairColor ? `- Hair color: ${hairColor}` : ""}
${eyeColor ? `- Eye color: ${eyeColor}` : ""}
${clothing ? `- Clothing: ${clothing}` : ""}

CRITICAL REQUIREMENTS - DO NOT IGNORE:
- ABSOLUTELY NO TEXT: The image must contain zero text, words, letters, numbers, symbols, or writing of any kind
- NO SPEECH BUBBLES: Do not include speech bubbles or dialogue containers
- NO LABELS: Do not include any labels, captions, or text elements
- NO BOOK TITLES: Do not include any book titles or text on the image
- PURE ILLUSTRATION: This must be a pure illustration with only visual elements
- SINGLE IMAGE: Create exactly one image - no multiple images or panels
- COVER STYLE: Create a magical, engaging cover illustration that represents adventure and wonder

Style: Magical Studio Ghibli cover art, vibrant colors, engaging composition.
Create a cover illustration that represents the story's adventure and magic while being completely free of any text elements.`;
        }
      } else {
        // No photo URL provided - use description only
        const { skinTone, hairColor, eyeColor, clothing, gender, childAge } =
          personalizationDetails;

        coverPrompt = `Children's book cover illustration in Studio Ghibli style.

MAIN CHARACTER: ${childName}, ${childAge} years old, ${gender}
CHARACTER DETAILS:
${skinTone ? `- Skin tone: ${skinTone}` : ""}
${hairColor ? `- Hair color: ${hairColor}` : ""}
${eyeColor ? `- Eye color: ${eyeColor}` : ""}
${clothing ? `- Clothing: ${clothing}` : ""}

CRITICAL REQUIREMENTS - DO NOT IGNORE:
- ABSOLUTELY NO TEXT: The image must contain zero text, words, letters, numbers, symbols, or writing of any kind
- NO SPEECH BUBBLES: Do not include speech bubbles or dialogue containers
- NO LABELS: Do not include any labels, captions, or text elements
- NO BOOK TITLES: Do not include any book titles or text on the image
- PURE ILLUSTRATION: This must be a pure illustration with only visual elements
- SINGLE IMAGE: Create exactly one image - no multiple images or panels
- COVER STYLE: Create a magical, engaging cover illustration that represents adventure and wonder

Style: Magical Studio Ghibli cover art, vibrant colors, engaging composition.
Create a cover illustration that represents the story's adventure and magic while being completely free of any text elements.`;
      }

      const imageUrl = await this.generateDalleImage(coverPrompt);

      const s3Key = this.s3Service.generateImageKey(
        `personalized-books/${childName}/covers`,
        "personalized-cover",
      );
      return await this.s3Service.uploadImageFromUrl(imageUrl, s3Key);
    } catch (error) {
      console.error("Error generating personalized cover with GPT:", error);
      return null;
    }
  }

  async generateDalleImage(prompt) {
    const enhancedPrompt =
      prompt +
      " EXTREMELY IMPORTANT: The image must be completely free of any text, words, letters, numbers, or symbols. This is a pure visual illustration with zero text elements of any kind. again NO TEXT of any kind";

    const image = await this.openai.images.generate({
      model: "dall-e-3",
      prompt: enhancedPrompt,
      size: "1024x1024",
      quality: "hd",
      n: 1,
    });

    return image.data[0].url;
  }

  assemblePersonalizedBook(personalizedStory, chapterImages, coverImage) {
    const updatedChapters = personalizedStory.chapters.map(
      (chapter, index) => ({
        ...chapter,
        image_url: chapterImages[index] || chapter.image_url || "",
        image_position: chapter.image_position,
      }),
    );

    return {
      ...personalizedStory,
      chapters: updatedChapters,
      cover_image: coverImage ? [coverImage] : personalizedStory.cover_image,
    };
  }

  async createPersonalizedBook(templateId, userId, personalizationDetails) {
    try {
      if (!templateId || !userId || !personalizationDetails.childName) {
        throw new ErrorHandler(
          "Template ID, user ID and child name are required",
          400,
        );
      }

      let validationResult = null;
      if (personalizationDetails.photoUrl) {
        try {
          validationResult =
            await this.imageValidator.validateImageForPersonalization(
              personalizationDetails.photoUrl,
            );
          personalizationDetails.validationResult = validationResult;
        } catch (validationError) {
          console.warn(
            "Image validation failed, proceeding with manual characteristics:",
            validationError.message,
          );
        }
      }

      const personalizedContent = await this.personalizeStory(
        templateId,
        personalizationDetails,
      );

      const originalTemplate = await BookTemplate.findById(templateId);
      const price = this.calculatePersonalizationPrice(originalTemplate.price);

      const personalizedBookData = {
        original_template_id: templateId,
        user_id: userId,
        child_name: personalizationDetails.childName,
        child_age: personalizationDetails.childAge,
        gender_preference: personalizationDetails.gender,
        price: price,
        personalized_content: personalizedContent,
        is_paid: false,
        // Removed validation_data field as it's not allowed in the schema
      };

      const personalizedBook =
        await PersonalizedBook.createPersonaliseBook(personalizedBookData);

      try {
        await BookTemplate.incrementPopularity(templateId);
        console.log(`Increased popularity for template ${templateId}`);
      } catch (error) {
        console.error(
          `Failed to increment popularity for template ${templateId}:`,
          error,
        );
      }

      return {
        personalizedBook,
        price,
        validation: validationResult,
        dataQuality: validationResult?.dataQuality || {
          overallConfidence: "manual_input",
        },
      };
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler(
        `Failed to create personalized book: ${error.message}`,
        500,
      );
    }
  }

  calculatePersonalizationPrice(basePrice) {
    const personalizationFee = basePrice ? Math.max(basePrice * 0.2, 5) : 10;
    return basePrice
      ? parseFloat(basePrice) + personalizationFee
      : personalizationFee;
  }

  getIdealPhotoGuidelines() {
    return this.imageValidator.getIdealImageSpecifications();
  }
}

export default StoryPersonalizer;
