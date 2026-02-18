"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requirementSchemaContract = exports.requirementSchemaTemplate = exports.standardizedRequirementSchema = exports.networkRequirementSchema = exports.databaseRequirementSchema = exports.computeRequirementSchema = exports.mapRequestSchema = exports.sourceTypeSchema = void 0;
const zod_1 = require("zod");
exports.sourceTypeSchema = zod_1.z.enum(["xml", "excel", "pdf", "word"]);
const parseNullableNumber = (value) => {
    if (value == null) {
        return null;
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) {
            return null;
        }
        const parsed = Number(trimmed);
        return Number.isFinite(parsed) ? parsed : value;
    }
    return value;
};
const nullablePositiveIntSchema = zod_1.z.preprocess(parseNullableNumber, zod_1.z.number().int().positive().nullable());
const nullableNonNegativeNumberSchema = zod_1.z.preprocess(parseNullableNumber, zod_1.z.number().nonnegative().nullable());
exports.mapRequestSchema = zod_1.z
    .object({
    rawInfrastructureData: zod_1.z.record(zod_1.z.unknown()),
    sourceType: exports.sourceTypeSchema
})
    .strict();
exports.computeRequirementSchema = zod_1.z
    .object({
    vCPU: nullablePositiveIntSchema,
    ramGB: nullableNonNegativeNumberSchema,
    storageGB: nullableNonNegativeNumberSchema,
    osType: zod_1.z.enum(["linux", "windows"]).nullable(),
    quantity: nullablePositiveIntSchema
})
    .strict();
exports.databaseRequirementSchema = zod_1.z
    .object({
    engine: zod_1.z.string().min(1).nullable(),
    storageGB: nullableNonNegativeNumberSchema,
    ha: zod_1.z.boolean().nullable()
})
    .strict();
exports.networkRequirementSchema = zod_1.z
    .object({
    dataEgressGB: nullableNonNegativeNumberSchema
})
    .strict();
exports.standardizedRequirementSchema = zod_1.z
    .object({
    compute: zod_1.z.array(exports.computeRequirementSchema),
    database: exports.databaseRequirementSchema,
    network: exports.networkRequirementSchema,
    region: zod_1.z.string().min(1).nullable()
})
    .strict();
exports.requirementSchemaTemplate = {
    compute: [
        {
            vCPU: null,
            ramGB: null,
            storageGB: null,
            osType: null,
            quantity: null
        }
    ],
    database: {
        engine: null,
        storageGB: null,
        ha: null
    },
    network: {
        dataEgressGB: null
    },
    region: null
};
exports.requirementSchemaContract = {
    type: "object",
    required: ["compute", "database", "network", "region"],
    additionalProperties: false,
    properties: {
        compute: {
            type: "array",
            items: {
                type: "object",
                required: ["vCPU", "ramGB", "storageGB", "osType", "quantity"],
                additionalProperties: false,
                properties: {
                    vCPU: { type: ["integer", "null"], minimum: 1 },
                    ramGB: { type: ["number", "null"], minimum: 0 },
                    storageGB: { type: ["number", "null"], minimum: 0 },
                    osType: { enum: ["linux", "windows", null] },
                    quantity: { type: ["integer", "null"], minimum: 1 }
                }
            }
        },
        database: {
            type: "object",
            required: ["engine", "storageGB", "ha"],
            additionalProperties: false,
            properties: {
                engine: { type: ["string", "null"] },
                storageGB: { type: ["number", "null"], minimum: 0 },
                ha: { type: ["boolean", "null"] }
            }
        },
        network: {
            type: "object",
            required: ["dataEgressGB"],
            additionalProperties: false,
            properties: {
                dataEgressGB: { type: ["number", "null"], minimum: 0 }
            }
        },
        region: { type: ["string", "null"] }
    }
};
