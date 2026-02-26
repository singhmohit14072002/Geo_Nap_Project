"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CloudDecisionEngineService = void 0;
const logger_1 = __importDefault(require("../utils/logger"));
const PROVIDERS = ["azure", "aws", "gcp"];
const round2 = (value) => Number(value.toFixed(2));
const calculateDifferencePercent = (higher, lower) => {
    if (lower === 0) {
        return higher > 0 ? Number.POSITIVE_INFINITY : 0;
    }
    return ((higher - lower) / lower) * 100;
};
const confidenceFromDifference = (differencePercent) => {
    if (differencePercent > 10) {
        return "high";
    }
    if (differencePercent >= 5) {
        return "medium";
    }
    return "low";
};
const getDeltaQualifier = (differencePercent) => {
    if (differencePercent > 10) {
        return "significantly higher";
    }
    if (differencePercent >= 5) {
        return "moderately higher";
    }
    return "slightly higher";
};
const formatProvider = (provider) => {
    if (provider === "aws") {
        return "AWS";
    }
    if (provider === "gcp") {
        return "GCP";
    }
    return "Azure";
};
const formatPercent = (value) => {
    if (!Number.isFinite(value)) {
        return "infinite";
    }
    return `${round2(value)}%`;
};
const toCostComparison = (input) => {
    const comparison = {};
    if (input.azure) {
        comparison.azure = input.azure.monthlyCost;
    }
    if (input.aws) {
        comparison.aws = input.aws.monthlyCost;
    }
    if (input.gcp) {
        comparison.gcp = input.gcp.monthlyCost;
    }
    return comparison;
};
const getRankedProviders = (input) => PROVIDERS.map((provider) => ({ provider, result: input[provider] }))
    .filter((entry) => entry.result !== undefined &&
    Number.isFinite(entry.result.monthlyCost) &&
    entry.result.monthlyCost >= 0)
    .map((entry) => ({
    provider: entry.provider,
    monthlyCost: entry.result.monthlyCost
}))
    .sort((a, b) => a.monthlyCost - b.monthlyCost);
class CloudDecisionEngineService {
    analyzeComparison(input) {
        const ranked = getRankedProviders(input);
        if (ranked.length === 0) {
            throw new Error("No successful provider pricing results available for recommendation");
        }
        const winner = ranked[0];
        const nextBest = ranked[1];
        const confidence = nextBest
            ? confidenceFromDifference(calculateDifferencePercent(nextBest.monthlyCost, winner.monthlyCost))
            : "low";
        const reasoning = [
            `${formatProvider(winner.provider)} offers the lowest monthly cost.`
        ];
        if (nextBest) {
            const nextDeltaPercent = calculateDifferencePercent(nextBest.monthlyCost, winner.monthlyCost);
            reasoning.push(`Cost difference is ${formatPercent(nextDeltaPercent)} compared to the next best provider (${formatProvider(nextBest.provider)}).`);
        }
        else {
            reasoning.push("Only one provider returned a valid price, so confidence is low due to limited comparison data.");
        }
        for (const provider of ranked.slice(1)) {
            const deltaValue = provider.monthlyCost - winner.monthlyCost;
            const deltaPercent = calculateDifferencePercent(provider.monthlyCost, winner.monthlyCost);
            reasoning.push(`${formatProvider(provider.provider)} is ${getDeltaQualifier(deltaPercent)} (${round2(deltaValue)} monthly cost) than ${formatProvider(winner.provider)}.`);
        }
        const result = {
            recommendedProvider: winner.provider,
            confidence,
            costComparison: toCostComparison(input),
            savingsEstimate: nextBest
                ? round2(nextBest.monthlyCost - winner.monthlyCost)
                : undefined,
            reasoning
        };
        logger_1.default.info("DECISION_MADE", {
            recommendedProvider: result.recommendedProvider,
            confidence: result.confidence,
            savingsEstimate: result.savingsEstimate
        });
        return result;
    }
}
exports.CloudDecisionEngineService = CloudDecisionEngineService;
