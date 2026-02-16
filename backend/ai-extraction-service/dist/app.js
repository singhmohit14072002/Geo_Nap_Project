"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const morgan_1 = __importDefault(require("morgan"));
const zod_1 = require("zod");
const extract_routes_1 = __importDefault(require("./routes/extract.routes"));
const metrics_service_1 = require("./metrics/metrics.service");
const metrics_middleware_1 = require("./middlewares/metrics.middleware");
const http_error_1 = require("./utils/http-error");
const logger_1 = __importDefault(require("./utils/logger"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use((0, morgan_1.default)("combined"));
app.use(express_1.default.json({ limit: "1mb" }));
app.use(metrics_middleware_1.metricsMiddleware);
app.get("/health", (_req, res) => {
    res.status(200).json({
        status: "ok",
        ok: true,
        service: "ai-extraction-service",
        uptimeSeconds: Number(process.uptime().toFixed(3)),
        timestamp: new Date().toISOString()
    });
});
app.get("/metrics", async (_req, res, next) => {
    try {
        res.set("Content-Type", metrics_service_1.metricsRegistry.contentType);
        res.status(200).send(await metrics_service_1.metricsRegistry.metrics());
    }
    catch (err) {
        next(err);
    }
});
app.use("/", extract_routes_1.default);
app.use((_req, res) => {
    res.status(404).json({
        error: "Not Found"
    });
});
app.use((err, _req, res, _next) => {
    if (err instanceof http_error_1.HttpError) {
        res.status(err.statusCode).json({
            error: err.message,
            details: err.details
        });
        return;
    }
    if (err instanceof zod_1.ZodError) {
        res.status(422).json({
            error: "Validation error",
            details: err.flatten()
        });
        return;
    }
    const message = err instanceof Error ? err.message : "Internal server error";
    logger_1.default.error("Unhandled error", { error: err });
    res.status(500).json({
        error: message
    });
});
exports.default = app;
