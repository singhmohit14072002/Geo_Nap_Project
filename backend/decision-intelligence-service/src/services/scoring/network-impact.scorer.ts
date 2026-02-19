import { ProviderCostResult } from "../../domain/decision.model";
import { clamp01, normalizeInverse, round3 } from "./score-utils";

export const scoreNetworkImpact = (
  provider: ProviderCostResult,
  providers: ProviderCostResult[]
): number => {
  const egressValues = providers.map((item) => item.breakdown.networkEgress);
  const min = Math.min(...egressValues);
  const max = Math.max(...egressValues);

  const relativeScore = normalizeInverse(provider.breakdown.networkEgress, min, max);
  const ratio =
    provider.summary.monthlyTotal > 0
      ? provider.breakdown.networkEgress / provider.summary.monthlyTotal
      : 1;
  const ratioScore = clamp01(1 - ratio);

  return round3(clamp01(relativeScore * 0.7 + ratioScore * 0.3));
};

