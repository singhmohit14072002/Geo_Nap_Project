import pandas as pd
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]

def load_rtt():
    df = pd.read_csv(ROOT_DIR / "data" / "rtt.csv")
    return {(r["from"], r["to"]): r["rtt_ms"] for _, r in df.iterrows()}

def load_bandwidth():
    df = pd.read_csv(ROOT_DIR / "data" / "bandwidth.csv")
    return {(r["from"], r["to"]): r["bandwidth_gbps"] for _, r in df.iterrows()}

def rtt_filter(rtt, r_max):
    return {k: v for k, v in rtt.items() if v <= r_max}
