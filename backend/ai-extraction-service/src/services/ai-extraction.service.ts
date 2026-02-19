import {
  ExtractionCandidate,
  extractionCandidateSchema
} from "../schemas/extraction.schema";
import { buildExtractionPrompt } from "../utils/prompt-builder";
import { HttpError } from "../utils/http-error";
import logger from "../utils/logger";
import { callLlm } from "./llm-client.service";
import { callLlamaFallbackForExtraction } from "./llama-extraction.service";
import { ParsedFileResult } from "./file-parser.service";
import { extractExcelHeuristicCandidate } from "./excel-heuristic-extractor.service";

const MAX_TEXT_CHARS = Number(process.env.MAX_EXTRACTION_TEXT_CHARS ?? "120000");

export interface ExtractionSuccessResult {
  status: "SUCCESS";
  candidate: ExtractionCandidate;
  model: "primary" | "llama_fallback" | "heuristic_excel";
}

export interface ExtractionFailedResult {
  status: "EXTRACTION_FAILED";
  error: string;
  details?: Record<string, string>;
}

export type ExtractionResult = ExtractionSuccessResult | ExtractionFailedResult;

const extractJsonBlock = (rawContent: string): string => {
  const trimmed = rawContent.trim();

  // Direct JSON
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  // Markdown fenced block fallback
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  // Last resort: first object range
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1).trim();
  }

  throw new HttpError(422, "AI response did not contain valid JSON content");
};

const normalizeError = (error: unknown): string => {
  if (error instanceof HttpError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

const parseCandidateResponse = (
  rawContent: string,
  source: "primary" | "llama_fallback"
): ExtractionCandidate => {
  const jsonBlock = extractJsonBlock(rawContent);

  let extractedObj: unknown;
  try {
    extractedObj = JSON.parse(jsonBlock);
  } catch {
    throw new HttpError(422, `${source} extractor returned invalid JSON`);
  }

  const validated = extractionCandidateSchema.safeParse(extractedObj);
  if (!validated.success) {
    throw new HttpError(
      422,
      `${source} extracted infrastructure requirement failed schema validation`,
      validated.error.flatten()
    );
  }

  return validated.data;
};

const buildNormalizedExtractionInput = (
  parsedInput: ParsedFileResult
): Record<string, unknown> => {
  if (parsedInput.fileType === "xml") {
    return {
      sourceType: parsedInput.fileType,
      ...parsedInput.normalizedInput
    };
  }

  const content = typeof parsedInput.rawText === "string"
    ? parsedInput.rawText
    : "";
  const trimmedContent = content.length > MAX_TEXT_CHARS
    ? content.slice(0, MAX_TEXT_CHARS)
    : content;

  return {
    sourceType: parsedInput.fileType,
    ...parsedInput.normalizedInput,
    content: trimmedContent
  };
};

const callPrimaryExtractor = async (
  normalizedInput: Record<string, unknown>
): Promise<ExtractionCandidate> => {
  const prompt = buildExtractionPrompt(normalizedInput);

  const content = await callLlm(
    [
      {
        role: "system",
        content:
          "You extract infrastructure requirements. Return only JSON with the exact schema."
      },
      {
        role: "user",
        content: prompt
      }
    ],
    true
  );
  return parseCandidateResponse(content, "primary");
};

export const extractRequirementFromParsedInput = async (
  parsedInput: ParsedFileResult
): Promise<ExtractionResult> => {
  logger.info("EXTRACTION_STARTED", {
    fileType: parsedInput.fileType
  });

  const heuristic = extractExcelHeuristicCandidate(parsedInput);
  if (heuristic) {
    logger.info("EXTRACTION_SUCCESS", {
      model: "heuristic_excel",
      fileType: parsedInput.fileType,
      confidence: heuristic.confidence,
      computeCount: heuristic.candidate.compute?.length ?? 0
    });
    return {
      status: "SUCCESS",
      candidate: heuristic.candidate,
      model: "heuristic_excel"
    };
  }

  const normalizedInput = buildNormalizedExtractionInput(parsedInput);
  let primaryError = "";
  try {
    const candidate = await callPrimaryExtractor(normalizedInput);
    logger.info("EXTRACTION_SUCCESS", {
      model: "primary",
      fileType: parsedInput.fileType
    });
    return {
      status: "SUCCESS",
      candidate,
      model: "primary"
    };
  } catch (error) {
    primaryError = normalizeError(error);
    logger.error("AI_EXTRACTION_FAILED", {
      fileType: parsedInput.fileType,
      error: primaryError
    });
  }

  try {
    logger.info("LLAMA_FALLBACK_STARTED", {
      fileType: parsedInput.fileType
    });
    const fallbackRaw = await callLlamaFallbackForExtraction(normalizedInput);
    const candidate = parseCandidateResponse(fallbackRaw, "llama_fallback");
    logger.info("EXTRACTION_SUCCESS", {
      model: "llama_fallback",
      fileType: parsedInput.fileType
    });
    return {
      status: "SUCCESS",
      candidate,
      model: "llama_fallback"
    };
  } catch (error) {
    const fallbackError = normalizeError(error);
    logger.error("EXTRACTION_FAILED", {
      fileType: parsedInput.fileType,
      primaryError,
      fallbackError
    });
    return {
      status: "EXTRACTION_FAILED",
      error: "Primary extraction failed and Llama fallback was unable to produce valid requirements.",
      details: {
        primaryError,
        fallbackError
      }
    };
  }
};
