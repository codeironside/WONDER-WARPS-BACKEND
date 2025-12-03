import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import logger from "../../utils/logger/index.js";
import { config } from "../../utils/config/index.js";
import { getLoginDetails } from "../getlogindetails/index.js";
import ErrorHandler from "../../middleware/errorhandler/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class EmailService {
  constructor() {
    this.ses = new SESClient({
      region: config.ses.region,
      credentials: {
        accessKeyId: config.ses.accessKeyId,
        secretAccessKey: config.ses.secretAccessKey,
      },
    });

    this.templates = {
      otp: null,
      welcome: null,
      login: null,
      payment: null,
      reset_password: null,
      change_password: null,
      bookgenerationorpersonalisation: null,
      gift_notification: null,
      shipping_confirmation: null,
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
        "bookgenerationorpersonalisation.html",
        "gift-notification.html",
        "shipping_confirmation.html",
      ];

      const [
        otp,
        welcome,
        login,
        payment,
        reset_password,
        change_password,
        bookgenerationorpersonalisation,
        gift_notification,
        shipping_confirmation,
      ] = await Promise.all(
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
        bookgenerationorpersonalisation,
        gift_notification,
        shipping_confirmation,
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
        Subject: { Data: subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: htmlBody, Charset: "UTF-8" },
          Text: { Data: textBody, Charset: "UTF-8" },
        },
      },
    };

    try {
      const command = new SendEmailCommand(params);
      const result = await this.ses.send(command);
      return result;
    } catch (error) {
      logger.error("Failed to send email via SES:", error);
      throw new Error(`Failed to send email: ${error.message}`);
    }
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
      console.log(result);

      logger.info(
        `Payment confirmation email sent to ${email}: ${result.MessageId}`,
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
  async bookgenerationorpersonalisation(
    email,
    bookTitle,
    username,
    type,
    status,
    additionalData = {},
  ) {
    try {
      let statusConfig = {
        success: {
          subject: `🎉 Your ${type} "${bookTitle}" is Ready!`,
          icon: "🎉",
          title: "Your Book is Ready!",
          class: "success",
        },
        processing: {
          subject: `⏳ Your ${type} "${bookTitle}" is Being Processed`,
          icon: "⏳",
          title: "Book Generation in Progress",
          class: "processing",
        },
        failed: {
          subject: `⚠️ Issue with Your ${type} "${bookTitle}"`,
          icon: "⚠️",
          title: "Book Generation Issue",
          class: "failed",
        },
      };

      const configStatus = statusConfig[status] || statusConfig.processing;

      let htmlContent = this.templates.bookgenerationorpersonalisation;

      if (!htmlContent) {
        throw new Error("Book generation template not found");
      }

      const baseUrl = config.app.base_url || "https://mystoryhat.com";

      htmlContent = htmlContent
        .replace(/{{USER_NAME}}/g, username)
        .replace(/{{BOOK_TITLE}}/g, bookTitle)
        .replace(/{{TYPE}}/g, type)
        .replace(/{{STATUS}}/g, status)
        .replace(/{{STATUS_ICON}}/g, configStatus.icon)
        .replace(/{{STATUS_TITLE}}/g, configStatus.title)
        .replace(/{{STATUS_CLASS}}/g, configStatus.class)
        .replace(/{{BOOK_URL}}/g, additionalData.bookUrl || `${baseUrl}/books`)
        .replace(
          /{{ERROR_MESSAGE}}/g,
          additionalData.errorMessage || "Unknown error occurred",
        );

      const statusUpper = status.toUpperCase();
      ["PROCESSING", "SUCCESS", "FAILED"].forEach((statusType) => {
        if (statusType !== statusUpper) {
          const regex = new RegExp(
            `{{#if \\(eq STATUS "${statusType.toLowerCase()}"\\)}}[\\s\\S]*?{{\\/if}}`,
            "g",
          );
          htmlContent = htmlContent.replace(regex, "");
        }
      });

      htmlContent = htmlContent
        .replace(new RegExp(`{{#if \\(eq STATUS "${status}"\\)}}`, "g"), "")
        .replace(new RegExp(`{{\\/if}}`, "g"), "");

      let textContent;
      switch (status) {
        case "success":
          textContent = `Hi ${username}, Your ${type} "${bookTitle}" has been successfully completed! View it here: ${additionalData.bookUrl || `${baseUrl}/books`}`;
          break;
        case "processing":
          textContent = `Hi ${username}, Your ${type} "${bookTitle}" is currently being processed. We're working on writing your story, creating illustrations, and producing animations. This usually takes 5-10 minutes. We'll notify you when it's ready!`;
          break;
        case "failed":
          textContent = `Hi ${username}, We encountered an issue while processing your ${type} "${bookTitle}". Please try again or contact our support team at support@mystoryhat.com.`;
          break;
        default:
          textContent = `Hi ${username}, Update on your ${type} "${bookTitle}": ${status}`;
      }

      const result = await this._sendEmail(
        email,
        configStatus.subject,
        htmlContent,
        textContent,
      );

      logger.info(`Book ${type} ${status} notification sent to ${email}`, {
        messageId: result.MessageId,
        bookTitle,
        type,
        status,
      });
      return result;
    } catch (error) {
      logger.error(`Failed to send book ${type} ${status} email:`, error);
      throw new Error(
        `Failed to send book ${type} ${status} email: ${error.message}`,
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

  async sendGiftNotificationEmail(recipientEmail, giftDetails) {
    const {
      recipientName,
      senderName,
      bookTitle,
      giftMessage,
      claimUrl,
      coverImage,
    } = giftDetails;

    try {
      let htmlContent = this.templates.gift_notification
        .replace(/{{RECIPIENT_NAME}}/g, recipientName)
        .replace(/{{SENDER_NAME}}/g, senderName)
        .replace(/{{BOOK_TITLE}}/g, bookTitle)
        .replace(
          /{{GIFT_MESSAGE}}/g,
          giftMessage || "Enjoy this special story!",
        )
        .replace(/{{CLAIM_URL}}/g, claimUrl);

      let coverImageSection = "";
      if (coverImage) {
        coverImageSection = `
          <div style="text-align: center; margin: 20px 0;">
            <img 
              src="${coverImage}" 
              alt="${bookTitle} Cover" 
              style="max-width: 250px; width: 100%; height: auto; border-radius: 8px; box-shadow: 0 8px 16px rgba(0,0,0,0.1); border: 2px solid #ffffff;" 
            />
          </div>`;
      }

      htmlContent = htmlContent.replace(
        "{{COVER_IMAGE_SECTION}}",
        coverImageSection,
      );

      const textContent = `Hi ${recipientName}, ${senderName} has sent you a personalized storybook: "${bookTitle}"! \n\nMessage: "${giftMessage}" \n\nClaim your gift here: ${claimUrl}`;

      const result = await this._sendEmail(
        recipientEmail,
        `🎁 Gift: "${bookTitle}" from ${senderName}`,
        htmlContent,
        textContent,
      );

      logger.info(
        `Gift notification sent to ${recipientEmail} for book "${bookTitle}"`,
        {
          messageId: result.MessageId,
          sender: senderName,
        },
      );
      return result;
    } catch (error) {
      logger.error("Failed to send gift notification email:", error);
      throw new Error(
        `Failed to send gift notification email: ${error.message}`,
      );
    }
  }

  async sendShippingConfirmationEmail(
    userEmail,
    userName,
    shippingDetails,
    bookDetails,
  ) {
    try {
      let htmlContent = this.templates.shipping_confirmation;

      if (!htmlContent) {
        throw new Error("Shipping confirmation template not loaded");
      }

      const replacements = {
        USER_NAME: userName || "there",
        BOOK_TITLE: bookDetails.book_title || "Your Personalized Book",
        CHILD_NAME: bookDetails.child_name || "",
        ORDER_ID: bookDetails.order_id || bookDetails._id || "",
        SHIPPING_FULL_NAME: shippingDetails.full_name || "",
        SHIPPING_ADDRESS_LINE1: shippingDetails.address_line1 || "",
        SHIPPING_ADDRESS_LINE2: shippingDetails.address_line2 || "",
        SHIPPING_CITY: shippingDetails.city || "",
        SHIPPING_STATE: shippingDetails.state || "",
        SHIPPING_POSTAL_CODE: shippingDetails.postal_code || "",
        SHIPPING_COUNTRY: shippingDetails.country || "",
        SHIPPING_PHONE: shippingDetails.phone_number || "",
        SHIPPING_EMAIL: shippingDetails.email || userEmail,
      };

      Object.keys(replacements).forEach((key) => {
        const regex = new RegExp(`{{${key}}}`, "g");
        htmlContent = htmlContent.replace(regex, replacements[key]);

        if (key === "SHIPPING_ADDRESS_LINE2" && !replacements[key]) {
          htmlContent = htmlContent.replace(
            /\{\{#SHIPPING_ADDRESS_LINE2\}[\s\S]*?\{\{\/SHIPPING_ADDRESS_LINE2\}\}/g,
            "",
          );
        }
      });

      htmlContent = htmlContent.replace(/\{\{.*?\}\}/g, "");

      const textContent = this.generateShippingTextContent(replacements);

      const result = await this._sendEmail(
        userEmail,
        "Shipping Details Confirmed - My Story Hat",
        htmlContent,
        textContent,
      );

      logger.info("Shipping confirmation email sent", {
        userEmail,
        orderId: replacements.ORDER_ID,
        messageId: result.MessageId,
      });

      return result;
    } catch (error) {
      logger.error("Failed to send shipping confirmation email:", error);
      throw new ErrorHandler(
        `Failed to send shipping confirmation email: ${error}`,
        500,
      );
    }
  }

  generateShippingTextContent(data) {
    return `
Shipping Details Confirmed - My Story Hat

Hi ${data.USER_NAME},

Your shipping details have been successfully saved for your personalized book.

BOOK DETAILS:
- Title: ${data.BOOK_TITLE}
- For: ${data.CHILD_NAME}
- Order ID: ${data.ORDER_ID}

SHIPPING ADDRESS:
${data.SHIPPING_FULL_NAME}
${data.SHIPPING_ADDRESS_LINE1}
${data.SHIPPING_ADDRESS_LINE2 ? data.SHIPPING_ADDRESS_LINE2 + "\n" : ""}${data.SHIPPING_CITY}, ${data.SHIPPING_STATE} ${data.SHIPPING_POSTAL_CODE}
${data.SHIPPING_COUNTRY}
Phone: ${data.SHIPPING_PHONE}
Email: ${data.SHIPPING_EMAIL}

WHAT HAPPENS NEXT?
you would be contacted about further costs regarding shipping and printing
Your personalized book will be printed and shipped within 5-7 business days.
You'll receive a tracking email once it's on its way!

View your order: https://mystoryhat.com/orders/${data.ORDER_ID}

Need to update your shipping details? You can edit them anytime before your order is processed.

Questions about your order?
Contact us: support@mystoryhat.com
Shipping FAQ: https://mystoryhat.com/help/shipping

© ${new Date().getFullYear()} My Story Hat. All rights reserved.
    `.trim();
  }
}

const emailService = new EmailService();

export default emailService;
