import prisma from "../db/prisma";

const derivePricingVersion = (results: unknown): string => {
  if (Array.isArray(results)) {
    const versions = Array.from(
      new Set(
        results
          .map((item) => (item && typeof item === "object" ? (item as any).pricingVersion : undefined))
          .filter(Boolean)
      )
    );
    if (versions.length === 0) {
      return "unknown";
    }
    return versions.join(",");
  }
  return "unknown";
};

export const saveEstimationResult = async (input: {
  projectId: string;
  requirementJson: unknown;
  resultJson: unknown;
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
