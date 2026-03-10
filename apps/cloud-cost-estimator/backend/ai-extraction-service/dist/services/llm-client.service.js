"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.callLlm = void 0;
const zod_1 = require("zod");
const http_error_1 = require("../utils/http-error");
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const PERPLEXITY_API_URL = process.env.PERPLEXITY_API_URL ?? "https://api.perplexity.ai/chat/completions";
const openAIResponseSchema = zod_1.z.object({
    choices: zod_1.z
        .array(zod_1.z.object({
        message: zod_1.z.object({
            content: zod_1.z.union([
                zod_1.z.string(),
                zod_1.z.array(zod_1.z.object({
                    type: zod_1.z.string().optional(),
                    text: zod_1.z.string().optional()
                }))
            ])
        })
    }))
        .min(1)
});
const getPerplexityKey = () => {
    const primary = (process.env.PERPLEXITY_API_KEY ?? "").trim();
    if (primary) {
        return primary;
    }
    const alias1 = (process.env.PPLX_API_KEY ?? "").trim();
    if (alias1) {
        return alias1;
    }
    const alias2 = (process.env.PERPLEXITY_KEY ?? "").trim();
    if (alias2) {
        return alias2;
    }
    return "";
};
const resolveProvider = () => {
    const explicit = (process.env.LLM_PROVIDER ?? "").trim().toLowerCase();
    if (explicit === "openai" || explicit === "perplexity") {
        return explicit;
    }
    const openAiKey = (process.env.OPENAI_API_KEY ?? "").trim();
    const perplexityKey = getPerplexityKey();
    if (openAiKey) {
        return "openai";
    }
    if (perplexityKey) {
        return "perplexity";
    }
    return "openai";
};
const getLlmConfig = () => {
    const provider = resolveProvider();
    if (provider === "openai") {
        const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
        if (!apiKey) {
            throw new http_error_1.HttpError(500, "No LLM API key configured. Set OPENAI_API_KEY or switch LLM_PROVIDER to perplexity and set PERPLEXITY_API_KEY.");
        }
        return {
            provider,
            apiKey,
            apiUrl: OPENAI_API_URL,
            model: process.env.OPENAI_MODEL ?? "gpt-4o-mini"
        };
    }
    const apiKey = getPerplexityKey();
    if (!apiKey) {
        throw new http_error_1.HttpError(500, "Perplexity API key is not configured for LLM_PROVIDER=perplexity. Set PERPLEXITY_API_KEY (or PPLX_API_KEY).");
    }
    return {
        provider,
        apiKey,
        apiUrl: PERPLEXITY_API_URL,
        model: process.env.PERPLEXITY_MODEL ?? "sonar-pro"
    };
};
const contentToString = (content) => {
    if (typeof content === "string") {
        return content;
    }
    return content
        .map((part) => part.text ?? "")
        .join("")
        .trim();
};
const callLlm = async (messages, expectJsonObject) => {
    const config = getLlmConfig();
    const body = {
        model: config.model,
        temperature: 0,
        messages
    };
    if (expectJsonObject && config.provider === "openai") {
        body.response_format = { type: "json_object" };
    }
    const response = await fetch(config.apiUrl, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });
    if (!response.ok) {
        const errBody = await response.text();
        throw new http_error_1.HttpError(response.status, `${config.provider} API request failed: ${errBody.slice(0, 400)}`);
    }
    const payload = await response.json();
    const parsed = openAIResponseSchema.safeParse(payload);
    if (!parsed.success) {
        throw new http_error_1.HttpError(502, `Unexpected ${config.provider} response format`, parsed.error.flatten());
    }
    const content = contentToString(parsed.data.choices[0].message.content);
    if (!content) {
        throw new http_error_1.HttpError(502, `${config.provider} response content is empty`);
    }
    return content;
};
exports.callLlm = callLlm;
