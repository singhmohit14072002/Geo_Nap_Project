import { z } from "zod";

export const documentTypeSchema = z.enum(["CLOUD_ESTIMATE", "REQUIREMENT"]);

export const analyzeRequestSchema = z
  .object({
    rawInfrastructureData: z.record(z.unknown()),
    sourceType: z.enum(["xml", "excel", "csv", "json", "pdf", "word"]).optional()
  })
  .strict();

export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;
