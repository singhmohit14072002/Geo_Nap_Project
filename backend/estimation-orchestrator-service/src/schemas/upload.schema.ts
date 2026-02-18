import { z } from "zod";

export const cloudProviderSchema = z.enum(["azure", "aws", "gcp"]);

const parseProvidersString = (raw: string): string[] => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item));
      }
    } catch {
      return trimmed
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return trimmed
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

const cloudProvidersInputSchema = z.preprocess((value) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    return parseProvidersString(value);
  }

  return undefined;
}, z.array(cloudProviderSchema).min(1));

export const uploadRequestSchema = z
  .object({
    cloudProviders: cloudProvidersInputSchema.optional(),
    region: z.string().trim().min(1).optional(),
    projectName: z.string().trim().min(2).max(120).optional()
  })
  .strict();

export const parserResponseSchema = z
  .object({
    rawInfrastructureData: z.record(z.unknown()),
    sourceType: z.enum(["xml", "excel", "pdf", "word"]),
    parsingConfidence: z.number()
  })
  .strict();

export const mappingResponseSchema = z
  .object({
    requirement: z.record(z.unknown())
  })
  .strict();

const analyzerCandidateSchema = z
  .object({
    row: z.record(z.unknown()),
    score: z.number(),
    matchedKeywords: z.array(z.string())
  })
  .strict();

export const analyzerResponseSchema = z
  .object({
    computeCandidates: z.array(analyzerCandidateSchema),
    storageCandidates: z.array(analyzerCandidateSchema),
    databaseCandidates: z.array(analyzerCandidateSchema),
    networkCandidates: z.array(analyzerCandidateSchema),
    stats: z
      .object({
        totalRows: z.number(),
        classifiedRows: z.number(),
        discardedRows: z.number()
      })
      .strict()
  })
  .strict();

const clarificationIssueSchema = z
  .object({
    code: z.string(),
    path: z.string(),
    message: z.string()
  })
  .strict();

export const validatorValidResponseSchema = z
  .object({
    status: z.literal("VALID"),
    validatedRequirement: z.record(z.unknown())
  })
  .strict();

export const validatorNeedsResponseSchema = z
  .object({
    status: z.literal("NEEDS_CLARIFICATION"),
    questions: z.array(z.string()),
    issues: z.array(clarificationIssueSchema)
  })
  .strict();

export const estimatorCreateResponseSchema = z
  .object({
    jobId: z.string(),
    status: z.string()
  })
  .strict();

export const estimatorStatusProcessingSchema = z
  .object({
    status: z.literal("PROCESSING")
  })
  .strict();

export const estimatorStatusCompletedSchema = z
  .object({
    status: z.literal("COMPLETED"),
    result: z.array(z.unknown())
  })
  .strict();

export const estimatorStatusFailedSchema = z
  .object({
    status: z.literal("FAILED"),
    error: z.string().optional()
  })
  .strict();

export type UploadRequestInput = z.infer<typeof uploadRequestSchema>;
