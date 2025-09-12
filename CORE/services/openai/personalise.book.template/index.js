import OpenAI from "openai";
import { config } from "@/config";
import ErrorHandler from "@/Error";
import BookTemplate from "../../../../API/BOOK_TEMPLATE/model/index.js";
import PersonalizedBook from "../../../../API/BOOK_TEMPLATE/personalise.book.model/PersonalizedBook.js";
import S3Service from "../../s3/index.js";

class StoryPersonalizer {
  constructor() {
    const apiKey = config.openai.API_KEY;
    if (!apiKey) {
      throw new ErrorHandler("OpenAI API key is required", 500);
    }

    this.openai = new OpenAI({ apiKey });
    this.s3Service = new S3Service();
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
      } = personalizationDetails;

      if (!templateId || !childName) {
        throw new ErrorHandler("Template ID and child name are required", 400);
      }

      // Fetch the template from the database
      const template = await BookTemplate.findByIdWithChapters(templateId);
      if (!template) {
        throw new ErrorHandler("Book template not found", 404);
      }

      if (!template.is_personalizable) {
        throw new ErrorHandler("This book template is not personalizable", 400);
      }

      // Personalize the story using OpenAI
      const personalizedStory = await this.rewriteStoryWithAI(
        template,
        personalizationDetails,
      );

      // Generate new images for the personalized story
      const images = await this.generatePersonalizedImages(
        template.chapters,
        personalizedStory.chapters,
        template.age_min,
        template.age_max,
        personalizationDetails,
      );

      // Generate a new cover image
      const coverImage = await this.generatePersonalizedCoverImage(
        personalizedStory,
        personalizationDetails,
      );

      // Add images to the personalized story
      const storybookContent = this.addImagesToStory(personalizedStory, images);

      return {
        ...storybookContent,
        cover_image: [coverImage],
        personalization_metadata: {
          personalized_for: childName,
          personalized_age: childAge,
          personalized_at: new Date().toISOString(),
          original_template_id: templateId,
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

  async rewriteStoryWithAI(template, personalizationDetails) {
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

    try {
      const storyContent = JSON.stringify({
        book_title: template.book_title,
        chapters: template.chapters,
      });

      const response = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `You are a helpful assistant that rewrites children's stories to personalize them for specific children.
            You will receive a story in JSON format and details about a child. Rewrite the story to feature this child as the main character,
            replacing all character details with the provided information while maintaining the exact same plot, structure, and chapter organization.
            
            Return the rewritten story as a valid JSON object with the same structure:
            
            {
              "book_title": "Personalized title featuring the child's name",
              "chapters": [
                {
                  "chapter_title": "Chapter title (may include child's name)",
                  "chapter_content": "Rewritten chapter content featuring the child",
                  "image_description": "Updated image description reflecting the child's appearance"
                }
              ]
            }
            
            Important: Keep the same number of chapters and the same basic plot. Only change character details.`,
          },
          {
            role: "user",
            content: `Original story: ${storyContent}
            
            Personalize this story for:
            - Name: ${childName}
            ${childAge ? `- Age: ${childAge}` : ""}
            ${skinTone ? `- Skin tone: ${skinTone}` : ""}
            ${hairType ? `- Hair type: ${hairType}` : ""}
            ${hairStyle ? `- Hairstyle: ${hairStyle}` : ""}
            ${hairColor ? `- Hair color: ${hairColor}` : ""}
            ${eyeColor ? `- Eye color: ${eyeColor}` : ""}
            ${clothing ? `- Clothing: ${clothing}` : ""}
            ${gender ? `- Gender: ${gender}` : ""}
            
            Please rewrite the story to feature ${childName} as the main character while keeping the same plot structure.`,
          },
        ],
        max_tokens: 3000,
        temperature: 0.7,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0].message.content.trim();
      const personalizedStory = JSON.parse(content);

      return {
        ...template,
        book_title: personalizedStory.book_title,
        chapters: personalizedStory.chapters,
        author: childName,
      };
    } catch (error) {
      console.error("Error rewriting story with AI:", error);
      throw new ErrorHandler("Failed to rewrite story with AI", 500);
    }
  }

  async generatePersonalizedImages(
    originalChapters,
    personalizedChapters,
    ageMin,
    ageMax,
    personalizationDetails,
  ) {
    const {
      skinTone,
      hairType,
      hairStyle,
      hairColor,
      eyeColor,
      clothing,
      gender,
      childName,
    } = personalizationDetails;

    const imagePromises = originalChapters.map(
      async (originalChapter, index) => {
        try {
          const prompt = this.createImagePrompt(
            originalChapter.image_description,
            personalizationDetails,
          );

          const image = await this.openai.images.generate({
            model: "dall-e-3",
            prompt: prompt,
            size: "1024x1024",
            quality: "standard",
            n: 1,
          });

          const imageUrl = image.data[0].url;

          // Upload to S3
          const s3Key = this.s3Service.generateImageKey(
            `personalized-books/${childName}/chapters`,
            imageUrl,
          );
          const s3Url = await this.s3Service.uploadImageFromUrl(
            imageUrl,
            s3Key,
          );

          return s3Url;
        } catch (error) {
          console.error(
            `Error generating personalized image for chapter ${index + 1}:`,
            error,
          );
          return originalChapter.image_url;
        }
      },
    );

    return Promise.all(imagePromises);
  }

  createImagePrompt(originalDescription, personalizationDetails) {
    const {
      childName,
      skinTone,
      hairType,
      hairStyle,
      hairColor,
      eyeColor,
      clothing,
      gender,
    } = personalizationDetails;

    return `Create a children's book illustration with NO TEXT of any kind. Maintain the same composition and style as the original scene but with these character changes:
    
    Original scene: ${originalDescription}
    
    New character details:
    - Name: ${childName}
    ${skinTone ? `- Skin tone: ${skinTone}` : ""}
    ${hairType ? `- Hair type: ${hairType}` : ""}
    ${hairStyle ? `- Hairstyle: ${hairStyle}` : ""}
    ${hairColor ? `- Hair color: ${hairColor}` : ""}
    ${eyeColor ? `- Eye color: ${eyeColor}` : ""}
    ${clothing ? `- Clothing: ${clothing}` : ""}
    ${gender ? `- Gender: ${gender}` : ""}
    
    Keep the same background, composition, and artistic style as the original illustration,A beautiful and whimsical children's book illustration in the enchanting style of Studio Ghibli. Only change the character's appearance to match the new details.
    Absolutely NO TEXT of any kind in the image.
    Style: Focus on soft, cinematic lighting, vibrant colors, and a hand-drawn, peaceful atmosphere. Absolutely no text, words, or letters should be present in any part of the image.`;
  }

  async generatePersonalizedCoverImage(storyData, personalizationDetails) {
    try {
      const { childName } = personalizationDetails;

      const prompt = `Create a children's book image with NO TEXT of any kind. Maintain the same composition and style as the original but with these character changes:
      
      Book title: "${storyData.book_title}"
      
      New character details:
      - Name: ${childName}
      ${personalizationDetails.skinTone ? `- Skin tone: ${personalizationDetails.skinTone}` : ""}
      ${personalizationDetails.hairType ? `- Hair type: ${personalizationDetails.hairType}` : ""}
      ${personalizationDetails.hairStyle ? `- Hairstyle: ${personalizationDetails.hairStyle}` : ""}
      ${personalizationDetails.hairColor ? `- Hair color: ${personalizationDetails.hairColor}` : ""}
      ${personalizationDetails.eyeColor ? `- Eye color: ${personalizationDetails.eyeColor}` : ""}
      ${personalizationDetails.clothing ? `- Clothing: ${personalizationDetails.clothing}` : ""}
      ${personalizationDetails.gender ? `- Gender: ${personalizationDetails.gender}` : ""}
      
      Keep the same background, composition, and artistic style as the original cover,A beautiful and whimsical children's book illustration in the enchanting style of Studio Ghibli. Only change the character's appearance to match the new details.
      Absolutely NO TEXT of any kind in the image.
      Style: Colorful, engaging, professional children's book, whimsical Studio Ghibli film, full of imagination and wonder`;

      const coverImage = await this.openai.images.generate({
        model: "dall-e-3",
        prompt: prompt,
        size: "1024x1024",
        quality: "hd",
        n: 1,
      });

      const imageUrl = coverImage.data[0].url;

      // Upload to S3
      const s3Key = this.s3Service.generateImageKey(
        `personalized-books/${childName}/covers`,
        imageUrl,
      );
      const s3Url = await this.s3Service.uploadImageFromUrl(imageUrl, s3Key);

      return s3Url;
    } catch (error) {
      console.error("Error generating personalized cover image:", error);
      return null;
    }
  }

  addImagesToStory(storyData, imageUrls) {
    const updatedChapters = storyData.chapters.map((chapter, index) => ({
      ...chapter,
      image_url: imageUrls[index] || "",
      image_position: chapter.image_position || "full scene",
    }));

    return {
      ...storyData,
      chapters: updatedChapters,
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
        console.log(`Increased popularity for template ${templateId}`);
      } catch (error) {
        console.error(
          `Failed to increment popularity for template ${templateId}:`,
          error,
        );
      }

      return {
        personalizedBook,
        price,
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
}

export default StoryPersonalizer;
