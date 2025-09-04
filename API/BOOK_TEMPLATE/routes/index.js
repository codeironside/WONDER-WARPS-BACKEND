import { Router } from "express";
// import { authorize } from "../../../CORE/middleware/authmiddleware";
import { createBookTemplate } from "../services/ADMIN/create.book.template/index.js";

export const BookTemplateRouter = Router()

// ===========public routes


// authorize['admin']

// ============private rotes

BookTemplateRouter.post('/createbooktemplate', createBookTemplate)