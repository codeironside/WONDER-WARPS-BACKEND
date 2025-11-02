// import {
//   validateInteriorFile,
//   validateCoverFile,
//   calculateCoverDimensions,

// } from "../controllers/luluIntegrationController.js";

import { Router } from "express";
import { authorize } from "../../../CORE/middleware/authmiddleware/index.js";
import { getAvailableServices } from "../services/getavailableprintservice/index.js";
import { getServiceDetails } from "../services/getservicedetails/index.js";
import { createServiceOption } from "../services/create.service/index.js";
import { updateServiceOption } from "../services/updateServiceOption/index.js";
import { createPrintOrder } from "../services/createprintorder/index.js";
import { getUserPrintOrders } from "../services/get.user.print.orders/index.js";
import { getPrintOrderStatus } from "../services/get.print.order.status/index.js";
import { createPrintOrderCheckout } from "../services/createPrintOrderCheckout/index.js";
import { cancelPrintOrder } from "../services/cancelprintorder/index.js";
import { handlePaymentSuccess } from "../services/handlePaymentsucess/index.js";
import { handlePaymentCancel } from "../services/handlePaymentCancel/index.js";
import { checkPaymentStatus } from "../services/check.payment.status/index.js";
import { getShippingOptions } from "../services/getShippingOptions/index.js";
import { getAllPrintOrders } from "../services/getAllPrintOrdersforadmin/index.js";
import { getPrintOrder } from "../services/getPrintOrderforAdmin/index.js";
import { cancelPrintOrderAdmin } from "../services/cancelprintorderforadmin/index.js";
import { syncOrderStatus } from "../services/syncorderstatus/index.js";
import { processPendingPayments } from "../services/processpendingpaymentsadmin/index.js";
import { getPrintOrderStats } from "../services/getPrintOrderStatsforAdmin/index.js";
import { validatePodPackageId } from "../services/validatePodPackageId/index.js";
import { getLuluPrintOptions } from "../services/getLuluPrintOptions/index.js";
import { getPrintServiceOptions } from "../services/getPrintServiceOptions/index.js";
import { getLuluJobStatistics } from "../services/getLuluJobStatistics/index.js";
import { getLuluJobDetails } from "../services/getLuluJobDetails/index.js";
import { getLuluJobCosts } from "../services/getLuluJobCosts/index.js";

export const printOrderRouter = Router();

//=========ADMIN ROUTES===
printOrderRouter.post("/services", authorize(["Admin"]), createServiceOption);
printOrderRouter.put(
  "/services/:serviceId",
  authorize(["Admin"]),
  updateServiceOption,
);

printOrderRouter.get("/options", authorize(["Admin"]), getLuluPrintOptions);

printOrderRouter.get(
  "/servicesmixoption",
  authorize(["Admin"]),
  getPrintServiceOptions,
);

printOrderRouter.post(
  "/validate-pod-package",
  authorize(["Admin"]),
  validatePodPackageId,
);

// DUAL ROLE ROUTES (User & Admin)
printOrderRouter.get(
  "/services",
  authorize(["Admin", "User"]),
  getAvailableServices,
);
printOrderRouter.get(
  "/services/:serviceId",
  authorize(["Admin", "User"]),
  getServiceDetails,
);

// ==Print Order Management Routes (User)=====
printOrderRouter.post(
  "/orders",
  authorize(["Admin", "User"]),
  createPrintOrder,
);
printOrderRouter.get(
  "/orders",
  authorize(["Admin", "User"]),
  getUserPrintOrders,
);
printOrderRouter.get(
  "/orders/:orderId",
  authorize(["Admin", "User"]),
  getPrintOrderStatus,
);
printOrderRouter.post(
  "/orders/:orderId/checkout",
  authorize(["Admin", "User"]),
  createPrintOrderCheckout,
);
printOrderRouter.patch(
  "/orders/:orderId/cancel",
  authorize(["Admin", "User"]),
  cancelPrintOrder,
);

// Payment Callback Routes (No authentication - called by Stripe redirect)
printOrderRouter.get("/payment/success", handlePaymentSuccess);
printOrderRouter.get("/payment/cancel", handlePaymentCancel);

// Payment Status Check (For client polling)
printOrderRouter.get(
  "/payment/status",
  authorize(["Admin", "User"]),
  checkPaymentStatus,
);

// Lulu Integration Routes
// printOrderRouter.post(
//   "/validate/interior",
//   authenticateUser,
//   validateInteriorFile,
// );
// printOrderRouter.post("/validate/cover", authenticateUser, validateCoverFile);
// printOrderRouter.post(
//   "/calculate/cover-dimensions",
//   authenticateUser,
//   calculateCoverDimensions,
// );
printOrderRouter.get(
  "/orders/:orderId/shipping-options",
  authorize(["Admin", "User"]),
  getShippingOptions,
);

// Admin Routes
printOrderRouter.get("/admin/orders", authorize(["Admin"]), getAllPrintOrders);
printOrderRouter.get(
  "/admin/orders/:orderId",
  authorize(["Admin"]),
  getPrintOrder,
);
printOrderRouter.patch(
  "/admin/orders/:orderId/cancel",
  authorize(["admin"]),
  cancelPrintOrderAdmin,
);
printOrderRouter.post(
  "/admin/orders/:orderId/sync",
  authorize(["Admin"]),
  syncOrderStatus,
);
printOrderRouter.post(
  "/admin/process-pending-payments",
  authorize(["Admin"]),
  processPendingPayments,
);
printOrderRouter.get("/admin/stats", authorize(["Admin"]), getPrintOrderStats);

printOrderRouter.get(
  "/lulu/print-jobs/statistics",
  authorize(["Admin"]),
  getLuluJobStatistics,
);

printOrderRouter.get(
  "/lulu/print-jobs/:id",
  authorize(["Admin"]),
  getLuluJobDetails,
);

printOrderRouter.get(
  "/lulu/print-jobs/:id/costs",
  authorize(["Admin"]),
  getLuluJobCosts,
);
