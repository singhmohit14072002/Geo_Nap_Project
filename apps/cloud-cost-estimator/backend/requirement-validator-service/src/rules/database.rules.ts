import { RequirementCandidate } from "../schemas/requirement.schema";
import { ValidationIssue, ValidationRuleResult } from "../services/validator.types";

export interface ValidatedDatabase {
  engine: string;
  storageGB: number;
  ha: boolean;
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

export const validateDatabase = (
  requirement: RequirementCandidate
): ValidationRuleResult<ValidatedDatabase> => {
  const db = requirement.database;
  if (db == null) {
    return {
      normalized: null,
      issues: []
    };
  }

  const issues: ValidationIssue[] = [];
  const engine = typeof db.engine === "string" ? db.engine.trim() : "";
  const storageGB = toNumber(db.storageGB);
  const ha =
    typeof db.ha === "boolean"
      ? db.ha
      : null;

  if (!engine) {
    issues.push(
      issue(
        "DATABASE_ENGINE_MISSING",
        "database.engine",
        "Database engine is required when database object is provided.",
        "Which database engine should be used?"
      )
    );
  }

  if (storageGB == null || storageGB <= 0) {
    issues.push(
      issue(
        "DATABASE_STORAGE_INVALID",
        "database.storageGB",
        "Database storageGB is missing or must be greater than 0.",
        "What is the required database storage size (GB)?"
      )
    );
  }

  if (ha === null) {
    issues.push(
      issue(
        "DATABASE_HA_MISSING",
        "database.ha",
        "Database HA flag is missing.",
        "Is high availability required for the database (yes/no)?"
      )
    );
  }

  if (issues.length > 0) {
    return {
      normalized: null,
      issues
    };
  }

  return {
    normalized: {
      engine,
      storageGB: storageGB as number,
      ha: ha as boolean
    },
    issues: []
  };
};
