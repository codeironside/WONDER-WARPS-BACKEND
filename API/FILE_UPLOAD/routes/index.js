import { Router } from "express";
import { authorize } from "../../../CORE/middleware/authmiddleware/index.js";
import { uploadPhoto } from "../services/uploads.images/index.js";
import { uploadSinglePhoto } from "../../../CORE/services/multer/index.js";

export const fileRouter = Router();

fileRouter.post(
  "/upload",
  authorize(["Admin", "User"]),
  uploadSinglePhoto,
  uploadPhoto,
);
