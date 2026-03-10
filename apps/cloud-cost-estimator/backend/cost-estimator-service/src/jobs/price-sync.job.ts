import logger from "../utils/logger";
import { syncAzurePriceCatalogToDatabaseByFamilies } from "../services/azure-price-sync.service";

const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000;
const configuredIntervalMs = Number(
  process.env.AZURE_PRICE_SYNC_INTERVAL_MS ?? DAILY_INTERVAL_MS
);
const AZURE_PRICE_SYNC_INTERVAL_MS =
  Number.isFinite(configuredIntervalMs) && configuredIntervalMs > 0
    ? configuredIntervalMs
    : DAILY_INTERVAL_MS;

const TARGET_SERVICE_FAMILIES = [
  "Virtual Machines",
  "Managed Disks",
  "Bandwidth",
  "Application Gateway"
] as const;

let jobStarted = false;

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export interface AzurePriceSyncJobResult {
  version: string;
  recordsSynced: number;
  serviceFamilies: string[];
}

export const runAzurePriceSyncJob = async (): Promise<AzurePriceSyncJobResult> => {
  const startedAt = Date.now();
  try {
    const result = await syncAzurePriceCatalogToDatabaseByFamilies(TARGET_SERVICE_FAMILIES);
    logger.info("AZURE_PRICE_SYNC_JOB_COMPLETED", {
      durationMs: Date.now() - startedAt,
      version: result.version,
      recordsSynced: result.recordsSynced,
      serviceFamilies: result.serviceFamilies
    });
    return result;
  } catch (error) {
    logger.error("AZURE_PRICE_SYNC_JOB_FAILED", {
      durationMs: Date.now() - startedAt,
      error: getErrorMessage(error),
      serviceFamilies: TARGET_SERVICE_FAMILIES
    });
    throw error;
  }
};

export const startAzurePriceSyncJob = (): void => {
  if (jobStarted) {
    return;
  }
  jobStarted = true;

  logger.info("AZURE_PRICE_SYNC_JOB_STARTED", {
    intervalMs: AZURE_PRICE_SYNC_INTERVAL_MS,
    serviceFamilies: TARGET_SERVICE_FAMILIES
  });

  void runAzurePriceSyncJob();
  setInterval(() => {
    void runAzurePriceSyncJob();
  }, AZURE_PRICE_SYNC_INTERVAL_MS);
};
