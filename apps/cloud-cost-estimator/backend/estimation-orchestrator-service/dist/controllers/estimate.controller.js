"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.estimateResultController = exports.estimateStatusController = exports.uploadEstimateController = void 0;
const http_error_1 = require("../utils/http-error");
const orchestrator_service_1 = require("../services/orchestrator.service");
const toUploadedFile = (file) => {
    if (!file) {
        throw new http_error_1.HttpError(400, "No file uploaded. Provide multipart field 'file'.");
    }
    return {
        fileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        content: file.buffer
    };
};
const uploadEstimateController = async (req, res, next) => {
    try {
        const file = toUploadedFile(req.file);
        const job = (0, orchestrator_service_1.createOrchestrationJob)(file, req.body);
        res.status(202).json({
            jobId: job.jobId,
            status: job.status,
            createdAt: job.createdAt
        });
    }
    catch (error) {
        next(error);
    }
};
exports.uploadEstimateController = uploadEstimateController;
const estimateStatusController = (req, res, next) => {
    try {
        const job = (0, orchestrator_service_1.getOrchestrationJob)(req.params.jobId);
        res.status(200).json({
            jobId: job.jobId,
            status: job.status,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt,
            clarification: job.clarification,
            error: job.error
        });
    }
    catch (error) {
        next(error);
    }
};
exports.estimateStatusController = estimateStatusController;
const estimateResultController = (req, res, next) => {
    try {
        const job = (0, orchestrator_service_1.getOrchestrationJob)(req.params.jobId);
        if (job.status === "COMPLETED" && job.result) {
            res.status(200).json({
                jobId: job.jobId,
                status: job.status,
                result: job.result
            });
            return;
        }
        if (job.status === "NEEDS_CLARIFICATION") {
            res.status(409).json({
                jobId: job.jobId,
                status: job.status,
                clarification: job.clarification
            });
            return;
        }
        if (job.status === "FAILED") {
            res.status(409).json({
                jobId: job.jobId,
                status: job.status,
                error: job.error
            });
            return;
        }
        res.status(409).json({
            jobId: job.jobId,
            status: job.status,
            message: "Result is not ready yet. Poll status endpoint."
        });
    }
    catch (error) {
        next(error);
    }
};
exports.estimateResultController = estimateResultController;
