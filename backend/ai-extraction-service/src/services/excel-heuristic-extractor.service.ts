import { ExtractionCandidate } from "../schemas/extraction.schema";
import { ParsedFileResult } from "./file-parser.service";

export interface ExcelHeuristicExtraction {
  candidate: ExtractionCandidate;
  confidence: number;
}

type GenericRow = Record<string, unknown>;

interface SheetRowsBlock {
  sheetName: string;
  rows: GenericRow[];
}

const round2 = (value: number): number => Number(value.toFixed(2));

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
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

const normalizeRegion = (value: string): string => {
  const key = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const mapping: Record<string, string> = {
    centralindia: "centralindia",
    southindia: "southindia",
    westus2: "westus2",
    eastus: "eastus",
    apsouth1: "ap-south-1",
    asiawest1: "asia-west1",
    asiasouth1: "asia-south1"
  };
  return mapping[key] ?? key;
};

const getByAliases = (
  row: GenericRow,
  aliases: string[],
  fallbackIndex: number
): string | null => {
  for (const alias of aliases) {
    if (alias in row) {
      const direct = toStringValue(row[alias]);
      if (direct) {
        return direct;
      }
    }
  }

  const values = Object.values(row);
  if (values.length > fallbackIndex) {
    return toStringValue(values[fallbackIndex]);
  }
  return null;
};

const extractSheetRows = (parsed: ParsedFileResult): SheetRowsBlock[] => {
  const blocks = parsed.normalizedInput.sheetRows;
  if (!Array.isArray(blocks)) {
    return [];
  }

  const normalized: SheetRowsBlock[] = [];
  for (const block of blocks) {
    if (!block || typeof block !== "object") {
      continue;
    }
    const record = block as Record<string, unknown>;
    const sheetName = toStringValue(record.sheetName) ?? "sheet";
    const rowsRaw = record.rows;
    if (!Array.isArray(rowsRaw)) {
      continue;
    }

    const rows = rowsRaw.filter(
      (row): row is GenericRow => Boolean(row && typeof row === "object")
    );
    normalized.push({ sheetName, rows });
  }
  return normalized;
};

const detectStorageType = (description: string): "ssd" | "hdd" | "standard" => {
  const lower = description.toLowerCase();
  if (lower.includes("ssd")) {
    return "ssd";
  }
  if (lower.includes("hdd")) {
    return "hdd";
  }
  return "standard";
};

const parseComputeFromDescription = (description: string) => {
  const pattern =
    /(\d+(?:\.\d+)?)\s+([a-z0-9._\-\s]+?)\s*\((\d+(?:\.\d+)?)\s*v(?:cpus?|cores?)\s*,\s*(\d+(?:\.\d+)?)\s*gb\s*ram\)/i;
  const match = description.match(pattern);
  if (!match) {
    return null;
  }

  const quantity = toNumber(match[1]);
  const vcpu = toNumber(match[3]);
  const ramGB = toNumber(match[4]);
  if (quantity === null || vcpu === null || ramGB === null) {
    return null;
  }

  const managedDiskMatch = description.match(/(\d+(?:\.\d+)?)\s*managed\s+disks?/i);
  const storageGB = managedDiskMatch ? toNumber(managedDiskMatch[1]) ?? 0 : 0;

  const lower = description.toLowerCase();
  const osType: "linux" | "windows" = lower.includes("windows")
    ? "windows"
    : "linux";

  return {
    vCPU: Math.max(1, Math.round(vcpu)),
    ramGB: round2(ramGB),
    storageGB: round2(Math.max(0, storageGB)),
    storageType: detectStorageType(description),
    osType,
    quantity: Math.max(1, Math.round(quantity))
  };
};

const parseEgressGbFromDescription = (description: string): number => {
  const regex =
    /(\d+(?:\.\d+)?)\s*gb\s*(?:outbound\s+data\s+transfer|outbound|egress|data\s+transfer\s+out)/gi;
  let total = 0;
  let matched = false;
  let result = regex.exec(description);
  while (result) {
    const value = toNumber(result[1]);
    if (value !== null) {
      total += value;
      matched = true;
    }
    result = regex.exec(description);
  }
  return matched ? round2(total) : 0;
};

const isHeaderRow = (category: string | null, serviceType: string | null): boolean => {
  if (!category || !serviceType) {
    return false;
  }
  const c = category.toLowerCase();
  const s = serviceType.toLowerCase();
  return c.includes("service category") && s.includes("service type");
};

export const extractExcelHeuristicCandidate = (
  parsed: ParsedFileResult
): ExcelHeuristicExtraction | null => {
  if (parsed.fileType !== "excel") {
    return null;
  }

  const sheetRows = extractSheetRows(parsed);
  if (sheetRows.length === 0) {
    return null;
  }

  const compute: Array<{
    vCPU: number;
    ramGB: number;
    storageGB: number;
    storageType: "ssd" | "hdd" | "standard";
    osType: "linux" | "windows";
    quantity: number;
  }> = [];
  const computeDedupe = new Set<string>();
  const regionCounts = new Map<string, number>();
  let networkEgressGb = 0;
  let databaseDetected = false;
  let databaseStorageGb = 0;
  let databaseEngine: "postgres" | "mysql" | "mssql" | "none" = "none";
  let databaseHa = false;

  for (const block of sheetRows) {
    for (const row of block.rows) {
      const category = getByAliases(
        row,
        ["serviceCategory", "Service category", "Microsoft Azure Estimate"],
        0
      );
      const serviceType = getByAliases(
        row,
        ["serviceType", "Service type", "__EMPTY"],
        1
      );
      const regionRaw = getByAliases(row, ["region", "Region", "__EMPTY_2"], 3);
      const description = getByAliases(
        row,
        ["description", "Description", "__EMPTY_3"],
        4
      );

      if (isHeaderRow(category, serviceType)) {
        continue;
      }
      if (regionRaw) {
        const normalized = normalizeRegion(regionRaw);
        regionCounts.set(normalized, (regionCounts.get(normalized) ?? 0) + 1);
      }

      const categoryLower = (category ?? "").toLowerCase();
      const serviceLower = (serviceType ?? "").toLowerCase();
      const descriptionLower = (description ?? "").toLowerCase();

      const parsedCompute = description ? parseComputeFromDescription(description) : null;
      const computeSignal =
        parsedCompute &&
        (categoryLower.includes("compute") ||
          serviceLower.includes("virtual machine") ||
          descriptionLower.includes("vcpu") ||
          descriptionLower.includes("vcore"));

      if (computeSignal && parsedCompute) {
        const key = JSON.stringify(parsedCompute);
        if (!computeDedupe.has(key)) {
          compute.push(parsedCompute);
          computeDedupe.add(key);
        }
      }

      const isNetworkRow =
        categoryLower.includes("network") ||
        serviceLower.includes("bandwidth") ||
        serviceLower.includes("virtual network") ||
        descriptionLower.includes("outbound data transfer") ||
        descriptionLower.includes("internet egress");

      if (isNetworkRow && description) {
        networkEgressGb += parseEgressGbFromDescription(description);
      }

      const isDatabaseRow =
        categoryLower.includes("database") ||
        serviceLower.includes("database") ||
        serviceLower.includes("sql") ||
        descriptionLower.includes("postgres") ||
        descriptionLower.includes("mysql") ||
        descriptionLower.includes("mssql");
      if (isDatabaseRow) {
        databaseDetected = true;
        if (descriptionLower.includes("postgres")) {
          databaseEngine = "postgres";
        } else if (descriptionLower.includes("mysql")) {
          databaseEngine = "mysql";
        } else if (descriptionLower.includes("mssql") || serviceLower.includes("sql")) {
          databaseEngine = "mssql";
        }
        const storageMatch = description?.match(/(\d+(?:\.\d+)?)\s*gb/i);
        const storage = storageMatch ? toNumber(storageMatch[1]) : null;
        if (storage !== null && storage > databaseStorageGb) {
          databaseStorageGb = storage;
        }
        if (descriptionLower.includes("ha") || descriptionLower.includes("high availability")) {
          databaseHa = true;
        }
      }
    }
  }

  if (compute.length === 0) {
    return null;
  }

  const sortedRegions = [...regionCounts.entries()].sort((a, b) => b[1] - a[1]);
  const region = sortedRegions.length > 0 ? sortedRegions[0][0] : null;

  const candidate: ExtractionCandidate = {
    compute,
    database: {
      engine: databaseDetected ? databaseEngine : "none",
      storageGB: databaseDetected ? round2(databaseStorageGb) : 0,
      ha: databaseDetected ? databaseHa : false
    },
    network:
      networkEgressGb > 0
        ? { dataEgressGB: round2(networkEgressGb) }
        : undefined,
    region
  };

  let confidence = 0.45;
  confidence += Math.min(0.35, compute.length * 0.1);
  if (region) {
    confidence += 0.1;
  }
  if (networkEgressGb > 0) {
    confidence += 0.1;
  }

  return {
    candidate,
    confidence: round2(Math.min(0.98, confidence))
  };
};
