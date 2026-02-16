import client from "prom-client";

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const estimationJobsTotal = new client.Counter({
  name: "estimation_jobs_total",
  help: "Total number of estimation jobs started",
  registers: [register]
});

const estimationJobsFailed = new client.Counter({
  name: "estimation_jobs_failed",
  help: "Total number of estimation jobs failed",
  registers: [register]
});

const estimationDurationSeconds = new client.Histogram({
  name: "estimation_duration_seconds",
  help: "Duration of estimation jobs in seconds",
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60, 120],
  registers: [register]
});

const extractionRequestsTotal = new client.Counter({
  name: "extraction_requests_total",
  help: "Total number of extraction requests",
  registers: [register]
});

const extractionFailuresTotal = new client.Counter({
  name: "extraction_failures_total",
  help: "Total number of extraction request failures",
  registers: [register]
});

const pricingSyncDurationSeconds = new client.Histogram({
  name: "pricing_sync_duration_seconds",
  help: "Duration of pricing sync runs in seconds",
  labelNames: ["provider", "result"] as const,
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300],
  registers: [register]
});

const requestDurationSeconds = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "path", "status_code"] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [register]
});

export const metricsRegistry = register;

export const incrementEstimationJobsTotal = (): void => {
  estimationJobsTotal.inc();
};

export const incrementEstimationJobsFailed = (): void => {
  estimationJobsFailed.inc();
};

export const observeEstimationDurationSeconds = (seconds: number): void => {
  estimationDurationSeconds.observe(seconds);
};

export const incrementExtractionRequestsTotal = (): void => {
  extractionRequestsTotal.inc();
};

export const incrementExtractionFailuresTotal = (): void => {
  extractionFailuresTotal.inc();
};

export const observePricingSyncDurationSeconds = (
  provider: string,
  result: "success" | "failed",
  seconds: number
): void => {
  pricingSyncDurationSeconds.observe({ provider, result }, seconds);
};

export const observeHttpRequestDurationSeconds = (
  method: string,
  path: string,
  statusCode: number,
  seconds: number
): void => {
  requestDurationSeconds.observe(
    {
      method,
      path,
      status_code: String(statusCode)
    },
    seconds
  );
};
