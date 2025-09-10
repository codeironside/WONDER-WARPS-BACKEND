import { Router } from "express";
import { authorize } from "../../../CORE/middleware/authmiddleware/index.js";
import { createBookTemplate } from "../services/ADMIN/create.book.template/index.js";
import { saveBookTemplate } from "../services/ADMIN/save.book.template/index.js";
import { personalizeBook } from "../services/USERS/personalised.book.template/index.js";
import { getAllbookTemplates } from "../services/ADMIN/get.all.book.template/index.js";

export const BookTemplateRouter = Router();

// ===========public routes

// authorize['admin']

// ============private rotes

BookTemplateRouter.post(
  "/createbooktemplate",
  authorize(["Admin"]),
  createBookTemplate,
);

BookTemplateRouter.post(
  "/savebooktemplate",
  authorize(["Admin"]),
  saveBookTemplate,
);

BookTemplateRouter.post(
  "/personalisebooktemplate",
  authorize(["Admin", "User"]),
  personalizeBook,
);

BookTemplateRouter.get(
  "/admin/getallbooktemplates",
  authorize(["Admin"]),
  getAllbookTemplates,
);
