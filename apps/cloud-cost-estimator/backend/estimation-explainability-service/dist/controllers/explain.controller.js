"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.explainController = void 0;
const explain_schema_1 = require("../schemas/explain.schema");
const explainability_service_1 = require("../services/explainability.service");
const http_error_1 = require("../utils/http-error");
const logger_1 = __importDefault(require("../utils/logger"));
const explainController = (req, res, next) => {
    try {
        const parsed = explain_schema_1.explainRequestSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new http_error_1.HttpError(422, "Explain request validation failed", parsed.error.flatten());
        }
        const explanation = (0, explainability_service_1.generateEstimationExplanation)(parsed.data.providerResult);
        logger_1.default.info("EXPLANATION_GENERATED", {
            provider: parsed.data.providerResult.provider,
            region: parsed.data.providerResult.region
        });
        res.status(200).json({
            explanation
        });
    }
    catch (error) {
        next(error);
    }
};
exports.explainController = explainController;
