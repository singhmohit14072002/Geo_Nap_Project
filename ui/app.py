# ui/app.py
import sys
import os
import requests
import streamlit as st
import pandas as pd

# Add project root to Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from engine import run_geo_nap


# -----------------------------
# Live Currency Rates (SAFE)
# -----------------------------
@st.cache_data(ttl=3600)
def get_live_rates():
    try:
        url = "https://api.exchangerate.host/latest?base=USD"
        r = requests.get(url, timeout=5).json()

        # If API fails or schema changes
        if "rates" not in r:
            st.warning("Currency API failed, using fallback rates.")
            return {
                "USD": 1.0,
                "INR": 83.0,
                "GBP": 0.78,
                "EUR": 0.92
            }

        return r["rates"]

    except Exception:
        st.warning("Currency API unreachable, using fallback rates.")
        return {
            "USD": 1.0,
            "INR": 83.0,
            "GBP": 0.78,
            "EUR": 0.92
        }


rates = get_live_rates()


# -----------------------------
# Page Config
# -----------------------------
st.set_page_config(
    page_title="Geo-NAP",
    layout="wide",
    page_icon="🌍"
)

# -----------------------------
# Header
# -----------------------------
st.markdown("""
# 🌍 Geo-NAP
### Network-Aware Multi-Cloud GPU Placement
A real-time multi-cloud GPU scheduling and cost optimization engine.
""")

st.divider()

# -----------------------------
# Input Section
# -----------------------------
st.markdown("## 🔧 Training Requirements")

col1, col2, col3, col4, col5 = st.columns(5)

with col1:
    required_gpus = st.slider("GPUs", 1, 64, 8)

with col2:
    r_max = st.slider("Max RTT (ms)", 1, 100, 20)

with col3:
    model_size = st.slider("Model Size (GB)", 1, 50, 5)

with col4:
    steps = st.slider("Training Steps", 10, 1000, 100)

with col5:
    currency = st.selectbox(
        "Currency",
        ["USD", "INR", "GBP", "EUR"]
    )

st.divider()

# -----------------------------
# Run Optimization
# -----------------------------
if st.button("🚀 Find Best Placement", use_container_width=True):

    with st.spinner("Running Geo-NAP optimization..."):
        placement, cost, forbidden = run_geo_nap(
            required_gpus,
            r_max,
            model_size,
            steps
        )

    fx = rates.get(currency, 1.0)
    final_cost = cost * fx

    # -----------------------------
    # Results Section
    # -----------------------------
    st.success("Optimal Placement Found")

    c1, c2, c3 = st.columns(3)
    with c1:
        st.metric("Requested GPUs", required_gpus)
    with c2:
        st.metric("Max RTT", f"{r_max} ms")
    with c3:
        st.metric("Total Cost", f"{final_cost:,.2f} {currency}")

    st.divider()

    # -----------------------------
    # Placement Table
    # -----------------------------
    st.markdown("## 📦 GPU Allocation")

    df = pd.DataFrame(
        placement.items(),
        columns=["Provider", "GPUs"]
    )
    df = df[df["GPUs"] > 0]

    if len(df) == 0:
        st.warning("No feasible placement found under current constraints.")
    else:
        st.dataframe(df, use_container_width=True)

        st.markdown("### Allocation Chart")
        st.bar_chart(df.set_index("Provider"))

    st.divider()

    # -----------------------------
    # Rejected Providers
    # -----------------------------
    st.markdown("## ❌ Rejected Providers (High RTT)")
    if len(forbidden) == 0:
        st.info("No providers rejected by RTT constraint.")
    else:
        st.write(forbidden)

    st.divider()

    # -----------------------------
    # Footer Insight
    # -----------------------------
    st.markdown("""
### 🧠 System Insight

Geo-NAP optimizes placement using:
- **Network-aware pricing**
- **Capacity constraints**
- **Automatic region fallback**
- **Live GPU marketplace data**

This is equivalent to a real-world **multi-cloud GPU scheduler**.
""")
