export type CloudProvider = "azure" | "aws" | "gcp";

export interface CostSummary {
  monthlyTotal: number;
  yearlyTotal: number;
  currency: "INR";
}

export interface CostBreakdown {
  compute: number;
  storage: number;
  database: number;
  backup: number;
  networkEgress: number;
  other: number;
}

export interface CostDetailItem {
  serviceType: string;
  name: string;
  sku?: string;
  quantity: number;
  unitPrice?: number;
  monthlyCost: number;
}

export interface ProviderCostResult {
  provider: CloudProvider;
  region: string;
  summary: CostSummary;
  breakdown: CostBreakdown;
  details: CostDetailItem[];
  pricingVersion: string;
  calculatedAt: Date;
}

export interface ComputeRequirementItem {
  vCPU: number;
  ramGB: number;
  storageGB: number;
  osType: "linux" | "windows";
  quantity: number;
}

export interface DatabaseRequirement {
  engine: string;
  storageGB: number;
  ha: boolean;
}

export interface NetworkRequirement {
  dataEgressGB: number;
}

export interface InfrastructureRequirement {
  compute: ComputeRequirementItem[];
  database: DatabaseRequirement;
  network: NetworkRequirement;
}

export interface EstimateRequest {
  cloudProviders: CloudProvider[];
  region: string;
  requirement: InfrastructureRequirement;
}

