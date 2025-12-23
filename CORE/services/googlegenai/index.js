import { GoogleGenAI } from "@google/genai";
import { config } from "@/config";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    const MAX_RETRIES = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(
          `Starting video generation (Attempt ${attempt}/${MAX_RETRIES})`,
        );

        const currentPrompt =
          attempt > 1 ? this.sanitizePromptForRetry(prompt) : prompt;

        if (attempt > 1) {
          console.log(
            "Using sanitized prompt for retry:",
            currentPrompt.substring(0, 100) + "...",
          );
        }

        const config = {
          ...this.defaultConfig,
          ...options,
        };

        let operation = await this.ai.models.generateVideos({
          model: "veo-3.1-fast-generate-preview",
          prompt: currentPrompt,
          config: config,
        });

        console.log(
          `Video generation operation started (Attempt ${attempt}). Polling...`,
        );

        while (!operation.done) {
          await sleep(10000);
          console.log("...still generating...");
          operation = await this.ai.operations.getVideosOperation({
            operation: operation,
          });
        }

        if (operation.response?.raiMediaFilteredCount > 0) {
          const reason =
            operation.response.raiMediaFilteredReasons?.[0] ||
            "Unknown safety reason";
          throw new Error(`Video filtered by safety check: ${reason}`);
        }

        const video = operation.response?.generatedVideos?.[0];
        if (video?.video?.uri) {
          const downloadUri = video.video.uri;
          const publicUri = this.getPublicVideoUri(downloadUri);
          console.log("Video generated successfully!");

          return {
            success: true,
            video_uri: publicUri,
            prompt: currentPrompt,
            config: config,
            duration: video.duration || 10,
            resolution: config.resolution,
            project_id: this.projectId,
          };
        } else {
          console.error(
            "Operation finished but no video URI found:",
            operation,
          );
          throw new Error("Video generation failed or returned no video URI.");
        }
      } catch (error) {
        console.error(
          `Video generation attempt ${attempt} failed:`,
          error.message,
        );
        lastError = error;

        if (attempt < MAX_RETRIES) {
          console.log("Waiting 5 seconds before retrying...");
          await sleep(5000);
        }
      }
    }

    console.error("All video generation attempts failed.");
    return {
      success: false,
      error: lastError ? lastError.message : "Unknown error",
      video_uri: null,
      prompt: prompt,
      project_id: this.projectId,
      fallback_url: this.generateFallbackUrl(prompt),
    };
  }

  sanitizePromptForRetry(originalPrompt) {
    const sentences = originalPrompt.split(".");
    const safePrompt =
      sentences.slice(0, 2).join(". ") +
      ". High quality, cinematic, 4k, animated movie style. No text.";
    return safePrompt;
  }

  async generateStorybookAnimation(
    bookTitle,
    characterName,
    gender,
    theme,
    visualStyle,
    storySummary,
    keyMoments,
    ageMin,
    ageMax,
    bookCoverUrl,
    chapterImageUrls,
  ) {
    const ageRange = `${ageMin}-${ageMax}`;
    const prompt = this.createReadingSessionPrompt(
      bookTitle,
      characterName,
      gender,
      theme,
      visualStyle,
      storySummary,
      keyMoments,
      ageRange,
      bookCoverUrl,
      chapterImageUrls,
    );

    const options = {
      resolution: "720p",
      aspectRatio: "16:9",
      duration: "10s",
    };

    return await this.generateVideo(prompt, options);
  }

  createReadingSessionPrompt(
    bookTitle,
    characterName,
    gender,
    theme,
    visualStyle,
    storySummary,
    keyMoments,
    ageRange,
    bookCoverUrl,
    chapterImageUrls,
  ) {
    const keyMomentsText = keyMoments
      .slice(0, 3)
      .map((moment, index) => `Page ${index + 1}: ${moment}`)
      .join(". ");

    const [ageMin, ageMax] = ageRange
      .split("-")
      .map((age) => parseInt(age.trim()));
    const isPreschool = ageMin <= 6;
    const isMiddleChild = ageMin > 6 && ageMin <= 10;
    const isOlderChild = ageMin > 10;

    return `A 10-second cinematic video of a child named ${characterName} reading the book "${bookTitle}" with their parents, using the actual book images created for this story.

BOOK DETAILS:
- Book Title: "${bookTitle}"
- Main Character: ${characterName}, a ${gender} child
- Theme: ${theme}
- Visual Style: ${visualStyle}
- Story Summary: ${storySummary}
- Key Story Moments in the book: ${keyMomentsText}
- Target Audience: Children aged ${ageRange}

VIDEO SCENARIO:
The video shows ${characterName} and their parents sitting together in a cozy living room, reading the actual physical book "${bookTitle}". They are turning pages, pointing at illustrations, and reacting to the story with wonder and joy.

SPECIFIC SCENES:
1. Opening shot: ${characterName} excitedly holds the book "${bookTitle}" showing the cover to the parents.
2. Middle sequence: Parents and child turning pages together, looking at the book's illustrations that show key story moments.
3. Close-up shots: Child's face lighting up with wonder as they see the book's magical illustrations.
4. Ending: Family hugging with the book open on their laps, showing a heartwarming illustration from the story.

BOOK IMAGES USED:
- The book cover is shown clearly in the opening shot.
- The book's interior illustrations (created for each chapter) are visible as pages are turned.
- The promotional images (book on wall, reading together scene) are integrated as decorative elements in the background.

TECHNICAL DIRECTIONS:
- Show the actual book with its cover and interior pages
- Include close-ups of the book's illustrations as pages turn
- Camera moves dynamically around the reading family
- Warm, cozy lighting with magical atmospheric glow
- Character expressions: wonder, joy, bonding
- 10-second duration with smooth transitions
- Visual style: ${visualStyle}

AGE-APPROPRIATE DIRECTIONS:
- Content suitable for children aged ${ageRange}
- ${isPreschool ? "Simple, clear visual storytelling with bright primary colors. Slow page turning, exaggerated happy expressions." : ""}
- ${isMiddleChild ? "Vibrant colors and dynamic compositions. Clear page turning with visible illustrations. Character expressions show curiosity and excitement." : ""}
- ${isOlderChild ? "Sophisticated color palettes and complex camera movements. Detailed illustrations visible. Character expressions show deeper engagement with the story." : ""}
- Movements: ${isPreschool ? "slow and clear" : "smooth and dynamic"}
- Positive, uplifting family bonding atmosphere
- No scary or intense content, only wonder and joy

VISUAL STYLE NOTES:
- Use ${visualStyle} for the entire scene
- The book and its illustrations should match the created visual style
- Magical glow around the book when opened
- Cozy home environment with warm lighting`;
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
        const framePrompt = `Storyboard frame for reading session of "${storyTitle}": ${moment}. Child and parents reading together, pointing at book illustration. Content suitable for children aged ${ageRange}.`;
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
    return `https://via.placeholder.com/1024x1024/9361F3/FFFFFF?text=Reading+Session:${encodedPrompt}`;
  }

  getProjectId() {
    return this.projectId;
  }
}

export default VeoGenerator;
