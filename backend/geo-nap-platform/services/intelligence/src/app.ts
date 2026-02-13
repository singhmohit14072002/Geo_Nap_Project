import express from "express";
import helmet from "helmet";
import { createLogger, toErrorPayload } from "@geo-nap/common";
import { intelligenceRouter } from "./api/routes";

const logger = createLogger("intelligence-service");

export function createApp(): express.Express {
  const app = express();
  app.use(helmet());

  app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true, service: "intelligence-service", timestamp: new Date().toISOString() });
  });

  app.use(intelligenceRouter);

  app.use((req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: `Route not found: ${req.method} ${req.originalUrl}` } });
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error({ error }, "intelligence-service request failed");
    const payload = toErrorPayload(error);
    res.status(payload.statusCode).json(payload.body);
  });

  return app;
}
