"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseAzureEstimateExcel = exports.parseAzureEstimateText = void 0;
const XLSX = __importStar(require("xlsx"));
const normalizeString = (value) => typeof value === "string" ? value.trim() : typeof value === "number" ? String(value).trim() : "";
const normalizeRegion = (value) => value.toLowerCase().replace(/\s+/g, "");
const parseCurrency = (value) => {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value !== "string") {
        return undefined;
    }
    const normalized = value.replace(/[^\d.-]/g, "");
    if (!normalized) {
        return undefined;
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
};
const parseMonthlyFromText = (text) => {
    if (!text)
        return undefined;
    const patterns = [
        /upfront\s*:\s*[^\n\r]*?monthly\s*:\s*[^\d]*([\d,]+(?:\.\d+)?)/i,
        /estimated\s+monthly\s+cost\s*[:=]?\s*[^\d]*([\d,]+(?:\.\d+)?)/i,
        /monthly\s+cost\s*[:=]?\s*[^\d]*([\d,]+(?:\.\d+)?)/i,
        /monthly\s*[:=]\s*[^\d]*([\d,]+(?:\.\d+)?)/i
    ];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (!match?.[1])
            continue;
        const parsed = Number(match[1].replace(/,/g, ""));
        if (Number.isFinite(parsed))
            return parsed;
    }
    return undefined;
};
const parseDelimitedLine = (line) => {
    if (line.includes("\t")) {
        return line.split("\t").map((v) => v.trim());
    }
    return line
        .split(/\s{2,}/)
        .map((v) => v.trim())
        .filter(Boolean);
};
const parseAzureEstimateText = (text) => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const targetHeaders = ["service category", "service type", "region", "description"];
    let headerIdx = -1;
    let delimiterHeaders = [];
    for (let i = 0; i < lines.length; i++) {
        const cols = parseDelimitedLine(lines[i]).map((c) => c.toLowerCase());
        const hasAll = targetHeaders.every((h) => cols.includes(h));
        if (hasAll) {
            headerIdx = i;
            delimiterHeaders = parseDelimitedLine(lines[i]);
            break;
        }
    }
    if (headerIdx === -1)
        return [];
    const rows = [];
    for (let i = headerIdx + 1; i < lines.length; i++) {
        const cols = parseDelimitedLine(lines[i]);
        if (cols.length < 2)
            continue;
        const map = {};
        delimiterHeaders.forEach((h, idx) => {
            map[h.toLowerCase()] = cols[idx] ?? "";
        });
        const serviceCategory = normalizeString(map["service category"]);
        const serviceType = normalizeString(map["service type"]);
        const regionRaw = normalizeString(map["region"]);
        const description = normalizeString(map["description"]);
        const estimatedMonthlyCost = parseCurrency(map["estimated monthly cost"]) ??
            parseMonthlyFromText(`${map["description"] ?? ""} ${lines[i] ?? ""}`);
        const estimatedUpfrontCost = parseCurrency(map["estimated upfront cost"]);
        if (!serviceCategory && !serviceType && !description && !regionRaw)
            continue;
        rows.push({
            serviceCategory,
            serviceType,
            region: normalizeRegion(regionRaw),
            description,
            ...(estimatedMonthlyCost !== undefined ? { estimatedMonthlyCost } : {}),
            ...(estimatedUpfrontCost !== undefined ? { estimatedUpfrontCost } : {})
        });
    }
    return rows;
};
exports.parseAzureEstimateText = parseAzureEstimateText;
const normalizeHeader = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const HEADER_ALIASES = {
    serviceCategory: ["service category", "servicecategory", "category"],
    serviceType: ["service type", "servicetype", "service"],
    region: ["region", "azure region", "sourceregion", "location"],
    description: ["description", "details", "detail", "configuration", "requirement", "requirements"],
    quantity: ["quantity", "qty", "count", "instances", "number of instances"],
    estimatedMonthlyCost: [
        "estimated monthly cost",
        "monthly cost",
        "price monthly inclusive of all taxes",
        "price monthly-inclusive of all taxes"
    ],
    estimatedUpfrontCost: ["estimated upfront cost", "upfront cost", "one time cost"]
};
const findHeaderIndex = (lowerHeaders, aliases) => {
    const normalizedAliases = aliases.map(normalizeHeader);
    for (let idx = 0; idx < lowerHeaders.length; idx++) {
        if (normalizedAliases.includes(normalizeHeader(lowerHeaders[idx] ?? ""))) {
            return idx;
        }
    }
    return null;
};
/**
 * Find a header row in a sheet by scanning all rows until one contains the required headers.
 */
const findHeaderRow = (table) => {
    for (let rowIdx = 0; rowIdx < table.length; rowIdx++) {
        const row = table[rowIdx] ?? [];
        const headers = row.map((cell) => typeof cell === "string" ? cell.trim() : typeof cell === "number" ? String(cell).trim() : "");
        const lower = headers.map((h) => h.toLowerCase());
        const serviceTypeIdx = findHeaderIndex(lower, HEADER_ALIASES.serviceType);
        const descriptionIdx = findHeaderIndex(lower, HEADER_ALIASES.description);
        if (serviceTypeIdx === null || descriptionIdx === null)
            continue;
        const serviceCategoryIdx = findHeaderIndex(lower, HEADER_ALIASES.serviceCategory);
        const regionIdx = findHeaderIndex(lower, HEADER_ALIASES.region);
        const quantityIdx = findHeaderIndex(lower, HEADER_ALIASES.quantity);
        const monthlyIdx = findHeaderIndex(lower, HEADER_ALIASES.estimatedMonthlyCost);
        const upfrontIdx = findHeaderIndex(lower, HEADER_ALIASES.estimatedUpfrontCost);
        return {
            headerRowIdx: rowIdx,
            indexMap: {
                serviceCategory: serviceCategoryIdx,
                serviceType: serviceTypeIdx,
                region: regionIdx,
                description: descriptionIdx,
                quantity: quantityIdx,
                estimatedMonthlyCost: monthlyIdx,
                estimatedUpfrontCost: upfrontIdx
            }
        };
    }
    return null;
};
/**
 * Parse Azure calculator export (.xlsx) into normalized rows.
 * Scans all sheets; picks the first sheet containing the required headers.
 */
const parseAzureEstimateExcel = async (buffer) => {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    if (!workbook.SheetNames.length)
        return [];
    let rows = [];
    for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet)
            continue;
        const table = XLSX.utils.sheet_to_json(sheet, {
            header: 1,
            defval: null,
            raw: true
        });
        if (!table.length)
            continue;
        const match = findHeaderRow(table);
        if (!match)
            continue;
        const { headerRowIdx, indexMap } = match;
        for (let i = headerRowIdx + 1; i < table.length; i++) {
            const rowArr = table[i] ?? [];
            const serviceCategory = indexMap.serviceCategory === null
                ? ""
                : normalizeString(rowArr[indexMap.serviceCategory] ?? "");
            const serviceType = normalizeString(rowArr[indexMap.serviceType] ?? "");
            const regionRaw = indexMap.region === null ? "" : normalizeString(rowArr[indexMap.region] ?? "");
            const descriptionBase = normalizeString(rowArr[indexMap.description] ?? "");
            const quantityText = indexMap.quantity === null ? "" : normalizeString(rowArr[indexMap.quantity] ?? "");
            const description = quantityText && !new RegExp(quantityText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(descriptionBase)
                ? `${descriptionBase}; Quantity ${quantityText}`.trim()
                : descriptionBase;
            const rowText = rowArr.map((cell) => normalizeString(cell)).join(" ");
            const estimatedMonthlyCost = parseCurrency(indexMap.estimatedMonthlyCost === null
                ? undefined
                : rowArr[indexMap.estimatedMonthlyCost]) ??
                parseMonthlyFromText(`${description} ${rowText}`);
            const estimatedUpfrontCost = parseCurrency(indexMap.estimatedUpfrontCost === null
                ? undefined
                : rowArr[indexMap.estimatedUpfrontCost]);
            // stop if the row is empty
            if (!serviceCategory && !serviceType && !description && !regionRaw) {
                continue;
            }
            rows.push({
                serviceCategory,
                serviceType,
                region: normalizeRegion(regionRaw),
                description,
                ...(estimatedMonthlyCost !== undefined ? { estimatedMonthlyCost } : {}),
                ...(estimatedUpfrontCost !== undefined ? { estimatedUpfrontCost } : {})
            });
        }
        if (rows.length)
            break;
    }
    return rows;
};
exports.parseAzureEstimateExcel = parseAzureEstimateExcel;
