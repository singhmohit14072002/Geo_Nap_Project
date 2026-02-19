"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateEstimationExplanation = void 0;
const formatInr = (value) => `${value.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: value % 1 === 0 ? 0 : 2
})} INR`;
const buildComputeReasoning = (result) => {
    const computeItems = result.details.filter((item) => item.serviceType.toLowerCase().includes("compute"));
    if (computeItems.length === 0) {
        return `No compute line item was provided for ${result.provider.toUpperCase()} in ${result.region}.`;
    }
    const lines = computeItems.map((item) => {
        const unit = item.unitPrice != null ? `${formatInr(item.unitPrice)} per unit` : "unit price unavailable";
        const sku = item.sku ? ` using ${item.sku}` : "";
        return `${item.quantity}x ${item.name}${sku} at ${unit}, contributing ${formatInr(item.monthlyCost)} monthly.`;
    });
    return [
        `Instance selection for ${result.provider.toUpperCase()} (${result.region}) is based on the compute entries in the estimation output.`,
        ...lines
    ].join(" ");
};
const buildCostBreakdownSummary = (result) => {
    const entries = [
        { label: "Compute", value: result.breakdown.compute },
        { label: "Storage", value: result.breakdown.storage },
        { label: "Database", value: result.breakdown.database },
        { label: "Network egress", value: result.breakdown.networkEgress },
        { label: "Backup", value: result.breakdown.backup },
        { label: "Other", value: result.breakdown.other }
    ];
    const nonZero = entries.filter((entry) => entry.value > 0);
    const ranked = (nonZero.length > 0 ? nonZero : entries)
        .sort((a, b) => b.value - a.value)
        .map((entry) => `${entry.label}: ${formatInr(entry.value)}`);
    return `Total monthly estimate is ${formatInr(result.summary.monthlyTotal)}, yearly estimate is ${formatInr(result.summary.yearlyTotal)}. Cost composition by component -> ${ranked.join(" | ")}.`;
};
const buildAssumptions = (result) => {
    const assumptions = [
        `Pricing version used: ${result.pricingVersion}.`,
        `Currency: ${result.summary.currency}.`,
        `Region evaluated: ${result.region}.`,
        `Estimation timestamp: ${result.calculatedAt}.`
    ];
    const computeRows = result.details.filter((item) => item.serviceType.toLowerCase().includes("compute"));
    if (computeRows.length > 0) {
        assumptions.push(`Compute cost is derived from ${computeRows.length} compute line item(s) present in provider pricing details.`);
    }
    const networkRow = result.details.find((item) => item.serviceType.toLowerCase().includes("network"));
    if (networkRow) {
        assumptions.push(`Network egress uses provider-reported usage line item "${networkRow.name}" with monthly cost ${formatInr(networkRow.monthlyCost)}.`);
    }
    return assumptions;
};
const buildOptimizationExplanation = (result) => {
    const recommendations = result.optimization?.recommendations ?? [];
    if (recommendations.length === 0) {
        return [
            "No optimization recommendation was generated from the current pricing result."
        ];
    }
    return recommendations.map((item) => `${item.type}: ${item.message} Estimated monthly savings: ${formatInr(item.estimatedMonthlySavings)}.`);
};
const generateEstimationExplanation = (result) => {
    return {
        computeReasoning: buildComputeReasoning(result),
        costBreakdownSummary: buildCostBreakdownSummary(result),
        assumptions: buildAssumptions(result),
        optimizationExplanation: buildOptimizationExplanation(result)
    };
};
exports.generateEstimationExplanation = generateEstimationExplanation;
