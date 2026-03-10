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
