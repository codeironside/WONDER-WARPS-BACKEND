import OpenAI from "openai";
import { config } from "@/config";
import ErrorHandler from "@/Error";

class StorybookGenerator {
  constructor() {
    const apiKey = config.openai.API_KEY;
    this.openai = new OpenAI({ apiKey });
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
    title = "Untitled Story",
  }) {
    let prompt = `${theme}:\nWrite a full, detailed children’s storybook with the following details:\n`;

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

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `You are a professional children's storyteller. You will write a fun, magical, and joyful story for a child aged ${age_min} to ${age_max}, the gender is ${gender}.

**Story Rules:**
* The story must have a clear beginning, middle, and end.
* It must be at least **three chapters** long, and 10 chapters at most.
* The tone should be similar to a whimsical Studio Ghibli film, full of imagination and wonder.
* The story must confirm to the age range

You will return the story as a single JSON object with the following format:
{
  "book_title": "The title of the book",
  "author": "${name}",
  "chapters": [
    {
      "chapter_title": "The title of chapter 1",
      "chapter_content": "The full content of chapter 1, formatted with Markdown.",
      "image_description": "A brief, vivid description for an illustration.",
      "image_position": "A description of the image's position (e.g., 'background' or 'full scene')"
    }
  ],
  "suggested_font": "Font name for the story"
}`,
          },
          {
            role: "user",
            content: `Using the details below, weave a captivating story with a magical adventure. Make sure the child feels like the protagonist.
            
            Details for the story:
            ${prompt}`,
          },
        ],
        max_tokens: 1500,
        temperature: 0.7,
      });

      const storyData = this.formatBookData(
        response.choices[0].message.content.trim(),
      );

      const images = await this.generateImagesForChapters(
        storyData.chapters,
        age_min,
        age_max,
        gender,
      );
      const coverImage = await this.generateCoverImage(storyData, gender);

      const storybookContent = this.addImagesToStory(storyData, images);

      return { ...storybookContent, coverImage, author: name, title };
    } catch (error) {
      console.error("Error generating story:", error);
      throw new ErrorHandler("Failed to generate the story.", 500);
    }
  }

  formatBookData(jsonString) {
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      console.error("Failed to parse JSON string:", error);
      return null;
    }
  }

  async generateImagesForChapters(chapters, age_min, age_max, gender) {
    const imagePromises = chapters.map(async (chapter) => {
      const imageDescription = chapter.image_description;
      const backgroundStory = chapter.chapter_content;

      const image = await this.openai.images.generate({
        model: "dall-e-3",
        response_format: "url",
        prompt: `A beautiful and whimsical children's story illustration in the style of Studio Ghibli, with no text, words, or lettering in the image. The story is for a ${gender} child, aged ${age_min} to ${age_max}. The image should depict a scene from this story: ${backgroundStory}. The main subject of the illustration is: ${imageDescription}. Focus on lush, hand-drawn nature, soft, magical lighting, and a sense of wonder. Absolutely no text, words, or letters should be present in any part of the image.`,
        n: 1,
        quality: "standard",
        size: "1024x1024",
      });

      return image.data[0].url;
    });

    return await Promise.all(imagePromises);
  }

  async generateCoverImage(storyData, gender) {
    console.log(gender);
    const fullStoryText = storyData.chapters
      .map((chapter) => chapter.chapter_content)
      .join(" ");

    const prompt = `A beautiful and whimsical children's book illustration in the enchanting style of Studio Ghibli, with no text, words, or lettering in the image. The book is titled "${storyData.book_title}" and the story is about ${fullStoryText}. The image should be magical and joyful, designed for a ${gender} child aged ${storyData.age_min} to ${storyData.age_max}. Focus on soft, cinematic lighting, vibrant colors, and a hand-drawn, peaceful atmosphere. Absolutely no text, words, or letters should be present in any part of the image.`;

    const coverImage = await this.openai.images.generate({
      model: "dall-e-3",
      response_format: "url",
      prompt,
      n: 1,
      quality: "hd",
      size: "1024x1024",
    });

    return coverImage.data[0].url;
  }

  addImagesToStory(storyData, imageUrls) {
    storyData.chapters.forEach((chapter, index) => {
      chapter.image_url = imageUrls[index];
    });
    return storyData;
  }
}

export default StorybookGenerator;
