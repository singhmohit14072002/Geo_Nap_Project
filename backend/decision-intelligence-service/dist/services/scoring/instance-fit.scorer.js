"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoreInstanceFit = void 0;
const score_utils_1 = require("./score-utils");
const readNumber = (value) => {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string") {
        const parsed = Number(value.trim());
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return null;
};
const scoreFromRequiredProvisioned = (required, provisioned) => {
    if (required == null || provisioned == null || required <= 0 || provisioned <= 0) {
        return null;
    }
    const mismatch = Math.abs(provisioned - required) / required;
    return (0, score_utils_1.clamp01)(1 - mismatch);
};
const scoreInstanceFit = (provider) => {
    const computeDetails = provider.details.filter((item) => item.serviceType.toLowerCase().includes("compute"));
    if (computeDetails.length === 0) {
        return 0.5;
    }
    const scores = [];
    for (const item of computeDetails) {
        const metadata = item.metadata ?? {};
        const cpuScore = scoreFromRequiredProvisioned(readNumber(metadata.requiredVcpu), readNumber(metadata.provisionedVcpu));
        const ramScore = scoreFromRequiredProvisioned(readNumber(metadata.requiredRamGb), readNumber(metadata.provisionedRamGb));
        if (cpuScore == null && ramScore == null) {
            scores.push(0.5);
            continue;
        }
        if (cpuScore != null && ramScore != null) {
            scores.push((cpuScore + ramScore) / 2);
        }
        else {
            scores.push(cpuScore ?? ramScore ?? 0.5);
        }
    }
    const avg = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    return (0, score_utils_1.round3)((0, score_utils_1.clamp01)(avg));
};
exports.scoreInstanceFit = scoreInstanceFit;
