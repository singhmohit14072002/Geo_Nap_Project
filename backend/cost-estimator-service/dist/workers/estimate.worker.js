"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processEstimateJob = exports.enqueueEstimateJob = void 0;
const estimate_execution_service_1 = require("../services/estimate-execution.service");
const job_store_service_1 = require("../services/job-store.service");
const extractErrorMessage = (err) => {
    if (err instanceof Error) {
        return err.message;
    }
    return "Unknown job processing failure";
};
const enqueueEstimateJob = (jobId) => {
    setTimeout(() => {
        void (0, exports.processEstimateJob)(jobId);
    }, 0);
};
exports.enqueueEstimateJob = enqueueEstimateJob;
const processEstimateJob = async (jobId) => {
    const job = (0, job_store_service_1.getEstimateJobById)(jobId);
    if (!job) {
        return;
    }
    (0, job_store_service_1.updateEstimateJobStatus)(jobId, "PROCESSING");
    try {
        const payload = job.requestPayload;
        const result = await (0, estimate_execution_service_1.runEstimateComputation)(payload);
        (0, job_store_service_1.updateEstimateJobStatus)(jobId, "COMPLETED", { result, error: undefined });
    }
    catch (err) {
        (0, job_store_service_1.updateEstimateJobStatus)(jobId, "FAILED", {
            error: extractErrorMessage(err)
        });
    }
};
exports.processEstimateJob = processEstimateJob;
