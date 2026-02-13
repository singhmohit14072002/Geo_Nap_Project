import { Router } from "express";
import { CloudProvider, createLogger, ValidationError } from "@geo-nap/common";
import { getRedisClient } from "../cache/redis";
import { getGpuOffers } from "../engine/catalog";
import { estimateCostForOffer, evaluateOfferEligibility, OfferIneligibilityReason } from "../engine/costEngine";
import { estimateRequestSchema } from "./schemas";
import { config } from "../config/env";

function stableKey(obj: unknown): string {
  return JSON.stringify(obj);
}

export const pricingRouter = Router();
const logger = createLogger("pricing-service");
const SUPPORTED_PROVIDERS: CloudProvider[] = ["aws", "azure", "gcp", "vast"];

pricingRouter.get("/v1/pricing/offers", async (req, res) => {
  const provider = typeof req.query.provider === "string" ? req.query.provider : undefined;
  const region = typeof req.query.region === "string" ? req.query.region : undefined;

  let offers = getGpuOffers(provider);
  if (region) {
    offers = offers.filter((offer) => offer.region === region);
  }

  const providerCounts = SUPPORTED_PROVIDERS.reduce<Record<string, number>>((acc, p) => {
    acc[p] = offers.filter((offer) => offer.provider === p).length;
    return acc;
  }, {});
  logger.info({ provider, region, totalOffers: offers.length, providerCounts }, "pricing offers fetched");

  res.status(200).json({ offers });
});

pricingRouter.post("/v1/pricing/estimate", async (req, res) => {
  const parsed = estimateRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError("Invalid pricing estimate request", parsed.error.flatten());
  }

  const payload = parsed.data;
  const cacheKey = `pricing:estimate:${stableKey(payload)}`;

  const redis = await getRedisClient();
  if (redis) {
    const hit = await redis.get(cacheKey);
    if (hit) {
      res.status(200).json(JSON.parse(hit));
      return;
    }
  }

  let offers = getGpuOffers();
  const loadedByProvider = SUPPORTED_PROVIDERS.reduce<Record<string, number>>((acc, provider) => {
    acc[provider] = offers.filter((offer) => offer.provider === provider).length;
    return acc;
  }, {});

  if (payload.providers && payload.providers.length > 0) {
    offers = offers.filter((offer) => payload.providers?.includes(offer.provider));
  }
  if (payload.regions && payload.regions.length > 0) {
    offers = offers.filter((offer) => payload.regions?.includes(offer.region));
  }
  if (payload.skus && payload.skus.length > 0) {
    offers = offers.filter((offer) => payload.skus?.includes(offer.sku));
  }

  const reasonCountsByProvider: Record<string, Record<OfferIneligibilityReason, number>> = {};
  for (const provider of SUPPORTED_PROVIDERS) {
    reasonCountsByProvider[provider] = {
      parity_mode_required: 0,
      ram_requirement_not_met: 0,
      gpu_count_per_vm_invalid: 0,
      insufficient_capacity: 0,
      machine_price_missing: 0,
      transfer_rate_missing: 0
    };
  }

  const results: NonNullable<ReturnType<typeof estimateCostForOffer>>[] = [];
  for (const offer of offers) {
    const eligibility = evaluateOfferEligibility(payload.request, offer);
    if (!eligibility.eligible) {
      reasonCountsByProvider[offer.provider][eligibility.reason] += 1;
      continue;
    }

    const result = estimateCostForOffer(payload.plan_id, payload.request, offer, payload.batch_id, payload.scenario_id);
    if (result) {
      results.push(result);
    }
  }

  const filteredByProvider = SUPPORTED_PROVIDERS.reduce<Record<string, number>>((acc, provider) => {
    acc[provider] = offers.filter((offer) => offer.provider === provider).length;
    return acc;
  }, {});
  const resultByProvider = SUPPORTED_PROVIDERS.reduce<Record<string, number>>((acc, provider) => {
    acc[provider] = results.filter((offer) => offer.provider === provider).length;
    return acc;
  }, {});

  logger.info(
    {
      planId: payload.plan_id,
      request: payload.request,
      loadedByProvider,
      filteredByProvider,
      resultByProvider,
      exclusionReasons: reasonCountsByProvider
    },
    "pricing estimate computed"
  );

  for (const provider of SUPPORTED_PROVIDERS) {
    if (loadedByProvider[provider] === 0) {
      logger.warn({ provider }, "pricing data missing for provider");
      continue;
    }
    if (filteredByProvider[provider] === 0) {
      logger.warn({ provider, filters: { providers: payload.providers, regions: payload.regions, skus: payload.skus } }, "provider excluded by explicit filters");
      continue;
    }
    if (resultByProvider[provider] === 0) {
      logger.warn(
        { provider, request: payload.request, exclusions: reasonCountsByProvider[provider] },
        "provider has zero valid machines after deterministic eligibility checks"
      );
    }
  }

  const response = { plan_id: payload.plan_id, results };

  if (redis) {
    await redis.set(cacheKey, JSON.stringify(response), "EX", config.CACHE_TTL_SECONDS);
  }

  res.status(200).json(response);
});
