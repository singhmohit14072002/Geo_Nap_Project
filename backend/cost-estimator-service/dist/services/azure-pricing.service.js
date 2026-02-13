"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AzurePricingService = void 0;
const calculator_util_1 = require("../utils/calculator.util");
const cloud_pricing_repository_1 = require("./cloud-pricing.repository");
const sku_matcher_service_1 = require("./sku-matcher.service");
const AZURE_USD_TO_INR = Number(process.env.AZURE_USD_TO_INR ?? "83");
const FALLBACK = {
    storagePerGbInr: 4,
    egressPerGbInr: 5,
    postgresBaseMonthlyInr: 2000
};
const round2 = (value) => Number(value.toFixed(2));
const toInr = (price, currency) => {
    const code = currency.toUpperCase();
    if (code === "INR") {
        return round2(price);
    }
    if (code === "USD") {
        return round2(price * AZURE_USD_TO_INR);
    }
    return null;
};
const toInrFromRow = (row) => {
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
        console.warn(`[azure-pricing] DB read failed provider=${provider} region=${region} service=${serviceName} sku=${skuName}: ${err instanceof Error ? err.message : String(err)}`);
        return null;
    }
};
class AzurePricingService {
    async estimate(input) {
        let compute = 0;
        const details = [];
        let pricingVersion = null;
        for (const item of input.requirement.compute) {
            const matched = await (0, sku_matcher_service_1.matchComputeSku)({
                provider: "azure",
                region: input.region,
                requiredCPU: item.vCPU,
                requiredRAM: item.ramGB,
                osType: item.osType
            });
            const hourlyInr = toInr(matched.retailPrice, matched.currency);
            if (hourlyInr === null) {
                throw new Error(`Unsupported currency for matched Azure SKU ${matched.skuName}: ${matched.currency}`);
            }
            const monthlyCost = round2(hourlyInr * 730 * item.quantity);
            compute += monthlyCost;
            pricingVersion = pricingVersion ?? matched.pricingVersion;
            details.push({
                serviceType: "compute",
                name: `VM compute (${item.osType})`,
                sku: `${matched.skuName} (${matched.vcpu} vCPU, ${matched.memoryGiB} GB RAM)`,
                quantity: item.quantity,
                unitPrice: hourlyInr,
                monthlyCost
            });
        }
        const storageRow = await safeGetLatestCloudPrice("azure", input.region, "Storage", "Standard_LRS_Hot");
        const egressRow = await safeGetLatestCloudPrice("azure", input.region, "Bandwidth", "DataTransferOut");
        const postgresRow = await safeGetLatestCloudPrice("azure", input.region, "Azure Database for PostgreSQL", "FlexibleServerVCore");
        const storagePerGbInr = toInrFromRow(storageRow) ?? FALLBACK.storagePerGbInr;
        const egressPerGbInr = toInrFromRow(egressRow) ?? FALLBACK.egressPerGbInr;
        const postgresPerHourInr = toInrFromRow(postgresRow);
        const postgresBaseMonthlyInr = postgresPerHourInr !== null
            ? round2(postgresPerHourInr * 730)
            : FALLBACK.postgresBaseMonthlyInr;
        if (!storageRow) {
            console.warn(`[azure-pricing] Missing storage price for region=${input.region}, using fallback`);
        }
        else {
            pricingVersion = pricingVersion ?? storageRow.pricingVersion;
        }
        if (!egressRow) {
            console.warn(`[azure-pricing] Missing bandwidth price for region=${input.region}, using fallback`);
        }
        else {
            pricingVersion = pricingVersion ?? egressRow.pricingVersion;
        }
        if (!postgresRow) {
            console.warn(`[azure-pricing] Missing postgres price for region=${input.region}, using fallback`);
        }
        else {
            pricingVersion = pricingVersion ?? postgresRow.pricingVersion;
        }
        const storage = round2(input.requirement.compute.reduce((sum, item) => sum + item.storageGB * storagePerGbInr * item.quantity, 0));
        const database = round2(postgresBaseMonthlyInr +
            input.requirement.database.storageGB * storagePerGbInr);
        const networkEgress = round2(input.requirement.network.dataEgressGB * egressPerGbInr);
        details.push({
            serviceType: "storage",
            name: "Attached storage",
            sku: `${storagePerGbInr.toFixed(2)} INR/GB-month`,
            quantity: 1,
            unitPrice: storagePerGbInr,
            monthlyCost: storage
        }, {
            serviceType: "database",
            name: `Managed ${input.requirement.database.engine} database`,
            sku: input.requirement.database.ha ? "HA enabled" : "Single zone",
            quantity: 1,
            unitPrice: postgresBaseMonthlyInr,
            monthlyCost: database
        }, {
            serviceType: "network-egress",
            name: "Data egress",
            sku: `${input.requirement.network.dataEgressGB} GB`,
            quantity: 1,
            unitPrice: egressPerGbInr,
            monthlyCost: networkEgress
        });
        const breakdown = (0, calculator_util_1.buildBreakdown)(round2(compute), storage, database, networkEgress);
        const summary = (0, calculator_util_1.buildSummary)(breakdown);
        return {
            provider: input.provider,
            region: input.region,
            summary,
            breakdown,
            details,
            pricingVersion: pricingVersion ?? "azure-db-unknown",
            calculatedAt: new Date()
        };
    }
}
exports.AzurePricingService = AzurePricingService;
