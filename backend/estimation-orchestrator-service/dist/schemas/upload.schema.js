"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.estimatorStatusFailedSchema = exports.estimatorStatusCompletedSchema = exports.estimatorStatusProcessingSchema = exports.estimatorCreateResponseSchema = exports.validatorNeedsResponseSchema = exports.validatorValidResponseSchema = exports.analyzerResponseSchema = exports.mappingResponseSchema = exports.parserResponseSchema = exports.uploadRequestSchema = exports.cloudProviderSchema = void 0;
const zod_1 = require("zod");
exports.cloudProviderSchema = zod_1.z.enum(["azure", "aws", "gcp"]);
const parseProvidersString = (raw) => {
    const trimmed = raw.trim();
    if (!trimmed) {
        return [];
    }
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
                return parsed.map((item) => String(item));
            }
        }
        catch {
            return trimmed
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean);
        }
    }
    return trimmed
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
};
const cloudProvidersInputSchema = zod_1.z.preprocess((value) => {
    if (Array.isArray(value)) {
        return value;
    }
    if (typeof value === "string") {
        return parseProvidersString(value);
    }
    return undefined;
}, zod_1.z.array(exports.cloudProviderSchema).min(1));
exports.uploadRequestSchema = zod_1.z
    .object({
    cloudProviders: cloudProvidersInputSchema.optional(),
    region: zod_1.z.string().trim().min(1).optional(),
    projectName: zod_1.z.string().trim().min(2).max(120).optional()
})
    .strict();
exports.parserResponseSchema = zod_1.z
    .object({
    rawInfrastructureData: zod_1.z.record(zod_1.z.unknown()),
    sourceType: zod_1.z.enum(["xml", "excel", "pdf", "word"]),
    parsingConfidence: zod_1.z.number()
})
    .strict();
exports.mappingResponseSchema = zod_1.z
    .object({
    requirement: zod_1.z.record(zod_1.z.unknown())
})
    .strict();
const analyzerCandidateSchema = zod_1.z
    .object({
    row: zod_1.z.record(zod_1.z.unknown()),
    score: zod_1.z.number(),
    matchedKeywords: zod_1.z.array(zod_1.z.string())
})
    .strict();
exports.analyzerResponseSchema = zod_1.z
    .object({
    computeCandidates: zod_1.z.array(analyzerCandidateSchema),
    storageCandidates: zod_1.z.array(analyzerCandidateSchema),
    databaseCandidates: zod_1.z.array(analyzerCandidateSchema),
    networkCandidates: zod_1.z.array(analyzerCandidateSchema),
    stats: zod_1.z
        .object({
        totalRows: zod_1.z.number(),
        classifiedRows: zod_1.z.number(),
        discardedRows: zod_1.z.number()
    })
        .strict()
})
    .strict();
const clarificationIssueSchema = zod_1.z
    .object({
    code: zod_1.z.string(),
    path: zod_1.z.string(),
    message: zod_1.z.string()
})
    .strict();
exports.validatorValidResponseSchema = zod_1.z
    .object({
    status: zod_1.z.literal("VALID"),
    validatedRequirement: zod_1.z.record(zod_1.z.unknown())
})
    .strict();
exports.validatorNeedsResponseSchema = zod_1.z
    .object({
    status: zod_1.z.literal("NEEDS_CLARIFICATION"),
    questions: zod_1.z.array(zod_1.z.string()),
    issues: zod_1.z.array(clarificationIssueSchema)
})
    .strict();
exports.estimatorCreateResponseSchema = zod_1.z
    .object({
    jobId: zod_1.z.string(),
    status: zod_1.z.string()
})
    .strict();
exports.estimatorStatusProcessingSchema = zod_1.z
    .object({
    status: zod_1.z.literal("PROCESSING")
})
    .strict();
exports.estimatorStatusCompletedSchema = zod_1.z
    .object({
    status: zod_1.z.literal("COMPLETED"),
    result: zod_1.z.array(zod_1.z.unknown())
})
    .strict();
exports.estimatorStatusFailedSchema = zod_1.z
    .object({
    status: zod_1.z.literal("FAILED"),
    error: zod_1.z.string().optional()
})
    .strict();
