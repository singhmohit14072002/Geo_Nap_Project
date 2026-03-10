import "dotenv/config";
import { z } from "zod";

const PlannerEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PLANNER_PORT: z.coerce.number().int().min(1).max(65535).default(8081),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DATABASE_URL: z.string().default("postgres://geo_nap:geo_nap@localhost:5432/geo_nap"),
  RABBITMQ_URL: z.string().default("amqp://localhost:5672")
});

export type PlannerConfig = z.infer<typeof PlannerEnvSchema>;
export const config: PlannerConfig = PlannerEnvSchema.parse(process.env);
