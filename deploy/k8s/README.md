# Geo-NAP Kubernetes Deployment

## Components
- `cost-estimator-service`
- `ai-extraction-service`
- `pricing-sync-worker`
- `geo-nap-frontend`

## Apply Manifests
```bash
kubectl apply -k deploy/k8s
```

## Required Secret Values
Edit `deploy/k8s/secret.yaml` or override through your secret manager:
- `DATABASE_URL`
- `JWT_SECRET`
- `OPENAI_API_KEY` or `PERPLEXITY_API_KEY`
- `GCP_SERVICE_ACCOUNT_JSON` (for GCP pricing sync)

## Ingress Hosts
- `geo-nap.local` -> frontend
- `cost-api.geo-nap.local` -> cost-estimator-service
- `extraction-api.geo-nap.local` -> ai-extraction-service

## Notes
- `cost-estimator-service` has pricing sync disabled in API pods (`RUN_PRICING_SYNC_WORKER=false`).
- `pricing-sync-worker` runs the scheduled pricing sync loop as a dedicated deployment.
- Frontend readiness/liveness uses Streamlit health endpoint `/_stcore/health`.
