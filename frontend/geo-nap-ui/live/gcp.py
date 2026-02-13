from google.cloud import compute_v1
from google.auth.exceptions import DefaultCredentialsError

def get_gcp():
    try:
        client = compute_v1.RegionsClient()
        regions = client.list(project="dummy-project")
    except DefaultCredentialsError:
        print("GCP credentials not found, skipping GCP")
        return []

    results = []
    for r in regions:
        results.append({
            "provider": "gcp",
            "region": r.name,
            "gpu": "A100",
            "price": 2.2,
            "bandwidth": 10
        })
    return results
