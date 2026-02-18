"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeStructuredData = void 0;
const upload_schema_1 = require("../schemas/upload.schema");
const http_client_service_1 = require("./http-client.service");
const analyzerBaseUrl = process.env.STRUCTURED_ANALYZER_URL ?? "http://127.0.0.1:4060";
const analyzeStructuredData = async (payload) => {
    const response = await (0, http_client_service_1.requestJson)({
        url: `${analyzerBaseUrl}/analyze`,
        method: "POST",
        body: {
            rawInfrastructureData: payload.rawInfrastructureData,
            sourceType: payload.sourceType
        },
        schema: upload_schema_1.analyzerResponseSchema
    });
    return {
        computeCandidates: response.computeCandidates.map((item) => item.row),
        storageCandidates: response.storageCandidates.map((item) => item.row),
        databaseCandidates: response.databaseCandidates.map((item) => item.row),
        networkCandidates: response.networkCandidates.map((item) => item.row),
        stats: response.stats
    };
};
exports.analyzeStructuredData = analyzeStructuredData;
