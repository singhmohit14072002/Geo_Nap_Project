"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toSearchText = exports.scoreByKeywords = void 0;
const normalize = (value) => value
    .toLowerCase()
    .replace(/[^\w\s.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const includesTerm = (text, term) => {
    const normalizedTerm = normalize(term);
    if (!normalizedTerm) {
        return false;
    }
    return text.includes(normalizedTerm);
};
const scoreByKeywords = (rawText, keywords) => {
    const text = normalize(rawText);
    const matched = [];
    for (const keyword of keywords) {
        if (includesTerm(text, keyword)) {
            matched.push(keyword);
        }
    }
    return {
        score: matched.length,
        matched
    };
};
exports.scoreByKeywords = scoreByKeywords;
const toSearchText = (row) => {
    const chunks = [];
    for (const [key, value] of Object.entries(row)) {
        chunks.push(key);
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
            chunks.push(String(value));
        }
    }
    return chunks.join(" ");
};
exports.toSearchText = toSearchText;
