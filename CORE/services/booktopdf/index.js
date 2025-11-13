import PDFDocument from "pdfkit";
import axios from "axios";
import ImagePositionHandler from "./imagepositionerhandler/index.js";

class BookToPDF {
  constructor(bookData) {
    this.book = bookData;
    this.doc = null;

    // A5 dimensions in points: 419.53 x 595.28 (148mm x 210mm)
    this.pageWidth = 419.53;
    this.pageHeight = 595.28;

    // Adjust margins for A5 size
    this.margins = {
      top: 30,
      bottom: 30,
      left: 25,
      right: 25,
    };

    this.contentWidth = this.pageWidth - this.margins.left - this.margins.right;
    this.contentHeight =
      this.pageHeight - this.margins.top - this.margins.bottom;
  }

  async generatePDF(res) {
    return new Promise(async (resolve, reject) => {
      try {
        // Set headers for streaming and automatic download
        const fileName = this.generateFileName();
        res.setHeader("Content-Type", "application/pdf");

        // Use 'attachment' to force download without asking
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${fileName}"`,
        );

        // Create PDF document with A5 size
        this.doc = new PDFDocument({
          margin: 0,
          size: [this.pageWidth, this.pageHeight], // A5 size
          info: {
            Title:
              this.book.personalized_content?.book_title ||
              "Personalized Story Book",
            Author: this.book.child_name || "My Story Hat",
            Subject: `Personalized story for ${this.book.child_name}`,
            Keywords: `personalized, children, story, ${this.book.child_name}`,
            Creator: "My Story Hat",
            CreationDate: new Date(),
          },
        });

        // Pipe PDF directly to response
        this.doc.pipe(res);

        this.expandedChapters = this.expandChapters();
        await this.generateContent();

        this.doc.end();

        // Wait for stream to finish
        this.doc.on("end", () => {
          resolve();
        });

        this.doc.on("error", (error) => {
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  generateFileName() {
    // Use the actual book title for the filename
    const title = this.book.personalized_content?.book_title || "My Story Book";
    const childName = this.book.child_name || "child";

    // Clean the filename to be URL-safe
    return `${title} - ${childName}.pdf`
      .toLowerCase()
      .replace(/[^a-zA-Z0-9\s.-]/g, "") // Remove special characters except spaces, dots, and hyphens
      .replace(/\s+/g, " ") // Replace multiple spaces with single space
      .trim()
      .replace(/\s/g, "_"); // Replace spaces with underscores for final filename
  }

  expandChapters() {
    if (!this.book.personalized_content?.chapters) return [];
    const pages = [];

    this.book.personalized_content.chapters.forEach((chapter) => {
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
      } else {
        pages.push({
          type: chapter.image_position || "standard",
          ...chapter,
        });
      }
    });

    return pages;
  }

  async generateContent() {
    await this.generateCoverAndFrontMatter();
    await this.generateChapters();
    this.generateEndPage();
  }

  async generateCoverAndFrontMatter() {
    await this.addCoverPage();
    this.addDedicationPage();
  }

  async generateChapters() {
    for (let i = 0; i < this.expandedChapters.length; i++) {
      await this.addChapterPage(this.expandedChapters[i], i);
      if (i < this.expandedChapters.length - 1) {
        this.doc.addPage();
      }
    }
  }

  getFontFamily() {
    const suggestedFont =
      this.book.personalized_content?.suggested_font || "Comic Sans MS";

    // Corrected font mapping for PDFKit standard fonts
    const fontMap = {
      // Younger child fonts - more playful and rounded
      "Comic Sans MS": "Helvetica",
      "KG Primary Penmanship": "Helvetica",
      "DK Crayon Crumble": "Helvetica",
      OpenDyslexic: "Helvetica",
      "Sassoon Primary": "Helvetica",
      "Century Gothic": "Helvetica",
      Verdana: "Helvetica",
      "Arial Rounded": "Helvetica",

      // Middle child fonts - balanced and readable
      "Gill Sans": "Helvetica",
      "Trebuchet MS": "Helvetica",
      Palatino: "Times-Roman",
      Georgia: "Times-Roman",
      Calibri: "Helvetica",
      Cabin: "Helvetica",
      Quicksand: "Helvetica",
      Nunito: "Helvetica",

      // Older child fonts - more formal and traditional
      "Times New Roman": "Times-Roman",
      Garamond: "Times-Roman",
      Baskerville: "Times-Roman",
      Helvetica: "Helvetica",
      Lato: "Helvetica",
      Merriweather: "Times-Roman",
      Roboto: "Helvetica",
      "Source Sans Pro": "Helvetica",

      // Themed fonts
      Papyrus: "Times-Roman", // Fantasy
      "Trajan Pro": "Times-Roman", // Fantasy
      "Uncial Antiqua": "Times-Roman", // Fantasy
      Rockwell: "Times-Roman", // Adventure
      Copperplate: "Times-Roman", // Adventure
      "Franklin Gothic": "Helvetica", // Adventure
      Orbitron: "Courier", // Sci-fi
      Eurostile: "Helvetica", // Sci-fi
      "Bank Gothic": "Helvetica", // Sci-fi
      "Courier New": "Courier", // Mystery
      "American Typewriter": "Courier", // Mystery
      "Marker Felt": "Helvetica", // Humor
      Chalkboard: "Helvetica", // Humor
    };

    return fontMap[suggestedFont] || "Helvetica";
  }

  // Helper method to get bold font variant
  getBoldFont(fontFamily) {
    const boldMap = {
      Helvetica: "Helvetica-Bold",
      "Times-Roman": "Times-Bold", // Fixed: Times-Roman-Bold doesn't exist
      Courier: "Courier-Bold",
    };
    return boldMap[fontFamily] || "Helvetica-Bold";
  }

  async addCoverPage() {
    const coverImage = this.book.personalized_content?.cover_image?.[0];

    if (coverImage) {
      try {
        const imageBuffer = await this.downloadImage(coverImage);

        this.doc.image(imageBuffer, 0, 0, {
          width: this.pageWidth,
          height: this.pageHeight,
        });

        const titleBoxHeight = 80; // Reduced for A5
        const titleBoxY = this.pageHeight - titleBoxHeight - 30;

        this.doc
          .rect(0, titleBoxY, this.pageWidth, titleBoxHeight)
          .fill("#ffffff");

        const title =
          this.book.personalized_content?.book_title || "My Story Book";
        const author = this.book.child_name;

        // Smaller font sizes for A5
        this.doc
          .font("Helvetica-Bold")
          .fontSize(20) // Reduced from 32
          .fillColor("#000000")
          .text(title, this.margins.left, titleBoxY + 15, {
            width: this.contentWidth,
            align: "center",
          });

        this.doc
          .font("Helvetica")
          .fontSize(14) // Reduced from 18
          .fillColor("#666666")
          .text(`by ${author}`, this.margins.left, titleBoxY + 50, {
            width: this.contentWidth,
            align: "center",
          });
      } catch (error) {
        this.addFallbackCover();
      }
    } else {
      this.addFallbackCover();
    }
  }

  addFallbackCover() {
    this.doc
      .fillColor("#fef7ed")
      .rect(0, 0, this.pageWidth, this.pageHeight)
      .fill();

    const centerY = this.pageHeight / 2 - 40; // Adjusted for A5

    // Smaller font sizes for A5
    this.doc
      .font("Helvetica-Bold")
      .fontSize(20) // Reduced from 32
      .fillColor("#1f2937")
      .text(
        this.book.personalized_content?.book_title || "My Story Book",
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
      .fontSize(12) // Reduced from 16
      .fillColor("#6b7280")
      .text(`by ${this.book.child_name}`, {
        width: this.contentWidth,
        align: "center",
      })
      .moveDown(2); // Reduced spacing

    this.doc
      .fontSize(14) // Reduced from 18
      .fillColor("#f97316")
      .text(`For ${this.book.child_name}`, {
        width: this.contentWidth,
        align: "center",
      });

    if (this.book.child_age) {
      this.doc
        .moveDown(0.3) // Reduced spacing
        .fontSize(12) // Reduced from 14
        .fillColor("#6b7280")
        .text(`Age ${this.book.child_age}`, {
          width: this.contentWidth,
          align: "center",
        });
    }
  }

  addDedicationPage() {
    this.doc.addPage();
    this.doc.rect(0, 0, this.pageWidth, this.pageHeight).fill("#ffffff");

    // Smaller font sizes for A5
    this.doc
      .fillColor("#1f2937")
      .fontSize(20) // Reduced from 28
      .font("Helvetica-Bold")
      .text("To My Special Reader", {
        align: "center",
      })
      .moveDown(1.5); // Reduced spacing

    this.doc
      .fontSize(12) // Reduced from 16
      .font("Helvetica")
      .fillColor("#4b5563")
      .text(
        `This story was created especially for you, ${this.book.child_name}!`,
        {
          align: "center",
          width: this.contentWidth,
        },
      )
      .moveDown(0.8); // Reduced spacing

    if (this.book.child_age) {
      this.doc.text(
        `You are ${this.book.child_age} years old, and this is your very own adventure.`,
        {
          align: "center",
          width: this.contentWidth,
        },
      );
    }

    this.doc
      .moveDown(2) // Reduced spacing
      .fontSize(11) // Reduced from 14
      .fillColor("#6b7280")
      .text(
        "May your imagination soar as high as the stories we create together.",
        {
          align: "center",
          width: this.contentWidth,
        },
      );
  }

  async addChapterPage(chapter, index) {
    this.doc.rect(0, 0, this.pageWidth, this.pageHeight).fill("#ffffff");

    const fontFamily = this.getFontFamily();
    const boldFont = this.getBoldFont(fontFamily);

    switch (chapter.type) {
      case "image-only":
        await this.renderImageOnlyPage(chapter);
        break;
      case "text-only":
        await this.renderTextOnlyPage(chapter, fontFamily, boldFont);
        break;
      default:
        await this.renderChapterWithImage(chapter, fontFamily, boldFont);
    }

    this.addPageNumber(index + 3);
  }

  async renderImageOnlyPage(chapter) {
    if (chapter.image_url) {
      try {
        const imageBuffer = await this.downloadImage(chapter.image_url);
        this.doc.image(imageBuffer, 0, 0, {
          width: this.pageWidth,
          height: this.pageHeight,
        });
      } catch (error) {
        this.doc
          .font("Helvetica")
          .fontSize(12) // Reduced from 16
          .fillColor("#666666")
          .text(
            "Image not available",
            this.margins.left,
            this.margins.top + 60, // Adjusted position
            {
              width: this.contentWidth,
              align: "center",
            },
          );
      }
    }
  }

  async renderTextOnlyPage(chapter, fontFamily, boldFont) {
    this.doc.rect(0, 0, this.pageWidth, this.pageHeight).fill("#ffffff");

    if (chapter.title) {
      this.doc
        .font(boldFont) // Use the correct bold font
        .fontSize(18) // Reduced from 24
        .fillColor("#000000")
        .text(chapter.title, this.margins.left, this.margins.top + 25, {
          // Adjusted position
          width: this.contentWidth,
          align: "center",
        });
    }

    if (chapter.content) {
      const personalizedContent = this.personalizeContent(chapter.content);
      this.doc
        .font(fontFamily)
        .fontSize(10) // Reduced from 14
        .fillColor("#1f2937")
        .text(
          personalizedContent,
          this.margins.left,
          this.margins.top + (chapter.title ? 70 : 40), // Adjusted positions
          {
            width: this.contentWidth,
            height: this.contentHeight - (chapter.title ? 90 : 60), // Adjusted heights
            lineGap: 6, // Reduced from 8
            paragraphGap: 4, // Reduced from 6
            align: "justify",
          },
        );
    }

    this.addDecorativeElements();
  }

  async renderChapterWithImage(chapter, fontFamily, boldFont) {
    const imagePositionHandler = new ImagePositionHandler(
      this.doc,
      this.margins,
      this.pageWidth,
      this.pageHeight,
      this.contentWidth,
      this.contentHeight,
    );

    if (chapter.chapter_title) {
      this.doc
        .font(boldFont) // Use the correct bold font
        .fontSize(18) // Reduced from 24
        .fillColor("#000000")
        .text(chapter.chapter_title, this.margins.left, this.margins.top + 15, {
          // Adjusted position
          width: this.contentWidth,
          align: "center",
        });
    }

    if (chapter.image_url) {
      try {
        const imageBuffer = await this.downloadImage(chapter.image_url);
        const result = imagePositionHandler.handleImagePosition(
          chapter,
          imageBuffer,
        );

        if (result.hasText && chapter.chapter_content) {
          const personalizedContent = this.personalizeContent(
            chapter.chapter_content,
          );
          this.doc
            .font(fontFamily)
            .fontSize(10) // Reduced from 12
            .fillColor(result.textColor || "#1f2937")
            .text(personalizedContent, result.textX, result.textY, {
              width: result.textWidth,
              height: result.textHeight,
              lineGap: 4, // Reduced from 6
              align: "justify",
            });
        }
      } catch (error) {
        if (chapter.chapter_content) {
          const personalizedContent = this.personalizeContent(
            chapter.chapter_content,
          );
          this.doc
            .font(fontFamily)
            .fontSize(10) // Reduced from 12
            .fillColor("#1f2937")
            .text(
              personalizedContent,
              this.margins.left,
              this.margins.top + 60, // Adjusted position
              {
                width: this.contentWidth,
                height: this.contentHeight - 80, // Adjusted height
                lineGap: 4, // Reduced from 6
                align: "justify",
              },
            );
        }
      }
    } else {
      if (chapter.chapter_content) {
        const personalizedContent = this.personalizeContent(
          chapter.chapter_content,
        );
        this.doc
          .font(fontFamily)
          .fontSize(10) // Reduced from 12
          .fillColor("#1f2937")
          .text(personalizedContent, this.margins.left, this.margins.top + 60, {
            // Adjusted position
            width: this.contentWidth,
            height: this.contentHeight - 80, // Adjusted height
            lineGap: 4, // Reduced from 6
            align: "justify",
          });
      }
    }
  }

  generateEndPage() {
    this.doc.addPage();
    this.doc.rect(0, 0, this.pageWidth, this.pageHeight).fill("#ffffff");

    const centerY = this.pageHeight / 2 - 30; // Adjusted for A5

    this.doc
      .font("Helvetica-Bold")
      .fontSize(24) // Reduced from 32
      .fillColor("#fb923c")
      .text("The End", this.margins.left, centerY, {
        width: this.contentWidth,
        align: "center",
      });

    this.doc
      .font("Helvetica")
      .fontSize(12) // Reduced from 16
      .fillColor("#6b7280")
      .text("Thank you for reading!", this.margins.left, centerY + 40, {
        // Adjusted position
        width: this.contentWidth,
        align: "center",
      });

    this.addPageNumber(this.expandedChapters.length + 3);
  }

  addPageNumber(pageNumber) {
    const bottom = this.pageHeight - 20; // Adjusted for A5
    this.doc
      .fontSize(8) // Reduced from 10
      .fillColor("#9ca3af")
      .text(`Page ${pageNumber}`, this.margins.left, bottom, {
        width: this.contentWidth,
        align: "center",
      });
  }

  addDecorativeElements() {
    // Smaller decorative elements for A5
    this.doc
      .fillColor("#fb923c")
      .opacity(0.1)
      .circle(this.pageWidth - 50, 70, 20) // Reduced sizes
      .fill();

    this.doc
      .fillColor("#fbcfe8")
      .opacity(0.1)
      .circle(40, this.pageHeight - 70, 15) // Reduced sizes
      .fill()
      .opacity(1);
  }

  async downloadImage(url) {
    try {
      const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: 15000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return Buffer.from(response.data);
    } catch (error) {
      throw new Error(`Failed to download image: ${error.message}`);
    }
  }

  personalizeContent(content) {
    if (!content || !this.book.child_name) return content;

    return content
      .replace(/\[child's name\]/gi, this.book.child_name)
      .replace(/\[Child's Name\]/gi, this.book.child_name)
      .replace(/\[child_name\]/gi, this.book.child_name)
      .replace(/\[Child Name\]/gi, this.book.child_name)
      .replace(/\[name\]/gi, this.book.child_name);
  }
}

export default BookToPDF;
