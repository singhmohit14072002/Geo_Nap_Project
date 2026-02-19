"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrchestrationJob = exports.createOrchestrationJob = void 0;
const crypto_1 = require("crypto");
const upload_schema_1 = require("../schemas/upload.schema");
const logger_1 = __importDefault(require("../utils/logger"));
const job_store_service_1 = require("./job-store.service");
const http_error_1 = require("../utils/http-error");
const document_parser_client_service_1 = require("./document-parser-client.service");
const structured_analyzer_client_service_1 = require("./structured-analyzer-client.service");
const ai_mapping_client_service_1 = require("./ai-mapping-client.service");
const requirement_validator_client_service_1 = require("./requirement-validator-client.service");
const cost_estimator_client_service_1 = require("./cost-estimator-client.service");
const defaultProviders = ["azure", "aws", "gcp"];
const projectPrefix = process.env.COST_ESTIMATOR_PROJECT_PREFIX ?? "AutoEstimate";
const mappingConfidenceThreshold = Number(process.env.MAPPING_CONFIDENCE_THRESHOLD ?? "0.65");
const processingJobs = new Set();
const toUploadOptions = (input) => {
    const parsed = upload_schema_1.uploadRequestSchema.safeParse(input);
    if (!parsed.success) {
        throw new http_error_1.HttpError(422, "Upload options validation failed", parsed.error.flatten());
    }
    return {
        cloudProviders: parsed.data.cloudProviders ?? defaultProviders,
        regionOverride: parsed.data.region ?? null,
        projectName: parsed.data.projectName ?? null
    };
};
const stageLog = (jobId, status, metadata) => {
    logger_1.default.info("ORCHESTRATION_STAGE", {
        jobId,
        status,
        ...(metadata ? { metadata } : {})
    });
};
const lowConfidenceIssues = (warnings) => warnings.map((message, index) => ({
    code: "MAPPING_LOW_CONFIDENCE",
    path: `mapping.warnings[${index}]`,
    message
}));
const toEstimatorRequirement = (validatedRequirement) => {
    const compute = Array.isArray(validatedRequirement.compute)
        ? validatedRequirement.compute
        : [];
    const network = typeof validatedRequirement.network === "object" &&
        validatedRequirement.network != null
        ? validatedRequirement.network
        : { dataEgressGB: 0 };
    const databaseRaw = typeof validatedRequirement.database === "object" &&
        validatedRequirement.database != null
        ? validatedRequirement.database
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
const resolveRegion = (validatedRequirement, override) => {
    if (override && override.trim()) {
        return override.trim();
    }
    const region = validatedRequirement.region;
    if (typeof region === "string" && region.trim()) {
        return region.trim();
    }
    return "centralindia";
};
const resolveCloudEstimateRegion = (analyzed, override) => {
    if (override && override.trim()) {
        return override.trim();
    }
    const regionCandidates = analyzed.serviceClassification.classifiedServices
        .map((item) => item.row)
        .map((row) => {
        if (typeof row.region === "string" && row.region.trim()) {
            return row.region.trim();
        }
        if (typeof row.__empty_2 === "string" && row.__empty_2.trim()) {
            return row.__empty_2.trim();
        }
        return null;
    })
        .filter((value) => Boolean(value));
    if (regionCandidates.length > 0) {
        const first = regionCandidates[0].toLowerCase().replace(/[^a-z0-9]/g, "");
        if (first === "centralindia") {
            return "centralindia";
        }
        if (first === "southindia") {
            return "southindia";
        }
    }
    return "centralindia";
};
const applyRegionOverride = (mappedRequirement, override) => {
    if (!override || !override.trim()) {
        return mappedRequirement;
    }
    return {
        ...mappedRequirement,
        region: override.trim()
    };
};
const createOrchestrationJob = (file, rawOptions) => {
    const jobId = (0, crypto_1.randomUUID)();
    const options = toUploadOptions(rawOptions);
    const job = (0, job_store_service_1.createJob)(jobId, file, options);
    void runOrchestration(jobId);
    return job;
};
exports.createOrchestrationJob = createOrchestrationJob;
const getOrchestrationJob = (jobId) => (0, job_store_service_1.getJob)(jobId);
exports.getOrchestrationJob = getOrchestrationJob;
const runOrchestration = async (jobId) => {
    if (processingJobs.has(jobId)) {
        return;
    }
    processingJobs.add(jobId);
    try {
        const job = (0, job_store_service_1.getJob)(jobId);
        if (!job.file) {
            throw new Error("Job file payload is missing");
        }
        (0, job_store_service_1.updateJobStatus)(jobId, "PARSING");
        stageLog(jobId, "PARSING");
        const parserOutput = await (0, document_parser_client_service_1.parseDocumentFile)(job.file.content, job.file.fileName, job.file.mimeType);
        upload_schema_1.parserResponseSchema.parse(parserOutput);
        (0, job_store_service_1.updateJobStatus)(jobId, "ANALYZING");
        stageLog(jobId, "ANALYZING");
        const analyzed = await (0, structured_analyzer_client_service_1.analyzeStructuredData)(parserOutput);
        if (analyzed.documentType === "CLOUD_ESTIMATE") {
            const cloudEstimateRegion = resolveCloudEstimateRegion(analyzed, job.options.regionOverride);
            const projectName = job.options.projectName ??
                `${projectPrefix}-${new Date().toISOString().slice(0, 10)}-${jobId.slice(0, 8)}`;
            (0, job_store_service_1.updateJobStatus)(jobId, "SUBMITTING_ESTIMATION");
            stageLog(jobId, "SUBMITTING_ESTIMATION", {
                mode: "CLOUD_ESTIMATE",
                providers: job.options.cloudProviders,
                region: cloudEstimateRegion
            });
            (0, job_store_service_1.updateJobStatus)(jobId, "WAITING_ESTIMATION");
            const estimator = await (0, cost_estimator_client_service_1.runCostEstimation)({
                cloudProviders: job.options.cloudProviders,
                region: cloudEstimateRegion,
                azureEstimate: {
                    documentType: "CLOUD_ESTIMATE",
                    classifiedServices: analyzed.serviceClassification.classifiedServices
                },
                projectName
            });
            (0, job_store_service_1.setJobResult)(jobId, {
                parserOutput: {
                    sourceType: parserOutput.sourceType,
                    parsingConfidence: parserOutput.parsingConfidence
                },
                analyzerOutput: {
                    documentType: analyzed.documentType,
                    detection: analyzed.detection,
                    serviceClassification: {
                        summary: analyzed.serviceClassification.summary,
                        totalClassifiedRows: analyzed.serviceClassification.classifiedServices.length
                    },
                    stats: analyzed.stats
                },
                mappingConfidence: 1,
                mappingWarnings: [],
                mappedRequirement: {},
                validatedRequirement: {},
                estimatorJobId: estimator.estimatorJobId,
                estimatorResult: estimator.result
            });
            stageLog(jobId, "COMPLETED", {
                mode: "CLOUD_ESTIMATE"
            });
            return;
        }
        (0, job_store_service_1.updateJobStatus)(jobId, "MAPPING");
        stageLog(jobId, "MAPPING");
        const mappingResult = await (0, ai_mapping_client_service_1.mapInfrastructure)({
            rawInfrastructureData: {
                computeCandidates: analyzed.computeCandidates,
                storageCandidates: analyzed.storageCandidates,
                databaseCandidates: analyzed.databaseCandidates,
                networkCandidates: analyzed.networkCandidates
            },
            sourceType: parserOutput.sourceType
        });
        const mappedRequirementRaw = mappingResult.requirement;
        const mappedRequirement = applyRegionOverride(mappedRequirementRaw, job.options.regionOverride);
        if (mappingResult.mappingConfidence < mappingConfidenceThreshold) {
            const questions = mappingResult.warnings.length > 0
                ? mappingResult.warnings
                : [
                    `Extraction confidence is below threshold (${mappingResult.mappingConfidence} < ${mappingConfidenceThreshold}). Please review input.`
                ];
            (0, job_store_service_1.setJobClarification)(jobId, {
                questions,
                issues: lowConfidenceIssues(questions)
            });
            stageLog(jobId, "NEEDS_CLARIFICATION", {
                reason: "LOW_MAPPING_CONFIDENCE",
                mappingConfidence: mappingResult.mappingConfidence,
                threshold: mappingConfidenceThreshold
            });
            return;
        }
        (0, job_store_service_1.updateJobStatus)(jobId, "VALIDATING");
        stageLog(jobId, "VALIDATING");
        const validation = await (0, requirement_validator_client_service_1.validateRequirement)(mappedRequirement);
        if (validation.status === "NEEDS_CLARIFICATION") {
            (0, job_store_service_1.setJobClarification)(jobId, {
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
        const projectName = job.options.projectName ??
            `${projectPrefix}-${new Date().toISOString().slice(0, 10)}-${jobId.slice(0, 8)}`;
        (0, job_store_service_1.updateJobStatus)(jobId, "SUBMITTING_ESTIMATION");
        stageLog(jobId, "SUBMITTING_ESTIMATION", {
            providers: job.options.cloudProviders,
            region: targetRegion
        });
        (0, job_store_service_1.updateJobStatus)(jobId, "WAITING_ESTIMATION");
        const estimator = await (0, cost_estimator_client_service_1.runCostEstimation)({
            cloudProviders: job.options.cloudProviders,
            region: targetRegion,
            requirement: toEstimatorRequirement(validatedRequirement),
            projectName
        });
        (0, job_store_service_1.setJobResult)(jobId, {
            parserOutput: {
                sourceType: parserOutput.sourceType,
                parsingConfidence: parserOutput.parsingConfidence
            },
            analyzerOutput: {
                documentType: analyzed.documentType,
                detection: analyzed.detection,
                serviceClassification: {
                    summary: analyzed.serviceClassification.summary,
                    totalClassifiedRows: analyzed.serviceClassification.classifiedServices.length
                },
                stats: analyzed.stats
            },
            mappingConfidence: mappingResult.mappingConfidence,
            mappingWarnings: mappingResult.warnings,
            mappedRequirement,
            validatedRequirement,
            estimatorJobId: estimator.estimatorJobId,
            estimatorResult: estimator.result
        });
        stageLog(jobId, "COMPLETED");
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Orchestration failed";
        const currentStatus = (0, job_store_service_1.getJob)(jobId).status;
        (0, job_store_service_1.setJobFailure)(jobId, {
            stage: currentStatus === "FAILED" ? "FAILED" : currentStatus,
            message,
            details: error
        });
        logger_1.default.error("ORCHESTRATION_FAILED", {
            jobId,
            status: currentStatus,
            error: message
        });
    }
    finally {
        processingJobs.delete(jobId);
    }
};
