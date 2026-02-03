# engine.py
import json

ALPHA = 0.01
BETA = 0.5

def run_geo_nap(required_gpus, r_max, model_size, steps):
    providers = json.load(open("cache/providers.json"))

    enriched = []
    for p in providers:
        name = p["provider"] + "_" + p["region"]
        price = p["price"]
        rtt = p.get("rtt", 30)
        bw = p.get("bandwidth", 10)

        network_penalty = (1 + ALPHA * rtt) * (1 + BETA / bw)
        effective_price = price * network_penalty

        capacity = 8 if "vast" in name else 32

        enriched.append({
            "name": name,
            "price": effective_price,
            "rtt": rtt,
            "capacity": capacity
        })

    # Step 1: filter by RTT
    allowed = [p for p in enriched if p["rtt"] <= r_max]
    forbidden = [p["name"] for p in enriched if p["rtt"] > r_max]

    # Step 2: sort by effective cost
    allowed.sort(key=lambda x: x["price"])

    # Step 3: greedy allocation
    placement = {}
    remaining = required_gpus
    total_cost = 0

    for p in allowed:
        if remaining <= 0:
            break
        alloc = min(p["capacity"], remaining)
        placement[p["name"]] = alloc
        total_cost += alloc * p["price"] * steps
        remaining -= alloc

    # Step 4: fallback if still missing GPUs
    if remaining > 0:
        others = [p for p in enriched if p["rtt"] > r_max]
        others.sort(key=lambda x: x["price"])
        for p in others:
            if remaining <= 0:
                break
            alloc = min(p["capacity"], remaining)
            placement[p["name"]] = alloc
            total_cost += alloc * p["price"] * steps
            remaining -= alloc

    return placement, total_cost, forbidden
