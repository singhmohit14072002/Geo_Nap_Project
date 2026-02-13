"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const app_1 = __importDefault(require("./app"));
const prisma_1 = __importDefault(require("./db/prisma"));
const pricing_sync_worker_1 = require("./workers/pricing-sync.worker");
dotenv_1.default.config();
const port = Number(process.env.PORT ?? 4001);
const server = app_1.default.listen(port, () => {
    console.log(`[cost-estimator-service] running on port ${port} in ${process.env.NODE_ENV ?? "development"} mode`);
    (0, pricing_sync_worker_1.startPricingSyncWorker)();
});
const shutdown = async () => {
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
