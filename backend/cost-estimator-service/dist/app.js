"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const morgan_1 = __importDefault(require("morgan"));
const estimate_routes_1 = __importDefault(require("./routes/estimate.routes"));
const error_middleware_1 = require("./middlewares/error.middleware");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: "1mb" }));
app.use((0, morgan_1.default)("combined"));
app.get("/health", (_req, res) => {
    res.status(200).json({
        ok: true,
        service: "cost-estimator-service",
        timestamp: new Date().toISOString()
    });
});
app.use("/", estimate_routes_1.default);
app.use(error_middleware_1.notFoundMiddleware);
app.use(error_middleware_1.errorMiddleware);
exports.default = app;
