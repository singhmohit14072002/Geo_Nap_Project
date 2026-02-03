# ui/currency.py
import requests

def get_live_rates():
    url = "https://api.exchangerate.host/latest?base=USD"
    r = requests.get(url, timeout=5).json()
    return r["rates"]
