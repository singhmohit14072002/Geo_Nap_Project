"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncAzurePriceCatalogToDatabase = void 0;
const cloud_pricing_repository_1 = require("./cloud-pricing.repository");
const azure_retail_pricing_service_1 = require("./azure-retail-pricing.service");
const logger_1 = __importDefault(require("../utils/logger"));
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
];
const AZURE_PRICE_SYNC_MAX_PAGES = Number(process.env.AZURE_PRICE_SYNC_MAX_PAGES ?? "80");
const AZURE_PRICE_SYNC_BATCH_SIZE = Number(process.env.AZURE_PRICE_SYNC_BATCH_SIZE ?? "2000");
const buildVersionTag = () => {
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(now.getUTCDate()).padStart(2, "0");
    return `azure-${yyyy}-${mm}-${dd}`;
};
const normalizeRegion = (value) => {
    if (!value) {
        return null;
    }
    const normalized = value.trim().toLowerCase();
    return normalized.length > 0 ? normalized : null;
};
const normalizeText = (value) => {
    if (!value) {
        return null;
    }
    const normalized = value.replace(/\s+/g, " ").trim();
    return normalized.length > 0 ? normalized : null;
};
const shouldKeepItem = (item) => {
    const price = (0, azure_retail_pricing_service_1.getEffectivePrice)(item);
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
const buildNormalizedSkuName = (item) => {
    const baseSku = normalizeText(item.armSkuName) ??
        normalizeText(item.skuName) ??
        normalizeText(item.productName) ??
        "unknown";
    const meter = normalizeText(item.meterName) ?? "unknown-meter";
    const beginRange = normalizeText(item.beginRange) ?? "0";
    const endRange = normalizeText(item.endRange) ?? "Inf";
    return `${baseSku}|meter=${meter}|begin=${beginRange}|end=${endRange}`;
};
const normalizeRetailItems = (serviceName, items, pricingVersion) => {
    const normalizedRows = [];
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
            retailPrice: (0, azure_retail_pricing_service_1.getEffectivePrice)(item),
            currency,
            pricingVersion
        });
    }
    return normalizedRows;
};
const dedupeRows = (rows) => {
    const seen = new Set();
    const deduped = [];
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
const syncServiceFamily = async (serviceName, pricingVersion) => {
    const filter = `serviceName eq '${serviceName.replace(/'/g, "''")}' and priceType eq 'Consumption'`;
    const items = await (0, azure_retail_pricing_service_1.fetchAzureRetailPrices)(filter, Math.max(1, AZURE_PRICE_SYNC_MAX_PAGES));
    const normalized = normalizeRetailItems(serviceName, items, pricingVersion);
    logger_1.default.info("AZURE_PRICE_SYNC_FAMILY_FETCHED", {
        serviceName,
        fetchedItems: items.length,
        normalizedItems: normalized.length
    });
    return normalized;
};
const chunk = (input, size) => {
    if (size <= 0) {
        return [input];
    }
    const chunks = [];
    for (let i = 0; i < input.length; i += size) {
        chunks.push(input.slice(i, i + size));
    }
    return chunks;
};
const syncAzurePriceCatalogToDatabase = async () => {
    const version = buildVersionTag();
    const rows = [];
    for (const family of RELEVANT_AZURE_SERVICE_FAMILIES) {
        try {
            const familyRows = await syncServiceFamily(family, version);
            rows.push(...familyRows);
        }
        catch (error) {
            logger_1.default.error("AZURE_PRICE_SYNC_FAMILY_FAILED", {
                serviceFamily: family,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
    const deduped = dedupeRows(rows);
    const batches = chunk(deduped, Math.max(100, AZURE_PRICE_SYNC_BATCH_SIZE));
    let synced = 0;
    for (const batch of batches) {
        await (0, cloud_pricing_repository_1.upsertCloudPricingRecords)(batch);
        synced += batch.length;
    }
    logger_1.default.info("AZURE_PRICE_SYNC_COMPLETED", {
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
exports.syncAzurePriceCatalogToDatabase = syncAzurePriceCatalogToDatabase;
