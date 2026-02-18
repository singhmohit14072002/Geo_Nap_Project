import { z } from "zod";

const numberLike = z.union([z.number(), z.string()]);

export const computeItemCandidateSchema = z
  .object({
    vCPU: numberLike.optional().nullable(),
    ramGB: numberLike.optional().nullable(),
    storageGB: numberLike.optional().nullable(),
    osType: z.enum(["linux", "windows"]).optional().nullable(),
    quantity: numberLike.optional().nullable()
  })
  .strict();

export const databaseCandidateSchema = z
  .object({
    engine: z.string().optional().nullable(),
    storageGB: numberLike.optional().nullable(),
    ha: z.boolean().optional().nullable()
  })
  .strict()
  .nullable()
  .optional();

export const networkCandidateSchema = z
  .object({
    dataEgressGB: numberLike.optional().nullable()
  })
  .strict()
  .optional();

export const standardizedRequirementCandidateSchema = z
  .object({
    compute: z.array(computeItemCandidateSchema).optional(),
    database: databaseCandidateSchema,
    network: networkCandidateSchema,
    region: z.string().min(1).optional().nullable()
  })
  .strict();

export const validatedComputeSchema = z
  .object({
    vCPU: z.number().int().positive(),
    ramGB: z.number().positive(),
    storageGB: z.number().positive(),
    osType: z.enum(["linux", "windows"]),
    quantity: z.number().int().positive()
  })
  .strict();

export const validatedDatabaseSchema = z
  .object({
    engine: z.string().min(1),
    storageGB: z.number().positive(),
    ha: z.boolean()
  })
  .strict()
  .nullable();

export const validatedNetworkSchema = z
  .object({
    dataEgressGB: z.number().nonnegative()
  })
  .strict();

export const validatedRequirementSchema = z
  .object({
    compute: z.array(validatedComputeSchema).min(1),
    database: validatedDatabaseSchema,
    network: validatedNetworkSchema,
    region: z.string().min(1)
  })
  .strict();

export const validateRequestSchema = z
  .union([
    standardizedRequirementCandidateSchema,
    z
      .object({
        requirement: standardizedRequirementCandidateSchema
      })
      .strict()
  ]);

export type RequirementCandidate = z.infer<
  typeof standardizedRequirementCandidateSchema
>;
export type ValidatedRequirement = z.infer<typeof validatedRequirementSchema>;
