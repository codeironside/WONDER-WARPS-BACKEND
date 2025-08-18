import { Router } from "express";
import { createUser } from "../services/create.new.user/index.js";


export const UserRouter = Router()

UserRouter.post("/signup", createUser)