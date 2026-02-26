import { z } from "zod";

export const parsedRowSchema = z.record(z.unknown());

export const estimateImportRequestSchema = z
  .object({
    parsedRows: z.array(parsedRowSchema).optional(),
    rawInfrastructureData: z
      .object({
        rows: z.array(parsedRowSchema).optional()
      })
      .passthrough()
      .optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    const directRows = Array.isArray(value.parsedRows) ? value.parsedRows : [];
    const nestedRows = Array.isArray(value.rawInfrastructureData?.rows)
      ? value.rawInfrastructureData.rows
      : [];
    if (directRows.length === 0 && nestedRows.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["parsedRows"],
        message: "Provide parsedRows or rawInfrastructureData.rows with at least one row"
      });
    }
  });

export const normalizedImportedServiceSchema = z
  .object({
    serviceCategory: z.string().min(1),
    serviceType: z.string().min(1),
    region: z.string().min(1),
    skuName: z.string().min(1).nullable(),
    quantity: z.number().int().positive(),
    providedMonthlyCost: z.number().nonnegative()
  })
  .strict();

export const estimateImportResponseSchema = z
  .object({
    services: z.array(normalizedImportedServiceSchema).min(1),
    providedTotal: z.number().nonnegative()
  })
  .strict();

export type EstimateImportRequest = z.infer<typeof estimateImportRequestSchema>;
export type NormalizedImportedService = z.infer<
  typeof normalizedImportedServiceSchema
>;
export type EstimateImportResponse = z.infer<typeof estimateImportResponseSchema>;
