"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decisionRequestSchema = void 0;
const zod_1 = require("zod");
const providerSchema = zod_1.z.enum(["azure", "aws", "gcp"]);
const currencySchema = zod_1.z.literal("INR");
const detailSchema = zod_1.z
    .object({
    serviceType: zod_1.z.string().min(1),
    name: zod_1.z.string().min(1),
    sku: zod_1.z.string().optional(),
    quantity: zod_1.z.number().nonnegative(),
    unitPrice: zod_1.z.number().nonnegative().optional(),
    monthlyCost: zod_1.z.number().nonnegative(),
    metadata: zod_1.z.record(zod_1.z.union([zod_1.z.string(), zod_1.z.number(), zod_1.z.boolean()])).optional()
})
    .strict();
const optimizationRecommendationSchema = zod_1.z
    .object({
    type: zod_1.z.enum([
        "RIGHT_SIZING",
        "RESERVED_INSTANCE",
        "STORAGE_OPTIMIZATION",
        "NETWORK_OPTIMIZATION"
    ]),
    message: zod_1.z.string().min(1),
    estimatedMonthlySavings: zod_1.z.number().nonnegative()
})
    .strict();
const providerOptimizationSchema = zod_1.z
    .object({
    provider: providerSchema,
    recommendations: zod_1.z.array(optimizationRecommendationSchema)
})
    .strict();
const providerCostResultSchema = zod_1.z
    .object({
    provider: providerSchema,
    region: zod_1.z.string().min(1),
    summary: zod_1.z
        .object({
        monthlyTotal: zod_1.z.number().nonnegative(),
        yearlyTotal: zod_1.z.number().nonnegative(),
        currency: currencySchema
    })
        .strict(),
    breakdown: zod_1.z
        .object({
        compute: zod_1.z.number().nonnegative(),
        storage: zod_1.z.number().nonnegative(),
        database: zod_1.z.number().nonnegative(),
        backup: zod_1.z.number().nonnegative(),
        networkEgress: zod_1.z.number().nonnegative(),
        other: zod_1.z.number().nonnegative()
    })
        .strict(),
    details: zod_1.z.array(detailSchema),
    pricingVersion: zod_1.z.string().min(1),
    calculatedAt: zod_1.z.string().min(1),
    optimization: providerOptimizationSchema.optional()
})
    .strict();
exports.decisionRequestSchema = zod_1.z
    .object({
    providerResults: zod_1.z.array(providerCostResultSchema).min(1),
    optimizationRecommendations: zod_1.z.array(providerOptimizationSchema).optional()
})
    .strict();
