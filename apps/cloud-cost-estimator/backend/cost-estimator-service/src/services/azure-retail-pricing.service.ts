import https from "https";
import {
  ComputeRequirementItem,
  InfrastructureRequirement
} from "../domain/cost.model";
import { retry } from "../utils/retry.util";
import {
  ensureAzureRetailPrimaryMeterFilter,
  buildAzureRetailQueryUrl
} from "../config/azure-retail-api.config";
import logger from "../utils/logger";

export interface AzureRetailPriceItem {
  armRegionName?: string;
  armSkuName?: string;
  skuName?: string;
  serviceName?: string;
  serviceFamily?: string;
  meterName?: string;
  productName?: string;
  retailPrice?: number;
  unitPrice?: number;
  unitOfMeasure?: string;
  priceType?: string;
  isDevTestPrice?: boolean;
  type?: string;
  currencyCode?: string;
  beginRange?: string;
  endRange?: string;
}

interface AzureRetailResponse {
  Items?: AzureRetailPriceItem[];
  NextPageLink?: string;
  nextPageLink?: string;
}

export interface AzureVmSelection {
  requirementIndex: number;
  sku: string;
  vcpu: number;
  ramGB: number;
  osType: "linux" | "windows";
  quantity: number;
  monthlyCostInr: number;
  hourlyPriceUsd?: number;
}

export interface AzureResolvedPricing {
  storagePerGbPerMonthInr: number;
  egressPerGbInr: number;
  databaseBasePerMonthInr: number;
  vmSelections: AzureVmSelection[];
  pricingVersion: string;
  source: "retail" | "mixed-fallback";
}

const AZURE_RETAIL_MAX_PAGES = Number(
  process.env.AZURE_RETAIL_MAX_PAGES ?? "3"
);
const AZURE_RETAIL_PAGINATION_SAFETY_LIMIT = 10;
const AZURE_USD_TO_INR = Number(process.env.AZURE_USD_TO_INR ?? "83");

interface AzureRetailFetchOptions {
  exactArmSkuName?: string;
  logContext?: Record<string, unknown>;
}

const FALLBACK = {
  vcpuPerMonthInr: 500,
  storagePerGbPerMonthInr: 4,
  egressPerGbInr: 5,
  databaseBasePerMonthInr: 2000
};

export const VM_REFERENCE_CATALOG = [
  { sku: "Standard_F2s_v2", vcpu: 2, ramGB: 4 },
  { sku: "Standard_F2as_v6", vcpu: 2, ramGB: 8 },
  { sku: "Standard_F4s_v2", vcpu: 4, ramGB: 8 },
  { sku: "Standard_F8s_v2", vcpu: 8, ramGB: 16 },
  { sku: "Standard_F8as_v6", vcpu: 8, ramGB: 32 },
  { sku: "Standard_F16s_v2", vcpu: 16, ramGB: 32 },
  { sku: "Standard_D2s_v5", vcpu: 2, ramGB: 8 },
  { sku: "Standard_D4s_v5", vcpu: 4, ramGB: 16 },
  { sku: "Standard_D8s_v5", vcpu: 8, ramGB: 32 },
  { sku: "Standard_D16s_v5", vcpu: 16, ramGB: 64 },
  { sku: "Standard_D32s_v5", vcpu: 32, ramGB: 128 }
];

const round2 = (value: number): number => Number(value.toFixed(2));

const createHttpStatusError = (statusCode: number, message: string): Error & {
  statusCode: number;
} => {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
};

const fetchJson = <T>(url: string): Promise<T> =>
  new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        const statusCode = res.statusCode ?? 500;
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
        });
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          if (statusCode >= 400) {
            reject(
              createHttpStatusError(
                statusCode,
                `Azure retail API request failed with status ${statusCode}`
              )
            );
            return;
          }
          try {
            resolve(JSON.parse(body) as T);
          } catch (err) {
            reject(
              new Error(
                `Failed to parse Azure retail API response: ${
                  err instanceof Error ? err.message : "invalid JSON"
                }`
              )
            );
          }
        });
      })
      .on("error", reject);
  });

export const getEffectivePrice = (item: AzureRetailPriceItem): number => {
  if (typeof item.retailPrice === "number" && item.retailPrice > 0) {
    return item.retailPrice;
  }
  if (typeof item.unitPrice === "number" && item.unitPrice > 0) {
    return item.unitPrice;
  }
  return 0;
};

export const fetchAzureRetailPrices = async (
  filter: string,
  maxPages: number = Math.max(1, AZURE_RETAIL_MAX_PAGES),
  options?: AzureRetailFetchOptions
): Promise<AzureRetailPriceItem[]> => {
  const safeMaxPages = Math.min(
    Math.max(1, maxPages),
    AZURE_RETAIL_PAGINATION_SAFETY_LIMIT
  );
  const exactArmSkuName = options?.exactArmSkuName?.trim();
  let nextUrl = ensureAzureRetailPrimaryMeterFilter(buildAzureRetailQueryUrl(filter));

  const collected: AzureRetailPriceItem[] = [];
  let pages = 0;
  let matchFound = false;
  while (nextUrl && pages < safeMaxPages) {
    const requestUrl = ensureAzureRetailPrimaryMeterFilter(nextUrl);
    const data = await retry(() => fetchJson<AzureRetailResponse>(requestUrl));
    pages += 1;

    const items = Array.isArray(data.Items) ? data.Items : [];
    collected.push(...items);

    const rawNextPageUrl = data.NextPageLink ?? data.nextPageLink ?? "";
    const hasNextPageLink = Boolean(rawNextPageUrl);

    logger.info("AZURE_PAGE_FETCHED", {
      page: pages,
      itemCount: items.length,
      hasNextPageLink,
      ...options?.logContext
    });

    if (exactArmSkuName) {
      const found = items.some(
        (item) => (item.armSkuName ?? "").trim() === exactArmSkuName
      );
      if (found) {
        matchFound = true;
        logger.info("AZURE_MATCH_FOUND", {
          page: pages,
          armSkuName: exactArmSkuName,
          ...options?.logContext
        });
        break;
      }
    }

    nextUrl = rawNextPageUrl
      ? ensureAzureRetailPrimaryMeterFilter(rawNextPageUrl)
      : "";
  }

  if (!matchFound && nextUrl && pages >= safeMaxPages) {
    logger.warn("AZURE_PAGINATION_LIMIT_REACHED", {
      pageLimit: safeMaxPages,
      hasNextPageLink: true,
      ...options?.logContext
    });
  }

  return collected;
};

export const selectReferenceVm = (compute: ComputeRequirementItem) => {
  for (const vm of VM_REFERENCE_CATALOG) {
    if (vm.vcpu >= compute.vCPU && vm.ramGB >= compute.ramGB) {
      return vm;
    }
  }
  return VM_REFERENCE_CATALOG[VM_REFERENCE_CATALOG.length - 1];
};

export const pickVmHourlyPriceUsd = (
  items: AzureRetailPriceItem[],
  osType: "linux" | "windows"
): number | null => {
  const filtered = items
    .filter((item) => {
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
    })
    .sort((a, b) => getEffectivePrice(a) - getEffectivePrice(b));

  if (filtered.length === 0) {
    return null;
  }
  return getEffectivePrice(filtered[0]);
};

export const pickStoragePerGbMonthUsd = (
  items: AzureRetailPriceItem[]
): number | null => {
  const candidates = items
    .filter((item) => {
      const meter = `${item.meterName ?? ""}`.toLowerCase();
      const unit = `${item.unitOfMeasure ?? ""}`.toLowerCase();
      const price = getEffectivePrice(item);
      return (
        price > 0 &&
        meter.includes("data stored") &&
        meter.includes("hot") &&
        meter.includes("lrs") &&
        unit.includes("gb")
      );
    })
    .sort((a, b) => getEffectivePrice(a) - getEffectivePrice(b));

  if (candidates.length === 0) {
    return null;
  }
  return getEffectivePrice(candidates[0]);
};

export const pickEgressPerGbUsd = (
  items: AzureRetailPriceItem[]
): number | null => {
  const candidates = items
    .filter((item) => {
      const meter = `${item.meterName ?? ""}`.toLowerCase();
      const unit = `${item.unitOfMeasure ?? ""}`.toLowerCase();
      const price = getEffectivePrice(item);
      return (
        price > 0 &&
        meter.includes("data transfer out") &&
        unit.includes("gb")
      );
    })
    .sort((a, b) => getEffectivePrice(a) - getEffectivePrice(b));

  if (candidates.length === 0) {
    return null;
  }
  return getEffectivePrice(candidates[0]);
};

export const pickPostgresBaseHourlyUsd = (
  items: AzureRetailPriceItem[]
): number | null => {
  const candidates = items
    .filter((item) => {
      const product = `${item.productName ?? ""}`.toLowerCase();
      const meter = `${item.meterName ?? ""}`.toLowerCase();
      const unit = `${item.unitOfMeasure ?? ""}`.toLowerCase();
      const price = getEffectivePrice(item);
      return (
        price > 0 &&
        product.includes("flexible server") &&
        meter.includes("vcore") &&
        unit.includes("hour")
      );
    })
    .sort((a, b) => getEffectivePrice(a) - getEffectivePrice(b));

  if (candidates.length === 0) {
    return null;
  }
  return getEffectivePrice(candidates[0]);
};

const toInr = (price: number, currencyCode?: string): number => {
  const code = `${currencyCode ?? "USD"}`.toUpperCase();
  if (code === "INR") {
    return round2(price);
  }
  return round2(price * AZURE_USD_TO_INR);
};

export const resolveAzureRetailPricingDirect = async (
  region: string,
  requirement: InfrastructureRequirement
): Promise<AzureResolvedPricing> => {
  let usedFallback = false;

  const vmSelections: AzureVmSelection[] = [];
  for (let index = 0; index < requirement.compute.length; index += 1) {
    const compute = requirement.compute[index];
    const refVm = selectReferenceVm(compute);
    const vmFilter = `serviceName eq 'Virtual Machines' and armRegionName eq '${region}' and armSkuName eq '${refVm.sku}' and priceType eq 'Consumption'`;
    let hourlyPriceUsd: number | null = null;

    try {
      const vmItems = await fetchAzureRetailPrices(vmFilter);
      hourlyPriceUsd = pickVmHourlyPriceUsd(vmItems, compute.osType);
    } catch {
      hourlyPriceUsd = null;
    }

    let monthlyCostInr: number;
    if (hourlyPriceUsd === null) {
      usedFallback = true;
      monthlyCostInr = round2(
        compute.vCPU * FALLBACK.vcpuPerMonthInr * compute.quantity
      );
    } else {
      monthlyCostInr = round2(toInr(hourlyPriceUsd, "USD") * 730 * compute.quantity);
    }

    vmSelections.push({
      requirementIndex: index,
      sku: refVm.sku,
      vcpu: refVm.vcpu,
      ramGB: refVm.ramGB,
      osType: compute.osType,
      quantity: compute.quantity,
      monthlyCostInr,
      hourlyPriceUsd: hourlyPriceUsd ?? undefined
    });
  }

  let storagePerGbPerMonthInr = FALLBACK.storagePerGbPerMonthInr;
  try {
    const storageItems = await fetchAzureRetailPrices(
      `serviceName eq 'Storage' and armRegionName eq '${region}' and priceType eq 'Consumption'`
    );
    const storageUsd = pickStoragePerGbMonthUsd(storageItems);
    if (storageUsd !== null) {
      storagePerGbPerMonthInr = toInr(storageUsd, "USD");
    } else {
      usedFallback = true;
    }
  } catch {
    usedFallback = true;
  }

  let egressPerGbInr = FALLBACK.egressPerGbInr;
  try {
    const bandwidthItems = await fetchAzureRetailPrices(
      `serviceName eq 'Bandwidth' and armRegionName eq '${region}' and priceType eq 'Consumption'`
    );
    const egressUsd = pickEgressPerGbUsd(bandwidthItems);
    if (egressUsd !== null) {
      egressPerGbInr = toInr(egressUsd, "USD");
    } else {
      usedFallback = true;
    }
  } catch {
    usedFallback = true;
  }

  let databaseBasePerMonthInr = FALLBACK.databaseBasePerMonthInr;
  try {
    const postgresItems = await fetchAzureRetailPrices(
      `serviceName eq 'Azure Database for PostgreSQL' and armRegionName eq '${region}' and priceType eq 'Consumption'`
    );
    const postgresHourlyUsd = pickPostgresBaseHourlyUsd(postgresItems);
    if (postgresHourlyUsd !== null) {
      databaseBasePerMonthInr = round2(toInr(postgresHourlyUsd, "USD") * 730);
    } else {
      usedFallback = true;
    }
  } catch {
    usedFallback = true;
  }

  return {
    storagePerGbPerMonthInr,
    egressPerGbInr,
    databaseBasePerMonthInr,
    vmSelections,
    pricingVersion: usedFallback
      ? "azure-retail-direct-mixed-fallback"
      : "azure-retail-direct",
    source: usedFallback ? "mixed-fallback" : "retail"
  };
};
