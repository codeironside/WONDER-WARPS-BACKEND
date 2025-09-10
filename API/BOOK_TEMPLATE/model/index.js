import knex from "knex";
import Joi from "joi";
import knexfile from "../../../knexfile.js";
import ErrorHandler from "../../../CORE/middleware/errorhandler/index.js";
import S3Service from "../../../CORE/services/s3/index.js";
const db = knex(knexfile.development);

class BookTemplate {
  static tableName = "story_book_templates";
  static s3Service = new S3Service();

  static validationSchema = Joi.object({
    user_id: Joi.number().integer().positive().required(),
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
    cover_image: Joi.array().items(Joi.string().uri()).default([]),
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
    const query = db(this.tableName).where({ book_title });
    if (user_id) query.andWhere({ user_id });
    return query.first();
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
      throw new ErrorHandler(`Failed to upload images: ${error.message}`, 500);
    }

    const trx = await db.transaction();

    try {
      const insertData = {
        ...validatedData,
        chapters: JSON.stringify(validatedData.chapters || []),
        cover_image: JSON.stringify(validatedData.cover_image || []),
      };

      const [newTemplate] = await trx(this.tableName)
        .insert(insertData)
        .returning("*");

      if (validatedData.chapters && validatedData.chapters.length > 0) {
        const chaptersWithTemplateId = validatedData.chapters.map(
          (chapter) => ({
            chapter_title: chapter.chapter_title?.substring(0, 500) || "",
            chapter_content: chapter.chapter_content || "",
            image_description:
              chapter.image_description?.substring(0, 1000) || null,
            image_position: chapter.image_position?.substring(0, 50) || null,
            image_url: chapter.image_url?.substring(0, 1000) || null,
            book_template_id: newTemplate.id,
          }),
        );

        await trx("chapters").insert(chaptersWithTemplateId);
      }

      await trx.commit();

      const completeTemplate = await this.findByIdWithChapters(newTemplate.id);
      return completeTemplate;
    } catch (err) {
      await trx.rollback();
      throw new ErrorHandler(err.message, 500);
    }
  }

  static async uploadImagesToS3(templateData) {
    // Upload cover images to S3
    if (templateData.cover_image && Array.isArray(templateData.cover_image)) {
      const uploadedCoverImages = [];

      for (const imageUrl of templateData.cover_image) {
        if (!imageUrl) continue;

        try {
          const s3Key = this.s3Service.generateImageKey(
            `books/${templateData.book_title}/covers`,
            imageUrl,
          );
          const s3Url = await this.s3Service.uploadImageFromUrl(
            imageUrl,
            s3Key,
          );
          uploadedCoverImages.push(s3Url);
        } catch (error) {
          console.error(`Failed to upload cover image: ${error.message}`);
          // Keep the original URL if upload fails
          uploadedCoverImages.push(imageUrl);
        }
      }

      templateData.cover_image = uploadedCoverImages;
    }

    // Upload chapter images to S3
    if (templateData.chapters && Array.isArray(templateData.chapters)) {
      for (const chapter of templateData.chapters) {
        if (!chapter.image_url) continue;

        try {
          const s3Key = this.s3Service.generateImageKey(
            `books/${templateData.book_title}/chapters`,
            chapter.image_url,
          );
          const s3Url = await this.s3Service.uploadImageFromUrl(
            chapter.image_url,
            s3Key,
          );
          chapter.image_url = s3Url;
        } catch (error) {
          console.error(`Failed to upload chapter image: ${error.message}`);
          // Keep the original URL if upload fails
        }
      }
    }
  }

  static async findById(id) {
    const template = await db(this.tableName).where({ id }).first();
    if (template) {
      return {
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
    }
    return null;
  }

  static async findByIdWithChapters(id) {
    const template = await this.findById(id);
    if (!template) return null;

    const chapters = await db("chapters")
      .where({ book_template_id: id })
      .orderBy("id", "asc");

    return { ...template, chapters };
  }

  static async findAll() {
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

  static formatValidationError(error) {
    return error.details.map((detail) => detail.message).join(", ");
  }
}

export default BookTemplate;
