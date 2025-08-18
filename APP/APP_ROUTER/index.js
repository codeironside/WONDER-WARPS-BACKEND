import { Router } from "express";
import { UserRouter } from "../../API/USERS/routes/index.js";

export const apiRouter = Router()

apiRouter.use('/users', UserRouter)





 
