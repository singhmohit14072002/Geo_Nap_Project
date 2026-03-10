"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const prisma_1 = __importDefault(require("./db/prisma"));
const metrics_service_1 = require("./metrics/metrics.service");
const logger_1 = __importDefault(require("./utils/logger"));
const pricing_sync_worker_1 = require("./workers/pricing-sync.worker");
dotenv_1.default.config();
const app = (0, express_1.default)();
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
        res.set("Content-Type", metrics_service_1.metricsRegistry.contentType);
        res.status(200).send(await metrics_service_1.metricsRegistry.metrics());
    }
    catch (error) {
        next(error);
    }
});
const server = app.listen(port, () => {
    logger_1.default.info("Pricing sync worker service started", {
        port,
        environment: process.env.NODE_ENV ?? "development"
    });
    (0, pricing_sync_worker_1.startPricingSyncWorker)();
});
const shutdown = async () => {
    logger_1.default.info("Pricing sync worker shutdown requested");
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
