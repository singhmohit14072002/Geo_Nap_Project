"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryAzureRetailPricing = exports.PricingValidationError = exports.AzurePricingQueryError = void 0;
const azure_retail_pricing_service_1 = require("./azure-retail-pricing.service");
const azure_price_cache_service_1 = require("./azure-price-cache.service");
const logger_1 = __importDefault(require("../utils/logger"));
const azure_retail_api_config_1 = require("../config/azure-retail-api.config");
const AZURE_RETAIL_QUERY_MAX_PAGES = Number(process.env.AZURE_RETAIL_QUERY_MAX_PAGES ?? process.env.AZURE_RETAIL_MAX_PAGES ?? "20");
const DEFAULT_MONTHLY_HOURS = Number(process.env.DEFAULT_MONTHLY_HOURS ?? "730");
const AZURE_USD_TO_INR = Number(process.env.AZURE_USD_TO_INR ?? "83");
class AzurePricingQueryError extends Error {
    constructor(code, message, details) {
        super(message);
        this.name = "AzurePricingQueryError";
        this.code = code;
        this.details = details;
    }
}
exports.AzurePricingQueryError = AzurePricingQueryError;
class PricingValidationError extends AzurePricingQueryError {
    constructor(message, details) {
        super("INVALID_INPUT", message, details);
        this.name = "PricingValidationError";
    }
}
exports.PricingValidationError = PricingValidationError;
const round2 = (value) => Number(value.toFixed(2));
const escapeOData = (value) => value.replace(/'/g, "''");
const normalizeRegion = (value) => value.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9-]/g, "").trim();
const toExactArmSkuName = (skuName) => {
    const normalized = skuName.trim().replace(/^standard_/i, "");
    return `Standard_${normalized}`;
};
const toArmSkuContainsToken = (skuName) => {
    return skuName.trim().replace(/^standard_/i, "");
};
const toInr = (price, currencyCode) => {
    const code = (currencyCode ?? "USD").toUpperCase();
    if (code === "INR") {
        return round2(price);
    }
    return round2(price * AZURE_USD_TO_INR);
};
const buildFilter = (serviceName, region, options) => {
    const clauses = [
        `serviceName eq '${escapeOData(serviceName)}'`,
        `armRegionName eq '${escapeOData(region)}'`,
        "priceType eq 'Consumption'"
    ];
    if (options.mode === "compute" && options.skuName?.trim()) {
        if (options.useArmSkuFallbackContains) {
            const escapedToken = escapeOData(toArmSkuContainsToken(options.skuName));
            clauses.push(`contains(armSkuName,'${escapedToken}')`);
        }
        else if (options.armSkuName?.trim()) {
            clauses.push(`armSkuName eq '${escapeOData(options.armSkuName)}'`);
        }
        return clauses.join(" and ");
    }
    if (options.skuName && options.skuName.trim()) {
        const escapedSku = escapeOData(options.skuName.trim());
        clauses.push(`(contains(skuName,'${escapedSku}') or contains(armSkuName,'${escapedSku}') or contains(meterName,'${escapedSku}'))`);
    }
    return clauses.join(" and ");
};
const buildQueryUrl = (filter) => {
    return (0, azure_retail_api_config_1.buildAzureRetailQueryUrl)(filter);
};
const isExcludedPriceItem = (item) => {
    const priceType = (item.priceType ?? "").toLowerCase();
    if (priceType === "reservation") {
        return true;
    }
    if (item.isDevTestPrice === true) {
        return true;
    }
    const text = `${item.productName ?? ""} ${item.meterName ?? ""} ${item.armSkuName ?? ""} ${item.skuName ?? ""}`.toLowerCase();
    if (text.includes("spot") ||
        text.includes("low priority") ||
        text.includes("dev/test") ||
        text.includes("devtest")) {
        return true;
    }
    return (0, azure_retail_pricing_service_1.getEffectivePrice)(item) <= 0;
};
const filterStrictOnDemandItems = (items, context) => {
    const filtered = [];
    for (const item of items) {
        const itemType = String(item.type ?? "").trim();
        const itemTypeNormalized = itemType.toLowerCase();
        const meterName = String(item.meterName ?? "");
        if (itemTypeNormalized === "devtestconsumption") {
            logger_1.default.info("DEVTEST_PRICE_EXCLUDED", {
                ...context,
                meterName,
                type: itemType || "unknown"
            });
            continue;
        }
        if (itemTypeNormalized === "reservation") {
            continue;
        }
        if (meterName.toLowerCase().includes("spot")) {
            logger_1.default.info("SPOT_PRICE_EXCLUDED", {
                ...context,
                meterName,
                type: itemType || "unknown"
            });
            continue;
        }
        // Defensive guard: only allow strict On-Demand rows for price selection.
        if (itemType !== "Consumption") {
            continue;
        }
        if (isExcludedPriceItem(item)) {
            continue;
        }
        filtered.push(item);
    }
    return filtered;
};
const detectPricingMode = (input) => {
    const serviceName = input.serviceName.toLowerCase();
    if (serviceName.includes("virtual machine")) {
        return "compute";
    }
    if (serviceName.includes("bandwidth") ||
        serviceName.includes("egress") ||
        (typeof input.usageGB === "number" && input.usageGB > 0)) {
        return "bandwidth";
    }
    if (serviceName.includes("disk") ||
        serviceName.includes("storage") ||
        (input.skuName ? /^p\d+/i.test(input.skuName) : false)) {
        return "disk";
    }
    return "generic";
};
const serviceNameCandidates = (input, mode) => {
    const list = new Set();
    list.add(input.serviceName);
    if (mode === "compute") {
        list.add("Virtual Machines");
    }
    else if (mode === "disk") {
        list.add("Managed Disks");
        list.add("Storage");
    }
    else if (mode === "bandwidth") {
        list.add("Bandwidth");
    }
    return [...list].filter((item) => item.trim().length > 0);
};
const chooseComputeItem = (items, input, armSkuExact) => {
    const skuLower = input.skuName?.toLowerCase().trim();
    const unitCandidates = items.filter((item) => (item.unitOfMeasure ?? "").toLowerCase().includes("hour"));
    const armSkuExactCandidates = armSkuExact && armSkuExact.trim()
        ? unitCandidates.filter((item) => (item.armSkuName ?? "").trim() === armSkuExact)
        : [];
    const baseCandidates = armSkuExactCandidates.length > 0 ? armSkuExactCandidates : unitCandidates;
    const skuCandidates = skuLower
        ? baseCandidates.filter((item) => {
            const text = `${item.armSkuName ?? ""} ${item.skuName ?? ""} ${item.meterName ?? ""}`.toLowerCase();
            return text.includes(skuLower);
        })
        : baseCandidates;
    const osFiltered = skuCandidates.filter((item) => {
        const text = `${item.productName ?? ""} ${item.meterName ?? ""}`.toLowerCase();
        if (input.osType === "windows") {
            return text.includes("windows");
        }
        if (input.osType === "linux") {
            return !text.includes("windows");
        }
        return true;
    });
    const ranked = (osFiltered.length > 0 ? osFiltered : skuCandidates)
        .filter((item) => (0, azure_retail_pricing_service_1.getEffectivePrice)(item) > 0)
        .sort((a, b) => (0, azure_retail_pricing_service_1.getEffectivePrice)(a) - (0, azure_retail_pricing_service_1.getEffectivePrice)(b));
    return ranked[0] ?? null;
};
const chooseDiskItem = (items, input) => {
    const skuLower = input.skuName?.toLowerCase().trim();
    const unitCandidates = items.filter((item) => {
        const unit = (item.unitOfMeasure ?? "").toLowerCase();
        return unit.includes("month") || unit.includes("hour") || unit.includes("disk");
    });
    const skuCandidates = skuLower
        ? unitCandidates.filter((item) => {
            const text = `${item.armSkuName ?? ""} ${item.skuName ?? ""} ${item.meterName ?? ""}`.toLowerCase();
            return text.includes(skuLower);
        })
        : unitCandidates;
    const ranked = (skuCandidates.length > 0 ? skuCandidates : unitCandidates)
        .filter((item) => (0, azure_retail_pricing_service_1.getEffectivePrice)(item) > 0)
        .sort((a, b) => (0, azure_retail_pricing_service_1.getEffectivePrice)(a) - (0, azure_retail_pricing_service_1.getEffectivePrice)(b));
    return ranked[0] ?? null;
};
const chooseBandwidthItem = (items) => {
    const candidates = items
        .filter((item) => {
        const unit = (item.unitOfMeasure ?? "").toLowerCase();
        const text = `${item.meterName ?? ""} ${item.productName ?? ""}`.toLowerCase();
        return (unit.includes("gb") &&
            (text.includes("data transfer out") ||
                text.includes("bandwidth") ||
                text.includes("outbound") ||
                text.includes("egress")));
    })
        .filter((item) => (0, azure_retail_pricing_service_1.getEffectivePrice)(item) > 0)
        .map((item) => {
        const text = `${item.meterName ?? ""} ${item.productName ?? ""}`.toLowerCase();
        let score = 0;
        if (text.includes("data transfer out")) {
            score += 3;
        }
        if (text.includes("internet")) {
            score += 3;
        }
        if (text.includes("inter-availability zone") || text.includes("inter availability zone")) {
            score -= 5;
        }
        if (text.includes("intra") || text.includes("internal")) {
            score -= 3;
        }
        if (text.includes("vpn") || text.includes("expressroute")) {
            score -= 3;
        }
        return { item, score };
    })
        .sort((a, b) => {
        if (b.score !== a.score) {
            return b.score - a.score;
        }
        return (0, azure_retail_pricing_service_1.getEffectivePrice)(a.item) - (0, azure_retail_pricing_service_1.getEffectivePrice)(b.item);
    });
    return candidates[0]?.item ?? null;
};
const calculateMonthlyCost = (mode, unitPriceInr, input) => {
    if (mode === "compute") {
        const hours = input.hours && input.hours > 0 ? input.hours : DEFAULT_MONTHLY_HOURS;
        const quantity = input.quantity && input.quantity > 0 ? input.quantity : 1;
        return round2(unitPriceInr * hours * quantity);
    }
    if (mode === "disk") {
        const quantity = input.quantity && input.quantity > 0 ? input.quantity : 1;
        return round2(unitPriceInr * quantity);
    }
    if (mode === "bandwidth") {
        const usageGB = input.usageGB ?? 0;
        return round2(unitPriceInr * usageGB);
    }
    const quantity = input.quantity && input.quantity > 0 ? input.quantity : 1;
    return round2(unitPriceInr * quantity);
};
const validateUnitOfMeasure = (mode, unitOfMeasure, context) => {
    const fail = (message) => {
        logger_1.default.error("UNIT_VALIDATION_FAILED", {
            ...context,
            mode,
            unitOfMeasure,
            error: message
        });
        throw new PricingValidationError(message, {
            ...context,
            mode,
            unitOfMeasure
        });
    };
    if (mode === "compute") {
        if (unitOfMeasure !== "1 Hour") {
            fail("Invalid unit for compute VM");
        }
    }
    else if (mode === "disk") {
        if (!unitOfMeasure.includes("Month")) {
            fail("Invalid unit for disk");
        }
    }
    else if (mode === "bandwidth") {
        if (!unitOfMeasure.includes("GB")) {
            fail("Invalid unit for bandwidth");
        }
    }
    logger_1.default.info("UNIT_VALIDATION_SUCCESS", {
        ...context,
        mode,
        unitOfMeasure
    });
};
const queryAzureRetailPricing = async (input) => {
    if (!input.serviceName?.trim()) {
        throw new AzurePricingQueryError("INVALID_INPUT", "serviceName is required", {
            input
        });
    }
    if (!input.region?.trim()) {
        throw new AzurePricingQueryError("INVALID_INPUT", "region is required", {
            input
        });
    }
    const mode = detectPricingMode(input);
    const region = normalizeRegion(input.region);
    const candidates = serviceNameCandidates(input, mode);
    const armSkuName = mode === "compute" && input.skuName?.trim()
        ? toExactArmSkuName(input.skuName)
        : undefined;
    let lastQueryUrl = "";
    for (const serviceName of candidates) {
        const cached = await (0, azure_price_cache_service_1.getCachedAzurePrice)({
            serviceName,
            skuName: input.skuName,
            region,
            mode,
            osType: input.osType
        });
        if (cached) {
            const cachedUnitPriceInr = toInr(cached.unitPrice, cached.currencyCode);
            return {
                unitPrice: cachedUnitPriceInr,
                monthlyCost: calculateMonthlyCost(mode, cachedUnitPriceInr, input),
                matchedSkuName: cached.skuName,
                meterName: cached.meterName,
                queryUrl: `cache://azure-price-cache/${encodeURIComponent(serviceName)}/${encodeURIComponent(region)}`,
                unitOfMeasure: cached.unitOfMeasure,
                currencyCode: cached.currencyCode,
                source: "cache"
            };
        }
        const filter = buildFilter(serviceName, region, {
            mode,
            skuName: input.skuName,
            armSkuName,
            useArmSkuFallbackContains: false
        });
        const queryUrl = buildQueryUrl(filter);
        lastQueryUrl = queryUrl;
        if (mode === "compute" && armSkuName) {
            logger_1.default.info("ARM_SKU_EXACT_MATCH_ENABLED", {
                serviceName,
                region,
                inputSkuName: input.skuName,
                armSkuName,
                filter
            });
        }
        logger_1.default.info("FILTER_PRICE_TYPE_CONSUMPTION_ENABLED", {
            serviceName,
            region,
            skuName: input.skuName,
            mode,
            filter
        });
        logger_1.default.info("AZURE_RETAIL_QUERY_EXECUTED", {
            serviceName,
            region,
            skuName: input.skuName,
            mode,
            queryUrl
        });
        let items;
        try {
            const fetched = await (0, azure_retail_pricing_service_1.fetchAzureRetailPrices)(filter, Math.max(1, AZURE_RETAIL_QUERY_MAX_PAGES), {
                exactArmSkuName: mode === "compute" ? armSkuName : undefined,
                logContext: {
                    serviceName,
                    region,
                    skuName: input.skuName,
                    mode,
                    queryType: "primary"
                }
            });
            items = filterStrictOnDemandItems(fetched, {
                serviceName,
                region,
                skuName: input.skuName,
                mode
            });
        }
        catch (error) {
            throw new AzurePricingQueryError("QUERY_FAILED", "Failed to query Azure Retail Pricing API", {
                serviceName,
                region,
                queryUrl,
                error: error instanceof Error ? error.message : String(error)
            });
        }
        let match = null;
        if (mode === "compute") {
            match = chooseComputeItem(items, input, armSkuName);
            if (!match && input.skuName?.trim()) {
                const fallbackFilter = buildFilter(serviceName, region, {
                    mode,
                    skuName: input.skuName,
                    armSkuName,
                    useArmSkuFallbackContains: true
                });
                const fallbackQueryUrl = buildQueryUrl(fallbackFilter);
                lastQueryUrl = fallbackQueryUrl;
                logger_1.default.warn("ARM_SKU_NOT_FOUND_FALLBACK", {
                    serviceName,
                    region,
                    inputSkuName: input.skuName,
                    armSkuName,
                    fallbackFilter
                });
                logger_1.default.info("AZURE_RETAIL_QUERY_EXECUTED", {
                    serviceName,
                    region,
                    skuName: input.skuName,
                    mode,
                    queryUrl: fallbackQueryUrl
                });
                try {
                    const fallbackFetched = await (0, azure_retail_pricing_service_1.fetchAzureRetailPrices)(fallbackFilter, Math.max(1, AZURE_RETAIL_QUERY_MAX_PAGES), {
                        exactArmSkuName: armSkuName,
                        logContext: {
                            serviceName,
                            region,
                            skuName: input.skuName,
                            mode,
                            queryType: "fallback"
                        }
                    });
                    const fallbackItems = filterStrictOnDemandItems(fallbackFetched, {
                        serviceName,
                        region,
                        skuName: input.skuName,
                        mode
                    });
                    match = chooseComputeItem(fallbackItems, input);
                }
                catch (error) {
                    throw new AzurePricingQueryError("QUERY_FAILED", "Failed to query Azure Retail Pricing API", {
                        serviceName,
                        region,
                        queryUrl: fallbackQueryUrl,
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
            }
        }
        else if (mode === "disk") {
            match = chooseDiskItem(items, input);
        }
        else if (mode === "bandwidth") {
            match = chooseBandwidthItem(items);
        }
        else {
            match = items[0] ?? null;
        }
        if (!match) {
            continue;
        }
        const matchedSkuName = (match.armSkuName ?? match.skuName ?? input.skuName ?? "unknown").trim();
        const meterName = (match.meterName ?? "unknown-meter").trim();
        const unitOfMeasure = (match.unitOfMeasure ?? "unit").trim();
        validateUnitOfMeasure(mode, unitOfMeasure, {
            serviceName,
            region,
            skuName: input.skuName,
            matchedSkuName
        });
        const unitPriceInr = toInr((0, azure_retail_pricing_service_1.getEffectivePrice)(match), match.currencyCode);
        const monthlyCost = calculateMonthlyCost(mode, unitPriceInr, input);
        await (0, azure_price_cache_service_1.storeAzurePriceCache)({
            serviceName,
            skuName: matchedSkuName,
            region,
            unitPrice: (0, azure_retail_pricing_service_1.getEffectivePrice)(match),
            unitOfMeasure,
            meterName,
            currencyCode: match.currencyCode ?? "USD",
            mode,
            osType: input.osType
        });
        return {
            unitPrice: unitPriceInr,
            monthlyCost,
            matchedSkuName,
            meterName,
            queryUrl,
            unitOfMeasure,
            currencyCode: match.currencyCode ?? "USD",
            source: "api"
        };
    }
    throw new AzurePricingQueryError("NO_PRICING_FOUND", "No Azure retail pricing record matched the requested parameters", {
        mode,
        serviceName: input.serviceName,
        region,
        skuName: input.skuName,
        lastQueryUrl
    });
};
exports.queryAzureRetailPricing = queryAzureRetailPricing;
