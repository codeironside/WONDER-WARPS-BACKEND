import knex from "knex";
import Joi from "joi";
import knexfile from "../../../knexfile.js";
import ErrorHandler from "../../../CORE/middleware/errorhandler/index.js";

const db = knex(knexfile.development);

class PersonalizedBook {
  static tableName = "personalized_books";

  static validationSchema = Joi.object({
    original_template_id: Joi.number().integer().positive().required(),
    user_id: Joi.number().integer().positive().required(),
    child_name: Joi.string().trim().min(1).max(255).required(),
    child_age: Joi.number().integer().min(0).max(18).allow(null).optional(),
    gender_preference: Joi.string()
      .valid("male", "female", "neutral")
      .allow(null)
      .optional(),
    price: Joi.number().precision(2).positive().required(),
    is_paid: Joi.boolean().default(false),
    payment_id: Joi.string().trim().max(255).allow(null).optional(),
    payment_date: Joi.date().allow(null).optional(),
    personalized_content: Joi.object().required(),
  }).unknown(false);

  static async create(data) {
    try {
      const { error, value: validatedData } = this.validationSchema.validate(
        data,
        {
          abortEarly: false,
          stripUnknown: true,
        },
      );

      if (error) {
        throw new ErrorHandler(this.formatValidationError(error), 400);
      }

      const [newBook] = await db(this.tableName)
        .insert(validatedData)
        .returning("*");

      return newBook;
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler(
        `Failed to create personalized book: ${error.message}`,
        500,
      );
    }
  }

  static async findById(id) {
    return db(this.tableName).where({ id }).first();
  }

  static async findByUser(userId) {
    return db(this.tableName)
      .where({ user_id: userId })
      .orderBy("created_at", "desc");
  }

  static async updatePaymentStatus(bookId, paymentId, isPaid = true) {
    try {
      const updateData = {
        is_paid: isPaid,
        payment_id: paymentId,
        payment_date: isPaid ? new Date() : null,
      };

      const updatedCount = await db(this.tableName)
        .where({ id: bookId })
        .update(updateData);

      if (updatedCount === 0) {
        throw new ErrorHandler("Personalized book not found", 404);
      }

      return this.findById(bookId);
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler("Failed to update payment status", 500);
    }
  }

  static formatValidationError(error) {
    return error.details.map((detail) => detail.message).join(", ");
  }
}

export default PersonalizedBook;
