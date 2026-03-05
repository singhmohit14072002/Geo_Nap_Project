import json
from ui.services.cost_estimator_api import estimate_cost

extract = json.load(open('C:/geo_nap/tmp_last_extract.json','r'))
payload = {
    "cloudProviders": ["azure"],
    "region": "centralindia",
    "azureEstimate": extract.get("azureEstimate")
}
print(json.dumps(payload)[:200])
result = estimate_cost(payload)
print(json.dumps(result, indent=2))
