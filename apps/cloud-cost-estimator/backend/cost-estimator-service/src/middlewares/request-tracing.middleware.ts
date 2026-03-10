import { randomUUID } from "crypto";
import { NextFunction, Request, Response } from "express";
import logger from "../utils/logger";
import { runWithRequestContext } from "../utils/request-context";

const getHeaderValue = (value: string | string[] | undefined): string | null => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (Array.isArray(value) && value.length > 0 && value[0].trim().length > 0) {
    return value[0].trim();
  }
  return null;
};

const resolveRequestId = (req: Request): string => {
  const headerRequestId = getHeaderValue(req.headers["x-request-id"]);
  return headerRequestId ?? randomUUID();
};

export const requestTracingMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const requestId = resolveRequestId(req);
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);

  runWithRequestContext({ requestId }, () => {
    const startedAt = process.hrtime.bigint();
    logger.info("REQUEST_RECEIVED", {
      requestId,
      method: req.method,
      path: req.originalUrl,
      ip: req.ip
    });

    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      logger.info("AUDIT_LOG", {
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

