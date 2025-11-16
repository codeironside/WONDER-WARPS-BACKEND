import { GoogleGenAI } from "@google/genai";
import { config } from "@/config";

class VeoGenerator {
  constructor() {
    const apiKey = config.google.api_key;
    const projectId = config.google.PROJECT_ID || "962555248018";

    if (!apiKey) {
      throw new Error("Google API key is required for Veo generator.");
    }

    this.ai = new GoogleGenAI({
      apiKey: apiKey,
    });

    this.projectId = projectId;
    this.apiKey = apiKey;

    this.defaultConfig = {
      numberOfVideos: 1,
      resolution: "720p",
      aspectRatio: "16:9",
    };
  }

  getPublicVideoUri(downloadUri) {
    if (!downloadUri || !this.apiKey) {
      return null;
    }
    return `${downloadUri}&key=${this.apiKey}`;
  }

  async generateVideo(prompt, options = {}) {
    try {
      console.log(`Starting video generation for prompt: "${prompt}"`);
      console.log(`Using project ID: ${this.projectId}`);

      const config = {
        ...this.defaultConfig,
        ...options,
      };

      let operation = await this.ai.models.generateVideos({
        model: "veo-3.1-fast-generate-preview",
        prompt: prompt,
        config: config,
      });

      console.log(
        "Video generation operation started. Polling for completion...",
      );

      while (!operation.done) {
        await new Promise((resolve) => setTimeout(resolve, 10000));
        console.log("...still generating...");
        operation = await this.ai.operations.getVideosOperation({
          operation: operation,
        });
      }

      const video = operation.response?.generatedVideos?.[0];
      if (video?.video?.uri) {
        const downloadUri = video.video.uri;
        const publicUri = this.getPublicVideoUri(downloadUri);
        console.log("Video generated successfully!");

        return {
          success: true,
          video_uri: publicUri,
          prompt: prompt,
          config: config,
          duration: video.duration || 10,
          resolution: config.resolution,
          project_id: this.projectId,
        };
      } else {
        console.error(
          "Operation finished, but no video URI was found.",
          operation,
        );
        throw new Error("Video generation failed or returned no video URI.");
      }
    } catch (error) {
      console.error("An error occurred during video generation:", error);
      return {
        success: false,
        error: error.message,
        prompt: prompt,
        project_id: this.projectId,
        fallback_url: this.generateFallbackUrl(prompt),
      };
    }
  }

  async generateStorybookAnimation(
    storyTitle,
    characterName,
    gender,
    theme,
    visualStyle,
    storySummary,
    keyMoments,
    ageMin,
    ageMax,
  ) {
    const ageRange = `${ageMin}-${ageMax}`;
    const prompt = this.createStorySpecificAnimationPrompt(
      storyTitle,
      characterName,
      gender,
      theme,
      visualStyle,
      storySummary,
      keyMoments,
      ageRange,
    );

    const options = {
      resolution: "720p",
      aspectRatio: "16:9",
      duration: "10s",
    };

    return await this.generateVideo(prompt, options);
  }

  createStorySpecificAnimationPrompt(
    storyTitle,
    characterName,
    gender,
    theme,
    visualStyle,
    storySummary,
    keyMoments,
    ageRange,
  ) {
    const keyMomentsText = keyMoments
      .slice(0, 3)
      .map((moment, index) => `Scene ${index + 1}: ${moment}`)
      .join(". ");

    const [ageMin, ageMax] = ageRange
      .split("-")
      .map((age) => parseInt(age.trim()));
    const isPreschool = ageMin <= 6;
    const isMiddleChild = ageMin > 6 && ageMin <= 10;
    const isOlderChild = ageMin > 10;

    return `A 10-second cinematic book trailer animation for "${storyTitle}" in ${visualStyle} style, specifically created for children aged ${ageRange}.

STORY CONTEXT:
- Protagonist: ${characterName}, a ${gender} child
- Theme: ${theme}
- Story Summary: ${storySummary}
- Key Story Moments: ${keyMomentsText}
- Target Audience: Children aged ${ageRange}

ANIMATION SPECIFICS:
- Opening: ${characterName} discovers the main story element
- Middle: A pivotal moment of wonder or challenge
- Closing: ${characterName} achieves something meaningful
- Visual Style: ${visualStyle}
- Mood: Magical, adventurous, heartwarming
- Camera: Dynamic cinematic movements, smooth transitions
- Lighting: Magical glow, vibrant colors, atmospheric
- No text, no words, pure visual storytelling

AGE-APPROPRIATE CONTENT REQUIREMENTS:
- Content must be suitable and engaging for children aged ${ageRange}
- ${isPreschool ? "Use simple, clear visual storytelling with bright primary colors. Character expressions should be exaggerated and easy to understand. Avoid complex plot points." : ""}
- ${isMiddleChild ? "Use vibrant colors and dynamic compositions. Character expressions should be clear but more nuanced. Storytelling can include mild challenges and simple moral lessons." : ""}
- ${isOlderChild ? "Use sophisticated color palettes and complex compositions. Character development can be more detailed. Storytelling can include more complex challenges and character growth." : ""}
- Character expressions should be appropriate for ${ageRange} year olds
- Movements should be ${isPreschool ? "slow and clear" : "smooth and dynamic"} for young viewers
- Avoid any scary, intense, or age-inappropriate content
- Maintain a positive, uplifting tone throughout
- Visual storytelling should be ${isPreschool ? "very simple and direct" : isMiddleChild ? "clear and engaging" : "sophisticated but accessible"} for children to follow

TECHNICAL NOTES:
- 10-second duration
- Seamless scene transitions
- Character expressions showing wonder and determination
- Magical visual effects appropriate for children's content
- Optimized for ${ageRange} year old children's attention spans and comprehension`;
  }

  generateFallbackUrl(prompt) {
    const encodedPrompt = encodeURIComponent(prompt.substring(0, 50));
    return `https://via.placeholder.com/1280x720/4A90E2/FFFFFF?text=Veo+Animation:${encodedPrompt}`;
  }

  async generateAnimationFrames(
    storyTitle,
    keyMoments,
    frameCount = 4,
    ageRange = "5-10",
  ) {
    try {
      const frames = [];
      for (let i = 0; i < Math.min(frameCount, keyMoments.length); i++) {
        const moment = keyMoments[i];
        const framePrompt = `Storyboard frame for "${storyTitle}": ${moment}. Cinematic composition, dynamic camera angle, emotional moment. Content suitable for children aged ${ageRange}.`;
        frames.push({
          frame_number: i + 1,
          timestamp: `${(i * (10 / frameCount)).toFixed(1)}s`,
          image_url: this.generateFramePlaceholder(framePrompt),
          description: moment,
          prompt: framePrompt,
          age_range: ageRange,
        });
      }
      return frames;
    } catch (error) {
      console.error("Error generating animation frames:", error);
      return [];
    }
  }

  generateFramePlaceholder(prompt) {
    const encodedPrompt = encodeURIComponent(prompt.substring(0, 30));
    return `https://via.placeholder.com/1024x1024/9361F3/FFFFFF?text=Storyboard:${encodedPrompt}`;
  }

  getProjectId() {
    return this.projectId;
  }
}

export default VeoGenerator;
