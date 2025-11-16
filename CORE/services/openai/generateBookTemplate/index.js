import OpenAI from "openai";
import { config } from "@/config";
import ErrorHandler from "@/Error";
import VeoGenerator from "../../googlegenai/index.js";
import ImagenGenerator from "../../imagen/index.js";

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
    educational: ["Georgia", "Palatino", "Calibri"],
  },
};

class StorybookGenerator {
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
    this.veoGenerator = new VeoGenerator();
    this.imagenGenerator = new ImagenGenerator();
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

  // Always return exactly 7 chapters
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
      return {
        veo_animation: {
          success: false,
          error: error.message,
          fallback_url: this.veoGenerator.generateFallbackUrl(
            `Animation for ${storyData.book_title}`,
          ),
        },
        storyboard_frames: [],
        duration_seconds: 10,
        visual_style: this._getVisualStyle(ageMin, theme),
        age_range: `${ageMin}-${ageMax}`,
      };
    }
  }

  async generateImageWithGoogle(safePrompt, options = {}) {
    try {
      console.log("Generating image with Google Imagen...");
      const imageUrl = await this.imagenGenerator.generateImage(safePrompt, {
        size: "1024x1024",
        aspectRatio: "1:1",
        model: "imagen-4.0-generate-001",
        ...options,
      });
      return { url: imageUrl, provider: "google" };
    } catch (googleError) {
      console.error("Google Imagen failed:", googleError);
      return {
        url: `https://via.placeholder.com/1024x1024/4A90E2/FFFFFF?text=Image+Coming+Soon`,
        provider: "fallback",
      };
    }
  }

  async generateStory({
    theme,
    name = "",
    photo_url = "",
    skin_tone = "",
    hair_type = "",
    hairstyle = "",
    hair_color = "",
    eye_color = "",
    facial_features = "",
    clothing = "",
    gender = "",
    milestone_date = "",
    age_min = 5,
    age_max = 10,
    prompt_message,
  }) {
    let prompt = `${theme}:\nWrite a full, detailed children's storybook with the following details:\n`;
    if (name) prompt += `- Name: ${name}\n`;
    if (photo_url) prompt += `- Photo URL: ${photo_url}\n`;
    if (skin_tone) prompt += `- Skin tone: ${skin_tone}\n`;
    if (hair_type) prompt += `- Hair type: ${hair_type}\n`;
    if (hairstyle) prompt += `- Hairstyle: ${hairstyle}\n`;
    if (hair_color) prompt += `- Hair color: ${hair_color}\n`;
    if (eye_color) prompt += `- Eye color: ${eye_color}\n`;
    if (facial_features) prompt += `- Facial features: ${facial_features}\n`;
    if (clothing) prompt += `- Clothing: ${clothing}\n`;
    if (gender) prompt += `- Gender: ${gender}\n`;
    prompt += `\n${prompt_message}\n`;

    const ageGroup = this.getAgeGroup(age_min);
    const imagePositions = this.getImagePositions(ageGroup);
    const suggestedFonts = this.getSuggestedFonts(ageGroup, theme);
    const targetChapterCount = this.calculateChapterCount(); // Always 7
    const textLength = this.getTextLengthPerPage(age_min);

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `You are a professional children's storyteller. You will write a fun, magical, and joyful story for a child aged ${age_min} to ${age_max}, the gender is ${gender}.

**STORY STRUCTURE:**
* Create exactly 7 chapters (pages) for this storybook
* Each chapter must be exactly one page with age-appropriate text length
* The story must have a clear beginning, middle, and end across all 7 pages
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
  "total_pages": 7,
  "age_range": "${age_min}-${age_max}",
  "reading_level": "${textLength.description}"
}`,
          },
          {
            role: "user",
            content: `Using the details below, weave a captivating 7-page story where ${name} is the true protagonist. Make sure every chapter features ${name} prominently and the story flows naturally across all 7 pages. Each chapter must be exactly ${textLength.sentences} sentences to maintain perfect pacing for ${age_min}-${age_max} year old readers.

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

      // Validate chapter count
      if (storyData.chapters.length !== 7) {
        console.warn(
          `Generated ${storyData.chapters.length} chapters, expected exactly 7`,
        );
      }

      storyData.chapters.forEach((chapter) => {
        chapter.chapter_content = this.cleanContent(chapter.chapter_content);
      });

      console.log(
        `Generated story with ${storyData.chapters.length} chapters for age ${age_min}-${age_max}`,
      );

      const keywords = this.extractKeywords(storyData);

      // Generate images sequentially instead of using Promise.all
      const images = await this.generateImagesForChapters(
        storyData.chapters,
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
      );

      const coverImage = await this.generateCoverImage(
        storyData,
        gender,
        name,
        theme,
        age_min,
      );

      const veoAnimation = await this.generateVeoAnimation(
        storyData,
        theme,
        age_min,
        age_max,
        name,
        gender,
      );

      const storybookContent = this.addImagesToStory(storyData, images);

      return {
        story: {
          ...storybookContent,
          cover_image: [coverImage.url],
          author: name,
          genre: theme,
          photo_url: photo_url || null,
          skin_tone,
          name,
          hair_type,
          hair_style: hairstyle,
          hair_color,
          eye_color,
          facial_features: facial_features || null,
          clothing,
          gender,
          age_min: age_min.toString(),
          age_max: age_max.toString(),
          keywords: keywords,
          video_url: veoAnimation.veo_animation.video_uri,
          story_metadata: {
            total_pages: storyData.chapters.length,
            reading_level: textLength.description,
            recommended_age: `${age_min}-${age_max}`,
            text_complexity: `${textLength.words} words per page`,
          },
          animation_data: {
            storyboard_frames: veoAnimation.storyboard_frames,
            duration_seconds: veoAnimation.duration_seconds,
            visual_style: veoAnimation.visual_style,
            age_range: veoAnimation.age_range,
          },
          generation_providers: {
            story: "openai",
            images: images.map((img) => img.provider),
            cover: coverImage.provider,
            animation: "google",
          },
        },
      };
    } catch (error) {
      console.error("Error generating story:", error);
      throw new ErrorHandler(
        `Failed to generate the story: ${error.message}`,
        500,
      );
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

    // Generate images sequentially instead of using Promise.all
    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];
      try {
        console.log(`Generating image for chapter ${i + 1}/${chapters.length}...`);

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

        const imageResult = await this.generateImageWithGoogle(safePrompt);
        images.push(imageResult);

        console.log(`Successfully generated image for chapter ${i + 1}`);

        // Add a small delay between requests to avoid rate limiting
        if (i < chapters.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`Error generating image for chapter ${i + 1}:`, error);
        images.push({
          url: `https://via.placeholder.com/1024x1024/4A90E2/FFFFFF?text=Image+Coming+Soon`,
          provider: "error",
        });

        // Continue with next chapter even if this one fails
        if (i < chapters.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    return images.filter((result) => result.url !== null);
  }

  async generateCoverImage(storyData, gender, name, theme, age_min) {
    const visualStyle = this._getVisualStyle(age_min, theme);

    const safePrompt = `Children's book cover illustration ${visualStyle}.
    A magical and joyful scene featuring the main character, ${name}, a ${gender} child protagonist.
    The cover should be bright, friendly, and enchanting, suitable for a children's storybook.
    ABSOLUTELY NO TEXT, WORDS, LETTERS, OR WRITING OF ANY KIND IN THE IMAGE.
    No book titles, no captions, no speech bubbles, no labels.
    Pure visual illustration only with captivating magical atmosphere. NO TEXT whatsoever`;

    try {
      const coverResult = await this.generateImageWithGoogle(safePrompt, {
        quality: "high",
      });
      return coverResult;
    } catch (error) {
      console.error("Error generating cover image:", error);
      return {
        url: `https://via.placeholder.com/1024x1024/FF6B6B/FFFFFF?text=Cover+Image+Coming+Soon`,
        provider: "error",
      };
    }
  }

  addImagesToStory(storyData, imageResults) {
    storyData.chapters.forEach((chapter, index) => {
      if (imageResults[index] && imageResults[index].url) {
        chapter.image_url = imageResults[index].url;
        chapter.image_provider = imageResults[index].provider;
      }
    });
    return storyData;
  }
}

export default StorybookGenerator;