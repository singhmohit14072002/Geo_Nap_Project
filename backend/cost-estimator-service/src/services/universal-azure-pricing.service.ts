import { AzureServiceInput } from "./azure-universal-extractor.service";
import { buildAzureRetailQueryUrl } from "../config/azure-retail-api.config";
import { fetchAzureRetailPrices, AzureRetailPriceItem } from "./azure-retail-pricing.service";
import { AzurePricingQueryError } from "./azure-pricing-query.service";
import logger from "../utils/logger";

const AZURE_RETAIL_QUERY_MAX_PAGES = Number(
  process.env.AZURE_RETAIL_QUERY_MAX_PAGES ?? process.env.AZURE_RETAIL_MAX_PAGES ?? "20"
);

const round2 = (v: number) => Number(v.toFixed(2));

const isExcluded = (item: AzureRetailPriceItem): boolean => {
  const type = (item.type ?? "").toLowerCase();
  const priceType = (item.priceType ?? type).toLowerCase();
  const meterName = (item.meterName ?? "").toLowerCase();
  if (type === "devtestconsumption" || type === "reservation") return true;
  if (priceType === "devtestconsumption" || priceType === "reservation") return true;
  if (meterName.includes("spot") || meterName.includes("low priority")) return true;
  if (priceType !== "consumption") return true;
  return false;
};

const matchesUnit = (item: AzureRetailPriceItem, unitType: string): boolean => {
  const unit = (item.unitOfMeasure ?? "").toLowerCase();
  const target = unitType.toLowerCase();
  if (target.includes("hour")) return unit.includes("hour");
  if (target.includes("month")) return unit.includes("month");
  if (target.includes("gb")) return unit.includes("gb");
  return unit.includes(target);
};

export const resolveAzurePrice = async (service: AzureServiceInput) => {
  const buildFilter = (useSku: boolean, useMeter: boolean) => {
    const clauses = [
      `serviceName eq '${service.serviceName.replace(/'/g, "''")}'`,
      `armRegionName eq '${service.region.replace(/'/g, "''")}'`,
      "priceType eq 'Consumption'"
    ];
    if (useSku && service.armSkuName) {
      clauses.push(`armSkuName eq '${service.armSkuName.replace(/'/g, "''")}'`);
    }
    if (useMeter && service.meterName) {
      clauses.push(`meterName eq '${service.meterName.replace(/'/g, "''")}'`);
    }
    return clauses.join(" and ");
  };

  const tryQuery = async (useSku: boolean, useMeter: boolean) => {
    const filter = buildFilter(useSku, useMeter);
    let items: AzureRetailPriceItem[] = [];
    items = await fetchAzureRetailPrices(filter, AZURE_RETAIL_QUERY_MAX_PAGES, {
      logContext: { serviceName: service.serviceName, region: service.region }
    });

    const candidates = items
      .filter((i) => !isExcluded(i))
      .filter((i) => matchesUnit(i, service.unitType))
      .filter((i) => (i.unitPrice ?? i.retailPrice ?? 0) > 0);

    const fallbackCandidates =
      candidates.length > 0
        ? candidates
        : items.filter((i) => !isExcluded(i) && (i.unitPrice ?? i.retailPrice ?? 0) > 0);

    return { filter, candidates: fallbackCandidates };
  };

  const attempts: Array<{ useSku: boolean; useMeter: boolean }> = [
    { useSku: true, useMeter: true },
    { useSku: false, useMeter: true },
    { useSku: false, useMeter: false }
  ];

  let lastFilter = "";
  for (const attempt of attempts) {
    const { useSku, useMeter } = attempt;
    const { filter, candidates } = await tryQuery(useSku, useMeter);
    lastFilter = filter;
    if (candidates.length === 0) {
      continue;
    }

    const best = candidates.sort(
      (a, b) => (a.unitPrice ?? a.retailPrice ?? 0) - (b.unitPrice ?? b.retailPrice ?? 0)
    )[0];

    const unitPrice = best.unitPrice ?? best.retailPrice ?? 0;
    const monthlyCost = round2(unitPrice * service.usageQuantity);

    logger.info("AZURE_PRICE_RESOLVED", {
      serviceName: service.serviceName,
      region: service.region,
      armSkuName: best.armSkuName ?? service.armSkuName,
      meterName: best.meterName ?? service.meterName,
      unitType: service.unitType,
      unitPrice,
      monthlyCost
    });

    return {
      serviceName: service.serviceName,
      armSkuName: best.armSkuName ?? service.armSkuName,
      meterName: best.meterName ?? service.meterName,
      region: service.region,
      unitType: service.unitType,
      usageQuantity: service.usageQuantity,
      unitPrice,
      monthlyCost
    };
  }

  logger.warn("AZURE_PRICE_NOT_FOUND", {
    serviceName: service.serviceName,
    region: service.region,
    armSkuName: service.armSkuName,
    meterName: service.meterName,
    unitType: service.unitType,
    filter: lastFilter
  });
  throw new AzurePricingQueryError(
    "NO_PRICING_FOUND",
    "No Azure retail pricing record matched the requested parameters",
    { filter: lastFilter }
  );
};
