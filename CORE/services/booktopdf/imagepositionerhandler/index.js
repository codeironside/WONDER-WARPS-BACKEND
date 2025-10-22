// ImagePositionHandler.js
class ImagePositionHandler {
    constructor(doc, margins, pageWidth, pageHeight, contentWidth, contentHeight) {
        this.doc = doc;
        this.margins = margins;
        this.pageWidth = pageWidth;
        this.pageHeight = pageHeight;
        this.contentWidth = contentWidth;
        this.contentHeight = contentHeight;
    }

    fullScene(chapter, imageBuffer) {
        this.doc.image(imageBuffer, 0, 0, {
            width: this.pageWidth,
            height: this.pageHeight,
        });
        return { hasText: false };
    }

    characterFocus(chapter, imageBuffer) {
        this.doc
            .fillColor("#fef3c7")
            .rect(0, 0, this.pageWidth, this.pageHeight)
            .fill();

        const imageWidth = this.contentWidth;
        const imageHeight = 300;
        const imageX = this.margins.left;
        const imageY = this.margins.top + 60;

        this.doc
            .rect(imageX - 5, imageY - 5, imageWidth + 10, imageHeight + 10)
            .fill("#ffffff")
            .stroke("#e5e5e5");

        this.doc.image(imageBuffer, imageX, imageY, {
            width: imageWidth,
            height: imageHeight,
        });

        return {
            hasText: true,
            textX: this.margins.left + 10,
            textY: imageY + imageHeight + 30,
            textWidth: this.contentWidth - 20,
            textHeight: this.pageHeight - (imageY + imageHeight + 60)
        };
    }

    actionSpotlight(chapter, imageBuffer) {
        this.doc
            .fillColor("#1e293b")
            .rect(0, 0, this.pageWidth, this.pageHeight)
            .fill();

        const imageWidth = this.contentWidth;
        const imageHeight = 250;
        const imageX = this.margins.left;
        const imageY = this.margins.top + 60;

        this.doc
            .fillColor("#f59e0b")
            .opacity(0.3)
            .rect(imageX - 3, imageY - 3, imageWidth + 6, imageHeight + 6)
            .fill()
            .opacity(1);

        this.doc.image(imageBuffer, imageX, imageY, {
            width: imageWidth,
            height: imageHeight,
        });

        return {
            hasText: true,
            textX: this.margins.left + 10,
            textY: imageY + imageHeight + 30,
            textWidth: this.contentWidth - 20,
            textHeight: this.pageHeight - (imageY + imageHeight + 60),
            textColor: "#f1f5f9"
        };
    }

    topThird(chapter, imageBuffer) {
        const imageHeight = this.contentHeight * 0.33;
        this.doc.image(imageBuffer, this.margins.left, this.margins.top, {
            width: this.contentWidth,
            height: imageHeight,
        });

        return {
            hasText: true,
            textX: this.margins.left,
            textY: this.margins.top + imageHeight + 30,
            textWidth: this.contentWidth,
            textHeight: this.contentHeight - imageHeight - 30
        };
    }

    bottomThird(chapter, imageBuffer) {
        const imageHeight = this.contentHeight * 0.33;
        const imageY = this.pageHeight - this.margins.bottom - imageHeight;

        this.doc.image(imageBuffer, this.margins.left, imageY, {
            width: this.contentWidth,
            height: imageHeight,
        });

        return {
            hasText: true,
            textX: this.margins.left,
            textY: this.margins.top,
            textWidth: this.contentWidth,
            textHeight: this.contentHeight - imageHeight - 30
        };
    }

    leftPanel(chapter, imageBuffer) {
        const imageWidth = this.contentWidth * 0.4;
        const imageHeight = this.contentHeight * 0.7;
        const imageX = this.margins.left;
        const imageY = this.margins.top + 60;

        this.doc.image(imageBuffer, imageX, imageY, {
            width: imageWidth,
            height: imageHeight,
        });

        return {
            hasText: true,
            textX: imageX + imageWidth + 20,
            textY: imageY,
            textWidth: this.contentWidth - imageWidth - 20,
            textHeight: imageHeight
        };
    }

    rightPanel(chapter, imageBuffer) {
        const imageWidth = this.contentWidth * 0.4;
        const imageHeight = this.contentHeight * 0.7;
        const imageX = this.margins.left + this.contentWidth - imageWidth;
        const imageY = this.margins.top + 60;

        this.doc.image(imageBuffer, imageX, imageY, {
            width: imageWidth,
            height: imageHeight,
        });

        return {
            hasText: true,
            textX: this.margins.left,
            textY: imageY,
            textWidth: this.contentWidth - imageWidth - 20,
            textHeight: imageHeight
        };
    }

    backgroundLayered(chapter, imageBuffer) {
        this.doc.image(imageBuffer, 0, 0, {
            width: this.pageWidth,
            height: this.pageHeight,
        });

        this.doc
            .fillColor("black")
            .opacity(0.4)
            .rect(0, 0, this.pageWidth, this.pageHeight)
            .fill()
            .opacity(1);

        return {
            hasText: true,
            textX: this.margins.left,
            textY: this.margins.top + 100,
            textWidth: this.contentWidth,
            textHeight: this.contentHeight - 100,
            textColor: "#ffffff"
        };
    }

    textWrap(chapter, imageBuffer) {
        const imageSize = 150;
        const imageX = this.margins.left;
        const imageY = this.margins.top + 60;

        this.doc.image(imageBuffer, imageX, imageY, {
            width: imageSize,
            height: imageSize,
        });

        return {
            hasText: true,
            textX: this.margins.left,
            textY: imageY + imageSize + 30,
            textWidth: this.contentWidth,
            textHeight: this.contentHeight - (imageSize + 90)
        };
    }

    circularFrame(chapter, imageBuffer) {
        const imageSize = 250;
        const centerX = this.pageWidth / 2;
        const centerY = this.margins.top + 150;

        // Create circular mask effect
        this.doc
            .save()
            .circle(centerX, centerY, imageSize / 2)
            .clip();

        this.doc.image(imageBuffer, centerX - imageSize / 2, centerY - imageSize / 2, {
            width: imageSize,
            height: imageSize,
        });

        this.doc.restore();

        return {
            hasText: true,
            textX: this.margins.left,
            textY: centerY + imageSize / 2 + 50,
            textWidth: this.contentWidth,
            textHeight: this.pageHeight - (centerY + imageSize / 2 + 80)
        };
    }

    sideBar(chapter, imageBuffer) {
        const imageWidth = this.contentWidth * 0.3;
        const imageHeight = this.contentHeight;
        const imageX = this.margins.left;
        const imageY = this.margins.top;

        this.doc.image(imageBuffer, imageX, imageY, {
            width: imageWidth,
            height: imageHeight,
        });

        return {
            hasText: true,
            textX: imageX + imageWidth + 20,
            textY: imageY,
            textWidth: this.contentWidth - imageWidth - 20,
            textHeight: imageHeight
        };
    }

    cornerAccent(chapter, imageBuffer) {
        const imageSize = 120;
        const imageX = this.pageWidth - this.margins.right - imageSize;
        const imageY = this.margins.top;

        this.doc.image(imageBuffer, imageX, imageY, {
            width: imageSize,
            height: imageSize,
        });

        return {
            hasText: true,
            textX: this.margins.left,
            textY: this.margins.top + imageSize + 30,
            textWidth: this.contentWidth,
            textHeight: this.contentHeight - imageSize - 60
        };
    }

    headerBanner(chapter, imageBuffer) {
        const imageHeight = 150;
        this.doc.image(imageBuffer, 0, 0, {
            width: this.pageWidth,
            height: imageHeight,
        });

        return {
            hasText: true,
            textX: this.margins.left,
            textY: imageHeight + 30,
            textWidth: this.contentWidth,
            textHeight: this.pageHeight - imageHeight - 60
        };
    }

    // Default fallback position
    standard(chapter, imageBuffer) {
        const imageHeight = 200;
        const imageY = this.margins.top + 60;

        this.doc.image(imageBuffer, this.margins.left, imageY, {
            width: this.contentWidth,
            height: imageHeight,
        });

        return {
            hasText: true,
            textX: this.margins.left,
            textY: imageY + imageHeight + 30,
            textWidth: this.contentWidth,
            textHeight: this.pageHeight - (imageY + imageHeight + 60)
        };
    }

    // Method to handle any image position
    handleImagePosition(chapter, imageBuffer) {
        const position = chapter.image_position || "standard";

        // Convert position to method name (e.g., "full scene" -> "fullScene")
        const methodName = position.toLowerCase().replace(/\s+(.)/g, (_, char) => char.toUpperCase());

        if (this[methodName] && typeof this[methodName] === 'function') {
            return this[methodName](chapter, imageBuffer);
        } else {
            // Fallback to standard position
            return this.standard(chapter, imageBuffer);
        }
    }
}

export default ImagePositionHandler;