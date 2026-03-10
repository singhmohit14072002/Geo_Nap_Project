import {
  ExtractionCandidate,
  ExtractionClarificationPatch
} from "../schemas/extraction.schema";

const mergeCompute = (
  base: ExtractionCandidate["compute"],
  patch: ExtractionClarificationPatch["compute"]
): ExtractionCandidate["compute"] => {
  const baseItems = base ?? [];
  const patchItems = patch ?? [];
  const maxLen = Math.max(baseItems.length, patchItems.length);

  if (maxLen === 0) {
    return undefined;
  }

  return Array.from({ length: maxLen }, (_, idx) => ({
    ...(baseItems[idx] ?? {}),
    ...(patchItems[idx] ?? {})
  }));
};

export const applyClarifications = (
  candidate: ExtractionCandidate,
  clarifications: ExtractionClarificationPatch
): ExtractionCandidate => {
  const merged: ExtractionCandidate = {
    ...candidate
  };

  if ("region" in clarifications) {
    merged.region = clarifications.region;
  }

  if ("compute" in clarifications) {
    merged.compute = mergeCompute(candidate.compute, clarifications.compute);
  }

  if ("database" in clarifications) {
    merged.database = {
      ...(candidate.database ?? {}),
      ...(clarifications.database ?? {})
    };
  }

  if ("network" in clarifications) {
    merged.network = {
      ...(candidate.network ?? {}),
      ...(clarifications.network ?? {})
    };
  }

  return merged;
};
