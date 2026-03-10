import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { createLogger, toErrorPayload } from "@geo-nap/common";
import { requirementNormalizerRouter } from "./api/routes";

const logger = createLogger("requirement-normalizer-service");

export function createApp(): express.Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors());
  app.use(compression());
  app.use(express.json({ limit: "1mb" }));
  app.use(pinoHttp({ logger }));

  app.get("/health", (_req, res) => {
    res.status(200).json({
      ok: true,
      service: "requirement-normalizer-service",
      timestamp: new Date().toISOString()
    });
  });

  app.use(requirementNormalizerRouter);

  app.use((req, res) => {
    res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: `Route not found: ${req.method} ${req.originalUrl}`
      }
    });
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error({ error }, "requirement-normalizer-service request failed");
    const payload = toErrorPayload(error);
    res.status(payload.statusCode).json(payload.body);
  });

  return app;
}
