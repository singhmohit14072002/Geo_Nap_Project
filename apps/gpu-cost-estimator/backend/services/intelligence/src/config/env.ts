import "dotenv/config";
import { z } from "zod";

const IntelligenceEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  INTELLIGENCE_PORT: z.coerce.number().int().min(1).max(65535).default(8085),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DATABASE_URL: z.string().default("postgres://geo_nap:geo_nap@localhost:5432/geo_nap"),
  RABBITMQ_URL: z.string().default("amqp://localhost:5672"),
  PRICING_SERVICE_URL: z.string().default("http://localhost:8082"),
  AVAILABILITY_WINDOW: z.coerce.number().int().min(1).default(50)
});

export const config = IntelligenceEnvSchema.parse(process.env);
