import {
    createLogger,
    format,
    config,
    transports,
} from "winston";
import "winston-daily-rotate-file";
import * as path from "path";
import { fileURLToPath } from "url";

const { combine, timestamp, printf, colorize, errors } = format;

// Helper function to get the current directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const customLevels = {
    levels: {
        error: 0,
        warn: 1,
        info: 2,
        http: 3,
        verbose: 4,
        debug: 5,
        silly: 6,
    },
    colors: {
        error: "red",
        warn: "yellow",
        info: "green",
        http: "magenta",
        verbose: "cyan",
        debug: "blue",
        silly: "gray",
    },
};
config.addColors(customLevels.colors);

const dailyTransport = new transports.DailyRotateFile({
    dirname: path.join(__dirname, "../../../logs"),
    filename: "application-%DATE%.log",
    datePattern: "YYYY-MM-DD",
    zippedArchive: true,
    maxSize: "20m",
    maxFiles: "14d",
    level: "info",
    format: combine(
        timestamp(),
        printf((info) => `${info.timestamp} [${info.level}]: ${info.message}`)
    ),
});
dailyTransport.on("error", (err) => {
    console.error(`[Logger Transport Error] ${err.message}`);
});

class logger {
    constructor() {
        this.logger = createLogger({
            levels: customLevels.levels,
            level: "debug",
            format: combine(
                errors({ stack: true }),
                timestamp(),
                printf(
                    ({ timestamp, level, message, stack }) =>
                        `${timestamp} [${level}]: ${stack ?? message}`
                )
            ),
            transports: [
                new transports.Console({
                    level: "debug",
                    format: combine(
                        colorize({ all: true }),
                        timestamp(),
                        printf(
                            ({ timestamp, level, message }) =>
                                `${timestamp} [${level}]: ${message}`
                        )
                    ),
                }),
                dailyTransport,
            ],
            exceptionHandlers: [
                new transports.File({ filename: path.join(__dirname, "../../../logs", "exceptions.log") }),
            ],
            rejectionHandlers: [
                new transports.File({ filename: path.join(__dirname, "../../../logs", "rejections.log") }),
            ],
            exitOnError: false,
        });
    }

    error(msg) {
        this.logger.error(msg);
    }
    warn(msg) {
        this.logger.warn(msg);
    }
    info(msg) {
        this.logger.info(msg);
    }
    debug(msg) {
        this.logger.debug(msg);
    }
    silly(msg) {
        this.logger.silly(msg);
    }
    http(msg) {
        this.logger.http(msg);
    }
    verbose(msg) {
        this.logger.verbose(msg);
    }
}
export default new logger();
