import { AppError } from "./errors";

export function toErrorPayload(error: unknown) {
  const appError = error instanceof AppError ? error : new AppError("Unexpected internal error");
  return {
    statusCode: appError.statusCode,
    body: {
      error: {
        code: appError.code,
        message: appError.message,
        details: appError.details ?? null
      }
    }
  };
}
