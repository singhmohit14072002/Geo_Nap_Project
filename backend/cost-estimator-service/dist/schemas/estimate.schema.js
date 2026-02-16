"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.estimateSchema = exports.requirementSchema = exports.networkSchema = exports.databaseSchema = exports.computeItemSchema = exports.cloudProviderSchema = void 0;
const zod_1 = require("zod");
exports.cloudProviderSchema = zod_1.z.enum(["azure", "aws", "gcp"]);
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
exports.estimateSchema = zod_1.z
    .object({
    projectId: zod_1.z.string().uuid(),
    cloudProviders: zod_1.z.array(exports.cloudProviderSchema).min(1),
    region: zod_1.z.string().min(1),
    requirement: exports.requirementSchema
})
    .strict();
