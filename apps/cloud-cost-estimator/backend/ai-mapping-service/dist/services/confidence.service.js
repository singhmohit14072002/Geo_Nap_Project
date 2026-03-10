"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateMappingQuality = void 0;
const isPresent = (value) => {
    if (value == null) {
        return false;
    }
    if (typeof value === "string") {
        return value.trim().length > 0;
    }
    return true;
};
const toConfidence = (value) => Number(Math.min(1, Math.max(0, value)).toFixed(3));
const computeCoverageScore = (requirement) => {
    let total = 0;
    let present = 0;
    for (const item of requirement.compute) {
        total += 5;
        if (isPresent(item.vCPU))
            present += 1;
        if (isPresent(item.ramGB))
            present += 1;
        if (isPresent(item.storageGB))
            present += 1;
        if (isPresent(item.osType))
            present += 1;
        if (isPresent(item.quantity))
            present += 1;
    }
    if (requirement.compute.length === 0) {
        total += 5;
    }
    total += 6;
    if (isPresent(requirement.database.engine))
        present += 1;
    if (isPresent(requirement.database.storageGB))
        present += 1;
    if (isPresent(requirement.database.ha))
        present += 1;
    if (isPresent(requirement.network.dataEgressGB))
        present += 1;
    if (isPresent(requirement.region))
        present += 1;
    present += 1;
    return total === 0 ? 0 : present / total;
};
const computePresenceScore = (requirement) => {
    if (requirement.compute.length === 0) {
        return 0;
    }
    const complete = requirement.compute.filter((item) => isPresent(item.vCPU) &&
        isPresent(item.ramGB) &&
        isPresent(item.quantity) &&
        isPresent(item.osType)).length;
    return complete / requirement.compute.length;
};
const computeAnalyzerStrengthScore = (input) => {
    const raw = input.rawInfrastructureData;
    const stats = raw.stats;
    if (stats && typeof stats === "object") {
        const totalRows = Number(stats.totalRows ?? 0);
        const classifiedRows = Number(stats.classifiedRows ?? 0);
        if (Number.isFinite(totalRows) && Number.isFinite(classifiedRows) && totalRows > 0) {
            return Math.min(1, Math.max(0, classifiedRows / totalRows));
        }
    }
    const buckets = [
        raw.computeCandidates,
        raw.storageCandidates,
        raw.databaseCandidates,
        raw.networkCandidates
    ];
    const candidateCount = buckets.reduce((sum, bucket) => {
        if (Array.isArray(bucket)) {
            return sum + bucket.length;
        }
        return sum;
    }, 0);
    if (candidateCount > 0) {
        return Math.min(1, candidateCount / 8);
    }
    return 0.3;
};
const buildWarnings = (requirement, analyzerStrength) => {
    const warnings = [];
    if (!isPresent(requirement.region)) {
        warnings.push("Region is missing in extracted requirement.");
    }
    if (requirement.compute.length === 0) {
        warnings.push("Compute configuration is missing.");
    }
    else {
        const hasMissingComputeValues = requirement.compute.some((item) => !isPresent(item.vCPU) ||
            !isPresent(item.ramGB) ||
            !isPresent(item.quantity) ||
            !isPresent(item.osType));
        if (hasMissingComputeValues) {
            warnings.push("Some compute values are missing.");
        }
    }
    const hasMissingStorage = requirement.compute.some((item) => !isPresent(item.storageGB)) ||
        !isPresent(requirement.database.storageGB);
    if (hasMissingStorage) {
        warnings.push("Storage values are missing.");
    }
    if (!isPresent(requirement.network.dataEgressGB)) {
        warnings.push("Network egress value is missing.");
    }
    if (analyzerStrength < 0.4) {
        warnings.push("Analyzer classification strength is low.");
    }
    return warnings;
};
const evaluateMappingQuality = (requirement, input) => {
    const coverage = computeCoverageScore(requirement);
    const computePresence = computePresenceScore(requirement);
    const analyzerStrength = computeAnalyzerStrengthScore(input);
    const mappingConfidence = toConfidence(coverage * 0.55 + computePresence * 0.3 + analyzerStrength * 0.15);
    const warnings = buildWarnings(requirement, analyzerStrength);
    return {
        mappingConfidence,
        warnings
    };
};
exports.evaluateMappingQuality = evaluateMappingQuality;
