"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadEstimateReportController = exports.getEstimateJobController = exports.createEstimateJobController = void 0;
const estimate_job_service_1 = require("../services/estimate-job.service");
const http_error_util_1 = require("../utils/http-error.util");
const report_generator_service_1 = require("../services/report-generator.service");
const requireAuthUser = (req) => {
    if (!req.authUser) {
        throw new http_error_util_1.HttpError(401, "Unauthorized");
    }
    return req.authUser;
};
const ensureJobAccess = (req, jobOrganizationId) => {
    const authUser = requireAuthUser(req);
    if (authUser.organizationId !== jobOrganizationId) {
        throw new http_error_util_1.HttpError(404, "Estimate job not found");
    }
};
const createEstimateJobController = async (req, res, next) => {
    try {
        const authUser = requireAuthUser(req);
        const job = await (0, estimate_job_service_1.submitEstimateJob)(req.body, authUser);
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
        ensureJobAccess(req, job.organizationId);
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
const parseReportFormat = (raw) => {
    const value = String(raw ?? "zip").toLowerCase();
    if (value === "pdf" || value === "xlsx" || value === "zip") {
        return value;
    }
    throw new http_error_util_1.HttpError(400, "Invalid report format. Use pdf, xlsx, or zip.");
};
const downloadEstimateReportController = async (req, res, next) => {
    try {
        const { jobId } = req.params;
        const format = parseReportFormat(req.query.format);
        const job = (0, estimate_job_service_1.getEstimateJob)(jobId);
        ensureJobAccess(req, job.organizationId);
        if (job.status !== "COMPLETED") {
            throw new http_error_util_1.HttpError(409, `Report is available only for COMPLETED jobs. Current status: ${job.status}`);
        }
        const results = Array.isArray(job.result) ? job.result : [];
        const region = String(job.requestPayload?.region ?? "unknown");
        const file = await (0, report_generator_service_1.generateReport)({
            jobId,
            region,
            results
        }, format);
        res.setHeader("Content-Type", file.mimeType);
        res.setHeader("Content-Disposition", `attachment; filename=\"${file.fileName}\"`);
        res.status(200).send(file.buffer);
    }
    catch (error) {
        next(error);
    }
};
exports.downloadEstimateReportController = downloadEstimateReportController;
