"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractAzureService = void 0;
const logger_1 = __importDefault(require("../utils/logger"));
const normalizeRegion = (value) => value.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9-]/g, "") || "centralindia";
const parseNumber = (text, fallback = 0) => {
    const m = text.match(/(\d+(?:\.\d+)?)/);
    return m ? Number(m[1]) : fallback;
};
const parseHours = (text, fallback = 730) => {
    const explicit = text.match(/(\d+(?:\.\d+)?)\s*hour/i);
    const hours = explicit ? Number(explicit[1]) : parseNumber(text, fallback);
    return hours > 0 ? hours : fallback;
};
const extractSku = (text, fallback = "F2s") => {
    const m = text.match(/([a-z]\d+[a-z0-9._-]*(?:v\d+)?)/i) ||
        text.match(/([a-z]\d+as?\s*v?\d*)/i);
    return (m ? m[1] : fallback).replace(/\s+/g, "");
};
const toArmSku = (raw) => {
    const cleaned = raw.trim().replace(/\s+/g, "_");
    if (/^standard_/i.test(cleaned))
        return cleaned.replace(/^standard_/i, "Standard_");
    return `Standard_${cleaned}`;
};
const extractAzureService = (row) => {
    const type = row.serviceType.toLowerCase();
    const desc = row.description || "";
    const region = normalizeRegion(row.region);
    const cat = row.serviceCategory.toLowerCase();
    if (!type && !cat)
        return null;
    if (cat.includes("support") || cat.includes("disclaimer") || cat.includes("billing"))
        return null;
    // Rule 1: Virtual Machines
    if (type.includes("virtual machine")) {
        const armSku = toArmSku(extractSku(desc));
        const qtyMatch = desc.match(/(\d+)\s*F/i);
        const quantity = Math.max(1, qtyMatch ? Number(qtyMatch[1]) : parseNumber(desc, 1));
        const hours = parseHours(desc, 730);
        const osType = desc.toLowerCase().includes("windows") ? "windows" : "linux";
        const usageQuantity = quantity * hours;
        // TEMP debug to verify VM hours * qty
        // eslint-disable-next-line no-console
        console.log("VM usageQuantity:", { armSku, quantity, hours, usageQuantity, region, osType });
        logger_1.default.info("AZURE_SERVICE_EXTRACTED", {
            serviceType: "VM",
            armSku,
            quantity,
            hours,
            usageQuantity,
            region,
            osType
        });
        return {
            serviceName: "Virtual Machines",
            armSkuName: armSku,
            region,
            usageQuantity,
            unitType: "Hour",
            osType
        };
    }
    // Rule 2: Managed Disks
    if (type.includes("managed disks") || type.includes("managed disk")) {
        const tierMatch = desc.match(/(p\d{1,2})/i);
        const skuName = tierMatch ? tierMatch[1].toUpperCase() : "P10";
        const diskQtyMatch = desc.match(/(\d+)\s*disks?/i);
        const quantity = Math.max(1, diskQtyMatch ? Number(diskQtyMatch[1]) : parseNumber(desc, 1));
        logger_1.default.info("AZURE_SERVICE_EXTRACTED", { serviceType: "Disk", skuName, quantity, region });
        return {
            // Azure Retail API uses serviceName "Storage" and armSkuName like "Premium_SSD_Managed_Disk_P10"
            serviceName: "Storage",
            armSkuName: `Premium_SSD_Managed_Disk_${skuName}`,
            region,
            usageQuantity: quantity,
            unitType: "Month"
        };
    }
    // Rule 3: Bandwidth / Outbound
    if (type.includes("bandwidth") || type.includes("outbound") || type.includes("data transfer")) {
        const usageGB = parseNumber(desc, 0);
        logger_1.default.info("AZURE_SERVICE_EXTRACTED", { serviceType: "Bandwidth", usageGB, region });
        return {
            serviceName: "Bandwidth",
            region,
            usageQuantity: usageGB,
            unitType: "GB"
        };
    }
    // Rule 4: Application Gateway
    if (type.includes("application gateway")) {
        const hours = parseHours(desc, 730);
        const quantity = Math.max(1, parseNumber(desc, 1));
        logger_1.default.info("AZURE_SERVICE_EXTRACTED", { serviceType: "Application Gateway", quantity, hours, region });
        return {
            serviceName: "Application Gateway",
            region,
            usageQuantity: quantity * hours,
            unitType: "Hour"
        };
    }
    // Rule 5: NAT Gateway
    if (type.includes("nat gateway")) {
        const hours = parseHours(desc, 730);
        const quantity = Math.max(1, parseNumber(desc, 1));
        logger_1.default.info("AZURE_SERVICE_EXTRACTED", { serviceType: "NAT Gateway", quantity, hours, region });
        return {
            serviceName: "Azure NAT Gateway",
            region,
            usageQuantity: quantity * hours,
            unitType: "Hour"
        };
    }
    if (type.includes("virtual network")) {
        const usageGB = parseNumber(desc, 0);
        logger_1.default.info("AZURE_SERVICE_EXTRACTED", { serviceType: "Virtual Network", usageGB, region });
        return {
            serviceName: "Virtual Network",
            region,
            usageQuantity: usageGB,
            unitType: "GB"
        };
    }
    // Rule 6: Generic fallback
    const qty = Math.max(1, parseNumber(desc, 1));
    const unitMatch = desc.toLowerCase().match(/\b(hour|hr|gb|month|mo)\b/);
    const unitType = unitMatch ? unitMatch[1].toLowerCase() : "unit";
    const usageQuantity = unitType.includes("hour") ? qty * parseHours(desc, 730) : qty;
    logger_1.default.info("AZURE_SERVICE_EXTRACTED", { serviceType: row.serviceType, unitType, usageQuantity, region });
    return {
        serviceName: row.serviceType || row.serviceCategory || "Other",
        region,
        usageQuantity,
        unitType
    };
};
exports.extractAzureService = extractAzureService;
