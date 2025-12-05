import BookToPDF from "../../../../CORE/services/booktopdf/index.js";
import PersonalizedBook from "../../../PERSONALISATION/model/index.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";
import logger from "../../../../CORE/utils/logger/index.js";

const streamBookPDF = async (req, res, next) => {
  try {
    const { bookId } = req.params;
    const userId = req.user._id;

    const book = await PersonalizedBook.findById(bookId);

    if (!book) {
      throw new ErrorHandler("Book not found", 404);
    }

    if (book.user_id.toString() !== userId.toString()) {
      throw new ErrorHandler("Access denied", 403);
    }

    if (!book.is_paid) {
      throw new ErrorHandler(
        "Please complete payment to download this book",
        402,
      );
    }

    const fileName = generateFileName(book);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    // Generate and stream PDF
    const pdfGenerator = new BookToPDF(book);
    const doc = await pdfGenerator.generatePDFStream();

    doc.pipe(res);

    // Add content to PDF
    await pdfGenerator.generateContent();

    doc.end();

    logger.info("PDF streamed successfully", {
      bookId,
      userId,
      fileName,
    });
  } catch (error) {
    logger.error("PDF streaming failed", {
      error: error.message,
      bookId: req.params.bookId,
      userId: req.user._id,
    });
    next(error);
  }
};
