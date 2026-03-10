"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metricsMiddleware = void 0;
const metrics_service_1 = require("../metrics/metrics.service");
const metricsMiddleware = (req, res, next) => {
    const start = process.hrtime.bigint();
    res.on("finish", () => {
        const durationNs = Number(process.hrtime.bigint() - start);
        const seconds = durationNs / 1000000000;
        (0, metrics_service_1.observeHttpRequestDurationSeconds)(req.method, req.path, res.statusCode, seconds);
    });
    next();
};
exports.metricsMiddleware = metricsMiddleware;
