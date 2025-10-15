import { Router } from "express";
import { authorize } from "../../../CORE/middleware/authmiddleware/index.js";
import { downloadBookPDF } from "../services/downloadpdf/index.js";
export const DownloadRouter = Router();
DownloadRouter.get(
  "/:bookId/download",
  authorize(["Admin", "User"]),
  downloadBookPDF,
);
