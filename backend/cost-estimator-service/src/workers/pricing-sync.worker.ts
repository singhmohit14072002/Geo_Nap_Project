import {
  syncAwsPricingToDatabase,
  syncAzurePricingToDatabase,
  syncGcpPricingToDatabase
} from "../services/pricing-sync.service";
import { observePricingSyncDurationSeconds } from "../metrics/metrics.service";
import logger from "../utils/logger";

const DEFAULT_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
const configuredInterval = Number(
  process.env.PRICING_SYNC_INTERVAL_MS ?? DEFAULT_SYNC_INTERVAL_MS
);
const PRICING_SYNC_INTERVAL_MS =
  Number.isFinite(configuredInterval) && configuredInterval > 0
    ? configuredInterval
    : DEFAULT_SYNC_INTERVAL_MS;

let workerStarted = false;

const extractError = (value: unknown): string => {
  if (value instanceof Error) {
    return value.message;
  }
  return String(value);
};

const runProviderSync = async <T>(
  provider: "azure" | "aws" | "gcp",
  fn: () => Promise<T>
): Promise<{ provider: "azure" | "aws" | "gcp"; durationSeconds: number; result: T }> => {
  const started = process.hrtime.bigint();
  try {
    const result = await fn();
    const durationSeconds = Number(process.hrtime.bigint() - started) / 1_000_000_000;
    observePricingSyncDurationSeconds(provider, "success", durationSeconds);
    return { provider, durationSeconds, result };
  } catch (error) {
    const durationSeconds = Number(process.hrtime.bigint() - started) / 1_000_000_000;
    observePricingSyncDurationSeconds(provider, "failed", durationSeconds);
    throw Object.assign(error instanceof Error ? error : new Error(extractError(error)), {
      provider,
      durationSeconds
    });
  }
};

const runSync = async (): Promise<void> => {
  const [azureResult, awsResult, gcpResult] = await Promise.allSettled([
    runProviderSync("azure", syncAzurePricingToDatabase),
    runProviderSync("aws", syncAwsPricingToDatabase),
    runProviderSync("gcp", syncGcpPricingToDatabase)
  ]);

  if (azureResult.status === "fulfilled") {
    logger.info("Pricing sync completed", {
      provider: "azure",
      durationSeconds: azureResult.value.durationSeconds,
      version: azureResult.value.result.version,
      recordsSynced: azureResult.value.result.recordsSynced,
      regions: azureResult.value.result.regions
    });
  } else {
    logger.error("Pricing sync failed", {
      provider: "azure",
      error: extractError(azureResult.reason)
    });
  }

  if (awsResult.status === "fulfilled") {
    logger.info("Pricing sync completed", {
      provider: "aws",
      durationSeconds: awsResult.value.durationSeconds,
      version: awsResult.value.result.version,
      recordsSynced: awsResult.value.result.recordsSynced,
      regions: awsResult.value.result.regions
    });
  } else {
    logger.error("Pricing sync failed", {
      provider: "aws",
      error: extractError(awsResult.reason)
    });
  }

  if (gcpResult.status === "fulfilled") {
    logger.info("Pricing sync completed", {
      provider: "gcp",
      durationSeconds: gcpResult.value.durationSeconds,
      version: gcpResult.value.result.version,
      recordsSynced: gcpResult.value.result.recordsSynced,
      regions: gcpResult.value.result.regions
    });
  } else {
    logger.error("Pricing sync failed", {
      provider: "gcp",
      error: extractError(gcpResult.reason)
    });
  }
};

export const startPricingSyncWorker = (): void => {
  if (workerStarted) {
    return;
  }
  workerStarted = true;
  logger.info("Pricing sync worker started", {
    intervalMs: PRICING_SYNC_INTERVAL_MS
  });

  void runSync();
  setInterval(() => {
    void runSync();
  }, PRICING_SYNC_INTERVAL_MS);
};
