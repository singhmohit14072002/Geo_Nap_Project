import requests

def get_lambda():
    url = "https://cloud.lambdalabs.com/api/v1/instances"

    try:
        r = requests.get(url).json()

        if "data" not in r:
            print("Lambda Labs API not accessible, skipping Lambda")
            print("Lambda response:", r)
            return []

        results = []
        for item in r["data"]:
            results.append({
                "provider": "lambda",
                "region": item["region"]["name"],
                "gpu": item["instance_type"]["name"],
                "price": item["price_cents_per_hour"] / 100,
                "bandwidth": 10
            })
        return results

    except Exception as e:
        print("Lambda error, skipping:", e)
        return []
