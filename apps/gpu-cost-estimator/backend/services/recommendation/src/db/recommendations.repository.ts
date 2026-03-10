import { RankedRecommendation, RecommendationBundle } from "@geo-nap/common";
import { pool } from "./postgres";

function rowToRecommendation(row: { result_json: unknown; rank: number | null }): RankedRecommendation {
  const value = row.result_json as RankedRecommendation;
  return {
    ...value,
    rank: row.rank ?? value.rank
  };
}

export async function saveRecommendationBundle(
  planId: string,
  batchId: string,
  bundle: RecommendationBundle
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const recommendation of bundle.rankedAlternatives) {
      await client.query(
        `
        INSERT INTO recommendations (
          batch_id,
          plan_id,
          rank,
          recommendation_type,
          provider,
          region,
          sku,
          result_json,
          created_at
        ) VALUES ($1, $2, $3, 'ranked', $4, $5, $6, $7::jsonb, NOW())
        `,
        [
          batchId,
          planId,
          recommendation.rank,
          recommendation.provider,
          recommendation.region,
          recommendation.sku,
          JSON.stringify(recommendation)
        ]
      );
    }

    const singles: Array<{ type: "cheapest" | "nearest" | "balanced"; value: RankedRecommendation | null }> = [
      { type: "cheapest", value: bundle.cheapestOption },
      { type: "nearest", value: bundle.nearestOption },
      { type: "balanced", value: bundle.balancedOption }
    ];

    for (const single of singles) {
      if (!single.value) {
        continue;
      }

      await client.query(
        `
        INSERT INTO recommendations (
          batch_id,
          plan_id,
          rank,
          recommendation_type,
          provider,
          region,
          sku,
          result_json,
          created_at
        ) VALUES ($1, $2, NULL, $3, $4, $5, $6, $7::jsonb, NOW())
        `,
        [
          batchId,
          planId,
          single.type,
          single.value.provider,
          single.value.region,
          single.value.sku,
          JSON.stringify(single.value)
        ]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updatePlanStatus(planId: string, status: "recommended" | "failed", error?: string): Promise<void> {
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

export async function getPlanResultLimit(planId: string, fallback: number): Promise<number> {
  const result = await pool.query(
    `
    SELECT COALESCE((request_json->>'result_limit')::INT, $2) AS result_limit
    FROM plan_requests
    WHERE id = $1
    `,
    [planId, fallback]
  );
  if ((result.rowCount ?? 0) === 0) {
    return fallback;
  }
  const value = Number(result.rows[0].result_limit);
  if (!Number.isFinite(value) || value < 1) {
    return fallback;
  }
  return Math.min(value, 20);
}

export async function getRecommendationBundleByPlanId(planId: string): Promise<RecommendationBundle | null> {
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
    return null;
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

  const bundle: RecommendationBundle = {
    rankedAlternatives: [],
    cheapestOption: null,
    nearestOption: null,
    balancedOption: null
  };

  for (const row of result.rows) {
    const recommendation = rowToRecommendation(row);
    if (row.recommendation_type === "ranked") {
      bundle.rankedAlternatives.push(recommendation);
    } else if (row.recommendation_type === "cheapest") {
      bundle.cheapestOption = recommendation;
    } else if (row.recommendation_type === "nearest") {
      bundle.nearestOption = recommendation;
    } else if (row.recommendation_type === "balanced") {
      bundle.balancedOption = recommendation;
    }
  }

  return bundle;
}
