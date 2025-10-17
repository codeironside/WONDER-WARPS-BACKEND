import mongoose from "mongoose";
import Joi from "joi";
import ErrorHandler from "../../../CORE/middleware/errorhandler/index.js";
import S3Service from "../../../CORE/services/s3/index.js";

// Define Chapter Schema
const chapterSchema = new mongoose.Schema(
  {
    chapter_title: {
      type: String,
      required: true,
      maxlength: 500,
      trim: true,
    },
    chapter_content: {
      type: String,
      required: true,
    },
    image_description: {
      type: String,
      maxlength: 1000,
      default: null,
    },
    image_position: {
      type: String,
      maxlength: 50,
      default: "full scene",
    },
    image_url: {
      type: String,
      maxlength: 1000,
      default: null,
    },
    book_template_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BookTemplate",
      required: true,
      index: true,
    },
    order: {
      type: Number,
      default: 0,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// Define BookTemplate Schema
const bookTemplateSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
      index: true,
    },
    book_title: {
      type: String,
      required: true,
      maxlength: 255,
      trim: true,
      index: true,
    },
    suggested_font: {
      type: String,
      required: true,
      maxlength: 255,
      trim: true,
    },
    description: {
      type: String,
      default: null,
    },
    skin_tone: {
      type: String,
      default: null,
    },
    hair_type: {
      type: String,
      required: true,
    },
    hair_style: {
      type: String,
      required: true,
    },
    hair_color: {
      type: String,
      default: null,
    },
    eye_color: {
      type: String,
      default: null,
    },
    clothing: {
      type: String,
      default: null,
    },
    gender: {
      type: String,
      required: true,
    },
    age_min: {
      type: String,
      required: true,
    },
    age_max: {
      type: String,
      default: null,
    },
    cover_image: {
      type: [String],
      required: true,
      validate: {
        validator: function (v) {
          return v.length > 0;
        },
        message: "At least one cover image is required",
      },
    },
    genre: {
      type: String,
      default: null,
      index: true,
    },
    author: {
      type: String,
      default: null,
    },
    price: {
      type: Number,
      min: 0,
      default: 0,
    },
    keywords: [
      {
        type: String,
        index: true,
      },
    ],
    is_personalizable: {
      type: Boolean,
      default: true,
      index: true,
    },
    popularity_score: {
      type: Number,
      default: 1,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// Create indexes for better performance
bookTemplateSchema.index({ user_id: 1, book_title: 1 }, { unique: true });
bookTemplateSchema.index({ createdAt: -1 });
bookTemplateSchema.index({ price: 1 });
bookTemplateSchema.index({ age_min: 1, age_max: 1 });

// Create models
const Chapter = mongoose.model("Chapter", chapterSchema);
const BookTemplateModel = mongoose.model("BookTemplate", bookTemplateSchema);

class BookTemplate {
  static s3Service = new S3Service();

  static validationSchema = Joi.object({
    user_id: Joi.string().hex().length(24).required(),
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
    price: Joi.number().precision(2).min(0).allow(null).optional(),
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
    keywords: Joi.array().items(Joi.string()).default([]),
    is_personalizable: Joi.boolean().default(true),
    is_public: Joi.boolean().default(false),
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

    // Upload images to S3 before saving
    try {
      await this.uploadImagesToS3(validatedData);
    } catch (error) {
      console.error("Error uploading images to S3:", error);
      throw new ErrorHandler(`Failed to upload images: ${error.message}`, 500);
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      console.log(validatedData);
      const newTemplate = new BookTemplateModel(validatedData);
      await newTemplate.save({ session });

      if (validatedData.chapters && validatedData.chapters.length > 0) {
        const chapters = validatedData.chapters.map((chapter, index) => ({
          chapter_title: chapter.chapter_title?.substring(0, 500) || "",
          chapter_content: chapter.chapter_content || "",
          image_description:
            chapter.image_description?.substring(0, 1000) || null,
          image_position:
            chapter.image_position?.substring(0, 50) || "full scene",
          image_url: chapter.image_url?.substring(0, 1000) || null,
          book_template_id: newTemplate._id,
          order: index,
        }));

        await Chapter.insertMany(chapters, { session });
      }

      await session.commitTransaction();
      session.endSession();

      // Return the complete template with chapters
      return await this.findByIdWithChapters(newTemplate._id);
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
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
    const template = await BookTemplateModel.findById(id);
    if (!template) return null;

    const chapters = await Chapter.find({ book_template_id: id })
      .sort({ order: 1 })
      .select("-book_template_id -__v");

    return {
      ...template.toObject(),
      chapters,
    };
  }

  static async findAll(options = {}) {
    const {
      page = 1,
      limit = 20,
      sortBy = "createdAt",
      sortOrder = "desc",
      filters = {},
    } = options;

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    // Build query based on filters
    const query = {};
    if (filters.genre) query.genre = filters.genre;
    if (filters.age_min) query.age_min = filters.age_min;
    if (filters.age_max) query.age_max = filters.age_max;
    if (filters.is_personalizable !== undefined)
      query.is_personalizable = filters.is_personalizable;
    if (filters.is_public !== undefined) query.is_public = filters.is_public;
    if (filters.keywords) query.keywords = { $in: filters.keywords };

    const templates = await BookTemplateModel.find(query)
      .select("-chapters -__v")
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean();
    const total = await BookTemplateModel.countDocuments(query);

    return {
      templates,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  static async findAllForUser(userId, options = {}) {
    const {
      page = 1,
      limit = 20,
      sortBy = "createdAt",
      sortOrder = "desc",
      includePublic = false,
    } = options;

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    // Build query - user's templates plus public templates if requested
    const query = includePublic
      ? { $or: [{ user_id: userId }, { is_public: true }] }
      : { user_id: userId };

    const templates = await BookTemplateModel.find(query)
      .select("-chapters -__v")
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await BookTemplateModel.countDocuments(query);

    return {
      templates,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  static async findByKeywords(keywords, options = {}) {
    try {
      const { error } = Joi.array()
        .items(Joi.string().trim().min(1))
        .validate(keywords);

      if (error) {
        throw new ErrorHandler(
          "Keywords must be an array of non-empty strings",
          400,
        );
      }

      const {
        page = 1,
        limit = 20,
        sortBy = "popularity_score",
        sortOrder = "desc",
      } = options;

      const skip = (page - 1) * limit;
      const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

      const query = {
        keywords: { $in: keywords },
        is_public: true, // Only search public templates
      };

      const templates = await BookTemplateModel.find(query)
        .select("-chapters -__v")
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await BookTemplateModel.countDocuments(query);

      return {
        templates,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler("Failed to find book templates by keywords", 500);
    }
  }

  static async update(id, data) {
    const updateValidationSchema = Joi.object({
      book_title: Joi.string().trim().min(3).max(255).optional(),
      suggested_font: Joi.string().trim().min(3).max(255).optional(),
      description: Joi.string().allow(null, "").optional(),
      skin_tone: Joi.string().allow(null, "").optional(),
      hair_type: Joi.string().optional(),
      hair_style: Joi.string().optional(),
      hair_color: Joi.string().allow(null, "").optional(),
      eye_color: Joi.string().allow(null, "").optional(),
      clothing: Joi.string().allow(null, "").optional(),
      gender: Joi.string().optional(),
      age_min: Joi.string().optional(),
      age_max: Joi.string().allow(null, "").optional(),
      genre: Joi.string().allow(null, "").optional(),
      author: Joi.string().allow(null, "").optional(),
      price: Joi.number().precision(2).positive().allow(null).optional(),
      keywords: Joi.array().items(Joi.string()).optional(),
      is_personalizable: Joi.boolean().optional(),
    }).unknown(false);
    const { error, value: validatedData } = updateValidationSchema.validate(
      data,
      {
        abortEarly: false,
        stripUnknown: true,
      },
    );

    if (error) throw new ErrorHandler(this.formatValidationError(error), 400);

    const existing = await BookTemplateModel.findById(id);
    if (!existing) throw new ErrorHandler("Book template not found", 404);
    if (
      validatedData.book_title &&
      validatedData.book_title !== existing.book_title
    ) {
      const titleExists = await this.findByTitle(
        validatedData.book_title,
        validatedData.user_id || existing.user_id,
      );
      if (titleExists) {
        throw new ErrorHandler(
          "A book template with this title already exists",
          409,
        );
      }
    }
    if (validatedData.cover_image) {
      try {
        await this.uploadImagesToS3(validatedData);
      } catch (error) {
        throw new ErrorHandler(
          `Failed to upload images: ${error.message}`,
          500,
        );
      }
    }

    try {
      // Update only the provided fields
      const updatedTemplate = await BookTemplateModel.findByIdAndUpdate(
        id,
        { $set: validatedData },
        { new: true, runValidators: true },
      );

      return updatedTemplate;
    } catch (err) {
      console.error("Database update error:", err);
      throw new ErrorHandler("Failed to update book template", 500);
    }
  }
  static async findPublicByIdWithChapters(id) {
    try {
      const template = await BookTemplateModel.findOne({
        _id: id,
      });

      if (!template) {
        throw new ErrorHandler("Public book template not found", 404);
      }
      const chapters = await Chapter.find({ book_template_id: id })
        .sort({ order: 1 })
        .select("-book_template_id -__v -image_description");

      const templateObj = template.toObject();
      delete templateObj.__v;
      delete templateObj.user_id;
      return { ...templateObj, chapters };
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler("Failed to fetch public template", 500);
    }
  }
  static async incrementPersonalizationCount(id) {
    try {
      const updatedTemplate = await BookTemplateModel.findByIdAndUpdate(
        id,
        { $inc: { personalization_count: 1 } },
        { new: true },
      ).select("-chapters -__v -user_id");

      if (!updatedTemplate) {
        throw new ErrorHandler("Template not found", 404);
      }

      return updatedTemplate;
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler("Failed to update personalization count", 500);
    }
  }
  static async findAllPublicTemplates(options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        sortBy,
        sortOrder = "desc",
        filters = {},
      } = options;

      const skip = (page - 1) * limit;
      const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };
      const query = { is_public: true };
      if (filters.genre) query.genre = filters.genre;
      if (filters.age_min) query.age_min = filters.age_min;
      if (filters.age_max) query.age_max = filters.age_max;
      if (filters.is_personalizable !== undefined)
        query.is_personalizable = filters.is_personalizable;
      if (filters.keywords) query.keywords = { $in: filters.keywords };

      const templates = await BookTemplateModel.find(query)
        .select("-chapters -__v -user_id")
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await BookTemplateModel.countDocuments(query);

      return {
        templates,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw new ErrorHandler("Failed to fetch public templates", 500);
    }
  }
  static async delete(id) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Delete the template
      const template = await BookTemplateModel.findByIdAndDelete(id, {
        session,
      });
      if (!template) {
        throw new ErrorHandler("Book template not found", 404);
      }

      // Delete associated chapters
      await Chapter.deleteMany({ book_template_id: id }, { session });

      await session.commitTransaction();
      session.endSession();

      return true;
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler("Failed to delete book template", 500);
    }
  }

  static async findAllByUser(userId, options = {}) {
    const {
      page = 1,
      limit = 20,
      includeChapters = false,
      minimal = false,
    } = options;

    const skip = (page - 1) * limit;

    // Build projection based on options
    let projection = { __v: 0 };
    if (minimal) {
      projection = {
        book_title: 1,
        cover_image: 1,
        genre: 1,
        age_min: 1,
        age_max: 1,
        price: 1,
        is_personalizable: 1,
        createdAt: 1,
        updatedAt: 1,
      };
    } else if (!includeChapters) {
      projection.chapters = 0;
    }

    const templates = await BookTemplateModel.find({ user_id: userId })
      .select(projection)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await BookTemplateModel.countDocuments({ user_id: userId });

    // Add chapter count if not including full chapters
    if (!includeChapters && !minimal) {
      for (const template of templates) {
        template.chapter_count = await Chapter.countDocuments({
          book_template_id: template._id,
        });
      }
    }

    return {
      templates,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  static async findByIdForUser(id, userId) {
    const template = await BookTemplateModel.findOne({
      _id: id,
      user_id: userId,
    });

    if (!template) {
      throw new ErrorHandler("Book template not found", 404);
    }

    const chapters = await Chapter.find({ book_template_id: id })
      .sort({ order: 1 })
      .select("-book_template_id -__v");

    const templateObj = template.toObject();
    delete templateObj.__v;

    return { ...templateObj, chapters };
  }

  static async findPublicById(id) {
    const template = await BookTemplateModel.findOne({
      _id: id,
      is_public: true,
    });

    if (!template) {
      throw new ErrorHandler("Book template not found or not public", 404);
    }

    const chapters = await Chapter.find({ book_template_id: id })
      .sort({ order: 1 })
      .select("-book_template_id -__v");

    const templateObj = template.toObject();
    delete templateObj.__v;

    return { ...templateObj, chapters };
  }

  static formatValidationError(error) {
    return error.details.map((detail) => detail.message).join(", ");
  }

  static async incrementPopularity(id) {
    return await BookTemplateModel.findByIdAndUpdate(
      id,
      { $inc: { popularity_score: 1 } },
      { new: true },
    );
  }

  static async findPopularTemplates(options = {}) {
    const { page = 1, limit = 10, min_popularity = 0, filters = {} } = options;

    const skip = (page - 1) * limit;

    // Build base query
    const query = {
      ...filters,
      popularity_score: { $gte: min_popularity },
    };

    // Get templates sorted by popularity
    const templates = await BookTemplateModel.find(query)
      .select("-chapters -__v -user_id") // Exclude unnecessary fields
      .sort({ popularity_score: -1, createdAt: -1 }) // Sort by popularity then date
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await BookTemplateModel.countDocuments(query);

    return {
      templates,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }
}

export default BookTemplate;
