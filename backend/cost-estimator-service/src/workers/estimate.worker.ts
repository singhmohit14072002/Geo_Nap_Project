import { EstimateSchemaInput } from "../schemas/estimate.schema";
import {
  incrementEstimationJobsFailed,
  incrementEstimationJobsTotal,
  observeEstimationDurationSeconds
} from "../metrics/metrics.service";
import { runEstimateComputation } from "../services/estimate-execution.service";
import { saveEstimationResult } from "../services/estimation-persistence.service";
import {
  getEstimateJobById,
  updateEstimateJobStatus
} from "../services/job-store.service";
import logger from "../utils/logger";

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
    logger.warn("Estimate job missing in store before processing", { jobId });
    return;
  }

  const started = process.hrtime.bigint();
  incrementEstimationJobsTotal();
  updateEstimateJobStatus(jobId, "PROCESSING");

  try {
    const payload = job.requestPayload as EstimateSchemaInput;
    const result = await runEstimateComputation(payload);
    await saveEstimationResult({
      projectId: job.projectId,
      requirementJson: payload,
      resultJson: result
    });
    const durationSeconds = Number(process.hrtime.bigint() - started) / 1_000_000_000;
    observeEstimationDurationSeconds(durationSeconds);
    updateEstimateJobStatus(jobId, "COMPLETED", { result, error: undefined });
    logger.info("Estimate job completed", {
      jobId,
      durationSeconds,
      providerCount: Array.isArray(result) ? result.length : 0
    });
  } catch (err) {
    const durationSeconds = Number(process.hrtime.bigint() - started) / 1_000_000_000;
    incrementEstimationJobsFailed();
    observeEstimationDurationSeconds(durationSeconds);
    updateEstimateJobStatus(jobId, "FAILED", {
      error: extractErrorMessage(err)
    });
    logger.error("Estimate job failed", {
      jobId,
      durationSeconds,
      error: extractErrorMessage(err)
    });
  }
};
