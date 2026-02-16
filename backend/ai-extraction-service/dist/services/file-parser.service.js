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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseUploadedFile = void 0;
const path_1 = __importDefault(require("path"));
const pdf_parse_1 = __importDefault(require("pdf-parse"));
const XLSX = __importStar(require("xlsx"));
const http_error_1 = require("../utils/http-error");
const normalizeText = (input) => {
    return input.replace(/\r\n/g, "\n").replace(/\u0000/g, "").trim();
};
const detectFileType = (file) => {
    const ext = path_1.default.extname(file.originalname || "").toLowerCase();
    const mime = (file.mimetype || "").toLowerCase();
    if (ext === ".pdf" || mime.includes("pdf")) {
        return "pdf";
    }
    if (ext === ".xlsx" ||
        ext === ".xls" ||
        ext === ".xlsm" ||
        mime.includes("spreadsheet") ||
        mime.includes("excel")) {
        return "excel";
    }
    if (ext === ".txt" || ext === ".csv" || mime.includes("text")) {
        return "text";
    }
    throw new http_error_1.HttpError(415, `Unsupported file type: ${ext || mime || "unknown"}. Supported: PDF, Excel, TXT, CSV`);
};
const parsePdfBuffer = async (buffer) => {
    const result = await (0, pdf_parse_1.default)(buffer);
    return normalizeText(result.text || "");
};
const parseExcelBuffer = (buffer) => {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheets = workbook.SheetNames || [];
    const chunks = [];
    for (const sheetName of sheets) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) {
            continue;
        }
        const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
        const normalized = normalizeText(csv);
        if (!normalized) {
            continue;
        }
        chunks.push(`Sheet: ${sheetName}\n${normalized}`);
    }
    return normalizeText(chunks.join("\n\n"));
};
const parseTextBuffer = (buffer) => {
    return normalizeText(buffer.toString("utf8"));
};
const parseUploadedFile = async (file) => {
    if (!file || !file.buffer || file.buffer.length === 0) {
        throw new http_error_1.HttpError(400, "Uploaded file is empty");
    }
    const fileType = detectFileType(file);
    let rawText = "";
    if (fileType === "pdf") {
        rawText = await parsePdfBuffer(file.buffer);
    }
    else if (fileType === "excel") {
        rawText = parseExcelBuffer(file.buffer);
    }
    else {
        rawText = parseTextBuffer(file.buffer);
    }
    if (!rawText) {
        throw new http_error_1.HttpError(422, "Could not extract readable text from file. Ensure PDF is text-based or spreadsheet has content.");
    }
    return {
        fileType,
        rawText
    };
};
exports.parseUploadedFile = parseUploadedFile;
