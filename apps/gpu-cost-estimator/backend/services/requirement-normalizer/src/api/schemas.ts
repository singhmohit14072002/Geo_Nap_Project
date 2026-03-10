import { z } from "zod";

export const cloudProviderSchema = z.enum(["aws", "azure", "gcp"]);

export const storageObjectSchema = z.object({
  bucket: z.string().min(1),
  objectKey: z.string().min(1),
  storageClass: z.string().min(1).optional()
});

export const storageSchema = z.object({
  object: storageObjectSchema
});

export const networkSchema = z.object({
  dataEgressGB: z.number().min(0),
  crossCloudTransfer: z.boolean()
});

export const normalizeRequirementRequestSchema = z.object({
  cloudProvider: cloudProviderSchema,
  region: z.string().min(1),
  storage: storageSchema,
  network: networkSchema
});

export type NormalizeRequirementRequest = z.infer<typeof normalizeRequirementRequestSchema>;
