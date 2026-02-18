"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateRequestSchema = exports.validatedRequirementSchema = exports.validatedNetworkSchema = exports.validatedDatabaseSchema = exports.validatedComputeSchema = exports.standardizedRequirementCandidateSchema = exports.networkCandidateSchema = exports.databaseCandidateSchema = exports.computeItemCandidateSchema = void 0;
const zod_1 = require("zod");
const numberLike = zod_1.z.union([zod_1.z.number(), zod_1.z.string()]);
exports.computeItemCandidateSchema = zod_1.z
    .object({
    vCPU: numberLike.optional().nullable(),
    ramGB: numberLike.optional().nullable(),
    storageGB: numberLike.optional().nullable(),
    osType: zod_1.z.enum(["linux", "windows"]).optional().nullable(),
    quantity: numberLike.optional().nullable()
})
    .strict();
exports.databaseCandidateSchema = zod_1.z
    .object({
    engine: zod_1.z.string().optional().nullable(),
    storageGB: numberLike.optional().nullable(),
    ha: zod_1.z.boolean().optional().nullable()
})
    .strict()
    .nullable()
    .optional();
exports.networkCandidateSchema = zod_1.z
    .object({
    dataEgressGB: numberLike.optional().nullable()
})
    .strict()
    .optional();
exports.standardizedRequirementCandidateSchema = zod_1.z
    .object({
    compute: zod_1.z.array(exports.computeItemCandidateSchema).optional(),
    database: exports.databaseCandidateSchema,
    network: exports.networkCandidateSchema,
    region: zod_1.z.string().min(1).optional().nullable()
})
    .strict();
exports.validatedComputeSchema = zod_1.z
    .object({
    vCPU: zod_1.z.number().int().positive(),
    ramGB: zod_1.z.number().positive(),
    storageGB: zod_1.z.number().positive(),
    osType: zod_1.z.enum(["linux", "windows"]),
    quantity: zod_1.z.number().int().positive()
})
    .strict();
exports.validatedDatabaseSchema = zod_1.z
    .object({
    engine: zod_1.z.string().min(1),
    storageGB: zod_1.z.number().positive(),
    ha: zod_1.z.boolean()
})
    .strict()
    .nullable();
exports.validatedNetworkSchema = zod_1.z
    .object({
    dataEgressGB: zod_1.z.number().nonnegative()
})
    .strict();
exports.validatedRequirementSchema = zod_1.z
    .object({
    compute: zod_1.z.array(exports.validatedComputeSchema).min(1),
    database: exports.validatedDatabaseSchema,
    network: exports.validatedNetworkSchema,
    region: zod_1.z.string().min(1)
})
    .strict();
exports.validateRequestSchema = zod_1.z
    .union([
    exports.standardizedRequirementCandidateSchema,
    zod_1.z
        .object({
        requirement: exports.standardizedRequirementCandidateSchema
    })
        .strict()
]);
