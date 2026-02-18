import pdfParse from "pdf-parse";
import type { ParserOutput } from "../services/parser.service";

const normalizeText = (input: string): string => {
  return input.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
};

const captureNumber = (regex: RegExp, text: string): number | null => {
  const match = text.match(regex);
  if (!match?.[1]) {
    return null;
  }
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
};

export const parsePdfFile = async (
  file: Express.Multer.File
): Promise<ParserOutput> => {
  const result = await pdfParse(file.buffer);
  const textContent = normalizeText(result.text || "");
  if (!textContent) {
    throw Object.assign(new Error("No readable text found in PDF"), {
      statusCode: 422
    });
  }

  const extractedSignals = {
    cpu: captureNumber(/cpu\s*[:=-]?\s*(\d+)/i, textContent),
    ramGB: captureNumber(/ram\s*[:=-]?\s*(\d+(?:\.\d+)?)\s*gb/i, textContent),
    storageGB: captureNumber(/storage\s*[:=-]?\s*(\d+(?:\.\d+)?)\s*gb/i, textContent)
  };

  return {
    rawInfrastructureData: {
      textContent,
      extractedSignals
    },
    sourceType: "pdf",
    parsingConfidence: 0.6
  };
};
