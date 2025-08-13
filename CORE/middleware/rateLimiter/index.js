const rateLimit = require('express-rate-limit');
const winston = require('winston');
const logger = require('@logger');


const rateLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, 
    max: 100,                 
    message: {
        status: 'error',
        message: 'Too many requests, please try again later.',
        data: null
    },
    headers: true,        
    onLimitReached: (req, res, options) => {
        logger.warn(`Rate limit exceeded for IP: ${req.ip} - ${req.method} ${req.originalUrl}`);
    }
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

    if (res.statusCode === 429) {
        logger.warn(`Suspicious request detected: IP ${req.ip} exceeded rate limit.`);
    }
    next();
};


const flagMaliciousRequests = (req, res, next) => {
    if (req.method === 'POST' && req.originalUrl.includes('/login') && res.statusCode === 401) {
        const ip = req.ip;

        logger.warn(`Malicious activity detected: Multiple failed login attempts from IP: ${ip}`);
    }

    next();
};


const applyRateLimit = rateLimiter;
const logEveryRequest = logRequest;
const flagMaliciousActivity = flagMaliciousRequests;

module.exports = { applyRateLimit, logEveryRequest, flagMaliciousActivity };
