"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.clarifyController = exports.extractController = void 0;
const ai_extraction_service_1 = require("../services/ai-extraction.service");
const file_parser_service_1 = require("../services/file-parser.service");
const requirement_validator_service_1 = require("../services/requirement-validator.service");
const requirement_clarifier_service_1 = require("../services/requirement-clarifier.service");
const cloud_estimate_extractor_service_1 = require("../services/cloud-estimate-extractor.service");
const azure_excel_parser_service_1 = require("../services/azure-excel-parser.service");
const llmwhisperer_service_1 = require("../services/llmwhisperer.service");
const metrics_service_1 = require("../metrics/metrics.service");
const http_error_1 = require("../utils/http-error");
const extraction_schema_1 = require("../schemas/extraction.schema");
const logger_1 = __importDefault(require("../utils/logger"));
const extraction_log_model_1 = require("../models/extraction-log.model");
const sendResponse = async (res, payload) => {
    try {
        await extraction_log_model_1.ExtractionLog.create(payload);
    }
    catch (err) {
        logger_1.default.error("Failed to save extraction log to MongoDB", { error: err });
    }
    res.status(200).json(payload);
};
const extractController = async (req, res, next) => {
    try {
        (0, metrics_service_1.incrementExtractionRequestsTotal)();
        const file = req.file;
        if (!file) {
            throw new http_error_1.HttpError(400, "No file uploaded. Provide 'file' in multipart/form-data.");
        }
        // ----- FAST PATH: Azure estimate detection (XLSX/PDF) before any generic normalization -----
        const isExcel = file.mimetype?.toLowerCase().includes("excel") ||
            file.originalname.toLowerCase().endsWith(".xlsx") ||
            file.originalname.toLowerCase().endsWith(".xls");
        const isPdf = file.mimetype?.toLowerCase().includes("pdf") ||
            file.originalname.toLowerCase().endsWith(".pdf");
        if (isExcel || isPdf) {
            try {
                let rows = [];
                // For Excel, use native table parser first so we keep Estimated monthly cost values.
                if (isExcel) {
                    rows = await (0, azure_excel_parser_service_1.parseAzureEstimateExcel)(file.buffer);
                }
                else {
                    // For PDF, OCR/text extraction is still required.
                    const text = await (0, llmwhisperer_service_1.whisperExtractText)(file.buffer, file.originalname);
                    if (text) {
                        rows = (0, azure_excel_parser_service_1.parseAzureEstimateText)(text);
                    }
                }
                const isAzureEstimate = rows.some((r) => r.serviceCategory && r.serviceType && r.description !== undefined);
                if (isAzureEstimate) {
                    logger_1.default.info("AZURE_ESTIMATE_MODE_DETECTED_EARLY", {
                        fileName: file.originalname,
                        rows: rows.length
                    });
                    await sendResponse(res, {
                        status: "VALID",
                        requirement: {
                            compute: [],
                            database: { engine: "none", storageGB: 0, ha: false },
                            network: { dataEgressGB: 0 },
                            region: rows[0]?.region || "centralindia"
                        },
                        extractionModel: "azure_estimate_excel",
                        azureEstimate: {
                            documentType: "CLOUD_ESTIMATE",
                            mode: "AZURE_ESTIMATE_MODE",
                            classifiedServices: rows
                        }
                    });
                    return;
                }
            }
            catch (err) {
                logger_1.default.warn("AZURE_XLSX_EARLY_PARSE_FAILED", {
                    fileName: file.originalname,
                    error: err instanceof Error ? err.message : String(err)
                });
            }
        }
        // ------------------------------------------------------------------------
        const parsed = await (0, file_parser_service_1.parseUploadedFile)(file);
        // Azure estimate Excel shortcut: bypass AI and return structured rows.
        if (parsed.fileType === "azure_estimate_excel" &&
            Array.isArray(parsed.azureEstimateRows) &&
            parsed.azureEstimateRows.length > 0) {
            logger_1.default.info("AZURE_ESTIMATE_MODE_DETECTED", {
                fileName: file.originalname,
                rows: parsed.azureEstimateRows.length
            });
            await sendResponse(res, {
                status: "VALID",
                requirement: {
                    compute: [],
                    database: { engine: "none", storageGB: 0, ha: false },
                    network: { dataEgressGB: 0 },
                    region: parsed.azureEstimateRows[0]?.region || "centralindia"
                },
                extractionModel: "azure_estimate_excel",
                azureEstimate: {
                    documentType: "CLOUD_ESTIMATE",
                    mode: "AZURE_ESTIMATE_MODE",
                    classifiedServices: parsed.azureEstimateRows
                }
            });
            return;
        }
        const cloudEstimate = (0, cloud_estimate_extractor_service_1.extractCloudEstimateFromParsedInput)(parsed);
        if (parsed.fileType === "xml") {
            const structured = parsed.normalizedInput.structured;
            logger_1.default.info("XML_PARSED_SUCCESS", {
                fileName: file.originalname,
                serverEntries: Array.isArray(structured?.servers) ? structured.servers.length : 0
            });
        }
        if (cloudEstimate) {
            logger_1.default.info("CLOUD_ESTIMATE_MODE_SELECTED", {
                fileName: file.originalname,
                mode: cloudEstimate.mode,
                classifiedServices: cloudEstimate.classifiedServices.length
            });
        }
        const extractionResult = await (0, ai_extraction_service_1.extractRequirementFromParsedInput)(parsed);
        if (extractionResult.status === "EXTRACTION_FAILED") {
            if (cloudEstimate) {
                await sendResponse(res, {
                    status: "VALID",
                    requirement: cloudEstimate.requirement,
                    extractionModel: "heuristic_cloud_estimate",
                    azureEstimate: {
                        documentType: cloudEstimate.documentType,
                        mode: cloudEstimate.mode,
                        classifiedServices: cloudEstimate.classifiedServices
                    }
                });
                return;
            }
            await sendResponse(res, {
                status: "EXTRACTION_FAILED",
                error: extractionResult.error,
                details: extractionResult.details
            });
            return;
        }
        const requirement = extractionResult.candidate;
        const validationResult = await (0, requirement_validator_service_1.validateExtractedRequirement)(requirement);
        if (cloudEstimate) {
            await sendResponse(res, {
                status: "VALID",
                requirement: cloudEstimate.requirement,
                extractionModel: extractionResult.model,
                azureEstimate: {
                    documentType: cloudEstimate.documentType,
                    mode: cloudEstimate.mode,
                    classifiedServices: cloudEstimate.classifiedServices
                }
            });
            return;
        }
        if (validationResult.status === "VALID") {
            await sendResponse(res, {
                status: "VALID",
                requirement: validationResult.requirement,
                extractionModel: extractionResult.model
            });
            return;
        }
        await sendResponse(res, {
            status: "NEEDS_CLARIFICATION",
            candidate: requirement,
            questions: validationResult.questions,
            issues: validationResult.issues,
            extractionModel: extractionResult.model
        });
    }
    catch (error) {
        (0, metrics_service_1.incrementExtractionFailuresTotal)();
        next(error);
    }
};
exports.extractController = extractController;
const clarifyController = async (req, res, next) => {
    try {
        (0, metrics_service_1.incrementExtractionRequestsTotal)();
        const parsed = extraction_schema_1.extractionClarifyRequestSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new http_error_1.HttpError(422, "Clarification payload validation failed", parsed.error.flatten());
        }
        const mergedCandidate = (0, requirement_clarifier_service_1.applyClarifications)(parsed.data.candidate, parsed.data.clarifications);
        const validationResult = await (0, requirement_validator_service_1.validateExtractedRequirement)(mergedCandidate);
        if (validationResult.status === "VALID") {
            await sendResponse(res, {
                status: "VALID",
                requirement: validationResult.requirement
            });
            return;
        }
        await sendResponse(res, {
            status: "NEEDS_CLARIFICATION",
            candidate: mergedCandidate,
            questions: validationResult.questions,
            issues: validationResult.issues
        });
    }
    catch (error) {
        (0, metrics_service_1.incrementExtractionFailuresTotal)();
        next(error);
    }
};
exports.clarifyController = clarifyController;
