import { ProviderCostResult } from "../domain/cost.model";
import { EstimateSchemaInput } from "../schemas/estimate.schema";
import { HttpError } from "../utils/http-error.util";
import logger from "../utils/logger";
import { attachOptimizationRecommendations } from "./optimization-engine.service";
import { getPricingService } from "./pricing-factory.service";
import { estimateAzureCloudEstimatePricing } from "./universal-azure-pricing-engine.service";
import { classifiedServiceSchema } from "../schemas/estimate.schema";

const hasAzureEstimatePayload = (
  payload: EstimateSchemaInput
): payload is EstimateSchemaInput & {
  azureEstimate: {
    documentType: "CLOUD_ESTIMATE";
    classifiedServices: Array<{
      classification:
        | "COMPUTE_VM"
        | "STORAGE_DISK"
        | "NETWORK_GATEWAY"
        | "NETWORK_EGRESS"
        | "BACKUP"
        | "AUTOMATION"
        | "MONITORING"
        | "LOGIC_APPS"
        | "OTHER";
      serviceCategory?: string | null;
      serviceType?: string | null;
      reason?: string;
      row: Record<string, unknown>;
    }>;
  };
} => {
  if (!("azureEstimate" in payload)) {
    return false;
  }
  const record = payload as Record<string, unknown>;
  const azureEstimate = record.azureEstimate;
  if (!azureEstimate || typeof azureEstimate !== "object") {
    return false;
  }
  const value = azureEstimate as Record<string, unknown>;
  if (value.documentType !== "CLOUD_ESTIMATE") {
    return false;
  }
  if (!Array.isArray(value.classifiedServices)) {
    return false;
  }
  return value.classifiedServices.length > 0;
};

export const runEstimateComputation = async (
  payload: EstimateSchemaInput
): Promise<ProviderCostResult[]> => {
  if (hasAzureEstimatePayload(payload)) {
    const ignoredProviders = payload.cloudProviders.filter(
      (provider) => provider !== "azure"
    );
    if (ignoredProviders.length > 0) {
      logger.warn("Ignoring non-Azure providers in CLOUD_ESTIMATE mode", {
        ignoredProviders
      });
    }

    const validatedServices: Array<{
      classification:
        | "COMPUTE_VM"
        | "STORAGE_DISK"
        | "NETWORK_GATEWAY"
        | "NETWORK_EGRESS"
        | "BACKUP"
        | "AUTOMATION"
        | "MONITORING"
        | "LOGIC_APPS"
        | "OTHER";
      serviceCategory?: string | null;
      serviceType?: string | null;
      reason?: string;
      row: Record<string, unknown>;
    }> = [];
    payload.azureEstimate.classifiedServices.forEach((item) => {
      const parsed = classifiedServiceSchema.safeParse(item);
      if (parsed.success) {
        validatedServices.push(parsed.data);
      }
    });

    if (validatedServices.length === 0) {
      throw new HttpError(
        422,
        "No valid classified services provided for azureEstimate mode"
      );
    }

    const azureResult = await estimateAzureCloudEstimatePricing({
      region: payload.region,
      classifiedServices: validatedServices
    });
    return attachOptimizationRecommendations([azureResult]);
  }
  if (!("requirement" in payload)) {
    throw new HttpError(
      422,
      "Missing requirement payload for standard estimation mode"
    );
  }

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
