import PDFDocument from "pdfkit";
import axios from "axios";
import stream from "stream";

class BookToPDF {
  constructor(bookData) {
    this.book = bookData;
    this.doc = null;
    this.margins = {
      top: 60,
      bottom: 60,
      left: 50,
      right: 50,
    };

    // Image position configurations
    this.IMAGE_POSITIONS = {
      YOUNGER_CHILD: [
        "full scene",
        "character focus",
        "action spotlight",
        "top third",
        "bottom third",
        "diagonal spread",
        "circular frame",
        "speech bubble",
      ],

      MIDDLE_CHILD: [
        "left panel",
        "right panel",
        "background layered",
        "floating elements",
        "comic strip",
        "map integration",
        "cutaway view",
        "split screen",
      ],

      OLDER_CHILD: [
        "text wrap",
        "border integrated",
        "corner accent",
        "header banner",
        "footer illustration",
        "side bar",
        "watermark style",
        "interactive element",
      ],
    };
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
            Title:
              this.book.personalized_content?.book_title ||
              "Personalized Story Book",
            Author: this.book.personalized_content?.author || "My Story Hat",
            Subject: `Personalized story for ${this.book.child_name}`,
            Keywords: `personalized, children, story, ${this.book.child_name}, ${this.book.personalized_content?.genre}`,
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

        // Set up fonts
        await this.setupFonts();

        // Generate PDF content
        await this.generateContent();

        this.doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Set up fonts based on suggested font
   */
  async setupFonts() {
    const suggestedFont =
      this.book.personalized_content?.suggested_font || "Comic Sans MS";

    // Map suggested fonts to PDFKit supported fonts or register custom fonts
    const fontMap = {
      "Comic Sans MS": "Helvetica",
      Arial: "Helvetica",
      "Times New Roman": "Times-Roman",
      "Courier New": "Courier",
      Helvetica: "Helvetica",
      Verdana: "Helvetica",
    };

    this.fonts = {
      title: fontMap[suggestedFont] || "Helvetica",
      body: fontMap[suggestedFont] || "Helvetica",
      emphasis: "Helvetica-Bold",
    };
  }

  /**
   * Generate all PDF content
   */
  async generateContent() {
    // Cover page
    await this.addCoverPage();

    // Dedication page
    this.addDedicationPage();

    // Table of contents if multiple chapters
    if (this.book.personalized_content?.chapters?.length > 3) {
      this.addTableOfContents();
    }

    // Chapters
    await this.addChapters();

    // About the author page
    this.addAuthorPage();
  }
  async addCoverPage() {
    const coverImage = this.book.personalized_content?.cover_image?.[0];

    // Background color
    this.doc
      .rect(0, 0, this.doc.page.width, this.doc.page.height)
      .fill("#fef7ed");

    // Add cover image if available
    if (coverImage) {
      try {
        const imageBuffer = await this.downloadImage(coverImage);
        this.doc.image(imageBuffer, 0, 0, {
          width: this.doc.page.width,
          height: this.doc.page.height,
        });
      } catch (error) {
        console.warn("Could not load cover image:", error.message);
      }
    }

    // Calculate vertical center position
    const pageCenterY = this.doc.page.height / 2 - 100;

    // Add book title (centered, larger font)
    this.doc
      .fillColor("#1f2937")
      .fontSize(36)
      .font(this.fonts.title)
      .text(this.book.personalized_content?.book_title || "My Story Book", {
        align: "center",
        width: this.doc.page.width - 100,
        lineGap: 10,
      })
      .moveDown(1);

    // Add author line (centered, smaller font)
    const authorName = this.book.personalized_content?.author || "My Story Hat";
    this.doc
      .fontSize(18)
      .fillColor("#6b7280")
      .text(`by ${authorName}`, {
        align: "center",
      })
      .moveDown(3);

    // Add child dedication below
    this.doc
      .fontSize(20)
      .fillColor("#f97316")
      .text(`For ${this.book.child_name}`, {
        align: "center",
      });

    if (this.book.child_age) {
      this.doc
        .moveDown(0.5)
        .fontSize(16)
        .fillColor("#6b7280")
        .text(`Age ${this.book.child_age}`, {
          align: "center",
        });
    }

    // Add footer note at the bottom
    const bottomY = this.doc.page.height - 60;
    this.doc
      .fontSize(12)
      .fillColor("#9ca3af")
      .text("Created with ❤️ by My Story Hat", 0, bottomY, {
        align: "center",
      });

    this.doc.addPage();
  }

  /**
   * Add dedication page
   */
  addDedicationPage() {
    this.doc
      .fillColor("#1f2937")
      .fontSize(28)
      .font(this.fonts.title)
      .text("To My Special Reader", {
        align: "center",
      })
      .moveDown(2);

    this.doc
      .fontSize(16)
      .font(this.fonts.body)
      .fillColor("#4b5563")
      .text(
        `This story was created especially for you, ${this.book.child_name}!`,
        {
          align: "center",
          width: this.doc.page.width - 100,
        },
      )
      .moveDown(1);

    if (this.book.child_age) {
      this.doc.text(
        `You are ${this.book.child_age} years old, and this is your very own adventure.`,
        {
          align: "center",
          width: this.doc.page.width - 100,
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
          width: this.doc.page.width - 100,
        },
      );

    this.doc.addPage();
  }

  /**
   * Add table of contents
   */
  addTableOfContents() {
    this.doc
      .fillColor("#1f2937")
      .fontSize(24)
      .font(this.fonts.title)
      .text("Table of Contents", {
        align: "center",
      })
      .moveDown(2);

    const chapters = this.book.personalized_content?.chapters || [];
    let yPosition = 150;

    chapters.forEach((chapter, index) => {
      this.doc
        .fontSize(14)
        .font(this.fonts.body)
        .fillColor("#374151")
        .text(`Chapter ${index + 1}: ${chapter.chapter_title}`, 100, yPosition)
        .fillColor("#9ca3af")
        .text(`...${index + 1}`, this.doc.page.width - 100, yPosition, {
          align: "right",
        });

      yPosition += 30;
    });

    this.doc.addPage();
  }

  /**
   * Add all chapters with images
   */
  async addChapters() {
    const chapters = this.book.personalized_content?.chapters || [];

    for (let i = 0; i < chapters.length; i++) {
      await this.addChapter(chapters[i], i);

      // Add page break between chapters, but not after the last one
      if (i < chapters.length - 1) {
        this.doc.addPage();
      }
    }
  }

  /**
   * Add a single chapter with image
   */
  async addChapter(chapter, chapterIndex) {
    const ageGroup = this.getAgeGroup(this.book.child_age);
    const imagePosition = chapter.image_position || "full scene";

    // Chapter header
    this.doc
      .fillColor("#1f2937")
      .fontSize(20)
      .font(this.fonts.title)
      .text(`Chapter ${chapterIndex + 1}`, {
        align: "center",
      })
      .moveDown(0.5);

    this.doc
      .fontSize(18)
      .text(chapter.chapter_title, {
        align: "center",
      })
      .moveDown(1.5);

    // Handle image and content based on position
    await this.handleImageAndContent(chapter, ageGroup, imagePosition);

    // Add page number
    this.addPageNumber();
  }

  /**
   * Handle image and content layout based on position
   */
  async handleImageAndContent(chapter, ageGroup, imagePosition) {
    const hasImage = chapter.image_url;
    let imageBuffer = null;

    // Download image if available
    if (hasImage) {
      try {
        imageBuffer = await this.downloadImage(chapter.image_url);
      } catch (error) {
        console.warn(`Could not load image for chapter: ${error.message}`);
        hasImage = false;
      }
    }

    // Process content with child name replacement
    let content = chapter.chapter_content || "";
    content = this.personalizeContent(content);

    // Apply different layouts based on image position
    switch (imagePosition) {
      case "full scene":
        await this.fullSceneLayout(content, imageBuffer);
        break;
      case "character focus":
        await this.characterFocusLayout(content, imageBuffer);
        break;
      case "top third":
        await this.topThirdLayout(content, imageBuffer);
        break;
      case "bottom third":
        await this.bottomThirdLayout(content, imageBuffer);
        break;
      case "left panel":
        await this.leftPanelLayout(content, imageBuffer);
        break;
      case "right panel":
        await this.rightPanelLayout(content, imageBuffer);
        break;
      case "text wrap":
        await this.textWrapLayout(content, imageBuffer);
        break;
      case "side bar":
        await this.sideBarLayout(content, imageBuffer);
        break;
      default:
        await this.defaultLayout(content, imageBuffer);
    }
  }

  /**
   * Full scene layout - image takes most of the page
   */
  async fullSceneLayout(content, imageBuffer) {
    if (imageBuffer) {
      // Image takes 70% of page height
      const imageHeight = this.doc.page.height * 0.7;
      this.doc.image(imageBuffer, 50, 150, {
        width: this.doc.page.width - 100,
        height: imageHeight,
      });

      // Text below image
      this.doc
        .fontSize(12)
        .font(this.fonts.body)
        .fillColor("#374151")
        .text(content, 50, 150 + imageHeight + 30, {
          width: this.doc.page.width - 100,
          lineGap: 4,
        });
    } else {
      this.doc
        .fontSize(12)
        .font(this.fonts.body)
        .fillColor("#374151")
        .text(content, 50, 150, {
          width: this.doc.page.width - 100,
          lineGap: 4,
        });
    }
  }

  /**
   * Character focus layout - image on left, text on right
   */
  async characterFocusLayout(content, imageBuffer) {
    const textStartY = 150;

    if (imageBuffer) {
      const imageWidth = (this.doc.page.width - 100) * 0.4;
      this.doc.image(imageBuffer, 50, textStartY, {
        width: imageWidth,
        height: this.doc.page.height - textStartY - 100,
      });

      this.doc
        .fontSize(12)
        .font(this.fonts.body)
        .fillColor("#374151")
        .text(content, 50 + imageWidth + 20, textStartY, {
          width: this.doc.page.width - (50 + imageWidth + 20) - 50,
          lineGap: 4,
        });
    } else {
      this.defaultLayout(content, null);
    }
  }

  /**
   * Top third layout - image on top third
   */
  async topThirdLayout(content, imageBuffer) {
    const topThirdHeight = this.doc.page.height * 0.33;

    if (imageBuffer) {
      this.doc.image(imageBuffer, 50, 150, {
        width: this.doc.page.width - 100,
        height: topThirdHeight - 50,
      });
    }

    this.doc
      .fontSize(12)
      .font(this.fonts.body)
      .fillColor("#374151")
      .text(content, 50, 150 + topThirdHeight, {
        width: this.doc.page.width - 100,
        lineGap: 4,
      });
  }

  /**
   * Bottom third layout - image on bottom third
   */
  async bottomThirdLayout(content, imageBuffer) {
    const bottomThirdStart = this.doc.page.height * 0.66;
    const contentHeight = bottomThirdStart - 200;

    this.doc
      .fontSize(12)
      .font(this.fonts.body)
      .fillColor("#374151")
      .text(content, 50, 150, {
        width: this.doc.page.width - 100,
        height: contentHeight,
        lineGap: 4,
      });

    if (imageBuffer) {
      this.doc.image(imageBuffer, 50, bottomThirdStart, {
        width: this.doc.page.width - 100,
        height: this.doc.page.height - bottomThirdStart - 50,
      });
    }
  }

  /**
   * Left panel layout
   */
  async leftPanelLayout(content, imageBuffer) {
    await this.characterFocusLayout(content, imageBuffer); // Similar layout
  }

  /**
   * Right panel layout
   */
  async rightPanelLayout(content, imageBuffer) {
    const textStartY = 150;

    if (imageBuffer) {
      const imageWidth = (this.doc.page.width - 100) * 0.4;
      const textWidth = imageWidth;

      this.doc
        .fontSize(12)
        .font(this.fonts.body)
        .fillColor("#374151")
        .text(content, 50, textStartY, {
          width: textWidth,
          lineGap: 4,
        });

      this.doc.image(imageBuffer, 50 + textWidth + 20, textStartY, {
        width: imageWidth,
        height: this.doc.page.height - textStartY - 100,
      });
    } else {
      this.defaultLayout(content, null);
    }
  }

  /**
   * Text wrap layout - image with text wrapped around
   */
  async textWrapLayout(content, imageBuffer) {
    if (imageBuffer) {
      const imageSize = 150;
      this.doc.image(imageBuffer, 50, 150, {
        width: imageSize,
        height: imageSize,
      });

      // Simple text wrapping - PDFKit doesn't support true text wrapping
      this.doc
        .fontSize(12)
        .font(this.fonts.body)
        .fillColor("#374151")
        .text(content, 50, 150 + imageSize + 20, {
          width: this.doc.page.width - 100,
          lineGap: 4,
        });
    } else {
      this.defaultLayout(content, null);
    }
  }

  /**
   * Side bar layout
   */
  async sideBarLayout(content, imageBuffer) {
    await this.characterFocusLayout(content, imageBuffer); // Similar layout
  }

  /**
   * Default layout
   */
  async defaultLayout(content, imageBuffer) {
    await this.fullSceneLayout(content, imageBuffer);
  }

  /**
   * Add author page
   */
  addAuthorPage() {
    this.doc.addPage();

    this.doc
      .fillColor("#1f2937")
      .fontSize(24)
      .font(this.fonts.title)
      .text("About This Book", {
        align: "center",
      })
      .moveDown(2);

    this.doc
      .fontSize(14)
      .font(this.fonts.body)
      .fillColor("#374151")
      .text(
        `This personalized story book was created especially for ${this.book.child_name}.`,
        {
          width: this.doc.page.width - 100,
          lineGap: 8,
        },
      )
      .moveDown(1);

    if (this.book.personalized_content?.author) {
      this.doc.text(`Author: ${this.book.personalized_content.author}`, {
        width: this.doc.page.width - 100,
      });
    }

    if (this.book.personalized_content?.genre) {
      this.doc.text(`Genre: ${this.book.personalized_content.genre}`, {
        width: this.doc.page.width - 100,
      });
    }

    this.doc
      .moveDown(2)
      .text("Thank you for choosing My Story Hat!", {
        width: this.doc.page.width - 100,
      })
      .moveDown(1)
      .fontSize(12)
      .fillColor("#6b7280")
      .text(`Generated on ${new Date().toLocaleDateString()}`, {
        width: this.doc.page.width - 100,
      });
  }

  /**
   * Add page number to current page
   */
  addPageNumber() {
    const bottom = this.doc.page.height - 40;

    this.doc
      .fontSize(10)
      .fillColor("#9ca3af")
      .text(`Page ${this.doc.page.number}`, 50, bottom, {
        align: "center",
        width: this.doc.page.width - 100,
      });
  }

  /**
   * Download image from URL
   */
  async downloadImage(url) {
    try {
      const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: 10000,
      });

      return Buffer.from(response.data, "binary");
    } catch (error) {
      throw new Error(`Failed to download image: ${error.message}`);
    }
  }

  /**
   * Personalize content with child's name
   */
  personalizeContent(content) {
    if (!content || !this.book.child_name) return content;

    // Replace various name placeholders
    return content
      .replace(/\[child's name\]/gi, this.book.child_name)
      .replace(/\[Child's Name\]/gi, this.book.child_name)
      .replace(/\[child_name\]/gi, this.book.child_name)
      .replace(/\[Child Name\]/gi, this.book.child_name)
      .replace(/\[name\]/gi, this.book.child_name);
  }

  /**
   * Determine age group for image positioning
   */
  getAgeGroup(age) {
    if (age <= 7) return "YOUNGER_CHILD";
    if (age <= 12) return "MIDDLE_CHILD";
    return "OLDER_CHILD";
  }

  /**
   * Stream PDF generation (for large files)
   */
  async generatePDFStream() {
    this.doc = new PDFDocument({
      margin: 0,
      size: "A4",
      info: {
        Title:
          this.book.personalized_content?.book_title ||
          "Personalized Story Book",
        Author: this.book.personalized_content?.author || "My Story Hat",
        Subject: `Personalized story for ${this.book.child_name}`,
        Creator: "My Story Hat",
      },
    });

    await this.setupFonts();
    return this.doc;
  }
}

export default BookToPDF;
