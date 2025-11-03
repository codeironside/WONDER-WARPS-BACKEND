import {
  S3Client,
  HeadBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  CopyObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../../utils/config/index.js";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs/promises";
import stream from "stream";
import logger from "../../utils/logger/index.js";
import { promisify } from "util";

const pipeline = promisify(stream.pipeline);

class ComprehensiveFileUpload {
  constructor() {
    if (!this.validateAWSConfig()) {
      throw new Error("AWS S3 configuration is incomplete");
    }

    this.s3 = new S3Client({
      region: config.aws.region,
      credentials: {
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
      },
      maxAttempts: 3,
      requestTimeout: 30000,
    });

    this.bucketName = config.aws.s3Bucket;
    this.region = config.aws.region;

    this.initialize();
  }

  validateAWSConfig() {
    const required = ["accessKeyId", "secretAccessKey", "region", "s3Bucket"];
    return required.every((key) => config.aws[key]);
  }

  async initialize() {
    try {
      await this.testConnection();
      logger.info("S3 service initialized successfully");
    } catch (error) {
      logger.error("S3 service initialization failed:", error);
      throw error;
    }
  }

  async testConnection() {
    try {
      const command = new HeadBucketCommand({ Bucket: this.bucketName });
      await this.s3.send(command);
      return true;
    } catch (error) {
      logger.error("S3 connection test failed:", error);
      throw new Error(`S3 connection failed: ${error.message}`);
    }
  }

  generateFileKey(folder, originalName, prefix = "", useDateStructure = true) {
    const extension = path.extname(originalName).toLowerCase();
    const baseName = path.basename(originalName, extension);
    const cleanName = baseName.replace(/[^a-zA-Z0-9]/g, "-").substring(0, 100);
    const uniqueId = uuidv4().substring(0, 8);

    let keyPath = folder;

    if (useDateStructure) {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      keyPath += `/${year}/${month}/${day}`;
    }

    if (prefix) {
      keyPath += `/${prefix}-${cleanName}-${uniqueId}${extension}`;
    } else {
      keyPath += `/${cleanName}-${uniqueId}${extension}`;
    }
    return keyPath;
  }

  async uploadBuffer(buffer, key, contentType, metadata = {}, options = {}) {
    try {
      const uploadParams = {
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        Metadata: {
          originalUploadTime: new Date().toISOString(),
          ...metadata,
        },
        ACL: "public-read",
        CacheControl: options.cacheControl || "public, max-age=31536000",
      };

      const upload = new Upload({
        client: this.s3,
        params: uploadParams,
        queueSize: 4,
        partSize: 1024 * 1024 * 5,
      });

      if (options.onProgress) {
        upload.on("httpUploadProgress", (progress) => {
          if (progress.total) {
            const percentage = Math.round(
              (progress.loaded / progress.total) * 100,
            );
            options.onProgress(percentage, progress);
          }
        });
      }

      const uploadResult = await upload.done();

      logger.info(`File uploaded successfully: ${uploadResult.Location}`, {
        key,
        size: buffer.length,
        contentType,
      });

      return uploadResult.Location;
    } catch (error) {
      logger.error("S3 buffer upload failed:", { error: error.message, key });
      throw new Error(`S3 upload failed: ${error.message}`);
    }
  }

  async uploadFile(filePath, key, contentType = null, options = {}) {
    try {
      const fileStats = await fs.stat(filePath);
      if (!contentType) {
        const mime = (await import("mime-types")).default;
        contentType = mime.lookup(filePath) || "application/octet-stream";
      }

      const fileBuffer = await fs.readFile(filePath);
      return await this.uploadBuffer(
        fileBuffer,
        key,
        contentType,
        {
          originalPath: filePath,
          fileSize: fileStats.size.toString(),
        },
        options,
      );
    } catch (error) {
      logger.error("File upload failed:", error);
      throw new Error(`File upload failed: ${error.message}`);
    }
  }

  async uploadFromUrl(url, key, options = {}) {
    try {
      const fetch = (await import("node-fetch")).default;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch URL: ${response.statusText}`);
      }

      const buffer = await response.arrayBuffer();
      const contentType =
        response.headers.get("content-type") ||
        this.detectContentTypeFromUrl(url);

      return await this.uploadBuffer(
        Buffer.from(buffer),
        key,
        contentType,
        {
          sourceUrl: url,
          contentLength: buffer.length.toString(),
        },
        options,
      );
    } catch (error) {
      logger.error("URL upload failed:", error);
      throw new Error(`URL upload failed: ${error.message}`);
    }
  }

  async uploadStream(readStream, key, contentType, options = {}) {
    try {
      const uploadParams = {
        Bucket: this.bucketName,
        Key: key,
        Body: readStream,
        ContentType: contentType,
        ACL: "public-read",
        CacheControl: options.cacheControl || "public, max-age=31536000",
      };

      const upload = new Upload({
        client: this.s3,
        params: uploadParams,
      });

      if (options.onProgress) {
        upload.on("httpUploadProgress", (progress) => {
          options.onProgress(progress);
        });
      }

      const data = await upload.done();
      logger.info(`Stream uploaded successfully: ${data.Location}`);
      return data.Location;
    } catch (error) {
      logger.error("Stream upload failed:", error);
      throw new Error(`Stream upload failed: ${error.message}`);
    }
  }

  async uploadMultipleFiles(files, options = {}) {
    const uploadPromises = files.map((file, index) => {
      const key =
        file.key ||
        this.generateFileKey(
          file.folder || "uploads",
          file.originalName,
          file.prefix,
          file.useDateStructure !== false,
        );

      const uploadOptions = {
        onProgress: (progress) => {
          if (options.onFileProgress) {
            options.onFileProgress(index, progress);
          }
        },
        ...file.options,
      };

      if (file.buffer) {
        return this.uploadBuffer(
          file.buffer,
          key,
          file.contentType,
          file.metadata || {},
          uploadOptions,
        );
      } else if (file.filePath) {
        return this.uploadFile(
          file.filePath,
          key,
          file.contentType,
          uploadOptions,
        );
      } else {
        throw new Error("File must have either buffer or filePath");
      }
    });

    const results = await Promise.allSettled(uploadPromises);

    const uploadResults = results.map((result, index) => ({
      originalName: files[index].originalName,
      key: files[index].key,
      status: result.status,
      url: result.status === "fulfilled" ? result.value : null,
      error: result.status === "rejected" ? result.reason.message : null,
    }));

    const successfulUploads = uploadResults.filter(
      (r) => r.status === "fulfilled",
    );
    logger.info(
      `Batch upload completed: ${successfulUploads.length}/${files.length} successful`,
    );

    return uploadResults;
  }

  async generatePresignedUploadUrl(
    key,
    contentType,
    expiresIn = 3600,
    options = {},
  ) {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        ContentType: contentType,
        ACL: "public-read",
        CacheControl: options.cacheControl || "public, max-age=31536000",
      });

      const signedUrl = await getSignedUrl(this.s3, command, { expiresIn });
      logger.info(`Pre-signed upload URL generated for key: ${key}`);
      return signedUrl;
    } catch (error) {
      logger.error("Failed to generate pre-signed upload URL:", error);
      throw new Error(`Pre-signed URL generation failed: ${error.message}`);
    }
  }

  async generatePresignedDownloadUrl(key, expiresIn = 3600) {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const signedUrl = await getSignedUrl(this.s3, command, { expiresIn });
      logger.info(`Pre-signed download URL generated for key: ${key}`);
      return signedUrl;
    } catch (error) {
      logger.error("Failed to generate pre-signed download URL:", error);
      throw new Error(
        `Pre-signed download URL generation failed: ${error.message}`,
      );
    }
  }

  async deleteFile(key) {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      await this.s3.send(command);
      logger.info(`File deleted successfully: ${key}`);
      return true;
    } catch (error) {
      logger.error("Failed to delete file from S3:", error);
      throw new Error(`S3 delete failed: ${error.message}`);
    }
  }

  async deleteMultipleFiles(keys) {
    try {
      const deleteParams = {
        Bucket: this.bucketName,
        Delete: {
          Objects: keys.map((key) => ({ Key: key })),
          Quiet: false,
        },
      };
      const command = new DeleteObjectsCommand(deleteParams);
      const data = await this.s3.send(command);

      const successfulDeletes = data.Deleted || [];
      const errors = data.Errors || [];

      logger.info(
        `Batch delete completed: ${successfulDeletes.length}/${keys.length} successful`,
      );

      if (errors.length > 0) {
        logger.error("Errors encountered during batch delete:", errors);
      }

      return {
        deleted: successfulDeletes.map((d) => d.Key),
        errors: errors.map((e) => ({ key: e.Key, message: e.Message })),
      };
    } catch (error) {
      logger.error("Failed to delete multiple files from S3:", error);
      throw new Error(`Multiple files delete failed: ${error.message}`);
    }
  }

  async copyFile(sourceKey, destinationKey, options = {}) {
    try {
      const copyParams = {
        Bucket: this.bucketName,
        CopySource: `/${this.bucketName}/${encodeURIComponent(sourceKey)}`,
        Key: destinationKey,
        ACL: "public-read",
        MetadataDirective: options.replaceMetadata ? "REPLACE" : "COPY",
      };

      if (options.newMetadata) {
        copyParams.Metadata = options.newMetadata;
      }

      const command = new CopyObjectCommand(copyParams);
      await this.s3.send(command);
      const newUrl = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${destinationKey}`;

      logger.info(
        `File copied successfully from ${sourceKey} to ${destinationKey}`,
      );
      return newUrl;
    } catch (error) {
      logger.error("Failed to copy file in S3:", error);
      throw new Error(`S3 copy failed: ${error.message}`);
    }
  }

  async getFileMetadata(key) {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      const metadata = await this.s3.send(command);
      logger.info(`File metadata retrieved for key: ${key}`);
      return metadata;
    } catch (error) {
      logger.error("Failed to get file metadata from S3:", error);
      throw new Error(`S3 metadata retrieval failed: ${error.message}`);
    }
  }

  async listFiles(prefix = "", maxKeys = 1000, continuationToken = null) {
    try {
      const params = {
        Bucket: this.bucketName,
        Prefix: prefix,
        MaxKeys: maxKeys,
        ContinuationToken: continuationToken,
      };
      const command = new ListObjectsV2Command(params);
      const response = await this.s3.send(command);
      const files = response.Contents || [];

      const result = {
        files: files.map((file) => ({
          key: file.Key,
          size: file.Size,
          lastModified: file.LastModified,
          etag: file.ETag,
          url: `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${file.Key}`,
        })),
        isTruncated: !!response.IsTruncated,
        nextContinuationToken: response.NextContinuationToken,
        totalCount: response.KeyCount,
      };

      logger.info(`Listed ${files.length} files with prefix: ${prefix}`);
      return result;
    } catch (error) {
      logger.error("Failed to list files from S3:", error);
      throw new Error(`S3 list files failed: ${error.message}`);
    }
  }

  async downloadFile(key, localPath) {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      const response = await this.s3.send(command);
      // response.Body is a ReadableStream

      const writeStream = fs.createWriteStream(localPath);
      await pipeline(response.Body, writeStream);

      logger.info(`File downloaded successfully to: ${localPath}`);
      return localPath;
    } catch (error) {
      logger.error("Failed to download file from S3:", error);
      throw new Error(`S3 download failed: ${error.message}`);
    }
  }

  async fileExists(key) {
    try {
      await this.getFileMetadata(key);
      return true;
    } catch (error) {
      if (error.name === "NotFound") {
        return false;
      }
      throw error;
    }
  }

  async getFileSize(key) {
    try {
      const metadata = await this.getFileMetadata(key);
      return metadata.ContentLength;
    } catch (error) {
      logger.error("Failed to get file size from S3:", error);
      throw new Error(`File size retrieval failed: ${error.message}`);
    }
  }

  detectContentTypeFromUrl(url) {
    const extension = path.extname(url).toLowerCase();
    const typeMap = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
      ".pdf": "application/pdf",
      ".zip": "application/zip",
      ".mp4": "video/mp4",
      ".mp3": "audio/mpeg",
    };

    return typeMap[extension] || "application/octet-stream";
  }

  async cleanupTempFiles(prefix = "temp/", olderThanHours = 24) {
    try {
      let files = [];
      let continuationToken = null;

      do {
        const result = await this.listFiles(prefix, 1000, continuationToken);
        files = files.concat(result.files);
        continuationToken = result.nextContinuationToken;
      } while (continuationToken);

      const cutoffTime = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
      const filesToDelete = files.filter(
        (file) => new Date(file.lastModified) < cutoffTime,
      );

      const deleteResults = await this.deleteMultipleFiles(
        filesToDelete.map((file) => file.key),
      );

      logger.info(`Cleaned up ${filesToDelete.length} temporary files`);
      return deleteResults;
    } catch (error) {
      logger.error("Failed to cleanup temporary files:", error);
      throw new Error(`Cleanup failed: ${error.message}`);
    }
  }

  async getBucketStats() {
    try {
      const [objects, bucketSize] = await Promise.all([
        this.getObjectCount(),
        this.getBucketSize(),
      ]);

      return {
        objectCount: objects,
        totalSize: bucketSize,
        bucketName: this.bucketName,
        region: this.region,
      };
    } catch (error) {
      logger.error("Failed to get bucket stats:", error);
      throw new Error(`Bucket stats retrieval failed: ${error.message}`);
    }
  }

  async getObjectCount(prefix = "") {
    let count = 0;
    let continuationToken = null;

    do {
      const result = await this.listFiles(prefix, 1000, continuationToken);
      count += result.totalCount;
      continuationToken = result.nextContinuationToken;
    } while (continuationToken);

    return count;
  }

  async getBucketSize(prefix = "") {
    let totalSize = 0;
    let continuationToken = null;

    do {
      const result = await this.listFiles(prefix, 1000, continuationToken);
      totalSize += result.files.reduce((sum, file) => sum + file.size, 0);
      continuationToken = result.nextContinuationToken;
    } while (continuationToken);

    return totalSize;
  }
}

const fileUpload = new ComprehensiveFileUpload();

export default fileUpload;
