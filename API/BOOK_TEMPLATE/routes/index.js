import { Router } from "express";
import { authorize } from "../../../CORE/middleware/authmiddleware";
import { createBookTemplate } from "../services/create.book.template";

export const BookTemplateRouter = Router()

// ===========public routes




// ============private rotes

BookTemplateRouter.post('/createbooktemplate', authorize['admin'], createBookTemplate)