import jwt from "jsonwebtoken";
import User from "../../model/index.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../CORE/utils/logger/index.js";
import otpGenerator from "../../../../CORE/services/otp.generator/index.js";
import { config } from "../../../../CORE/utils/config/index.js";

const JWT_SECRET = config.app.JWT_SECRET;

export const emailForForgetPassword = async (req, res) => {
  const { email } = req.body;
  try {
    if (!email) throw new ErrorHandler(`email can not be empty`, 402);
    const user = await User.findByEmail(email);
    const otp = await otpGenerator.generateOtp(user.id);

    const temporaryToken = jwt.sign({ userId: user.id }, JWT_SECRET, {
      expiresIn: "30s",
    });

    res.setHeader("Authorization", `Bearer ${temporaryToken}`);
    sendResponse(res, 200, "Otp sent please check your email.", {});
    logger.info(`otp sent to user:-${email}`);
  } catch (error) {
    if (error instanceof ErrorHandler) {
      next(error);
    } else {
      next(new ErrorHandler("error sending Otp", 500));
    }
  }
};
