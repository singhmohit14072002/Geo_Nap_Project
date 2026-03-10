import type { ParserOutput } from "../services/parser.service";
import { analyzePdf } from "../adapters/document-intelligence.adapter";

export const parsePdfFile = async (
  file: Express.Multer.File
): Promise<ParserOutput> => {
  const rows = await analyzePdf(file.buffer);

  return {
    rawInfrastructureData: {
      rows
    },
    sourceType: "pdf",
    parsingConfidence: 0.92
  };
};
