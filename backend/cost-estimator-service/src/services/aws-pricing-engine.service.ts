import {
  FilterType,
  GetProductsCommand,
  PricingClient
} from "@aws-sdk/client-pricing";
import prisma from "../db/prisma";
import { upsertCloudPricingRecords } from "./cloud-pricing.repository";
import { mapAwsRegionToLocation } from "../utils/aws-region-mapper";
import logger from "../utils/logger";
import { retry } from "../utils/retry.util";
import { CloudPricingProvider } from "./cloud-pricing-provider.interface";
import {
  NormalizedPricingParams,
  PricingResult
} from "./multi-cloud-pricing.types";

const AWS_USD_TO_INR = Number(process.env.AWS_USD_TO_INR ?? "83");
const AWS_PRICING_API_REGION = process.env.AWS_PRICING_API_REGION ?? "us-east-1";
const AWS_PRICING_MAX_PAGES = Number(process.env.AWS_PRICING_MAX_PAGES ?? "25");

type AwsOperatingSystem = "linux" | "windows";
type CacheSource = "cache" | "api";

export interface AwsPricingEngineInput {
  serviceType: "COMPUTE_VM";
  skuName: string;
  region: string;
  hours: number;
  quantity: number;
  osType: AwsOperatingSystem;
}

export interface AwsPricingEngineOutput {
  provider: "aws";
  serviceName: "EC2";
  monthlyCost: number;
  pricingVersion: string;
  breakdown: {
    hourlyPrice: number;
    hourlyPriceCurrency: "USD";
    hourlyPriceInr: number;
    region: string;
    location: string;
    instanceType: string;
    source: CacheSource;
  };
}

const toEngineInput = (params: NormalizedPricingParams): AwsPricingEngineInput => ({
  serviceType: params.serviceType,
  skuName: params.skuName,
  region: params.region,
  hours: params.hours,
  quantity: params.quantity,
  osType: params.osType
});

const toPricingResult = (output: AwsPricingEngineOutput): PricingResult => ({
  provider: output.provider,
  serviceName: output.serviceName,
  monthlyCost: output.monthlyCost,
  pricingVersion: output.pricingVersion,
  breakdown: {
    hourlyPrice: output.breakdown.hourlyPrice,
    hourlyPriceCurrency: output.breakdown.hourlyPriceCurrency,
    hourlyPriceInr: output.breakdown.hourlyPriceInr,
    region: output.breakdown.region,
    location: output.breakdown.location,
    instanceType: output.breakdown.instanceType,
    source: output.breakdown.source
  }
});

interface AwsCatalogPriceHit {
  hourlyPriceUsd: number;
}

type AwsPriceListPayload = {
  terms?: {
    OnDemand?: Record<
      string,
      {
        priceDimensions?: Record<
          string,
          {
            unit?: string;
            beginRange?: string;
            pricePerUnit?: { USD?: string };
          }
        >;
      }
    >;
  };
};

export class AwsPricingEngineError extends Error {
  readonly code:
    | "INVALID_INPUT"
    | "REGION_MAPPING_NOT_FOUND"
    | "API_CALL_FAILED"
    | "PRICE_NOT_FOUND";
  readonly details?: Record<string, unknown>;

  constructor(
    code:
      | "INVALID_INPUT"
      | "REGION_MAPPING_NOT_FOUND"
      | "API_CALL_FAILED"
      | "PRICE_NOT_FOUND",
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AwsPricingEngineError";
    this.code = code;
    this.details = details;
  }
}

const pricingClient = new PricingClient({
  region: AWS_PRICING_API_REGION
});

const round2 = (value: number): number => Number(value.toFixed(2));

const buildOperatingSystemFilter = (osType: AwsOperatingSystem): string =>
  osType === "windows" ? "Windows" : "Linux";

const parseNumber = (value: string | number | undefined): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizeInstanceType = (value: string): string =>
  value
    .split("|")[0]
    .trim()
    .toLowerCase();

const toInrFromUsd = (usd: number): number => round2(usd * AWS_USD_TO_INR);

const buildCacheSkuName = (instanceType: string, osType: AwsOperatingSystem): string =>
  `${instanceType}|${osType}|tenancy=Shared|preInstalledSw=NA`;

const getTodayVersionTag = (): string => {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  return `aws-live-${yyyy}-${mm}-${dd}`;
};

const findCachedComputeHourlyUsd = async (
  region: string,
  instanceType: string,
  osType: AwsOperatingSystem
): Promise<{ hourlyPriceUsd: number; pricingVersion: string } | null> => {
  try {
    const cacheSkuPrefix = `${instanceType}|${osType}|`;
    const rows = await prisma.cloudPricing.findMany({
      where: {
        provider: "aws",
        region,
        serviceName: "AmazonEC2",
        skuName: {
          startsWith: cacheSkuPrefix
        }
      },
      orderBy: [{ lastUpdated: "desc" }, { retailPrice: "asc" }],
      take: 3
    });

    const selected = rows.find((row) => {
      const unit = row.unit.toLowerCase();
      return unit.includes("hr") || unit.includes("hour");
    });

    if (!selected) {
      logger.info("AWS_CACHE_MISS", {
        serviceName: "AmazonEC2",
        region,
        instanceType,
        osType
      });
      logger.info("CACHE_MISS", {
        provider: "aws",
        cache: "aws-compute-cache",
        serviceName: "AmazonEC2",
        region,
        instanceType,
        osType
      });
      return null;
    }

    const currency = selected.currency.toUpperCase();
    const hourlyPriceUsd =
      currency === "USD"
        ? selected.retailPrice
        : currency === "INR"
        ? selected.retailPrice / AWS_USD_TO_INR
        : NaN;

    if (!Number.isFinite(hourlyPriceUsd) || hourlyPriceUsd <= 0) {
      logger.info("AWS_CACHE_MISS", {
        serviceName: "AmazonEC2",
        region,
        instanceType,
        osType,
        reason: "invalid_cached_currency_or_price",
        currency: selected.currency
      });
      logger.info("CACHE_MISS", {
        provider: "aws",
        cache: "aws-compute-cache",
        serviceName: "AmazonEC2",
        region,
        instanceType,
        osType,
        reason: "invalid_cached_currency_or_price",
        currency: selected.currency
      });
      return null;
    }

    logger.info("AWS_CACHE_HIT", {
      serviceName: "AmazonEC2",
      region,
      instanceType,
      osType,
      pricingVersion: selected.pricingVersion
    });
    logger.info("CACHE_HIT", {
      provider: "aws",
      cache: "aws-compute-cache",
      serviceName: "AmazonEC2",
      region,
      instanceType,
      osType,
      pricingVersion: selected.pricingVersion
    });
    return {
      hourlyPriceUsd: round2(hourlyPriceUsd),
      pricingVersion: selected.pricingVersion
    };
  } catch (error) {
    logger.warn("AWS_CACHE_LOOKUP_FAILED", {
      serviceName: "AmazonEC2",
      region,
      instanceType,
      osType,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
};

const storeCachedComputeHourlyUsd = async (
  region: string,
  instanceType: string,
  osType: AwsOperatingSystem,
  hourlyPriceUsd: number
): Promise<string> => {
  const pricingVersion = getTodayVersionTag();
  try {
    await upsertCloudPricingRecords([
      {
        provider: "aws",
        region,
        serviceName: "AmazonEC2",
        skuName: buildCacheSkuName(instanceType, osType),
        unit: "Hrs",
        retailPrice: hourlyPriceUsd,
        currency: "USD",
        pricingVersion
      }
    ]);
    logger.info("AWS_CACHE_STORE", {
      serviceName: "AmazonEC2",
      region,
      instanceType,
      osType,
      pricingVersion
    });
  } catch (error) {
    logger.warn("AWS_CACHE_STORE_FAILED", {
      serviceName: "AmazonEC2",
      region,
      instanceType,
      osType,
      pricingVersion,
      error: error instanceof Error ? error.message : String(error)
    });
  }
  return pricingVersion;
};

const extractOnDemandHourlyUsd = (priceListPayload: AwsPriceListPayload): number | null => {
  const onDemandTerms = priceListPayload.terms?.OnDemand ?? {};
  const hourlyPrices: number[] = [];

  for (const term of Object.values(onDemandTerms)) {
    for (const dimension of Object.values(term.priceDimensions ?? {})) {
      const unit = (dimension.unit ?? "").toLowerCase();
      const beginRange = dimension.beginRange ?? "0";
      const usd = parseNumber(dimension.pricePerUnit?.USD);
      if (!unit.includes("hr")) {
        continue;
      }
      if (beginRange !== "0") {
        continue;
      }
      if (usd === null || usd <= 0) {
        continue;
      }
      hourlyPrices.push(usd);
    }
  }

  if (hourlyPrices.length === 0) {
    return null;
  }

  return Math.min(...hourlyPrices);
};

const fetchAwsOnDemandHourlyUsd = async (
  instanceType: string,
  region: string,
  osType: AwsOperatingSystem
): Promise<AwsCatalogPriceHit> => {
  const location = mapAwsRegionToLocation(region);
  if (!location) {
    throw new AwsPricingEngineError(
      "REGION_MAPPING_NOT_FOUND",
      `AWS region mapping not found for ${region}`,
      { region }
    );
  }

  const filters = [
    {
      Type: FilterType.TERM_MATCH,
      Field: "instanceType",
      Value: instanceType
    },
    {
      Type: FilterType.TERM_MATCH,
      Field: "location",
      Value: location
    },
    {
      Type: FilterType.TERM_MATCH,
      Field: "operatingSystem",
      Value: buildOperatingSystemFilter(osType)
    },
    {
      Type: FilterType.TERM_MATCH,
      Field: "tenancy",
      Value: "Shared"
    },
    {
      Type: FilterType.TERM_MATCH,
      Field: "preInstalledSw",
      Value: "NA"
    }
  ];

  const pageLimit = Math.max(1, AWS_PRICING_MAX_PAGES);
  let nextToken: string | undefined;
  let page = 0;
  let bestHourlyPrice: number | null = null;

  while (page < pageLimit) {
    const response = await pricingClient.send(
      new GetProductsCommand({
        ServiceCode: "AmazonEC2",
        Filters: filters,
        NextToken: nextToken,
        MaxResults: 100
      })
    );

    for (const row of response.PriceList ?? []) {
      let parsed: AwsPriceListPayload | null = null;
      try {
        parsed = JSON.parse(typeof row === "string" ? row : String(row)) as AwsPriceListPayload;
      } catch {
        continue;
      }
      const hourly = extractOnDemandHourlyUsd(parsed);
      if (hourly === null) {
        continue;
      }
      bestHourlyPrice =
        bestHourlyPrice === null ? hourly : Math.min(bestHourlyPrice, hourly);
    }

    nextToken = response.NextToken;
    page += 1;
    if (!nextToken) {
      break;
    }
  }

  if (bestHourlyPrice === null) {
    throw new AwsPricingEngineError(
      "PRICE_NOT_FOUND",
      `No AWS OnDemand hourly price found for ${instanceType} in ${region}`,
      {
        serviceCode: "AmazonEC2",
        instanceType,
        region,
        location,
        osType,
        pagesChecked: page
      }
    );
  }

  return { hourlyPriceUsd: round2(bestHourlyPrice) };
};

const fetchAwsOnDemandWithRetry = async (
  instanceType: string,
  region: string,
  osType: AwsOperatingSystem
): Promise<AwsCatalogPriceHit> => {
  try {
    return await retry(() => fetchAwsOnDemandHourlyUsd(instanceType, region, osType));
  } catch (error) {
    if (error instanceof AwsPricingEngineError) {
      throw error;
    }
    throw new AwsPricingEngineError(
      "API_CALL_FAILED",
      "AWS Price List API call failed after retries",
      {
        serviceName: "AmazonEC2",
        instanceType,
        region,
        osType,
        error: error instanceof Error ? error.message : String(error)
      }
    );
  }
};

export class AwsPricingEngineService
  implements CloudPricingProvider<AwsPricingEngineInput, AwsPricingEngineOutput>
{
  async calculatePrice(input: AwsPricingEngineInput): Promise<AwsPricingEngineOutput> {
    if (input.serviceType !== "COMPUTE_VM") {
      throw new AwsPricingEngineError("INVALID_INPUT", "Unsupported AWS serviceType", {
        serviceType: input.serviceType
      });
    }
    if (!input.skuName?.trim()) {
      throw new AwsPricingEngineError("INVALID_INPUT", "skuName is required");
    }
    if (!input.region?.trim()) {
      throw new AwsPricingEngineError("INVALID_INPUT", "region is required");
    }
    if (!Number.isFinite(input.hours) || input.hours <= 0) {
      throw new AwsPricingEngineError("INVALID_INPUT", "hours must be > 0");
    }
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
      throw new AwsPricingEngineError("INVALID_INPUT", "quantity must be > 0");
    }

    const instanceType = normalizeInstanceType(input.skuName);
    const location = mapAwsRegionToLocation(input.region);
    if (!location) {
      throw new AwsPricingEngineError(
        "REGION_MAPPING_NOT_FOUND",
        `AWS region mapping not found for ${input.region}`,
        { region: input.region }
      );
    }

    let hourlyPriceUsd: number;
    let pricingVersion: string;
    let source: CacheSource;

    const cached = await findCachedComputeHourlyUsd(
      input.region,
      instanceType,
      input.osType
    );
    if (cached) {
      hourlyPriceUsd = cached.hourlyPriceUsd;
      pricingVersion = cached.pricingVersion;
      source = "cache";
    } else {
      const api = await fetchAwsOnDemandWithRetry(instanceType, input.region, input.osType);
      hourlyPriceUsd = api.hourlyPriceUsd;
      pricingVersion = await storeCachedComputeHourlyUsd(
        input.region,
        instanceType,
        input.osType,
        hourlyPriceUsd
      );
      source = "api";
    }

    const hourlyPriceInr = toInrFromUsd(hourlyPriceUsd);
    const monthlyCost = round2(hourlyPriceInr * input.hours * input.quantity);

    return {
      provider: "aws",
      serviceName: "EC2",
      monthlyCost,
      pricingVersion,
      breakdown: {
        hourlyPrice: hourlyPriceUsd,
        hourlyPriceCurrency: "USD",
        hourlyPriceInr,
        region: input.region,
        location,
        instanceType,
        source
      }
    };
  }

  async estimate(input: AwsPricingEngineInput): Promise<AwsPricingEngineOutput> {
    return this.calculatePrice(input);
  }
}

export class AwsPricingEngine
  implements CloudPricingProvider<NormalizedPricingParams, PricingResult>
{
  private readonly engine = new AwsPricingEngineService();

  async calculatePrice(params: NormalizedPricingParams): Promise<PricingResult> {
    const result = await this.engine.calculatePrice(toEngineInput(params));
    return toPricingResult(result);
  }
}
