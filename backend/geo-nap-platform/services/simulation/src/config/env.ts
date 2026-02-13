import "dotenv/config";
import { z } from "zod";

const SimulationEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SIMULATION_PORT: z.coerce.number().int().min(1).max(65535).default(8083),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  RABBITMQ_URL: z.string().default("amqp://localhost:5672"),
  PRICING_SERVICE_URL: z.string().default("http://localhost:8082")
});

export const config = SimulationEnvSchema.parse(process.env);
