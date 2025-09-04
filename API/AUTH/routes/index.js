import { Router } from "express";
import { createUser } from "../services/create.new.user/index.js";
import { SignIn } from "../services/log.in.user/index.js";
import { emailForForgetPassword } from "../services/email.for.forget.password/index.js";
import { verifyOtpAndResetPassword } from "../services/verify.otp/index.js";
import { signOut } from "../services/log.out.a.user/index.js";


export const UserRouter = Router()
//=======public routes
UserRouter.post("/public/signup", createUser)
UserRouter.post('/public/login', SignIn)
UserRouter.post('/public/forgot-password', emailForForgetPassword)
UserRouter.post('/public/verify-otp',verifyOtpAndResetPassword) 
UserRouter.post('/public/logout',signOut)