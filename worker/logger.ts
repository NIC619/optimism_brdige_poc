import path from "path";
import winston from "winston";

const {
    format: { combine, printf, timestamp },
} = winston;

const logger = winston.createLogger({
    level: "info",
    format: combine(
        timestamp(),
        printf(({ level, message, label, timestamp, ...meta }) => {
            return `[${level}][${timestamp}] ${message} ${Object.keys(meta).length > 0 ? JSON.stringify(meta) : ""
                }`;
        })
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({
            filename: path.resolve(__dirname, "worker.log"),
        }),
    ],
});

export default logger;