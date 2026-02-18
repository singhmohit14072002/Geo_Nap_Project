import { parserResponseSchema } from "../schemas/upload.schema";
import { HttpError } from "../utils/http-error";

const parserBaseUrl =
  process.env.DOCUMENT_PARSER_URL ?? "http://127.0.0.1:4020";

export const parseDocumentFile = async (
  file: Buffer,
  fileName: string,
  mimeType: string
) => {
  const form = new FormData();
  const bytes = new Uint8Array(file.buffer, file.byteOffset, file.byteLength);
  const blob = new Blob([bytes as unknown as BlobPart], {
    type: mimeType || "application/octet-stream"
  });
  form.append("file", blob, fileName);

  const response = await fetch(`${parserBaseUrl}/parse`, {
    method: "POST",
    body: form
  });

  const text = await response.text();
  const payload = safeJsonParse(text);

  if (!response.ok) {
    throw new HttpError(
      502,
      `document-parser-service failed with status ${response.status}`,
      payload
    );
  }

  const parsed = parserResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new HttpError(
      502,
      "document-parser-service response validation failed",
      parsed.error.flatten()
    );
  }

  return parsed.data;
};

const safeJsonParse = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};
