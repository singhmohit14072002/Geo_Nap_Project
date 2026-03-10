const NETWORK_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET"
]);

const NON_RETRYABLE_ERROR_CODES = new Set([
  "INVALID_INPUT",
  "VALIDATION_ERROR",
  "REGION_MAPPING_NOT_FOUND",
  "PRICE_NOT_FOUND",
  "NO_PRICING_FOUND"
]);

const sleep = async (durationMs: number): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
};

const toStatusCode = (error: unknown): number | null => {
  if (!error || typeof error !== "object") {
    return null;
  }

  if ("statusCode" in error && typeof error.statusCode === "number") {
    return error.statusCode;
  }

  if ("status" in error && typeof error.status === "number") {
    return error.status;
  }

  if (
    "$metadata" in error &&
    error.$metadata &&
    typeof error.$metadata === "object" &&
    "httpStatusCode" in error.$metadata &&
    typeof error.$metadata.httpStatusCode === "number"
  ) {
    return error.$metadata.httpStatusCode;
  }

  if ("code" in error && typeof error.code === "number") {
    return error.code;
  }

  return null;
};

const isNetworkError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") {
    return false;
  }

  if ("code" in error && typeof error.code === "string") {
    return NETWORK_ERROR_CODES.has(error.code);
  }

  const message =
    "message" in error && typeof error.message === "string" ? error.message : "";
  return /(network|socket|timed out|timeout|econn|dns|connect)/i.test(message);
};

const isNonRetryableCode = (error: unknown): boolean => {
  if (!error || typeof error !== "object") {
    return false;
  }
  if ("code" in error && typeof error.code === "string") {
    return NON_RETRYABLE_ERROR_CODES.has(error.code);
  }
  return false;
};

const shouldRetryError = (error: unknown): boolean => {
  if (isNonRetryableCode(error)) {
    return false;
  }

  const statusCode = toStatusCode(error);
  if (statusCode !== null) {
    if (statusCode >= 500) {
      return true;
    }
    if (statusCode >= 400 && statusCode < 500) {
      return false;
    }
  }

  return isNetworkError(error);
};

export const retry = async <T>(
  fn: () => Promise<T>,
  retries = 2,
  delayMs = 500
): Promise<T> => {
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= retries) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const canRetry = attempt < retries && shouldRetryError(error);
      if (!canRetry) {
        throw error;
      }
      const backoffMs = delayMs * Math.pow(2, attempt);
      await sleep(backoffMs);
      attempt += 1;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
};

