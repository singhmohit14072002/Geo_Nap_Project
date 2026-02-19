import { CloudPricingUpsertInput, upsertCloudPricingRecords } from "./cloud-pricing.repository";
import { AzureRetailPriceItem, fetchAzureRetailPrices, getEffectivePrice } from "./azure-retail-pricing.service";
import logger from "../utils/logger";

const RELEVANT_AZURE_SERVICE_FAMILIES = [
  "Virtual Machines",
  "Storage",
  "Bandwidth",
  "Application Gateway",
  "Virtual Network",
  "Recovery Services",
  "Automation",
  "Azure Monitor",
  "Logic Apps"
] as const;

const AZURE_PRICE_SYNC_MAX_PAGES = Number(
  process.env.AZURE_PRICE_SYNC_MAX_PAGES ?? "80"
);
const AZURE_PRICE_SYNC_BATCH_SIZE = Number(
  process.env.AZURE_PRICE_SYNC_BATCH_SIZE ?? "2000"
);

const buildVersionTag = (): string => {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  return `azure-${yyyy}-${mm}-${dd}`;
};

const normalizeRegion = (value: string | undefined): string | null => {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
};

const normalizeText = (value: string | undefined): string | null => {
  if (!value) {
    return null;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
};

const shouldKeepItem = (item: AzureRetailPriceItem): boolean => {
  const price = getEffectivePrice(item);
  if (!(price > 0)) {
    return false;
  }
  const region = normalizeRegion(item.armRegionName);
  if (!region) {
    return false;
  }

  const product = `${item.productName ?? ""}`.toLowerCase();
  const meter = `${item.meterName ?? ""}`.toLowerCase();
  const sku = `${item.armSkuName ?? item.skuName ?? ""}`.toLowerCase();

  if (product.includes("spot") || meter.includes("spot") || sku.includes("spot")) {
    return false;
  }
  if (product.includes("low priority") || meter.includes("low priority")) {
    return false;
  }
  if (product.includes("reservation") || meter.includes("reservation")) {
    return false;
  }
  return true;
};

const buildNormalizedSkuName = (item: AzureRetailPriceItem): string => {
  const baseSku =
    normalizeText(item.armSkuName) ??
    normalizeText(item.skuName) ??
    normalizeText(item.productName) ??
    "unknown";
  const meter = normalizeText(item.meterName) ?? "unknown-meter";
  const beginRange = normalizeText(item.beginRange) ?? "0";
  const endRange = normalizeText(item.endRange) ?? "Inf";
  return `${baseSku}|meter=${meter}|begin=${beginRange}|end=${endRange}`;
};

const normalizeRetailItems = (
  serviceName: string,
  items: AzureRetailPriceItem[],
  pricingVersion: string
): CloudPricingUpsertInput[] => {
  const normalizedRows: CloudPricingUpsertInput[] = [];
  for (const item of items) {
    if (!shouldKeepItem(item)) {
      continue;
    }
    const region = normalizeRegion(item.armRegionName);
    if (!region) {
      continue;
    }
    const currency = normalizeText(item.currencyCode) ?? "USD";
    const unit = normalizeText(item.unitOfMeasure) ?? "unit";
    normalizedRows.push({
      provider: "azure",
      region,
      serviceName,
      skuName: buildNormalizedSkuName(item),
      unit,
      retailPrice: getEffectivePrice(item),
      currency,
      pricingVersion
    });
  }
  return normalizedRows;
};

const dedupeRows = (rows: CloudPricingUpsertInput[]): CloudPricingUpsertInput[] => {
  const seen = new Set<string>();
  const deduped: CloudPricingUpsertInput[] = [];
  for (const row of rows) {
    const key = [
      row.provider,
      row.region,
      row.serviceName,
      row.skuName,
      row.unit
    ].join("|");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(row);
  }
  return deduped;
};

const syncServiceFamily = async (
  serviceName: string,
  pricingVersion: string
): Promise<CloudPricingUpsertInput[]> => {
  const filter = `serviceName eq '${serviceName.replace(/'/g, "''")}' and priceType eq 'Consumption'`;
  const items = await fetchAzureRetailPrices(
    filter,
    Math.max(1, AZURE_PRICE_SYNC_MAX_PAGES)
  );
  const normalized = normalizeRetailItems(serviceName, items, pricingVersion);
  logger.info("AZURE_PRICE_SYNC_FAMILY_FETCHED", {
    serviceName,
    fetchedItems: items.length,
    normalizedItems: normalized.length
  });
  return normalized;
};

const chunk = <T>(input: T[], size: number): T[][] => {
  if (size <= 0) {
    return [input];
  }
  const chunks: T[][] = [];
  for (let i = 0; i < input.length; i += size) {
    chunks.push(input.slice(i, i + size));
  }
  return chunks;
};

export const syncAzurePriceCatalogToDatabase = async (): Promise<{
  version: string;
  serviceFamilies: string[];
  recordsSynced: number;
}> => {
  const version = buildVersionTag();
  const rows: CloudPricingUpsertInput[] = [];

  for (const family of RELEVANT_AZURE_SERVICE_FAMILIES) {
    try {
      const familyRows = await syncServiceFamily(family, version);
      rows.push(...familyRows);
    } catch (error) {
      logger.error("AZURE_PRICE_SYNC_FAMILY_FAILED", {
        serviceFamily: family,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const deduped = dedupeRows(rows);
  const batches = chunk(deduped, Math.max(100, AZURE_PRICE_SYNC_BATCH_SIZE));
  let synced = 0;
  for (const batch of batches) {
    await upsertCloudPricingRecords(batch);
    synced += batch.length;
  }

  logger.info("AZURE_PRICE_SYNC_COMPLETED", {
    pricingVersion: version,
    serviceFamilies: RELEVANT_AZURE_SERVICE_FAMILIES,
    recordsSynced: synced
  });

  return {
    version,
    serviceFamilies: [...RELEVANT_AZURE_SERVICE_FAMILIES],
    recordsSynced: synced
  };
};
