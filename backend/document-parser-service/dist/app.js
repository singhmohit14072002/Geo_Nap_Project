"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const morgan_1 = __importDefault(require("morgan"));
const parser_routes_1 = __importDefault(require("./routes/parser.routes"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use((0, morgan_1.default)("combined"));
app.use(express_1.default.json({ limit: "1mb" }));
app.get("/health", (_req, res) => {
    res.status(200).json({
        status: "ok",
        service: "document-parser-service",
        timestamp: new Date().toISOString()
    });
});
app.use("/", parser_routes_1.default);
app.use((_req, res) => {
    res.status(404).json({
        error: "Not Found"
    });
});
app.use((err, _req, res, _next) => {
    const statusCode = typeof err === "object" &&
        err !== null &&
        "statusCode" in err &&
        typeof err.statusCode === "number"
        ? err.statusCode
        : 500;
    const message = err instanceof Error && err.message ? err.message : "Internal server error";
    res.status(statusCode).json({
        error: message
    });
});
exports.default = app;
