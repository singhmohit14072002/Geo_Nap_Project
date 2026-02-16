import { z } from "zod";
import {
  ExtractionCandidate,
  extractionCandidateSchema
} from "../schemas/extraction.schema";
import { buildExtractionPrompt } from "../utils/prompt-builder";
import { HttpError } from "../utils/http-error";
import { callLlm } from "./llm-client.service";

const MAX_TEXT_CHARS = Number(process.env.MAX_EXTRACTION_TEXT_CHARS ?? "120000");

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

const callOpenAIForExtraction = async (
  rawText: string
): Promise<ExtractionCandidate> => {
  const trimmedText = rawText.length > MAX_TEXT_CHARS
    ? rawText.slice(0, MAX_TEXT_CHARS)
    : rawText;
  const prompt = buildExtractionPrompt(trimmedText);

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
  const jsonBlock = extractJsonBlock(content);

  let extractedObj: unknown;
  try {
    extractedObj = JSON.parse(jsonBlock);
  } catch {
    throw new HttpError(422, "AI returned invalid JSON");
  }

  const validated = extractionCandidateSchema.safeParse(extractedObj);
  if (!validated.success) {
    throw new HttpError(
      422,
      "Extracted infrastructure requirement failed schema validation",
      validated.error.flatten()
    );
  }

  return validated.data;
};

export const extractRequirementFromText = async (
  rawText: string
): Promise<ExtractionCandidate> => {
  return callOpenAIForExtraction(rawText);
};
