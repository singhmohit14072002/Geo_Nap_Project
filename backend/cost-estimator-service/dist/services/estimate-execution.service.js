"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runEstimateComputation = void 0;
const http_error_util_1 = require("../utils/http-error.util");
const logger_1 = __importDefault(require("../utils/logger"));
const optimization_engine_service_1 = require("./optimization-engine.service");
const pricing_factory_service_1 = require("./pricing-factory.service");
const universal_azure_pricing_engine_service_1 = require("./universal-azure-pricing-engine.service");
const estimate_schema_1 = require("../schemas/estimate.schema");
const hasAzureEstimatePayload = (payload) => {
    if (!("azureEstimate" in payload)) {
        return false;
    }
    const record = payload;
    const azureEstimate = record.azureEstimate;
    if (!azureEstimate || typeof azureEstimate !== "object") {
        return false;
    }
    const value = azureEstimate;
    if (value.documentType !== "CLOUD_ESTIMATE") {
        return false;
    }
    if (!Array.isArray(value.classifiedServices)) {
        return false;
    }
    return value.classifiedServices.length > 0;
};
const runEstimateComputation = async (payload) => {
    if (hasAzureEstimatePayload(payload)) {
        const ignoredProviders = payload.cloudProviders.filter((provider) => provider !== "azure");
        if (ignoredProviders.length > 0) {
            logger_1.default.warn("Ignoring non-Azure providers in CLOUD_ESTIMATE mode", {
                ignoredProviders
            });
        }
        const validatedServices = [];
        payload.azureEstimate.classifiedServices.forEach((item) => {
            const parsed = estimate_schema_1.classifiedServiceSchema.safeParse(item);
            if (parsed.success) {
                validatedServices.push(parsed.data);
            }
        });
        if (validatedServices.length === 0) {
            throw new http_error_util_1.HttpError(422, "No valid classified services provided for azureEstimate mode");
        }
        const azureResult = await (0, universal_azure_pricing_engine_service_1.estimateAzureCloudEstimatePricing)({
            region: payload.region,
            classifiedServices: validatedServices
        });
        return (0, optimization_engine_service_1.attachOptimizationRecommendations)([azureResult]);
    }
    if (!("requirement" in payload)) {
        throw new http_error_util_1.HttpError(422, "Missing requirement payload for standard estimation mode");
    }
    const uniqueProviders = [...new Set(payload.cloudProviders)];
    const settled = await Promise.allSettled(uniqueProviders.map(async (provider) => {
        const pricingService = (0, pricing_factory_service_1.getPricingService)(provider);
        return pricingService.estimate({
            provider,
            region: payload.region,
            requirement: payload.requirement
        });
    }));
    const successful = settled
        .filter((result) => result.status === "fulfilled")
        .map((result) => result.value);
    const failed = settled.filter((result) => result.status === "rejected");
    if (failed.length > 0) {
        failed.forEach((result) => {
            logger_1.default.warn("Provider estimation failed", {
                error: result.reason instanceof Error
                    ? result.reason.message
                    : String(result.reason)
            });
        });
    }
    if (successful.length === 0) {
        throw new http_error_util_1.HttpError(422, "No provider could produce a valid estimate for the requested resources");
    }
    return (0, optimization_engine_service_1.attachOptimizationRecommendations)(successful);
};
exports.runEstimateComputation = runEstimateComputation;
