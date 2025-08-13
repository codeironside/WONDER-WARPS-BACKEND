const winston = require('winston');
require('winston-daily-rotate-file'); 
// Define the log levels and their prioritie
const logLevels = {
    levels: {
        error: 0,
        warn: 1,
        info: 2,
        debug: 3
    },
    colors: {
        error: 'red',
        warn: 'yellow',
        info: 'green',
        debug: 'blue'
    }
};
const logger = winston.createLogger({
    levels: logLevels.levels,
    transports: [
        new winston.transports.Console({
            level: process.env.NODE_ENV === 'development' ? 'debug' : 'info', 
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                winston.format.printf(({ timestamp, level, message }) => {
                    return `[${timestamp}] ${level}: ${message}`;
                })
            )
        }),
        new winston.transports.DailyRotateFile({
            filename: 'logs/app-%DATE%.log',
            level: 'info',
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',  // Max file size before rotating
            maxFiles: '7d',  // Keep logs for 7 days
            format: winston.format.combine(
                winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                winston.format.printf(({ timestamp, level, message }) => {
                    return `[${timestamp}] ${level}: ${message}`;
                })
            )
        })
    ],
    // Optionally add a log level filter globally
    exitOnError: false // Do not exit the process on logging error
});

// Add colors for log levels in the console
winston.addColors(logLevels.colors);

module.exports = logger;
