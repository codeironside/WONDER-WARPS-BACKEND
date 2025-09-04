// APP/APP_ROUTER/controllers/userController.js

import jwt from 'jsonwebtoken';
import User from '../../model/index.js';
import ErrorHandler from '../../../../CORE/middleware/errorhandler/index.js';
import { sendResponse } from '../../../../CORE/utils/response.handler/index.js';
import { config } from '@/config';
import logger from '../../../../CORE/utils/logger/index.js';
import otpGenerator from '../../../../CORE/services/otp.generator/index.js';
import bcrypt from 'bcrypt';

const JWT_SECRET = config.app.JWT_SECRET;

export const verifyOtpAndResetPassword = async (req, res, next) => {
    const { otp, newPassword } = req.body;
    const authHeader = req.headers.authorization;

    try {
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new ErrorHandler('Missing or invalid authorization header.', 401);
        }

        const temporaryToken = authHeader.split(' ')[1];

        if (!otp || !newPassword) {
            throw new ErrorHandler('Missing OTP or new password.', 402);
        }

        const decodedToken = jwt.verify(temporaryToken, JWT_SECRET);
        const userId = decodedToken.userId;
        const isValid = await otpGenerator.verifyOTP(userId, otp);

        if (!isValid) {
            throw new ErrorHandler('Invalid or expired OTP.', 401);
        }
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await User.update(userId, { password: hashedPassword });
        sendResponse(res, 200, 'Password has been successfully reset. please log in your account', {});
    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError) {
            next(new ErrorHandler('Invalid or expired token.', 401));
        } else if (error instanceof ErrorHandler) {
            next(error);
        } else {
            next(new ErrorHandler('An unexpected error occurred.', 500));
        }
    }
};
