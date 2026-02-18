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
const fast_xml_parser_1 = require("fast-xml-parser");
const http_error_1 = require("../utils/http-error");
const normalizeText = (input) => {
    return input.replace(/\r\n/g, "\n").replace(/\u0000/g, "").trim();
};
const toArray = (value) => {
    if (Array.isArray(value)) {
        return value;
    }
    if (value === null || value === undefined) {
        return [];
    }
    return [value];
};
const maybeNumber = (value) => {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string") {
        const normalized = value.trim();
        if (!normalized) {
            return null;
        }
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};
const maybeString = (value) => {
    if (typeof value === "string") {
        const normalized = value.trim();
        return normalized ? normalized : null;
    }
    return null;
};
const xmlParser = new fast_xml_parser_1.XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    parseAttributeValue: true,
    parseTagValue: true,
    trimValues: true,
    allowBooleanAttributes: true
});
const detectFileType = (file) => {
    const ext = path_1.default.extname(file.originalname || "").toLowerCase();
    const mime = (file.mimetype || "").toLowerCase();
    if (ext === ".xml" || mime.includes("xml")) {
        return "xml";
    }
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
    throw new http_error_1.HttpError(415, `Unsupported file type: ${ext || mime || "unknown"}. Supported: XML, PDF, Excel, TXT, CSV`);
};
const parsePdfBuffer = async (buffer) => {
    const result = await (0, pdf_parse_1.default)(buffer);
    return normalizeText(result.text || "");
};
const parseExcelWorkbookToText = (workbook) => {
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
const extractServerNodes = (input, collector) => {
    if (!input || typeof input !== "object") {
        return;
    }
    if (Array.isArray(input)) {
        for (const item of input) {
            extractServerNodes(item, collector);
        }
        return;
    }
    const record = input;
    const hints = ["server", "servers", "instance", "instances", "vm", "machine", "node"];
    for (const [key, value] of Object.entries(record)) {
        const lower = key.toLowerCase();
        const isServerLikeKey = hints.includes(lower);
        if (isServerLikeKey) {
            for (const item of toArray(value)) {
                if (item && typeof item === "object" && !Array.isArray(item)) {
                    collector.push(item);
                }
            }
        }
        if (value && typeof value === "object") {
            extractServerNodes(value, collector);
        }
    }
    // If the node itself looks like a compute-server record, keep it.
    const hasComputeShape = "cpu" in record ||
        "vCPU" in record ||
        "vcpu" in record ||
        "memory" in record ||
        "ram" in record ||
        "storage" in record;
    if (hasComputeShape) {
        collector.push(record);
    }
};
const normalizeServerRecord = (record) => {
    const cpu = maybeNumber(record.cpu ?? record.vCPU ?? record.vcpu ?? record.cores ?? record.coreCount);
    const memory = maybeNumber(record.memory ?? record.ram ?? record.ramGB ?? record.memGB);
    const storage = maybeNumber(record.storage ?? record.storageGB ?? record.disk ?? record.diskGB);
    const quantity = maybeNumber(record.quantity ?? record.count ?? record.instances) ?? 1;
    const os = maybeString(record.os ?? record.osType ?? record.platform);
    const normalized = {
        cpu,
        memory,
        storage,
        os,
        quantity
    };
    for (const [key, value] of Object.entries(record)) {
        if (!(key in normalized)) {
            normalized[key] = value;
        }
    }
    return normalized;
};
const parseXmlBuffer = (buffer) => {
    const xmlText = normalizeText(buffer.toString("utf8"));
    if (!xmlText) {
        throw new http_error_1.HttpError(422, "XML file is empty");
    }
    let parsedXml;
    try {
        parsedXml = xmlParser.parse(xmlText);
    }
    catch (error) {
        throw new http_error_1.HttpError(422, "Failed to parse XML file", error instanceof Error ? { message: error.message } : undefined);
    }
    const serverCandidates = [];
    extractServerNodes(parsedXml, serverCandidates);
    const seen = new Set();
    const servers = serverCandidates
        .map(normalizeServerRecord)
        .filter((record) => {
        const key = JSON.stringify(record);
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
    return {
        rawText: xmlText,
        structuredJson: {
            servers,
            sourceType: "xml",
            parsedXml
        }
    };
};
const buildNormalizedInput = (fileType, rawText, extra = {}) => {
    return {
        sourceType: fileType,
        content: rawText,
        ...extra
    };
};
const parseUploadedFile = async (file) => {
    if (!file || !file.buffer || file.buffer.length === 0) {
        throw new http_error_1.HttpError(400, "Uploaded file is empty");
    }
    const fileType = detectFileType(file);
    let rawText = "";
    let normalizedInput = {};
    if (fileType === "pdf") {
        rawText = await parsePdfBuffer(file.buffer);
        normalizedInput = buildNormalizedInput(fileType, rawText);
    }
    else if (fileType === "excel") {
        const workbook = XLSX.read(file.buffer, { type: "buffer" });
        const sheets = workbook.SheetNames || [];
        const sheetRows = sheets.map((sheetName) => ({
            sheetName,
            rows: XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
                defval: null
            })
        }));
        rawText = parseExcelWorkbookToText(workbook);
        normalizedInput = buildNormalizedInput(fileType, rawText, {
            sheetRows
        });
    }
    else if (fileType === "xml") {
        const parsed = parseXmlBuffer(file.buffer);
        rawText = parsed.rawText;
        normalizedInput = {
            sourceType: fileType,
            structured: parsed.structuredJson
        };
    }
    else {
        rawText = parseTextBuffer(file.buffer);
        normalizedInput = buildNormalizedInput(fileType, rawText);
    }
    if (!rawText) {
        throw new http_error_1.HttpError(422, "Could not extract readable text from file. Ensure PDF is text-based or spreadsheet has content.");
    }
    return {
        fileType,
        rawText,
        normalizedInput
    };
};
exports.parseUploadedFile = parseUploadedFile;
