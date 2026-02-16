import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { HttpError } from "../utils/http-error.util";
import logger from "../utils/logger";

export const notFoundMiddleware = (
  _req: Request,
  _res: Response,
  next: NextFunction
): void => {
  next(new HttpError(404, "Route not found"));
};

export const errorMiddleware = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (err instanceof HttpError) {
    res.status(err.statusCode).json({
      error: {
        message: err.message,
        details: err.details ?? null
      }
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(422).json({
      error: {
        message: "Validation failed",
        details: err.flatten()
      }
    });
    return;
  }

  logger.error("Unhandled error", { error: err });
  res.status(500).json({
    error: {
      message: "Internal server error"
    }
  });
};
