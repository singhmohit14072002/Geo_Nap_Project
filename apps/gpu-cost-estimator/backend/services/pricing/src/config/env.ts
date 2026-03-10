import "dotenv/config";
import { z } from "zod";

const PricingEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PRICING_PORT: z.coerce.number().int().min(1).max(65535).default(8082),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  CACHE_TTL_SECONDS: z.coerce.number().int().min(5).default(300)
});

export type PricingConfig = z.infer<typeof PricingEnvSchema>;
export const config: PricingConfig = PricingEnvSchema.parse(process.env);
