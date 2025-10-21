import BookToPDF from "../../../../../CORE/services/booktopdf/index.js";
import PersonalizedBook from "../../../../PERSONALISATION/model/index.js";
import ErrorHandler from "../../../../../CORE/middleware/errorhandler/index.js";
import logger from "../../../../../CORE/utils/logger/index.js";

const generateFileName = (book) => {
  const title = book.personalized_content?.book_title || "story-book";
  const childName = book.child_name || "child";

  return `${title}-${childName}.pdf`
    .toLowerCase()
    .replace(/[^a-zA-Z0-9.-]/g, "_")
    .replace(/\s+/g, "_");
};

export const downloadBookPDF = async (req, res, next) => {
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

    if (!book.is_paid) {
      throw new ErrorHandler(
        "Please complete payment to download this book",
        402,
      );
    }

    logger.info("Generating PDF for book", {
      bookId,
      userId,
      bookTitle: book.personalized_content?.book_title,
      childName: book.child_name,
    });

    const pdfGenerator = new BookToPDF(book);
    const pdfBuffer = await pdfGenerator.generatePDF();

    const fileName = generateFileName(book);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Length", pdfBuffer.length);

    // Send PDF
    res.send(pdfBuffer);

    logger.info("PDF downloaded successfully", {
      bookId,
      userId,
      fileName,
      fileSize: `${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB`,
    });
  } catch (error) {
    logger.error("PDF download failed", {
      error: error.message,
      bookId: req.params.bookId,
      userId: req.user.id,
    });
    next(error);
  }
};
