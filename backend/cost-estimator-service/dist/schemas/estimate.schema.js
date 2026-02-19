"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.estimateSchema = exports.azureEstimateSchema = exports.classifiedServiceSchema = exports.requirementSchema = exports.networkSchema = exports.databaseSchema = exports.computeItemSchema = exports.serviceClassificationSchema = exports.cloudProviderSchema = void 0;
const zod_1 = require("zod");
exports.cloudProviderSchema = zod_1.z.enum(["azure", "aws", "gcp"]);
exports.serviceClassificationSchema = zod_1.z.enum([
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
exports.computeItemSchema = zod_1.z
    .object({
    vCPU: zod_1.z.number().int().positive(),
    ramGB: zod_1.z.number().positive(),
    storageGB: zod_1.z.number().nonnegative(),
    osType: zod_1.z.enum(["linux", "windows"]),
    quantity: zod_1.z.number().int().positive()
})
    .strict();
exports.databaseSchema = zod_1.z
    .object({
    engine: zod_1.z.string().min(1),
    storageGB: zod_1.z.number().nonnegative(),
    ha: zod_1.z.boolean()
})
    .strict();
exports.networkSchema = zod_1.z
    .object({
    dataEgressGB: zod_1.z.number().nonnegative()
})
    .strict();
exports.requirementSchema = zod_1.z
    .object({
    compute: zod_1.z.array(exports.computeItemSchema).min(1),
    database: exports.databaseSchema,
    network: exports.networkSchema
})
    .strict();
exports.classifiedServiceSchema = zod_1.z
    .object({
    classification: exports.serviceClassificationSchema,
    serviceCategory: zod_1.z.string().nullable().optional(),
    serviceType: zod_1.z.string().nullable().optional(),
    reason: zod_1.z.string().optional(),
    row: zod_1.z.record(zod_1.z.unknown())
})
    .strict();
exports.azureEstimateSchema = zod_1.z
    .object({
    documentType: zod_1.z.literal("CLOUD_ESTIMATE"),
    classifiedServices: zod_1.z.array(exports.classifiedServiceSchema).min(1)
})
    .strict();
const requirementEstimateSchema = zod_1.z
    .object({
    projectId: zod_1.z.string().uuid(),
    cloudProviders: zod_1.z.array(exports.cloudProviderSchema).min(1),
    region: zod_1.z.string().min(1),
    requirement: exports.requirementSchema
})
    .strict();
const azureEstimateRequestSchema = zod_1.z
    .object({
    projectId: zod_1.z.string().uuid(),
    cloudProviders: zod_1.z.array(exports.cloudProviderSchema).min(1),
    region: zod_1.z.string().min(1),
    azureEstimate: exports.azureEstimateSchema,
    requirement: exports.requirementSchema.optional()
})
    .strict()
    .superRefine((value, ctx) => {
    if (!value.cloudProviders.includes("azure")) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: "cloudProviders must include azure for azureEstimate mode",
            path: ["cloudProviders"]
        });
    }
});
exports.estimateSchema = zod_1.z.union([
    requirementEstimateSchema,
    azureEstimateRequestSchema
]);
