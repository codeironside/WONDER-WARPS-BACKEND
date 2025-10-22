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

    this.STANDARD_SPECS = {
      width: 1024,
      height: 1024,
      quality: 95,
      format: "jpeg",
      minFileSize: 50000,
      maxFileSize: 500000,
    };
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
        enhancementLevel = "aggressive",
      } = options;

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

      let enhancedImageUrl = imageUrl;
      let enhancementReport = null;

      if (enhanceImage && validationResult.isValid) {
        try {
          const enhancementResult = await this.enhanceImageForPersonalization(
            imageUrl,
            dataQuality,
            enhancementLevel,
          );
          enhancedImageUrl = enhancementResult.enhancedUrl;
          enhancementReport = enhancementResult.report;
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
        enhancementReport,
        standardSpecs: this.STANDARD_SPECS,
      };
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;

      // More specific error messages
      if (error.message.includes("Failed to analyze image")) {
        throw new ErrorHandler(
          "We couldn't analyze the image. Please try with a different photo that clearly shows the child's face.",
          400,
        );
      }

      throw new ErrorHandler(`Image validation failed: ${error.message}`, 500);
    }
  }

  async enhanceImageForPersonalization(
    imageUrl,
    dataQuality,
    enhancementLevel = "aggressive",
  ) {
    try {
      console.log(
        `Enhancing image for personalization with ${enhancementLevel} settings...`,
      );

      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch image: ${response.status} ${response.statusText}`,
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      const originalBuffer = Buffer.from(arrayBuffer);

      const originalMetadata = await sharp(originalBuffer).metadata();

      const enhancementPipeline = this.createEnhancementPipeline(
        dataQuality,
        enhancementLevel,
      );

      let sharpInstance = sharp(originalBuffer);

      // Apply each enhancement in the pipeline
      for (const enhancement of enhancementPipeline) {
        sharpInstance = enhancement.fn(sharpInstance);
      }

      const enhancedBuffer = await sharpInstance
        .resize(this.STANDARD_SPECS.width, this.STANDARD_SPECS.height, {
          fit: "cover",
          position: "center",
          withoutEnlargement: false,
        })
        .jpeg({
          quality: this.STANDARD_SPECS.quality,
          mozjpeg: true,
          chromaSubsampling: "4:4:4",
        })
        .toBuffer();

      await this.validateEnhancedImage(enhancedBuffer);

      const enhancedKey = this.generateImageKey(
        "enhanced-personalization",
        `enhanced-${Date.now()}.jpg`,
      );

      const enhancedUrl = await this.s3Service.uploadBuffer(
        enhancedBuffer,
        enhancedKey,
        "image/jpeg",
      );

      const report = {
        originalSize: originalBuffer.length,
        enhancedSize: enhancedBuffer.length,
        originalDimensions: {
          width: originalMetadata.width,
          height: originalMetadata.height,
        },
        enhancedDimensions: {
          width: this.STANDARD_SPECS.width,
          height: this.STANDARD_SPECS.height,
        },
        enhancementLevel,
        appliedEnhancements: enhancementPipeline.map((enh) => enh.name),
        qualityImprovement: this.calculateQualityImprovement(
          originalBuffer,
          enhancedBuffer,
          dataQuality,
        ),
      };

      console.log("Image enhancement completed:", report);

      return {
        enhancedUrl,
        report,
      };
    } catch (error) {
      console.error("Error enhancing image for personalization:", error);
      throw new Error(`Image enhancement failed: ${error.message}`);
    }
  }

  createEnhancementPipeline(dataQuality, enhancementLevel) {
    const pipeline = [];

    pipeline.push(
      this.enhanceClarityAndSharpness(enhancementLevel),
      this.enhanceColors(enhancementLevel),
      this.enhanceExposure(enhancementLevel),
    );

    if (
      dataQuality.warnings.some(
        (w) => w.includes("lighting") || w.includes("dark"),
      )
    ) {
      pipeline.push(this.enhanceLighting(enhancementLevel));
    }

    if (
      dataQuality.warnings.some(
        (w) => w.includes("blur") || w.includes("focus"),
      )
    ) {
      pipeline.push(this.enhanceFocus(enhancementLevel));
    }

    if (
      dataQuality.warnings.some(
        (w) => w.includes("color") || w.includes("saturation"),
      )
    ) {
      pipeline.push(this.enhanceVibrance(enhancementLevel));
    }

    pipeline.push(this.finalQualityPass(enhancementLevel));

    return pipeline;
  }

  enhanceClarityAndSharpness(level) {
    const fn = (image) => {
      if (level === "aggressive") {
        return image
          .sharpen({
            sigma: 2.5,
            m1: 1.5,
            m2: 0.9,
          })
          .sharpen({
            sigma: 1.0,
            m1: 1.0,
            m2: 0.3,
          });
      } else {
        return image.sharpen({ sigma: 1.5, m1: 1, m2: 0.5 });
      }
    };
    return { name: "clarity_and_sharpness", fn };
  }

  enhanceColors(level) {
    const fn = (image) => {
      if (level === "aggressive") {
        return image
          .modulate({
            brightness: 1.1,
            saturation: 1.4,
            hue: 0,
          })
          .gamma(1.1)
          .linear(1.2, -(0.1 * 255));
      } else {
        return image
          .modulate({
            brightness: 1.05,
            saturation: 1.2,
            hue: 0,
          })
          .gamma(1.05);
      }
    };
    return { name: "color_enhancement", fn };
  }

  enhanceExposure(level) {
    const fn = (image) => {
      if (level === "aggressive") {
        return image
          .normalise()
          .linear(1.3, -(0.15 * 255))
          .modulate({ brightness: 1.15 });
      } else {
        return image.normalise().linear(1.1, -(0.05 * 255));
      }
    };
    return { name: "exposure_enhancement", fn };
  }

  enhanceLighting(level) {
    const fn = (image) => {
      if (level === "aggressive") {
        return image
          .modulate({ brightness: 1.25 })
          .gamma(1.3)
          .linear(1.4, -(0.2 * 255));
      } else {
        return image.modulate({ brightness: 1.15 }).gamma(1.15);
      }
    };
    return { name: "lighting_enhancement", fn };
  }

  enhanceFocus(level) {
    const fn = (image) => {
      if (level === "aggressive") {
        return image
          .sharpen({ sigma: 3, m1: 2, m2: 1 })
          .sharpen({ sigma: 1.5, m1: 1.5, m2: 0.7 });
      } else {
        return image.sharpen({ sigma: 2, m1: 1.5, m2: 0.7 });
      }
    };
    return { name: "focus_enhancement", fn };
  }

  enhanceVibrance(level) {
    const fn = (image) => {
      if (level === "aggressive") {
        return image.modulate({ saturation: 1.6 }).linear(1.25, -(0.1 * 255));
      } else {
        return image.modulate({ saturation: 1.3 });
      }
    };
    return { name: "vibrance_enhancement", fn };
  }

  finalQualityPass(level) {
    const fn = (image) => {
      if (level === "aggressive") {
        return image
          .median(1)
          .sharpen({ sigma: 1, m1: 1, m2: 0.3 })
          .modulate({ brightness: 1.02, saturation: 1.05 });
      } else {
        return image.median(1).sharpen({ sigma: 0.8, m1: 0.8, m2: 0.2 });
      }
    };
    return { name: "final_quality_pass", fn };
  }

  async validateEnhancedImage(enhancedBuffer) {
    const metadata = await sharp(enhancedBuffer).metadata();

    if (
      metadata.width !== this.STANDARD_SPECS.width ||
      metadata.height !== this.STANDARD_SPECS.height
    ) {
      throw new Error(
        `Enhanced image dimensions ${metadata.width}x${metadata.height} do not meet standard ${this.STANDARD_SPECS.width}x${this.STANDARD_SPECS.height}`,
      );
    }

    if (enhancedBuffer.length < this.STANDARD_SPECS.minFileSize) {
      throw new Error(
        `Enhanced image file size ${enhancedBuffer.length} is below minimum ${this.STANDARD_SPECS.minFileSize}`,
      );
    }

    if (enhancedBuffer.length > this.STANDARD_SPECS.maxFileSize) {
      throw new Error(
        `Enhanced image file size ${enhancedBuffer.length} exceeds maximum ${this.STANDARD_SPECS.maxFileSize}`,
      );
    }

    if (metadata.format !== "jpeg") {
      throw new Error(`Enhanced image format ${metadata.format} is not JPEG`);
    }
  }

  calculateQualityImprovement(originalBuffer, enhancedBuffer, dataQuality) {
    const originalSize = originalBuffer.length;
    const enhancedSize = enhancedBuffer.length;

    let improvementScore = 0;

    const sizeRatio =
      Math.min(enhancedSize, this.STANDARD_SPECS.maxFileSize) /
      Math.max(originalSize, this.STANDARD_SPECS.minFileSize);
    improvementScore += Math.min(sizeRatio, 1) * 25;

    const qualityIssues = dataQuality.warnings.length;
    const estimatedImprovement = (Math.max(0, 3 - qualityIssues) / 3) * 75;
    improvementScore += estimatedImprovement;

    return Math.min(Math.round(improvementScore), 100);
  }

  async comprehensiveImageAnalysis(imageUrl) {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this image comprehensively for children's book personalization. Focus on clarity, brightness, and features needed for accurate AI personalization.

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
    "brightness_level": "excellent" | "good" | "adequate" | "poor",
    "clarity_level": "excellent" | "good" | "adequate" | "poor",
    "focus_quality": "excellent" | "good" | "adequate" | "poor",
    "color_accuracy": "excellent" | "good" | "adequate" | "poor",
    "safety_concerns": array of strings,
    "suitable_for_personalization": boolean,
    "enhancement_needed": boolean,
    "enhancement_priority": "high" | "medium" | "low"
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
  "enhancement_recommendations": {
    "brightness_improvement": boolean,
    "clarity_improvement": boolean,
    "color_correction": boolean,
    "sharpness_boost": boolean,
    "contrast_adjustment": boolean,
    "specific_suggestions": array of strings
  }
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
        max_tokens: 1500,
        response_format: { type: "json_object" },
      });

      // Check if response has content
      if (
        !response.choices ||
        !response.choices[0] ||
        !response.choices[0].message ||
        !response.choices[0].message.content
      ) {
        console.error("OpenAI API returned empty response:", response);
        throw new Error(
          "OpenAI API returned an empty response. The image may be too small, corrupted, or unprocessable.",
        );
      }

      const content = response.choices[0].message.content.trim();

      if (!content) {
        throw new Error(
          "OpenAI API returned empty content. The image may be unprocessable.",
        );
      }

      let jsonContent = content;

      // Handle code block formatting
      if (jsonContent.startsWith("```json")) {
        jsonContent = jsonContent
          .replace(/```json\s*/, "")
          .replace(/\s*```$/, "");
      } else if (jsonContent.startsWith("```")) {
        jsonContent = jsonContent.replace(/```\s*/, "").replace(/\s*```$/, "");
      }

      // Parse and validate the JSON response
      let comprehensiveAnalysis;
      try {
        comprehensiveAnalysis = JSON.parse(jsonContent);
      } catch (parseError) {
        console.error("Failed to parse OpenAI response as JSON:", jsonContent);
        throw new Error(
          "OpenAI response was not valid JSON. Please try again with a different image.",
        );
      }

      // Validate required structure
      if (
        !comprehensiveAnalysis.analysis ||
        !comprehensiveAnalysis.characteristics
      ) {
        console.error(
          "OpenAI response missing required fields:",
          comprehensiveAnalysis,
        );
        throw new Error("OpenAI response missing required analysis fields.");
      }

      return {
        analysis: comprehensiveAnalysis.analysis,
        characteristics: comprehensiveAnalysis.characteristics,
        enhancementRecommendations:
          comprehensiveAnalysis.enhancement_recommendations,
      };
    } catch (error) {
      console.error("Error in comprehensive image analysis:", error);

      // Provide more specific error messages
      if (
        error.message.includes("empty response") ||
        error.message.includes("empty content")
      ) {
        throw new Error(
          "The image could not be processed. Please ensure the image is clear, properly formatted, and shows a recognizable subject.",
        );
      }

      if (error.message.includes("invalid image")) {
        throw new Error(
          "The image appears to be corrupted or in an unsupported format. Please try with a different image file.",
        );
      }

      if (error.message.includes("rate limit")) {
        throw new Error(
          "OpenAI API rate limit exceeded. Please try again in a moment.",
        );
      }

      throw new Error(`Failed to analyze image: ${error.message}`);
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
    let overallConfidence = "high";

    const qualityFactors = [
      {
        key: "brightness_level",
        value: analysis.brightness_level,
        threshold: "good",
        name: "Brightness",
      },
      {
        key: "clarity_level",
        value: analysis.clarity_level,
        threshold: "good",
        name: "Clarity",
      },
      {
        key: "focus_quality",
        value: analysis.focus_quality,
        threshold: "good",
        name: "Focus",
      },
      {
        key: "color_accuracy",
        value: analysis.color_accuracy,
        threshold: "good",
        name: "Color Accuracy",
      },
      {
        key: "face_confidence",
        value: analysis.face_confidence,
        threshold: "high",
        name: "Face Clarity",
      },
    ];

    const poorQualityFactors = qualityFactors.filter(
      (factor) =>
        this.qualityToScore(factor.value) <
        this.qualityToScore(factor.threshold),
    );

    if (poorQualityFactors.length > 2) {
      overallConfidence = "low";
      warnings.push(
        `Multiple quality issues detected: ${poorQualityFactors.map((f) => f.name).join(", ")}. Image enhancement recommended.`,
      );
    } else if (poorQualityFactors.length > 0) {
      overallConfidence = "medium";
      warnings.push(
        `Some quality issues: ${poorQualityFactors.map((f) => f.name).join(", ")}. Automatic enhancement will be applied.`,
      );
    }

    if (analysis.enhancement_needed) {
      if (overallConfidence === "high") overallConfidence = "medium";
      warnings.push(
        "AI recommends image enhancement for better personalization results.",
      );
      recommendations.push(
        "Image will be automatically enhanced to meet personalization standards.",
      );
    }

    const criticalCharacteristics = [
      "skin_tone",
      "hair_type",
      "hairstyle",
      "hair_color",
    ];
    const lowConfidenceChars = criticalCharacteristics.filter(
      (char) => characteristics[char]?.confidence === "low",
    );

    if (lowConfidenceChars.length > 1) {
      overallConfidence = "medium";
      warnings.push(
        `Low confidence in characteristics: ${lowConfidenceChars.join(", ")}. Enhancement may improve accuracy.`,
      );
    }

    if (overallConfidence === "high") {
      recommendations.push(
        "Image meets personalization standards. No enhancement needed.",
      );
    } else {
      recommendations.push(
        "Image will be automatically enhanced to 1024x1024 with improved clarity, brightness, and color accuracy.",
      );
      recommendations.push(
        "Enhanced image will be optimized for AI personalization algorithms.",
      );
    }

    return {
      overallConfidence,
      warnings,
      recommendations,
      canProceed: true,
      qualityScore: this.calculateOverallQualityScore(
        analysis,
        characteristics,
      ),
      enhancementPriority: analysis.enhancement_priority || "medium",
    };
  }

  qualityToScore(quality) {
    const scores = { excellent: 4, good: 3, adequate: 2, poor: 1 };
    return scores[quality] || 2;
  }

  calculateOverallQualityScore(analysis, characteristics) {
    let score = 0;
    let totalFactors = 0;

    const analysisFactors = [
      "image_quality",
      "lighting_conditions",
      "brightness_level",
      "clarity_level",
      "focus_quality",
      "color_accuracy",
    ];
    analysisFactors.forEach((factor) => {
      score += this.qualityToScore(analysis[factor]);
      totalFactors++;
    });

    Object.values(characteristics).forEach((char) => {
      if (char && char.confidence) {
        const confidenceScore =
          { high: 4, medium: 3, low: 2 }[char.confidence] || 2;
        score += confidenceScore;
        totalFactors++;
      }
    });

    return totalFactors > 0
      ? Math.round((score / (totalFactors * 4)) * 100)
      : 0;
  }

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
      // Add file size validation
      if (file.size < 10000) {
        // 10KB minimum
        throw new ErrorHandler(
          "Image file is too small. Please upload a higher quality image (at least 10KB).",
          400,
        );
      }

      tempKey = this.generateImageKey(
        `validation-temp/${userId}`,
        file.originalname,
      );

      const tempUrl = await this.uploadFileToS3(file, tempKey);

      const validationResult = await this.validateImageForPersonalization(
        tempUrl,
        {
          ...options,
          enhanceImage: true,
          enhancementLevel: "aggressive",
        },
      );

      if (!validationResult.isValid) {
        await this.deleteFileFromS3(tempKey);
        throw new ErrorHandler(validationResult.reason, 400);
      }

      const finalImageUrl = validationResult.enhancedImageUrl || tempUrl;

      const permanentKey = this.generateImageKey(
        `validated-photos/${userId}`,
        `personalization-ready-${Date.now()}.jpg`,
      );

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
        enhancementReport: validationResult.enhancementReport,
        standardSpecs: validationResult.standardSpecs,
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
        enhancementLevel: "aggressive",
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
        enhancementLevel: "aggressive",
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
        enhancementLevel: "aggressive",
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

  getPersonalizationStandards() {
    return {
      ...this.STANDARD_SPECS,
      enhancementGuarantees: [
        "Standardized 1024x1024 dimensions",
        "Enhanced brightness and clarity",
        "Improved color accuracy",
        "Sharpened focus and details",
        "Optimized for AI personalization",
        "Consistent quality across all images",
      ],
      benefits: [
        "Better AI character recognition",
        "More accurate personalization",
        "Consistent storybook quality",
        "Improved illustration matching",
      ],
    };
  }
}

export default ImageValidator;
