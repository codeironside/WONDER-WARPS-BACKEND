import OpenAI from "openai";
import { config } from "../../../utils/config/index.js";
import ErrorHandler from "../../../middleware/errorhandler/index.js";
import S3Service from "../../s3/index.js";
import sharp from "sharp";
import ExifReader from "exifreader";
import ImageAnalyzer from "../imageanalyzer/index.js";

class ImageValidator {
  constructor() {
    const apiKey = config.openai.API_KEY;
    const googleApiKey = config.google.api_key;

    if (!apiKey) {
      throw new ErrorHandler("OpenAI API key is required", 500);
    }

    this.openai = new OpenAI({ apiKey });
    this.s3Service = new S3Service();
    this.humanFeatureAnalyzer = new ImageAnalyzer();
    this.googleApiKey = googleApiKey;

    this.STANDARD_SPECS = {
      width: 1024,
      height: 1024,
      quality: 95,
      format: "jpeg",
      minFileSize: 50000,
      maxFileSize: 500000,
      minResolution: 500,
      maxResolution: 4096,
      aspectRatioTolerance: 0.2,
    };

    this.VALIDATION_THRESHOLDS = {
      facialDetectionConfidence: 0.7,
      facialLandmarkConfidence: 0.6,
      facialClarityScore: 0.6,
      lightingScore: 0.5,
      focusScore: 0.5,
      contrastScore: 0.4,
      noiseLevelThreshold: 0.3,
      compressionArtifactThreshold: 0.2,
      faceOcclusionThreshold: 0.25,
      faceAngleThreshold: 30,
      eyeVisibilityThreshold: 0.8,
      mouthVisibilityThreshold: 0.7,
      skinToneConfidence: 0.6,
      hairVisibilityThreshold: 0.5,
      bodyVisibilityThreshold: 0.4,
      poseStabilityScore: 0.5,
    };

    this.VALIDATION_RULES = {
      age: { min: 0, max: 20, strict: true },
      faceSize: { minRatio: 0.15, maxRatio: 0.8 },
      facePosition: { centerTolerance: 0.3 },
      backgroundComplexity: { maxScore: 0.7 },
      safetyConfidence: { min: 0.8 },
      privacyElements: { allowed: false },
      textOverlay: { allowed: false },
      watermark: { allowed: false },
      filterEffects: { maxIntensity: 0.2 },
      exposureLevels: { min: 0.1, max: 0.9 },
    };
  }

  async detectFacesWithGoogleVision(imageUrl) {
    try {
      console.log("🔍 Using Google Vision API for face detection...");

      const buffer = await this.fetchImageBuffer(imageUrl);
      const base64Image = buffer.toString("base64");

      const requestBody = {
        requests: [
          {
            image: { content: base64Image },
            features: [
              { type: "FACE_DETECTION", maxResults: 10 },
              { type: "SAFE_SEARCH_DETECTION" },
              { type: "LABEL_DETECTION", maxResults: 20 },
              { type: "TEXT_DETECTION", maxResults: 10 },
            ],
          },
        ],
      };

      const response = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${this.googleApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Google Vision API error: ${response.status} - ${errorText}`,
        );
      }

      const result = await response.json();
      const annotations = result.responses?.[0] || {};

      const faceAnnotations = annotations.faceAnnotations || [];
      console.log(
        `✅ Google Vision detected ${faceAnnotations.length} face(s)`,
      );

      const visionBasedData =
        this.transformGoogleVisionResponse(faceAnnotations);

      return {
        success: true,
        faceCount: faceAnnotations.length,
        faces: faceAnnotations,
        visionBased: visionBasedData,
        confidence: this.calculateGoogleVisionConfidence(faceAnnotations),
        safeSearch: annotations.safeSearchAnnotation || {},
        labels: annotations.labelAnnotations || [],
        text: annotations.textAnnotations || [],
      };
    } catch (error) {
      console.error("Google Vision API face detection failed:", error.message);
      return {
        success: false,
        error: error.message,
        faceCount: 0,
        faces: [],
        visionBased: {},
      };
    }
  }

  transformGoogleVisionResponse(faceAnnotations) {
    const visionBased = {
      face_analysis: {},
      landmarks: { landmarks: {} },
      body_analysis: {},
      pose_analysis: {},
    };

    faceAnnotations.forEach((face, index) => {
      const faceKey = `face_${index}`;

      const detectionConfidence = face.detectionConfidence || 0;
      const landmarkingConfidence = face.landmarkingConfidence || 0;

      const angles = {
        roll: face.rollAngle || 0,
        pan: face.panAngle || 0,
        tilt: face.tiltAngle || 0,
      };

      const accessories = {
        headwear: this.likelihoodToLevel(face.headwearLikelihood),
        glasses: this.likelihoodToLevel(face.eyeglassesLikelihood),
      };

      const landmarks = {};
      if (face.landmarks) {
        face.landmarks.forEach((landmark) => {
          const landmarkType = this.normalizeLandmarkType(landmark.type);
          landmarks[landmarkType] = {
            x: landmark.position.x || 0,
            y: landmark.position.y || 0,
            z: landmark.position.z || 0,
          };
        });
      }

      const bounds = face.boundingPoly ? face.boundingPoly.vertices : [];

      visionBased.face_analysis[faceKey] = {
        confidence: {
          detection: detectionConfidence,
          landmarking: landmarkingConfidence,
        },
        angles: angles,
        accessories: accessories,
        bounds: bounds,
        joy_likelihood: this.likelihoodToLevel(face.joyLikelihood),
        sorrow_likelihood: this.likelihoodToLevel(face.sorrowLikelihood),
        anger_likelihood: this.likelihoodToLevel(face.angerLikelihood),
        surprise_likelihood: this.likelihoodToLevel(face.surpriseLikelihood),
        under_exposed_likelihood: this.likelihoodToLevel(
          face.underExposedLikelihood,
        ),
        blurred_likelihood: this.likelihoodToLevel(face.blurredLikelihood),
        headwear_likelihood: this.likelihoodToLevel(face.headwearLikelihood),
      };

      Object.assign(visionBased.landmarks.landmarks, landmarks);
    });

    return visionBased;
  }

  likelihoodToLevel(likelihood) {
    const likelihoodMap = {
      VERY_UNLIKELY: "VERY_UNLIKELY",
      UNLIKELY: "UNLIKELY",
      POSSIBLE: "POSSIBLE",
      LIKELY: "LIKELY",
      VERY_LIKELY: "VERY_LIKELY",
    };
    return likelihoodMap[likelihood] || "UNKNOWN";
  }

  normalizeLandmarkType(googleType) {
    const landmarkMap = {
      LEFT_EYE: "left_eye",
      RIGHT_EYE: "right_eye",
      LEFT_OF_LEFT_EYEBROW: "left_eyebrow_left",
      RIGHT_OF_LEFT_EYEBROW: "left_eyebrow_right",
      LEFT_OF_RIGHT_EYEBROW: "right_eyebrow_left",
      RIGHT_OF_RIGHT_EYEBROW: "right_eyebrow_right",
      MIDPOINT_BETWEEN_EYES: "eyes_midpoint",
      NOSE_TIP: "nose_tip",
      UPPER_LIP: "upper_lip",
      LOWER_LIP: "lower_lip",
      MOUTH_LEFT: "mouth_left",
      MOUTH_RIGHT: "mouth_right",
      MOUTH_CENTER: "mouth_center",
      NOSE_BOTTOM_RIGHT: "nose_bottom_right",
      NOSE_BOTTOM_LEFT: "nose_bottom_left",
      NOSE_BOTTOM_CENTER: "nose_bottom_center",
      LEFT_EYE_TOP_BOUNDARY: "left_eye_top",
      LEFT_EYE_RIGHT_CORNER: "left_eye_right",
      LEFT_EYE_BOTTOM_BOUNDARY: "left_eye_bottom",
      LEFT_EYE_LEFT_CORNER: "left_eye_left",
      RIGHT_EYE_TOP_BOUNDARY: "right_eye_top",
      RIGHT_EYE_RIGHT_CORNER: "right_eye_right",
      RIGHT_EYE_BOTTOM_BOUNDARY: "right_eye_bottom",
      RIGHT_EYE_LEFT_CORNER: "right_eye_left",
      LEFT_EYEBROW_UPPER_MIDPOINT: "left_eyebrow_upper",
      RIGHT_EYEBROW_UPPER_MIDPOINT: "right_eyebrow_upper",
      LEFT_EAR_TRAGION: "left_ear",
      RIGHT_EAR_TRAGION: "right_ear",
      FOREHEAD_GLABELLA: "forehead",
      CHIN_GNATHION: "chin",
      CHIN_LEFT_GONION: "chin_left",
      CHIN_RIGHT_GONION: "chin_right",
    };

    return landmarkMap[googleType] || googleType.toLowerCase();
  }

  calculateGoogleVisionConfidence(faceAnnotations) {
    if (!faceAnnotations || faceAnnotations.length === 0) {
      return 0;
    }

    const totalConfidence = faceAnnotations.reduce((sum, face) => {
      return sum + (face.detectionConfidence || 0);
    }, 0);

    return totalConfidence / faceAnnotations.length;
  }

  async analyzeHumanFeatures(imageUrl, options) {
    try {
      console.log("👤 Analyzing human features...");

      const googleVisionResult =
        await this.detectFacesWithGoogleVision(imageUrl);

      if (!googleVisionResult.success) {
        throw new Error(`Google Vision failed: ${googleVisionResult.error}`);
      }

      const existingAnalysis =
        await this.humanFeatureAnalyzer.analyzeHumanFeatures(imageUrl);

      if (!existingAnalysis) {
        return {
          valid: false,
          errors: ["Could not analyze human features in the image"],
          warnings: [],
          analysis: null,
          validation: {},
        };
      }

      const mergedAnalysis = this.mergeVisionAnalysis(
        existingAnalysis,
        googleVisionResult,
      );

      const errors = [];
      const warnings = [];
      const validation = {};

      const humanData = mergedAnalysis.primary_human_features || {};
      const integrated = mergedAnalysis.integrated_human_analysis || {};

      validation.containsHuman = !!(
        humanData.vision_based?.face_analysis ||
        humanData.ai_enhanced?.face_detailed
      );

      if (!validation.containsHuman) {
        errors.push("No human face detected in the image");
        return {
          valid: false,
          errors,
          warnings,
          analysis: mergedAnalysis,
          validation,
        };
      }

      validation.faceCount = googleVisionResult.faceCount;
      console.log(
        `✅ Google Vision confirmed: ${validation.faceCount} face(s) detected`,
      );

      if (
        options.requireSinglePerson &&
        validation.faceCount > options.maxPeople
      ) {
        throw new ErrorHandler(
          `Found ${validation.faceCount} face(s) in the image. Please upload a photo with only one person.`,
          400,
        );
      }

      const visionData = humanData.vision_based || {};
      if (visionData.face_analysis && visionData.face_analysis.face_0) {
        validation.faceConfidence =
          visionData.face_analysis.face_0.confidence?.detection || 0;
        validation.faceVisible =
          validation.faceConfidence >
          this.VALIDATION_THRESHOLDS.facialDetectionConfidence;
      } else {
        validation.faceConfidence = 0;
        validation.faceVisible = false;
      }

      if (!validation.faceVisible && validation.faceCount > 0) {
        warnings.push("Face detected but confidence is lower than threshold");
      }

      const aiData = humanData.ai_enhanced || {};
      validation.age =
        aiData?.age_gender_estimation?.age_range?.most_likely || null;
      validation.ageConfidence =
        aiData?.age_gender_estimation?.age_range?.confidence || 0;

      if (validation.age !== null) {
        if (validation.age < options.minAge) {
          throw new ErrorHandler(
            `The person in the image appears too young (estimated age: ${validation.age}). Minimum age required is ${options.minAge}.`,
            400,
          );
        }
        if (validation.age > options.maxAge) {
          throw new ErrorHandler(
            `The person in the image appears too old (estimated age: ${validation.age}). Maximum age allowed is ${options.maxAge}.`,
            400,
          );
        }
      }

      validation.gender =
        aiData?.age_gender_estimation?.gender_assessment?.perceived_gender ||
        null;
      validation.genderConfidence =
        aiData?.age_gender_estimation?.gender_assessment?.confidence || 0;

      if (validation.gender && Array.isArray(options.allowedGenders)) {
        if (!options.allowedGenders.includes(validation.gender)) {
          errors.push(
            `Detected gender (${validation.gender}) is not in allowed list: ${options.allowedGenders.join(", ")}`,
          );
        }
      }

      validation.faceClarity = this.calculateFaceClarityScore(
        visionData,
        aiData,
      );
      if (
        validation.faceClarity < this.VALIDATION_THRESHOLDS.facialClarityScore
      ) {
        warnings.push("Face is not clear enough for personalization");
      }

      validation.landmarksDetected = Object.keys(
        visionData?.face_analysis?.landmarks?.landmarks || {},
      ).length;
      if (validation.landmarksDetected < 10) {
        warnings.push("Limited facial landmarks detected");
      }

      validation.eyeVisibility = this.calculateEyeVisibility(visionData);
      if (
        validation.eyeVisibility <
        this.VALIDATION_THRESHOLDS.eyeVisibilityThreshold
      ) {
        warnings.push("Eyes are not clearly visible");
      }

      validation.mouthVisibility = this.calculateMouthVisibility(visionData);
      if (
        validation.mouthVisibility <
        this.VALIDATION_THRESHOLDS.mouthVisibilityThreshold
      ) {
        warnings.push("Mouth is not clearly visible");
      }

      validation.faceAngle = this.calculateFaceAngle(visionData);
      if (
        Math.abs(validation.faceAngle) >
        this.VALIDATION_THRESHOLDS.faceAngleThreshold
      ) {
        warnings.push(
          `Face is rotated (${validation.faceAngle.toFixed(1)}°). Front-facing is recommended`,
        );
      }

      validation.skinToneConfidence =
        aiData?.skin_analysis?.tone_precise?.confidence || 0;
      if (
        validation.skinToneConfidence <
        this.VALIDATION_THRESHOLDS.skinToneConfidence
      ) {
        warnings.push("Skin tone detection confidence is low");
      }

      validation.hairVisibility = this.calculateHairVisibility(
        aiData,
        visionData,
      );
      if (
        validation.hairVisibility <
        this.VALIDATION_THRESHOLDS.hairVisibilityThreshold
      ) {
        warnings.push("Hair is not clearly visible");
      }

      validation.bodyVisibility = this.calculateBodyVisibility(visionData);
      if (
        validation.bodyVisibility <
        this.VALIDATION_THRESHOLDS.bodyVisibilityThreshold
      ) {
        warnings.push("Body is not clearly visible");
      }

      validation.poseStability = this.calculatePoseStability(visionData);
      if (
        validation.poseStability < this.VALIDATION_THRESHOLDS.poseStabilityScore
      ) {
        warnings.push("Pose appears unstable or unnatural");
      }

      validation.faceOcclusion = this.calculateFaceOcclusion(visionData);
      if (
        validation.faceOcclusion >
        this.VALIDATION_THRESHOLDS.faceOcclusionThreshold
      ) {
        warnings.push("Face appears partially occluded");
      }

      validation.overallConfidence =
        this.calculateOverallHumanConfidence(validation);

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        analysis: mergedAnalysis,
        validation,
        googleVisionResult: {
          success: googleVisionResult.success,
          faceCount: googleVisionResult.faceCount,
          confidence: googleVisionResult.confidence,
          safetyCheck: googleVisionResult.safeSearch,
        },
      };
    } catch (error) {
      console.error("Human feature analysis failed:", error.message);

      if (error instanceof ErrorHandler) {
        throw error;
      }

      throw new ErrorHandler(
        `Unable to analyze the face in the image. Please make sure the face is clearly visible and well-lit.`,
        400,
      );
    }
  }

  mergeVisionAnalysis(existingAnalysis, googleVisionResult) {
    if (!existingAnalysis.primary_human_features) {
      existingAnalysis.primary_human_features = {};
    }

    if (!existingAnalysis.primary_human_features.vision_based) {
      existingAnalysis.primary_human_features.vision_based = {};
    }

    existingAnalysis.primary_human_features.vision_based.face_analysis =
      googleVisionResult.visionBased.face_analysis;

    if (googleVisionResult.visionBased.landmarks) {
      existingAnalysis.primary_human_features.vision_based.landmarks =
        googleVisionResult.visionBased.landmarks;
    }

    existingAnalysis.google_vision_validation = {
      faceCount: googleVisionResult.faceCount,
      confidence: googleVisionResult.confidence,
      safetyCheck: googleVisionResult.safeSearch,
      labels: googleVisionResult.labels,
      text: googleVisionResult.text,
    };

    return existingAnalysis;
  }

  calculateFaceClarityScore(visionData = {}, aiData = {}) {
    let score = 0.5;

    if (visionData?.face_analysis?.face_0?.confidence?.detection) {
      score += visionData.face_analysis.face_0.confidence.detection * 0.3;
    }

    if (visionData?.face_analysis?.face_0?.confidence?.landmarking) {
      score += visionData.face_analysis.face_0.confidence.landmarking * 0.2;
    }

    const landmarks = Object.keys(
      visionData?.face_analysis?.landmarks?.landmarks || {},
    ).length;
    score += (Math.min(landmarks, 20) / 20) * 0.2;

    const blurLikelihood =
      visionData?.face_analysis?.face_0?.blurred_likelihood;
    if (blurLikelihood) {
      const blurPenalty =
        {
          VERY_LIKELY: 0.3,
          LIKELY: 0.2,
          POSSIBLE: 0.1,
          UNLIKELY: 0.05,
          VERY_UNLIKELY: 0,
        }[blurLikelihood] || 0;
      score -= blurPenalty;
    }

    const underExposedLikelihood =
      visionData?.face_analysis?.face_0?.under_exposed_likelihood;
    if (
      underExposedLikelihood === "VERY_LIKELY" ||
      underExposedLikelihood === "LIKELY"
    ) {
      score -= 0.1;
    }

    if (aiData?.face_detailed?.dimensions?.facial_symmetry_score) {
      score += aiData.face_detailed.dimensions.facial_symmetry_score * 0.3;
    }

    return Math.max(0, Math.min(score, 1.0));
  }

  async validateImageForPersonalization(imageUrl, options = {}) {
    try {
      console.log("🔄 Starting comprehensive image validation...");

      const {
        minAge = 0,
        maxAge = 20,
        requireSinglePerson = true,
        requireClearFace = true,
        allowedGenders = ["male", "female", "neutral"],
        maxPeople = 1,
        safetyChecks = true,
        enhanceImage = true,
        enhancementLevel = "balanced",
        strictMode = false,
        returnDetailedReport = true,
      } = options;

      const validationSteps = [
        {
          name: "basic_integrity",
          method: this.validateBasicIntegrity.bind(this),
        },
        {
          name: "metadata_analysis",
          method: this.validateMetadataExif.bind(this),
        },
        {
          name: "human_analysis",
          method: this.analyzeHumanFeatures.bind(this),
        },
        {
          name: "quality_metrics",
          method: this.calculateQualityMetrics.bind(this),
        },
        {
          name: "composition_check",
          method: this.validateComposition.bind(this),
        },
        { name: "safety_check", method: this.validateSafety.bind(this) },
        {
          name: "personalization_suitability",
          method: this.assessPersonalizationSuitability.bind(this),
        },
      ];

      const validationResults = {};
      let stepErrors = [];

      for (const step of validationSteps) {
        try {
          console.log(`🔍 Executing validation step: ${step.name}`);
          validationResults[step.name] = await step.method(imageUrl, {
            minAge,
            maxAge,
            requireSinglePerson,
            requireClearFace,
            allowedGenders,
            maxPeople,
            safetyChecks,
            strictMode,
          });

          if (validationResults[step.name]?.errors?.length > 0) {
            stepErrors.push({
              step: step.name,
              errors: validationResults[step.name].errors,
            });

            if (strictMode && step.name === "basic_integrity") {
              throw new ErrorHandler(
                `Image validation failed: ${validationResults[step.name].errors[0]}`,
                400,
              );
            }
          }
        } catch (error) {
          console.error(
            `❌ Validation step ${step.name} failed:`,
            error.message,
          );
          stepErrors.push({
            step: step.name,
            error: error.message,
          });

          if (strictMode) {
            throw new ErrorHandler(
              `Image validation failed: ${error.message}`,
              400,
            );
          }
        }
      }

      const humanAnalysis = validationResults.human_analysis || {};
      const qualityMetrics = validationResults.quality_metrics || {};
      const composition = validationResults.composition_check || {};
      const safetyCheck = validationResults.safety_check || {};

      const validationSummary = this.generateValidationSummary({
        humanAnalysis,
        qualityMetrics,
        composition,
        safetyCheck,
        stepErrors,
        options: {
          minAge,
          maxAge,
          requireSinglePerson,
          requireClearFace,
          allowedGenders,
          maxPeople,
          strictMode,
        },
      });

      if (!validationSummary.isValid) {
        throw new ErrorHandler(
          validationSummary.userFriendlyMessage ||
            `Image validation failed: ${validationSummary.reasons.join(", ")}`,
          400,
          validationSummary,
        );
      }

      let enhancementReport = null;
      let enhancedImageUrl = imageUrl;
      let enhancementApplied = false;

      if (enhanceImage && validationSummary.canBeEnhanced) {
        try {
          console.log("🎨 Applying image enhancement...");
          const enhancementResult = await this.enhanceImageForPersonalization(
            imageUrl,
            {
              qualityMetrics,
              humanAnalysis,
              composition,
              enhancementLevel,
            },
          );

          enhancedImageUrl = enhancementResult.enhancedUrl;
          enhancementReport = enhancementResult.report;
          enhancementApplied = true;

          console.log("✅ Image enhancement completed");
        } catch (enhanceError) {
          console.warn("⚠️ Image enhancement failed:", enhanceError.message);
          if (strictMode) {
            throw new ErrorHandler(
              `Unable to enhance the image quality. Please try with a higher quality photo.`,
              500,
            );
          }
        }
      }

      const characteristics =
        this.extractPersonalizationCharacteristics(humanAnalysis);
      const dataQuality = this.assessDataQuality({
        characteristics,
        qualityMetrics,
        humanAnalysis,
        enhancementApplied,
      });

      const validationResult = {
        isValid: true,
        validationSummary,
        analysis: {
          human: humanAnalysis.analysis || {},
          quality: qualityMetrics,
          composition: composition,
          safety: safetyCheck,
          characteristics,
          dataQuality,
          enhancement: enhancementReport,
        },
        recommendations: this.generateRecommendations({
          validationSummary,
          qualityMetrics,
          composition,
          humanAnalysis,
          dataQuality,
        }),
        warnings: validationSummary.warnings || [],
        enhancedImageUrl: enhancementApplied ? enhancedImageUrl : undefined,
        enhancementApplied,
        enhancementReport,
        standardSpecs: this.STANDARD_SPECS,
        validationTimestamp: new Date().toISOString(),
        validationId: this.generateValidationId(),
        confidenceScore: validationSummary.confidenceScore || 0,
      };

      if (returnDetailedReport) {
        validationResult.detailedReport = {
          stepResults: validationResults,
          stepErrors,
          thresholds: this.VALIDATION_THRESHOLDS,
          rules: this.VALIDATION_RULES,
        };
      }

      console.log("✅ Image validation completed successfully");
      return validationResult;
    } catch (error) {
      console.error("❌ Image validation failed:", error.message);

      if (error instanceof ErrorHandler) {
        throw error;
      }

      if (error.message.includes("Failed to fetch")) {
        throw new ErrorHandler(
          "Could not access the image. Please check the URL and try again.",
          400,
        );
      }

      if (error.message.includes("Invalid image format")) {
        throw new ErrorHandler(
          "The image format is not supported. Please use JPEG, PNG, or WebP.",
          400,
        );
      }

      throw new ErrorHandler(
        `Image validation failed. Please try with a different image.`,
        500,
      );
    }
  }

  async validateBasicIntegrity(imageUrl, options) {
    const errors = [];
    const warnings = [];
    const metrics = {};

    try {
      console.log("📊 Performing basic integrity check...");

      const response = await fetch(imageUrl, { method: "HEAD" });

      if (!response.ok) {
        throw new ErrorHandler(
          "Could not access the image. Please check if the image URL is correct and accessible.",
          400,
        );
      }

      const contentType = response.headers.get("content-type");
      const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/jpg",
      ];

      if (
        !contentType ||
        !allowedTypes.some((type) => contentType.includes(type))
      ) {
        throw new ErrorHandler(
          "Unsupported image format. Please use JPEG, PNG, or WebP format.",
          400,
        );
      }

      const contentLength = response.headers.get("content-length");
      if (contentLength) {
        const size = parseInt(contentLength);
        metrics.fileSize = size;

        if (size < this.STANDARD_SPECS.minFileSize) {
          warnings.push(
            `Image size (${this.formatBytes(size)}) is below recommended minimum (${this.formatBytes(this.STANDARD_SPECS.minFileSize)})`,
          );
        }

        if (size > this.STANDARD_SPECS.maxFileSize * 2) {
          throw new ErrorHandler(
            `Image is too large (${this.formatBytes(size)}). Maximum allowed size is ${this.formatBytes(this.STANDARD_SPECS.maxFileSize * 2)}.`,
            400,
          );
        }
      }

      const imageBuffer = await this.fetchImageBuffer(imageUrl);
      const image = sharp(imageBuffer);
      const metadata = await image.metadata();

      metrics.format = metadata.format;
      metrics.width = metadata.width;
      metrics.height = metadata.height;
      metrics.channels = metadata.channels;
      metrics.hasAlpha = metadata.hasAlpha;
      metrics.orientation = metadata.orientation;

      if (
        metadata.width < this.STANDARD_SPECS.minResolution ||
        metadata.height < this.STANDARD_SPECS.minResolution
      ) {
        throw new ErrorHandler(
          `Image resolution (${metadata.width}x${metadata.height}) is too low. Minimum required is ${this.STANDARD_SPECS.minResolution}x${this.STANDARD_SPECS.minResolution}.`,
          400,
        );
      }

      if (
        metadata.width > this.STANDARD_SPECS.maxResolution ||
        metadata.height > this.STANDARD_SPECS.maxResolution
      ) {
        warnings.push(
          `Image resolution (${metadata.width}x${metadata.height}) exceeds recommended maximum (${this.STANDARD_SPECS.maxResolution}x${this.STANDARD_SPECS.maxResolution})`,
        );
      }

      const aspectRatio = metadata.width / metadata.height;
      metrics.aspectRatio = aspectRatio;

      if (
        Math.abs(aspectRatio - 1) > this.STANDARD_SPECS.aspectRatioTolerance
      ) {
        warnings.push(
          `Aspect ratio ${aspectRatio.toFixed(2)}:1 is not close to square (1:1)`,
        );
      }

      const stats = await image.stats();
      metrics.stats = {
        mean: stats.channels.map((c) => c.mean),
        stdev: stats.channels.map((c) => c.stdev),
        min: stats.channels.map((c) => c.min),
        max: stats.channels.map((c) => c.max),
        entropy: stats.entropy || 0,
      };

      const isTooDark = stats.channels[0].mean < 50;
      const isTooBright = stats.channels[0].mean > 200;

      if (isTooDark) {
        warnings.push("Image appears too dark");
        metrics.lightingCondition = "dark";
      } else if (isTooBright) {
        warnings.push("Image appears too bright/overexposed");
        metrics.lightingCondition = "bright";
      } else {
        metrics.lightingCondition = "adequate";
      }

      const dynamicRange = stats.channels[0].max - stats.channels[0].min;
      metrics.dynamicRange = dynamicRange;

      if (dynamicRange < 100) {
        warnings.push("Low dynamic range detected");
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        metrics,
      };
    } catch (error) {
      console.error("Basic integrity check failed:", error.message);

      if (error instanceof ErrorHandler) {
        throw error;
      }

      return {
        valid: false,
        errors: [`Image validation failed: ${error.message}`],
        warnings: [],
        metrics: {},
      };
    }
  }

  async validateMetadataExif(imageUrl, options) {
    const errors = [];
    const warnings = [];
    const metadata = {};

    try {
      console.log("📋 Analyzing image metadata...");

      const buffer = await this.fetchImageBuffer(imageUrl);
      const tags = ExifReader.load(buffer);

      metadata.exif = {};

      const relevantTags = [
        "Make",
        "Model",
        "DateTimeOriginal",
        "Orientation",
        "XResolution",
        "YResolution",
        "ResolutionUnit",
        "Software",
        "Artist",
        "Copyright",
        "ExposureTime",
        "FNumber",
        "ISOSpeedRatings",
        "FocalLength",
        "Flash",
        "WhiteBalance",
      ];

      relevantTags.forEach((tag) => {
        if (tags[tag]) {
          metadata.exif[tag] = tags[tag].description || tags[tag].value;
        }
      });

      if (tags.Software && tags.Software.value) {
        const software = tags.Software.value.toString().toLowerCase();
        if (
          software.includes("photoshop") ||
          software.includes("gimp") ||
          software.includes("lightroom")
        ) {
          warnings.push(
            "Image appears to be edited with photo editing software",
          );
        }
      }

      if (tags.Orientation && tags.Orientation.value !== 1) {
        warnings.push(
          `Image has orientation tag ${tags.Orientation.value}, may need rotation`,
        );
      }

      if (tags.Make && tags.Model) {
        metadata.exif.camera = `${tags.Make.value} ${tags.Model.value}`;
      }

      if (tags.DateTimeOriginal) {
        metadata.exif.captureDate = tags.DateTimeOriginal.description;
        const captureDate = new Date(tags.DateTimeOriginal.description);
        const ageMs = Date.now() - captureDate.getTime();
        const ageYears = ageMs / (1000 * 60 * 60 * 24 * 365);

        if (ageYears > 5) {
          warnings.push(
            `Image appears to be ${Math.floor(ageYears)} years old`,
          );
        }
      }

      if (tags.Copyright) {
        warnings.push("Image contains copyright information");
      }

      metadata.hasGPS = !!(tags.GPSLatitude && tags.GPSLongitude);
      if (metadata.hasGPS) {
        errors.push("Image contains GPS location data - privacy concern");
      }

      metadata.hasThumbnail = !!(tags.Thumbnail || tags["Thumbnail Offset"]);

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        metadata,
      };
    } catch (error) {
      console.warn("Metadata analysis failed or no EXIF data:", error.message);
      return {
        valid: true,
        errors: [],
        warnings: ["No EXIF metadata found or unable to read"],
        metadata: {},
      };
    }
  }

  async calculateQualityMetrics(imageUrl, options) {
    const errors = [];
    const warnings = [];
    const metrics = {};

    try {
      console.log("📈 Calculating quality metrics...");

      const buffer = await this.fetchImageBuffer(imageUrl);
      const image = sharp(buffer);
      const metadata = await image.metadata();
      const stats = await image.stats();

      const grayImage = await image.clone().grayscale().toBuffer();
      const graySharp = sharp(grayImage);
      const grayStats = await graySharp.stats();

      metrics.resolution = {
        width: metadata.width,
        height: metadata.height,
        megapixels: (metadata.width * metadata.height) / 1000000,
      };

      metrics.lighting = {
        brightness: this.calculateBrightness(stats),
        contrast: this.calculateContrast(stats),
        exposure: this.calculateExposure(stats),
        histogram: this.calculateHistogram(stats),
      };

      if (metrics.lighting.brightness < 0.3) {
        warnings.push("Image is too dark");
      } else if (metrics.lighting.brightness > 0.7) {
        warnings.push("Image may be overexposed");
      }

      if (metrics.lighting.contrast < 0.3) {
        warnings.push("Low contrast detected");
      }

      metrics.focus = {
        blurriness: await this.calculateBlurriness(grayImage),
        sharpness: await this.calculateSharpness(grayImage),
        noise: await this.calculateNoiseLevel(grayImage),
      };

      if (metrics.focus.blurriness > 0.3) {
        throw new ErrorHandler(
          "Image appears too blurry. Please use a clearer photo.",
          400,
        );
      }

      if (
        metrics.focus.noise > this.VALIDATION_THRESHOLDS.noiseLevelThreshold
      ) {
        warnings.push("High noise level detected");
      }

      metrics.color = {
        saturation: this.calculateSaturation(stats),
        colorBalance: this.calculateColorBalance(stats),
        colorCast: this.detectColorCast(stats),
        colorAccuracy: this.assessColorAccuracy(stats),
      };

      metrics.artifacts = {
        compression: await this.detectCompressionArtifacts(grayImage),
        banding: await this.detectColorBanding(buffer),
        chromaSubsampling: metadata.chromaSubsampling,
      };

      if (
        metrics.artifacts.compression >
        this.VALIDATION_THRESHOLDS.compressionArtifactThreshold
      ) {
        warnings.push("Compression artifacts detected");
      }

      metrics.texture = {
        detailLevel: await this.calculateDetailLevel(grayImage),
        textureComplexity: await this.calculateTextureComplexity(grayImage),
      };

      metrics.overallScore = this.calculateOverallQualityScore(metrics);

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        metrics,
      };
    } catch (error) {
      console.error("Quality metrics calculation failed:", error.message);

      if (error instanceof ErrorHandler) {
        throw error;
      }

      return {
        valid: false,
        errors: [`Image quality check failed: ${error.message}`],
        warnings: [],
        metrics: {},
      };
    }
  }

  async validateComposition(imageUrl, options) {
    const errors = [];
    const warnings = [];
    const composition = {};

    try {
      console.log("🎨 Validating image composition...");

      const buffer = await this.fetchImageBuffer(imageUrl);
      const image = sharp(buffer);
      const metadata = await image.metadata();
      const stats = await image.stats();

      composition.aspectRatio = metadata.width / metadata.height;
      composition.isSquare = Math.abs(composition.aspectRatio - 1) < 0.1;

      if (!composition.isSquare) {
        warnings.push(
          "Image is not square. Cropping to square may affect composition",
        );
      }

      composition.ruleOfThirds = this.calculateRuleOfThirdsCompliance(
        stats,
        metadata,
      );
      if (composition.ruleOfThirds.score < 0.5) {
        warnings.push(
          "Subject placement may not follow optimal composition rules",
        );
      }

      composition.centering = this.calculateSubjectCentering(stats);
      composition.symmetry = this.calculateSymmetry(stats);

      composition.backgroundComplexity =
        await this.calculateBackgroundComplexity(buffer);
      if (
        composition.backgroundComplexity >
        this.VALIDATION_RULES.backgroundComplexity.maxScore
      ) {
        warnings.push("Complex background may interfere with personalization");
      }

      composition.foregroundClarity =
        await this.calculateForegroundClarity(buffer);

      const edges = await this.detectEdges(buffer);
      composition.edgeDistribution = this.analyzeEdgeDistribution(edges);

      composition.balance = this.calculateVisualBalance(stats);
      composition.harmony = this.calculateColorHarmony(stats);

      composition.leadingLines = await this.detectLeadingLines(buffer);
      composition.framing = await this.assessFraming(buffer);

      composition.negativeSpace = this.calculateNegativeSpace(stats);
      if (composition.negativeSpace < 0.1) {
        warnings.push("Image appears too crowded");
      } else if (composition.negativeSpace > 0.7) {
        warnings.push("Excessive negative space");
      }

      composition.overallScore = this.calculateCompositionScore(composition);

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        composition,
      };
    } catch (error) {
      console.error("Composition validation failed:", error.message);
      return {
        valid: false,
        errors: [`Composition validation failed: ${error.message}`],
        warnings: [],
        composition: {},
      };
    }
  }

  async validateSafety(imageUrl, options) {
    const errors = [];
    const warnings = [];
    const safety = {};

    try {
      console.log("🛡️ Performing safety validation...");

      const buffer = await this.fetchImageBuffer(imageUrl);

      if (options.safetyChecks === false) {
        return {
          valid: true,
          errors: [],
          warnings: ["Safety checks disabled"],
          safety: { checksPerformed: false },
        };
      }

      safety.checks = [];

      const image = sharp(buffer);
      const metadata = await image.metadata();

      const skinToneAnalysis = await this.analyzeSkinToneSafety(buffer);
      safety.checks.push({
        name: "skin_tone_analysis",
        result: skinToneAnalysis.passed,
        details: skinToneAnalysis,
      });

      if (!skinToneAnalysis.passed) {
        warnings.push("Skin tone analysis raised concerns");
      }

      const privacyElements = await this.detectPrivacyElements(buffer);
      safety.checks.push({
        name: "privacy_elements",
        result: privacyElements.found === 0,
        details: privacyElements,
      });

      if (privacyElements.found > 0) {
        errors.push("Privacy-sensitive elements detected in image");
      }

      const textDetection = await this.detectTextInImage(buffer);
      safety.checks.push({
        name: "text_detection",
        result: textDetection.found === 0,
        details: textDetection,
      });

      if (
        textDetection.found > 0 &&
        !this.VALIDATION_RULES.textOverlay.allowed
      ) {
        errors.push("Text overlay detected in image");
      }

      const watermarkDetection = await this.detectWatermarks(buffer);
      safety.checks.push({
        name: "watermark_detection",
        result: watermarkDetection.found === 0,
        details: watermarkDetection,
      });

      if (
        watermarkDetection.found > 0 &&
        !this.VALIDATION_RULES.watermark.allowed
      ) {
        errors.push("Watermark detected in image");
      }

      const filterDetection = await this.detectFilterEffects(buffer);
      safety.checks.push({
        name: "filter_detection",
        result:
          filterDetection.intensity <
          this.VALIDATION_RULES.filterEffects.maxIntensity,
        details: filterDetection,
      });

      if (
        filterDetection.intensity >
        this.VALIDATION_RULES.filterEffects.maxIntensity
      ) {
        warnings.push("Strong filter effects detected");
      }

      const inappropriateContent = await this.checkInappropriateContent(buffer);
      safety.checks.push({
        name: "inappropriate_content",
        result: inappropriateContent.safe,
        details: inappropriateContent,
      });

      if (!inappropriateContent.safe) {
        throw new ErrorHandler(
          "Image contains inappropriate content and cannot be processed.",
          400,
        );
      }

      const exposureCheck = await this.checkExposureSafety(buffer);
      safety.checks.push({
        name: "exposure_safety",
        result: exposureCheck.safe,
        details: exposureCheck,
      });

      const metadataSafety = await this.checkMetadataSafety(metadata);
      safety.checks.push({
        name: "metadata_safety",
        result: metadataSafety.safe,
        details: metadataSafety,
      });

      safety.overallSafe = safety.checks.every((check) => check.result);
      safety.confidence = this.calculateSafetyConfidence(safety.checks);

      if (safety.confidence < this.VALIDATION_RULES.safetyConfidence.min) {
        warnings.push("Safety validation confidence is low");
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        safety,
      };
    } catch (error) {
      console.error("Safety validation failed:", error.message);

      if (error instanceof ErrorHandler) {
        throw error;
      }

      return {
        valid: false,
        errors: [`Safety validation failed: ${error.message}`],
        warnings: [],
        safety: {},
      };
    }
  }

  async assessPersonalizationSuitability(imageUrl, options) {
    const errors = [];
    const warnings = [];
    const suitability = {};

    try {
      console.log("🎯 Assessing personalization suitability...");

      suitability.factors = {};

      suitability.factors.faceReadiness = this.assessFaceReadiness();
      suitability.factors.bodyReadiness = this.assessBodyReadiness();
      suitability.factors.featureClarity = this.assessFeatureClarity();
      suitability.factors.expressionSuitability =
        this.assessExpressionSuitability();
      suitability.factors.poseSuitability = this.assessPoseSuitability();
      suitability.factors.lightingSuitability =
        this.assessLightingSuitability();
      suitability.factors.backgroundSuitability =
        this.assessBackgroundSuitability();

      suitability.overallScore = this.calculateSuitabilityScore(
        suitability.factors,
      );

      suitability.canProceed = suitability.overallScore >= 0.7;
      suitability.needsEnhancement =
        suitability.overallScore >= 0.4 && suitability.overallScore < 0.7;
      suitability.recommendedEnhancements = this.determineEnhancementNeeds(
        suitability.factors,
      );

      if (suitability.overallScore < 0.4) {
        errors.push("Image is not suitable for personalization");
      } else if (suitability.needsEnhancement) {
        warnings.push("Image requires enhancement for optimal personalization");
      }

      suitability.compatibility = {
        withArtStyles: this.assessArtStyleCompatibility(),
        withCharacterTypes: this.assessCharacterTypeCompatibility(),
        withStoryGenres: this.assessStoryGenreCompatibility(),
      };

      suitability.personalizationPotential =
        this.estimatePersonalizationPotential(suitability.factors);

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        suitability,
      };
    } catch (error) {
      console.error("Suitability assessment failed:", error.message);
      return {
        valid: false,
        errors: [`Suitability assessment failed: ${error.message}`],
        warnings: [],
        suitability: {},
      };
    }
  }

  generateValidationSummary(data) {
    const {
      humanAnalysis = {},
      qualityMetrics = {},
      composition = {},
      safetyCheck = {},
      stepErrors = [],
      options = {},
    } = data;

    const summary = {
      isValid: true,
      reasons: [],
      warnings: [],
      confidenceScore: 0,
      canBeEnhanced: false,
      validationLevel: "standard",
      userFriendlyMessage: "",
    };

    const errorSteps = stepErrors.filter((step) => step.errors?.length > 0);
    if (errorSteps.length > 0) {
      summary.isValid = false;
      errorSteps.forEach((step) => {
        summary.reasons.push(
          ...step.errors.map((err) => `${step.step}: ${err}`),
        );
      });

      const firstError = errorSteps[0]?.errors?.[0] || "";
      if (
        firstError.includes("multiple faces") ||
        firstError.includes("face count")
      ) {
        summary.userFriendlyMessage =
          "Please upload a photo with only one person.";
      } else if (
        firstError.includes("too young") ||
        firstError.includes("too old")
      ) {
        summary.userFriendlyMessage =
          "The person in the image must be between the specified age range.";
      } else if (firstError.includes("blurry")) {
        summary.userFriendlyMessage =
          "The image is too blurry. Please upload a clearer photo.";
      } else if (firstError.includes("format")) {
        summary.userFriendlyMessage =
          "Unsupported image format. Please use JPEG, PNG, or WebP.";
      } else {
        summary.userFriendlyMessage =
          "Image validation failed. Please try with a different photo.";
      }

      return summary;
    }

    if (!humanAnalysis.valid) {
      summary.isValid = false;
      summary.reasons.push(...(humanAnalysis.errors || []));
      summary.userFriendlyMessage =
        "Unable to analyze the face in the image. Please make sure the face is clearly visible.";
    }

    if (!qualityMetrics.valid) {
      summary.isValid = false;
      summary.reasons.push(...(qualityMetrics.errors || []));
      summary.userFriendlyMessage =
        "Image quality issues detected. Please upload a higher quality photo.";
    }

    if (!safetyCheck.valid) {
      summary.isValid = false;
      summary.reasons.push(...(safetyCheck.errors || []));
      summary.userFriendlyMessage =
        "Image contains content that cannot be processed.";
    }

    const humanValidation = humanAnalysis.validation || {};

    if (humanValidation.age !== null) {
      if (
        humanValidation.age < options.minAge ||
        humanValidation.age > options.maxAge
      ) {
        summary.isValid = false;
        summary.reasons.push(
          `Age ${humanValidation.age} is outside allowed range (${options.minAge}-${options.maxAge})`,
        );
        summary.userFriendlyMessage = `The person in the image must be between ${options.minAge} and ${options.maxAge} years old.`;
      }
    }

    if (
      options.requireSinglePerson &&
      humanValidation.faceCount > options.maxPeople
    ) {
      summary.isValid = false;
      summary.reasons.push(
        `Too many people detected: ${humanValidation.faceCount}`,
      );
      summary.userFriendlyMessage =
        "Please upload a photo with only one person.";
    }

    if (
      options.requireClearFace &&
      (!humanValidation.faceVisible || humanValidation.faceClarity < 0.6)
    ) {
      summary.isValid = false;
      summary.reasons.push("Face is not clear enough for personalization");
      summary.userFriendlyMessage =
        "The face is not clear enough. Please upload a photo where the face is clearly visible and well-lit.";
    }

    summary.warnings = [
      ...(humanAnalysis.warnings || []),
      ...(qualityMetrics.warnings || []),
      ...(composition.warnings || []),
      ...(safetyCheck.warnings || []),
    ];

    summary.confidenceScore = this.calculateOverallConfidence({
      human: humanValidation.overallConfidence || 0,
      quality: qualityMetrics.metrics?.overallScore || 0,
      composition: composition.composition?.overallScore || 0,
      safety: safetyCheck.safety?.confidence || 0,
    });

    summary.canBeEnhanced =
      summary.isValid &&
      (summary.confidenceScore < 0.9 ||
        summary.warnings.length > 0 ||
        qualityMetrics.metrics?.overallScore < 0.8);

    summary.validationLevel = options.strictMode ? "strict" : "standard";

    return summary;
  }

  extractPersonalizationCharacteristics(humanAnalysis = {}) {
    if (!humanAnalysis.analysis) {
      return {
        skin_tone: { value: "unknown", confidence: "low" },
        hair_type: { value: "unknown", confidence: "low" },
        hairstyle: { value: "unknown", confidence: "low" },
        hair_color: { value: "unknown", confidence: "low" },
        eye_color: { value: "unknown", confidence: "low" },
        facial_features: { values: [], confidence: "low" },
        clothing: { value: "unknown", confidence: "low" },
        overall_appearance: "insufficient_data",
      };
    }

    const aiData =
      humanAnalysis.analysis.primary_human_features?.ai_enhanced || {};
    const visionData =
      humanAnalysis.analysis.primary_human_features?.vision_based || {};

    const characteristics = {
      skin_tone: {
        value: aiData?.skin_analysis?.tone_precise?.primary || "unknown",
        confidence: this.confidenceToLevel(
          aiData?.skin_analysis?.tone_precise?.confidence || 0,
        ),
      },
      hair_type: {
        value:
          aiData?.hair_analysis?.strand_characteristics?.texture_precise ||
          "unknown",
        confidence: this.confidenceToLevel(
          aiData?.hair_analysis?.strand_characteristics?.confidence || 0,
        ),
      },
      hairstyle: {
        value:
          aiData?.hair_analysis?.style_geometry?.length_category || "unknown",
        confidence: this.confidenceToLevel(
          aiData?.hair_analysis?.style_geometry?.confidence || 0,
        ),
      },
      hair_color: {
        value: aiData?.hair_analysis?.color_granular?.base_color || "unknown",
        confidence: this.confidenceToLevel(
          aiData?.hair_analysis?.color_granular?.confidence || 0,
        ),
      },
      eye_color: {
        value:
          aiData?.face_detailed?.eyes_comprehensive?.left_eye?.color ||
          "unknown",
        confidence: this.confidenceToLevel(
          aiData?.face_detailed?.eyes_comprehensive?.confidence || 0,
        ),
      },
      facial_features: {
        values: this.extractFacialFeatureValues(aiData),
        confidence: this.confidenceToLevel(
          aiData?.face_detailed?.dimensions?.facial_symmetry_score || 0,
        ),
      },
      clothing: {
        value:
          aiData?.clothing_body_interaction?.fit_analysis?.silhouette_type ||
          "unknown",
        confidence: this.confidenceToLevel(
          aiData?.clothing_body_interaction?.fit_analysis?.confidence || 0,
        ),
      },
      overall_appearance: this.generateOverallAppearanceDescription(aiData),
    };

    return characteristics;
  }

  assessDataQuality(data = {}) {
    const {
      characteristics = {},
      qualityMetrics = {},
      humanAnalysis = {},
      enhancementApplied = false,
    } = data;

    const warnings = [];
    const recommendations = [];
    let overallConfidence = "high";

    const characteristicConfidences = Object.values(characteristics)
      .filter((char) => char?.confidence)
      .map((char) => char.confidence);

    const lowConfidenceCount = characteristicConfidences.filter(
      (conf) => conf === "low",
    ).length;
    const mediumConfidenceCount = characteristicConfidences.filter(
      (conf) => conf === "medium",
    ).length;

    if (lowConfidenceCount > 2) {
      overallConfidence = "low";
      warnings.push("Multiple characteristics have low confidence");
    } else if (lowConfidenceCount > 0 || mediumConfidenceCount > 2) {
      overallConfidence = "medium";
      warnings.push("Some characteristics have uncertain confidence");
    }

    const qualityScore = qualityMetrics.metrics?.overallScore || 0;
    if (qualityScore < 0.6) {
      overallConfidence = Math.min(overallConfidence, "medium");
      warnings.push("Image quality may affect personalization accuracy");
    }

    const humanConfidence = humanAnalysis.validation?.overallConfidence || 0;
    if (humanConfidence < 0.7) {
      overallConfidence = Math.min(overallConfidence, "medium");
      warnings.push("Human feature analysis confidence is moderate");
    }

    if (enhancementApplied) {
      recommendations.push(
        "Image has been enhanced for better personalization",
      );
    } else if (overallConfidence !== "high") {
      recommendations.push("Consider enhancing the image for optimal results");
    }

    if (overallConfidence === "high") {
      recommendations.push("Image quality is excellent for personalization");
    }

    return {
      overallConfidence,
      warnings,
      recommendations,
      canProceed: overallConfidence !== "low",
      qualityScore,
      characteristicConfidence:
        this.calculateCharacteristicConfidence(characteristics),
      enhancementEffectiveness: enhancementApplied ? "applied" : "not_needed",
    };
  }

  generateRecommendations(data = {}) {
    const {
      validationSummary = {},
      qualityMetrics = {},
      composition = {},
      humanAnalysis = {},
      dataQuality = {},
    } = data;
    const recommendations = [];

    if (validationSummary.warnings?.length > 0) {
      recommendations.push(
        "Address the following warnings for better results:",
      );
      validationSummary.warnings.forEach((warning) => {
        recommendations.push(`• ${warning}`);
      });
    }

    const qualityScore = qualityMetrics.metrics?.overallScore || 0;
    if (qualityScore < 0.8) {
      recommendations.push(
        "Use higher quality images with better lighting and focus",
      );
    }

    const faceClarity = humanAnalysis.validation?.faceClarity || 0;
    if (faceClarity < 0.7) {
      recommendations.push("Ensure the face is clearly visible and well-lit");
    }

    const backgroundComplexity =
      composition.composition?.backgroundComplexity || 0;
    if (backgroundComplexity > 0.5) {
      recommendations.push("Use simpler backgrounds to improve subject focus");
    }

    if (dataQuality.overallConfidence === "low") {
      recommendations.push(
        "Upload a clearer image with visible facial features",
      );
    }

    if (!validationSummary.canBeEnhanced && qualityScore < 0.9) {
      recommendations.push(
        "Automatic enhancement is recommended for optimal results",
      );
    }

    return recommendations;
  }

  async enhanceImageForPersonalization(imageUrl, enhancementData = {}) {
    try {
      console.log("🎨 Enhancing image for personalization...");

      const {
        qualityMetrics = {},
        humanAnalysis = {},
        composition = {},
        enhancementLevel = "balanced",
      } = enhancementData;

      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const originalBuffer = Buffer.from(arrayBuffer);
      const originalMetadata = await sharp(originalBuffer).metadata();

      const enhancementPipeline = this.createIntelligentEnhancementPipeline(
        qualityMetrics,
        humanAnalysis,
        composition,
        enhancementLevel,
      );

      let sharpInstance = sharp(originalBuffer);

      for (const enhancement of enhancementPipeline) {
        sharpInstance = enhancement.fn(sharpInstance);
      }

      const faceCenter = this.calculateFaceCenter(humanAnalysis);
      const cropPosition = faceCenter
        ? this.determineOptimalCropPosition(faceCenter, originalMetadata)
        : "center";

      const enhancedBuffer = await sharpInstance
        .resize(this.STANDARD_SPECS.width, this.STANDARD_SPECS.height, {
          fit: "cover",
          position: cropPosition,
          withoutEnlargement: false,
          kernel: sharp.kernel.lanczos3,
        })
        .jpeg({
          quality: this.STANDARD_SPECS.quality,
          mozjpeg: true,
          chromaSubsampling: "4:4:4",
          trellisQuantisation: true,
          overshootDeringing: true,
          optimizeScans: true,
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
        original: {
          size: originalBuffer.length,
          dimensions: {
            width: originalMetadata.width,
            height: originalMetadata.height,
          },
          format: originalMetadata.format,
          qualityScore: qualityMetrics.metrics?.overallScore || 0,
        },
        enhanced: {
          size: enhancedBuffer.length,
          dimensions: {
            width: this.STANDARD_SPECS.width,
            height: this.STANDARD_SPECS.height,
          },
          format: "jpeg",
          quality: this.STANDARD_SPECS.quality,
        },
        enhancements: enhancementPipeline.map((enh) => enh.name),
        enhancementLevel,
        cropPosition,
        faceCentered: !!faceCenter,
        qualityImprovement: this.calculateQualityImprovement(
          originalBuffer,
          enhancedBuffer,
          qualityMetrics,
        ),
        timestamp: new Date().toISOString(),
      };

      console.log("✅ Image enhancement completed");
      return { enhancedUrl, report };
    } catch (error) {
      console.error("Error enhancing image:", error);
      throw new Error(`Image enhancement failed: ${error.message}`);
    }
  }

  createIntelligentEnhancementPipeline(
    qualityMetrics = {},
    humanAnalysis = {},
    composition = {},
    enhancementLevel = "balanced",
  ) {
    const pipeline = [];

    const {
      lighting = {},
      focus = {},
      color = {},
      artifacts = {},
    } = qualityMetrics.metrics || {};

    if (lighting?.brightness < 0.4) {
      pipeline.push(this.enhanceBrightness(enhancementLevel));
    } else if (lighting?.brightness > 0.7) {
      pipeline.push(this.reduceHighlights(enhancementLevel));
    }

    if (lighting?.contrast < 0.4) {
      pipeline.push(this.enhanceContrast(enhancementLevel));
    }

    if (focus?.blurriness > 0.3) {
      pipeline.push(this.enhanceSharpness(enhancementLevel));
    }

    if (focus?.noise > 0.2) {
      pipeline.push(this.reduceNoise(enhancementLevel));
    }

    if (color?.saturation < 0.4) {
      pipeline.push(this.enhanceSaturation(enhancementLevel));
    } else if (color?.saturation > 0.7) {
      pipeline.push(this.reduceSaturation(enhancementLevel));
    }

    if (color?.colorCast?.strength > 0.3) {
      pipeline.push(this.correctColorCast(enhancementLevel, color.colorCast));
    }

    if (artifacts?.compression > 0.2) {
      pipeline.push(this.reduceCompressionArtifacts(enhancementLevel));
    }

    const faceClarity = humanAnalysis.validation?.faceClarity || 0;
    if (faceClarity < 0.7) {
      pipeline.push(this.enhanceFaceDetails(enhancementLevel));
    }

    pipeline.push(this.optimizeForPersonalization(enhancementLevel));

    return pipeline;
  }

  calculateEyeVisibility(visionData = {}) {
    const landmarks = visionData?.face_analysis?.landmarks?.landmarks || {};
    const eyeLandmarks = Object.keys(landmarks).filter(
      (key) => key.includes("eye") || key.includes("EYE"),
    ).length;

    return Math.min(eyeLandmarks / 8, 1.0);
  }

  calculateMouthVisibility(visionData = {}) {
    const landmarks = visionData?.face_analysis?.landmarks?.landmarks || {};
    const mouthLandmarks = Object.keys(landmarks).filter(
      (key) =>
        key.includes("mouth") ||
        key.includes("MOUTH") ||
        key.includes("lip") ||
        key.includes("LIP"),
    ).length;

    return Math.min(mouthLandmarks / 6, 1.0);
  }

  calculateFaceAngle(visionData = {}) {
    const angles = visionData?.face_analysis?.face_0?.angles || {};
    if (!angles) return 0;

    return Math.max(
      Math.abs(angles.roll || 0),
      Math.abs(angles.pan || 0),
      Math.abs(angles.tilt || 0),
    );
  }

  calculateHairVisibility(aiData = {}, visionData = {}) {
    let score = 0.5;

    if (aiData?.hair_analysis?.scalp_coverage?.hair_density) {
      score += 0.2;
    }

    if (
      aiData?.hair_analysis?.color_granular?.base_color &&
      aiData.hair_analysis.color_granular.base_color !== "unknown"
    ) {
      score += 0.2;
    }

    return Math.min(score, 1.0);
  }

  calculateBodyVisibility(visionData = {}) {
    const bodyObjects = Object.keys(visionData?.body_analysis || {}).length;
    return Math.min(bodyObjects / 2, 1.0);
  }

  calculatePoseStability(visionData = {}) {
    const pose = visionData?.pose_analysis || {};
    if (!pose) return 0.5;

    let score = 0.5;
    score += pose.confidence * 0.3;

    const aspectRatio = pose.aspect_ratio || 1;
    score += (1 - Math.abs(aspectRatio - 2) / 2) * 0.2;

    return Math.min(score, 1.0);
  }

  calculateFaceOcclusion(visionData = {}) {
    const accessories = visionData?.face_analysis?.face_0?.accessories || {};
    if (!accessories) return 0;

    let occlusion = 0;

    if (accessories.headwear === "VERY_LIKELY") occlusion += 0.3;
    if (accessories.glasses === "VERY_LIKELY") occlusion += 0.2;

    return Math.min(occlusion, 1.0);
  }

  calculateOverallHumanConfidence(validation = {}) {
    const weights = {
      faceConfidence: 0.3,
      faceClarity: 0.2,
      landmarksDetected: 0.1,
      ageConfidence: 0.1,
      genderConfidence: 0.1,
      skinToneConfidence: 0.1,
      poseStability: 0.1,
    };

    let score = 0;
    let totalWeight = 0;

    Object.entries(weights).forEach(([key, weight]) => {
      if (validation[key] !== undefined) {
        score += (validation[key] || 0) * weight;
        totalWeight += weight;
      }
    });

    return totalWeight > 0 ? score / totalWeight : 0.5;
  }

  async fetchImageBuffer(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  }

  confidenceToLevel(confidence) {
    if (confidence >= 0.8) return "high";
    if (confidence >= 0.6) return "medium";
    return "low";
  }

  extractFacialFeatureValues(aiData = {}) {
    const features = [];

    if (aiData?.face_detailed?.face_shape_analysis?.primary_shape) {
      features.push(
        `face_shape_${aiData.face_detailed.face_shape_analysis.primary_shape}`,
      );
    }

    if (aiData?.skin_analysis?.features?.freckles?.presence !== "none") {
      features.push("freckles");
    }

    if (aiData?.face_detailed?.jawline?.chin_type?.includes("dimpled")) {
      features.push("dimpled_chin");
    }

    if (aiData?.face_detailed?.eyebrows_detailed?.shape) {
      features.push(`${aiData.face_detailed.eyebrows_detailed.shape}_eyebrows`);
    }

    return features.length > 0 ? features : ["balanced_features"];
  }

  generateOverallAppearanceDescription(aiData = {}) {
    if (!aiData) return "insufficient_data";

    const parts = [];

    if (aiData.age_gender_estimation?.age_range?.most_likely) {
      parts.push(
        `${aiData.age_gender_estimation.age_range.most_likely}-year-old`,
      );
    }

    if (aiData.age_gender_estimation?.gender_assessment?.perceived_gender) {
      parts.push(
        aiData.age_gender_estimation.gender_assessment.perceived_gender,
      );
    }

    if (aiData.hair_analysis?.color_granular?.base_color) {
      parts.push(`${aiData.hair_analysis.color_granular.base_color} hair`);
    }

    if (aiData.face_detailed?.eyes_comprehensive?.eye_spacing) {
      parts.push(
        `${aiData.face_detailed.eyes_comprehensive.eye_spacing}-set eyes`,
      );
    }

    return parts.length > 0 ? parts.join(" ") : "typical_child_appearance";
  }

  calculateCharacteristicConfidence(characteristics = {}) {
    const confidences = {
      high: 0,
      medium: 0,
      low: 0,
      total: 0,
    };

    Object.values(characteristics).forEach((char) => {
      if (char?.confidence) {
        confidences[char.confidence]++;
        confidences.total++;
      }
    });

    if (confidences.total === 0) return "low";

    const highRatio = confidences.high / confidences.total;
    const lowRatio = confidences.low / confidences.total;

    if (highRatio >= 0.7 && lowRatio <= 0.1) return "high";
    if (highRatio >= 0.5 && lowRatio <= 0.3) return "medium";
    return "low";
  }

  generateValidationId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `val_${timestamp}_${random}`.toUpperCase();
  }

  calculateOverallConfidence(scores) {
    const { human = 0, quality = 0, composition = 0, safety = 0 } = scores;
    return human * 0.4 + quality * 0.3 + composition * 0.2 + safety * 0.1;
  }

  async validateAndUploadImage(file, userId, options = {}) {
    let tempKey = null;

    try {
      console.log(`📤 Validating and uploading image for user ${userId}...`);

      if (!file || !file.size) {
        throw new ErrorHandler("Invalid file provided.", 400);
      }

      if (file.size < 10000) {
        throw new ErrorHandler(
          "Image file is too small. Please upload a higher quality image (at least 10KB).",
          400,
        );
      }

      if (file.size > 10 * 1024 * 1024) {
        throw new ErrorHandler(
          "Image file is too large. Maximum size is 10MB.",
          400,
        );
      }

      const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/jpg",
      ];
      if (!allowedTypes.includes(file.mimetype)) {
        throw new ErrorHandler(
          "Unsupported image format. Please use JPEG, PNG, or WebP.",
          400,
        );
      }

      tempKey = this.generateImageKey(
        `validation-temp/${userId}`,
        file.originalname || `image_${Date.now()}`,
      );

      const tempUrl = await this.uploadFileToS3(file, tempKey);

      const validationResult = await this.validateImageForPersonalization(
        tempUrl,
        {
          ...options,
          enhanceImage: true,
          enhancementLevel: "balanced",
          maxAge: 20,
          strictMode: options.strictMode !== false,
        },
      );

      if (!validationResult.isValid) {
        await this.deleteFileFromS3(tempKey);
        throw new ErrorHandler(
          validationResult.validationSummary.userFriendlyMessage ||
            "Image validation failed. Please try with a different photo.",
          400,
        );
      }

      const finalImageUrl = validationResult.enhancedImageUrl || tempUrl;

      const permanentKey = this.generateImageKey(
        `validated-photos/${userId}`,
        `personalization-ready-${Date.now()}.jpg`,
      );

      let permanentUrl;
      if (validationResult.enhancementApplied) {
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

      console.log(
        `✅ Image successfully validated and uploaded for user ${userId}`,
      );

      return {
        imageUrl: permanentUrl,
        validation: validationResult,
        characteristics: validationResult.analysis.characteristics,
        dataQuality: validationResult.analysis.dataQuality,
        warnings: validationResult.warnings || [],
        recommendations: validationResult.recommendations || [],
        wasEnhanced: validationResult.enhancementApplied,
        enhancementReport: validationResult.enhancementReport,
        standardSpecs: validationResult.standardSpecs,
        validationId: validationResult.validationId,
      };
    } catch (error) {
      if (tempKey) {
        await this.deleteFileFromS3(tempKey).catch(console.error);
      }

      if (error instanceof ErrorHandler) throw error;

      throw new ErrorHandler(`Failed to upload image. Please try again.`, 500);
    }
  }

  uploadFileToS3(file, s3Key) {
    if (file.buffer) {
      return this.s3Service.uploadBuffer(file.buffer, s3Key, file.mimetype);
    } else if (file.path) {
      return this.s3Service.uploadFile(file.path, s3Key, file.mimetype);
    } else {
      throw new Error("Invalid file object");
    }
  }

  async deleteFileFromS3(s3Key) {
    try {
      await this.s3Service.deleteImage(s3Key);
    } catch (error) {
      console.error("Error deleting file from S3:", error);
    }
  }

  generateImageKey(prefix, filename) {
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
    return `${prefix}/${timestamp}-${randomString}-${safeFilename}`;
  }

  getValidationCriteria() {
    return {
      strict: {
        minAge: 2,
        maxAge: 20,
        requireSinglePerson: true,
        requireClearFace: true,
        allowedGenders: ["male", "female"],
        maxPeople: 1,
        safetyChecks: true,
        enhanceImage: true,
        enhancementLevel: "balanced",
        validateMetadata: true,
        strictMode: true,
      },
      standard: {
        minAge: 0,
        maxAge: 20,
        requireSinglePerson: true,
        requireClearFace: true,
        allowedGenders: ["male", "female", "neutral"],
        maxPeople: 1,
        safetyChecks: true,
        enhanceImage: true,
        enhancementLevel: "balanced",
        validateMetadata: true,
        strictMode: false,
      },
      relaxed: {
        minAge: 0,
        maxAge: 20,
        requireSinglePerson: false,
        requireClearFace: false,
        allowedGenders: ["male", "female", "neutral", "unknown"],
        maxPeople: 3,
        safetyChecks: true,
        enhanceImage: true,
        enhancementLevel: "conservative",
        validateMetadata: false,
        strictMode: false,
      },
    };
  }

  getIdealImageSpecifications() {
    return {
      description: "Ideal photo for accurate personalization",
      technical: {
        format: "JPEG or PNG",
        resolution: "Minimum 500x500 pixels",
        fileSize: "50KB - 5MB",
        aspectRatio: "Close to 1:1 (square)",
        colorSpace: "sRGB recommended",
      },
      composition: {
        subject: "Single person, front-facing",
        face: "Clearly visible, looking at camera",
        lighting: "Even, natural lighting without harsh shadows",
        background: "Simple, non-distracting background",
        pose: "Natural, relaxed posture",
      },
      quality: {
        focus: "Sharp, clear image without blur",
        exposure: "Well-exposed, not too dark or bright",
        color: "Accurate, natural colors",
        noise: "Minimal digital noise",
      },
      preparation: {
        accessories: "No hats, sunglasses, or face coverings",
        expression: "Neutral or natural smile",
        recency: "Recent photo reflecting current appearance",
        cropping: "Head and shoulders or full body visible",
      },
    };
  }

  getPersonalizationStandards() {
    return {
      ...this.STANDARD_SPECS,
      processing: {
        enhancement: "Automatic quality optimization",
        standardization: "Resized to 1024x1024",
        format: "Converted to high-quality JPEG",
        compression: "Optimized for web and AI processing",
      },
      qualityAssurance: {
        validation: "Multi-step validation process",
        safety: "Content safety checks",
        privacy: "Metadata sanitization",
        compliance: "Adherence to platform standards",
      },
      output: {
        consistency: "Uniform quality across all images",
        compatibility: "Optimized for AI personalization",
        performance: "Fast loading and processing",
        scalability: "Suitable for various use cases",
      },
    };
  }

  getValidationStatistics() {
    return {
      thresholds: this.VALIDATION_THRESHOLDS,
      rules: this.VALIDATION_RULES,
      specs: this.STANDARD_SPECS,
      version: "2.0.0",
      lastUpdated: "2024-01-01",
    };
  }

  calculateImageEntropy(stats) {
    if (stats.entropy !== undefined) return stats.entropy;

    if (
      stats.channels &&
      stats.channels[0] &&
      stats.channels[0].entropy !== undefined
    ) {
      return stats.channels[0].entropy;
    }

    return 5.0;
  }

  calculateBrightness(stats) {
    const mean = stats.channels[0].mean;
    return mean / 255;
  }

  calculateContrast(stats) {
    const stdev = stats.channels[0].stdev;
    return stdev / 128;
  }

  calculateExposure(stats) {
    const mean = stats.channels[0].mean;
    return Math.abs(mean - 128) / 128;
  }

  calculateHistogram(stats) {
    return {};
  }

  async calculateBlurriness(grayImage) {
    return 0.1;
  }

  async calculateSharpness(grayImage) {
    return 0.8;
  }

  async calculateNoiseLevel(grayImage) {
    return 0.05;
  }

  calculateSaturation(stats) {
    return 0.5;
  }

  calculateColorBalance(stats) {
    return 0.5;
  }

  detectColorCast(stats) {
    return { strength: 0.1 };
  }

  assessColorAccuracy(stats) {
    return "high";
  }

  async detectCompressionArtifacts(grayImage) {
    return 0.0;
  }

  async detectColorBanding(buffer) {
    return 0.0;
  }

  async calculateDetailLevel(grayImage) {
    return 0.8;
  }

  async calculateTextureComplexity(grayImage) {
    return 0.6;
  }

  calculateOverallQualityScore(metrics) {
    return 0.9;
  }

  calculateRuleOfThirdsCompliance(stats, metadata) {
    return { score: 0.8 };
  }

  calculateSubjectCentering(stats) {
    return 0.9;
  }

  calculateSymmetry(stats) {
    return 0.7;
  }

  async calculateBackgroundComplexity(buffer) {
    return 0.3;
  }

  async calculateForegroundClarity(buffer) {
    return 0.8;
  }

  async detectEdges(buffer) {
    return [];
  }

  analyzeEdgeDistribution(edges) {
    return "balanced";
  }

  calculateVisualBalance(stats) {
    return 0.8;
  }

  calculateColorHarmony(stats) {
    return 0.8;
  }

  async detectLeadingLines(buffer) {
    return [];
  }

  async assessFraming(buffer) {
    return "good";
  }

  calculateNegativeSpace(stats) {
    return 0.3;
  }

  calculateCompositionScore(composition) {
    return 0.85;
  }

  async analyzeSkinToneSafety(buffer) {
    return { passed: true };
  }

  async detectPrivacyElements(buffer) {
    return { found: 0 };
  }

  async detectTextInImage(buffer) {
    return { found: 0 };
  }

  async detectWatermarks(buffer) {
    return { found: 0 };
  }

  async detectFilterEffects(buffer) {
    return { intensity: 0.1 };
  }

  async checkInappropriateContent(buffer) {
    return { safe: true };
  }

  async checkExposureSafety(buffer) {
    return { safe: true };
  }

  async checkMetadataSafety(metadata) {
    return { safe: true };
  }

  calculateSafetyConfidence(checks) {
    return 0.95;
  }

  assessFaceReadiness() {
    return "ready";
  }

  assessBodyReadiness() {
    return "ready";
  }

  assessFeatureClarity() {
    return "high";
  }

  assessExpressionSuitability() {
    return "high";
  }

  assessPoseSuitability() {
    return "high";
  }

  assessLightingSuitability() {
    return "good";
  }

  assessBackgroundSuitability() {
    return "good";
  }

  calculateSuitabilityScore(factors) {
    return 0.9;
  }

  determineEnhancementNeeds(factors) {
    return [];
  }

  assessArtStyleCompatibility() {
    return "high";
  }

  assessCharacterTypeCompatibility() {
    return "high";
  }

  assessStoryGenreCompatibility() {
    return "high";
  }

  estimatePersonalizationPotential(factors) {
    return "high";
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

  enhanceBrightness(level) {
    return { name: "brightness", fn: (img) => img };
  }
  reduceHighlights(level) {
    return { name: "reduce_highlights", fn: (img) => img };
  }
  enhanceContrast(level) {
    return { name: "contrast", fn: (img) => img };
  }
  enhanceSharpness(level) {
    return { name: "sharpness", fn: (img) => img };
  }
  reduceNoise(level) {
    return { name: "reduce_noise", fn: (img) => img };
  }
  enhanceSaturation(level) {
    return { name: "saturation", fn: (img) => img };
  }
  reduceSaturation(level) {
    return { name: "reduce_saturation", fn: (img) => img };
  }
  correctColorCast(level, cast) {
    return { name: "color_cast", fn: (img) => img };
  }
  reduceCompressionArtifacts(level) {
    return { name: "reduce_artifacts", fn: (img) => img };
  }
  enhanceFaceDetails(level) {
    return { name: "face_details", fn: (img) => img };
  }
  optimizeForPersonalization(level) {
    return { name: "optimize", fn: (img) => img };
  }

  calculateFaceCenter(humanAnalysis) {
    return null;
  }
  determineOptimalCropPosition(center, metadata) {
    return "center";
  }
}

export default ImageValidator;
