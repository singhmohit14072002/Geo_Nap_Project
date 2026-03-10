# Geo-NAP Backend Workspace

## Active Backend
- `geo-nap-platform/`: production microservice backend.

Services:
- `planner`
- `pricing`
- `simulation`
- `intelligence`
- `recommendation`

Shared packages:
- `packages/common`
- `packages/provider-adapters`

## Add a New Microservice
1. Create `geo-nap-platform/services/<service_name>/`.
2. Add `package.json`, `tsconfig.json`, `Dockerfile`, and `src/{app,server,config}`.
3. Register queue topics and contracts via `packages/common`.
4. Add Kubernetes deployment config in `geo-nap-platform/infra/k8s/microservices.yaml`.
