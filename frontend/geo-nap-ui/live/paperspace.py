import requests

def get_paperspace():
    url = "https://api.paperspace.io/machines/getAvailableMachineTypes"

    try:
        r = requests.get(url).json()

        if "machineTypes" not in r:
            print("Paperspace API not accessible, skipping Paperspace")
            print("Paperspace response:", r)
            return []

        results = []
        for item in r["machineTypes"]:
            if "GPU" in item.get("name", "") or "P" in item.get("name", ""):
                results.append({
                    "provider": "paperspace",
                    "region": "global",
                    "gpu": item["name"],
                    "price": item.get("priceHourly", 0),
                    "bandwidth": 10
                })

        return results

    except Exception as e:
        print("Paperspace error, skipping:", e)
        return []
