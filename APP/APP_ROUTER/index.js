import { Router } from "express";
import { UserRouter } from "../../API/AUTH/routes/index.js";
import { BookTemplateRouter } from "../../API/BOOK_TEMPLATE/routes/index.js";
import { RoleRouter } from "../../API/ROLES/route/index.js";

export const apiRouter = Router();

apiRouter.use("/users", UserRouter);
apiRouter.use("/book", BookTemplateRouter);
apiRouter.use("/role", RoleRouter);
