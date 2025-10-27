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

export const BookPersonalizer = Router();

//=============for admin and user both

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
  "/searchbygenre",
  authorize(["User"]),
  getPersonalizedBooksByGenre,
);
