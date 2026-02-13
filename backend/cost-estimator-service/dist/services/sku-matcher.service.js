"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchComputeSku = void 0;
const http_error_util_1 = require("../utils/http-error.util");
const cloud_pricing_repository_1 = require("./cloud-pricing.repository");
const azure_retail_pricing_service_1 = require("./azure-retail-pricing.service");
const AZURE_SKU_TO_SHAPE = new Map(azure_retail_pricing_service_1.VM_REFERENCE_CATALOG.map((vm) => [vm.sku.toLowerCase(), vm]));
const parseFloatSafe = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};
const parseAwsCandidate = (serviceName, skuName, retailPrice, currency, unit, pricingVersion) => {
    const match = skuName.match(/^([^|]+)\|(linux|windows)\|vcpu=([0-9]+(?:\.[0-9]+)?)\|ramGiB=([0-9]+(?:\.[0-9]+)?)$/i);
    if (!match) {
        return null;
    }
    const vcpu = parseFloatSafe(match[3]);
    const memoryGiB = parseFloatSafe(match[4]);
    if (vcpu === null || memoryGiB === null) {
        return null;
    }
    return {
        serviceName,
        skuName,
        osType: match[2].toLowerCase() === "windows" ? "windows" : "linux",
        vcpu,
        memoryGiB,
        retailPrice,
        currency,
        unit,
        pricingVersion
    };
};
const parseAzureCandidate = (serviceName, skuName, retailPrice, currency, unit, pricingVersion) => {
    const encoded = skuName.match(/^([^|]+)\|(linux|windows)\|vcpu=([0-9]+(?:\.[0-9]+)?)\|ramGiB=([0-9]+(?:\.[0-9]+)?)$/i);
    if (encoded) {
        const vcpu = parseFloatSafe(encoded[3]);
        const memoryGiB = parseFloatSafe(encoded[4]);
        if (vcpu === null || memoryGiB === null) {
            return null;
        }
        return {
            serviceName,
            skuName,
            osType: encoded[2].toLowerCase() === "windows" ? "windows" : "linux",
            vcpu,
            memoryGiB,
            retailPrice,
            currency,
            unit,
            pricingVersion
        };
    }
    const legacy = skuName.match(/^([^|]+)\|(linux|windows)$/i);
    if (!legacy) {
        return null;
    }
    const vmShape = AZURE_SKU_TO_SHAPE.get(legacy[1].toLowerCase());
    if (!vmShape) {
        return null;
    }
    return {
        serviceName,
        skuName,
        osType: legacy[2].toLowerCase() === "windows" ? "windows" : "linux",
        vcpu: vmShape.vcpu,
        memoryGiB: vmShape.ramGB,
        retailPrice,
        currency,
        unit,
        pricingVersion
    };
};
const parseGcpCandidate = (serviceName, skuName, retailPrice, currency, unit, pricingVersion) => {
    const match = skuName.match(/^([^|]+)\|(linux|windows)\|vcpu=([0-9]+(?:\.[0-9]+)?)\|ramGiB=([0-9]+(?:\.[0-9]+)?)$/i);
    if (!match) {
        return null;
    }
    const vcpu = parseFloatSafe(match[3]);
    const memoryGiB = parseFloatSafe(match[4]);
    if (vcpu === null || memoryGiB === null) {
        return null;
    }
    return {
        serviceName,
        skuName,
        osType: match[2].toLowerCase() === "windows" ? "windows" : "linux",
        vcpu,
        memoryGiB,
        retailPrice,
        currency,
        unit,
        pricingVersion
    };
};
const getComputeServiceNames = (provider) => {
    switch (provider) {
        case "azure":
            return ["Virtual Machines"];
        case "aws":
            return ["AmazonEC2"];
        case "gcp":
            return ["Compute Engine VM"];
        default:
            return [];
    }
};
const parseCandidate = (provider, serviceName, skuName, retailPrice, currency, unit, pricingVersion) => {
    if (!Number.isFinite(retailPrice) || retailPrice <= 0) {
        return null;
    }
    switch (provider) {
        case "azure":
            return parseAzureCandidate(serviceName, skuName, retailPrice, currency, unit, pricingVersion);
        case "aws":
            return parseAwsCandidate(serviceName, skuName, retailPrice, currency, unit, pricingVersion);
        case "gcp":
            return parseGcpCandidate(serviceName, skuName, retailPrice, currency, unit, pricingVersion);
        default:
            return null;
    }
};
const matchComputeSku = async (input) => {
    const serviceNames = getComputeServiceNames(input.provider);
    let candidates = [];
    for (const serviceName of serviceNames) {
        const rows = await (0, cloud_pricing_repository_1.listLatestCloudPrices)(input.provider, input.region, serviceName);
        const parsed = rows
            .map((row) => parseCandidate(input.provider, row.serviceName, row.skuName, row.retailPrice, row.currency, row.unit, row.pricingVersion))
            .filter((row) => row !== null);
        candidates = candidates.concat(parsed);
    }
    if (input.osType) {
        candidates = candidates.filter((row) => row.osType === input.osType);
    }
    if (candidates.length === 0) {
        throw new http_error_util_1.HttpError(422, `No compute SKU catalog found for provider=${input.provider} region=${input.region}`);
    }
    const feasible = candidates
        .filter((row) => row.vcpu >= input.requiredCPU && row.memoryGiB >= input.requiredRAM)
        .map((row) => ({
        ...row,
        score: row.vcpu - input.requiredCPU + (row.memoryGiB - input.requiredRAM)
    }))
        .sort((a, b) => {
        if (a.score !== b.score) {
            return a.score - b.score;
        }
        if (a.retailPrice !== b.retailPrice) {
            return a.retailPrice - b.retailPrice;
        }
        if (a.vcpu !== b.vcpu) {
            return a.vcpu - b.vcpu;
        }
        return a.memoryGiB - b.memoryGiB;
    });
    if (feasible.length === 0) {
        const maxCpu = Math.max(...candidates.map((row) => row.vcpu));
        const maxRam = Math.max(...candidates.map((row) => row.memoryGiB));
        throw new http_error_util_1.HttpError(422, `No compute SKU can satisfy requested resources in provider=${input.provider} region=${input.region}. Requested CPU=${input.requiredCPU}, RAM=${input.requiredRAM} GiB, max available CPU=${maxCpu}, RAM=${maxRam} GiB`);
    }
    const best = feasible[0];
    return {
        provider: input.provider,
        region: input.region,
        serviceName: best.serviceName,
        skuName: best.skuName,
        osType: best.osType,
        vcpu: best.vcpu,
        memoryGiB: best.memoryGiB,
        retailPrice: best.retailPrice,
        currency: best.currency,
        unit: best.unit,
        pricingVersion: best.pricingVersion,
        score: best.score
    };
};
exports.matchComputeSku = matchComputeSku;
