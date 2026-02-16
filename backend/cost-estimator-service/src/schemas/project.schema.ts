import { z } from "zod";

export const createProjectSchema = z
  .object({
    name: z.string().min(2).max(120),
    region: z.string().min(1).max(100)
  })
  .strict();

export const projectIdParamSchema = z
  .object({
    projectId: z.string().uuid()
  })
  .strict();

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
