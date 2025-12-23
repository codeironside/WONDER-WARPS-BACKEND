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
    if (!googleApiKey) {
      throw new ErrorHandler(
        "Google API key is required for image analysis",
        500,
      );
    }

    this.openai = new OpenAI({ apiKey });
    this.googleApiKey = googleApiKey;
  }

  async analyzeImage(photoUrl) {
    try {
      console.log(
        "🔍 Starting enhanced image analysis for storybook personalization...",
      );

      const visionRaw = await this.extractWithGoogleVision(photoUrl);
      const visionData = this.processVisionData(visionRaw);

      if (
        !visionData ||
        !visionData.face_annotations ||
        visionData.face_annotations.length === 0
      ) {
        console.warn(
          "⚠️ No face detected by Google Vision. Falling back to pure OpenAI analysis.",
        );
        return await this.extractWithOpenAI(photoUrl);
      }

      const refinedAnalysis = await this.refineWithOpenAI(photoUrl, visionData);

      const characterSignature =
        this.generateCharacterSignature(refinedAnalysis);

      const finalAnalysis = {
        timestamp: new Date().toISOString(),
        version: "2.0",
        core_identity: refinedAnalysis.core_identity,
        physical_attributes: refinedAnalysis.physical_attributes,
        clothing_analysis: refinedAnalysis.clothing_analysis,
        accessories_detailed: refinedAnalysis.accessories_detailed,
        expression_analysis: refinedAnalysis.expression_analysis,
        body_analysis: refinedAnalysis.body_analysis,
        unique_features: refinedAnalysis.unique_features,
        character_signature: characterSignature,
        vision_metadata: {
          face_count: visionData.face_annotations.length,
          detection_confidence:
            visionData.face_annotations[0].detectionConfidence,
          landmarking_confidence:
            visionData.face_annotations[0].landmarkingConfidence,
          angles: {
            roll: visionData.face_annotations[0].rollAngle,
            pan: visionData.face_annotations[0].panAngle,
            tilt: visionData.face_annotations[0].tiltAngle,
          },
          emotions: visionData.emotions,
          headwear_likelihood:
            visionData.face_annotations[0].headwearLikelihood,
          glasses_likelihood:
            visionData.face_annotations[0].eyeglassesLikelihood,
          blur_likelihood: visionData.face_annotations[0].blurredLikelihood,
          exposure_likelihood:
            visionData.face_annotations[0].underExposedLikelihood,
        },
      };

      console.log("✅ Enhanced image analysis completed successfully");
      return finalAnalysis;
    } catch (error) {
      console.error("❌ Error during enhanced image analysis:", error);
      return this.generateFallbackAnalysis();
    }
  }

  async extractWithGoogleVision(photoUrl) {
    try {
      const requestBody = {
        requests: [
          {
            image: { source: { imageUri: photoUrl } },
            features: [
              { type: "FACE_DETECTION", maxResults: 5 },
              { type: "LABEL_DETECTION", maxResults: 50 },
              { type: "IMAGE_PROPERTIES", maxResults: 10 },
              { type: "OBJECT_LOCALIZATION", maxResults: 10 },
              { type: "SAFE_SEARCH_DETECTION", maxResults: 1 },
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

      if (!response.ok)
        throw new Error(`Vision API error: ${response.statusText}`);
      const result = await response.json();
      return result.responses[0];
    } catch (error) {
      console.error("Vision extraction failed:", error);
      return null;
    }
  }

  processVisionData(data) {
    if (!data) return null;

    const faceAnnotations = data.faceAnnotations || [];
    const labelAnnotations = data.labelAnnotations || [];
    const localizedObjectAnnotations = data.localizedObjectAnnotations || [];
    const imagePropertiesAnnotation = data.imagePropertiesAnnotation || {};
    const safeSearchAnnotation = data.safeSearchAnnotation || {};

    const face = faceAnnotations[0];
    if (!face) return null;

    const landmarks = this.mapLandmarks(face.landmarks);
    const faceShape = this.estimateFaceShape(landmarks, face.boundingPoly);
    const skinToneEstimate = this.estimateSkinTone(
      imagePropertiesAnnotation.dominantColors?.colors || [],
    );

    const emotions = {
      joy: face.joyLikelihood,
      sorrow: face.sorrowLikelihood,
      anger: face.angerLikelihood,
      surprise: face.surpriseLikelihood,
    };

    const personObject = localizedObjectAnnotations.find(
      (obj) => obj.name === "Person",
    );
    const bodyBoundingBox = personObject
      ? this.processBoundingBox(personObject.boundingPoly.normalizedVertices)
      : null;

    const hairColorLabel = labelAnnotations.find((l) =>
      [
        "brown hair",
        "black hair",
        "blond",
        "red hair",
        "gray hair",
        "white hair",
      ].includes(l.description.toLowerCase()),
    );
    const hairTypeLabel = labelAnnotations.find((l) =>
      [
        "curly hair",
        "straight hair",
        "wavy hair",
        "long hair",
        "short hair",
        "bald",
      ].includes(l.description.toLowerCase()),
    );
    const clothingLabels = labelAnnotations.filter((l) =>
      [
        "shirt",
        "dress",
        "jacket",
        "hat",
        "cap",
        "t-shirt",
        "suit",
        "pants",
        "jeans",
        "skirt",
      ].includes(l.description.toLowerCase()),
    );

    return {
      face_annotations: faceAnnotations,
      landmarks,
      face_shape: faceShape,
      skin_tone_estimate: skinToneEstimate,
      emotions,
      headwear_likelihood: face.headwearLikelihood,
      glasses_likelihood: face.eyeglassesLikelihood,
      blur_likelihood: face.blurredLikelihood,
      exposure_likelihood: face.underExposedLikelihood,
      detection_confidence: face.detectionConfidence,
      landmarking_confidence: face.landmarkingConfidence,
      roll_angle: face.rollAngle,
      pan_angle: face.panAngle,
      tilt_angle: face.tiltAngle,
      body_bounding_box: bodyBoundingBox,
      hair_color_label: hairColorLabel?.description || "unknown",
      hair_type_label: hairTypeLabel?.description || "unknown",
      clothing_labels: clothingLabels.map((l) => l.description),
      safe_search: safeSearchAnnotation,
    };
  }

  mapLandmarks(landmarks) {
    const map = {};
    landmarks.forEach((l) => {
      map[l.type] = l.position;
    });
    return map;
  }

  estimateFaceShape(landmarks, boundingPoly) {
    if (
      !landmarks.CHIN_GNATHION ||
      !landmarks.LEFT_EAR_TRAGION ||
      !landmarks.RIGHT_EAR_TRAGION
    )
      return "oval";

    const width = Math.abs(
      landmarks.RIGHT_EAR_TRAGION.x - landmarks.LEFT_EAR_TRAGION.x,
    );
    const topY = boundingPoly.vertices[0].y;
    const height = Math.abs(landmarks.CHIN_GNATHION.y - topY);
    const ratio = width / height;

    if (ratio > 0.85) return "round";
    if (ratio < 0.65) return "oblong";
    return "oval";
  }

  estimateSkinTone(colors) {
    for (const c of colors) {
      const { red, green, blue } = c.color;
      if (red > green && red > blue && red > 60) {
        if (red > 200 && green > 180 && blue > 150) return "fair/light";
        if (red > 180 && green > 140 && blue > 100) return "medium/tan";
        if (red > 100 && green < 120 && blue < 100) return "dark/deep";
      }
    }
    return "unknown";
  }

  processBoundingBox(vertices) {
    if (!vertices) return null;
    const xs = vertices.map((v) => v.x || 0);
    const ys = vertices.map((v) => v.y || 0);
    return {
      min_x: Math.min(...xs),
      max_x: Math.max(...xs),
      min_y: Math.min(...ys),
      max_y: Math.max(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
  }

  async refineWithOpenAI(photoUrl, visionData) {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4-vision-preview",
        messages: [
          {
            role: "system",
            content:
              "You are an expert biometric and character design analyst. Extract every possible detail from the child's photo for consistent storybook illustration. Focus on texture, color, and unique features.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze the child in this image for storybook personalization.

                                Google Vision provided these cues:
                                - Face Shape: ${visionData.face_shape}
                                - Skin Tone Hint: ${visionData.skin_tone_estimate}
                                - Hair Color Label: ${visionData.hair_color_label}
                                - Hair Type Label: ${visionData.hair_type_label}
                                - Clothing Items: ${visionData.clothing_labels.join(", ")}
                                - Headwear Likelihood: ${visionData.headwear_likelihood}
                                - Glasses Likelihood: ${visionData.glasses_likelihood}
                                - Emotions: ${JSON.stringify(visionData.emotions)}
                                - Body Bounding Box: ${visionData.body_bounding_box ? `width: ${visionData.body_bounding_box.width.toFixed(2)}, height: ${visionData.body_bounding_box.height.toFixed(2)}` : "not detected"}

                                Provide an extremely detailed JSON analysis. Include every observable detail: precise colors, textures, shapes, proportions, and unique features. The goal is to generate consistent illustrations of this child across different storybook scenes.

                                Return JSON with this exact structure:
                                {
                                    "core_identity": {
                                        "perceived_gender": "male|female|neutral",
                                        "age_estimate": {"years": number, "range": "string"},
                                        "ethnicity_cues": ["string"]
                                    },
                                    "physical_attributes": {
                                        "skin": {
                                            "tone_description": "string (e.g. 'warm olive', 'deep ebony')",
                                            "undertones": ["warm|cool|neutral"],
                                            "texture_cues": ["smooth", "freckled", "rosy", "blemished", "porous"],
                                            "unique_features": ["birthmarks", "scars", "dimples", "moles", "freckle_pattern"]
                                        },
                                        "hair": {
                                            "color_precision": "string (e.g. 'strawberry blonde', 'jet black')",
                                            "style_detailed": "string (e.g. 'short curly fade', 'long braids')",
                                            "texture_analysis": "straight|wavy|curly|coily|afro-textured",
                                            "length_precise": "short|medium|long|bald",
                                            "parting_style": "string",
                                            "hairline_shape": "straight|rounded|widows peak|uneven",
                                            "shine_level": "matte|natural|shiny"
                                        },
                                        "eyes": {
                                            "color_precise": "string (e.g. 'amber', 'hazel', 'dark brown')",
                                            "shape_analysis": "almond|round|hooded|monolid|upturned|downturned",
                                            "eyelash_characteristics": "string",
                                            "eyebrow_shape": "straight|arched|rounded|s-shaped",
                                            "eyebrow_thickness": "thin|medium|thick"
                                        },
                                        "face_structure": {
                                            "face_shape": "oval|round|square|heart|diamond",
                                            "cheekbone_prominence": "low|medium|high",
                                            "jawline_shape": "string",
                                            "chin_type": "pointed|round|square|cleft|dimpled",
                                            "forehead_height": "low|medium|high"
                                        },
                                        "nose_details": {
                                            "shape": "string",
                                            "size": "small|medium|large",
                                            "bridge_width": "narrow|medium|wide",
                                            "nasal_tip": "upturned|straight|downturned"
                                        },
                                        "mouth_details": {
                                            "lip_shape": "string",
                                            "lip_fullness": "thin|medium|full",
                                            "cupids_bow_prominence": "flat|defined|pronounced",
                                            "philtrum_length": "short|medium|long"
                                        },
                                        "ears": {
                                            "visibility": "hidden|partial|full",
                                            "lobe_type": "attached|free|mixed",
                                            "size_relative_to_face": "small|proportional|large"
                                        }
                                    },
                                    "clothing_analysis": {
                                        "style_category": "casual|formal|sporty|traditional",
                                        "outfit_components": ["string"],
                                        "color_scheme": "string",
                                        "patterns": ["string"],
                                        "fit": "tight|fitted|loose"
                                    },
                                    "accessories_detailed": {
                                        "headwear": ["string"],
                                        "eyewear": {"type": "string", "style": "string"},
                                        "jewelry": ["string"],
                                        "other": ["string"]
                                    },
                                    "expression_analysis": {
                                        "primary_emotion": "string",
                                        "intensity": "subtle|moderate|pronounced",
                                        "facial_muscle_activation": ["string"]
                                    },
                                    "body_analysis": {
                                        "proportion_category": "childlike|average|slender|stocky",
                                        "posture": "straight|slouched|leaning",
                                        "visible_body_parts": ["string"],
                                        "gesture": "string"
                                    },
                                    "unique_features": {
                                        "distinctive_marks": ["string"],
                                        "asymmetries": ["string"],
                                        "characteristic_expression": "string"
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
      return analysis;
    } catch (error) {
      console.error("OpenAI refinement failed:", error);
      return this.generateFallbackAnalysis();
    }
  }

  async extractWithOpenAI(photoUrl) {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4-vision-preview",
        messages: [
          {
            role: "system",
            content:
              "You are an expert character designer. Analyze the child in the image for storybook personalization.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze the child in this image. Provide a detailed JSON analysis for consistent illustration.

                                Return JSON with this structure:
                                {
                                    "core_identity": {"perceived_gender": "string", "age_estimate": {"years": number}},
                                    "physical_attributes": {
                                        "skin": {"tone_description": "string"},
                                        "hair": {"color_precision": "string", "texture_analysis": "string", "style_detailed": "string"},
                                        "eyes": {"color_precise": "string", "shape_analysis": "string"},
                                        "face_structure": {"face_shape": "string"}
                                    },
                                    "clothing_analysis": {"outfit_components": ["string"], "color_scheme": "string"},
                                    "accessories_detailed": {"eyewear": {"type": "string"}, "headwear": ["string"]},
                                    "expression_analysis": {"primary_emotion": "string"}
                                }`,
              },
              {
                type: "image_url",
                image_url: { url: photoUrl, detail: "high" },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
      });

      const analysis = JSON.parse(response.choices[0].message.content);
      return {
        ...analysis,
        vision_metadata: { face_count: 0, detection_confidence: 0 },
        character_signature: this.generateCharacterSignature(analysis),
      };
    } catch (error) {
      console.error("OpenAI fallback failed:", error);
      return this.generateFallbackAnalysis();
    }
  }

  generateCharacterSignature(analysis) {
    const skin =
      analysis.physical_attributes?.skin?.tone_description || "neutral skin";
    const hair = analysis.physical_attributes?.hair
      ? `${analysis.physical_attributes.hair.color_precision} ${analysis.physical_attributes.hair.texture_analysis} hair, ${analysis.physical_attributes.hair.style_detailed}`
      : "brown hair";
    const eyes = analysis.physical_attributes?.eyes?.color_precise
      ? `${analysis.physical_attributes.eyes.color_precise} eyes`
      : "brown eyes";
    const face = analysis.physical_attributes?.face_structure?.face_shape
      ? `${analysis.physical_attributes.face_structure.face_shape} face`
      : "oval face";
    const clothing = analysis.clothing_analysis?.outfit_components
      ? `wearing ${analysis.clothing_analysis.outfit_components.join(", ")}`
      : "casual clothing";
    const expression = analysis.expression_analysis?.primary_emotion
      ? `${analysis.expression_analysis.primary_emotion} expression`
      : "neutral expression";

    const unique = analysis.unique_features?.distinctive_marks
      ? `with ${analysis.unique_features.distinctive_marks.join(", ")}`
      : "";

    return `A child with ${skin}, ${hair}, ${eyes}, ${face}, ${clothing}, ${expression} ${unique}. Detailed texture and color accurate for consistent illustration.`;
  }

  generateFallbackAnalysis() {
    return {
      timestamp: new Date().toISOString(),
      version: "2.0",
      core_identity: {
        perceived_gender: "neutral",
        age_estimate: { years: 5, range: "3-7" },
        ethnicity_cues: [],
      },
      physical_attributes: {
        skin: {
          tone_description: "neutral tone",
          undertones: ["neutral"],
          texture_cues: ["smooth"],
          unique_features: [],
        },
        hair: {
          color_precision: "brown",
          style_detailed: "short",
          texture_analysis: "straight",
          length_precise: "short",
          parting_style: "unknown",
          hairline_shape: "straight",
          shine_level: "natural",
        },
        eyes: {
          color_precise: "brown",
          shape_analysis: "round",
          eyelash_characteristics: "typical",
          eyebrow_shape: "straight",
          eyebrow_thickness: "medium",
        },
        face_structure: {
          face_shape: "oval",
          cheekbone_prominence: "medium",
          jawline_shape: "soft",
          chin_type: "round",
          forehead_height: "medium",
        },
        nose_details: {
          shape: "average",
          size: "medium",
          bridge_width: "medium",
          nasal_tip: "straight",
        },
        mouth_details: {
          lip_shape: "average",
          lip_fullness: "medium",
          cupids_bow_prominence: "defined",
          philtrum_length: "medium",
        },
        ears: {
          visibility: "full",
          lobe_type: "free",
          size_relative_to_face: "proportional",
        },
      },
      clothing_analysis: {
        style_category: "casual",
        outfit_components: ["casual clothing"],
        color_scheme: "neutral",
        patterns: [],
        fit: "fitted",
      },
      accessories_detailed: {
        headwear: [],
        eyewear: { type: "none", style: "none" },
        jewelry: [],
        other: [],
      },
      expression_analysis: {
        primary_emotion: "neutral",
        intensity: "moderate",
        facial_muscle_activation: [],
      },
      body_analysis: {
        proportion_category: "childlike",
        posture: "straight",
        visible_body_parts: ["head", "shoulders"],
        gesture: "neutral",
      },
      unique_features: {
        distinctive_marks: [],
        asymmetries: [],
        characteristic_expression: "neutral",
      },
      character_signature:
        "A child with neutral skin, brown straight hair, brown eyes, oval face, wearing casual clothing, neutral expression. Detailed texture and color accurate for consistent illustration.",
      vision_metadata: {
        face_count: 0,
        detection_confidence: 0,
        landmarking_confidence: 0,
        angles: { roll: 0, pan: 0, tilt: 0 },
        emotions: {},
        headwear_likelihood: "UNKNOWN",
        glasses_likelihood: "UNKNOWN",
        blur_likelihood: "UNKNOWN",
        exposure_likelihood: "UNKNOWN",
      },
    };
  }
}

export default ImageAnalyzer;
