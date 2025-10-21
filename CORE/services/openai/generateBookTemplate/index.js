import OpenAI from "openai";
import { config } from "@/config";
import ErrorHandler from "@/Error";

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
    const randomVariation = Math.floor(Math.random() * 2); // 0 or 1

    return Math.min(
      10,
      Math.max(3, baseCount + additionalChapters + randomVariation),
    );
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
      "chapter_content": "The full content of chapter 1, formatted with Markdown. Ensure ${name} is prominently featured.",
      "image_description": "A brief, vivid description for an illustration featuring ${name}.",
      "image_position": "Choose from the available positions above"
    }
  ],
  "suggested_font": "Choose from the available fonts above"
}`,
          },
          {
            role: "user",
            content: `Using the details below, weave a captivating story where ${name} is the true protagonist. Make sure every chapter features ${name} prominently and the story flows naturally across ${targetChapterCount} chapters.
            
            Details for the story:
            ${prompt}`,
          },
        ],
        max_tokens: 4000,
        temperature: 0.8,
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

      console.log(`Generated story with ${storyData.chapters.length} chapters`);

      const images = await this.generateImagesForChapters(
        storyData.chapters,
        age_min,
        age_max,
        gender,
        name,
      );
      const coverImage = await this.generateCoverImage(storyData, gender, name);

      const storybookContent = this.addImagesToStory(storyData, images);

      return { ...storybookContent, coverImage, author: name };
    } catch (error) {
      console.error("Error generating story:", error);
      throw new ErrorHandler(
        `Failed to generate the story: ${error.message}`,
        500,
      );
    }
  }

  async generateImagesForChapters(chapters, age_min, age_max, gender, name) {
    const imagePromises = chapters.map(async (chapter) => {
      try {
        const imageDescription = chapter.image_description;
        const backgroundStory = chapter.chapter_content;

        const image = await this.openai.images.generate({
          model: "dall-e-3",
          response_format: "url",
          prompt: `A dramatic, high-contrast illustration for a children's storybook featuring ${name}. The style is bold, with exaggerated, cartoonish features and strong, angular shapes, reminiscent of rotoscoped animation. The story is for a ${gender} child named ${name}, aged ${age_min} to ${age_max}. The image should depict: ${imageDescription}. The scene must show: ${backgroundStory}. The lighting should be intense and cinematic. Absolutely no text, words, or letters should be present in any part of the image.`,
          n: 1,
          quality: "standard",
          size: "1024x1024",
        });

        return image.data[0].url;
      } catch (error) {
        console.error("Error generating chapter image:", error);
        return null;
      }
    });

    const images = await Promise.all(imagePromises);
    return images.filter((url) => url !== null);
  }

  async generateCoverImage(storyData, gender, name) {
    const fullStoryText = storyData.chapters
      .map((chapter) => chapter.chapter_content)
      .join(" ");

    const prompt = `A dramatic, high-contrast cover illustration for a children's storybook featuring ${name}. The style is bold, with exaggerated, cartoonish features and strong, angular shapes, reminiscent of rotoscoped animation. The book is titled "${storyData.book_title}" and features ${name} as the main character. The story involves: ${fullStoryText.substring(0, 500)}... The image should be magical and joyful, designed for a ${gender} child. Focus on soft, cinematic lighting, vibrant colors, and a hand-drawn, peaceful atmosphere. Absolutely no text, words, or letters should be present in any part of the image.`;

    try {
      const coverImage = await this.openai.images.generate({
        model: "dall-e-3",
        response_format: "url",
        prompt,
        n: 1,
        quality: "hd",
        size: "1024x1024",
      });

      return coverImage.data[0].url;
    } catch (error) {
      console.error("Error generating cover image:", error);
      return null;
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
