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

interface ParsedServiceEntry {
  serviceCategory: string | null;
  serviceType: string | null;
  region: string;
  description: string;
  sourceRow: Record<string, unknown>;
}

interface SheetRowsBlock {
  rows: Record<string, unknown>[];
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

const KNOWN_REGION_CODES = new Set<string>(
  KNOWN_REGIONS.map((region) => region.toLowerCase().replace(/[^a-z0-9]/g, ""))
);

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

const toStringValue = (value: unknown): string | null => {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

const normalizeRawText = (rawText: string): string =>
  rawText
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();

const normalizeKnownRegion = (value: string | null): string | null => {
  if (!value) {
    return null;
  }
  const normalized = normalizeRegion(value);
  return KNOWN_REGION_CODES.has(normalized) ? normalized : null;
};

const regionPattern = new RegExp(`(${KNOWN_REGIONS.join("|")})`, "i");

const extractRegionFromText = (input: string): string | null => {
  const match = input.match(regionPattern);
  if (!match?.[1]) {
    return null;
  }
  return normalizeKnownRegion(match[1]);
};

const readFirstString = (
  row: Record<string, unknown>,
  aliases: string[],
  fallbackIndex: number
): string | null => {
  for (const alias of aliases) {
    if (!(alias in row)) {
      continue;
    }
    const value = toStringValue(row[alias]);
    if (value) {
      return value;
    }
  }

  const values = Object.values(row);
  if (values.length > fallbackIndex) {
    return toStringValue(values[fallbackIndex]);
  }

  return null;
};

const isHeaderLikeRow = (
  serviceCategory: string | null,
  serviceType: string | null,
  description: string
): boolean => {
  const text = `${serviceCategory ?? ""} ${serviceType ?? ""} ${description}`
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  if (!text) {
    return true;
  }

  if (text.includes("service category") && text.includes("service type")) {
    return true;
  }

  if (text === "microsoft azure estimate") {
    return true;
  }

  return false;
};

const isTotalLikeRow = (
  serviceCategory: string | null,
  serviceType: string | null,
  description: string
): boolean => {
  const text = `${serviceCategory ?? ""} ${serviceType ?? ""} ${description}`
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  return (
    text.startsWith("total") ||
    text.includes("total estimated cost") ||
    text.includes("grand total")
  );
};

const detailStartRegex = new RegExp(
  `^(${KNOWN_REGIONS.join("|")})\\s*(?=(?:Standard|Process|\\d+\\s*Customer|Azure VMs|Log analytics|Workloads|Managed Disks|\\d+\\s*[A-Za-z]\\d|\\(Virtual\\s*Network|${KNOWN_REGIONS.join("|")}\\s*\\(Virtual\\s*Network))`,
  "i"
);

const parseCsvLikeEstimateLine = (line: string): ParsedServiceEntry | null => {
  const parts = line.split(",");
  if (parts.length < 5) {
    return null;
  }

  const serviceCategory = parts[0]?.trim() || null;
  const serviceType = parts[1]?.trim() || null;
  const regionRaw = parts[3]?.trim() || null;
  const region = normalizeKnownRegion(regionRaw);
  if (!region) {
    return null;
  }

  const description = parts.slice(4).join(",").trim();
  if (!description || isHeaderLikeRow(serviceCategory, serviceType, description)) {
    return null;
  }

  return {
    serviceCategory,
    serviceType,
    region,
    description,
    sourceRow: {
      serviceCategory,
      serviceType,
      region,
      description,
      source: "raw-text-csv"
    }
  };
};

const parseDetailEntries = (rawText: string): ParsedServiceEntry[] => {
  const normalized = normalizeRawText(rawText);
  const lowered = normalized.toLowerCase();

  let detailSection = normalized;
  const regionDescriptionIndex = lowered.indexOf("regiondescription");
  const regionCommaDescriptionIndex = lowered.indexOf("region,description");
  if (regionDescriptionIndex >= 0) {
    detailSection = normalized.slice(
      regionDescriptionIndex + "regiondescription".length
    );
  } else if (regionCommaDescriptionIndex >= 0) {
    detailSection = normalized.slice(
      regionCommaDescriptionIndex + "region,description".length
    );
  }

  const lines = detailSection
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const entries: ParsedServiceEntry[] = [];
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
      const fromMatch = merged.match(
        /from\s+(Central India|South India|East Asia|East US|West US 2|North Europe|West Europe)/i
      );
      const region =
        normalizeKnownRegion(fromMatch?.[1] ?? null) ?? "centralindia";
      entries.push({
        serviceCategory: "Networking",
        serviceType: "Bandwidth",
        region,
        description: merged,
        sourceRow: {
          serviceCategory: "Networking",
          serviceType: "Bandwidth",
          region,
          description: merged,
          source: "raw-text"
        }
      });
      return;
    }

    const regionMatch = merged.match(
      /^(Central India|South India|East Asia|East US|West US 2|North Europe|West Europe)\s*(.*)$/i
    );

    if (regionMatch) {
      const region = normalizeKnownRegion(regionMatch[1]) ?? "centralindia";
      const description = regionMatch[2].trim();
      if (!description) {
        return;
      }

      entries.push({
        serviceCategory: null,
        serviceType: null,
        region,
        description,
        sourceRow: {
          serviceCategory: null,
          serviceType: null,
          region,
          description,
          source: "raw-text"
        }
      });
      return;
    }

    const fallbackRegion = extractRegionFromText(merged) ?? "centralindia";
    entries.push({
      serviceCategory: null,
      serviceType: null,
      region: fallbackRegion,
      description: merged,
      sourceRow: {
        serviceCategory: null,
        serviceType: null,
        region: fallbackRegion,
        description: merged,
        source: "raw-text"
      }
    });
  };

  for (const line of lines) {
    const csvEntry = parseCsvLikeEstimateLine(line);
    if (csvEntry) {
      pushCurrent();
      entries.push(csvEntry);
      continue;
    }

    if (isEntryStart(line)) {
      pushCurrent();
      current.push(line);
      continue;
    }

    if (current.length > 0) {
      current.push(line);
      continue;
    }

    if (extractRegionFromText(line)) {
      current.push(line);
    }
  }

  pushCurrent();

  return entries.filter((entry) => entry.description.length > 0);
};

const extractSheetRows = (parsed: ParsedFileResult): SheetRowsBlock[] => {
  const rawBlocks = parsed.normalizedInput.sheetRows;
  if (!Array.isArray(rawBlocks)) {
    return [];
  }

  const blocks: SheetRowsBlock[] = [];
  for (const block of rawBlocks) {
    if (!block || typeof block !== "object") {
      continue;
    }

    const record = block as Record<string, unknown>;
    if (!Array.isArray(record.rows)) {
      continue;
    }

    const rows = record.rows.filter(
      (row): row is Record<string, unknown> =>
        Boolean(row && typeof row === "object")
    );

    if (rows.length > 0) {
      blocks.push({ rows });
    }
  }

  return blocks;
};

const parseExcelEstimateEntries = (parsed: ParsedFileResult): ParsedServiceEntry[] => {
  if (parsed.fileType !== "excel") {
    return [];
  }

  const blocks = extractSheetRows(parsed);
  if (blocks.length === 0) {
    return [];
  }

  const normalizedRawText = normalizeRawText(parsed.rawText ?? "");
  const rawSignal =
    /microsoft\s+azure\s+estimate/i.test(normalizedRawText) ||
    /service\s*category\s*[,\s]+service\s*type/i.test(normalizedRawText) ||
    /pay\s+as\s+you\s+go/i.test(normalizedRawText) ||
    /region\s*[,\s]*description/i.test(normalizedRawText);

  let headerSignal = false;
  const entries: ParsedServiceEntry[] = [];
  const regionCounts = new Map<string, number>();

  for (const block of blocks) {
    for (const row of block.rows) {
      const keyNames = Object.keys(row).map((key) => key.toLowerCase());
      if (
        keyNames.some(
          (key) =>
            key.includes("service category") ||
            key.includes("service type") ||
            key.includes("description") ||
            key.includes("region")
        )
      ) {
        headerSignal = true;
      }

      const serviceCategory = readFirstString(
        row,
        ["serviceCategory", "Service category", "service category", "__EMPTY"],
        0
      );
      const serviceType = readFirstString(
        row,
        [
          "serviceType",
          "Service type",
          "service type",
          "Service Type",
          "__EMPTY_1",
          "__EMPTY"
        ],
        1
      );
      const regionRaw = readFirstString(
        row,
        ["region", "Region", "Azure region", "__EMPTY_2"],
        3
      );
      const descriptionPrimary = readFirstString(
        row,
        [
          "description",
          "Description",
          "serviceDescription",
          "Service Description",
          "details",
          "Details",
          "resourceDetails",
          "Resource details",
          "__EMPTY_3"
        ],
        4
      );

      const description =
        descriptionPrimary ??
        Object.values(row)
          .map((value) => toStringValue(value))
          .filter((value): value is string => Boolean(value))
          .join(" ")
          .trim();

      if (isHeaderLikeRow(serviceCategory, serviceType, description)) {
        continue;
      }
      if (isTotalLikeRow(serviceCategory, serviceType, description)) {
        continue;
      }
      if (!description && !serviceType) {
        continue;
      }

      const normalizedRegion =
        normalizeKnownRegion(regionRaw) ?? extractRegionFromText(description);
      if (normalizedRegion) {
        regionCounts.set(normalizedRegion, (regionCounts.get(normalizedRegion) ?? 0) + 1);
      }

      entries.push({
        serviceCategory,
        serviceType,
        region: normalizedRegion ?? "",
        description,
        sourceRow: row
      });
    }
  }

  if (!rawSignal && !headerSignal) {
    return [];
  }

  if (entries.length === 0) {
    return [];
  }

  const sortedRegions = [...regionCounts.entries()].sort((a, b) => b[1] - a[1]);
  const fallbackRegion = sortedRegions[0]?.[0] ?? "centralindia";

  return entries.map((entry) => ({
    ...entry,
    region: entry.region || fallbackRegion
  }));
};

const detectServiceFromDescription = (
  serviceCategoryInput: string | null,
  serviceTypeInput: string | null,
  description: string
): { classification: Classification; serviceType: string; serviceCategory: string } => {
  const serviceCategory = serviceCategoryInput?.trim() || "";
  const serviceType = serviceTypeInput?.trim() || "";
  const context = `${serviceCategory} ${serviceType} ${description}`.toLowerCase();

  if (
    serviceType.toLowerCase().includes("virtual machine") ||
    /\b\d+\s*[a-z]\d[a-z0-9._\-]*(?:\s*v\d+)?\s*\(\d+\s*vcpu/i.test(context)
  ) {
    return {
      classification: "COMPUTE_VM",
      serviceType: serviceType || "Virtual Machines",
      serviceCategory: serviceCategory || "Compute"
    };
  }

  if (
    serviceType.toLowerCase().includes("managed disk") ||
    /managed\s*disks?/i.test(context)
  ) {
    return {
      classification: "STORAGE_DISK",
      serviceType: serviceType || "Managed Disks",
      serviceCategory: serviceCategory || "Storage"
    };
  }

  if (
    serviceType.toLowerCase().includes("nat gateway") ||
    /nat\s*gateway/i.test(context)
  ) {
    return {
      classification: "NETWORK_GATEWAY",
      serviceType: serviceType || "Azure NAT Gateway",
      serviceCategory: serviceCategory || "Networking"
    };
  }

  if (
    serviceType.toLowerCase().includes("application gateway") ||
    /application\s*gateway|persistent\s*connections|fixed\s*gateway\s*hours/i.test(
      context
    )
  ) {
    return {
      classification: "NETWORK_GATEWAY",
      serviceType: serviceType || "Application Gateway",
      serviceCategory: serviceCategory || "Networking"
    };
  }

  if (
    serviceType.toLowerCase().includes("bandwidth") ||
    serviceType.toLowerCase().includes("virtual network") ||
    /virtual\s*network|internet\s*egress|outbound\s*data\s*transfer|\bbandwidth\b/i.test(
      context
    )
  ) {
    return {
      classification: "NETWORK_EGRESS",
      serviceType:
        serviceType ||
        (/virtual\s*network/i.test(context) ? "Virtual Network" : "Bandwidth"),
      serviceCategory: serviceCategory || "Networking"
    };
  }

  if (
    serviceType.toLowerCase().includes("backup") ||
    serviceType.toLowerCase().includes("site recovery") ||
    /backup\s*policy|azure\s*backup|archive\s*tier|site\s*recovery|customer\s*instances/i.test(
      context
    )
  ) {
    return {
      classification: "BACKUP",
      serviceType:
        serviceType ||
        (/site\s*recovery|customer\s*instances/i.test(context)
          ? "Azure Site Recovery"
          : "Azure Backup"),
      serviceCategory: serviceCategory || "Management and Governance"
    };
  }

  if (
    serviceType.toLowerCase().includes("automation") ||
    /automation|watchers\s*x\s*\d+\s*hours/i.test(context)
  ) {
    return {
      classification: "AUTOMATION",
      serviceType: serviceType || "Automation",
      serviceCategory: serviceCategory || "Management and Governance"
    };
  }

  if (
    serviceType.toLowerCase().includes("monitor") ||
    /log\s*analytics|application\s*insights|managed\s*prometheus|dashboards/i.test(
      context
    )
  ) {
    return {
      classification: "MONITORING",
      serviceType: serviceType || "Azure Monitor",
      serviceCategory: serviceCategory || "DevOps"
    };
  }

  if (
    serviceType.toLowerCase().includes("logic app") ||
    /logic\s*apps|connector\s*calls|integration\s*service\s*environment/i.test(
      context
    )
  ) {
    return {
      classification: "LOGIC_APPS",
      serviceType: serviceType || "Logic Apps",
      serviceCategory: serviceCategory || "Internet of Things"
    };
  }

  return {
    classification: "OTHER",
    serviceType: serviceType || "Unknown",
    serviceCategory: serviceCategory || "Other"
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

    if (
      row.classification === "NETWORK_EGRESS" ||
      row.classification === "NETWORK_GATEWAY"
    ) {
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

const classifyEntries = (entries: ParsedServiceEntry[]): CloudEstimateServiceRow[] => {
  return entries.map((entry) => {
    const inferred = detectServiceFromDescription(
      entry.serviceCategory,
      entry.serviceType,
      entry.description
    );
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
        serviceCategory: inferred.serviceCategory,
        serviceType: inferred.serviceType,
        region: entry.region,
        description: entry.description,
        sourceRow: entry.sourceRow
      }
    };
  });
};

const parseRawTextEstimateEntries = (parsed: ParsedFileResult): ParsedServiceEntry[] => {
  const rawText = parsed.rawText ?? "";
  if (!rawText) {
    return [];
  }

  const normalized = normalizeRawText(rawText);
  const isEstimateDoc =
    /microsoft\s+azure\s+estimate/i.test(normalized) ||
    /service\s*category\s*service\s*type/i.test(normalized) ||
    /pay\s+as\s+you\s+go/i.test(normalized) ||
    /region\s*description/i.test(normalized) ||
    /service\s*category\s*,\s*service\s*type/i.test(normalized);

  if (!isEstimateDoc) {
    return [];
  }

  return parseDetailEntries(normalized);
};

export const extractCloudEstimateFromParsedInput = (
  parsed: ParsedFileResult
): CloudEstimateExtraction | null => {
  const spreadsheetEntries = parseExcelEstimateEntries(parsed);
  const rawTextEntries =
    spreadsheetEntries.length > 0 ? [] : parseRawTextEstimateEntries(parsed);
  const entries = spreadsheetEntries.length > 0 ? spreadsheetEntries : rawTextEntries;

  if (entries.length === 0) {
    return null;
  }

  const classifiedServices = classifyEntries(entries);
  const meaningfulRows = classifiedServices.filter(
    (row) => row.classification !== "OTHER"
  );
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
