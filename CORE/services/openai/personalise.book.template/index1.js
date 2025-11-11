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

      const finalGender = await this.extractGenderFromPhoto(
        gender,
        validationResult,
        photoUrl,
      );
      personalizationDetails.gender = finalGender;

      const usePhotoData = this.shouldUsePhotoData(validationResult);

      if (photoUrl && validationResult && !usePhotoData) {
        console.warn(
          "Photo data insufficient, falling back to manual characteristics",
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
        usePhotoData,
      );

      const storySummary = await this.generateStorySummary(personalizedStory);

      const personalizedCover = await this.generatePersonalizedCoverWithGPT(
        personalizedStory,
        personalizationDetails,
        usePhotoData,
        storySummary,
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
          used_photo_data: usePhotoData,
          data_quality:
            validationResult?.dataQuality?.overallConfidence || "manual_input",
          confidence_warnings: validationResult?.warnings || [],
          extracted_gender: finalGender,
          gender_source: gender
            ? "manual"
            : validationResult
              ? "photo"
              : "default",
          story_summary: storySummary,
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

  async addPersonalizationToBook(bookId, userId, personalizationData) {
    try {
      // Check if book exists and is paid
      const book = await PersonalizedBook.findByIdForUser(bookId, userId);

      if (!book) {
        throw new ErrorHandler("Book not found", 404);
      }

      if (!book.is_paid) {
        throw new ErrorHandler("Payment required before personalization", 402);
      }

      if (book.is_personalized) {
        throw new ErrorHandler("Book is already personalized", 400);
      }

      // Perform personalization
      const personalizedContent = await this.personalizeStory(
        book.original_template_id,
        personalizationData,
      );

      // Update book with personalization
      const updatedBook = await PersonalizedBook.addPersonalization(
        bookId,
        userId,
        {
          personalized_content: personalizedContent,
          dedication_message: personalizationData.dedication_message,
        },
      );

      return updatedBook;
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler(
        `Failed to add personalization to book: ${error.message}`,
        500,
      );
    }
  }

  async createBookForPayment(templateId, userId, basicDetails) {
    try {
      const { childName, childAge, gender } = basicDetails;

      if (!templateId || !childName) {
        throw new ErrorHandler("Template ID and child name are required", 400);
      }

      const template = await BookTemplate.findById(templateId);
      console.log(template);
      if (!template) {
        throw new ErrorHandler("Book template not found", 404);
      }

      const bookData = {
        original_template_id: templateId,
        user_id: userId,
        child_name: childName,
        child_age: childAge,
        gender_preference: gender,
        price: template.price,
        book_title: template.book_title,
        genre: template.genre,
        cover_image: template.cover_image,
        video_url: template.video_url,
      };

      const book = await PersonalizedBook.createBookForPayment(bookData);

      return book;
    } catch (error) {
      console.log(error);
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler(
        `Failed to create book for payment: ${error.message}`,
        500,
      );
    }
  }

  async generateStorySummary(personalizedStory) {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `Create a brief, vivid summary of this children's story that captures its main themes, settings, and magical elements. Focus on the overall adventure and emotional journey. Return ONLY a JSON object:
            {
              "summary": "2-3 sentence summary of the entire story",
              "main_themes": ["array of 3-5 key themes"],
              "key_settings": ["array of 2-4 main locations"],
              "magical_elements": ["array of 3-5 magical/fantasy elements"]
            }`,
          },
          {
            role: "user",
            content: `STORY TITLE: ${personalizedStory.book_title}
            
            CHAPTERS:
            ${personalizedStory.chapters
              .map(
                (chapter, index) =>
                  `Chapter ${index + 1}: ${chapter.chapter_title}\n${chapter.chapter_content}`,
              )
              .join("\n\n")}`,
          },
        ],
        max_tokens: 800,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0].message.content.trim();
      return JSON.parse(content);
    } catch (error) {
      console.error("Error generating story summary:", error);
      return {
        summary: "A magical adventure story filled with wonder and excitement",
        main_themes: ["adventure", "friendship", "courage"],
        key_settings: ["magical lands", "enchanted forests"],
        magical_elements: ["magic", "fantasy creatures", "wonder"],
      };
    }
  }

  async extractGenderFromPhoto(manualGender, validationResult, photoUrl) {
    if (
      manualGender &&
      (manualGender === "male" || manualGender === "female")
    ) {
      return manualGender;
    }
    if (
      validationResult?.analysis?.gender &&
      validationResult.analysis.gender !== "unknown"
    ) {
      const photoGender = validationResult.analysis.gender;
      return photoGender;
    }
    if (photoUrl && !manualGender) {
      try {
        const genderFromPhoto = await this.extractGenderDirectly(photoUrl);
        if (genderFromPhoto) {
          return genderFromPhoto;
        }
      } catch (error) {
        console.warn(
          "Failed to extract gender directly from photo:",
          error.message,
        );
      }
    }

    if (manualGender) {
      return manualGender;
    }

    return "female";
  }

  async extractGenderDirectly(photoUrl) {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this image and determine the gender of the child. Return ONLY a JSON object with this structure:
                {
                  "gender": "male" or "female" or "unknown",
                  "confidence": "high" or "medium" or "low",
                  "reasons": ["short array of reasons"]
                }`,
              },
              {
                type: "image_url",
                image_url: { url: photoUrl },
              },
            ],
          },
        ],
        max_tokens: 500,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0].message.content;
      if (!content) {
        console.warn("Empty response from OpenAI for gender extraction");
        return null;
      }

      const trimmedContent = content.trim();
      const result = JSON.parse(trimmedContent);

      if (
        result.gender &&
        result.gender !== "unknown" &&
        result.confidence === "high"
      ) {
        return result.gender;
      }

      return null;
    } catch (error) {
      console.error("Error extracting gender directly:", error);
      return null;
    }
  }

  shouldUsePhotoData(validationResult) {
    if (
      !validationResult ||
      !validationResult.analysis ||
      !validationResult.analysis.characteristics
    ) {
      return false;
    }

    const characteristics = validationResult.analysis.characteristics;
    const requiredFields = [
      "skin_tone",
      "hair_type",
      "hairstyle",
      "hair_color",
      "eye_color",
    ];
    const highConfidenceFields = requiredFields.filter(
      (field) =>
        characteristics[field]?.confidence === "high" &&
        characteristics[field]?.value &&
        characteristics[field]?.value !== "unknown" &&
        characteristics[field]?.value.trim() !== "",
    );

    const hasSufficientData = highConfidenceFields.length >= 3;

    return hasSufficientData;
  }

  getMergedCharacteristics(personalizationDetails, usePhotoData) {
    const {
      skinTone,
      hairType,
      hairStyle,
      hairColor,
      eyeColor,
      clothing,
      validationResult,
    } = personalizationDetails;

    if (usePhotoData && validationResult?.analysis?.characteristics) {
      const photoChars = validationResult.analysis.characteristics;

      const enhancedCharacteristics = this.extractEnhancedCharacteristics(
        photoChars,
        validationResult.analysis,
      );

      const mergedCharacteristics = {
        skinTone: this.getBestCharacteristic(photoChars.skin_tone, skinTone),
        hairType: this.getBestCharacteristic(photoChars.hair_type, hairType),
        hairStyle: this.getBestCharacteristic(photoChars.hairstyle, hairStyle),
        hairColor: this.getBestCharacteristic(photoChars.hair_color, hairColor),
        eyeColor: this.getBestCharacteristic(photoChars.eye_color, eyeColor),
        clothing: this.getBestCharacteristic(photoChars.clothing, clothing),

        faceShape: enhancedCharacteristics.faceShape,
        facialFeatures: enhancedCharacteristics.facialFeatures,
        eyebrowShape: enhancedCharacteristics.eyebrowShape,
        noseShape: enhancedCharacteristics.noseShape,
        lipShape: enhancedCharacteristics.lipShape,
        eyeShape: enhancedCharacteristics.eyeShape,
        cheekShape: enhancedCharacteristics.cheekShape,
        jawline: enhancedCharacteristics.jawline,
        forehead: enhancedCharacteristics.forehead,
        earShape: enhancedCharacteristics.earShape,
        distinctiveMarks: enhancedCharacteristics.distinctiveMarks,
        expression: enhancedCharacteristics.expression,
        hairTexture: enhancedCharacteristics.hairTexture,
        hairLength: enhancedCharacteristics.hairLength,
        hairParting: enhancedCharacteristics.hairParting,
        eyebrowColor: enhancedCharacteristics.eyebrowColor,
        eyelashType: enhancedCharacteristics.eyelashType,
        complexion: enhancedCharacteristics.complexion,

        source: "photo",
      };

      return mergedCharacteristics;
    }

    const manualCharacteristics = {
      skinTone: skinTone || "light",
      hairType: hairType || "straight",
      hairStyle: hairStyle || "simple",
      hairColor: hairColor || "brown",
      eyeColor: eyeColor || "brown",
      clothing: clothing || "casual",
      source: "manual",
    };

    return manualCharacteristics;
  }

  extractEnhancedCharacteristics(characteristics, analysis) {
    const enhanced = {
      faceShape: this.inferFaceShape(characteristics),
      cheekShape: "rounded",
      jawline: "soft",
      forehead: "average",
      eyeShape: "almond",
      noseShape: "button",
      lipShape: "full",
      earShape: "standard",
      hairTexture: this.inferHairTexture(characteristics.hair_type?.value),
      hairLength: this.inferHairLength(characteristics.hairstyle?.value),
      hairParting: this.inferHairParting(characteristics.hairstyle?.value),
      eyebrowShape: "natural",
      eyebrowColor: characteristics.hair_color?.value || "natural",
      eyelashType: "natural",
      complexion: this.inferComplexion(characteristics.skin_tone?.value),
      distinctiveMarks: [],
      expression: "happy",
      facialFeatures: [],
    };

    if (characteristics.facial_features?.values) {
      enhanced.facialFeatures = characteristics.facial_features.values;
    }

    this.addInferredFeatures(enhanced, characteristics, analysis);

    return enhanced;
  }

  inferFaceShape(characteristics) {
    if (characteristics.facial_features?.values) {
      const features = characteristics.facial_features.values;
      if (features.some((f) => f.includes("round") || f.includes("chubby")))
        return "round";
      if (features.some((f) => f.includes("oval"))) return "oval";
      if (features.some((f) => f.includes("heart"))) return "heart";
    }
    return "oval";
  }

  inferHairTexture(hairType) {
    if (!hairType) return "medium";
    if (hairType.includes("curly") || hairType.includes("afro")) return "curly";
    if (hairType.includes("wavy")) return "wavy";
    if (hairType.includes("straight")) return "straight";
    return "medium";
  }

  inferHairLength(hairstyle) {
    if (!hairstyle) return "medium";
    if (
      hairstyle.includes("long") ||
      hairstyle.includes("braid") ||
      hairstyle.includes("ponytail")
    )
      return "long";
    if (hairstyle.includes("short") || hairstyle.includes("buzz"))
      return "short";
    if (hairstyle.includes("shoulder")) return "medium";
    return "medium";
  }

  inferHairParting(hairstyle) {
    if (!hairstyle) return "center";
    if (hairstyle.includes("side")) return "side";
    if (hairstyle.includes("middle")) return "center";
    return "center";
  }

  inferComplexion(skinTone) {
    if (!skinTone) return "clear";
    if (skinTone.includes("fair") || skinTone.includes("light")) return "fair";
    if (skinTone.includes("olive")) return "olive";
    if (skinTone.includes("dark") || skinTone.includes("deep")) return "deep";
    return "clear";
  }

  addInferredFeatures(enhanced, characteristics, analysis) {
    enhanced.facialFeatures.push("youthful", "soft_features");
    if (analysis.face_confidence === "high") {
      enhanced.facialFeatures.push("clear_visibility", "well_defined");
    }
    if (characteristics.eye_color?.value) {
      enhanced.facialFeatures.push(`${characteristics.eye_color.value}_eyes`);
    }

    if (characteristics.hair_color?.value) {
      enhanced.facialFeatures.push(`${characteristics.hair_color.value}_hair`);
    }
  }

  getBestCharacteristic(photoChar, manualChar) {
    if (
      photoChar?.confidence === "high" &&
      photoChar?.value &&
      photoChar.value !== "unknown" &&
      photoChar.value.trim() !== ""
    ) {
      return photoChar.value;
    }
    return manualChar;
  }

  async rewriteStoryWithAI(template, personalizationDetails) {
    const { childName, childAge, gender } = personalizationDetails;

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

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a expert children's story editor. Your task is to personalize an existing story by replacing the main character with a new child while preserving the EXACT same plot, story structure, and chapter flow.`,
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
    usePhotoData,
  ) {
    const { childName, photoUrl, validationResult } = personalizationDetails;

    const imagePromises = template.chapters.map(
      async (originalChapter, index) => {
        try {
          const personalizedChapter = personalizedStory.chapters[index];
          const mergedChars = this.getMergedCharacteristics(
            personalizationDetails,
            usePhotoData,
          );

          let imageUrl;
          if (photoUrl && usePhotoData) {
            imageUrl = await this.generateImageFromPhotoWithGPT(
              photoUrl,
              personalizedChapter.image_description,
              originalChapter.image_position,
              childName,
              personalizationDetails,
              validationResult,
              mergedChars,
            );
          } else {
            imageUrl = await this.generateImageFromDescriptionWithGPT(
              personalizedChapter.image_description,
              originalChapter.image_position,
              childName,
              personalizationDetails,
              mergedChars,
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
    personalizationDetails,
    validationResult,
    mergedChars,
  ) {
    try {
      const { childAge, gender } = personalizationDetails;

      let characteristicsText = this.buildComprehensiveCharacteristics(
        validationResult?.analysis?.characteristics,
        mergedChars,
      );

      const prompt = `CRITICAL CHARACTER REQUIREMENTS - MUST FOLLOW EXACTLY:
${characteristicsText}

SCENE DESCRIPTION: ${imageDescription}
IMAGE POSITION: ${imagePosition}
CHARACTER: ${childName}, ${childAge} years old, ${gender}`;

      return await this.generateStrictDalleImage(prompt);
    } catch (error) {
      console.error("Error generating image from photo with GPT:", error);
      throw error;
    }
  }

  buildComprehensiveCharacteristics(characteristics, mergedChars) {
    let characteristicsText =
      "CHARACTER APPEARANCE - MUST BE REPRODUCED EXACTLY:\n";

    characteristicsText += `- Skin tone: "${mergedChars.skinTone}"\n`;
    characteristicsText += `- Hair color: "${mergedChars.hairColor}"\n`;
    characteristicsText += `- Hairstyle: "${mergedChars.hairStyle}"\n`;
    characteristicsText += `- Eye color: "${mergedChars.eyeColor}"\n`;
    characteristicsText += `- Clothing style: "${mergedChars.clothing}"\n`;

    if (mergedChars.faceShape)
      characteristicsText += `- Face shape: "${mergedChars.faceShape}"\n`;
    if (mergedChars.eyeShape)
      characteristicsText += `- Eye shape: "${mergedChars.eyeShape}"\n`;
    if (mergedChars.noseShape)
      characteristicsText += `- Nose shape: "${mergedChars.noseShape}"\n`;
    if (mergedChars.lipShape)
      characteristicsText += `- Lip shape: "${mergedChars.lipShape}"\n`;
    if (mergedChars.hairTexture)
      characteristicsText += `- Hair texture: "${mergedChars.hairTexture}"\n`;
    if (mergedChars.complexion)
      characteristicsText += `- Complexion: "${mergedChars.complexion}"\n`;

    if (mergedChars.facialFeatures && mergedChars.facialFeatures.length > 0) {
      characteristicsText += `- Distinctive features: ${mergedChars.facialFeatures.slice(0, 3).join(", ")}\n`;
    }

    return characteristicsText;
  }

  async generateImageFromDescriptionWithGPT(
    imageDescription,
    imagePosition,
    childName,
    personalizationDetails,
    mergedChars,
  ) {
    const { childAge, gender } = personalizationDetails;

    const prompt = `CRITICAL CHARACTER REQUIREMENTS - MUST FOLLOW EXACTLY:

CHARACTER APPEARANCE - MUST BE REPRODUCED EXACTLY:
- Skin tone: "${mergedChars.skinTone}"
- Hair color: "${mergedChars.hairColor}"
- Hairstyle: "${mergedChars.hairStyle}"
- Eye color: "${mergedChars.eyeColor}"
- Clothing style: "${mergedChars.clothing}"

SCENE DESCRIPTION: ${imageDescription}
IMAGE POSITION: ${imagePosition}
CHARACTER: ${childName}, ${childAge} years old, ${gender}`;

    return await this.generateStrictDalleImage(prompt);
  }

  async generatePersonalizedCoverWithGPT(
    personalizedStory,
    personalizationDetails,
    usePhotoData,
    storySummary,
  ) {
    try {
      const { childName, photoUrl, validationResult } = personalizationDetails;
      const mergedChars = this.getMergedCharacteristics(
        personalizationDetails,
        usePhotoData,
      );

      let coverPrompt;

      if (photoUrl && usePhotoData) {
        const characteristics = validationResult?.analysis?.characteristics;
        const characteristicsText = this.buildComprehensiveCharacteristics(
          characteristics,
          mergedChars,
        );

        coverPrompt = `CRITICAL CHARACTER REQUIREMENTS - MUST FOLLOW EXACTLY:
${characteristicsText}

STORY CONTEXT:
- Title: ${personalizedStory.book_title}
- Summary: ${storySummary.summary.substring(0, 200)}...
- Main Themes: ${storySummary.main_themes.slice(0, 3).join(", ")}
- Key Settings: ${storySummary.key_settings.slice(0, 2).join(", ")}
- Magical Elements: ${storySummary.magical_elements.slice(0, 3).join(", ")}

CHARACTER: ${childName}
COVER REQUIREMENTS:
- Capture the essence of the entire story journey
- Show ${childName} in a moment that represents the story's adventure
- Include visual references to main settings and magical elements`;
      } else {
        const { childAge, gender } = personalizationDetails;
        coverPrompt = `CRITICAL CHARACTER REQUIREMENTS - MUST FOLLOW EXACTLY:

CHARACTER APPEARANCE - MUST BE REPRODUCED EXACTLY:
- Skin tone: "${mergedChars.skinTone}"
- Hair color: "${mergedChars.hairColor}"
- Hairstyle: "${mergedChars.hairStyle}"
- Eye color: "${mergedChars.eyeColor}"
- Clothing style: "${mergedChars.clothing}"

STORY CONTEXT:
- Title: ${personalizedStory.book_title}
- Summary: ${storySummary.summary.substring(0, 200)}...
- Main Themes: ${storySummary.main_themes.slice(0, 3).join(", ")}
- Key Settings: ${storySummary.key_settings.slice(0, 2).join(", ")}
- Magical Elements: ${storySummary.magical_elements.slice(0, 3).join(", ")}

CHARACTER: ${childName}, ${childAge} years old, ${gender}
COVER REQUIREMENTS:
- Capture the essence of the entire story journey
- Show ${childName} in a moment that represents the story's adventure
- Include visual references to main settings and magical elements`;
      }

      if (coverPrompt.length > 3900) {
        console.warn(
          `Cover prompt too long (${coverPrompt.length} chars), truncating...`,
        );
        coverPrompt = coverPrompt.substring(0, 3900) + "... [TRUNCATED]";
      }

      const imageUrl = await this.generateStrictDalleImage(coverPrompt);

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

  async generateStrictDalleImage(prompt) {
    const enhancedPrompt = prompt;

    if (enhancedPrompt.length > 4000) {
      console.warn(
        `Final DALL-E prompt too long (${enhancedPrompt.length} chars), using original prompt`,
      );
      return await this.openai.images
        .generate({
          model: "dall-e-3",
          prompt: prompt.substring(0, 4000),
          size: "1024x1024",
          quality: "hd",
          n: 1,
        })
        .then((image) => image.data[0].url);
    }

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

  getIdealPhotoGuidelines() {
    return this.imageValidator.getIdealImageSpecifications();
  }
}

export default StoryPersonalizer;
