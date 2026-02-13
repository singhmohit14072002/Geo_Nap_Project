CREATE TABLE IF NOT EXISTS plan_requests (
  id UUID PRIMARY KEY,
  request_json JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'coordinating', 'simulating', 'recommended', 'failed')),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS simulation_batches (
  batch_id UUID PRIMARY KEY,
  plan_id UUID NOT NULL REFERENCES plan_requests(id) ON DELETE CASCADE,
  expected_jobs INT NOT NULL CHECK (expected_jobs >= 0),
  completion_published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_simulation_batches_plan_id ON simulation_batches(plan_id);

CREATE TABLE IF NOT EXISTS pricing_snapshots (
  id BIGSERIAL PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES simulation_batches(batch_id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plan_requests(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  region TEXT NOT NULL,
  sku TEXT NOT NULL,
  offer_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pricing_snapshots_plan_id ON pricing_snapshots(plan_id);
CREATE INDEX IF NOT EXISTS idx_pricing_snapshots_provider_region ON pricing_snapshots(provider, region);

CREATE TABLE IF NOT EXISTS simulation_results (
  id BIGSERIAL PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES simulation_batches(batch_id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plan_requests(id) ON DELETE CASCADE,
  scenario_id UUID NOT NULL,
  provider TEXT NOT NULL,
  region TEXT NOT NULL,
  sku TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('result', 'failed')),
  result_json JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_simulation_results_plan_batch ON simulation_results(plan_id, batch_id);
CREATE INDEX IF NOT EXISTS idx_simulation_results_provider_region ON simulation_results(provider, region);
CREATE INDEX IF NOT EXISTS idx_simulation_results_created_at ON simulation_results(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_simulation_results_batch_scenario ON simulation_results(batch_id, scenario_id);

CREATE TABLE IF NOT EXISTS sku_availability_history (
  id BIGSERIAL PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES simulation_batches(batch_id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plan_requests(id) ON DELETE CASCADE,
  scenario_id UUID NOT NULL,
  provider TEXT NOT NULL,
  region TEXT NOT NULL,
  sku TEXT NOT NULL,
  available BOOLEAN NOT NULL,
  reason TEXT,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_availability_provider_region ON sku_availability_history(provider, region, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_availability_plan_batch ON sku_availability_history(plan_id, batch_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_availability_batch_scenario ON sku_availability_history(batch_id, scenario_id);

CREATE TABLE IF NOT EXISTS availability_score_snapshots (
  id BIGSERIAL PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES simulation_batches(batch_id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  region TEXT NOT NULL,
  score NUMERIC(5,4) NOT NULL CHECK (score >= 0 AND score <= 1),
  samples INT NOT NULL CHECK (samples >= 0),
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_availability_score_provider_region ON availability_score_snapshots(provider, region, calculated_at DESC);

CREATE TABLE IF NOT EXISTS recommendations (
  id BIGSERIAL PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES simulation_batches(batch_id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plan_requests(id) ON DELETE CASCADE,
  rank INT,
  recommendation_type TEXT NOT NULL CHECK (recommendation_type IN ('ranked', 'cheapest', 'nearest', 'balanced')),
  provider TEXT NOT NULL,
  region TEXT NOT NULL,
  sku TEXT NOT NULL,
  result_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recommendations_plan_batch ON recommendations(plan_id, batch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recommendations_type ON recommendations(recommendation_type, created_at DESC);
