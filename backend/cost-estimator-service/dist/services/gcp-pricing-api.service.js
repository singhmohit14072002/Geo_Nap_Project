"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchAndNormalizeGcpPricingRows = void 0;
const billing_1 = require("@google-cloud/billing");
const google_auth_library_1 = require("google-auth-library");
const gcp_region_mapper_1 = require("../utils/gcp-region-mapper");
const GCP_BILLING_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const parseJsonEnv = (raw) => {
    if (!raw || raw.trim().length === 0) {
        return null;
    }
    try {
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
};
const createGcpBillingClient = async () => {
    const inlineCredentials = parseJsonEnv(process.env.GCP_SERVICE_ACCOUNT_JSON);
    const auth = new google_auth_library_1.GoogleAuth({
        scopes: [GCP_BILLING_SCOPE],
        credentials: inlineCredentials ?? undefined
    });
    // Validate credentials early. If this fails, caller should degrade gracefully.
    await auth.getClient();
    const options = {};
    if (inlineCredentials) {
        options.credentials = inlineCredentials;
    }
    return new billing_1.CloudCatalogClient(options);
};
const parsePriceFromSku = (sku) => {
    const pricingInfos = sku.pricingInfo ?? [];
    if (pricingInfos.length === 0) {
        return null;
    }
    let best = null;
    for (const info of pricingInfos) {
        const expression = info.pricingExpression ?? {};
        const usageUnit = String(expression.usageUnit ?? "unit");
        const tieredRates = expression.tieredRates ?? [];
        for (const tier of tieredRates) {
            const startUsageAmount = Number(tier.startUsageAmount ?? 0);
            const unitPrice = tier.unitPrice ?? {};
            const units = Number(unitPrice.units ?? 0);
            const nanos = Number(unitPrice.nanos ?? 0);
            const currencyCode = String(unitPrice.currencyCode ?? "USD").toUpperCase();
            const usd = units + nanos / 1e9;
            // We use first-tier (start=0) and positive price for deterministic calculator behavior.
            if (!Number.isFinite(usd) || usd <= 0 || startUsageAmount !== 0) {
                continue;
            }
            const candidate = {
                usd,
                currency: currencyCode,
                unit: usageUnit
            };
            if (best === null || candidate.usd < best.usd) {
                best = candidate;
            }
        }
    }
    return best;
};
const filterSkusByRegion = (skus, region) => {
    return skus.filter((sku) => {
        const serviceRegions = sku.serviceRegions ?? [];
        if (serviceRegions.includes(region)) {
            return true;
        }
        const geoTaxonomy = sku.geoTaxonomy ?? {};
        const regions = geoTaxonomy.regions ?? [];
        return regions.includes(region);
    });
};
const hasForbiddenKeywords = (text) => {
    const forbidden = [
        "preemptible",
        "spot",
        "commitment",
        "sole tenancy",
        "premium",
        "license",
        "snapshot",
        "interconnect",
        "vpn",
        "cdn",
        "free tier"
    ];
    return forbidden.some((word) => text.includes(word));
};
const pickCoreSku = (skus) => {
    const candidates = [];
    for (const sku of skus) {
        const category = sku.category ?? {};
        const usageType = String(category.usageType ?? "").toLowerCase();
        const resourceGroup = String(category.resourceGroup ?? "").toLowerCase();
        const description = String(sku.description ?? "");
        const text = description.toLowerCase();
        if (usageType !== "ondemand" || resourceGroup !== "cpu") {
            continue;
        }
        if (!text.includes("core")) {
            continue;
        }
        if (text.includes("windows") || hasForbiddenKeywords(text)) {
            continue;
        }
        const price = parsePriceFromSku(sku);
        if (!price) {
            continue;
        }
        candidates.push({
            skuName: String(sku.name ?? "core-linux-ondemand"),
            description,
            rate: price
        });
    }
    candidates.sort((a, b) => a.rate.usd - b.rate.usd);
    return candidates[0] ?? null;
};
const pickRamSku = (skus) => {
    const candidates = [];
    for (const sku of skus) {
        const category = sku.category ?? {};
        const usageType = String(category.usageType ?? "").toLowerCase();
        const resourceGroup = String(category.resourceGroup ?? "").toLowerCase();
        const description = String(sku.description ?? "");
        const text = description.toLowerCase();
        if (usageType !== "ondemand" || resourceGroup !== "ram") {
            continue;
        }
        if (!text.includes("ram")) {
            continue;
        }
        if (text.includes("windows") || hasForbiddenKeywords(text)) {
            continue;
        }
        const price = parsePriceFromSku(sku);
        if (!price) {
            continue;
        }
        candidates.push({
            skuName: String(sku.name ?? "ram-linux-ondemand"),
            description,
            rate: price
        });
    }
    candidates.sort((a, b) => a.rate.usd - b.rate.usd);
    return candidates[0] ?? null;
};
const pickDiskSku = (skus) => {
    const candidates = [];
    for (const sku of skus) {
        const category = sku.category ?? {};
        const usageType = String(category.usageType ?? "").toLowerCase();
        const resourceFamily = String(category.resourceFamily ?? "").toLowerCase();
        const description = String(sku.description ?? "");
        const text = description.toLowerCase();
        if (usageType !== "ondemand" || resourceFamily !== "storage") {
            continue;
        }
        const matchesDisk = text.includes("pd capacity") ||
            text.includes("persistent disk") ||
            text.includes("balanced pd");
        if (!matchesDisk || hasForbiddenKeywords(text)) {
            continue;
        }
        const price = parsePriceFromSku(sku);
        if (!price) {
            continue;
        }
        candidates.push({
            skuName: String(sku.name ?? "pd-balanced"),
            description,
            rate: price
        });
    }
    candidates.sort((a, b) => a.rate.usd - b.rate.usd);
    return candidates[0] ?? null;
};
const pickEgressSku = (skus) => {
    const candidates = [];
    for (const sku of skus) {
        const category = sku.category ?? {};
        const usageType = String(category.usageType ?? "").toLowerCase();
        const resourceFamily = String(category.resourceFamily ?? "").toLowerCase();
        const description = String(sku.description ?? "");
        const text = description.toLowerCase();
        if (usageType !== "ondemand" || resourceFamily !== "network") {
            continue;
        }
        const matchesEgress = text.includes("egress") && text.includes("internet");
        if (!matchesEgress || hasForbiddenKeywords(text)) {
            continue;
        }
        const price = parsePriceFromSku(sku);
        if (!price) {
            continue;
        }
        candidates.push({
            skuName: String(sku.name ?? "internet-egress"),
            description,
            rate: price
        });
    }
    candidates.sort((a, b) => a.rate.usd - b.rate.usd);
    return candidates[0] ?? null;
};
const GCP_COMPUTE_SHAPES = [
    { machineType: "n2-standard-2", vcpu: 2, ramGiB: 8 },
    { machineType: "n2-standard-4", vcpu: 4, ramGiB: 16 },
    { machineType: "n2-standard-8", vcpu: 8, ramGiB: 32 },
    { machineType: "n2-standard-16", vcpu: 16, ramGiB: 64 },
    { machineType: "n2-standard-32", vcpu: 32, ramGiB: 128 },
    { machineType: "n2-standard-64", vcpu: 64, ramGiB: 256 }
];
const loadComputeEngineSkus = async (client) => {
    const servicesRequest = {};
    let computeServiceName = null;
    for await (const service of client.listServicesAsync(servicesRequest)) {
        const displayName = String(service.displayName ?? "");
        if (displayName.toLowerCase() === "compute engine") {
            computeServiceName = String(service.name ?? "");
            break;
        }
    }
    const fallbackServiceName = "services/6F81-5844-456A";
    const parent = computeServiceName || fallbackServiceName;
    const skus = [];
    for await (const sku of client.listSkusAsync({ parent })) {
        skus.push(sku);
    }
    return skus;
};
const fetchAndNormalizeGcpPricingRows = async (rawRegion, pricingVersion) => {
    const region = (0, gcp_region_mapper_1.normalizeGcpRegion)(rawRegion);
    const regionCity = (0, gcp_region_mapper_1.getGcpRegionCity)(region);
    const client = await createGcpBillingClient();
    const allComputeSkus = await loadComputeEngineSkus(client);
    const regionSkus = filterSkusByRegion(allComputeSkus, region);
    console.log(`[pricing-sync] gcp region=${region} sku_total=${allComputeSkus.length} sku_region=${regionSkus.length} city=${regionCity ?? "n/a"}`);
    const core = pickCoreSku(regionSkus);
    const ram = pickRamSku(regionSkus);
    const disk = pickDiskSku(regionSkus);
    const egress = pickEgressSku(regionSkus);
    const rows = [];
    if (core) {
        rows.push({
            provider: "gcp",
            region,
            serviceName: "Compute Engine",
            skuName: "core-linux-ondemand",
            unit: core.rate.unit,
            retailPrice: core.rate.usd,
            currency: core.rate.currency,
            pricingVersion
        });
    }
    if (ram) {
        rows.push({
            provider: "gcp",
            region,
            serviceName: "Compute Engine",
            skuName: "ram-linux-ondemand",
            unit: ram.rate.unit,
            retailPrice: ram.rate.usd,
            currency: ram.rate.currency,
            pricingVersion
        });
    }
    if (core && ram) {
        for (const shape of GCP_COMPUTE_SHAPES) {
            const hourlyUsd = shape.vcpu * core.rate.usd + shape.ramGiB * ram.rate.usd;
            rows.push({
                provider: "gcp",
                region,
                serviceName: "Compute Engine VM",
                skuName: `${shape.machineType}|linux|vcpu=${shape.vcpu}|ramGiB=${shape.ramGiB}`,
                unit: "Hrs",
                retailPrice: hourlyUsd,
                currency: "USD",
                pricingVersion
            });
        }
    }
    if (disk) {
        rows.push({
            provider: "gcp",
            region,
            serviceName: "Persistent Disk",
            skuName: "pd-capacity",
            unit: disk.rate.unit,
            retailPrice: disk.rate.usd,
            currency: disk.rate.currency,
            pricingVersion
        });
    }
    if (egress) {
        rows.push({
            provider: "gcp",
            region,
            serviceName: "Network Egress",
            skuName: "internet-egress",
            unit: egress.rate.unit,
            retailPrice: egress.rate.usd,
            currency: egress.rate.currency,
            pricingVersion
        });
    }
    if (rows.length === 0) {
        console.warn(`[pricing-sync] gcp region=${region} normalized rows are empty; no valid SKU matches found`);
    }
    return rows;
};
exports.fetchAndNormalizeGcpPricingRows = fetchAndNormalizeGcpPricingRows;
