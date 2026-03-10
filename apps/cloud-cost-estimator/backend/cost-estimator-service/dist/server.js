"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const app_1 = __importDefault(require("./app"));
const prisma_1 = __importDefault(require("./db/prisma"));
const pricing_sync_worker_1 = require("./workers/pricing-sync.worker");
const logger_1 = __importDefault(require("./utils/logger"));
dotenv_1.default.config();
const port = Number(process.env.PORT ?? 4001);
const runPricingSyncWorker = String(process.env.RUN_PRICING_SYNC_WORKER ?? "false").toLowerCase() === "true";
const server = app_1.default.listen(port, () => {
    logger_1.default.info("Service started", {
        port,
        environment: process.env.NODE_ENV ?? "development",
        runPricingSyncWorker
    });
    if (runPricingSyncWorker) {
        (0, pricing_sync_worker_1.startPricingSyncWorker)();
    }
});
const shutdown = async () => {
    logger_1.default.info("Shutdown requested");
    server.close();
    await prisma_1.default.$disconnect();
    process.exit(0);
};
process.on("SIGINT", () => {
    void shutdown();
});
process.on("SIGTERM", () => {
    void shutdown();
});
