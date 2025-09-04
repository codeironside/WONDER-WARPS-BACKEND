import logger from "@/logger";

class ErrorHandler extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);

    if (process.env.NODE_ENV === "development") {
      logger.error(
        `Error occurred at ${this.timestamp}: ${message}\nStack Trace: ${this.stack}`,
      );
    } else if (process.env.NODE_ENV === "production") {
      logger.error(`Error occurred at ${this.timestamp}: ${message}`);
    }
  }

  static handleValidationError(errors) {
    return new ErrorHandler(`Validation failed: ${errors.join(", ")}`, 400);
  }

  static handleNotFoundError(message = "Resource not found") {
    return new ErrorHandler(message, 404); // HTTP status code for Not Found
  }

  static handleUnauthorizedError(message = "Unauthorized access") {
    return new ErrorHandler(message, 401);
  }

  static handleInternalServerError(message = "Internal server error") {
    return new ErrorHandler(message, 500);
  }
}

export default ErrorHandler;
