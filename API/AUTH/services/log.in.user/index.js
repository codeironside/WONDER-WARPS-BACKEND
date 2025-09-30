import jwt from "jsonwebtoken";
import User from "../../model/index.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import { config } from "@/config";
import logger from "../../../../CORE/utils/logger/index.js";
import emailService from "../../../../CORE/services/Email/index.js";

const JWT_SECRET = config.app.JWT_SECRET;

export async function SignIn(req, res, next) {
  const { identifier, password, staySignedIn } = req.body;

  try {
    if (!identifier || !password) {
      throw new ErrorHandler("Email and password cannot be empty.", 402);
    }

    const user = await User.signIn(identifier, password);

    if (!user) {
      throw new ErrorHandler("Invalid credentials", 404);
    }

    const expiresIn = staySignedIn
      ? config.app.session_stay_alive
      : config.app.session_doesnt_stay_alive;

    const tokenPayload = {
      id: user.id,
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn });
    res.setHeader("Authorization", `Bearer ${token}`);
    if (user.email) {
      emailService
        .sendLoginNotificationEmail(
          req,
          user.email,
          user.username || user.email,
        )
        .then(() => {
          logger.info(`Login notification email sent to ${user.email}`);
        })
        .catch((error) => {
          logger.error(
            `Failed to send login notification to ${user.email}:`,
            error,
          );
        });
    }

    sendResponse(res, 200, "User signed in successfully.", {
      user: {
        role: user.role,
        email: user.email,
        username: user.username,
      },
    });

    logger.info(`User with email ${user.email} signed in successfully`, {
      userId: user.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
  } catch (error) {
    console.log(error);
    if (error instanceof ErrorHandler) {
      next(error);
    } else {
      next(
        new ErrorHandler(
          `An unexpected error occurred during sign in.${error.message}`,
          500,
        ),
      );
    }
  }
}
