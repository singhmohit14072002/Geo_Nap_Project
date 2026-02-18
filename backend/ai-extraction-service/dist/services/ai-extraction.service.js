"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractRequirementFromParsedInput = void 0;
const extraction_schema_1 = require("../schemas/extraction.schema");
const prompt_builder_1 = require("../utils/prompt-builder");
const http_error_1 = require("../utils/http-error");
const logger_1 = __importDefault(require("../utils/logger"));
const llm_client_service_1 = require("./llm-client.service");
const llama_extraction_service_1 = require("./llama-extraction.service");
const MAX_TEXT_CHARS = Number(process.env.MAX_EXTRACTION_TEXT_CHARS ?? "120000");
const extractJsonBlock = (rawContent) => {
    const trimmed = rawContent.trim();
    // Direct JSON
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        return trimmed;
    }
    // Markdown fenced block fallback
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced?.[1]) {
        return fenced[1].trim();
    }
    // Last resort: first object range
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
        return trimmed.slice(start, end + 1).trim();
    }
    throw new http_error_1.HttpError(422, "AI response did not contain valid JSON content");
};
const normalizeError = (error) => {
    if (error instanceof http_error_1.HttpError) {
        return error.message;
    }
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
};
const parseCandidateResponse = (rawContent, source) => {
    const jsonBlock = extractJsonBlock(rawContent);
    let extractedObj;
    try {
        extractedObj = JSON.parse(jsonBlock);
    }
    catch {
        throw new http_error_1.HttpError(422, `${source} extractor returned invalid JSON`);
    }
    const validated = extraction_schema_1.extractionCandidateSchema.safeParse(extractedObj);
    if (!validated.success) {
        throw new http_error_1.HttpError(422, `${source} extracted infrastructure requirement failed schema validation`, validated.error.flatten());
    }
    return validated.data;
};
const buildNormalizedExtractionInput = (parsedInput) => {
    if (parsedInput.fileType === "xml") {
        return {
            sourceType: parsedInput.fileType,
            ...parsedInput.normalizedInput
        };
    }
    const content = typeof parsedInput.rawText === "string"
        ? parsedInput.rawText
        : "";
    const trimmedContent = content.length > MAX_TEXT_CHARS
        ? content.slice(0, MAX_TEXT_CHARS)
        : content;
    return {
        sourceType: parsedInput.fileType,
        ...parsedInput.normalizedInput,
        content: trimmedContent
    };
};
const callPrimaryExtractor = async (normalizedInput) => {
    const prompt = (0, prompt_builder_1.buildExtractionPrompt)(normalizedInput);
    const content = await (0, llm_client_service_1.callLlm)([
        {
            role: "system",
            content: "You extract infrastructure requirements. Return only JSON with the exact schema."
        },
        {
            role: "user",
            content: prompt
        }
    ], true);
    return parseCandidateResponse(content, "primary");
};
const extractRequirementFromParsedInput = async (parsedInput) => {
    logger_1.default.info("EXTRACTION_STARTED", {
        fileType: parsedInput.fileType
    });
    const normalizedInput = buildNormalizedExtractionInput(parsedInput);
    let primaryError = "";
    try {
        const candidate = await callPrimaryExtractor(normalizedInput);
        logger_1.default.info("EXTRACTION_SUCCESS", {
            model: "primary",
            fileType: parsedInput.fileType
        });
        return {
            status: "SUCCESS",
            candidate,
            model: "primary"
        };
    }
    catch (error) {
        primaryError = normalizeError(error);
        logger_1.default.error("AI_EXTRACTION_FAILED", {
            fileType: parsedInput.fileType,
            error: primaryError
        });
    }
    try {
        logger_1.default.info("LLAMA_FALLBACK_STARTED", {
            fileType: parsedInput.fileType
        });
        const fallbackRaw = await (0, llama_extraction_service_1.callLlamaFallbackForExtraction)(normalizedInput);
        const candidate = parseCandidateResponse(fallbackRaw, "llama_fallback");
        logger_1.default.info("EXTRACTION_SUCCESS", {
            model: "llama_fallback",
            fileType: parsedInput.fileType
        });
        return {
            status: "SUCCESS",
            candidate,
            model: "llama_fallback"
        };
    }
    catch (error) {
        const fallbackError = normalizeError(error);
        logger_1.default.error("EXTRACTION_FAILED", {
            fileType: parsedInput.fileType,
            primaryError,
            fallbackError
        });
        return {
            status: "EXTRACTION_FAILED",
            error: "Primary extraction failed and Llama fallback was unable to produce valid requirements.",
            details: {
                primaryError,
                fallbackError
            }
        };
    }
};
exports.extractRequirementFromParsedInput = extractRequirementFromParsedInput;
