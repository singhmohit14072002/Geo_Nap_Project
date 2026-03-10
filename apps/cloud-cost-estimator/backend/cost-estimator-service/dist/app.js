"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const metrics_service_1 = require("./metrics/metrics.service");
const auth_middleware_1 = require("./middlewares/auth.middleware");
const metrics_middleware_1 = require("./middlewares/metrics.middleware");
const request_tracing_middleware_1 = require("./middlewares/request-tracing.middleware");
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const estimate_routes_1 = __importDefault(require("./routes/estimate.routes"));
const project_routes_1 = __importDefault(require("./routes/project.routes"));
const error_middleware_1 = require("./middlewares/error.middleware");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(request_tracing_middleware_1.requestTracingMiddleware);
app.use(express_1.default.json({ limit: "1mb" }));
app.use(metrics_middleware_1.metricsMiddleware);
app.get("/health", (_req, res) => {
    res.status(200).json({
        status: "ok",
        ok: true,
        service: "cost-estimator-service",
        uptimeSeconds: Number(process.uptime().toFixed(3)),
        timestamp: new Date().toISOString()
    });
});
app.get("/metrics", async (_req, res, next) => {
    try {
        res.set("Content-Type", metrics_service_1.metricsRegistry.contentType);
        res.status(200).send(await metrics_service_1.metricsRegistry.metrics());
    }
    catch (error) {
        next(error);
    }
});
app.use("/auth", auth_routes_1.default);
app.use(auth_middleware_1.authMiddleware);
app.use("/", project_routes_1.default);
app.use("/", estimate_routes_1.default);
app.use(error_middleware_1.notFoundMiddleware);
app.use(error_middleware_1.errorMiddleware);
exports.default = app;
