import requests

def get_azure():
    url = "https://prices.azure.com/api/retail/prices"
    params = {"$filter": "serviceName eq 'Virtual Machines'"}

    r = requests.get(url, params=params).json()

    results = []
    for item in r["Items"]:
        if "NC" in item["skuName"] or "ND" in item["skuName"]:
            results.append({
                "provider": "azure",
                "region": item["armRegionName"],
                "gpu": item["skuName"],
                "price": item["unitPrice"],
                "bandwidth": 10
            })
    return results
