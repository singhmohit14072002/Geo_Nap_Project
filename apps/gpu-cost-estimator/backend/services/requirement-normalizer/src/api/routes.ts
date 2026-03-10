import { Router } from "express";
import { ValidationError } from "@geo-nap/common";
import { normalizeRequirement } from "../application/use-cases/normalize-requirement";
import { normalizeRequirementRequestSchema } from "./schemas";

export const requirementNormalizerRouter = Router();

requirementNormalizerRouter.post("/v1/requirements/normalize", async (req, res) => {
  const parsed = normalizeRequirementRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError("Invalid requirement normalization request", parsed.error.flatten());
  }

  const normalizedRequirement = normalizeRequirement(parsed.data);

  res.status(200).json({
    normalized_requirement: normalizedRequirement
  });
});
