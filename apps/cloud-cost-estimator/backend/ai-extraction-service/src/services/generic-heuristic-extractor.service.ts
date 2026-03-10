import { ExtractionCandidate } from "../schemas/extraction.schema";
import { ParsedFileResult } from "./file-parser.service";

export interface GenericHeuristicExtraction {
  candidate: ExtractionCandidate;
  confidence: number;
}

type ComputeCandidate = NonNullable<ExtractionCandidate["compute"]>[number];

const round2 = (value: number): number => Number(value.toFixed(2));

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").trim();
    if (!cleaned) {
      return null;
    }
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizeRegion = (value: string): string => {
  const key = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const map: Record<string, string> = {
    centralindia: "centralindia",
    southindia: "southindia",
    eastus: "eastus",
    westus2: "westus2",
    apsouth1: "ap-south-1",
    apsouth2: "ap-south-2",
    useast1: "us-east-1",
    useast2: "us-east-2",
    uswest1: "us-west-1",
    uswest2: "us-west-2",
    asiasouth1: "asia-south1",
    asiasouth2: "asia-south2",
    centralus: "centralus",
    westeurope: "westeurope",
    northeurope: "northeurope"
  };
  return map[key] ?? key;
};

const detectRegion = (rawText: string): string | null => {
  const explicitRegion = rawText.match(
    /\b(?:region|location)\b\s*[:\-]?\s*([a-z][a-z0-9\- ]{2,40})/i
  );
  if (explicitRegion?.[1]) {
    return normalizeRegion(explicitRegion[1]);
  }

  const regionTokens = [
    "central india",
    "south india",
    "east us",
    "west us 2",
    "ap-south-1",
    "ap-south-2",
    "asia-south1",
    "asia-south2"
  ];
  const lowered = rawText.toLowerCase();
  for (const token of regionTokens) {
    if (lowered.includes(token)) {
      return normalizeRegion(token);
    }
  }
  return null;
};

const detectOsType = (text: string): "linux" | "windows" | null => {
  const lower = text.toLowerCase();
  if (lower.includes("windows")) {
    return "windows";
  }
  if (lower.includes("linux") || lower.includes("ubuntu") || lower.includes("debian")) {
    return "linux";
  }
  return null;
};

const parseNetworkEgress = (rawText: string): number | null => {
  const regex =
    /(\d+(?:\.\d+)?)\s*gb\s*(?:outbound|egress|data\s+transfer(?:\s*out)?|internet\s+egress)/gi;
  let total = 0;
  let matched = false;
  let current = regex.exec(rawText);
  while (current) {
    const value = toNumber(current[1]);
    if (value !== null) {
      total += value;
      matched = true;
    }
    current = regex.exec(rawText);
  }
  return matched ? round2(total) : null;
};

const parseDatabase = (
  rawText: string
): ExtractionCandidate["database"] => {
  const lower = rawText.toLowerCase();
  const hasDbSignal =
    lower.includes("database") ||
    lower.includes("postgres") ||
    lower.includes("mysql") ||
    lower.includes("mssql") ||
    lower.includes("sql server");

  if (!hasDbSignal) {
    return {
      engine: "none",
      storageGB: 0,
      ha: false
    };
  }

  const storageMatch = rawText.match(
    /(?:database|db|sql)[^.\n]{0,80}?(\d+(?:\.\d+)?)\s*gb/i
  );
  const storageGB = storageMatch ? toNumber(storageMatch[1]) ?? 0 : 0;

  let engine: "postgres" | "mysql" | "mssql" | "none" = "none";
  if (lower.includes("postgres")) {
    engine = "postgres";
  } else if (lower.includes("mysql")) {
    engine = "mysql";
  } else if (lower.includes("mssql") || lower.includes("sql server")) {
    engine = "mssql";
  }

  const ha = /high\s+availability|\bha\b/.test(lower);

  return {
    engine,
    storageGB: round2(Math.max(0, storageGB)),
    ha
  };
};

const parseFromXmlStructured = (parsed: ParsedFileResult): ComputeCandidate[] => {
  const structured = parsed.normalizedInput.structured as
    | { servers?: unknown[] }
    | undefined;
  if (!Array.isArray(structured?.servers)) {
    return [];
  }

  const servers = structured.servers;
  const result: ComputeCandidate[] = [];

  for (const server of servers) {
    if (!server || typeof server !== "object") {
      continue;
    }
    const row = server as Record<string, unknown>;
    const vcpu = toNumber(row.cpu ?? row.vcpu ?? row.vCPU);
    const ramGB = toNumber(row.memory ?? row.ram ?? row.ramGB);
    const storageGB = toNumber(row.storage ?? row.storageGB ?? row.disk ?? row.diskGB);
    const quantity = toNumber(row.quantity ?? row.count) ?? 1;
    const os = detectOsType(String(row.os ?? row.osType ?? ""));

    result.push({
      ...(vcpu !== null ? { vCPU: Math.max(1, Math.round(vcpu)) } : {}),
      ...(ramGB !== null ? { ramGB: round2(Math.max(0, ramGB)) } : {}),
      ...(storageGB !== null ? { storageGB: round2(Math.max(0, storageGB)) } : {}),
      storageType: "standard",
      ...(os ? { osType: os } : {}),
      quantity: Math.max(1, Math.round(quantity))
    });
  }

  return result;
};

const parseFromText = (rawText: string): ComputeCandidate[] => {
  const compute: ComputeCandidate[] = [];
  const dedupe = new Set<string>();
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const directPattern =
    /(\d+(?:\.\d+)?)\s*(?:instances?|servers?|vms?|x)?[^.\n]{0,80}?(\d+(?:\.\d+)?)\s*(?:vcpus?|vcores?|cores?)\b[^.\n]{0,80}?(\d+(?:\.\d+)?)\s*gb\s*ram\b/i;

  for (const line of lines) {
    const m = line.match(directPattern);
    if (!m) {
      continue;
    }
    const quantity = toNumber(m[1]) ?? 1;
    const vcpu = toNumber(m[2]);
    const ramGB = toNumber(m[3]);
    if (vcpu === null || ramGB === null) {
      continue;
    }

    const storageMatch = line.match(/(\d+(?:\.\d+)?)\s*gb\s*(?:managed\s+)?(?:disk|storage|ssd|hdd)/i);
    const storageGB = storageMatch ? toNumber(storageMatch[1]) : null;
    const os = detectOsType(line);
    const storageType = /ssd/i.test(line)
      ? "ssd"
      : /hdd/i.test(line)
      ? "hdd"
      : "standard";

    const item: ComputeCandidate = {
      vCPU: Math.max(1, Math.round(vcpu)),
      ramGB: round2(Math.max(0, ramGB)),
      ...(storageGB !== null ? { storageGB: round2(Math.max(0, storageGB)) } : {}),
      storageType,
      ...(os ? { osType: os } : {}),
      quantity: Math.max(1, Math.round(quantity))
    };
    const key = JSON.stringify(item);
    if (!dedupe.has(key)) {
      dedupe.add(key);
      compute.push(item);
    }
  }

  if (compute.length > 0) {
    return compute;
  }

  const globalVcpu = rawText.match(/(\d+(?:\.\d+)?)\s*(?:vcpus?|vcores?|cores?)\b/i);
  const globalRam = rawText.match(/(\d+(?:\.\d+)?)\s*gb\s*ram\b/i);
  const globalStorage = rawText.match(/(\d+(?:\.\d+)?)\s*gb\s*(?:managed\s+)?(?:disk|storage|ssd|hdd)\b/i);
  const quantityMatch =
    rawText.match(/(\d+(?:\.\d+)?)\s*(?:instances?|servers?|vms?)\b/i) ??
    rawText.match(/(\d+(?:\.\d+)?)\s*x\s*[a-z]/i);
  const os = detectOsType(rawText);

  const partial: ComputeCandidate = {
    ...(globalVcpu?.[1] ? { vCPU: Math.max(1, Math.round(toNumber(globalVcpu[1]) ?? 0)) } : {}),
    ...(globalRam?.[1] ? { ramGB: round2(Math.max(0, toNumber(globalRam[1]) ?? 0)) } : {}),
    ...(globalStorage?.[1]
      ? { storageGB: round2(Math.max(0, toNumber(globalStorage[1]) ?? 0)) }
      : {}),
    storageType: /ssd/i.test(rawText) ? "ssd" : /hdd/i.test(rawText) ? "hdd" : "standard",
    ...(os ? { osType: os } : {}),
    ...(quantityMatch?.[1]
      ? { quantity: Math.max(1, Math.round(toNumber(quantityMatch[1]) ?? 1)) }
      : { quantity: 1 })
  };

  const hasAnySignal =
    partial.vCPU !== undefined ||
    partial.ramGB !== undefined ||
    partial.storageGB !== undefined;
  if (hasAnySignal) {
    return [partial];
  }

  return [];
};

export const extractGenericHeuristicCandidate = (
  parsed: ParsedFileResult
): GenericHeuristicExtraction => {
  const rawText = parsed.rawText ?? "";
  const region = detectRegion(rawText);
  const compute =
    parsed.fileType === "xml"
      ? parseFromXmlStructured(parsed)
      : parseFromText(rawText);

  const safeCompute = compute.length > 0 ? compute : [{}];
  const database = parseDatabase(rawText);
  const egress = parseNetworkEgress(rawText);

  const candidate: ExtractionCandidate = {
    compute: safeCompute,
    database,
    ...(egress !== null ? { network: { dataEgressGB: egress } } : {}),
    region
  };

  let confidence = 0.2;
  if (compute.length > 0) {
    confidence += 0.35;
  }
  if (region) {
    confidence += 0.15;
  }
  if (candidate.database?.engine && candidate.database.engine !== "none") {
    confidence += 0.1;
  }
  if (candidate.network?.dataEgressGB && candidate.network.dataEgressGB > 0) {
    confidence += 0.15;
  }
  if (
    compute.some((item) => item.vCPU !== undefined && item.ramGB !== undefined)
  ) {
    confidence += 0.15;
  }

  return {
    candidate,
    confidence: round2(Math.min(0.95, confidence))
  };
};
