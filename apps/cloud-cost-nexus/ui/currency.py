# ui/currency.py
import requests

def get_live_rates():
    fallback = {
        "USD": 1.0,
        "INR": 83.0,
        "GBP": 0.78,
        "EUR": 0.92,
    }
    endpoints = [
        "https://open.er-api.com/v6/latest/USD",
        "https://api.frankfurter.app/latest?from=USD",
    ]
    for url in endpoints:
        try:
            resp = requests.get(url, timeout=6)
            resp.raise_for_status()
            data = resp.json()
            rates = data.get("rates")
            if isinstance(rates, dict) and rates:
                merged = dict(fallback)
                merged.update(rates)
                return merged
        except Exception:
            continue
    return fallback
