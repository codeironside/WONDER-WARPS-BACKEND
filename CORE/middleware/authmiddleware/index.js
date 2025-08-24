import jwt from 'jsonwebtoken';
import User from '../../../API/USERS/model';
const JWT_SECRET = 'YOUR_JWT_SECRET_KEY';
import ErrorHandler from '../errorhandler/index.js';
import logger from '../../utils/logger/index.js';


export const authorize = (allowedRoles) => {
    return async (req, res, next) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new ErrorHandler('Authorization header is missing or invalid.', 401);
        }

        const token = authHeader.split(' ')[1];

        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            const { userId } = decoded;
            const user = await User.findById(userId);
            if (!user) {
                
                throw new ErrorHandler('User not found', 401);
            }

            if (!allowedRoles.includes(user.role)) {
                throw new ErrorHandler(' you do not have the permissions to perform this action', 403);
            }

            logger.warn(`user with ID ${userId} accessed a protected route with role ${user.role}`);
            req.user = user;

            next();
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                throw new ErrorHandler('Access token has expired.', 401);
            } else if (error.name === 'JsonWebTokenError') {
               throw new ErrorHandler('Invalid access token.', 401);
            } else {
                throw new ErrorHandler('An internal server error occurred.', 500);
            }
        }
    };
};

