"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEstimateJob = exports.submitEstimateJob = void 0;
const crypto_1 = require("crypto");
const estimate_schema_1 = require("../schemas/estimate.schema");
const http_error_util_1 = require("../utils/http-error.util");
const job_store_service_1 = require("./job-store.service");
const project_service_1 = require("./project.service");
const estimate_worker_1 = require("../workers/estimate.worker");
const submitEstimateJob = async (payload, authUser) => {
    const parsed = estimate_schema_1.estimateSchema.safeParse(payload);
    if (!parsed.success) {
        const hasInvalidProvider = parsed.error.issues.some((issue) => issue.path[0] === "cloudProviders" &&
            issue.code === "invalid_enum_value");
        if (hasInvalidProvider) {
            throw new http_error_util_1.HttpError(400, "Invalid provider in cloudProviders", parsed.error.flatten());
        }
        throw new http_error_util_1.HttpError(422, "Validation failed", parsed.error.flatten());
    }
    await (0, project_service_1.assertProjectAccess)(authUser, parsed.data.projectId);
    const now = new Date();
    const job = {
        jobId: (0, crypto_1.randomUUID)(),
        status: "PENDING",
        userId: authUser.id,
        organizationId: authUser.organizationId,
        projectId: parsed.data.projectId,
        requestPayload: parsed.data,
        createdAt: now,
        updatedAt: now
    };
    (0, job_store_service_1.saveEstimateJob)(job);
    (0, estimate_worker_1.enqueueEstimateJob)(job.jobId);
    return job;
};
exports.submitEstimateJob = submitEstimateJob;
const getEstimateJob = (jobId) => {
    const job = (0, job_store_service_1.getEstimateJobById)(jobId);
    if (!job) {
        throw new http_error_util_1.HttpError(404, `Estimate job not found: ${jobId}`);
    }
    return job;
};
exports.getEstimateJob = getEstimateJob;
