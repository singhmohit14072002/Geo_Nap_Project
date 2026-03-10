"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoreNetworkImpact = void 0;
const score_utils_1 = require("./score-utils");
const scoreNetworkImpact = (provider, providers) => {
    const egressValues = providers.map((item) => item.breakdown.networkEgress);
    const min = Math.min(...egressValues);
    const max = Math.max(...egressValues);
    const relativeScore = (0, score_utils_1.normalizeInverse)(provider.breakdown.networkEgress, min, max);
    const ratio = provider.summary.monthlyTotal > 0
        ? provider.breakdown.networkEgress / provider.summary.monthlyTotal
        : 1;
    const ratioScore = (0, score_utils_1.clamp01)(1 - ratio);
    return (0, score_utils_1.round3)((0, score_utils_1.clamp01)(relativeScore * 0.7 + ratioScore * 0.3));
};
exports.scoreNetworkImpact = scoreNetworkImpact;
