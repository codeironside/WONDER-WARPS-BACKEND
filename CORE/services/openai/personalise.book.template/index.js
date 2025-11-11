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

  _getGenderSpecificDetails(gender, childAge) {
    const age = parseInt(childAge);

    if (gender === "male") {
      if (age <= 6) {
        return {
          clothing_suggestions: [
            "t-shirts with dinosaurs",
            "overalls",
            "superhero costumes",
            "comfortable shorts",
          ],
          accessories: ["baseball cap", "backpack", "toy truck"],
          typical_poses: [
            "running with excitement",
            "curiously exploring",
            "playing with toys",
          ],
          body_type: "young boy build, slightly rounded features",
          facial_expression: "curious, excited, playful",
        };
      } else if (age <= 12) {
        return {
          clothing_suggestions: [
            "hoodies",
            "jeans",
            "sports jerseys",
            "adventure gear",
          ],
          accessories: ["baseball cap", "watch", "sports equipment"],
          typical_poses: [
            "brave stance",
            "solving problems",
            "helping friends",
          ],
          body_type: "growing boy build, active and energetic",
          facial_expression: "determined, adventurous, friendly",
        };
      } else {
        return {
          clothing_suggestions: [
            "casual teen fashion",
            "jackets",
            "active wear",
          ],
          accessories: ["smartwatch", "headphones", "backpack"],
          typical_poses: [
            "confident posture",
            "leading adventures",
            "protecting others",
          ],
          body_type: "teenage boy build, more defined features",
          facial_expression: "confident, thoughtful, determined",
        };
      }
    } else if (gender === "female") {
      if (age <= 6) {
        return {
          clothing_suggestions: [
            "dresses with flowers",
            "colorful leggings",
            "sparkly tops",
            "tutu skirts",
          ],
          accessories: ["hair bows", "colorful shoes", "small purse"],
          typical_poses: [
            "twirling with joy",
            "gentle interactions",
            "curious observation",
          ],
          body_type: "young girl build, soft rounded features",
          facial_expression: "joyful, curious, gentle",
        };
      } else if (age <= 12) {
        return {
          clothing_suggestions: [
            "colorful dresses",
            "comfortable skirts",
            "fashionable tops",
            "adventure outfits",
          ],
          accessories: ["hair ribbons", "necklace", "bracelet"],
          typical_poses: [
            "graceful movements",
            "thoughtful expressions",
            "caring gestures",
          ],
          body_type: "growing girl build, graceful and active",
          facial_expression: "thoughtful, caring, adventurous",
        };
      } else {
        return {
          clothing_suggestions: [
            "teen fashion",
            "stylish outfits",
            "comfortable yet trendy clothes",
          ],
          accessories: ["hair accessories", "jewelry", "fashionable bag"],
          typical_poses: [
            "confident posture",
            "expressive gestures",
            "leadership stance",
          ],
          body_type: "teenage girl build, more defined features",
          facial_expression: "confident, expressive, intelligent",
        };
      }
    } else {
      return {
        clothing_suggestions: [
          "comfortable clothes",
          "colorful outfits",
          "age-appropriate fashion",
        ],
        accessories: ["fun accessories", "comfortable shoes"],
        typical_poses: [
          "happy expressions",
          "curious exploration",
          "friendly interactions",
        ],
        body_type: "child build appropriate for age",
        facial_expression: "happy, curious, friendly",
      };
    }
  }

  async extractComprehensiveFeatures(photoUrl) {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this child's photo and extract comprehensive physical characteristics for accurate character representation. Return ONLY a JSON object with this structure:
{
  "gender": "male" or "female" or "unknown",
  "age_estimate": "estimated age in years",
  "skin_tone": "detailed description of skin tone and complexion",
  "face_shape": "oval, round, heart, square, etc.",
  "facial_features": {
    "eye_shape": "almond, round, monolid, etc.",
    "eye_color": "brown, blue, green, hazel, etc.",
    "nose_shape": "button, straight, upturned, etc.",
    "lip_shape": "full, thin, bow-shaped, etc.",
    "eyebrow_shape": "straight, arched, rounded, etc.",
    "cheekbones": "high, prominent, soft, etc."
  },
  "hair_characteristics": {
    "color": "detailed hair color description",
    "type": "straight, wavy, curly, coily",
    "style": "hairstyle description",
    "length": "short, medium, long",
    "texture": "fine, thick, coarse",
    "parting": "center, side, none"
  },
  "distinctive_features": ["list of unique or prominent features"],
  "complexion_details": "skin texture, freckles, birthmarks, etc.",
  "expression_characteristics": "typical facial expression features",
  "body_type": "slim, average, sturdy, etc.",
  "confidence_level": "high/medium/low for overall accuracy"
}`,
              },
              {
                type: "image_url",
                image_url: { url: photoUrl },
              },
            ],
          },
        ],
        max_tokens: 1500,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0].message.content.trim();
      return JSON.parse(content);
    } catch (error) {
      console.error("Error extracting comprehensive features:", error);
      return null;
    }
  }

  async extractFacialExpressionAndPose(photoUrl) {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this child's facial expression and body language. Return ONLY a JSON object:
{
  "primary_expression": "happy, curious, playful, thoughtful, etc.",
  "expression_intensity": "subtle, moderate, pronounced",
  "eye_expression": "sparkling, wide-eyed, squinting, etc.",
  "smile_characteristics": "broad smile, slight smile, no smile, etc.",
  "posture": "confident, relaxed, energetic, shy, etc.",
  "gesture_style": "expressive, reserved, animated, calm",
  "energy_level": "high, medium, low",
  "notable_habits": "head tilt, specific hand gestures, etc."
}`,
              },
              {
                type: "image_url",
                image_url: { url: photoUrl },
              },
            ],
          },
        ],
        max_tokens: 800,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0].message.content.trim();
      return JSON.parse(content);
    } catch (error) {
      console.error("Error extracting facial expression:", error);
      return null;
    }
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

      let comprehensiveFeatures = null;
      let expressionAnalysis = null;

      if (photoUrl) {
        [comprehensiveFeatures, expressionAnalysis] = await Promise.all([
          this.extractComprehensiveFeatures(photoUrl),
          this.extractFacialExpressionAndPose(photoUrl),
        ]);
      }

      const finalGender = await this.extractGenderFromPhoto(
        gender,
        validationResult,
        photoUrl,
        comprehensiveFeatures,
      );
      personalizationDetails.gender = finalGender;

      const usePhotoData = this.shouldUsePhotoData(
        validationResult,
        comprehensiveFeatures,
      );

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
        comprehensiveFeatures,
        expressionAnalysis,
      );

      const personalizedCover = await this.generateOptimizedPersonalizedCover(
        personalizedStory,
        personalizationDetails,
        usePhotoData,
        storySummary,
        comprehensiveFeatures,
        expressionAnalysis,
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
          comprehensive_features: comprehensiveFeatures,
          expression_analysis: expressionAnalysis,
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

  async extractGenderFromPhoto(
    manualGender,
    validationResult,
    photoUrl,
    comprehensiveFeatures = null,
  ) {
    if (
      manualGender &&
      (manualGender === "male" || manualGender === "female")
    ) {
      return manualGender;
    }

    if (
      comprehensiveFeatures?.gender &&
      comprehensiveFeatures.gender !== "unknown"
    ) {
      return comprehensiveFeatures.gender;
    }

    if (
      validationResult?.analysis?.gender &&
      validationResult.analysis.gender !== "unknown"
    ) {
      return validationResult.analysis.gender;
    }

    if (photoUrl) {
      try {
        const extractedGender = await this.extractGenderWithVision(photoUrl);
        if (extractedGender && extractedGender !== "unknown") {
          return extractedGender;
        }
      } catch (error) {
        console.warn("Failed to extract gender from photo with vision:", error);
      }
    }

    return manualGender || "female";
  }

  async extractGenderWithVision(photoUrl) {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this image of a child and determine their gender. Look for visual cues like hair length, clothing, facial features, and overall appearance that are typical for boys or girls. Return ONLY one word: "male", "female", or "unknown" if you cannot determine with confidence.`,
              },
              {
                type: "image_url",
                image_url: { url: photoUrl },
              },
            ],
          },
        ],
        max_tokens: 10,
      });

      const gender = response.choices[0].message.content.trim().toLowerCase();
      if (gender === "male" || gender === "female") {
        return gender;
      }
      return "unknown";
    } catch (error) {
      console.error("Error extracting gender with vision:", error);
      return "unknown";
    }
  }

  shouldUsePhotoData(validationResult, comprehensiveFeatures = null) {
    if (
      comprehensiveFeatures &&
      comprehensiveFeatures.confidence_level === "high"
    ) {
      return true;
    }

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

  getMergedCharacteristics(
    personalizationDetails,
    usePhotoData,
    comprehensiveFeatures = null,
    expressionAnalysis = null,
  ) {
    const {
      skinTone,
      hairType,
      hairStyle,
      hairColor,
      eyeColor,
      clothing,
      validationResult,
      gender,
    } = personalizationDetails;

    let mergedCharacteristics = {
      skinTone: skinTone || "light",
      hairType: hairType || "straight",
      hairStyle: hairStyle || "simple",
      hairColor: hairColor || "brown",
      eyeColor: eyeColor || "brown",
      clothing: clothing || "casual",
      gender: gender,
      source: "manual",
    };

    if (usePhotoData) {
      if (comprehensiveFeatures) {
        mergedCharacteristics = this.mergeWithComprehensiveFeatures(
          mergedCharacteristics,
          comprehensiveFeatures,
        );
      }

      if (validationResult?.analysis?.characteristics) {
        mergedCharacteristics = this.mergeWithValidationResult(
          mergedCharacteristics,
          validationResult.analysis.characteristics,
        );
      }
    }

    if (expressionAnalysis) {
      mergedCharacteristics.expressionAnalysis = expressionAnalysis;
    }

    return this.enhanceWithGenderSpecifics(
      mergedCharacteristics,
      gender,
      personalizationDetails.childAge,
    );
  }

  mergeWithComprehensiveFeatures(characteristics, comprehensiveFeatures) {
    return {
      ...characteristics,
      skinTone: comprehensiveFeatures.skin_tone || characteristics.skinTone,
      hairType:
        comprehensiveFeatures.hair_characteristics?.type ||
        characteristics.hairType,
      hairStyle:
        comprehensiveFeatures.hair_characteristics?.style ||
        characteristics.hairStyle,
      hairColor:
        comprehensiveFeatures.hair_characteristics?.color ||
        characteristics.hairColor,
      eyeColor:
        comprehensiveFeatures.facial_features?.eye_color ||
        characteristics.eyeColor,
      faceShape: comprehensiveFeatures.face_shape,
      eyeShape: comprehensiveFeatures.facial_features?.eye_shape,
      noseShape: comprehensiveFeatures.facial_features?.nose_shape,
      lipShape: comprehensiveFeatures.facial_features?.lip_shape,
      eyebrowShape: comprehensiveFeatures.facial_features?.eyebrow_shape,
      cheekbones: comprehensiveFeatures.facial_features?.cheekbones,
      hairLength: comprehensiveFeatures.hair_characteristics?.length,
      hairTexture: comprehensiveFeatures.hair_characteristics?.texture,
      hairParting: comprehensiveFeatures.hair_characteristics?.parting,
      distinctiveFeatures: comprehensiveFeatures.distinctive_features || [],
      complexionDetails: comprehensiveFeatures.complexion_details,
      bodyType: comprehensiveFeatures.body_type,
      source: "comprehensive_photo_analysis",
      confidence: comprehensiveFeatures.confidence_level,
    };
  }

  mergeWithValidationResult(characteristics, validationChars) {
    const merged = { ...characteristics };

    if (validationChars.skin_tone?.confidence === "high") {
      merged.skinTone = validationChars.skin_tone.value;
    }
    if (validationChars.hair_type?.confidence === "high") {
      merged.hairType = validationChars.hair_type.value;
    }
    if (validationChars.hairstyle?.confidence === "high") {
      merged.hairStyle = validationChars.hairstyle.value;
    }
    if (validationChars.hair_color?.confidence === "high") {
      merged.hairColor = validationChars.hair_color.value;
    }
    if (validationChars.eye_color?.confidence === "high") {
      merged.eyeColor = validationChars.eye_color.value;
    }
    if (validationChars.clothing?.confidence === "high") {
      merged.clothing = validationChars.clothing.value;
    }

    return merged;
  }

  enhanceWithGenderSpecifics(characteristics, gender, childAge) {
    const genderDetails = this._getGenderSpecificDetails(gender, childAge);

    return {
      ...characteristics,
      genderSpecificClothing: genderDetails.clothing_suggestions,
      typicalAccessories: genderDetails.accessories,
      typicalPoses: genderDetails.typical_poses,
      bodyType: characteristics.bodyType || genderDetails.body_type,
      facialExpression:
        characteristics.expressionAnalysis?.primary_expression ||
        genderDetails.facial_expression,
      enhanced: true,
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
    comprehensiveFeatures = null,
    expressionAnalysis = null,
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
        comprehensiveFeatures,
        expressionAnalysis,
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
    comprehensiveFeatures = null,
    expressionAnalysis = null,
  ) {
    try {
      const mergedChars = this.getMergedCharacteristics(
        personalizationDetails,
        usePhotoData,
        comprehensiveFeatures,
        expressionAnalysis,
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

    const genderDetails = this._getGenderSpecificDetails(gender, childAge);
    const clothingSuggestion = genderDetails.clothing_suggestions[0];
    const poseSuggestion =
      mergedChars.expressionAnalysis?.posture || genderDetails.typical_poses[0];

    let prompt = `CRITICAL CHARACTER REQUIREMENT: The main character must be an EXACT representation of ${childName}, a ${childAge}-year-old ${gender} child.

PHYSICAL CHARACTERISTICS - MUST MATCH EXACTLY:
- Skin tone: ${mergedChars.skinTone}
- Face shape: ${mergedChars.faceShape || "youthful"}
- Eye shape: ${mergedChars.eyeShape || "expressive"} with ${mergedChars.eyeColor} color
- Nose shape: ${mergedChars.noseShape || "childlike"}
- Lip shape: ${mergedChars.lipShape || "youthful"}
- Hair: ${mergedChars.hairColor} ${mergedChars.hairStyle} ${mergedChars.hairType} hair, ${mergedChars.hairLength || "age-appropriate"} length
- Body type: ${mergedChars.bodyType || genderDetails.body_type}

EXPRESSION AND PERSONALITY:
- Primary expression: ${mergedChars.facialExpression}
- Posture: ${poseSuggestion}
- Energy level: ${mergedChars.expressionAnalysis?.energy_level || "balanced"}`;

    if (
      mergedChars.distinctiveFeatures &&
      mergedChars.distinctiveFeatures.length > 0
    ) {
      prompt += `\n- Distinctive features: ${mergedChars.distinctiveFeatures.slice(0, 3).join(", ")}`;
    }

    prompt += `

STORY CONTEXT:
- Themes: ${themes}
- Settings: ${settings}
- Magical elements: ${magicalElements}
- Visual style: ${visualStyle}

SCENE: ${imageDescription}
IMAGE POSITION: ${imagePosition}

CLOTHING: ${mergedChars.clothing}, ${clothingSuggestion}

IMPORTANT: Character must maintain consistent appearance across all images. No text in image.`;

    return prompt;
  }

  async generateOptimizedPersonalizedCover(
    personalizedStory,
    personalizationDetails,
    usePhotoData,
    storySummary,
    comprehensiveFeatures = null,
    expressionAnalysis = null,
  ) {
    try {
      const { childName, childAge, gender, photoUrl } = personalizationDetails;
      const mergedChars = this.getMergedCharacteristics(
        personalizationDetails,
        usePhotoData,
        comprehensiveFeatures,
        expressionAnalysis,
      );

      const visualStyle = this._getVisualStyle(
        childAge,
        personalizedStory.genre,
      );

      const genderDetails = this._getGenderSpecificDetails(gender, childAge);

      const coverPrompt = this.buildCoverPrompt(
        personalizedStory.book_title,
        storySummary,
        childName,
        mergedChars,
        visualStyle,
        genderDetails,
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
    genderDetails,
  ) {
    const themes = storySummary.main_themes.slice(0, 3).join(", ");
    const settings = storySummary.key_settings.slice(0, 2).join(", ");
    const magicalElements = storySummary.magical_elements
      .slice(0, 3)
      .join(", ");

    const clothingSuggestion = genderDetails.clothing_suggestions[0];
    const poseSuggestion =
      mergedChars.expressionAnalysis?.posture || genderDetails.typical_poses[0];

    return `BOOK COVER: "${bookTitle}"

MAIN CHARACTER - MUST MATCH PHOTO EXACTLY:
- Name: ${childName}
- Gender: ${mergedChars.gender}
- Age: ${mergedChars.childAge} years old
- Appearance: ${mergedChars.skinTone} skin, ${mergedChars.faceShape || "youthful"} face, ${mergedChars.eyeColor} ${mergedChars.eyeShape || "expressive"} eyes
- Hair: ${mergedChars.hairColor} ${mergedChars.hairStyle} ${mergedChars.hairType} hair
- Expression: ${mergedChars.facialExpression}
- Posture: ${poseSuggestion}
- Clothing: ${clothingSuggestion}

STORY ELEMENTS:
- Themes: ${themes}
- Settings: ${settings}
- Magical elements: ${magicalElements}
- Visual style: ${visualStyle}

STORY SUMMARY: ${storySummary.summary.substring(0, 100)}

STYLE: children's book cover, no text, vibrant colors, captivating magical atmosphere. Character must be instantly recognizable as ${childName} with consistent facial features and appearance.`;
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
