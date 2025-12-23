import { WorkMailClient } from "@aws-sdk/client-workmail";
import { WorkMailMessageFlowClient } from "@aws-sdk/client-workmailmessageflow";
import { SESClient } from "@aws-sdk/client-ses";
import nodemailer from "nodemailer";

export class AWSEmailCore {
  constructor() {
    this.workmail = new WorkMailClient({ region: process.env.AWS_REGION });
    this.messageFlow = new WorkMailMessageFlowClient({
      region: process.env.AWS_REGION,
    });
    this.transporter = nodemailer.createTransporter({
      SES: new SESClient({ region: process.env.AWS_REGION }),
    });
  }

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

  async sendTemplatedEmail(from, to, subject, template, data) {
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
}
