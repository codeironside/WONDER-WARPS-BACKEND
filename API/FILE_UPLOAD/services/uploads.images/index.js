import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import fileUpload from "../../../../CORE/services/fileupload/index.js";
import logger from "../../../../CORE/utils/logger/index.js";

export const uploadPhoto = async (req, res, next) => {
  try {
    if (!req.file) {
      throw new ErrorHandler("No photo file provided", 400);
    }

    const { file } = req;
    const {
      folder = "photos",
      prefix = "photo",
      useDateStructure = true,
      cacheControl = "public, max-age=31536000",
    } = req.body;
    const allowedMimeTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/svg+xml",
      "image/bmp",
      "image/tiff",
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new ErrorHandler(
        "Invalid file type. Only images are allowed.",
        400,
      );
    }
    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new ErrorHandler("File size too large. Maximum size is 20MB.", 400);
    }

    // Generate S3 key
    const s3Key = fileUpload.generateFileKey(
      folder,
      file.originalname,
      prefix,
      useDateStructure,
    );

    // Upload options
    const uploadOptions = {
      cacheControl,
      onProgress: (progress) => {
        logger.debug(`Upload progress: ${progress}%`);
      },
    };

    // Metadata
    const metadata = {
      originalName: file.originalname,
      uploadedBy: req.user?.id || "anonymous",
      uploadDate: new Date().toISOString(),
      userAgent: req.get("User-Agent") || "unknown",
    };

    // Upload to S3
    const photoUrl = await fileUpload.uploadBuffer(
      file.buffer,
      s3Key,
      file.mimetype,
      metadata,
      uploadOptions,
    );

    logger.info(
      `Photo uploaded successfully by user ${req.user?.id}: ${photoUrl}`,
    );

    // Return comprehensive response
    sendResponse(res, 201, "Photo uploaded successfully", {
      url: photoUrl,
      key: s3Key,
      filename: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
      uploadedAt: new Date().toISOString(),
      metadata: {
        folder,
        prefix,
        useDateStructure,
        cacheControl,
      },
    });
  } catch (error) {
    logger.error("Photo upload error:", {
      error: error.message,
      user: req.user?.id,
      file: req.file?.originalname,
    });
    next(error);
  }
};

// export const uploadMultipleFiles = async (req, res, next) => {
//     try {
//         if (!req.files || req.files.length === 0) {
//             throw new ErrorHandler("No files provided", 400);
//         }

//         const { files } = req;
//         const { folder = "uploads" } = req.body;

//         // Add folder to each file object
//         const filesWithFolder = files.map(file => ({
//             ...file,
//             folder
//         }));

//         // Upload all files
//         const urls = await fileUpload.uploadMultipleFiles(filesWithFolder);

//         sendResponse(res, 201, "Files uploaded successfully", {
//             files: urls.map((url, index) => ({
//                 url,
//                 filename: files[index].originalname,
//                 size: files[index].size,
//                 type: files[index].mimetype,
//             })),
//             uploadedAt: new Date().toISOString(),
//         });
//     } catch (error) {
//         next(error);
//     }
// };

// export const deleteFile = async (req, res, next) => {
//     try {
//         const { url } = req.body;

//         if (!url) {
//             throw new ErrorHandler("File URL is required", 400);
//         }

//         await fileUpload.deleteFile(url);

//         sendResponse(res, 200, "File deleted successfully");
//     } catch (error) {
//         next(error);
//     }
// };
