# Geo-NAP Platform

Geo-NAP is a production-grade microservice backend for deterministic multi-cloud GPU placement with an intelligence orchestration layer.

## Core Principle

Geo-NAP has two strict layers:

1. Deterministic Layer (immutable calculation layer)
- Pricing catalogs
- Cost formulas
- Egress and bandwidth calculations
- GPU SKU eligibility rules

2. Intelligence Layer (coordination and ranking layer)
- Historical data capture
- Multi-scenario orchestration
- Availability scoring
- Deterministic recommendation ranking

The Intelligence Layer never mutates pricing formulas.

## Service Boundaries

### Planner Service (`services/planner`)
- Accepts requests (`POST /v1/plans`)
- Validates request contract and parity mode
- Persists plan records
- Publishes `plan.created`
- Exposes plan status + recommendation bundle (`GET /v1/plans/:planId`)

### Pricing Service (`services/pricing`)
- Owns PAYG pricing catalogs
- Filters to GPU-eligible SKUs via provider adapters
- Computes deterministic costs only
- Exposes offers and deterministic estimate APIs
- Uses Redis cache for repeated estimate payloads

### Requirement Normalizer Service (`services/requirement-normalizer`)
- Validates multi-cloud data source requirement payloads using Zod
- Normalizes cloud provider and region inputs
- Captures storage object details and network egress metadata
- Produces a pricing-ready `pricingContext` for downstream pricing-engine integration

### Simulation Service (`services/simulation`)
- Worker-only service
- Consumes `simulation.requested`
- Calls pricing service for deterministic scenario evaluation
- Emits `simulation.result` or `simulation.result.failed`

### Intelligence Service (`services/intelligence`)
- Consumes `plan.created`, `simulation.result`, `simulation.result.failed`
- Builds simulation scenarios from current pricing offers
- Stores pricing snapshots (append-only)
- Stores simulation outcomes (append-only)
- Stores SKU availability history (append-only)
- Computes and snapshots availability score by region
- Publishes `simulation.completed` or `simulation.failed`
- Exposes availability APIs

### Recommendation Service (`services/recommendation`)
- Consumes simulation completion events
- Produces ranked alternatives + cheapest + nearest + balanced selections
- Persists recommendations append-only
- Updates plan status to `recommended` / `failed`
- Exposes recommendation query API

### Shared Packages

#### `packages/common`
- Event contracts, DTO schemas, domain types
- Common logger and error payload utilities
- Future ML module interface ports (no ML implementation)

#### `packages/provider-adapters`
- AWS: GPU families `P*`, `G*`
- Azure: `NC*`, `ND*`, `NV*`
- GCP: `A2*`, `A3*`, `G2*`, GPU-enabled `N1*`
- Rejects CPU-only SKUs deterministically

## Microservice Event Flow

RabbitMQ topic exchange: `geo_nap.events`

1. Planner -> `plan.created`
2. Intelligence -> creates batch + scenarios -> publishes `simulation.requested` (one per scenario)
3. Simulation workers -> `simulation.result` / `simulation.result.failed`
4. Intelligence -> aggregates when batch complete -> `simulation.completed` (or `simulation.failed`)
5. Recommendation -> ranks + persists results

## Historical Storage (PostgreSQL, append-only)

Tables:
- `pricing_snapshots`
- `simulation_results`
- `sku_availability_history`
- `availability_score_snapshots`
- `recommendations`

Control tables:
- `plan_requests`
- `simulation_batches`

SQL: `infra/postgres/init.sql`

## Deterministic Cost Logic (Pricing Service)

For each GPU-capable offer:

- `instances_required = ceil(gpu_count / gpuCountPerVm)`
- Reject if `ramGbPerVm < ram_requirement`
- Reject if `gpu_count > maxInstances * gpuCountPerVm`

Cost:
- `compute_cost = machinePricePerHourUsd * instances_required * duration_hours`
- `egress_cost = egressUsdPerGb * dataset_size_gb`
- `bandwidth_cost = bandwidthUsdPerGb * dataset_size_gb`
- `total_cost = compute_cost + egress_cost + bandwidth_cost`
- Transfer-rate lookup is strict. If a source/destination mapping is missing in `services/pricing/src/data/transfer-rates.json`, the offer is excluded.

Important calculator-parity rule:
- GPU VM machine price already includes GPU, CPU, and RAM.
- RAM is only used as an eligibility filter and is not a separate billed line item.
- Geo-NAP uses PAYG pricing only and excludes spot/preemptible/low-priority SKUs.

Parity mode constraints:
- No RTT penalty
- No synthetic bandwidth penalty multiplier
- No inter-provider all-reduce cost
- No stochastic adjustments

## Recommendation Logic (Deterministic + Explainable)

Recommendation service consumes:
- deterministic simulation outputs
- availability scores from intelligence layer

Ranking factors:
1. `total_cost` (primary)
2. availability penalty (`1 - availability_score`)
3. `distance_km`
4. transfer cost (`egress_cost + bandwidth_cost`)

Balanced option:
- Deterministic blended score:
  - `0.6 * normalized(total_cost)`
  - `0.2 * normalized(transfer_cost)`
  - `0.1 * normalized(distance_km)`
  - `0.1 * availability_penalty`

Outputs include:
- `ranked_alternatives`
- `cheapest_option`
- `nearest_option`
- `balanced_option`

## API Contracts

### Planner Service
`POST /v1/plans`
```json
{
  "data_location": "aws-ap-south-1",
  "gpu_count": 16,
  "ram_requirement": 36,
  "dataset_size_gb": 500,
  "duration_hours": 10,
  "parity_mode": true,
  "result_limit": 5
}
```
Response:
```json
{ "plan_id": "uuid", "status": "queued" }
```

`GET /v1/plans/:planId`
Response includes:
- `plan`
- `recommendations`
- `cheapest_option`
- `nearest_option`
- `balanced_option`

Each recommendation includes:
- machine details (`provider`, `region`, `machineType`, `numberOfGpus`, `includedRamGb`, `includedVcpu`, `machineHourlyPriceUsd`, `instanceCount`)
- compute, egress, bandwidth, and total cost
- plain-language explanations for each cost line item

### Pricing Service
`GET /v1/pricing/offers?provider=aws&region=ap-south-1`

`POST /v1/pricing/estimate`
```json
{
  "plan_id": "uuid",
  "batch_id": "uuid",
  "scenario_id": "uuid",
  "request": {
    "data_location": "aws-ap-south-1",
    "gpu_count": 16,
    "ram_requirement": 36,
    "dataset_size_gb": 500,
    "duration_hours": 10,
    "parity_mode": true,
    "result_limit": 5
  },
  "providers": ["aws"],
  "regions": ["ap-south-1"],
  "skus": ["g5.2xlarge"]
}
```

### Requirement Normalizer Service
`POST /v1/requirements/normalize`
```json
{
  "cloudProvider": "aws",
  "region": "ap-south-1",
  "storage": {
    "object": {
      "bucket": "geo-nap-ds",
      "objectKey": "datasets/train.parquet",
      "storageClass": "standard"
    }
  },
  "network": {
    "dataEgressGB": 500,
    "crossCloudTransfer": true
  }
}
```

### Intelligence Service
`GET /v1/intelligence/availability?provider=aws&region=ap-south-1`

### Recommendation Service
`GET /v1/recommendations/:planId`

## Provider Adapter Interface

Defined in `packages/provider-adapters/src/providerAdapter.ts`:
- `provider`
- `normalize(rawOffers)`

Each adapter enforces provider-specific GPU eligibility and strips CPU-only offers.

## Folder Structure

```text
backend/geo-nap-platform/
  package.json
  tsconfig.base.json
  docker-compose.yml
  infra/
    postgres/init.sql
    k8s/microservices.yaml
  packages/
    common/
      src/{types,errors,http,logger,index}.ts
    provider-adapters/
      src/{providerAdapter,awsAdapter,azureAdapter,gcpAdapter,index}.ts
  services/
    planner/
      src/{app,server,config,db,queue,api}
    pricing/
      src/{app,server,config,api,cache,engine,data}
    simulation/
      src/{app,server,config,queue,clients}
    intelligence/
      src/{app,server,config,api,clients,db,queue}
    recommendation/
      src/{app,server,config,queue,db,api}
    requirement-normalizer/
      src/{app,server,config,api,application,domain}
```

## Deployment

### Docker Compose
From `backend/geo-nap-platform`:
```bash
docker compose up --build
```

Services:
- planner-service `:8081`
- pricing-service `:8082`
- simulation-service `:8083`
- recommendation-service `:8084`
- intelligence-service `:8085`
- requirement-normalizer-service `:8086`
- postgres `:5432`
- redis `:6379`
- rabbitmq `:5672`, management `:15672`

Health endpoints:
- `GET http://127.0.0.1:8081/health`
- `GET http://127.0.0.1:8082/health`
- `GET http://127.0.0.1:8083/health`
- `GET http://127.0.0.1:8084/health`
- `GET http://127.0.0.1:8085/health`
- `GET http://127.0.0.1:8086/health`

### Kubernetes
Manifest: `infra/k8s/microservices.yaml`

## Production Error Handling

- Shared typed errors: `packages/common/src/errors.ts`
- Standardized error payload mapping: `packages/common/src/http.ts`
- Structured logs via pino in all services
- Queue consumers nack poisoned messages (`requeue=false`) for deterministic failure behavior

## Future ML Readiness (No ML Implemented)

`packages/common/src/types.ts` defines:
- `FutureModelFeatures`
- `FutureModelInput`
- `FutureModelOutput`
- `FuturePredictionModulePort`

These interfaces are intentionally isolated from deterministic pricing and simulation formulas.
