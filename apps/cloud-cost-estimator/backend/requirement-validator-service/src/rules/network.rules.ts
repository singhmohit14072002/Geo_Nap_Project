import { RequirementCandidate } from "../schemas/requirement.schema";
import { ValidationIssue, ValidationRuleResult } from "../services/validator.types";

export interface ValidatedNetwork {
  dataEgressGB: number;
}

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
};

const issue = (
  code: string,
  path: string,
  message: string,
  question: string
): ValidationIssue => ({
  code,
  path,
  message,
  question
});

export const validateNetwork = (
  requirement: RequirementCandidate
): ValidationRuleResult<ValidatedNetwork> => {
  const value = toNumber(requirement.network?.dataEgressGB);
  if (value == null) {
    return {
      normalized: null,
      issues: [
        issue(
          "NETWORK_EGRESS_MISSING",
          "network.dataEgressGB",
          "network.dataEgressGB is required.",
          "Estimated monthly outbound data (GB)?"
        )
      ]
    };
  }

  if (value < 0) {
    return {
      normalized: null,
      issues: [
        issue(
          "NETWORK_EGRESS_INVALID",
          "network.dataEgressGB",
          "network.dataEgressGB must be non-negative.",
          "Please provide a valid non-negative outbound data value (GB)."
        )
      ]
    };
  }

  if (value === 0) {
    return {
      normalized: null,
      issues: [
        issue(
          "NETWORK_EGRESS_ZERO",
          "network.dataEgressGB",
          "network.dataEgressGB is 0 and needs confirmation.",
          "Estimated monthly outbound data (GB) cannot be 0 for cost estimation. Please provide an expected value."
        )
      ]
    };
  }

  return {
    normalized: {
      dataEgressGB: value
    },
    issues: []
  };
};
