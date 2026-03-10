import { NextFunction, Request, Response } from "express";
import { estimateImportRequestSchema } from "../schemas/import.schema";
import { importAzureEstimateRows } from "../services/estimate-import.service";
import { HttpError } from "../utils/http-error";

export const importEstimateController = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const parsed = estimateImportRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(422, "Estimate import payload validation failed", parsed.error.flatten());
    }

    const result = importAzureEstimateRows(parsed.data);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
