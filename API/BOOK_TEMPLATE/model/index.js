import knex from "knex";
import ErrorHandler from "../../../CORE/middleware/errorhandler";
import knexfile from "../../../knexfile";
const db = knex(knexfile.development);

class BookTemplate {
  static table = "book_templates";

  static async create(data) {
    try {
      const [newTemplate] = await db(this.table).insert(data).returning("*");
      return newTemplate;
    } catch (error) {
      console.error("Error creating book template:", error);
      throw new ErrorHandler("Failed to create book template", 500);
    }
  }

  static async findById(id) {
    try {
      const template = await db(this.table).where({ id }).first();
      return template || null;
    } catch (error) {
      console.error("Error finding book template by ID:", error);
      throw new ErrorHandler("Failed to find book template", 404);
    }
  }

  static async findAll() {
    try {
      return db(this.table).select("*");
    } catch (error) {
      console.error("Error finding all book templates:", error);
      throw new ErrorHandler("Failed to retrieve book templates", 500);
    }
  }

  static async findByKeywords(keywords) {
    try {
      return db(this.table).whereRaw(
        "keywords ?| array[" + keywords.map(() => "?").join(",") + "]",
        keywords,
      );
    } catch (error) {
      console.error("Error finding book templates by keywords:", error);
      throw new ErrorHandler("Failed to find book templates by keywords", 404);
    }
  }

  static async update(id, data) {
    try {
      const updatedCount = await db(this.table).where({ id }).update(data);
      if (updatedCount > 0) {
        return this.findById(id);
      }
      return null;
    } catch (error) {
      console.error("Error updating book template:", error);
      throw new ErrorHandler("Failed to update book template", 500);
    }
  }

  static async delete(id) {
    try {
      const deletedCount = await db(this.table).where({ id }).del();
      return deletedCount > 0;
    } catch (error) {
      console.error("Error deleting book template:", error);
      throw new ErrorHandler("Failed to delete book template", 500);
    }
  }
}

export default BookTemplate;
