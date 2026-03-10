import { RequirementCandidate } from "../schemas/requirement.schema";

export interface ValidationIssue {
  code: string;
  path: string;
  message: string;
  question: string;
}

export interface ValidationRuleResult<T> {
  normalized: T | null;
  issues: ValidationIssue[];
}

export interface ParsedCandidate {
  requirement: RequirementCandidate;
}
