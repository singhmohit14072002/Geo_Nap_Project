# Geo-NAP Architecture (Aligned to Research Outline)

This service keeps the original Geo-NAP behavior and UI while organizing frontend/backend entrypoints.

## Service folders
- `services/geo-nap/frontend/`: frontend run entrypoint
- `services/geo-nap/backend/`: backend run entrypoint

## Frontend and backend implementation locations
- Frontend app: `frontend/geo-nap-ui/ui/app.py`
- Core placement/cost engine: `frontend/geo-nap-ui/engine.py`
- Provider discovery: `frontend/geo-nap-ui/live/discover_all.py`
- Network/optimization/simulation modules:
  - `frontend/geo-nap-ui/models/`
  - `frontend/geo-nap-ui/optimizer/`
  - `frontend/geo-nap-ui/simulator/`

## Mapping to Geo-NAP framework

1. RTT and bandwidth measurement module
- Source: provider discovery and cache data
- Files: `frontend/geo-nap-ui/live/*.py`, `frontend/geo-nap-ui/cache/providers.json`, `frontend/geo-nap-ui/cache/rtt.json`

2. Network cost model
- Source: asymmetric egress + inter-provider transfer
- File: `frontend/geo-nap-ui/engine.py`

3. Compute cost model
- Source: provider GPU price x time and allocation
- File: `frontend/geo-nap-ui/engine.py`

4. Communication time model
- Source: all-reduce communication estimates (ring/mesh), RTT/bandwidth terms
- File: `frontend/geo-nap-ui/engine.py`

5. Optimization module
- Source: deterministic placement + optional MILP workflows
- Files: `frontend/geo-nap-ui/engine.py`, `frontend/geo-nap-ui/optimizer/milp.py`

6. Simulation engine
- Source: Monte Carlo and scenario evaluation
- File: `frontend/geo-nap-ui/simulator/monte_carlo.py`

7. Validation/baselines
- Source: baseline vs selected-model comparison in UI and reports
- File: `frontend/geo-nap-ui/ui/app.py`

## Output surfaces
- Placement allocation table and chart
- Cost details with formulas and line items
- Provider rejection view (RTT filtered)
- Baseline vs model-selected comparison
