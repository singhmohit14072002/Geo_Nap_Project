import logger from "../utils/logger";
import { AzureEstimateRow } from "./azure-estimate-classifier.service";

export interface AzureServiceInput {
  serviceName: string;
  serviceFamily?: string;
  displayName?: string;
  armSkuName?: string;
  meterName?: string;
  region: string;
  usageQuantity: number;
  unitType: string;
  osType?: "windows" | "linux";
  quantity?: number;
  hours?: number;
  capacityUnits?: number;
  dataProcessedGB?: number;
  vCores?: number;
  ramGB?: number;
  routingPreference?: "MGN" | "INTERNET";
  pricingHint?: "INTER_REGION";
  diskRedundancy?: "LRS" | "ZRS";
  backupDataGB?: number;
  additionalMinutes?: number;
  watcherHours?: number;
  sourceMonthlyCost?: number;
}

const normalizeRegion = (value: string): string =>
  value.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9-]/g, "") || "centralindia";

const parseNumber = (text: string, fallback = 0): number => {
  const m = text.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : fallback;
};

const parseLocalizedNumber = (value: string): number | undefined => {
  const cleaned = value.replace(/[^0-9.,-]/g, "").replace(/,/g, "");
  if (!cleaned) return undefined;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseMonthlyCostFromDescription = (text: string): number | undefined => {
  if (!text) return undefined;
  const patterns = [
    /upfront\s*:\s*[^\n\r]*?monthly\s*:\s*[^\d]*([\d,]+(?:\.\d+)?)/i,
    /estimated\s+monthly\s+cost\s*[:=]?\s*[^\d]*([\d,]+(?:\.\d+)?)/i,
    /monthly\s+cost\s*[:=]?\s*[^\d]*([\d,]+(?:\.\d+)?)/i,
    /monthly\s*[:=]\s*[^\d]*([\d,]+(?:\.\d+)?)/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const parsed = parseLocalizedNumber(match[1]);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
};

const parseHours = (text: string, fallback = 730): number => {
  // Only treat a number as hours if the description explicitly mentions hours/hrs
  const explicit = text.match(/(\d+(?:\.\d+)?)\s*(?:hour|hr|hrs)/i);
  if (explicit) {
    const hours = Number(explicit[1]);
    return hours > 0 ? hours : fallback;
  }
  return fallback;
};

const parseRegionFromText = (text: string): string | null => {
  const m = text.match(/([A-Za-z]+(?:\s+[A-Za-z]+)*)\s+India/i);
  if (!m?.[0]) return null;
  return normalizeRegion(m[0]);
};

const extractSku = (text: string, fallback = "F2s"): string => {
  const m = text.match(/([a-z]\d+[a-z0-9._-]*(?:\s*v\d+)?)/i);
  return m ? m[1].trim().replace(/\s+/g, "_") : fallback;
};

const toArmSku = (raw: string): string => {
  const cleaned = raw.trim().replace(/\s+/g, "_");
  if (/^standard_/i.test(cleaned)) return cleaned.replace(/^standard_/i, "Standard_");
  return `Standard_${cleaned}`;
};

export const extractAzureService = (row: AzureEstimateRow): AzureServiceInput | null => {
  const type = row.serviceType.toLowerCase();
  const desc = row.description || "";
  const region = normalizeRegion(row.region);
  const sourceMonthlyCost =
    typeof row.estimatedMonthlyCost === "number" && Number.isFinite(row.estimatedMonthlyCost)
      ? row.estimatedMonthlyCost
      : parseMonthlyCostFromDescription(desc);

  const cat = row.serviceCategory.toLowerCase();
  if (!type && !cat) return null;
  if (!type && sourceMonthlyCost === undefined) return null;
  if (cat.includes("support") || cat.includes("disclaimer") || cat.includes("billing")) return null;
  if (cat.includes("http://") || cat.includes("https://")) return null;
  if (!type && (cat.includes("total") || row.region.toLowerCase() === "total")) return null;

  // Rule 1: Virtual Machines
  if (type.includes("virtual machine")) {
    const armSku = toArmSku(extractSku(desc));
    const qtyMatch = desc.match(/(\d+)\s*[a-z]/i);
    const quantity = Math.max(1, qtyMatch ? Number(qtyMatch[1]) : 1);
    const hours = parseHours(desc, 730);
    const osType = desc.toLowerCase().includes("windows") ? "windows" : "linux";
    const usageQuantity = quantity * hours;
    logger.info("AZURE_SERVICE_EXTRACTED", {
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
      displayName: row.serviceType || "Virtual Machines",
      armSkuName: armSku,
      region,
      usageQuantity,
      unitType: "Hour",
      osType,
      ...(sourceMonthlyCost !== undefined ? { sourceMonthlyCost } : {})
    };
  }

  // Rule 2: Managed Disks
  if (type.includes("managed disks") || type.includes("managed disk")) {
    const tierMatch = desc.match(/(p\d{1,2})/i);
    const skuName = tierMatch ? tierMatch[1].toUpperCase() : "P10";
    const redundancy = desc.match(/\b(zrs|lrs)\b/i)?.[1]?.toUpperCase() as "LRS" | "ZRS" | undefined;
    const diskQtyMatch = desc.match(/disk\s*type\s*(\d+)\s*disks?/i) ?? desc.match(/(\d+)\s*disks?/i);
    const quantity = Math.max(1, diskQtyMatch ? Number(diskQtyMatch[1]) : parseNumber(desc, 1));
    logger.info("AZURE_SERVICE_EXTRACTED", { serviceType: "Disk", skuName, quantity, region });
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
    logger.info("AZURE_SERVICE_EXTRACTED", { serviceType: "Bandwidth", usageGB, region, routingPreference });
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
    logger.info("AZURE_SERVICE_EXTRACTED", {
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
    logger.info("AZURE_SERVICE_EXTRACTED", { serviceType: "NAT Gateway", quantity, hours, region });
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
    const vnetMatch = desc.match(
      /([A-Za-z]+(?:\s+[A-Za-z]+)*)\s*\(virtual\s+network\s*\d+\)\s*:\s*(\d+(?:\.\d+)?)\s*gb\s*outbound/i
    );
    const extractedRegion = vnetMatch?.[1] ? normalizeRegion(vnetMatch[1]) : parseRegionFromText(desc);
    if (vnetMatch?.[2]) usageGB = Number(vnetMatch[2]);
    logger.info("AZURE_SERVICE_EXTRACTED", {
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
    logger.info("AZURE_SERVICE_EXTRACTED", {
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
    const dataMatch = desc.match(/(\d+(?:\.\d+)?)\s*gb\s*average monthly backup data/i);
    const backupDataGB = dataMatch ? Number(dataMatch[1]) : 0;
    const redundancy = desc.match(/\b(zrs|lrs|grs|ra-grs)\b/i)?.[1]?.toUpperCase() as
      | "LRS"
      | "ZRS"
      | undefined;
    logger.info("AZURE_SERVICE_EXTRACTED", {
      serviceType: "Azure Backup",
      instances,
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
      ...(redundancy ? { diskRedundancy: redundancy } : {}),
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
    logger.info("AZURE_SERVICE_EXTRACTED", {
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
  logger.info("AZURE_SERVICE_EXTRACTED", { serviceType: row.serviceType, unitType, usageQuantity, region });
  return {
    serviceName: row.serviceType || row.serviceCategory || "Other",
    displayName: row.serviceType || row.serviceCategory || "Other",
    region,
    usageQuantity,
    unitType,
    ...(sourceMonthlyCost !== undefined ? { sourceMonthlyCost } : {})
  };
};
