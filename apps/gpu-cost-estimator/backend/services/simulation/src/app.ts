import express from "express";
import helmet from "helmet";

export function createApp(): express.Express {
  const app = express();
  app.use(helmet());

  app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true, service: "simulation-service", timestamp: new Date().toISOString() });
  });

  return app;
}
