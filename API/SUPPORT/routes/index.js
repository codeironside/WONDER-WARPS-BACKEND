import { Router } from "express";
import { linkWorkMailAccount } from "../services/linkworkmail/index.js";
import { authorize } from "../../../CORE/middleware/authmiddleware/index.js";
import { unlinkWorkMailAccount } from "../services/unlinkworkmail/index.js";
import { getWorkMailStatus } from "../services/getWorkmailstatus/index.js";
import { sendTemplatedEmail } from "../services/sendEmail/index.js";
import { syncEmails } from "../services/syncMail/index.js";
import { getEmails } from "../services/getEmails/index.js";
import { searchEmails } from "../services/searchEmails/index.js";
import { getEmailStats } from "../services/getEmailStats/index.js";
import { getEmailThread } from "../services/getEmailThread/index.js";
import { getEmail } from "../services/getEmail/index.js";
import { replyToEmail } from "../services/replytoEmail/index.js";
import { markAsRead } from "../services/markAsRead/index.js";
import { deleteEmail } from "../services/deleteEmails/index.js";

export const emailRouter = Router();

// WorkMail Authentication Routes
emailRouter.post("/workmail/link", authorize(["Admin"]), linkWorkMailAccount);
emailRouter.post(
  "/workmail/unlink",
  authorize(["Admin"]),
  unlinkWorkMailAccount,
);
emailRouter.get("/workmail/status", authorize(["Admin"]), getWorkMailStatus);

// Email sending routes
emailRouter.post("/send", authorize(["Admin"]), sendTemplatedEmail);
emailRouter.post("/sync", authorize(["Admin"]), syncEmails);

// Email retrieval routes
emailRouter.get("/emails", authorize(["Admin"]), getEmails);
emailRouter.get("/emails/search", authorize(["Admin"]), searchEmails);
emailRouter.get("/emails/stats", authorize(["Admin"]), getEmailStats);
emailRouter.get(
  "/emails/thread/:threadId",
  authorize(["Admin"]),
  getEmailThread,
);
emailRouter.get("/emails/:emailId", authorize(["Admin"]), getEmail);

// Email management routes
emailRouter.post("/emails/:emailId/reply", authorize(["Admin"]), replyToEmail);
emailRouter.patch("/emails/:emailId/read", authorize(["Admin"]), markAsRead);
emailRouter.delete("/emails/:emailId", authorize(["Admin"]), deleteEmail);
