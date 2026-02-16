import { Request, Response, NextFunction } from "express";
import { getEstimateJob, submitEstimateJob } from "../services/estimate-job.service";
import { HttpError } from "../utils/http-error.util";
import {
  ReportFormat,
  generateReport
} from "../services/report-generator.service";

const requireAuthUser = (req: Request) => {
  if (!req.authUser) {
    throw new HttpError(401, "Unauthorized");
  }
  return req.authUser;
};

const ensureJobAccess = (req: Request, jobOrganizationId: string): void => {
  const authUser = requireAuthUser(req);
  if (authUser.organizationId !== jobOrganizationId) {
    throw new HttpError(404, "Estimate job not found");
  }
};

export const createEstimateJobController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authUser = requireAuthUser(req);
    const job = await submitEstimateJob(req.body, authUser);
    res.status(202).json({
      jobId: job.jobId,
      status: job.status
    });
  } catch (error) {
    next(error);
  }
};

export const getEstimateJobController = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const { jobId } = req.params;
    const job = getEstimateJob(jobId);
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
  } catch (error) {
    next(error);
  }
};

const parseReportFormat = (raw: unknown): ReportFormat => {
  const value = String(raw ?? "zip").toLowerCase();
  if (value === "pdf" || value === "xlsx" || value === "zip") {
    return value;
  }
  throw new HttpError(400, "Invalid report format. Use pdf, xlsx, or zip.");
};

export const downloadEstimateReportController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { jobId } = req.params;
    const format = parseReportFormat(req.query.format);
    const job = getEstimateJob(jobId);
    ensureJobAccess(req, job.organizationId);

    if (job.status !== "COMPLETED") {
      throw new HttpError(
        409,
        `Report is available only for COMPLETED jobs. Current status: ${job.status}`
      );
    }

    const results = Array.isArray(job.result) ? job.result : [];
    const region = String(job.requestPayload?.region ?? "unknown");
    const file = await generateReport(
      {
        jobId,
        region,
        results
      },
      format
    );

    res.setHeader("Content-Type", file.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=\"${file.fileName}\"`
    );
    res.status(200).send(file.buffer);
  } catch (error) {
    next(error);
  }
};
