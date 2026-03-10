"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.observeHttpRequestDurationSeconds = exports.observePricingSyncDurationSeconds = exports.incrementExtractionFailuresTotal = exports.incrementExtractionRequestsTotal = exports.observeEstimationDurationSeconds = exports.incrementEstimationJobsFailed = exports.incrementEstimationJobsTotal = exports.metricsRegistry = void 0;
const prom_client_1 = __importDefault(require("prom-client"));
const register = new prom_client_1.default.Registry();
prom_client_1.default.collectDefaultMetrics({ register });
const estimationJobsTotal = new prom_client_1.default.Counter({
    name: "estimation_jobs_total",
    help: "Total number of estimation jobs started",
    registers: [register]
});
const estimationJobsFailed = new prom_client_1.default.Counter({
    name: "estimation_jobs_failed",
    help: "Total number of estimation job failures",
    registers: [register]
});
const estimationDurationSeconds = new prom_client_1.default.Histogram({
    name: "estimation_duration_seconds",
    help: "Duration of estimation jobs in seconds",
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60],
    registers: [register]
});
const extractionRequestsTotal = new prom_client_1.default.Counter({
    name: "extraction_requests_total",
    help: "Total number of extraction requests",
    registers: [register]
});
const extractionFailuresTotal = new prom_client_1.default.Counter({
    name: "extraction_failures_total",
    help: "Total number of extraction failures",
    registers: [register]
});
const pricingSyncDurationSeconds = new prom_client_1.default.Histogram({
    name: "pricing_sync_duration_seconds",
    help: "Duration of pricing sync operations in seconds",
    labelNames: ["provider", "result"],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
    registers: [register]
});
const requestDurationSeconds = new prom_client_1.default.Histogram({
    name: "http_request_duration_seconds",
    help: "HTTP request duration in seconds",
    labelNames: ["method", "path", "status_code"],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
    registers: [register]
});
exports.metricsRegistry = register;
const incrementEstimationJobsTotal = () => {
    estimationJobsTotal.inc();
};
exports.incrementEstimationJobsTotal = incrementEstimationJobsTotal;
const incrementEstimationJobsFailed = () => {
    estimationJobsFailed.inc();
};
exports.incrementEstimationJobsFailed = incrementEstimationJobsFailed;
const observeEstimationDurationSeconds = (seconds) => {
    estimationDurationSeconds.observe(seconds);
};
exports.observeEstimationDurationSeconds = observeEstimationDurationSeconds;
const incrementExtractionRequestsTotal = () => {
    extractionRequestsTotal.inc();
};
exports.incrementExtractionRequestsTotal = incrementExtractionRequestsTotal;
const incrementExtractionFailuresTotal = () => {
    extractionFailuresTotal.inc();
};
exports.incrementExtractionFailuresTotal = incrementExtractionFailuresTotal;
const observePricingSyncDurationSeconds = (provider, result, seconds) => {
    pricingSyncDurationSeconds.observe({ provider, result }, seconds);
};
exports.observePricingSyncDurationSeconds = observePricingSyncDurationSeconds;
const observeHttpRequestDurationSeconds = (method, path, statusCode, seconds) => {
    requestDurationSeconds.observe({
        method,
        path,
        status_code: String(statusCode)
    }, seconds);
};
exports.observeHttpRequestDurationSeconds = observeHttpRequestDurationSeconds;
