import {
  validateRequestSchema,
  validatedRequirementSchema,
  ValidatedRequirement
} from "../schemas/requirement.schema";
import { validateCompute } from "../rules/compute.rules";
import { validateDatabase } from "../rules/database.rules";
import { validateNetwork } from "../rules/network.rules";
import { HttpError } from "../utils/http-error";
import { ValidationIssue } from "./validator.types";
import logger from "../utils/logger";

export interface ValidationSuccessResponse {
  status: "VALID";
  validatedRequirement: ValidatedRequirement;
}

export interface ValidationClarificationResponse {
  status: "NEEDS_CLARIFICATION";
  questions: string[];
  issues: Array<{
    code: string;
    path: string;
    message: string;
  }>;
}

export type ValidationResponse =
  | ValidationSuccessResponse
  | ValidationClarificationResponse;

const uniqueQuestions = (issues: ValidationIssue[]): string[] => {
  return Array.from(new Set(issues.map((item) => item.question))).filter(Boolean);
};

const toIssuesPayload = (issues: ValidationIssue[]) => {
  return issues.map((item) => ({
    code: item.code,
    path: item.path,
    message: item.message
  }));
};

const resolveRegion = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const regionIssue = (): ValidationIssue => ({
  code: "REGION_MISSING",
  path: "region",
  message: "Deployment region is required.",
  question: "Which deployment region should be used?"
});

export const validateRequirementPayload = (
  payload: unknown
): ValidationResponse => {
  const parsed = validateRequestSchema.safeParse(payload);
  if (!parsed.success) {
    throw new HttpError(422, "Validation payload schema failed", parsed.error.flatten());
  }

  const requirement = "requirement" in parsed.data
    ? parsed.data.requirement
    : parsed.data;

  const issues: ValidationIssue[] = [];
  const computeResult = validateCompute(requirement);
  const databaseResult = validateDatabase(requirement);
  const networkResult = validateNetwork(requirement);

  issues.push(...computeResult.issues);
  issues.push(...databaseResult.issues);
  issues.push(...networkResult.issues);

  const region = resolveRegion(requirement.region);
  if (!region) {
    issues.push(regionIssue());
  }

  if (issues.length > 0) {
    logger.info("VALIDATION_NEEDS_CLARIFICATION", {
      issueCount: issues.length
    });
    return {
      status: "NEEDS_CLARIFICATION",
      questions: uniqueQuestions(issues),
      issues: toIssuesPayload(issues)
    };
  }

  const validatedRequirement: ValidatedRequirement = {
    compute: computeResult.normalized!,
    database: databaseResult.normalized,
    network: networkResult.normalized!,
    region: region!
  };

  const strict = validatedRequirementSchema.safeParse(validatedRequirement);
  if (!strict.success) {
    throw new HttpError(
      422,
      "Validated requirement failed strict schema check",
      strict.error.flatten()
    );
  }

  logger.info("VALIDATION_SUCCESS", {
    computeItems: strict.data.compute.length
  });
  return {
    status: "VALID",
    validatedRequirement: strict.data
  };
};
