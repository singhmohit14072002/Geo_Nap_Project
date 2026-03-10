"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.storeAzurePriceCache = exports.getCachedAzurePrice = void 0;
const prisma_1 = __importDefault(require("../db/prisma"));
const logger_1 = __importDefault(require("../utils/logger"));
const CACHE_VERSION_PREFIX = "azure-cache-";
const DEFAULT_CACHE_LOOKUP_LIMIT = Number(process.env.AZURE_PRICE_CACHE_LOOKUP_LIMIT ?? "100");
const normalizeRegion = (value) => value.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9-]/g, "").trim();
const normalizeText = (value) => value.replace(/\s+/g, " ").trim();
const buildCachePricingVersion = (effectiveDate) => {
    const yyyy = effectiveDate.getUTCFullYear();
    const mm = String(effectiveDate.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(effectiveDate.getUTCDate()).padStart(2, "0");
    return `${CACHE_VERSION_PREFIX}${yyyy}-${mm}-${dd}`;
};
const buildCachedSkuName = (input) => {
    const normalizedSku = normalizeText(input.skuName || "generic-sku");
    const normalizedMeter = normalizeText(input.meterName || "unknown-meter");
    const normalizedOs = input.osType ? input.osType.toLowerCase() : "na";
    return `${normalizedSku}|meter=${normalizedMeter}|os=${normalizedOs}|mode=${input.mode}`;
};
const parseCachedSkuName = (rawSkuName) => {
    const parts = rawSkuName
        .split("|")
        .map((part) => part.trim())
        .filter(Boolean);
    const baseSkuName = parts[0] ?? rawSkuName;
    const metadata = new Map();
    for (const part of parts.slice(1)) {
        const equalsIndex = part.indexOf("=");
        if (equalsIndex <= 0) {
            continue;
        }
        const key = part.slice(0, equalsIndex).trim().toLowerCase();
        const value = part.slice(equalsIndex + 1).trim();
        if (!value) {
            continue;
        }
        metadata.set(key, value);
    }
    const modeValue = metadata.get("mode");
    const mode = modeValue === "compute" ||
        modeValue === "disk" ||
        modeValue === "bandwidth" ||
        modeValue === "generic"
        ? modeValue
        : null;
    return {
        baseSkuName,
        meterName: metadata.get("meter") ?? null,
        osType: metadata.get("os") ?? null,
        mode
    };
};
const filterRowsByLookupInput = (rows, input) => {
    const normalizedSku = input.skuName?.trim().toLowerCase();
    let filtered = rows;
    if (normalizedSku) {
        const skuFiltered = filtered.filter((row) => {
            const parsed = parseCachedSkuName(row.skuName);
            const searchable = `${row.skuName} ${parsed.baseSkuName}`.toLowerCase();
            return searchable.includes(normalizedSku);
        });
        if (skuFiltered.length > 0) {
            filtered = skuFiltered;
        }
    }
    if (input.mode === "compute") {
        const hourRows = filtered.filter((row) => row.unit.toLowerCase().includes("hour"));
        if (hourRows.length > 0) {
            filtered = hourRows;
        }
        if (input.osType) {
            const osRows = filtered.filter((row) => {
                const parsed = parseCachedSkuName(row.skuName);
                return parsed.osType === input.osType;
            });
            if (osRows.length > 0) {
                filtered = osRows;
            }
        }
    }
    else if (input.mode === "disk") {
        const diskRows = filtered.filter((row) => {
            const unit = row.unit.toLowerCase();
            return unit.includes("month") || unit.includes("disk") || unit.includes("hour");
        });
        if (diskRows.length > 0) {
            filtered = diskRows;
        }
    }
    else if (input.mode === "bandwidth") {
        const networkRows = filtered.filter((row) => row.unit.toLowerCase().includes("gb"));
        if (networkRows.length > 0) {
            filtered = networkRows;
        }
    }
    return filtered;
};
const getCachedAzurePrice = async (input) => {
    const normalizedRegion = normalizeRegion(input.region);
    try {
        const rows = await prisma_1.default.cloudPricing.findMany({
            where: {
                provider: "azure",
                region: normalizedRegion,
                serviceName: input.serviceName,
                pricingVersion: {
                    startsWith: CACHE_VERSION_PREFIX
                }
            },
            orderBy: [{ lastUpdated: "desc" }, { retailPrice: "asc" }],
            take: Math.max(1, DEFAULT_CACHE_LOOKUP_LIMIT)
        });
        if (rows.length === 0) {
            logger_1.default.info("CACHE_MISS", {
                provider: "azure",
                cache: "azure-price-cache",
                reason: "no_rows",
                serviceName: input.serviceName,
                skuName: input.skuName,
                region: normalizedRegion
            });
            return null;
        }
        const filteredRows = filterRowsByLookupInput(rows, input);
        const selected = filteredRows[0];
        if (!selected) {
            logger_1.default.info("CACHE_MISS", {
                provider: "azure",
                cache: "azure-price-cache",
                reason: "no_matching_row",
                serviceName: input.serviceName,
                skuName: input.skuName,
                region: normalizedRegion,
                mode: input.mode
            });
            return null;
        }
        const parsedSku = parseCachedSkuName(selected.skuName);
        const cached = {
            serviceName: selected.serviceName,
            skuName: parsedSku.baseSkuName,
            region: selected.region,
            unitPrice: selected.retailPrice,
            unitOfMeasure: selected.unit,
            meterName: parsedSku.meterName ?? selected.skuName,
            currencyCode: selected.currency,
            effectiveDate: selected.lastUpdated.toISOString(),
            pricingVersion: selected.pricingVersion
        };
        logger_1.default.info("CACHE_HIT", {
            provider: "azure",
            cache: "azure-price-cache",
            serviceName: input.serviceName,
            skuName: input.skuName,
            matchedSkuName: cached.skuName,
            region: normalizedRegion,
            pricingVersion: cached.pricingVersion
        });
        return cached;
    }
    catch (error) {
        logger_1.default.error("CACHE_LOOKUP_FAILED", {
            cache: "azure-price-cache",
            serviceName: input.serviceName,
            skuName: input.skuName,
            region: normalizedRegion,
            error: error instanceof Error ? error.message : String(error)
        });
        return null;
    }
};
exports.getCachedAzurePrice = getCachedAzurePrice;
const storeAzurePriceCache = async (input) => {
    const normalizedRegion = normalizeRegion(input.region);
    const effectiveDate = input.effectiveDate ? new Date(input.effectiveDate) : new Date();
    const pricingVersion = buildCachePricingVersion(Number.isNaN(effectiveDate.getTime()) ? new Date() : effectiveDate);
    const cachedSkuName = buildCachedSkuName(input);
    const unitOfMeasure = normalizeText(input.unitOfMeasure || "unit");
    try {
        await prisma_1.default.cloudPricing.upsert({
            where: {
                provider_region_service_sku_unit_unique: {
                    provider: "azure",
                    region: normalizedRegion,
                    serviceName: input.serviceName,
                    skuName: cachedSkuName,
                    unit: unitOfMeasure
                }
            },
            create: {
                provider: "azure",
                region: normalizedRegion,
                serviceName: input.serviceName,
                skuName: cachedSkuName,
                unit: unitOfMeasure,
                retailPrice: input.unitPrice,
                currency: input.currencyCode ?? "USD",
                pricingVersion
            },
            update: {
                retailPrice: input.unitPrice,
                currency: input.currencyCode ?? "USD",
                pricingVersion
            }
        });
        logger_1.default.info("CACHE_STORE", {
            cache: "azure-price-cache",
            serviceName: input.serviceName,
            skuName: input.skuName,
            region: normalizedRegion,
            pricingVersion
        });
    }
    catch (error) {
        logger_1.default.error("CACHE_STORE_FAILED", {
            cache: "azure-price-cache",
            serviceName: input.serviceName,
            skuName: input.skuName,
            region: normalizedRegion,
            error: error instanceof Error ? error.message : String(error)
        });
    }
};
exports.storeAzurePriceCache = storeAzurePriceCache;
