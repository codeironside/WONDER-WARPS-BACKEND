import AWS from "aws-sdk";
import { config } from "@/config";
import ErrorHandler from "@/Error";
import fetch from "node-fetch";
import stream from "stream";
import { promisify } from "util";

const pipeline = promisify(stream.pipeline);

class S3Service {
  constructor() {
    if (
      !config.aws ||
      !config.aws.accessKeyId ||
      !config.aws.secretAccessKey ||
      !config.aws.region ||
      !config.aws.s3Bucket
    ) {
      throw new ErrorHandler("AWS S3 configuration is incomplete", 500);
    }

    this.s3 = new AWS.S3({
      accessKeyId: config.aws.accessKeyId,
      secretAccessKey: config.aws.secretAccessKey,
      region: config.aws.region,
    });

    this.bucketName = config.aws.s3Bucket;
  }

  async uploadImageFromUrl(imageUrl, key) {
    try {
      // Fetch the image from the URL
      const response = await fetch(imageUrl);

      if (!response.ok) {
        throw new ErrorHandler(
          `Failed to fetch image from URL: ${imageUrl}`,
          500,
        );
      }

      // Get the image buffer
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Determine content type based on URL
      let contentType = "image/jpeg";
      if (imageUrl.includes(".png")) contentType = "image/png";
      if (imageUrl.includes(".gif")) contentType = "image/gif";
      if (imageUrl.includes(".webp")) contentType = "image/webp";

      // Upload to S3
      const uploadParams = {
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ACL: "public-read", // Make the image publicly accessible
      };

      const uploadResult = await this.s3.upload(uploadParams).promise();

      return uploadResult.Location; // Return the S3 URL
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler(
        `Failed to upload image to S3: ${error.message}`,
        500,
      );
    }
  }

  async uploadBuffer(buffer, key, contentType = "image/jpeg") {
    try {
      const uploadParams = {
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ACL: "public-read",
      };

      const uploadResult = await this.s3.upload(uploadParams).promise();
      return uploadResult.Location;
    } catch (error) {
      throw new ErrorHandler(
        `Failed to upload buffer to S3: ${error.message}`,
        500,
      );
    }
  }

  async deleteImage(key) {
    try {
      const deleteParams = {
        Bucket: this.bucketName,
        Key: key,
      };

      await this.s3.deleteObject(deleteParams).promise();
      return true;
    } catch (error) {
      throw new ErrorHandler(
        `Failed to delete image from S3: ${error.message}`,
        500,
      );
    }
  }

  generateImageKey(prefix, originalUrl) {
    const timestamp = Date.now();
    const extension = originalUrl.includes(".png")
      ? "png"
      : originalUrl.includes(".gif")
        ? "gif"
        : originalUrl.includes(".webp")
          ? "webp"
          : "jpg";

    return `${prefix}/${timestamp}-${Math.random().toString(36).substring(2, 9)}.${extension}`;
  }
}

export default S3Service;
