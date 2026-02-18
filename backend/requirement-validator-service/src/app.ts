import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import morgan from "morgan";
import { ZodError } from "zod";
import validatorRoutes from "./routes/validator.routes";
import { HttpError } from "./utils/http-error";
import logger from "./utils/logger";

const app = express();

app.use(cors());
app.use(morgan("combined"));
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "requirement-validator-service",
    timestamp: new Date().toISOString()
  });
});

app.use("/", validatorRoutes);

app.use((_req, res) => {
  res.status(404).json({
    error: "Not Found"
  });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.statusCode).json({
      error: err.message,
      details: err.details
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(422).json({
      error: "Validation error",
      details: err.flatten()
    });
    return;
  }

  const message = err instanceof Error ? err.message : "Internal server error";
  logger.error("Unhandled error", { error: err });
  res.status(500).json({
    error: message
  });
});

export default app;

