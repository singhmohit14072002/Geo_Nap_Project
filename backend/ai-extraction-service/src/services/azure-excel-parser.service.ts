import * as XLSX from "xlsx";

export interface AzureEstimateRow {
  serviceCategory: string;
  serviceType: string;
  region: string;
  description: string;
}

const normalizeString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : typeof value === "number" ? String(value).trim() : "";

const normalizeRegion = (value: string): string =>
  value.toLowerCase().replace(/\s+/g, "");

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
    if (!serviceCategory && !serviceType && !description && !regionRaw) continue;
    rows.push({
      serviceCategory,
      serviceType,
      region: normalizeRegion(regionRaw),
      description
    });
  }
  // eslint-disable-next-line no-console
  console.log("RAW PARSED ROWS (TEXT):", rows);
  return rows;
};

type HeaderMatch = {
  headerRowIdx: number;
  headers: string[];
  indexMap: Record<string, number>;
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
    return { headerRowIdx: rowIdx, headers, indexMap };
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

    const { headerRowIdx, indexMap } = match;

    for (let i = headerRowIdx + 1; i < table.length; i++) {
      const rowArr = table[i] ?? [];
      const serviceCategory = normalizeString(rowArr[indexMap["service category"]] ?? "");
      const serviceType = normalizeString(rowArr[indexMap["service type"]] ?? "");
      const regionRaw = normalizeString(rowArr[indexMap["region"]] ?? "");
      const description = normalizeString(rowArr[indexMap["description"]] ?? "");

      // stop if the row is empty
      if (!serviceCategory && !serviceType && !description && !regionRaw) {
        continue;
      }

      rows.push({
        serviceCategory,
        serviceType,
        region: normalizeRegion(regionRaw),
        description
      });
    }

    if (rows.length) break;
  }

  // TEMP debug log for inspection
  // eslint-disable-next-line no-console
  console.log("RAW PARSED ROWS:", rows);

  return rows;
};
