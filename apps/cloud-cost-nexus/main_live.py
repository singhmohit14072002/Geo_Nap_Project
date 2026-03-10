import json
from pathlib import Path
from live.rtt_probe import get_live_rtt
from live.aws_pricing import get_aws_gpu_price
from live.azure_pricing import get_azure_gpu_price
from optimizer.milp import solve_geo_nap

ROOT_DIR = Path(__file__).resolve().parent

print("Fetching live data...")

rtt = get_live_rtt()
pricing = {
    "aws_mumbai": get_aws_gpu_price(),
    "azure_mumbai": get_azure_gpu_price(),
    "gcp_singapore": 2.0
}

with (ROOT_DIR / "cache" / "rtt.json").open("w", encoding="utf-8") as f:
    json.dump(rtt, f)
with (ROOT_DIR / "cache" / "pricing.json").open("w", encoding="utf-8") as f:
    json.dump(pricing, f)

providers = list(pricing.keys())
egress = {p:0.09 for p in providers}

placement, cost = solve_geo_nap(
    providers, pricing, egress,
    8, set(), 5, 100
)

print("LIVE RESULT")
print("RTT:", rtt)
print("Pricing:", pricing)
print("Placement:", placement)
print("Cost:", cost)
