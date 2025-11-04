import { authorize } from "../../../CORE/middleware/authmiddleware/index.js";
import { Router } from "express";
import { initiatePayment } from "../services/initiate.payment/index.js";
import { confirmPayment } from "../services/confirm.payment/index.js";
import express from "express";
import { handleStripeWebhook } from "../services/stripe.webhook/index.js";
import { getPaymentStatus } from "../services/get.payment.status/index.js";
import { getAllReceiptsForAdmin } from "../services/ADMIN.RECEIPT.CONTROLLER/get.all receipts.for admin/index.js";
import { getUserReceiptsForAdmin } from "../services/ADMIN.RECEIPT.CONTROLLER/get.all.users.receipt/index.js";
import { getReceiptByReferenceAdmin } from "../services/ADMIN.RECEIPT.CONTROLLER/get.receipt.by.reference.for.Admin/index.js";
import { getReceiptForUserByAdmin } from "../services/ADMIN.RECEIPT.CONTROLLER/one.receipt.for.user/index.js";
import { getOneUserReceipt } from "../services/USERS.RECEIPT.CONTROLLER/get.one.receipt.for.user/index.js";
import { getALLUserReceipts } from "../services/USERS.RECEIPT.CONTROLLER/get.all.user.receipts/index.js";
import { getUserStats } from "../services/USERS.RECEIPT.CONTROLLER/get.user.payment.stats/index.js";
import { getUserReceiptByReference } from "../services/USERS.RECEIPT.CONTROLLER/get.user.receipt.by.reference/index.js";
import { createBookForPayment } from "../services/createbookforpayment/index.js";
export const PaymentRouter = Router();

PaymentRouter.post(
  "/createbookforpayemnt",
  authorize(["Admin", "User"]),
  createBookForPayment,
);
PaymentRouter.post(
  "/initiatePayment/:bookId",
  authorize(["Admin", "User"]),
  initiatePayment,
);
PaymentRouter.post(
  "/confirmPayment/:sessionId",
  authorize(["Admin", "User"]),
  confirmPayment,
);
PaymentRouter.get(
  "/status/:bookId/status",
  authorize(["Admin", "User"]),
  getPaymentStatus,
);
PaymentRouter.post(
  "/webhooks/stripe",
  authorize(["Admin", "User"]),
  express.raw({ type: "application/json" }),
  handleStripeWebhook,
);

//===========ADMIN

PaymentRouter.get(
  "/admin/getpaymentstatus",
  authorize(["Admin"]),
  getPaymentStatus,
);
PaymentRouter.get(
  "/admin/allReceipts",
  authorize(["Admin"]),
  getAllReceiptsForAdmin,
);
PaymentRouter.get(
  "/admin/allUserReceipts/:userId",
  authorize(["Admin"]),
  getUserReceiptsForAdmin,
);

PaymentRouter.get(
  "/admin/receipts/reference/:referenceCode",
  authorize(["Admin"]),
  getReceiptByReferenceAdmin,
);

PaymentRouter.get(
  "/admin/receipts/foroneuser",
  authorize(["Admin"]),
  getReceiptForUserByAdmin,
);

//================User==============

PaymentRouter.get(
  "/user/receipt/:receiptId",
  authorize(["Admin", "User"]),
  getOneUserReceipt,
);

PaymentRouter.get(
  "/user/receipts/allreceipt",
  authorize(["Admin", "User"]),
  getALLUserReceipts,
);

PaymentRouter.get(
  "/user/receipts/paymentstatistcs",
  authorize(["Admin", "User"]),
  getUserStats,
);
PaymentRouter.get(
  "/user/receiptsbyreference/:referenceCode",
  authorize(["Admin", "User"]),
  getUserReceiptByReference,
);
