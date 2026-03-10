"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestTracingMiddleware = void 0;
const crypto_1 = require("crypto");
const logger_1 = __importDefault(require("../utils/logger"));
const request_context_1 = require("../utils/request-context");
const getHeaderValue = (value) => {
    if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
    }
    if (Array.isArray(value) && value.length > 0 && value[0].trim().length > 0) {
        return value[0].trim();
    }
    return null;
};
const resolveRequestId = (req) => {
    const headerRequestId = getHeaderValue(req.headers["x-request-id"]);
    return headerRequestId ?? (0, crypto_1.randomUUID)();
};
const requestTracingMiddleware = (req, res, next) => {
    const requestId = resolveRequestId(req);
    req.requestId = requestId;
    res.setHeader("x-request-id", requestId);
    (0, request_context_1.runWithRequestContext)({ requestId }, () => {
        const startedAt = process.hrtime.bigint();
        logger_1.default.info("REQUEST_RECEIVED", {
            requestId,
            method: req.method,
            path: req.originalUrl,
            ip: req.ip
        });
        res.on("finish", () => {
            const durationMs = Number(process.hrtime.bigint() - startedAt) / 1000000;
            logger_1.default.info("AUDIT_LOG", {
                requestId,
                method: req.method,
                path: req.originalUrl,
                statusCode: res.statusCode,
                durationMs: Number(durationMs.toFixed(2)),
                ip: req.ip
            });
        });
        next();
    });
};
exports.requestTracingMiddleware = requestTracingMiddleware;
