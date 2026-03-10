"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectIdParamSchema = exports.createProjectSchema = void 0;
const zod_1 = require("zod");
exports.createProjectSchema = zod_1.z
    .object({
    name: zod_1.z.string().min(2).max(120),
    region: zod_1.z.string().min(1).max(100)
})
    .strict();
exports.projectIdParamSchema = zod_1.z
    .object({
    projectId: zod_1.z.string().uuid()
})
    .strict();
