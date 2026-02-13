import { EstimateSchemaInput } from "../schemas/estimate.schema";
import { runEstimateComputation } from "../services/estimate-execution.service";
import {
  getEstimateJobById,
  updateEstimateJobStatus
} from "../services/job-store.service";

const extractErrorMessage = (err: unknown): string => {
  if (err instanceof Error) {
    return err.message;
  }
  return "Unknown job processing failure";
};

export const enqueueEstimateJob = (jobId: string): void => {
  setTimeout(() => {
    void processEstimateJob(jobId);
  }, 0);
};

export const processEstimateJob = async (jobId: string): Promise<void> => {
  const job = getEstimateJobById(jobId);
  if (!job) {
    return;
  }

  updateEstimateJobStatus(jobId, "PROCESSING");

  try {
    const payload = job.requestPayload as EstimateSchemaInput;
    const result = await runEstimateComputation(payload);
    updateEstimateJobStatus(jobId, "COMPLETED", { result, error: undefined });
  } catch (err) {
    updateEstimateJobStatus(jobId, "FAILED", {
      error: extractErrorMessage(err)
    });
  }
};
