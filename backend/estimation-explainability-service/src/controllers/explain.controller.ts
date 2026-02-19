import { NextFunction, Request, Response } from "express";
import { explainRequestSchema } from "../schemas/explain.schema";
import { generateEstimationExplanation } from "../services/explainability.service";
import { HttpError } from "../utils/http-error";
import logger from "../utils/logger";

export const explainController = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const parsed = explainRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(422, "Explain request validation failed", parsed.error.flatten());
    }

    const explanation = generateEstimationExplanation(parsed.data.providerResult);
    logger.info("EXPLANATION_GENERATED", {
      provider: parsed.data.providerResult.provider,
      region: parsed.data.providerResult.region
    });

    res.status(200).json({
      explanation
    });
  } catch (error) {
    next(error);
  }
};

