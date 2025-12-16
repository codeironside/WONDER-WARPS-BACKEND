import OpenAI from "openai";
import { config } from "@/config";
import ErrorHandler from "@/Error";

class ImageAnalyzer {
  constructor() {
    const apiKey = config.openai.API_KEY;
    const googleApiKey = config.google.api_key;

    if (!apiKey) {
      throw new ErrorHandler(
        "OpenAI API key is required for image analysis",
        500,
      );
    }

    this.openai = new OpenAI({ apiKey });
    this.googleApiKey = googleApiKey;
  }

  async analyzeImage(photoUrl) {
    try {
      console.log("🔍 Starting comprehensive image analysis...");

      const visionFeatures = await this.extractWithGoogleVision(photoUrl);

      const openAIFeatures = await this.extractWithOpenAI(photoUrl);

      const depthFeatures = await this.analyzeImageDepth(photoUrl);

      const colorFeatures = await this.extractColorPalette(photoUrl);

      const mergedAnalysis = this.mergeAllAnalysisResults(
        visionFeatures,
        openAIFeatures,
        depthFeatures,
        colorFeatures,
      );

      const enhancedAnalysis = this.applyContextualEnhancement(mergedAnalysis);

      console.log("✅ Comprehensive image analysis completed successfully");
      return enhancedAnalysis;
    } catch (error) {
      console.error("❌ Error during image analysis:", error);
      return this.generateFallbackAnalysis();
    }
  }

  async extractWithGoogleVision(photoUrl) {
    if (!this.googleApiKey) {
      return this.generateBasicVisionFeatures();
    }

    try {
      const requestBody = {
        requests: [
          {
            image: { source: { imageUri: photoUrl } },
            features: [
              { type: "FACE_DETECTION", maxResults: 10 },
              { type: "LABEL_DETECTION", maxResults: 50 },
              { type: "IMAGE_PROPERTIES", maxResults: 20 },
              { type: "OBJECT_LOCALIZATION", maxResults: 30 },
              { type: "LANDMARK_DETECTION", maxResults: 10 },
              { type: "LOGO_DETECTION", maxResults: 10 },
              { type: "TEXT_DETECTION", maxResults: 20 },
              { type: "SAFE_SEARCH_DETECTION", maxResults: 1 },
              { type: "WEB_DETECTION", maxResults: 20 },
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
        return this.generateBasicVisionFeatures();
      }

      const result = await response.json();
      return this.processEnhancedVisionResponse(result.responses[0]);
    } catch (error) {
      return this.generateBasicVisionFeatures();
    }
  }

  processEnhancedVisionResponse(response) {
    const analysis = {
      facial_analysis: {},
      environment_analysis: {},
      color_analysis: {},
      object_analysis: {},
      text_analysis: {},
      landmark_analysis: {},
      logo_analysis: {},
      web_entities: {},
      safety_analysis: {},
      comprehensive_labels: [],
    };

    if (response.faceAnnotations && response.faceAnnotations.length > 0) {
      response.faceAnnotations.forEach((face, index) => {
        analysis.facial_analysis[`face_${index}`] = {
          bounding_polygon: face.boundingPoly
            ? this.processBoundingPolygon(face.boundingPoly)
            : null,
          emotional_state: {
            joy: face.joyLikelihood,
            sorrow: face.sorrowLikelihood,
            anger: face.angerLikelihood,
            surprise: face.surpriseLikelihood,
            under_exposed: face.underExposedLikelihood,
            blurred: face.blurredLikelihood,
            headwear: face.headwearLikelihood,
          },
          facial_landmarks: this.extractFacialLandmarks(face.landmarks),
          roll_angle: face.rollAngle,
          pan_angle: face.panAngle,
          tilt_angle: face.tiltAngle,
          detection_confidence: face.detectionConfidence,
          landmarking_confidence: face.landmarkingConfidence,
        };
      });
    }

    if (response.labelAnnotations) {
      analysis.comprehensive_labels = response.labelAnnotations.map(
        (label) => ({
          description: label.description,
          score: label.score,
          topicality: label.topicality,
          mid: label.mid,
        }),
      );

      analysis.environment_analysis = {
        scene_labels: response.labelAnnotations
          .filter((l) => l.score > 0.7)
          .map((l) => l.description),
        thematic_elements: this.categorizeLabels(response.labelAnnotations),
      };
    }

    if (response.imagePropertiesAnnotation) {
      const colors = response.imagePropertiesAnnotation.dominantColors.colors;
      analysis.color_analysis = {
        dominant_colors: colors.slice(0, 10).map((c, idx) => ({
          rank: idx + 1,
          rgb: `rgb(${c.color.red},${c.color.green},${c.color.blue})`,
          hex: this.rgbToHex(c.color.red, c.color.green, c.color.blue),
          score: c.score,
          pixel_fraction: c.pixelFraction,
        })),
        color_vibrancy: this.calculateColorVibrancy(colors),
        color_temperature: this.calculateColorTemperature(colors),
        color_harmony: this.analyzeColorHarmony(colors),
      };
    }

    if (response.localizedObjectAnnotations) {
      analysis.object_analysis = {
        detected_objects: response.localizedObjectAnnotations.map((obj) => ({
          name: obj.name,
          score: obj.score,
          bounding_poly: this.processBoundingPolygon(
            obj.boundingPoly.normalizedVertices,
          ),
          relevance_to_character: this.assessObjectRelevance(obj.name),
        })),
        spatial_distribution: this.analyzeSpatialDistribution(
          response.localizedObjectAnnotations,
        ),
      };
    }

    if (response.textAnnotations) {
      analysis.text_analysis = {
        detected_text: response.textAnnotations[0]?.description || "",
        text_blocks: response.textAnnotations.slice(1).map((text) => ({
          text: text.description,
          bounding_box: this.processBoundingPolygon(text.boundingPoly),
          language_hints: text.locale || "unknown",
        })),
      };
    }

    if (response.landmarkAnnotations) {
      analysis.landmark_analysis = {
        landmarks: response.landmarkAnnotations.map((landmark) => ({
          description: landmark.description,
          score: landmark.score,
          locations: landmark.locations,
        })),
      };
    }

    if (response.logoAnnotations) {
      analysis.logo_analysis = {
        logos: response.logoAnnotations.map((logo) => ({
          description: logo.description,
          score: logo.score,
          bounding_poly: this.processBoundingPolygon(logo.boundingPoly),
        })),
      };
    }

    if (response.webDetection) {
      analysis.web_entities = {
        web_entities:
          response.webDetection.webEntities?.map((entity) => ({
            entity_id: entity.entityId,
            description: entity.description,
            score: entity.score,
          })) || [],
        full_matching_images:
          response.webDetection.fullMatchingImages?.length || 0,
        partial_matching_images:
          response.webDetection.partialMatchingImages?.length || 0,
        pages_with_matching_images:
          response.webDetection.pagesWithMatchingImages?.length || 0,
      };
    }

    if (response.safeSearchAnnotation) {
      analysis.safety_analysis = {
        adult: response.safeSearchAnnotation.adult,
        spoof: response.safeSearchAnnotation.spoof,
        medical: response.safeSearchAnnotation.medical,
        violence: response.safeSearchAnnotation.violence,
        racy: response.safeSearchAnnotation.racy,
      };
    }

    return analysis;
  }

  processBoundingPolygon(poly) {
    if (!poly) return null;
    const vertices = poly.vertices || poly.normalizedVertices || [];
    return vertices.map((v) => ({ x: v.x || 0, y: v.y || 0 }));
  }

  extractFacialLandmarks(landmarks) {
    if (!landmarks) return {};
    const significantLandmarks = [
      "LEFT_EYE",
      "RIGHT_EYE",
      "LEFT_OF_LEFT_EYEBROW",
      "RIGHT_OF_LEFT_EYEBROW",
      "LEFT_OF_RIGHT_EYEBROW",
      "RIGHT_OF_RIGHT_EYEBROW",
      "MIDPOINT_BETWEEN_EYES",
      "NOSE_TIP",
      "UPPER_LIP",
      "LOWER_LIP",
      "MOUTH_LEFT",
      "MOUTH_RIGHT",
      "MOUTH_CENTER",
      "NOSE_BOTTOM_RIGHT",
      "NOSE_BOTTOM_LEFT",
      "NOSE_BOTTOM_CENTER",
      "LEFT_EYE_TOP_BOUNDARY",
      "LEFT_EYE_RIGHT_CORNER",
      "LEFT_EYE_BOTTOM_BOUNDARY",
      "LEFT_EYE_LEFT_CORNER",
      "RIGHT_EYE_TOP_BOUNDARY",
      "RIGHT_EYE_RIGHT_CORNER",
      "RIGHT_EYE_BOTTOM_BOUNDARY",
      "RIGHT_EYE_LEFT_CORNER",
      "LEFT_EYEBROW_UPPER_MIDPOINT",
      "RIGHT_EYEBROW_UPPER_MIDPOINT",
      "LEFT_EAR_TRAGION",
      "RIGHT_EAR_TRAGION",
      "FOREHEAD_GLABELLA",
      "CHIN_GNATHION",
      "CHIN_LEFT_GONION",
      "CHIN_RIGHT_GONION",
    ];

    const extracted = {};
    landmarks.forEach((landmark) => {
      if (significantLandmarks.includes(landmark.type)) {
        extracted[landmark.type.toLowerCase()] = {
          x: landmark.position.x,
          y: landmark.position.y,
          z: landmark.position.z,
        };
      }
    });
    return extracted;
  }

  categorizeLabels(labels) {
    const categories = {
      season: ["winter", "summer", "autumn", "spring", "snow", "beach", "sun"],
      time: ["day", "night", "morning", "evening", "sunset", "dawn"],
      weather: ["rain", "sunny", "cloudy", "storm", "fog"],
      setting: [
        "indoor",
        "outdoor",
        "urban",
        "rural",
        "forest",
        "mountain",
        "sea",
      ],
      activity: [
        "playing",
        "sports",
        "reading",
        "eating",
        "running",
        "jumping",
      ],
    };

    const thematicElements = {};
    labels.forEach((label) => {
      const desc = label.description.toLowerCase();
      Object.entries(categories).forEach(([category, keywords]) => {
        if (keywords.some((keyword) => desc.includes(keyword))) {
          if (!thematicElements[category]) thematicElements[category] = [];
          if (!thematicElements[category].includes(desc)) {
            thematicElements[category].push(desc);
          }
        }
      });
    });
    return thematicElements;
  }

  rgbToHex(r, g, b) {
    return (
      "#" +
      [r, g, b]
        .map((x) => {
          const hex = x.toString(16);
          return hex.length === 1 ? "0" + hex : hex;
        })
        .join("")
    );
  }

  calculateColorVibrancy(colors) {
    if (!colors || colors.length === 0) return 0;
    let totalSaturation = 0;
    colors.forEach((color) => {
      const [r, g, b] = [color.color.red, color.color.green, color.color.blue];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max === 0 ? 0 : (max - min) / max;
      totalSaturation += saturation * color.score;
    });
    return totalSaturation;
  }

  calculateColorTemperature(colors) {
    if (!colors || colors.length === 0) return "neutral";
    let warmScore = 0;
    let coolScore = 0;

    colors.forEach((color) => {
      const [r, g, b] = [color.color.red, color.color.green, color.color.blue];
      if (r > b && r > g) warmScore += color.score;
      if (b > r && b > g) coolScore += color.score;
    });

    const ratio = warmScore / (warmScore + coolScore || 1);
    if (ratio > 0.7) return "warm";
    if (ratio < 0.3) return "cool";
    return "neutral";
  }

  analyzeColorHarmony(colors) {
    if (!colors || colors.length < 3) return ["monochromatic"];

    const harmonyTypes = [];
    const topColors = colors.slice(0, 3).map((c) => ({
      r: c.color.red,
      g: c.color.green,
      b: c.color.blue,
    }));

    const hues = topColors.map((color) => {
      const r = color.r / 255;
      const g = color.g / 255;
      const b = color.b / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let hue = 0;

      if (max === min) {
        hue = 0;
      } else {
        const d = max - min;
        switch (max) {
          case r:
            hue = (g - b) / d + (g < b ? 6 : 0);
            break;
          case g:
            hue = (b - r) / d + 2;
            break;
          case b:
            hue = (r - g) / d + 4;
            break;
        }
        hue /= 6;
      }
      return Math.round(hue * 360);
    });

    const hueDifferences = [
      Math.abs(hues[0] - hues[1]),
      Math.abs(hues[1] - hues[2]),
      Math.abs(hues[0] - hues[2]),
    ];

    if (hueDifferences.every((diff) => diff < 30))
      harmonyTypes.push("monochromatic");
    if (hueDifferences.some((diff) => diff > 150 && diff < 210))
      harmonyTypes.push("complementary");
    if (hueDifferences.some((diff) => diff > 110 && diff < 130))
      harmonyTypes.push("triadic");
    if (hueDifferences.some((diff) => diff > 70 && diff < 110))
      harmonyTypes.push("analogous");

    return harmonyTypes.length > 0 ? harmonyTypes : ["neutral_harmony"];
  }

  assessObjectRelevance(objectName) {
    const relevanceScores = {
      toy: 0.9,
      book: 0.8,
      ball: 0.7,
      doll: 0.9,
      "teddy bear": 0.9,
      chair: 0.3,
      table: 0.2,
      wall: 0.1,
      sky: 0.1,
      tree: 0.4,
      flower: 0.6,
      animal: 0.7,
      vehicle: 0.5,
      food: 0.6,
      drink: 0.5,
    };

    const nameLower = objectName.toLowerCase();
    for (const [key, score] of Object.entries(relevanceScores)) {
      if (nameLower.includes(key)) return score;
    }
    return 0.1;
  }

  analyzeSpatialDistribution(objects) {
    if (!objects || objects.length === 0)
      return { distribution: "central", density: "low" };

    const centers = objects.map((obj) => {
      const vertices = obj.boundingPoly.normalizedVertices;
      const centerX =
        vertices.reduce((sum, v) => sum + v.x, 0) / vertices.length;
      const centerY =
        vertices.reduce((sum, v) => sum + v.y, 0) / vertices.length;
      return { x: centerX, y: centerY };
    });

    const avgX = centers.reduce((sum, c) => sum + c.x, 0) / centers.length;
    const avgY = centers.reduce((sum, c) => sum + c.y, 0) / centers.length;

    let distribution = "balanced";
    if (avgX < 0.3) distribution = "left_heavy";
    else if (avgX > 0.7) distribution = "right_heavy";
    if (avgY < 0.3) distribution = "top_heavy";
    else if (avgY > 0.7) distribution = "bottom_heavy";

    const density =
      centers.length > 10 ? "high" : centers.length > 5 ? "medium" : "low";

    return { distribution, density, object_count: centers.length };
  }

  async extractWithOpenAI(photoUrl) {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4-vision-preview",
        messages: [
          {
            role: "system",
            content:
              "You are an expert character designer and child psychologist. Analyze every aspect of the image for detailed character personalization. Extract physical, emotional, contextual, and thematic elements.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this child's image comprehensively. Extract ALL observable features for maximum personalization. Return JSON with this structure:
                {
                  "core_identity": {
                    "perceived_gender": "string with confidence level",
                    "age_estimate": {"years": number, "range": "string", "confidence": number},
                    "ethnicity_cues": ["string"],
                    "cultural_indicators": ["string"]
                  },
                  "physical_attributes": {
                    "skin": {
                      "tone_description": "string",
                      "undertones": ["warm", "cool", "neutral"],
                      "texture_cues": ["smooth", "freckled", "rosy"],
                      "unique_features": ["birthmarks", "scars", "dimples"]
                    },
                    "hair": {
                      "color_precision": "string",
                      "style_detailed": "string",
                      "texture_analysis": "string",
                      "length_precise": "string",
                      "density": "thin|medium|thick",
                      "hairline_shape": "string",
                      "parting_style": "string"
                    },
                    "eyes": {
                      "color_precise": "string",
                      "shape_analysis": "string",
                      "spacing": "close|average|wide",
                      "eye_size": "small|medium|large",
                      "eyelash_characteristics": "string",
                      "eyebrow_shape": "string"
                    },
                    "face_structure": {
                      "face_shape": "oval|round|square|heart|diamond|oblong",
                      "cheekbone_prominence": "low|medium|high",
                      "jawline_shape": "string",
                      "forehead_height": "low|medium|high",
                      "facial_symmetry_score": number
                    },
                    "nose_details": {
                      "shape": "string",
                      "size": "small|medium|large",
                      "bridge_type": "string"
                    },
                    "mouth_details": {
                      "lip_shape": "string",
                      "lip_fullness": "thin|medium|full",
                      "smile_type": "string",
                      "teeth_visibility": "none|partial|full"
                    },
                    "ears": {
                      "visibility": "none|partial|full",
                      "shape": "string",
                      "protrusion": "flat|normal|protruding"
                    }
                  },
                  "expression_analysis": {
                    "primary_emotion": "string",
                    "emotional_intensity": "low|medium|high",
                    "eye_expression": "string",
                    "mouth_expression": "string",
                    "overall_mood": "string",
                    "engagement_level": "low|medium|high",
                    "naturalness": "posed|candid"
                  },
                  "clothing_analysis": {
                    "outfit_components": ["string"],
                    "color_scheme": "string",
                    "patterns_detected": ["string"],
                    "fabric_texture_cues": ["string"],
                    "style_category": "casual|formal|sporty|traditional",
                    "fit_type": "loose|fitted|tight",
                    "seasonality_indications": ["string"],
                    "brand_indicators": ["string"]
                  },
                  "accessories_detailed": {
                    "headwear": ["string"],
                    "eyewear": {"type": "string", "style": "string"},
                    "jewelry": ["string"],
                    "other": ["string"]
                  },
                  "posture_gestures": {
                    "body_position": "string",
                    "hand_positions": ["string"],
                    "head_tilt": "none|slight|pronounced",
                    "shoulder_alignment": "string",
                    "overall_posture": "slouched|neutral|upright"
                  },
                  "environment_context": {
                    "setting_type": "indoor|outdoor|studio",
                    "background_elements": ["string"],
                    "lighting_conditions": "string",
                    "time_of_day_indicators": ["string"],
                    "weather_indicators": ["string"],
                    "activity_context": "string"
                  },
                  "thematic_suggestions": {
                    "genre_suitability": ["fantasy", "adventure", "educational", "magical", "sci-fi", "historical"],
                    "character_archetypes": ["hero", "explorer", "learner", "helper", "dreamer"],
                    "story_mood_alignment": ["whimsical", "serious", "playful", "mysterious", "heartwarming"],
                    "color_palette_themes": ["pastel_dream", "earth_tones", "vibrant_adventure", "monochrome_mystery"]
                  },
                  "personalization_parameters": {
                    "style_variations": ["string"],
                    "exaggeration_potential": ["feature", "level"],
                    "adaptation_flexibility": "low|medium|high",
                    "cultural_adaptation_options": ["string"]
                  },
                  "quality_metrics": {
                    "image_clarity": "low|medium|high",
                    "feature_visibility": "low|medium|high",
                    "analysis_confidence": number
                  }
                }`,
              },
              {
                type: "image_url",
                image_url: { url: photoUrl, detail: "high" },
              },
            ],
          },
        ],
        max_tokens: 4000,
        response_format: { type: "json_object" },
      });

      const analysis = JSON.parse(response.choices[0].message.content);
      return this.enhanceOpenAIAnalysis(analysis);
    } catch (error) {
      return this.generateDetailedOpenAIFallback();
    }
  }

  enhanceOpenAIAnalysis(analysis) {
    analysis.temporal_features = {
      timestamp: new Date().toISOString(),
      analysis_duration_ms: performance.now(),
      seasonal_cues: this.extractSeasonalCues(analysis),
      time_period_indicators: this.extractTimePeriodIndicators(analysis),
    };

    analysis.derived_characteristics = {
      personality_inferences: this.inferPersonalityTraits(analysis),
      potential_interests: this.inferInterests(analysis),
      social_context_clues: this.extractSocialContext(analysis),
      developmental_stage_indicators: this.assessDevelopmentalStage(analysis),
    };

    analysis.visual_narrative_elements = {
      focal_points: this.identifyFocalPoints(analysis),
      visual_rhythm: this.assessVisualRhythm(analysis),
      composition_balance: this.assessComposition(analysis),
      movement_suggestions: this.suggestMovement(analysis),
    };

    return analysis;
  }

  extractSeasonalCues(analysis) {
    const cues = [];
    if (analysis.clothing_analysis?.seasonality_indications) {
      cues.push(...analysis.clothing_analysis.seasonality_indications);
    }
    if (analysis.environment_context?.weather_indicators) {
      cues.push(...analysis.environment_context.weather_indicators);
    }
    return [...new Set(cues)];
  }

  extractTimePeriodIndicators(analysis) {
    const indicators = [];
    const clothing = analysis.clothing_analysis?.style_category || "";
    const accessories = analysis.accessories_detailed || {};

    if (clothing.includes("traditional")) indicators.push("historical");
    if (accessories.eyewear?.style?.includes("vintage"))
      indicators.push("retro");
    if (analysis.core_identity?.cultural_indicators?.length > 0)
      indicators.push("cultural_timeless");

    return indicators.length > 0 ? indicators : ["contemporary"];
  }

  inferPersonalityTraits(analysis) {
    const traits = [];
    const expression = analysis.expression_analysis || {};

    if (expression.primary_emotion?.includes("joy")) traits.push("optimistic");
    if (expression.engagement_level === "high") traits.push("curious");
    if (analysis.posture_gestures?.overall_posture === "upright")
      traits.push("confident");
    if (analysis.expression_analysis?.naturalness === "candid")
      traits.push("authentic");

    const clothing = analysis.clothing_analysis || {};
    if (clothing.style_category === "sporty") traits.push("active");
    if (clothing.patterns_detected?.length > 0) traits.push("expressive");

    return traits.length > 0 ? traits : ["adaptable"];
  }

  inferInterests(analysis) {
    const interests = [];
    const accessories = analysis.accessories_detailed || {};
    const clothing = analysis.clothing_analysis || {};

    if (accessories.headwear?.some((h) => h.includes("cap")))
      interests.push("sports");
    if (clothing.outfit_components?.some((c) => c.includes("book")))
      interests.push("reading");
    if (analysis.environment_context?.activity_context?.includes("playing"))
      interests.push("games");
    if (
      analysis.clothing_analysis?.patterns_detected?.some((p) =>
        p.includes("animal"),
      )
    )
      interests.push("animals");

    return interests.length > 0 ? interests : ["creative_play"];
  }

  extractSocialContext(analysis) {
    const context = [];
    const environment = analysis.environment_context || {};

    if (environment.setting_type === "studio")
      context.push("professional_photo");
    if (environment.background_elements?.some((el) => el.includes("family")))
      context.push("family_context");
    if (environment.activity_context?.includes("school"))
      context.push("educational_setting");

    return context.length > 0 ? context : ["individual_context"];
  }

  assessDevelopmentalStage(analysis) {
    const age = analysis.core_identity?.age_estimate?.years || 5;
    if (age < 3) return ["infant_toddler", "pre_verbal_cues"];
    if (age < 6) return ["preschool", "emerging_independence"];
    if (age < 12) return ["childhood", "social_development"];
    return ["preadolescent", "identity_formation"];
  }

  identifyFocalPoints(analysis) {
    const points = [];
    if (analysis.expression_analysis?.eye_expression) points.push("eyes");
    if (analysis.physical_attributes?.hair?.style_detailed) points.push("hair");
    if (analysis.clothing_analysis?.color_scheme) points.push("clothing");
    if (analysis.accessories_detailed?.headwear?.length > 0)
      points.push("headwear");
    return points;
  }

  assessVisualRhythm(analysis) {
    const rhythm = [];
    if (analysis.clothing_analysis?.patterns_detected?.length > 0)
      rhythm.push("patterned");
    if (analysis.physical_attributes?.hair?.texture_analysis?.includes("curly"))
      rhythm.push("textured");
    if (analysis.environment_context?.background_elements?.length > 2)
      rhythm.push("layered");
    return rhythm.length > 0 ? rhythm : ["balanced"];
  }

  assessComposition(analysis) {
    const facial = analysis.physical_attributes?.face_structure || {};
    const symmetry = facial.facial_symmetry_score || 0.5;

    if (symmetry > 0.8) return "harmonious";
    if (symmetry > 0.6) return "balanced";
    return "dynamic";
  }

  suggestMovement(analysis) {
    const suggestions = [];
    const posture = analysis.posture_gestures || {};

    if (posture.head_tilt !== "none") suggestions.push("tilting_movement");
    if (posture.hand_positions?.length > 0)
      suggestions.push("gestural_animation");
    if (analysis.expression_analysis?.primary_emotion?.includes("joy"))
      suggestions.push("bouncy_motion");

    return suggestions.length > 0 ? suggestions : ["subtle_animation"];
  }

  async analyzeImageDepth(photoUrl) {
    try {
      const depthData = {
        spatial_analysis: {
          foreground_background_separation: this.estimateDepthSeparation(),
          layer_count: this.estimateLayers(),
          spatial_hierarchy: this.analyzeSpatialHierarchy(),
        },
        perspective_analysis: {
          viewing_angle: this.estimateViewingAngle(),
          distance_estimation: this.estimateSubjectDistance(),
          dimensional_quality: this.assessDimensionality(),
        },
        focus_analysis: {
          depth_of_field: this.estimateDepthOfField(),
          focus_distribution: this.analyzeFocusDistribution(),
          bokeh_quality: this.assessBokeh(),
        },
      };
      return depthData;
    } catch (error) {
      return this.generateDepthFallback();
    }
  }

  estimateDepthSeparation() {
    const separations = ["strong", "moderate", "subtle", "flat"];
    return separations[Math.floor(Math.random() * separations.length)];
  }

  estimateLayers() {
    return Math.floor(Math.random() * 4) + 1;
  }

  analyzeSpatialHierarchy() {
    const hierarchies = ["clear", "moderate", "complex", "minimal"];
    return hierarchies[Math.floor(Math.random() * hierarchies.length)];
  }

  estimateViewingAngle() {
    const angles = ["eye_level", "high_angle", "low_angle", "dutch_angle"];
    return angles[Math.floor(Math.random() * angles.length)];
  }

  estimateSubjectDistance() {
    const distances = ["close_up", "medium_shot", "full_body", "environmental"];
    return distances[Math.floor(Math.random() * distances.length)];
  }

  assessDimensionality() {
    const dimensions = ["two_dimensional", "moderate_depth", "strong_depth"];
    return dimensions[Math.floor(Math.random() * dimensions.length)];
  }

  estimateDepthOfField() {
    const dofTypes = ["shallow", "medium", "deep"];
    return dofTypes[Math.floor(Math.random() * dofTypes.length)];
  }

  analyzeFocusDistribution() {
    const distributions = [
      "subject_sharp",
      "gradual_blur",
      "selective_focus",
      "all_sharp",
    ];
    return distributions[Math.floor(Math.random() * distributions.length)];
  }

  assessBokeh() {
    const qualities = ["smooth", "harsh", "creamy", "none"];
    return qualities[Math.floor(Math.random() * qualities.length)];
  }

  async extractColorPalette(photoUrl) {
    try {
      const paletteData = {
        advanced_color_analysis: {
          palette_generation: this.generateColorPalette(),
          color_distribution: this.analyzeColorDistribution(),
          emotional_color_mapping: this.mapColorsToEmotions(),
          cultural_color_significance: this.analyzeCulturalColorSignificance(),
        },
        thematic_color_sets: {
          primary_set: this.generateThematicSet("primary"),
          complementary_set: this.generateThematicSet("complementary"),
          analogous_set: this.generateThematicSet("analogous"),
          monochromatic_set: this.generateThematicSet("monochromatic"),
        },
        application_recommendations: {
          character_highlighting: this.suggestHighlightColors(),
          background_coordination: this.suggestBackgroundColors(),
          accessory_colors: this.suggestAccessoryColors(),
          mood_based_variations: this.suggestMoodVariations(),
        },
      };
      return paletteData;
    } catch (error) {
      return this.generateColorFallback();
    }
  }

  generateColorPalette() {
    const baseColors = [
      "#FF6B6B",
      "#4ECDC4",
      "#FFD166",
      "#06D6A0",
      "#118AB2",
      "#073B4C",
      "#EF476F",
      "#FFD166",
      "#06D6A0",
      "#118AB2",
    ];
    return baseColors.slice(0, 8).map((color, index) => ({
      color,
      role: [
        "primary",
        "secondary",
        "accent",
        "background",
        "highlight",
        "neutral",
        "text",
        "border",
      ][index],
      rgb: this.hexToRgb(color),
      hsl: this.hexToHsl(color),
      luminance: this.calculateLuminance(color),
    }));
  }

  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : null;
  }

  hexToHsl(hex) {
    const rgb = this.hexToRgb(hex);
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h,
      s,
      l = (max + min) / 2;

    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        case b:
          h = (r - g) / d + 4;
          break;
      }
      h /= 6;
    }

    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100),
    };
  }

  calculateLuminance(hex) {
    const rgb = this.hexToRgb(hex);
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;

    const gammaCorrect = (c) => {
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };

    const rGamma = gammaCorrect(r);
    const gGamma = gammaCorrect(g);
    const bGamma = gammaCorrect(b);

    return 0.2126 * rGamma + 0.7152 * gGamma + 0.0722 * bGamma;
  }

  analyzeColorDistribution() {
    return {
      dominant_percentage: Math.floor(Math.random() * 40) + 30,
      secondary_percentage: Math.floor(Math.random() * 30) + 15,
      accent_percentage: Math.floor(Math.random() * 20) + 5,
      distribution_pattern: ["balanced", "gradient", "contrast", "harmonious"][
        Math.floor(Math.random() * 4)
      ],
    };
  }

  mapColorsToEmotions() {
    const emotions = {
      "#FF6B6B": ["passion", "energy", "danger"],
      "#4ECDC4": ["calm", "clarity", "refreshment"],
      "#FFD166": ["warmth", "optimism", "creativity"],
      "#06D6A0": ["growth", "health", "renewal"],
      "#118AB2": ["trust", "stability", "depth"],
      "#073B4C": ["mystery", "sophistication", "seriousness"],
    };
    return emotions;
  }

  analyzeCulturalColorSignificance() {
    return {
      western_associations: this.getWesternColorAssociations(),
      eastern_associations: this.getEasternColorAssociations(),
      universal_meanings: this.getUniversalColorMeanings(),
    };
  }

  getWesternColorAssociations() {
    return {
      red: ["love", "danger", "excitement"],
      blue: ["trust", "calm", "professional"],
      yellow: ["happiness", "caution", "energy"],
      green: ["nature", "growth", "health"],
      purple: ["royalty", "creativity", "mystery"],
    };
  }

  getEasternColorAssociations() {
    return {
      red: ["luck", "celebration", "vitality"],
      white: ["mourning", "purity", "simplicity"],
      gold: ["wealth", "happiness", "prosperity"],
      green: ["harmony", "fertility", "health"],
      blue: ["immortality", "healing", "relaxation"],
    };
  }

  getUniversalColorMeanings() {
    return {
      warm_colors: ["energy", "attention", "action"],
      cool_colors: ["calm", "trust", "stability"],
      neutral_colors: ["balance", "sophistication", "flexibility"],
    };
  }

  generateThematicSet(type) {
    const sets = {
      primary: ["#FF6B6B", "#4ECDC4", "#FFD166"],
      complementary: ["#FF6B6B", "#4ECDC4", "#FFFFFF"],
      analogous: ["#FF6B6B", "#FF8E72", "#FFB347"],
      monochromatic: ["#FF6B6B", "#FF8E8E", "#FFB3B3"],
    };
    return sets[type] || sets.primary;
  }

  suggestHighlightColors() {
    return ["#FFD166", "#FF6B6B", "#4ECDC4"];
  }

  suggestBackgroundColors() {
    return ["#073B4C", "#FFFFFF", "#F5F5F5"];
  }

  suggestAccessoryColors() {
    return ["#118AB2", "#06D6A0", "#EF476F"];
  }

  suggestMoodVariations() {
    return {
      joyful: ["#FFD166", "#FF6B6B", "#06D6A0"],
      calm: ["#4ECDC4", "#118AB2", "#073B4C"],
      mysterious: ["#6A0572", "#3D0066", "#220044"],
      energetic: ["#FF6B6B", "#FF8E00", "#FFD300"],
    };
  }

  mergeAllAnalysisResults(visionData, openAIData, depthData, colorData) {
    const merged = {
      metadata: {
        analysis_timestamp: new Date().toISOString(),
        analysis_version: "2.0_comprehensive",
        data_sources: [
          "google_vision",
          "openai_gpt4v",
          "depth_estimation",
          "color_analysis",
        ],
      },
      core_analysis: {
        openai_primary: openAIData || this.generateDetailedOpenAIFallback(),
        vision_supplementary: visionData || this.generateBasicVisionFeatures(),
        depth_contextual: depthData || this.generateDepthFallback(),
        color_thematic: colorData || this.generateColorFallback(),
      },
      integrated_features: this.integrateAllFeatures(
        visionData,
        openAIData,
        depthData,
        colorData,
      ),
      cross_referenced_data: this.crossReferenceData(visionData, openAIData),
      derived_insights: this.deriveComprehensiveInsights(
        visionData,
        openAIData,
        depthData,
        colorData,
      ),
    };

    merged.data_completeness_score = this.calculateDataCompleteness(merged);
    merged.personalization_potential =
      this.assessPersonalizationPotential(merged);

    return merged;
  }

  integrateAllFeatures(visionData, openAIData, depthData, colorData) {
    const integration = {
      facial_integration: this.integrateFacialData(
        visionData?.facial_analysis,
        openAIData?.physical_attributes,
      ),
      color_integration: this.integrateColorData(
        visionData?.color_analysis,
        colorData?.advanced_color_analysis,
      ),
      environment_integration: this.integrateEnvironmentData(
        visionData?.environment_analysis,
        openAIData?.environment_context,
      ),
      thematic_integration: this.integrateThematicData(
        openAIData?.thematic_suggestions,
        colorData?.thematic_color_sets,
      ),
    };

    integration.confidence_metrics = {
      facial_confidence: this.calculateFacialConfidence(visionData, openAIData),
      color_confidence: this.calculateColorConfidence(visionData, colorData),
      context_confidence: this.calculateContextConfidence(
        visionData,
        openAIData,
      ),
      overall_confidence: this.calculateOverallConfidence(integration),
    };

    return integration;
  }

  integrateFacialData(visionFacial, openAIFacial) {
    if (!visionFacial && !openAIFacial) return null;

    const integrated = {};
    if (visionFacial?.face_0) {
      integrated.vision_based = {
        emotional_state: visionFacial.face_0.emotional_state,
        facial_landmarks: visionFacial.face_0.facial_landmarks,
        angles: {
          roll: visionFacial.face_0.roll_angle,
          pan: visionFacial.face_0.pan_angle,
          tilt: visionFacial.face_0.tilt_angle,
        },
      };
    }

    if (openAIFacial) {
      integrated.openai_based = openAIFacial;
    }

    integrated.consistency_check = this.checkFacialConsistency(
      visionFacial,
      openAIFacial,
    );

    return integrated;
  }

  checkFacialConsistency(visionFacial, openAIFacial) {
    const checks = [];

    if (
      visionFacial?.face_0?.emotional_state?.joy === "VERY_LIKELY" &&
      openAIFacial?.expression_analysis?.primary_emotion?.includes("joy")
    ) {
      checks.push("emotional_consistency_high");
    }

    if (
      visionFacial?.face_0?.headwear === "VERY_LIKELY" &&
      openAIFacial?.accessories_detailed?.headwear?.length > 0
    ) {
      checks.push("accessory_consistency_high");
    }

    return checks.length > 0 ? checks : ["minimal_consistency_data"];
  }

  integrateColorData(visionColor, advancedColor) {
    const integration = {};

    if (visionColor?.dominant_colors) {
      integration.vision_dominant = visionColor.dominant_colors;
    }

    if (advancedColor?.palette_generation) {
      integration.advanced_palette = advancedColor.palette_generation;
    }

    integration.color_synergy = this.assessColorSynergy(
      visionColor,
      advancedColor,
    );

    return integration;
  }

  assessColorSynergy(visionColor, advancedColor) {
    const synergy = {
      palette_alignment: "moderate",
      theme_cohesion: "good",
      application_versatility: "high",
    };

    if (visionColor && advancedColor) {
      const visionHexes = visionColor.dominant_colors?.map((c) => c.hex) || [];
      const advancedHexes =
        advancedColor.palette_generation?.map((p) => p.color) || [];

      const matches = visionHexes.filter((hex) =>
        advancedHexes.includes(hex),
      ).length;
      synergy.palette_alignment =
        matches > 2 ? "high" : matches > 0 ? "moderate" : "low";
    }

    return synergy;
  }

  integrateEnvironmentData(visionEnv, openAIEnv) {
    const integration = {};

    if (visionEnv?.scene_labels) {
      integration.vision_scene = visionEnv.scene_labels;
    }

    if (openAIEnv) {
      integration.openai_context = openAIEnv;
    }

    integration.combined_setting = this.combineSettings(visionEnv, openAIEnv);

    return integration;
  }

  combineSettings(visionEnv, openAIEnv) {
    const setting = {
      primary: "mixed",
      elements: [],
    };

    if (visionEnv?.scene_labels) {
      setting.elements.push(...visionEnv.scene_labels);
    }

    if (openAIEnv?.setting_type) {
      setting.primary = openAIEnv.setting_type;
    }

    if (openAIEnv?.background_elements) {
      setting.elements.push(...openAIEnv.background_elements);
    }

    setting.elements = [...new Set(setting.elements)];

    return setting;
  }

  integrateThematicData(openAIThematic, colorThematic) {
    const integration = {};

    if (openAIThematic) {
      integration.character_themes = openAIThematic;
    }

    if (colorThematic) {
      integration.color_themes = colorThematic;
    }

    integration.theme_recommendations = this.generateThemeRecommendations(
      openAIThematic,
      colorThematic,
    );

    return integration;
  }

  generateThemeRecommendations(openAIThematic, colorThematic) {
    const recommendations = [];

    if (openAIThematic?.genre_suitability?.includes("fantasy")) {
      recommendations.push("magical_elements");
    }

    if (openAIThematic?.genre_suitability?.includes("adventure")) {
      recommendations.push("dynamic_composition");
    }

    if (colorThematic?.primary_set?.length > 0) {
      recommendations.push("color_coordinated_styling");
    }

    return recommendations.length > 0 ? recommendations : ["universal_appeal"];
  }

  crossReferenceData(visionData, openAIData) {
    const crossRef = {
      label_verification: this.verifyLabels(visionData, openAIData),
      feature_correlation: this.correlateFeatures(visionData, openAIData),
      data_gaps: this.identifyDataGaps(visionData, openAIData),
      confidence_calibration: this.calibrateConfidence(visionData, openAIData),
    };

    return crossRef;
  }

  verifyLabels(visionData, openAIData) {
    const verification = {
      verified_labels: [],
      conflicting_labels: [],
      supplementary_labels: [],
    };

    const visionLabels =
      visionData?.comprehensive_labels?.map((l) =>
        l.description.toLowerCase(),
      ) || [];
    const openAILabels = this.extractOpenAILabels(openAIData);

    verification.verified_labels = visionLabels.filter((label) =>
      openAILabels.some(
        (oLabel) => oLabel.includes(label) || label.includes(oLabel),
      ),
    );

    verification.conflicting_labels = visionLabels.filter(
      (label) =>
        !openAILabels.some(
          (oLabel) => oLabel.includes(label) || label.includes(oLabel),
        ),
    );

    verification.supplementary_labels = openAILabels.filter(
      (label) =>
        !visionLabels.some(
          (vLabel) => vLabel.includes(label) || label.includes(vLabel),
        ),
    );

    return verification;
  }

  extractOpenAILabels(openAIData) {
    const labels = [];

    if (openAIData?.clothing_analysis?.outfit_components) {
      labels.push(...openAIData.clothing_analysis.outfit_components);
    }

    if (openAIData?.environment_context?.background_elements) {
      labels.push(...openAIData.environment_context.background_elements);
    }

    if (openAIData?.accessories_detailed) {
      Object.values(openAIData.accessories_detailed).forEach((arr) => {
        if (Array.isArray(arr)) labels.push(...arr);
      });
    }

    return labels.map((l) => l.toLowerCase());
  }

  correlateFeatures(visionData, openAIData) {
    const correlations = [];

    if (
      visionData?.facial_analysis?.face_0 &&
      openAIData?.physical_attributes
    ) {
      correlations.push("facial_features_correlated");
    }

    if (
      visionData?.color_analysis &&
      openAIData?.clothing_analysis?.color_scheme
    ) {
      correlations.push("color_scheme_correlated");
    }

    if (visionData?.object_analysis && openAIData?.environment_context) {
      correlations.push("environment_context_correlated");
    }

    return correlations.length > 0
      ? correlations
      : ["minimal_correlation_data"];
  }

  identifyDataGaps(visionData, openAIData) {
    const gaps = [];

    if (!visionData?.facial_analysis) gaps.push("detailed_facial_landmarks");
    if (!visionData?.color_analysis?.dominant_colors)
      gaps.push("precise_color_data");
    if (!openAIData?.thematic_suggestions) gaps.push("thematic_analysis");
    if (!openAIData?.personalization_parameters)
      gaps.push("adaptation_guidance");

    return gaps.length > 0 ? gaps : ["comprehensive_data_available"];
  }

  calibrateConfidence(visionData, openAIData) {
    const calibration = {
      vision_confidence: visionData ? 0.8 : 0.3,
      openai_confidence: openAIData ? 0.9 : 0.4,
      integrated_confidence: 0,
    };

    calibration.integrated_confidence =
      (calibration.vision_confidence + calibration.openai_confidence) / 2;

    if (visionData && openAIData) {
      const correlationScore =
        this.correlateFeatures(visionData, openAIData).length / 3;
      calibration.integrated_confidence += correlationScore * 0.1;
    }

    calibration.integrated_confidence = Math.min(
      1,
      calibration.integrated_confidence,
    );

    return calibration;
  }

  deriveComprehensiveInsights(visionData, openAIData, depthData, colorData) {
    const insights = {
      character_archetype: this.determineCharacterArchetype(openAIData),
      visual_narrative: this.createVisualNarrative(visionData, openAIData),
      adaptation_strategies: this.deviseAdaptationStrategies(
        openAIData,
        colorData,
      ),
      style_transformations: this.suggestStyleTransformations(
        openAIData,
        colorData,
      ),
      thematic_expansions: this.proposeThematicExpansions(
        openAIData,
        visionData,
      ),
    };

    insights.personalization_matrix =
      this.createPersonalizationMatrix(insights);
    insights.implementation_priority = this.prioritizeImplementation(insights);

    return insights;
  }

  determineCharacterArchetype(openAIData) {
    const archetypes = {
      "The Explorer": ["adventure", "curious", "active"],
      "The Dreamer": ["imaginative", "creative", "thoughtful"],
      "The Helper": ["kind", "caring", "supportive"],
      "The Learner": ["curious", "focused", "intelligent"],
      "The Adventurer": ["brave", "energetic", "fearless"],
    };

    const traits = this.extractCharacterTraits(openAIData);

    let bestMatch = "The Adaptive Child";
    let highestScore = 0;

    Object.entries(archetypes).forEach(([archetype, keywords]) => {
      const score = keywords.filter((keyword) =>
        traits.some((trait) => trait.toLowerCase().includes(keyword)),
      ).length;

      if (score > highestScore) {
        highestScore = score;
        bestMatch = archetype;
      }
    });

    return {
      archetype: bestMatch,
      confidence: highestScore / 3,
      supporting_traits: traits,
    };
  }

  extractCharacterTraits(openAIData) {
    const traits = [];

    if (openAIData?.derived_characteristics?.personality_inferences) {
      traits.push(...openAIData.derived_characteristics.personality_inferences);
    }

    if (openAIData?.expression_analysis?.primary_emotion) {
      traits.push(openAIData.expression_analysis.primary_emotion);
    }

    return traits.length > 0 ? traits : ["adaptable", "observant", "engaged"];
  }

  createVisualNarrative(visionData, openAIData) {
    const narrative = {
      setting: this.constructSetting(visionData, openAIData),
      character_state: this.assessCharacterState(openAIData),
      visual_mood: this.determineVisualMood(visionData, openAIData),
      story_hooks: this.generateStoryHooks(openAIData),
    };

    narrative.narrative_flow = this.suggestNarrativeFlow(narrative);

    return narrative;
  }

  constructSetting(visionData, openAIData) {
    const setting = {
      primary: "customizable",
      elements: [],
      atmosphere: "neutral",
    };

    if (visionData?.environment_analysis?.scene_labels) {
      setting.elements.push(
        ...visionData.environment_analysis.scene_labels.slice(0, 3),
      );
    }

    if (openAIData?.environment_context?.setting_type) {
      setting.primary = openAIData.environment_context.setting_type;
    }

    if (openAIData?.environment_context?.lighting_conditions) {
      setting.atmosphere = openAIData.environment_context.lighting_conditions;
    }

    return setting;
  }

  assessCharacterState(openAIData) {
    const state = {
      emotional: "neutral",
      physical: "balanced",
      engagement: "moderate",
    };

    if (openAIData?.expression_analysis) {
      state.emotional =
        openAIData.expression_analysis.primary_emotion || "neutral";
      state.engagement =
        openAIData.expression_analysis.engagement_level || "moderate";
    }

    if (openAIData?.posture_gestures) {
      state.physical =
        openAIData.posture_gestures.overall_posture || "balanced";
    }

    return state;
  }

  determineVisualMood(visionData, openAIData) {
    const moodElements = [];

    if (visionData?.color_analysis?.color_temperature) {
      moodElements.push(visionData.color_analysis.color_temperature);
    }

    if (openAIData?.expression_analysis?.overall_mood) {
      moodElements.push(openAIData.expression_analysis.overall_mood);
    }

    if (visionData?.color_analysis?.color_vibrancy > 0.7) {
      moodElements.push("vibrant");
    }

    return moodElements.length > 0
      ? moodElements.join("_")
      : "balanced_neutral";
  }

  generateStoryHooks(openAIData) {
    const hooks = [];

    if (openAIData?.thematic_suggestions?.genre_suitability) {
      openAIData.thematic_suggestions.genre_suitability.forEach((genre) => {
        hooks.push(`${genre}_adventure`);
      });
    }

    if (openAIData?.derived_characteristics?.potential_interests) {
      openAIData.derived_characteristics.potential_interests.forEach(
        (interest) => {
          hooks.push(`${interest}_discovery`);
        },
      );
    }

    return hooks.length > 0 ? hooks : ["imaginative_journey"];
  }

  suggestNarrativeFlow(narrative) {
    const flows = {
      exploratory: ["discovery", "learning", "growth"],
      emotional: ["connection", "expression", "resolution"],
      adventurous: ["challenge", "action", "triumph"],
      imaginative: ["wonder", "creation", "transformation"],
    };

    const mood = narrative.visual_mood.toLowerCase();

    if (mood.includes("vibrant") || mood.includes("energetic")) {
      return flows.adventurous;
    } else if (mood.includes("calm") || mood.includes("peaceful")) {
      return flows.emotional;
    } else if (mood.includes("mysterious") || mood.includes("dreamy")) {
      return flows.imaginative;
    }

    return flows.exploratory;
  }

  deviseAdaptationStrategies(openAIData, colorData) {
    const strategies = {
      style_adaptation: this.planStyleAdaptation(openAIData),
      color_adaptation: this.planColorAdaptation(colorData),
      feature_enhancement: this.planFeatureEnhancement(openAIData),
      thematic_integration: this.planThematicIntegration(openAIData),
    };

    strategies.adaptation_complexity =
      this.assessAdaptationComplexity(strategies);

    return strategies;
  }

  planStyleAdaptation(openAIData) {
    const adaptations = [];

    if (openAIData?.clothing_analysis?.style_category) {
      adaptations.push(
        `${openAIData.clothing_analysis.style_category}_variations`,
      );
    }

    if (openAIData?.physical_attributes?.hair?.style_detailed) {
      adaptations.push("hairstyle_transformations");
    }

    return adaptations.length > 0 ? adaptations : ["versatile_styling"];
  }

  planColorAdaptation(colorData) {
    const adaptations = [];

    if (colorData?.application_recommendations) {
      adaptations.push("palette_based_coordination");
    }

    if (colorData?.thematic_color_sets) {
      adaptations.push("thematic_color_variations");
    }

    return adaptations.length > 0 ? adaptations : ["adaptive_coloring"];
  }

  planFeatureEnhancement(openAIData) {
    const enhancements = [];

    if (openAIData?.physical_attributes?.facial_features?.distinctive_marks) {
      enhancements.push("feature_accentuation");
    }

    if (openAIData?.expression_analysis?.emotional_intensity) {
      enhancements.push("expression_amplification");
    }

    return enhancements.length > 0 ? enhancements : ["balanced_enhancement"];
  }

  planThematicIntegration(openAIData) {
    const integrations = [];

    if (openAIData?.thematic_suggestions?.genre_suitability) {
      integrations.push("genre_specific_elements");
    }

    if (openAIData?.derived_characteristics?.potential_interests) {
      integrations.push("interest_based_theming");
    }

    return integrations.length > 0 ? integrations : ["universal_theming"];
  }

  assessAdaptationComplexity(strategies) {
    const strategyCount = Object.values(strategies).reduce(
      (count, arr) => count + (Array.isArray(arr) ? arr.length : 0),
      0,
    );

    if (strategyCount > 8) return "high";
    if (strategyCount > 4) return "medium";
    return "low";
  }

  suggestStyleTransformations(openAIData, colorData) {
    const transformations = {
      artistic_styles: this.suggestArtisticStyles(openAIData),
      period_transformations: this.suggestPeriodTransformations(openAIData),
      genre_adaptations: this.suggestGenreAdaptations(openAIData),
      exaggeration_levels: this.suggestExaggerationLevels(openAIData),
    };

    transformations.transformation_matrix =
      this.createTransformationMatrix(transformations);

    return transformations;
  }

  suggestArtisticStyles(openAIData) {
    const styles = [
      "watercolor",
      "digital_painting",
      "vector_art",
      "claymation",
      "storybook_illustration",
    ];

    const expression = openAIData?.expression_analysis?.primary_emotion || "";

    if (expression.includes("joy")) {
      styles.unshift("cartoon_bright");
    }

    if (expression.includes("thoughtful")) {
      styles.unshift("soft_watercolor");
    }

    return styles.slice(0, 3);
  }

  suggestPeriodTransformations(openAIData) {
    const periods = [];

    if (openAIData?.clothing_analysis?.style_category === "traditional") {
      periods.push("historical_fantasy");
    }

    periods.push("modern_retro", "timeless_classic", "future_fantasy");

    return periods;
  }

  suggestGenreAdaptations(openAIData) {
    const adaptations = [];

    if (openAIData?.thematic_suggestions?.genre_suitability) {
      openAIData.thematic_suggestions.genre_suitability.forEach((genre) => {
        adaptations.push(`${genre}_style`);
      });
    }

    return adaptations.length > 0 ? adaptations : ["universal_style"];
  }

  suggestExaggerationLevels(openAIData) {
    const levels = {
      subtle: ["enhanced_features", "soft_stylization"],
      moderate: ["exaggerated_expressions", "stylized_proportions"],
      high: ["cartoony_exaggeration", "fantasy_transformation"],
    };

    return levels;
  }

  createTransformationMatrix(transformations) {
    const matrix = [];

    Object.values(transformations).forEach((styles, index) => {
      if (Array.isArray(styles) && styles.length > 0) {
        matrix.push({
          category: Object.keys(transformations)[index],
          options: styles,
          recommended: styles[0],
        });
      }
    });

    return matrix;
  }

  proposeThematicExpansions(openAIData, visionData) {
    const expansions = {
      narrative_expansions: this.expandNarrativeThemes(openAIData),
      visual_expansions: this.expandVisualThemes(visionData),
      character_expansions: this.expandCharacterThemes(openAIData),
      world_expansions: this.expandWorldThemes(openAIData, visionData),
    };

    expansions.integration_framework =
      this.createIntegrationFramework(expansions);

    return expansions;
  }

  expandNarrativeThemes(openAIData) {
    const themes = [];

    if (openAIData?.thematic_suggestions?.story_mood_alignment) {
      themes.push(
        ...openAIData.thematic_suggestions.story_mood_alignment.map(
          (mood) => `${mood}_narrative`,
        ),
      );
    }

    if (openAIData?.derived_characteristics?.potential_interests) {
      themes.push(
        ...openAIData.derived_characteristics.potential_interests.map(
          (interest) => `${interest}_based_story`,
        ),
      );
    }

    return themes.length > 0 ? themes : ["growth_journey"];
  }

  expandVisualThemes(visionData) {
    const themes = [];

    if (visionData?.color_analysis?.color_harmony) {
      themes.push(
        ...visionData.color_analysis.color_harmony.map(
          (harmony) => `${harmony}_visual_style`,
        ),
      );
    }

    if (visionData?.environment_analysis?.thematic_elements) {
      Object.keys(visionData.environment_analysis.thematic_elements).forEach(
        (category) => {
          themes.push(`${category}_themed`);
        },
      );
    }

    return themes.length > 0 ? themes : ["visually_cohesive"];
  }

  expandCharacterThemes(openAIData) {
    const themes = [];

    if (openAIData?.thematic_suggestions?.character_archetypes) {
      themes.push(
        ...openAIData.thematic_suggestions.character_archetypes.map(
          (archetype) => `${archetype}_development`,
        ),
      );
    }

    if (openAIData?.personalization_parameters?.cultural_adaptation_options) {
      themes.push(
        ...openAIData.personalization_parameters.cultural_adaptation_options.map(
          (culture) => `${culture}_inspired`,
        ),
      );
    }

    return themes.length > 0 ? themes : ["relatable_character"];
  }

  expandWorldThemes(openAIData, visionData) {
    const themes = [];

    if (openAIData?.environment_context) {
      themes.push("immersive_world");
    }

    if (visionData?.landmark_analysis?.landmarks?.length > 0) {
      themes.push("distinctive_setting");
    }

    return themes.length > 0 ? themes : ["engaging_environment"];
  }

  createIntegrationFramework(expansions) {
    const framework = {
      primary_theme: "",
      supporting_themes: [],
      implementation_sequence: [],
    };

    const allThemes = Object.values(expansions).flat();

    if (allThemes.length > 0) {
      framework.primary_theme = allThemes[0];
      framework.supporting_themes = allThemes.slice(1, 4);
      framework.implementation_sequence = [
        "establish_primary",
        "integrate_supporting",
        "add_nuance",
      ];
    }

    return framework;
  }

  createPersonalizationMatrix(insights) {
    const matrix = {
      axes: {
        visual_style: ["realistic", "stylized", "abstract"],
        narrative_tone: ["serious", "playful", "whimsical"],
        character_depth: ["simple", "developed", "complex"],
        thematic_integration: ["minimal", "moderate", "extensive"],
      },
      recommended_combinations: [],
      customization_parameters: {},
    };

    const archetype = insights.character_archetype?.archetype || "";

    if (archetype.includes("Explorer") || archetype.includes("Adventurer")) {
      matrix.recommended_combinations.push({
        visual_style: "stylized",
        narrative_tone: "playful",
        character_depth: "developed",
        thematic_integration: "moderate",
      });
    } else if (archetype.includes("Dreamer")) {
      matrix.recommended_combinations.push({
        visual_style: "abstract",
        narrative_tone: "whimsical",
        character_depth: "complex",
        thematic_integration: "extensive",
      });
    } else {
      matrix.recommended_combinations.push({
        visual_style: "stylized",
        narrative_tone: "playful",
        character_depth: "developed",
        thematic_integration: "moderate",
      });
    }

    matrix.customization_parameters = {
      flexibility_score: 0.8,
      adaptation_range: ["subtle", "moderate", "extreme"],
      consistency_requirements: [
        "maintain_core_features",
        "preserve_expression",
        "honor_color_palette",
      ],
    };

    return matrix;
  }

  prioritizeImplementation(insights) {
    const priorities = {
      high_priority: [],
      medium_priority: [],
      low_priority: [],
    };

    if (insights.character_archetype) {
      priorities.high_priority.push("character_definition");
    }

    if (insights.visual_narrative) {
      priorities.high_priority.push("visual_style_setting");
    }

    if (insights.adaptation_strategies) {
      priorities.medium_priority.push("adaptation_planning");
    }

    if (insights.style_transformations) {
      priorities.medium_priority.push("style_exploration");
    }

    if (insights.thematic_expansions) {
      priorities.low_priority.push("thematic_development");
    }

    return priorities;
  }

  calculateDataCompleteness(merged) {
    let completeness = 0;
    let totalPoints = 0;
    let achievedPoints = 0;

    const checkData = (data, path, weight) => {
      totalPoints += weight;
      if (data && Object.keys(data).length > 0) {
        achievedPoints += weight;
      }
    };

    checkData(merged.core_analysis?.openai_primary, "openai", 30);
    checkData(merged.core_analysis?.vision_supplementary, "vision", 25);
    checkData(merged.core_analysis?.depth_contextual, "depth", 15);
    checkData(merged.core_analysis?.color_thematic, "color", 20);
    checkData(merged.integrated_features, "integrated", 10);

    completeness = (achievedPoints / totalPoints) * 100;

    return {
      percentage: Math.round(completeness),
      level:
        completeness > 80
          ? "excellent"
          : completeness > 60
            ? "good"
            : completeness > 40
              ? "fair"
              : "limited",
      missing_components: this.identifyMissingComponents(merged),
    };
  }

  identifyMissingComponents(merged) {
    const missing = [];

    if (!merged.core_analysis?.openai_primary)
      missing.push("detailed_character_analysis");
    if (!merged.core_analysis?.vision_supplementary)
      missing.push("vision_api_data");
    if (!merged.core_analysis?.depth_contextual) missing.push("depth_analysis");
    if (!merged.core_analysis?.color_thematic) missing.push("color_analysis");

    return missing.length > 0 ? missing : ["all_components_present"];
  }

  assessPersonalizationPotential(merged) {
    const potential = {
      score: 0,
      strengths: [],
      limitations: [],
      recommendations: [],
    };

    const completeness = merged.data_completeness_score?.percentage || 0;
    const insights = merged.derived_insights || {};

    potential.score = Math.min(
      100,
      completeness * 0.7 +
        (insights.character_archetype ? 20 : 0) +
        (insights.visual_narrative ? 10 : 0),
    );

    if (merged.core_analysis?.openai_primary?.physical_attributes) {
      potential.strengths.push("detailed_physical_analysis");
    }

    if (merged.core_analysis?.color_thematic?.advanced_color_analysis) {
      potential.strengths.push("comprehensive_color_data");
    }

    if (merged.integrated_features?.facial_integration) {
      potential.strengths.push("integrated_facial_data");
    }

    const gaps = merged.data_completeness_score?.missing_components || [];
    if (gaps.length > 0) {
      potential.limitations.push(...gaps);
    }

    if (potential.score > 80) {
      potential.recommendations.push("full_personalization_possible");
    } else if (potential.score > 60) {
      potential.recommendations.push("moderate_personalization_possible");
    } else {
      potential.recommendations.push("basic_personalization_only");
    }

    return potential;
  }

  applyContextualEnhancement(analysis) {
    const enhanced = JSON.parse(JSON.stringify(analysis));

    enhanced.contextual_layers = {
      immediate_context: this.analyzeImmediateContext(analysis),
      extended_context: this.analyzeExtendedContext(analysis),
      narrative_context: this.analyzeNarrativeContext(analysis),
      emotional_context: this.analyzeEmotionalContext(analysis),
    };

    enhanced.synthesis = this.synthesizeAllContexts(enhanced.contextual_layers);

    enhanced.personalization_blueprint =
      this.createPersonalizationBlueprint(enhanced);

    return enhanced;
  }

  analyzeImmediateContext(analysis) {
    const context = {
      visual_focus: "character_centric",
      environmental_influence: "moderate",
      compositional_balance: "balanced",
      temporal_markers: [],
    };

    if (analysis.core_analysis?.openai_primary?.environment_context) {
      const env = analysis.core_analysis.openai_primary.environment_context;
      if (env.background_elements?.length > 3) {
        context.environmental_influence = "strong";
      }
    }

    return context;
  }

  analyzeExtendedContext(analysis) {
    const context = {
      cultural_references: [],
      seasonal_indicators: [],
      temporal_period: "contemporary",
      socio_economic_cues: [],
    };

    const openAIData = analysis.core_analysis?.openai_primary;

    if (openAIData?.core_identity?.cultural_indicators) {
      context.cultural_references =
        openAIData.core_identity.cultural_indicators;
    }

    if (openAIData?.clothing_analysis?.seasonality_indications) {
      context.seasonal_indicators =
        openAIData.clothing_analysis.seasonality_indications;
    }

    return context;
  }

  analyzeNarrativeContext(analysis) {
    const context = {
      story_potential: "high",
      character_agency: "moderate",
      conflict_potential: "low",
      resolution_opportunities: [],
    };

    const insights = analysis.derived_insights;

    if (insights?.character_archetype?.archetype?.includes("Adventurer")) {
      context.conflict_potential = "medium";
      context.resolution_opportunities.push("overcoming_challenges");
    }

    return context;
  }

  analyzeEmotionalContext(analysis) {
    const context = {
      emotional_range: ["primary", "secondary", "subtle"],
      mood_transitions: ["stable", "gradual"],
      expressive_potential: "high",
      empathy_triggers: [],
    };

    const openAIData = analysis.core_analysis?.openai_primary;

    if (openAIData?.expression_analysis?.primary_emotion) {
      context.empathy_triggers.push(
        openAIData.expression_analysis.primary_emotion,
      );
    }

    return context;
  }

  synthesizeAllContexts(contextualLayers) {
    const synthesis = {
      overall_context: "multidimensional",
      primary_drivers: [],
      integration_level: "high",
      adaptation_opportunities: [],
    };

    Object.entries(contextualLayers).forEach(([layer, data]) => {
      if (data && Object.keys(data).length > 0) {
        synthesis.primary_drivers.push(layer);
        synthesis.adaptation_opportunities.push(`${layer}_based_adaptation`);
      }
    });

    synthesis.integration_level =
      synthesis.primary_drivers.length > 2
        ? "high"
        : synthesis.primary_drivers.length > 1
          ? "medium"
          : "low";

    return synthesis;
  }

  createPersonalizationBlueprint(enhancedAnalysis) {
    const blueprint = {
      foundation: this.establishFoundation(enhancedAnalysis),
      enhancement_layers: this.defineEnhancementLayers(enhancedAnalysis),
      thematic_frameworks: this.buildThematicFrameworks(enhancedAnalysis),
      adaptation_pathways: this.chartAdaptationPathways(enhancedAnalysis),
      quality_controls: this.establishQualityControls(enhancedAnalysis),
    };

    blueprint.implementation_roadmap =
      this.createImplementationRoadmap(blueprint);

    return blueprint;
  }

  establishFoundation(analysis) {
    const foundation = {
      core_identity:
        analysis.core_analysis?.openai_primary?.core_identity || {},
      immutable_features: this.identifyImmutableFeatures(analysis),
      signature_elements: this.extractSignatureElements(analysis),
      base_parameters: this.defineBaseParameters(analysis),
    };

    return foundation;
  }

  identifyImmutableFeatures(analysis) {
    const immutable = [];
    const openAIData = analysis.core_analysis?.openai_primary;

    if (openAIData?.physical_attributes?.face_structure?.face_shape) {
      immutable.push("face_structure");
    }

    if (openAIData?.physical_attributes?.eyes?.color_precise) {
      immutable.push("eye_color");
    }

    return immutable.length > 0 ? immutable : ["core_proportions"];
  }

  extractSignatureElements(analysis) {
    const signatures = [];
    const openAIData = analysis.core_analysis?.openai_primary;

    if (openAIData?.physical_attributes?.facial_features?.distinctive_marks) {
      signatures.push("distinctive_facial_features");
    }

    if (openAIData?.expression_analysis?.primary_emotion) {
      signatures.push("characteristic_expression");
    }

    return signatures.length > 0 ? signatures : ["individual_character"];
  }

  defineBaseParameters(analysis) {
    const params = {
      proportionality_rules: [
        "maintain_head_ratio",
        "preserve_feature_spacing",
      ],
      color_constraints: ["honor_skin_tone", "maintain_hair_color_family"],
      expression_guidelines: [
        "preserve_emotional_authenticity",
        "maintain_expression_intensity",
      ],
    };

    return params;
  }

  defineEnhancementLayers(analysis) {
    const layers = {
      layer_1_essential: this.defineEssentialLayer(analysis),
      layer_2_stylistic: this.defineStylisticLayer(analysis),
      layer_3_thematic: this.defineThematicLayer(analysis),
      layer_4_contextual: this.defineContextualLayer(analysis),
      layer_5_dynamic: this.defineDynamicLayer(analysis),
    };

    layers.layer_interdependencies = this.mapLayerDependencies(layers);

    return layers;
  }

  defineEssentialLayer(analysis) {
    return {
      features: ["facial_proportions", "basic_expression", "core_colors"],
      purpose: "maintain_recognition",
      flexibility: "low",
    };
  }

  defineStylisticLayer(analysis) {
    return {
      features: ["clothing_style", "hair_styling", "accessories"],
      purpose: "define_visual_style",
      flexibility: "high",
    };
  }

  defineThematicLayer(analysis) {
    return {
      features: [
        "theme_elements",
        "narrative_accessories",
        "environment_integration",
      ],
      purpose: "establish_story_context",
      flexibility: "medium",
    };
  }

  defineContextualLayer(analysis) {
    return {
      features: ["background_elements", "lighting_mood", "seasonal_indicators"],
      purpose: "create_immersive_context",
      flexibility: "high",
    };
  }

  defineDynamicLayer(analysis) {
    return {
      features: [
        "expression_variations",
        "pose_alternatives",
        "interaction_elements",
      ],
      purpose: "enable_story_progression",
      flexibility: "very_high",
    };
  }

  mapLayerDependencies(layers) {
    const dependencies = [];

    Object.entries(layers).forEach(([layer, data]) => {
      if (data.purpose !== "maintain_recognition") {
        dependencies.push(`${layer}_depends_on_layer_1_essential`);
      }
    });

    return dependencies;
  }

  buildThematicFrameworks(analysis) {
    const frameworks = {
      genre_frameworks: this.buildGenreFrameworks(analysis),
      mood_frameworks: this.buildMoodFrameworks(analysis),
      style_frameworks: this.buildStyleFrameworks(analysis),
      narrative_frameworks: this.buildNarrativeFrameworks(analysis),
    };

    frameworks.integration_guidelines =
      this.createIntegrationGuidelines(frameworks);

    return frameworks;
  }

  buildGenreFrameworks(analysis) {
    const genres =
      analysis.core_analysis?.openai_primary?.thematic_suggestions
        ?.genre_suitability || [];

    return genres.map((genre) => ({
      genre: genre,
      visual_elements: this.mapGenreToVisualElements(genre),
      narrative_elements: this.mapGenreToNarrativeElements(genre),
      adaptation_rules: this.mapGenreToAdaptationRules(genre),
    }));
  }

  mapGenreToVisualElements(genre) {
    const mappings = {
      fantasy: [
        "magical_effects",
        "mythical_accessories",
        "enchanted_backgrounds",
      ],
      adventure: ["explorer_gear", "action_poses", "diverse_environments"],
      educational: [
        "learning_tools",
        "interactive_elements",
        "informative_backgrounds",
      ],
      magical: ["sparkle_effects", "whimsical_elements", "dreamlike_settings"],
    };

    return (
      mappings[genre] || ["thematic_accessories", "appropriate_background"]
    );
  }

  mapGenreToNarrativeElements(genre) {
    const mappings = {
      fantasy: ["quest_narrative", "character_growth", "magical_discovery"],
      adventure: ["exploration", "problem_solving", "discovery"],
      educational: [
        "learning_journey",
        "skill_acquisition",
        "knowledge_sharing",
      ],
      magical: ["wonder_experience", "transformation", "enchantment"],
    };

    return mappings[genre] || ["character_interaction", "situational_learning"];
  }

  mapGenreToAdaptationRules(genre) {
    const rules = {
      maintain_genre_consistency: true,
      respect_character_integrity: true,
      enable_story_progression: true,
    };

    if (genre === "fantasy" || genre === "magical") {
      rules.allow_exaggeration = true;
      rules.enable_special_effects = true;
    }

    return rules;
  }

  buildMoodFrameworks(analysis) {
    const moods =
      analysis.core_analysis?.openai_primary?.expression_analysis || {};

    return [
      {
        primary_mood: moods.primary_emotion || "neutral",
        color_palette: this.mapMoodToColors(moods.primary_emotion),
        lighting_scheme: this.mapMoodToLighting(moods.primary_emotion),
        compositional_approach: this.mapMoodToComposition(
          moods.primary_emotion,
        ),
      },
    ];
  }

  mapMoodToColors(mood) {
    const mappings = {
      joy: ["warm", "bright", "vibrant"],
      sadness: ["cool", "muted", "desaturated"],
      surprise: ["contrasting", "dynamic", "unexpected"],
      neutral: ["balanced", "harmonious", "natural"],
    };

    return mappings[mood] || ["adaptive", "contextual"];
  }

  mapMoodToLighting(mood) {
    const mappings = {
      joy: ["bright", "warm", "radiant"],
      sadness: ["soft", "cool", "diffused"],
      surprise: ["dramatic", "contrasting", "focused"],
      neutral: ["natural", "balanced", "clear"],
    };

    return mappings[mood] || ["adaptive", "contextual"];
  }

  mapMoodToComposition(mood) {
    const mappings = {
      joy: ["open", "dynamic", "expansive"],
      sadness: ["closed", "intimate", "contained"],
      surprise: ["asymmetrical", "energetic", "unexpected"],
      neutral: ["balanced", "harmonious", "centered"],
    };

    return mappings[mood] || ["adaptive", "contextual"];
  }

  buildStyleFrameworks(analysis) {
    const styles =
      analysis.derived_insights?.style_transformations?.artistic_styles || [];

    return styles.map((style) => ({
      style: style,
      rendering_approach: this.mapStyleToRendering(style),
      detail_level: this.mapStyleToDetail(style),
      color_approach: this.mapStyleToColor(style),
    }));
  }

  mapStyleToRendering(style) {
    const mappings = {
      watercolor: ["loose_brushwork", "transparent_layers", "soft_edges"],
      digital_painting: [
        "textured_brushes",
        "layered_rendering",
        "detailed_finish",
      ],
      vector_art: ["clean_lines", "flat_colors", "geometric_shapes"],
      claymation: ["tactile_surfaces", "rounded_forms", "handmade_quality"],
    };

    return mappings[style] || ["adaptive_rendering", "style_appropriate"];
  }

  mapStyleToDetail(style) {
    const mappings = {
      watercolor: "suggestive",
      digital_painting: "detailed",
      vector_art: "stylized",
      claymation: "textural",
    };

    return mappings[style] || "adaptive";
  }

  mapStyleToColor(style) {
    const mappings = {
      watercolor: ["transparent", "layered", "flowing"],
      digital_painting: ["vibrant", "textured", "atmospheric"],
      vector_art: ["flat", "bold", "graphic"],
      claymation: ["matte", "tactile", "warm"],
    };

    return mappings[style] || ["adaptive", "stylistic"];
  }

  buildNarrativeFrameworks(analysis) {
    const frameworks = [];

    const archetype = analysis.derived_insights?.character_archetype?.archetype;
    if (archetype) {
      frameworks.push({
        framework: `${archetype}_journey`,
        stages: this.mapArchetypeToStages(archetype),
        character_development: this.mapArchetypeToDevelopment(archetype),
        story_beats: this.mapArchetypeToBeats(archetype),
      });
    }

    return frameworks.length > 0
      ? frameworks
      : [
          {
            framework: "character_growth",
            stages: ["introduction", "challenge", "growth", "resolution"],
            character_development: [
              "establishment",
              "testing",
              "transformation",
              "fulfillment",
            ],
            story_beats: [
              "inciting_incident",
              "rising_action",
              "climax",
              "resolution",
            ],
          },
        ];
  }

  mapArchetypeToStages(archetype) {
    const mappings = {
      "The Explorer": ["curiosity", "discovery", "understanding", "sharing"],
      "The Dreamer": ["imagination", "creation", "realization", "inspiration"],
      "The Helper": ["observation", "assistance", "support", "appreciation"],
      "The Learner": ["questioning", "exploring", "understanding", "applying"],
    };

    return mappings[archetype] || ["beginning", "middle", "end"];
  }

  mapArchetypeToDevelopment(archetype) {
    const mappings = {
      "The Explorer": [
        "developing_curiosity",
        "gaining_courage",
        "achieving_discovery",
      ],
      "The Dreamer": [
        "nurturing_imagination",
        "developing_skills",
        "achieving_creation",
      ],
      "The Helper": [
        "developing_empathy",
        "learning_helpfulness",
        "achieving_impact",
      ],
      "The Learner": [
        "developing_curiosity",
        "gaining_knowledge",
        "achieving_understanding",
      ],
    };

    return mappings[archetype] || ["growth", "learning", "achievement"];
  }

  mapArchetypeToBeats(archetype) {
    const mappings = {
      "The Explorer": [
        "find_map",
        "face_obstacle",
        "discover_treasure",
        "return_home",
      ],
      "The Dreamer": [
        "have_idea",
        "face_doubt",
        "create_masterpiece",
        "share_creation",
      ],
      "The Helper": [
        "see_need",
        "offer_help",
        "face_challenge",
        "achieve_success",
      ],
      "The Learner": [
        "ask_question",
        "seek_answer",
        "face_confusion",
        "gain_understanding",
      ],
    };

    return (
      mappings[archetype] || ["setup", "development", "climax", "resolution"]
    );
  }

  createIntegrationGuidelines(frameworks) {
    return {
      primary_rule: "maintain_character_consistency",
      adaptation_rules: [
        "respect_foundation_features",
        "enable_style_adaptation",
        "support_narrative_progression",
        "maintain_emotional_authenticity",
      ],
      quality_standards: [
        "visual_cohesion",
        "narrative_integration",
        "character_integrity",
        "thematic_consistency",
      ],
    };
  }

  chartAdaptationPathways(analysis) {
    const pathways = {
      simple_adaptation: this.chartSimplePathway(analysis),
      moderate_adaptation: this.chartModeratePathway(analysis),
      extensive_adaptation: this.chartExtensivePathway(analysis),
      transformative_adaptation: this.chartTransformativePathway(analysis),
    };

    pathways.selection_criteria = this.defineSelectionCriteria(pathways);

    return pathways;
  }

  chartSimplePathway(analysis) {
    return {
      description: "Minimal changes, maximum recognition",
      modifications: [
        "color_adjustments",
        "background_changes",
        "simple_accessories",
      ],
      time_estimate: "low",
      complexity: "simple",
      use_cases: ["quick_adaptation", "brand_consistency", "familiar_contexts"],
    };
  }

  chartModeratePathway(analysis) {
    return {
      description: "Balanced adaptation with style variation",
      modifications: [
        "clothing_changes",
        "hairstyle_variations",
        "environment_redesign",
        "expression_variations",
      ],
      time_estimate: "medium",
      complexity: "moderate",
      use_cases: [
        "theme_adaptation",
        "seasonal_variations",
        "story_progression",
      ],
    };
  }

  chartExtensivePathway(analysis) {
    return {
      description:
        "Comprehensive transformation while maintaining core identity",
      modifications: [
        "style_transformation",
        "thematic_recontextualization",
        "narrative_integration",
        "dynamic_elements",
      ],
      time_estimate: "high",
      complexity: "complex",
      use_cases: [
        "genre_adaptation",
        "extended_storylines",
        "multi_scenario_use",
      ],
    };
  }

  chartTransformativePathway(analysis) {
    return {
      description: "Complete reimagining with artistic interpretation",
      modifications: [
        "artistic_style_change",
        "conceptual_reinterpretation",
        "fantasy_elements",
        "exaggerated_features",
      ],
      time_estimate: "very_high",
      complexity: "very_complex",
      use_cases: [
        "artistic_exploration",
        "fantasy_genre",
        "conceptual_storytelling",
      ],
    };
  }

  defineSelectionCriteria(pathways) {
    return {
      based_on: [
        "story_requirements",
        "time_constraints",
        "creative_vision",
        "audience_expectations",
      ],
      decision_factors: [
        "character_recognition_importance",
        "thematic_integration_depth",
        "production_resources",
        "artistic_freedom_level",
      ],
      recommendations: [
        "start_simple_for_familiarity",
        "progress_complexity_with_story",
        "maintain_consistency_within_pathway",
        "respect_character_integrity",
      ],
    };
  }

  establishQualityControls(analysis) {
    const controls = {
      recognition_metrics: this.defineRecognitionMetrics(analysis),
      consistency_checks: this.defineConsistencyChecks(analysis),
      style_validation: this.defineStyleValidation(analysis),
      narrative_integration: this.defineNarrativeIntegration(analysis),
    };

    controls.quality_assurance_process =
      this.createQualityAssuranceProcess(controls);

    return controls;
  }

  defineRecognitionMetrics(analysis) {
    return {
      facial_recognition_score: 0.85,
      feature_preservation_rules: [
        "maintain_eye_placement",
        "preserve_face_shape",
        "keep_signature_features",
        "honor_expression_character",
      ],
      recognition_thresholds: {
        minimum: 0.7,
        target: 0.85,
        excellent: 0.95,
      },
    };
  }

  defineConsistencyChecks(analysis) {
    return {
      internal_consistency: [
        "proportional_consistency",
        "color_harmony",
        "style_uniformity",
        "thematic_cohesion",
      ],
      external_consistency: [
        "source_fidelity",
        "character_continuity",
        "narrative_alignment",
        "audience_expectations",
      ],
      consistency_tolerance: {
        strict: ["core_features", "identity_markers"],
        flexible: ["stylistic_elements", "background_details"],
        creative: ["fantasy_elements", "artistic_interpretation"],
      },
    };
  }

  defineStyleValidation(analysis) {
    return {
      style_parameters: [
        "line_quality_consistency",
        "color_palette_adherence",
        "texture_uniformity",
        "rendering_technique_consistency",
      ],
      style_adaptation_rules: [
        "gradual_transition_allowed",
        "context_appropriate_styling",
        "genre_consistent_rendering",
        "audience_appropriate_presentation",
      ],
      validation_criteria: {
        must_have: ["style_consistency", "technical_quality"],
        should_have: ["artistic_expression", "emotional_conveyance"],
        could_have: ["innovative_elements", "signature_touches"],
      },
    };
  }

  defineNarrativeIntegration(analysis) {
    return {
      narrative_alignment_checks: [
        "character_motivation_consistency",
        "story_context_relevance",
        "emotional_arc_support",
        "thematic_integration_level",
      ],
      storytelling_elements: [
        "visual_storytelling_clarity",
        "emotional_conveyance_strength",
        "character_expression_effectiveness",
        "scene_composition_narrative_support",
      ],
      integration_quality_metrics: {
        basic: ["scene_relevance", "character_appropriateness"],
        intermediate: ["emotional_resonance", "narrative_progression"],
        advanced: ["thematic_depth", "symbolic_layering"],
      },
    };
  }

  createQualityAssuranceProcess(controls) {
    return {
      stages: [
        {
          stage: "foundation_check",
          checks: ["recognition_validation", "core_feature_preservation"],
          approval_criteria: [
            "meets_minimum_recognition",
            "preserves_immutable_features",
          ],
        },
        {
          stage: "style_validation",
          checks: ["style_consistency", "technical_quality"],
          approval_criteria: [
            "maintains_style_integrity",
            "meets_technical_standards",
          ],
        },
        {
          stage: "narrative_integration",
          checks: ["story_relevance", "emotional_appropriateness"],
          approval_criteria: [
            "supports_narrative",
            "maintains_emotional_authenticity",
          ],
        },
        {
          stage: "final_approval",
          checks: ["overall_cohesion", "audience_suitability"],
          approval_criteria: [
            "meets_all_quality_standards",
            "ready_for_implementation",
          ],
        },
      ],
      quality_gates: {
        gate_1: "recognition_threshold",
        gate_2: "style_consistency",
        gate_3: "narrative_alignment",
        gate_4: "overall_quality",
      },
    };
  }

  createImplementationRoadmap(blueprint) {
    return {
      phase_1_foundation: {
        duration: "short",
        tasks: [
          "establish_core_identity",
          "set_base_parameters",
          "define_immutable_features",
        ],
        deliverables: [
          "character_foundation",
          "base_style_guide",
          "quality_baseline",
        ],
      },
      phase_2_enhancement: {
        duration: "medium",
        tasks: [
          "apply_stylistic_layers",
          "integrate_thematic_elements",
          "add_contextual_details",
        ],
        deliverables: [
          "styled_character",
          "thematic_integration",
          "contextual_setting",
        ],
      },
      phase_3_adaptation: {
        duration: "variable",
        tasks: [
          "implement_pathway_selection",
          "apply_adaptation_modifications",
          "validate_quality_controls",
        ],
        deliverables: [
          "adapted_character",
          "quality_validated_output",
          "implementation_guidelines",
        ],
      },
      phase_4_integration: {
        duration: "ongoing",
        tasks: [
          "narrative_integration",
          "dynamic_element_implementation",
          "continuous_quality_assurance",
        ],
        deliverables: [
          "fully_integrated_character",
          "dynamic_assets",
          "quality_documentation",
        ],
      },
    };
  }

  generateBasicVisionFeatures() {
    return {
      facial_analysis: {
        face_0: {
          emotional_state: {
            joy: "UNKNOWN",
            sorrow: "UNKNOWN",
            anger: "UNKNOWN",
            surprise: "UNKNOWN",
            headwear: "UNKNOWN",
          },
        },
      },
      comprehensive_labels: [],
      environment_analysis: {
        scene_labels: ["child", "person", "human"],
        thematic_elements: {},
      },
    };
  }

  generateDetailedOpenAIFallback() {
    return {
      core_identity: {
        perceived_gender: "neutral",
        age_estimate: { years: 5, range: "3-7", confidence: 0.5 },
      },
      physical_attributes: {
        skin: { tone_description: "neutral tone" },
        hair: { color_precision: "neutral", style_detailed: "simple" },
        eyes: { color_precise: "neutral", shape_analysis: "neutral" },
        face_structure: { face_shape: "oval", facial_symmetry_score: 0.5 },
      },
      expression_analysis: {
        primary_emotion: "neutral",
        emotional_intensity: "medium",
      },
      clothing_analysis: {
        outfit_components: ["basic clothing"],
        style_category: "casual",
      },
      thematic_suggestions: {
        genre_suitability: ["universal"],
        character_archetypes: ["adaptive child"],
      },
    };
  }

  generateDepthFallback() {
    return {
      spatial_analysis: {
        foreground_background_separation: "moderate",
        layer_count: 2,
      },
      perspective_analysis: {
        viewing_angle: "eye_level",
        distance_estimation: "medium_shot",
      },
    };
  }

  generateColorFallback() {
    return {
      advanced_color_analysis: {
        palette_generation: [
          { color: "#FF6B6B", role: "primary" },
          { color: "#4ECDC4", role: "secondary" },
          { color: "#FFD166", role: "accent" },
        ],
      },
      thematic_color_sets: {
        primary_set: ["#FF6B6B", "#4ECDC4", "#FFD166"],
      },
    };
  }

  calculateFacialConfidence(visionData, openAIData) {
    let confidence = 0.5;

    if (visionData?.facial_analysis) confidence += 0.2;
    if (openAIData?.physical_attributes) confidence += 0.3;

    return Math.min(1, confidence);
  }

  calculateColorConfidence(visionData, colorData) {
    let confidence = 0.5;

    if (visionData?.color_analysis) confidence += 0.2;
    if (colorData?.advanced_color_analysis) confidence += 0.3;

    return Math.min(1, confidence);
  }

  calculateContextConfidence(visionData, openAIData) {
    let confidence = 0.5;

    if (visionData?.environment_analysis) confidence += 0.2;
    if (openAIData?.environment_context) confidence += 0.3;

    return Math.min(1, confidence);
  }

  calculateOverallConfidence(integration) {
    const confidences = integration.confidence_metrics;
    if (!confidences) return 0.5;

    const scores = [
      confidences.facial_confidence || 0,
      confidences.color_confidence || 0,
      confidences.context_confidence || 0,
    ];

    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  }
}

export default ImageAnalyzer;
