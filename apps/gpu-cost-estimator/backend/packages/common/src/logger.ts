import pino from "pino";

export function createLogger(service: string, level = process.env.LOG_LEVEL || "info") {
  return pino({
    level,
    base: { service },
    timestamp: pino.stdTimeFunctions.isoTime
  });
}
