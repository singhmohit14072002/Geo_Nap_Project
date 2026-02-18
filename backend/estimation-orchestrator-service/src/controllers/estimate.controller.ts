import { NextFunction, Request, Response } from "express";
import { HttpError } from "../utils/http-error";
import {
  createOrchestrationJob,
  getOrchestrationJob
} from "../services/orchestrator.service";

const toUploadedFile = (file: Express.Multer.File | undefined) => {
  if (!file) {
    throw new HttpError(400, "No file uploaded. Provide multipart field 'file'.");
  }
  return {
    fileName: file.originalname,
    mimeType: file.mimetype,
    sizeBytes: file.size,
    content: file.buffer
  };
};

export const uploadEstimateController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const file = toUploadedFile(req.file);
    const job = createOrchestrationJob(file, req.body);
    res.status(202).json({
      jobId: job.jobId,
      status: job.status,
      createdAt: job.createdAt
    });
  } catch (error) {
    next(error);
  }
};

export const estimateStatusController = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const job = getOrchestrationJob(req.params.jobId);
    res.status(200).json({
      jobId: job.jobId,
      status: job.status,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      clarification: job.clarification,
      error: job.error
    });
  } catch (error) {
    next(error);
  }
};

export const estimateResultController = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const job = getOrchestrationJob(req.params.jobId);

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
  } catch (error) {
    next(error);
  }
};

