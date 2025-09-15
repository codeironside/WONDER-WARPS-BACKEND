import cors from "cors";
import { config } from "../../utils/config/index.js";

class CorsHandler {
  constructor() {
    this.allowedOrigins = this.parseAllowedOrigins();
  }

  parseAllowedOrigins() {
    // If config.url.frontendurl is already an array, use it directly
    // If it's a string, convert it to an array
    let origins = config.url.frontendurl;

    if (!origins) {
      console.warn("No frontend URL found in config");
      return [];
    }

    // If it's already an array, return it
    if (Array.isArray(origins)) {
      return origins;
    }

    // If it's a string, split it by commas and trim each part
    if (typeof origins === "string") {
      return origins.split(",").map((origin) => origin.trim());
    }

    console.warn("Frontend URL format not recognized");
    return [];
  }

  getCorsOptions() {
    return {
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl requests)
        if (!origin) return callback(null, true);

        if (this.allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`Origin ${origin} not allowed by CORS`));
        }
      },
      credentials: true,
      optionsSuccessStatus: 200,
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Requested-With",
        "Accept",
        "Origin",
      ],
      exposedHeaders: ["Content-Range", "X-Content-Range"],
      maxAge: 86400, // 24 hours
      preflightContinue: false,
    };
  }

  handlePreflight() {
    return (req, res, next) => {
      if (req.method === "OPTIONS") {
        res.sendStatus(200);
      } else {
        next();
      }
    };
  }

  initialize() {
    return [cors(this.getCorsOptions()), this.handlePreflight()];
  }
}

export default CorsHandler;
