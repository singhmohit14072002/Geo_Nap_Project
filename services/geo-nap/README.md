# Geo-NAP Service

This service keeps the original Geo-NAP application and feature set, with separate frontend/backend entry folders.

## Structure
- `services/geo-nap/frontend/`: frontend entrypoint and run script
- `services/geo-nap/backend/`: backend entrypoint and run script
- `services/geo-nap/ARCHITECTURE.md`: mapping to the Geo-NAP research framework

## Current implementation mapping
- Frontend app code: `frontend/geo-nap-ui/ui/app.py`
- Core network-aware placement/cost engine: `frontend/geo-nap-ui/engine.py`
- Discovery and provider ingestion: `frontend/geo-nap-ui/live/`
- Modeling/optimization/simulation: `frontend/geo-nap-ui/models/`, `frontend/geo-nap-ui/optimizer/`, `frontend/geo-nap-ui/simulator/`
- Backend microservice platform: `backend/geo-nap-platform/`

## Run
- Frontend:
  - `.\services\geo-nap\frontend\run.ps1`
- Backend microservices:
  - `.\services\geo-nap\backend\run.ps1`
