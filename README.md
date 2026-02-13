# Geo-NAP Monorepo

This repository is split into separate frontend and backend codebases so you can publish them independently.

## Folders
- `backend/geo-nap-platform/`: Node.js/TypeScript microservices backend (`planner`, `pricing`, `simulation`, `intelligence`, `recommendation`)
- `frontend/geo-nap-ui/`: Python Streamlit frontend + Geo-NAP placement engine + discovery scripts
- `services/geo-nap/`: convenience run scripts and architecture notes

## Run
- Backend:
  - `./services/geo-nap/backend/run.ps1`
- Frontend:
  - `./services/geo-nap/frontend/run.ps1`

## Independent GitHub Push
If you want separate GitHub repositories:
1. Push `frontend/geo-nap-ui` as one repo.
2. Push `backend/geo-nap-platform` as another repo.
