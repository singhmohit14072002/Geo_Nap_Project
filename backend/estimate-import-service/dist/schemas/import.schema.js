"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.estimateImportResponseSchema = exports.normalizedImportedServiceSchema = exports.estimateImportRequestSchema = exports.parsedRowSchema = void 0;
const zod_1 = require("zod");
exports.parsedRowSchema = zod_1.z.record(zod_1.z.unknown());
exports.estimateImportRequestSchema = zod_1.z
    .object({
    parsedRows: zod_1.z.array(exports.parsedRowSchema).optional(),
    rawInfrastructureData: zod_1.z
        .object({
        rows: zod_1.z.array(exports.parsedRowSchema).optional()
    })
        .passthrough()
        .optional()
})
    .strict()
    .superRefine((value, ctx) => {
    const directRows = Array.isArray(value.parsedRows) ? value.parsedRows : [];
    const nestedRows = Array.isArray(value.rawInfrastructureData?.rows)
        ? value.rawInfrastructureData.rows
        : [];
    if (directRows.length === 0 && nestedRows.length === 0) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ["parsedRows"],
            message: "Provide parsedRows or rawInfrastructureData.rows with at least one row"
        });
    }
});
exports.normalizedImportedServiceSchema = zod_1.z
    .object({
    serviceCategory: zod_1.z.string().min(1),
    serviceType: zod_1.z.string().min(1),
    region: zod_1.z.string().min(1),
    skuName: zod_1.z.string().min(1).nullable(),
    quantity: zod_1.z.number().int().positive(),
    providedMonthlyCost: zod_1.z.number().nonnegative()
})
    .strict();
exports.estimateImportResponseSchema = zod_1.z
    .object({
    services: zod_1.z.array(exports.normalizedImportedServiceSchema).min(1),
    providedTotal: zod_1.z.number().nonnegative()
})
    .strict();
