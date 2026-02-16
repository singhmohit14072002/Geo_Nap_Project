import path from "path";
import pdfParse from "pdf-parse";
import * as XLSX from "xlsx";
import { HttpError } from "../utils/http-error";

export type SupportedFileType = "pdf" | "excel" | "text";

export interface ParsedFileResult {
  fileType: SupportedFileType;
  rawText: string;
}

const normalizeText = (input: string): string => {
  return input.replace(/\r\n/g, "\n").replace(/\u0000/g, "").trim();
};

const detectFileType = (file: Express.Multer.File): SupportedFileType => {
  const ext = path.extname(file.originalname || "").toLowerCase();
  const mime = (file.mimetype || "").toLowerCase();

  if (ext === ".pdf" || mime.includes("pdf")) {
    return "pdf";
  }
  if (
    ext === ".xlsx" ||
    ext === ".xls" ||
    ext === ".xlsm" ||
    mime.includes("spreadsheet") ||
    mime.includes("excel")
  ) {
    return "excel";
  }
  if (ext === ".txt" || ext === ".csv" || mime.includes("text")) {
    return "text";
  }

  throw new HttpError(
    415,
    `Unsupported file type: ${ext || mime || "unknown"}. Supported: PDF, Excel, TXT, CSV`
  );
};

const parsePdfBuffer = async (buffer: Buffer): Promise<string> => {
  const result = await pdfParse(buffer);
  return normalizeText(result.text || "");
};

const parseExcelBuffer = (buffer: Buffer): string => {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheets = workbook.SheetNames || [];
  const chunks: string[] = [];

  for (const sheetName of sheets) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      continue;
    }
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    const normalized = normalizeText(csv);
    if (!normalized) {
      continue;
    }
    chunks.push(`Sheet: ${sheetName}\n${normalized}`);
  }

  return normalizeText(chunks.join("\n\n"));
};

const parseTextBuffer = (buffer: Buffer): string => {
  return normalizeText(buffer.toString("utf8"));
};

export const parseUploadedFile = async (
  file: Express.Multer.File
): Promise<ParsedFileResult> => {
  if (!file || !file.buffer || file.buffer.length === 0) {
    throw new HttpError(400, "Uploaded file is empty");
  }

  const fileType = detectFileType(file);

  let rawText = "";
  if (fileType === "pdf") {
    rawText = await parsePdfBuffer(file.buffer);
  } else if (fileType === "excel") {
    rawText = parseExcelBuffer(file.buffer);
  } else {
    rawText = parseTextBuffer(file.buffer);
  }

  if (!rawText) {
    throw new HttpError(
      422,
      "Could not extract readable text from file. Ensure PDF is text-based or spreadsheet has content."
    );
  }

  return {
    fileType,
    rawText
  };
};

