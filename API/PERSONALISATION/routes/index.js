import { Router } from "express";
import { personalizeBook } from "../services/USERS/personalised.book.template/index.js";
import { authorize } from "../../../CORE/middleware/authmiddleware/index.js";
import { getAdminUserPersonalizedBooks } from "../services/ADMIN/get.all.by.one.user/index.js";
import { getAdminPersonalizedBooks } from "../services/ADMIN/get.all.for.admin/index.js";
import { getGenreStatistics } from "../services/ADMIN/get.genre.statistics/index.js";
import { getAdminAllPersonalizedBooks } from "../services/ADMIN/get.one.admin.advanced.filtering/index.js";
import { getAdminPersonalizedBook } from "../services/ADMIN/get.one.book.for.admin/index.js";
import { getPaymentStatistics } from "../services/ADMIN/get.payment.statistics/index.js";
import { getALLUserPersonalizedBooks } from "../services/USERS/get.all.for.users/index.js";
import { getUserPersonalizedBook } from "../services/USERS/get.one.for.user/index.js";
import { getPersonalizedBooksByGenre } from "../services/USERS/search.by.genre/index.js";
import { updateDedicationMessage } from "../services/USERS/add.dedication.messsage/index.js";
import { getPrintDataToDownload } from "../services/USERS/printdatatodownload/index.js";
import { sendGift } from "../services/USERS/gift.a.friend/index.js";
import { redeemGift } from "../services/USERS/claim.a.gift/index.js";
import { saveShippingDetails } from "../services/USERS/shipping/index.js";
import { updateBookProcessedStatus } from "../services/ADMIN/updateisshippingprocess/index.js";
import { getPrintDataToDownloadAdmin } from "../services/ADMIN/printdatatdownloadAdmin/index.js";

export const BookPersonalizer = Router();

//=============for admin and user both
BookPersonalizer.patch(
  "/ship/:bookId/shipping",
  authorize(["Admin", "User"]),
  saveShippingDetails,
);

BookPersonalizer.post(
  "/personalisebooktemplate",
  authorize(["Admin", "User"]),
  personalizeBook,
);

BookPersonalizer.patch(
  "/:bookId/dedication",
  authorize(["User", "Admin"]),
  updateDedicationMessage,
);

BookPersonalizer.post(
  "/giftafriend/:bookId",
  authorize(["User", "Admin"]),
  sendGift,
);
BookPersonalizer.post("/redeem-gift", authorize(["User", "Admin"]), redeemGift);
//=========for admin
BookPersonalizer.get(
  "/admin/getallforuser/:userId",
  authorize(["Admin"]),
  getAdminUserPersonalizedBooks,
);
BookPersonalizer.get(
  "/admin/getallforadmin",
  authorize(["Admin"]),
  getAdminPersonalizedBooks,
);
BookPersonalizer.get(
  "/admnin/getgenrestatistics",
  authorize(["Admin"]),
  getGenreStatistics,
);
BookPersonalizer.patch(
  "/:bookId/process",
  authorize(["Admin"]),
  updateBookProcessedStatus,
);
BookPersonalizer.get(
  "/admin/advancedfiltering",
  authorize(["Admin"]),
  getAdminAllPersonalizedBooks,
);
BookPersonalizer.get(
  "/admin/onebook/:id",
  authorize(["Admin"]),
  getAdminPersonalizedBook,
);
BookPersonalizer.get(
  "/admin/paymentstatistics",
  authorize(["Admin"]),
  getPaymentStatistics,
);
//===========for user
BookPersonalizer.get(
  "/allforoneuser",
  authorize(["User", "Admin"]),
  getALLUserPersonalizedBooks,
);
BookPersonalizer.get(
  "/oneforoneuser",
  authorize(["User", "Admin"]),
  getUserPersonalizedBook,
);
BookPersonalizer.get(
  "/printdatatodownload/:id",
  authorize(["User", "Admin"]),
  getPrintDataToDownload,
);
BookPersonalizer.get(
  "/admin/printdatatodownload/:id",
  authorize(["Admin"]),
  getPrintDataToDownloadAdmin,
);
BookPersonalizer.get(
  "/searchbygenre",
  authorize(["User"]),
  getPersonalizedBooksByGenre,
);
