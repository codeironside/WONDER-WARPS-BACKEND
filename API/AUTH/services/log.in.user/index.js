// APP/APP_ROUTER/controllers/userController.js

import jwt from "jsonwebtoken";
import User from "../../model/index.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import { config } from "@/config";
import logger from "../../../../CORE/utils/logger/index.js";

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
    sendResponse(res, 200, "User signed in successfully.", {
      user: {
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        username: user.username,
        phonenumber: user.phonenumber,
      },
    });
    logger.info(`user with email:-${email} signed in successfully`);
  } catch (error) {
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
