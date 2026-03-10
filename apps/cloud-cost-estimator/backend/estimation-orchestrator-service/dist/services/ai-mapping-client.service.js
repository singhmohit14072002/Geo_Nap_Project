"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapInfrastructure = void 0;
const upload_schema_1 = require("../schemas/upload.schema");
const http_client_service_1 = require("./http-client.service");
const mappingBaseUrl = process.env.AI_MAPPING_URL ?? "http://127.0.0.1:4030";
const mapInfrastructure = async (payload) => {
    const response = await (0, http_client_service_1.requestJson)({
        url: `${mappingBaseUrl}/map`,
        method: "POST",
        body: {
            rawInfrastructureData: payload.rawInfrastructureData,
            sourceType: payload.sourceType
        },
        schema: upload_schema_1.mappingResponseSchema
    });
    return {
        requirement: response.requirement,
        mappingConfidence: response.mappingConfidence,
        warnings: response.warnings
    };
};
exports.mapInfrastructure = mapInfrastructure;
