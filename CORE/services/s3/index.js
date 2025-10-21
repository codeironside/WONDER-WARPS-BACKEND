import OpenAI from "openai";
import { config } from "../../utils/config/index.js";
import ErrorHandler from "../../middleware/errorhandler/index.js";
import S3Service from "../s3/index.js";

class ImageValidator {
  constructor() {
    const apiKey = config.openai.API_KEY;
    if (!apiKey) {
      throw new ErrorHandler("OpenAI API key is required", 500);
    }

    this.openai = new OpenAI({ apiKey });
    this.s3Service = new S3Service();
  }

  async validateImageForPersonalization(imageUrl, options = {}) {
    try {
      const {
        minAge = 0,
        maxAge = 18,
        requireSinglePerson = true,
        requireClearFace = true,
        allowedGenders = ["male", "female"],
        maxPeople = 1,
      } = options;

      const analysis = await this.analyzeImageWithGPT(imageUrl);

      const validationResult = this.validateAnalysisResults(analysis, {
        minAge,
        maxAge,
        requireSinglePerson,
        requireClearFace,
        allowedGenders,
        maxPeople,
      });

      if (!validationResult.isValid) {
        throw new ErrorHandler(validationResult.reason, 400);
      }

      const characteristics = await this.extractCharacteristicsWithGPT(imageUrl);

      return {
        isValid: true,
        analysis: {
          ...analysis,
          characteristics,
        },
        message: "Image is suitable for personalization",
      };
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler(`Image validation failed: ${error.message}`, 500);
    }
  }

  async analyzeImageWithGPT(imageUrl) {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this image for children's book personalization. Provide a JSON response with this exact structure:

{
  "contains_human": boolean,
  "is_child": boolean,
  "estimated_age": number or null,
  "gender": "male" | "female" | "unknown" | null,
  "face_visible": boolean,
  "face_clear": boolean,
  "number_of_people": number,
  "image_quality": "excellent" | "good" | "fair" | "poor",
  "suitable_for_personalization": boolean,
  "rejection_reason": string or null
}

Return ONLY the JSON object, no other text.`,
              },
              {
                type: "image_url",
                image_url: { url: imageUrl },
              },
            ],
          },
        ],
        max_tokens: 500,
      });

      const content = response.choices[0].message.content.trim();
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("Invalid response format from image analysis");
      }

      const analysis = JSON.parse(jsonMatch[0]);
      return analysis;
    } catch (error) {
      console.error("Error analyzing image with GPT:", error);
      throw new Error("Failed to analyze image");
    }
  }

  validateAnalysisResults(analysis, criteria) {
    const {
      minAge,
      maxAge,
      requireSinglePerson,
      requireClearFace,
      allowedGenders,
      maxPeople,
    } = criteria;

    if (!analysis.contains_human) {
      return {
        isValid: false,
        reason: "No human detected in the image. Please upload a photo of a child.",
      };
    }

    if (!analysis.is_child) {
      return {
        isValid: false,
        reason: "The person in the image does not appear to be a child. Please upload a photo of a child.",
      };
    }

    if (analysis.estimated_age !== null) {
      if (analysis.estimated_age < minAge || analysis.estimated_age > maxAge) {
        return {
          isValid: false,
          reason: `The child appears to be ${analysis.estimated_age} years old, which is outside the allowed range (${minAge}-${maxAge} years).`,
        };
      }
    }

    if (requireSinglePerson && analysis.number_of_people > maxPeople) {
      return {
        isValid: false,
        reason: `Multiple people detected. Please upload a photo with only one child.`,
      };
    }

    if (requireClearFace && (!analysis.face_visible || !analysis.face_clear)) {
      return {
        isValid: false,
        reason: "Child's face is not clearly visible. Please upload a photo where the child's face is clear and unobstructed.",
      };
    }

    if (analysis.gender && !allowedGenders.includes(analysis.gender) && analysis.gender !== "unknown") {
      return {
        isValid: false,
        reason: `Gender identification doesn't match allowed values.`,
      };
    }

    if (analysis.image_quality === "poor") {
      return {
        isValid: false,
        reason: "Image quality is too poor. Please upload a clear, well-lit photo.",
      };
    }

    if (!analysis.suitable_for_personalization) {
      return {
        isValid: false,
        reason: analysis.rejection_reason || "Image is not suitable for personalization.",
      };
    }

    return {
      isValid: true,
      reason: "Image passed all validation checks",
    };
  }

  async extractCharacteristicsWithGPT(imageUrl) {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Extract detailed physical characteristics for children's book illustration personalization. Provide a JSON response with this exact structure:

{
  "skin_tone": string,
  "hair_type": string,
  "hairstyle": string,
  "hair_color": string,
  "eye_color": string,
  "facial_features": array of strings,
  "clothing": string,
  "overall_appearance": string
}

Return ONLY the JSON object, no other text.`,
              },
              {
                type: "image_url",
                image_url: { url: imageUrl },
              },
            ],
          },
        ],
        max_tokens: 400,
      });

      const content = response.choices[0].message.content.trim();
      const jsonMatch = content.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        throw new Error("Invalid response format from characteristics extraction");
      }

      const characteristics = JSON.parse(jsonMatch[0]);
      return characteristics;
    } catch (error) {
      console.error("Error extracting characteristics with GPT:", error);
      return {
        skin_tone: "unknown",
        hair_type: "unknown",
        hairstyle: "unknown",
        hair_color: "unknown",
        eye_color: "unknown",
        facial_features: [],
        clothing: "unknown",
        overall_appearance: "A child with typical features",
      };
    }
  }

  generateImageKey(prefix, filename) {
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const fileExtension = filename.split('.').pop();
    return `${prefix}/${timestamp}-${randomString}.${fileExtension}`;
  }

  async uploadFileToS3(file, s3Key) {
    try {
      return await this.s3Service.uploadBuffer(file.buffer, s3Key, file.mimetype);
    } catch (error) {
      console.error("Error uploading file to S3:", error);
      throw new Error("Failed to upload file to S3");
    }
  }

  async deleteFileFromS3(s3Key) {
    try {
      return await this.s3Service.deleteImage(s3Key);
    } catch (error) {
      console.error("Error deleting file from S3:", error);
      throw new Error("Failed to delete file from S3");
    }
  }

  async validateAndUploadImage(file, userId, options = {}) {
    let tempKey = null;
    try {
      tempKey = this.generateImageKey(
        `validation-temp/${userId}`,
        file.originalname,
      );

      const tempUrl = await this.uploadFileToS3(file, tempKey);

      const validationResult = await this.validateImageForPersonalization(
        tempUrl,
        options,
      );

      if (!validationResult.isValid) {
        await this.deleteFileFromS3(tempKey);
        throw new ErrorHandler(validationResult.reason, 400);
      }

      const permanentKey = this.generateImageKey(
        `validated-photos/${userId}`,
        file.originalname,
      );

      const permanentUrl = await this.uploadFileToS3(file, permanentKey);

      await this.deleteFileFromS3(tempKey);

      return {
        imageUrl: permanentUrl,
        validation: validationResult,
        characteristics: validationResult.analysis.characteristics,
      };
    } catch (error) {
      if (tempKey) {
        await this.deleteFileFromS3(tempKey).catch(console.error);
      }
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler(`Image validation and upload failed: ${error.message}`, 500);
    }
  }

  getValidationCriteria() {
    return {
      default: {
        minAge: 0,
        maxAge: 18,
        requireSinglePerson: true,
        requireClearFace: true,
        allowedGenders: ["male", "female"],
        maxPeople: 1,
      },
      relaxed: {
        minAge: 0,
        maxAge: 18,
        requireSinglePerson: false,
        requireClearFace: false,
        allowedGenders: ["male", "female", "unknown"],
        maxPeople: 3,
      },
      strict: {
        minAge: 2,
        maxAge: 12,
        requireSinglePerson: true,
        requireClearFace: true,
        allowedGenders: ["male", "female"],
        maxPeople: 1,
      },
    };
  }
}

export default ImageValidator;