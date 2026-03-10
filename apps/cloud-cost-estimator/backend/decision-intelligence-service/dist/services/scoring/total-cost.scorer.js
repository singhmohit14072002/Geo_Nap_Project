"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoreTotalCost = void 0;
const score_utils_1 = require("./score-utils");
const scoreTotalCost = (provider, providers) => {
    const totals = providers.map((item) => item.summary.monthlyTotal);
    const min = Math.min(...totals);
    const max = Math.max(...totals);
    return (0, score_utils_1.round3)((0, score_utils_1.normalizeInverse)(provider.summary.monthlyTotal, min, max));
};
exports.scoreTotalCost = scoreTotalCost;
