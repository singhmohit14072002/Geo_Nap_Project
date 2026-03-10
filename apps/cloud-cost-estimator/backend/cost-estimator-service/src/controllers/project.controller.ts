import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import {
  createProjectSchema,
  projectIdParamSchema
} from "../schemas/project.schema";
import {
  createProject,
  getProjectEstimations,
  listProjects
} from "../services/project.service";
import { HttpError } from "../utils/http-error.util";

const requireAuthUser = (req: Request) => {
  if (!req.authUser) {
    throw new HttpError(401, "Unauthorized");
  }
  return req.authUser;
};

export const createProjectController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authUser = requireAuthUser(req);
    const parsed = createProjectSchema.parse(req.body);
    const project = await createProject(authUser, parsed);
    res.status(201).json(project);
  } catch (error) {
    if (error instanceof ZodError) {
      next(new HttpError(422, "Validation failed", error.flatten()));
      return;
    }
    next(error);
  }
};

export const listProjectsController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authUser = requireAuthUser(req);
    const projects = await listProjects(authUser);
    res.status(200).json({
      projects
    });
  } catch (error) {
    next(error);
  }
};

export const getProjectEstimationsController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authUser = requireAuthUser(req);
    const params = projectIdParamSchema.parse(req.params);
    const estimations = await getProjectEstimations(authUser, params.projectId);
    res.status(200).json({
      estimations
    });
  } catch (error) {
    if (error instanceof ZodError) {
      next(new HttpError(422, "Validation failed", error.flatten()));
      return;
    }
    next(error);
  }
};
