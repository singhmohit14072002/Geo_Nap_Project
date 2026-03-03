"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.whisperExtractText = void 0;
const node_fetch_1 = __importDefault(require("node-fetch"));
const logger_1 = __importDefault(require("../utils/logger"));
const BASE_URL = process.env.LLMWHISPERER_BASE_URL?.replace(/\/+$/, "") ||
    "https://llmwhisperer-api.us-central.unstract.com/api/v2";
const API_KEY = process.env.LLMWHISPERER_API_KEY || "";
const MODE = process.env.LLMWHISPERER_MODE || "table";
const OUTPUT_MODE = process.env.LLMWHISPERER_OUTPUT_MODE || "layout_preserving";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const whisperExtractText = async (buffer, filename) => {
    if (!API_KEY) {
        return null;
    }
    try {
        const params = new URLSearchParams({
            mode: MODE,
            output_mode: OUTPUT_MODE
        });
        const submitRes = await (0, node_fetch_1.default)(`${BASE_URL}/whisper?${params.toString()}`, {
            method: "POST",
            headers: {
                "unstract-key": API_KEY,
                "Content-Type": "application/octet-stream",
                "file_name": filename
            },
            body: buffer
        });
        if (submitRes.status >= 400) {
            const errBody = await submitRes.text();
            logger_1.default.warn("LLMWHISPERER_SUBMIT_HTTP_ERROR", {
                status: submitRes.status,
                body: errBody
            });
            return null;
        }
        const submitJson = (await submitRes.json());
        const whisperHash = String(submitJson?.whisper_hash ?? "");
        if (!whisperHash) {
            logger_1.default.warn("LLMWHISPERER_SUBMIT_FAILED", { submitJson });
            return null;
        }
        // Poll for completion
        let status = "processing";
        for (let i = 0; i < 20; i += 1) {
            await sleep(1000);
            const statusRes = await (0, node_fetch_1.default)(`${BASE_URL}/whisper-status?whisper_hash=${encodeURIComponent(whisperHash)}`, {
                headers: { "unstract-key": API_KEY }
            });
            const statusJson = (await statusRes.json());
            status = String(statusJson?.status ?? "processing").toLowerCase();
            if (status === "processed" || status === "completed") {
                break;
            }
            if (status === "failed") {
                logger_1.default.warn("LLMWHISPERER_STATUS_FAILED", { whisperHash, statusJson });
                return null;
            }
        }
        if (status !== "processed" && status !== "completed") {
            logger_1.default.warn("LLMWHISPERER_STATUS_TIMEOUT", { whisperHash, status });
            return null;
        }
        const retrieveRes = await (0, node_fetch_1.default)(`${BASE_URL}/whisper-retrieve?whisper_hash=${encodeURIComponent(whisperHash)}&output_mode=text`, {
            headers: { "unstract-key": API_KEY }
        });
        const retrieveJson = (await retrieveRes.json());
        const extraction = retrieveJson?.extraction;
        const resultText = String(extraction?.result_text ??
            retrieveJson?.result_text ??
            retrieveJson?.text ??
            "");
        if (!resultText.trim()) {
            logger_1.default.warn("LLMWHISPERER_EMPTY_RESULT", { whisperHash });
            return null;
        }
        logger_1.default.info("LLMWHISPERER_TEXT_EXTRACTED", {
            whisperHash,
            characters: resultText.length
        });
        return resultText;
    }
    catch (error) {
        logger_1.default.warn("LLMWHISPERER_ERROR", {
            error: error instanceof Error ? error.message : String(error)
        });
        return null;
    }
};
exports.whisperExtractText = whisperExtractText;
