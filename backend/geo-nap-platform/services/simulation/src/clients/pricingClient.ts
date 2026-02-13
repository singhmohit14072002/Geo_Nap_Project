import { PlanRequest, ProviderSimulationResult, SimulationScenario } from "@geo-nap/common";
import { config } from "../config/env";

interface PricingEstimateResponse {
  plan_id: string;
  results: ProviderSimulationResult[];
}

export async function requestScenarioSimulation(
  planId: string,
  batchId: string,
  scenario: SimulationScenario,
  request: PlanRequest,
): Promise<ProviderSimulationResult[]> {
  const response = await fetch(`${config.PRICING_SERVICE_URL}/v1/pricing/estimate`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      plan_id: planId,
      batch_id: batchId,
      scenario_id: scenario.scenarioId,
      request,
      providers: [scenario.provider],
      regions: [scenario.region],
      skus: [scenario.sku]
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Pricing service error (${scenario.provider}/${scenario.region}/${scenario.sku}): ${response.status} ${body}`
    );
  }

  const payload = (await response.json()) as PricingEstimateResponse;
  return payload.results;
}
