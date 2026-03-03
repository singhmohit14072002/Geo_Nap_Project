import { z } from "zod";

export const cloudProviderSchema = z.enum(["azure", "aws", "gcp"]);
export const serviceClassificationSchema = z.enum([
  "COMPUTE_VM",
  "STORAGE_DISK",
  "NETWORK_GATEWAY",
  "NETWORK_EGRESS",
  "BACKUP",
  "AUTOMATION",
  "MONITORING",
  "LOGIC_APPS",
  "OTHER"
]);

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

export const classifiedServiceSchema = z
  .object({
    classification: serviceClassificationSchema,
    serviceCategory: z.string().nullable().optional(),
    serviceType: z.string().nullable().optional(),
    reason: z.string().optional(),
    pricingParameters: z
      .object({
        serviceName: z.string(),
        skuName: z.string().optional(),
        quantity: z.number().int().positive().optional(),
        hours: z.number().int().positive().optional(),
        usageGB: z.number().nonnegative().optional(),
        osType: z.enum(["windows", "linux"]).optional()
      })
      .strict()
      .optional(),
    row: z.record(z.unknown())
  })
  .strict();

export const azureEstimateRowSchema = z
  .object({
    serviceCategory: z.string(),
    serviceType: z.string(),
    region: z.string(),
    description: z.string().optional().default("")
  })
  .strict();

export const azureEstimateSchema = z
  .object({
    documentType: z.literal("CLOUD_ESTIMATE"),
    classifiedServices: z
      .array(z.union([classifiedServiceSchema, azureEstimateRowSchema]))
      .min(1),
    mode: z.enum(["AZURE_ESTIMATE_MODE", "GENERIC_INFRA_MODE"]).optional()
  })
  .strict();

const requirementEstimateSchema = z
  .object({
    projectId: z.string().uuid(),
    cloudProviders: z.array(cloudProviderSchema).min(1),
    region: z.string().min(1),
    requirement: requirementSchema
  })
  .strict();

const azureEstimateRequestSchema = z
  .object({
    projectId: z.string().uuid(),
    cloudProviders: z.array(cloudProviderSchema).min(1),
    region: z.string().min(1),
    azureEstimate: azureEstimateSchema,
    requirement: requirementSchema.optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.cloudProviders.includes("azure")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "cloudProviders must include azure for azureEstimate mode",
        path: ["cloudProviders"]
      });
    }
  });

export const estimateSchema = z.union([
  requirementEstimateSchema,
  azureEstimateRequestSchema
]);

export type EstimateSchemaInput = z.infer<typeof estimateSchema>;
