import puppeteer from "puppeteer";
import jwt from "jsonwebtoken";
import PersonalizedBook from "../../../../PERSONALISATION/model/index.js";
import ErrorHandler from "../../../../../CORE/middleware/errorhandler/index.js";
import logger from "../../../../../CORE/utils/logger/index.js";

export const downloadBookPDF = async (req, res, next) => {
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
        402
      );
    }

    logger.info("Generating PDF via Puppeteer for book", {
      bookId,
      userId,
    });

   
    const safeToken = encodeURIComponent(req.token);
    console.log(req.token)
    console.log("space")
    console.log(safeToken)
    const printUrl = `https://www.mystoryhat.com/print-book/${bookId}?token=${safeToken}`;


    const frontendDomain = process.env.BASE_URL.replace(/^https?:\/\//, "");

    const browser = await puppeteer.launch({
      headless: "new", 
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    // await page.setExtraHTTPHeaders({
    //   Host: frontendDomain,
    // });

    page.on("console", (msg) => {
      console.log("[PUPPETEER BROWSER]:", msg.text());
    });

    await page.goto(printUrl, {
      waitUntil: "networkidle0",
      timeout: 60000,
    });
    console.log(`generating..........`);
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "0px",
        right: "0px",
        bottom: "0px",
        left: "0px",
      },
    });

    await browser.close();

    const title = book.personalized_content?.book_title || "My Story Book";
    const childName = book.child_name || "child";
    const fileName = `${title} - ${childName}.pdf`
      .toLowerCase()
      .replace(/[^a-z0-9\s.-]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\s/g, "_");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(pdfBuffer);

    logger.info("PDF download stream started successfully via Puppeteer", {
      bookId,
      userId,
    });
  } catch (error) {
    console.error(error);
    logger.error("Puppeteer PDF download failed", {
      error: error.message,
      bookId: req.params.bookId,
      userId: req.user?.id,
    });

    if (res.headersSent) {
      res.end();
    } else {
      next(error);
    }
  }
};