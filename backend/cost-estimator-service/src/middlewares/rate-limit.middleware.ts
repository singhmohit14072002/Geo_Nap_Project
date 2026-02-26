import rateLimit from "express-rate-limit";
import { Request, Response } from "express";
import logger from "../utils/logger";

const PRICING_RATE_LIMIT_WINDOW_MS = Number(
  process.env.PRICING_RATE_LIMIT_WINDOW_MS ?? "60000"
);
const PRICING_RATE_LIMIT_MAX = Number(process.env.PRICING_RATE_LIMIT_MAX ?? "30");

export const pricingRateLimiter = rateLimit({
  windowMs: PRICING_RATE_LIMIT_WINDOW_MS,
  max: PRICING_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      message: "Too many pricing requests. Please retry after a minute."
    }
  },
  handler: (req: Request, res: Response, _next, options) => {
    logger.warn("RATE_LIMIT_EXCEEDED", {
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

