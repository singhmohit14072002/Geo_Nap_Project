import { z } from "zod";

export const analyzeRequestSchema = z
  .object({
    rawInfrastructureData: z.record(z.unknown()),
    sourceType: z.enum(["xml", "excel", "pdf", "word"]).optional()
  })
  .strict();

export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;

