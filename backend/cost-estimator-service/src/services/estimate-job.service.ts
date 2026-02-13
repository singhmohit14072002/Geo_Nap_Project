import { randomUUID } from "crypto";
import { EstimateJob } from "../domain/job.model";
import { estimateSchema } from "../schemas/estimate.schema";
import { HttpError } from "../utils/http-error.util";
import { saveEstimateJob, getEstimateJobById } from "./job-store.service";
import { enqueueEstimateJob } from "../workers/estimate.worker";

export const submitEstimateJob = (payload: unknown): EstimateJob => {
  const parsed = estimateSchema.safeParse(payload);
  if (!parsed.success) {
    const hasInvalidProvider = parsed.error.issues.some(
      (issue) =>
        issue.path[0] === "cloudProviders" &&
        issue.code === "invalid_enum_value"
    );
    if (hasInvalidProvider) {
      throw new HttpError(
        400,
        "Invalid provider in cloudProviders",
        parsed.error.flatten()
      );
    }
    throw new HttpError(422, "Validation failed", parsed.error.flatten());
  }

  const now = new Date();
  const job: EstimateJob = {
    jobId: randomUUID(),
    status: "PENDING",
    requestPayload: parsed.data,
    createdAt: now,
    updatedAt: now
  };

  saveEstimateJob(job);
  enqueueEstimateJob(job.jobId);
  return job;
};

export const getEstimateJob = (jobId: string): EstimateJob => {
  const job = getEstimateJobById(jobId);
  if (!job) {
    throw new HttpError(404, `Estimate job not found: ${jobId}`);
  }
  return job;
};

