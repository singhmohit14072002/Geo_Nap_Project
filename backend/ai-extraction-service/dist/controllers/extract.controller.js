"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clarifyController = exports.extractController = void 0;
const ai_extraction_service_1 = require("../services/ai-extraction.service");
const file_parser_service_1 = require("../services/file-parser.service");
const requirement_validator_service_1 = require("../services/requirement-validator.service");
const requirement_clarifier_service_1 = require("../services/requirement-clarifier.service");
const metrics_service_1 = require("../metrics/metrics.service");
const http_error_1 = require("../utils/http-error");
const extraction_schema_1 = require("../schemas/extraction.schema");
const extractController = async (req, res, next) => {
    try {
        (0, metrics_service_1.incrementExtractionRequestsTotal)();
        const file = req.file;
        if (!file) {
            throw new http_error_1.HttpError(400, "No file uploaded. Provide 'file' in multipart/form-data.");
        }
        const parsed = await (0, file_parser_service_1.parseUploadedFile)(file);
        const requirement = await (0, ai_extraction_service_1.extractRequirementFromText)(parsed.rawText);
        const validationResult = await (0, requirement_validator_service_1.validateExtractedRequirement)(requirement);
        if (validationResult.status === "VALID") {
            res.status(200).json({
                status: "VALID",
                requirement: validationResult.requirement
            });
            return;
        }
        res.status(200).json({
            status: "NEEDS_CLARIFICATION",
            candidate: requirement,
            questions: validationResult.questions,
            issues: validationResult.issues
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
            res.status(200).json({
                status: "VALID",
                requirement: validationResult.requirement
            });
            return;
        }
        res.status(200).json({
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
