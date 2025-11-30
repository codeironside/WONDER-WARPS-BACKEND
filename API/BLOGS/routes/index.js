import { Router } from "express";
import multer from "multer";

import { authorize } from "../../../CORE/middleware/authmiddleware/index.js";
import { getAllBlogs } from "../services/getAllblogs/index.js";
import { getBlogCategories } from "../services/getBlogCategories/index.js";
import { getBlogBySlug } from "../services/getBlogBySlug/index.js";
import { createBlog } from "../services/create.blog/index.js";
import { uploadBlogMedia } from "../services/uploadBlogMedia/index.js";
import { getBlogById } from "../services/getBlogById(admin)/index.js";
import { updateBlog } from "../services/updateBlog/index.js";
import { deleteBlog } from "../services/deleteBlog/index.js";

export const blogRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
});
blogRouter.get("/", getAllBlogs);

blogRouter.get("/categories", getBlogCategories);
blogRouter.get("/:slug", getBlogBySlug);

blogRouter.post("/", authorize(["Admin"]), createBlog);

blogRouter.post(
  "/upload-media",
  authorize(["Admin"]),
  upload.single("file"),
  uploadBlogMedia,
);

blogRouter.get("/id/:id", authorize(["Admin"]), getBlogById);

blogRouter.patch("/:id", authorize(["Admin"]), updateBlog);

blogRouter.delete("/:id", deleteBlog);
