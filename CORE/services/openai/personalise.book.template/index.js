import OpenAI from "openai";
import { config } from "@/config";
import ErrorHandler from "@/Error";
import BookTemplate from "../../../../API/BOOK_TEMPLATE/model/index.js";
import PersonalizedBook from "../../../../API/PERSONALISATION/model/index.js";
import S3Service from "../../s3/index.js";
import ImageValidator from "../validatePicture/index.js";
import ImagenGenerator from "../../imagen/index.js";

const STYLE_MAPPINGS = {
  sci_fi: {
    modern:
      "in a high-fidelity CGI style, reminiscent of the detailed animation in 'Love, Death & Robots' with realistic textures and atmospheric lighting",
    cinematic:
      "in a cinematic sci-fi CGI style with detailed models, complex lighting, and sophisticated rendering suitable for mature audiences",
  },
  humor: {
    simpsons:
      "in the iconic cartoon style of 'The Simpsons' with yellow skin tones, simple character construction, and prominent overbites",
    caricature:
      "in an exaggerated caricature style like 'Mr. Bean: The Animated Series' with bulbous noses, big eyes, and over-the-top expressions",
    modern_cartoon:
      "in a quirky, expressive cartoon style like 'Regular Show' or 'Adventure Time' with simple designs and anthropomorphic characters",
  },
  fantasy: {
    disney_renaissance:
      "in the classic Disney Renaissance 2D style of 'Mulan' with strong character acting, fluid motion, and detailed epic backgrounds",
    modern_disney:
      "with the vibrant, detailed CGI animation of Disney's 'Frozen II' or 'Encanto' with realistic textures and emotionally expressive characters",
    anime_fantasy:
      "in an anime-influenced style like 'Avatar: The Last Airbender' with dynamic action sequences, expressive eyes, and elemental effects",
  },
  adventure: {
    pixar:
      "in a modern Pixar CGI style like 'Inside Out' with high-fidelity rendering, realistic textures, and emotionally expressive rounded characters",
    dreamworks:
      "in a DreamWorks CGI style like 'The Boss Baby' with polished, streamlined, and cartoonishly stylized characters and vibrant environments",
    moana:
      "in the beautiful, dynamic CGI style of Disney's 'Moana' with expressive characters, vibrant colors, and oceanic themes",
    volumetric:
      "in a volumetric lighting 2D style like 'Klaus' that looks hand-drawn but incorporates three-dimensional lighting and painterly depth",
  },
  classic: {
    hanna_barbera:
      "in the classic Hanna-Barbera style of 'Tom and Jerry' with bold thick outlines, flat color palettes, and efficient character-driven animation",
    golden_age:
      "in the Disney Golden Age 2D style of 'Bambi' with soft painterly backgrounds, naturalistic rendering, and gentle lifelike animal movement",
    flintstones:
      "in the classic cartoon style of 'The Flintstones' with simple geometric shapes, limited animation, and prehistoric aesthetic",
  },
  preschool: {
    peppa_pig:
      "in a simple vector style like 'Peppa Pig' with extremely simple flat 2D designs, minimal detail, and thin limbs in side-profile view",
    simple_cartoon:
      "in a simple friendly 2D cartoon style with bold outlines and bright colors, perfect for very young audiences",
  },
  action: {
    fast_furious:
      "in an action-oriented CGI style with detailed vehicles, motion blur, and special effects to convey speed and dynamic action",
    cartoon_network:
      "in a modern Cartoon Network style with graphic angular designs, exaggerated proportions, and dynamic action sequences",
  },
};

class StoryPersonalizer {
  constructor() {
    const apiKey = config.openai.API_KEY;
    const googleApiKey = config.google.api_key;

    if (!apiKey) {
      throw new ErrorHandler(
        "OpenAI API key is required for text generation",
        500,
      );
    }
    if (!googleApiKey) {
      throw new ErrorHandler(
        "Google API key is required for image generation",
        500,
      );
    }

    this.openai = new OpenAI({ apiKey });
    this.s3Service = new S3Service();
    this.imageValidator = new ImageValidator();
    this.imagenGenerator = new ImagenGenerator();
  }

  _getVisualStyle(ageMin, theme) {
    const lowerTheme = theme.toLowerCase();

    if (
      lowerTheme.includes("sci_fi") ||
      lowerTheme.includes("robot") ||
      lowerTheme.includes("space")
    ) {
      return ageMin <= 10
        ? STYLE_MAPPINGS.sci_fi.modern
        : STYLE_MAPPINGS.sci_fi.cinematic;
    }

    if (
      lowerTheme.includes("humor") ||
      lowerTheme.includes("funny") ||
      lowerTheme.includes("comedy")
    ) {
      if (ageMin <= 6) return STYLE_MAPPINGS.preschool.simple_cartoon;
      if (ageMin <= 10) return STYLE_MAPPINGS.humor.modern_cartoon;
      return STYLE_MAPPINGS.humor.simpsons;
    }

    if (
      lowerTheme.includes("fantasy") ||
      lowerTheme.includes("magic") ||
      lowerTheme.includes("kingdom")
    ) {
      if (ageMin <= 6) return STYLE_MAPPINGS.classic.golden_age;
      if (ageMin <= 10) return STYLE_MAPPINGS.fantasy.anime_fantasy;
      return STYLE_MAPPINGS.fantasy.disney_renaissance;
    }

    if (
      lowerTheme.includes("adventure") ||
      lowerTheme.includes("explore") ||
      lowerTheme.includes("journey")
    ) {
      if (ageMin <= 6) return STYLE_MAPPINGS.adventure.dreamworks;
      if (ageMin <= 10) return STYLE_MAPPINGS.adventure.moana;
      return STYLE_MAPPINGS.adventure.volumetric;
    }

    if (
      lowerTheme.includes("action") ||
      lowerTheme.includes("battle") ||
      lowerTheme.includes("hero")
    ) {
      return ageMin <= 10
        ? STYLE_MAPPINGS.action.cartoon_network
        : STYLE_MAPPINGS.action.fast_furious;
    }

    if (
      lowerTheme.includes("classic") ||
      lowerTheme.includes("vintage") ||
      lowerTheme.includes("retro")
    ) {
      return STYLE_MAPPINGS.classic.hanna_barbera;
    }

    if (ageMin <= 6) {
      return STYLE_MAPPINGS.preschool.peppa_pig;
    }
    if (ageMin <= 10) {
      return STYLE_MAPPINGS.adventure.pixar;
    }
    return STYLE_MAPPINGS.fantasy.modern_disney;
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

      const [personalizedStory, storySummary] = await Promise.all([
        this.rewriteStoryWithAI(template, personalizationDetails),
        this.generateStorySummaryWithTemplate(template, childName),
      ]);

      const personalizedImages = await this.generateAllChapterImages(
        template,
        personalizedStory,
        personalizationDetails,
        usePhotoData,
        storySummary,
      );

      const personalizedCover = await this.generateOptimizedPersonalizedCover(
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

  async addPersonalizationToBook(
    bookId,
    userId,
    personsalisedId,
    personalizationData,
  ) {
    try {
      const book = await PersonalizedBook.findByIdForUser(
        bookId,
        personsalisedId,
        userId,
      );

      if (!book) {
        throw new ErrorHandler("Book not found", 404);
      }

      if (!book.is_paid) {
        throw new ErrorHandler("Payment required before personalization", 402);
      }

      if (book.is_personalized) {
        throw new ErrorHandler("Book is already personalized", 400);
      }

      const personalizedContent = await this.personalizeStory(
        book.original_template_id,
        personalizationData,
      );

      const updatedBook = await PersonalizedBook.addPersonalization(
        book._id,
        userId,
        book.original_template_id,
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
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler(
        `Failed to create book for payment: ${error.message}`,
        500,
      );
    }
  }

  async generateStorySummaryWithTemplate(template, childName) {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `Create a brief summary of this children's story for ${childName}. Return ONLY JSON: {
              "summary": "2-3 sentence summary",
              "main_themes": ["array of 3-7 key themes"],
              "key_settings": ["array of 2-6 main locations"],
              "magical_elements": ["array of 3-8 magical elements"]
            }`,
          },
          {
            role: "user",
            content: `STORY: ${template.book_title} - ${template.chapters.map((chap) => chap.chapter_title).join(", ")}`,
          },
        ],
        max_tokens: 500,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0].message.content.trim();
      return JSON.parse(content);
    } catch (error) {
      return {
        summary: `A magical adventure story featuring ${childName}`,
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
      return validationResult.analysis.gender;
    }
    return manualGender || "female";
  }

  shouldUsePhotoData(validationResult) {
    if (!validationResult?.analysis?.characteristics) {
      return false;
    }

    const characteristics = validationResult.analysis.characteristics;
    const requiredFields = [
      "skin_tone",
      "hair_type",
      "hairstyle",
      "hair_color",
      "eye_color",
      "clothing",
    ];
    const highConfidenceFields = requiredFields.filter(
      (field) =>
        characteristics[field]?.confidence === "high" &&
        characteristics[field]?.value &&
        characteristics[field]?.value !== "unknown",
    );

    return highConfidenceFields.length >= 3;
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
      return {
        skinTone: this.getBestCharacteristic(photoChars.skin_tone, skinTone),
        hairType: this.getBestCharacteristic(photoChars.hair_type, hairType),
        hairStyle: this.getBestCharacteristic(photoChars.hairstyle, hairStyle),
        hairColor: this.getBestCharacteristic(photoChars.hair_color, hairColor),
        eyeColor: this.getBestCharacteristic(photoChars.eye_color, eyeColor),
        clothing: this.getBestCharacteristic(photoChars.clothing, clothing),
        source: "photo",
      };
    }

    return {
      skinTone: skinTone || "light",
      hairType: hairType || "straight",
      hairStyle: hairStyle || "simple",
      hairColor: hairColor || "brown",
      eyeColor: eyeColor || "brown",
      clothing: clothing || "casual",
      source: "manual",
    };
  }

  getBestCharacteristic(photoChar, manualChar) {
    if (
      photoChar?.confidence === "high" &&
      photoChar?.value &&
      photoChar.value !== "unknown"
    ) {
      return photoChar.value;
    }
    return manualChar;
  }

  async rewriteStoryWithAI(template, personalizationDetails) {
    const { childName, childAge, gender } = personalizationDetails;

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `Personalize this children's story for ${childName} (${childAge} years old, ${gender}). Keep the same plot and structure. Return valid JSON with book_title and chapters array.`,
          },
          {
            role: "user",
            content: JSON.stringify({
              original_story: template.book_title,
              chapters: template.chapters.map((chap) => ({
                chapter_title: chap.chapter_title,
                chapter_content: chap.chapter_content,
              })),
            }),
          },
        ],
        max_tokens: 3000,
        temperature: 0.3,
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
        }
        personalizedStory = JSON.parse(jsonContent);
      } catch (parseError) {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          personalizedStory = JSON.parse(jsonMatch[0]);
        } else {
          return this.createFallbackStory(template, childName);
        }
      }

      if (!personalizedStory.book_title || !personalizedStory.chapters) {
        return this.createFallbackStory(template, childName);
      }

      return {
        ...template,
        book_title: personalizedStory.book_title,
        chapters: personalizedStory.chapters.map((chapter, index) => ({
          ...chapter,
          image_position:
            template.chapters[index]?.image_position || "full scene",
          image_description: template.chapters[index]?.image_description,
        })),
        author: childName,
      };
    } catch (error) {
      return this.createFallbackStory(template, childName);
    }
  }

  createFallbackStory(template, childName) {
    return {
      ...template,
      book_title: this.generatePersonalizedTitle(
        template.book_title,
        childName,
      ),
      author: childName,
    };
  }

  generatePersonalizedTitle(originalTitle, childName) {
    return originalTitle.replace(/\b\w+\b's/, `${childName}'s`);
  }

  async generateAllChapterImages(
    template,
    personalizedStory,
    personalizationDetails,
    usePhotoData,
    storySummary,
  ) {
    const { childName, photoUrl, childAge } = personalizationDetails;

    const imageBatch = template.chapters.map((originalChapter, index) =>
      this.generateSingleChapterImage(
        originalChapter,
        personalizedStory.chapters[index],
        personalizationDetails,
        usePhotoData,
        childName,
        index,
        storySummary,
        template,
      ),
    );

    const generatedImages = await Promise.allSettled(imageBatch);

    return generatedImages.map((result, index) =>
      result.status === "fulfilled"
        ? result.value
        : template.chapters[index]?.image_url,
    );
  }

  async generateSingleChapterImage(
    originalChapter,
    personalizedChapter,
    personalizationDetails,
    usePhotoData,
    childName,
    index,
    storySummary,
    template,
  ) {
    try {
      const mergedChars = this.getMergedCharacteristics(
        personalizationDetails,
        usePhotoData,
      );
      const { childAge, gender, photoUrl } = personalizationDetails;

      const visualStyle = this._getVisualStyle(childAge, template.genre);

      const prompt = this.buildImagePrompt(
        personalizedChapter.image_description ||
          originalChapter.image_description,
        originalChapter.image_position,
        childName,
        childAge,
        gender,
        mergedChars,
        visualStyle,
        storySummary,
      );

      let imageUrl;
      if (photoUrl && usePhotoData) {
        imageUrl = await this.generateStrictImagenImage(prompt, photoUrl);
      } else {
        imageUrl = await this.generateStrictImagenImage(prompt);
      }

      const s3Key = this.s3Service.generateImageKey(
        `personalized-books/${childName}/chapters`,
        `chapter-${index + 1}`,
      );
      return await this.s3Service.uploadImageFromUrl(imageUrl, s3Key);
    } catch (error) {
      return originalChapter.image_url;
    }
  }

  buildImagePrompt(
    imageDescription,
    imagePosition,
    childName,
    childAge,
    gender,
    mergedChars,
    visualStyle,
    storySummary,
  ) {
    const themes = storySummary.main_themes.slice(0, 3).join(", ");
    const settings = storySummary.key_settings.slice(0, 2).join(", ");
    const magicalElements = storySummary.magical_elements
      .slice(0, 3)
      .join(", ");

    return `STORY THEMES: ${themes}
KEY SETTINGS: ${settings}
MAGICAL ELEMENTS: ${magicalElements}
VISUAL STYLE: ${visualStyle}

CHARACTER: ${childName}, ${childAge} years old, ${gender}
APPEARANCE: ${mergedChars.skinTone} skin, ${mergedChars.hairColor} ${mergedChars.hairStyle} hair, ${mergedChars.eyeColor} eyes
SCENE: ${imageDescription}
IMAGE POSITION: ${imagePosition}
STYLE: children's book illustration, no text, incorporate story themes and magical elements`;
  }

  async generateOptimizedPersonalizedCover(
    personalizedStory,
    personalizationDetails,
    usePhotoData,
    storySummary,
  ) {
    try {
      const { childName, childAge, photoUrl } = personalizationDetails;
      const mergedChars = this.getMergedCharacteristics(
        personalizationDetails,
        usePhotoData,
      );

      const visualStyle = this._getVisualStyle(
        childAge,
        personalizedStory.genre,
      );

      const coverPrompt = this.buildCoverPrompt(
        personalizedStory.book_title,
        storySummary,
        childName,
        mergedChars,
        visualStyle,
      );

      const imageUrl = await this.generateStrictImagenImage(
        coverPrompt,
        photoUrl && usePhotoData ? photoUrl : null,
      );

      const s3Key = this.s3Service.generateImageKey(
        `personalized-books/${childName}/covers`,
        "personalized-cover",
      );
      return await this.s3Service.uploadImageFromUrl(imageUrl, s3Key);
    } catch (error) {
      return null;
    }
  }

  buildCoverPrompt(
    bookTitle,
    storySummary,
    childName,
    mergedChars,
    visualStyle,
  ) {
    const themes = storySummary.main_themes.slice(0, 3).join(", ");
    const settings = storySummary.key_settings.slice(0, 2).join(", ");
    const magicalElements = storySummary.magical_elements
      .slice(0, 3)
      .join(", ");

    return `BOOK COVER: "${bookTitle}"
STORY THEMES: ${themes}
KEY SETTINGS: ${settings}
MAGICAL ELEMENTS: ${magicalElements}
VISUAL STYLE: ${visualStyle}

CHARACTER: ${childName} with ${mergedChars.skinTone} skin, ${mergedChars.hairColor} hair
STORY SUMMARY: ${storySummary.summary.substring(0, 100)}
STYLE: children's book cover, no text, incorporate story themes and magical elements, vibrant colors, captivating magical atmosphere`;
  }

  async generateStrictImagenImage(prompt, photoUrl = null) {
    return await this.imagenGenerator.generateImage(prompt, {
      size: "1024x1024",
      aspectRatio: "1:1",
      baseImage: photoUrl,
      model: "imagen-4.0-generate-001",
    });
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
