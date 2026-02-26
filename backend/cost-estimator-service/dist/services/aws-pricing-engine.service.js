"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AwsPricingEngine = exports.AwsPricingEngineService = exports.AwsPricingEngineError = void 0;
const client_pricing_1 = require("@aws-sdk/client-pricing");
const prisma_1 = __importDefault(require("../db/prisma"));
const cloud_pricing_repository_1 = require("./cloud-pricing.repository");
const aws_region_mapper_1 = require("../utils/aws-region-mapper");
const logger_1 = __importDefault(require("../utils/logger"));
const retry_util_1 = require("../utils/retry.util");
const AWS_USD_TO_INR = Number(process.env.AWS_USD_TO_INR ?? "83");
const AWS_PRICING_API_REGION = process.env.AWS_PRICING_API_REGION ?? "us-east-1";
const AWS_PRICING_MAX_PAGES = Number(process.env.AWS_PRICING_MAX_PAGES ?? "25");
const toEngineInput = (params) => ({
    serviceType: params.serviceType,
    skuName: params.skuName,
    region: params.region,
    hours: params.hours,
    quantity: params.quantity,
    osType: params.osType
});
const toPricingResult = (output) => ({
    provider: output.provider,
    serviceName: output.serviceName,
    monthlyCost: output.monthlyCost,
    pricingVersion: output.pricingVersion,
    breakdown: {
        hourlyPrice: output.breakdown.hourlyPrice,
        hourlyPriceCurrency: output.breakdown.hourlyPriceCurrency,
        hourlyPriceInr: output.breakdown.hourlyPriceInr,
        region: output.breakdown.region,
        location: output.breakdown.location,
        instanceType: output.breakdown.instanceType,
        source: output.breakdown.source
    }
});
class AwsPricingEngineError extends Error {
    constructor(code, message, details) {
        super(message);
        this.name = "AwsPricingEngineError";
        this.code = code;
        this.details = details;
    }
}
exports.AwsPricingEngineError = AwsPricingEngineError;
const pricingClient = new client_pricing_1.PricingClient({
    region: AWS_PRICING_API_REGION
});
const round2 = (value) => Number(value.toFixed(2));
const buildOperatingSystemFilter = (osType) => osType === "windows" ? "Windows" : "Linux";
const parseNumber = (value) => {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};
const normalizeInstanceType = (value) => value
    .split("|")[0]
    .trim()
    .toLowerCase();
const toInrFromUsd = (usd) => round2(usd * AWS_USD_TO_INR);
const buildCacheSkuName = (instanceType, osType) => `${instanceType}|${osType}|tenancy=Shared|preInstalledSw=NA`;
const getTodayVersionTag = () => {
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(now.getUTCDate()).padStart(2, "0");
    return `aws-live-${yyyy}-${mm}-${dd}`;
};
const findCachedComputeHourlyUsd = async (region, instanceType, osType) => {
    try {
        const cacheSkuPrefix = `${instanceType}|${osType}|`;
        const rows = await prisma_1.default.cloudPricing.findMany({
            where: {
                provider: "aws",
                region,
                serviceName: "AmazonEC2",
                skuName: {
                    startsWith: cacheSkuPrefix
                }
            },
            orderBy: [{ lastUpdated: "desc" }, { retailPrice: "asc" }],
            take: 3
        });
        const selected = rows.find((row) => {
            const unit = row.unit.toLowerCase();
            return unit.includes("hr") || unit.includes("hour");
        });
        if (!selected) {
            logger_1.default.info("AWS_CACHE_MISS", {
                serviceName: "AmazonEC2",
                region,
                instanceType,
                osType
            });
            logger_1.default.info("CACHE_MISS", {
                provider: "aws",
                cache: "aws-compute-cache",
                serviceName: "AmazonEC2",
                region,
                instanceType,
                osType
            });
            return null;
        }
        const currency = selected.currency.toUpperCase();
        const hourlyPriceUsd = currency === "USD"
            ? selected.retailPrice
            : currency === "INR"
                ? selected.retailPrice / AWS_USD_TO_INR
                : NaN;
        if (!Number.isFinite(hourlyPriceUsd) || hourlyPriceUsd <= 0) {
            logger_1.default.info("AWS_CACHE_MISS", {
                serviceName: "AmazonEC2",
                region,
                instanceType,
                osType,
                reason: "invalid_cached_currency_or_price",
                currency: selected.currency
            });
            logger_1.default.info("CACHE_MISS", {
                provider: "aws",
                cache: "aws-compute-cache",
                serviceName: "AmazonEC2",
                region,
                instanceType,
                osType,
                reason: "invalid_cached_currency_or_price",
                currency: selected.currency
            });
            return null;
        }
        logger_1.default.info("AWS_CACHE_HIT", {
            serviceName: "AmazonEC2",
            region,
            instanceType,
            osType,
            pricingVersion: selected.pricingVersion
        });
        logger_1.default.info("CACHE_HIT", {
            provider: "aws",
            cache: "aws-compute-cache",
            serviceName: "AmazonEC2",
            region,
            instanceType,
            osType,
            pricingVersion: selected.pricingVersion
        });
        return {
            hourlyPriceUsd: round2(hourlyPriceUsd),
            pricingVersion: selected.pricingVersion
        };
    }
    catch (error) {
        logger_1.default.warn("AWS_CACHE_LOOKUP_FAILED", {
            serviceName: "AmazonEC2",
            region,
            instanceType,
            osType,
            error: error instanceof Error ? error.message : String(error)
        });
        return null;
    }
};
const storeCachedComputeHourlyUsd = async (region, instanceType, osType, hourlyPriceUsd) => {
    const pricingVersion = getTodayVersionTag();
    try {
        await (0, cloud_pricing_repository_1.upsertCloudPricingRecords)([
            {
                provider: "aws",
                region,
                serviceName: "AmazonEC2",
                skuName: buildCacheSkuName(instanceType, osType),
                unit: "Hrs",
                retailPrice: hourlyPriceUsd,
                currency: "USD",
                pricingVersion
            }
        ]);
        logger_1.default.info("AWS_CACHE_STORE", {
            serviceName: "AmazonEC2",
            region,
            instanceType,
            osType,
            pricingVersion
        });
    }
    catch (error) {
        logger_1.default.warn("AWS_CACHE_STORE_FAILED", {
            serviceName: "AmazonEC2",
            region,
            instanceType,
            osType,
            pricingVersion,
            error: error instanceof Error ? error.message : String(error)
        });
    }
    return pricingVersion;
};
const extractOnDemandHourlyUsd = (priceListPayload) => {
    const onDemandTerms = priceListPayload.terms?.OnDemand ?? {};
    const hourlyPrices = [];
    for (const term of Object.values(onDemandTerms)) {
        for (const dimension of Object.values(term.priceDimensions ?? {})) {
            const unit = (dimension.unit ?? "").toLowerCase();
            const beginRange = dimension.beginRange ?? "0";
            const usd = parseNumber(dimension.pricePerUnit?.USD);
            if (!unit.includes("hr")) {
                continue;
            }
            if (beginRange !== "0") {
                continue;
            }
            if (usd === null || usd <= 0) {
                continue;
            }
            hourlyPrices.push(usd);
        }
    }
    if (hourlyPrices.length === 0) {
        return null;
    }
    return Math.min(...hourlyPrices);
};
const fetchAwsOnDemandHourlyUsd = async (instanceType, region, osType) => {
    const location = (0, aws_region_mapper_1.mapAwsRegionToLocation)(region);
    if (!location) {
        throw new AwsPricingEngineError("REGION_MAPPING_NOT_FOUND", `AWS region mapping not found for ${region}`, { region });
    }
    const filters = [
        {
            Type: client_pricing_1.FilterType.TERM_MATCH,
            Field: "instanceType",
            Value: instanceType
        },
        {
            Type: client_pricing_1.FilterType.TERM_MATCH,
            Field: "location",
            Value: location
        },
        {
            Type: client_pricing_1.FilterType.TERM_MATCH,
            Field: "operatingSystem",
            Value: buildOperatingSystemFilter(osType)
        },
        {
            Type: client_pricing_1.FilterType.TERM_MATCH,
            Field: "tenancy",
            Value: "Shared"
        },
        {
            Type: client_pricing_1.FilterType.TERM_MATCH,
            Field: "preInstalledSw",
            Value: "NA"
        }
    ];
    const pageLimit = Math.max(1, AWS_PRICING_MAX_PAGES);
    let nextToken;
    let page = 0;
    let bestHourlyPrice = null;
    while (page < pageLimit) {
        const response = await pricingClient.send(new client_pricing_1.GetProductsCommand({
            ServiceCode: "AmazonEC2",
            Filters: filters,
            NextToken: nextToken,
            MaxResults: 100
        }));
        for (const row of response.PriceList ?? []) {
            let parsed = null;
            try {
                parsed = JSON.parse(typeof row === "string" ? row : String(row));
            }
            catch {
                continue;
            }
            const hourly = extractOnDemandHourlyUsd(parsed);
            if (hourly === null) {
                continue;
            }
            bestHourlyPrice =
                bestHourlyPrice === null ? hourly : Math.min(bestHourlyPrice, hourly);
        }
        nextToken = response.NextToken;
        page += 1;
        if (!nextToken) {
            break;
        }
    }
    if (bestHourlyPrice === null) {
        throw new AwsPricingEngineError("PRICE_NOT_FOUND", `No AWS OnDemand hourly price found for ${instanceType} in ${region}`, {
            serviceCode: "AmazonEC2",
            instanceType,
            region,
            location,
            osType,
            pagesChecked: page
        });
    }
    return { hourlyPriceUsd: round2(bestHourlyPrice) };
};
const fetchAwsOnDemandWithRetry = async (instanceType, region, osType) => {
    try {
        return await (0, retry_util_1.retry)(() => fetchAwsOnDemandHourlyUsd(instanceType, region, osType));
    }
    catch (error) {
        if (error instanceof AwsPricingEngineError) {
            throw error;
        }
        throw new AwsPricingEngineError("API_CALL_FAILED", "AWS Price List API call failed after retries", {
            serviceName: "AmazonEC2",
            instanceType,
            region,
            osType,
            error: error instanceof Error ? error.message : String(error)
        });
    }
};
class AwsPricingEngineService {
    async calculatePrice(input) {
        if (input.serviceType !== "COMPUTE_VM") {
            throw new AwsPricingEngineError("INVALID_INPUT", "Unsupported AWS serviceType", {
                serviceType: input.serviceType
            });
        }
        if (!input.skuName?.trim()) {
            throw new AwsPricingEngineError("INVALID_INPUT", "skuName is required");
        }
        if (!input.region?.trim()) {
            throw new AwsPricingEngineError("INVALID_INPUT", "region is required");
        }
        if (!Number.isFinite(input.hours) || input.hours <= 0) {
            throw new AwsPricingEngineError("INVALID_INPUT", "hours must be > 0");
        }
        if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
            throw new AwsPricingEngineError("INVALID_INPUT", "quantity must be > 0");
        }
        const instanceType = normalizeInstanceType(input.skuName);
        const location = (0, aws_region_mapper_1.mapAwsRegionToLocation)(input.region);
        if (!location) {
            throw new AwsPricingEngineError("REGION_MAPPING_NOT_FOUND", `AWS region mapping not found for ${input.region}`, { region: input.region });
        }
        let hourlyPriceUsd;
        let pricingVersion;
        let source;
        const cached = await findCachedComputeHourlyUsd(input.region, instanceType, input.osType);
        if (cached) {
            hourlyPriceUsd = cached.hourlyPriceUsd;
            pricingVersion = cached.pricingVersion;
            source = "cache";
        }
        else {
            const api = await fetchAwsOnDemandWithRetry(instanceType, input.region, input.osType);
            hourlyPriceUsd = api.hourlyPriceUsd;
            pricingVersion = await storeCachedComputeHourlyUsd(input.region, instanceType, input.osType, hourlyPriceUsd);
            source = "api";
        }
        const hourlyPriceInr = toInrFromUsd(hourlyPriceUsd);
        const monthlyCost = round2(hourlyPriceInr * input.hours * input.quantity);
        return {
            provider: "aws",
            serviceName: "EC2",
            monthlyCost,
            pricingVersion,
            breakdown: {
                hourlyPrice: hourlyPriceUsd,
                hourlyPriceCurrency: "USD",
                hourlyPriceInr,
                region: input.region,
                location,
                instanceType,
                source
            }
        };
    }
    async estimate(input) {
        return this.calculatePrice(input);
    }
}
exports.AwsPricingEngineService = AwsPricingEngineService;
class AwsPricingEngine {
    constructor() {
        this.engine = new AwsPricingEngineService();
    }
    async calculatePrice(params) {
        const result = await this.engine.calculatePrice(toEngineInput(params));
        return toPricingResult(result);
    }
}
exports.AwsPricingEngine = AwsPricingEngine;
