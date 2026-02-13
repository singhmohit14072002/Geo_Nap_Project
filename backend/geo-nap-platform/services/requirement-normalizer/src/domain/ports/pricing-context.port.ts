import { NormalizedRequirement, PricingEngineContext } from "../types";

// Extension point for pricing-service integration. Implementations can translate
// normalized requirements into provider-specific pricing requests.
export interface PricingContextPort {
  buildPricingContext(requirement: NormalizedRequirement): PricingEngineContext;
}
