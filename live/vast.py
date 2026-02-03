import requests

def get_vast():
    url = "https://console.vast.ai/api/v0/bundles/"
    r = requests.get(url).json()

    results = []
    for item in r["offers"]:
        results.append({
            "provider": "vast",
            "region": item.get("geolocation", "unknown"),
            "gpu": item["gpu_name"],
            "price": item["dph_total"],
            "bandwidth": item.get("inet_down", 10)
        })
    return results
