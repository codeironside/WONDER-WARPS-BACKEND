import User from "../../model/index.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import logger from "../../../../CORE/utils/logger/index.js";
import emailService from "../../../../CORE/services/Email/index.js";

export async function resendRegisterOTP(req, res, next) {
    try {
        const { tempUserId } = req.body;

        if (!tempUserId) {
            throw new ErrorHandler("invalid request", 400);
        }

        const result = await User.resendOTP(tempUserId);
        await emailService.sendOTPEmail(
            result.tempUser.email,
            result.tempUser.otp,
            result.tempUser.username,
        );
        logger.info(
            `Resent OTP for temp user ${tempUserId}: ${result.tempUser.otp}`,
        );

        sendResponse(res, 200, result.message, {});
    } catch (error) {
        next(error);
    }
}
