import {
  ExtractedRequirement,
  extractedRequirementSchema
} from "../schemas/extraction.schema";
import { ParsedFileResult } from "./file-parser.service";

type Classification =
  | "COMPUTE_VM"
  | "STORAGE_DISK"
  | "NETWORK_GATEWAY"
  | "NETWORK_EGRESS"
  | "BACKUP"
  | "AUTOMATION"
  | "MONITORING"
  | "LOGIC_APPS"
  | "OTHER";

export interface CloudEstimateServiceRow {
  classification: Classification;
  serviceCategory: string | null;
  serviceType: string | null;
  reason?: string;
  pricingParameters?: {
    serviceName: string;
    skuName?: string;
    quantity?: number;
    hours?: number;
    usageGB?: number;
    osType?: "linux" | "windows";
  };
  row: Record<string, unknown>;
}

export interface CloudEstimateExtraction {
  documentType: "CLOUD_ESTIMATE";
  classifiedServices: CloudEstimateServiceRow[];
  requirement: ExtractedRequirement;
}

interface ParsedDetailEntry {
  region: string;
  description: string;
}

const KNOWN_REGIONS = [
  "Central India",
  "South India",
  "East Asia",
  "East US",
  "West US 2",
  "North Europe",
  "West Europe"
] as const;

const round2 = (value: number): number => Number(value.toFixed(2));

const normalizeRegion = (value: string): string => {
  const key = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const map: Record<string, string> = {
    centralindia: "centralindia",
    southindia: "southindia",
    eastasia: "eastasia",
    eastus: "eastus",
    westus2: "westus2",
    northeurope: "northeurope",
    westeurope: "westeurope"
  };
  return map[key] ?? key;
};

const parseNumber = (value: string | undefined): number | null => {
  if (!value) {
    return null;
  }
  const parsed = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeRawText = (rawText: string): string =>
  rawText
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();

const detailStartRegex = new RegExp(
  `^(${KNOWN_REGIONS.join("|")})\\s*(?=(?:Standard|Process|\\d+\\s*Customer|Azure VMs|Log analytics|Workloads|Managed Disks|\\d+\\s*[A-Za-z]\\d|\\(Virtual Network))`,
  "i"
);

const parseDetailEntries = (rawText: string): ParsedDetailEntry[] => {
  const normalized = normalizeRawText(rawText);
  const regionHeaderIndex = normalized.toLowerCase().indexOf("regiondescription");
  const detailSection = regionHeaderIndex >= 0
    ? normalized.slice(regionHeaderIndex + "regiondescription".length)
    : normalized;

  const lines = detailSection
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const entries: ParsedDetailEntry[] = [];
  let current: string[] = [];

  const isEntryStart = (line: string): boolean => {
    if (/^internet\s+egress/i.test(line)) {
      return true;
    }
    return detailStartRegex.test(line);
  };

  const pushCurrent = () => {
    if (current.length === 0) {
      return;
    }
    const merged = current.join(" ").replace(/\s+/g, " ").trim();
    current = [];
    if (!merged) {
      return;
    }

    if (/^internet\s+egress/i.test(merged)) {
      const fromMatch = merged.match(/from\s+(Central India|South India|East Asia|East US|West US 2|North Europe|West Europe)/i);
      const region = normalizeRegion(fromMatch?.[1] ?? "centralindia");
      entries.push({
        region,
        description: merged
      });
      return;
    }

    const regionMatch = merged.match(
      /^(Central India|South India|East Asia|East US|West US 2|North Europe|West Europe)\s*(.*)$/i
    );

    if (regionMatch) {
      entries.push({
        region: normalizeRegion(regionMatch[1]),
        description: regionMatch[2].trim()
      });
      return;
    }

    entries.push({
      region: "centralindia",
      description: merged
    });
  };

  for (const line of lines) {
    if (isEntryStart(line)) {
      pushCurrent();
      current.push(line);
    } else if (current.length > 0) {
      current.push(line);
    }
  }

  pushCurrent();

  return entries.filter((entry) => entry.description.length > 0);
};

const detectServiceFromDescription = (
  description: string
): { classification: Classification; serviceType: string; serviceCategory: string } => {
  const text = description.toLowerCase();

  if (/\b\d+\s*[a-z]\d[a-z0-9._\-]*(?:\s*v\d+)?\s*\(\d+\s*vcpu/i.test(text)) {
    return {
      classification: "COMPUTE_VM",
      serviceType: "Virtual Machines",
      serviceCategory: "Compute"
    };
  }

  if (/managed\s*disks?/i.test(text)) {
    return {
      classification: "STORAGE_DISK",
      serviceType: "Managed Disks",
      serviceCategory: "Storage"
    };
  }

  if (/nat\s*gateway/i.test(text)) {
    return {
      classification: "NETWORK_GATEWAY",
      serviceType: "Azure NAT Gateway",
      serviceCategory: "Networking"
    };
  }

  if (/application\s*gateway|persistent\s*connections|fixed\s*gateway\s*hours/i.test(text)) {
    return {
      classification: "NETWORK_GATEWAY",
      serviceType: "Application Gateway",
      serviceCategory: "Networking"
    };
  }

  if (/virtual\s*network|internet\s*egress|outbound\s*data\s*transfer|\bbandwidth\b/i.test(text)) {
    return {
      classification: "NETWORK_EGRESS",
      serviceType: /virtual\s*network/i.test(text) ? "Virtual Network" : "Bandwidth",
      serviceCategory: "Networking"
    };
  }

  if (/backup\s*policy|azure\s*backup|archive\s*tier|site\s*recovery|customer\s*instances/i.test(text)) {
    return {
      classification: "BACKUP",
      serviceType: /site\s*recovery|customer\s*instances/i.test(text)
        ? "Azure Site Recovery"
        : "Azure Backup",
      serviceCategory: "Management and Governance"
    };
  }

  if (/automation|watchers\s*x\s*\d+\s*hours/i.test(text)) {
    return {
      classification: "AUTOMATION",
      serviceType: "Automation",
      serviceCategory: "Management and Governance"
    };
  }

  if (/log\s*analytics|application\s*insights|managed\s*prometheus|dashboards/i.test(text)) {
    return {
      classification: "MONITORING",
      serviceType: "Azure Monitor",
      serviceCategory: "DevOps"
    };
  }

  if (/logic\s*apps|connector\s*calls|integration\s*service\s*environment/i.test(text)) {
    return {
      classification: "LOGIC_APPS",
      serviceType: "Logic Apps",
      serviceCategory: "Internet of Things"
    };
  }

  return {
    classification: "OTHER",
    serviceType: "Unknown",
    serviceCategory: "Other"
  };
};

const parseVmParameters = (
  description: string
): CloudEstimateServiceRow["pricingParameters"] | undefined => {
  const vmMatch = description.match(
    /(\d+(?:\.\d+)?)\s+([a-z][a-z0-9._\- ]*?)\s*\((\d+(?:\.\d+)?)\s*v(?:cpus?|cores?)\s*,\s*(\d+(?:\.\d+)?)\s*gb\s*ram\)\s*x\s*(\d+(?:\.\d+)?)\s*hours?/i
  );
  if (!vmMatch) {
    return undefined;
  }

  const quantity = parseNumber(vmMatch[1]) ?? 1;
  const skuName = vmMatch[2].trim();
  const hours = parseNumber(vmMatch[5]) ?? 730;
  const osType: "linux" | "windows" =
    /windows/i.test(description) ? "windows" : "linux";
  const usageGbMatch = description.match(/(\d+(?:\.\d+)?)\s*gb\s*outbound/i);
  const usageGB = usageGbMatch ? parseNumber(usageGbMatch[1]) ?? undefined : undefined;

  return {
    serviceName: "Virtual Machines",
    skuName,
    quantity: Math.max(1, Math.round(quantity)),
    hours: Math.max(1, Math.round(hours)),
    osType,
    ...(usageGB !== undefined ? { usageGB: round2(usageGB) } : {})
  };
};

const parseDiskParameters = (
  description: string
): CloudEstimateServiceRow["pricingParameters"] | undefined => {
  const skuMatch = description.match(/\b(P\d{1,3})\b/i);
  const quantityMatch = description.match(/disk\s*type\s*(\d+(?:\.\d+)?)\s*disks?/i);
  const quantity = quantityMatch ? parseNumber(quantityMatch[1]) : null;
  if (!skuMatch && quantity === null) {
    return undefined;
  }
  return {
    serviceName: "Managed Disks",
    ...(skuMatch?.[1] ? { skuName: skuMatch[1].toUpperCase() } : {}),
    ...(quantity !== null ? { quantity: Math.max(1, Math.round(quantity)) } : {})
  };
};

const parseEgressParameters = (
  description: string
): CloudEstimateServiceRow["pricingParameters"] | undefined => {
  const matches = Array.from(
    description.matchAll(
      /(\d+(?:\.\d+)?)\s*gb\s*(?:outbound\s+data\s+transfer|outbound|data\s+transfer|data\s+processed|egress)/gi
    )
  );
  if (matches.length === 0) {
    return undefined;
  }
  const totalGb = matches.reduce((sum, item) => {
    const value = parseNumber(item[1]);
    return sum + (value ?? 0);
  }, 0);
  return {
    serviceName: "Bandwidth",
    usageGB: round2(totalGb)
  };
};

const parseGatewayParameters = (
  serviceType: string,
  description: string
): CloudEstimateServiceRow["pricingParameters"] | undefined => {
  const hoursMatch = description.match(/(\d+(?:\.\d+)?)\s*(?:fixed\s+gateway\s+)?hours?/i);
  const usageMatch = description.match(/(\d+(?:\.\d+)?)\s*gb\s*(?:data\s+transfer|data\s+processed)/i);
  const quantityMatch = description.match(/(\d+(?:\.\d+)?)\s*compute\s*units?/i);
  const params: CloudEstimateServiceRow["pricingParameters"] = {
    serviceName: serviceType.toLowerCase().includes("nat")
      ? "Virtual Network"
      : "Application Gateway"
  };

  const hours = hoursMatch ? parseNumber(hoursMatch[1]) : null;
  const usageGB = usageMatch ? parseNumber(usageMatch[1]) : null;
  const quantity = quantityMatch ? parseNumber(quantityMatch[1]) : null;
  if (hours !== null) {
    params.hours = Math.max(1, Math.round(hours));
  }
  if (usageGB !== null) {
    params.usageGB = round2(usageGB);
  }
  if (quantity !== null) {
    params.quantity = Math.max(1, Math.round(quantity));
  }
  return Object.keys(params).length > 1 ? params : undefined;
};

const parseServiceParameters = (
  classification: Classification,
  serviceType: string,
  description: string
): CloudEstimateServiceRow["pricingParameters"] | undefined => {
  if (classification === "COMPUTE_VM") {
    return parseVmParameters(description);
  }
  if (classification === "STORAGE_DISK") {
    return parseDiskParameters(description);
  }
  if (classification === "NETWORK_EGRESS") {
    return parseEgressParameters(description);
  }
  if (classification === "NETWORK_GATEWAY") {
    return parseGatewayParameters(serviceType, description);
  }
  if (classification === "BACKUP") {
    const backupUsage = parseEgressParameters(description);
    if (backupUsage) {
      backupUsage.serviceName = "Recovery Services";
    }
    return backupUsage;
  }
  if (classification === "AUTOMATION") {
    return {
      serviceName: "Automation",
      hours: 730,
      quantity: 1
    };
  }
  if (classification === "MONITORING") {
    return {
      serviceName: "Azure Monitor",
      hours: 730,
      quantity: 1
    };
  }
  if (classification === "LOGIC_APPS") {
    return {
      serviceName: "Logic Apps",
      hours: 730,
      quantity: 1
    };
  }
  return undefined;
};

const buildRequirementFromRows = (
  rows: CloudEstimateServiceRow[],
  fallbackRegion: string
): ExtractedRequirement => {
  const compute: ExtractedRequirement["compute"] = [];
  let networkEgress = 0;

  for (const row of rows) {
    const description = String(row.row.description ?? "");

    if (row.classification === "COMPUTE_VM") {
      const vmMatch = description.match(
        /(\d+(?:\.\d+)?)\s+[a-z][a-z0-9._\- ]*?\s*\((\d+(?:\.\d+)?)\s*v(?:cpus?|cores?)\s*,\s*(\d+(?:\.\d+)?)\s*gb\s*ram\)/i
      );
      if (vmMatch) {
        const quantity = parseNumber(vmMatch[1]) ?? 1;
        const vcpu = parseNumber(vmMatch[2]) ?? 1;
        const ram = parseNumber(vmMatch[3]) ?? 1;
        const osType: "linux" | "windows" =
          /windows/i.test(description) ? "windows" : "linux";
        compute.push({
          vCPU: Math.max(1, Math.round(vcpu)),
          ramGB: round2(ram),
          storageGB: 0,
          osType,
          quantity: Math.max(1, Math.round(quantity))
        });
      }
    }

    if (row.classification === "NETWORK_EGRESS" || row.classification === "NETWORK_GATEWAY") {
      const usage = row.pricingParameters?.usageGB ?? 0;
      networkEgress += usage;
    }
  }

  if (compute.length === 0) {
    compute.push({
      vCPU: 2,
      ramGB: 8,
      storageGB: 0,
      osType: "linux",
      quantity: 1
    });
  }

  const requirementCandidate: ExtractedRequirement = {
    compute,
    database: {
      engine: "none",
      storageGB: 0,
      ha: false
    },
    network: {
      dataEgressGB: round2(Math.max(0, networkEgress))
    },
    region: fallbackRegion
  };

  const parsed = extractedRequirementSchema.safeParse(requirementCandidate);
  if (parsed.success) {
    return parsed.data;
  }

  return {
    compute: [
      {
        vCPU: 2,
        ramGB: 8,
        storageGB: 0,
        osType: "linux",
        quantity: 1
      }
    ],
    database: {
      engine: "none",
      storageGB: 0,
      ha: false
    },
    network: {
      dataEgressGB: 0
    },
    region: fallbackRegion
  };
};

export const extractCloudEstimateFromParsedInput = (
  parsed: ParsedFileResult
): CloudEstimateExtraction | null => {
  const rawText = parsed.rawText ?? "";
  if (!rawText) {
    return null;
  }

  const normalized = normalizeRawText(rawText);
  const isEstimateDoc =
    /microsoft\s+azure\s+estimate/i.test(normalized) ||
    /service\s*category\s*service\s*type/i.test(normalized) ||
    /pay\s+as\s+you\s+go/i.test(normalized) ||
    /region\s*description/i.test(normalized);

  if (!isEstimateDoc) {
    return null;
  }

  const entries = parseDetailEntries(normalized);
  if (entries.length === 0) {
    return null;
  }

  const classifiedServices: CloudEstimateServiceRow[] = entries.map((entry) => {
    const inferred = detectServiceFromDescription(entry.description);
    const pricingParameters = parseServiceParameters(
      inferred.classification,
      inferred.serviceType,
      entry.description
    );

    return {
      classification: inferred.classification,
      serviceCategory: inferred.serviceCategory,
      serviceType: inferred.serviceType,
      reason: "deterministic-cloud-estimate-extractor",
      ...(pricingParameters ? { pricingParameters } : {}),
      row: {
        serviceType: inferred.serviceType,
        region: entry.region,
        description: entry.description
      }
    };
  });

  const meaningfulRows = classifiedServices.filter((row) => row.classification !== "OTHER");
  if (meaningfulRows.length === 0) {
    return null;
  }

  const fallbackRegion = entries[0]?.region ?? "centralindia";
  const requirement = buildRequirementFromRows(meaningfulRows, fallbackRegion);

  return {
    documentType: "CLOUD_ESTIMATE",
    classifiedServices: meaningfulRows,
    requirement
  };
};
