"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginController = exports.registerController = void 0;
const zod_1 = require("zod");
const auth_schema_1 = require("../schemas/auth.schema");
const auth_service_1 = require("../services/auth.service");
const http_error_util_1 = require("../utils/http-error.util");
const registerController = async (req, res, next) => {
    try {
        const parsed = auth_schema_1.registerSchema.parse(req.body);
        const response = await (0, auth_service_1.registerUser)(parsed);
        res.status(201).json(response);
    }
    catch (error) {
        if (error instanceof zod_1.ZodError) {
            next(new http_error_util_1.HttpError(422, "Validation failed", error.flatten()));
            return;
        }
        next(error);
    }
};
exports.registerController = registerController;
const loginController = async (req, res, next) => {
    try {
        const parsed = auth_schema_1.loginSchema.parse(req.body);
        const response = await (0, auth_service_1.loginUser)(parsed);
        res.status(200).json(response);
    }
    catch (error) {
        if (error instanceof zod_1.ZodError) {
            next(new http_error_util_1.HttpError(422, "Validation failed", error.flatten()));
            return;
        }
        next(error);
    }
};
exports.loginController = loginController;
