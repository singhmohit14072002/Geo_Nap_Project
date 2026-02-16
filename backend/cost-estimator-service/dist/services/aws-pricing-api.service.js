"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchAndNormalizeAwsPricingRows = void 0;
const https_1 = __importDefault(require("https"));
const aws_region_mapper_1 = require("../utils/aws-region-mapper");
const logger_1 = __importDefault(require("../utils/logger"));
const AWS_PRICING_BASE_URL = process.env.AWS_PRICING_BASE_URL ??
    "https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws";
const fetchJson = (url) => new Promise((resolve, reject) => {
    https_1.default
        .get(url, (res) => {
        const statusCode = res.statusCode ?? 500;
        const chunks = [];
        res.on("data", (chunk) => {
            chunks.push(chunk);
        });
        res.on("end", () => {
            const body = Buffer.concat(chunks).toString("utf8");
            if (statusCode >= 400) {
                reject(new Error(`AWS pricing API request failed with status ${statusCode}`));
                return;
            }
            try {
                resolve(JSON.parse(body));
            }
            catch (err) {
                reject(new Error(`Failed to parse AWS pricing API response: ${err instanceof Error ? err.message : "invalid JSON"}`));
            }
        });
    })
        .on("error", reject);
});
const fetchAwsOfferIndex = async (serviceCode, region) => {
    const url = `${AWS_PRICING_BASE_URL}/${serviceCode}/current/${region}/index.json`;
    return fetchJson(url);
};
const parseFloatSafe = (value) => {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return null;
};
const parseMemoryGiB = (raw) => {
    if (!raw) {
        return null;
    }
    const match = raw.match(/([0-9]+(?:\.[0-9]+)?)/);
    if (!match) {
        return null;
    }
    return parseFloatSafe(match[1]);
};
const pickPriceDimensionUsd = (offerIndex, sku, opts) => {
    const terms = offerIndex.terms?.OnDemand?.[sku] ?? {};
    let selected = null;
    for (const term of Object.values(terms)) {
        for (const dimension of Object.values(term.priceDimensions ?? {})) {
            const unit = (dimension.unit ?? "").toLowerCase();
            const beginRange = dimension.beginRange ?? "";
            const unitMatches = opts?.requireUnitIncludes
                ? unit.includes(opts.requireUnitIncludes.toLowerCase())
                : true;
            const beginRangeMatches = opts?.requireBeginRange
                ? beginRange === opts.requireBeginRange
                : true;
            if (!unitMatches || !beginRangeMatches) {
                continue;
            }
            const usd = parseFloatSafe(dimension.pricePerUnit?.USD);
            if (usd === null || usd < 0) {
                continue;
            }
            if (selected === null || usd < selected) {
                selected = usd;
            }
        }
    }
    return selected;
};
const isAwsOnDemandLinuxSharedVm = (attrs, expectedLocation) => {
    if (!attrs) {
        return false;
    }
    const hasInstanceType = Boolean(attrs.instanceType);
    if (!hasInstanceType) {
        return false;
    }
    const sameLocation = attrs.location === expectedLocation;
    if (!sameLocation) {
        return false;
    }
    if (attrs.tenancy && attrs.tenancy !== "Shared") {
        return false;
    }
    if (attrs.preInstalledSw && attrs.preInstalledSw !== "NA") {
        return false;
    }
    if (attrs.capacitystatus && attrs.capacitystatus !== "Used") {
        return false;
    }
    const os = (attrs.operatingSystem ?? "").toLowerCase();
    return os === "linux" || os === "windows";
};
const buildAwsEc2Rows = (region, locationName, pricingVersion, offerIndex) => {
    const rows = [];
    const products = offerIndex.products ?? {};
    let matchedProducts = 0;
    for (const [sku, product] of Object.entries(products)) {
        const attrs = product.attributes ?? {};
        if (!isAwsOnDemandLinuxSharedVm(attrs, locationName)) {
            continue;
        }
        const hourlyUsd = pickPriceDimensionUsd(offerIndex, sku, {
            requireUnitIncludes: "hrs"
        });
        if (hourlyUsd === null || hourlyUsd <= 0) {
            continue;
        }
        const instanceType = attrs.instanceType;
        const vcpu = parseFloatSafe(attrs.vcpu);
        const ramGiB = parseMemoryGiB(attrs.memory);
        const os = (attrs.operatingSystem ?? "linux").toLowerCase();
        if (!instanceType || vcpu === null || ramGiB === null) {
            continue;
        }
        matchedProducts += 1;
        rows.push({
            provider: "aws",
            region,
            serviceName: "AmazonEC2",
            skuName: `${instanceType}|${os}|vcpu=${vcpu}|ramGiB=${ramGiB}`,
            unit: "Hrs",
            retailPrice: hourlyUsd,
            currency: "USD",
            pricingVersion
        });
    }
    logger_1.default.info("AWS pricing API normalized compute rows", {
        region,
        ec2VmRows: rows.length,
        ec2VmProductsMatched: matchedProducts
    });
    return rows;
};
const buildAwsEbsRows = (region, locationName, pricingVersion, offerIndex) => {
    const products = offerIndex.products ?? {};
    let gp3Usd = null;
    for (const [sku, product] of Object.entries(products)) {
        const attrs = product.attributes ?? {};
        const isSameLocation = attrs.location === locationName;
        const isGp3Storage = attrs.volumeApiName === "gp3" &&
            attrs.volumeType === "General Purpose" &&
            isSameLocation;
        if (!isGp3Storage) {
            continue;
        }
        const usd = pickPriceDimensionUsd(offerIndex, sku, {
            requireUnitIncludes: "gb-mo"
        });
        if (usd === null || usd <= 0) {
            continue;
        }
        if (gp3Usd === null || usd < gp3Usd) {
            gp3Usd = usd;
        }
    }
    if (gp3Usd === null) {
        logger_1.default.warn("AWS pricing API missing gp3 storage pricing", { region });
        return [];
    }
    return [
        {
            provider: "aws",
            region,
            serviceName: "AmazonEBS",
            skuName: "gp3-storage",
            unit: "GB-Mo",
            retailPrice: gp3Usd,
            currency: "USD",
            pricingVersion
        }
    ];
};
const buildAwsDataTransferRows = (region, locationName, pricingVersion, offerIndex) => {
    const products = offerIndex.products ?? {};
    let egressUsd = null;
    for (const [sku, product] of Object.entries(products)) {
        const attrs = product.attributes ?? {};
        const fromLocation = attrs.fromLocation;
        const toLocation = attrs.toLocation;
        const transferType = attrs.transferType ?? "";
        const usageType = attrs.usagetype ?? "";
        const isOutboundInternet = fromLocation === locationName &&
            toLocation === "External" &&
            transferType === "AWS Outbound" &&
            usageType.includes("DataTransfer-Out-Bytes");
        if (!isOutboundInternet) {
            continue;
        }
        const usd = pickPriceDimensionUsd(offerIndex, sku, {
            requireUnitIncludes: "gb",
            requireBeginRange: "0"
        });
        if (usd === null || usd <= 0) {
            continue;
        }
        if (egressUsd === null || usd < egressUsd) {
            egressUsd = usd;
        }
    }
    if (egressUsd === null) {
        logger_1.default.warn("AWS pricing API missing outbound data transfer pricing", {
            region
        });
        return [];
    }
    return [
        {
            provider: "aws",
            region,
            serviceName: "AWSDataTransfer",
            skuName: "DataTransfer-Out-Bytes",
            unit: "GB",
            retailPrice: egressUsd,
            currency: "USD",
            pricingVersion
        }
    ];
};
const fetchAndNormalizeAwsPricingRows = async (region, pricingVersion) => {
    const locationName = (0, aws_region_mapper_1.mapAwsRegionToLocation)(region);
    if (!locationName) {
        throw new Error(`Unsupported AWS region mapping. Add region mapper entry for ${region}`);
    }
    const [ec2Offer, dataTransferOffer] = await Promise.all([
        fetchAwsOfferIndex("AmazonEC2", region),
        fetchAwsOfferIndex("AWSDataTransfer", region)
    ]);
    const ec2Rows = buildAwsEc2Rows(region, locationName, pricingVersion, ec2Offer);
    const ebsRows = buildAwsEbsRows(region, locationName, pricingVersion, ec2Offer);
    const transferRows = buildAwsDataTransferRows(region, locationName, pricingVersion, dataTransferOffer);
    return [...ec2Rows, ...ebsRows, ...transferRows];
};
exports.fetchAndNormalizeAwsPricingRows = fetchAndNormalizeAwsPricingRows;
