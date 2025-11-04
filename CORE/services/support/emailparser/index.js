import { simpleParser } from "mailparser";

export class EmailParser {
  async streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("error", reject);
      stream.on("end", () => resolve(Buffer.concat(chunks)));
    });
  }

  async parseEmail(rawBuffer) {
    return await simpleParser(rawBuffer);
  }

  createReply(original, replyContent) {
    return {
      from: original.to.text,
      to: original.from.text,
      subject: `Re: ${original.subject}`,
      html: this.wrapEmailReply(replyContent, original),
      inReplyTo: original.messageId,
      references: [original.messageId, ...(original.references || [])],
    };
  }

  createRawEmail(mailOptions) {
    const lines = [];
    lines.push(`From: ${mailOptions.from}`);
    lines.push(`To: ${mailOptions.to}`);
    lines.push(`Subject: ${mailOptions.subject}`);
    lines.push(`In-Reply-To: ${mailOptions.inReplyTo}`);
    lines.push(`References: ${mailOptions.references.join(" ")}`);
    lines.push("MIME-Version: 1.0");
    lines.push("Content-Type: text/html; charset=utf-8");
    lines.push("");
    lines.push(mailOptions.html);
    return lines.join("\r\n");
  }

  wrapEmailReply(replyContent, original) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          ${replyContent}
        </div>
        <div style="border-left: 4px solid #007bff; padding-left: 15px; margin-top: 20px; color: #666;">
          <p><strong>Original message:</strong></p>
          <p><strong>From:</strong> ${original.from.text}</p>
          <p><strong>Date:</strong> ${original.date}</p>
          <p><strong>Subject:</strong> ${original.subject}</p>
          <div style="margin-top: 10px;">
            ${original.html || original.text}
          </div>
        </div>
      </div>
    `;
  }
}
