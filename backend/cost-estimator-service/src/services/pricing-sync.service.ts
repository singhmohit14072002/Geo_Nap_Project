import {
  fetchAzureRetailPrices,
  getEffectivePrice,
  pickEgressPerGbUsd,
  pickPostgresBaseHourlyUsd,
  pickStoragePerGbMonthUsd,
  pickVmHourlyPriceUsd,
  VM_REFERENCE_CATALOG
} from "./azure-retail-pricing.service";
import logger from "../utils/logger";
import {
  CloudPricingUpsertInput,
  upsertCloudPricingRecords
} from "./cloud-pricing.repository";
import { fetchAndNormalizeAwsPricingRows } from "./aws-pricing-api.service";
import { fetchAndNormalizeGcpPricingRows } from "./gcp-pricing-api.service";

const AZURE_SYNC_REGIONS = (
  process.env.AZURE_SYNC_REGIONS ?? "centralindia,eastus,westus2"
)
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

const AWS_SYNC_REGIONS = (process.env.AWS_SYNC_REGIONS ?? "ap-south-1,us-east-1")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

const GCP_SYNC_REGIONS = (
  process.env.GCP_SYNC_REGIONS ?? "asia-south1,asia-south2"
)
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

const buildVersionTag = (provider: "azure" | "aws" | "gcp"): string => {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  return `${provider}-${yyyy}-${mm}-${dd}`;
};

const filterVmItems = (
  items: Awaited<ReturnType<typeof fetchAzureRetailPrices>>,
  osType: "linux" | "windows"
) => {
  return items.filter((item) => {
    const price = getEffectivePrice(item);
    if (price <= 0) {
      return false;
    }
    const product = `${item.productName ?? ""}`.toLowerCase();
    const meter = `${item.meterName ?? ""}`.toLowerCase();
    if (product.includes("spot") || meter.includes("spot")) {
      return false;
    }
    if (product.includes("low priority") || meter.includes("low priority")) {
      return false;
    }
    const isWindows = product.includes("windows");
    return osType === "windows" ? isWindows : !isWindows;
  });
};

const buildVmRecords = async (
  region: string,
  version: string
): Promise<CloudPricingUpsertInput[]> => {
  const records: CloudPricingUpsertInput[] = [];

  for (const vm of VM_REFERENCE_CATALOG) {
    const vmFilter = `serviceName eq 'Virtual Machines' and armRegionName eq '${region}' and armSkuName eq '${vm.sku}' and priceType eq 'Consumption'`;
    const items = await fetchAzureRetailPrices(vmFilter);

    const linuxUsd = pickVmHourlyPriceUsd(items, "linux");
    if (linuxUsd !== null) {
      const linuxItems = filterVmItems(items, "linux");
      const currency = linuxItems[0]?.currencyCode ?? "USD";
      records.push({
        provider: "azure",
        region,
        serviceName: "Virtual Machines",
        skuName: `${vm.sku}|linux|vcpu=${vm.vcpu}|ramGiB=${vm.ramGB}`,
        unit: "1 Hour",
        retailPrice: linuxUsd,
        currency,
        pricingVersion: version
      });
    }

    const windowsUsd = pickVmHourlyPriceUsd(items, "windows");
    if (windowsUsd !== null) {
      const windowsItems = filterVmItems(items, "windows");
      const currency = windowsItems[0]?.currencyCode ?? "USD";
      records.push({
        provider: "azure",
        region,
        serviceName: "Virtual Machines",
        skuName: `${vm.sku}|windows|vcpu=${vm.vcpu}|ramGiB=${vm.ramGB}`,
        unit: "1 Hour",
        retailPrice: windowsUsd,
        currency,
        pricingVersion: version
      });
    }
  }

  return records;
};

const buildStorageRecord = async (
  region: string,
  version: string
): Promise<CloudPricingUpsertInput[]> => {
  const storageItems = await fetchAzureRetailPrices(
    `serviceName eq 'Storage' and armRegionName eq '${region}' and priceType eq 'Consumption'`
  );
  const storageUsd = pickStoragePerGbMonthUsd(storageItems);
  if (storageUsd === null) {
    return [];
  }
  const currency =
    storageItems.find((item) => getEffectivePrice(item) > 0)?.currencyCode ??
    "USD";
  return [
    {
      provider: "azure",
      region,
      serviceName: "Storage",
      skuName: "Standard_LRS_Hot",
      unit: "1 GB/Month",
      retailPrice: storageUsd,
      currency,
      pricingVersion: version
    }
  ];
};

const buildBandwidthRecord = async (
  region: string,
  version: string
): Promise<CloudPricingUpsertInput[]> => {
  const bandwidthItems = await fetchAzureRetailPrices(
    `serviceName eq 'Bandwidth' and armRegionName eq '${region}' and priceType eq 'Consumption'`
  );
  const egressUsd = pickEgressPerGbUsd(bandwidthItems);
  if (egressUsd === null) {
    return [];
  }
  const currency =
    bandwidthItems.find((item) => getEffectivePrice(item) > 0)?.currencyCode ??
    "USD";
  return [
    {
      provider: "azure",
      region,
      serviceName: "Bandwidth",
      skuName: "DataTransferOut",
      unit: "1 GB",
      retailPrice: egressUsd,
      currency,
      pricingVersion: version
    }
  ];
};

const buildPostgresRecord = async (
  region: string,
  version: string
): Promise<CloudPricingUpsertInput[]> => {
  const postgresItems = await fetchAzureRetailPrices(
    `serviceName eq 'Azure Database for PostgreSQL' and armRegionName eq '${region}' and priceType eq 'Consumption'`
  );
  const postgresHourlyUsd = pickPostgresBaseHourlyUsd(postgresItems);
  if (postgresHourlyUsd === null) {
    return [];
  }
  const currency =
    postgresItems.find((item) => getEffectivePrice(item) > 0)?.currencyCode ??
    "USD";
  return [
    {
      provider: "azure",
      region,
      serviceName: "Azure Database for PostgreSQL",
      skuName: "FlexibleServerVCore",
      unit: "1 Hour",
      retailPrice: postgresHourlyUsd,
      currency,
      pricingVersion: version
    }
  ];
};

const syncAzureRegion = async (
  region: string,
  version: string
): Promise<number> => {
  const vmRecords = await buildVmRecords(region, version);
  const storage = await buildStorageRecord(region, version);
  const bandwidth = await buildBandwidthRecord(region, version);
  const postgres = await buildPostgresRecord(region, version);
  const rows = [...vmRecords, ...storage, ...bandwidth, ...postgres];
  if (rows.length > 0) {
    await upsertCloudPricingRecords(rows);
  }
  return rows.length;
};

export const syncAzurePricingToDatabase = async (): Promise<{
  version: string;
  regions: string[];
  recordsSynced: number;
}> => {
  const version = buildVersionTag("azure");
  let recordsSynced = 0;
  for (const region of AZURE_SYNC_REGIONS) {
    try {
      const synced = await syncAzureRegion(region, version);
      recordsSynced += synced;
      logger.info("Pricing sync region completed", {
        provider: "azure",
        region,
        synced,
        version
      });
    } catch (err) {
      logger.warn("Pricing sync region failed", {
        provider: "azure",
        region,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  return {
    version,
    regions: AZURE_SYNC_REGIONS,
    recordsSynced
  };
};

const syncAwsRegion = async (region: string, version: string): Promise<number> => {
  const rows = await fetchAndNormalizeAwsPricingRows(region, version);
  if (rows.length === 0) {
    logger.warn("Pricing sync normalized zero rows", {
      provider: "aws",
      region
    });
    return 0;
  }
  await upsertCloudPricingRecords(rows);
  return rows.length;
};

export const syncAwsPricingToDatabase = async (): Promise<{
  version: string;
  regions: string[];
  recordsSynced: number;
}> => {
  const version = buildVersionTag("aws");
  let recordsSynced = 0;

  for (const region of AWS_SYNC_REGIONS) {
    try {
      const synced = await syncAwsRegion(region, version);
      recordsSynced += synced;
      logger.info("Pricing sync region completed", {
        provider: "aws",
        region,
        synced,
        version
      });
    } catch (err) {
      logger.warn("Pricing sync region failed", {
        provider: "aws",
        region,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  return {
    version,
    regions: AWS_SYNC_REGIONS,
    recordsSynced
  };
};

const syncGcpRegion = async (region: string, version: string): Promise<number> => {
  const rows = await fetchAndNormalizeGcpPricingRows(region, version);
  if (rows.length === 0) {
    logger.warn("Pricing sync normalized zero rows", {
      provider: "gcp",
      region
    });
    return 0;
  }
  await upsertCloudPricingRecords(rows);
  return rows.length;
};

export const syncGcpPricingToDatabase = async (): Promise<{
  version: string;
  regions: string[];
  recordsSynced: number;
}> => {
  const version = buildVersionTag("gcp");
  let recordsSynced = 0;

  for (const region of GCP_SYNC_REGIONS) {
    try {
      const synced = await syncGcpRegion(region, version);
      recordsSynced += synced;
      logger.info("Pricing sync region completed", {
        provider: "gcp",
        region,
        synced,
        version
      });
    } catch (err) {
      logger.warn("Pricing sync region failed", {
        provider: "gcp",
        region,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  return {
    version,
    regions: GCP_SYNC_REGIONS,
    recordsSynced
  };
};
