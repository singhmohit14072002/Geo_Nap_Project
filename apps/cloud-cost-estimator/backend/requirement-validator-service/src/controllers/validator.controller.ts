import { Request, Response } from "express";
import { validateRequirementPayload } from "../services/validator.service";

export const validateRequirementController = (req: Request, res: Response) => {
  const result = validateRequirementPayload(req.body);
  res.status(200).json(result);
};

