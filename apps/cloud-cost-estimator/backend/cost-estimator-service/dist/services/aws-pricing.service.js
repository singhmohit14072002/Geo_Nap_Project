"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AwsPricingService = void 0;
const calculator_util_1 = require("../utils/calculator.util");
const logger_1 = __importDefault(require("../utils/logger"));
const cloud_pricing_repository_1 = require("./cloud-pricing.repository");
const sku_matcher_service_1 = require("./sku-matcher.service");
const aws_pricing_engine_service_1 = require("./aws-pricing-engine.service");
const AWS_USD_TO_INR = Number(process.env.AWS_USD_TO_INR ?? "83");
const FALLBACK = {
    storagePerGbPerMonthInr: 5,
    egressPerGbPerMonthInr: 6,
    databaseBasePerMonthInr: 2200
};
const round2 = (value) => Number(value.toFixed(2));
const toInr = (price, currency) => {
    const code = currency.toUpperCase();
    if (code === "INR") {
        return round2(price);
    }
    if (code === "USD") {
        return round2(price * AWS_USD_TO_INR);
    }
    return null;
};
const toInrFromCloudRow = (row) => {
    if (!row) {
        return null;
    }
    return toInr(row.retailPrice, row.currency);
};
const safeGetLatestCloudPrice = async (provider, region, serviceName, skuName) => {
    try {
        return await (0, cloud_pricing_repository_1.getLatestCloudPrice)(provider, region, serviceName, skuName);
    }
    catch (err) {
        logger_1.default.warn("AWS pricing DB read failed", {
            provider,
            region,
            serviceName,
            skuName,
            error: err instanceof Error ? err.message : String(err)
        });
        return null;
    }
};
class AwsPricingService {
    constructor() {
        this.pricingEngine = new aws_pricing_engine_service_1.AwsPricingEngineService();
    }
    async estimate(input) {
        let compute = 0;
        const details = [];
        let pricingVersion = null;
        for (const reqItem of input.requirement.compute) {
            const matched = await (0, sku_matcher_service_1.matchComputeSku)({
                provider: "aws",
                region: input.region,
                requiredCPU: reqItem.vCPU,
                requiredRAM: reqItem.ramGB,
                osType: reqItem.osType
            });
            const instanceType = matched.skuName.split("|")[0];
            let hourlyInr;
            let monthlyCost;
            let enginePricingVersion = null;
            let pricingSource = "fallback-db";
            try {
                const engineResult = await this.pricingEngine.estimate({
                    serviceType: "COMPUTE_VM",
                    skuName: instanceType,
                    region: input.region,
                    hours: 730,
                    quantity: reqItem.quantity,
                    osType: reqItem.osType
                });
                hourlyInr = engineResult.breakdown.hourlyPriceInr;
                monthlyCost = engineResult.monthlyCost;
                enginePricingVersion = engineResult.pricingVersion;
                pricingSource = engineResult.breakdown.source;
            }
            catch (error) {
                if (error instanceof aws_pricing_engine_service_1.AwsPricingEngineError) {
                    logger_1.default.warn("AWS pricing engine failed, using DB catalog price", {
                        code: error.code,
                        message: error.message,
                        details: error.details,
                        region: input.region,
                        instanceType,
                        osType: reqItem.osType
                    });
                }
                else {
                    logger_1.default.warn("AWS pricing engine failed, using DB catalog price", {
                        error: error instanceof Error ? error.message : String(error),
                        region: input.region,
                        instanceType,
                        osType: reqItem.osType
                    });
                }
                const fallbackHourlyInr = toInr(matched.retailPrice, matched.currency);
                if (fallbackHourlyInr === null) {
                    throw new Error(`Unsupported currency for matched AWS SKU ${matched.skuName}: ${matched.currency}`);
                }
                hourlyInr = fallbackHourlyInr;
                monthlyCost = round2(hourlyInr * 730 * reqItem.quantity);
            }
            compute += monthlyCost;
            pricingVersion = pricingVersion ?? enginePricingVersion ?? matched.pricingVersion;
            details.push({
                serviceType: "compute",
                name: `EC2 compute (${reqItem.osType})`,
                sku: `${matched.skuName} (${matched.vcpu} vCPU, ${matched.memoryGiB} GB RAM)`,
                quantity: reqItem.quantity,
                unitPrice: hourlyInr,
                monthlyCost,
                metadata: {
                    requiredVcpu: reqItem.vCPU,
                    requiredRamGb: reqItem.ramGB,
                    provisionedVcpu: matched.vcpu,
                    provisionedRamGb: matched.memoryGiB,
                    hoursPerMonth: 730,
                    osType: reqItem.osType,
                    quantity: reqItem.quantity,
                    pricingSource
                }
            });
        }
        const storageRow = await safeGetLatestCloudPrice("aws", input.region, "AmazonEBS", "gp3-storage");
        const egressRow = await safeGetLatestCloudPrice("aws", input.region, "AWSDataTransfer", "DataTransfer-Out-Bytes");
        const storagePerGbInr = toInrFromCloudRow(storageRow) ?? FALLBACK.storagePerGbPerMonthInr;
        const egressPerGbInr = toInrFromCloudRow(egressRow) ?? FALLBACK.egressPerGbPerMonthInr;
        if (!storageRow) {
            logger_1.default.warn("AWS storage fallback used", {
                region: input.region
            });
        }
        else {
            pricingVersion = pricingVersion ?? storageRow.pricingVersion;
        }
        if (!egressRow) {
            logger_1.default.warn("AWS egress fallback used", {
                region: input.region
            });
        }
        else {
            pricingVersion = pricingVersion ?? egressRow.pricingVersion;
        }
        const storage = round2(input.requirement.compute.reduce((sum, item) => sum + item.storageGB * storagePerGbInr * item.quantity, 0));
        const database = round2(FALLBACK.databaseBasePerMonthInr +
            input.requirement.database.storageGB * storagePerGbInr);
        const networkEgress = round2(input.requirement.network.dataEgressGB * egressPerGbInr);
        details.push({
            serviceType: "storage",
            name: "EBS gp3 storage",
            sku: `${storagePerGbInr.toFixed(2)} INR/GB-month`,
            quantity: 1,
            unitPrice: storagePerGbInr,
            monthlyCost: storage,
            metadata: {
                storageTier: "premium",
                highIopsRequired: false
            }
        }, {
            serviceType: "database",
            name: `Managed ${input.requirement.database.engine} database`,
            sku: input.requirement.database.ha ? "HA enabled" : "Single zone",
            quantity: 1,
            unitPrice: FALLBACK.databaseBasePerMonthInr,
            monthlyCost: database
        }, {
            serviceType: "network-egress",
            name: "Data egress",
            sku: `${input.requirement.network.dataEgressGB} GB`,
            quantity: 1,
            unitPrice: egressPerGbInr,
            monthlyCost: networkEgress,
            metadata: {
                dataEgressGb: input.requirement.network.dataEgressGB
            }
        });
        const breakdown = (0, calculator_util_1.buildBreakdown)(round2(compute), storage, database, networkEgress);
        const summary = (0, calculator_util_1.buildSummary)(breakdown);
        return {
            provider: input.provider,
            region: input.region,
            summary,
            breakdown,
            details,
            pricingVersion: pricingVersion ?? "aws-db-unknown",
            calculatedAt: new Date()
        };
    }
}
exports.AwsPricingService = AwsPricingService;
