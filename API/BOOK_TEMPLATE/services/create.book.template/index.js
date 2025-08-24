import BookTemplate from "../../model";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";
import logger from "../../../../CORE/utils/logger/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";

export const createBookTemplate = async (req, res, next) => {
    try {
        const { title, userId, description, coverImages, genre, characters, ageRange, idealFor, price, status, chapters, keywords, isPersonalizable } = req.body;

        if (!title || !userId) {
            throw new ErrorHandler('Title and user ID are required.', 400);
        }

        const newTemplate = await BookTemplate.create({
            title,
            user_id: userId,
            description,
            cover_images: coverImages,
            genre,
            characters,
            age_range: ageRange,
            ideal_for: idealFor,
            price,
            status,
            chapters,
            keywords,
            is_personalizable: isPersonalizable,
        });
        logger.info(`book template created by user ${userId} with title "${title}"`);
 
        sendResponse(res, 201, 'book template created successfully', ...newTemplate)
    } catch (error) {
        throw new ErrorHandler(`Failed to create book template: ${error.message}`, error.status || 500);
    }
};