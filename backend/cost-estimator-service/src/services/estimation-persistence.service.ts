import { ProviderCostResult } from "../domain/cost.model";
import prisma from "../db/prisma";

const derivePricingVersion = (results: ProviderCostResult[]): string => {
  const versions = Array.from(
    new Set(results.map((item) => item.pricingVersion).filter(Boolean))
  );
  if (versions.length === 0) {
    return "unknown";
  }
  return versions.join(",");
};

export const saveEstimationResult = async (input: {
  projectId: string;
  requirementJson: unknown;
  resultJson: ProviderCostResult[];
}): Promise<void> => {
  await prisma.estimation.create({
    data: {
      projectId: input.projectId,
      requirementJson: input.requirementJson as object,
      resultJson: input.resultJson as unknown as object,
      pricingVersion: derivePricingVersion(input.resultJson)
    }
  });
};
