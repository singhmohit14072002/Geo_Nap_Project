"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pino_1 = __importDefault(require("pino"));
const request_context_1 = require("./request-context");
const serviceName = process.env.SERVICE_NAME ?? "cost-estimator-service";
const pinoLogger = (0, pino_1.default)({
    level: process.env.LOG_LEVEL ?? "info",
    base: {
        service: serviceName
    },
    timestamp: pino_1.default.stdTimeFunctions.isoTime,
    mixin: () => {
        const context = (0, request_context_1.getRequestContext)();
        if (!context?.requestId) {
            return {};
        }
        return { requestId: context.requestId };
    },
    formatters: {
        level: (label) => ({ level: label })
    }
});
const writeLog = (target, level, message, context) => {
    if (context === undefined) {
        target[level](message);
        return;
    }
    if (typeof context === "object" && context !== null) {
        target[level](context, message);
        return;
    }
    target[level]({ context }, message);
};
const createLogger = (target) => ({
    debug: (message, context) => {
        writeLog(target, "debug", message, context);
    },
    info: (message, context) => {
        writeLog(target, "info", message, context);
    },
    warn: (message, context) => {
        writeLog(target, "warn", message, context);
    },
    error: (message, context) => {
        writeLog(target, "error", message, context);
    }
});
const logger = createLogger(pinoLogger);
exports.default = logger;
