"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.importEstimateController = void 0;
const import_schema_1 = require("../schemas/import.schema");
const estimate_import_service_1 = require("../services/estimate-import.service");
const http_error_1 = require("../utils/http-error");
const importEstimateController = (req, res, next) => {
    try {
        const parsed = import_schema_1.estimateImportRequestSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new http_error_1.HttpError(422, "Estimate import payload validation failed", parsed.error.flatten());
        }
        const result = (0, estimate_import_service_1.importAzureEstimateRows)(parsed.data);
        res.status(200).json(result);
    }
    catch (error) {
        next(error);
    }
};
exports.importEstimateController = importEstimateController;
