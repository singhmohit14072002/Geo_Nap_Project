import { PlanRecord, PlanRequest, PlanStatus, RankedRecommendation } from "@geo-nap/common";
import { pool } from "./postgres";

export async function insertPlan(plan: PlanRecord): Promise<void> {
  await pool.query(
    `
    INSERT INTO plan_requests (
      id,
      request_json,
      status,
      error,
      created_at,
      updated_at
    ) VALUES ($1, $2::jsonb, $3, $4, $5, $6)
    `,
    [plan.id, JSON.stringify(plan.request), plan.status, plan.error ?? null, plan.createdAt, plan.updatedAt]
  );
}

export async function updatePlanStatus(planId: string, status: PlanStatus, error?: string): Promise<void> {
  await pool.query(
    `
    UPDATE plan_requests
    SET status = $2,
        error = $3,
        updated_at = NOW()
    WHERE id = $1
    `,
    [planId, status, error ?? null]
  );
}

export async function getPlanById(planId: string): Promise<PlanRecord | null> {
  const result = await pool.query(
    `
    SELECT id, request_json, status, error, created_at, updated_at
    FROM plan_requests
    WHERE id = $1
    `,
    [planId]
  );

  if ((result.rowCount ?? 0) === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    request: row.request_json as PlanRequest,
    status: row.status as PlanStatus,
    error: row.error ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

export async function getRecommendations(planId: string): Promise<{
  ranked: RankedRecommendation[];
  cheapest: RankedRecommendation | null;
  nearest: RankedRecommendation | null;
  balanced: RankedRecommendation | null;
  providerOptions: Record<string, RankedRecommendation[]>;
}> {
  const batchResult = await pool.query(
    `
    SELECT batch_id
    FROM recommendations
    WHERE plan_id = $1
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [planId]
  );

  if ((batchResult.rowCount ?? 0) === 0) {
    return {
      ranked: [],
      cheapest: null,
      nearest: null,
      balanced: null,
      providerOptions: {
        aws: [],
        azure: [],
        gcp: [],
        vast: []
      }
    };
  }

  const batchId = batchResult.rows[0].batch_id as string;
  const result = await pool.query(
    `
    SELECT recommendation_type, rank, result_json
    FROM recommendations
    WHERE plan_id = $1 AND batch_id = $2
    ORDER BY COALESCE(rank, 999999) ASC
    `,
    [planId, batchId]
  );

  const ranked: RankedRecommendation[] = [];
  let cheapest: RankedRecommendation | null = null;
  let nearest: RankedRecommendation | null = null;
  let balanced: RankedRecommendation | null = null;

  for (const row of result.rows) {
    const recommendation = {
      ...(row.result_json as RankedRecommendation),
      rank: row.rank ?? null
    } as RankedRecommendation;

    if (row.recommendation_type === "ranked") {
      ranked.push(recommendation);
    } else if (row.recommendation_type === "cheapest") {
      cheapest = recommendation;
    } else if (row.recommendation_type === "nearest") {
      nearest = recommendation;
    } else if (row.recommendation_type === "balanced") {
      balanced = recommendation;
    }
  }

  const providerOptions: Record<string, RankedRecommendation[]> = {
    aws: [],
    azure: [],
    gcp: [],
    vast: []
  };
  for (const rec of ranked) {
    if (!providerOptions[rec.provider]) {
      providerOptions[rec.provider] = [];
    }
    providerOptions[rec.provider].push(rec);
  }

  return {
    ranked,
    cheapest,
    nearest,
    balanced,
    providerOptions
  };
}
