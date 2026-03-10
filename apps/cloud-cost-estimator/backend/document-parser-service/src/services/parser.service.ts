import { parseExcelFile } from "../parsers/excel.parser";
import { parseCsvFile } from "../parsers/csv.parser";
import { parseJsonFile } from "../parsers/json.parser";
import { parsePdfFile } from "../parsers/pdf.parser";
import { parseWordFile } from "../parsers/word.parser";
import { parseXmlFile } from "../parsers/xml.parser";
import { detectFileType, SourceType } from "../utils/file-type.util";
import logger from "../utils/logger";
import { normalizeRows } from "./row-normalizer.service";

export interface ParserOutput {
  rawInfrastructureData: Record<string, unknown>;
  sourceType: SourceType;
  parsingConfidence: number;
}

const ensureRows = (output: ParserOutput): ParserOutput => {
  const data = output.rawInfrastructureData ?? {};
  if (Array.isArray(data.rows)) {
    return output;
  }

  if (Array.isArray(data.servers)) {
    return {
      ...output,
      rawInfrastructureData: {
        ...data,
        rows: data.servers
      }
    };
  }

  if (typeof data.textContent === "string" && data.textContent.trim().length > 0) {
    return {
      ...output,
      rawInfrastructureData: {
        ...data,
        rows: [{ textContent: data.textContent }]
      }
    };
  }

  return {
    ...output,
    rawInfrastructureData: {
      ...data,
      rows: []
    }
  };
};

const normalizeTabularRows = (output: ParserOutput): ParserOutput => {
  const ensured = ensureRows(output);
  const rawRows = Array.isArray(ensured.rawInfrastructureData.rows)
    ? ensured.rawInfrastructureData.rows
    : [];
  const normalizedRows = normalizeRows(rawRows);

  return {
    ...ensured,
    rawInfrastructureData: {
      ...ensured.rawInfrastructureData,
      rows: normalizedRows,
      normalization: {
        inputRows: rawRows.length,
        outputRows: normalizedRows.length
      }
    }
  };
};

export const parseFile = async (
  file: Express.Multer.File
): Promise<ParserOutput> => {
  const sourceType = detectFileType(file);

  const mime = (file.mimetype || "").toLowerCase();
  const isPdf = mime === "application/pdf" || sourceType === "pdf";
  const isExcel =
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-excel" ||
    sourceType === "excel";
  const isCsv = mime === "text/csv" || sourceType === "csv";
  const isJson = mime === "application/json" || sourceType === "json";

  if (isPdf) {
    try {
      return normalizeTabularRows(await parsePdfFile(file));
    } catch (error) {
      logger.error("PDF_PARSE_AZURE_FAILED", {
        fileName: file.originalname,
        mimeType: file.mimetype,
        error: error instanceof Error ? error.message : String(error)
      });
      throw Object.assign(
        new Error(
          "Unable to extract tabular data from PDF using Azure Document Intelligence. Verify the PDF contains readable tables and retry."
        ),
        { statusCode: 422 }
      );
    }
  }

  if (isExcel) {
    return normalizeTabularRows(await parseExcelFile(file));
  }

  if (isCsv) {
    return normalizeTabularRows(await parseCsvFile(file));
  }

  if (isJson) {
    return normalizeTabularRows(await parseJsonFile(file));
  }

  if (sourceType === "xml") {
    return ensureRows(await parseXmlFile(file));
  }

  if (sourceType === "word") {
    return ensureRows(await parseWordFile(file));
  }

  throw Object.assign(
    new Error("Unsupported file type. Supported: PDF, Excel, CSV, JSON, XML, DOCX"),
    {
      statusCode: 415
    }
  );
};

export const parseDocument = parseFile;
