"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractServicePricingParameters = void 0;
const toLower = (value) => (value ?? "").toLowerCase().trim();
const parsePositiveInt = (value) => {
    if (!value) {
        return undefined;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return undefined;
    }
    return Math.round(parsed);
};
const normalizeSku = (value) => {
    if (!value) {
        return undefined;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
};
const mapServiceName = (classification, serviceType) => {
    const serviceTypeLower = toLower(serviceType);
    if (classification === "COMPUTE_VM") {
        return "Virtual Machines";
    }
    if (classification === "STORAGE_DISK") {
        return "Storage";
    }
    if (classification === "NETWORK_GATEWAY") {
        if (serviceTypeLower.includes("nat")) {
            return "Virtual Network";
        }
        return "Application Gateway";
    }
    if (classification === "NETWORK_EGRESS") {
        return "Bandwidth";
    }
    if (classification === "BACKUP") {
        return "Recovery Services";
    }
    if (classification === "AUTOMATION") {
        return "Automation";
    }
    if (classification === "MONITORING") {
        return "Azure Monitor";
    }
    if (classification === "LOGIC_APPS") {
        return "Logic Apps";
    }
    return serviceType?.trim() || "Unknown Service";
};
const extractComputeParameters = (description) => {
    const skuMatch = description.match(/\b(F\d+[a-zA-Z0-9]*)\b/i);
    const fallbackSkuMatch = description.match(/\b([FGDE][0-9]+[a-zA-Z0-9._-]*)\b/i);
    const quantityMatch = description.match(/^(\d+)\s/);
    const hoursMatch = description.match(/(\d+)\s*Hours/i);
    const lower = description.toLowerCase();
    let osType;
    if (lower.includes("windows")) {
        osType = "windows";
    }
    else if (lower.includes("linux")) {
        osType = "linux";
    }
    return {
        skuName: normalizeSku(skuMatch?.[1] ?? fallbackSkuMatch?.[1]),
        quantity: parsePositiveInt(quantityMatch?.[1]),
        hours: parsePositiveInt(hoursMatch?.[1]),
        osType
    };
};
const extractStorageParameters = (description) => {
    const diskTypeMatch = description.match(/\b(P\d+)\b/i);
    const quantityMatch = description.match(/(\d+)\s*Disk/i);
    return {
        skuName: normalizeSku(diskTypeMatch?.[1]?.toUpperCase()),
        quantity: parsePositiveInt(quantityMatch?.[1])
    };
};
const extractEgressParameters = (description) => {
    const gbMatch = description.match(/(\d+)\s*GB/i);
    return {
        usageGB: parsePositiveInt(gbMatch?.[1])
    };
};
const extractServicePricingParameters = (input) => {
    const serviceName = mapServiceName(input.classification, input.serviceType);
    const description = input.description?.trim() ?? "";
    const base = {
        serviceName
    };
    if (!description) {
        return base;
    }
    if (input.classification === "COMPUTE_VM") {
        return {
            ...base,
            ...extractComputeParameters(description)
        };
    }
    if (input.classification === "STORAGE_DISK") {
        return {
            ...base,
            ...extractStorageParameters(description)
        };
    }
    if (input.classification === "NETWORK_EGRESS") {
        return {
            ...base,
            ...extractEgressParameters(description)
        };
    }
    return base;
};
exports.extractServicePricingParameters = extractServicePricingParameters;
