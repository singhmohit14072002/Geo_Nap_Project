"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = void 0;
const prisma_1 = __importDefault(require("../db/prisma"));
const http_error_util_1 = require("../utils/http-error.util");
const jwt_util_1 = require("../utils/jwt.util");
const extractBearerToken = (authorizationHeader) => {
    if (!authorizationHeader) {
        throw new http_error_util_1.HttpError(401, "Authorization header is required");
    }
    const [scheme, token] = authorizationHeader.split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token) {
        throw new http_error_util_1.HttpError(401, "Authorization must be Bearer token");
    }
    return token;
};
const authMiddleware = async (req, _res, next) => {
    try {
        const token = extractBearerToken(req.headers.authorization);
        const claims = (0, jwt_util_1.verifyJwt)(token);
        const user = await prisma_1.default.user.findUnique({
            where: { id: claims.sub }
        });
        if (!user) {
            throw new http_error_util_1.HttpError(401, "Invalid authentication token");
        }
        req.authUser = {
            id: user.id,
            email: user.email,
            role: user.role,
            organizationId: user.organizationId
        };
        next();
    }
    catch (error) {
        if (error instanceof http_error_util_1.HttpError) {
            next(error);
            return;
        }
        next(new http_error_util_1.HttpError(401, "Unauthorized"));
    }
};
exports.authMiddleware = authMiddleware;
