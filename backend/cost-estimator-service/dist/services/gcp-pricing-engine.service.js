"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GcpPricingEngine = exports.GcpPricingEngineError = void 0;
const prisma_1 = __importDefault(require("../db/prisma"));
const gcp_region_mapper_1 = require("../utils/gcp-region-mapper");
const logger_1 = __importDefault(require("../utils/logger"));
const GCP_USD_TO_INR = Number(process.env.GCP_USD_TO_INR ?? "83");
const round2 = (value) => Number(value.toFixed(2));
const toInr = (price, currency) => {
    const code = currency.toUpperCase();
    if (code === "INR") {
        return round2(price);
    }
    if (code === "USD") {
        return round2(price * GCP_USD_TO_INR);
    }
    throw new Error(`Unsupported GCP currency: ${currency}`);
};
const toUsd = (priceInr) => round2(priceInr / GCP_USD_TO_INR);
class GcpPricingEngineError extends Error {
    constructor(code, message, details) {
        super(message);
        this.name = "GcpPricingEngineError";
        this.code = code;
        this.details = details;
    }
}
exports.GcpPricingEngineError = GcpPricingEngineError;
class GcpPricingEngine {
    async calculatePrice(params) {
        if (params.serviceType !== "COMPUTE_VM") {
            throw new GcpPricingEngineError("INVALID_INPUT", "Unsupported GCP serviceType", {
                serviceType: params.serviceType
            });
        }
        if (!params.region?.trim()) {
            throw new GcpPricingEngineError("INVALID_INPUT", "region is required");
        }
        const normalizedRegion = (0, gcp_region_mapper_1.normalizeGcpRegion)(params.region);
        const normalizedSku = params.skuName.trim().toLowerCase();
        try {
            const rows = await prisma_1.default.cloudPricing.findMany({
                where: {
                    provider: "gcp",
                    region: normalizedRegion,
                    serviceName: "Compute Engine VM"
                },
                orderBy: [{ lastUpdated: "desc" }, { retailPrice: "asc" }],
                take: 200
            });
            const matchedRow = rows.find((row) => {
                const sku = row.skuName.toLowerCase();
                if (!sku.includes(normalizedSku)) {
                    return false;
                }
                return sku.includes(`|${params.osType}|`);
            });
            if (!matchedRow) {
                throw new GcpPricingEngineError("MATCHING_FAILED", `No GCP compute SKU found for ${params.skuName} in ${normalizedRegion}`, {
                    requestedSku: params.skuName,
                    region: normalizedRegion,
                    osType: params.osType
                });
            }
            const hourlyPriceInr = toInr(matchedRow.retailPrice, matchedRow.currency);
            const monthlyCost = round2(hourlyPriceInr * params.hours * params.quantity);
            const source = matchedRow.pricingVersion.startsWith("fallback")
                ? "fallback"
                : "db";
            return {
                provider: "gcp",
                serviceName: "Compute Engine VM",
                monthlyCost,
                pricingVersion: matchedRow.pricingVersion,
                breakdown: {
                    hourlyPrice: toUsd(hourlyPriceInr),
                    hourlyPriceCurrency: "USD",
                    hourlyPriceInr,
                    region: normalizedRegion,
                    instanceType: params.skuName,
                    source,
                    matchedSkuName: matchedRow.skuName
                }
            };
        }
        catch (error) {
            logger_1.default.warn("GCP pricing engine failed", {
                region: normalizedRegion,
                requestedSku: params.skuName,
                error: error instanceof Error ? error.message : String(error)
            });
            if (error instanceof GcpPricingEngineError) {
                throw error;
            }
            throw new GcpPricingEngineError("MATCHING_FAILED", "GCP pricing lookup failed", {
                region: normalizedRegion,
                requestedSku: params.skuName,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
}
exports.GcpPricingEngine = GcpPricingEngine;
