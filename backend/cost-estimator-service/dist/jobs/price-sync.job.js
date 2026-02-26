"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startAzurePriceSyncJob = exports.runAzurePriceSyncJob = void 0;
const logger_1 = __importDefault(require("../utils/logger"));
const azure_price_sync_service_1 = require("../services/azure-price-sync.service");
const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000;
const configuredIntervalMs = Number(process.env.AZURE_PRICE_SYNC_INTERVAL_MS ?? DAILY_INTERVAL_MS);
const AZURE_PRICE_SYNC_INTERVAL_MS = Number.isFinite(configuredIntervalMs) && configuredIntervalMs > 0
    ? configuredIntervalMs
    : DAILY_INTERVAL_MS;
const TARGET_SERVICE_FAMILIES = [
    "Virtual Machines",
    "Managed Disks",
    "Bandwidth",
    "Application Gateway"
];
let jobStarted = false;
const getErrorMessage = (error) => error instanceof Error ? error.message : String(error);
const runAzurePriceSyncJob = async () => {
    const startedAt = Date.now();
    try {
        const result = await (0, azure_price_sync_service_1.syncAzurePriceCatalogToDatabaseByFamilies)(TARGET_SERVICE_FAMILIES);
        logger_1.default.info("AZURE_PRICE_SYNC_JOB_COMPLETED", {
            durationMs: Date.now() - startedAt,
            version: result.version,
            recordsSynced: result.recordsSynced,
            serviceFamilies: result.serviceFamilies
        });
        return result;
    }
    catch (error) {
        logger_1.default.error("AZURE_PRICE_SYNC_JOB_FAILED", {
            durationMs: Date.now() - startedAt,
            error: getErrorMessage(error),
            serviceFamilies: TARGET_SERVICE_FAMILIES
        });
        throw error;
    }
};
exports.runAzurePriceSyncJob = runAzurePriceSyncJob;
const startAzurePriceSyncJob = () => {
    if (jobStarted) {
        return;
    }
    jobStarted = true;
    logger_1.default.info("AZURE_PRICE_SYNC_JOB_STARTED", {
        intervalMs: AZURE_PRICE_SYNC_INTERVAL_MS,
        serviceFamilies: TARGET_SERVICE_FAMILIES
    });
    void (0, exports.runAzurePriceSyncJob)();
    setInterval(() => {
        void (0, exports.runAzurePriceSyncJob)();
    }, AZURE_PRICE_SYNC_INTERVAL_MS);
};
exports.startAzurePriceSyncJob = startAzurePriceSyncJob;
