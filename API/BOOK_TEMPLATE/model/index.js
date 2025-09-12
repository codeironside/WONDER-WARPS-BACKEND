import mongoose from "mongoose";
import Joi from "joi";
import ErrorHandler from "../../../CORE/middleware/errorhandler/index.js";
import S3Service from "../../../CORE/services/s3/index.js";

const chapterSchema = new mongoose.Schema(
  {
    chapter_title: { type: String, maxlength: 500 },
    chapter_content: { type: String },
    image_description: { type: String, maxlength: 1000 },
    image_position: { type: String, maxlength: 50 },
    image_url: { type: String, maxlength: 1000 },
    book_template_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BookTemplate",
    },
  },
  { timestamps: true },
);

const bookTemplateSchema = new mongoose.Schema(
  {
    user_id: { type: String, required: true, ref: "User" },
    book_title: { type: String, required: true, maxlength: 255 },
    suggested_font: { type: String, required: true, maxlength: 255 },
    description: { type: String },
    skin_tone: { type: String },
    hair_type: { type: String, required: true },
    hair_style: { type: String, required: true },
    hair_color: { type: String },
    eye_color: { type: String },
    clothing: { type: String },
    gender: { type: String, required: true },
    age_min: { type: String, required: true },
    age_max: { type: String },
    cover_image: [{ type: String }],
    genre: { type: String },
    author: { type: String },
    price: { type: Number },
    keywords: [{ type: String }],
    is_personalizable: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const Chapter = mongoose.model("Chapter", chapterSchema);
const BookTemplateModel = mongoose.model("BookTemplate", bookTemplateSchema);

class BookTemplate {
  static tableName = "story_book_templates";
  static s3Service = new S3Service();

  static validationSchema = Joi.object({
    user_id: Joi.string().trim().min(3).max(255).required(),
    book_title: Joi.string().trim().min(3).max(255).required(),
    suggested_font: Joi.string().trim().min(3).max(255).required(),
    description: Joi.string().allow(null, "").optional(),
    skin_tone: Joi.string().allow(null, "").optional(),
    hair_type: Joi.string().required(),
    hair_style: Joi.string().required(),
    hair_color: Joi.string().allow(null, "").optional(),
    eye_color: Joi.string().allow(null, "").optional(),
    clothing: Joi.string().allow(null, "").optional(),
    gender: Joi.string().required(),
    age_min: Joi.string().required(),
    age_max: Joi.string().allow(null, "").optional(),
    cover_image: Joi.array().items(Joi.string().uri()).min(1).required(),
    genre: Joi.string().allow(null, "").optional(),
    author: Joi.string().allow(null, "").optional(),
    price: Joi.number().precision(2).positive().allow(null).optional(),
    chapters: Joi.array()
      .items(
        Joi.object({
          chapter_title: Joi.string().max(500).required(),
          chapter_content: Joi.string().required(),
          image_description: Joi.string().max(1000).allow(null, "").optional(),
          image_position: Joi.string().max(50).allow(null, "").optional(),
          image_url: Joi.string().uri().max(1000).allow(null, "").optional(),
        }),
      )
      .default([]),
    keywords: Joi.array().items(Joi.string()).allow(null).optional(),
    is_personalizable: Joi.boolean().default(true),
  }).unknown(false);

  static async findByTitle(book_title, user_id = null) {
    const query = { book_title };
    if (user_id) query.user_id = user_id;
    return await BookTemplateModel.findOne(query);
  }

  static async create(data) {
    const { error, value: validatedData } = this.validationSchema.validate(
      data,
      {
        abortEarly: false,
        stripUnknown: true,
      },
    );

    if (error) throw new ErrorHandler(this.formatValidationError(error), 400);

    // Validate that cover_image is not empty
    if (!validatedData.cover_image || validatedData.cover_image.length === 0) {
      throw new ErrorHandler("Cover image is required", 400);
    }

    const existing = await this.findByTitle(
      validatedData.book_title,
      validatedData.user_id,
    );
    if (existing) {
      throw new ErrorHandler(
        "A book template with this title already exists",
        409,
      );
    }

    if (
      Array.isArray(validatedData.keywords) &&
      validatedData.keywords.length === 0
    ) {
      validatedData.keywords = null;
    }

    // Upload images to S3 before saving
    try {
      await this.uploadImagesToS3(validatedData);
    } catch (error) {
      console.error("Error uploading images to S3:", error);
      throw new ErrorHandler(`Failed to upload images: ${error.message}`, 500);
    }

    try {
      const newTemplate = new BookTemplateModel(validatedData);
      await newTemplate.save();

      if (validatedData.chapters && validatedData.chapters.length > 0) {
        const chapters = validatedData.chapters.map((chapter) => ({
          chapter_title: chapter.chapter_title?.substring(0, 500) || "",
          chapter_content: chapter.chapter_content || "",
          image_description:
            chapter.image_description?.substring(0, 1000) || null,
          image_position: chapter.image_position?.substring(0, 50) || null,
          image_url: chapter.image_url?.substring(0, 1000) || null,
          book_template_id: newTemplate._id,
        }));

        await Chapter.insertMany(chapters);
      }

      const completeTemplate = await this.findByIdWithChapters(newTemplate._id);
      return completeTemplate;
    } catch (err) {
      console.error("Database error:", err);
      throw new ErrorHandler(err.message, 500);
    }
  }

  static async uploadImagesToS3(templateData) {
    console.log("Uploading images to S3...");

    // Upload cover images to S3
    if (templateData.cover_image && Array.isArray(templateData.cover_image)) {
      const uploadedCoverImages = [];

      for (const imageUrl of templateData.cover_image) {
        if (!imageUrl) {
          throw new ErrorHandler("Cover image URL cannot be empty", 400);
        }

        try {
          console.log(`Uploading cover image: ${imageUrl}`);
          const s3Key = this.s3Service.generateImageKey(
            `books/${templateData.book_title}/covers`,
            imageUrl,
          );
          const s3Url = await this.s3Service.uploadImageFromUrl(
            imageUrl,
            s3Key,
          );
          console.log(`Cover image uploaded to: ${s3Url}`);
          uploadedCoverImages.push(s3Url);
        } catch (error) {
          console.error(`Failed to upload cover image: ${error.message}`);
          throw new ErrorHandler(
            `Failed to upload cover image: ${error.message}`,
            500,
          );
        }
      }

      templateData.cover_image = uploadedCoverImages;
    } else {
      throw new ErrorHandler("Cover image is required", 400);
    }

    // Upload chapter images to S3
    if (templateData.chapters && Array.isArray(templateData.chapters)) {
      for (const chapter of templateData.chapters) {
        if (!chapter.image_url) continue;

        try {
          console.log(`Uploading chapter image: ${chapter.image_url}`);
          const s3Key = this.s3Service.generateImageKey(
            `books/${templateData.book_title}/chapters`,
            chapter.image_url,
          );
          const s3Url = await this.s3Service.uploadImageFromUrl(
            chapter.image_url,
            s3Key,
          );
          console.log(`Chapter image uploaded to: ${s3Url}`);
          chapter.image_url = s3Url;
        } catch (error) {
          console.error(`Failed to upload chapter image: ${error.message}`);
          // Keep the original URL if upload fails
        }
      }
    }
  }

  static async findById(id) {
    return await BookTemplateModel.findById(id);
  }

  static async findByIdWithChapters(id) {
    const template = await this.findById(id);
    if (!template) return null;

    const chapters = await Chapter.find({ book_template_id: id }).sort({
      createdAt: 1,
    });

    return { ...template.toObject(), chapters };
  }

  static async findAll(options = {}) {
    const { limit = 20, offset = 0 } = options;
    const templates = await db(this.tableName)
      .select("*")
      .limit(limit)
      .offset(offset);
    return templates.map((template) => ({
      ...template,
      chapters:
        typeof template.chapters === "string"
          ? JSON.parse(template.chapters)
          : template.chapters,
      cover_image:
        typeof template.cover_image === "string"
          ? JSON.parse(template.cover_image)
          : template.cover_image,
    }));
  }
  static async findAllForUser() {
    const templates = await db(this.tableName).select("*");
    return templates.map((template) => ({
      ...template,
      chapters:
        typeof template.chapters === "string"
          ? JSON.parse(template.chapters)
          : template.chapters,
      cover_image:
        typeof template.cover_image === "string"
          ? JSON.parse(template.cover_image)
          : template.cover_image,
    }));
  }

  static async findByKeywords(keywords) {
    try {
      const { error } = Joi.array()
        .items(Joi.string().trim().min(1))
        .validate(keywords);

      if (error)
        throw new ErrorHandler(
          "Keywords must be an array of non-empty strings",
          400,
        );

      return db(this.tableName).whereRaw(
        `keywords ?| array[${keywords.map(() => "?").join(",")}]`,
        keywords,
      );
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler("Failed to find book templates by keywords", 500);
    }
  }

  static async update(id, data) {
    const { error, value: validatedData } = this.validationSchema.validate(
      data,
      {
        abortEarly: false,
        stripUnknown: true,
      },
    );

    if (error) throw new ErrorHandler(this.formatValidationError(error), 400);

    // Validate that cover_image is not empty
    if (!validatedData.cover_image || validatedData.cover_image.length === 0) {
      throw new ErrorHandler("Cover image is required", 400);
    }

    const existing = await this.findById(id);
    if (!existing) throw new ErrorHandler("Book template not found", 404);

    if (
      validatedData.book_title &&
      validatedData.book_title !== existing.book_title
    ) {
      const titleExists = await this.findByTitle(
        validatedData.book_title,
        validatedData.user_id,
      );
      if (titleExists)
        throw new ErrorHandler(
          "A book template with this title already exists",
          409,
        );
    }

    // Upload new images to S3 before updating
    try {
      await this.uploadImagesToS3(validatedData);
    } catch (error) {
      throw new ErrorHandler(`Failed to upload images: ${error.message}`, 500);
    }

    const trx = await db.transaction();

    try {
      const updateData = {
        ...validatedData,
        chapters: JSON.stringify(validatedData.chapters || []),
        cover_image: JSON.stringify(validatedData.cover_image || []),
      };

      const updatedCount = await trx(this.tableName)
        .where({ id })
        .update(updateData);

      if (validatedData.chapters) {
        await trx("chapters").where({ book_template_id: id }).delete();

        if (validatedData.chapters.length > 0) {
          const chaptersWithTemplateId = validatedData.chapters.map(
            (chapter) => ({
              chapter_title: chapter.chapter_title?.substring(0, 500) || "",
              chapter_content: chapter.chapter_content || "",
              image_description:
                chapter.image_description?.substring(0, 1000) || null,
              image_position: chapter.image_position?.substring(0, 50) || null,
              image_url: chapter.image_url?.substring(0, 1000) || null,
              book_template_id: id,
            }),
          );

          await trx("chapters").insert(chaptersWithTemplateId);
        }
      }

      await trx.commit();

      if (updatedCount === 0) return null;
      return this.findByIdWithChapters(id);
    } catch (err) {
      await trx.rollback();
      throw new ErrorHandler("Failed to update book template", 500);
    }
  }

  static async delete(id) {
    const trx = await db.transaction();

    try {
      await trx("chapters").where({ book_template_id: id }).delete();
      const deletedCount = await trx(this.tableName).where({ id }).del();

      await trx.commit();

      if (deletedCount === 0)
        throw new ErrorHandler("Book template not found", 404);
      return true;
    } catch (error) {
      await trx.rollback();
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler("Failed to delete book template", 500);
    }
  }

  static async findAllByUser(userId, options = {}) {
    try {
      const {
        limit = 20,
        offset = 0,
        includeChapters = false,
        minimal = false,
      } = options;

      let query = db(this.tableName)
        .where({ user_id: userId })
        .orderBy("created_at", "desc")
        .limit(limit)
        .offset(offset);

      const templates = await query;

      return templates.map((template) => {
        const parsedTemplate = {
          ...template,
          cover_image:
            typeof template.cover_image === "string"
              ? JSON.parse(template.cover_image)
              : template.cover_image,
        };
        if (minimal) {
          return {
            id: parsedTemplate.id,
            book_title: parsedTemplate.book_title,
            cover_image: parsedTemplate.cover_image,
            genre: parsedTemplate.genre,
            age_min: parsedTemplate.age_min,
            age_max: parsedTemplate.age_max,
            price: parsedTemplate.price,
            is_personalizable: parsedTemplate.is_personalizable,
            created_at: parsedTemplate.created_at,
            updated_at: parsedTemplate.updated_at,
          };
        }

        // Include chapters if requested
        if (includeChapters) {
          parsedTemplate.chapters =
            typeof template.chapters === "string"
              ? JSON.parse(template.chapters)
              : template.chapters;
        } else {
          // Just include chapter count instead of full chapters
          parsedTemplate.chapter_count = template.chapters
            ? typeof template.chapters === "string"
              ? JSON.parse(template.chapters).length
              : template.chapters.length
            : 0;
          delete parsedTemplate.chapters;
        }

        // Remove sensitive or unnecessary fields
        delete parsedTemplate.user_id;
        delete parsedTemplate.keywords;

        return parsedTemplate;
      });
    } catch (error) {
      throw new ErrorHandler("Failed to fetch user templates", 500);
    }
  }

  static async findByIdForUser(id, userId) {
    try {
      const template = await db(this.tableName)
        .where({ id, user_id: userId })
        .first();

      if (!template) {
        throw new ErrorHandler("Book template not found", 404);
      }
      const parsedTemplate = {
        ...template,
        chapters:
          typeof template.chapters === "string"
            ? JSON.parse(template.chapters)
            : template.chapters,
        cover_image:
          typeof template.cover_image === "string"
            ? JSON.parse(template.cover_image)
            : template.cover_image,
      };

      // Remove sensitive fields
      delete parsedTemplate.user_id;

      return parsedTemplate;
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler("Failed to fetch template", 500);
    }
  }

  static formatValidationError(error) {
    return error.details.map((detail) => detail.message).join(", ");
  }
}

export default BookTemplate;
