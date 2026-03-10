import { z } from "zod";

export const providerSchema = z.enum(["azure", "aws", "gcp"]);
export const currencySchema = z.literal("INR");

export const costSummarySchema = z
  .object({
    monthlyTotal: z.number().nonnegative(),
    yearlyTotal: z.number().nonnegative(),
    currency: currencySchema
  })
  .strict();

export const costBreakdownSchema = z
  .object({
    compute: z.number().nonnegative(),
    storage: z.number().nonnegative(),
    database: z.number().nonnegative(),
    backup: z.number().nonnegative(),
    networkEgress: z.number().nonnegative(),
    other: z.number().nonnegative()
  })
  .strict();

export const detailItemSchema = z
  .object({
    serviceType: z.string().min(1),
    name: z.string().min(1),
    sku: z.string().optional(),
    quantity: z.number().nonnegative(),
    unitPrice: z.number().nonnegative().optional(),
    monthlyCost: z.number().nonnegative(),
    metadata: z.record(z.union([z.string(), z.number(), z.boolean()])).optional()
  })
  .strict();

export const optimizationRecommendationSchema = z
  .object({
    type: z.enum([
      "RIGHT_SIZING",
      "RESERVED_INSTANCE",
      "STORAGE_OPTIMIZATION",
      "NETWORK_OPTIMIZATION"
    ]),
    message: z.string().min(1),
    estimatedMonthlySavings: z.number().nonnegative()
  })
  .strict();

export const providerCostResultSchema = z
  .object({
    provider: providerSchema,
    region: z.string().min(1),
    summary: costSummarySchema,
    breakdown: costBreakdownSchema,
    details: z.array(detailItemSchema),
    pricingVersion: z.string().min(1),
    calculatedAt: z.string().min(1),
    optimization: z
      .object({
        provider: providerSchema,
        recommendations: z.array(optimizationRecommendationSchema)
      })
      .strict()
      .optional()
  })
  .strict();

export const explainRequestSchema = z
  .object({
    providerResult: providerCostResultSchema
  })
  .strict();

export type ExplainRequest = z.infer<typeof explainRequestSchema>;
export type ProviderCostResultInput = z.infer<typeof providerCostResultSchema>;

