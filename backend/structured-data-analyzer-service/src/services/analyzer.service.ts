import { analyzeRequestSchema } from "../schemas/analyzer.schema";
import { computeScore } from "../rules/compute.rules";
import { databaseScore } from "../rules/database.rules";
import { networkScore } from "../rules/network.rules";
import { storageScore } from "../rules/storage.rules";
import { HttpError } from "../utils/http-error";
import { toSearchText } from "../utils/keyword-matcher";
import logger from "../utils/logger";

interface CandidateItem {
  row: Record<string, unknown>;
  score: number;
  matchedKeywords: string[];
}

export interface AnalyzeResponse {
  computeCandidates: CandidateItem[];
  storageCandidates: CandidateItem[];
  databaseCandidates: CandidateItem[];
  networkCandidates: CandidateItem[];
  stats: {
    totalRows: number;
    classifiedRows: number;
    discardedRows: number;
  };
}

type BucketName = "compute" | "storage" | "database" | "network";

interface BucketScore {
  name: BucketName;
  score: number;
  matched: string[];
}

const isScalar = (value: unknown): boolean =>
  value == null ||
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean";

const collectRows = (
  input: unknown,
  rows: Record<string, unknown>[]
): void => {
  if (Array.isArray(input)) {
    for (const item of input) {
      collectRows(item, rows);
    }
    return;
  }

  if (!input || typeof input !== "object") {
    return;
  }

  const obj = input as Record<string, unknown>;
  const values = Object.values(obj);
  const scalarCount = values.filter(isScalar).length;
  const hasNested = values.some(
    (value) => typeof value === "object" && value !== null
  );

  if (scalarCount > 0 && (scalarCount >= 2 || !hasNested)) {
    rows.push(obj);
  }

  for (const value of values) {
    if (typeof value === "object" && value !== null) {
      collectRows(value, rows);
    }
  }
};

const dedupeRows = (rows: Record<string, unknown>[]): Record<string, unknown>[] => {
  const seen = new Set<string>();
  const deduped: Record<string, unknown>[] = [];

  for (const row of rows) {
    const key = JSON.stringify(row);
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(row);
    }
  }
  return deduped;
};

const classifyRow = (row: Record<string, unknown>): BucketScore[] => {
  const text = toSearchText(row);
  const compute = computeScore(text);
  const storage = storageScore(text);
  const database = databaseScore(text);
  const network = networkScore(text);

  return [
    { name: "compute", score: compute.score, matched: compute.matched },
    { name: "storage", score: storage.score, matched: storage.matched },
    { name: "database", score: database.score, matched: database.matched },
    { name: "network", score: network.score, matched: network.matched }
  ];
};

export const analyzeStructuredData = (payload: unknown): AnalyzeResponse => {
  const parsed = analyzeRequestSchema.safeParse(payload);
  if (!parsed.success) {
    throw new HttpError(422, "Analyze request validation failed", parsed.error.flatten());
  }

  const collected: Record<string, unknown>[] = [];
  collectRows(parsed.data.rawInfrastructureData, collected);
  const rows = dedupeRows(collected);

  const computeCandidates: CandidateItem[] = [];
  const storageCandidates: CandidateItem[] = [];
  const databaseCandidates: CandidateItem[] = [];
  const networkCandidates: CandidateItem[] = [];

  let classifiedRows = 0;

  for (const row of rows) {
    const scored = classifyRow(row);
    const maxScore = Math.max(...scored.map((item) => item.score));
    if (maxScore <= 0) {
      continue;
    }

    classifiedRows += 1;
    const top = scored.filter((item) => item.score === maxScore);
    for (const winner of top) {
      const candidate: CandidateItem = {
        row,
        score: winner.score,
        matchedKeywords: winner.matched
      };
      if (winner.name === "compute") {
        computeCandidates.push(candidate);
      } else if (winner.name === "storage") {
        storageCandidates.push(candidate);
      } else if (winner.name === "database") {
        databaseCandidates.push(candidate);
      } else if (winner.name === "network") {
        networkCandidates.push(candidate);
      }
    }
  }

  logger.info("STRUCTURED_ANALYSIS_COMPLETED", {
    totalRows: rows.length,
    classifiedRows,
    discardedRows: rows.length - classifiedRows,
    counts: {
      compute: computeCandidates.length,
      storage: storageCandidates.length,
      database: databaseCandidates.length,
      network: networkCandidates.length
    }
  });

  return {
    computeCandidates,
    storageCandidates,
    databaseCandidates,
    networkCandidates,
    stats: {
      totalRows: rows.length,
      classifiedRows,
      discardedRows: rows.length - classifiedRows
    }
  };
};

