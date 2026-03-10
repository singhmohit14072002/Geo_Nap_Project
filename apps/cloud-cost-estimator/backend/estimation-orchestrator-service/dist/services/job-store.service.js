"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listJobs = exports.setJobFailure = exports.setJobResult = exports.setJobClarification = exports.updateJobStatus = exports.getJob = exports.createJob = void 0;
const http_error_1 = require("../utils/http-error");
const jobs = new Map();
const nowIso = () => new Date().toISOString();
const createJob = (jobId, file, options) => {
    const timestamp = nowIso();
    const job = {
        jobId,
        status: "PENDING",
        options,
        file,
        clarification: null,
        result: null,
        error: null,
        createdAt: timestamp,
        updatedAt: timestamp
    };
    jobs.set(jobId, job);
    return job;
};
exports.createJob = createJob;
const getJob = (jobId) => {
    const job = jobs.get(jobId);
    if (!job) {
        throw new http_error_1.HttpError(404, `Job not found: ${jobId}`);
    }
    return job;
};
exports.getJob = getJob;
const updateJobStatus = (jobId, status) => {
    const job = (0, exports.getJob)(jobId);
    job.status = status;
    job.updatedAt = nowIso();
    return job;
};
exports.updateJobStatus = updateJobStatus;
const setJobClarification = (jobId, clarification) => {
    const job = (0, exports.updateJobStatus)(jobId, "NEEDS_CLARIFICATION");
    job.clarification = clarification;
    job.error = null;
    return job;
};
exports.setJobClarification = setJobClarification;
const setJobResult = (jobId, result) => {
    const job = (0, exports.updateJobStatus)(jobId, "COMPLETED");
    job.result = result;
    job.error = null;
    job.file = null;
    return job;
};
exports.setJobResult = setJobResult;
const setJobFailure = (jobId, error) => {
    const job = (0, exports.updateJobStatus)(jobId, "FAILED");
    job.error = error;
    return job;
};
exports.setJobFailure = setJobFailure;
const listJobs = () => Array.from(jobs.values());
exports.listJobs = listJobs;
