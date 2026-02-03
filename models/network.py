import pandas as pd

def load_rtt():
    df = pd.read_csv("data/rtt.csv")
    return {(r["from"], r["to"]): r["rtt_ms"] for _, r in df.iterrows()}

def load_bandwidth():
    df = pd.read_csv("data/bandwidth.csv")
    return {(r["from"], r["to"]): r["bandwidth_gbps"] for _, r in df.iterrows()}

def rtt_filter(rtt, r_max):
    return {k: v for k, v in rtt.items() if v <= r_max}
