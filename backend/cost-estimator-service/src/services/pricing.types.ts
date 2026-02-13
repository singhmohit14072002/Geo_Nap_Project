import {
  CloudProvider,
  CostBreakdown,
  CostDetailItem,
  CostSummary,
  InfrastructureRequirement,
  ProviderCostResult
} from "../domain/cost.model";

export interface PricingRates {
  vcpuPerMonth: number;
  storagePerGbPerMonth: number;
  egressPerGbPerMonth: number;
  databaseBasePerMonth: number;
  pricingVersion: string;
}

export interface PricingServiceInput {
  provider: CloudProvider;
  region: string;
  requirement: InfrastructureRequirement;
}

export interface CloudPricingService {
  estimate(input: PricingServiceInput): Promise<ProviderCostResult>;
}

export interface PricingComputation {
  breakdown: CostBreakdown;
  summary: CostSummary;
  details: CostDetailItem[];
}
