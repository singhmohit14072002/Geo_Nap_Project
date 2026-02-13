import { EstimateJob, JobStatus } from "../domain/job.model";

const jobStore = new Map<string, EstimateJob>();

export const saveEstimateJob = (job: EstimateJob): void => {
  jobStore.set(job.jobId, job);
};

export const getEstimateJobById = (jobId: string): EstimateJob | undefined => {
  return jobStore.get(jobId);
};

export const updateEstimateJobStatus = (
  jobId: string,
  status: JobStatus,
  updates?: Partial<EstimateJob>
): EstimateJob | undefined => {
  const existing = jobStore.get(jobId);
  if (!existing) {
    return undefined;
  }

  const updated: EstimateJob = {
    ...existing,
    ...updates,
    status,
    updatedAt: new Date()
  };
  jobStore.set(jobId, updated);
  return updated;
};

