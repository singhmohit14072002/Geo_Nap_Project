"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestJson = void 0;
const http_error_1 = require("../utils/http-error");
const truncate = (value, max = 600) => value.length > max ? `${value.slice(0, max)}...` : value;
const requestJson = async ({ url, method = "GET", body, headers = {}, schema, expectedStatuses = [200] }) => {
    const response = await fetch(url, {
        method,
        headers: {
            ...headers,
            ...(body != null ? { "Content-Type": "application/json" } : {})
        },
        body: body != null ? JSON.stringify(body) : undefined
    });
    const text = await response.text();
    const parsedBody = text ? safeJsonParse(text) : undefined;
    if (!expectedStatuses.includes(response.status)) {
        throw new http_error_1.HttpError(502, `Downstream request failed (${method} ${url}) with status ${response.status}`, typeof parsedBody === "undefined" ? truncate(text) : parsedBody);
    }
    if (!schema) {
        return parsedBody ?? {};
    }
    const parsed = schema.safeParse(parsedBody);
    if (!parsed.success) {
        throw new http_error_1.HttpError(502, `Downstream response schema mismatch (${method} ${url})`, parsed.error.flatten());
    }
    return parsed.data;
};
exports.requestJson = requestJson;
const safeJsonParse = (value) => {
    try {
        return JSON.parse(value);
    }
    catch {
        return value;
    }
};
