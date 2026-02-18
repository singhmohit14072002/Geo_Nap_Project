import { randomUUID } from "crypto";
import {
  CloudProvider,
  EstimationJob,
  OrchestrationStatus,
  UploadOptions,
  UploadedFilePayload
} from "../domain/job.model";
import { parserResponseSchema, uploadRequestSchema } from "../schemas/upload.schema";
import logger from "../utils/logger";
import {
  createJob,
  getJob,
  setJobClarification,
  setJobFailure,
  setJobResult,
  updateJobStatus
} from "./job-store.service";
import { HttpError } from "../utils/http-error";
import { parseDocumentFile } from "./document-parser-client.service";
import { analyzeStructuredData } from "./structured-analyzer-client.service";
import { mapInfrastructure } from "./ai-mapping-client.service";
import { validateRequirement } from "./requirement-validator-client.service";
import { runCostEstimation } from "./cost-estimator-client.service";

const defaultProviders: CloudProvider[] = ["azure", "aws", "gcp"];
const projectPrefix = process.env.COST_ESTIMATOR_PROJECT_PREFIX ?? "AutoEstimate";

const processingJobs = new Set<string>();

const toUploadOptions = (input: unknown): UploadOptions => {
  const parsed = uploadRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new HttpError(
      422,
      "Upload options validation failed",
      parsed.error.flatten()
    );
  }
  return {
    cloudProviders: parsed.data.cloudProviders ?? defaultProviders,
    regionOverride: parsed.data.region ?? null,
    projectName: parsed.data.projectName ?? null
  };
};

const stageLog = (jobId: string, status: OrchestrationStatus, metadata?: unknown) => {
  logger.info("ORCHESTRATION_STAGE", {
    jobId,
    status,
    ...(metadata ? { metadata } : {})
  });
};

const toEstimatorRequirement = (
  validatedRequirement: Record<string, unknown>
): Record<string, unknown> => {
  const compute = Array.isArray(validatedRequirement.compute)
    ? validatedRequirement.compute
    : [];
  const network =
    typeof validatedRequirement.network === "object" &&
    validatedRequirement.network != null
      ? validatedRequirement.network
      : { dataEgressGB: 0 };

  const databaseRaw =
    typeof validatedRequirement.database === "object" &&
    validatedRequirement.database != null
      ? (validatedRequirement.database as Record<string, unknown>)
      : null;

  const database = databaseRaw
    ? {
        engine: String(databaseRaw.engine ?? "none"),
        storageGB: Number(databaseRaw.storageGB ?? 0),
        ha: Boolean(databaseRaw.ha ?? false)
      }
    : {
        engine: "none",
        storageGB: 0,
        ha: false
      };

  return {
    compute,
    database,
    network
  };
};

const resolveRegion = (
  validatedRequirement: Record<string, unknown>,
  override: string | null
): string => {
  if (override && override.trim()) {
    return override.trim();
  }
  const region = validatedRequirement.region;
  if (typeof region === "string" && region.trim()) {
    return region.trim();
  }
  return "centralindia";
};

export const createOrchestrationJob = (
  file: UploadedFilePayload,
  rawOptions: unknown
): EstimationJob => {
  const jobId = randomUUID();
  const options = toUploadOptions(rawOptions);
  const job = createJob(jobId, file, options);
  void runOrchestration(jobId);
  return job;
};

export const getOrchestrationJob = (jobId: string): EstimationJob => getJob(jobId);

const runOrchestration = async (jobId: string): Promise<void> => {
  if (processingJobs.has(jobId)) {
    return;
  }
  processingJobs.add(jobId);

  try {
    const job = getJob(jobId);
    if (!job.file) {
      throw new Error("Job file payload is missing");
    }

    updateJobStatus(jobId, "PARSING");
    stageLog(jobId, "PARSING");
    const parserOutput = await parseDocumentFile(
      job.file.content,
      job.file.fileName,
      job.file.mimeType
    );
    parserResponseSchema.parse(parserOutput);

    updateJobStatus(jobId, "ANALYZING");
    stageLog(jobId, "ANALYZING");
    const analyzed = await analyzeStructuredData(parserOutput);

    updateJobStatus(jobId, "MAPPING");
    stageLog(jobId, "MAPPING");
    const mappedRequirement = await mapInfrastructure({
      rawInfrastructureData: {
        computeCandidates: analyzed.computeCandidates,
        storageCandidates: analyzed.storageCandidates,
        databaseCandidates: analyzed.databaseCandidates,
        networkCandidates: analyzed.networkCandidates
      },
      sourceType: parserOutput.sourceType
    });

    updateJobStatus(jobId, "VALIDATING");
    stageLog(jobId, "VALIDATING");
    const validation = await validateRequirement(mappedRequirement);

    if (validation.status === "NEEDS_CLARIFICATION") {
      setJobClarification(jobId, {
        questions: validation.questions,
        issues: validation.issues
      });
      stageLog(jobId, "NEEDS_CLARIFICATION", {
        questionCount: validation.questions.length
      });
      return;
    }

    const validatedRequirement = validation.validatedRequirement;
    const targetRegion = resolveRegion(validatedRequirement, job.options.regionOverride);
    const projectName =
      job.options.projectName ??
      `${projectPrefix}-${new Date().toISOString().slice(0, 10)}-${jobId.slice(0, 8)}`;

    updateJobStatus(jobId, "SUBMITTING_ESTIMATION");
    stageLog(jobId, "SUBMITTING_ESTIMATION", {
      providers: job.options.cloudProviders,
      region: targetRegion
    });

    updateJobStatus(jobId, "WAITING_ESTIMATION");
    const estimator = await runCostEstimation({
      cloudProviders: job.options.cloudProviders,
      region: targetRegion,
      requirement: toEstimatorRequirement(validatedRequirement),
      projectName
    });

    setJobResult(jobId, {
      parserOutput: {
        sourceType: parserOutput.sourceType,
        parsingConfidence: parserOutput.parsingConfidence
      },
      analyzerOutput: {
        stats: analyzed.stats
      },
      mappedRequirement,
      validatedRequirement,
      estimatorJobId: estimator.estimatorJobId,
      estimatorResult: estimator.result
    });
    stageLog(jobId, "COMPLETED");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Orchestration failed";
    const currentStatus = getJob(jobId).status;
    setJobFailure(jobId, {
      stage: currentStatus === "FAILED" ? "FAILED" : currentStatus,
      message,
      details: error
    });
    logger.error("ORCHESTRATION_FAILED", {
      jobId,
      status: currentStatus,
      error: message
    });
  } finally {
    processingJobs.delete(jobId);
  }
};
