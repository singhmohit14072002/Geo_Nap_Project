import { EstimateSchemaInput } from "../schemas/estimate.schema";
import {
  incrementEstimationJobsFailed,
  incrementEstimationJobsTotal,
  observeEstimationDurationSeconds
} from "../metrics/metrics.service";
import { runEstimateComputation, AzurePricingResponse } from "../services/estimate-execution.service";
import { saveEstimationResult } from "../services/estimation-persistence.service";
import {
  getEstimateJobById,
  updateEstimateJobStatus
} from "../services/job-store.service";
import logger from "../utils/logger";
import { runWithRequestContext } from "../utils/request-context";

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

  const execute = async (): Promise<void> => {
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
      const providerCount = Array.isArray(result)
        ? result.length
        : (result as AzurePricingResponse)?.provider === "AZURE"
        ? 1
        : 1;
      logger.info("Estimate job completed", {
        jobId,
        durationSeconds,
        providerCount
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

  if (job.requestId) {
    await runWithRequestContext({ requestId: job.requestId }, () => execute());
    return;
  }

  await execute();
};
