import { Router } from "express";
import { UserRouter } from "../../API/AUTH/routes/index.js";
import { BookTemplateRouter } from "../../API/BOOK_TEMPLATE/routes/index.js";
import { RoleRouter } from "../../API/ROLES/route/index.js";
import { BookPersonalizer } from "../../API/PERSONALISATION/routes/index.js";
import { fileRouter } from "../../API/FILES/routes/index.js";
import { PaymentRouter } from "../../API/PAYMENT/routes/index.js";
import { printOrderRouter } from "../../API/PRINTANDDELIVERSERVICE/routes/index.js";

export const apiRouter = Router();

apiRouter.use("/users", UserRouter);
apiRouter.use("/book", BookTemplateRouter);
apiRouter.use("/role", RoleRouter);
apiRouter.use("/file", fileRouter);
apiRouter.use("/personalization", BookPersonalizer);
apiRouter.use("/payment", PaymentRouter);
apiRouter.use("/printorder", printOrderRouter);
