import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { loginSchema, registerSchema } from "../schemas/auth.schema";
import { loginUser, registerUser } from "../services/auth.service";
import { HttpError } from "../utils/http-error.util";

export const registerController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const parsed = registerSchema.parse(req.body);
    const response = await registerUser(parsed);
    res.status(201).json(response);
  } catch (error) {
    if (error instanceof ZodError) {
      next(new HttpError(422, "Validation failed", error.flatten()));
      return;
    }
    next(error);
  }
};

export const loginController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const parsed = loginSchema.parse(req.body);
    const response = await loginUser(parsed);
    res.status(200).json(response);
  } catch (error) {
    if (error instanceof ZodError) {
      next(new HttpError(422, "Validation failed", error.flatten()));
      return;
    }
    next(error);
  }
};
