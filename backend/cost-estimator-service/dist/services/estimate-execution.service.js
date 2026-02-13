"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runEstimateComputation = void 0;
const http_error_util_1 = require("../utils/http-error.util");
const pricing_factory_service_1 = require("./pricing-factory.service");
const runEstimateComputation = async (payload) => {
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
            console.warn(`[estimate-execution] provider estimation failed: ${result.reason instanceof Error
                ? result.reason.message
                : String(result.reason)}`);
        });
    }
    if (successful.length === 0) {
        throw new http_error_util_1.HttpError(422, "No provider could produce a valid estimate for the requested resources");
    }
    return successful;
};
exports.runEstimateComputation = runEstimateComputation;
