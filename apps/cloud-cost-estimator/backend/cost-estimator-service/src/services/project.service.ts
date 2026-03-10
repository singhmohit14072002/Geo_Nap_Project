import prisma from "../db/prisma";
import { AuthUser } from "../types/auth.types";
import { HttpError } from "../utils/http-error.util";

export const createProject = async (
  authUser: AuthUser,
  input: { name: string; region: string }
) => {
  return prisma.project.create({
    data: {
      name: input.name,
      region: input.region,
      organizationId: authUser.organizationId
    }
  });
};

export const listProjects = async (authUser: AuthUser) => {
  return prisma.project.findMany({
    where: {
      organizationId: authUser.organizationId
    },
    orderBy: {
      createdAt: "desc"
    }
  });
};

export const assertProjectAccess = async (
  authUser: AuthUser,
  projectId: string
) => {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      organizationId: authUser.organizationId
    }
  });
  if (!project) {
    throw new HttpError(404, "Project not found");
  }
  return project;
};

export const getProjectEstimations = async (
  authUser: AuthUser,
  projectId: string
) => {
  await assertProjectAccess(authUser, projectId);
  return prisma.estimation.findMany({
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
