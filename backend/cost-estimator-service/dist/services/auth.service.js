"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginUser = exports.registerUser = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const prisma_1 = __importDefault(require("../db/prisma"));
const http_error_util_1 = require("../utils/http-error.util");
const jwt_util_1 = require("../utils/jwt.util");
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? "12");
const toAuthResponse = (user, organization) => {
    const token = (0, jwt_util_1.signJwt)({
        sub: user.id,
        email: user.email,
        orgId: user.organizationId,
        role: user.role
    });
    return {
        token,
        user: {
            id: user.id,
            email: user.email,
            role: user.role,
            organizationId: user.organizationId
        },
        organization
    };
};
const registerUser = async (input) => {
    const existing = await prisma_1.default.user.findUnique({
        where: { email: input.email.toLowerCase() }
    });
    if (existing) {
        throw new http_error_util_1.HttpError(409, "Email already registered");
    }
    const passwordHash = await bcrypt_1.default.hash(input.password, BCRYPT_ROUNDS);
    const data = await prisma_1.default.$transaction(async (tx) => {
        const organization = await tx.organization.create({
            data: {
                name: input.organizationName
            }
        });
        const user = await tx.user.create({
            data: {
                email: input.email.toLowerCase(),
                passwordHash,
                role: "OWNER",
                organizationId: organization.id
            }
        });
        await tx.organization.update({
            where: { id: organization.id },
            data: { ownerId: user.id }
        });
        return {
            user,
            organization
        };
    });
    return toAuthResponse({
        id: data.user.id,
        email: data.user.email,
        role: data.user.role,
        organizationId: data.user.organizationId
    }, {
        id: data.organization.id,
        name: data.organization.name
    });
};
exports.registerUser = registerUser;
const loginUser = async (input) => {
    const user = await prisma_1.default.user.findUnique({
        where: { email: input.email.toLowerCase() },
        include: {
            organization: true
        }
    });
    if (!user) {
        throw new http_error_util_1.HttpError(401, "Invalid email or password");
    }
    const isValidPassword = await bcrypt_1.default.compare(input.password, user.passwordHash);
    if (!isValidPassword) {
        throw new http_error_util_1.HttpError(401, "Invalid email or password");
    }
    return toAuthResponse({
        id: user.id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId
    }, {
        id: user.organization.id,
        name: user.organization.name
    });
};
exports.loginUser = loginUser;
