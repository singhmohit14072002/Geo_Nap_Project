import { EstimationExplanation, ProviderCostResult } from "../domain/cost.model";

const formatInr = (value: number): string =>
  `${value.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: value % 1 === 0 ? 0 : 2
  })} INR`;

const buildComputeReasoning = (result: ProviderCostResult): string => {
  const computeItems = result.details.filter((item) =>
    item.serviceType.toLowerCase().includes("compute")
  );

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

const buildCostBreakdownSummary = (result: ProviderCostResult): string => {
  const entries: Array<{ label: string; value: number }> = [
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

  return `Total monthly estimate is ${formatInr(
    result.summary.monthlyTotal
  )}, yearly estimate is ${formatInr(
    result.summary.yearlyTotal
  )}. Cost composition by component -> ${ranked.join(" | ")}.`;
};

const buildAssumptions = (result: ProviderCostResult): string[] => {
  const assumptions: string[] = [
    `Pricing version used: ${result.pricingVersion}.`,
    `Currency: ${result.summary.currency}.`,
    `Region evaluated: ${result.region}.`,
    `Estimation timestamp: ${result.calculatedAt}.`
  ];

  const computeRows = result.details.filter((item) =>
    item.serviceType.toLowerCase().includes("compute")
  );
  if (computeRows.length > 0) {
    assumptions.push(
      `Compute cost is derived from ${computeRows.length} compute line item(s) present in provider pricing details.`
    );
  }

  const networkRow = result.details.find((item) =>
    item.serviceType.toLowerCase().includes("network")
  );
  if (networkRow) {
    assumptions.push(
      `Network egress uses provider-reported usage line item "${networkRow.name}" with monthly cost ${formatInr(
        networkRow.monthlyCost
      )}.`
    );
  }

  return assumptions;
};

const buildOptimizationExplanation = (
  result: ProviderCostResult
): string[] => {
  const recommendations = result.optimization?.recommendations ?? [];
  if (recommendations.length === 0) {
    return [
      "No optimization recommendation was generated from the current pricing result."
    ];
  }

  return recommendations.map(
    (item) =>
      `${item.type}: ${item.message} Estimated monthly savings: ${formatInr(
        item.estimatedMonthlySavings
      )}.`
  );
};

export const generateEstimationExplanation = (
  result: ProviderCostResult
): EstimationExplanation => {
  return {
    computeReasoning: buildComputeReasoning(result),
    costBreakdownSummary: buildCostBreakdownSummary(result),
    assumptions: buildAssumptions(result),
    optimizationExplanation: buildOptimizationExplanation(result)
  };
};

