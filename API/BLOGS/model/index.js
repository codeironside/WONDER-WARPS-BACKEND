import mongoose from "mongoose";
import Joi from "joi";
import ErrorHandler from "../../../CORE/middleware/errorhandler/index.js";
import S3Service from "../../../CORE/services/s3/index.js";

const blogSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
      index: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    excerpt: {
      type: String,
      required: true,
      maxlength: 300,
    },
    content: {
      type: String,
      required: true,
    },
    cover_media: {
      url: { type: String, required: true },
      type: { type: String, enum: ["image", "video"], default: "image" },
    },
    category: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    tags: [{ type: String, trim: true }],
    author: {
      name: { type: String, required: true },
      role: { type: String, default: "Editor" },
      avatar: { type: String, default: null },
      user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
    },
    read_time: {
      type: String,
      default: "5 min read",
    },
    is_published: {
      type: Boolean,
      default: false,
      index: true,
    },
    published_at: {
      type: Date,
      default: null,
      index: true,
    },
    views: {
      type: Number,
      default: 0,
      index: true,
    },
    is_featured: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

blogSchema.index({ title: "text", content: "text" });
blogSchema.index({ published_at: -1 });

const BlogModel = mongoose.model("Blog", blogSchema);

class Blog {
  static s3Service = new S3Service();

  // --- UPDATED VALIDATION SCHEMA ---
  static validationSchema = Joi.object({
    title: Joi.string().trim().min(5).max(255).required(),
    excerpt: Joi.string().trim().min(10).max(300).required(),
    content: Joi.string().min(20).required(),
    cover_media: Joi.object({
      url: Joi.string().uri().required(),
      type: Joi.string().valid("image", "video").required(),
    }).required(),
    category: Joi.string().trim().required(),
    tags: Joi.array().items(Joi.string().trim()).default([]),
    author: Joi.object({
      name: Joi.string().required(),
      role: Joi.string().optional(),
      avatar: Joi.string().uri().allow(null).optional(),
      // Allow string (24 chars) OR ObjectId object
      user_id: Joi.alternatives()
        .try(Joi.string().hex().length(24), Joi.object())
        .optional(),
    }).required(),
    is_published: Joi.boolean().default(false),
    is_featured: Joi.boolean().default(false),
  }).unknown(false);

  static updateSchema = Joi.object({
    title: Joi.string().trim().min(5).max(255).optional(),
    excerpt: Joi.string().trim().min(10).max(300).optional(),
    content: Joi.string().min(20).optional(),
    slug: Joi.string().min(20).optional(),
    cover_media: Joi.object({
      url: Joi.string().uri().optional(),
      type: Joi.string().valid("image", "video").optional(),
    }).optional(),
    category: Joi.string().trim().optional(),
    tags: Joi.array().items(Joi.string().trim()).optional(),
    author: Joi.object({
      name: Joi.string().optional(),
      role: Joi.string().optional(),
      avatar: Joi.string().uri().allow(null).optional(),
      // Allow string (24 chars) OR ObjectId object
      user_id: Joi.alternatives()
        .try(Joi.string().hex().length(24), Joi.object())
        .optional(),
    }).optional(),
    is_published: Joi.boolean().optional(),
    is_featured: Joi.boolean().optional(),
  }).unknown(false);

  static calculateReadTime(content) {
    const text = content.replace(/<[^>]*>/g, "");
    const wordCount = text.split(/\s+/).length;
    const minutes = Math.ceil(wordCount / 200);
    return `${minutes} min read`;
  }

  static async generateUniqueSlug(title, currentId = null) {
    let slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    let uniqueSlug = slug;
    let counter = 1;

    while (true) {
      const query = { slug: uniqueSlug };
      if (currentId) query._id = { $ne: currentId };

      const existing = await BlogModel.exists(query);
      if (!existing) break;

      uniqueSlug = `${slug}-${counter}`;
      counter++;
    }
    return uniqueSlug;
  }

  static async uploadInlineMedia(file) {
    if (!file || !file.buffer) {
      throw new ErrorHandler("No file data provided", 400);
    }

    const allowedMimeTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "video/mp4",
      "video/webm",
      "video/quicktime",
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new ErrorHandler(
        "Unsupported file type. Allowed: JPG, PNG, GIF, WEBP, MP4, WEBM, MOV.",
        400,
      );
    }

    const isVideo = file.mimetype.startsWith("video/");
    const maxSize = isVideo ? 50 * 1024 * 1024 : 8 * 1024 * 1024;

    if (file.size > maxSize) {
      throw new ErrorHandler(
        `File too large. Limit is ${isVideo ? "50MB" : "8MB"}.`,
        400,
      );
    }

    try {
      const key = this.s3Service.generateBlogAssetKey(file.mimetype);
      const s3Url = await this.s3Service.uploadBuffer(
        file.buffer,
        key,
        file.mimetype,
      );

      return {
        url: s3Url,
        type: isVideo ? "video" : "image",
      };
    } catch (error) {
      throw new ErrorHandler("Failed to upload media to server", 500);
    }
  }

  static async create(data) {
    const { error, value: validatedData } = this.validationSchema.validate(
      data,
      { abortEarly: false, stripUnknown: true },
    );

    if (error) throw new ErrorHandler(this.formatValidationError(error), 400);

    const slug = await this.generateUniqueSlug(validatedData.title);
    const readTime = this.calculateReadTime(validatedData.content);
    const publishedAt = validatedData.is_published ? new Date() : null;

    try {
      const newBlog = new BlogModel({
        ...validatedData,
        slug,
        read_time: readTime,
        published_at: publishedAt,
        views: 0,
      });

      await newBlog.save();
      return newBlog.toObject();
    } catch (err) {
      throw new ErrorHandler(`Failed to create blog: ${err.message}`, 500);
    }
  }

  static async findAll(options = {}) {
    const {
      page = 1,
      limit = 10,
      sortBy = "published_at",
      sortOrder = "desc",
      category,
      tag,
      search,
      status = "published",
    } = options;

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };
    const query = {};

    if (status === "published") query.is_published = true;
    else if (status === "draft") query.is_published = false;

    if (category) query.category = category;
    if (tag) query.tags = { $in: [tag] };
    if (search) query.$text = { $search: search };

    try {
      const blogs = await BlogModel.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .select("-content")
        .lean();

      const total = await BlogModel.countDocuments(query);

      return {
        blogs,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw new ErrorHandler("Failed to fetch blogs", 500);
    }
  }

  static async findBySlug(slug) {
    try {
      const blog = await BlogModel.findOneAndUpdate(
        { slug, is_published: true },
        { $inc: { views: 1 } },
        { new: true },
      ).lean();

      if (!blog) throw new ErrorHandler("Blog post not found", 404);
      return blog;
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler("Failed to fetch blog post", 500);
    }
  }

  static async findById(id) {
    try {
      const blog = await BlogModel.findById(id).lean();
      if (!blog) throw new ErrorHandler("Blog post not found", 404);
      return blog;
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler("Failed to fetch blog post", 500);
    }
  }

  static async update(id, data) {
    const { error, value: validatedData } = this.updateSchema.validate(data, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) throw new ErrorHandler(this.formatValidationError(error), 400);

    const blog = await BlogModel.findById(id);
    if (!blog) throw new ErrorHandler("Blog post not found", 404);

    if (validatedData.content) {
      validatedData.read_time = this.calculateReadTime(validatedData.content);
    }

    if (validatedData.is_published === true && !blog.is_published) {
      validatedData.published_at = new Date();
    } else if (validatedData.is_published === false) {
      validatedData.published_at = null;
    }

    try {
      const updatedBlog = await BlogModel.findByIdAndUpdate(
        id,
        { $set: validatedData },
        { new: true, runValidators: true },
      );
      return updatedBlog.toObject();
    } catch (err) {
      throw new ErrorHandler("Failed to update blog post", 500);
    }
  }

  static async delete(id) {
    try {
      const deleted = await BlogModel.findByIdAndDelete(id);
      if (!deleted) throw new ErrorHandler("Blog post not found", 404);
      return true;
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler("Failed to delete blog post", 500);
    }
  }

  static async getCategories() {
    try {
      return await BlogModel.distinct("category", { is_published: true });
    } catch (error) {
      throw new ErrorHandler("Failed to fetch categories", 500);
    }
  }

  static formatValidationError(error) {
    return error.details.map((detail) => detail.message).join(", ");
  }
}

export default Blog;
