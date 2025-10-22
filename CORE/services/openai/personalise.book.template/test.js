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

      const content = response.choices[0].message.content.trim();
      const result = JSON.parse(content);

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
            content: `You are a expert children's story editor. Your task is to personalize an existing story by replacing the main character with a new child while preserving the EXACT same plot, story structure, and chapter flow.

**CRITICAL RULES:**
1. PRESERVE THE ORIGINAL PLOT: Do not change the storyline, events, or narrative flow
2. MAINTAIN CHAPTER STRUCTURE: Keep the same number of chapters and same chapter titles
3. KEEP IMAGE POSITIONS: Maintain the exact same image_position values from the original
4. ONLY CHANGE CHARACTER DETAILS: Replace the main character's name, age, and gender references
5. CONSISTENT CHARACTER: Ensure ${childName} appears as the main character in every chapter
6. RETURN FORMAT: You MUST return a valid JSON object with the exact structure below

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

      const prompt = `Create a SINGLE children's book illustration in Studio Ghibli style.

SCENE: ${imageDescription}
IMAGE POSITION: ${imagePosition}
MAIN CHARACTER: ${childName}, ${childAge} years old, ${gender}
${characteristicsText}
CHARACTER MUST MATCH REFERENCE PHOTO EXACTLY

ABSOLUTELY CRITICAL REQUIREMENTS - DO NOT IGNORE:
- ZERO TEXT: No text, words, letters, numbers, symbols, or writing of ANY kind
- NO SPEECH BUBBLES: No dialogue containers or thought bubbles
- NO LABELS: No captions, titles, or text elements
- NO BOOK COVERS: No book-like elements that might contain text
- PURE VISUAL ILLUSTRATION: Only visual elements, completely text-free
- SINGLE IMAGE ONLY: One unified illustration, no multiple panels or split scenes
- NO BORDERS: No decorative borders that might frame text
- NO BACKGROUND TEXT: No text in the background, on objects, or anywhere
- EXACT CHARACTER MATCH: The character must look IDENTICAL to the reference photo
- CONSISTENT FEATURES: Maintain exact skin tone, hair, eyes, and facial features from photo
- EYE COLOR CONSISTENCY: Eye color must be exactly "${mergedChars.eyeColor}" in every image

Style: Whimsical Studio Ghibli animation with soft lighting, vibrant colors, no text elements.
Composition: Single ${imagePosition} scene, no multiple images.
Create a text-free illustration where ${childName} looks exactly like the reference photo with consistent ${mergedChars.eyeColor} eyes.`;

      return await this.generateStrictDalleImage(prompt);
    } catch (error) {
      console.error("Error generating image from photo with GPT:", error);
      throw error;
    }
  }

  buildComprehensiveCharacteristics(characteristics, mergedChars) {
    let characteristicsText =
      "CHARACTER DETAILS FROM REFERENCE PHOTO (MUST MATCH EXACTLY):\n";

    if (mergedChars.skinTone)
      characteristicsText += `- Skin tone: ${mergedChars.skinTone} (exact match)\n`;
    if (mergedChars.hairColor)
      characteristicsText += `- Hair color: ${mergedChars.hairColor} (exact match)\n`;
    if (mergedChars.hairStyle)
      characteristicsText += `- Hairstyle: ${mergedChars.hairStyle} (exact match)\n`;
    if (mergedChars.eyeColor)
      characteristicsText += `- Eye color: ${mergedChars.eyeColor} (MUST BE EXACT IN EVERY IMAGE)\n`;
    if (mergedChars.clothing)
      characteristicsText += `- Clothing style: ${mergedChars.clothing}\n`;

    if (mergedChars.faceShape)
      characteristicsText += `- Face shape: ${mergedChars.faceShape}\n`;
    if (mergedChars.eyeShape)
      characteristicsText += `- Eye shape: ${mergedChars.eyeShape}\n`;
    if (mergedChars.noseShape)
      characteristicsText += `- Nose shape: ${mergedChars.noseShape}\n`;
    if (mergedChars.lipShape)
      characteristicsText += `- Lip shape: ${mergedChars.lipShape}\n`;
    if (mergedChars.hairTexture)
      characteristicsText += `- Hair texture: ${mergedChars.hairTexture}\n`;
    if (mergedChars.complexion)
      characteristicsText += `- Complexion: ${mergedChars.complexion}\n`;

    if (mergedChars.facialFeatures && mergedChars.facialFeatures.length > 0) {
      characteristicsText += `- Distinctive features: ${mergedChars.facialFeatures.join(", ")}\n`;
    }

    characteristicsText +=
      "CHARACTER MUST MATCH THESE EXACT FEATURES FROM THE PHOTO IN EVERY IMAGE";

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

    const prompt = `Create a SINGLE children's book illustration in Studio Ghibli style.

SCENE: ${imageDescription}
IMAGE POSITION: ${imagePosition}
MAIN CHARACTER: ${childName}, ${childAge} years old, ${gender}
CHARACTER DETAILS (${mergedChars.source}):
${mergedChars.skinTone ? `- Skin tone: ${mergedChars.skinTone}` : ""}
${mergedChars.hairColor ? `- Hair color: ${mergedChars.hairColor}` : ""}
${mergedChars.hairStyle ? `- Hairstyle: ${mergedChars.hairStyle}` : ""}
${mergedChars.eyeColor ? `- Eye color: ${mergedChars.eyeColor} (MUST BE CONSISTENT IN ALL IMAGES)` : ""}
${mergedChars.clothing ? `- Clothing: ${mergedChars.clothing}` : ""}

ABSOLUTELY CRITICAL REQUIREMENTS - DO NOT IGNORE:
- ZERO TEXT: No text, words, letters, numbers, symbols, or writing of ANY kind
- NO SPEECH BUBBLES: No dialogue containers or thought bubbles
- NO LABELS: No captions, titles, or text elements
- NO BOOK COVERS: No book-like elements that might contain text
- PURE VISUAL ILLUSTRATION: Only visual elements, completely text-free
- SINGLE IMAGE ONLY: One unified illustration, no multiple panels or split scenes
- NO BORDERS: No decorative borders that might frame text
- NO BACKGROUND TEXT: No text in the background, on objects, or anywhere
- EYE COLOR CONSISTENCY: Eye color must be exactly "${mergedChars.eyeColor}" in every image
- NO PHOTO REFERENCES: Do not include any photographic elements or real-life references

Style: Whimsical Studio Ghibli animation with soft lighting, vibrant colors, no text elements.
Composition: Single ${imagePosition} scene, no multiple images.
Create a completely text-free children's book illustration with consistent ${mergedChars.eyeColor} eyes.`;

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

        coverPrompt = `Create a SINGLE front illustration for a children's book in Studio Ghibli style.

STORY CONTEXT:
- Title: ${personalizedStory.book_title}
- Summary: ${storySummary.summary}
- Main Themes: ${storySummary.main_themes.join(", ")}
- Key Settings: ${storySummary.key_settings.join(", ")}
- Magical Elements: ${storySummary.magical_elements.join(", ")}

MAIN CHARACTER: ${childName}
${characteristicsText}
CHARACTER MUST MATCH REFERENCE PHOTO EXACTLY

COVER REQUIREMENTS:
- Capture the essence of the entire story journey
- Incorporate key magical elements and themes
- Show ${childName} in a moment that represents the story's adventure
- Include visual references to main settings and magical elements

ABSOLUTELY CRITICAL REQUIREMENTS - DO NOT IGNORE:
- ZERO TEXT: No text, words, letters, numbers, symbols, or writing of ANY kind
- NO TITLES: No book titles, author names, or any text
- NO SPEECH BUBBLES: No dialogue containers
- NO LABELS: No captions or text elements
- PURE VISUAL ILLUSTRATION: Only visual elements, completely text-free
- SINGLE IMAGE ONLY: One unified illustration, no multiple panels
- NO BOOK COVER DESIGN: Avoid traditional cover layout that suggests text areas
- NO BORDERS: No frames or borders
- EXACT CHARACTER MATCH: The character must look IDENTICAL to the reference photo
- EYE COLOR CONSISTENCY: Eye color must be exactly "${mergedChars.eyeColor}"
- MAGICAL ATMOSPHERE: Create a sense of wonder and adventure without text
- STORY REPRESENTATION: The image should visually summarize the story's journey

Style: Magical Studio Ghibli artwork, vibrant colors, engaging composition, completely text-free.
Create a beautiful front illustration where ${childName} looks exactly like the reference photo, with no text elements whatsoever, that captures the magical journey of "${personalizedStory.book_title}".`;
      } else {
        const { childAge, gender } = personalizationDetails;
        coverPrompt = `Create a SINGLE front illustration for a children's book in Studio Ghibli style.

STORY CONTEXT:
- Title: ${personalizedStory.book_title}
- Summary: ${storySummary.summary}
- Main Themes: ${storySummary.main_themes.join(", ")}
- Key Settings: ${storySummary.key_settings.join(", ")}
- Magical Elements: ${storySummary.magical_elements.join(", ")}

MAIN CHARACTER: ${childName}, ${childAge} years old, ${gender}
CHARACTER DETAILS (${mergedChars.source}):
${mergedChars.skinTone ? `- Skin tone: ${mergedChars.skinTone}` : ""}
${mergedChars.hairColor ? `- Hair color: ${mergedChars.hairColor}` : ""}
${mergedChars.eyeColor ? `- Eye color: ${mergedChars.eyeColor} (MUST BE CONSISTENT IN ALL IMAGES)` : ""}
${mergedChars.clothing ? `- Clothing: ${mergedChars.clothing}` : ""}
${mergedChars.hairStyle ? `- Hairstyle: ${mergedChars.hairStyle}` : ""}

COVER REQUIREMENTS:
- Capture the essence of the entire story journey
- Incorporate key magical elements and themes
- Show ${childName} in a moment that represents the story's adventure
- Include visual references to main settings and magical elements

ABSOLUTELY CRITICAL REQUIREMENTS - DO NOT IGNORE:
- ZERO TEXT: No text, words, letters, numbers, symbols, or writing of ANY kind
- NO TITLES: No book titles, author names, or any text
- NO SPEECH BUBBLES: No dialogue containers
- NO LABELS: No captions or text elements
- PURE VISUAL ILLUSTRATION: Only visual elements, completely text-free
- SINGLE IMAGE ONLY: One unified illustration, no multiple panels
- NO BOOK COVER DESIGN: Avoid traditional cover layout that suggests text areas
- NO BORDERS: No frames or borders
- EYE COLOR CONSISTENCY: Eye color must be exactly "${mergedChars.eyeColor}"
- MAGICAL ATMOSPHERE: Create a sense of wonder and adventure without text
- STORY REPRESENTATION: The image should visually summarize the story's journey
- NO PHOTO REFERENCES: Do not include any photographic elements or real-life references

Style: Magical Studio Ghibli artwork, vibrant colors, engaging composition, completely text-free.
Create a beautiful front illustration with no text elements whatsoever that captures the magical journey of "${personalizedStory.book_title}".`;
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
    const enhancedPrompt =
      prompt +
      `

EXTREMELY IMPORTANT - READ CAREFULLY:
- ABSOLUTELY NO TEXT: The image must be completely free of any text, words, letters, numbers, or symbols
- NO TEXT ANYWHERE: No text in foreground, background, on objects, or anywhere in the image
- SINGLE IMAGE: Create exactly one unified illustration - no multiple images, panels, or split scenes
- NO SUGGESTIONS OF TEXT: Avoid any elements that might look like they could contain text
- PURE ILLUSTRATION: This is a visual-only artwork with zero textual elements of any kind
- NO EXCEPTIONS: There should be no text in the final image under any circumstances
- CONSISTENT EYE COLOR: Maintain the exact specified eye color throughout all images
- NO PHOTOGRAPHIC ELEMENTS: This should be a pure illustration, not a photo or photorealistic image`;

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
      };

      const personalizedBook =
        await PersonalizedBook.createPersonaliseBook(personalizedBookData);

      try {
        await BookTemplate.incrementPopularity(templateId);
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
