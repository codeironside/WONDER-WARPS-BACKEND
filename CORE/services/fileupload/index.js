import AWS from "aws-sdk";
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

    // Configure AWS SDK v2
    AWS.config.update({
      accessKeyId: config.aws.accessKeyId,
      secretAccessKey: config.aws.secretAccessKey,
      region: config.aws.region,
      maxRetries: 3,
      retryDelayOptions: { base: 300 },
    });

    this.s3 = new AWS.S3({
      apiVersion: "2006-03-01",
      signatureVersion: "v4",
      httpOptions: {
        timeout: 30000,
        connectTimeout: 5000,
      },
    });

    this.bucketName = config.aws.s3Bucket;
    this.region = config.aws.region;

    // Initialize with connection test
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
      await this.s3.headBucket({ Bucket: this.bucketName }).promise();
      return true;
    } catch (error) {
      logger.error("S3 connection test failed:", error);
      throw new Error(`S3 connection failed: ${error.message}`);
    }
  }

  /**
   * Generate optimized file key with folder structure
   */
  generateFileKey(folder, originalName, prefix = "", useDateStructure = true) {
    const extension = path.extname(originalName).toLowerCase();
    const baseName = path.basename(originalName, extension);

    // Clean filename
    const cleanName = baseName.replace(/[^a-zA-Z0-9]/g, "-").substring(0, 100);
    const uniqueId = uuidv4().substring(0, 8);

    let keyPath = folder;

    // Add date-based structure for better organization
    if (useDateStructure) {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      keyPath += `/${year}/${month}/${day}`;
    }

    // Add prefix if provided
    if (prefix) {
      keyPath += `/${prefix}-${cleanName}-${uniqueId}${extension}`;
    } else {
      keyPath += `/${cleanName}-${uniqueId}${extension}`;
    }

    return keyPath;
  }

  /**
   * Upload file buffer to S3 with comprehensive options
   */
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
        ContentDisposition: options.contentDisposition,
        ContentEncoding: options.contentEncoding,
        ServerSideEncryption: options.encryption ? "AES256" : undefined,
        StorageClass: options.storageClass || "STANDARD",
      };

      // Add upload progress tracking for large files
      if (options.onProgress && buffer.length > 1024 * 1024) {
        return await this.uploadWithProgress(uploadParams, options.onProgress);
      }

      const uploadResult = await this.s3.upload(uploadParams).promise();

      logger.info(`File uploaded successfully: ${uploadResult.Location}`, {
        key,
        size: buffer.length,
        contentType,
        bucket: this.bucketName,
      });

      return uploadResult.Location;
    } catch (error) {
      logger.error("S3 buffer upload failed:", {
        error: error.message,
        key,
        bucket: this.bucketName,
        stack: error.stack,
      });
      throw new Error(`S3 upload failed: ${error.message}`);
    }
  }

  /**
   * Upload with progress tracking for large files
   */
  async uploadWithProgress(uploadParams, onProgress) {
    return new Promise((resolve, reject) => {
      const upload = this.s3.upload(uploadParams);

      upload.on("httpUploadProgress", (progress) => {
        const percentage = Math.round((progress.loaded / progress.total) * 100);
        onProgress(percentage, progress);
      });

      upload.send((error, data) => {
        if (error) {
          reject(error);
        } else {
          resolve(data.Location);
        }
      });
    });
  }

  /**
   * Upload file from disk path
   */
  async uploadFile(filePath, key, contentType = null, options = {}) {
    try {
      const fileStats = await fs.stat(filePath);

      if (!contentType) {
        const mime = await import("mime-types");
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
          lastModified: fileStats.mtime.toISOString(),
        },
        options,
      );
    } catch (error) {
      logger.error("File upload failed:", error);
      throw new Error(`File upload failed: ${error.message}`);
    }
  }

  /**
   * Upload file from URL (download and upload to S3)
   */
  async uploadFromUrl(url, key, options = {}) {
    try {
      const fetch = (await import("node-fetch")).default;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch URL: ${response.statusText}`);
      }

      const buffer = await response.buffer();
      const contentType =
        response.headers.get("content-type") ||
        this.detectContentTypeFromUrl(url);

      return await this.uploadBuffer(
        buffer,
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

  /**
   * Upload stream directly to S3
   */
  async uploadStream(
    readStream,
    key,
    contentType,
    contentLength,
    options = {},
  ) {
    return new Promise((resolve, reject) => {
      const uploadParams = {
        Bucket: this.bucketName,
        Key: key,
        Body: readStream,
        ContentType: contentType,
        ContentLength: contentLength,
        ACL: "public-read",
        CacheControl: options.cacheControl || "public, max-age=31536000",
      };

      const upload = this.s3.upload(uploadParams);

      upload.on("error", (error) => {
        logger.error("Stream upload failed:", error);
        reject(new Error(`Stream upload failed: ${error.message}`));
      });

      upload.on("httpUploadProgress", (progress) => {
        if (options.onProgress) {
          options.onProgress(progress);
        }
      });

      upload.send((error, data) => {
        if (error) {
          reject(error);
        } else {
          logger.info(`Stream uploaded successfully: ${data.Location}`);
          resolve(data.Location);
        }
      });
    });
  }

  /**
   * Upload multiple files with batch processing
   */
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
      key: files[index].key || results[index].value?.split("/").pop(),
      status: result.status,
      url: result.status === "fulfilled" ? result.value : null,
      error: result.status === "rejected" ? result.reason.message : null,
      size: files[index].buffer?.length || files[index].fileStats?.size,
    }));

    const successfulUploads = uploadResults.filter(
      (r) => r.status === "fulfilled",
    );
    logger.info(
      `Batch upload completed: ${successfulUploads.length}/${files.length} successful`,
    );

    return uploadResults;
  }

  /**
   * Generate pre-signed upload URL for direct frontend uploads
   */
  async generatePresignedUploadUrl(
    key,
    contentType,
    expiresIn = 3600,
    options = {},
  ) {
    try {
      const params = {
        Bucket: this.bucketName,
        Key: key,
        ContentType: contentType,
        ACL: "public-read",
        Expires: expiresIn,
        CacheControl: options.cacheControl || "public, max-age=31536000",
      };

      const signedUrl = this.s3.getSignedUrl("putObject", params);
      logger.info(`Pre-signed upload URL generated for key: ${key}`);
      return signedUrl;
    } catch (error) {
      logger.error("Failed to generate pre-signed upload URL:", error);
      throw new Error(`Pre-signed URL generation failed: ${error.message}`);
    }
  }

  /**
   * Generate pre-signed download URL (for private files)
   */
  async generatePresignedDownloadUrl(key, expiresIn = 3600) {
    try {
      const params = {
        Bucket: this.bucketName,
        Key: key,
        Expires: expiresIn,
      };

      const signedUrl = this.s3.getSignedUrl("getObject", params);
      logger.info(`Pre-signed download URL generated for key: ${key}`);
      return signedUrl;
    } catch (error) {
      logger.error("Failed to generate pre-signed download URL:", error);
      throw new Error(
        `Pre-signed download URL generation failed: ${error.message}`,
      );
    }
  }

  /**
   * Delete file from S3
   */
  async deleteFile(key) {
    try {
      await this.s3
        .deleteObject({
          Bucket: this.bucketName,
          Key: key,
        })
        .promise();

      logger.info(`File deleted successfully: ${key}`);
      return true;
    } catch (error) {
      logger.error("Failed to delete file from S3:", error);
      throw new Error(`S3 delete failed: ${error.message}`);
    }
  }

  /**
   * Delete multiple files in batch
   */
  async deleteMultipleFiles(keys) {
    try {
      const deletePromises = keys.map((key) => this.deleteFile(key));
      const results = await Promise.allSettled(deletePromises);

      const deleteResults = results.map((result, index) => ({
        key: keys[index],
        status: result.status,
        error: result.status === "rejected" ? result.reason.message : null,
      }));

      const successfulDeletes = deleteResults.filter(
        (r) => r.status === "fulfilled",
      );
      logger.info(
        `Batch delete completed: ${successfulDeletes.length}/${keys.length} successful`,
      );

      return deleteResults;
    } catch (error) {
      logger.error("Failed to delete multiple files from S3:", error);
      throw new Error(`Multiple files delete failed: ${error.message}`);
    }
  }

  /**
   * Copy file within S3
   */
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

      await this.s3.copyObject(copyParams).promise();
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

  /**
   * Get file metadata
   */
  async getFileMetadata(key) {
    try {
      const metadata = await this.s3
        .headObject({
          Bucket: this.bucketName,
          Key: key,
        })
        .promise();

      logger.info(`File metadata retrieved for key: ${key}`);
      return metadata;
    } catch (error) {
      logger.error("Failed to get file metadata from S3:", error);
      throw new Error(`S3 metadata retrieval failed: ${error.message}`);
    }
  }

  /**
   * List files with pagination support
   */
  async listFiles(prefix = "", maxKeys = 1000, continuationToken = null) {
    try {
      const params = {
        Bucket: this.bucketName,
        Prefix: prefix,
        MaxKeys: maxKeys,
        ContinuationToken: continuationToken,
      };

      const response = await this.s3.listObjectsV2(params).promise();
      const files = response.Contents || [];

      const result = {
        files: files.map((file) => ({
          key: file.Key,
          size: file.Size,
          lastModified: file.LastModified,
          etag: file.ETag,
          url: `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${file.Key}`,
        })),
        isTruncated: response.IsTruncated,
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

  /**
   * Download file from S3 to local path
   */
  async downloadFile(key, localPath) {
    try {
      const fileStream = this.s3
        .getObject({
          Bucket: this.bucketName,
          Key: key,
        })
        .createReadStream();

      const writeStream = fs.createWriteStream(localPath);
      await pipeline(fileStream, writeStream);

      logger.info(`File downloaded successfully to: ${localPath}`);
      return localPath;
    } catch (error) {
      logger.error("Failed to download file from S3:", error);
      throw new Error(`S3 download failed: ${error.message}`);
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(key) {
    try {
      await this.getFileMetadata(key);
      return true;
    } catch (error) {
      if (error.code === "NotFound") {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get file size
   */
  async getFileSize(key) {
    try {
      const metadata = await this.getFileMetadata(key);
      return metadata.ContentLength;
    } catch (error) {
      logger.error("Failed to get file size from S3:", error);
      throw new Error(`File size retrieval failed: ${error.message}`);
    }
  }

  /**
   * Utility method to detect content type from URL
   */
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

  /**
   * Cleanup temporary files older than specified hours
   */
  async cleanupTempFiles(prefix = "temp/", olderThanHours = 24) {
    try {
      let files = [];
      let continuationToken = null;

      // List all files with pagination
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

  /**
   * Get bucket statistics
   */
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
