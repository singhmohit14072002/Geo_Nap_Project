import { createLogger, format, transports } from "winston";

const serviceName = process.env.SERVICE_NAME ?? "ai-extraction-service";

const logger = createLogger({
  level: process.env.LOG_LEVEL ?? "info",
  defaultMeta: { service: serviceName },
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [new transports.Console()]
});

export default logger;
