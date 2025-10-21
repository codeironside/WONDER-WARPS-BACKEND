import BookToPDF from "../../../../../CORE/services/booktopdf/index.js";
import PersonalizedBook from "../../../../PERSONALISATION/model/index.js";
import ErrorHandler from "../../../../../CORE/middleware/errorhandler/index.js";
import logger from "../../../../../CORE/utils/logger/index.js";

const previewBook = async (req, res, next) => {
  try {
    const { bookId } = req.params;
    const userId = req.user.id;

    const book = await PersonalizedBook.findById(bookId);

    if (!book) {
      throw new ErrorHandler("Book not found", 404);
    }

    if (book.user_id.toString() !== userId.toString()) {
      throw new ErrorHandler("Access denied", 403);
    }
    const previewData = {
      _id: book._id,
      child_name: book.child_name,
      child_age: book.child_age,
      book_title: book.personalized_content?.book_title,
      genre: book.personalized_content?.genre,
      author: book.personalized_content?.author,
      cover_image: book.personalized_content?.cover_image?.[0],
      is_paid: book.is_paid,
      suggested_font: book.personalized_content?.suggested_font,
      chapter_count: book.personalized_content?.chapters?.length || 0,
      preview_available: book.is_paid, // Full preview only for paid books
    };

    res.json({
      success: true,
      data: previewData,
    });
  } catch (error) {
    logger.error("Book preview failed", {
      error: error.message,
      bookId: req.params.bookId,
      userId: req.user.id,
    });
    next(error);
  }
};
