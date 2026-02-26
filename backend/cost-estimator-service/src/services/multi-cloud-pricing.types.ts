export type NormalizedServiceType = "COMPUTE_VM";

export interface NormalizedPricingParams {
  serviceType: NormalizedServiceType;
  skuName: string;
  region: string;
  hours: number;
  quantity: number;
  osType: "linux" | "windows";
}

export interface PricingResult {
  provider: "azure" | "aws" | "gcp";
  serviceName: string;
  monthlyCost: number;
  pricingVersion: string;
  breakdown: {
    hourlyPrice: number;
    hourlyPriceCurrency: "USD" | "INR";
    hourlyPriceInr: number;
    region: string;
    instanceType: string;
    location?: string;
    source?: "cache" | "api" | "db" | "fallback";
    matchedSkuName?: string;
    meterName?: string;
  };
}

export interface ProviderFailure {
  code: string;
  message: string;
}

export interface MultiCloudComparisonResult {
  azure?: PricingResult;
  aws?: PricingResult;
  gcp?: PricingResult;
  errors?: {
    azure?: ProviderFailure;
    aws?: ProviderFailure;
    gcp?: ProviderFailure;
  };
}
