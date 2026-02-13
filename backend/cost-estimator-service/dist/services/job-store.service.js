"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateEstimateJobStatus = exports.getEstimateJobById = exports.saveEstimateJob = void 0;
const jobStore = new Map();
const saveEstimateJob = (job) => {
    jobStore.set(job.jobId, job);
};
exports.saveEstimateJob = saveEstimateJob;
const getEstimateJobById = (jobId) => {
    return jobStore.get(jobId);
};
exports.getEstimateJobById = getEstimateJobById;
const updateEstimateJobStatus = (jobId, status, updates) => {
    const existing = jobStore.get(jobId);
    if (!existing) {
        return undefined;
    }
    const updated = {
        ...existing,
        ...updates,
        status,
        updatedAt: new Date()
    };
    jobStore.set(jobId, updated);
    return updated;
};
exports.updateEstimateJobStatus = updateEstimateJobStatus;
