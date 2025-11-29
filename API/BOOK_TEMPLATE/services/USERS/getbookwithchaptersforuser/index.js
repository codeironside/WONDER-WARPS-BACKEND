import ErrorHandler from "@/Error";
import { sendResponse } from "../../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../../CORE/utils/logger/index.js";
import BookTemplate from "../../../model/index.js";

export const getPublicTemplateWithChapterssigned = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userid = req.user._id

        if (!id) {
            throw new ErrorHandler("Template ID is required", 400);
        }

        const template = await BookTemplate.getTemplateWithPendingBook(id, userid);

        sendResponse(res, 200, `template retrieved successfull for user ${userid}`, template);
    } catch (error) {
        logger.error(`Failed to get public template: ${error.message}`);
        next(error);
    }
};
