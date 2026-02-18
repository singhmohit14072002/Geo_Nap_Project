import path from "path";
import { lookup as lookupMime } from "mime-types";

export type SourceType = "xml" | "excel" | "pdf" | "word";

const MIME_MAP: Record<string, SourceType> = {
  "application/xml": "xml",
  "text/xml": "xml",
  "application/vnd.ms-excel": "excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "excel",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "word"
};

const EXT_MAP: Record<string, SourceType> = {
  ".xml": "xml",
  ".xlsx": "excel",
  ".xls": "excel",
  ".pdf": "pdf",
  ".docx": "word"
};

export const detectFileType = (file: Express.Multer.File): SourceType => {
  const ext = path.extname(file.originalname || "").toLowerCase();
  if (ext in EXT_MAP) {
    return EXT_MAP[ext];
  }

  const mime = (file.mimetype || "").toLowerCase();
  if (mime in MIME_MAP) {
    return MIME_MAP[mime];
  }

  const fromLookup = (lookupMime(file.originalname || "") || "").toString().toLowerCase();
  if (fromLookup in MIME_MAP) {
    return MIME_MAP[fromLookup];
  }

  throw Object.assign(new Error("Unsupported file type. Supported: XML, Excel, PDF, DOCX"), {
    statusCode: 415
  });
};
