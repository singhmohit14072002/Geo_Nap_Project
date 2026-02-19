"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.recommendProviderController = void 0;
const decision_schema_1 = require("../schemas/decision.schema");
const decision_intelligence_service_1 = require("../services/decision-intelligence.service");
const http_error_1 = require("../utils/http-error");
const logger_1 = __importDefault(require("../utils/logger"));
const recommendProviderController = (req, res, next) => {
    try {
        const parsed = decision_schema_1.decisionRequestSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new http_error_1.HttpError(422, "Decision request validation failed", parsed.error.flatten());
        }
        const output = (0, decision_intelligence_service_1.analyzeDecisionIntelligence)(parsed.data);
        logger_1.default.info("DECISION_RECOMMENDATION_GENERATED", {
            providerCount: parsed.data.providerResults.length,
            recommendedProvider: output.recommended.provider,
            confidence: output.recommended.recommendationConfidence
        });
        res.status(200).json(output);
    }
    catch (error) {
        next(error);
    }
};
exports.recommendProviderController = recommendProviderController;
