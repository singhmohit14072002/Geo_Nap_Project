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
const REQUIRED_HEADERS = ["service category", "service type", "region", "description"];
/**
 * Find a header row in a sheet by scanning all rows until one contains the required headers.
 */
const findHeaderRow = (table) => {
    for (let rowIdx = 0; rowIdx < table.length; rowIdx++) {
        const row = table[rowIdx] ?? [];
        const headers = row.map((cell) => typeof cell === "string" ? cell.trim() : typeof cell === "number" ? String(cell).trim() : "");
        const lower = headers.map((h) => h.toLowerCase());
        const hasAll = REQUIRED_HEADERS.every((h) => lower.includes(h));
        if (!hasAll)
            continue;
        const indexMap = {};
        REQUIRED_HEADERS.forEach((h) => {
            indexMap[h] = lower.indexOf(h);
        });
        const optionalIndexMap = {};
        const monthlyIdx = lower.indexOf("estimated monthly cost");
        const upfrontIdx = lower.indexOf("estimated upfront cost");
        if (monthlyIdx >= 0)
            optionalIndexMap["estimated monthly cost"] = monthlyIdx;
        if (upfrontIdx >= 0)
            optionalIndexMap["estimated upfront cost"] = upfrontIdx;
        return { headerRowIdx: rowIdx, headers, indexMap, optionalIndexMap };
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
        const { headerRowIdx, indexMap, optionalIndexMap } = match;
        for (let i = headerRowIdx + 1; i < table.length; i++) {
            const rowArr = table[i] ?? [];
            const serviceCategory = normalizeString(rowArr[indexMap["service category"]] ?? "");
            const serviceType = normalizeString(rowArr[indexMap["service type"]] ?? "");
            const regionRaw = normalizeString(rowArr[indexMap["region"]] ?? "");
            const description = normalizeString(rowArr[indexMap["description"]] ?? "");
            const rowText = rowArr.map((cell) => normalizeString(cell)).join(" ");
            const estimatedMonthlyCost = parseCurrency(rowArr[optionalIndexMap["estimated monthly cost"]]) ??
                parseMonthlyFromText(`${description} ${rowText}`);
            const estimatedUpfrontCost = parseCurrency(rowArr[optionalIndexMap["estimated upfront cost"]]);
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
