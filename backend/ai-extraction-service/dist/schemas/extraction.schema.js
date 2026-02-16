"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractionClarifyRequestSchema = exports.extractionClarificationPatchSchema = exports.extractionCandidateSchema = exports.networkRequirementCandidateSchema = exports.databaseRequirementCandidateSchema = exports.computeRequirementCandidateSchema = exports.extractedRequirementSchema = exports.networkRequirementSchema = exports.databaseRequirementSchema = exports.computeRequirementSchema = exports.storageTypeSchema = void 0;
const zod_1 = require("zod");
exports.storageTypeSchema = zod_1.z.enum(["ssd", "hdd", "standard"]);
exports.computeRequirementSchema = zod_1.z
    .object({
    vCPU: zod_1.z.number().int().positive(),
    ramGB: zod_1.z.number().positive(),
    storageGB: zod_1.z.number().nonnegative(),
    osType: zod_1.z.enum(["linux", "windows"]),
    quantity: zod_1.z.number().int().positive()
})
    .strict();
exports.databaseRequirementSchema = zod_1.z
    .object({
    engine: zod_1.z.enum(["postgres", "mysql", "mssql", "none"]),
    storageGB: zod_1.z.number().nonnegative(),
    ha: zod_1.z.boolean()
})
    .strict();
exports.networkRequirementSchema = zod_1.z
    .object({
    dataEgressGB: zod_1.z.number().nonnegative()
})
    .strict();
exports.extractedRequirementSchema = zod_1.z
    .object({
    compute: zod_1.z.array(exports.computeRequirementSchema).min(1),
    database: exports.databaseRequirementSchema,
    network: exports.networkRequirementSchema,
    region: zod_1.z.string().min(1)
})
    .strict();
exports.computeRequirementCandidateSchema = zod_1.z
    .object({
    vCPU: zod_1.z.number().int().positive().optional().nullable(),
    ramGB: zod_1.z.number().positive().optional().nullable(),
    storageGB: zod_1.z.number().nonnegative().optional().nullable(),
    storageType: exports.storageTypeSchema.optional().nullable(),
    osType: zod_1.z.enum(["linux", "windows"]).optional().nullable(),
    quantity: zod_1.z.number().int().positive().optional().nullable()
})
    .strict();
exports.databaseRequirementCandidateSchema = zod_1.z
    .object({
    engine: zod_1.z.enum(["postgres", "mysql", "mssql", "none"]).optional().nullable(),
    storageGB: zod_1.z.number().nonnegative().optional().nullable(),
    ha: zod_1.z.boolean().optional().nullable()
})
    .strict();
exports.networkRequirementCandidateSchema = zod_1.z
    .object({
    dataEgressGB: zod_1.z.number().nonnegative().optional().nullable()
})
    .strict();
exports.extractionCandidateSchema = zod_1.z
    .object({
    compute: zod_1.z.array(exports.computeRequirementCandidateSchema).optional(),
    database: exports.databaseRequirementCandidateSchema.optional(),
    network: exports.networkRequirementCandidateSchema.optional(),
    region: zod_1.z.string().min(1).optional().nullable()
})
    .strict();
exports.extractionClarificationPatchSchema = zod_1.z
    .object({
    compute: zod_1.z.array(exports.computeRequirementCandidateSchema).optional(),
    database: exports.databaseRequirementCandidateSchema.optional(),
    network: exports.networkRequirementCandidateSchema.optional(),
    region: zod_1.z.string().min(1).optional().nullable()
})
    .strict();
exports.extractionClarifyRequestSchema = zod_1.z
    .object({
    candidate: exports.extractionCandidateSchema,
    clarifications: exports.extractionClarificationPatchSchema
        .optional()
        .default({})
})
    .strict();
