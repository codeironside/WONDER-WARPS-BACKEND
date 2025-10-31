import SES from "aws-sdk/clients/ses.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import logger from "../../utils/logger/index.js";
import { config } from "../../utils/config/index.js";
import { getLoginDetails } from "../getlogindetails/index.js";

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
      reset_password: null,
      change_password: null,
    };

    this.loadTemplates();
  }

  async loadTemplates() {
    try {
      const templatesDir = path.join(__dirname, "../../email-templates");
      const templateFiles = [
        "otp.html",
        "welcome-template.html",
        "login-template.html",
        "payment-template.html",
        "password-reset-otp.html",
        "passwordchangenotification.html",
      ];

      const [otp, welcome, login, payment, reset_password, change_password] =
        await Promise.all(
          templateFiles.map((file) =>
            fs.promises.readFile(path.join(templatesDir, file), "utf8"),
          ),
        );

      this.templates = {
        otp,
        welcome,
        login,
        payment,
        reset_password,
        change_password,
      };
      logger.info("Email templates loaded successfully");
    } catch (error) {
      logger.error("Failed to load email templates:", error);
      throw new Error("Failed to load email templates");
    }
  }

  async _sendEmail(to, subject, htmlBody, textBody) {
    const params = {
      Source: config.ses.from_info,
      Destination: {
        ToAddresses: [to],
      },
      Message: {
        Subject: {
          Data: subject,
          Charset: "UTF-8",
        },
        Body: {
          Html: {
            Data: htmlBody,
            Charset: "UTF-8",
          },
          Text: {
            Data: textBody,
            Charset: "UTF-8",
          },
        },
      },
    };

    return this.ses.sendEmail(params).promise();
  }

  async sendOTPEmail(email, otpCode, username = "User") {
    try {
      let htmlContent = this.templates.otp
        .replace("{{OTP_CODE}}", otpCode)
        .replace("{{USER_NAME}}", username);
      const textContent = `Your My Story Hat verification code is: ${otpCode}. This code will expire in 10 minutes.`;

      const result = await this._sendEmail(
        email,
        "Your My Story hat Verification Code",
        htmlContent,
        textContent,
      );
      logger.info(`OTP email sent to ${email}: ${result.MessageId}`);
      return result;
    } catch (error) {
      logger.error("Failed to send OTP email:", error);
      throw new Error(`Failed to send OTP email: ${error.message}`);
    }
  }

  async sendWelcomeEmail(email, username) {
    try {
      let htmlContent = this.templates.welcome.replace(
        /{{USER_NAME}}/g,
        username,
      );
      const textContent = `Welcome to Wonder Wrap, ${username}! Thank you for joining our community.`;

      const result = await this._sendEmail(
        email,
        "Welcome to My Story Hat!",
        htmlContent,
        textContent,
      );
      logger.info(`Welcome email sent to ${email}: ${result.MessageId}`);
      return result;
    } catch (error) {
      logger.error("Failed to send welcome email:", error);
      throw new Error(`Failed to send welcome email: ${error.message}`);
    }
  }

  async sendLoginNotificationEmail(req, email, username) {
    try {
      const loginDetails = await getLoginDetails(req);
      let htmlContent = this.templates.login
        .replace(/{{USER_NAME}}/g, username)
        .replace("{{LOCATION}}", loginDetails.location)
        .replace("{{DEVICE_INFO}}", loginDetails.device)
        .replace("{{LOGIN_TIME}}", loginDetails.time);

      const textContent = this.generateLoginTextEmail(username, loginDetails);
      const result = await this._sendEmail(
        email,
        "New Login to Your My Story Hat Account",
        htmlContent,
        textContent,
      );

      logger.info(`Login notification sent to ${email}`, {
        messageId: result.MessageId,
        ...loginDetails,
      });
      return result;
    } catch (error) {
      logger.error("Failed to send login notification email:", error);
      throw new Error(
        `Failed to send login notification email: ${error.message}`,
      );
    }
  }

  generateLoginTextEmail(username, loginDetails) {
    return `New Login to Your My Story Hat Account\n\nHi ${username},\n\nWe noticed a login to your account on My Story Hat just now.\n\nLogin details:\nLocation: ${loginDetails.location}\nDevice: ${loginDetails.device}\nTime: ${loginDetails.time}\n\nIf this wasn't you, please reset your password immediately.\n\n© ${new Date().getFullYear()} My Story Hat. All rights reserved.`.trim();
  }

  async sendPaymentConfirmationEmail(
    req,
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
    referenceCode,
    paymentMethod,
  ) {
    try {
      const loginDetails = await getLoginDetails(req);
      let htmlContent = this.templates.payment
        .replace(/{{USER_NAME}}/g, username)
        .replace("{{AMOUNT}}", amount)
        .replace("{{PAYMENT_DATE}}", paymentDate)
        .replace("{{ORDER_ID}}", orderId)
        .replace("{{REFERENCE_CODE}}", referenceCode)
        .replace("{{STORY_TITLE}}", bookTitle)
        .replace("{{CHILD_NAME}}", childName)
        .replace("{{SUBTOTAL}}", subtotal)
        .replace("{{SHIPPING}}", shipping)
        .replace("{{TAX}}", tax)
        .replace("{{TOTAL}}", total)
        .replace("{{LOCATION}}", loginDetails.location)
        .replace("{{PAYMENT_METHOD}}", paymentMethod);

      const textContent = `Thank you for your payment of ${amount} for order ${orderId}.`;
      const result = await this._sendEmail(
        email,
        "THANK YOU: Your My Story Hat Payment Confirmation",
        htmlContent,
        textContent,
      );

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
      Object.keys(replacements).forEach((key) => {
        const placeholder = new RegExp(`{{${key}}}`, "g");
        htmlContent = htmlContent.replace(placeholder, replacements[key]);
      });

      const textContent = Object.values(replacements).join(" ");
      const result = await this._sendEmail(
        email,
        subject,
        htmlContent,
        textContent,
      );

      logger.info(`Custom email sent to ${email}: ${result.MessageId}`);
      return result;
    } catch (error) {
      logger.error("Failed to send custom email:", error);
      throw new Error(`Failed to send custom email: ${error.message}`);
    }
  }

  async sendPasswordResetOTP(email, username, otp, req) {
    try {
      const loginDetails = await getLoginDetails(req);
      let htmlContent = this.templates.reset_password
        .replace(/{{USER_NAME}}/g, username)
        .replace("{{LOCATION}}", loginDetails.location)
        .replace("{{DEVICE_INFO}}", loginDetails.device)
        .replace("{{REQUEST_TIME}}", loginDetails.time)
        .replace("{{EXPIRY_TIME}}", "15 minutes")
        .replace("{{OTP_CODE}}", otp);

      const textContent = `Your password reset OTP is: ${otp}. It will expire in 15 minutes.`;
      const result = await this._sendEmail(
        email,
        "PASSWORD RESET OTP",
        htmlContent,
        textContent,
      );

      logger.info(`Password reset notification sent to ${email}`, {
        messageId: result.MessageId,
        ...loginDetails,
      });
      return result;
    } catch (error) {
      logger.error("Failed to send password reset email:", error);
      throw new Error(`Failed to send password reset email: ${error.message}`);
    }
  }

  async sendPasswordChangeNotification(
    email,
    username,
    PASSWORD_RESET_RECOMMENDATION,
    req,
  ) {
    try {
      const loginDetails = await getLoginDetails(req);
      let htmlContent = this.templates.change_password
        .replace(/{{USER_NAME}}/, username)
        .replace("{{LOCATION}}", loginDetails.location)
        .replace("{{DEVICE_INFO}}", loginDetails.device)
        .replace("{{CHANGE_TIME}}", loginDetails.time)
        .replace("{{RECOMMENDATION}}", PASSWORD_RESET_RECOMMENDATION);

      const textContent = `Your password was changed at ${loginDetails.time}. If this was not you, please secure your account.`;
      const result = await this._sendEmail(
        email,
        "PASSWORD CHANGE NOTIFICATION",
        htmlContent,
        textContent,
      );

      logger.info(`Password change notification sent to ${email}`, {
        messageId: result.MessageId,
        ...loginDetails,
      });
      return result;
    } catch (error) {
      logger.error("Failed to send password change notification:", error);
      throw new Error(
        `Failed to send password change notification: ${error.message}`,
      );
    }
  }
}

const emailService = new EmailService();

export default emailService;
