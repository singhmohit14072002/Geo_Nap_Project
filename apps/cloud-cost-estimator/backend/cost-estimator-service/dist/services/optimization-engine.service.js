"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachOptimizationRecommendations = exports.generateOptimizationRecommendations = void 0;
const RESERVED_1Y_SAVINGS_RATE = 0.3;
const RESERVED_3Y_SAVINGS_RATE = 0.55;
const NETWORK_EGRESS_THRESHOLD_GB = 500;
const round2 = (value) => Number(value.toFixed(2));
const numberMeta = (meta, key) => {
    if (!meta || !(key in meta)) {
        return null;
    }
    const value = meta[key];
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
const boolMeta = (meta, key) => {
    if (!meta || !(key in meta)) {
        return null;
    }
    const value = meta[key];
    if (typeof value === "boolean") {
        return value;
    }
    if (typeof value === "string") {
        if (value.toLowerCase() === "true") {
            return true;
        }
        if (value.toLowerCase() === "false") {
            return false;
        }
    }
    return null;
};
const extractStorageTier = (value) => {
    if (!value) {
        return null;
    }
    const text = value.toLowerCase();
    if (/premium|gp3|ssd|ultra|io1|io2|provisioned/.test(text)) {
        return "premium";
    }
    if (/standard|hdd|lrs|capacity/.test(text)) {
        return "standard";
    }
    return null;
};
const buildRightSizingRecommendation = (result) => {
    const computeRows = result.details.filter((item) => item.serviceType === "compute");
    if (computeRows.length === 0) {
        return null;
    }
    let requiredCpuTotal = 0;
    let provisionedCpuTotal = 0;
    let requiredRamTotal = 0;
    let provisionedRamTotal = 0;
    computeRows.forEach((row) => {
        const qty = numberMeta(row.metadata, "quantity") ?? row.quantity ?? 1;
        const reqCpu = numberMeta(row.metadata, "requiredVcpu");
        const reqRam = numberMeta(row.metadata, "requiredRamGb");
        const provCpu = numberMeta(row.metadata, "provisionedVcpu");
        const provRam = numberMeta(row.metadata, "provisionedRamGb");
        if (reqCpu !== null && provCpu !== null && provCpu > 0) {
            requiredCpuTotal += reqCpu * qty;
            provisionedCpuTotal += provCpu * qty;
        }
        if (reqRam !== null && provRam !== null && provRam > 0) {
            requiredRamTotal += reqRam * qty;
            provisionedRamTotal += provRam * qty;
        }
    });
    if (provisionedCpuTotal <= 0 && provisionedRamTotal <= 0) {
        return null;
    }
    const cpuGap = provisionedCpuTotal > 0
        ? Math.max(0, 1 - requiredCpuTotal / provisionedCpuTotal)
        : 0;
    const ramGap = provisionedRamTotal > 0
        ? Math.max(0, 1 - requiredRamTotal / provisionedRamTotal)
        : 0;
    const maxGap = Math.max(cpuGap, ramGap);
    if (maxGap <= 0.3) {
        return null;
    }
    const savingsFactor = Math.min(0.4, maxGap * 0.6);
    const estimatedMonthlySavings = round2(result.breakdown.compute * savingsFactor);
    return {
        type: "RIGHT_SIZING",
        message: `Detected over-provisioning (CPU gap ${(cpuGap * 100).toFixed(0)}%, RAM gap ${(ramGap * 100).toFixed(0)}%). ` +
            "Use a smaller VM family/size to reduce unused compute capacity.",
        estimatedMonthlySavings
    };
};
const buildReservedInstanceRecommendations = (result) => {
    const computeRows = result.details.filter((item) => item.serviceType === "compute");
    if (computeRows.length === 0 || result.breakdown.compute <= 0) {
        return [];
    }
    const hoursPerMonth = numberMeta(computeRows[0].metadata, "hoursPerMonth") ?? 730;
    if (hoursPerMonth < 720) {
        return [];
    }
    return [
        {
            type: "RESERVED_INSTANCE",
            message: "Workload appears to run continuously (24x7). Consider 1-year reserved capacity to reduce compute spend.",
            estimatedMonthlySavings: round2(result.breakdown.compute * RESERVED_1Y_SAVINGS_RATE)
        },
        {
            type: "RESERVED_INSTANCE",
            message: "For long-lived workloads, 3-year reserved capacity provides deeper discounts than pay-as-you-go.",
            estimatedMonthlySavings: round2(result.breakdown.compute * RESERVED_3Y_SAVINGS_RATE)
        }
    ];
};
const buildStorageRecommendation = (result) => {
    const storageRows = result.details.filter((item) => item.serviceType === "storage");
    if (storageRows.length === 0 || result.breakdown.storage <= 0) {
        return null;
    }
    const hasPremium = storageRows.some((row) => {
        const metaTier = row.metadata?.storageTier;
        const tier = typeof metaTier === "string"
            ? metaTier.toLowerCase()
            : extractStorageTier(row.sku) ?? extractStorageTier(row.name);
        return tier === "premium";
    });
    const highIopsRequired = storageRows.some((row) => boolMeta(row.metadata, "highIopsRequired") === true);
    if (!hasPremium || highIopsRequired) {
        return null;
    }
    return {
        type: "STORAGE_OPTIMIZATION",
        message: "Premium storage is detected without a high-IOPS requirement. Downgrade to a standard tier for lower cost.",
        estimatedMonthlySavings: round2(result.breakdown.storage * 0.2)
    };
};
const buildNetworkRecommendation = (result) => {
    const networkRow = result.details.find((item) => item.serviceType === "network-egress");
    if (!networkRow || result.breakdown.networkEgress <= 0) {
        return null;
    }
    const dataEgressGb = numberMeta(networkRow.metadata, "dataEgressGb") ??
        numberMeta(networkRow.metadata, "dataEgressGB") ??
        null;
    if (dataEgressGb === null || dataEgressGb <= NETWORK_EGRESS_THRESHOLD_GB) {
        return null;
    }
    return {
        type: "NETWORK_OPTIMIZATION",
        message: `Data egress is high (${dataEgressGb.toFixed(0)} GB). Consider co-locating data and compute, CDN/cache layers, or reducing cross-region transfer.`,
        estimatedMonthlySavings: round2(result.breakdown.networkEgress * 0.15)
    };
};
const buildProviderRecommendations = (result) => {
    const recommendations = [];
    const rightSizing = buildRightSizingRecommendation(result);
    if (rightSizing) {
        recommendations.push(rightSizing);
    }
    recommendations.push(...buildReservedInstanceRecommendations(result));
    const storage = buildStorageRecommendation(result);
    if (storage) {
        recommendations.push(storage);
    }
    const network = buildNetworkRecommendation(result);
    if (network) {
        recommendations.push(network);
    }
    return {
        provider: result.provider,
        recommendations
    };
};
const generateOptimizationRecommendations = (results) => {
    return results.map((result) => buildProviderRecommendations(result));
};
exports.generateOptimizationRecommendations = generateOptimizationRecommendations;
const attachOptimizationRecommendations = (results) => {
    const recommendations = (0, exports.generateOptimizationRecommendations)(results);
    const byProvider = new Map(recommendations.map((item) => [item.provider, item]));
    return results.map((result) => ({
        ...result,
        optimization: byProvider.get(result.provider) ?? {
            provider: result.provider,
            recommendations: []
        }
    }));
};
exports.attachOptimizationRecommendations = attachOptimizationRecommendations;
