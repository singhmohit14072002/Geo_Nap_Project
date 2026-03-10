"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.explainRequestSchema = exports.providerCostResultSchema = exports.optimizationRecommendationSchema = exports.detailItemSchema = exports.costBreakdownSchema = exports.costSummarySchema = exports.currencySchema = exports.providerSchema = void 0;
const zod_1 = require("zod");
exports.providerSchema = zod_1.z.enum(["azure", "aws", "gcp"]);
exports.currencySchema = zod_1.z.literal("INR");
exports.costSummarySchema = zod_1.z
    .object({
    monthlyTotal: zod_1.z.number().nonnegative(),
    yearlyTotal: zod_1.z.number().nonnegative(),
    currency: exports.currencySchema
})
    .strict();
exports.costBreakdownSchema = zod_1.z
    .object({
    compute: zod_1.z.number().nonnegative(),
    storage: zod_1.z.number().nonnegative(),
    database: zod_1.z.number().nonnegative(),
    backup: zod_1.z.number().nonnegative(),
    networkEgress: zod_1.z.number().nonnegative(),
    other: zod_1.z.number().nonnegative()
})
    .strict();
exports.detailItemSchema = zod_1.z
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
exports.optimizationRecommendationSchema = zod_1.z
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
exports.providerCostResultSchema = zod_1.z
    .object({
    provider: exports.providerSchema,
    region: zod_1.z.string().min(1),
    summary: exports.costSummarySchema,
    breakdown: exports.costBreakdownSchema,
    details: zod_1.z.array(exports.detailItemSchema),
    pricingVersion: zod_1.z.string().min(1),
    calculatedAt: zod_1.z.string().min(1),
    optimization: zod_1.z
        .object({
        provider: exports.providerSchema,
        recommendations: zod_1.z.array(exports.optimizationRecommendationSchema)
    })
        .strict()
        .optional()
})
    .strict();
exports.explainRequestSchema = zod_1.z
    .object({
    providerResult: exports.providerCostResultSchema
})
    .strict();
