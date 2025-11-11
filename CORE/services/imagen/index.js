import { GoogleGenAI } from "@google/genai";
import { config } from "@/config";
import ErrorHandler from "@/Error";

class ImagenGenerator {
  constructor() {
    const apiKey = config.google.api_key;
    if (!apiKey) {
      throw new ErrorHandler(
        "Google API key is required for Imagen generator.",
        500,
      );
    }

    this.ai = new GoogleGenAI({ apiKey });
    this.apiKey = apiKey;

    this.defaultConfig = {
      model: "imagen-4.0-generate-001",
      numberOfImages: 1,
      aspectRatio: "1:1",
      outputMimeType: "image/jpeg",
    };
  }

  async generateImage(prompt, options = {}) {
    try {
      const config = {
        ...this.defaultConfig,
        ...options,
      };
      if (options.baseImage) {
        console.warn(
          "WARNING: baseImage provided. This implementation primarily supports text-to-image; true image-to-image may require file upload via GenAI API.",
        );
      }

      const response = await this.ai.models.generateImages({
        model: config.model,
        prompt: prompt,
        config: {
          numberOfImages: config.numberOfImages,
          outputMimeType: config.outputMimeType,
          aspectRatio: config.aspectRatio,
        },
      });
      console.log(response.generatedImages?.[0]);
      const generatedImage = response.generatedImages?.[0];
      if (generatedImage.image.imageBytes) {
        const mime = generatedImage.image.mimeType || "image/jpeg";

        return `data:${mime};base64,${generatedImage.image.imageBytes}`;
      } else {
        const safety = generatedImage?.safetyAttributes || {};
        if (safety.blocked) {
          console.error(
            `Imagen generation blocked: ${safety.categories?.join(", ")}`,
          );
          throw new Error(`Generation blocked by safety filter.`);
        }

        throw new Error(
          "Imagen generation failed or returned no image data (URI or Base64).",
        );
      }
    } catch (error) {
      console.error("An error occurred during Imagen image generation:", error);
      throw new ErrorHandler(
        `Failed to generate image with Imagen: ${error.message}`,
        500,
      );
    }
  }
}

export default ImagenGenerator;
