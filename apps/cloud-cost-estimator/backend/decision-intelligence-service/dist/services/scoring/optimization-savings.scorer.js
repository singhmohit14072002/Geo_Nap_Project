"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoreOptimizationSavings = void 0;
const score_utils_1 = require("./score-utils");
const savingsRatio = (provider, optimization) => {
    const recommendations = optimization?.recommendations ?? [];
    if (recommendations.length === 0 || provider.summary.monthlyTotal <= 0) {
        return 0;
    }
    const totalSavings = recommendations.reduce((sum, item) => sum + item.estimatedMonthlySavings, 0);
    return Math.min(1.5, totalSavings / provider.summary.monthlyTotal);
};
const scoreOptimizationSavings = (provider, providers, optimizationByProvider) => {
    const ratios = providers.map((item) => savingsRatio(item, optimizationByProvider.get(item.provider)));
    const current = savingsRatio(provider, optimizationByProvider.get(provider.provider));
    const min = Math.min(...ratios);
    const max = Math.max(...ratios);
    return (0, score_utils_1.round3)((0, score_utils_1.normalizeDirect)(current, min, max));
};
exports.scoreOptimizationSavings = scoreOptimizationSavings;
