"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parsePdfFile = void 0;
const pdf_parse_1 = __importDefault(require("pdf-parse"));
const normalizeText = (input) => {
    return input.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
};
const captureNumber = (regex, text) => {
    const match = text.match(regex);
    if (!match?.[1]) {
        return null;
    }
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
};
const parsePdfFile = async (file) => {
    const result = await (0, pdf_parse_1.default)(file.buffer);
    const textContent = normalizeText(result.text || "");
    if (!textContent) {
        throw Object.assign(new Error("No readable text found in PDF"), {
            statusCode: 422
        });
    }
    const extractedSignals = {
        cpu: captureNumber(/cpu\s*[:=-]?\s*(\d+)/i, textContent),
        ramGB: captureNumber(/ram\s*[:=-]?\s*(\d+(?:\.\d+)?)\s*gb/i, textContent),
        storageGB: captureNumber(/storage\s*[:=-]?\s*(\d+(?:\.\d+)?)\s*gb/i, textContent)
    };
    return {
        rawInfrastructureData: {
            textContent,
            extractedSignals
        },
        sourceType: "pdf",
        parsingConfidence: 0.6
    };
};
exports.parsePdfFile = parsePdfFile;
