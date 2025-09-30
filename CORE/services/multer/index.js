import multer from "multer";
import ErrorHandler from "../../middleware/errorhandler/index.js";

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    console.log("File received:", {
      fieldname: file.fieldname,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    });

    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
}).single("photo");
export const uploadSinglePhoto = (req, res, next) => {
  upload(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return next(
            new ErrorHandler("File size too large. Maximum size is 10MB.", 400),
          );
        }
        if (err.code === "LIMIT_UNEXPECTED_FILE") {
          return next(
            new ErrorHandler(
              'Unexpected field. Make sure the file field is named "photo".',
              400,
            ),
          );
        }
      }
      return next(err);
    }
    next();
  });
};
