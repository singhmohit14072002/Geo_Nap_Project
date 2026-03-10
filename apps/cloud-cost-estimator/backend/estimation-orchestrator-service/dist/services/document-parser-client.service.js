"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseDocumentFile = void 0;
const upload_schema_1 = require("../schemas/upload.schema");
const http_error_1 = require("../utils/http-error");
const parserBaseUrl = process.env.DOCUMENT_PARSER_URL ?? "http://127.0.0.1:4020";
const parseDocumentFile = async (file, fileName, mimeType) => {
    const form = new FormData();
    const bytes = new Uint8Array(file.buffer, file.byteOffset, file.byteLength);
    const blob = new Blob([bytes], {
        type: mimeType || "application/octet-stream"
    });
    form.append("file", blob, fileName);
    const response = await fetch(`${parserBaseUrl}/parse`, {
        method: "POST",
        body: form
    });
    const text = await response.text();
    const payload = safeJsonParse(text);
    if (!response.ok) {
        throw new http_error_1.HttpError(502, `document-parser-service failed with status ${response.status}`, payload);
    }
    const parsed = upload_schema_1.parserResponseSchema.safeParse(payload);
    if (!parsed.success) {
        throw new http_error_1.HttpError(502, "document-parser-service response validation failed", parsed.error.flatten());
    }
    return parsed.data;
};
exports.parseDocumentFile = parseDocumentFile;
const safeJsonParse = (value) => {
    try {
        return JSON.parse(value);
    }
    catch {
        return value;
    }
};
