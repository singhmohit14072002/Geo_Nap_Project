"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeRequestSchema = void 0;
const zod_1 = require("zod");
exports.analyzeRequestSchema = zod_1.z
    .object({
    rawInfrastructureData: zod_1.z.record(zod_1.z.unknown()),
    sourceType: zod_1.z.enum(["xml", "excel", "pdf", "word"]).optional()
})
    .strict();
