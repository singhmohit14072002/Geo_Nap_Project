import { CloudProvider, PlanRequest, ProviderSkuOffer } from "@geo-nap/common";
import { config } from "../config/env";

interface PricingOffersResponse {
  offers: ProviderSkuOffer[];
}

export async function fetchGpuOffers(): Promise<ProviderSkuOffer[]> {
  const response = await fetch(`${config.PRICING_SERVICE_URL}/v1/pricing/offers`);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Pricing service offers endpoint failed: ${response.status} ${body}`);
  }

  const payload = (await response.json()) as PricingOffersResponse;
  return payload.offers;
}

export async function fetchDeterministicCosts(
  planId: string,
  batchId: string,
  request: PlanRequest,
  provider: CloudProvider,
  region: string,
  sku: string,
  scenarioId: string
) {
  const response = await fetch(`${config.PRICING_SERVICE_URL}/v1/pricing/estimate`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      plan_id: planId,
      batch_id: batchId,
      scenario_id: scenarioId,
      request,
      providers: [provider],
      regions: [region],
      skus: [sku]
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Pricing estimate failed: ${response.status} ${body}`);
  }

  return response.json();
}
