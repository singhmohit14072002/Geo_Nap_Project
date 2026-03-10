"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractAzurePricingParams = void 0;
const normalizeRegion = (value) => value.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9-]/g, "") || "centralindia";
const parseNumber = (text, fallback = 0) => {
    const match = text.match(/(\d+(?:\.\d+)?)/);
    return match ? Number(match[1]) : fallback;
};
const parseHours = (text, fallback = 730) => {
    const hours = parseNumber(text, fallback);
    return hours > 0 ? hours : fallback;
};
const toArmSku = (raw) => {
    const cleaned = raw.trim().replace(/\s+/g, "_");
    if (/^standard_/i.test(cleaned))
        return cleaned.replace(/^standard_/i, "Standard_");
    return `Standard_${cleaned}`;
};
const extractAzurePricingParams = (row, type) => {
    const desc = row.description || "";
    const region = normalizeRegion(row.region);
    let quantity = parseNumber(desc, 1);
    if (quantity <= 0)
        quantity = 1;
    const hours = parseHours(desc, 730);
    if (type === "COMPUTE_VM") {
        const skuMatch = desc.match(/([a-z]\d+[a-z0-9._-]*(?:v\d+)?)/i) ||
            desc.match(/([a-z]\d+as?\s*v?\d*)/i);
        const rawSku = skuMatch ? skuMatch[1].replace(/\s+/g, "") : "F2s";
        const osType = desc.toLowerCase().includes("windows") ? "windows" : "linux";
        return {
            serviceName: "Virtual Machines",
            armSkuName: toArmSku(rawSku),
            region,
            quantity,
            hours,
            osType
        };
    }
    if (type === "STORAGE_DISK") {
        const skuMatch = desc.match(/(p\d{1,2})/i);
        const skuName = skuMatch ? skuMatch[1].toUpperCase() : "P10";
        return {
            serviceName: "Managed Disks",
            skuName,
            region,
            quantity
        };
    }
    if (type === "BANDWIDTH" || type === "VIRTUAL_NETWORK") {
        const usageGB = parseNumber(desc, 0);
        return {
            serviceName: "Bandwidth",
            region,
            usageGB
        };
    }
    if (type === "APPLICATION_GATEWAY") {
        return {
            serviceName: "Application Gateway",
            region,
            quantity,
            hours
        };
    }
    if (type === "NAT_GATEWAY") {
        return {
            serviceName: "Azure NAT Gateway",
            region,
            quantity,
            hours
        };
    }
    if (type === "BACKUP") {
        const usageGB = parseNumber(desc, 0);
        return {
            serviceName: "Backup",
            region,
            usageGB
        };
    }
    if (type === "AUTOMATION") {
        return {
            serviceName: "Automation",
            region,
            quantity,
            hours
        };
    }
    if (type === "LOGIC_APPS") {
        return {
            serviceName: "Logic Apps",
            region,
            quantity,
            hours
        };
    }
    // Fallback
    return {
        serviceName: row.serviceType || row.serviceCategory || "Other",
        region,
        quantity
    };
};
exports.extractAzurePricingParams = extractAzurePricingParams;
