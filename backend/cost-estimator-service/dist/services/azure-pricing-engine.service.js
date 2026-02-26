"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AzurePricingEngine = exports.AzurePricingEngineError = void 0;
const azure_pricing_query_service_1 = require("./azure-pricing-query.service");
const AZURE_USD_TO_INR = Number(process.env.AZURE_USD_TO_INR ?? "83");
const round2 = (value) => Number(value.toFixed(2));
const toHourlyUsd = (hourlyInr, currencyCode) => {
    if ((currencyCode ?? "").toUpperCase() === "USD") {
        return round2(hourlyInr / AZURE_USD_TO_INR);
    }
    return round2(hourlyInr / AZURE_USD_TO_INR);
};
class AzurePricingEngineError extends Error {
    constructor(code, message, details) {
        super(message);
        this.name = "AzurePricingEngineError";
        this.code = code;
        this.details = details;
    }
}
exports.AzurePricingEngineError = AzurePricingEngineError;
class AzurePricingEngine {
    async calculatePrice(params) {
        if (params.serviceType !== "COMPUTE_VM") {
            throw new AzurePricingEngineError("INVALID_INPUT", "Unsupported Azure serviceType", {
                serviceType: params.serviceType
            });
        }
        if (!params.region?.trim()) {
            throw new AzurePricingEngineError("INVALID_INPUT", "region is required");
        }
        if (!params.skuName?.trim()) {
            throw new AzurePricingEngineError("INVALID_INPUT", "skuName is required");
        }
        try {
            const result = await (0, azure_pricing_query_service_1.queryAzureRetailPricing)({
                serviceName: "Virtual Machines",
                skuName: params.skuName,
                region: params.region,
                quantity: params.quantity,
                hours: params.hours,
                osType: params.osType
            });
            const hourlyPriceInr = result.unitPrice;
            const hourlyPriceUsd = toHourlyUsd(hourlyPriceInr, result.currencyCode);
            return {
                provider: "azure",
                serviceName: "Virtual Machines",
                monthlyCost: result.monthlyCost,
                pricingVersion: result.source === "cache" ? "azure-cache-pricing" : "azure-retail-api",
                breakdown: {
                    hourlyPrice: hourlyPriceUsd,
                    hourlyPriceCurrency: "USD",
                    hourlyPriceInr,
                    region: params.region,
                    instanceType: params.skuName,
                    source: result.source === "cache" ? "cache" : "api",
                    matchedSkuName: result.matchedSkuName,
                    meterName: result.meterName
                }
            };
        }
        catch (error) {
            if (error instanceof azure_pricing_query_service_1.AzurePricingQueryError) {
                throw new AzurePricingEngineError("QUERY_FAILED", error.message, {
                    code: error.code,
                    details: error.details
                });
            }
            throw new AzurePricingEngineError("QUERY_FAILED", "Azure pricing query failed", {
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
}
exports.AzurePricingEngine = AzurePricingEngine;
