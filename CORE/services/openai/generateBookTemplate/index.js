import OpenAI from "openai";
import { config } from "@/config";
import ErrorHandler from "@/Error";
import VeoGenerator from "../../googlegenai/index.js";
import BookTemplate from "../../../../API/BOOK_TEMPLATE/model/index.js";
import User from "../../../../API/AUTH/model/index.js";
import emailService from "../../Email/index.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const IMAGE_POSITIONS = {
  YOUNGER_CHILD: [
    "full scene",
    "character focus",
    "action spotlight",
    "top third",
    "bottom third",
    "diagonal spread",
    "circular frame",
    "speech bubble",
  ],
  MIDDLE_CHILD: [
    "left panel",
    "right panel",
    "background layered",
    "floating elements",
    "comic strip",
    "map integration",
    "cutaway view",
    "split screen",
  ],
  OLDER_CHILD: [
    "text wrap",
    "border integrated",
    "corner accent",
    "header banner",
    "footer illustration",
    "side bar",
    "watermark style",
    "interactive element",
  ],
};

const SUGGESTED_FONTS = {
  YOUNGER_CHILD: [
    "Comic Sans MS",
    "KG Primary Penmanship",
    "DK Crayon Crumble",
    "OpenDyslexic",
    "Sassoon Primary",
    "Century Gothic",
    "Verdana",
    "Arial Rounded",
  ],
  MIDDLE_CHILD: [
    "Gill Sans",
    "Trebuchet MS",
    "Palatino",
    "Georgia",
    "Calibri",
    "Cabin",
    "Quicksand",
    "Nunito",
  ],
  OLDER_CHILD: [
    "Times New Roman",
    "Garamond",
    "Baskerville",
    "Helvetica",
    "Lato",
    "Merriweather",
    "Roboto",
    "Source Sans Pro",
  ],
  THEMED_FONTS: {
    fantasy: ["Papyrus", "Trajan Pro", "Uncial Antiqua"],
    adventure: ["Rockwell", "Copperplate", "Franklin Gothic"],
    sci_fi: ["Orbitron", "Eurostile", "Bank Gothic"],
    mystery: ["Courier New", "American Typewriter", "Baskerville"],
    humor: ["Comic Sans MS", "Marker Felt", "Chalkboard"],
    educational: ["Georgia", "Palatino", "CalSibri"],
  },
};

class StorybookGenerator {
  constructor() {
    const apiKey = config.openai.API_KEY;

    if (!apiKey) {
      throw new ErrorHandler(
        "OpenAI API key is required for text generation",
        500,
      );
    }

    this.openai = new OpenAI({ apiKey });
    this.veoGenerator = new VeoGenerator();
  }

  getAgeGroup(ageMin) {
    if (ageMin <= 6) return "YOUNGER_CHILD";
    if (ageMin <= 10) return "MIDDLE_CHILD";
    return "OLDER_CHILD";
  }

  getImagePositions(ageGroup) {
    return IMAGE_POSITIONS[ageGroup] || IMAGE_POSITIONS.MIDDLE_CHILD;
  }

  getSuggestedFonts(ageGroup, theme = "") {
    const ageFonts = SUGGESTED_FONTS[ageGroup] || SUGGESTED_FONTS.MIDDLE_CHILD;
    const themeKey = Object.keys(SUGGESTED_FONTS.THEMED_FONTS).find((key) =>
      theme.toLowerCase().includes(key),
    );
    const themeFonts = themeKey ? SUGGESTED_FONTS.THEMED_FONTS[themeKey] : [];
    return [...new Set([...ageFonts, ...themeFonts])];
  }

  calculateChapterCount() {
    return 7;
  }

  getTextLengthPerPage(ageMin) {
    if (ageMin <= 4) {
      return {
        sentences: "1-2",
        words: "10-20",
        description: "very short and simple",
      };
    } else if (ageMin <= 6) {
      return {
        sentences: "2-3",
        words: "20-40",
        description: "short and simple",
      };
    } else if (ageMin <= 8) {
      return {
        sentences: "3-4",
        words: "40-60",
        description: "moderate length",
      };
    } else if (ageMin <= 10) {
      return { sentences: "4-5", words: "60-80", description: "descriptive" };
    } else {
      return {
        sentences: "5-7",
        words: "80-120",
        description: "detailed and engaging",
      };
    }
  }

  cleanContent(text) {
    return text
      .replace(/^#+\s*Chapter\s*\d+:?\s*/gim, "")
      .replace(/\n/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  sanitizeImagePrompt(prompt) {
    return prompt
      .replace(/[#*_`]/g, "")
      .replace(/\n/g, " ")
      .replace(/\s+/g, " ")
      .replace(/[^\w\s.,!?\-]/g, "")
      .trim()
      .substring(0, 800);
  }

  extractKeywords(storyData) {
    const allContent = storyData.chapters
      .map((chapter) => chapter.chapter_content + " " + chapter.chapter_title)
      .join(" ")
      .toLowerCase();

    const commonKeywords = [
      "adventure",
      "friendship",
      "magic",
      "fantasy",
      "bravery",
      "courage",
      "explore",
      "journey",
      "discovery",
      "mystery",
      "hero",
      "quest",
      "animal",
      "forest",
      "ocean",
      "space",
      "school",
      "family",
      "teamwork",
      "imagination",
      "dream",
      "rescue",
      "secret",
      "treasure",
      "map",
      "island",
      "castle",
      "dragon",
      "unicorn",
      "fairy",
      "wizard",
      "robot",
      "alien",
      "pirate",
      "knight",
      "princess",
      "superhero",
      "detective",
    ];

    const foundKeywords = commonKeywords.filter((keyword) =>
      allContent.includes(keyword),
    );

    const genderKeyword = storyData.chapters[0]?.chapter_content
      .toLowerCase()
      .includes(" she ")
      ? "girl"
      : storyData.chapters[0]?.chapter_content.toLowerCase().includes(" he ")
        ? "boy"
        : "";

    const finalKeywords = [
      ...new Set([...foundKeywords, genderKeyword].filter(Boolean)),
    ];

    return finalKeywords.slice(0, 6);
  }

  _getVisualStyle(ageMin, theme) {
    if (!theme) {
      console.warn("Theme is undefined, defaulting to Pixar style.");
      return "in a modern Pixar CGI style with high-fidelity rendering, realistic textures, and emotionally expressive rounded characters";
    }

    const lowerTheme = theme.toLowerCase();

    const styleMappings = {
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

    if (
      lowerTheme.includes("sci_fi") ||
      lowerTheme.includes("robot") ||
      lowerTheme.includes("space")
    ) {
      return ageMin <= 10
        ? styleMappings.sci_fi.modern
        : styleMappings.sci_fi.cinematic;
    }

    if (
      lowerTheme.includes("humor") ||
      lowerTheme.includes("funny") ||
      lowerTheme.includes("comedy")
    ) {
      if (ageMin <= 6) return styleMappings.preschool.simple_cartoon;
      if (ageMin <= 10) return styleMappings.humor.modern_cartoon;
      return styleMappings.humor.simpsons;
    }

    if (
      lowerTheme.includes("fantasy") ||
      lowerTheme.includes("magic") ||
      lowerTheme.includes("kingdom")
    ) {
      if (ageMin <= 6) return styleMappings.classic.golden_age;
      if (ageMin <= 10) return styleMappings.fantasy.anime_fantasy;
      return styleMappings.fantasy.disney_renaissance;
    }

    if (
      lowerTheme.includes("adventure") ||
      lowerTheme.includes("explore") ||
      lowerTheme.includes("journey")
    ) {
      if (ageMin <= 6) return styleMappings.adventure.dreamworks;
      if (ageMin <= 10) return styleMappings.adventure.moana;
      return styleMappings.adventure.volumetric;
    }

    if (
      lowerTheme.includes("action") ||
      lowerTheme.includes("battle") ||
      lowerTheme.includes("hero")
    ) {
      return ageMin <= 10
        ? styleMappings.action.cartoon_network
        : styleMappings.action.fast_furious;
    }

    if (
      lowerTheme.includes("classic") ||
      lowerTheme.includes("vintage") ||
      lowerTheme.includes("retro")
    ) {
      return styleMappings.classic.hanna_barbera;
    }

    if (ageMin <= 6) {
      return styleMappings.preschool.peppa_pig;
    }
    if (ageMin <= 10) {
      return styleMappings.adventure.pixar;
    }
    return styleMappings.fantasy.modern_disney;
  }

  extractKeyStoryMoments(storyData) {
    const moments = [];

    storyData.chapters.forEach((chapter, chapterIndex) => {
      const sentences = chapter.chapter_content
        .split(/[.!?]+/)
        .filter((s) => s.trim().length > 10);

      sentences.slice(0, 2).forEach((sentence) => {
        const cleanSentence = sentence.trim();
        if (cleanSentence.length > 20 && cleanSentence.length < 150) {
          moments.push({
            chapter: chapterIndex + 1,
            moment: cleanSentence,
            chapter_title: chapter.chapter_title,
          });
        }
      });
    });

    return moments.slice(0, 5).map((m) => m.moment);
  }

  createStorySummary(storyData) {
    const firstChapter = storyData.chapters[0]?.chapter_content || "";
    const lastChapter =
      storyData.chapters[storyData.chapters.length - 1]?.chapter_content || "";

    return `${firstChapter.substring(0, 150)}... ${lastChapter.substring(0, 100)}`.substring(
      0,
      300,
    );
  }

  async generateStorySpecificVeoPrompt(
    storyData,
    theme,
    ageMin,
    ageMax,
    name,
    gender,
  ) {
    try {
      const visualStyle = this._getVisualStyle(ageMin, theme);
      const storySummary = this.createStorySummary(storyData);
      const keyMoments = this.extractKeyStoryMoments(storyData);
      const ageRange = `${ageMin}-${ageMax}`;

      const response = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `You are a professional animation director. Create highly specific video prompts based on exact story content for children aged ${ageRange}.`,
          },
          {
            role: "user",
            content: `Create an EXCLUSIVE animation prompt for "${storyData.book_title}" using these exact story details for children aged ${ageRange}:

EXACT STORY CONTENT:
${storyData.chapters.map((chapter) => `Chapter: ${chapter.chapter_title}\nContent: ${chapter.chapter_content.substring(0, 200)}`).join("\n\n")}

CHARACTER: ${name} (${gender})
THEME: ${theme}
TARGET AGE: ${ageRange}
VISUAL STYLE: ${visualStyle}
KEY STORY MOMENTS: ${keyMoments.join(" | ")}

Create a 10-second animation prompt that captures the ESSENCE of this specific story for ${ageRange} year old children. Focus on actual events and character journey from the story above, making it age-appropriate.`,
          },
        ],
        max_tokens: 600,
        temperature: 0.7,
      });

      return {
        prompt: response.choices[0].message.content.trim(),
        storySummary: storySummary,
        keyMoments: keyMoments,
        visualStyle: visualStyle,
        ageRange: ageRange,
      };
    } catch (error) {
      console.error("Error generating story-specific Veo prompt:", error);
      const visualStyle = this._getVisualStyle(ageMin, theme);
      const storySummary = this.createStorySummary(storyData);
      const keyMoments = this.extractKeyStoryMoments(storyData);
      const ageRange = `${ageMin}-${ageMax}`;

      return {
        prompt: `10-second cinematic animation for "${storyData.book_title}" featuring ${name}. Story: ${storySummary}. Key moments: ${keyMoments.join(", ")}. Visual style: ${visualStyle}. Created for children aged ${ageRange}.`,
        storySummary: storySummary,
        keyMoments: keyMoments,
        visualStyle: visualStyle,
        ageRange: ageRange,
      };
    }
  }

  async generateVeoAnimation(storyData, theme, ageMin, ageMax, name, gender) {
    try {
      const promptData = await this.generateStorySpecificVeoPrompt(
        storyData,
        theme,
        ageMin,
        ageMax,
        name,
        gender,
      );

      const animationResult =
        await this.veoGenerator.generateStorybookAnimation(
          storyData.book_title,
          name,
          gender,
          theme,
          promptData.visualStyle,
          promptData.storySummary,
          promptData.keyMoments,
          ageMin,
          ageMax,
        );

      const storyboardFrames = await this.veoGenerator.generateAnimationFrames(
        storyData.book_title,
        promptData.keyMoments,
        4,
        `${ageMin}-${ageMax}`,
      );

      return {
        veo_animation: animationResult,
        storyboard_frames: storyboardFrames,
        story_specific_prompt: promptData.prompt,
        key_story_moments: promptData.keyMoments,
        duration_seconds: 10,
        visual_style: promptData.visualStyle,
        age_range: promptData.ageRange,
      };
    } catch (error) {
      console.error("Error generating Veo animation:", error);
      const fallbackUrl = this.veoGenerator.generateFallbackUrl(
        `Animation for ${storyData.book_title}`,
      );
      return {
        veo_animation: {
          success: false,
          error: error.message,
          fallback_url: fallbackUrl,
          video_uri: fallbackUrl,
        },
        storyboard_frames: [],
        duration_seconds: 10,
        visual_style: this._getVisualStyle(ageMin, theme),
        age_range: `${ageMin}-${ageMax}`,
      };
    }
  }

  async generateImageWithOpenAI(safePrompt, options = {}) {
    const MAX_RETRIES = 5;
    let initialDelay = 5000;

    for (let retries = 0; retries < MAX_RETRIES; retries++) {
      try {
        console.log("Generating image with OpenAI...");

        // FIXED: Use .generate() instead of .create() and correct model name
        const response = await this.openai.images.generate({
          model: "dall-e-3", // Fixed model name
          prompt: safePrompt,
          n: 1,
          size: "1024x1024",
          ...options,
        });

        return { url: response.data[0].url, provider: "openai" };
      } catch (openAIError) {
        console.error("OpenAI image generation failed:", openAIError);

        // Add retry logic with exponential backoff
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

  async generateStoryTemplate({
    theme,
    name = "",
    gender = "",
    age_min = 5,
    age_max = 10,
    prompt_message,
    ...otherDetails
  }) {
    let prompt = `${theme}:\nWrite a full, detailed children's storybook with the following details:\n`;
    if (name) prompt += `- Name: ${name}\n`;
    if (gender) prompt += `- Gender: ${gender}\n`;

    Object.entries(otherDetails).forEach(([key, value]) => {
      if (value) {
        const formattedKey = key.replace(/_/g, " ");
        prompt += `- ${formattedKey}: ${value}\n`;
      }
    });

    prompt += `\n${prompt_message}\n`;

    const ageGroup = this.getAgeGroup(age_min);
    const imagePositions = this.getImagePositions(ageGroup);
    const suggestedFonts = this.getSuggestedFonts(ageGroup, theme);
    const targetChapterCount = this.calculateChapterCount();
    const textLength = this.getTextLengthPerPage(age_min);

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `You are a professional children's storyteller. You will write a fun, magical, and joyful story for a child aged ${age_min} to ${age_max}, the gender is ${gender}.

**STORY STRUCTURE:**
* Create exactly ${targetChapterCount} chapters (pages) for this storybook
* Each chapter must be exactly one page with age-appropriate text length
* The story must have a clear beginning, middle, and end across all ${targetChapterCount} pages
* Make sure ${name} is the main character throughout the entire story

**TEXT LENGTH REQUIREMENTS (for age ${age_min}-${age_max}):**
* Each chapter must contain ${textLength.sentences} sentences (${textLength.words} words)
* Keep the text ${textLength.description} and engaging for this age group
* Use simple vocabulary and sentence structures for younger readers
* Make each chapter feel complete but leave a gentle hook for the next page

**CHAPTER BREAKDOWN:**
- Chapters 1-2: Introduction and character setup
- Chapters 3-5: Development, adventures, and challenges
- Chapters 6-7: Resolution and satisfying conclusion

**WRITING STYLE:**
* Tone: Similar to a whimsical Studio Ghibli film, full of imagination and wonder
* Age Appropriateness: Perfectly suited for ${age_min}-${age_max} year olds
* Engagement: Each chapter should make the reader excited to turn the page
* Do NOT use markdown formatting, chapter numbers, or special characters in chapter content
* Write chapter content as plain text paragraphs without any formatting

**IMAGE POSITION GUIDANCE:**
For age ${age_min}-${age_max}, choose image positions that enhance engagement. Available positions: ${imagePositions.join(", ")}

**FONT SELECTION:**
Choose from these age-appropriate fonts: ${suggestedFonts.join(", ")}

You will return the story as a single JSON object with the following format:
{
  "book_title": "Creative title featuring ${name}'s adventure",
  "author": "${name}",
  "chapters": [
    {
      "chapter_title": "Engaging chapter title (max 4-5 words)",
      "chapter_content": "The full content of chapter 1 as plain text without markdown. Exactly ${textLength.sentences} sentences that tell part of the story. Ensure ${name} is prominently featured.",
      "image_description": "A brief, vivid description for an illustration featuring ${name} in this specific scene.",
      "image_position": "Choose from the available positions above"
    }
  ],
  "suggested_font": "Choose from the available fonts above",
  "total_pages": ${targetChapterCount},
  "age_range": "${age_min}-${age_max}",
  "reading_level": "${textLength.description}"
}`,
          },
          {
            role: "user",
            content: `Using the details below, weave a captivating ${targetChapterCount}-page story where ${name} is the true protagonist. Make sure every chapter features ${name} prominently and the story flows naturally across all ${targetChapterCount} pages. Each chapter must be exactly ${textLength.sentences} sentences to maintain perfect pacing for ${age_min}-${age_max} year old readers.

          Details for the story:
          ${prompt}`,
          },
        ],
        max_tokens: 4000,
        temperature: 0.85,
      });

      let storyData;
      try {
        storyData = JSON.parse(response.choices[0].message.content.trim());
      } catch (parseError) {
        console.error("Failed to parse JSON, trying to fix:", parseError);
        const content = response.choices[0].message.content.trim();
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          storyData = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("Invalid JSON response from AI");
        }
      }

      if (!storyData.chapters || storyData.chapters.length === 0) {
        throw new Error("No chapters generated");
      }

      storyData.chapters.forEach((chapter) => {
        chapter.chapter_content = this.cleanContent(chapter.chapter_content);
      });

      console.log(
        `Generated story template with ${storyData.chapters.length} chapters for age ${age_min}-${age_max}`,
      );

      const keywords = this.extractKeywords(storyData);

      return {
        ...storyData,
        keywords,
        genre: theme,
        age_min: age_min.toString(),
        age_max: age_max.toString(),
        ...otherDetails,
        name,
        gender,
      };
    } catch (error) {
      console.error("Error generating story template:", error);
      throw new ErrorHandler(
        `Failed to generate the story template: ${error.message}`,
        500,
      );
    }
  }

  async generateMediaAndSave(storyTemplate, userId) {
    const {
      genre: theme,
      name = "",
      skin_tone = "",
      hair_type = "",
      hairstyle = "",
      hair_color = "",
      eye_color = "",
      clothing = "",
      gender = "",
      age_min = 5,
      age_max = 10,
      chapters,
      book_title,
      author,
      suggested_font,
      description,
      price,
      is_personalizable,
      is_public,
    } = storyTemplate;

    const ageMinNum = parseInt(age_min, 10);
    const ageMaxNum = parseInt(age_max, 10);

    let user = null;
    let savedBook = null;

    try {
      try {
        user = await User.findById(userId);
        if (!user) {
          console.warn(`User not found with ID: ${userId}`);
        }
      } catch (userError) {
        console.error("Failed to fetch user for notification:", userError);
      }

      if (user && user.email) {
        try {
          await emailService.bookgenerationorpersonalisation(
            user.email,
            book_title,
            user.username || user.name || "there",
            "book generation",
            "processing",
          );
          console.log(`Processing notification sent to ${user.email}`);
        } catch (emailError) {
          console.error("Failed to send processing email:", emailError);
        }
      }

      if (!theme) {
        throw new ErrorHandler(
          "Theme/Genre field is missing from the story template.",
          400,
        );
      }

      console.log(`Starting background media generation for: ${book_title}`);

      console.log("Step 1/3: Generating Cover Image...");
      const coverImage = await this.generateCoverImage(
        storyTemplate,
        gender,
        name,
        theme,
        ageMinNum,
      );
      console.log("Cover Image complete.");

      console.log("Step 2/3: Generating Chapter Images (sequentially)...");
      const images = await this.generateImagesForChapters(
        chapters,
        ageMinNum,
        gender,
        name,
        theme,
        skin_tone,
        hair_type,
        hairstyle,
        hair_color,
        eye_color,
        clothing,
      );
      console.log("Chapter Images complete.");

      console.log("Step 3/3: Generating Veo Animation...");
      const veoAnimation = await this.generateVeoAnimation(
        storyTemplate,
        theme,
        ageMinNum,
        ageMaxNum,
        name,
        gender,
      );
      console.log("Veo Animation complete.");

      console.log(
        `Media generation complete for: ${book_title}. Preparing to save.`,
      );

      const chaptersWithImages = chapters.map((chapter, index) => ({
        ...chapter,
        image_url: images[index]?.url || null,
        image_provider: images[index]?.provider || "none",
      }));

      const finalBookData = {
        user_id: userId,
        book_title,
        suggested_font,
        description: description || null,
        skin_tone,
        hair_type,
        hair_style: hairstyle,
        hair_color,
        eye_color,
        clothing,
        gender,
        age_min: age_min.toString(),
        age_max: age_max.toString(),
        cover_image: [coverImage.url],
        genre: theme,
        author: author || name,
        price: price || 0,
        chapters: chaptersWithImages,
        keywords: this.extractKeywords(storyTemplate),
        is_personalizable:
          is_personalizable !== undefined ? is_personalizable : true,
        is_public: is_public || false,
        video_url: veoAnimation.veo_animation.video_uri,
      };

      savedBook = await BookTemplate.create(finalBookData);

      console.log(
        `SUCCESS: Background job finished and saved book: ${book_title}`,
      );

      if (user && user.email) {
        try {
          await emailService.bookgenerationorpersonalisation(
            user.email,
            book_title,
            user.username || user.name || "there",
            "book generation",
            "success",
            {
              bookUrl: `${config.app.base_url}/books/${savedBook._id}`,
            },
          );
          console.log(`Success notification sent to ${user.email}`);
        } catch (emailError) {
          console.error("Failed to send success email:", emailError);
        }
      }

      return savedBook;
    } catch (error) {
      console.error(`FATAL: Background job failed for book: ${book_title}`);
      console.error(error);

      if (user && user.email) {
        try {
          await emailService.bookgenerationorpersonalisation(
            user.email,
            book_title,
            user.username || user.name || "there",
            "book generation",
            "failed",
            {
              errorMessage:
                error.message ||
                "Unknown error occurred during book generation",
            },
          );
          console.log(`Failure notification sent to ${user.email}`);
        } catch (emailError) {
          console.error("Failed to send failure email:", emailError);
        }
      }

      throw error;
    }
  }

  async generateImagesForChapters(
    chapters,
    age_min,
    gender,
    name,
    theme,
    skin_tone,
    hair_type,
    hairstyle,
    hair_color,
    eye_color,
    clothing,
  ) {
    const images = [];

    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];
      try {
        console.log(
          `Generating image for chapter ${i + 1}/${chapters.length}...`,
        );

        const cleanImageDescription = this.sanitizeImagePrompt(
          chapter.image_description,
        );
        const visualStyle = this._getVisualStyle(age_min, theme);

        const safePrompt = `Children's storybook illustration ${visualStyle}.
        Main character: ${name}, a ${gender} child with ${skin_tone} skin, ${hair_color} ${hairstyle} ${hair_type} hair, ${eye_color} eyes, wearing ${clothing}.
        Scene: ${cleanImageDescription}.
        ABSOLUTELY NO TEXT, WORDS, LETTERS, OR WRITING OF ANY KIND IN THE IMAGE.
        No book titles, no captions, no speech bubbles, no labels.
        Pure visual illustration only with bright, friendly, whimsical, child-friendly style.`;

        const imageResult = await this.generateImageWithOpenAI(safePrompt);
        images.push(imageResult);

        console.log(`Successfully generated image for chapter ${i + 1}`);
      } catch (error) {
        console.error(
          `Critical error in generateImagesForChapters loop ${i + 1}:`,
          error,
        );
        images.push({
          url: `https://via.placeholder.com/1024x1024/4A90E2/FFFFFF?text=Image+Coming+Soon`,
          provider: "error",
        });
      }
    }

    return images.filter((result) => result.url !== null);
  }

  async generateCoverImage(storyData, gender, name, theme, age_min) {
    const visualStyle = this._getVisualStyle(age_min, theme);

    const safePrompt = `Children's book illustration ${visualStyle}.
    A magical and joyful scene featuring the main character, ${name}, a ${gender} child protagonist.
    The cover should be bright, friendly, and enchanting, suitable for a children's storybook.
    ABSOLUTELY NO TEXT, WORDS, LETTERS, OR WRITING OF ANY KIND IN THE IMAGE.
    No book titles, no captions, no speech bubbles, no labels.
    Pure visual illustration only with captivating magical atmosphere. NO TEXT whatsoever`;

    try {
      const coverResult = await this.generateImageWithOpenAI(safePrompt, {
        quality: "hd",
      });
      return coverResult;
    } catch (error) {
      console.error("Critical error in generateCoverImage:", error);
      return {
        url: `https://via.placeholder.com/1024x1024/FF6B6B/FFFFFF?text=Cover+Image+Coming+Soon`,
        provider: "error",
      };
    }
  }
}

export default StorybookGenerator;
