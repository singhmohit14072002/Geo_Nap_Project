"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseWordFile = void 0;
const mammoth_1 = __importDefault(require("mammoth"));
const azure_document_intelligence_service_1 = require("../services/azure-document-intelligence.service");
const normalizeText = (input) => {
    return input.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
};
const parseWordFile = async (file) => {
    let textContent = "";
    let parsingConfidence = 0.8;
    let extractionSource = "azure-document-intelligence";
    let azureMetadata = {};
    try {
        const azureOutput = await (0, azure_document_intelligence_service_1.parseWithAzureDocumentIntelligence)(file.buffer);
        textContent = normalizeText(azureOutput.textContent);
        azureMetadata = {
            pageCount: azureOutput.pageCount,
            tableCount: azureOutput.tableCount,
            paragraphCount: azureOutput.paragraphCount
        };
    }
    catch (azureError) {
        const fallback = await mammoth_1.default.extractRawText({ buffer: file.buffer });
        textContent = normalizeText(fallback.value || "");
        extractionSource = "mammoth-fallback";
        parsingConfidence = 0.7;
        azureMetadata = {
            fallbackReason: azureError instanceof Error ? azureError.message : String(azureError)
        };
    }
    if (!textContent) {
        throw Object.assign(new Error("No readable text found in DOCX"), {
            statusCode: 422
        });
    }
    return {
        rawInfrastructureData: {
            textContent,
            extractionSource,
            azureMetadata
        },
        sourceType: "word",
        parsingConfidence
    };
};
exports.parseWordFile = parseWordFile;
