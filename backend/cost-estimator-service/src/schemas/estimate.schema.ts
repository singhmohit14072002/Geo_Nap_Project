import { z } from "zod";

export const cloudProviderSchema = z.enum(["azure", "aws", "gcp"]);

export const computeItemSchema = z
  .object({
    vCPU: z.number().int().positive(),
    ramGB: z.number().positive(),
    storageGB: z.number().nonnegative(),
    osType: z.enum(["linux", "windows"]),
    quantity: z.number().int().positive()
  })
  .strict();

export const databaseSchema = z
  .object({
    engine: z.string().min(1),
    storageGB: z.number().nonnegative(),
    ha: z.boolean()
  })
  .strict();

export const networkSchema = z
  .object({
    dataEgressGB: z.number().nonnegative()
  })
  .strict();

export const requirementSchema = z
  .object({
    compute: z.array(computeItemSchema).min(1),
    database: databaseSchema,
    network: networkSchema
  })
  .strict();

export const estimateSchema = z
  .object({
    cloudProviders: z.array(cloudProviderSchema).min(1),
    region: z.string().min(1),
    requirement: requirementSchema
  })
  .strict();

export type EstimateSchemaInput = z.infer<typeof estimateSchema>;

