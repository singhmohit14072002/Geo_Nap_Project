import * as XLSX from "xlsx";
import type { ParserOutput } from "../services/parser.service";

const normalizeHeader = (value: unknown): string => {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w]/g, "")
    .toLowerCase();
};

export const parseCsvFile = async (
  file: Express.Multer.File
): Promise<ParserOutput> => {
  const text = file.buffer.toString("utf8").trim();
  if (!text) {
    throw Object.assign(new Error("CSV file is empty"), {
      statusCode: 422
    });
  }

  const workbook = XLSX.read(text, { type: "string" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw Object.assign(new Error("CSV could not be parsed into a worksheet"), {
      statusCode: 422
    });
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null
  });

  const normalizedRows = rows.map((row) => {
    const next: Record<string, unknown> = {};
    Object.entries(row).forEach(([key, value]) => {
      next[normalizeHeader(key)] = value;
    });
    return next;
  });

  return {
    rawInfrastructureData: {
      rows: normalizedRows,
      sheetName: firstSheetName
    },
    sourceType: "csv",
    parsingConfidence: 0.9
  };
};
