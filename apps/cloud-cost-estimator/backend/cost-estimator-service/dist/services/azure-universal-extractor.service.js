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
const parseLocalizedNumber = (value) => {
    const cleaned = value.replace(/[^0-9.,-]/g, "").replace(/,/g, "");
    if (!cleaned)
        return undefined;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : undefined;
};
const parseMonthlyCostFromDescription = (text) => {
    if (!text)
        return undefined;
    const patterns = [
        /upfront\s*:\s*[^\n\r]*?monthly\s*:\s*[^\d]*([\d,]+(?:\.\d+)?)/i,
        /estimated\s+monthly\s+cost\s*[:=]?\s*[^\d]*([\d,]+(?:\.\d+)?)/i,
        /monthly\s+cost\s*[:=]?\s*[^\d]*([\d,]+(?:\.\d+)?)/i,
        /monthly\s*[:=]\s*[^\d]*([\d,]+(?:\.\d+)?)/i
    ];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (!match?.[1])
            continue;
        const parsed = parseLocalizedNumber(match[1]);
        if (parsed !== undefined)
            return parsed;
    }
    return undefined;
};
const parseHours = (text, fallback = 730) => {
    // Only treat a number as hours if the description explicitly mentions hours/hrs
    const explicit = text.match(/(\d+(?:\.\d+)?)\s*(?:hour|hr|hrs)/i);
    if (explicit) {
        const hours = Number(explicit[1]);
        return hours > 0 ? hours : fallback;
    }
    return fallback;
};
const parseRegionFromText = (text) => {
    const m = text.match(/([A-Za-z]+(?:\s+[A-Za-z]+)*)\s+India/i);
    if (!m?.[0])
        return null;
    return normalizeRegion(m[0]);
};
const extractSku = (text, fallback = "F2s") => {
    const m = text.match(/([a-z]\d+[a-z0-9._-]*(?:\s*v\d+)?)/i);
    return m ? m[1].trim().replace(/\s+/g, "_") : fallback;
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
    const sourceMonthlyCost = typeof row.estimatedMonthlyCost === "number" && Number.isFinite(row.estimatedMonthlyCost)
        ? row.estimatedMonthlyCost
        : parseMonthlyCostFromDescription(desc);
    const cat = row.serviceCategory.toLowerCase();
    if (!type && !cat)
        return null;
    if (!type && sourceMonthlyCost === undefined)
        return null;
    if (cat.includes("support") || cat.includes("disclaimer") || cat.includes("billing"))
        return null;
    if (cat.includes("http://") || cat.includes("https://"))
        return null;
    if (!type && (cat.includes("total") || row.region.toLowerCase() === "total"))
        return null;
    // Rule 1: Virtual Machines
    if (type.includes("virtual machine")) {
        const armSku = toArmSku(extractSku(desc));
        const qtyMatch = desc.match(/(\d+)\s*[a-z]/i);
        const quantity = Math.max(1, qtyMatch ? Number(qtyMatch[1]) : 1);
        const hours = parseHours(desc, 730);
        const osType = desc.toLowerCase().includes("windows") ? "windows" : "linux";
        const usageQuantity = quantity * hours;
        const diskMatch = desc.match(/(\d+)\s*managed\s*disks?\s*[–-]\s*([a-z]\d+)/i);
        const attachedDiskCount = diskMatch ? Number(diskMatch[1]) : 0;
        const attachedDiskSku = diskMatch ? diskMatch[2].toUpperCase() : undefined;
        const interRegionMatch = desc.match(/inter\s+region\s+transfer[^,;]*,\s*(\d+(?:\.\d+)?)\s*gb\s*outbound/i);
        const interRegionEgressGB = interRegionMatch ? Number(interRegionMatch[1]) : 0;
        logger_1.default.info("AZURE_SERVICE_EXTRACTED", {
            serviceType: "VM",
            armSku,
            quantity,
            hours,
            usageQuantity,
            region,
            osType,
            attachedDiskSku,
            attachedDiskCount,
            interRegionEgressGB
        });
        return {
            serviceName: "Virtual Machines",
            displayName: row.serviceType || "Virtual Machines",
            armSkuName: armSku,
            region,
            usageQuantity,
            unitType: "Hour",
            osType,
            attachedDiskSku,
            attachedDiskCount,
            interRegionEgressGB,
            ...(sourceMonthlyCost !== undefined ? { sourceMonthlyCost } : {})
        };
    }
    // Rule 2: Managed Disks
    if (type.includes("managed disks") || type.includes("managed disk")) {
        const tierMatch = desc.match(/(p\d{1,2})/i);
        const skuName = tierMatch ? tierMatch[1].toUpperCase() : "P10";
        const redundancy = desc.match(/\b(zrs|lrs)\b/i)?.[1]?.toUpperCase();
        const diskQtyMatch = desc.match(/disk\s*type\s*(\d+)\s*disks?/i) ?? desc.match(/(\d+)\s*disks?/i);
        const quantity = Math.max(1, diskQtyMatch ? Number(diskQtyMatch[1]) : parseNumber(desc, 1));
        logger_1.default.info("AZURE_SERVICE_EXTRACTED", { serviceType: "Disk", skuName, quantity, region });
        return {
            // Azure Retail API uses serviceName "Storage" and armSkuName like "Premium_SSD_Managed_Disk_P10"
            serviceName: "Storage",
            displayName: "Managed Disks",
            armSkuName: `Premium_SSD_Managed_Disks_${skuName}`,
            region,
            usageQuantity: quantity,
            unitType: "Month",
            quantity,
            ...(redundancy ? { diskRedundancy: redundancy } : {}),
            ...(sourceMonthlyCost !== undefined ? { sourceMonthlyCost } : {})
        };
    }
    // Rule 3: Bandwidth / Outbound
    if (type.includes("bandwidth") || type.includes("outbound") || type.includes("data transfer")) {
        const usageMatch = desc.match(/(\d+(?:\.\d+)?)\s*gb\s*(?:outbound|data transfer|egress)/i);
        const usageGB = usageMatch ? Number(usageMatch[1]) : parseNumber(desc, 0);
        const routingPreference = desc.toLowerCase().includes("microsoft global network") ? "MGN" : "INTERNET";
        logger_1.default.info("AZURE_SERVICE_EXTRACTED", { serviceType: "Bandwidth", usageGB, region, routingPreference });
        return {
            serviceName: "Bandwidth",
            displayName: row.serviceType || "Bandwidth",
            region,
            usageQuantity: usageGB,
            unitType: "GB",
            routingPreference,
            ...(sourceMonthlyCost !== undefined ? { sourceMonthlyCost } : {})
        };
    }
    // Rule 4: Application Gateway
    if (type.includes("application gateway")) {
        const hours = parseHours(desc, 730);
        const qtyMatch = desc.match(/(\d+)\s*(?:gateway|instance|unit)/i);
        const quantity = Math.max(1, qtyMatch ? Number(qtyMatch[1]) : 1);
        const capacityMatch = desc.match(/(\d+(?:\.\d+)?)\s*compute units?/i);
        const capacityUnits = capacityMatch ? Number(capacityMatch[1]) : 1;
        const dataMatch = desc.match(/(\d+(?:\.\d+)?)\s*gb\s*data transfer/i);
        const dataProcessedGB = dataMatch ? Number(dataMatch[1]) : 0;
        const lower = desc.toLowerCase();
        const meterName = lower.includes("waf v2")
            ? "WAF v2"
            : lower.includes("standard v2")
                ? "Standard v2"
                : lower.includes("basic v2")
                    ? "Basic v2"
                    : undefined;
        logger_1.default.info("AZURE_SERVICE_EXTRACTED", {
            serviceType: "Application Gateway",
            quantity,
            hours,
            capacityUnits,
            dataProcessedGB,
            region
        });
        return {
            serviceName: "Application Gateway",
            displayName: "Application Gateway",
            ...(meterName ? { meterName } : {}),
            region,
            usageQuantity: quantity * hours,
            unitType: "Hour",
            quantity,
            hours,
            capacityUnits,
            dataProcessedGB,
            ...(sourceMonthlyCost !== undefined ? { sourceMonthlyCost } : {})
        };
    }
    // Rule 5: NAT Gateway
    if (type.includes("nat gateway")) {
        const hours = parseHours(desc, 730);
        const qtyMatch = desc.match(/(\d+)\s*(?:gateway|instance|unit)/i);
        const quantity = Math.max(1, qtyMatch ? Number(qtyMatch[1]) : 1);
        logger_1.default.info("AZURE_SERVICE_EXTRACTED", { serviceType: "NAT Gateway", quantity, hours, region });
        return {
            serviceName: "Azure NAT Gateway",
            displayName: "Azure NAT Gateway",
            region,
            usageQuantity: quantity * hours,
            unitType: "Hour",
            quantity,
            hours,
            ...(sourceMonthlyCost !== undefined ? { sourceMonthlyCost } : {})
        };
    }
    if (type.includes("virtual network")) {
        let usageGB = parseNumber(desc, 0);
        const vnetMatch = desc.match(/([A-Za-z]+(?:\s+[A-Za-z]+)*)\s*\(virtual\s+network\s*\d+\)\s*:\s*(\d+(?:\.\d+)?)\s*gb\s*outbound/i);
        const extractedRegion = vnetMatch?.[1] ? normalizeRegion(vnetMatch[1]) : parseRegionFromText(desc);
        if (vnetMatch?.[2])
            usageGB = Number(vnetMatch[2]);
        logger_1.default.info("AZURE_SERVICE_EXTRACTED", {
            serviceType: "Virtual Network",
            usageGB,
            region,
            extractedRegion
        });
        return {
            serviceName: "Virtual Network",
            displayName: "Virtual Network",
            region: extractedRegion ?? region,
            usageQuantity: usageGB,
            unitType: "GB",
            pricingHint: "INTER_REGION",
            ...(sourceMonthlyCost !== undefined ? { sourceMonthlyCost } : {})
        };
    }
    if (type.includes("automation")) {
        // Azure Automation is billed in minutes with 500 free minutes
        const included = desc.match(/(\d+(?:\.\d+)?)\s*included\s+minutes/i);
        const additional = desc.match(/(\d+(?:\.\d+)?)\s*additional\s+minutes/i);
        const includedMinutes = included ? Number(included[1]) : 0;
        const additionalMinutes = additional ? Number(additional[1]) : 0;
        const minutes = includedMinutes + additionalMinutes;
        const usageMinutes = minutes > 0 ? minutes : parseNumber(desc, 0);
        const watcherCount = parseNumber(desc.match(/(\d+(?:\.\d+)?)\s*watchers?/i)?.[0] ?? "", 1);
        const watcherHours = parseHours(desc, 730) * Math.max(1, watcherCount);
        logger_1.default.info("AZURE_SERVICE_EXTRACTED", {
            serviceType: "Automation",
            usageMinutes,
            additionalMinutes,
            watcherHours,
            region
        });
        return {
            serviceName: "Automation",
            displayName: "Automation",
            region,
            usageQuantity: usageMinutes,
            unitType: "Minute",
            additionalMinutes,
            watcherHours,
            ...(sourceMonthlyCost !== undefined ? { sourceMonthlyCost } : {})
        };
    }
    if (type.includes("azure backup") || type === "backup") {
        const instancesMatch = desc.match(/(\d+(?:\.\d+)?)\s*instance\(s\)/i);
        const instances = instancesMatch ? Number(instancesMatch[1]) : 1;
        const sizeTbMatch = desc.match(/instance\(s\)\s*x\s*(\d+(?:\.\d+)?)\s*tb/i);
        const backupInstanceSizeTB = sizeTbMatch ? Number(sizeTbMatch[1]) : 0;
        const dataMatch = desc.match(/([\d,]+(?:\.\d+)?)\s*gb\s*average monthly backup data/i);
        const backupDataGB = dataMatch?.[1] ? parseLocalizedNumber(dataMatch[1]) ?? 0 : 0;
        const redundancy = desc.match(/\b(zrs|lrs|grs|ra-grs)\b/i)?.[1]?.toUpperCase();
        logger_1.default.info("AZURE_SERVICE_EXTRACTED", {
            serviceType: "Azure Backup",
            instances,
            backupInstanceSizeTB,
            backupDataGB,
            region
        });
        return {
            serviceName: "Backup",
            displayName: "Azure Backup",
            region,
            usageQuantity: Math.max(1, instances),
            unitType: "Month",
            quantity: Math.max(1, instances),
            backupDataGB,
            backupInstanceSizeTB,
            ...(redundancy ? { diskRedundancy: redundancy } : {}),
            ...(sourceMonthlyCost !== undefined ? { sourceMonthlyCost } : {})
        };
    }
    if (type.includes("defender for cloud")) {
        const plan2Match = desc.match(/(\d+(?:\.\d+)?)\s*plan\s*2\s*servers?\s*x\s*(\d+(?:\.\d+)?)\s*hours?/i);
        const plan2Servers = plan2Match ? Number(plan2Match[1]) : 0;
        const hours = plan2Match ? Number(plan2Match[2]) : parseHours(desc, 730);
        logger_1.default.info("AZURE_SERVICE_EXTRACTED", {
            serviceType: "Defender for Cloud",
            plan2Servers,
            hours,
            region
        });
        return {
            serviceName: "Microsoft Defender for Cloud",
            displayName: "Microsoft Defender for Cloud",
            region,
            usageQuantity: Math.max(0, plan2Servers * hours),
            unitType: "Hour",
            defenderPlan2Servers: plan2Servers,
            defenderHours: hours,
            ...(sourceMonthlyCost !== undefined ? { sourceMonthlyCost } : {})
        };
    }
    if (type.includes("ip addresses")) {
        const staticMatch = desc.match(/(\d+(?:\.\d+)?)\s*static\s*ip\s*addresses?\s*x\s*(\d+(?:\.\d+)?)\s*hours?/i);
        const prefixMatch = desc.match(/(\d+(?:\.\d+)?)\s*public\s*ip\s*prefixes?\s*x\s*(\d+(?:\.\d+)?)\s*hours?/i);
        const staticIpCount = staticMatch ? Number(staticMatch[1]) : 0;
        const staticIpHours = staticMatch ? Number(staticMatch[2]) : 730;
        const publicIpPrefixCount = prefixMatch ? Number(prefixMatch[1]) : 0;
        logger_1.default.info("AZURE_SERVICE_EXTRACTED", {
            serviceType: "IP Addresses",
            staticIpCount,
            staticIpHours,
            publicIpPrefixCount,
            region
        });
        return {
            serviceName: "IP Addresses",
            displayName: "IP Addresses",
            region,
            usageQuantity: Math.max(0, staticIpCount * staticIpHours),
            unitType: "Hour",
            staticIpCount,
            staticIpHours,
            publicIpPrefixCount,
            ...(sourceMonthlyCost !== undefined ? { sourceMonthlyCost } : {})
        };
    }
    if (type.includes("load balancer")) {
        const ruleMatch = desc.match(/(\d+(?:\.\d+)?)\s*rules?/i);
        const dataMatch = desc.match(/(\d+(?:\.\d+)?)\s*gb\s*data\s*processed/i);
        const lbRuleCount = ruleMatch ? Number(ruleMatch[1]) : 0;
        const lbDataProcessedGB = dataMatch ? Number(dataMatch[1]) : 0;
        logger_1.default.info("AZURE_SERVICE_EXTRACTED", {
            serviceType: "Load Balancer",
            lbRuleCount,
            lbDataProcessedGB,
            region
        });
        return {
            serviceName: "Load Balancer",
            displayName: "Load Balancer",
            region,
            usageQuantity: Math.max(0, lbRuleCount),
            unitType: "Month",
            lbRuleCount,
            lbDataProcessedGB,
            ...(sourceMonthlyCost !== undefined ? { sourceMonthlyCost } : {})
        };
    }
    if (type.includes("front door")) {
        const tier = desc.toLowerCase().includes("premium") ? "Premium" : "Standard";
        const outMatch = desc.match(/(\d+(?:\.\d+)?)\s*gb\s*data\s*transfer\s*out\s*to\s*client/i);
        const inMatch = desc.match(/(\d+(?:\.\d+)?)\s*gb\s*data\s*transfer\s*in\s*to\s*origin/i);
        const reqMatch = desc.match(/(\d+(?:\.\d+)?)\s*x\s*10,?0000?\s*requests?/i);
        const frontDoorOutGB = outMatch ? Number(outMatch[1]) : 0;
        const frontDoorInGB = inMatch ? Number(inMatch[1]) : 0;
        const frontDoorRequestUnits = reqMatch ? Number(reqMatch[1]) : 0;
        logger_1.default.info("AZURE_SERVICE_EXTRACTED", {
            serviceType: "Azure Front Door",
            tier,
            frontDoorOutGB,
            frontDoorInGB,
            frontDoorRequestUnits
        });
        return {
            serviceName: "Azure Front Door",
            displayName: "Azure Front Door",
            region,
            usageQuantity: 1,
            unitType: "Month",
            frontDoorTier: tier,
            frontDoorOutGB,
            frontDoorInGB,
            frontDoorRequestUnits,
            ...(sourceMonthlyCost !== undefined ? { sourceMonthlyCost } : {})
        };
    }
    if (type.includes("azure monitor")) {
        const basicLogsMatch = desc.match(/(\d+(?:\.\d+)?)\s*gb\s*daily\s*basic\s*logs/i);
        const resourcesMatch = desc.match(/(\d+(?:\.\d+)?)\s*resources?\s*monitored\s*x\s*(\d+(?:\.\d+)?)\s*metrics?\s*time-series/i);
        const basicLogsGBPerDay = basicLogsMatch ? Number(basicLogsMatch[1]) : 0;
        const alertResources = resourcesMatch ? Number(resourcesMatch[1]) : 0;
        const alertTimeSeriesPerResource = resourcesMatch ? Number(resourcesMatch[2]) : 0;
        logger_1.default.info("AZURE_SERVICE_EXTRACTED", {
            serviceType: "Azure Monitor",
            basicLogsGBPerDay,
            alertResources,
            alertTimeSeriesPerResource,
            region
        });
        return {
            serviceName: "Azure Monitor",
            displayName: "Azure Monitor",
            region,
            usageQuantity: 1,
            unitType: "Month",
            basicLogsGBPerDay,
            alertResources,
            alertTimeSeriesPerResource,
            ...(sourceMonthlyCost !== undefined ? { sourceMonthlyCost } : {})
        };
    }
    if (type.includes("logic apps") || type.includes("logic app")) {
        const wsMatch = desc.match(/(\d+(?:\.\d+)?)\s*ws1/i);
        const quantity = Math.max(1, wsMatch ? Number(wsMatch[1]) : 1);
        const vCoreMatch = desc.match(/(\d+(?:\.\d+)?)\s*vcores?/i);
        const ramMatch = desc.match(/(\d+(?:\.\d+)?)\s*gb\s*ram/i);
        const vCores = vCoreMatch ? Number(vCoreMatch[1]) : 1;
        const ramGB = ramMatch ? Number(ramMatch[1]) : 3.5;
        const hours = parseHours(desc, 730);
        logger_1.default.info("AZURE_SERVICE_EXTRACTED", {
            serviceType: "Logic Apps",
            quantity,
            vCores,
            ramGB,
            hours,
            region
        });
        return {
            serviceName: "Logic Apps",
            displayName: "Logic Apps",
            meterName: "WS1",
            region,
            usageQuantity: quantity * hours,
            unitType: "Hour",
            quantity,
            hours,
            vCores,
            ramGB,
            ...(sourceMonthlyCost !== undefined ? { sourceMonthlyCost } : {})
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
        displayName: row.serviceType || row.serviceCategory || "Other",
        region,
        usageQuantity,
        unitType,
        ...(sourceMonthlyCost !== undefined ? { sourceMonthlyCost } : {})
    };
};
exports.extractAzureService = extractAzureService;
