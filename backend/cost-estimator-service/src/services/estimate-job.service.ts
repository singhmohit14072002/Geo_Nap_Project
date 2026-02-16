import { randomUUID } from "crypto";
import { EstimateJob } from "../domain/job.model";
import { estimateSchema } from "../schemas/estimate.schema";
import { AuthUser } from "../types/auth.types";
import { HttpError } from "../utils/http-error.util";
import { saveEstimateJob, getEstimateJobById } from "./job-store.service";
import { assertProjectAccess } from "./project.service";
import { enqueueEstimateJob } from "../workers/estimate.worker";

export const submitEstimateJob = async (
  payload: unknown,
  authUser: AuthUser
): Promise<EstimateJob> => {
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

  await assertProjectAccess(authUser, parsed.data.projectId);

  const now = new Date();
  const job: EstimateJob = {
    jobId: randomUUID(),
    status: "PENDING",
    userId: authUser.id,
    organizationId: authUser.organizationId,
    projectId: parsed.data.projectId,
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
