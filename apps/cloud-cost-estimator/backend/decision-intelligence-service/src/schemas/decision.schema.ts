import { z } from "zod";

const providerSchema = z.enum(["azure", "aws", "gcp"]);
const currencySchema = z.literal("INR");

const detailSchema = z
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

const optimizationRecommendationSchema = z
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

const providerOptimizationSchema = z
  .object({
    provider: providerSchema,
    recommendations: z.array(optimizationRecommendationSchema)
  })
  .strict();

const providerCostResultSchema = z
  .object({
    provider: providerSchema,
    region: z.string().min(1),
    summary: z
      .object({
        monthlyTotal: z.number().nonnegative(),
        yearlyTotal: z.number().nonnegative(),
        currency: currencySchema
      })
      .strict(),
    breakdown: z
      .object({
        compute: z.number().nonnegative(),
        storage: z.number().nonnegative(),
        database: z.number().nonnegative(),
        backup: z.number().nonnegative(),
        networkEgress: z.number().nonnegative(),
        other: z.number().nonnegative()
      })
      .strict(),
    details: z.array(detailSchema),
    pricingVersion: z.string().min(1),
    calculatedAt: z.string().min(1),
    optimization: providerOptimizationSchema.optional()
  })
  .strict();

export const decisionRequestSchema = z
  .object({
    providerResults: z.array(providerCostResultSchema).min(1),
    optimizationRecommendations: z.array(providerOptimizationSchema).optional()
  })
  .strict();

export type DecisionRequest = z.infer<typeof decisionRequestSchema>;

