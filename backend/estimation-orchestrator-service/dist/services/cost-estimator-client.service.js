"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCostEstimation = void 0;
const zod_1 = require("zod");
const upload_schema_1 = require("../schemas/upload.schema");
const http_error_1 = require("../utils/http-error");
const logger_1 = __importDefault(require("../utils/logger"));
const sleep_1 = require("../utils/sleep");
const http_client_service_1 = require("./http-client.service");
const costEstimatorBaseUrl = process.env.COST_ESTIMATOR_URL ?? "http://127.0.0.1:4001";
const pollIntervalMs = Number(process.env.COST_ESTIMATOR_POLL_INTERVAL_MS ?? "2000");
const timeoutMs = Number(process.env.COST_ESTIMATOR_TIMEOUT_MS ?? "180000");
const loginResponseSchema = zod_1.z
    .object({
    token: zod_1.z.string()
})
    .passthrough();
const registerResponseSchema = zod_1.z
    .object({
    token: zod_1.z.string()
})
    .passthrough();
const projectCreateResponseSchema = zod_1.z
    .object({
    id: zod_1.z.string().uuid()
})
    .passthrough();
const authConfig = {
    email: process.env.COST_ESTIMATOR_EMAIL ?? "orchestrator@geo-nap.local",
    password: process.env.COST_ESTIMATOR_PASSWORD ?? "ChangeThisPassword123!",
    organizationName: process.env.COST_ESTIMATOR_ORGANIZATION ?? "Geo-NAP Orchestrator"
};
let bearerToken = null;
const authHeaders = () => {
    const headers = {};
    if (bearerToken) {
        headers.Authorization = `Bearer ${bearerToken}`;
    }
    return headers;
};
const isUnauthorizedDownstream = (error) => {
    if (!(error instanceof http_error_1.HttpError)) {
        return false;
    }
    const details = error.details;
    if (!details || typeof details !== "object") {
        return false;
    }
    const message = details.error;
    return typeof message === "string" && message.toLowerCase().includes("unauthorized");
};
const login = async () => {
    const response = await (0, http_client_service_1.requestJson)({
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
const register = async () => {
    const response = await (0, http_client_service_1.requestJson)({
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
const ensureAuthToken = async () => {
    if (bearerToken) {
        return bearerToken;
    }
    try {
        bearerToken = await login();
        return bearerToken;
    }
    catch (error) {
        logger_1.default.warn("COST_ESTIMATOR_LOGIN_FAILED_TRY_REGISTER", {
            error: error instanceof Error ? error.message : "unknown"
        });
    }
    try {
        bearerToken = await register();
        return bearerToken;
    }
    catch (error) {
        logger_1.default.warn("COST_ESTIMATOR_REGISTER_FAILED_TRY_LOGIN", {
            error: error instanceof Error ? error.message : "unknown"
        });
    }
    bearerToken = await login();
    return bearerToken;
};
const createProject = async (projectName, region) => {
    await ensureAuthToken();
    try {
        const response = await (0, http_client_service_1.requestJson)({
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
    }
    catch (error) {
        if (isUnauthorizedDownstream(error)) {
            bearerToken = null;
            await ensureAuthToken();
            const retry = await (0, http_client_service_1.requestJson)({
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
const submitEstimateJob = async (projectId, input) => {
    const payload = {
        projectId,
        cloudProviders: input.cloudProviders,
        region: input.region,
        ...(input.requirement ? { requirement: input.requirement } : {}),
        ...(input.azureEstimate ? { azureEstimate: input.azureEstimate } : {})
    };
    try {
        const response = await (0, http_client_service_1.requestJson)({
            url: `${costEstimatorBaseUrl}/estimate`,
            method: "POST",
            headers: authHeaders(),
            body: payload,
            schema: upload_schema_1.estimatorCreateResponseSchema,
            expectedStatuses: [202]
        });
        return response.jobId;
    }
    catch (error) {
        if (isUnauthorizedDownstream(error)) {
            bearerToken = null;
            await ensureAuthToken();
            const retry = await (0, http_client_service_1.requestJson)({
                url: `${costEstimatorBaseUrl}/estimate`,
                method: "POST",
                headers: authHeaders(),
                body: payload,
                schema: upload_schema_1.estimatorCreateResponseSchema,
                expectedStatuses: [202]
            });
            return retry.jobId;
        }
        throw error;
    }
};
const fetchEstimateStatus = async (jobId) => {
    try {
        return await (0, http_client_service_1.requestJson)({
            url: `${costEstimatorBaseUrl}/estimate/${jobId}`,
            method: "GET",
            headers: authHeaders()
        });
    }
    catch (error) {
        if (isUnauthorizedDownstream(error)) {
            bearerToken = null;
            await ensureAuthToken();
            return (0, http_client_service_1.requestJson)({
                url: `${costEstimatorBaseUrl}/estimate/${jobId}`,
                method: "GET",
                headers: authHeaders()
            });
        }
        throw error;
    }
};
const runCostEstimation = async (input) => {
    const projectId = await createProject(input.projectName, input.region);
    const estimatorJobId = await submitEstimateJob(projectId, input);
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        const payload = await fetchEstimateStatus(estimatorJobId);
        const processing = upload_schema_1.estimatorStatusProcessingSchema.safeParse(payload);
        if (processing.success) {
            await (0, sleep_1.sleep)(pollIntervalMs);
            continue;
        }
        const completed = upload_schema_1.estimatorStatusCompletedSchema.safeParse(payload);
        if (completed.success) {
            return {
                estimatorJobId,
                result: completed.data.result
            };
        }
        const failed = upload_schema_1.estimatorStatusFailedSchema.safeParse(payload);
        if (failed.success) {
            throw new http_error_1.HttpError(502, failed.data.error
                ? `cost-estimator-service job failed: ${failed.data.error}`
                : "cost-estimator-service job failed");
        }
        throw new http_error_1.HttpError(502, "Unexpected response from cost-estimator-service status endpoint", payload);
    }
    throw new http_error_1.HttpError(504, `cost-estimator-service job timeout after ${timeoutMs}ms`);
};
exports.runCostEstimation = runCostEstimation;
