import { parseExcelFile } from "../parsers/excel.parser";
import { parsePdfFile } from "../parsers/pdf.parser";
import { parseWordFile } from "../parsers/word.parser";
import { parseXmlFile } from "../parsers/xml.parser";
import { detectFileType, SourceType } from "../utils/file-type.util";

export interface ParserOutput {
  rawInfrastructureData: Record<string, unknown>;
  sourceType: SourceType;
  parsingConfidence: number;
}

export const parseDocument = async (
  file: Express.Multer.File
): Promise<ParserOutput> => {
  const sourceType = detectFileType(file);

  switch (sourceType) {
    case "xml":
      return parseXmlFile(file);
    case "excel":
      return parseExcelFile(file);
    case "pdf":
      return parsePdfFile(file);
    case "word":
      return parseWordFile(file);
    default:
      throw Object.assign(new Error(`Unsupported source type: ${sourceType}`), {
        statusCode: 415
      });
  }
};
