"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpError = void 0;
class HttpError extends Error {
    constructor(statusCode, message, details) {
        super(message);
        this.name = "HttpError";
        this.statusCode = statusCode;
        this.details = details;
    }
}
exports.HttpError = HttpError;
