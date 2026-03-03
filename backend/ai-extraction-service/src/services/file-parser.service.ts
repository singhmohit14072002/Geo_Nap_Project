import path from "path";
import pdfParse from "pdf-parse";
import * as XLSX from "xlsx";
import { XMLParser } from "fast-xml-parser";
import { HttpError } from "../utils/http-error";

export type SupportedFileType = "pdf" | "excel" | "text" | "xml" | "azure_estimate_excel";

export interface ParsedFileResult {
  fileType: SupportedFileType;
  rawText: string;
  normalizedInput: Record<string, unknown>;
  azureEstimateRows?: Array<{
    serviceCategory: string;
    serviceType: string;
    region: string;
    description: string;
  }>;
}

const normalizeText = (input: string): string => {
  return input.replace(/\r\n/g, "\n").replace(/\u0000/g, "").trim();
};

const toArray = <T>(value: T | T[] | null | undefined): T[] => {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === null || value === undefined) {
    return [];
  }
  return [value];
};

const maybeNumber = (value: unknown): number | null => {
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

const maybeString = (value: unknown): string | null => {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized ? normalized : null;
  }
  return null;
};

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseAttributeValue: true,
  parseTagValue: true,
  trimValues: true,
  allowBooleanAttributes: true
});

const detectFileType = (file: Express.Multer.File): SupportedFileType => {
  const ext = path.extname(file.originalname || "").toLowerCase();
  const mime = (file.mimetype || "").toLowerCase();

  if (
    ext === ".xlsx" ||
    ext === ".xls" ||
    ext === ".xlsm" ||
    mime.includes("spreadsheet") ||
    mime.includes("excel")
  ) {
    return "excel";
  }
  if (ext === ".pdf" || mime.includes("pdf")) {
    return "pdf";
  }
  if (
    ext === ".xml" ||
    mime.includes("application/xml") ||
    mime.includes("text/xml") ||
    mime.endsWith("+xml")
  ) {
    return "xml";
  }
  if (ext === ".txt" || ext === ".csv" || mime.includes("text")) {
    return "text";
  }

  throw new HttpError(
    415,
    `Unsupported file type: ${ext || mime || "unknown"}. Supported: XML, PDF, Excel, TXT, CSV`
  );
};

const parsePdfBuffer = async (buffer: Buffer): Promise<string> => {
  const result = await pdfParse(buffer);
  return normalizeText(result.text || "");
};

const parseExcelWorkbookToText = (workbook: XLSX.WorkBook): string => {
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

const extractServerNodes = (input: unknown, collector: Record<string, unknown>[]): void => {
  if (!input || typeof input !== "object") {
    return;
  }

  if (Array.isArray(input)) {
    for (const item of input) {
      extractServerNodes(item, collector);
    }
    return;
  }

  const record = input as Record<string, unknown>;
  const hints = ["server", "servers", "instance", "instances", "vm", "machine", "node"];

  for (const [key, value] of Object.entries(record)) {
    const lower = key.toLowerCase();
    const isServerLikeKey = hints.includes(lower);

    if (isServerLikeKey) {
      for (const item of toArray(value)) {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          collector.push(item as Record<string, unknown>);
        }
      }
    }

    if (value && typeof value === "object") {
      extractServerNodes(value, collector);
    }
  }

  // If the node itself looks like a compute-server record, keep it.
  const hasComputeShape =
    "cpu" in record ||
    "vCPU" in record ||
    "vcpu" in record ||
    "memory" in record ||
    "ram" in record ||
    "storage" in record;
  if (hasComputeShape) {
    collector.push(record);
  }
};

const normalizeServerRecord = (record: Record<string, unknown>): Record<string, unknown> => {
  const cpu = maybeNumber(
    record.cpu ?? record.vCPU ?? record.vcpu ?? record.cores ?? record.coreCount
  );
  const memory = maybeNumber(record.memory ?? record.ram ?? record.ramGB ?? record.memGB);
  const storage = maybeNumber(
    record.storage ?? record.storageGB ?? record.disk ?? record.diskGB
  );
  const quantity = maybeNumber(record.quantity ?? record.count ?? record.instances) ?? 1;
  const os = maybeString(record.os ?? record.osType ?? record.platform);

  const normalized: Record<string, unknown> = {
    cpu,
    memory,
    storage,
    os,
    quantity
  };

  for (const [key, value] of Object.entries(record)) {
    if (!(key in normalized)) {
      normalized[key] = value;
    }
  }

  return normalized;
};

const parseXmlBuffer = (
  buffer: Buffer
): { rawText: string; structuredJson: Record<string, unknown> } => {
  const xmlText = normalizeText(buffer.toString("utf8"));
  if (!xmlText) {
    throw new HttpError(422, "XML file is empty");
  }

  let parsedXml: unknown;
  try {
    parsedXml = xmlParser.parse(xmlText);
  } catch (error) {
    throw new HttpError(
      422,
      "Failed to parse XML file",
      error instanceof Error ? { message: error.message } : undefined
    );
  }

  const serverCandidates: Record<string, unknown>[] = [];
  extractServerNodes(parsedXml, serverCandidates);

  const seen = new Set<string>();
  const servers = serverCandidates
    .map(normalizeServerRecord)
    .filter((record) => {
      const key = JSON.stringify(record);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });

  return {
    rawText: xmlText,
    structuredJson: {
      servers,
      sourceType: "xml",
      parsedXml
    }
  };
};

const buildNormalizedInput = (
  fileType: SupportedFileType,
  rawText: string,
  extra: Record<string, unknown> = {}
): Record<string, unknown> => {
  return {
    sourceType: fileType,
    content: rawText,
    ...extra
  };
};

export const parseUploadedFile = async (
  file: Express.Multer.File
): Promise<ParsedFileResult> => {
  if (!file || !file.buffer || file.buffer.length === 0) {
    throw new HttpError(400, "Uploaded file is empty");
  }

  let fileType = detectFileType(file);

  let rawText = "";
  let normalizedInput: Record<string, unknown> = {};
  let azureEstimateRows:
    | Array<{
        serviceCategory: string;
        serviceType: string;
        region: string;
        description: string;
      }>
    | undefined;
  if (fileType === "pdf") {
    rawText = await parsePdfBuffer(file.buffer);
    normalizedInput = buildNormalizedInput(fileType, rawText);
  } else if (fileType === "excel") {
    const workbook = XLSX.read(file.buffer, { type: "buffer" });
    const sheets = workbook.SheetNames || [];
    const sheetRows = sheets.map((sheetName) => ({
      sheetName,
      rows: XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        defval: null
      })
    }));

    // Detect Azure estimate export on first sheet by header names.
    if (sheetRows.length > 0 && Array.isArray(sheetRows[0].rows)) {
      const firstRows = sheetRows[0].rows as Array<Record<string, unknown>>;
      if (firstRows.length > 0) {
        const headers = Object.keys(firstRows[0] ?? {}).map((h) =>
          h.toLowerCase().trim()
        );
        const hasAzureHeaders =
          headers.includes("service category") &&
          headers.includes("service type") &&
          headers.includes("region") &&
          headers.includes("description");
        if (hasAzureHeaders) {
          const normalizedRows = firstRows
            .map((row) => {
              const serviceCategory =
                maybeString(row["Service category"]) ??
                maybeString(row["service category"]) ??
                "";
              const serviceType =
                maybeString(row["Service type"]) ??
                maybeString(row["service type"]) ??
                "";
              const region =
                maybeString(row["Region"]) ??
                maybeString(row["region"]) ??
                "";
              const description =
                maybeString(row["Description"]) ??
                maybeString(row["description"]) ??
                "";
              if (!serviceCategory && !serviceType && !description) {
                return null;
              }
              return {
                serviceCategory,
                serviceType,
                region: (region || "").toLowerCase().replace(/\s+/g, ""),
                description: description ?? ""
              };
            })
            .filter(Boolean) as Array<{
            serviceCategory: string;
            serviceType: string;
            region: string;
            description: string;
          }>;

          if (normalizedRows.length > 0) {
            fileType = "azure_estimate_excel";
            azureEstimateRows = normalizedRows;
          }
        }
      }
    }

    rawText = parseExcelWorkbookToText(workbook);
    normalizedInput = buildNormalizedInput(fileType, rawText, {
      sheetRows
    });
  } else if (fileType === "xml") {
    const parsed = parseXmlBuffer(file.buffer);
    rawText = parsed.rawText;
    normalizedInput = {
      sourceType: fileType,
      structured: parsed.structuredJson
    };
  } else {
    rawText = parseTextBuffer(file.buffer);
    normalizedInput = buildNormalizedInput(fileType, rawText);
  }

  if (!rawText) {
    throw new HttpError(
      422,
      "Could not extract readable text from file. Ensure PDF is text-based or spreadsheet has content."
    );
  }

  return {
    fileType,
    rawText,
    normalizedInput,
    ...(azureEstimateRows ? { azureEstimateRows } : {})
  };
};
