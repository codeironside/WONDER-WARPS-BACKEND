import { Configuration, OpenAIApi } from 'openai';

class StorybookGenerator {
    constructor(apiKey) {
        const configuration = new Configuration({
            apiKey: apiKey,
        });
        this.openai = new OpenAIApi(configuration);
    }

    async generateStory({
        prompt,
        name,
        photo_url,
        skin_tone,
        hair_type,
        hairstyle,
        hair_color,
        eye_color,
        facial_features,
        clothing,
        dedication,
        gender,
        milestone_date
    }) {
        // Constructing a detailed prompt for the AI to generate a 750+ word story
        const prompt = `
            Write a personalized children's story with the following details:
            - Name: ${name}
            - Photo URL: ${photo_url}
            - Skin tone: ${skin_tone}
            - Hair type: ${hair_type}
            - Hairstyle: ${hairstyle}
            - Hair color: ${hair_color}
            - Eye color: ${eye_color}
            - Facial features: ${facial_features}
            - Clothing: ${clothing}
            - Dedication message: ${dedication}
            - Gender: ${gender}
            - Special date: ${milestone_date}

            The story should be magical, imaginative, and fun, celebrating the child's special day. The narrative should incorporate the given details and make the child feel like the protagonist in an exciting adventure. Ensure that the story is at least 750 words long. Add descriptions of the environment, emotions, and actions, and keep the tone joyful and engaging. The story should have a clear plot that connects the child’s features and special day to the adventure.
        `;

        try {
            const response = await this.openai.createCompletion({
                model: 'text-davinci-003',
                prompt: prompt,
                max_tokens: 1500, // Setting max_tokens for longer responses (adjust as necessary)
                temperature: 0.7,  // Makes the response more creative and natural
            });

            const story = response.data.choices[0].text.trim();

            // If the story is under 750 words, ask AI to expand
            if (story.split(' ').length < 750) {
                return this.generateStory({ ...arguments[0], prompt: prompt });
            }

            // Return the generated story
            return story;
        } catch (error) {
            console.error('Error generating story:', error);
            throw new Error('Failed to generate the story.');
        }
    }

    async generateIllustrations(description) {
        // Integrate with an image generation model (like DALL·E) to generate illustrations
        // Here, we'll just provide a placeholder example
        try {
            const imageResponse = await this.openai.createImage({
                prompt: description,
                n: 3,  // Generate 3 different image variations
                size: '1024x1024',
            });

            const illustrations = imageResponse.data.data.map(image => image.url);
            return illustrations;
        } catch (error) {
            console.error('Error generating illustration:', error);
            throw new Error('Failed to generate the illustration.');
        }
    }
}

export default StorybookGenerator;
