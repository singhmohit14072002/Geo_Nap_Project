import * as XLSX from "xlsx";
import type { ParserOutput } from "../services/parser.service";

const normalizeHeader = (value: unknown): string => {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w]/g, "")
    .toLowerCase();
};

export const parseExcelFile = async (
  file: Express.Multer.File
): Promise<ParserOutput> => {
  const workbook = XLSX.read(file.buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw Object.assign(new Error("Excel file does not contain any sheet"), {
      statusCode: 422
    });
  }

  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet) {
    throw Object.assign(new Error("First Excel sheet could not be loaded"), {
      statusCode: 422
    });
  }

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
      sheetName: firstSheetName,
      rows: normalizedRows
    },
    sourceType: "excel",
    parsingConfidence: 0.9
  };
};
