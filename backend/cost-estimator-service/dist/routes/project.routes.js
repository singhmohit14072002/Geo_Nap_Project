"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const project_controller_1 = require("../controllers/project.controller");
const projectRouter = (0, express_1.Router)();
projectRouter.post("/projects", project_controller_1.createProjectController);
projectRouter.get("/projects", project_controller_1.listProjectsController);
projectRouter.get("/projects/:projectId/estimations", project_controller_1.getProjectEstimationsController);
exports.default = projectRouter;
