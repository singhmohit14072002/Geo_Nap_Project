import requests

def get_runpod():
    url = "https://api.runpod.io/graphql"
    query = {
        "query": """
        {
          gpuTypes {
            displayName
            lowestPrice {
              price
            }
          }
        }
        """
    }

    try:
        r = requests.post(url, json=query).json()

        if "data" not in r:
            print("RunPod API not accessible, skipping RunPod")
            print("RunPod response:", r)
            return []

        results = []
        for gpu in r["data"]["gpuTypes"]:
            results.append({
                "provider": "runpod",
                "region": "global",
                "gpu": gpu["displayName"],
                "price": gpu["lowestPrice"]["price"],
                "bandwidth": 10
            })
        return results

    except Exception as e:
        print("RunPod error, skipping:", e)
        return []
