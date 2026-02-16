import { ProviderCostResult } from "../domain/cost.model";
import { EstimateSchemaInput } from "../schemas/estimate.schema";
import { HttpError } from "../utils/http-error.util";
import logger from "../utils/logger";
import { attachOptimizationRecommendations } from "./optimization-engine.service";
import { getPricingService } from "./pricing-factory.service";

export const runEstimateComputation = async (
  payload: EstimateSchemaInput
): Promise<ProviderCostResult[]> => {
  const uniqueProviders = [...new Set(payload.cloudProviders)];
  const settled = await Promise.allSettled(
    uniqueProviders.map(async (provider) => {
      const pricingService = getPricingService(provider);
      return pricingService.estimate({
        provider,
        region: payload.region,
        requirement: payload.requirement
      });
    })
  );

  const successful = settled
    .filter(
      (result): result is PromiseFulfilledResult<ProviderCostResult> =>
        result.status === "fulfilled"
    )
    .map((result) => result.value);

  const failed = settled.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  );

  if (failed.length > 0) {
    failed.forEach((result) => {
      logger.warn("Provider estimation failed", {
        error:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason)
      });
    });
  }

  if (successful.length === 0) {
    throw new HttpError(
      422,
      "No provider could produce a valid estimate for the requested resources"
    );
  }

  return attachOptimizationRecommendations(successful);
};
