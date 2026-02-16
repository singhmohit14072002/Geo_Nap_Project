"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProjectEstimationsController = exports.listProjectsController = exports.createProjectController = void 0;
const zod_1 = require("zod");
const project_schema_1 = require("../schemas/project.schema");
const project_service_1 = require("../services/project.service");
const http_error_util_1 = require("../utils/http-error.util");
const requireAuthUser = (req) => {
    if (!req.authUser) {
        throw new http_error_util_1.HttpError(401, "Unauthorized");
    }
    return req.authUser;
};
const createProjectController = async (req, res, next) => {
    try {
        const authUser = requireAuthUser(req);
        const parsed = project_schema_1.createProjectSchema.parse(req.body);
        const project = await (0, project_service_1.createProject)(authUser, parsed);
        res.status(201).json(project);
    }
    catch (error) {
        if (error instanceof zod_1.ZodError) {
            next(new http_error_util_1.HttpError(422, "Validation failed", error.flatten()));
            return;
        }
        next(error);
    }
};
exports.createProjectController = createProjectController;
const listProjectsController = async (req, res, next) => {
    try {
        const authUser = requireAuthUser(req);
        const projects = await (0, project_service_1.listProjects)(authUser);
        res.status(200).json({
            projects
        });
    }
    catch (error) {
        next(error);
    }
};
exports.listProjectsController = listProjectsController;
const getProjectEstimationsController = async (req, res, next) => {
    try {
        const authUser = requireAuthUser(req);
        const params = project_schema_1.projectIdParamSchema.parse(req.params);
        const estimations = await (0, project_service_1.getProjectEstimations)(authUser, params.projectId);
        res.status(200).json({
            estimations
        });
    }
    catch (error) {
        if (error instanceof zod_1.ZodError) {
            next(new http_error_util_1.HttpError(422, "Validation failed", error.flatten()));
            return;
        }
        next(error);
    }
};
exports.getProjectEstimationsController = getProjectEstimationsController;
