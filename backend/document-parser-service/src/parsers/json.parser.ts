import type { ParserOutput } from "../services/parser.service";

const toRowArray = (value: unknown): Record<string, unknown>[] => {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null && !Array.isArray(item)
      )
      .map((item) => ({ ...item }));
  }

  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.rows)) {
      return toRowArray(obj.rows);
    }
    return [obj];
  }

  return [];
};

export const parseJsonFile = async (
  file: Express.Multer.File
): Promise<ParserOutput> => {
  const text = file.buffer.toString("utf8").trim();
  if (!text) {
    throw Object.assign(new Error("JSON file is empty"), {
      statusCode: 422
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw Object.assign(new Error("Invalid JSON file"), {
      statusCode: 422
    });
  }

  const rows = toRowArray(parsed);
  if (rows.length === 0) {
    throw Object.assign(new Error("JSON file does not contain object rows"), {
      statusCode: 422
    });
  }

  return {
    rawInfrastructureData: {
      rows
    },
    sourceType: "json",
    parsingConfidence: 0.95
  };
};
