import {
  AzurePricingQueryError,
  queryAzureRetailPricing
} from "./azure-pricing-query.service";
import { CloudPricingProvider } from "./cloud-pricing-provider.interface";
import {
  NormalizedPricingParams,
  PricingResult
} from "./multi-cloud-pricing.types";

const AZURE_USD_TO_INR = Number(process.env.AZURE_USD_TO_INR ?? "83");

const round2 = (value: number): number => Number(value.toFixed(2));

const toHourlyUsd = (hourlyInr: number, currencyCode?: string): number => {
  if ((currencyCode ?? "").toUpperCase() === "USD") {
    return round2(hourlyInr / AZURE_USD_TO_INR);
  }
  return round2(hourlyInr / AZURE_USD_TO_INR);
};

export class AzurePricingEngineError extends Error {
  readonly code: "INVALID_INPUT" | "QUERY_FAILED";
  readonly details?: Record<string, unknown>;

  constructor(
    code: "INVALID_INPUT" | "QUERY_FAILED",
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AzurePricingEngineError";
    this.code = code;
    this.details = details;
  }
}

export class AzurePricingEngine
  implements CloudPricingProvider<NormalizedPricingParams, PricingResult>
{
  async calculatePrice(params: NormalizedPricingParams): Promise<PricingResult> {
    if (params.serviceType !== "COMPUTE_VM") {
      throw new AzurePricingEngineError("INVALID_INPUT", "Unsupported Azure serviceType", {
        serviceType: params.serviceType
      });
    }
    if (!params.region?.trim()) {
      throw new AzurePricingEngineError("INVALID_INPUT", "region is required");
    }
    if (!params.skuName?.trim()) {
      throw new AzurePricingEngineError("INVALID_INPUT", "skuName is required");
    }

    try {
      const result = await queryAzureRetailPricing({
        serviceName: "Virtual Machines",
        skuName: params.skuName,
        region: params.region,
        quantity: params.quantity,
        hours: params.hours,
        osType: params.osType
      });

      const hourlyPriceInr = result.unitPrice;
      const hourlyPriceUsd = toHourlyUsd(hourlyPriceInr, result.currencyCode);

      return {
        provider: "azure",
        serviceName: "Virtual Machines",
        monthlyCost: result.monthlyCost,
        pricingVersion:
          result.source === "cache" ? "azure-cache-pricing" : "azure-retail-api",
        breakdown: {
          hourlyPrice: hourlyPriceUsd,
          hourlyPriceCurrency: "USD",
          hourlyPriceInr,
          region: params.region,
          instanceType: params.skuName,
          source: result.source === "cache" ? "cache" : "api",
          matchedSkuName: result.matchedSkuName,
          meterName: result.meterName
        }
      };
    } catch (error) {
      if (error instanceof AzurePricingQueryError) {
        throw new AzurePricingEngineError("QUERY_FAILED", error.message, {
          code: error.code,
          details: error.details
        });
      }
      throw new AzurePricingEngineError("QUERY_FAILED", "Azure pricing query failed", {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}
