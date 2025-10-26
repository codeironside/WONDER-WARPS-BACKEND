import OpenAI from "openai";
import { config } from "@/config";
import ErrorHandler from "@/Error";
import VeoGenerator from "../../googlegenai/index.js";

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

  calculateChapterCount(ageMin, ageMax, theme) {
    const baseCount = 3;
    let additionalChapters = 0;
    if (ageMin > 8) additionalChapters += 1;
    if (ageMax > 10) additionalChapters += 1;
    const complexThemes = ["adventure", "fantasy", "mystery", "quest"];
    if (complexThemes.some((t) => theme.toLowerCase().includes(t))) {
      additionalChapters += 1;
    }
    const randomVariation = Math.floor(Math.random() * 2);
    return Math.min(
      10,
      Math.max(3, baseCount + additionalChapters + randomVariation),
    );
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

  async generateVeoAnimation(storyData, theme, ageMin, name, gender) {
    try {
      const promptData = await this.generateStorySpecificVeoPrompt(
        storyData,
        theme,
        ageMin,
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
        );

      return animationResult.video_uri || animationResult.fallback_url || null;
    } catch (error) {
      console.error("Error generating Veo animation:", error);
      return null;
    }
  }
  extractKeyStoryMoments(storyData) {
    const moments = [];

    storyData.chapters.forEach((chapter, chapterIndex) => {
      const sentences = chapter.chapter_content
        .split(/[.!?]+/)
        .filter((s) => s.trim().length > 10);

      // Extract key moments from each chapter
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

  async generateStorySpecificVeoPrompt(storyData, theme, ageMin, name, gender) {
    try {
      const visualStyle = this._getVisualStyle(ageMin, theme);
      const storySummary = this.createStorySummary(storyData);
      const keyMoments = this.extractKeyStoryMoments(storyData);

      const response = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `You are a professional animation director. Create highly specific video prompts based on exact story content.`,
          },
          {
            role: "user",
            content: `Create an EXCLUSIVE animation prompt for "${storyData.book_title}" using these exact story details:

EXACT STORY CONTENT:
${storyData.chapters.map((chapter) => `Chapter: ${chapter.chapter_title}\nContent: ${chapter.chapter_content.substring(0, 200)}`).join("\n\n")}

CHARACTER: ${name} (${gender})
THEME: ${theme}
VISUAL STYLE: ${visualStyle}
KEY STORY MOMENTS: ${keyMoments.join(" | ")}

Create a 5-second animation prompt that captures the ESSENCE of this specific story, not a generic theme. Focus on actual events and character journey from the story above.`,
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
      };
    } catch (error) {
      console.error("Error generating story-specific Veo prompt:", error);
      // Fallback to basic prompt
      const visualStyle = this._getVisualStyle(ageMin, theme);
      const storySummary = this.createStorySummary(storyData);
      const keyMoments = this.extractKeyStoryMoments(storyData);

      return {
        prompt: `5-second cinematic animation for "${storyData.book_title}" featuring ${name}. Story: ${storySummary}. Key moments: ${keyMoments.join(", ")}. Visual style: ${visualStyle}.`,
        storySummary: storySummary,
        keyMoments: keyMoments,
        visualStyle: visualStyle,
      };
    }
  }

  async generateVeoAnimation(storyData, theme, ageMin, name, gender) {
    try {
      const promptData = await this.generateStorySpecificVeoPrompt(
        storyData,
        theme,
        ageMin,
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
        );

      const storyboardFrames = await this.veoGenerator.generateAnimationFrames(
        storyData.book_title,
        promptData.keyMoments,
        4,
      );

      return {
        veo_animation: animationResult,
        storyboard_frames: storyboardFrames,
        story_specific_prompt: promptData.prompt,
        key_story_moments: promptData.keyMoments,
        duration_seconds: 5,
        visual_style: promptData.visualStyle,
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
        duration_seconds: 5,
        visual_style: this._getVisualStyle(ageMin, theme),
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
    const targetChapterCount = this.calculateChapterCount(
      age_min,
      age_max,
      theme,
    );

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `You are a professional children's storyteller. You will write a fun, magical, and joyful story for a child aged ${age_min} to ${age_max}, the gender is ${gender}.

**Story Rules:**
* The story must have a clear beginning, middle, and end.
* Create a natural story length with ${targetChapterCount} chapters that fits the narrative perfectly.
* The tone should be similar to a whimsical Studio Ghibli film, full of imagination and wonder.
* The story must be appropriate for the age range ${age_min}-${age_max}
* Make sure ${name} is the main character throughout the entire story.
* Do NOT use markdown formatting, chapter numbers, or special characters in chapter content.
* Write chapter content as plain text paragraphs without any formatting.

**Chapter Structure:**
- Chapter 1: Introduction and setup
- Chapter 2-${targetChapterCount - 1}: Development and adventures
- Chapter ${targetChapterCount}: Resolution and conclusion

**Image Position Guidance:**
For age ${age_min}-${age_max}, choose image positions that enhance engagement. Available positions: ${imagePositions.join(", ")}
- Younger children (3-6): Prefer full scene, character focus, action spotlight for visual impact
- Middle childhood (7-10): Use left/right panels, comic strips, split screens for narrative flow  
- Older children (11+): Consider text wrap, header banners, interactive elements for sophistication

**Font Selection:**
Choose from these age-appropriate fonts: ${suggestedFonts.join(", ")}

You will return the story as a single JSON object with the following format:
{
  "book_title": "Creative title featuring ${name}'s adventure",
  "author": "${name}",
  "chapters": [
    {
      "chapter_title": "Engaging chapter title",
      "chapter_content": "The full content of chapter 1 as plain text without markdown or chapter numbers. Ensure ${name} is prominently featured.",
      "image_description": "A brief, vivid description for an illustration featuring ${name}.",
      "image_position": "Choose from the available positions above"
    }
  ],
  "suggested_font": "Choose from the available fonts above"
}`,
          },
          {
            role: "user",
            content: `Using the details below, weave a captivating story where ${name} is the true protagonist. Make sure every chapter features ${name} prominently and the story flows naturally across ${targetChapterCount} chapters. Use plain text without markdown or chapter numbers.
            
            Details for the story:
            ${prompt}`,
          },
        ],
        max_tokens: 3500,
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

      console.log(`Generated story with ${storyData.chapters.length} chapters`);

      const keywords = this.extractKeywords(storyData);
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
        name,
        gender,
      );

      const storybookContent = this.addImagesToStory(storyData, images);

      return {
        story: {
          ...storybookContent,
          cover_image: [coverImage],
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
    const imagePromises = chapters.map(async (chapter) => {
      try {
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

        const image = await this.openai.images.generate({
          model: "dall-e-3",
          response_format: "url",
          prompt: safePrompt,
          n: 1,
          quality: "standard",
          size: "1024x1024",
        });

        return image.data[0].url;
      } catch (error) {
        console.error("Error generating chapter image:", error);
        return `https://via.placeholder.com/1024x1024/4A90E2/FFFFFF?text=Image+Coming+Soon`;
      }
    });

    const images = await Promise.all(imagePromises);
    return images.filter((url) => url !== null);
  }

  async generateCoverImage(storyData, gender, name, theme, age_min) {
    const visualStyle = this._getVisualStyle(age_min, theme);

    const safePrompt = `Children's book  illustration ${visualStyle}.
    A magical and joyful scene featuring the main character, ${name}, a ${gender} child protagonist.
    The cover should be bright, friendly, and enchanting, suitable for a children's storybook.
    ABSOLUTELY NO TEXT, WORDS, LETTERS, OR WRITING OF ANY KIND IN THE IMAGE.
    No book titles, no captions, no speech bubbles, no labels.
    Pure visual illustration only with captivating magical atmosphere.`;

    try {
      const coverImage = await this.openai.images.generate({
        model: "dall-e-3",
        response_format: "url",
        prompt: safePrompt,
        n: 1,
        quality: "hd",
        size: "1024x1024",
      });

      return coverImage.data[0].url;
    } catch (error) {
      console.error("Error generating cover image:", error);
      return `https://via.placeholder.com/1024x1024/FF6B6B/FFFFFF?text=Cover+Image+Coming+Soon`;
    }
  }

  addImagesToStory(storyData, imageUrls) {
    storyData.chapters.forEach((chapter, index) => {
      if (imageUrls[index]) {
        chapter.image_url = imageUrls[index];
      }
    });
    return storyData;
  }
}

export default StorybookGenerator;
