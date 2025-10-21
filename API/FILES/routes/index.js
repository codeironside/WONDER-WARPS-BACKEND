import { Router } from "express";
import { authorize } from "../../../CORE/middleware/authmiddleware/index.js";
import { uploadPhoto } from "../UPLOAD/services/uploads.images/index.js";
import { uploadSinglePhoto } from "../../../CORE/services/multer/index.js";
import { validateImageFile } from "../UPLOAD/services/validate.image/index.js";
import { downloadBookPDF } from "../DOWNLOAD/services/downloadpdf/index.js";

export const fileRouter = Router();

fileRouter.post(
  "/upload",
  authorize(["Admin", "User"]),
  uploadSinglePhoto,
  uploadPhoto,
);
fileRouter.get(
  "/:bookId/download",
  authorize(["Admin", "User"]),
  downloadBookPDF,
);

fileRouter.post(
  "/validateimage",
  authorize(["Admin", "User"]),
  uploadSinglePhoto,
  validateImageFile,
);
