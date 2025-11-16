import OpenAI from "openai";
import { config } from "@/config";
import ErrorHandler from "@/Error";
import BookTemplate from "../../../../API/BOOK_TEMPLATE/model/index.js";
import PersonalizedBook from "../../../../API/PERSONALISATION/model/index.js";
import S3Service from "../../s3/index.js";
import ImageValidator from "../validatePicture/index.js";

const STYLE_MAPPINGS = {
  sci_fi: {
    toddler: "in a soft, gentle CGI style with rounded edges, bright colors, and simple shapes suitable for very young children",
    preschool: "in a friendly CGI style like 'Wall-E' with expressive characters, soft lighting, and approachable robot designs",
    early_elementary: "in a modern CGI sci-fi style like 'Big Hero 6' with clean designs, vibrant colors, and heroic characters",
    late_elementary: "in a detailed CGI style reminiscent of 'Star Wars: The Clone Wars' with dynamic action and imaginative worlds",
    middle_school: "in a sophisticated CGI style like 'Love, Death & Robots' with realistic textures and atmospheric lighting",
    high_school: "in a cinematic sci-fi CGI style with detailed models, complex lighting, and sophisticated rendering for mature audiences",
    young_adult: "in a photorealistic sci-fi style with advanced visual effects, detailed environments, and complex character designs"
  },
  humor: {
    toddler: "in a simple, soft cartoon style with round shapes, bright colors, and gentle expressions",
    preschool: "in a playful cartoon style like 'Peppa Pig' with simple designs, soft colors, and friendly characters",
    early_elementary: "in a quirky cartoon style like 'Paw Patrol' with expressive characters and vibrant, energetic scenes",
    late_elementary: "in a dynamic cartoon style like 'The Amazing World of Gumball' with mixed media and exaggerated expressions",
    middle_school: "in a modern cartoon style like 'Regular Show' or 'Adventure Time' with unique character designs and surreal humor",
    high_school: "in the iconic style of 'The Simpsons' with distinctive character designs and satirical visual storytelling",
    young_adult: "in an adult animated style like 'Rick and Morty' with complex humor, detailed backgrounds, and sophisticated visual jokes"
  },
  fantasy: {
    toddler: "in a soft, dreamy watercolor style with gentle magical elements and friendly creature designs",
    preschool: "in a gentle fantasy style like 'My Little Pony' with soft colors, simple magic, and approachable characters",
    early_elementary: "in a vibrant fantasy style like 'Sofia the First' with royal themes, gentle magic, and colorful environments",
    late_elementary: "in an anime-influenced fantasy style like 'Avatar: The Last Airbender' with dynamic action and elemental magic",
    middle_school: "in a detailed fantasy style like 'How to Train Your Dragon' with realistic textures and epic scale",
    high_school: "in the classic Disney Renaissance style of 'Mulan' with strong character acting and detailed epic backgrounds",
    young_adult: "in a mature fantasy style like 'The Witcher' or 'Game of Thrones' with realistic textures, complex lighting, and detailed world-building"
  },
  adventure: {
    toddler: "in a soft, gentle adventure style with simple landscapes and friendly animal companions",
    preschool: "in a DreamWorks CGI style like 'The Boss Baby' with polished, streamlined characters and vibrant environments",
    early_elementary: "in a Pixar CGI style like 'Inside Out' with emotionally expressive characters and vibrant, imaginative worlds",
    late_elementary: "in the beautiful CGI style of Disney's 'Moana' with expressive characters, vibrant colors, and oceanic themes",
    middle_school: "in a volumetric lighting 2D style like 'Klaus' that looks hand-drawn but incorporates three-dimensional depth",
    high_school: "in an epic adventure style like 'The Legend of Zelda: Breath of the Wild' with vast landscapes and detailed character designs",
    young_adult: "in a cinematic adventure style like 'The Lord of the Rings' with epic scale, realistic textures, and dramatic lighting"
  },
  classic: {
    toddler: "in a soft, simplified classic style with gentle colors and simple character designs",
    preschool: "in a Hanna-Barbera style like 'Tom and Jerry' with bold outlines and efficient character-driven animation",
    early_elementary: "in a classic Disney style like 'Mickey Mouse' with timeless character designs and vibrant colors",
    late_elementary: "in the Disney Golden Age style of 'Bambi' with soft painterly backgrounds and naturalistic rendering",
    middle_school: "in a retro classic style like 'The Flintstones' with nostalgic character designs and prehistoric aesthetic",
    high_school: "in a vintage animation style reminiscent of 1940s cartoons with sophisticated character designs and detailed backgrounds",
    young_adult: "in a sophisticated classic style inspired by Norman Rockwell with detailed character studies and nostalgic American themes"
  },
  preschool: {
    toddler: "in an extremely simple vector style like 'Peppa Pig' with flat 2D designs, minimal detail, and gentle colors",
    preschool: "in a simple friendly 2D cartoon style with bold outlines, bright colors, and clear, easy-to-understand visuals",
    early_elementary: "in a slightly more detailed preschool style with simple stories and clear, colorful character designs",
    late_elementary: "in a transitional style that bridges preschool and elementary with more detailed characters while maintaining clarity",
    middle_school: "n/a (preschool themes not typically used for this age group)",
    high_school: "n/a (preschool themes not typically used for this age group)",
    young_adult: "n/a (preschool themes not typically used for this age group)"
  },
  action: {
    toddler: "in a gentle action style with soft movements, simple conflicts, and friendly resolutions",
    preschool: "in a simple action style with clear heroes/villains, bright colors, and non-threatening conflict",
    early_elementary: "in a Cartoon Network action style with graphic angular designs and dynamic but age-appropriate action sequences",
    late_elementary: "in an action-adventure style like 'Ben 10' with dynamic poses, special effects, and heroic character designs",
    middle_school: "in a sophisticated action style with detailed vehicles, motion blur, and dynamic camera angles",
    high_school: "in a mature action style like 'Fast & Furious' with realistic effects, detailed environments, and complex action choreography",
    young_adult: "in an intense action style with cinematic visuals, complex stunt choreography, and realistic combat sequences"
  },
  mystery: {
    toddler: "in a gentle mystery style with soft colors, simple puzzles, and friendly detectives",
    preschool: "in a curious mystery style with bright clues, friendly characters, and simple problem-solving",
    early_elementary: "in an adventurous mystery style like 'Scooby-Doo' with fun villains and clear mystery-solving",
    late_elementary: "in a detailed mystery style with atmospheric settings, clever clues, and engaging detective work",
    middle_school: "in a sophisticated mystery style with complex puzzles, detailed environments, and atmospheric lighting",
    high_school: "in a noir-inspired mystery style with dramatic lighting, complex characters, and intricate plot visuals",
    young_adult: "in a psychological mystery style with tense atmosphere, complex character expressions, and sophisticated visual storytelling"
  },
  historical: {
    toddler: "in a simplified historical style with basic period elements and friendly character designs",
    preschool: "in an educational historical style with clear period details and approachable historical figures",
    early_elementary: "in an adventurous historical style with accurate period settings and engaging historical narratives",
    late_elementary: "in a detailed historical style with researched environments, period costumes, and educational accuracy",
    middle_school: "in a sophisticated historical style with accurate architectural details, period fashion, and historical authenticity",
    high_school: "in a cinematic historical style with detailed period reconstruction, authentic costumes, and dramatic historical recreation",
    young_adult: "in an epic historical style with meticulous period accuracy, complex historical settings, and sophisticated character designs"
  }
};

const AGE_GROUPS = {
  toddler: { min: 0, max: 3 },
  preschool: { min: 4, max: 5 },
  early_elementary: { min: 6, max: 8 },
  late_elementary: { min: 9, max: 11 },
  middle_school: { min: 12, max: 14 },
  high_school: { min: 15, max: 17 },
  young_adult: { min: 18, max: 99 }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class StoryPersonalizer {
  constructor() {
    const apiKey = config.openai.API_KEY;
    const googleApiKey = config.google.api_key;

    if (!apiKey) {
      throw new ErrorHandler("OpenAI API key is required for text generation", 500);
    }

    this.openai = new OpenAI({ apiKey });
    this.s3Service = new S3Service();
    this.imageValidator = new ImageValidator();
    this.googleApiKey = googleApiKey;
  }

  _getAgeGroup(childAge) {
    const age = parseInt(childAge || "5");

    for (const [group, range] of Object.entries(AGE_GROUPS)) {
      if (age >= range.min && age <= range.max) {
        return group;
      }
    }
    return "early_elementary"; // default fallback
  }

  _getVisualStyle(childAge, theme) {
    const ageGroup = this._getAgeGroup(childAge);
    const lowerTheme = (theme || "").toLowerCase().replace(/[^a-z0-9]/g, "_");

    // Map common theme keywords to our style categories
    let themeCategory = "adventure"; // default

    if (lowerTheme.includes("sci_fi") || lowerTheme.includes("robot") || lowerTheme.includes("space") || lowerTheme.includes("future")) {
      themeCategory = "sci_fi";
    } else if (lowerTheme.includes("humor") || lowerTheme.includes("funny") || lowerTheme.includes("comedy") || lowerTheme.includes("joke")) {
      themeCategory = "humor";
    } else if (lowerTheme.includes("fantasy") || lowerTheme.includes("magic") || lowerTheme.includes("kingdom") || lowerTheme.includes("dragon") || lowerTheme.includes("wizard")) {
      themeCategory = "fantasy";
    } else if (lowerTheme.includes("classic") || lowerTheme.includes("vintage") || lowerTheme.includes("retro") || lowerTheme.includes("traditional")) {
      themeCategory = "classic";
    } else if (lowerTheme.includes("preschool") || lowerTheme.includes("toddler") || lowerTheme.includes("baby")) {
      themeCategory = "preschool";
    } else if (lowerTheme.includes("action") || lowerTheme.includes("battle") || lowerTheme.includes("hero") || lowerTheme.includes("superhero")) {
      themeCategory = "action";
    } else if (lowerTheme.includes("mystery") || lowerTheme.includes("detective") || lowerTheme.includes("secret") || lowerTheme.includes("puzzle")) {
      themeCategory = "mystery";
    } else if (lowerTheme.includes("historical") || lowerTheme.includes("history") || lowerTheme.includes("period") || lowerTheme.includes("ancient")) {
      themeCategory = "historical";
    }

    // Get the appropriate style for this age group and theme
    const style = STYLE_MAPPINGS[themeCategory]?.[ageGroup];

    // Fallback logic if specific age group doesn't exist for this theme
    if (!style || style === "n/a") {
      // Try to find the closest appropriate style
      if (ageGroup === "toddler" || ageGroup === "preschool") {
        return STYLE_MAPPINGS.preschool[ageGroup] || "in a simple, friendly cartoon style with bright colors and clear shapes";
      } else if (ageGroup === "early_elementary" || ageGroup === "late_elementary") {
        return STYLE_MAPPINGS.adventure[ageGroup] || "in a vibrant, engaging style suitable for young readers";
      } else {
        return STYLE_MAPPINGS.fantasy[ageGroup] || "in a detailed, engaging visual style appropriate for the story's themes";
      }
    }

    return style;
  }

  _generateDefaultDedication(childName, childAge) {
    const name = childName || "our little hero";
    const age = parseInt(childAge) || 5;
    const ageGroup = this._getAgeGroup(childAge);

    switch (ageGroup) {
      case "toddler":
        return `To our precious ${name}, may your world always be filled with wonder, laughter, and magical dreams. May this story be the first of many adventures that light up your imagination.`;
      case "preschool":
        return `For ${name}, our brave little explorer. May your curiosity lead you to amazing adventures, your heart be filled with kindness, and your days be bright with imagination. Always remember how special you are.`;
      case "early_elementary":
        return `To ${name}, our amazing adventurer. May this story inspire you to be brave, kind, and curious about the world. Remember that every great hero starts with a dream and a heart full of courage.`;
      case "late_elementary":
        return `For ${name}, who makes every day an adventure. May this story remind you that you have the power to create your own magic, overcome any challenge, and be the hero of your own journey. Dream big and shine bright.`;
      case "middle_school":
        return `To ${name}, as you discover the incredible person you're becoming. May this story inspire you to embrace your uniqueness, face challenges with courage, and always follow your heart to amazing adventures.`;
      case "high_school":
        return `For ${name}, standing at the threshold of amazing possibilities. May this story remind you that you have the strength, wisdom, and heart to create your own extraordinary future.`;
      case "young_adult":
        return `To ${name}, as you journey through these pages and through life. May this story inspire you to believe in yourself, chase your dreams with passion, and create a life filled with wonder and purpose.`;
      default:
        return `To ${name}, may this story bring you joy, inspiration, and magical moments to cherish always.`;
    }
  }

  _getGenderSpecificDetails(gender, childAge) {
    const age = parseInt(childAge || "5");
    const ageGroup = this._getAgeGroup(childAge);
    const genderValue = gender || "neutral";

    if (genderValue === "male") {
      switch (ageGroup) {
        case "toddler":
          return {
            clothing_suggestions: ["soft onesies", "comfortable rompers", "gentle cotton outfits"],
            accessories: ["soft toys", "comfort blanket", "gentle hat"],
            typical_poses: ["curious sitting", "gentle exploration", "playful interactions"],
            body_type: "toddler build, soft rounded features",
            facial_expression: "curious, happy, gentle"
          };
        case "preschool":
          return {
            clothing_suggestions: ["t-shirts with dinosaurs", "overalls", "superhero costumes", "comfortable shorts"],
            accessories: ["baseball cap", "backpack", "toy truck"],
            typical_poses: ["running with excitement", "curiously exploring", "playing with toys"],
            body_type: "young boy build, slightly rounded features",
            facial_expression: "curious, excited, playful"
          };
        case "early_elementary":
          return {
            clothing_suggestions: ["graphic tees", "jeans", "sports outfits", "adventure clothes"],
            accessories: ["baseball cap", "watch", "sports equipment"],
            typical_poses: ["brave stance", "solving problems", "helping friends"],
            body_type: "growing boy build, active and energetic",
            facial_expression: "determined, adventurous, friendly"
          };
        case "late_elementary":
          return {
            clothing_suggestions: ["hoodies", "cargo pants", "team jerseys", "outdoor gear"],
            accessories: ["digital watch", "backpack", "sports gear"],
            typical_poses: ["confident standing", "strategic thinking", "team leadership"],
            body_type: "pre-teen build, more defined features",
            facial_expression: "confident, thoughtful, determined"
          };
        case "middle_school":
          return {
            clothing_suggestions: ["casual teen fashion", "jackets", "active wear", "stylish outfits"],
            accessories: ["smartwatch", "headphones", "messenger bag"],
            typical_poses: ["confident posture", "leading adventures", "protecting others"],
            body_type: "teenage boy build, developing muscle definition",
            facial_expression: "confident, thoughtful, determined"
          };
        case "high_school":
          return {
            clothing_suggestions: ["modern fashion", "layered outfits", "athletic wear", "stylish casual"],
            accessories: ["tech gadgets", "stylish backpack", "fashionable watch"],
            typical_poses: ["mature posture", "strategic planning", "confident leadership"],
            body_type: "young adult build, defined features",
            facial_expression: "mature, confident, introspective"
          };
        case "young_adult":
          return {
            clothing_suggestions: ["adult fashion", "professional casual", "stylish outfits", "sophisticated wear"],
            accessories: ["smart devices", "quality backpack", "adult accessories"],
            typical_poses: ["professional posture", "experienced leadership", "mature confidence"],
            body_type: "adult build, fully developed features",
            facial_expression: "mature, confident, experienced"
          };
      }
    } else if (genderValue === "female") {
      switch (ageGroup) {
        case "toddler":
          return {
            clothing_suggestions: ["soft dresses", "gentle leggings", "comfortable onesies"],
            accessories: ["hair bows", "soft toys", "gentle shoes"],
            typical_poses: ["curious sitting", "gentle play", "exploring safely"],
            body_type: "toddler build, soft rounded features",
            facial_expression: "curious, happy, gentle"
          };
        case "preschool":
          return {
            clothing_suggestions: ["dresses with flowers", "colorful leggings", "sparkly tops", "tutu skirts"],
            accessories: ["hair bows", "colorful shoes", "small purse"],
            typical_poses: ["twirling with joy", "gentle interactions", "curious observation"],
            body_type: "young girl build, soft rounded features",
            facial_expression: "joyful, curious, gentle"
          };
        case "early_elementary":
          return {
            clothing_suggestions: ["colorful dresses", "comfortable skirts", "fashionable tops", "adventure outfits"],
            accessories: ["hair ribbons", "necklace", "bracelet"],
            typical_poses: ["graceful movements", "thoughtful expressions", "caring gestures"],
            body_type: "growing girl build, graceful and active",
            facial_expression: "thoughtful, caring, adventurous"
          };
        case "late_elementary":
          return {
            clothing_suggestions: ["stylish outfits", "fashionable dresses", "casual wear", "sports clothes"],
            accessories: ["hair accessories", "jewelry", "fashionable bag"],
            typical_poses: ["confident posture", "expressive gestures", "friendly interactions"],
            body_type: "pre-teen build, developing features",
            facial_expression: "confident, expressive, intelligent"
          };
        case "middle_school":
          return {
            clothing_suggestions: ["teen fashion", "stylish outfits", "comfortable yet trendy clothes"],
            accessories: ["hair accessories", "jewelry", "fashionable bag"],
            typical_poses: ["confident posture", "expressive gestures", "leadership stance"],
            body_type: "teenage girl build, more defined features",
            facial_expression: "confident, expressive, intelligent"
          };
        case "high_school":
          return {
            clothing_suggestions: ["young adult fashion", "stylish outfits", "mature clothing", "fashionable wear"],
            accessories: ["sophisticated jewelry", "designer bag", "fashion accessories"],
            typical_poses: ["mature posture", "confident expressions", "sophisticated gestures"],
            body_type: "young adult build, defined features",
            facial_expression: "mature, confident, sophisticated"
          };
        case "young_adult":
          return {
            clothing_suggestions: ["adult fashion", "professional wear", "sophisticated outfits", "elegant clothing"],
            accessories: ["quality jewelry", "professional bag", "adult accessories"],
            typical_poses: ["professional posture", "confident leadership", "mature presence"],
            body_type: "adult build, fully developed features",
            facial_expression: "mature, confident, professional"
          };
      }
    } else {
      // Gender-neutral details
      switch (ageGroup) {
        case "toddler":
          return {
            clothing_suggestions: ["comfortable onesies", "soft outfits", "gentle clothing"],
            accessories: ["soft toys", "comfort items", "gentle accessories"],
            typical_poses: ["curious exploration", "gentle play", "happy discovery"],
            body_type: "toddler build, soft features",
            facial_expression: "curious, happy, gentle"
          };
        case "preschool":
          return {
            clothing_suggestions: ["comfortable clothes", "colorful outfits", "playful wear"],
            accessories: ["fun accessories", "comfortable shoes", "play items"],
            typical_poses: ["happy expressions", "curious exploration", "friendly interactions"],
            body_type: "child build appropriate for age",
            facial_expression: "happy, curious, friendly"
          };
        case "early_elementary":
          return {
            clothing_suggestions: ["comfortable outfits", "colorful clothes", "active wear"],
            accessories: ["fun accessories", "comfortable shoes", "adventure gear"],
            typical_poses: ["energetic movements", "curious exploration", "friendly interactions"],
            body_type: "child build appropriate for age",
            facial_expression: "energetic, curious, friendly"
          };
        case "late_elementary":
          return {
            clothing_suggestions: ["stylish casual", "comfortable outfits", "age-appropriate fashion"],
            accessories: ["cool accessories", "comfortable shoes", "personal items"],
            typical_poses: ["confident posture", "friendly interactions", "thoughtful expressions"],
            body_type: "pre-teen build appropriate for age",
            facial_expression: "confident, friendly, thoughtful"
          };
        case "middle_school":
          return {
            clothing_suggestions: ["teen fashion", "comfortable outfits", "stylish casual"],
            accessories: ["tech accessories", "stylish bag", "personal items"],
            typical_poses: ["confident posture", "expressive gestures", "friendly interactions"],
            body_type: "teen build appropriate for age",
            facial_expression: "confident, expressive, friendly"
          };
        case "high_school":
          return {
            clothing_suggestions: ["young adult fashion", "stylish outfits", "comfortable casual"],
            accessories: ["sophisticated accessories", "quality bag", "personal tech"],
            typical_poses: ["mature posture", "confident expressions", "friendly interactions"],
            body_type: "young adult build appropriate for age",
            facial_expression: "mature, confident, friendly"
          };
        case "young_adult":
          return {
            clothing_suggestions: ["adult fashion", "sophisticated outfits", "professional casual"],
            accessories: ["quality accessories", "professional bag", "adult items"],
            typical_poses: ["professional posture", "confident presence", "mature interactions"],
            body_type: "adult build appropriate for age",
            facial_expression: "mature, confident, professional"
          };
      }
    }
  }

  // ... (rest of the methods remain the same as in your previous implementation)
  // Only the _getVisualStyle, _generateDefaultDedication, and _getGenderSpecificDetails methods were updated

  async extractComprehensiveFeaturesWithGoogleVision(photoUrl) {
    try {
      console.log("🔍 Starting Google Vision API feature extraction...");
      const requestBody = {
        requests: [{
          image: { source: { imageUri: photoUrl } },
          features: [
            { type: "FACE_DETECTION", maxResults: 10 },
            { type: "LABEL_DETECTION", maxResults: 20 },
            { type: "IMAGE_PROPERTIES", maxResults: 10 },
          ],
        }],
      };

      const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${this.googleApiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`Google Vision API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      const faceAnnotations = result.responses[0]?.faceAnnotations;
      const labelAnnotations = result.responses[0]?.labelAnnotations;
      const imageProperties = result.responses[0]?.imagePropertiesAnnotation;

      if (!faceAnnotations || faceAnnotations.length === 0) {
        console.log("❌ No faces detected in image");
        return null;
      }

      const face = faceAnnotations[0];
      console.log("✅ Face detected, analyzing features...");

      const features = this._extractFeaturesFromGoogleVision(face, labelAnnotations, imageProperties);
      console.log("📊 Google Vision Extracted Features:", JSON.stringify(features, null, 2));
      return features;
    } catch (error) {
      console.error("❌ Error extracting features with Google Vision:", error);
      return null;
    }
  }

  _extractFeaturesFromGoogleVision(face, labels, imageProperties) {
    let headwear = "none";
    if (face.headwearLikelihood !== "VERY_UNLIKELY" && face.headwearLikelihood !== "UNLIKELY") {
      headwear = this._getHeadwearType(labels);
    }

    let eyeglasses = "none";
    if (face.eyeglassesLikelihood !== "VERY_UNLIKELY" && face.eyeglassesLikelihood !== "UNLIKELY") {
      eyeglasses = this._getEyeglassesType(labels);
    }

    let facialHair = "none";
    if (face.beardLikelihood !== "VERY_UNLIKELY" && face.beardLikelihood !== "UNLIKELY") {
      facialHair = "beard";
    } else if (face.mustacheLikelihood !== "VERY_UNLIKELY" && face.mustacheLikelihood !== "UNLIKELY") {
      facialHair = "mustache";
    }

    const { clothingStyle, clothingColor } = this._extractClothingFromLabels(labels);
    const hairColor = this._extractHairColorFromLabels(labels);
    const hairStyle = this._extractHairStyleFromLabels(labels);
    const hairTexture = this._extractHairTextureFromLabels(labels);
    const hairLength = this._estimateHairLength(labels);
    const faceShape = this._determineFaceShape(face);
    const skinTone = this._estimateSkinToneFromColors(imageProperties);
    const ageEstimate = this._estimateAgeFromLandmarks(face);

    return {
      gender: this._estimateGenderFromFace(face),
      age_estimate: ageEstimate.toString(),
      skin_tone: skinTone,
      face_shape: faceShape,
      facial_features: {
        eye_shape: this._determineEyeShape(face),
        eye_color: this._estimateEyeColor(labels),
        nose_shape: this._determineNoseShape(face),
        lip_shape: this._determineLipShape(face),
        eyebrow_shape: this._determineEyebrowShape(face),
        cheekbones: this._determineCheekboneProminence(face),
      },
      hair_characteristics: {
        color: hairColor,
        type: hairTexture,
        style: hairStyle,
        length: hairLength,
        texture: hairTexture,
        parting: "unknown",
      },
      distinctive_features: this._extractDistinctiveFeatures(face, labels),
      complexion_details: this._extractComplexionDetails(face),
      expression_characteristics: this._extractExpressionCharacteristics(face),
      body_type: "average",
      confidence_level: "medium",
      additional_features: {
        headwear,
        eyeglasses,
        facial_hair: facialHair,
        clothing_style: clothingStyle,
        clothing_color: clothingColor,
      },
      extraction_source: "google_vision",
    };
  }

  _getHeadwearType(labels) {
    const headwearKeywords = ["hat", "cap", "beanie", "headband", "helmet", "crown"];
    const headwearLabel = labels?.find((label) =>
      headwearKeywords.some((keyword) => label.description.toLowerCase().includes(keyword)));
    return headwearLabel ? headwearLabel.description : "headwear";
  }

  _getEyeglassesType(labels) {
    const glassesKeywords = ["glasses", "spectacles", "sunglasses", "eyewear"];
    const glassesLabel = labels?.find((label) =>
      glassesKeywords.some((keyword) => label.description.toLowerCase().includes(keyword)));
    return glassesLabel ? glassesLabel.description : "eyeglasses";
  }

  _extractClothingFromLabels(labels) {
    let clothingStyle = "";
    let clothingColor = "";
    const clothingKeywords = ["shirt", "t-shirt", "sweater", "jacket", "hoodie", "dress", "top", "blouse", "sweatshirt"];
    const colorKeywords = ["red", "blue", "green", "yellow", "black", "white", "pink", "purple", "orange", "brown", "gray"];

    const clothingLabel = labels?.find((label) =>
      clothingKeywords.some((keyword) => label.description.toLowerCase().includes(keyword)));
    const colorLabel = labels?.find((label) =>
      colorKeywords.some((keyword) => label.description.toLowerCase().includes(keyword)));

    if (clothingLabel) clothingStyle = clothingLabel.description;
    if (colorLabel) clothingColor = colorLabel.description;

    return { clothingStyle, clothingColor };
  }

  _extractHairColorFromLabels(labels) {
    const hairColorKeywords = ["blond", "brunette", "black hair", "brown hair", "red hair", "auburn", "blonde"];
    const hairColorLabel = labels?.find((label) =>
      hairColorKeywords.some((keyword) => label.description.toLowerCase().includes(keyword)));
    return hairColorLabel ? hairColorLabel.description : "unknown";
  }

  _extractHairStyleFromLabels(labels) {
    const hairStyleKeywords = ["curly", "straight", "wavy", "braid", "ponytail", "bun", "dreadlocks", "afro"];
    const hairStyleLabel = labels?.find((label) =>
      hairStyleKeywords.some((keyword) => label.description.toLowerCase().includes(keyword)));
    return hairStyleLabel ? hairStyleLabel.description : "unknown";
  }

  _extractHairTextureFromLabels(labels) {
    const textureKeywords = ["curly", "straight", "wavy", "coily", "kinky"];
    const textureLabel = labels?.find((label) =>
      textureKeywords.some((keyword) => label.description.toLowerCase().includes(keyword)));
    return textureLabel ? textureLabel.description : "unknown";
  }

  _estimateHairLength(labels) {
    const lengthKeywords = ["short hair", "long hair", "medium hair"];
    const lengthLabel = labels?.find((label) =>
      lengthKeywords.some((keyword) => label.description.toLowerCase().includes(keyword)));

    if (lengthLabel) {
      const desc = lengthLabel.description.toLowerCase();
      if (desc.includes("short")) return "short";
      if (desc.includes("long")) return "long";
      if (desc.includes("medium")) return "medium";
    }
    return "unknown";
  }

  _determineFaceShape(face) {
    if (!face.boundingPoly) return "oval";
    const vertices = face.boundingPoly.vertices;
    if (vertices.length < 4) return "oval";

    const width = Math.abs(vertices[1].x - vertices[0].x);
    const height = Math.abs(vertices[3].y - vertices[0].y);
    const ratio = width / height;

    if (ratio > 0.85) return "round";
    if (ratio < 0.65) return "oval";
    return "square";
  }

  _estimateSkinToneFromColors(imageProperties) {
    if (!imageProperties?.dominantColors?.colors) return "medium tone";
    const dominantColor = imageProperties.dominantColors.colors[0];
    if (dominantColor.color) {
      const { red, green, blue } = dominantColor.color;
      if (red > 200 && green > 180 && blue > 160) return "light tone";
      if (red > 150 && green > 120 && blue < 100) return "medium tone";
      if (red < 120 && green < 100 && blue < 80) return "dark tone";
    }
    return "medium tone";
  }

  _estimateGenderFromFace(face) { return "unknown"; }

  _estimateAgeFromLandmarks(face) {
    if (face.detectionConfidence > 0.9) return "8";
    if (face.detectionConfidence > 0.7) return "6";
    return "5";
  }

  _determineEyeShape(face) { return "almond"; }
  _estimateEyeColor(labels) {
    const eyeColorKeywords = ["blue eyes", "brown eyes", "green eyes", "hazel eyes"];
    const eyeColorLabel = labels?.find((label) =>
      eyeColorKeywords.some((keyword) => label.description.toLowerCase().includes(keyword)));
    return eyeColorLabel ? eyeColorLabel.description : "brown";
  }
  _determineNoseShape(face) { return "straight"; }
  _determineLipShape(face) { return "medium"; }
  _determineEyebrowShape(face) { return "arched"; }
  _determineCheekboneProminence(face) { return "moderate"; }

  _extractDistinctiveFeatures(face, labels) {
    const features = [];
    if (face.joyLikelihood === "VERY_LIKELY") features.push("bright smile");
    if (face.sorrowLikelihood === "VERY_LIKELY") features.push("thoughtful expression");
    if (face.surpriseLikelihood === "VERY_LIKELY") features.push("surprised expression");

    const distinctiveKeywords = ["freckle", "dimple", "birthmark", "scar"];
    const distinctiveLabels = labels?.filter((label) =>
      distinctiveKeywords.some((keyword) => label.description.toLowerCase().includes(keyword)));
    distinctiveLabels?.forEach((label) => features.push(label.description));

    return features.length > 0 ? features : ["youthful appearance"];
  }

  _extractComplexionDetails(face) {
    const details = [];
    if (face.underExposedLikelihood === "VERY_LIKELY") details.push("fair complexion");
    if (face.overExposedLikelihood === "VERY_LIKELY") details.push("bright complexion");
    return details.join(", ") || "clear complexion";
  }

  _extractExpressionCharacteristics(face) {
    if (face.joyLikelihood === "VERY_LIKELY") return "happy and joyful";
    if (face.sorrowLikelihood === "VERY_LIKELY") return "thoughtful and serious";
    if (face.angerLikelihood === "VERY_LIKELY") return "intense and focused";
    if (face.surpriseLikelihood === "VERY_LIKELY") return "surprised and curious";
    return "neutral and calm";
  }

  async extractComprehensiveFeatures(photoUrl) {
    try {
      console.log("🔄 Starting comprehensive feature extraction...");
      let features = await this.extractComprehensiveFeaturesWithGoogleVision(photoUrl);

      if (!features || this._areFeaturesIncomplete(features)) {
        console.log("⚠️ Google Vision features incomplete, falling back to OpenAI...");
        features = await this.extractComprehensiveFeaturesWithOpenAI(photoUrl);
        if (features) {
          console.log("✅ OpenAI Extracted Features:", JSON.stringify(features, null, 2));
        } else {
          console.log("❌ Both Google Vision and OpenAI failed to extract features");
        }
      }
      return features;
    } catch (error) {
      console.error("❌ Error in comprehensive feature extraction:", error);
      return null;
    }
  }

  _areFeaturesIncomplete(features) {
    if (!features) return true;
    const requiredFields = ["skin_tone", "face_shape", "facial_features.eye_color", "hair_characteristics.color", "hair_characteristics.type", "hair_characteristics.style"];

    for (const field of requiredFields) {
      const value = this._getNestedValue(features, field);
      if (!value || value === "unknown" || value === "") {
        console.log(`❌ Missing field: ${field}`);
        return true;
      }
    }
    console.log("✅ All required features are present");
    return false;
  }

  _getNestedValue(obj, path) {
    return path.split(".").reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  async extractComprehensiveFeaturesWithOpenAI(photoUrl) {
    try {
      console.log("🧠 Starting OpenAI feature extraction...");
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{
          role: "user",
          content: [{
            type: "text",
            text: `Analyze this child's photo and extract comprehensive physical characteristics for accurate character representation. Include head and face shape, skin tone, hair details (color, style, length, texture), facial hair, eye color, accessories (eyeglasses, headwear), and clothing (style and color). Return ONLY a JSON object with this structure:
{
  "gender": "male" or "female" or "unknown",
  "age_estimate": "estimated age in years",
  "skin_tone": "detailed description of skin tone and complexion",
  "face_shape": "oval, round, heart, square, etc.",
  "facial_features": {
    "eye_shape": "almond, round, monolid, etc.",
    "eye_color": "brown, blue, green, hazel, etc.",
    "nose_shape": "button, straight, upturned, etc.",
    "lip_shape": "full, thin, bow-shaped, etc.",
    "eyebrow_shape": "straight, arched, rounded, etc.",
    "cheekbones": "high, prominent, soft, etc."
  },
  "hair_characteristics": {
    "color": "detailed hair color description",
    "type": "straight, wavy, curly, coily",
    "style": "hairstyle description",
    "length": "short, medium, long",
    "texture": "fine, thick, coarse",
    "parting": "center, side, none"
  },
  "distinctive_features": ["list of unique or prominent features"],
  "complexion_details": "skin texture, freckles, birthmarks, etc.",
  "expression_characteristics": "typical facial expression features",
  "body_type": "slim, average, sturdy, etc.",
  "confidence_level": "high/medium/low for overall accuracy",
  "additional_features": {
    "headwear": "description of any headwear",
    "eyeglasses": "description of eyeglasses if present",
    "facial_hair": "beard, mustache, stubble, or none",
    "clothing_style": "upper-body clothing style",
    "clothing_color": "upper-body clothing color"
  }
}`,
          }, {
            type: "image_url",
            image_url: { url: photoUrl },
          }],
        }],
        max_tokens: 2000,
      });

      const content = response.choices[0].message.content.trim();
      let features;
      try {
        features = JSON.parse(content);
      } catch (parseError) {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          features = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("Could not parse JSON from response");
        }
      }

      if (!features.additional_features) {
        features.additional_features = {
          headwear: "none",
          eyeglasses: "none",
          facial_hair: "none",
          clothing_style: "",
          clothing_color: "",
        };
      }

      features.extraction_source = "openai";
      return features;
    } catch (error) {
      console.error("❌ Error extracting comprehensive features with OpenAI:", error);
      throw error;
    }
  }

  async extractFacialExpressionAndPose(photoUrl) {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{
          role: "user",
          content: [{
            type: "text",
            text: `Analyze this child's facial expression and body language. Return ONLY a JSON object:
{
  "primary_expression": "happy, curious, playful, thoughtful, etc.",
  "expression_intensity": "subtle, moderate, pronounced",
  "eye_expression": "sparkling, wide-eyed, squinting, etc.",
  "smile_characteristics": "broad smile, slight smile, no smile, etc.",
  "posture": "confident, relaxed, energetic, shy, etc.",
  "gesture_style": "expressive, reserved, animated, calm",
  "energy_level": "high, medium, low",
  "notable_habits": "head tilt, specific hand gestures, etc."
}`,
          }, {
            type: "image_url",
            image_url: { url: photoUrl },
          }],
        }],
        max_tokens: 800,
      });

      const content = response.choices[0].message.content.trim();
      try {
        return JSON.parse(content);
      } catch (parseError) {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
        throw new Error("Could not parse JSON from response");
      }
    } catch (error) {
      console.error("Error extracting facial expression:", error);
      return null;
    }
  }

  async personalizeStory(templateId, personalizationDetails) {
    try {
      const { childName, childAge, skinTone, hairType, hairStyle, hairColor, eyeColor, clothing, gender, photoUrl, validationResult } = personalizationDetails;

      if (!templateId || !childName) {
        throw new ErrorHandler("Template ID and child name are required", 400);
      }

      const template = await BookTemplate.findByIdWithChapters(templateId);
      if (!template) {
        throw new ErrorHandler("Book template not found", 404);
      }

      if (!template.is_personalizable) {
        throw new ErrorHandler("This book template is not personalizable", 400);
      }

      let comprehensiveFeatures = null;
      let expressionAnalysis = null;

      if (photoUrl) {
        console.log("🖼️ Starting image analysis for personalization...");
        [comprehensiveFeatures, expressionAnalysis] = await Promise.all([
          this.extractComprehensiveFeatures(photoUrl),
          this.extractFacialExpressionAndPose(photoUrl),
        ]);
        console.log("✅ Image analysis completed");
      }

      const finalGender = await this.extractGenderFromPhoto(gender, validationResult, photoUrl, comprehensiveFeatures);
      personalizationDetails.gender = finalGender;

      const usePhotoData = this.shouldUsePhotoData(validationResult, comprehensiveFeatures);

      const [personalizedStory, storySummary] = await Promise.all([
        this.rewriteStoryWithAI(template, personalizationDetails),
        this.generateStorySummaryWithTemplate(template, childName),
      ]);

      const personalizedTitle = personalizedStory.book_title;

      const personalizedImages = await this.generateAllChapterImages(
        template,
        personalizedStory,
        personalizationDetails,
        usePhotoData,
        storySummary,
        comprehensiveFeatures,
        expressionAnalysis,
      );

      const personalizedCover = await this.generateOptimizedPersonalizedCover(
        personalizedTitle,
        personalizedStory,
        personalizationDetails,
        usePhotoData,
        storySummary,
        comprehensiveFeatures,
        expressionAnalysis,
      );

      const storybookContent = this.assemblePersonalizedBook(
        personalizedStory,
        personalizedImages,
        personalizedCover,
        personalizationDetails,
      );

      return {
        ...storybookContent,
        personalization_metadata: {
          personalized_for: childName,
          personalized_age: childAge || "",
          personalized_at: new Date().toISOString(),
          original_template_id: templateId,
          original_template_title: template.book_title,
          used_photo: !!photoUrl,
          used_photo_data: usePhotoData,
          child_characteristics: {
            skin_tone: skinTone || "",
            hair_type: hairType || "",
            hair_style: hairStyle || "",
            hair_color: hairColor || "",
            eye_color: eyeColor || "",
            clothing: clothing || "",
            gender: finalGender || "",
          },
          data_quality: validationResult?.dataQuality?.overallConfidence || "manual_input",
          confidence_warnings: validationResult?.warnings || [],
          extracted_gender: finalGender,
          gender_source: gender ? "manual" : validationResult ? "photo" : "default",
          story_summary: storySummary,
          comprehensive_features: comprehensiveFeatures,
          expression_analysis: expressionAnalysis,
        },
      };
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler(`Failed to personalize story: ${error.message}`, 500);
    }
  }

  async addPersonalizationToBook(bookId, userId, personsalisedId, personalizationData) {
    try {
      const book = await PersonalizedBook.findByIdForUser(bookId, personsalisedId, userId);

      if (!book) {
        throw new ErrorHandler("Book not found", 404);
      }

      if (!book.is_paid) {
        throw new ErrorHandler("Payment required before personalization", 402);
      }

      if (book.is_personalized) {
        throw new ErrorHandler("Book is already personalized", 400);
      }

      const defaultDedication = this._generateDefaultDedication(book.child_name, book.child_age);

      const enhancedPersonalizationData = {
        ...personalizationData,
        childName: book.child_name || "",
        childAge: book.child_age || "",
        gender: book.gender_preference || "",
        skinTone: personalizationData.skinTone || "",
        hairType: personalizationData.hairType || "",
        hairStyle: personalizationData.hairStyle || "",
        hairColor: personalizationData.hairColor || "",
        eyeColor: personalizationData.eyeColor || "",
        clothing: personalizationData.clothing || "",
        photoUrl: personalizationData.photoUrl || "",
        dedication_message: personalizationData.dedication_message || defaultDedication,
      };

      const personalizedContent = await this.personalizeStory(book.original_template_id, enhancedPersonalizationData);

      const updatedBook = await PersonalizedBook.addPersonalization(book._id, userId, book.original_template_id, {
        personalized_content: personalizedContent,
        dedication_message: enhancedPersonalizationData.dedication_message,
      });

      return updatedBook;
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler(`Failed to add personalization to book: ${error.message}`, 500);
    }
  }

  async createBookForPayment(templateId, userId, basicDetails) {
    try {
      const { childName, childAge, gender, video_url } = basicDetails;

      if (!templateId || !childName) {
        throw new ErrorHandler("Template ID and child name are required", 400);
      }

      const template = await BookTemplate.findById(templateId);
      if (!template) {
        throw new ErrorHandler("Book template not found", 404);
      }

      const bookData = {
        original_template_id: templateId,
        user_id: userId,
        child_name: childName || "",
        child_age: childAge || "",
        gender_preference: gender || "",
        price: template.price,
        book_title: template.book_title || "",
        genre: template.genre || "",
        cover_image: template.cover_image || [],
        video_url: template.video_url || video_url,
      };

      const book = await PersonalizedBook.createBookForPayment(bookData);
      return book;
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler(`Failed to create book for payment: ${error.message}`, 500);
    }
  }

  async generateStorySummaryWithTemplate(template, childName) {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{
          role: "system",
          content: `Create a brief summary of this children's story featuring ${childName}. Return ONLY JSON: {
              "summary": "2-3 sentence summary featuring ${childName}",
              "main_themes": ["array of 3-7 key themes"],
              "key_settings": ["array of 2-6 main locations"],
              "magical_elements": ["array of 3-8 magical elements"]
            }`,
        }, {
          role: "user",
          content: `STORY: ${template.book_title} - ${template.chapters.map((chap) => chap.chapter_title).join(", ")}`,
        }],
        max_tokens: 500,
      });

      const content = response.choices[0].message.content.trim();
      return JSON.parse(content);
    } catch (error) {
      return {
        summary: `A magical adventure story featuring ${childName}`,
        main_themes: ["adventure", "friendship", "courage"],
        key_settings: ["magical lands", "enchanted forests"],
        magical_elements: ["magic", "fantasy creatures", "wonder"],
      };
    }
  }

  async extractGenderFromPhoto(manualGender, validationResult, photoUrl, comprehensiveFeatures = null) {
    if (manualGender && (manualGender === "male" || manualGender === "female")) {
      return manualGender;
    }

    if (comprehensiveFeatures?.gender && comprehensiveFeatures.gender !== "unknown") {
      return comprehensiveFeatures.gender;
    }

    if (validationResult?.analysis?.gender && validationResult.analysis.gender !== "unknown") {
      return validationResult.analysis.gender;
    }

    if (photoUrl) {
      try {
        const extractedGender = await this.extractGenderWithVision(photoUrl);
        if (extractedGender && extractedGender !== "unknown") {
          return extractedGender;
        }
      } catch (error) {
        console.warn("Failed to extract gender from photo with vision:", error);
      }
    }

    return manualGender || "";
  }

  async extractGenderWithVision(photoUrl) {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{
          role: "user",
          content: [{
            type: "text",
            text: `Analyze this image of a child and determine their gender. Look for visual cues like hair length, clothing, facial features, and overall appearance that are typical for boys or girls. Return ONLY one word: "male", "female", or "unknown" if you cannot determine with confidence.`,
          }, {
            type: "image_url",
            image_url: { url: photoUrl },
          }],
        }],
        max_tokens: 10,
      });

      const gender = response.choices[0].message.content.trim().toLowerCase();
      if (gender === "male" || gender === "female") {
        return gender;
      }
      return "unknown";
    } catch (error) {
      console.error("Error extracting gender with vision:", error);
      return "unknown";
    }
  }

  shouldUsePhotoData(validationResult, comprehensiveFeatures = null) {
    if (comprehensiveFeatures && comprehensiveFeatures.confidence_level === "high") {
      return true;
    }

    if (!validationResult?.analysis?.characteristics) {
      return false;
    }

    const characteristics = validationResult.analysis.characteristics;
    const requiredFields = ["skin_tone", "hair_type", "hairstyle", "hair_color", "eye_color", "clothing"];
    const highConfidenceFields = requiredFields.filter(
      (field) => characteristics[field]?.confidence === "high" && characteristics[field]?.value && characteristics[field]?.value !== "unknown");

    return highConfidenceFields.length >= 3;
  }

  getMergedCharacteristics(personalizationDetails, usePhotoData, comprehensiveFeatures = null, expressionAnalysis = null) {
    const { skinTone, hairType, hairStyle, hairColor, eyeColor, clothing, validationResult, gender, childAge } = personalizationDetails;

    let mergedCharacteristics = {
      skinTone: skinTone || "",
      hairType: hairType || "",
      hairStyle: hairStyle || "",
      hairColor: hairColor || "",
      eyeColor: eyeColor || "",
      clothing: clothing || "",
      gender: gender || "",
      childAge: childAge || "",
      source: "manual",
    };

    if (usePhotoData) {
      if (comprehensiveFeatures) {
        mergedCharacteristics = this.mergeWithComprehensiveFeatures(mergedCharacteristics, comprehensiveFeatures);
      }

      if (validationResult?.analysis?.characteristics) {
        mergedCharacteristics = this.mergeWithValidationResult(mergedCharacteristics, validationResult.analysis.characteristics);
      }
    }

    if (expressionAnalysis) {
      mergedCharacteristics.expressionAnalysis = expressionAnalysis;
    }

    return this.enhanceWithAdvancedFeatures(mergedCharacteristics);
  }

  enhanceWithAdvancedFeatures(characteristics) {
    const gender = characteristics.gender || "neutral";
    const childAge = characteristics.childAge || "5";

    const genderDetails = this._getGenderSpecificDetails(gender, childAge);

    const enhancedCharacteristics = {
      ...characteristics,
      genderSpecificClothing: genderDetails.clothing_suggestions,
      typicalAccessories: genderDetails.accessories,
      typicalPoses: genderDetails.typical_poses,
      bodyType: characteristics.bodyType || genderDetails.body_type,
      facialExpression: characteristics.expressionAnalysis?.primary_expression || genderDetails.facial_expression,
      enhanced: true,
    };

    if (!characteristics.skinTone) {
      enhancedCharacteristics.skinTone = this.inferSkinToneFromGender(gender);
    }
    if (!characteristics.hairColor) {
      enhancedCharacteristics.hairColor = this.inferHairColorFromGender(gender);
    }
    if (!characteristics.eyeColor) {
      enhancedCharacteristics.eyeColor = "expressive";
    }
    if (!characteristics.faceShape) {
      enhancedCharacteristics.faceShape = "youthful";
    }

    return enhancedCharacteristics;
  }

  inferSkinToneFromGender(gender) {
    return gender === "male" ? "light warm tone" : "soft fair tone";
  }

  inferHairColorFromGender(gender) {
    return gender === "male" ? "chestnut brown" : "golden brown";
  }

  mergeWithComprehensiveFeatures(characteristics, comprehensiveFeatures) {
    const merged = {
      ...characteristics,
      skinTone: comprehensiveFeatures.skin_tone || characteristics.skinTone,
      hairType: comprehensiveFeatures.hair_characteristics?.type || characteristics.hairType,
      hairStyle: comprehensiveFeatures.hair_characteristics?.style || characteristics.hairStyle,
      hairColor: comprehensiveFeatures.hair_characteristics?.color || characteristics.hairColor,
      eyeColor: comprehensiveFeatures.facial_features?.eye_color || characteristics.eyeColor,
      faceShape: comprehensiveFeatures.face_shape || characteristics.faceShape,
      eyeShape: comprehensiveFeatures.facial_features?.eye_shape || characteristics.eyeShape,
      noseShape: comprehensiveFeatures.facial_features?.nose_shape || characteristics.noseShape,
      lipShape: comprehensiveFeatures.facial_features?.lip_shape || characteristics.lipShape,
      eyebrowShape: comprehensiveFeatures.facial_features?.eyebrow_shape || characteristics.eyebrowShape,
      cheekbones: comprehensiveFeatures.facial_features?.cheekbones || characteristics.cheekbones,
      hairLength: comprehensiveFeatures.hair_characteristics?.length || characteristics.hairLength,
      hairTexture: comprehensiveFeatures.hair_characteristics?.texture || characteristics.hairTexture,
      hairParting: comprehensiveFeatures.hair_characteristics?.parting || characteristics.hairParting,
      distinctiveFeatures: comprehensiveFeatures.distinctive_features || characteristics.distinctiveFeatures || [],
      complexionDetails: comprehensiveFeatures.complexion_details || characteristics.complexionDetails,
      bodyType: comprehensiveFeatures.body_type || characteristics.bodyType,
      source: "comprehensive_photo_analysis",
      confidence: comprehensiveFeatures.confidence_level,
    };

    if (comprehensiveFeatures.additional_features) {
      merged.headwear = comprehensiveFeatures.additional_features.headwear || "";
      merged.eyeglasses = comprehensiveFeatures.additional_features.eyeglasses || "";
      merged.facialHair = comprehensiveFeatures.additional_features.facial_hair || "";
      merged.clothingStyle = comprehensiveFeatures.additional_features.clothing_style || "";
      merged.clothingColor = comprehensiveFeatures.additional_features.clothing_color || "";
    }

    return merged;
  }

  mergeWithValidationResult(characteristics, validationChars) {
    const merged = { ...characteristics };

    if (validationChars.skin_tone?.confidence === "high") {
      merged.skinTone = validationChars.skin_tone.value;
    }
    if (validationChars.hair_type?.confidence === "high") {
      merged.hairType = validationChars.hair_type.value;
    }
    if (validationChars.hairstyle?.confidence === "high") {
      merged.hairStyle = validationChars.hairstyle.value;
    }
    if (validationChars.hair_color?.confidence === "high") {
      merged.hairColor = validationChars.hair_color.value;
    }
    if (validationChars.eye_color?.confidence === "high") {
      merged.eyeColor = validationChars.eye_color.value;
    }
    if (validationChars.clothing?.confidence === "high") {
      merged.clothing = validationChars.clothing.value;
    }

    return merged;
  }

  getBestCharacteristic(photoChar, manualChar) {
    if (photoChar?.confidence === "high" && photoChar?.value && photoChar.value !== "unknown") {
      return photoChar.value;
    }
    return manualChar;
  }

  async rewriteStoryWithAI(template, personalizationDetails) {
    const childName = personalizationDetails.childName || "";
    const childAge = personalizationDetails.childAge || "";
    const gender = personalizationDetails.gender || "";

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{
          role: "system",
          content: `Personalize this children's story for ${childName}${childAge ? ` (${childAge} years old)` : ""}${gender ? `, ${gender}` : ""}. Keep the same plot and structure but make ${childName} the main character. Return valid JSON with book_title and chapters array.`,
        }, {
          role: "user",
          content: JSON.stringify({
            original_story: template.book_title,
            chapters: template.chapters.map((chap) => ({
              chapter_title: chap.chapter_title,
              chapter_content: chap.chapter_content,
            })),
          }),
        }],
        max_tokens: 3000,
        temperature: 0.3,
      });

      const content = response.choices[0].message.content.trim();
      let personalizedStory;

      try {
        let jsonContent = content;
        if (jsonContent.startsWith("```json")) {
          jsonContent = jsonContent.replace(/```json\s*/, "").replace(/\s*```$/, "");
        }
        personalizedStory = JSON.parse(jsonContent);
      } catch (parseError) {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          personalizedStory = JSON.parse(jsonMatch[0]);
        } else {
          return this.createFallbackStory(template, childName);
        }
      }

      if (!personalizedStory.book_title || !personalizedStory.chapters) {
        return this.createFallbackStory(template, childName);
      }

      return {
        ...personalizedStory,
        chapters: personalizedStory.chapters.map((chapter, index) => ({
          ...chapter,
          image_position: template.chapters[index]?.image_position || "full scene",
          image_description: template.chapters[index]?.image_description || "",
        })),
        author: childName,
        genre: template.genre || "",
      };
    } catch (error) {
      return this.createFallbackStory(template, childName);
    }
  }

  createFallbackStory(template, childName) {
    const personalizedTitle = this.generatePersonalizedTitle(template.book_title, childName);

    return {
      book_title: personalizedTitle,
      chapters: template.chapters.map((chapter) => ({
        ...chapter,
      })),
      author: childName,
      genre: template.genre || "",
    };
  }

  generatePersonalizedTitle(originalTitle, childName) {
    return originalTitle.replace(/\b\w+\b's/, `${childName}'s`);
  }

  async generateAllChapterImages(template, personalizedStory, personalizationDetails, usePhotoData, storySummary, comprehensiveFeatures = null, expressionAnalysis = null) {
    const { childName, photoUrl, childAge } = personalizationDetails;

    const imageBatch = template.chapters.map((originalChapter, index) =>
      this.generateSingleChapterImage(
        originalChapter,
        personalizedStory.chapters[index],
        personalizationDetails,
        usePhotoData,
        childName,
        index,
        storySummary,
        template,
        comprehensiveFeatures,
        expressionAnalysis,
      ));

    const generatedImages = await Promise.allSettled(imageBatch);

    return generatedImages.map((result, index) =>
      result.status === "fulfilled" ? result.value : template.chapters[index]?.image_url || "");
  }

  async generateSingleChapterImage(originalChapter, personalizedChapter, personalizationDetails, usePhotoData, childName, index, storySummary, template, comprehensiveFeatures = null, expressionAnalysis = null) {
    try {
      const mergedChars = this.getMergedCharacteristics(personalizationDetails, usePhotoData, comprehensiveFeatures, expressionAnalysis);
      const { childAge, gender, photoUrl } = personalizationDetails;

      const visualStyle = this._getVisualStyle(childAge || "5", template.genre || "");

      const prompt = this.buildImagePrompt(
        personalizedChapter.image_description || originalChapter.image_description || "",
        originalChapter.image_position || "full scene",
        childName,
        childAge,
        gender,
        mergedChars,
        visualStyle,
        storySummary,
      );

      console.log(`Generating image for chapter ${index + 1} with prompt length: ${prompt.length}`);

      const imageResult = await this.generateImageWithOpenAI(prompt);
      let uploadedUrl;

      if (imageResult.b64_json) {
        console.log(`Uploading base64 image for chapter ${index + 1}`);
        const s3Key = this.s3Service.generateBase64ImageKey(`personalized-books/${childName}/chapters`, "png");
        uploadedUrl = await this.s3Service.uploadBase64Image(imageResult.b64_json, s3Key, "image/png");
      } else if (imageResult.url) {
        console.log(`Uploading URL image for chapter ${index + 1}`);
        const s3Key = this.s3Service.generateImageKey(`personalized-books/${childName}/chapters`, `chapter-${index + 1}-${Date.now()}`);
        uploadedUrl = await this.s3Service.uploadImageFromUrl(imageResult.url, s3Key);
      } else {
        throw new Error("No image data available from OpenAI");
      }

      console.log(`Successfully uploaded image for chapter ${index + 1}: ${uploadedUrl}`);
      return uploadedUrl;
    } catch (error) {
      console.error(`Error generating chapter image ${index + 1}:`, error);
      return originalChapter.image_url || "";
    }
  }

  buildImagePrompt(imageDescription, imagePosition, childName, childAge, gender, mergedChars, visualStyle, storySummary) {
    const themes = (storySummary.main_themes || []).slice(0, 3).join(", ");
    const settings = (storySummary.key_settings || []).slice(0, 2).join(", ");
    const magicalElements = (storySummary.magical_elements || []).slice(0, 3).join(", ");

    const genderDetails = this._getGenderSpecificDetails(gender || "neutral", childAge || "5");
    const clothingSuggestion = genderDetails.clothing_suggestions[0] || "comfortable clothes";
    const poseSuggestion = mergedChars.expressionAnalysis?.posture || genderDetails.typical_poses[0] || "happy expression";

    let physicalCharacteristics = [];
    if (mergedChars.skinTone) physicalCharacteristics.push(`Skin tone: ${mergedChars.skinTone}`);
    if (mergedChars.faceShape) physicalCharacteristics.push(`Face shape: ${mergedChars.faceShape}`);
    if (mergedChars.eyeShape) physicalCharacteristics.push(`Eye shape: ${mergedChars.eyeShape}`);
    if (mergedChars.eyeColor) physicalCharacteristics.push(`Eye color: ${mergedChars.eyeColor}`);
    if (mergedChars.noseShape) physicalCharacteristics.push(`Nose shape: ${mergedChars.noseShape}`);
    if (mergedChars.lipShape) physicalCharacteristics.push(`Lip shape: ${mergedChars.lipShape}`);
    if (mergedChars.hairColor) physicalCharacteristics.push(`Hair color: ${mergedChars.hairColor}`);
    if (mergedChars.hairStyle) physicalCharacteristics.push(`Hairstyle: ${mergedChars.hairStyle}`);
    if (mergedChars.hairType) physicalCharacteristics.push(`Hair type: ${mergedChars.hairType}`);
    if (mergedChars.bodyType) physicalCharacteristics.push(`Body type: ${mergedChars.bodyType}`);
    if (mergedChars.headwear && mergedChars.headwear !== "none") physicalCharacteristics.push(`Headwear: ${mergedChars.headwear}`);
    if (mergedChars.eyeglasses && mergedChars.eyeglasses !== "none") physicalCharacteristics.push(`Eyeglasses: ${mergedChars.eyeglasses}`);
    if (mergedChars.facialHair && mergedChars.facialHair !== "none") physicalCharacteristics.push(`Facial hair: ${mergedChars.facialHair}`);
    if (mergedChars.clothingStyle) physicalCharacteristics.push(`Clothing style: ${mergedChars.clothingStyle}`);
    if (mergedChars.clothingColor) physicalCharacteristics.push(`Clothing color: ${mergedChars.clothingColor}`);

    const physicalDescription = physicalCharacteristics.length > 0 ? `PHYSICAL CHARACTERISTICS:\n${physicalCharacteristics.join("\n")}` : `A ${childAge || "young"}-year-old ${gender || "child"}`;

    return `CRITICAL: Main character must be ${childName}${childAge ? `, ${childAge} years old` : ""}${gender ? `, ${gender}` : ""}.

${physicalDescription}

EXPRESSION AND PERSONALITY:
- Primary expression: ${mergedChars.facialExpression}
- Posture: ${poseSuggestion}
- Energy level: ${mergedChars.expressionAnalysis?.energy_level || "balanced"}

STORY CONTEXT:
- Themes: ${themes}
- Settings: ${settings}
- Magical elements: ${magicalElements}
- Visual style: ${visualStyle}

SCENE: ${imageDescription}
IMAGE POSITION: ${imagePosition}

CLOTHING: ${mergedChars.clothing || clothingSuggestion}

IMPORTANT: Character must maintain consistent appearance across all images. No text in image. ABSOLUTELY NO TEXT, WORDS, LETTERS, OR WRITING OF ANY KIND IN THE IMAGE. Pure visual illustration only with bright, friendly, whimsical, child-friendly style.`;
  }

  async generateOptimizedPersonalizedCover(personalizedTitle, personalizedStory, personalizationDetails, usePhotoData, storySummary, comprehensiveFeatures = null, expressionAnalysis = null) {
    try {
      const { childName, childAge, gender, photoUrl } = personalizationDetails;
      const mergedChars = this.getMergedCharacteristics(personalizationDetails, usePhotoData, comprehensiveFeatures, expressionAnalysis);

      const visualStyle = this._getVisualStyle(childAge || "5", personalizedStory.genre || "");

      const genderDetails = this._getGenderSpecificDetails(gender || "neutral", childAge || "5");

      const coverPrompt = this.buildCoverPrompt(personalizedTitle, storySummary, childName, mergedChars, visualStyle, genderDetails);

      console.log("Generating cover image with prompt length:", coverPrompt.length);

      const imageResult = await this.generateImageWithOpenAI(coverPrompt);
      let uploadedUrl;

      if (imageResult.b64_json) {
        console.log("Uploading base64 cover image");
        const s3Key = this.s3Service.generateBase64ImageKey(`personalized-books/${childName}/covers`, "png");
        uploadedUrl = await this.s3Service.uploadBase64Image(imageResult.b64_json, s3Key, "image/png");
      } else if (imageResult.url) {
        console.log("Uploading URL cover image");
        const s3Key = this.s3Service.generateImageKey(`personalized-books/${childName}/covers`, `personalized-cover-${Date.now()}`);
        uploadedUrl = await this.s3Service.uploadImageFromUrl(imageResult.url, s3Key);
      } else {
        throw new Error("No image data available from OpenAI for cover");
      }

      console.log(`Successfully uploaded cover image: ${uploadedUrl}`);
      return uploadedUrl;
    } catch (error) {
      console.error("Error generating personalized cover:", error);
      return null;
    }
  }

  buildCoverPrompt(bookTitle, storySummary, childName, mergedChars, visualStyle, genderDetails) {
    const themes = (storySummary.main_themes || []).slice(0, 3).join(", ");
    const settings = (storySummary.key_settings || []).slice(0, 2).join(", ");
    const magicalElements = (storySummary.magical_elements || []).slice(0, 3).join(", ");

    const clothingSuggestion = genderDetails.clothing_suggestions[0] || "comfortable clothes";
    const poseSuggestion = mergedChars.expressionAnalysis?.posture || genderDetails.typical_poses[0] || "happy expression";

    let characterDescription = `MAIN CHARACTER: ${childName}`;
    if (mergedChars.gender) characterDescription += `, ${mergedChars.gender}`;
    if (mergedChars.childAge) characterDescription += `, ${mergedChars.childAge} years old`;

    if (mergedChars.skinTone) characterDescription += `, ${mergedChars.skinTone} skin`;
    if (mergedChars.faceShape) characterDescription += `, ${mergedChars.faceShape} face`;
    if (mergedChars.eyeColor) characterDescription += `, ${mergedChars.eyeColor} eyes`;
    if (mergedChars.hairColor) characterDescription += `, ${mergedChars.hairColor} hair`;
    if (mergedChars.headwear && mergedChars.headwear !== "none") characterDescription += `, wearing ${mergedChars.headwear}`;
    if (mergedChars.eyeglasses && mergedChars.eyeglasses !== "none") characterDescription += `, with ${mergedChars.eyeglasses}`;
    if (mergedChars.clothingStyle) characterDescription += `, wearing ${mergedChars.clothingStyle}`;
    if (mergedChars.clothingColor) characterDescription += ` in ${mergedChars.clothingColor}`;

    return `BOOK COVER: "${bookTitle}"

${characterDescription}

EXPRESSION: ${mergedChars.facialExpression}
POSTURE: ${poseSuggestion}
CLOTHING: ${mergedChars.clothing || clothingSuggestion}

STORY ELEMENTS:
- Themes: ${themes}
- Settings: ${settings}
- Magical elements: ${magicalElements}
- Visual style: ${visualStyle}

STORY SUMMARY: ${(storySummary.summary || "").substring(0, 100)}

STYLE: children's book cover, no text, vibrant colors, captivating magical atmosphere. ABSOLUTELY NO TEXT, WORDS, LETTERS, OR WRITING OF ANY KIND IN THE IMAGE. No book titles, no captions, no speech bubbles, no labels. Pure visual illustration only.`;
  }

  async generateImageWithOpenAI(safePrompt, options = {}) {
    const MAX_RETRIES = 5;
    let initialDelay = 5000;

    for (let retries = 0; retries < MAX_RETRIES; retries++) {
      try {
        console.log("Generating image with OpenAI...");

        const requestOptions = {
          model: "gpt-image-1",
          prompt: safePrompt,
          n: 1,
          size: "1024x1024",
          ...options,
        };

        delete requestOptions.response_format;

        const response = await this.openai.images.generate(requestOptions);

        console.log("OpenAI response received:", {
          hasData: !!response.data,
          dataLength: response.data?.length,
          firstItemKeys: response.data?.[0] ? Object.keys(response.data[0]) : 'no data'
        });

        if (!response.data || !response.data[0]) {
          throw new Error("No image data received from OpenAI");
        }

        const imageData = response.data[0];

        if (imageData.b64_json) {
          console.log("Returning base64 image data");
          return { b64_json: imageData.b64_json, provider: "openai" };
        }

        if (imageData.url) {
          console.log("Returning URL image data");
          return { url: imageData.url, provider: "openai" };
        }

        throw new Error("No image data found in response");

      } catch (openAIError) {
        console.error("OpenAI image generation failed:", openAIError);

        if (retries < MAX_RETRIES - 1) {
          const delay = initialDelay * Math.pow(2, retries);
          console.log(`Retrying in ${delay}ms... (Attempt ${retries + 1}/${MAX_RETRIES})`);
          await sleep(delay);
          continue;
        }
        break;
      }
    }

    console.warn("All retries failed for OpenAI image generation. Returning fallback.");
    return {
      url: `https://via.placeholder.com/1024x1024/4A90E2/FFFFFF?text=Image+Coming+Soon`,
      provider: "fallback",
    };
  }

  assemblePersonalizedBook(personalizedStory, chapterImages, coverImage, personalizationDetails) {
    const { childName, childAge, skinTone, hairType, hairStyle, hairColor, eyeColor, clothing, gender } = personalizationDetails;

    const updatedChapters = personalizedStory.chapters.map((chapter, index) => ({
      ...chapter,
      image_url: chapterImages[index] || chapter.image_url || "",
      image_position: chapter.image_position || "full scene",
    }));

    return {
      ...personalizedStory,
      chapters: updatedChapters,
      cover_image: coverImage ? [coverImage] : [],
      child_name: childName || "",
      child_age: childAge || "",
      skin_tone: skinTone || "",
      hair_type: hairType || "",
      hair_style: hairStyle || "",
      hair_color: hairColor || "",
      eye_color: eyeColor || "",
      clothing: clothing || "",
      gender: gender || "",
    };
  }

  getIdealPhotoGuidelines() {
    return this.imageValidator.getIdealImageSpecifications();
  }
}

export default StoryPersonalizer;