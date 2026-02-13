"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorMiddleware = exports.notFoundMiddleware = void 0;
const zod_1 = require("zod");
const http_error_util_1 = require("../utils/http-error.util");
const notFoundMiddleware = (_req, _res, next) => {
    next(new http_error_util_1.HttpError(404, "Route not found"));
};
exports.notFoundMiddleware = notFoundMiddleware;
const errorMiddleware = (err, _req, res, _next) => {
    if (err instanceof http_error_util_1.HttpError) {
        res.status(err.statusCode).json({
            error: {
                message: err.message,
                details: err.details ?? null
            }
        });
        return;
    }
    if (err instanceof zod_1.ZodError) {
        res.status(422).json({
            error: {
                message: "Validation failed",
                details: err.flatten()
            }
        });
        return;
    }
    console.error("Unhandled error", err);
    res.status(500).json({
        error: {
            message: "Internal server error"
        }
    });
};
exports.errorMiddleware = errorMiddleware;
