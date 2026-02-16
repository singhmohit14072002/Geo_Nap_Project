"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processEstimateJob = exports.enqueueEstimateJob = void 0;
const metrics_service_1 = require("../metrics/metrics.service");
const estimate_execution_service_1 = require("../services/estimate-execution.service");
const estimation_persistence_service_1 = require("../services/estimation-persistence.service");
const job_store_service_1 = require("../services/job-store.service");
const logger_1 = __importDefault(require("../utils/logger"));
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
        logger_1.default.warn("Estimate job missing in store before processing", { jobId });
        return;
    }
    const started = process.hrtime.bigint();
    (0, metrics_service_1.incrementEstimationJobsTotal)();
    (0, job_store_service_1.updateEstimateJobStatus)(jobId, "PROCESSING");
    try {
        const payload = job.requestPayload;
        const result = await (0, estimate_execution_service_1.runEstimateComputation)(payload);
        await (0, estimation_persistence_service_1.saveEstimationResult)({
            projectId: job.projectId,
            requirementJson: payload,
            resultJson: result
        });
        const durationSeconds = Number(process.hrtime.bigint() - started) / 1000000000;
        (0, metrics_service_1.observeEstimationDurationSeconds)(durationSeconds);
        (0, job_store_service_1.updateEstimateJobStatus)(jobId, "COMPLETED", { result, error: undefined });
        logger_1.default.info("Estimate job completed", {
            jobId,
            durationSeconds,
            providerCount: Array.isArray(result) ? result.length : 0
        });
    }
    catch (err) {
        const durationSeconds = Number(process.hrtime.bigint() - started) / 1000000000;
        (0, metrics_service_1.incrementEstimationJobsFailed)();
        (0, metrics_service_1.observeEstimationDurationSeconds)(durationSeconds);
        (0, job_store_service_1.updateEstimateJobStatus)(jobId, "FAILED", {
            error: extractErrorMessage(err)
        });
        logger_1.default.error("Estimate job failed", {
            jobId,
            durationSeconds,
            error: extractErrorMessage(err)
        });
    }
};
exports.processEstimateJob = processEstimateJob;
