"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractRequirementFromText = void 0;
const extraction_schema_1 = require("../schemas/extraction.schema");
const prompt_builder_1 = require("../utils/prompt-builder");
const http_error_1 = require("../utils/http-error");
const llm_client_service_1 = require("./llm-client.service");
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
const callOpenAIForExtraction = async (rawText) => {
    const trimmedText = rawText.length > MAX_TEXT_CHARS
        ? rawText.slice(0, MAX_TEXT_CHARS)
        : rawText;
    const prompt = (0, prompt_builder_1.buildExtractionPrompt)(trimmedText);
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
    const jsonBlock = extractJsonBlock(content);
    let extractedObj;
    try {
        extractedObj = JSON.parse(jsonBlock);
    }
    catch {
        throw new http_error_1.HttpError(422, "AI returned invalid JSON");
    }
    const validated = extraction_schema_1.extractionCandidateSchema.safeParse(extractedObj);
    if (!validated.success) {
        throw new http_error_1.HttpError(422, "Extracted infrastructure requirement failed schema validation", validated.error.flatten());
    }
    return validated.data;
};
const extractRequirementFromText = async (rawText) => {
    return callOpenAIForExtraction(rawText);
};
exports.extractRequirementFromText = extractRequirementFromText;
