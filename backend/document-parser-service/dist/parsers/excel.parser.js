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
exports.parseExcelFile = void 0;
const XLSX = __importStar(require("xlsx"));
const normalizeHeader = (value) => {
    return String(value ?? "")
        .trim()
        .replace(/\s+/g, "_")
        .replace(/[^\w]/g, "")
        .toLowerCase();
};
const parseExcelFile = async (file) => {
    const workbook = XLSX.read(file.buffer, { type: "buffer" });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
        throw Object.assign(new Error("Excel file does not contain any sheet"), {
            statusCode: 422
        });
    }
    const sheet = workbook.Sheets[firstSheetName];
    if (!sheet) {
        throw Object.assign(new Error("First Excel sheet could not be loaded"), {
            statusCode: 422
        });
    }
    const rows = XLSX.utils.sheet_to_json(sheet, {
        defval: null
    });
    const normalizedRows = rows.map((row) => {
        const next = {};
        Object.entries(row).forEach(([key, value]) => {
            next[normalizeHeader(key)] = value;
        });
        return next;
    });
    return {
        rawInfrastructureData: {
            sheetName: firstSheetName,
            rows: normalizedRows
        },
        sourceType: "excel",
        parsingConfidence: 0.9
    };
};
exports.parseExcelFile = parseExcelFile;
