import pandas as pd
from pathlib import Path
from models.network import load_rtt, rtt_filter
from optimizer.milp import solve_geo_nap
from simulator.monte_carlo import monte_carlo_samples

ROOT_DIR = Path(__file__).resolve().parent

R_MAX = 10
MODEL_SIZE_GB = 5
STEPS = 100
REQUIRED_GPUS = 8

pricing = pd.read_csv(ROOT_DIR / "data" / "pricing.csv")
providers = pricing["provider"].tolist()
gpu_price = dict(zip(pricing["provider"], pricing["gpu_price_per_hour"]))
egress = dict(zip(pricing["provider"], pricing["egress_per_gb"]))

rtt = load_rtt()
feasible = rtt_filter(rtt, R_MAX)
allowed = set([p for pair in feasible for p in pair])
forbidden = set(providers) - allowed

placement, cost = solve_geo_nap(
    providers, gpu_price, egress,
    REQUIRED_GPUS, forbidden,
    MODEL_SIZE_GB, STEPS
)

print("STATIC RESULT")
print("Placement:", placement)
print("Cost:", cost)
