import { z } from "zod";

export const storageTypeSchema = z.enum(["ssd", "hdd", "standard"]);

export const computeRequirementSchema = z
  .object({
    vCPU: z.number().int().positive(),
    ramGB: z.number().positive(),
    storageGB: z.number().nonnegative(),
    osType: z.enum(["linux", "windows"]),
    quantity: z.number().int().positive()
  })
  .strict();

export const databaseRequirementSchema = z
  .object({
    engine: z.enum(["postgres", "mysql", "mssql", "none"]),
    storageGB: z.number().nonnegative(),
    ha: z.boolean()
  })
  .strict();

export const networkRequirementSchema = z
  .object({
    dataEgressGB: z.number().nonnegative()
  })
  .strict();

export const extractedRequirementSchema = z
  .object({
    compute: z.array(computeRequirementSchema).min(1),
    database: databaseRequirementSchema,
    network: networkRequirementSchema,
    region: z.string().min(1)
  })
  .strict();

export type ExtractedRequirement = z.infer<typeof extractedRequirementSchema>;

export const computeRequirementCandidateSchema = z
  .object({
    vCPU: z.number().int().positive().optional().nullable(),
    ramGB: z.number().positive().optional().nullable(),
    storageGB: z.number().nonnegative().optional().nullable(),
    storageType: storageTypeSchema.optional().nullable(),
    osType: z.enum(["linux", "windows"]).optional().nullable(),
    quantity: z.number().int().positive().optional().nullable()
  })
  .strict();

export const databaseRequirementCandidateSchema = z
  .object({
    engine: z.enum(["postgres", "mysql", "mssql", "none"]).optional().nullable(),
    storageGB: z.number().nonnegative().optional().nullable(),
    ha: z.boolean().optional().nullable()
  })
  .strict();

export const networkRequirementCandidateSchema = z
  .object({
    dataEgressGB: z.number().nonnegative().optional().nullable()
  })
  .strict();

export const extractionCandidateSchema = z
  .object({
    compute: z.array(computeRequirementCandidateSchema).optional(),
    database: databaseRequirementCandidateSchema.optional(),
    network: networkRequirementCandidateSchema.optional(),
    region: z.string().min(1).optional().nullable()
  })
  .strict();

export type ExtractionCandidate = z.infer<typeof extractionCandidateSchema>;

export const extractionClarificationPatchSchema = z
  .object({
    compute: z.array(computeRequirementCandidateSchema).optional(),
    database: databaseRequirementCandidateSchema.optional(),
    network: networkRequirementCandidateSchema.optional(),
    region: z.string().min(1).optional().nullable()
  })
  .strict();

export const extractionClarifyRequestSchema = z
  .object({
    candidate: extractionCandidateSchema,
    clarifications: extractionClarificationPatchSchema
      .optional()
      .default({})
  })
  .strict();

export type ExtractionClarificationPatch = z.infer<
  typeof extractionClarificationPatchSchema
>;

export type ExtractionClarifyRequest = z.infer<
  typeof extractionClarifyRequestSchema
>;
