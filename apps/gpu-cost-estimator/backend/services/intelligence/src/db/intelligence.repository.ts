import {
  AvailabilityScore,
  CloudProvider,
  ProviderSimulationResult,
  ProviderSkuOffer,
  SimulationScenario
} from "@geo-nap/common";
import { pool } from "./postgres";

type SuccessfulResultRow = { result_json: ProviderSimulationResult };
type AvailabilityAggregateRow = {
  provider: CloudProvider;
  region: string;
  score: number | string;
  samples: number;
  last_observed_at: Date;
};
type LatestAvailabilityRow = {
  provider: CloudProvider;
  region: string;
  score: number | string;
  samples: number;
  calculated_at: Date;
};

export async function setPlanStatus(planId: string, status: string, error?: string): Promise<void> {
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

export async function createBatch(batchId: string, planId: string, expectedJobs: number): Promise<void> {
  await pool.query(
    `
    INSERT INTO simulation_batches (batch_id, plan_id, expected_jobs, created_at)
    VALUES ($1, $2, $3, NOW())
    `,
    [batchId, planId, expectedJobs]
  );
}

export async function hasOpenBatch(planId: string): Promise<boolean> {
  const result = await pool.query(
    `
    SELECT batch_id
    FROM simulation_batches
    WHERE plan_id = $1
      AND completion_published = FALSE
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [planId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function insertPricingSnapshots(batchId: string, planId: string, offers: ProviderSkuOffer[]): Promise<void> {
  if (offers.length === 0) {
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const offer of offers) {
      await client.query(
        `
        INSERT INTO pricing_snapshots (batch_id, plan_id, provider, region, sku, offer_json, created_at)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
        `,
        [batchId, planId, offer.provider, offer.region, offer.sku, JSON.stringify(offer)]
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

export async function insertSimulationResult(
  batchId: string,
  planId: string,
  scenario: SimulationScenario,
  result: ProviderSimulationResult,
  observedAt: string
): Promise<void> {
  const inserted = await pool.query(
    `
    INSERT INTO simulation_results (
      batch_id,
      plan_id,
      scenario_id,
      provider,
      region,
      sku,
      status,
      result_json,
      error,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, 'result', $7::jsonb, NULL, $8)
    ON CONFLICT (batch_id, scenario_id) DO NOTHING
    `,
    [batchId, planId, scenario.scenarioId, scenario.provider, scenario.region, scenario.sku, JSON.stringify(result), observedAt]
  );

  if ((inserted.rowCount ?? 0) === 0) {
    return;
  }

  await pool.query(
    `
    INSERT INTO sku_availability_history (
      batch_id,
      plan_id,
      scenario_id,
      provider,
      region,
      sku,
      available,
      reason,
      observed_at
    ) VALUES ($1, $2, $3, $4, $5, $6, TRUE, NULL, $7)
    ON CONFLICT (batch_id, scenario_id) DO NOTHING
    `,
    [batchId, planId, scenario.scenarioId, scenario.provider, scenario.region, scenario.sku, observedAt]
  );
}

export async function insertSimulationFailure(
  batchId: string,
  planId: string,
  scenario: SimulationScenario,
  error: string,
  observedAt: string
): Promise<void> {
  const inserted = await pool.query(
    `
    INSERT INTO simulation_results (
      batch_id,
      plan_id,
      scenario_id,
      provider,
      region,
      sku,
      status,
      result_json,
      error,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, 'failed', NULL, $7, $8)
    ON CONFLICT (batch_id, scenario_id) DO NOTHING
    `,
    [batchId, planId, scenario.scenarioId, scenario.provider, scenario.region, scenario.sku, error, observedAt]
  );

  if ((inserted.rowCount ?? 0) === 0) {
    return;
  }

  await pool.query(
    `
    INSERT INTO sku_availability_history (
      batch_id,
      plan_id,
      scenario_id,
      provider,
      region,
      sku,
      available,
      reason,
      observed_at
    ) VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7, $8)
    ON CONFLICT (batch_id, scenario_id) DO NOTHING
    `,
    [batchId, planId, scenario.scenarioId, scenario.provider, scenario.region, scenario.sku, error, observedAt]
  );
}

export async function getBatchProgress(batchId: string): Promise<{ expected: number; received: number }> {
  const expectedResult = await pool.query(
    `
    SELECT expected_jobs
    FROM simulation_batches
    WHERE batch_id = $1
    `,
    [batchId]
  );

  if ((expectedResult.rowCount ?? 0) === 0) {
    return { expected: 0, received: 0 };
  }

  const expected = expectedResult.rows[0].expected_jobs as number;
  const receivedResult = await pool.query(
    `
    SELECT COUNT(*)::INT AS cnt
    FROM simulation_results
    WHERE batch_id = $1
    `,
    [batchId]
  );

  return {
    expected,
    received: receivedResult.rows[0].cnt as number
  };
}

export async function lockBatchCompletion(batchId: string): Promise<boolean> {
  const result = await pool.query(
    `
    UPDATE simulation_batches
    SET completion_published = TRUE,
        completed_at = NOW()
    WHERE batch_id = $1
      AND completion_published = FALSE
    RETURNING batch_id
    `,
    [batchId]
  );

  return (result.rowCount ?? 0) > 0;
}

export async function getSuccessfulResults(batchId: string): Promise<ProviderSimulationResult[]> {
  const result = await pool.query(
    `
    SELECT result_json
    FROM simulation_results
    WHERE batch_id = $1
      AND status = 'result'
    ORDER BY created_at ASC
    `,
    [batchId]
  );

  const rows = result.rows as SuccessfulResultRow[];
  return rows.map((row: SuccessfulResultRow) => row.result_json);
}

export async function computeAndStoreAvailabilityScores(
  batchId: string,
  window: number
): Promise<AvailabilityScore[]> {
  const scoresResult = await pool.query(
    `
    WITH touched AS (
      SELECT DISTINCT provider, region
      FROM sku_availability_history
      WHERE batch_id = $1
    ), ranked AS (
      SELECT
        h.provider,
        h.region,
        h.available,
        h.observed_at,
        ROW_NUMBER() OVER (
          PARTITION BY h.provider, h.region
          ORDER BY h.observed_at DESC, h.id DESC
        ) AS rn
      FROM sku_availability_history h
      INNER JOIN touched t
        ON h.provider = t.provider
       AND h.region = t.region
    )
    SELECT
      provider,
      region,
      AVG(CASE WHEN available THEN 1.0 ELSE 0.0 END)::FLOAT AS score,
      COUNT(*)::INT AS samples,
      MAX(observed_at) AS last_observed_at
    FROM ranked
    WHERE rn <= $2
    GROUP BY provider, region
    `,
    [batchId, window]
  );

  const rows = scoresResult.rows as AvailabilityAggregateRow[];
  const scores: AvailabilityScore[] = rows.map((row: AvailabilityAggregateRow) => ({
    provider: row.provider,
    region: row.region,
    score: Number(row.score),
    samples: row.samples,
    lastObservedAt: row.last_observed_at.toISOString()
  }));

  for (const score of scores) {
    await pool.query(
      `
      INSERT INTO availability_score_snapshots (
        batch_id,
        provider,
        region,
        score,
        samples,
        calculated_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      `,
      [batchId, score.provider, score.region, score.score, score.samples]
    );
  }

  return scores;
}

export async function listLatestAvailability(provider?: string, region?: string): Promise<AvailabilityScore[]> {
  const values: unknown[] = [];
  let where = "";

  if (provider) {
    values.push(provider);
    where += `provider = $${values.length}`;
  }
  if (region) {
    values.push(region);
    where += where ? ` AND region = $${values.length}` : `region = $${values.length}`;
  }

  const query = `
    WITH latest AS (
      SELECT DISTINCT ON (provider, region)
        provider,
        region,
        score,
        samples,
        calculated_at
      FROM availability_score_snapshots
      ${where ? `WHERE ${where}` : ""}
      ORDER BY provider, region, calculated_at DESC, id DESC
    )
    SELECT provider, region, score, samples, calculated_at
    FROM latest
    ORDER BY provider, region
  `;

  const result = await pool.query(query, values);
  const rows = result.rows as LatestAvailabilityRow[];
  return rows.map((row: LatestAvailabilityRow) => ({
    provider: row.provider,
    region: row.region,
    score: Number(row.score),
    samples: row.samples,
    lastObservedAt: row.calculated_at.toISOString()
  }));
}
