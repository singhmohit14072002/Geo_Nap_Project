"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveAzurePrice = void 0;
const azure_retail_pricing_service_1 = require("./azure-retail-pricing.service");
const azure_pricing_query_service_1 = require("./azure-pricing-query.service");
const logger_1 = __importDefault(require("../utils/logger"));
const AZURE_RETAIL_QUERY_MAX_PAGES = Number(process.env.AZURE_RETAIL_QUERY_MAX_PAGES ?? process.env.AZURE_RETAIL_MAX_PAGES ?? "20");
const round2 = (v) => Number(v.toFixed(2));
const isExcluded = (item) => {
    const type = (item.type ?? "").toLowerCase();
    const priceType = (item.priceType ?? type).toLowerCase();
    const meterName = (item.meterName ?? "").toLowerCase();
    if (type === "devtestconsumption" || type === "reservation")
        return true;
    if (priceType === "devtestconsumption" || priceType === "reservation")
        return true;
    if (meterName.includes("spot") || meterName.includes("low priority"))
        return true;
    if (priceType !== "consumption")
        return true;
    return false;
};
const matchesUnit = (item, unitType) => {
    const unit = (item.unitOfMeasure ?? "").toLowerCase();
    const target = unitType.toLowerCase();
    if (target.includes("hour"))
        return unit.includes("hour");
    if (target.includes("month"))
        return unit.includes("month");
    if (target.includes("gb"))
        return unit.includes("gb");
    return unit.includes(target);
};
const resolveAzurePrice = async (service) => {
    const buildFilter = (useSku, useMeter) => {
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
    const tryQuery = async (useSku, useMeter) => {
        const filter = buildFilter(useSku, useMeter);
        let items = [];
        items = await (0, azure_retail_pricing_service_1.fetchAzureRetailPrices)(filter, AZURE_RETAIL_QUERY_MAX_PAGES, {
            logContext: { serviceName: service.serviceName, region: service.region }
        });
        const candidates = items
            .filter((i) => !isExcluded(i))
            .filter((i) => matchesUnit(i, service.unitType))
            .filter((i) => (i.unitPrice ?? i.retailPrice ?? 0) > 0);
        const fallbackCandidates = candidates.length > 0
            ? candidates
            : items.filter((i) => !isExcluded(i) && (i.unitPrice ?? i.retailPrice ?? 0) > 0);
        return { filter, candidates: fallbackCandidates };
    };
    const attempts = [
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
        const best = candidates.sort((a, b) => (a.unitPrice ?? a.retailPrice ?? 0) - (b.unitPrice ?? b.retailPrice ?? 0))[0];
        const unitPrice = best.unitPrice ?? best.retailPrice ?? 0;
        const monthlyCost = round2(unitPrice * service.usageQuantity);
        logger_1.default.info("AZURE_PRICE_RESOLVED", {
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
    logger_1.default.warn("AZURE_PRICE_NOT_FOUND", {
        serviceName: service.serviceName,
        region: service.region,
        armSkuName: service.armSkuName,
        meterName: service.meterName,
        unitType: service.unitType,
        filter: lastFilter
    });
    throw new azure_pricing_query_service_1.AzurePricingQueryError("NO_PRICING_FOUND", "No Azure retail pricing record matched the requested parameters", { filter: lastFilter });
};
exports.resolveAzurePrice = resolveAzurePrice;
