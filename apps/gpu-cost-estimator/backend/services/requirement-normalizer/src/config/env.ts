import "dotenv/config";
import { z } from "zod";

const RequirementNormalizerEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  REQUIREMENT_NORMALIZER_PORT: z.coerce.number().int().min(1).max(65535).default(8086),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info")
});

export type RequirementNormalizerConfig = z.infer<typeof RequirementNormalizerEnvSchema>;
export const config: RequirementNormalizerConfig = RequirementNormalizerEnvSchema.parse(process.env);
