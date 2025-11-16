import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "@/config";
import ErrorHandler from "@/Error";
import fetch from "node-fetch";

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

    this.s3 = new S3Client({
      region: config.aws.region,
      credentials: {
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
      },
      maxAttempts: 3,
    });

    this.bucketName = config.aws.s3Bucket;
  }

  // NEW METHOD: Upload base64 image
  async uploadBase64Image(base64Data, key, contentType = "image/jpeg") {
    try {
      console.log(`Uploading base64 image with key: ${key}`);

      // Remove data URL prefix if present (e.g., "data:image/png;base64,")
      const base64String = base64Data.replace(/^data:image\/\w+;base64,/, '');

      // Convert base64 to buffer
      const buffer = Buffer.from(base64String, 'base64');

      console.log(`Base64 image buffer size: ${buffer.length} bytes`);

      const uploadParams = {
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ACL: "public-read",
        Metadata: {
          "upload-method": "base64",
          "upload-timestamp": Date.now().toString(),
        },
      };

      const upload = new Upload({
        client: this.s3,
        params: uploadParams,
      });

      const uploadResult = await upload.done();
      console.log(`Base64 image uploaded successfully to: ${uploadResult.Location}`);

      return uploadResult.Location;
    } catch (error) {
      console.error("Error uploading base64 image:", error);
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler(
        `Failed to upload base64 image to S3: ${error.message}`,
        500,
      );
    }
  }

  // ALIAS METHOD: uploadImage (for backward compatibility)
  async uploadImage(buffer, key, contentType = "image/jpeg") {
    return this.uploadBuffer(buffer, key, contentType);
  }

  async uploadImageFromUrl(imageUrl, key) {
    try {
      const response = await fetch(imageUrl);

      if (!response.ok) {
        throw new ErrorHandler(
          `Failed to fetch image from URL: ${imageUrl}`,
          500,
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      let contentType = "image/jpeg";
      if (imageUrl.includes(".png")) contentType = "image/png";
      if (imageUrl.includes(".gif")) contentType = "image/gif";
      if (imageUrl.includes(".webp")) contentType = "image/webp";

      return await this.uploadBuffer(buffer, key, contentType);
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler(
        `Failed to upload image to S3: ${error.message}`,
        500,
      );
    }
  }

  async uploadVideoFromUrl(videoUrl, key) {
    try {
      console.log(`Uploading video from URL: ${videoUrl}`);
      const response = await fetch(videoUrl);

      if (!response.ok) {
        throw new ErrorHandler(
          `Failed to fetch video from URL: ${videoUrl}. Status: ${response.status}`,
          500,
        );
      }

      const contentType =
        response.headers.get("content-type") ||
        this.getVideoContentType(videoUrl);

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      console.log(`Video buffer size: ${buffer.length} bytes`);

      const uploadParams = {
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ACL: "public-read",
        Metadata: {
          "source-url": videoUrl,
          "upload-timestamp": Date.now().toString(),
        },
      };

      const upload = new Upload({
        client: this.s3,
        params: uploadParams,
      });

      const uploadResult = await upload.done();
      console.log(`Video uploaded successfully to: ${uploadResult.Location}`);

      return uploadResult.Location;
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler(
        `Failed to upload video to S3: ${error.message}`,
        500,
      );
    }
  }

  async uploadVideoStream(readableStream, key, contentType = "video/mp4") {
    try {
      console.log(`Starting stream upload for video: ${key}`);

      const uploadParams = {
        Bucket: this.bucketName,
        Key: key,
        Body: readableStream,
        ContentType: contentType,
        ACL: "public-read",
        Metadata: {
          "upload-method": "stream",
          "upload-timestamp": Date.now().toString(),
        },
      };

      const upload = new Upload({
        client: this.s3,
        params: uploadParams,
      });

      const uploadResult = await upload.done();
      console.log(
        `Video stream uploaded successfully to: ${uploadResult.Location}`,
      );

      return uploadResult.Location;
    } catch (error) {
      throw new ErrorHandler(
        `Failed to upload video stream to S3: ${error.message}`,
        500,
      );
    }
  }

  getVideoContentType(videoUrl) {
    if (videoUrl.includes(".mp4")) return "video/mp4";
    if (videoUrl.includes(".mov")) return "video/quicktime";
    if (videoUrl.includes(".avi")) return "video/x-msvideo";
    if (videoUrl.includes(".webm")) return "video/webm";
    if (videoUrl.includes(".mkv")) return "video/x-matroska";
    return "video/mp4";
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

      const upload = new Upload({
        client: this.s3,
        params: uploadParams,
      });

      const uploadResult = await upload.done();
      return uploadResult.Location;
    } catch (error) {
      throw new ErrorHandler(
        `Failed to upload buffer to S3: ${error.message}`,
        500,
      );
    }
  }

  async deleteObject(key) {
    try {
      const deleteParams = {
        Bucket: this.bucketName,
        Key: key,
      };

      const command = new DeleteObjectCommand(deleteParams);
      await this.s3.send(command);
      return true;
    } catch (error) {
      throw new ErrorHandler(
        `Failed to delete object from S3: ${error.message}`,
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

  // NEW METHOD: Generate image key for base64 uploads
  generateBase64ImageKey(prefix, extension = "jpg") {
    const timestamp = Date.now();
    return `${prefix}/${timestamp}-${Math.random().toString(36).substring(2, 9)}.${extension}`;
  }

  generateVideoKey(prefix, originalUrl) {
    const timestamp = Date.now();
    const extension = originalUrl.includes(".mp4")
      ? "mp4"
      : originalUrl.includes(".mov")
        ? "mov"
        : originalUrl.includes(".avi")
          ? "avi"
          : originalUrl.includes(".webm")
            ? "webm"
            : "mp4";

    return `${prefix}/videos/${timestamp}-${Math.random().toString(36).substring(2, 9)}.${extension}`;
  }

  async getObjectMetadata(key) {
    try {
      const params = {
        Bucket: this.bucketName,
        Key: key,
      };

      const command = new HeadObjectCommand(params);
      const metadata = await this.s3.send(command);
      return metadata;
    } catch (error) {
      throw new ErrorHandler(
        `Failed to get object metadata: ${error.message}`,
        500,
      );
    }
  }

  async generatePresignedUrl(key, expiresIn = 3600) {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const url = await getSignedUrl(this.s3, command, { expiresIn });
      return url;
    } catch (error) {
      throw new ErrorHandler(
        `Failed to generate presigned URL: ${error.message}`,
        500,
      );
    }
  }

  async checkObjectExists(key) {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      await this.s3.send(command);
      return true;
    } catch (error) {
      if (error.name === "NotFound") {
        return false;
      }
      throw error;
    }
  }

  async deleteImage(key) {
    try {
      const result = await this.deleteObject(key);

      console.log(`Successfully deleted image from S3: ${key}`);
      return {
        success: true,
        deletedKey: key,
        result: result,
      };
    } catch (error) {
      console.error(`Error deleting image ${key} from S3:`, error);
      throw new Error(`Failed to delete image from S3: ${error.message}`);
    }
  }
}

export default S3Service;