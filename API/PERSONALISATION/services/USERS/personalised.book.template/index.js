import ErrorHandler from "@/Error";
import { sendResponse } from "../../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../../CORE/utils/logger/index.js";
import StoryPersonalizer from "../../../../../CORE/services/openai/personalise.book.template/index.js";
const storyPersonalizer = new StoryPersonalizer();

export const personalizeBook = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const {
      templateId,
      personalisedId,
      childName,
      childAge,
      skinTone,
      hairType,
      hairStyle,
      hairColor,
      eyeColor,
      clothing,
      gender,
      photoUrl,
    } = req.body;
    console.log(req.body);

    if (!templateId || !personalisedId) {
      throw new ErrorHandler(
        "Template ID, child and personsalised Id name are required ",
        400,
      );
    }

    const personalizationDetails = {
      childName,
      childAge,
      skinTone,
      hairType,
      hairStyle,
      hairColor,
      eyeColor,
      clothing,
      gender,
      photoUrl,
    };

    storyPersonalizer.addPersonalizationToBook(
      templateId,
      userId,
      personalisedId,
      personalizationDetails,
    );

    logger.info(`Book :${templateId} personalized by user ${userId} using AI`);

    sendResponse(
      res,
      201,
      "Book personalization in pogress check back in few minutees",
      {},
    );
  } catch (error) {
    logger.error(`Failed to personalize book with AI: ${error.message}`);
    next(error);
  }
};

// export const getPersonalizedBook = async (req, res, next) => {
//   try {
//     const userId = req.user.id;
//     const { bookId } = req.params;

//     const book = await BookPersonalizer.getPersonalizedBook(bookId, userId);

//     sendResponse(res, 200, "Personalized book retrieved successfully", book);
//   } catch (error) {
//     logger.error(`Failed to get personalized book: ${error.message}`);
//     next(error);
//   }
// };

// export const getUserPersonalizedBooks = async (req, res, next) => {
//   try {
//     const userId = req.user.id;

//     const books = await BookPersonalizer.getUserPersonalizedBooks(userId);

//     sendResponse(res, 200, "Personalized books retrieved successfully", books);
//   } catch (error) {
//     logger.error(`Failed to get personalized books: ${error.message}`);
//     next(error);
//   }
// };
