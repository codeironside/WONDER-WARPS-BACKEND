import cors from "cors";
import { config } from "../../utils/config/index.js";
import logger from "../../utils/logger/index.js";

class CorsHandler {
  constructor() {
    this.allowedOrigins = this.parseAllowedOrigins();
    this.isDevelopment = process.env.NODE_ENV === "development";
  }

  parseAllowedOrigins() {
    const { frontendurl } = config.url;
    const { frontendev } = config.url;

    if (!frontendurl) {
      logger.warn("No frontend URL found in configuration");
      return [];
    }
    if (Array.isArray(frontendurl)) {
      return frontendurl.map((origin) => this.normalizeOrigin(origin));
    }
    if (typeof frontendurl === "string" && frontendurl.includes(",")) {
      return frontendurl
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0)
        .map((origin) => this.normalizeOrigin(origin));
    }
    if (typeof frontendurl === "string") {
      return [this.normalizeOrigin(frontendurl)];
    }

    logger.warn("Invalid frontend URL format in configuration");
    return [];
  }

  normalizeOrigin(origin) {
    if (!origin) return origin;

    return origin.replace(/\/+$/, "");
  }

  isOriginAllowed(origin) {
    if (!origin) return true;
    if (this.isDevelopment) {
      if (
        origin.includes("localhost") ||
        origin.includes("127.0.0.1") ||
        origin.startsWith("file://")
      ) {
        return true;
      }
    }
    return this.allowedOrigins.some((allowedOrigin) => {
      if (origin === allowedOrigin) return true;
      if (allowedOrigin.includes("*")) {
        const regexPattern = allowedOrigin
          .replace(/\./g, "\\.")
          .replace(/\*/g, "[a-zA-Z0-9-]+");

        const regex = new RegExp(`^https?://${regexPattern}(:\\d+)?$`);
        return regex.test(origin);
      }

      return false;
    });
  }

  getCorsOptions() {
    return {
      origin: (origin, callback) => {
        if (this.isOriginAllowed(origin)) {
          callback(null, true);
        } else {
          logger.warn(`Blocked request from unauthorized origin: ${origin}`);
          callback(new Error(`Origin ${origin} not allowed by CORS policy`));
        }
      },
      credentials: true,
      optionsSuccessStatus: 200,
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Requested-With",
        "Accept",
        "Origin",
        "X-API-Key",
        "X-CSRF-Token",
        "X-Request-ID",
      ],
      exposedHeaders: [
        "Authorization", // Added Authorization header to exposed headers
        "Content-Range",
        "X-Content-Range",
        "X-Request-ID",
        "X-RateLimit-Limit",
        "X-RateLimit-Remaining",
        "X-RateLimit-Reset",
      ],
      maxAge: this.isDevelopment ? 600 : 86400, // Shorter cache in development
      preflightContinue: false,
    };
  }

  handlePreflight() {
    return (req, res, next) => {
      if (req.method === "OPTIONS") {
        res.setHeader(
          "Access-Control-Max-Age",
          this.isDevelopment ? "600" : "86400",
        );
        res.sendStatus(200);
      } else {
        next();
      }
    };
  }

  securityHeaders() {
    return (req, res, next) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "DENY");
      res.setHeader("X-XSS-Protection", "1; mode=block");
      res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

      next();
    };
  }

  initialize() {
    return [
      cors(this.getCorsOptions()),
      this.handlePreflight(),
      this.securityHeaders(),
    ];
  }

  getAllowedOrigins() {
    return this.allowedOrigins;
  }
}

export default CorsHandler;
