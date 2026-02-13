"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEstimateJobController = exports.createEstimateJobController = void 0;
const estimate_job_service_1 = require("../services/estimate-job.service");
const createEstimateJobController = (req, res, next) => {
    try {
        const job = (0, estimate_job_service_1.submitEstimateJob)(req.body);
        res.status(202).json({
            jobId: job.jobId,
            status: job.status
        });
    }
    catch (error) {
        next(error);
    }
};
exports.createEstimateJobController = createEstimateJobController;
const getEstimateJobController = (req, res, next) => {
    try {
        const { jobId } = req.params;
        const job = (0, estimate_job_service_1.getEstimateJob)(jobId);
        if (job.status === "COMPLETED") {
            res.status(200).json({
                status: "COMPLETED",
                result: job.result ?? []
            });
            return;
        }
        if (job.status === "FAILED") {
            res.status(200).json({
                status: "FAILED",
                error: job.error ?? "Job failed"
            });
            return;
        }
        res.status(200).json({ status: "PROCESSING" });
    }
    catch (error) {
        next(error);
    }
};
exports.getEstimateJobController = getEstimateJobController;
