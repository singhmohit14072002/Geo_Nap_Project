import { NextFunction, Request, Response } from "express";
import { decisionRequestSchema } from "../schemas/decision.schema";
import { analyzeDecisionIntelligence } from "../services/decision-intelligence.service";
import { HttpError } from "../utils/http-error";
import logger from "../utils/logger";

export const recommendProviderController = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const parsed = decisionRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(
        422,
        "Decision request validation failed",
        parsed.error.flatten()
      );
    }

    const output = analyzeDecisionIntelligence(parsed.data);
    logger.info("DECISION_RECOMMENDATION_GENERATED", {
      providerCount: parsed.data.providerResults.length,
      recommendedProvider: output.recommended.provider,
      confidence: output.recommended.recommendationConfidence
    });
    res.status(200).json(output);
  } catch (error) {
    next(error);
  }
};

