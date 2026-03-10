import { DocumentAnalysisClient as DocumentIntelligenceClient } from "@azure/ai-form-recognizer";
import { AzureKeyCredential } from "@azure/core-auth";
import { env } from "../config/env";
import logger from "../utils/logger";

type TableCell = {
  rowIndex?: number;
  columnIndex?: number;
  content?: string;
};

type AnalyzeTable = {
  rowCount?: number;
  columnCount?: number;
  cells?: TableCell[];
};

const client = new DocumentIntelligenceClient(
  env.azureDocEndpoint,
  new AzureKeyCredential(env.azureDocKey)
);

const normalizeHeader = (value: string, columnIndex: number): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return `column_${columnIndex + 1}`;
  }
  return trimmed;
};

const tableToRows = (table: AnalyzeTable): Record<string, string>[] => {
  const rowCount = Number(table.rowCount ?? 0);
  const columnCount = Number(table.columnCount ?? 0);
  if (rowCount < 2 || columnCount <= 0 || !Array.isArray(table.cells)) {
    return [];
  }

  const matrix: string[][] = Array.from({ length: rowCount }, () =>
    Array.from({ length: columnCount }, () => "")
  );

  for (const cell of table.cells) {
    const rowIndex = Number(cell.rowIndex ?? -1);
    const columnIndex = Number(cell.columnIndex ?? -1);
    if (
      rowIndex < 0 ||
      columnIndex < 0 ||
      rowIndex >= rowCount ||
      columnIndex >= columnCount
    ) {
      continue;
    }
    matrix[rowIndex][columnIndex] = (cell.content ?? "").trim();
  }

  const headers = matrix[0].map((value, idx) => normalizeHeader(value, idx));
  const rows: Record<string, string>[] = [];

  for (let r = 1; r < matrix.length; r += 1) {
    const row = matrix[r];
    const hasAnyValue = row.some((value) => value.trim().length > 0);
    if (!hasAnyValue) {
      continue;
    }

    const mapped: Record<string, string> = {};
    for (let c = 0; c < headers.length; c += 1) {
      mapped[headers[c]] = row[c] ?? "";
    }
    rows.push(mapped);
  }

  return rows;
};

export const analyzePdf = async (buffer: Buffer): Promise<Record<string, string>[]> => {
  try {
    const poller = await client.beginAnalyzeDocument("prebuilt-layout", buffer);
    const result = await poller.pollUntilDone();

    const tables: AnalyzeTable[] = Array.isArray((result as { tables?: unknown[] }).tables)
      ? ((result as { tables?: AnalyzeTable[] }).tables ?? [])
      : [];

    if (tables.length === 0) {
      throw Object.assign(
        new Error(
          "No tables found in PDF using Azure Document Intelligence prebuilt-layout model"
        ),
        { statusCode: 422 }
      );
    }

    const structuredRows: Record<string, string>[] = [];
    for (const table of tables) {
      const rows = tableToRows(table);
      structuredRows.push(...rows);
    }

    if (structuredRows.length === 0) {
      throw Object.assign(
        new Error(
          "Tables were detected but no structured rows could be extracted from the PDF"
        ),
        { statusCode: 422 }
      );
    }

    return structuredRows;
  } catch (error) {
    logger.error("AZURE_DOCUMENT_INTELLIGENCE_PDF_ANALYSIS_FAILED", {
      error: error instanceof Error ? error.message : String(error)
    });

    const statusCode =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof (error as { statusCode?: unknown }).statusCode === "number"
        ? ((error as { statusCode: number }).statusCode ?? 502)
        : 502;

    const message =
      error instanceof Error
        ? error.message
        : "Azure Document Intelligence PDF analysis failed";

    throw Object.assign(new Error(message), { statusCode });
  }
};
