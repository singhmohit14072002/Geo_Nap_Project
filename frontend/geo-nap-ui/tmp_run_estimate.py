from ui.services.cost_estimator_api import estimate_cost

payload = {
    "cloudProviders": ["azure"],
    "region": "centralindia",
    "azureEstimate": {
        "documentType": "CLOUD_ESTIMATE",
        "mode": "AZURE_ESTIMATE_MODE",
        "classifiedServices": [
            {"serviceCategory":"Compute","serviceType":"Virtual Machines","region":"centralindia","description":"1 F8s Windows 730 hours"},
            {"serviceCategory":"Storage","serviceType":"Managed Disks","region":"centralindia","description":"2 P10 disks"},
            {"serviceCategory":"Networking","serviceType":"Bandwidth","region":"centralindia","description":"500 GB outbound"}
        ]
    }
}

result = estimate_cost(payload)
print(result)
