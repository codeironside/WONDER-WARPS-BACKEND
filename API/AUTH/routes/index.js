import { Router } from "express";
import { createUser } from "../services/create.new.user/index.js";
import { SignIn } from "../services/log.in.user/index.js";
import { requestPasswordReset } from "../services/forget.password/index.js";
import { signOut } from "../services/log.out.a.user/index.js";
import { authorize } from "../../../CORE/middleware/authmiddleware/index.js";
import { getAdminDashboard } from "../services/ADMIN/admin.dashboard/index.js";
import { getUserDashboard } from "../services/get.user.dashboard/index.js";
import { registerWithOTP } from "../services/register.with.otp/index.js";
import { resendRegisterOTP } from "../services/resend.register.OTP/index.js";
import { verifyRegisterOTP } from "../services/verify.otp/index.js";
import { verifyPasswordResetOTP } from "../services/verify.otp.for.password.reset/index.js";
import { resendPasswordResetOTP } from "../services/resend.password.otp/index.js";
import { resetPassword } from "../services/reset.password/index.js";
export const UserRouter = Router();

//=======public routes
UserRouter.post("/public/login", SignIn);
UserRouter.post("/public/forgotpassword", requestPasswordReset);
UserRouter.post("/public/resendpasswordotp", resendPasswordResetOTP);
UserRouter.post("/public/verifypasswordresetotp", verifyPasswordResetOTP);
UserRouter.post("/public/resetPassword", resetPassword)
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
