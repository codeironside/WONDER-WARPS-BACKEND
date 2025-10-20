import { Resend } from "resend";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import logger from "../../utils/logger/index.js";
import { config } from "../../utils/config/index.js";
import { getLoginDetails } from "../getlogindetails/index.js";

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
      reset_password: null,
      change_password: null,
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
      this.templates.reset_password = await fs.promises.readFile(
        path.join(templatesDir, "password-reset-otp.html"),
        "utf8",
      );
      this.templates.change_password = await fs.promises.readFile(
        path.join(templatesDir, "passwordchangenotification.html"),
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

      const result = await resend.emails.send({
        from: config.resend.from,
        to: email,
        subject: "Your Wonder Wrap Verification Code",
        html: htmlContent,
        text: `Your Wonder Wrap verification code is: ${otpCode}. This code will expire in 10 minutes.`,
      });
      console.log(result);
      logger.info(`OTP email sent to ${email}: ${result.data.id}`);
      return result;
    } catch (error) {
      console.log(error);
      logger.error("Failed to send OTP email:", error);
      throw new Error(`Failed to send OTP email: ${error.message}`);
    }
  }

  async sendWelcomeEmail(email, username) {
    try {
      let htmlContent = this.templates.welcome;
      htmlContent = htmlContent.replace(/{{USER_NAME}}/g, username);

      const result = await resend.emails.send({
        from: config.resend.from,
        to: email,
        subject: "Welcome to Wonder Wrap!",
        html: htmlContent,
        text: `Welcome to Wonder Wrap, ${username}! Thank you for joining our community.`,
      });

      logger.info(`Welcome email sent to ${email}: ${result.data.id}`);
      return result;
    } catch (error) {
      logger.error("Failed to send welcome email:", error);
      throw new Error(`Failed to send welcome email: ${error.message}`);
    }
  }

  async sendLoginNotificationEmail(req, email, username) {
    try {
      const loginDetails = await getLoginDetails(req);

      let htmlContent = this.templates.login;
      htmlContent = htmlContent.replace(/{{USER_NAME}}/g, username);
      htmlContent = htmlContent.replace("{{LOCATION}}", loginDetails.location);
      htmlContent = htmlContent.replace("{{DEVICE_INFO}}", loginDetails.device);
      htmlContent = htmlContent.replace("{{LOGIN_TIME}}", loginDetails.time);

      const result = await resend.emails.send({
        from: config.resend.from,
        to: email,
        subject: "New Login to Your My Story Hat Account",
        html: htmlContent,
        text: this.generateLoginTextEmail(username, loginDetails),
      });
      logger.info(`Login notification sent to ${email}`, {
        userId: username,
        email: email,
        ip: loginDetails.ip,
        location: loginDetails.location,
        device: loginDetails.rawDevice,
        time: loginDetails.time,
      });

      return result;
    } catch (error) {}
  }
  generateLoginTextEmail(username, loginDetails) {
    return `
New Login to Your My Story Hat Account

Hi ${username},

We noticed a login to your account on My Story Hat just now.

Login details:
Location: ${loginDetails.location}
Device: ${loginDetails.device}
Time: ${loginDetails.time}

If this wasn't you, please reset your password immediately.

View your account: https://my-story-hat.com/account

Questions? Contact us at support@mystoryhat.com

© ${new Date().getFullYear()} My Story Hat. All rights reserved.
    `.trim();
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
      console.log("Sending payment confirmation email with data:", {
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
      });
      const loginDetails = await getLoginDetails(req);

      let htmlContent = this.templates.payment;
      htmlContent = htmlContent.replace(/{{USER_NAME}}/g, username);
      htmlContent = htmlContent.replace("{{AMOUNT}}", amount);
      htmlContent = htmlContent.replace("{{PAYMENT_DATE}}", paymentDate);
      htmlContent = htmlContent.replace("{{ORDER_ID}}", orderId);
      htmlContent = htmlContent.replace("{{REFERENCE_CODE}}", referenceCode);
      htmlContent = htmlContent.replace("{{STORY_TITLE}}", bookTitle);
      htmlContent = htmlContent.replace("{{CHILD_NAME}}", childName);
      htmlContent = htmlContent.replace("{{SUBTOTAL}}", subtotal);
      htmlContent = htmlContent.replace("{{SHIPPING}}", shipping);
      htmlContent = htmlContent.replace("{{TAX}}", tax);
      htmlContent = htmlContent.replace("{{TOTAL}}", total);
      htmlContent = htmlContent.replace("{{LOCATION}}", loginDetails.location);
      htmlContent = htmlContent.replace("{{PAYMENT_METHOD}}", paymentMethod);

      const result = await resend.emails.send({
        from: config.resend.from,
        to: email,
        subject: "THANK YOU:Your My Story Hat Payment Confirmation",
        html: htmlContent,
      });
      logger.info(
        `Payment confirmation email sent to ${email}: ${result.data.id}`,
      );
      return result;
    } catch (error) {
      console.log(error);
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

      const result = await resend.emails.send({
        from: config.resend.from,
        to: email,
        subject: subject,
        html: htmlContent,
        text: textContent,
      });

      logger.info(`Custom email sent to ${email}: ${result.data.id}`);
      return result;
    } catch (error) {
      logger.error("Failed to send custom email:", error);
      throw new Error(`Failed to send custom email: ${error.message}`);
    }
  }

  async verifyEmailIdentity(email) {
    try {
      logger.info(`Email identity verification not needed in Resend: ${email}`);
    } catch (error) {
      logger.error("Failed to verify email identity:", error);
      throw new Error(`Failed to verify email identity: ${error.message}`);
    }
  }
  async sendPasswordResetOTP(email, username, otp, req) {
    try {
      const loginDetails = await getLoginDetails(req);
      let htmlContent = this.templates.reset_password;
      htmlContent = htmlContent.replace(/{{USER_NAME}}/g, username);
      htmlContent = htmlContent.replace("{{LOCATION}}", loginDetails.location);
      htmlContent = htmlContent.replace("{{DEVICE_INFO}}", loginDetails.device);
      htmlContent = htmlContent.replace("{{REQUEST_TIME}}", loginDetails.time);
      htmlContent = htmlContent.replace("{{EXPIRY_TIME}}", "15 minutes");
      htmlContent = htmlContent.replace("{{OTP_CODE}}", otp);

      const result = await resend.emails.send({
        from: config.resend.from,
        to: email,
        subject: "PASSWORD RESET OTP",
        html: htmlContent,
      });
      logger.info(`Password reset notification sent to ${email}`, {
        userId: username,
        email: email,
        ip: loginDetails.ip,
        location: loginDetails.location,
        device: loginDetails.rawDevice,
        time: loginDetails.time,
      });

      return result;
    } catch (error) {
      logger.error("Failed to send password reset email:", error);
      throw new Error(
        `Failed to send login notification email: ${error.message}`,
      );
    }
  }
  async sendPasswordChangeNotification(
    email,
    username,
    PASSWORD_RESET_RECOMMENDATION,
    req,
  ) {
    try {
      console.log(PASSWORD_RESET_RECOMMENDATION);
      const loginDetails = await getLoginDetails(req);
      let htmlContent = this.templates.change_password;
      htmlContent = htmlContent.replace(/{{USER_NAME}}/, username);
      htmlContent = htmlContent.replace("{{LOCATION}}", loginDetails.location);
      htmlContent = htmlContent.replace("{{DEVICE_INFO}}", loginDetails.device);
      htmlContent = htmlContent.replace("{{CHANGE_TIME}}", loginDetails.time);
      htmlContent = htmlContent.replace(
        "{{RECOMMENDATION}}",
        PASSWORD_RESET_RECOMMENDATION,
      );

      console.log(
        "After replacement contains RECOMMENDATION:",
        htmlContent.includes(PASSWORD_RESET_RECOMMENDATION),
      );

      const result = await resend.emails.send({
        from: config.resend.from,
        to: email,
        subject: "PASSWORD CHANGE NOTIFICATION",
        html: htmlContent,
      });
      logger.info(`Password change Notification ${email}`, {
        userId: username,
        email: email,
        ip: loginDetails.ip,
        location: loginDetails.location,
        device: loginDetails.rawDevice,
        time: loginDetails.time,
      });

      return result;
    } catch (error) {
      logger.error("Failed to send password reset email:", error);
      throw new Error(
        `Failed to send login notification email: ${error.message}`,
      );
    }
  }

  destroy() {}
}

const emailService = new EmailService();

export default emailService;
