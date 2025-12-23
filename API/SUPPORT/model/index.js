import { WorkMailClient } from "@aws-sdk/client-workmail";
import { WorkMailMessageFlowClient } from "@aws-sdk/client-workmailmessageflow";
import { SESClient } from "@aws-sdk/client-ses";
import nodemailer from "nodemailer";
import mongoose from "mongoose";
import ErrorHandler from "../../../CORE/middleware/errorhandler/index.js";
import logger from "../../../CORE/utils/logger/index.js";

// Email Storage Schema
const emailSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    workmailMessageId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    threadId: {
      type: String,
      required: true,
      index: true,
    },
    subject: {
      type: String,
      required: true,
    },
    from: {
      name: String,
      email: { type: String, required: true },
    },
    to: [
      {
        name: String,
        email: { type: String, required: true },
      },
    ],
    cc: [
      {
        name: String,
        email: String,
      },
    ],
    bcc: [
      {
        name: String,
        email: String,
      },
    ],
    body: {
      text: String,
      html: String,
    },
    attachments: [
      {
        filename: String,
        contentType: String,
        size: Number,
        workmailAttachmentId: String,
      },
    ],
    flags: {
      isRead: { type: Boolean, default: false },
      isDeleted: { type: Boolean, default: false },
      isDraft: { type: Boolean, default: false },
      isAnswered: { type: Boolean, default: false },
      isForwarded: { type: Boolean, default: false },
    },
    headers: Map,
    receivedDate: {
      type: Date,
      required: true,
    },
    sentDate: {
      type: Date,
      required: true,
    },
    size: Number,
    syncStatus: {
      type: String,
      enum: ["synced", "pending", "failed"],
      default: "synced",
    },
    lastSyncAt: Date,
  },
  {
    timestamps: true,
  },
);

emailSchema.index({ userId: 1, receivedDate: -1 });
emailSchema.index({ threadId: 1, receivedDate: 1 });
emailSchema.index({ userId: 1, "flags.isRead": 1 });
emailSchema.index({ userId: 1, "flags.isDeleted": 1 });

const Email = mongoose.model("Email", emailSchema);

// WorkMail User Association Schema
const workmailUserSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    workmailUserId: {
      type: String,
      required: true,
      index: true,
    },
    workmailEmail: {
      type: String,
      required: true,
      index: true,
    },
    organizationId: {
      type: String,
      required: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    lastVerifiedAt: Date,
    accessToken: String,
    refreshToken: String,
    tokenExpiresAt: Date,
  },
  {
    timestamps: true,
  },
);

const WorkMailUser = mongoose.model("WorkMailUser", workmailUserSchema);

export class EmailModel {
  constructor(cacheService = null) {
    this.workmail = new WorkMailClient({ region: process.env.AWS_REGION });
    this.messageFlow = new WorkMailMessageFlowClient({
      region: process.env.AWS_REGION,
    });
    this.transporter = nodemailer.createTransporter({
      SES: new SESClient({ region: process.env.AWS_REGION }),
    });
    this.cacheService = cacheService;
    this.cacheTTL = 300;
  }

  // WorkMail Authentication Methods
  async verifyAndLinkWorkMailAccount(userId, userEmail) {
    try {
      logger.info("Verifying and linking WorkMail account", {
        userId,
        userEmail,
      });

      // Check if user already has a linked WorkMail account
      const existingLink = await WorkMailUser.findOne({ userId });
      if (existingLink) {
        logger.info("User already has linked WorkMail account", { userId });
        return existingLink;
      }

      // Verify user exists in WorkMail organization
      const workmailUsers = await this.listUsers(process.env.ORGANIZATION_ID);
      const workmailUser = workmailUsers.Users.find(
        (u) => u.Email === userEmail,
      );

      if (!workmailUser) {
        logger.warn("User not found in WorkMail organization", {
          userId,
          userEmail,
        });
        throw new ErrorHandler(
          "Email account not found in WorkMail organization. Please contact administrator.",
          404,
        );
      }

      // Create WorkMail user association
      const workmailUserLink = new WorkMailUser({
        userId,
        workmailUserId: workmailUser.Id,
        workmailEmail: userEmail,
        organizationId: process.env.ORGANIZATION_ID,
        isVerified: true,
        lastVerifiedAt: new Date(),
      });

      await workmailUserLink.save();

      // Perform initial sync
      await this.syncUserEmails(userId);

      logger.info("WorkMail account linked successfully", {
        userId,
        workmailUserId: workmailUser.Id,
      });
      return workmailUserLink;
    } catch (error) {
      logger.error("Failed to verify and link WorkMail account", {
        userId,
        userEmail,
        error: error.message,
      });
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler(
        `Failed to link WorkMail account: ${error.message}`,
        500,
      );
    }
  }

  async getWorkMailUser(userId) {
    try {
      const workmailUser = await WorkMailUser.findOne({ userId });
      if (!workmailUser) {
        throw new ErrorHandler(
          "WorkMail account not linked. Please verify your email with WorkMail first.",
          404,
        );
      }

      if (!workmailUser.isVerified) {
        throw new ErrorHandler(
          "WorkMail account not verified. Please complete verification process.",
          401,
        );
      }

      return workmailUser;
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler(
        `Failed to get WorkMail user: ${error.message}`,
        500,
      );
    }
  }

  async unlinkWorkMailAccount(userId) {
    try {
      const result = await WorkMailUser.deleteOne({ userId });

      if (this.cacheService) {
        await this.cacheService.deletePattern(`user_emails_${userId}_*`);
        await this.cacheService.deletePattern(`email_thread_${userId}_*`);
        await this.cacheService.delete(`email_stats_${userId}`);
      }

      logger.info("WorkMail account unlinked", { userId });
      return {
        success: true,
        message: "WorkMail account unlinked successfully",
      };
    } catch (error) {
      logger.error("Failed to unlink WorkMail account", {
        userId,
        error: error.message,
      });
      throw new ErrorHandler(
        `Failed to unlink WorkMail account: ${error.message}`,
        500,
      );
    }
  }

  // Core Email Methods
  async sendTemplatedEmail(userId, to, subject, template, data, options = {}) {
    try {
      logger.info("Sending templated email", { userId, to, subject });

      const result = await this.sendTemplatedEmailCore(
        process.env.FROM_EMAIL,
        to,
        subject,
        template,
        data,
      );

      const emailRecord = new Email({
        userId,
        workmailMessageId: result.messageId,
        threadId: this.generateThreadId(),
        subject,
        from: {
          name: process.env.FROM_NAME || "System",
          email: process.env.FROM_EMAIL,
        },
        to: this.parseEmailAddresses(to),
        body: {
          html: this.applyEmailTemplateStyling(template, data),
        },
        flags: {
          isRead: true,
          isDraft: false,
        },
        receivedDate: new Date(),
        sentDate: new Date(),
        syncStatus: "synced",
        lastSyncAt: new Date(),
      });

      await emailRecord.save();

      if (this.cacheService) {
        await this.cacheService.deletePattern(`user_emails_${userId}_*`);
      }

      logger.info("Templated email sent successfully", {
        userId,
        messageId: result.messageId,
        recipientCount: Array.isArray(to) ? to.length : 1,
      });

      return result;
    } catch (error) {
      logger.error("Failed to send templated email", {
        userId,
        to,
        subject,
        error: error.message,
      });
      throw new ErrorHandler(`Failed to send email: ${error.message}`, 500);
    }
  }

  async syncUserEmails(userId) {
    try {
      logger.info("Starting email sync for user", { userId });

      const workmailUser = await this.getWorkMailUser(userId);
      const messages = await this.getUserMessagesFromWorkmail(
        workmailUser.workmailUserId,
      );

      const syncResults = {
        total: messages.length,
        created: 0,
        updated: 0,
        failed: 0,
      };

      for (const message of messages) {
        try {
          const existingEmail = await Email.findOne({
            userId,
            workmailMessageId: message.Id,
          });

          if (!existingEmail) {
            await this.syncSingleEmail(userId, message.Id);
            syncResults.created++;
          } else {
            syncResults.updated++;
          }
        } catch (error) {
          syncResults.failed++;
          logger.error("Failed to sync message", {
            userId,
            messageId: message.Id,
            error: error.message,
          });
        }
      }

      if (this.cacheService) {
        await this.cacheService.deletePattern(`user_emails_${userId}_*`);
      }

      logger.info("Email sync completed", { userId, syncResults });
      return syncResults;
    } catch (error) {
      logger.error("Email sync failed", {
        userId,
        error: error.message,
      });
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler(`Email sync failed: ${error.message}`, 500);
    }
  }

  async syncSingleEmail(userId, messageId) {
    try {
      const messageContent = await this.getRawMessageContent(messageId);
      const parsedEmail = await this.parseEmail(
        await this.streamToBuffer(messageContent.messageContent),
      );

      const emailRecord = new Email({
        userId,
        workmailMessageId: messageId,
        threadId: parsedEmail.messageId || this.generateThreadId(),
        subject: parsedEmail.subject || "No Subject",
        from: this.parseAddressObject(parsedEmail.from),
        to: this.parseAddressArray(parsedEmail.to),
        cc: this.parseAddressArray(parsedEmail.cc),
        bcc: this.parseAddressArray(parsedEmail.bcc),
        body: {
          text: parsedEmail.text,
          html: parsedEmail.html,
        },
        attachments:
          parsedEmail.attachments?.map((att) => ({
            filename: att.filename,
            contentType: att.contentType,
            size: att.size,
          })) || [],
        headers: this.parseHeaders(parsedEmail.headers),
        receivedDate: parsedEmail.date || new Date(),
        sentDate: parsedEmail.date || new Date(),
        size: parsedEmail.size,
        syncStatus: "synced",
        lastSyncAt: new Date(),
      });

      await emailRecord.save();
      logger.debug("Email synced successfully", { userId, messageId });
      return emailRecord;
    } catch (error) {
      logger.error("Failed to sync single email", {
        userId,
        messageId,
        error: error.message,
      });
      throw new ErrorHandler(
        `Failed to sync email ${messageId}: ${error.message}`,
        500,
      );
    }
  }

  async getUserEmails(userId, filters = {}, options = {}) {
    try {
      const cacheKey = `user_emails_${userId}_${JSON.stringify(filters)}_${JSON.stringify(options)}`;

      if (this.cacheService && options.useCache !== false) {
        const cached = await this.cacheService.get(cacheKey);
        if (cached) {
          logger.debug("Retrieved emails from cache", { userId, cacheKey });
          return cached;
        }
      }

      const query = { userId, "flags.isDeleted": false };

      if (filters.threadId) {
        query.threadId = filters.threadId;
      }

      if (filters.isRead !== undefined) {
        query["flags.isRead"] = filters.isRead;
      }

      if (filters.search) {
        query.$or = [
          { subject: { $regex: filters.search, $options: "i" } },
          { "body.text": { $regex: filters.search, $options: "i" } },
          { "from.email": { $regex: filters.search, $options: "i" } },
          { "to.email": { $regex: filters.search, $options: "i" } },
        ];
      }

      const page = parseInt(options.page) || 1;
      const limit = parseInt(options.limit) || 20;
      const skip = (page - 1) * limit;

      const [emails, total] = await Promise.all([
        Email.find(query)
          .sort({ receivedDate: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Email.countDocuments(query),
      ]);

      const result = {
        emails,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };

      if (this.cacheService && options.useCache !== false) {
        await this.cacheService.set(cacheKey, result, 60);
        logger.debug("Cached email results", { userId, cacheKey });
      }

      logger.debug("Retrieved user emails", { userId, count: emails.length });
      return result;
    } catch (error) {
      logger.error("Failed to get user emails", {
        userId,
        error: error.message,
      });
      throw new ErrorHandler(`Failed to fetch emails: ${error.message}`, 500);
    }
  }

  async getEmailThread(userId, threadId, options = {}) {
    try {
      const cacheKey = `email_thread_${userId}_${threadId}`;

      if (this.cacheService && options.useCache !== false) {
        const cached = await this.cacheService.get(cacheKey);
        if (cached) {
          logger.debug("Retrieved email thread from cache", {
            userId,
            threadId,
          });
          return cached;
        }
      }

      const emails = await Email.find({
        userId,
        threadId,
        "flags.isDeleted": false,
      })
        .sort({ receivedDate: 1 })
        .lean();

      if (this.cacheService && options.useCache !== false) {
        await this.cacheService.set(cacheKey, emails, 300);
      }

      logger.debug("Retrieved email thread", {
        userId,
        threadId,
        count: emails.length,
      });
      return emails;
    } catch (error) {
      logger.error("Failed to get email thread", {
        userId,
        threadId,
        error: error.message,
      });
      throw new ErrorHandler(
        `Failed to fetch email thread: ${error.message}`,
        500,
      );
    }
  }

  async getEmail(userId, emailId, options = {}) {
    try {
      const email = await Email.findOne({
        _id: emailId,
        userId,
        "flags.isDeleted": false,
      });

      if (!email) {
        logger.warn("Email not found", { userId, emailId });
        throw new ErrorHandler("Email not found", 404);
      }

      if (!email.flags.isRead) {
        email.flags.isRead = true;
        await email.save();

        if (this.cacheService) {
          await this.cacheService.deletePattern(`user_emails_${userId}_*`);
        }
        logger.debug("Marked email as read", { userId, emailId });
      }

      return email;
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      logger.error("Failed to get email", {
        userId,
        emailId,
        error: error.message,
      });
      throw new ErrorHandler(`Failed to fetch email: ${error.message}`, 500);
    }
  }

  async replyToEmail(userId, emailId, content, template = null, options = {}) {
    try {
      const originalEmail = await this.getEmail(userId, emailId);

      let result;
      if (template) {
        const replyData = {
          content: content,
          originalMessage: originalEmail.body.text || originalEmail.body.html,
          originalFrom: originalEmail.from.email,
          originalDate: originalEmail.receivedDate,
          originalSubject: originalEmail.subject,
        };

        result = await this.sendTemplatedEmail(
          userId,
          originalEmail.from.email,
          `Re: ${originalEmail.subject}`,
          template,
          replyData,
          options,
        );
      } else {
        const replyMessage = {
          from: process.env.FROM_EMAIL,
          to: originalEmail.from.email,
          subject: `Re: ${originalEmail.subject}`,
          html: content,
          inReplyTo: originalEmail.workmailMessageId,
          references: [originalEmail.workmailMessageId],
        };

        const rawMessage = this.createRawEmail(replyMessage);
        result = await this.sendRawEmail(rawMessage);
      }

      originalEmail.flags.isAnswered = true;
      await originalEmail.save();

      if (this.cacheService) {
        await this.cacheService.deletePattern(`user_emails_${userId}_*`);
        await this.cacheService.delete(
          `email_thread_${userId}_${originalEmail.threadId}`,
        );
      }

      logger.info("Email reply sent successfully", {
        userId,
        originalEmailId: emailId,
        replyMessageId: result.messageId,
      });

      return result;
    } catch (error) {
      logger.error("Failed to reply to email", {
        userId,
        emailId,
        error: error.message,
      });
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler(`Failed to send reply: ${error.message}`, 500);
    }
  }

  async markAsRead(userId, emailId, isRead = true) {
    try {
      const email = await Email.findOne({ _id: emailId, userId });

      if (!email) {
        logger.warn("Email not found for mark as read", { userId, emailId });
        throw new ErrorHandler("Email not found", 404);
      }

      email.flags.isRead = isRead;
      await email.save();

      if (this.cacheService) {
        await this.cacheService.deletePattern(`user_emails_${userId}_*`);
      }

      logger.debug("Email marked as read", { userId, emailId, isRead });
      return email;
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      logger.error("Failed to mark email as read", {
        userId,
        emailId,
        error: error.message,
      });
      throw new ErrorHandler(`Failed to update email: ${error.message}`, 500);
    }
  }

  async deleteEmail(userId, emailId, permanent = false) {
    try {
      const email = await Email.findOne({ _id: emailId, userId });

      if (!email) {
        logger.warn("Email not found for deletion", { userId, emailId });
        throw new ErrorHandler("Email not found", 404);
      }

      if (permanent) {
        await Email.deleteOne({ _id: emailId });
        logger.info("Email permanently deleted", { userId, emailId });
      } else {
        email.flags.isDeleted = true;
        await email.save();
        logger.info("Email soft deleted", { userId, emailId });
      }

      if (this.cacheService) {
        await this.cacheService.deletePattern(`user_emails_${userId}_*`);
        await this.cacheService.delete(
          `email_thread_${userId}_${email.threadId}`,
        );
      }

      return { success: true, message: "Email deleted successfully" };
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      logger.error("Failed to delete email", {
        userId,
        emailId,
        error: error.message,
      });
      throw new ErrorHandler(`Failed to delete email: ${error.message}`, 500);
    }
  }

  async getEmailStats(userId) {
    try {
      const cacheKey = `email_stats_${userId}`;

      if (this.cacheService) {
        const cached = await this.cacheService.get(cacheKey);
        if (cached) {
          logger.debug("Retrieved email stats from cache", { userId });
          return cached;
        }
      }

      const stats = await Email.aggregate([
        { $match: { userId, "flags.isDeleted": false } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            unread: {
              $sum: { $cond: [{ $eq: ["$flags.isRead", false] }, 1, 0] },
            },
            answered: {
              $sum: { $cond: [{ $eq: ["$flags.isAnswered", true] }, 1, 0] },
            },
          },
        },
      ]);

      const result = stats[0] || { total: 0, unread: 0, answered: 0 };

      if (this.cacheService) {
        await this.cacheService.set(cacheKey, result, 300);
      }

      logger.debug("Retrieved email statistics", { userId, stats: result });
      return result;
    } catch (error) {
      logger.error("Failed to get email stats", {
        userId,
        error: error.message,
      });
      throw new ErrorHandler(
        `Failed to fetch email statistics: ${error.message}`,
        500,
      );
    }
  }

  // AWS WorkMail Core Methods
  async listMailboxes(organizationId) {
    const { ListMailboxesCommand } = await import("@aws-sdk/client-workmail");
    const command = new ListMailboxesCommand({
      OrganizationId: organizationId,
    });
    return await this.workmail.send(command);
  }

  async listUsers(organizationId) {
    const { ListUsersCommand } = await import("@aws-sdk/client-workmail");
    const command = new ListUsersCommand({
      OrganizationId: organizationId,
    });
    return await this.workmail.send(command);
  }

  async getRawMessageContent(messageId) {
    const { GetRawMessageContentCommand } =
      await import("@aws-sdk/client-workmailmessageflow");
    const command = new GetRawMessageContentCommand({
      MessageId: messageId,
    });
    return await this.messageFlow.send(command);
  }

  async deleteMessage(organizationId, messageId) {
    const { DeleteMessageCommand } = await import("@aws-sdk/client-workmail");
    const command = new DeleteMessageCommand({
      OrganizationId: organizationId,
      MessageId: messageId,
    });
    return await this.workmail.send(command);
  }

  async sendTemplatedEmailCore(from, to, subject, template, data) {
    const processedTemplate = this.applyEmailTemplateStyling(template, data);
    return await this.transporter.sendMail({
      from,
      to,
      subject,
      html: processedTemplate,
    });
  }

  async sendRawEmail(rawMessage) {
    return await this.transporter.sendMail({
      raw: {
        data: rawMessage,
      },
    });
  }

  // Utility Methods
  applyEmailTemplateStyling(template, data) {
    let processed = template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return data[key] || match;
    });

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            max-width: 600px; 
            margin: 0 auto; 
            padding: 20px;
            background-color: #f5f5f5;
          }
          .email-container {
            background: white;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          }
          .email-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px 20px;
            text-align: center;
          }
          .email-header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 600;
          }
          .email-content {
            padding: 30px;
          }
          .email-footer {
            background: #f8f9fa;
            padding: 20px;
            text-align: center;
            color: #666;
            font-size: 14px;
            border-top: 1px solid #e9ecef;
          }
          .button {
            display: inline-block;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 25px;
            margin: 15px 0;
            font-weight: 500;
            border: none;
            cursor: pointer;
          }
          .highlight-box {
            background: #f8f9fa;
            border-left: 4px solid #667eea;
            padding: 15px;
            margin: 20px 0;
            border-radius: 0 8px 8px 0;
          }
          h1 { color: #2c3e50; margin-bottom: 20px; font-weight: 700; }
          h2 { color: #34495e; margin-top: 25px; margin-bottom: 15px; font-weight: 600; }
          h3 { color: #7f8c8d; margin-bottom: 10px; font-weight: 500; }
          p { margin-bottom: 15px; }
          strong { font-weight: 600; color: #2c3e50; }
          .text-center { text-align: center; }
          .mb-20 { margin-bottom: 20px; }
          .mt-20 { margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="email-container">
          ${processed}
        </div>
      </body>
      </html>
    `;
  }

  generateThreadId() {
    return `thread_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  parseEmailAddresses(emails) {
    if (typeof emails === "string") {
      emails = emails.split(",").map((e) => e.trim());
    }

    return emails.map((email) => ({
      email: email,
      name: email.split("@")[0],
    }));
  }

  parseAddressObject(address) {
    if (!address) return { email: "", name: "" };

    return {
      name: address.name || address.text.split("<")[0].trim(),
      email:
        address.value?.[0]?.address ||
        address.text.match(/<(.+?)>/)?.[1] ||
        address.text,
    };
  }

  parseAddressArray(addresses) {
    if (!addresses) return [];
    if (!Array.isArray(addresses)) addresses = [addresses];

    return addresses.map((addr) => this.parseAddressObject(addr));
  }

  parseHeaders(headers) {
    const headerMap = new Map();
    if (!headers) return headerMap;

    headers.forEach((header) => {
      headerMap.set(header.key, header.value);
    });

    return headerMap;
  }

  async getUserMessagesFromWorkmail(workmailUserId) {
    try {
      const { ListMessagesCommand } = await import("@aws-sdk/client-workmail");
      const command = new ListMessagesCommand({
        OrganizationId: process.env.ORGANIZATION_ID,
        UserId: workmailUserId,
      });

      const response = await this.workmail.send(command);
      return response.Messages || [];
    } catch (error) {
      logger.error("Failed to get user messages from WorkMail", {
        workmailUserId,
        error: error.message,
      });
      throw new ErrorHandler(
        `Failed to fetch messages from WorkMail: ${error.message}`,
        500,
      );
    }
  }

  async streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("error", reject);
      stream.on("end", () => resolve(Buffer.concat(chunks)));
    });
  }

  async parseEmail(rawBuffer) {
    const { simpleParser } = await import("mailparser");
    return await simpleParser(rawBuffer);
  }

  createRawEmail(mailOptions) {
    const lines = [];
    lines.push(`From: ${mailOptions.from}`);
    lines.push(`To: ${mailOptions.to}`);
    lines.push(`Subject: ${mailOptions.subject}`);
    if (mailOptions.inReplyTo) {
      lines.push(`In-Reply-To: ${mailOptions.inReplyTo}`);
    }
    if (mailOptions.references) {
      lines.push(`References: ${mailOptions.references.join(" ")}`);
    }
    lines.push("MIME-Version: 1.0");
    lines.push("Content-Type: text/html; charset=utf-8");
    lines.push("");
    lines.push(mailOptions.html);
    return lines.join("\r\n");
  }
}

export default EmailModel;
