"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeStructuredData = void 0;
const analyzer_schema_1 = require("../schemas/analyzer.schema");
const compute_rules_1 = require("../rules/compute.rules");
const database_rules_1 = require("../rules/database.rules");
const network_rules_1 = require("../rules/network.rules");
const storage_rules_1 = require("../rules/storage.rules");
const http_error_1 = require("../utils/http-error");
const keyword_matcher_1 = require("../utils/keyword-matcher");
const logger_1 = __importDefault(require("../utils/logger"));
const isScalar = (value) => value == null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean";
const collectRows = (input, rows) => {
    if (Array.isArray(input)) {
        for (const item of input) {
            collectRows(item, rows);
        }
        return;
    }
    if (!input || typeof input !== "object") {
        return;
    }
    const obj = input;
    const values = Object.values(obj);
    const scalarCount = values.filter(isScalar).length;
    const hasNested = values.some((value) => typeof value === "object" && value !== null);
    if (scalarCount > 0 && (scalarCount >= 2 || !hasNested)) {
        rows.push(obj);
    }
    for (const value of values) {
        if (typeof value === "object" && value !== null) {
            collectRows(value, rows);
        }
    }
};
const dedupeRows = (rows) => {
    const seen = new Set();
    const deduped = [];
    for (const row of rows) {
        const key = JSON.stringify(row);
        if (!seen.has(key)) {
            seen.add(key);
            deduped.push(row);
        }
    }
    return deduped;
};
const classifyRow = (row) => {
    const text = (0, keyword_matcher_1.toSearchText)(row);
    const compute = (0, compute_rules_1.computeScore)(text);
    const storage = (0, storage_rules_1.storageScore)(text);
    const database = (0, database_rules_1.databaseScore)(text);
    const network = (0, network_rules_1.networkScore)(text);
    return [
        { name: "compute", score: compute.score, matched: compute.matched },
        { name: "storage", score: storage.score, matched: storage.matched },
        { name: "database", score: database.score, matched: database.matched },
        { name: "network", score: network.score, matched: network.matched }
    ];
};
const analyzeStructuredData = (payload) => {
    const parsed = analyzer_schema_1.analyzeRequestSchema.safeParse(payload);
    if (!parsed.success) {
        throw new http_error_1.HttpError(422, "Analyze request validation failed", parsed.error.flatten());
    }
    const collected = [];
    collectRows(parsed.data.rawInfrastructureData, collected);
    const rows = dedupeRows(collected);
    const computeCandidates = [];
    const storageCandidates = [];
    const databaseCandidates = [];
    const networkCandidates = [];
    let classifiedRows = 0;
    for (const row of rows) {
        const scored = classifyRow(row);
        const maxScore = Math.max(...scored.map((item) => item.score));
        if (maxScore <= 0) {
            continue;
        }
        classifiedRows += 1;
        const top = scored.filter((item) => item.score === maxScore);
        for (const winner of top) {
            const candidate = {
                row,
                score: winner.score,
                matchedKeywords: winner.matched
            };
            if (winner.name === "compute") {
                computeCandidates.push(candidate);
            }
            else if (winner.name === "storage") {
                storageCandidates.push(candidate);
            }
            else if (winner.name === "database") {
                databaseCandidates.push(candidate);
            }
            else if (winner.name === "network") {
                networkCandidates.push(candidate);
            }
        }
    }
    logger_1.default.info("STRUCTURED_ANALYSIS_COMPLETED", {
        totalRows: rows.length,
        classifiedRows,
        discardedRows: rows.length - classifiedRows,
        counts: {
            compute: computeCandidates.length,
            storage: storageCandidates.length,
            database: databaseCandidates.length,
            network: networkCandidates.length
        }
    });
    return {
        computeCandidates,
        storageCandidates,
        databaseCandidates,
        networkCandidates,
        stats: {
            totalRows: rows.length,
            classifiedRows,
            discardedRows: rows.length - classifiedRows
        }
    };
};
exports.analyzeStructuredData = analyzeStructuredData;
