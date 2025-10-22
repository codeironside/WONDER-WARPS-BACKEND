import PDFDocument from "pdfkit";
import axios from "axios";
import ImagePositionHandler from "./imagepositionerhandler/index.js";

class BookToPDF {
  constructor(bookData) {
    this.book = bookData;
    this.doc = null;
    this.margins = {
      top: 40,
      bottom: 40,
      left: 40,
      right: 40,
    };

    this.pageWidth = 595.28;
    this.pageHeight = 841.89;
    this.contentWidth = this.pageWidth - this.margins.left - this.margins.right;
    this.contentHeight = this.pageHeight - this.margins.top - this.margins.bottom;
  }

  async generatePDF() {
    return new Promise(async (resolve, reject) => {
      try {
        this.doc = new PDFDocument({
          margin: 0,
          size: "A4",
          info: {
            Title: this.book.personalized_content?.book_title || "Personalized Story Book",
            Author: this.book.child_name || "My Story Hat",
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

        this.expandedChapters = this.expandChapters();
        await this.generateContent();
        this.doc.end();
      } catch (error) {
        reject(error);
      }
    });
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
    const suggestedFont = this.book.personalized_content?.suggested_font || "Comic Sans MS";

    const fontMap = {
      "Comic Sans MS": "Helvetica",
      "KG Primary Penmanship": "Helvetica",
      "DK Crayon Crumble": "Helvetica",
      "OpenDyslexic": "Helvetica",
      "Sassoon Primary": "Helvetica",
      "Century Gothic": "Helvetica",
      "Verdana": "Helvetica",
      "Arial Rounded": "Helvetica",
      "Gill Sans": "Helvetica",
      "Trebuchet MS": "Helvetica",
      "Palatino": "Times-Roman",
      "Georgia": "Times-Roman",
      "Calibri": "Helvetica",
      "Cabin": "Helvetica",
      "Quicksand": "Helvetica",
      "Nunito": "Helvetica",
      "Times New Roman": "Times-Roman",
      "Garamond": "Times-Roman",
      "Baskerville": "Times-Roman",
      "Helvetica": "Helvetica",
      "Lato": "Helvetica",
      "Merriweather": "Times-Roman",
      "Roboto": "Helvetica",
      "Source Sans Pro": "Helvetica",
      "Papyrus": "Times-Roman",
      "Trajan Pro": "Times-Roman",
      "Uncial Antiqua": "Times-Roman",
      "Rockwell": "Times-Roman",
      "Copperplate": "Times-Roman",
      "Franklin Gothic": "Helvetica",
      "Orbitron": "Courier",
      "Eurostile": "Helvetica",
      "Bank Gothic": "Helvetica",
      "Courier New": "Courier",
      "American Typewriter": "Courier",
      "Marker Felt": "Helvetica",
      "Chalkboard": "Helvetica"
    };

    return fontMap[suggestedFont] || "Helvetica";
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

        const titleBoxHeight = 120;
        const titleBoxY = this.pageHeight - titleBoxHeight - 40;

        this.doc
          .rect(0, titleBoxY, this.pageWidth, titleBoxHeight)
          .fill("#ffffff");

        const title = this.book.personalized_content?.book_title || "My Story Book";
        const author = this.book.child_name;

        this.doc
          .font("Helvetica-Bold")
          .fontSize(32)
          .fillColor("#000000")
          .text(title, this.margins.left, titleBoxY + 20, {
            width: this.contentWidth,
            align: "center",
          });

        this.doc
          .font("Helvetica")
          .fontSize(18)
          .fillColor("#666666")
          .text(`by ${author}`, this.margins.left, titleBoxY + 70, {
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

    const centerY = this.pageHeight / 2 - 50;

    this.doc
      .font("Helvetica-Bold")
      .fontSize(32)
      .fillColor("#1f2937")
      .text(this.book.personalized_content?.book_title || "My Story Book", this.margins.left, centerY, {
        width: this.contentWidth,
        align: "center",
      })
      .moveDown(1);

    this.doc
      .font("Helvetica")
      .fontSize(16)
      .fillColor("#6b7280")
      .text(`by ${this.book.child_name}`, {
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

  addDedicationPage() {
    this.doc.addPage();
    this.doc.rect(0, 0, this.pageWidth, this.pageHeight).fill("#ffffff");

    this.doc
      .fillColor("#1f2937")
      .fontSize(28)
      .font("Helvetica-Bold")
      .text("To My Special Reader", {
        align: "center",
      })
      .moveDown(2);

    this.doc
      .fontSize(16)
      .font("Helvetica")
      .fillColor("#4b5563")
      .text(
        `This story was created especially for you, ${this.book.child_name}!`,
        {
          align: "center",
          width: this.contentWidth,
        },
      )
      .moveDown(1);

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
      .moveDown(3)
      .fontSize(14)
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

    switch (chapter.type) {
      case "image-only":
        await this.renderImageOnlyPage(chapter);
        break;
      case "text-only":
        await this.renderTextOnlyPage(chapter, fontFamily);
        break;
      default:
        await this.renderChapterWithImage(chapter, fontFamily);
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
          .fontSize(16)
          .fillColor("#666666")
          .text("Image not available", this.margins.left, this.margins.top + 100, {
            width: this.contentWidth,
            align: "center",
          });
      }
    }
  }

  async renderTextOnlyPage(chapter, fontFamily) {
    this.doc.rect(0, 0, this.pageWidth, this.pageHeight).fill("#ffffff");

    if (chapter.title) {
      this.doc
        .font(`${fontFamily}-Bold`)
        .fontSize(24)
        .fillColor("#000000")
        .text(chapter.title, this.margins.left, this.margins.top + 40, {
          width: this.contentWidth,
          align: "center",
        });
    }

    if (chapter.content) {
      const personalizedContent = this.personalizeContent(chapter.content);
      this.doc
        .font(fontFamily)
        .fontSize(14)
        .fillColor("#1f2937")
        .text(personalizedContent, this.margins.left, this.margins.top + (chapter.title ? 100 : 60), {
          width: this.contentWidth,
          height: this.contentHeight - (chapter.title ? 120 : 80),
          lineGap: 8,
          paragraphGap: 6,
          align: "justify"
        });
    }

    this.addDecorativeElements();
  }

  async renderChapterWithImage(chapter, fontFamily) {
    const imagePositionHandler = new ImagePositionHandler(
      this.doc,
      this.margins,
      this.pageWidth,
      this.pageHeight,
      this.contentWidth,
      this.contentHeight
    );

    // Render chapter title (centered, bold, black)
    if (chapter.chapter_title) {
      this.doc
        .font(`${fontFamily}-Bold`)
        .fontSize(24)
        .fillColor("#000000")
        .text(chapter.chapter_title, this.margins.left, this.margins.top + 20, {
          width: this.contentWidth,
          align: "center",
        });
    }

    if (chapter.image_url) {
      try {
        const imageBuffer = await this.downloadImage(chapter.image_url);
        const result = imagePositionHandler.handleImagePosition(chapter, imageBuffer);

        if (result.hasText && chapter.chapter_content) {
          const personalizedContent = this.personalizeContent(chapter.chapter_content);
          this.doc
            .font(fontFamily)
            .fontSize(12)
            .fillColor(result.textColor || "#1f2937")
            .text(personalizedContent, result.textX, result.textY, {
              width: result.textWidth,
              height: result.textHeight,
              lineGap: 6,
              align: "justify"
            });
        }
      } catch (error) {
        // Fallback: render text without image
        if (chapter.chapter_content) {
          const personalizedContent = this.personalizeContent(chapter.chapter_content);
          this.doc
            .font(fontFamily)
            .fontSize(12)
            .fillColor("#1f2937")
            .text(personalizedContent, this.margins.left, this.margins.top + 80, {
              width: this.contentWidth,
              height: this.contentHeight - 100,
              lineGap: 6,
              align: "justify"
            });
        }
      }
    } else {
      // No image, just render text
      if (chapter.chapter_content) {
        const personalizedContent = this.personalizeContent(chapter.chapter_content);
        this.doc
          .font(fontFamily)
          .fontSize(12)
          .fillColor("#1f2937")
          .text(personalizedContent, this.margins.left, this.margins.top + 80, {
            width: this.contentWidth,
            height: this.contentHeight - 100,
            lineGap: 6,
            align: "justify"
          });
      }
    }
  }

  generateEndPage() {
    this.doc.addPage();
    this.doc.rect(0, 0, this.pageWidth, this.pageHeight).fill("#ffffff");

    const centerY = this.pageHeight / 2 - 50;

    this.doc
      .font("Helvetica-Bold")
      .fontSize(32)
      .fillColor("#fb923c")
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

    this.addPageNumber(this.expandedChapters.length + 3);
  }

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

  addDecorativeElements() {
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
      .opacity(1);
  }

  async downloadImage(url) {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
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