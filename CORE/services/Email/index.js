import {Resend} from "resend";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import logger from "../../utils/logger/index.js";
import { config } from "../../utils/config/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resend = new Resend(config.resend.apiKey);

class EmailService {
  constructor() {
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

      this.templates.otp = await fs.promises.readFile(
        path.join(templatesDir, "otp.html"),
        "utf8",
      );
      this.templates.welcome = await fs.promises.readFile(
        path.join(templatesDir, "welcome-template.html"),
        "utf8",
      );
      this.templates.login = await fs.promises.readFile(
        path.join(templatesDir, "login-template.html"),
        "utf8",
      );
      this.templates.payment = await fs.promises.readFile(
        path.join(templatesDir, "payment-template.html"),
        "utf8",
      );

      logger.info("Email templates loaded successfully");
    } catch (error) {
        console.log(error)
      logger.error("Failed to load email templates:", error);
      throw new Error("Failed to load email templates");
    }
  }

  async sendOTPEmail(email, otpCode, username = "User") {
    try {
      let htmlContent = this.templates.otp;
      htmlContent = htmlContent.replace("{{OTP_CODE}}", otpCode);
      htmlContent = htmlContent.replace("{{USER_NAME}}", username);

      const result = await resend.emails.send({
        from: config.resend.fromEmail,
        to: email,
        subject: "Your Wonder Wrap Verification Code",
        html: htmlContent,
        text: `Your Wonder Wrap verification code is: ${otpCode}. This code will expire in 10 minutes.`,
      });

      logger.info(`OTP email sent to ${email}: ${result.id}`);
      return result;
    } catch (error) {
      logger.error("Failed to send OTP email:", error);
      throw new Error(`Failed to send OTP email: ${error.message}`);
    }
  }

  async sendWelcomeEmail(email, username) {
    try {
      let htmlContent = this.templates.welcome;
      htmlContent = htmlContent.replace(/{{USER_NAME}}/g, username);

      const result = await resend.emails.send({
        from: config.resend.fromEmail,
        to: email,
        subject: "Welcome to Wonder Wrap!",
        html: htmlContent,
        text: `Welcome to Wonder Wrap, ${username}! Thank you for joining our community.`,
      });

      logger.info(`Welcome email sent to ${email}: ${result.id}`);
      return result;
    } catch (error) {
      logger.error("Failed to send welcome email:", error);
      throw new Error(`Failed to send welcome email: ${error.message}`);
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
      htmlContent = htmlContent.replace(/{{USER_NAME}}/g, username);
      htmlContent = htmlContent.replace("{{LOGIN_TIME}}", loginTime);
      htmlContent = htmlContent.replace("{{DEVICE_INFO}}", deviceInfo);

      const result = await resend.emails.send({
        from: config.resend.fromEmail,
        to: email,
        subject: "New Login to Your Wonder Wrap Account",
        html: htmlContent,
        text: `New login detected for your Wonder Wrap account.\nTime: ${loginTime}\nDevice: ${deviceInfo}\nIf this wasn't you, please contact support immediately.`,
      });

      logger.info(`Login notification email sent to ${email}: ${result.id}`);
      return result;
    } catch (error) {
      logger.error("Failed to send login notification email:", error);
      throw new Error(
        `Failed to send login notification email: ${error.message}`,
      );
    }
  }

  async sendPaymentConfirmationEmail(
    email,
    username,
    amount,
    paymentDate,
    orderId,
  ) {
    try {
      let htmlContent = this.templates.payment;
      htmlContent = htmlContent.replace(/{{USER_NAME}}/g, username);
      htmlContent = htmlContent.replace("{{AMOUNT}}", amount);
      htmlContent = htmlContent.replace("{{PAYMENT_DATE}}", paymentDate);
      htmlContent = htmlContent.replace("{{ORDER_ID}}", orderId);

      const result = await resend.emails.send({
        from: config.resend.fromEmail,
        to: email,
        subject: "Your Wonder Wrap Payment Confirmation",
        html: htmlContent,
        text: `Payment Confirmation\nAmount: ${amount}\nDate: ${paymentDate}\nOrder ID: ${orderId}\nThank you for your purchase!`,
      });

      logger.info(`Payment confirmation email sent to ${email}: ${result.id}`);
      return result;
    } catch (error) {
      logger.error("Failed to send payment confirmation email:", error);
      throw new Error(
        `Failed to send payment confirmation email: ${error.message}`,
      );
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

      // Generate plain text version (basic)
      const textContent = Object.values(replacements).join(" ");

      const result = await resend.emails.send({
        from: config.resend.fromEmail,
        to: email,
        subject: subject,
        html: htmlContent,
        text: textContent,
      });

      logger.info(`Custom email sent to ${email}: ${result.id}`);
      return result;
    } catch (error) {
      logger.error("Failed to send custom email:", error);
      throw new Error(`Failed to send custom email: ${error.message}`);
    }
  }

  async verifyEmailIdentity(email) {
    try {
      // Resend does not require email verification like SES, as it handles email sending through its API
      logger.info(`Email identity verification not needed in Resend: ${email}`);
    } catch (error) {
      logger.error("Failed to verify email identity:", error);
      throw new Error(`Failed to verify email identity: ${error.message}`);
    }
  }

  // Method to close the Resend client (useful for cleanup)
  destroy() {
    // Resend does not have a specific cleanup function as it's an API service
  }
}

const emailService = new EmailService();

export default emailService;
