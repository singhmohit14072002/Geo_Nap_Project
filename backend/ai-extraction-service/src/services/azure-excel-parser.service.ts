import * as XLSX from "xlsx";

export interface AzureEstimateRow {
  serviceCategory: string;
  serviceType: string;
  region: string;
  description: string;
  estimatedMonthlyCost?: number;
  estimatedUpfrontCost?: number;
}

const normalizeString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : typeof value === "number" ? String(value).trim() : "";

const normalizeRegion = (value: string): string =>
  value.toLowerCase().replace(/\s+/g, "");

const parseCurrency = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.replace(/[^\d.-]/g, "");
  if (!normalized) {
    return undefined;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseMonthlyFromText = (text: string): number | undefined => {
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
    const parsed = Number(match[1].replace(/,/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const parseDelimitedLine = (line: string): string[] => {
  if (line.includes("\t")) {
    return line.split("\t").map((v) => v.trim());
  }
  return line
    .split(/\s{2,}/)
    .map((v) => v.trim())
    .filter(Boolean);
};

export const parseAzureEstimateText = (text: string): AzureEstimateRow[] => {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const targetHeaders = ["service category", "service type", "region", "description"];
  let headerIdx = -1;
  let delimiterHeaders: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const cols = parseDelimitedLine(lines[i]).map((c) => c.toLowerCase());
    const hasAll = targetHeaders.every((h) => cols.includes(h));
    if (hasAll) {
      headerIdx = i;
      delimiterHeaders = parseDelimitedLine(lines[i]);
      break;
    }
  }
  if (headerIdx === -1) return [];

  const rows: AzureEstimateRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = parseDelimitedLine(lines[i]);
    if (cols.length < 2) continue;
    const map: Record<string, string> = {};
    delimiterHeaders.forEach((h, idx) => {
      map[h.toLowerCase()] = cols[idx] ?? "";
    });
    const serviceCategory = normalizeString(map["service category"]);
    const serviceType = normalizeString(map["service type"]);
    const regionRaw = normalizeString(map["region"]);
    const description = normalizeString(map["description"]);
    const estimatedMonthlyCost =
      parseCurrency(map["estimated monthly cost"]) ??
      parseMonthlyFromText(`${map["description"] ?? ""} ${lines[i] ?? ""}`);
    const estimatedUpfrontCost = parseCurrency(map["estimated upfront cost"]);
    if (!serviceCategory && !serviceType && !description && !regionRaw) continue;
    rows.push({
      serviceCategory,
      serviceType,
      region: normalizeRegion(regionRaw),
      description,
      ...(estimatedMonthlyCost !== undefined ? { estimatedMonthlyCost } : {}),
      ...(estimatedUpfrontCost !== undefined ? { estimatedUpfrontCost } : {})
    });
  }
  return rows;
};

type HeaderMatch = {
  headerRowIdx: number;
  headers: string[];
  indexMap: Record<string, number>;
  optionalIndexMap: Record<string, number>;
};

const REQUIRED_HEADERS = ["service category", "service type", "region", "description"];

/**
 * Find a header row in a sheet by scanning all rows until one contains the required headers.
 */
const findHeaderRow = (table: Array<Array<string | number | null>>): HeaderMatch | null => {
  for (let rowIdx = 0; rowIdx < table.length; rowIdx++) {
    const row = table[rowIdx] ?? [];
    const headers = row.map((cell) =>
      typeof cell === "string" ? cell.trim() : typeof cell === "number" ? String(cell).trim() : ""
    );
    const lower = headers.map((h) => h.toLowerCase());
    const hasAll = REQUIRED_HEADERS.every((h) => lower.includes(h));
    if (!hasAll) continue;

    const indexMap: Record<string, number> = {};
    REQUIRED_HEADERS.forEach((h) => {
      indexMap[h] = lower.indexOf(h);
    });
    const optionalIndexMap: Record<string, number> = {};
    const monthlyIdx = lower.indexOf("estimated monthly cost");
    const upfrontIdx = lower.indexOf("estimated upfront cost");
    if (monthlyIdx >= 0) optionalIndexMap["estimated monthly cost"] = monthlyIdx;
    if (upfrontIdx >= 0) optionalIndexMap["estimated upfront cost"] = upfrontIdx;
    return { headerRowIdx: rowIdx, headers, indexMap, optionalIndexMap };
  }
  return null;
};

/**
 * Parse Azure calculator export (.xlsx) into normalized rows.
 * Scans all sheets; picks the first sheet containing the required headers.
 */
export const parseAzureEstimateExcel = async (
  buffer: Buffer
): Promise<AzureEstimateRow[]> => {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  if (!workbook.SheetNames.length) return [];

  let rows: AzureEstimateRow[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const table = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      defval: null,
      raw: true
    }) as Array<Array<string | number | null>>;

    if (!table.length) continue;

    const match = findHeaderRow(table);
    if (!match) continue;

    const { headerRowIdx, indexMap, optionalIndexMap } = match;

    for (let i = headerRowIdx + 1; i < table.length; i++) {
      const rowArr = table[i] ?? [];
      const serviceCategory = normalizeString(rowArr[indexMap["service category"]] ?? "");
      const serviceType = normalizeString(rowArr[indexMap["service type"]] ?? "");
      const regionRaw = normalizeString(rowArr[indexMap["region"]] ?? "");
      const description = normalizeString(rowArr[indexMap["description"]] ?? "");
      const rowText = rowArr.map((cell) => normalizeString(cell)).join(" ");
      const estimatedMonthlyCost =
        parseCurrency(rowArr[optionalIndexMap["estimated monthly cost"]]) ??
        parseMonthlyFromText(`${description} ${rowText}`);
      const estimatedUpfrontCost = parseCurrency(
        rowArr[optionalIndexMap["estimated upfront cost"]]
      );

      // stop if the row is empty
      if (!serviceCategory && !serviceType && !description && !regionRaw) {
        continue;
      }

      rows.push({
        serviceCategory,
        serviceType,
        region: normalizeRegion(regionRaw),
        description,
        ...(estimatedMonthlyCost !== undefined ? { estimatedMonthlyCost } : {}),
        ...(estimatedUpfrontCost !== undefined ? { estimatedUpfrontCost } : {})
      });
    }

    if (rows.length) break;
  }

  return rows;
};
