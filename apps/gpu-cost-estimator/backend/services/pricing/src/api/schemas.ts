import { z } from "zod";

export const estimateRequestSchema = z.object({
  plan_id: z.string().uuid(),
  batch_id: z.string().uuid().optional(),
  scenario_id: z.string().uuid().optional(),
  request: z.object({
    data_location: z.string().regex(/^(aws|azure|gcp|vast)-[a-z0-9-]+$/),
    gpu_count: z.number().int().positive(),
    ram_requirement: z.number().positive(),
    dataset_size_gb: z.number().min(0),
    duration_hours: z.number().positive(),
    parity_mode: z.boolean().default(true),
    result_limit: z.number().int().min(1).max(20).default(5)
  }),
  providers: z.array(z.enum(["aws", "azure", "gcp", "vast"])).optional(),
  regions: z.array(z.string()).optional(),
  skus: z.array(z.string()).optional()
});

export type EstimateRequest = z.infer<typeof estimateRequestSchema>;
