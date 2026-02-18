"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyJwt = exports.signJwt = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const DEFAULT_JWT_EXPIRES_IN = "7d";
const DEVELOPMENT_FALLBACK_SECRET = "geo-nap-dev-local-jwt-secret-change-me";
const getSecret = () => {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.trim().length < 16) {
        const nodeEnv = (process.env.NODE_ENV ?? "development").toLowerCase();
        if (nodeEnv !== "production") {
            return DEVELOPMENT_FALLBACK_SECRET;
        }
        throw new Error("JWT_SECRET must be configured and at least 16 characters");
    }
    return secret;
};
const signJwt = (claims) => {
    const expiresIn = process.env.JWT_EXPIRES_IN ??
        DEFAULT_JWT_EXPIRES_IN;
    return jsonwebtoken_1.default.sign(claims, getSecret(), {
        expiresIn,
        issuer: "geo-nap"
    });
};
exports.signJwt = signJwt;
const verifyJwt = (token) => {
    return jsonwebtoken_1.default.verify(token, getSecret(), {
        issuer: "geo-nap"
    });
};
exports.verifyJwt = verifyJwt;
