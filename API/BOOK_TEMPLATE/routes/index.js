import { Router } from "express";
import { authorize } from "../../../CORE/middleware/authmiddleware/index.js";
import { createBookTemplate } from "../services/ADMIN/create.book.template/index.js";
import { saveBookTemplate } from "../services/ADMIN/save.book.template/index.js";
import { personalizeBook } from "../../PERSONALISATION/services/USERS/personalised.book.template/index.js";
import { getAllbookTemplates } from "../services/ADMIN/get.all.book.template/index.js";
import { getAllbookTemplatesforadmin } from "../services/ADMIN/get.all.templates.by.admin/index.js";

import { getOneBookWithChapterForAdmin } from "../services/ADMIN/get.one.book.with.chapter/index.js";
import { getPublicTemplateWithChapters } from "../services/USERS/get.book.with.chapter/index.js";
import { getPublicTemplates } from "../services/USERS/get.all.book.template/index.js";
import { updateBookTemplate } from "../services/ADMIN/update.a.book.template/index.js";
import { getPopularTemplates } from "../services/USERS/getpopulartemplates/index.js";

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

BookTemplateRouter.get(
  "/admin/getallbooktemplatesforadmin",
  authorize(["Admin"]),
  getAllbookTemplatesforadmin,
);

BookTemplateRouter.get("/public/getalltemplatesforuser", getPublicTemplates);

BookTemplateRouter.get(
  "/admin/getOneBookWithChapter",
  authorize(["Admin"]),
  getOneBookWithChapterForAdmin,
);

BookTemplateRouter.get(
  "/getbookwithchaptersforuser/:id",
  getPublicTemplateWithChapters,
);
BookTemplateRouter.put(
  "/updateBookTemplates/:id",
  authorize(["Admin"]),
  updateBookTemplate,
);

BookTemplateRouter.get("/getpopularTemplates", getPopularTemplates);
