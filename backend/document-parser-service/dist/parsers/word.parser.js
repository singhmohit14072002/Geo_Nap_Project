"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseWordFile = void 0;
const mammoth_1 = __importDefault(require("mammoth"));
const normalizeText = (input) => {
    return input.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
};
const parseWordFile = async (file) => {
    const result = await mammoth_1.default.extractRawText({ buffer: file.buffer });
    const textContent = normalizeText(result.value || "");
    if (!textContent) {
        throw Object.assign(new Error("No readable text found in DOCX"), {
            statusCode: 422
        });
    }
    return {
        rawInfrastructureData: {
            textContent
        },
        sourceType: "word",
        parsingConfidence: 0.7
    };
};
exports.parseWordFile = parseWordFile;
