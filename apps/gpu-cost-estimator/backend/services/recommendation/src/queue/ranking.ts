import {
  AvailabilityScore,
  ProviderSimulationResult,
  RankedRecommendation,
  RecommendationBundle
} from "@geo-nap/common";

function normalize(value: number, min: number, max: number): number {
  if (max <= min) {
    return 0;
  }
  return (value - min) / (max - min);
}

function availabilityScoreFor(result: ProviderSimulationResult, availability: AvailabilityScore[]): number {
  const match = availability.find(
    (item) => item.provider === result.provider && item.region.toLowerCase() === result.region.toLowerCase()
  );
  if (!match) {
    return 0.5;
  }
  return Math.max(0, Math.min(1, match.score));
}

function toRecommendation(
  result: ProviderSimulationResult,
  rank: number,
  availabilityScore: number,
  blendedScore: number
): RankedRecommendation {
  const availabilityPenalty = 1 - availabilityScore;
  return {
    ...result,
    rank,
    availabilityScore,
    availabilityPenalty,
    blendedScore
  };
}

export function rankRecommendations(
  results: ProviderSimulationResult[],
  availability: AvailabilityScore[],
  limit: number
): RecommendationBundle {
  if (results.length === 0) {
    return {
      rankedAlternatives: [],
      cheapestOption: null,
      nearestOption: null,
      balancedOption: null
    };
  }

  const costValues = results.map((item) => item.totalCost);
  const distanceValues = results.map((item) => item.distanceKm);
  const transferValues = results.map((item) => item.egressCost + item.bandwidthCost);

  const minCost = Math.min(...costValues);
  const maxCost = Math.max(...costValues);
  const minDistance = Math.min(...distanceValues);
  const maxDistance = Math.max(...distanceValues);
  const minTransfer = Math.min(...transferValues);
  const maxTransfer = Math.max(...transferValues);

  const enriched = results.map((item) => {
    const availabilityScore = availabilityScoreFor(item, availability);
    const availabilityPenalty = 1 - availabilityScore;
    const blendedScore =
      0.6 * normalize(item.totalCost, minCost, maxCost) +
      0.2 * normalize(item.egressCost + item.bandwidthCost, minTransfer, maxTransfer) +
      0.1 * normalize(item.distanceKm, minDistance, maxDistance) +
      0.1 * availabilityPenalty;

    return {
      item,
      availabilityScore,
      availabilityPenalty,
      blendedScore
    };
  });

  const sorted = [...enriched].sort((a, b) => {
    if (a.item.totalCost !== b.item.totalCost) {
      return a.item.totalCost - b.item.totalCost;
    }
    if (a.availabilityPenalty !== b.availabilityPenalty) {
      return a.availabilityPenalty - b.availabilityPenalty;
    }
    if (a.item.distanceKm !== b.item.distanceKm) {
      return a.item.distanceKm - b.item.distanceKm;
    }

    const aTransfer = a.item.egressCost + a.item.bandwidthCost;
    const bTransfer = b.item.egressCost + b.item.bandwidthCost;
    return aTransfer - bTransfer;
  });

  // Ensure provider coverage in ranked output when valid options exist.
  const bestByProvider = new Map<string, (typeof sorted)[number]>();
  for (const entry of sorted) {
    if (!bestByProvider.has(entry.item.provider)) {
      bestByProvider.set(entry.item.provider, entry);
    }
  }

  const providerCoverage = [...bestByProvider.values()].sort((a, b) => {
    if (a.item.totalCost !== b.item.totalCost) {
      return a.item.totalCost - b.item.totalCost;
    }
    return a.item.distanceKm - b.item.distanceKm;
  });

  const selected = new Map<string, (typeof sorted)[number]>();
  for (const entry of providerCoverage) {
    selected.set(entry.item.scenarioId, entry);
  }

  for (const entry of sorted) {
    if (selected.size >= Math.max(limit, providerCoverage.length)) {
      break;
    }
    if (!selected.has(entry.item.scenarioId)) {
      selected.set(entry.item.scenarioId, entry);
    }
  }

  const rankedAlternatives = [...selected.values()]
    .sort((a, b) => {
      if (a.item.totalCost !== b.item.totalCost) {
        return a.item.totalCost - b.item.totalCost;
      }
      if (a.availabilityPenalty !== b.availabilityPenalty) {
        return a.availabilityPenalty - b.availabilityPenalty;
      }
      return a.item.distanceKm - b.item.distanceKm;
    })
    .map((entry, idx) => {
    return toRecommendation(entry.item, idx + 1, entry.availabilityScore, entry.blendedScore);
  });

  const cheapest = [...enriched].sort((a, b) => a.item.totalCost - b.item.totalCost)[0];
  const nearest = [...enriched].sort((a, b) => a.item.distanceKm - b.item.distanceKm)[0];
  const balanced = [...enriched].sort((a, b) => a.blendedScore - b.blendedScore)[0];

  return {
    rankedAlternatives,
    cheapestOption: cheapest
      ? toRecommendation(cheapest.item, 1, cheapest.availabilityScore, cheapest.blendedScore)
      : null,
    nearestOption: nearest
      ? toRecommendation(nearest.item, 1, nearest.availabilityScore, nearest.blendedScore)
      : null,
    balancedOption: balanced
      ? toRecommendation(balanced.item, 1, balanced.availabilityScore, balanced.blendedScore)
      : null
  };
}
