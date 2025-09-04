import logger from "@/logger";
import { db } from "@/db";
let server;

export function handleShutdown(signal) {
  logger.info(`${signal} received. Starting graceful shutdown...`);
  if (server) {
    server.close(() => {
      logger.info("HTTP server closed.");
      db.destroy()
        .then(() => {
          logger.info("Database connection closed.");
          process.exit(0);
        })
        .catch((err) => {
          logger.error("Error closing database connection:", err);
          process.exit(1);
        });
    });
  } else {
    db.destroy()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  }
}
