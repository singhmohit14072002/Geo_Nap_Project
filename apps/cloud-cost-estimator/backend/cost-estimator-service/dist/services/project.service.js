"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProjectEstimations = exports.assertProjectAccess = exports.listProjects = exports.createProject = void 0;
const prisma_1 = __importDefault(require("../db/prisma"));
const http_error_util_1 = require("../utils/http-error.util");
const createProject = async (authUser, input) => {
    return prisma_1.default.project.create({
        data: {
            name: input.name,
            region: input.region,
            organizationId: authUser.organizationId
        }
    });
};
exports.createProject = createProject;
const listProjects = async (authUser) => {
    return prisma_1.default.project.findMany({
        where: {
            organizationId: authUser.organizationId
        },
        orderBy: {
            createdAt: "desc"
        }
    });
};
exports.listProjects = listProjects;
const assertProjectAccess = async (authUser, projectId) => {
    const project = await prisma_1.default.project.findFirst({
        where: {
            id: projectId,
            organizationId: authUser.organizationId
        }
    });
    if (!project) {
        throw new http_error_util_1.HttpError(404, "Project not found");
    }
    return project;
};
exports.assertProjectAccess = assertProjectAccess;
const getProjectEstimations = async (authUser, projectId) => {
    await (0, exports.assertProjectAccess)(authUser, projectId);
    return prisma_1.default.estimation.findMany({
        where: {
            projectId,
            project: {
                organizationId: authUser.organizationId
            }
        },
        orderBy: {
            createdAt: "desc"
        }
    });
};
exports.getProjectEstimations = getProjectEstimations;
