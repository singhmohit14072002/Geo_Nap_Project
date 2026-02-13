import dotenv from "dotenv";
import app from "./app";
import prisma from "./db/prisma";
import { startPricingSyncWorker } from "./workers/pricing-sync.worker";

dotenv.config();

const port = Number(process.env.PORT ?? 4001);

const server = app.listen(port, () => {
  console.log(
    `[cost-estimator-service] running on port ${port} in ${process.env.NODE_ENV ?? "development"} mode`
  );
  startPricingSyncWorker();
});

const shutdown = async (): Promise<void> => {
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
