import PersonalizedBook from "../../../PERSONALISATION/model/index.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";
import StoryPersonalizer from "../../../../CORE/services/openai/personalise.book.template/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";

export const createBookForPayment = async (req, res, next) => {
  try {
    const { templateId, childName, childAge, gender, video_url } = req.body;
   
    const user = req.user;

    if (!templateId || !childName) {
      throw new ErrorHandler("Template ID and child name are required", 400);
    }

    const storyPersonalizer = new StoryPersonalizer();

    const book = await storyPersonalizer.createBookForPayment(
      templateId,
      user._id.toString(),
      { childName, childAge, gender, video_url },
    );

    res.status(201).json({
      success: true,
      message: "Book created for payment",
      data: book,
    });
  } catch (error) {
    next(error);
  }
};
