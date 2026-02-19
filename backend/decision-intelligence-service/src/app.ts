import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import morgan from "morgan";
import { ZodError } from "zod";
import decisionRoutes from "./routes/decision.routes";
import { HttpError } from "./utils/http-error";
import logger from "./utils/logger";

const app = express();

app.use(cors());
app.use(morgan("combined"));
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "decision-intelligence-service",
    timestamp: new Date().toISOString()
  });
});

app.use("/", decisionRoutes);

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

  logger.error("UNHANDLED_ERROR", { error: err });
  res.status(500).json({
    error: err instanceof Error ? err.message : "Internal server error"
  });
});

export default app;

