import PDFDocument from "pdfkit";
import axios from "axios";

class BookToPDF {
  constructor(bookData) {
    this.book = bookData;
    this.doc = null;
    this.margins = {
      top: 50,
      bottom: 50,
      left: 40,
      right: 40,
    };

    this.pageWidth = 595.28; // A4 width in points
    this.pageHeight = 841.89; // A4 height in points
    this.contentWidth = this.pageWidth - this.margins.left - this.margins.right;
    this.contentHeight =
      this.pageHeight - this.margins.top - this.margins.bottom;
  }

  /**
   * Generate PDF from book data
   */
  async generatePDF() {
    return new Promise(async (resolve, reject) => {
      try {
        this.doc = new PDFDocument({
          margin: 0,
          size: "A4",
          info: {
            Title: this.book.book_title || "Personalized Story Book",
            Author: this.book.author || "My Story Hat",
            Subject: `Personalized story for ${this.book.child_name}`,
            Keywords: `personalized, children, story, ${this.book.child_name}`,
            Creator: "My Story Hat",
            CreationDate: new Date(),
          },
        });

        const buffers = [];
        this.doc.on("data", buffers.push.bind(buffers));
        this.doc.on("end", () => {
          const pdfData = Buffer.concat(buffers);
          resolve(pdfData);
        });
        this.doc.on("error", reject);

        // Generate expanded chapters like the FlipBook
        this.expandedChapters = this.expandChapters();

        // Generate PDF content
        await this.generateContent();

        this.doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Expand chapters to match FlipBook structure
   */
  expandChapters() {
    if (!this.book?.chapters) return [];
    const pages = [];

    this.book.chapters.forEach((chapter) => {
      if (chapter.image_position === "full scene") {
        pages.push({
          type: "image-only",
          title: chapter.chapter_title,
          image_url: chapter.image_url,
          image_description: chapter.image_description,
        });

        pages.push({
          type: "text-only",
          title: chapter.chapter_title,
          content: chapter.chapter_content,
        });
      } else if (chapter.image_position === "character focus") {
        pages.push({
          type: "character-focus",
          ...chapter,
        });
      } else if (chapter.image_position === "action spotlight") {
        pages.push({
          type: "action-spotlight",
          ...chapter,
        });
      } else if (chapter.image_position === "background") {
        pages.push({
          type: "background",
          ...chapter,
        });
      } else {
        pages.push({
          type: "standard",
          ...chapter,
        });
      }
    });

    return pages;
  }

  /**
   * Generate all PDF content
   */
  async generateContent() {
    // Cover page
    await this.addCoverPage();

    // Chapters
    await this.addChapters();

    // End page
    this.addEndPage();
  }

  /**
   * Add cover page matching FlipBook style
   */
  async addCoverPage() {
    // White background
    this.doc.rect(0, 0, this.pageWidth, this.pageHeight).fill("#ffffff");

    const coverImage = this.book?.cover_image;

    if (coverImage) {
      try {
        const imageBuffer = await this.downloadImage(coverImage);

        // Calculate dimensions to match FlipBook (70% of content area)
        const imageWidth = this.contentWidth * 0.7;
        const imageHeight = this.contentHeight * 0.7;
        const x = (this.pageWidth - imageWidth) / 2;
        const y = (this.pageHeight - imageHeight) / 2 - 30;

        this.doc.image(imageBuffer, x, y, {
          width: imageWidth,
          height: imageHeight,
        });

        // Add title box like FlipBook
        const titleBoxWidth = this.contentWidth * 0.8;
        const titleBoxHeight = 60;
        const titleBoxX = (this.pageWidth - titleBoxWidth) / 2;
        const titleBoxY = y + imageHeight + 20;

        // White background with shadow effect
        this.doc
          .rect(titleBoxX, titleBoxY, titleBoxWidth, titleBoxHeight)
          .fill("#ffffff")
          .stroke("#e5e5e5");

        // Book title
        this.doc
          .font("Helvetica-Bold")
          .fontSize(24)
          .fillColor("#000000")
          .text(
            this.book.book_title || "My Story Book",
            titleBoxX + 20,
            titleBoxY + 15,
            {
              width: titleBoxWidth - 40,
              align: "center",
              lineGap: 5,
            },
          );
      } catch (error) {
        console.warn("Could not load cover image:", error.message);
        // Fallback cover without image
        this.addFallbackCover();
      }
    } else {
      this.addFallbackCover();
    }
  }

  /**
   * Fallback cover without image
   */
  addFallbackCover() {
    // Use a solid color background instead of gradient
    this.doc
      .fillColor("#fef7ed")
      .rect(0, 0, this.pageWidth, this.pageHeight)
      .fill();

    const centerY = this.pageHeight / 2 - 50;

    this.doc
      .font("Helvetica-Bold")
      .fontSize(32)
      .fillColor("#1f2937")
      .text(
        this.book.book_title || "My Story Book",
        this.margins.left,
        centerY,
        {
          width: this.contentWidth,
          align: "center",
        },
      )
      .moveDown(1);

    this.doc
      .font("Helvetica")
      .fontSize(16)
      .fillColor("#6b7280")
      .text(`by ${this.book.author || "My Story Hat"}`, {
        width: this.contentWidth,
        align: "center",
      })
      .moveDown(3);

    this.doc
      .fontSize(18)
      .fillColor("#f97316")
      .text(`For ${this.book.child_name}`, {
        width: this.contentWidth,
        align: "center",
      });

    if (this.book.child_age) {
      this.doc
        .moveDown(0.5)
        .fontSize(14)
        .fillColor("#6b7280")
        .text(`Age ${this.book.child_age}`, {
          width: this.contentWidth,
          align: "center",
        });
    }
  }

  /**
   * Add all chapters
   */
  async addChapters() {
    for (let i = 0; i < this.expandedChapters.length; i++) {
      await this.addChapterPage(this.expandedChapters[i], i);

      // Add page break between chapters
      if (i < this.expandedChapters.length - 1) {
        this.doc.addPage();
      }
    }
  }

  /**
   * Add a single chapter page
   */
  async addChapterPage(chapter, index) {
    // White background for all pages
    this.doc.rect(0, 0, this.pageWidth, this.pageHeight).fill("#ffffff");

    switch (chapter.type) {
      case "image-only":
        await this.renderImageOnlyPage(chapter);
        break;
      case "text-only":
        await this.renderTextOnlyPage(chapter);
        break;
      case "character-focus":
        await this.renderCharacterFocusPage(chapter);
        break;
      case "action-spotlight":
        await this.renderActionSpotlightPage(chapter);
        break;
      case "background":
        await this.renderBackgroundPage(chapter);
        break;
      default:
        await this.renderStandardPage(chapter);
    }

    // Add page number
    this.addPageNumber(index + 2); // +2 for cover and start counting from 1
  }

  /**
   * Image-only page layout
   */
  async renderImageOnlyPage(chapter) {
    if (chapter.image_url) {
      try {
        const imageBuffer = await this.downloadImage(chapter.image_url);
        this.doc.image(imageBuffer, 0, 0, {
          width: this.pageWidth,
          height: this.pageHeight,
        });
      } catch (error) {
        console.warn("Could not load image:", error.message);
      }
    }
  }

  /**
   * Text-only page layout with decorative elements
   */
  async renderTextOnlyPage(chapter) {
    // Title
    this.doc
      .font("Helvetica-Bold")
      .fontSize(20)
      .fillColor("#374151")
      .text(chapter.title, this.margins.left, this.margins.top + 20, {
        width: this.contentWidth,
      });

    // Content
    this.doc
      .font("Helvetica")
      .fontSize(12)
      .fillColor("#1f2937")
      .text(chapter.content, this.margins.left, this.margins.top + 60, {
        width: this.contentWidth,
        lineGap: 8,
        paragraphGap: 5,
      });

    // Add decorative elements (simplified version of SVG decorations)
    this.addDecorativeElements();
  }

  /**
   * Character focus page layout
   */
  async renderCharacterFocusPage(chapter) {
    // Use solid color background instead of gradient
    this.doc
      .fillColor("#fef3c7") // Light amber background
      .rect(0, 0, this.pageWidth, this.pageHeight)
      .fill();

    // Title
    this.doc
      .font("Helvetica-Bold")
      .fontSize(18)
      .fillColor("#374151")
      .text(chapter.chapter_title, this.margins.left, this.margins.top + 20, {
        width: this.contentWidth,
      });

    if (chapter.image_url) {
      try {
        const imageBuffer = await this.downloadImage(chapter.image_url);

        // Image with border like FlipBook
        const imageWidth = this.contentWidth;
        const imageHeight = 300;
        const imageX = this.margins.left;
        const imageY = this.margins.top + 60;

        // White border
        this.doc
          .rect(imageX - 5, imageY - 5, imageWidth + 10, imageHeight + 10)
          .fill("#ffffff")
          .stroke("#e5e5e5");

        this.doc.image(imageBuffer, imageX, imageY, {
          width: imageWidth,
          height: imageHeight,
        });

        // Content below image
        this.doc
          .font("Helvetica")
          .fontSize(11)
          .fillColor("#1f2937")
          .text(
            chapter.chapter_content,
            this.margins.left + 10,
            imageY + imageHeight + 30,
            {
              width: this.contentWidth - 20,
              lineGap: 6,
            },
          );
      } catch (error) {
        console.warn("Could not load image:", error.message);
        // Fallback without image
        this.doc
          .font("Helvetica")
          .fontSize(11)
          .fillColor("#1f2937")
          .text(
            chapter.chapter_content,
            this.margins.left,
            this.margins.top + 80,
            {
              width: this.contentWidth,
              lineGap: 6,
            },
          );
      }
    }
  }

  /**
   * Action spotlight page layout
   */
  async renderActionSpotlightPage(chapter) {
    // Dark background
    this.doc
      .fillColor("#1e293b")
      .rect(0, 0, this.pageWidth, this.pageHeight)
      .fill();

    // Title in amber color
    this.doc
      .font("Helvetica-Bold")
      .fontSize(18)
      .fillColor("#f59e0b")
      .text(chapter.chapter_title, this.margins.left, this.margins.top + 20, {
        width: this.contentWidth,
      });

    if (chapter.image_url) {
      try {
        const imageBuffer = await this.downloadImage(chapter.image_url);

        // Image with amber border
        const imageWidth = this.contentWidth;
        const imageHeight = 250;
        const imageX = this.margins.left;
        const imageY = this.margins.top + 60;

        // Amber border using solid color instead of gradient
        this.doc
          .fillColor("#f59e0b")
          .opacity(0.3)
          .rect(imageX - 3, imageY - 3, imageWidth + 6, imageHeight + 6)
          .fill()
          .opacity(1); // Reset opacity

        this.doc.image(imageBuffer, imageX, imageY, {
          width: imageWidth,
          height: imageHeight,
        });

        // Content in white below image
        this.doc
          .font("Helvetica")
          .fontSize(11)
          .fillColor("#f1f5f9")
          .text(
            chapter.chapter_content,
            this.margins.left + 10,
            imageY + imageHeight + 30,
            {
              width: this.contentWidth - 20,
              lineGap: 6,
            },
          );
      } catch (error) {
        console.warn("Could not load image:", error.message);
        // Fallback without image
        this.doc
          .font("Helvetica")
          .fontSize(11)
          .fillColor("#f1f5f9")
          .text(
            chapter.chapter_content,
            this.margins.left,
            this.margins.top + 80,
            {
              width: this.contentWidth,
              lineGap: 6,
            },
          );
      }
    }
  }

  /**
   * Background page layout
   */
  async renderBackgroundPage(chapter) {
    if (chapter.image_url) {
      try {
        const imageBuffer = await this.downloadImage(chapter.image_url);

        // Full page background image
        this.doc.image(imageBuffer, 0, 0, {
          width: this.pageWidth,
          height: this.pageHeight,
        });

        // Dark overlay using solid color instead of gradient
        this.doc
          .fillColor("black")
          .opacity(0.5)
          .rect(0, 0, this.pageWidth, this.pageHeight)
          .fill()
          .opacity(1); // Reset opacity
      } catch (error) {
        console.warn("Could not load background image:", error.message);
        // Fallback dark background
        this.doc
          .fillColor("#1e293b")
          .rect(0, 0, this.pageWidth, this.pageHeight)
          .fill();
      }
    }

    // Content overlay
    const contentY = this.pageHeight / 2 - 100;

    this.doc
      .font("Helvetica-Bold")
      .fontSize(20)
      .fillColor("#ffffff")
      .text(chapter.chapter_title, this.margins.left, contentY, {
        width: this.contentWidth,
        align: "center",
      });

    this.doc
      .font("Helvetica")
      .fontSize(12)
      .fillColor("#ffffff")
      .text(chapter.chapter_content, this.margins.left, contentY + 50, {
        width: this.contentWidth,
        align: "center",
        lineGap: 8,
      });
  }

  /**
   * Standard page layout
   */
  async renderStandardPage(chapter) {
    // Title
    this.doc
      .font("Helvetica-Bold")
      .fontSize(18)
      .fillColor("#374151")
      .text(chapter.chapter_title, this.margins.left, this.margins.top + 20, {
        width: this.contentWidth,
      });

    if (chapter.image_url) {
      try {
        const imageBuffer = await this.downloadImage(chapter.image_url);

        const imageWidth = this.contentWidth;
        const imageHeight = 200;
        const imageY = this.margins.top + 60;

        this.doc.image(imageBuffer, this.margins.left, imageY, {
          width: imageWidth,
          height: imageHeight,
        });

        // Content below image
        this.doc
          .font("Helvetica")
          .fontSize(11)
          .fillColor("#1f2937")
          .text(
            chapter.chapter_content,
            this.margins.left,
            imageY + imageHeight + 30,
            {
              width: this.contentWidth,
              lineGap: 6,
            },
          );
      } catch (error) {
        console.warn("Could not load image:", error.message);
        // Content without image
        this.doc
          .font("Helvetica")
          .fontSize(11)
          .fillColor("#1f2937")
          .text(
            chapter.chapter_content,
            this.margins.left,
            this.margins.top + 60,
            {
              width: this.contentWidth,
              lineGap: 6,
            },
          );
      }
    } else {
      // Content without image
      this.doc
        .font("Helvetica")
        .fontSize(11)
        .fillColor("#1f2937")
        .text(
          chapter.chapter_content,
          this.margins.left,
          this.margins.top + 60,
          {
            width: this.contentWidth,
            lineGap: 6,
          },
        );
    }
  }

  /**
   * Add decorative elements for text-only pages
   */
  addDecorativeElements() {
    // Simple decorative circles (approximation of SVG elements)
    this.doc
      .fillColor("#fb923c")
      .opacity(0.1)
      .circle(this.pageWidth - 80, 100, 30)
      .fill();

    this.doc
      .fillColor("#fbcfe8")
      .opacity(0.1)
      .circle(60, this.pageHeight - 100, 20)
      .fill()
      .opacity(1); // Reset opacity
  }

  /**
   * Add end page matching FlipBook style
   */
  addEndPage() {
    this.doc.addPage();

    // White background
    this.doc.rect(0, 0, this.pageWidth, this.pageHeight).fill("#ffffff");

    const centerY = this.pageHeight / 2 - 50;

    // "The End" title - using solid color instead of gradient
    this.doc
      .font("Helvetica-Bold")
      .fontSize(32)
      .fillColor("#fb923c") // Use the starting color of the gradient
      .text("The End", this.margins.left, centerY, {
        width: this.contentWidth,
        align: "center",
      });

    this.doc
      .font("Helvetica")
      .fontSize(16)
      .fillColor("#6b7280")
      .text("Thank you for reading!", this.margins.left, centerY + 60, {
        width: this.contentWidth,
        align: "center",
      });

    // Add page number for end page
    this.addPageNumber(this.expandedChapters.length + 2);
  }

  /**
   * Add page number to current page
   */
  addPageNumber(pageNumber) {
    const bottom = this.pageHeight - 30;

    this.doc
      .fontSize(10)
      .fillColor("#9ca3af")
      .text(`Page ${pageNumber}`, this.margins.left, bottom, {
        width: this.contentWidth,
        align: "center",
      });
  }

  /**
   * Download image from URL
   */
  async downloadImage(url) {
    try {
      const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: 15000,
      });

      return Buffer.from(response.data, "binary");
    } catch (error) {
      throw new Error(`Failed to download image: ${error.message}`);
    }
  }
}

export default BookToPDF;
