import {
  ClarificationResult,
  EstimationJob,
  EstimationResultPayload,
  OrchestrationError,
  OrchestrationStatus,
  UploadOptions,
  UploadedFilePayload
} from "../domain/job.model";
import { HttpError } from "../utils/http-error";

const jobs = new Map<string, EstimationJob>();

const nowIso = (): string => new Date().toISOString();

export const createJob = (
  jobId: string,
  file: UploadedFilePayload,
  options: UploadOptions
): EstimationJob => {
  const timestamp = nowIso();
  const job: EstimationJob = {
    jobId,
    status: "PENDING",
    options,
    file,
    clarification: null,
    result: null,
    error: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  jobs.set(jobId, job);
  return job;
};

export const getJob = (jobId: string): EstimationJob => {
  const job = jobs.get(jobId);
  if (!job) {
    throw new HttpError(404, `Job not found: ${jobId}`);
  }
  return job;
};

export const updateJobStatus = (
  jobId: string,
  status: OrchestrationStatus
): EstimationJob => {
  const job = getJob(jobId);
  job.status = status;
  job.updatedAt = nowIso();
  return job;
};

export const setJobClarification = (
  jobId: string,
  clarification: ClarificationResult
): EstimationJob => {
  const job = updateJobStatus(jobId, "NEEDS_CLARIFICATION");
  job.clarification = clarification;
  job.error = null;
  return job;
};

export const setJobResult = (
  jobId: string,
  result: EstimationResultPayload
): EstimationJob => {
  const job = updateJobStatus(jobId, "COMPLETED");
  job.result = result;
  job.error = null;
  job.file = null;
  return job;
};

export const setJobFailure = (
  jobId: string,
  error: OrchestrationError
): EstimationJob => {
  const job = updateJobStatus(jobId, "FAILED");
  job.error = error;
  return job;
};

export const listJobs = (): EstimationJob[] => Array.from(jobs.values());

