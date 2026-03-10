import { NextFunction, Request, Response } from "express";
import { observeHttpRequestDurationSeconds } from "../metrics/metrics.service";

export const metricsMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const durationNs = Number(process.hrtime.bigint() - start);
    const seconds = durationNs / 1_000_000_000;
    observeHttpRequestDurationSeconds(req.method, req.path, res.statusCode, seconds);
  });

  next();
};
