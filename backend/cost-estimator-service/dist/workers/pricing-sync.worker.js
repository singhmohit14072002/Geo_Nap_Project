"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startPricingSyncWorker = void 0;
const pricing_sync_service_1 = require("../services/pricing-sync.service");
const metrics_service_1 = require("../metrics/metrics.service");
const logger_1 = __importDefault(require("../utils/logger"));
const DEFAULT_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
const configuredInterval = Number(process.env.PRICING_SYNC_INTERVAL_MS ?? DEFAULT_SYNC_INTERVAL_MS);
const PRICING_SYNC_INTERVAL_MS = Number.isFinite(configuredInterval) && configuredInterval > 0
    ? configuredInterval
    : DEFAULT_SYNC_INTERVAL_MS;
let workerStarted = false;
const extractError = (value) => {
    if (value instanceof Error) {
        return value.message;
    }
    return String(value);
};
const runProviderSync = async (provider, fn) => {
    const started = process.hrtime.bigint();
    try {
        const result = await fn();
        const durationSeconds = Number(process.hrtime.bigint() - started) / 1000000000;
        (0, metrics_service_1.observePricingSyncDurationSeconds)(provider, "success", durationSeconds);
        return { provider, durationSeconds, result };
    }
    catch (error) {
        const durationSeconds = Number(process.hrtime.bigint() - started) / 1000000000;
        (0, metrics_service_1.observePricingSyncDurationSeconds)(provider, "failed", durationSeconds);
        throw Object.assign(error instanceof Error ? error : new Error(extractError(error)), {
            provider,
            durationSeconds
        });
    }
};
const runSync = async () => {
    const [azureResult, awsResult, gcpResult] = await Promise.allSettled([
        runProviderSync("azure", pricing_sync_service_1.syncAzurePricingToDatabase),
        runProviderSync("aws", pricing_sync_service_1.syncAwsPricingToDatabase),
        runProviderSync("gcp", pricing_sync_service_1.syncGcpPricingToDatabase)
    ]);
    if (azureResult.status === "fulfilled") {
        logger_1.default.info("Pricing sync completed", {
            provider: "azure",
            durationSeconds: azureResult.value.durationSeconds,
            version: azureResult.value.result.version,
            recordsSynced: azureResult.value.result.recordsSynced,
            regions: azureResult.value.result.regions
        });
    }
    else {
        logger_1.default.error("Pricing sync failed", {
            provider: "azure",
            error: extractError(azureResult.reason)
        });
    }
    if (awsResult.status === "fulfilled") {
        logger_1.default.info("Pricing sync completed", {
            provider: "aws",
            durationSeconds: awsResult.value.durationSeconds,
            version: awsResult.value.result.version,
            recordsSynced: awsResult.value.result.recordsSynced,
            regions: awsResult.value.result.regions
        });
    }
    else {
        logger_1.default.error("Pricing sync failed", {
            provider: "aws",
            error: extractError(awsResult.reason)
        });
    }
    if (gcpResult.status === "fulfilled") {
        logger_1.default.info("Pricing sync completed", {
            provider: "gcp",
            durationSeconds: gcpResult.value.durationSeconds,
            version: gcpResult.value.result.version,
            recordsSynced: gcpResult.value.result.recordsSynced,
            regions: gcpResult.value.result.regions
        });
    }
    else {
        logger_1.default.error("Pricing sync failed", {
            provider: "gcp",
            error: extractError(gcpResult.reason)
        });
    }
};
const startPricingSyncWorker = () => {
    if (workerStarted) {
        return;
    }
    workerStarted = true;
    logger_1.default.info("Pricing sync worker started", {
        intervalMs: PRICING_SYNC_INTERVAL_MS
    });
    void runSync();
    setInterval(() => {
        void runSync();
    }, PRICING_SYNC_INTERVAL_MS);
};
exports.startPricingSyncWorker = startPricingSyncWorker;
