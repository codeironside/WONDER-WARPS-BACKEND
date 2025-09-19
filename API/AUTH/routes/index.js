import { Router } from "express";
import { createUser } from "../services/create.new.user/index.js";
import { SignIn } from "../services/log.in.user/index.js";
import { emailForForgetPassword } from "../services/email.for.forget.password/index.js";
import { verifyOtpAndResetPassword } from "../services/verify.otp.for.password.reset/index.js";
import { signOut } from "../services/log.out.a.user/index.js";
import { authorize } from "../../../CORE/middleware/authmiddleware/index.js";
import { getAdminDashboard } from "../services/ADMIN/admin.dashboard/index.js";
import { getUserDashboard } from "../services/get.user.dashboard/index.js";
import { registerWithOTP } from "../services/register.with.otp/index.js";
import { resendRegisterOTP } from "../services/resend.register.OTP/index.js";
import { verifyRegisterOTP } from "../services/verify.otp/index.js";
export const UserRouter = Router();
//=======public routes

UserRouter.post("/public/login", SignIn);
UserRouter.post("/public/forgot-password", emailForForgetPassword);
UserRouter.post("/public/verify-otp", verifyOtpAndResetPassword);
UserRouter.post("/public/logout", signOut);
UserRouter.post("/public/signup", registerWithOTP);
UserRouter.post("/public/resendregisterotp", resendRegisterOTP);
UserRouter.post("/public/verifyregisterotp", verifyRegisterOTP);

//=============ADMIN routes

UserRouter.get("/admin/dashboard", authorize(["Admin"]), getAdminDashboard);
UserRouter.post("/admin/signup", authorize(["Admin"]), createUser);

//===============USER routes

UserRouter.get(
  "/user/dashboard",
  authorize(["Admin", "User"]),
  getUserDashboard,
);
