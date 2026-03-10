import { ZodSchema } from "zod";
import { HttpError } from "../utils/http-error";

const truncate = (value: string, max = 600): string =>
  value.length > max ? `${value.slice(0, max)}...` : value;

interface RequestJsonArgs<T> {
  url: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  schema?: ZodSchema<T>;
  expectedStatuses?: number[];
}

export const requestJson = async <T = unknown>({
  url,
  method = "GET",
  body,
  headers = {},
  schema,
  expectedStatuses = [200]
}: RequestJsonArgs<T>): Promise<T> => {
  const response = await fetch(url, {
    method,
    headers: {
      ...headers,
      ...(body != null ? { "Content-Type": "application/json" } : {})
    },
    body: body != null ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  const parsedBody = text ? safeJsonParse(text) : undefined;

  if (!expectedStatuses.includes(response.status)) {
    throw new HttpError(
      502,
      `Downstream request failed (${method} ${url}) with status ${response.status}`,
      typeof parsedBody === "undefined" ? truncate(text) : parsedBody
    );
  }

  if (!schema) {
    return (parsedBody as T) ?? ({} as T);
  }

  const parsed = schema.safeParse(parsedBody);
  if (!parsed.success) {
    throw new HttpError(
      502,
      `Downstream response schema mismatch (${method} ${url})`,
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

