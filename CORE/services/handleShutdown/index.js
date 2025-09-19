import logger from "@/logger";
import mongoose from "../db/index.js";
let server;

export function handleShutdown(signal) {
  logger.info(`${signal} received. Starting graceful shutdown...`);
  if (server) {
    server.close(() => {
      logger.info("HTTP server closed.");
      mongoose.connection.close(() => {
        try {
          logger.info("Database connection closed.");
          process.exit(1);
        } catch (err) {
          logger.error("Error closing database connection:", err);
          process.exit(0);
        }
      });
    });
  } else {
    try {
      logger.info("Database connection closed.");
      process.exit(1);
    } catch (err) {
      logger.error("Error closing database connection:", err);
      process.exit(0);
    }
  }
}
