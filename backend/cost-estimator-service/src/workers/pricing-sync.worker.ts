import {
  syncAwsPricingToDatabase,
  syncAzurePricingToDatabase,
  syncGcpPricingToDatabase
} from "../services/pricing-sync.service";

const DEFAULT_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
const configuredInterval = Number(
  process.env.PRICING_SYNC_INTERVAL_MS ?? DEFAULT_SYNC_INTERVAL_MS
);
const PRICING_SYNC_INTERVAL_MS =
  Number.isFinite(configuredInterval) && configuredInterval > 0
    ? configuredInterval
    : DEFAULT_SYNC_INTERVAL_MS;

let workerStarted = false;

const runSync = async (): Promise<void> => {
  const [azureResult, awsResult, gcpResult] = await Promise.allSettled([
    syncAzurePricingToDatabase(),
    syncAwsPricingToDatabase(),
    syncGcpPricingToDatabase()
  ]);

  if (azureResult.status === "fulfilled") {
    console.log(
      `[pricing-sync] azure completed version=${azureResult.value.version} records=${azureResult.value.recordsSynced} regions=${azureResult.value.regions.join(",")}`
    );
  } else {
    console.error(`[pricing-sync] azure fatal sync error: ${azureResult.reason}`);
  }

  if (awsResult.status === "fulfilled") {
    console.log(
      `[pricing-sync] aws completed version=${awsResult.value.version} records=${awsResult.value.recordsSynced} regions=${awsResult.value.regions.join(",")}`
    );
  } else {
    console.error(`[pricing-sync] aws fatal sync error: ${awsResult.reason}`);
  }

  if (gcpResult.status === "fulfilled") {
    console.log(
      `[pricing-sync] gcp completed version=${gcpResult.value.version} records=${gcpResult.value.recordsSynced} regions=${gcpResult.value.regions.join(",")}`
    );
  } else {
    console.error(`[pricing-sync] gcp fatal sync error: ${gcpResult.reason}`);
  }
};

export const startPricingSyncWorker = (): void => {
  if (workerStarted) {
    return;
  }
  workerStarted = true;

  void runSync();
  setInterval(() => {
    void runSync();
  }, PRICING_SYNC_INTERVAL_MS);
};
