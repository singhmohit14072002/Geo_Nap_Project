import pino, { Logger as PinoLogger } from "pino";
import { getRequestContext } from "./request-context";

type LogLevel = "debug" | "info" | "warn" | "error";

export interface AppLogger {
  debug(message: string, context?: unknown): void;
  info(message: string, context?: unknown): void;
  warn(message: string, context?: unknown): void;
  error(message: string, context?: unknown): void;
}

const serviceName = process.env.SERVICE_NAME ?? "cost-estimator-service";

const pinoLogger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: {
    service: serviceName
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  mixin: () => {
    const context = getRequestContext();
    if (!context?.requestId) {
      return {};
    }
    return { requestId: context.requestId };
  },
  formatters: {
    level: (label) => ({ level: label })
  }
});

const writeLog = (
  target: PinoLogger,
  level: LogLevel,
  message: string,
  context?: unknown
): void => {
  if (context === undefined) {
    target[level](message);
    return;
  }

  if (typeof context === "object" && context !== null) {
    target[level](context, message);
    return;
  }

  target[level]({ context }, message);
};

const createLogger = (target: PinoLogger): AppLogger => ({
  debug: (message: string, context?: unknown): void => {
    writeLog(target, "debug", message, context);
  },
  info: (message: string, context?: unknown): void => {
    writeLog(target, "info", message, context);
  },
  warn: (message: string, context?: unknown): void => {
    writeLog(target, "warn", message, context);
  },
  error: (message: string, context?: unknown): void => {
    writeLog(target, "error", message, context);
  }
});

const logger = createLogger(pinoLogger);

export default logger;
