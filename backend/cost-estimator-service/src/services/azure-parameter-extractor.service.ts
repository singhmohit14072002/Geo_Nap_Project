import { AzureServiceType } from "./azure-estimate-classifier.service";
import { AzureEstimateRow } from "./azure-estimate-classifier.service";

export type AzurePricingParams =
  | {
      serviceName: "Virtual Machines";
      armSkuName: string;
      region: string;
      quantity: number;
      hours: number;
      osType: "windows" | "linux";
    }
  | {
      serviceName: "Managed Disks";
      skuName: string;
      region: string;
      quantity: number;
    }
  | {
      serviceName: "Bandwidth";
      region: string;
      usageGB: number;
    }
  | {
      serviceName: "Application Gateway";
      region: string;
      quantity: number;
      hours: number;
    }
  | {
      serviceName: "Azure NAT Gateway";
      region: string;
      quantity: number;
      hours: number;
    }
  | {
      serviceName: "Backup";
      region: string;
      usageGB: number;
    }
  | {
      serviceName: "Automation";
      region: string;
      quantity: number;
      hours: number;
    }
  | {
      serviceName: "Logic Apps";
      region: string;
      quantity: number;
      hours: number;
    }
  | {
      serviceName: string;
      region: string;
      quantity: number;
    };

const normalizeRegion = (value: string): string =>
  value.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9-]/g, "") || "centralindia";

const parseNumber = (text: string, fallback = 0): number => {
  const match = text.match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : fallback;
};

const parseHours = (text: string, fallback = 730): number => {
  const hours = parseNumber(text, fallback);
  return hours > 0 ? hours : fallback;
};

const toArmSku = (raw: string): string => {
  const cleaned = raw.trim().replace(/\s+/g, "_");
  if (/^standard_/i.test(cleaned)) return cleaned.replace(/^standard_/i, "Standard_");
  return `Standard_${cleaned}`;
};

export const extractAzurePricingParams = (
  row: AzureEstimateRow,
  type: AzureServiceType
): AzurePricingParams => {
  const desc = row.description || "";
  const region = normalizeRegion(row.region);
  let quantity = parseNumber(desc, 1);
  if (quantity <= 0) quantity = 1;
  const hours = parseHours(desc, 730);

  if (type === "COMPUTE_VM") {
    const skuMatch =
      desc.match(/([a-z]\d+[a-z0-9._-]*(?:v\d+)?)/i) ||
      desc.match(/([a-z]\d+as?\s*v?\d*)/i);
    const rawSku = skuMatch ? skuMatch[1].replace(/\s+/g, "") : "F2s";
    const osType: "windows" | "linux" = desc.toLowerCase().includes("windows") ? "windows" : "linux";
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
