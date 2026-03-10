import dotenv from "dotenv";
import express from "express";
import prisma from "./db/prisma";
import { metricsRegistry } from "./metrics/metrics.service";
import logger from "./utils/logger";
import { startPricingSyncWorker } from "./workers/pricing-sync.worker";

dotenv.config();

const app = express();
const port = Number(process.env.PRICING_SYNC_WORKER_PORT ?? 4011);

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    ok: true,
    service: "pricing-sync-worker",
    uptimeSeconds: Number(process.uptime().toFixed(3)),
    timestamp: new Date().toISOString()
  });
});

app.get("/metrics", async (_req, res, next) => {
  try {
    res.set("Content-Type", metricsRegistry.contentType);
    res.status(200).send(await metricsRegistry.metrics());
  } catch (error) {
    next(error);
  }
});

const server = app.listen(port, () => {
  logger.info("Pricing sync worker service started", {
    port,
    environment: process.env.NODE_ENV ?? "development"
  });
  startPricingSyncWorker();
});

const shutdown = async (): Promise<void> => {
  logger.info("Pricing sync worker shutdown requested");
  server.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});
