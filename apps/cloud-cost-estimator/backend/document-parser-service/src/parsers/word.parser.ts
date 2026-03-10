import mammoth from "mammoth";
import type { ParserOutput } from "../services/parser.service";
import { parseWithAzureDocumentIntelligence } from "../services/azure-document-intelligence.service";

const normalizeText = (input: string): string => {
  return input.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
};

export const parseWordFile = async (
  file: Express.Multer.File
): Promise<ParserOutput> => {
  let textContent = "";
  let parsingConfidence = 0.8;
  let extractionSource: "azure-document-intelligence" | "mammoth-fallback" =
    "azure-document-intelligence";
  let azureMetadata: Record<string, unknown> = {};

  try {
    const azureOutput = await parseWithAzureDocumentIntelligence(file.buffer);
    textContent = normalizeText(azureOutput.textContent);
    azureMetadata = {
      pageCount: azureOutput.pageCount,
      tableCount: azureOutput.tableCount,
      paragraphCount: azureOutput.paragraphCount
    };
  } catch (azureError) {
    const fallback = await mammoth.extractRawText({ buffer: file.buffer });
    textContent = normalizeText(fallback.value || "");
    extractionSource = "mammoth-fallback";
    parsingConfidence = 0.7;
    azureMetadata = {
      fallbackReason:
        azureError instanceof Error ? azureError.message : String(azureError)
    };
  }

  if (!textContent) {
    throw Object.assign(new Error("No readable text found in DOCX"), {
      statusCode: 422
    });
  }

  return {
    rawInfrastructureData: {
      textContent,
      extractionSource,
      azureMetadata
    },
    sourceType: "word",
    parsingConfidence
  };
};
