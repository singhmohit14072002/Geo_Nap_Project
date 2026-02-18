import { z } from "zod";
import {
  estimatorCreateResponseSchema,
  estimatorStatusCompletedSchema,
  estimatorStatusFailedSchema,
  estimatorStatusProcessingSchema
} from "../schemas/upload.schema";
import { HttpError } from "../utils/http-error";
import logger from "../utils/logger";
import { sleep } from "../utils/sleep";
import { requestJson } from "./http-client.service";

const costEstimatorBaseUrl =
  process.env.COST_ESTIMATOR_URL ?? "http://127.0.0.1:4001";

const pollIntervalMs = Number(process.env.COST_ESTIMATOR_POLL_INTERVAL_MS ?? "2000");
const timeoutMs = Number(process.env.COST_ESTIMATOR_TIMEOUT_MS ?? "180000");

const loginResponseSchema = z
  .object({
    token: z.string()
  })
  .strict();

const registerResponseSchema = z
  .object({
    token: z.string()
  })
  .strict();

const projectCreateResponseSchema = z
  .object({
    id: z.string().uuid()
  })
  .strict();

export type CloudProvider = "azure" | "aws" | "gcp";

export interface EstimateSubmitInput {
  cloudProviders: CloudProvider[];
  region: string;
  requirement: Record<string, unknown>;
  projectName: string;
}

interface EstimatorAuthConfig {
  email: string;
  password: string;
  organizationName: string;
}

const authConfig: EstimatorAuthConfig = {
  email: process.env.COST_ESTIMATOR_EMAIL ?? "orchestrator@geo-nap.local",
  password: process.env.COST_ESTIMATOR_PASSWORD ?? "ChangeThisPassword123!",
  organizationName:
    process.env.COST_ESTIMATOR_ORGANIZATION ?? "Geo-NAP Orchestrator"
};

let bearerToken: string | null = null;

const authHeaders = () =>
  {
    const headers: Record<string, string> = {};
    if (bearerToken) {
      headers.Authorization = `Bearer ${bearerToken}`;
    }
    return headers;
  };

const isUnauthorizedDownstream = (error: unknown): boolean => {
  if (!(error instanceof HttpError)) {
    return false;
  }
  const details = error.details;
  if (!details || typeof details !== "object") {
    return false;
  }
  const message = (details as Record<string, unknown>).error;
  return typeof message === "string" && message.toLowerCase().includes("unauthorized");
};

const login = async (): Promise<string> => {
  const response = await requestJson({
    url: `${costEstimatorBaseUrl}/auth/login`,
    method: "POST",
    body: {
      email: authConfig.email,
      password: authConfig.password
    },
    schema: loginResponseSchema
  });
  return response.token;
};

const register = async (): Promise<string> => {
  const response = await requestJson({
    url: `${costEstimatorBaseUrl}/auth/register`,
    method: "POST",
    body: {
      email: authConfig.email,
      password: authConfig.password,
      organizationName: authConfig.organizationName
    },
    schema: registerResponseSchema,
    expectedStatuses: [201]
  });
  return response.token;
};

const ensureAuthToken = async (): Promise<string> => {
  if (bearerToken) {
    return bearerToken;
  }

  try {
    bearerToken = await login();
    return bearerToken;
  } catch (error) {
    logger.warn("COST_ESTIMATOR_LOGIN_FAILED_TRY_REGISTER", {
      error: error instanceof Error ? error.message : "unknown"
    });
  }

  try {
    bearerToken = await register();
    return bearerToken;
  } catch (error) {
    logger.warn("COST_ESTIMATOR_REGISTER_FAILED_TRY_LOGIN", {
      error: error instanceof Error ? error.message : "unknown"
    });
  }

  bearerToken = await login();
  return bearerToken;
};

const createProject = async (
  projectName: string,
  region: string
): Promise<string> => {
  await ensureAuthToken();
  try {
    const response = await requestJson({
      url: `${costEstimatorBaseUrl}/projects`,
      method: "POST",
      headers: authHeaders(),
      body: {
        name: projectName,
        region
      },
      schema: projectCreateResponseSchema,
      expectedStatuses: [201]
    });
    return response.id;
  } catch (error) {
    if (isUnauthorizedDownstream(error)) {
      bearerToken = null;
      await ensureAuthToken();
      const retry = await requestJson({
        url: `${costEstimatorBaseUrl}/projects`,
        method: "POST",
        headers: authHeaders(),
        body: {
          name: projectName,
          region
        },
        schema: projectCreateResponseSchema,
        expectedStatuses: [201]
      });
      return retry.id;
    }
    throw error;
  }
};

const submitEstimateJob = async (
  projectId: string,
  input: EstimateSubmitInput
): Promise<string> => {
  const payload = {
    projectId,
    cloudProviders: input.cloudProviders,
    region: input.region,
    requirement: input.requirement
  };

  try {
    const response = await requestJson({
      url: `${costEstimatorBaseUrl}/estimate`,
      method: "POST",
      headers: authHeaders(),
      body: payload,
      schema: estimatorCreateResponseSchema,
      expectedStatuses: [202]
    });
    return response.jobId;
  } catch (error) {
    if (isUnauthorizedDownstream(error)) {
      bearerToken = null;
      await ensureAuthToken();
      const retry = await requestJson({
        url: `${costEstimatorBaseUrl}/estimate`,
        method: "POST",
        headers: authHeaders(),
        body: payload,
        schema: estimatorCreateResponseSchema,
        expectedStatuses: [202]
      });
      return retry.jobId;
    }
    throw error;
  }
};

const fetchEstimateStatus = async (jobId: string) => {
  try {
    return await requestJson({
      url: `${costEstimatorBaseUrl}/estimate/${jobId}`,
      method: "GET",
      headers: authHeaders()
    });
  } catch (error) {
    if (isUnauthorizedDownstream(error)) {
      bearerToken = null;
      await ensureAuthToken();
      return requestJson({
        url: `${costEstimatorBaseUrl}/estimate/${jobId}`,
        method: "GET",
        headers: authHeaders()
      });
    }
    throw error;
  }
};

export const runCostEstimation = async (input: EstimateSubmitInput) => {
  const projectId = await createProject(input.projectName, input.region);
  const estimatorJobId = await submitEstimateJob(projectId, input);

  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const payload = await fetchEstimateStatus(estimatorJobId);
    const processing = estimatorStatusProcessingSchema.safeParse(payload);
    if (processing.success) {
      await sleep(pollIntervalMs);
      continue;
    }

    const completed = estimatorStatusCompletedSchema.safeParse(payload);
    if (completed.success) {
      return {
        estimatorJobId,
        result: completed.data.result
      };
    }

    const failed = estimatorStatusFailedSchema.safeParse(payload);
    if (failed.success) {
      throw new HttpError(
        502,
        failed.data.error
          ? `cost-estimator-service job failed: ${failed.data.error}`
          : "cost-estimator-service job failed"
      );
    }

    throw new HttpError(
      502,
      "Unexpected response from cost-estimator-service status endpoint",
      payload
    );
  }

  throw new HttpError(
    504,
    `cost-estimator-service job timeout after ${timeoutMs}ms`
  );
};
