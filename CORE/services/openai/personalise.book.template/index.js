import OpenAI from "openai";
import { config } from "@/config";
import ErrorHandler from "@/Error";
import BookTemplate from "../../../../API/BOOK_TEMPLATE/model/index.js";
import PersonalizedBook from "../../../../API/PERSONALISATION/model/index.js";
import S3Service from "../../s3/index.js";
import ImageValidator from "../validatePicture/index.js";
import User from "../../../../API/AUTH/model/index.js";
import emailService from "../../Email/index.js";
import ImageAnalyzer from "../imageanalyzer/index.js";

const STYLE_MAPPINGS = {
  sci_fi: {
    toddler:
      "in a soft, gentle CGI style with rounded edges, bright colors, and simple shapes suitable for very young children",
    preschool:
      "in a friendly CGI style like 'Wall-E' with expressive characters, soft lighting, and approachable robot designs",
    early_elementary:
      "in a modern CGI sci-fi style like 'Big Hero 6' with clean designs, vibrant colors, and heroic characters",
    late_elementary:
      "in a detailed CGI style reminiscent of 'Star Wars: The Clone Wars' with dynamic action and imaginative worlds",
    middle_school:
      "in a sophisticated CGI style like 'Love, Death & Robots' with realistic textures and atmospheric lighting",
    high_school:
      "in a cinematic sci-fi CGI style with detailed models, complex lighting, and sophisticated rendering for mature audiences",
    young_adult:
      "in a photorealistic sci-fi style with advanced visual effects, detailed environments, and complex character designs",
  },
  humor: {
    toddler:
      "in a simple, soft cartoon style with round shapes, bright colors, and gentle expressions",
    preschool:
      "in a playful cartoon style like 'Peppa Pig' with simple designs, soft colors, and friendly characters",
    early_elementary:
      "in a quirky cartoon style like 'Paw Patrol' with expressive characters and vibrant, energetic scenes",
    late_elementary:
      "in a dynamic cartoon style like 'The Amazing World of Gumball' with mixed media and exaggerated expressions",
    middle_school:
      "in a modern cartoon style like 'Regular Show' or 'Adventure Time' with unique character designs and surreal humor",
    high_school:
      "in the iconic style of 'The Simpsons' with distinctive character designs and satirical visual storytelling",
    young_adult:
      "in an adult animated style like 'Rick and Morty' with complex humor, detailed backgrounds, and sophisticated visual jokes",
  },
  fantasy: {
    toddler:
      "in a soft, dreamy watercolor style with gentle magical elements and friendly creature designs",
    preschool:
      "in a gentle fantasy style like 'My Little Pony' with soft colors, simple magic, and approachable characters",
    early_elementary:
      "in a vibrant fantasy style like 'Sofia the First' with royal themes, gentle magic, and colorful environments",
    late_elementary:
      "in an anime-influenced fantasy style like 'Avatar: The Last Airbender' with dynamic action and elemental magic",
    middle_school:
      "in a detailed fantasy style like 'How to Train Your Dragon' with realistic textures and epic scale",
    high_school:
      "in the classic Disney Renaissance style of 'Mulan' with strong character acting and detailed epic backgrounds",
    young_adult:
      "in a mature fantasy style like 'The Witcher' or 'Game of Thrones' with realistic textures, complex lighting, and detailed world-building",
  },
  adventure: {
    toddler:
      "in a soft, gentle adventure style with simple landscapes and friendly animal companions",
    preschool:
      "in a DreamWorks CGI style like 'The Boss Baby' with polished, streamlined characters and vibrant environments",
    early_elementary:
      "in a Pixar CGI style like 'Inside Out' with emotionally expressive characters and vibrant, imaginative worlds",
    late_elementary:
      "in the beautiful CGI style of Disney's 'Moana' with expressive characters, vibrant colors, and oceanic themes",
    middle_school:
      "in a volumetric lighting 2D style like 'Klaus' that looks hand-drawn but incorporates three-dimensional depth",
    high_school:
      "in an epic adventure style like 'The Legend of Zelda: Breath of the Wild' with vast landscapes and detailed character designs",
    young_adult:
      "in a cinematic adventure style like 'The Lord of the Rings' with epic scale, realistic textures, and dramatic lighting",
  },
  classic: {
    toddler:
      "in a soft, simplified classic style with gentle colors and simple character designs",
    preschool:
      "in a Hanna-Barbera style like 'Tom and Jerry' with bold outlines and efficient character-driven animation",
    early_elementary:
      "in a classic Disney style like 'Mickey Mouse' with timeless character designs and vibrant colors",
    late_elementary:
      "in the Disney Golden Age style of 'Bambi' with soft painterly backgrounds and naturalistic rendering",
    middle_school:
      "in a retro classic style like 'The Flintstones' with nostalgic character designs and prehistoric aesthetic",
    high_school:
      "in a vintage animation style reminiscent of 1940s cartoons with sophisticated character designs and detailed backgrounds",
    young_adult:
      "in a sophisticated classic style inspired by Norman Rockwell with detailed character studies and nostalgic American themes",
  },
  preschool: {
    toddler:
      "in an extremely simple vector style like 'Peppa Pig' with flat 2D designs, minimal detail, and gentle colors",
    preschool:
      "in a simple friendly 2D cartoon style with bold outlines, bright colors, and clear, easy-to-understand visuals",
    early_elementary:
      "in a slightly more detailed preschool style with simple stories and clear, colorful character designs",
    late_elementary:
      "in a transitional style that bridges preschool and elementary with more detailed characters while maintaining clarity",
    middle_school:
      "n/a (preschool themes not typically used for this age group)",
    high_school: "n/a (preschool themes not typically used for this age group)",
    young_adult: "n/a (preschool themes not typically used for this age group)",
  },
  action: {
    toddler:
      "in a gentle action style with soft movements, simple conflicts, and friendly resolutions",
    preschool:
      "in a simple action style with clear heroes/villains, bright colors, and non-threatening conflict",
    early_elementary:
      "in a Cartoon Network action style with graphic angular designs and dynamic but age-appropriate action sequences",
    late_elementary:
      "in an action-adventure style like 'Ben 10' with dynamic poses, special effects, and heroic character designs",
    middle_school:
      "in a sophisticated action style with detailed vehicles, motion blur, and dynamic camera angles",
    high_school:
      "in a mature action style like 'Fast & Furious' with realistic effects, detailed environments, and complex action choreography",
    young_adult:
      "in an intense action style with cinematic visuals, complex stunt choreography, and realistic combat sequences",
  },
  mystery: {
    toddler:
      "in a gentle mystery style with soft colors, simple puzzles, and friendly detectives",
    preschool:
      "in a curious mystery style with bright clues, friendly characters, and simple problem-solving",
    early_elementary:
      "in an adventurous mystery style like 'Scooby-Doo' with fun villains and clear mystery-solving",
    late_elementary:
      "in a detailed mystery style with atmospheric settings, clever clues, and engaging detective work",
    middle_school:
      "in a sophisticated mystery style with complex puzzles, detailed environments, and atmospheric lighting",
    high_school:
      "in a noir-inspired mystery style with dramatic lighting, complex characters, and intricate plot visuals",
    young_adult:
      "in a psychological mystery style with tense atmosphere, complex character expressions, and sophisticated visual storytelling",
  },
  historical: {
    toddler:
      "in a simplified historical style with basic period elements and friendly character designs",
    preschool:
      "in an educational historical style with clear period details and approachable historical figures",
    early_elementary:
      "in an adventurous historical style with accurate period settings and engaging historical narratives",
    late_elementary:
      "in a detailed historical style with researched environments, period costumes, and educational accuracy",
    middle_school:
      "in a sophisticated historical style with accurate architectural details, period fashion, and historical authenticity",
    high_school:
      "in a cinematic historical style with detailed period reconstruction, authentic costumes, and dramatic historical recreation",
    young_adult:
      "in an epic historical style with meticulous period accuracy, complex historical settings, and sophisticated character designs",
  },
};

const AGE_GROUPS = {
  toddler: { min: 0, max: 3 },
  preschool: { min: 4, max: 5 },
  early_elementary: { min: 6, max: 8 },
  late_elementary: { min: 9, max: 11 },
  middle_school: { min: 12, max: 14 },
  high_school: { min: 15, max: 17 },
  young_adult: { min: 18, max: 99 },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

    this.openai = new OpenAI({ apiKey });
    this.s3Service = new S3Service();
    this.imageValidator = new ImageValidator();
    this.imageAnalyzer = new ImageAnalyzer();
    this.googleApiKey = googleApiKey;
  }

  _getAgeGroup(childAge) {
    const age = parseInt(childAge || "5");

    for (const [group, range] of Object.entries(AGE_GROUPS)) {
      if (age >= range.min && age <= range.max) {
        return group;
      }
    }
    return "early_elementary";
  }

  _getVisualStyle(childAge, theme) {
    const ageGroup = this._getAgeGroup(childAge);
    const lowerTheme = (theme || "").toLowerCase().replace(/[^a-z0-9]/g, "_");

    let themeCategory = "adventure";

    if (
      lowerTheme.includes("sci_fi") ||
      lowerTheme.includes("robot") ||
      lowerTheme.includes("space") ||
      lowerTheme.includes("future")
    ) {
      themeCategory = "sci_fi";
    } else if (
      lowerTheme.includes("humor") ||
      lowerTheme.includes("funny") ||
      lowerTheme.includes("comedy") ||
      lowerTheme.includes("joke")
    ) {
      themeCategory = "humor";
    } else if (
      lowerTheme.includes("fantasy") ||
      lowerTheme.includes("magic") ||
      lowerTheme.includes("kingdom") ||
      lowerTheme.includes("dragon") ||
      lowerTheme.includes("wizard")
    ) {
      themeCategory = "fantasy";
    } else if (
      lowerTheme.includes("classic") ||
      lowerTheme.includes("vintage") ||
      lowerTheme.includes("retro") ||
      lowerTheme.includes("traditional")
    ) {
      themeCategory = "classic";
    } else if (
      lowerTheme.includes("preschool") ||
      lowerTheme.includes("toddler") ||
      lowerTheme.includes("baby")
    ) {
      themeCategory = "preschool";
    } else if (
      lowerTheme.includes("action") ||
      lowerTheme.includes("battle") ||
      lowerTheme.includes("hero") ||
      lowerTheme.includes("superhero")
    ) {
      themeCategory = "action";
    } else if (
      lowerTheme.includes("mystery") ||
      lowerTheme.includes("detective") ||
      lowerTheme.includes("secret") ||
      lowerTheme.includes("puzzle")
    ) {
      themeCategory = "mystery";
    } else if (
      lowerTheme.includes("historical") ||
      lowerTheme.includes("history") ||
      lowerTheme.includes("period") ||
      lowerTheme.includes("ancient")
    ) {
      themeCategory = "historical";
    }

    const style = STYLE_MAPPINGS[themeCategory]?.[ageGroup];

    if (!style || style === "n/a") {
      if (ageGroup === "toddler" || ageGroup === "preschool") {
        return (
          STYLE_MAPPINGS.preschool[ageGroup] ||
          "in a simple, friendly cartoon style with bright colors and clear shapes"
        );
      } else if (
        ageGroup === "early_elementary" ||
        ageGroup === "late_elementary"
      ) {
        return (
          STYLE_MAPPINGS.adventure[ageGroup] ||
          "in a vibrant, engaging style suitable for young readers"
        );
      } else {
        return (
          STYLE_MAPPINGS.fantasy[ageGroup] ||
          "in a detailed, engaging visual style appropriate for the story's themes"
        );
      }
    }

    return style;
  }

  _generateDefaultDedication(childName, childAge) {
    const name = childName || "our little hero";
    const ageGroup = this._getAgeGroup(childAge);

    switch (ageGroup) {
      case "toddler":
        return `To our precious ${name}, may your world always be filled with wonder, laughter, and magical dreams. May this story be the first of many adventures that light up your imagination.`;
      case "preschool":
        return `For ${name}, our brave little explorer. May your curiosity lead you to amazing adventures, your heart be filled with kindness, and your days be bright with imagination. Always remember how special you are.`;
      case "early_elementary":
        return `To ${name}, our amazing adventurer. May this story inspire you to be brave, kind, and curious about the world. Remember that every great hero starts with a dream and a heart full of courage.`;
      case "late_elementary":
        return `For ${name}, who makes every day an adventure. May this story remind you that you have the power to create your own magic, overcome any challenge, and be the hero of your own journey. Dream big and shine bright.`;
      case "middle_school":
        return `To ${name}, as you discover the incredible person you're becoming. May this story inspire you to embrace your uniqueness, face challenges with courage, and always follow your heart to amazing adventures.`;
      case "high_school":
        return `For ${name}, standing at the threshold of amazing possibilities. May this story remind you that you have the strength, wisdom, and heart to create your own extraordinary future.`;
      case "young_adult":
        return `To ${name}, as you journey through these pages and through life. May this story inspire you to believe in yourself, chase your dreams with passion, and create a life filled with wonder and purpose.`;
      default:
        return `To ${name}, may this story bring you joy, inspiration, and magical moments to cherish always.`;
    }
  }

  async personalizeStory(templateId, personalizationDetails) {
    try {
      const { childName, childAge, gender, photoUrl } = personalizationDetails;

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

      let analysisData = null;

      if (photoUrl) {
        console.log("🖼️ Starting full image analysis with ImageAnalyzer...");
        analysisData = await this.imageAnalyzer.analyzeImage(photoUrl);
        console.log(
          "✅ Image analysis completed:",
          JSON.stringify(analysisData, null, 2),
        );
      }

      if (analysisData) {
        personalizationDetails.gender = analysisData.gender || gender;
        personalizationDetails.age_estimate = analysisData.age_estimate;

        personalizationDetails.skinTone = analysisData.skin_tone;
        personalizationDetails.hairType = analysisData.hair?.texture;
        personalizationDetails.hairStyle = analysisData.hair?.style;
        personalizationDetails.hairColor = analysisData.hair?.color;
        personalizationDetails.eyeColor = analysisData.eyes?.color;

        if (analysisData.clothing) {
          const c = analysisData.clothing;
          personalizationDetails.clothing =
            `${c.color} ${c.type} ${c.pattern ? `with ${c.pattern}` : ""}`.trim();
        }

        if (analysisData.accessories && analysisData.accessories.length > 0) {
          personalizationDetails.accessories =
            analysisData.accessories.join(", ");
        }

        if (analysisData.facial_features?.distinctive_marks) {
          personalizationDetails.distinctiveFeatures =
            analysisData.facial_features.distinctive_marks.join(", ");
        }
      }

      const [personalizedStory, storySummary] = await Promise.all([
        this.rewriteStoryWithAI(template, personalizationDetails),
        this.generateStorySummaryWithTemplate(template, childName),
      ]);

      const personalizedTitle = personalizedStory.book_title;

      const personalizedImages = await this.generateAllChapterImages(
        template,
        personalizedStory,
        personalizationDetails,
        storySummary,
        analysisData,
      );

      const personalizedCover = await this.generateOptimizedPersonalizedCover(
        personalizedTitle,
        personalizedStory,
        personalizationDetails,
        storySummary,
        analysisData,
      );

      const storybookContent = this.assemblePersonalizedBook(
        personalizedStory,
        personalizedImages,
        personalizedCover,
        personalizationDetails,
      );

      return {
        ...storybookContent,
        personalization_metadata: {
          personalized_for: childName,
          personalized_age: childAge || "",
          personalized_at: new Date().toISOString(),
          original_template_id: templateId,
          original_template_title: template.book_title,
          used_photo: !!photoUrl,
          analysis_data: analysisData,
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
    let user = null;
    let updatedBook = null;

    try {
      try {
        user = await User.findById(userId);
        if (!user) {
          console.warn(`User not found with ID: ${userId}`);
        }
      } catch (userError) {
        console.error("Failed to fetch user for notification:", userError);
      }
      const emaild = await PersonalizedBook.findById(personsalisedId);

      if (user && user.email) {
        try {
          await emailService.bookgenerationorpersonalisation(
            user.email,
            emaild.book_title,
            user.username || user.name || "there",
            "personalization",
            "processing",
          );
          console.log(
            `Personalization processing notification sent to ${user.email}`,
          );
        } catch (emailError) {
          console.error("Failed to send processing email:", emailError);
        }
      }

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

      const defaultDedication = this._generateDefaultDedication(
        book.child_name,
        book.child_age,
      );

      const enhancedPersonalizationData = {
        ...personalizationData,
        childName: book.child_name || "",
        childAge: book.child_age || "",
        gender: book.gender_preference || "",
        skinTone: personalizationData.skinTone || "",
        hairType: personalizationData.hairType || "",
        hairStyle: personalizationData.hairStyle || "",
        hairColor: personalizationData.hairColor || "",
        eyeColor: personalizationData.eyeColor || "",
        clothing: personalizationData.clothing || "",
        photoUrl: personalizationData.photoUrl || "",
        dedication_message:
          personalizationData.dedication_message || defaultDedication,
      };

      const personalizedContent = await this.personalizeStory(
        book.original_template_id,
        enhancedPersonalizationData,
      );

      updatedBook = await PersonalizedBook.addPersonalization(
        book._id,
        userId,
        book.original_template_id,
        {
          personalized_content: personalizedContent,
          dedication_message: enhancedPersonalizationData.dedication_message,
        },
      );

      if (user && user.email) {
        try {
          await emailService.bookgenerationorpersonalisation(
            user.email,
            book.book_title || "Your Personalized Book",
            user.username || user.name || "there",
            "personalization",
            "success",
            {
              bookUrl: `${config.app.base_url}/books/${updatedBook._id}`,
            },
          );
          console.log(
            `Personalization success notification sent to ${user.email}`,
          );
        } catch (emailError) {
          console.error("Failed to send success email:", emailError);
        }
      }

      return updatedBook;
    } catch (error) {
      console.error(`FATAL: Personalization failed for book: ${bookId}`);
      console.error(error);
      const emaild = await PersonalizedBook.findById(personsalisedId);

      if (user && user.email) {
        try {
          await emailService.bookgenerationorpersonalisation(
            user.email,
            emaild.book_title,
            user.username || user.name || "there",
            "personalization",
            "failed",
            {
              errorMessage:
                error.message ||
                "Unknown error occurred during personalization",
            },
          );
          console.log(
            `Personalization failure notification sent to ${user.email}`,
          );
        } catch (emailError) {
          console.error("Failed to send failure email:", emailError);
        }
      }

      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler(
        `Failed to add personalization to book: ${error.message}`,
        500,
      );
    }
  }

  async createBookForPayment(templateId, userId, basicDetails) {
    try {
      const { childName, childAge, gender, video_url } = basicDetails;

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
        child_name: childName || "",
        child_age: childAge || "",
        gender_preference: gender || "",
        price: template.price,
        book_title: template.book_title || "",
        genre: template.genre || "",
        cover_image: template.cover_image || [],
        video_url: template.video_url || video_url,
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
            content: `Create a brief summary of this children's story featuring ${childName}. Return ONLY JSON: {
              "summary": "2-3 sentence summary featuring ${childName}",
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

  async rewriteStoryWithAI(template, personalizationDetails) {
    const childName = personalizationDetails.childName || "";
    const childAge = personalizationDetails.childAge || "";
    const gender = personalizationDetails.gender || "";

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `Personalize this children's story for ${childName}${childAge ? ` (${childAge} years old)` : ""}${gender ? `, ${gender}` : ""}. Keep the same plot and structure but make ${childName} the main character. Return valid JSON with book_title and chapters array.`,
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
      const personalizedStory = JSON.parse(content);

      if (!personalizedStory.book_title || !personalizedStory.chapters) {
        return this.createFallbackStory(template, childName);
      }

      return {
        ...personalizedStory,
        chapters: personalizedStory.chapters.map((chapter, index) => ({
          ...chapter,
          image_position:
            template.chapters[index]?.image_position || "full scene",
          image_description: template.chapters[index]?.image_description || "",
        })),
        author: childName,
        genre: template.genre || "",
      };
    } catch (error) {
      return this.createFallbackStory(template, childName);
    }
  }

  createFallbackStory(template, childName) {
    const personalizedTitle = this.generatePersonalizedTitle(
      template.book_title,
      childName,
    );

    return {
      book_title: personalizedTitle,
      chapters: template.chapters.map((chapter) => ({
        ...chapter,
      })),
      author: childName,
      genre: template.genre || "",
    };
  }

  generatePersonalizedTitle(originalTitle, childName) {
    return originalTitle.replace(/\b\w+\b's/, `${childName}'s`);
  }

  async generateAllChapterImages(
    template,
    personalizedStory,
    personalizationDetails,
    storySummary,
    analysisData,
  ) {
    const { childName } = personalizationDetails;

    const imageBatch = template.chapters.map((originalChapter, index) =>
      this.generateSingleChapterImage(
        originalChapter,
        personalizedStory.chapters[index],
        personalizationDetails,
        childName,
        index,
        storySummary,
        template,
        analysisData,
      ),
    );

    const generatedImages = await Promise.allSettled(imageBatch);

    return generatedImages.map((result, index) =>
      result.status === "fulfilled"
        ? result.value
        : template.chapters[index]?.image_url || "",
    );
  }

  async generateSingleChapterImage(
    originalChapter,
    personalizedChapter,
    personalizationDetails,
    childName,
    index,
    storySummary,
    template,
    analysisData,
  ) {
    try {
      const { childAge, gender } = personalizationDetails;

      const visualStyle = this._getVisualStyle(
        childAge || "5",
        template.genre || "",
      );

      const prompt = this.buildImagePrompt(
        personalizedChapter.image_description ||
          originalChapter.image_description ||
          "",
        originalChapter.image_position || "full scene",
        childName,
        childAge,
        gender,
        personalizationDetails,
        visualStyle,
        storySummary,
        analysisData,
      );

      console.log(
        `Generating image for chapter ${index + 1} with prompt length: ${prompt.length}`,
      );

      const imageResult = await this.generateImageWithOpenAI(prompt);
      let uploadedUrl;

      if (imageResult.b64_json) {
        console.log(`Uploading base64 image for chapter ${index + 1}`);
        const s3Key = this.s3Service.generateBase64ImageKey(
          `personalized-books/${childName}/chapters`,
          "png",
        );
        uploadedUrl = await this.s3Service.uploadBase64Image(
          imageResult.b64_json,
          s3Key,
          "image/png",
        );
      } else if (imageResult.url) {
        console.log(`Uploading URL image for chapter ${index + 1}`);
        const s3Key = this.s3Service.generateImageKey(
          `personalized-books/${childName}/chapters`,
          `chapter-${index + 1}-${Date.now()}`,
        );
        uploadedUrl = await this.s3Service.uploadImageFromUrl(
          imageResult.url,
          s3Key,
        );
      } else {
        throw new Error("No image data available from OpenAI");
      }

      console.log(
        `Successfully uploaded image for chapter ${index + 1}: ${uploadedUrl}`,
      );
      return uploadedUrl;
    } catch (error) {
      console.error(`Error generating chapter image ${index + 1}:`, error);
      return originalChapter.image_url || "";
    }
  }

  buildImagePrompt(
    imageDescription,
    imagePosition,
    childName,
    childAge,
    gender,
    personalizationDetails,
    visualStyle,
    storySummary,
    analysisData,
  ) {
    const themes = (storySummary.main_themes || []).slice(0, 3).join(", ");
    const settings = (storySummary.key_settings || []).slice(0, 2).join(", ");

    let characterDesc = `Main character: ${childName}, ${childAge}-year-old ${gender}.`;

    if (analysisData) {
      characterDesc += ` Skin: ${analysisData.skin_tone}.`;
      if (analysisData.hair) {
        characterDesc += ` Hair: ${analysisData.hair.color}, ${analysisData.hair.style}, ${analysisData.hair.texture}.`;
      }
      if (analysisData.eyes) {
        characterDesc += ` Eyes: ${analysisData.eyes.color}.`;
      }
      if (analysisData.clothing) {
        characterDesc += ` Clothing: ${analysisData.clothing.color} ${analysisData.clothing.type}.`;
      }
      if (analysisData.facial_features?.distinctive_marks) {
        characterDesc += ` Distinctive features: ${analysisData.facial_features.distinctive_marks.join(", ")}.`;
      }
      if (analysisData.accessories) {
        characterDesc += ` Accessories: ${analysisData.accessories.join(", ")}.`;
      }
    } else {
      // Fallback to basic manual details if no AI analysis
      if (personalizationDetails.skinTone)
        characterDesc += ` Skin: ${personalizationDetails.skinTone}.`;
      if (personalizationDetails.hairColor)
        characterDesc += ` Hair: ${personalizationDetails.hairColor}.`;
      if (personalizationDetails.eyeColor)
        characterDesc += ` Eyes: ${personalizationDetails.eyeColor}.`;
      if (personalizationDetails.clothing)
        characterDesc += ` Wearing: ${personalizationDetails.clothing}.`;
    }

    return `CRITICAL CHARACTER CONSISTENCY:
${characterDesc}

STORY CONTEXT:
Themes: ${themes}
Setting: ${settings}
Style: ${visualStyle}

SCENE ACTION:
${imageDescription}

COMPOSITION: ${imagePosition}

REQUIREMENTS:
- Exact character match based on description.
- High quality illustration.
- No text or words in image.`;
  }

  async generateOptimizedPersonalizedCover(
    personalizedTitle,
    personalizedStory,
    personalizationDetails,
    storySummary,
    analysisData,
  ) {
    try {
      const { childName, childAge, gender } = personalizationDetails;

      const visualStyle = this._getVisualStyle(
        childAge || "5",
        personalizedStory.genre || "",
      );

      const coverPrompt = this.buildCoverPrompt(
        personalizedTitle,
        storySummary,
        childName,
        childAge,
        gender,
        personalizationDetails,
        visualStyle,
        analysisData,
      );

      console.log(
        "Generating cover image with prompt length:",
        coverPrompt.length,
      );

      const imageResult = await this.generateImageWithOpenAI(coverPrompt);
      let uploadedUrl;

      if (imageResult.b64_json) {
        console.log("Uploading base64 cover image");
        const s3Key = this.s3Service.generateBase64ImageKey(
          `personalized-books/${childName}/covers`,
          "png",
        );
        uploadedUrl = await this.s3Service.uploadBase64Image(
          imageResult.b64_json,
          s3Key,
          "image/png",
        );
      } else if (imageResult.url) {
        console.log("Uploading URL cover image");
        const s3Key = this.s3Service.generateImageKey(
          `personalized-books/${childName}/covers`,
          `personalized-cover-${Date.now()}`,
        );
        uploadedUrl = await this.s3Service.uploadImageFromUrl(
          imageResult.url,
          s3Key,
        );
      } else {
        throw new Error("No image data available from OpenAI for cover");
      }

      console.log(`Successfully uploaded cover image: ${uploadedUrl}`);
      return uploadedUrl;
    } catch (error) {
      console.error("Error generating personalized cover:", error);
      return null;
    }
  }

  buildCoverPrompt(
    bookTitle,
    storySummary,
    childName,
    childAge,
    gender,
    personalizationDetails,
    visualStyle,
    analysisData,
  ) {
    const themes = (storySummary.main_themes || []).slice(0, 3).join(", ");

    let characterDesc = `Main character: ${childName}, ${childAge}-year-old ${gender}.`;

    if (analysisData) {
      characterDesc += ` Skin: ${analysisData.skin_tone}.`;
      if (analysisData.hair) {
        characterDesc += ` Hair: ${analysisData.hair.color}, ${analysisData.hair.style}, ${analysisData.hair.texture}.`;
      }
      if (analysisData.eyes) {
        characterDesc += ` Eyes: ${analysisData.eyes.color}.`;
      }
      if (analysisData.clothing) {
        characterDesc += ` Clothing: ${analysisData.clothing.color} ${analysisData.clothing.type}.`;
      }
    } else {
      if (personalizationDetails.skinTone)
        characterDesc += ` Skin: ${personalizationDetails.skinTone}.`;
      if (personalizationDetails.hairColor)
        characterDesc += ` Hair: ${personalizationDetails.hairColor}.`;
    }

    return `BOOK COVER: "${bookTitle}"

${characterDesc}

THEMES: ${themes}
STYLE: ${visualStyle}
SUMMARY: ${(storySummary.summary || "").substring(0, 100)}

REQUIREMENTS:
- Vibrant, magical book cover art.
- Character consistent with description.
- NO TEXT except potentially the title stylistically incorporated (but better no text at all).`;
  }

  async generateImageWithOpenAI(safePrompt, options = {}) {
    const MAX_RETRIES = 5;
    let initialDelay = 5000;

    for (let retries = 0; retries < MAX_RETRIES; retries++) {
      try {
        console.log("Generating image with OpenAI...");

        const requestOptions = {
          model: "dall-e-3",
          prompt: safePrompt,
          n: 1,
          size: "1024x1024",
          response_format: "b64_json",
          ...options,
        };

        const response = await this.openai.images.generate(requestOptions);

        if (!response.data || !response.data[0]) {
          throw new Error("No image data received from OpenAI");
        }

        return { b64_json: response.data[0].b64_json, provider: "openai" };
      } catch (openAIError) {
        console.error("OpenAI image generation failed:", openAIError);

        if (retries < MAX_RETRIES - 1) {
          const delay = initialDelay * Math.pow(2, retries);
          console.log(
            `Retrying in ${delay}ms... (Attempt ${retries + 1}/${MAX_RETRIES})`,
          );
          await sleep(delay);
          continue;
        }
        break;
      }
    }

    console.warn(
      "All retries failed for OpenAI image generation. Returning fallback.",
    );
    return {
      url: `https://via.placeholder.com/1024x1024/4A90E2/FFFFFF?text=Image+Coming+Soon`,
      provider: "fallback",
    };
  }

  assemblePersonalizedBook(
    personalizedStory,
    chapterImages,
    coverImage,
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

    const updatedChapters = personalizedStory.chapters.map(
      (chapter, index) => ({
        ...chapter,
        image_url: chapterImages[index] || chapter.image_url || "",
        image_position: chapter.image_position || "full scene",
      }),
    );

    return {
      ...personalizedStory,
      chapters: updatedChapters,
      cover_image: coverImage ? [coverImage] : [],
      child_name: childName || "",
      child_age: childAge || "",
      skin_tone: skinTone || "",
      hair_type: hairType || "",
      hair_style: hairStyle || "",
      hair_color: hairColor || "",
      eye_color: eyeColor || "",
      clothing: clothing || "",
      gender: gender || "",
    };
  }

  getIdealPhotoGuidelines() {
    return this.imageValidator.getIdealImageSpecifications();
  }
}

export default StoryPersonalizer;
