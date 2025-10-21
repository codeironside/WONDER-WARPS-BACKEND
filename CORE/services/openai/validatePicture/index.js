import OpenAI from "openai";
import { config } from "../../../utils/config/index.js";
import ErrorHandler from "../../../middleware/errorhandler/index.js";
import S3Service from "../../s3/index.js";
import sharp from "sharp";

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
        safetyChecks = true,
        enhanceImage = true,
      } = options;

      // Enhanced analysis with better consistency
      const { analysis, characteristics } =
        await this.comprehensiveImageAnalysis(imageUrl);

      const validationResult = this.validateAnalysisResults(analysis, {
        minAge,
        maxAge,
        requireSinglePerson,
        requireClearFace,
        allowedGenders,
        maxPeople,
        safetyChecks,
      });

      if (!validationResult.isValid) {
        throw new ErrorHandler(validationResult.reason, 400);
      }

      const dataQuality = this.assessDataQuality(characteristics, analysis);

      // Enhanced image if requested
      let enhancedImageUrl = imageUrl;
      if (enhanceImage && dataQuality.overallConfidence !== "high") {
        try {
          enhancedImageUrl = await this.enhanceImageWithAI(
            imageUrl,
            dataQuality.recommendations,
          );
        } catch (enhanceError) {
          console.warn(
            "Image enhancement failed, using original:",
            enhanceError.message,
          );
        }
      }

      return {
        isValid: true,
        analysis: {
          ...analysis,
          characteristics,
          dataQuality,
        },
        message: "Image is suitable for personalization",
        warnings: dataQuality.warnings,
        recommendations: dataQuality.recommendations,
        enhancedImageUrl:
          enhancedImageUrl !== imageUrl ? enhancedImageUrl : undefined,
      };
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler(`Image validation failed: ${error.message}`, 500);
    }
  }

  async comprehensiveImageAnalysis(imageUrl) {
    try {
      // Single API call for consistent analysis
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this image comprehensively for children's book personalization. Provide a JSON response with this exact structure:

{
  "analysis": {
    "contains_human": boolean,
    "is_child": boolean,
    "estimated_age": number,
    "age_confidence": "high" | "medium" | "low",
    "gender": "male" | "female" | "unknown",
    "gender_confidence": "high" | "medium" | "low",
    "face_visible": boolean,
    "face_clear": boolean,
    "face_confidence": "high" | "medium" | "low",
    "number_of_people": number,
    "image_quality": "excellent" | "good" | "fair" | "poor",
    "lighting_conditions": "excellent" | "good" | "adequate" | "poor",
    "focus_quality": "excellent" | "good" | "adequate" | "poor",
    "safety_concerns": array of strings,
    "suitable_for_personalization": boolean
  },
  "characteristics": {
    "skin_tone": { "value": string, "confidence": "high" | "medium" | "low", "reason": string },
    "hair_type": { "value": string, "confidence": "high" | "medium" | "low", "reason": string },
    "hairstyle": { "value": string, "confidence": "high" | "medium" | "low", "reason": string },
    "hair_color": { "value": string, "confidence": "high" | "medium" | "low", "reason": string },
    "eye_color": { "value": string, "confidence": "high" | "medium" | "low", "reason": string },
    "facial_features": { "values": array of strings, "confidence": "high" | "medium" | "low", "reason": string },
    "clothing": { "value": string, "confidence": "high" | "medium" | "low", "reason": string },
    "overall_appearance": string
  },
  "confidence_summary": {
    "overall_confidence": "high" | "medium" | "low",
    "primary_strengths": array of strings,
    "primary_concerns": array of strings,
    "recommendations": array of strings
  }
}

CRITICAL: Be consistent in your confidence assessments across both analysis and characteristics.
For personalization purposes, consider these priorities:
1. Face clarity and visibility (most important)
2. Hair style and color
3. Skin tone
4. Eye color
5. Clothing

Return ONLY the JSON object, no other text.`,
              },
              {
                type: "image_url",
                image_url: { url: imageUrl },
              },
            ],
          },
        ],
        max_tokens: 1200,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0].message.content.trim();
      let jsonContent = content;

      if (jsonContent.startsWith("```json")) {
        jsonContent = jsonContent
          .replace(/```json\s*/, "")
          .replace(/\s*```$/, "");
      } else if (jsonContent.startsWith("```")) {
        jsonContent = jsonContent.replace(/```\s*/, "").replace(/\s*```$/, "");
      }

      const comprehensiveAnalysis = JSON.parse(jsonContent);

      return {
        analysis: comprehensiveAnalysis.analysis,
        characteristics: comprehensiveAnalysis.characteristics,
        confidenceSummary: comprehensiveAnalysis.confidence_summary,
      };
    } catch (error) {
      console.error("Error in comprehensive image analysis:", error);
      throw new Error("Failed to analyze image");
    }
  }

  async enhanceImageWithAI(imageUrl, recommendations = []) {
    try {
      // Use GPT to analyze what enhancements are needed
      const enhancementPlan = await this.analyzeEnhancementNeeds(
        imageUrl,
        recommendations,
      );

      // For now, we'll use basic sharp enhancements based on the analysis
      // In a production system, you might use more advanced AI image enhancement services
      const enhancedBuffer = await this.applyBasicEnhancements(
        imageUrl,
        enhancementPlan,
      );

      const enhancedKey = this.generateImageKey(
        "enhanced-images",
        `enhanced-${Date.now()}.jpg`,
      );

      return await this.s3Service.uploadBuffer(
        enhancedBuffer,
        enhancedKey,
        "image/jpeg",
      );
    } catch (error) {
      console.error("Error enhancing image:", error);
      throw new Error("Image enhancement failed");
    }
  }

  async analyzeEnhancementNeeds(imageUrl, recommendations) {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this image and suggest specific enhancements for better children's book personalization. Consider these recommendations: ${recommendations.join(", ")}. 

Return a JSON with enhancement suggestions focusing on:
- brightness/contrast adjustments
- sharpness/clarity improvements
- color corrections
- cropping suggestions

Return ONLY JSON, no other text.`,
              },
              {
                type: "image_url",
                image_url: { url: imageUrl },
              },
            ],
          },
        ],
        max_tokens: 500,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0].message.content.trim();
      let jsonContent = content;

      if (jsonContent.startsWith("```json")) {
        jsonContent = jsonContent
          .replace(/```json\s*/, "")
          .replace(/\s*```$/, "");
      } else if (jsonContent.startsWith("```")) {
        jsonContent = jsonContent.replace(/```\s*/, "").replace(/\s*```$/, "");
      }

      return JSON.parse(jsonContent);
    } catch (error) {
      console.error("Error analyzing enhancement needs:", error);
      return { needs_brightness: true, needs_sharpness: true };
    }
  }

  async applyBasicEnhancements(imageUrl, enhancementPlan) {
    try {
      // Fetch the image
      const response = await fetch(imageUrl);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      let sharpImage = sharp(buffer);

      // Apply enhancements based on the plan
      if (enhancementPlan.needs_brightness) {
        sharpImage = sharpImage.modulate({ brightness: 1.1, saturation: 1.05 });
      }

      if (enhancementPlan.needs_sharpness) {
        sharpImage = sharpImage.sharpen();
      }

      if (enhancementPlan.needs_contrast) {
        sharpImage = sharpImage.linear(1.1, -0.1 * 255); // Increase contrast
      }

      // Always ensure good quality for personalization
      sharpImage = sharpImage
        .jpeg({ quality: 90, mozjpeg: true })
        .withMetadata();

      return await sharpImage.toBuffer();
    } catch (error) {
      console.error("Error applying basic enhancements:", error);
      throw error;
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
      safetyChecks,
    } = criteria;

    if (!analysis.contains_human) {
      return {
        isValid: false,
        reason:
          "No human detected in the image. Please upload a photo of a child.",
        recommendation:
          "Use a clear photo showing a child's face for best personalization results.",
      };
    }

    if (!analysis.is_child) {
      return {
        isValid: false,
        reason:
          "The person in the image does not appear to be a child. Please upload a photo of a child.",
        recommendation:
          "Choose a photo where the child is clearly between 2-12 years old for age-appropriate stories.",
      };
    }

    if (analysis.estimated_age !== null) {
      if (analysis.estimated_age < minAge || analysis.estimated_age > maxAge) {
        return {
          isValid: false,
          reason: `The child appears to be ${analysis.estimated_age} years old, which is outside the allowed range (${minAge}-${maxAge} years).`,
          recommendation: `Please upload a photo of a child between ${minAge} and ${maxAge} years old.`,
        };
      }
    }

    if (requireSinglePerson && analysis.number_of_people > maxPeople) {
      return {
        isValid: false,
        reason: `Multiple people detected. Please upload a photo with only one child.`,
        recommendation:
          "Crop the image to show only the child, or use a different photo with just one child for accurate personalization.",
      };
    }

    if (requireClearFace && (!analysis.face_visible || !analysis.face_clear)) {
      return {
        isValid: false,
        reason:
          "Child's face is not clearly visible. Please upload a photo where the child's face is clear and unobstructed.",
        recommendation:
          "Use a front-facing photo with good lighting where the child's facial features, hair, and eyes are clearly visible.",
      };
    }

    if (
      analysis.gender &&
      !allowedGenders.includes(analysis.gender) &&
      analysis.gender !== "unknown"
    ) {
      return {
        isValid: false,
        reason: `Gender identification doesn't match allowed values.`,
        recommendation:
          "Please ensure the child's appearance in the photo clearly indicates their gender for accurate story personalization.",
      };
    }

    if (analysis.image_quality === "poor") {
      return {
        isValid: false,
        reason: "Image quality is too poor for accurate personalization.",
        recommendation:
          "Use a high-quality, well-lit photo with clear details. Avoid blurry, dark, or pixelated images.",
      };
    }

    if (
      safetyChecks &&
      analysis.safety_concerns &&
      analysis.safety_concerns.length > 0
    ) {
      return {
        isValid: false,
        reason: "Safety concerns detected in the image.",
        recommendation:
          "Please use a different photo that shows the child in a safe, appropriate setting without concerning elements.",
      };
    }

    if (!analysis.suitable_for_personalization) {
      return {
        isValid: false,
        reason:
          analysis.rejection_reason ||
          "Image is not suitable for personalization.",
        recommendation:
          "Choose a clear, well-lit photo of the child looking towards the camera with visible facial features.",
      };
    }

    return {
      isValid: true,
      reason: "Image passed all validation checks",
    };
  }

  assessDataQuality(characteristics, analysis) {
    const warnings = [];
    const recommendations = [];

    // Use the confidence summary from comprehensive analysis if available
    let overallConfidence = "high";

    // Check critical factors for personalization
    const criticalFactors = [
      {
        key: "face_confidence",
        value: analysis.face_confidence,
        name: "Face clarity",
      },
      {
        key: "hair_type_confidence",
        value: characteristics.hair_type?.confidence,
        name: "Hair type",
      },
      {
        key: "skin_tone_confidence",
        value: characteristics.skin_tone?.confidence,
        name: "Skin tone",
      },
    ];

    const lowConfidenceCritical = criticalFactors.filter(
      (factor) => factor.value === "low",
    );

    const mediumConfidenceFactors = criticalFactors.filter(
      (factor) => factor.value === "medium",
    );

    if (lowConfidenceCritical.length > 0) {
      overallConfidence = "low";
      warnings.push(
        `Low confidence in critical features: ${lowConfidenceCritical.map((f) => f.name).join(", ")}. Personalization accuracy may be significantly affected.`,
      );
    } else if (mediumConfidenceFactors.length >= 2) {
      overallConfidence = "medium";
      warnings.push(
        `Medium confidence in multiple features: ${mediumConfidenceFactors.map((f) => f.name).join(", ")}. Personalization may have some inaccuracies.`,
      );
    }

    // Check image quality factors
    if (
      analysis.image_quality === "fair" ||
      analysis.lighting_conditions === "adequate"
    ) {
      if (overallConfidence === "high") overallConfidence = "medium";
      warnings.push(
        "Image quality could be improved for better personalization accuracy.",
      );
      recommendations.push(
        "Consider using a photo with better lighting and clarity.",
      );
    }

    if (analysis.lighting_conditions === "poor") {
      overallConfidence = "medium";
      warnings.push("Poor lighting may affect personalization accuracy.");
      recommendations.push(
        "Use a photo taken in natural light or well-lit environment.",
      );
    }

    // Add specific recommendations based on characteristics
    if (characteristics.eye_color?.confidence === "medium") {
      warnings.push(
        "Eye color confidence is medium. Color may not be accurately represented.",
      );
      recommendations.push(
        "For accurate eye color, use a photo with clear, well-lit eyes.",
      );
    }

    if (characteristics.clothing?.confidence === "medium") {
      warnings.push("Clothing details are partially visible.");
      recommendations.push(
        "Full-body photos help with accurate clothing representation.",
      );
    }

    // Only show high-stakes warnings for low confidence
    if (overallConfidence === "low") {
      warnings.push(
        "IMPORTANT: Using this image may result in inaccurate personalization. The AI-generated illustrations may not properly represent the child's actual appearance.",
      );
      recommendations.push(
        "For best results, use a high-quality, front-facing photo with clear visibility of hair, eyes, and facial features.",
      );
    }

    return {
      overallConfidence,
      warnings,
      recommendations,
      canProceed: overallConfidence !== "low",
      // Add detailed confidence breakdown for debugging
      confidenceBreakdown: {
        face: analysis.face_confidence,
        lighting: analysis.lighting_conditions,
        imageQuality: analysis.image_quality,
        characteristics: Object.fromEntries(
          Object.entries(characteristics).map(([key, value]) => [
            key,
            value?.confidence || "unknown",
          ]),
        ),
      },
    };
  }

  // ... rest of the existing methods (generateImageKey, uploadFileToS3, deleteFileFromS3, validateAndUploadImage, getValidationCriteria, getIdealImageSpecifications) remain the same
  generateImageKey(prefix, filename) {
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const fileExtension = filename.split(".").pop();
    return `${prefix}/${timestamp}-${randomString}.${fileExtension}`;
  }

  async uploadFileToS3(file, s3Key) {
    try {
      return await this.s3Service.uploadBuffer(
        file.buffer,
        s3Key,
        file.mimetype,
      );
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
        { ...options, enhanceImage: true }, // Enable enhancement by default
      );

      if (!validationResult.isValid) {
        await this.deleteFileFromS3(tempKey);
        throw new ErrorHandler(validationResult.reason, 400);
      }

      // Use enhanced image if available, otherwise use original
      const finalImageUrl = validationResult.enhancedImageUrl || tempUrl;

      const permanentKey = this.generateImageKey(
        `validated-photos/${userId}`,
        file.originalname,
      );

      // If we have an enhanced image, we need to download and re-upload it
      let permanentUrl;
      if (validationResult.enhancedImageUrl) {
        const enhancedResponse = await fetch(validationResult.enhancedImageUrl);
        const enhancedBuffer = await enhancedResponse.arrayBuffer();
        permanentUrl = await this.s3Service.uploadBuffer(
          Buffer.from(enhancedBuffer),
          permanentKey,
          "image/jpeg",
        );
      } else {
        permanentUrl = await this.uploadFileToS3(file, permanentKey);
      }

      await this.deleteFileFromS3(tempKey);

      return {
        imageUrl: permanentUrl,
        validation: validationResult,
        characteristics: validationResult.analysis.characteristics,
        dataQuality: validationResult.analysis.dataQuality,
        warnings: validationResult.warnings || [],
        recommendations: validationResult.recommendations || [],
        wasEnhanced: !!validationResult.enhancedImageUrl,
      };
    } catch (error) {
      if (tempKey) {
        await this.deleteFileFromS3(tempKey).catch(console.error);
      }
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler(
        `Image validation and upload failed: ${error.message}`,
        500,
      );
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
        safetyChecks: true,
        enhanceImage: true,
      },
      relaxed: {
        minAge: 0,
        maxAge: 18,
        requireSinglePerson: false,
        requireClearFace: false,
        allowedGenders: ["male", "female", "unknown"],
        maxPeople: 3,
        safetyChecks: true,
        enhanceImage: true,
      },
      strict: {
        minAge: 2,
        maxAge: 12,
        requireSinglePerson: true,
        requireClearFace: true,
        allowedGenders: ["male", "female"],
        maxPeople: 1,
        safetyChecks: true,
        enhanceImage: true,
      },
    };
  }

  getIdealImageSpecifications() {
    return {
      description: "Ideal photo for accurate personalization",
      specifications: [
        "Front-facing photo with child looking at camera",
        "Good natural lighting without shadows on face",
        "Clear visibility of hair style and color",
        "Visible eye color and facial features",
        "Neutral background without distractions",
        "No hats, sunglasses, or face coverings",
        "Recent photo that reflects current appearance",
        "High resolution (at least 500x500 pixels)",
        "JPEG or PNG format",
        "Single child in the photo",
      ],
      examples: [
        "School portrait style photos",
        "Well-lit indoor photos against plain background",
        "Outdoor photos in daylight without harsh shadows",
      ],
    };
  }
}

export default ImageValidator;
