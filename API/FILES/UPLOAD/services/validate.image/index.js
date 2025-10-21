import ImageValidator from "../../../../../CORE/services/openai/validatePicture/index.js";
import ErrorHandler from "../../../../../CORE/middleware/errorhandler/index.js";
const imageValidator = new ImageValidator();

export const validateImageFile = async (req, res, next) => {
  try {
    if (!req.file) {
      throw new ErrorHandler("No image file provided", 400);
    }
    const userId = req.user._id;
    if (!userId) {
      throw new ErrorHandler("userId is required", 400);
    }

    console.log(`Validating image for user ${userId}:`, {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
    });
    const criteria = imageValidator.getValidationCriteria().default;
    const result = await imageValidator.validateAndUploadImage(
      req.file,
      userId,
      criteria,
    );

    res.json({
      success: true,
      data: {
        imageUrl: result.imageUrl,
        characteristics: result.characteristics,
        message: "Image validated successfully",
      },
    });
  } catch (error) {
    next(error);
  }
};
