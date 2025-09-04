import rateLimit from "express-rate-limit";
import logger from "@/logger";
import winston from "winston";

const rateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  message: {
    status: "error",
    message: "Too many requests, please try again later.",
    data: null,
  },
  handler: (req, res, next, options) => {
    logger.warn(
      `Rate limit exceeded for IP: ${req.ip} - ${req.method} ${req.originalUrl}`,
    );
    res.status(options.statusCode).send(options.message);
  },
  legacyHeaders: false,
  standardHeaders: true,
});

const logRequest = (req, res, next) => {
  const logDetails = {
    ip: req.ip,
    method: req.method,
    url: req.originalUrl,
    status: res.statusCode,
    timestamp: new Date().toISOString(),
  };

  logger.info(`Request log: ${JSON.stringify(logDetails)}`);

  next();
};

const flagMaliciousRequests = (req, res, next) => {
  if (
    req.method === "POST" &&
    req.originalUrl.includes("/login") &&
    res.statusCode === 401
  ) {
    const ip = req.ip;
    logger.warn(
      `Malicious activity detected: Multiple failed login attempts from IP: ${ip}`,
    );
  }

  next();
};

export const applyRateLimit = rateLimiter;
export const logEveryRequest = logRequest;
export const flagMaliciousActivity = flagMaliciousRequests;
