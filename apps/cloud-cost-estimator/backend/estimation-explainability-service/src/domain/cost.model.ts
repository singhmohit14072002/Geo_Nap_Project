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
  metadata?: Record<string, string | number | boolean>;
}

export type OptimizationRecommendationType =
  | "RIGHT_SIZING"
  | "RESERVED_INSTANCE"
  | "STORAGE_OPTIMIZATION"
  | "NETWORK_OPTIMIZATION";

export interface OptimizationRecommendation {
  type: OptimizationRecommendationType;
  message: string;
  estimatedMonthlySavings: number;
}

export interface ProviderOptimizationRecommendations {
  provider: CloudProvider;
  recommendations: OptimizationRecommendation[];
}

export interface ProviderCostResult {
  provider: CloudProvider;
  region: string;
  summary: CostSummary;
  breakdown: CostBreakdown;
  details: CostDetailItem[];
  pricingVersion: string;
  calculatedAt: string;
  optimization?: ProviderOptimizationRecommendations;
}

export interface EstimationExplanation {
  computeReasoning: string;
  costBreakdownSummary: string;
  assumptions: string[];
  optimizationExplanation: string[];
}

