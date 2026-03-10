"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pricingRateLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const logger_1 = __importDefault(require("../utils/logger"));
const PRICING_RATE_LIMIT_WINDOW_MS = Number(process.env.PRICING_RATE_LIMIT_WINDOW_MS ?? "60000");
const PRICING_RATE_LIMIT_MAX = Number(process.env.PRICING_RATE_LIMIT_MAX ?? "30");
exports.pricingRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: PRICING_RATE_LIMIT_WINDOW_MS,
    max: PRICING_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: {
            message: "Too many pricing requests. Please retry after a minute."
        }
    },
    handler: (req, res, _next, options) => {
        logger_1.default.warn("RATE_LIMIT_EXCEEDED", {
            requestId: req.requestId,
            ip: req.ip,
            method: req.method,
            path: req.originalUrl,
            limit: options.max,
            windowMs: PRICING_RATE_LIMIT_WINDOW_MS
        });
        res.status(options.statusCode).json(options.message);
    }
});
