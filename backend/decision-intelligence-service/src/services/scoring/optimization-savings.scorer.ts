import {
  ProviderCostResult,
  ProviderOptimizationRecommendations
} from "../../domain/decision.model";
import { normalizeDirect, round3 } from "./score-utils";

const savingsRatio = (
  provider: ProviderCostResult,
  optimization?: ProviderOptimizationRecommendations
): number => {
  const recommendations = optimization?.recommendations ?? [];
  if (recommendations.length === 0 || provider.summary.monthlyTotal <= 0) {
    return 0;
  }

  const totalSavings = recommendations.reduce(
    (sum, item) => sum + item.estimatedMonthlySavings,
    0
  );
  return Math.min(1.5, totalSavings / provider.summary.monthlyTotal);
};

export const scoreOptimizationSavings = (
  provider: ProviderCostResult,
  providers: ProviderCostResult[],
  optimizationByProvider: Map<string, ProviderOptimizationRecommendations>
): number => {
  const ratios = providers.map((item) =>
    savingsRatio(item, optimizationByProvider.get(item.provider))
  );
  const current = savingsRatio(provider, optimizationByProvider.get(provider.provider));
  const min = Math.min(...ratios);
  const max = Math.max(...ratios);
  return round3(normalizeDirect(current, min, max));
};

