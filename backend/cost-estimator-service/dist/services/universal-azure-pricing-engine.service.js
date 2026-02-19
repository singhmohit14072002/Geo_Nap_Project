"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.estimateAzureCloudEstimatePricing = exports.normalizeClassifiedAzureServices = void 0;
const azure_retail_pricing_service_1 = require("./azure-retail-pricing.service");
const calculator_util_1 = require("../utils/calculator.util");
const logger_1 = __importDefault(require("../utils/logger"));
const estimate_schema_1 = require("../schemas/estimate.schema");
const cloud_pricing_repository_1 = require("./cloud-pricing.repository");
const AZURE_USD_TO_INR = Number(process.env.AZURE_USD_TO_INR ?? "83");
const DEFAULT_MONTHLY_HOURS = Number(process.env.DEFAULT_MONTHLY_HOURS ?? "730");
const round2 = (value) => Number(value.toFixed(2));
const toStringValue = (value) => {
    if (typeof value === "string") {
        const normalized = value.trim();
        return normalized.length > 0 ? normalized : null;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
    }
    return null;
};
const toNumber = (value) => {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string") {
        const normalized = value.trim();
        if (!normalized) {
            return null;
        }
        const parsed = Number(normalized.replace(/,/g, ""));
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};
const readFirst = (row, keys) => {
    for (const key of keys) {
        if (!(key in row)) {
            continue;
        }
        const value = toStringValue(row[key]);
        if (value) {
            return value;
        }
    }
    return null;
};
const normalizeRegion = (value) => {
    const key = value.toLowerCase().replace(/[^a-z0-9]/g, "");
    const map = {
        centralindia: "centralindia",
        southindia: "southindia",
        westus2: "westus2",
        eastus: "eastus",
        northeurope: "northeurope",
        westeurope: "westeurope"
    };
    return map[key] ?? key;
};
const parseHours = (description) => {
    const fixedMatch = description.match(/(\d+(?:\.\d+)?)\s*(?:fixed\s+gateway\s+)?hours?/i);
    if (fixedMatch) {
        const hours = toNumber(fixedMatch[1]);
        if (hours && hours > 0) {
            return hours;
        }
    }
    const xMatch = description.match(/x\s*(\d+(?:\.\d+)?)\s*hours?/i);
    if (xMatch) {
        const hours = toNumber(xMatch[1]);
        if (hours && hours > 0) {
            return hours;
        }
    }
    return DEFAULT_MONTHLY_HOURS;
};
const parseQuantity = (description) => {
    const vmMatch = description.match(/(\d+(?:\.\d+)?)\s+[a-z]\d+[a-z0-9._-]*(?:\s*v\d+)?\s*\(/i);
    if (vmMatch) {
        const qty = toNumber(vmMatch[1]);
        if (qty && qty > 0) {
            return Math.max(1, Math.round(qty));
        }
    }
    const diskMatch = description.match(/disk\s+type\s+(\d+(?:\.\d+)?)\s+disks?/i);
    if (diskMatch) {
        const qty = toNumber(diskMatch[1]);
        if (qty && qty > 0) {
            return Math.max(1, Math.round(qty));
        }
    }
    const instanceMatch = description.match(/(\d+(?:\.\d+)?)\s*instance/i);
    if (instanceMatch) {
        const qty = toNumber(instanceMatch[1]);
        if (qty && qty > 0) {
            return Math.max(1, Math.round(qty));
        }
    }
    return 1;
};
const parseUsageGb = (description) => {
    const regex = /(\d+(?:\.\d+)?)\s*gb\s*(?:outbound\s+data\s+transfer|outbound|data\s+transfer|data\s+processed|average\s+monthly\s+backup\s+data)/gi;
    let total = 0;
    let matched = false;
    let current = regex.exec(description);
    while (current) {
        const value = toNumber(current[1]);
        if (value !== null) {
            total += value;
            matched = true;
        }
        current = regex.exec(description);
    }
    return matched ? round2(total) : 0;
};
const parseCapacityUnits = (description) => {
    const match = description.match(/(\d+(?:\.\d+)?)\s*compute\s*units?/i);
    if (!match) {
        return 0;
    }
    const value = toNumber(match[1]);
    if (!value || value <= 0) {
        return 0;
    }
    return value;
};
const parseSkuName = (classification, serviceType, description) => {
    if (classification === "COMPUTE_VM") {
        const vmMatch = description.match(/\b([a-z]\d+[a-z0-9._-]*(?:\s*v\d+)?)\b/i);
        return vmMatch?.[1] ?? null;
    }
    if (classification === "STORAGE_DISK") {
        const diskMatch = description.match(/\b(p\d{1,3})\b/i);
        return diskMatch?.[1]?.toUpperCase() ?? null;
    }
    if (classification === "NETWORK_GATEWAY") {
        const tierMatch = description.match(/\b(standard\s*v2|standard)\b/i);
        if (tierMatch) {
            return tierMatch[1];
        }
    }
    if (serviceType) {
        return serviceType;
    }
    return null;
};
const mapServiceName = (classification, serviceType) => {
    switch (classification) {
        case "COMPUTE_VM":
            return "Virtual Machines";
        case "STORAGE_DISK":
            return "Storage";
        case "NETWORK_GATEWAY":
            if (serviceType && serviceType.toLowerCase().includes("nat")) {
                return "Virtual Network";
            }
            return "Application Gateway";
        case "NETWORK_EGRESS":
            return "Bandwidth";
        case "BACKUP":
            return "Recovery Services";
        case "AUTOMATION":
            return "Automation";
        case "MONITORING":
            return "Azure Monitor";
        case "LOGIC_APPS":
            return "Logic Apps";
        default:
            return serviceType ?? "Unknown Service";
    }
};
const normalizeClassifiedAzureServices = (input) => {
    const normalized = [];
    for (const service of input.classifiedServices) {
        const valid = estimate_schema_1.classifiedServiceSchema.safeParse(service);
        if (!valid.success) {
            logger_1.default.warn("Skipping invalid classified service row", {
                issues: valid.error.flatten()
            });
            continue;
        }
        const row = valid.data.row;
        const serviceType = valid.data.serviceType ??
            readFirst(row, ["servicetype", "__empty", "service_type"]);
        const rowRegion = readFirst(row, ["region", "__empty_2"]);
        const description = readFirst(row, ["description", "__empty_3", "service_description"]) ?? "";
        const region = normalizeRegion(rowRegion ?? input.region);
        const usageHours = parseHours(description);
        const quantity = parseQuantity(description);
        const usageGB = parseUsageGb(description);
        const capacityUnits = parseCapacityUnits(description);
        const skuName = parseSkuName(valid.data.classification, serviceType, description);
        const serviceName = mapServiceName(valid.data.classification, serviceType);
        normalized.push({
            classification: valid.data.classification,
            serviceName,
            skuName,
            region,
            quantity,
            usageHours,
            usageGB,
            capacityUnits,
            sourceServiceType: serviceType,
            sourceRow: row
        });
    }
    return normalized;
};
exports.normalizeClassifiedAzureServices = normalizeClassifiedAzureServices;
const parseNormalizedSkuName = (rawSkuName) => {
    const parts = rawSkuName.split("|").map((part) => part.trim()).filter(Boolean);
    const baseSkuName = parts[0] ?? rawSkuName;
    let meterName = null;
    let beginRange = null;
    let endRange = null;
    for (const part of parts.slice(1)) {
        const equalsIndex = part.indexOf("=");
        if (equalsIndex === -1) {
            continue;
        }
        const key = part.slice(0, equalsIndex).trim().toLowerCase();
        const value = part.slice(equalsIndex + 1).trim();
        if (!value) {
            continue;
        }
        if (key === "meter") {
            meterName = value;
        }
        else if (key === "begin") {
            beginRange = value;
        }
        else if (key === "end") {
            endRange = value;
        }
    }
    return {
        baseSkuName,
        meterName,
        beginRange,
        endRange
    };
};
const mapCloudPricingRowToRetailItem = (row) => {
    const parsedSku = parseNormalizedSkuName(row.skuName);
    return {
        armRegionName: row.region,
        armSkuName: parsedSku.baseSkuName,
        skuName: row.skuName,
        serviceName: row.serviceName,
        meterName: parsedSku.meterName ?? row.skuName,
        productName: row.serviceName,
        retailPrice: row.retailPrice,
        unitOfMeasure: row.unit,
        currencyCode: row.currency,
        beginRange: parsedSku.beginRange ?? undefined,
        endRange: parsedSku.endRange ?? undefined
    };
};
const loadLocalServicePriceItems = async (serviceName, region) => {
    try {
        const regionRows = await (0, cloud_pricing_repository_1.listLatestCloudPrices)("azure", region, serviceName);
        if (regionRows.length > 0) {
            return {
                items: regionRows.map(mapCloudPricingRowToRetailItem),
                pricingVersion: regionRows[0].pricingVersion,
                sourceRegion: region
            };
        }
        logger_1.default.warn("AZURE_LOCAL_PRICE_REGION_MISS", {
            serviceName,
            requestedRegion: region
        });
        const fallbackRows = await (0, cloud_pricing_repository_1.listLatestCloudPricesAnyRegion)("azure", serviceName);
        if (fallbackRows.length === 0) {
            logger_1.default.warn("AZURE_LOCAL_PRICE_SERVICE_MISS", {
                serviceName,
                requestedRegion: region
            });
            return {
                items: [],
                pricingVersion: null,
                sourceRegion: region
            };
        }
        const fallbackRegion = fallbackRows[0].region;
        const sameRegionRows = fallbackRows.filter((row) => row.region === fallbackRegion);
        logger_1.default.warn("AZURE_LOCAL_PRICE_REGION_FALLBACK", {
            serviceName,
            requestedRegion: region,
            fallbackRegion
        });
        return {
            items: sameRegionRows.map(mapCloudPricingRowToRetailItem),
            pricingVersion: sameRegionRows[0]?.pricingVersion ?? fallbackRows[0].pricingVersion,
            sourceRegion: fallbackRegion
        };
    }
    catch (error) {
        logger_1.default.error("AZURE_LOCAL_PRICE_LOOKUP_FAILED", {
            serviceName,
            requestedRegion: region,
            error: error instanceof Error ? error.message : String(error)
        });
        return {
            items: [],
            pricingVersion: null,
            sourceRegion: region
        };
    }
};
const toInr = (value, currencyCode) => {
    const code = (currencyCode ?? "USD").toUpperCase();
    if (code === "INR") {
        return round2(value);
    }
    return round2(value * AZURE_USD_TO_INR);
};
const meterText = (item) => `${item.meterName ?? ""} ${item.productName ?? ""} ${item.armSkuName ?? ""}`.toLowerCase();
const pickCandidateItems = (service, items) => {
    if (!service.skuName) {
        return items;
    }
    const skuLower = service.skuName.toLowerCase();
    const filtered = items.filter((item) => {
        const armSku = (item.armSkuName ?? "").toLowerCase();
        const text = meterText(item);
        return armSku.includes(skuLower) || text.includes(skuLower);
    });
    return filtered.length > 0 ? filtered : items;
};
const calculateTieredBandwidthCost = (usageGB, items) => {
    const tiers = items
        .filter((item) => meterText(item).includes("data transfer out"))
        .map((item) => {
        const price = (0, azure_retail_pricing_service_1.getEffectivePrice)(item);
        const begin = Number(item.beginRange ?? "0");
        const endRaw = item.endRange ?? "Inf";
        const end = endRaw.toLowerCase() === "inf" ? Number.POSITIVE_INFINITY : Number(endRaw);
        return {
            begin: Number.isFinite(begin) ? begin : 0,
            end: Number.isFinite(end) ? end : Number.POSITIVE_INFINITY,
            price,
            currency: item.currencyCode
        };
    })
        .filter((tier) => tier.price > 0)
        .sort((a, b) => a.begin - b.begin);
    if (tiers.length === 0 || usageGB <= 0) {
        return { monthlyCost: 0, unitPriceInr: null };
    }
    let remaining = usageGB;
    let total = 0;
    for (const tier of tiers) {
        if (remaining <= 0) {
            break;
        }
        const tierCapacity = tier.end - tier.begin;
        const consumed = Math.min(remaining, tierCapacity);
        if (consumed <= 0) {
            continue;
        }
        total += toInr(tier.price, tier.currency) * consumed;
        remaining -= consumed;
    }
    const effectiveUnitPrice = usageGB > 0 ? total / usageGB : 0;
    return {
        monthlyCost: round2(total),
        unitPriceInr: round2(effectiveUnitPrice)
    };
};
const calculateBackupStorageCost = (usageGB, items) => {
    const candidates = items
        .filter((item) => {
        const text = meterText(item);
        return (text.includes("backup") ||
            text.includes("data stored") ||
            text.includes("protected instance"));
    })
        .filter((item) => (0, azure_retail_pricing_service_1.getEffectivePrice)(item) > 0)
        .sort((a, b) => (0, azure_retail_pricing_service_1.getEffectivePrice)(a) - (0, azure_retail_pricing_service_1.getEffectivePrice)(b));
    if (candidates.length === 0 || usageGB <= 0) {
        return { monthlyCost: 0, unitPriceInr: null };
    }
    const chosen = candidates[0];
    const unit = toInr((0, azure_retail_pricing_service_1.getEffectivePrice)(chosen), chosen.currencyCode);
    return {
        monthlyCost: round2(unit * usageGB),
        unitPriceInr: unit
    };
};
const calculateApplicationGatewayCost = (service, items) => {
    const gatewayHourRows = items
        .filter((item) => meterText(item).includes("gateway hour"))
        .filter((item) => (0, azure_retail_pricing_service_1.getEffectivePrice)(item) > 0)
        .sort((a, b) => (0, azure_retail_pricing_service_1.getEffectivePrice)(a) - (0, azure_retail_pricing_service_1.getEffectivePrice)(b));
    const capacityRows = items
        .filter((item) => meterText(item).includes("capacity unit"))
        .filter((item) => (0, azure_retail_pricing_service_1.getEffectivePrice)(item) > 0)
        .sort((a, b) => (0, azure_retail_pricing_service_1.getEffectivePrice)(a) - (0, azure_retail_pricing_service_1.getEffectivePrice)(b));
    const gatewayRate = gatewayHourRows[0]
        ? toInr((0, azure_retail_pricing_service_1.getEffectivePrice)(gatewayHourRows[0]), gatewayHourRows[0].currencyCode)
        : 0;
    const capacityRate = capacityRows[0]
        ? toInr((0, azure_retail_pricing_service_1.getEffectivePrice)(capacityRows[0]), capacityRows[0].currencyCode)
        : 0;
    const quantity = service.quantity > 0 ? service.quantity : 1;
    const hours = service.usageHours > 0 ? service.usageHours : DEFAULT_MONTHLY_HOURS;
    const capacityUnits = service.capacityUnits > 0 ? service.capacityUnits : 0;
    const monthlyCost = round2(gatewayRate * hours * quantity + capacityRate * hours * capacityUnits);
    return {
        monthlyCost,
        unitPriceInr: gatewayRate > 0 ? gatewayRate : null,
        note: `gatewayHours=${hours}, gateways=${quantity}, capacityUnits=${capacityUnits}`
    };
};
const calculateGenericCost = (service, items) => {
    const candidates = pickCandidateItems(service, items)
        .filter((item) => (0, azure_retail_pricing_service_1.getEffectivePrice)(item) > 0)
        .sort((a, b) => (0, azure_retail_pricing_service_1.getEffectivePrice)(a) - (0, azure_retail_pricing_service_1.getEffectivePrice)(b));
    if (candidates.length === 0) {
        return {
            monthlyCost: 0,
            unitPriceInr: null,
            note: "No matching retail meter found"
        };
    }
    const chosen = candidates[0];
    const unitPriceInr = toInr((0, azure_retail_pricing_service_1.getEffectivePrice)(chosen), chosen.currencyCode);
    const unit = (chosen.unitOfMeasure ?? "").toLowerCase();
    const quantity = service.quantity > 0 ? service.quantity : 1;
    const hours = service.usageHours > 0 ? service.usageHours : DEFAULT_MONTHLY_HOURS;
    const usageGB = service.usageGB > 0 ? service.usageGB : 0;
    let monthlyCost = unitPriceInr * quantity;
    let note = `unit=${chosen.unitOfMeasure ?? "unknown"}, quantity=${quantity}`;
    if (unit.includes("hour")) {
        monthlyCost = unitPriceInr * hours * quantity;
        note = `hourly meter, hours=${hours}, quantity=${quantity}`;
    }
    else if (unit.includes("gb")) {
        const gb = usageGB > 0 ? usageGB : quantity;
        monthlyCost = unitPriceInr * gb;
        note = `gb meter, usageGB=${gb}`;
    }
    else if (unit.includes("month")) {
        monthlyCost = unitPriceInr * quantity;
        note = `monthly meter, quantity=${quantity}`;
    }
    return {
        monthlyCost: round2(monthlyCost),
        unitPriceInr: round2(unitPriceInr),
        note
    };
};
const classificationToDetailType = (classification) => {
    if (classification === "COMPUTE_VM") {
        return "compute";
    }
    if (classification === "STORAGE_DISK") {
        return "storage";
    }
    if (classification === "NETWORK_EGRESS") {
        return "network-egress";
    }
    if (classification === "BACKUP") {
        return "backup";
    }
    return "other";
};
const applyBreakdown = (classification, amount, totals) => {
    if (classification === "COMPUTE_VM") {
        totals.compute += amount;
        return;
    }
    if (classification === "STORAGE_DISK") {
        totals.storage += amount;
        return;
    }
    if (classification === "NETWORK_EGRESS") {
        totals.network += amount;
        return;
    }
    if (classification === "BACKUP") {
        totals.backup += amount;
        return;
    }
    totals.other += amount;
};
const estimateAzureCloudEstimatePricing = async (input) => {
    const normalized = (0, exports.normalizeClassifiedAzureServices)(input);
    if (normalized.length === 0) {
        throw new Error("No services available after normalization for CLOUD_ESTIMATE mode");
    }
    const totals = {
        compute: 0,
        storage: 0,
        database: 0,
        backup: 0,
        network: 0,
        other: 0
    };
    const details = [];
    const servicePriceCache = new Map();
    const pricingVersions = new Set();
    for (const service of normalized) {
        const cacheKey = `${service.serviceName}|${service.region}`;
        let lookup = servicePriceCache.get(cacheKey);
        if (!lookup) {
            lookup = await loadLocalServicePriceItems(service.serviceName, service.region);
            servicePriceCache.set(cacheKey, lookup);
        }
        const items = lookup.items;
        if (lookup.pricingVersion) {
            pricingVersions.add(lookup.pricingVersion);
        }
        if (items.length === 0) {
            logger_1.default.warn("No local Azure pricing rows for normalized service", {
                serviceName: service.serviceName,
                region: service.region,
                skuName: service.skuName
            });
        }
        let monthlyCost = 0;
        let unitPriceInr = null;
        let note = "";
        if (service.classification === "NETWORK_EGRESS") {
            const tiered = calculateTieredBandwidthCost(service.usageGB, items);
            monthlyCost = tiered.monthlyCost;
            unitPriceInr = tiered.unitPriceInr;
            note = "tiered bandwidth calculator";
        }
        else if (service.classification === "BACKUP") {
            const backup = calculateBackupStorageCost(service.usageGB, items);
            monthlyCost = backup.monthlyCost;
            unitPriceInr = backup.unitPriceInr;
            note = "backup storage tier calculator";
        }
        else if (service.classification === "NETWORK_GATEWAY" &&
            service.serviceName.toLowerCase().includes("application gateway")) {
            const gateway = calculateApplicationGatewayCost(service, items);
            monthlyCost = gateway.monthlyCost;
            unitPriceInr = gateway.unitPriceInr;
            note = gateway.note;
        }
        else {
            const generic = calculateGenericCost(service, items);
            monthlyCost = generic.monthlyCost;
            unitPriceInr = generic.unitPriceInr;
            note = generic.note;
        }
        monthlyCost = round2(monthlyCost);
        applyBreakdown(service.classification, monthlyCost, totals);
        details.push({
            serviceType: classificationToDetailType(service.classification),
            name: service.sourceServiceType ?? service.serviceName,
            sku: service.skuName ?? undefined,
            quantity: service.quantity,
            unitPrice: unitPriceInr ?? undefined,
            monthlyCost,
            metadata: {
                classification: service.classification,
                serviceName: service.serviceName,
                region: service.region,
                usageHours: service.usageHours,
                usageGB: service.usageGB,
                capacityUnits: service.capacityUnits,
                pricingSourceRegion: lookup.sourceRegion,
                pricingNote: note
            }
        });
    }
    const breakdown = (0, calculator_util_1.buildBreakdown)(round2(totals.compute), round2(totals.storage), round2(totals.database), round2(totals.network));
    breakdown.backup = round2(totals.backup);
    breakdown.other = round2(totals.other);
    const summary = (0, calculator_util_1.buildSummary)(breakdown);
    const pricingVersion = pricingVersions.size === 0
        ? "azure-local-pricing-unavailable"
        : pricingVersions.size === 1
            ? Array.from(pricingVersions)[0]
            : `azure-local-mixed:${Array.from(pricingVersions).join(",")}`;
    return {
        provider: "azure",
        region: normalizeRegion(input.region),
        summary,
        breakdown,
        details,
        pricingVersion,
        calculatedAt: new Date()
    };
};
exports.estimateAzureCloudEstimatePricing = estimateAzureCloudEstimatePricing;
