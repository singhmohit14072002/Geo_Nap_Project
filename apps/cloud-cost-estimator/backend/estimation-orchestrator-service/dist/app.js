"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const morgan_1 = __importDefault(require("morgan"));
const zod_1 = require("zod");
const estimate_routes_1 = __importDefault(require("./routes/estimate.routes"));
const http_error_1 = require("./utils/http-error");
const logger_1 = __importDefault(require("./utils/logger"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use((0, morgan_1.default)("combined"));
app.use(express_1.default.json({ limit: "2mb" }));
app.get("/health", (_req, res) => {
    res.status(200).json({
        status: "ok",
        service: "estimation-orchestrator-service",
        timestamp: new Date().toISOString()
    });
});
app.use("/", estimate_routes_1.default);
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
    logger_1.default.error("UNHANDLED_ERROR", { error: err });
    res.status(500).json({
        error: message
    });
});
exports.default = app;
