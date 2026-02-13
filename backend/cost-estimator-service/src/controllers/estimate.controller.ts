import { Request, Response, NextFunction } from "express";
import { getEstimateJob, submitEstimateJob } from "../services/estimate-job.service";

export const createEstimateJobController = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const job = submitEstimateJob(req.body);
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
