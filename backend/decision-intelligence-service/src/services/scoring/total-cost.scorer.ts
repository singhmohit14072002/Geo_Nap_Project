import { ProviderCostResult } from "../../domain/decision.model";
import { normalizeInverse, round3 } from "./score-utils";

export const scoreTotalCost = (
  provider: ProviderCostResult,
  providers: ProviderCostResult[]
): number => {
  const totals = providers.map((item) => item.summary.monthlyTotal);
  const min = Math.min(...totals);
  const max = Math.max(...totals);
  return round3(normalizeInverse(provider.summary.monthlyTotal, min, max));
};

