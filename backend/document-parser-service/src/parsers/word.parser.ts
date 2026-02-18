import mammoth from "mammoth";
import type { ParserOutput } from "../services/parser.service";

const normalizeText = (input: string): string => {
  return input.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
};

export const parseWordFile = async (
  file: Express.Multer.File
): Promise<ParserOutput> => {
  const result = await mammoth.extractRawText({ buffer: file.buffer });
  const textContent = normalizeText(result.value || "");
  if (!textContent) {
    throw Object.assign(new Error("No readable text found in DOCX"), {
      statusCode: 422
    });
  }

  return {
    rawInfrastructureData: {
      textContent
    },
    sourceType: "word",
    parsingConfidence: 0.7
  };
};
