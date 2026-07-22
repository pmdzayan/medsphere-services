"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServiceLogger = createServiceLogger;
const winston_1 = require("winston");
function createServiceLogger(serviceName) {
    const logger = (0, winston_1.createLogger)({
        level: process.env.LOG_LEVEL ?? 'info',
        format: winston_1.format.combine(winston_1.format.timestamp(), winston_1.format.errors({ stack: true }), winston_1.format.json()),
        defaultMeta: {
            service: serviceName,
        },
        transports: [new winston_1.transports.Console()],
    });
    return {
        log: (message, meta) => logger.info(message, meta),
        info: (message, meta) => logger.info(message, meta),
        warn: (message, meta) => logger.warn(message, meta),
        debug: (message, meta) => logger.debug(message, meta),
        error: (message, error, meta) => logger.error(message, {
            ...meta,
            error,
        }),
    };
}
//# sourceMappingURL=index.js.map