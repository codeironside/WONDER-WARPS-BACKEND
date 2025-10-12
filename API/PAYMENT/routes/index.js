import { authorize } from "../../../CORE/middleware/authmiddleware";
import { Router } from "express";
import { initiatePayment } from "../services/initiate.payment";
import { confirmPayment } from "../services/confirm.payment";
import express from "express";
import { handleStripeWebhook } from "../services/stripe.webhook";
import { getPaymentStatus } from "../services/get.payment.status";
const PaymentRouter = Router();

PaymentRouter.post(
  "/initiatePayment/:bookId",
  authorize(["Admin", "User"]),
  initiatePayment,
);
PaymentRouter.post(
  "/confirmPayment/:bookId",
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
