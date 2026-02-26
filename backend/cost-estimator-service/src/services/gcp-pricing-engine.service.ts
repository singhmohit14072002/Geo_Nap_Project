import prisma from "../db/prisma";
import { normalizeGcpRegion } from "../utils/gcp-region-mapper";
import logger from "../utils/logger";
import { CloudPricingProvider } from "./cloud-pricing-provider.interface";
import {
  NormalizedPricingParams,
  PricingResult
} from "./multi-cloud-pricing.types";

const GCP_USD_TO_INR = Number(process.env.GCP_USD_TO_INR ?? "83");

const round2 = (value: number): number => Number(value.toFixed(2));

const toInr = (price: number, currency: string): number => {
  const code = currency.toUpperCase();
  if (code === "INR") {
    return round2(price);
  }
  if (code === "USD") {
    return round2(price * GCP_USD_TO_INR);
  }
  throw new Error(`Unsupported GCP currency: ${currency}`);
};

const toUsd = (priceInr: number): number => round2(priceInr / GCP_USD_TO_INR);

export class GcpPricingEngineError extends Error {
  readonly code: "INVALID_INPUT" | "MATCHING_FAILED";
  readonly details?: Record<string, unknown>;

  constructor(
    code: "INVALID_INPUT" | "MATCHING_FAILED",
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "GcpPricingEngineError";
    this.code = code;
    this.details = details;
  }
}

export class GcpPricingEngine
  implements CloudPricingProvider<NormalizedPricingParams, PricingResult>
{
  async calculatePrice(params: NormalizedPricingParams): Promise<PricingResult> {
    if (params.serviceType !== "COMPUTE_VM") {
      throw new GcpPricingEngineError("INVALID_INPUT", "Unsupported GCP serviceType", {
        serviceType: params.serviceType
      });
    }
    if (!params.region?.trim()) {
      throw new GcpPricingEngineError("INVALID_INPUT", "region is required");
    }

    const normalizedRegion = normalizeGcpRegion(params.region);
    const normalizedSku = params.skuName.trim().toLowerCase();
    try {
      const rows = await prisma.cloudPricing.findMany({
        where: {
          provider: "gcp",
          region: normalizedRegion,
          serviceName: "Compute Engine VM"
        },
        orderBy: [{ lastUpdated: "desc" }, { retailPrice: "asc" }],
        take: 200
      });

      const matchedRow = rows.find((row) => {
        const sku = row.skuName.toLowerCase();
        if (!sku.includes(normalizedSku)) {
          return false;
        }
        return sku.includes(`|${params.osType}|`);
      });
      if (!matchedRow) {
        throw new GcpPricingEngineError(
          "MATCHING_FAILED",
          `No GCP compute SKU found for ${params.skuName} in ${normalizedRegion}`,
          {
            requestedSku: params.skuName,
            region: normalizedRegion,
            osType: params.osType
          }
        );
      }

      const hourlyPriceInr = toInr(matchedRow.retailPrice, matchedRow.currency);
      const monthlyCost = round2(hourlyPriceInr * params.hours * params.quantity);
      const source = matchedRow.pricingVersion.startsWith("fallback")
        ? "fallback"
        : "db";

      return {
        provider: "gcp",
        serviceName: "Compute Engine VM",
        monthlyCost,
        pricingVersion: matchedRow.pricingVersion,
        breakdown: {
          hourlyPrice: toUsd(hourlyPriceInr),
          hourlyPriceCurrency: "USD",
          hourlyPriceInr,
          region: normalizedRegion,
          instanceType: params.skuName,
          source,
          matchedSkuName: matchedRow.skuName
        }
      };
    } catch (error) {
      logger.warn("GCP pricing engine failed", {
        region: normalizedRegion,
        requestedSku: params.skuName,
        error: error instanceof Error ? error.message : String(error)
      });
      if (error instanceof GcpPricingEngineError) {
        throw error;
      }
      throw new GcpPricingEngineError("MATCHING_FAILED", "GCP pricing lookup failed", {
        region: normalizedRegion,
        requestedSku: params.skuName,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}
