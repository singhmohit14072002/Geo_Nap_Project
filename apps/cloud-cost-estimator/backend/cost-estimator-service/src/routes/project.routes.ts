import { Router } from "express";
import {
  createProjectController,
  getProjectEstimationsController,
  listProjectsController
} from "../controllers/project.controller";

const projectRouter = Router();

projectRouter.post("/projects", createProjectController);
projectRouter.get("/projects", listProjectsController);
projectRouter.get("/projects/:projectId/estimations", getProjectEstimationsController);

export default projectRouter;
