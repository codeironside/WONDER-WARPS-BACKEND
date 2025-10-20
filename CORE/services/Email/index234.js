import SES from "aws-sdk/clients/ses.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import logger from "../../utils/logger/index.js";
import { config } from "../../utils/config/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class EmailService {
  constructor() {
    this.ses = new SES({
      region: config.ses.region,
      accessKeyId: config.ses.accessKeyId,
      secretAccessKey: config.ses.secretAccessKey,
    });

    this.templates = {
      otp: null,
      welcome: null,
      login: null,
      payment: null,
    };

    this.loadTemplates();
  }

  async loadTemplates() {
    try {
      const templatesDir = path.join(__dirname, "../../email-templates");

      this.templates.otp = await fs.readFile(
        path.join(templatesDir, "otp.html"),
        "utf8",
      );

      this.templates.welcome = await fs.readFile(
        path.join(templatesDir, "welcome-template.html"),
        "utf8",
      );

      this.templates.login = await fs.readFile(
        path.join(templatesDir, "login-template.html"),
        "utf8",
      );

      this.templates.payment = await fs.readFile(
        path.join(templatesDir, "payment-template.html"),
        "utf8",
      );

      logger.info("Email templates loaded successfully");
    } catch (error) {
      logger.error("Failed to load email templates:", error);
      throw new Error("Failed to load email templates");
    }
  }

  async sendOTPEmail(email, otpCode, username = "User") {
    try {
      let htmlContent = this.templates.otp;
      htmlContent = htmlContent.replace("{{OTP_CODE}}", otpCode);
      htmlContent = htmlContent.replace("{{USER_NAME}}", username);

      const params = {
        Source: config.ses.from_info,
        Destination: {
          ToAddresses: [email],
        },
        Message: {
          Subject: {
            Data: "Your Wonder Wrap Verification Code",
          },
          Body: {
            Html: {
              Data: htmlContent,
            },
          },
        },
      };

      const result = await this.ses.sendEmail(params).promise();
      console.log(result);
      logger.info(`OTP email sent to ${email}: ${result.MessageId}`);
      return result;
    } catch (error) {
      console.log(error);
      logger.error("Failed to send OTP email:", error);
      throw new Error("Failed to send OTP email");
    }
  }

  async sendWelcomeEmail(email, username) {
    try {
      let htmlContent = this.templates.welcome;

      htmlContent = htmlContent.replace(/{{USER_NAME}}/g, username);

      const params = {
        Source: config.ses.from_info,
        Destination: {
          ToAddresses: [email],
        },
        Message: {
          Subject: {
            Data: "Welcome to Wonder Wrap!",
          },
          Body: {
            Html: {
              Data: htmlContent,
            },
          },
        },
      };

      const result = await this.ses.sendEmail(params).promise();
      logger.info(`Welcome email sent to ${email}: ${result.MessageId}`);
      return result;
    } catch (error) {
      logger.error("Failed to send welcome email:", error);
      throw new Error("Failed to send welcome email");
    }
  }

  async sendLoginNotificationEmail(
    email,
    username,
    loginTime,
    deviceInfo = "Unknown device",
  ) {
    try {
      let htmlContent = this.templates.login;

      // Replace placeholders with actual values
      htmlContent = htmlContent.replace(/{{USER_NAME}}/g, username);
      htmlContent = htmlContent.replace("{{LOGIN_TIME}}", loginTime);
      htmlContent = htmlContent.replace("{{DEVICE_INFO}}", deviceInfo);

      const params = {
        Source: process.env.SES_FROM_EMAIL,
        Destination: {
          ToAddresses: [email],
        },
        Message: {
          Subject: {
            Data: "New Login to Your Wonder Wrap Account",
          },
          Body: {
            Html: {
              Data: htmlContent,
            },
          },
        },
      };

      const result = await this.ses.sendEmail(params).promise();
      logger.info(
        `Login notification email sent to ${email}: ${result.MessageId}`,
      );
      return result;
    } catch (error) {
      logger.error("Failed to send login notification email:", error);
      throw new Error("Failed to send login notification email");
    }
  }

  async sendPaymentConfirmationEmail(
    email,
    username,
    amount,
    paymentDate,
    orderId,
    bookTitle,
    childName,
    subtotal,
    shipping,
    tax,
    total,
  ) {
    try {
      console.log(email,
        username,
        amount,
        paymentDate,
        orderId,
        bookTitle,
        childName,
        subtotal,
        shipping,
        tax,
        total)
      let htmlContent = this.templates.payment;
      htmlContent = htmlContent.replace(/{{USER_NAME}}/g, username);
      htmlContent = htmlContent.replace("{{AMOUNT}}", amount);
      htmlContent = htmlContent.replace("{{PAYMENT_DATE}}", paymentDate);
      htmlContent = htmlContent.replace("{{ORDER_ID}}", orderId);
      htmlContent = htmlContent.replace("{{STORY_TITLE}}", bookTitle);
      htmlContent = htmlContent.replace("{{CHILD_NAME}}", childName);
      htmlContent = htmlContent.replace("{{SUBTOTAL}}", subtotal);
      htmlContent = htmlContent.replace("{{SHIPPING}}", shipping);
      htmlContent = htmlContent.replace("{{TAX}}", tax);
      htmlContent = htmlContent.replace("{{TOTAL}}", total);

      const params = {
        Source: process.env.SES_FROM_EMAIL,
        Destination: {
          ToAddresses: [email],
        },
        Message: {
          Subject: {
            Data: "Your My Story Hat Payment Confirmation",
          },
          Body: {
            Html: {
              Data: htmlContent,
            },
          },
        },
      };

      const result = await this.ses.sendEmail(params).promise();
      logger.info(
        `Payment confirmation email sent to ${email}: ${result.MessageId}`,
      );
      return result;
    } catch (error) {
      logger.error("Failed to send payment confirmation email:", error);
      throw new Error("Failed to send payment confirmation email");
    }
  }

  async sendCustomEmail(email, subject, templateName, replacements) {
    try {
      let htmlContent = this.templates[templateName];

      if (!htmlContent) {
        throw new Error(`Template ${templateName} not found`);
      }

      // Replace all placeholders with actual values
      Object.keys(replacements).forEach((key) => {
        const placeholder = new RegExp(`{{${key}}}`, "g");
        htmlContent = htmlContent.replace(placeholder, replacements[key]);
      });

      const params = {
        Source: process.env.SES_FROM_EMAIL,
        Destination: {
          ToAddresses: [email],
        },
        Message: {
          Subject: {
            Data: subject,
          },
          Body: {
            Html: {
              Data: htmlContent,
            },
          },
        },
      };

      const result = await this.ses.sendEmail(params).promise();
      logger.info(`Custom email sent to ${email}: ${result.MessageId}`);
      return result;
    } catch (error) {
      logger.error("Failed to send custom email:", error);
      throw new Error("Failed to send custom email");
    }
  }
}

const emailService = new EmailService();

export default emailService;
