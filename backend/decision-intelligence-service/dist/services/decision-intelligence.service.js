"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeDecisionIntelligence = void 0;
const instance_fit_scorer_1 = require("./scoring/instance-fit.scorer");
const network_impact_scorer_1 = require("./scoring/network-impact.scorer");
const optimization_savings_scorer_1 = require("./scoring/optimization-savings.scorer");
const total_cost_scorer_1 = require("./scoring/total-cost.scorer");
const score_utils_1 = require("./scoring/score-utils");
const WEIGHTS = {
    totalCost: 0.5,
    instanceFit: 0.2,
    networkImpact: 0.15,
    optimizationSavings: 0.15
};
const mergeOptimizationMap = (providerResults, explicit) => {
    const map = new Map();
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
const weightedScore = (parts) => (0, score_utils_1.round3)((0, score_utils_1.clamp01)(parts.totalCostScore * WEIGHTS.totalCost +
    parts.instanceFitScore * WEIGHTS.instanceFit +
    parts.networkImpactScore * WEIGHTS.networkImpact +
    parts.optimizationSavingsScore * WEIGHTS.optimizationSavings));
const toProviderDecisionScore = (provider, providers, optimizationByProvider) => {
    const totalCostScore = (0, total_cost_scorer_1.scoreTotalCost)(provider, providers);
    const instanceFitScore = (0, instance_fit_scorer_1.scoreInstanceFit)(provider);
    const networkImpactScore = (0, network_impact_scorer_1.scoreNetworkImpact)(provider, providers);
    const optimizationSavingsScore = (0, optimization_savings_scorer_1.scoreOptimizationSavings)(provider, providers, optimizationByProvider);
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
const formatPct = (value) => `${Math.round(value * 100)}%`;
const buildReasoning = (winner, rankedProviders) => {
    const reasons = [];
    reasons.push(`${winner.provider.toUpperCase()} is recommended because it has the highest composite score (${winner.score.weightedScore}) across deterministic factors.`);
    reasons.push(`Primary cost signal: monthly estimate ${winner.monthlyTotal.toLocaleString("en-IN")} INR with total-cost score ${winner.score.totalCostScore}.`);
    reasons.push(`Technical fit and network impact: instance-fit ${formatPct(winner.score.instanceFitScore)}, network-impact ${formatPct(winner.score.networkImpactScore)}.`);
    if (rankedProviders.length > 1) {
        const second = rankedProviders[1];
        const delta = (0, score_utils_1.round3)(winner.score.weightedScore - second.score.weightedScore);
        reasons.push(`Score margin vs next option (${second.provider.toUpperCase()}): ${delta}.`);
    }
    return reasons;
};
const buildTradeoffs = (winner, rankedProviders) => {
    return rankedProviders
        .filter((item) => item.provider !== winner.provider)
        .map((item) => {
        const costDelta = item.monthlyTotal - winner.monthlyTotal;
        const scoreDelta = winner.score.weightedScore - item.score.weightedScore;
        const costPhrase = costDelta >= 0
            ? `${Math.abs(costDelta).toLocaleString("en-IN")} INR/month more expensive`
            : `${Math.abs(costDelta).toLocaleString("en-IN")} INR/month cheaper`;
        return `${item.provider.toUpperCase()} (${item.region}) is ${costPhrase} than ${winner.provider.toUpperCase()} and trails by ${(0, score_utils_1.round3)(scoreDelta)} score points.`;
    });
};
const computeRecommendationConfidence = (rankedProviders) => {
    const top = rankedProviders[0];
    if (!top) {
        return 0;
    }
    if (rankedProviders.length === 1) {
        return (0, score_utils_1.round3)((0, score_utils_1.clamp01)(0.75 + top.score.weightedScore * 0.25));
    }
    const second = rankedProviders[1];
    const margin = (0, score_utils_1.clamp01)((top.score.weightedScore - second.score.weightedScore) / 0.4);
    const completeness = (top.score.instanceFitScore + top.score.networkImpactScore + top.score.totalCostScore) /
        3;
    return (0, score_utils_1.round3)((0, score_utils_1.clamp01)(0.45 * margin + 0.35 * completeness + 0.2 * top.score.weightedScore));
};
const analyzeDecisionIntelligence = (input) => {
    const optimizationByProvider = mergeOptimizationMap(input.providerResults, input.optimizationRecommendations);
    const rankedProviders = input.providerResults
        .map((provider) => toProviderDecisionScore(provider, input.providerResults, optimizationByProvider))
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
exports.analyzeDecisionIntelligence = analyzeDecisionIntelligence;
