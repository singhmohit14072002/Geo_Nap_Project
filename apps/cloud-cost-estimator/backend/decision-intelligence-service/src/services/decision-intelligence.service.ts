import {
  DecisionIntelligenceResponse,
  ProviderCostResult,
  ProviderDecisionScore,
  ProviderOptimizationRecommendations
} from "../domain/decision.model";
import { DecisionRequest } from "../schemas/decision.schema";
import { scoreInstanceFit } from "./scoring/instance-fit.scorer";
import { scoreNetworkImpact } from "./scoring/network-impact.scorer";
import { scoreOptimizationSavings } from "./scoring/optimization-savings.scorer";
import { scoreTotalCost } from "./scoring/total-cost.scorer";
import { clamp01, round3 } from "./scoring/score-utils";

const WEIGHTS = {
  totalCost: 0.5,
  instanceFit: 0.2,
  networkImpact: 0.15,
  optimizationSavings: 0.15
} as const;

const mergeOptimizationMap = (
  providerResults: ProviderCostResult[],
  explicit?: ProviderOptimizationRecommendations[]
): Map<string, ProviderOptimizationRecommendations> => {
  const map = new Map<string, ProviderOptimizationRecommendations>();

  for (const provider of providerResults) {
    if (provider.optimization) {
      map.set(provider.provider, provider.optimization);
    }
  }

  for (const item of explicit ?? []) {
    map.set(item.provider, item);
  }

  return map;
};

const weightedScore = (parts: {
  totalCostScore: number;
  instanceFitScore: number;
  networkImpactScore: number;
  optimizationSavingsScore: number;
}): number =>
  round3(
    clamp01(
      parts.totalCostScore * WEIGHTS.totalCost +
        parts.instanceFitScore * WEIGHTS.instanceFit +
        parts.networkImpactScore * WEIGHTS.networkImpact +
        parts.optimizationSavingsScore * WEIGHTS.optimizationSavings
    )
  );

const toProviderDecisionScore = (
  provider: ProviderCostResult,
  providers: ProviderCostResult[],
  optimizationByProvider: Map<string, ProviderOptimizationRecommendations>
): ProviderDecisionScore => {
  const totalCostScore = scoreTotalCost(provider, providers);
  const instanceFitScore = scoreInstanceFit(provider);
  const networkImpactScore = scoreNetworkImpact(provider, providers);
  const optimizationSavingsScore = scoreOptimizationSavings(
    provider,
    providers,
    optimizationByProvider
  );

  return {
    provider: provider.provider,
    region: provider.region,
    monthlyTotal: provider.summary.monthlyTotal,
    score: {
      totalCostScore,
      instanceFitScore,
      networkImpactScore,
      optimizationSavingsScore,
      weightedScore: weightedScore({
        totalCostScore,
        instanceFitScore,
        networkImpactScore,
        optimizationSavingsScore
      })
    }
  };
};

const formatPct = (value: number): string => `${Math.round(value * 100)}%`;

const buildReasoning = (
  winner: ProviderDecisionScore,
  rankedProviders: ProviderDecisionScore[]
): string[] => {
  const reasons: string[] = [];
  reasons.push(
    `${winner.provider.toUpperCase()} is recommended because it has the highest composite score (${winner.score.weightedScore}) across deterministic factors.`
  );
  reasons.push(
    `Primary cost signal: monthly estimate ${winner.monthlyTotal.toLocaleString("en-IN")} INR with total-cost score ${winner.score.totalCostScore}.`
  );
  reasons.push(
    `Technical fit and network impact: instance-fit ${formatPct(
      winner.score.instanceFitScore
    )}, network-impact ${formatPct(winner.score.networkImpactScore)}.`
  );

  if (rankedProviders.length > 1) {
    const second = rankedProviders[1];
    const delta = round3(winner.score.weightedScore - second.score.weightedScore);
    reasons.push(
      `Score margin vs next option (${second.provider.toUpperCase()}): ${delta}.`
    );
  }
  return reasons;
};

const buildTradeoffs = (
  winner: ProviderDecisionScore,
  rankedProviders: ProviderDecisionScore[]
): string[] => {
  return rankedProviders
    .filter((item) => item.provider !== winner.provider)
    .map((item) => {
      const costDelta = item.monthlyTotal - winner.monthlyTotal;
      const scoreDelta = winner.score.weightedScore - item.score.weightedScore;
      const costPhrase =
        costDelta >= 0
          ? `${Math.abs(costDelta).toLocaleString("en-IN")} INR/month more expensive`
          : `${Math.abs(costDelta).toLocaleString("en-IN")} INR/month cheaper`;
      return `${item.provider.toUpperCase()} (${item.region}) is ${costPhrase} than ${winner.provider.toUpperCase()} and trails by ${round3(
        scoreDelta
      )} score points.`;
    });
};

const computeRecommendationConfidence = (rankedProviders: ProviderDecisionScore[]): number => {
  const top = rankedProviders[0];
  if (!top) {
    return 0;
  }

  if (rankedProviders.length === 1) {
    return round3(clamp01(0.75 + top.score.weightedScore * 0.25));
  }

  const second = rankedProviders[1];
  const margin = clamp01((top.score.weightedScore - second.score.weightedScore) / 0.4);
  const completeness =
    (top.score.instanceFitScore + top.score.networkImpactScore + top.score.totalCostScore) /
    3;

  return round3(clamp01(0.45 * margin + 0.35 * completeness + 0.2 * top.score.weightedScore));
};

export const analyzeDecisionIntelligence = (
  input: DecisionRequest
): DecisionIntelligenceResponse => {
  const optimizationByProvider = mergeOptimizationMap(
    input.providerResults,
    input.optimizationRecommendations
  );

  const rankedProviders = input.providerResults
    .map((provider) =>
      toProviderDecisionScore(provider, input.providerResults, optimizationByProvider)
    )
    .sort((a, b) => b.score.weightedScore - a.score.weightedScore);

  const recommended = rankedProviders[0];

  return {
    recommended: {
      provider: recommended.provider,
      region: recommended.region,
      recommendationConfidence: computeRecommendationConfidence(rankedProviders),
      reasoning: buildReasoning(recommended, rankedProviders),
      tradeoffs: buildTradeoffs(recommended, rankedProviders)
    },
    rankedProviders
  };
};

