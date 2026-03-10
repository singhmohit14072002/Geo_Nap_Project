"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateRequirement = void 0;
const upload_schema_1 = require("../schemas/upload.schema");
const http_error_1 = require("../utils/http-error");
const http_client_service_1 = require("./http-client.service");
const validatorBaseUrl = process.env.REQUIREMENT_VALIDATOR_URL ?? "http://127.0.0.1:4040";
const validateRequirement = async (requirement) => {
    const response = await (0, http_client_service_1.requestJson)({
        url: `${validatorBaseUrl}/validate`,
        method: "POST",
        body: requirement
    });
    const validParsed = upload_schema_1.validatorValidResponseSchema.safeParse(response);
    if (validParsed.success) {
        return validParsed.data;
    }
    const needsParsed = upload_schema_1.validatorNeedsResponseSchema.safeParse(response);
    if (needsParsed.success) {
        return needsParsed.data;
    }
    throw new http_error_1.HttpError(502, "requirement-validator-service response schema mismatch", response);
};
exports.validateRequirement = validateRequirement;
