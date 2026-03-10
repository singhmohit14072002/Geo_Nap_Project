"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.importAzureEstimateRows = void 0;
const import_schema_1 = require("../schemas/import.schema");
const http_error_1 = require("../utils/http-error");
const logger_1 = __importDefault(require("../utils/logger"));
const SERVICE_CATEGORY_KEYS = [
    "servicecategory",
    "category",
    "service_category",
    "servicecategoryname"
];
const SERVICE_TYPE_KEYS = [
    "servicetype",
    "service_type",
    "type",
    "product",
    "name"
];
const DESCRIPTION_KEYS = [
    "description",
    "details",
    "configuration",
    "resource",
    "resourcedetails"
];
const COST_KEYS = [
    "estimatedmonthlycost",
    "monthlycost",
    "monthly",
    "cost",
    "amount",
    "estimatedcost",
    "estimate"
];
const REGION_KEYS = ["region", "location", "deploymentregion", "geography"];
const SKU_KEYS = ["sku", "skuname", "instance", "instanceType", "vm", "model"];
const QUANTITY_KEYS = ["quantity", "qty", "count", "instances"];
const IGNORE_PATTERNS = [
    /licensing\s*program/i,
    /billing\s*account/i,
    /disclaimer/i,
    /prices?\s+are\s+estimates?/i,
    /contact\s+sales/i,
    /show\s+dev\/test\s+pricing/i,
    /estimated\s+upfront\s+cost/i,
    /support\s*:\s*basic/i
];
const CURRENCY_MARKERS = ["?", "$", "usd", "inr", "eur", "gbp"];
const round2 = (value) => Number(value.toFixed(2));
const normalizeKey = (value) => value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9_]/g, "");
const toDisplayString = (value) => {
    if (typeof value === "string") {
        const normalized = value.trim();
        return normalized.length > 0 ? normalized : null;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
    }
    if (typeof value === "boolean") {
        return value ? "true" : "false";
    }
    return null;
};
const parseCurrencyNumber = (value) => {
    if (typeof value === "number" && Number.isFinite(value)) {
        return round2(value);
    }
    if (typeof value !== "string") {
        return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }
    const cleaned = trimmed
        .replace(/?/g, "")
        .replace(/,/g, "")
        .replace(/[^0-9.+-]/g, "");
    if (!cleaned || cleaned === "." || cleaned === "-" || cleaned === "+") {
        return null;
    }
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? round2(parsed) : null;
};
const buildRowContext = (row) => {
    const normalizedByKey = {};
    const stringValues = [];
    Object.entries(row).forEach(([key, value]) => {
        normalizedByKey[normalizeKey(key)] = value;
        const text = toDisplayString(value);
        if (text) {
            stringValues.push(text);
        }
    });
    return {
        raw: row,
        normalizedByKey,
        stringValues,
        textBlob: stringValues.join(" | ")
    };
};
const valueByAliases = (ctx, aliases) => {
    for (const alias of aliases) {
        const key = normalizeKey(alias);
        const value = ctx.normalizedByKey[key];
        const text = toDisplayString(value);
        if (text) {
            return text;
        }
    }
    return null;
};
const isIgnorableRow = (ctx) => {
    if (!ctx.textBlob.trim()) {
        return true;
    }
    return IGNORE_PATTERNS.some((pattern) => pattern.test(ctx.textBlob));
};
const parseMonthlyCost = (ctx) => {
    for (const key of COST_KEYS) {
        const value = ctx.normalizedByKey[normalizeKey(key)];
        const parsed = parseCurrencyNumber(value);
        if (parsed !== null) {
            return parsed;
        }
    }
    for (const [rawKey, rawValue] of Object.entries(ctx.raw)) {
        const normKey = normalizeKey(rawKey);
        if (!normKey.includes("cost") && !normKey.includes("amount") && !normKey.includes("total")) {
            continue;
        }
        const parsed = parseCurrencyNumber(rawValue);
        if (parsed !== null) {
            return parsed;
        }
    }
    return null;
};
const parseCostFromAnyCurrencyCell = (ctx) => {
    for (const value of ctx.stringValues) {
        const lower = value.toLowerCase();
        if (!CURRENCY_MARKERS.some((marker) => lower.includes(marker))) {
            continue;
        }
        const parsed = parseCurrencyNumber(value);
        if (parsed !== null) {
            return parsed;
        }
    }
    return null;
};
const isTotalRow = (serviceCategory, serviceType, description, ctx) => {
    const checks = [serviceCategory, serviceType, description]
        .filter((item) => typeof item === "string")
        .map((item) => item.toLowerCase().trim());
    if (checks.some((item) => item === "total" || item.startsWith("total ") || item.includes("estimated total"))) {
        return true;
    }
    const normalizedKeys = Object.keys(ctx.normalizedByKey);
    if (normalizedKeys.some((key) => key.includes("total"))) {
        return true;
    }
    return /(^|\b)total(\b|\s*cost)/i.test(ctx.textBlob);
};
const parseQuantity = (description, ctx) => {
    for (const key of QUANTITY_KEYS) {
        const value = ctx.normalizedByKey[normalizeKey(key)];
        if (typeof value === "number" && Number.isFinite(value) && value > 0) {
            return Math.max(1, Math.round(value));
        }
        if (typeof value === "string") {
            const parsed = Number(value.replace(/,/g, "").trim());
            if (Number.isFinite(parsed) && parsed > 0) {
                return Math.max(1, Math.round(parsed));
            }
        }
    }
    if (!description) {
        return 1;
    }
    const patterns = [
        /^(\d+(?:\.\d+)?)\s*x\b/i,
        /\b(\d+(?:\.\d+)?)\s*(?:instances?|vms?|virtual\s*machines?)\b/i,
        /\bdisk\s+type\s+(\d+(?:\.\d+)?)\s+disks?\b/i
    ];
    for (const pattern of patterns) {
        const match = description.match(pattern);
        if (!match?.[1]) {
            continue;
        }
        const parsed = Number(match[1]);
        if (Number.isFinite(parsed) && parsed > 0) {
            return Math.max(1, Math.round(parsed));
        }
    }
    return 1;
};
const parseRegion = (description, ctx) => {
    const direct = valueByAliases(ctx, REGION_KEYS);
    if (direct) {
        return direct;
    }
    if (description) {
        const fromTo = description.match(/\bfrom\s+([a-z0-9\s,()\-]+?)\s+to\b/i);
        if (fromTo?.[1]) {
            return fromTo[1].trim();
        }
        const inRegion = description.match(/\bin\s+([a-z0-9\s,()\-]+?)\b/i);
        if (inRegion?.[1]) {
            return inRegion[1].trim();
        }
    }
    return "unknown";
};
const parseSkuName = (serviceType, description, ctx) => {
    const direct = valueByAliases(ctx, SKU_KEYS);
    if (direct) {
        return direct;
    }
    const candidateText = `${serviceType ?? ""} ${description ?? ""}`.trim();
    if (!candidateText) {
        return null;
    }
    const patterns = [
        /\b(Standard_[A-Za-z0-9_.-]+)\b/i,
        /\b([FGDELNCP][0-9]{1,3}[A-Za-z0-9_.-]*)\b/i,
        /\b(P\d{1,3}|S\d{1,3}|E\d{1,3}|L\d{1,3})\b/i,
        /\b(Application\s+Gateway\s+Standard\s+v2)\b/i
    ];
    for (const pattern of patterns) {
        const match = candidateText.match(pattern);
        if (match?.[1]) {
            return match[1].trim();
        }
    }
    return null;
};
const normalizeRows = (payload) => {
    if (Array.isArray(payload.parsedRows) && payload.parsedRows.length > 0) {
        return payload.parsedRows;
    }
    if (payload.rawInfrastructureData &&
        Array.isArray(payload.rawInfrastructureData.rows) &&
        payload.rawInfrastructureData.rows.length > 0) {
        return payload.rawInfrastructureData.rows;
    }
    return [];
};
const normalizeService = (serviceCategory, serviceType, region, skuName, quantity, providedMonthlyCost) => {
    return {
        serviceCategory: serviceCategory?.trim() || "Uncategorized",
        serviceType: serviceType?.trim() || "Unknown Service",
        region: region.trim() || "unknown",
        skuName: skuName?.trim() || null,
        quantity: Math.max(1, Math.round(quantity)),
        providedMonthlyCost: round2(providedMonthlyCost)
    };
};
const importAzureEstimateRows = (payload) => {
    const rows = normalizeRows(payload);
    if (rows.length === 0) {
        throw new http_error_1.HttpError(422, "No parsed rows available for import");
    }
    const services = [];
    let providedTotal = null;
    for (const row of rows) {
        const ctx = buildRowContext(row);
        if (isIgnorableRow(ctx)) {
            continue;
        }
        const serviceCategory = valueByAliases(ctx, SERVICE_CATEGORY_KEYS);
        const serviceType = valueByAliases(ctx, SERVICE_TYPE_KEYS);
        const description = valueByAliases(ctx, DESCRIPTION_KEYS);
        const monthlyCost = parseMonthlyCost(ctx);
        const totalRow = isTotalRow(serviceCategory, serviceType, description, ctx);
        if (totalRow) {
            const totalCandidate = monthlyCost ?? parseCostFromAnyCurrencyCell(ctx);
            if (totalCandidate !== null) {
                providedTotal = round2(totalCandidate);
            }
            continue;
        }
        if (monthlyCost === null) {
            continue;
        }
        const hasServiceSignals = Boolean(serviceCategory || serviceType || description);
        if (!hasServiceSignals) {
            continue;
        }
        const quantity = parseQuantity(description, ctx);
        const region = parseRegion(description, ctx);
        const skuName = parseSkuName(serviceType, description, ctx);
        const normalizedService = normalizeService(serviceCategory, serviceType, region, skuName, quantity, monthlyCost);
        services.push(normalizedService);
    }
    if (services.length === 0) {
        throw new http_error_1.HttpError(422, "No service rows were detected in provided parsed rows");
    }
    if (providedTotal === null) {
        throw new http_error_1.HttpError(422, "Total row could not be detected from parsed rows");
    }
    const response = import_schema_1.estimateImportResponseSchema.safeParse({
        services,
        providedTotal
    });
    if (!response.success) {
        throw new http_error_1.HttpError(422, "Normalized estimate import output validation failed", {
            issues: response.error.flatten()
        });
    }
    logger_1.default.info("ESTIMATE_IMPORT_PARSED", {
        serviceCount: response.data.services.length,
        providedTotal: response.data.providedTotal
    });
    return response.data;
};
exports.importAzureEstimateRows = importAzureEstimateRows;
