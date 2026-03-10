import { Router } from "express";
import { NotFoundError } from "@geo-nap/common";
import { getRecommendationBundleByPlanId } from "../db/recommendations.repository";

export const recommendationRouter = Router();

recommendationRouter.get("/v1/recommendations/:planId", async (req, res) => {
  const planId = req.params.planId;
  const bundle = await getRecommendationBundleByPlanId(planId);
  if (!bundle || bundle.rankedAlternatives.length === 0) {
    throw new NotFoundError(`No recommendations found for plan: ${planId}`);
  }

  const providerOptions: Record<string, typeof bundle.rankedAlternatives> = {
    aws: [],
    azure: [],
    gcp: [],
    vast: []
  };
  for (const rec of bundle.rankedAlternatives) {
    if (!providerOptions[rec.provider]) {
      providerOptions[rec.provider] = [];
    }
    providerOptions[rec.provider].push(rec);
  }

  res.status(200).json({
    plan_id: planId,
    ranked_alternatives: bundle.rankedAlternatives,
    cheapest_option: bundle.cheapestOption,
    nearest_option: bundle.nearestOption,
    balanced_option: bundle.balancedOption,
    provider_options: providerOptions
  });
});
