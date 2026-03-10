import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import morgan from "morgan";
import { ZodError } from "zod";
import extractRoutes from "./routes/extract.routes";
import { metricsRegistry } from "./metrics/metrics.service";
import { metricsMiddleware } from "./middlewares/metrics.middleware";
import { HttpError } from "./utils/http-error";
import logger from "./utils/logger";

const app = express();

app.use(cors());
app.use(morgan("combined"));
app.use(express.json({ limit: "1mb" }));
app.use(metricsMiddleware);

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    ok: true,
    service: "ai-extraction-service",
    uptimeSeconds: Number(process.uptime().toFixed(3)),
    timestamp: new Date().toISOString()
  });
});

app.get("/metrics", async (_req, res, next) => {
  try {
    res.set("Content-Type", metricsRegistry.contentType);
    res.status(200).send(await metricsRegistry.metrics());
  } catch (err) {
    next(err);
  }
});

app.use("/", extractRoutes);

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
