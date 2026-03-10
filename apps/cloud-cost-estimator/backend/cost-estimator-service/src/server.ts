import dotenv from "dotenv";
import app from "./app";
import prisma from "./db/prisma";
import { startPricingSyncWorker } from "./workers/pricing-sync.worker";
import logger from "./utils/logger";

dotenv.config();

const port = Number(process.env.PORT ?? 4001);
const runPricingSyncWorker =
  String(process.env.RUN_PRICING_SYNC_WORKER ?? "false").toLowerCase() === "true";

const server = app.listen(port, () => {
  logger.info("Service started", {
    port,
    environment: process.env.NODE_ENV ?? "development",
    runPricingSyncWorker
  });
  if (runPricingSyncWorker) {
    startPricingSyncWorker();
  }
});

const shutdown = async (): Promise<void> => {
  logger.info("Shutdown requested");
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
