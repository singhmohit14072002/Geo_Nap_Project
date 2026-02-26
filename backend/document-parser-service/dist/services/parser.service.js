"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseDocument = exports.parseFile = void 0;
const excel_parser_1 = require("../parsers/excel.parser");
const csv_parser_1 = require("../parsers/csv.parser");
const json_parser_1 = require("../parsers/json.parser");
const pdf_parser_1 = require("../parsers/pdf.parser");
const word_parser_1 = require("../parsers/word.parser");
const xml_parser_1 = require("../parsers/xml.parser");
const file_type_util_1 = require("../utils/file-type.util");
const logger_1 = __importDefault(require("../utils/logger"));
const row_normalizer_service_1 = require("./row-normalizer.service");
const ensureRows = (output) => {
    const data = output.rawInfrastructureData ?? {};
    if (Array.isArray(data.rows)) {
        return output;
    }
    if (Array.isArray(data.servers)) {
        return {
            ...output,
            rawInfrastructureData: {
                ...data,
                rows: data.servers
            }
        };
    }
    if (typeof data.textContent === "string" && data.textContent.trim().length > 0) {
        return {
            ...output,
            rawInfrastructureData: {
                ...data,
                rows: [{ textContent: data.textContent }]
            }
        };
    }
    return {
        ...output,
        rawInfrastructureData: {
            ...data,
            rows: []
        }
    };
};
const normalizeTabularRows = (output) => {
    const ensured = ensureRows(output);
    const rawRows = Array.isArray(ensured.rawInfrastructureData.rows)
        ? ensured.rawInfrastructureData.rows
        : [];
    const normalizedRows = (0, row_normalizer_service_1.normalizeRows)(rawRows);
    return {
        ...ensured,
        rawInfrastructureData: {
            ...ensured.rawInfrastructureData,
            rows: normalizedRows,
            normalization: {
                inputRows: rawRows.length,
                outputRows: normalizedRows.length
            }
        }
    };
};
const parseFile = async (file) => {
    const sourceType = (0, file_type_util_1.detectFileType)(file);
    const mime = (file.mimetype || "").toLowerCase();
    const isPdf = mime === "application/pdf" || sourceType === "pdf";
    const isExcel = mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        mime === "application/vnd.ms-excel" ||
        sourceType === "excel";
    const isCsv = mime === "text/csv" || sourceType === "csv";
    const isJson = mime === "application/json" || sourceType === "json";
    if (isPdf) {
        try {
            return normalizeTabularRows(await (0, pdf_parser_1.parsePdfFile)(file));
        }
        catch (error) {
            logger_1.default.error("PDF_PARSE_AZURE_FAILED", {
                fileName: file.originalname,
                mimeType: file.mimetype,
                error: error instanceof Error ? error.message : String(error)
            });
            throw Object.assign(new Error("Unable to extract tabular data from PDF using Azure Document Intelligence. Verify the PDF contains readable tables and retry."), { statusCode: 422 });
        }
    }
    if (isExcel) {
        return normalizeTabularRows(await (0, excel_parser_1.parseExcelFile)(file));
    }
    if (isCsv) {
        return normalizeTabularRows(await (0, csv_parser_1.parseCsvFile)(file));
    }
    if (isJson) {
        return normalizeTabularRows(await (0, json_parser_1.parseJsonFile)(file));
    }
    if (sourceType === "xml") {
        return ensureRows(await (0, xml_parser_1.parseXmlFile)(file));
    }
    if (sourceType === "word") {
        return ensureRows(await (0, word_parser_1.parseWordFile)(file));
    }
    throw Object.assign(new Error("Unsupported file type. Supported: PDF, Excel, CSV, JSON, XML, DOCX"), {
        statusCode: 415
    });
};
exports.parseFile = parseFile;
exports.parseDocument = exports.parseFile;
