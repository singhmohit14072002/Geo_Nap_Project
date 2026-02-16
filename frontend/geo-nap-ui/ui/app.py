# ui/app.py
import sys
from pathlib import Path
import requests
import json
import streamlit as st
import pandas as pd

# Add project root to Python path (highest priority)
APP_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP_ROOT))

from engine import run_geo_nap


def render_cost_details(breakdown, fx, currency, title_prefix="", per_gpu_hour_rows=None):
    if title_prefix:
        st.markdown(f"#### {title_prefix}")
    st.metric("Total cost (USD)", f"{breakdown['total_cost'] * fx:,.2f} {currency}")
    st.caption("Formula: compute_cost + data_egress_cost + inter_provider_cost")

    st.metric("Compute cost (USD, $/hour × hours)", f"{breakdown['compute_cost'] * fx:,.2f} {currency}")
    total_hours = breakdown["total_time_hours"]
    sum_gpu_rate = None
    if per_gpu_hour_rows:
        try:
            sum_gpu_rate = sum(
                float(r.get("Price ($/hr)", 0.0)) * float(r.get("GPUs", 0.0))
                for r in per_gpu_hour_rows
            )
        except (TypeError, ValueError):
            sum_gpu_rate = None
    if sum_gpu_rate is not None:
        st.caption(
            "Formula: Σ(provider_gpus × effective_price_per_hour × total_time_hours) "
            f"= ({sum_gpu_rate:.3f} $/hr) × {total_hours:.2f} hr "
            f"= {breakdown['compute_cost'] * fx:,.2f} {currency}"
        )
    else:
        st.caption(
            "Formula: Σ(provider_gpus × effective_price_per_hour × total_time_hours) "
            f"= hours {total_hours:.2f}"
        )

    st.metric("Data egress cost (USD, $/GB × GB)", f"{breakdown['egress_cost'] * fx:,.2f} {currency}")
    st.caption(
        "Formula: dataset_size_gb × total_steps × source_egress_rate "
        f"= {breakdown['egress_rate_source']:.3f} $/GB × {breakdown['dataset_size_gb']:.2f} GB × "
        f"{breakdown['total_steps']} steps = {breakdown['egress_cost'] * fx:,.2f} {currency}"
    )

    st.metric("Inter-provider cost (USD, $/GB × GB)", f"{breakdown['inter_provider_cost'] * fx:,.2f} {currency}")
    st.caption(
        "Formula: Σ(pairwise_volume_gb × src_egress_rate × bandwidth_penalty) "
        f"= volume {breakdown['model_size_gb']:.2f} GB × {breakdown['total_steps']} steps "
        f"= {breakdown['inter_provider_cost'] * fx:,.2f} {currency}"
    )

    st.metric("Cost per epoch (USD)", f"{breakdown['cost_per_epoch'] * fx:,.2f} {currency}")
    st.caption("Formula: total_cost ÷ epochs")
    st.caption(
        f"Steps/epoch: {breakdown['steps_per_epoch']} | Total steps: {breakdown['total_steps']} | "
        f"Total hours: {breakdown['total_time_hours']:.2f} (derived {breakdown['derived_time_hours']:.2f}). "
        f"Per-step time: {breakdown['compute_time_per_step_sec']:.3f}s compute + "
        f"{breakdown['comm_time_per_step_sec']:.3f}s comm."
    )

    total_gb_egress = breakdown["dataset_size_gb"] * breakdown["total_steps"]
    total_gb_inter = breakdown["model_size_gb"] * breakdown["total_steps"]
    line_items = [
        {
            "Component": "Compute",
            "Unit": "$/hour × hours",
            "Amount (USD)": breakdown["compute_cost"] * fx,
            "Formula": f"({sum_gpu_rate:.3f} $/hr) × {total_hours:.2f} hr" if sum_gpu_rate is not None else "",
            "Hours used": round(total_hours, 2),
            "Egress GB": "",
            "Inter-provider GB": "",
        },
        {
            "Component": "Data egress",
            "Unit": "$/GB × GB",
            "Amount (USD)": breakdown["egress_cost"] * fx,
            "Formula": (
                f"{breakdown['egress_rate_source']:.3f} $/GB × {breakdown['dataset_size_gb']:.2f} GB × "
                f"{breakdown['total_steps']} steps"
            ),
            "Hours used": "",
            "Egress GB": round(total_gb_egress, 2),
            "Inter-provider GB": "",
        },
        {
            "Component": "Inter-provider",
            "Unit": "$/GB × GB",
            "Amount (USD)": breakdown["inter_provider_cost"] * fx,
            "Formula": f"{breakdown['model_size_gb']:.2f} GB × {breakdown['total_steps']} steps × penalty",
            "Hours used": "",
            "Egress GB": "",
            "Inter-provider GB": round(total_gb_inter, 2),
        },
        {
            "Component": "Total",
            "Unit": "sum",
            "Amount (USD)": breakdown["total_cost"] * fx,
            "Formula": "Compute + Data egress + Inter-provider",
            "Hours used": round(total_hours, 2),
            "Egress GB": round(total_gb_egress, 2),
            "Inter-provider GB": round(total_gb_inter, 2),
        },
    ]
    st.markdown("##### Line-item cost summary")
    st.dataframe(pd.DataFrame(line_items), use_container_width=True)

    if per_gpu_hour_rows:
        st.markdown("##### Per-GPU hourly pricing (effective, network-weighted)")
        st.dataframe(pd.DataFrame(per_gpu_hour_rows), use_container_width=True)


def build_report_csv(base_result, model_result):
    rows = []
    rows.append({"Section": "Base", "Metric": "Total cost", "Value": base_result["breakdown"]["total_cost"]})
    rows.append({"Section": "Base", "Metric": "Compute cost", "Value": base_result["breakdown"]["compute_cost"]})
    rows.append({"Section": "Base", "Metric": "Egress cost", "Value": base_result["breakdown"]["egress_cost"]})
    rows.append({"Section": "Base", "Metric": "Inter-provider cost", "Value": base_result["breakdown"]["inter_provider_cost"]})
    rows.append({"Section": "Base", "Metric": "Cost per epoch", "Value": base_result["breakdown"]["cost_per_epoch"]})
    if model_result:
        rows.append({"Section": f"Model ({model_result['model']})", "Metric": "Total cost", "Value": model_result["breakdown"]["total_cost"]})
        rows.append({"Section": f"Model ({model_result['model']})", "Metric": "Compute cost", "Value": model_result["breakdown"]["compute_cost"]})
        rows.append({"Section": f"Model ({model_result['model']})", "Metric": "Egress cost", "Value": model_result["breakdown"]["egress_cost"]})
        rows.append({"Section": f"Model ({model_result['model']})", "Metric": "Inter-provider cost", "Value": model_result["breakdown"]["inter_provider_cost"]})
        rows.append({"Section": f"Model ({model_result['model']})", "Metric": "Cost per epoch", "Value": model_result["breakdown"]["cost_per_epoch"]})
    return pd.DataFrame(rows).to_csv(index=False).encode("utf-8")


def build_report_html(base_result, model_result):
    html = ["<h2>Geo-NAP Report</h2>"]
    html.append("<h3>Base placement</h3>")
    html.append(pd.DataFrame(base_result["breakdown"], index=[0]).to_html(index=False))
    if model_result:
        html.append(f"<h3>Model placement: {model_result['model']}</h3>")
        html.append(pd.DataFrame(model_result["breakdown"], index=[0]).to_html(index=False))
    return "\n".join(html).encode("utf-8")


# -----------------------------
# Live Currency Rates (SAFE)
# -----------------------------
@st.cache_data(ttl=3600)
def get_live_rates():
    fallback = {
        "USD": 1.0,
        "INR": 83.0,
        "GBP": 0.78,
        "EUR": 0.92,
    }
    # Primary and secondary public endpoints (no API key required).
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

    st.warning("Live currency rates unavailable, using fallback rates.")
    return fallback


rates = get_live_rates()


# -----------------------------
# Page Config
# -----------------------------
st.set_page_config(
    page_title="Geo-NAP",
    layout="wide",
    page_icon="🌍"
)

# Sidebar navigation is handled centrally by ui/router.py via st.navigation.

# -----------------------------
# Visual Theme
# -----------------------------
ink = "#14110d"
muted = "#4a3f36"
hero_ink = "#1c140e"
hero_muted = "#3c2f24"
border = "#e0d3c0"

# -----------------------------
# Visual Theme
# -----------------------------
css = f"""
<style>
@import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Work+Sans:wght@400;500;600&display=swap");

:root {{
  --bg: #f7f4ef;
  --ink: {ink};
  --muted: {muted};
  --accent: #f26430;
  --accent-2: #2a9d8f;
  --card: #fffaf3;
  --border: {border};
  --hero-ink: {hero_ink};
  --hero-muted: {hero_muted};
}}

html, body, [class*="css"]  {{
  font-family: "Work Sans", sans-serif;
  color: var(--ink);
}}

.block-container {{
  padding-top: 1.5rem;
  padding-bottom: 2rem;
  max-width: 1200px;
}}

.hero {{
  background: radial-gradient(1200px 400px at 10% 10%, #ffd9c2 0%, #fdf6ef 55%);
  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 28px 28px 22px 28px;
}}

.hero h1 {{
  font-family: "Space Grotesk", sans-serif;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin-bottom: 6px;
  color: var(--hero-ink);
}}

.hero p {{
  margin: 0;
  color: var(--hero-muted);
  font-size: 1.05rem;
}}

.badge {{
  display: inline-block;
  border: 1px solid var(--border);
  background: #fff2e7;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 0.85rem;
  margin-right: 8px;
  color: #4b3a2c;
}}

.section-title {{
  font-family: "Space Grotesk", sans-serif;
  font-weight: 600;
  margin-bottom: 0.25rem;
}}

.card {{
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 16px;
  height: 100%;
}}

.cta {{
  background: linear-gradient(135deg, #e65825, #ff7a45);
  color: white;
  padding: 10px 16px;
  border-radius: 10px;
  font-weight: 600;
  display: inline-block;
  box-shadow: 0 6px 18px rgba(230, 88, 37, 0.25);
}}

.footer-note {{
  color: var(--muted);
  font-size: 0.9rem;
}}

.section {{
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 16px;
  margin-bottom: 14px;
}}

.section h2 {{
  margin-top: 0;
}}

.stButton > button {{
  background: linear-gradient(135deg, #e65825, #ff7a45);
  color: white;
  border: none;
  border-radius: 10px;
  font-weight: 600;
  padding: 0.65rem 1rem;
}}

.stTabs [data-baseweb="tab-list"] {{
  gap: 6px;
}}

.stTabs [data-baseweb="tab"] {{
  background: #fff7ed;
  color: #2b2118;
  border-radius: 999px;
  padding: 6px 14px;
  border: 1px solid #f2dbc7;
  opacity: 1;
}}

.stTabs [data-baseweb="tab"][aria-selected="true"] {{
  background: #ffe0c7;
  color: #2b2118;
  border: 1px solid #f4c7a3;
}}

.stDataFrame {{
  border-radius: 12px;
}}

</style>
"""

st.markdown(css, unsafe_allow_html=True)

# -----------------------------
# Header
# -----------------------------
st.markdown(
    """
<div class="hero">
  <span class="badge">Network-aware pricing</span>
  <span class="badge">Multi-cloud placement</span>
  <span class="badge">Live GPU markets</span>
  <h1>Geo-NAP</h1>
  <p>Network-aware, multi-cloud GPU placement that balances cost, latency, and capacity in real time.</p>
  <div style="margin-top: 14px;">
    <span class="cta">Plan a run</span>
  </div>
</div>
""",
    unsafe_allow_html=True,
)

st.markdown("")

# -----------------------------
# Onboarding Stepper
# -----------------------------
if "show_onboarding" not in st.session_state:
    st.session_state["show_onboarding"] = True

if st.session_state["show_onboarding"]:
    st.markdown("### Getting started")
    st.markdown(
        "1. **Plan your run** with GPUs, RTT, and dataset size\n"
        "2. **Find best placement** to get the cost baseline\n"
        "3. **Check GPU model availability** and recalculate if needed"
    )
    hide = st.checkbox("Don't show this again", value=False)
    if hide:
        st.session_state["show_onboarding"] = False

cols = st.columns(4)
with cols[0]:
    st.markdown(
        """
<div class="card">
  <div class="section-title">Live provider discovery</div>
  <div class="footer-note">Aggregates GPU pricing, regions, and capacity across clouds and marketplaces.</div>
</div>
""",
        unsafe_allow_html=True,
    )
with cols[1]:
    st.markdown(
        """
<div class="card">
  <div class="section-title">Network-aware cost model</div>
  <div class="footer-note">RTT and bandwidth penalties keep cheap-but-distant GPUs honest.</div>
</div>
""",
        unsafe_allow_html=True,
    )
with cols[2]:
    st.markdown(
        """
<div class="card">
  <div class="section-title">Automatic region fallback</div>
  <div class="footer-note">Spills demand across providers when a region runs out of capacity.</div>
</div>
""",
        unsafe_allow_html=True,
    )
with cols[3]:
    st.markdown(
        """
<div class="card">
  <div class="section-title">Multi-Cloud Cost Estimator</div>
  <div class="footer-note">Upload infrastructure requirements and automatically calculate detailed cost across AWS, Azure, and GCP with side-by-side comparison.</div>
</div>
""",
        unsafe_allow_html=True,
    )
    st.caption("Open `Cost Estimator` from the left sidebar.")

st.markdown("")

# -----------------------------
# Cache Safety Check
# -----------------------------
providers_path = APP_ROOT / "cache" / "providers.json"
if not providers_path.exists():
    st.error("Provider cache not found. Run discovery once before planning a run.")
    st.code("python live/discover_all.py")
    st.stop()

with providers_path.open("r", encoding="utf-8") as f:
    providers_cache = json.load(f)

gpu_models = sorted({p.get("gpu", "unknown") for p in providers_cache})
gpu_model_options = ["Any"] + [m for m in gpu_models if m and m != "unknown"]
provider_names = sorted({str(p.get("provider", "")).strip().lower() for p in providers_cache if p.get("provider")})
if not provider_names:
    provider_names = ["aws", "azure", "gcp", "vast"]
data_source_options = provider_names + ["custom"]
default_data_source_idx = data_source_options.index("aws") if "aws" in data_source_options else 0

# -----------------------------
# Input Section
# -----------------------------
st.markdown("## Plan your run")
st.markdown("Define requirements, then let Geo-NAP choose the best placement across providers and regions.")

with st.form("plan_form"):
    st.markdown('<div class="section">', unsafe_allow_html=True)
    col1, col2, col3, col4, col5 = st.columns([1, 1, 1, 1, 1])
    with col1:
        required_gpus = st.slider("GPUs", 1, 64, 8)
    with col2:
        r_max = st.slider("Max RTT (ms)", 1, 100, 20)
    with col3:
        model_size = st.slider("Model size (GB)", 1, 50, 5)
    with col4:
        steps = st.slider("Training steps (0 = use epochs)", 0, 2000, 0)
    with col5:
        currency = st.selectbox("Currency", ["USD", "INR", "GBP", "EUR"])
    st.markdown("</div>", unsafe_allow_html=True)

    st.markdown('<div class="section">', unsafe_allow_html=True)
    st.markdown("### Data location & costs")
    dc1, dc2, dc3, dc4 = st.columns([1.2, 1, 1, 1])
    with dc1:
        selected_data_source = st.selectbox(
            "Data source provider",
            data_source_options,
            index=default_data_source_idx,
            help="Select where your training data is stored. Choose 'custom' to type any provider name.",
        )
        if selected_data_source == "custom":
            data_source_provider = st.text_input("Custom data source provider", value="aws").strip().lower()
        else:
            data_source_provider = selected_data_source
    with dc2:
        dataset_size_gb = st.number_input("Dataset size total (GB)", min_value=0.1, value=200.0, step=10.0)
    with dc3:
        epochs = st.number_input("Epochs", min_value=1, value=3, step=1)
    with dc4:
        batch_size = st.number_input("Batch size", min_value=1, value=128, step=8)
    dc5, dc6 = st.columns([1, 1])
    with dc5:
        sample_size_gb = st.number_input("Sample size (GB)", min_value=0.001, value=0.02, step=0.001)
    with dc6:
        st.caption("Provider-specific egress is auto-detected from provider names.")
    st.markdown("</div>", unsafe_allow_html=True)

    st.markdown('<div class="section">', unsafe_allow_html=True)
    st.markdown("### Advanced settings")
    a1, a2 = st.columns([1, 1])
    with a1:
        topology = st.selectbox("All-reduce topology", ["ring", "mesh"])
        training_hours = st.number_input("Training hours (override)", min_value=0.0, value=0.0, step=0.5)
    with a2:
        base_compute_sec = st.number_input("Base sec/step", min_value=0.05, value=0.4, step=0.05)
        compute_scale_per_gb = st.number_input("Sec per GB per step", min_value=0.01, value=0.08, step=0.01)
    override_text = st.text_area(
        "Override egress rates ($/GB), one per line: provider_name,rate",
        value="aws,0.09\nazure,0.08\ngcp,0.12\nvast,0.02",
        height=100,
    )
    st.markdown("</div>", unsafe_allow_html=True)

    run_clicked = st.form_submit_button("🚀 Find best placement", use_container_width=True)

gpu_model = "Any"

egress_overrides = {}
for line in override_text.splitlines():
    if not line.strip():
        continue
    parts = [p.strip() for p in line.split(",")]
    if len(parts) == 2:
        try:
            egress_overrides[parts[0].lower()] = float(parts[1])
        except ValueError:
            pass

# -----------------------------
# Run Optimization
# -----------------------------
if run_clicked:

    with st.spinner("Running Geo-NAP optimization..."):
        placement, cost, forbidden, breakdown = run_geo_nap(
            required_gpus,
            r_max,
            model_size,
            steps,
            dataset_size_gb,
            epochs,
            batch_size,
            sample_size_gb,
            data_source_provider,
            egress_overrides,
            topology,
            gpu_model,
            training_hours,
            base_compute_sec,
            compute_scale_per_gb,
        )

    base_rows = []
    for p in providers_cache:
        key = f"{p.get('provider','unknown')}_{p.get('region','unknown')}"
        if key in placement:
            price = p.get("price", 0.0) or 0.0
            gpus = placement[key]
            base_rows.append({
                "Provider": key,
                "GPU Model": p.get("gpu", "unknown"),
                "GPUs": gpus,
                "Price ($/hr)": price,
                "Total $/hr": round(price * gpus, 4),
            })

    breakdown["total_cost"] = cost
    st.session_state["base_result"] = {
        "placement": placement,
        "cost": cost,
        "forbidden": forbidden,
        "breakdown": breakdown,
        "per_gpu_rows": base_rows,
    }

base_result = st.session_state.get("base_result")
if base_result:
    placement = base_result["placement"]
    cost = base_result["cost"]
    forbidden = base_result["forbidden"]
    breakdown = base_result["breakdown"]

    fx = rates.get(currency, 1.0)
    final_cost = cost * fx

    # -----------------------------
    # Results Section
    # -----------------------------
    st.success("Optimal placement found")

    st.markdown("### Quick summary")
    s1, s2, s3, s4 = st.columns(4)
    with s1:
        st.metric("GPUs", required_gpus)
    with s2:
        st.metric("Max RTT", f"{r_max} ms")
    with s3:
        st.metric("Dataset", f"{dataset_size_gb} GB")
    with s4:
        st.metric("Hours", f"{breakdown['total_time_hours']:.2f}")

    model_result = st.session_state.get("model_result")
    report_csv = build_report_csv(base_result, model_result)
    report_html = build_report_html(base_result, model_result)
    st.markdown("### Export report")
    r1, r2 = st.columns(2)
    with r1:
        st.download_button("Download CSV", data=report_csv, file_name="geo_nap_report.csv", mime="text/csv")
    with r2:
        st.download_button("Download HTML", data=report_html, file_name="geo_nap_report.html", mime="text/html")

    c1, c2, c3 = st.columns(3)
    with c1:
        st.metric("Requested GPUs", required_gpus)
    with c2:
        st.metric("Max RTT", f"{r_max} ms")
    with c3:
        st.metric("Total cost", f"{final_cost:,.2f} {currency}")

    st.markdown("")

    # -----------------------------
    # Results
    # -----------------------------
    tabs = st.tabs(["Allocation", "Cost details", "Rejected providers"])

    df = pd.DataFrame(placement.items(), columns=["Provider", "GPUs"])
    df = df[df["GPUs"] > 0]

    with tabs[0]:
        st.markdown("### GPU allocation")
        if len(df) == 0:
            st.warning("No feasible placement found under current constraints.")
        else:
            st.dataframe(df, use_container_width=True)
            st.markdown("#### Allocation chart")
            st.bar_chart(df.set_index("Provider"))

    with tabs[1]:
        st.markdown("### Cost details")
        st.write("Effective cost includes compute time, data egress, and all-reduce communication.")

        st.markdown("### Check GPU model availability in selected regions")
        placement_regions = set(placement.keys())
        available_models = {"Any"}
        for p in providers_cache:
            key = f"{p.get('provider','unknown')}_{p.get('region','unknown')}"
            if key in placement_regions:
                model_name = p.get("gpu", "unknown")
                if model_name and model_name != "unknown":
                    available_models.add(model_name)
        available_model_options = ["Any"] + sorted(m for m in available_models if m != "Any")
        chosen_model = st.selectbox("GPU model to check", available_model_options, index=0, key="model_check")
        st.caption(f"Showing models available in: {', '.join(sorted(placement_regions))}")
        if chosen_model != "Any":
            availability = {}
            for p in providers_cache:
                key = f"{p.get('provider','unknown')}_{p.get('region','unknown')}"
                availability.setdefault(key, set()).add(p.get("gpu", "unknown"))

            rows = []
            for provider_name, gpus in df.values:
                rows.append({
                    "Provider": provider_name,
                    "Selected Model": chosen_model,
                    "Available": "Yes" if chosen_model in availability.get(provider_name, set()) else "No",
                })
            st.dataframe(pd.DataFrame(rows), use_container_width=True)
        else:
            st.info("Select a GPU model to check availability in the allocated regions.")

        if chosen_model != "Any":
            st.markdown("### Recalculate with selected model")
            if st.button("Recalculate placement for selected model", use_container_width=True, key="recalc_model"):
                with st.spinner("Recomputing placement with model filter..."):
                    m_placement, m_cost, m_forbidden, m_breakdown = run_geo_nap(
                        required_gpus,
                        r_max,
                        model_size,
                        steps,
                        dataset_size_gb,
                        epochs,
                        batch_size,
                        sample_size_gb,
                        data_source_provider,
                        egress_overrides,
                        topology,
                        chosen_model,
                        training_hours,
                        base_compute_sec,
                        compute_scale_per_gb,
                    )
                m_breakdown["total_cost"] = m_cost
                m_fx = rates.get(currency, 1.0)
                st.success(f"Model-filtered placement computed for {chosen_model}.")
                m_df = pd.DataFrame(m_placement.items(), columns=["Provider", "GPUs"])
                m_df = m_df[m_df["GPUs"] > 0]
                if len(m_df) == 0:
                    st.warning("No feasible placement found for that model and constraints.")
                else:
                    st.dataframe(m_df, use_container_width=True)
                    st.metric("Model-filtered total cost", f"{m_cost * m_fx:,.2f} {currency}")
                    st.metric("Model-filtered cost per epoch", f"{m_breakdown['cost_per_epoch'] * m_fx:,.2f} {currency}")
                    m_rows = []
                    for p in providers_cache:
                        key = f"{p.get('provider','unknown')}_{p.get('region','unknown')}"
                        if key in m_placement:
                            price = p.get("price", 0.0) or 0.0
                            gpus = m_placement[key]
                            m_rows.append({
                                "Provider": key,
                                "GPU Model": p.get("gpu", "unknown"),
                                "GPUs": gpus,
                                "Price ($/hr)": price,
                                "Total $/hr": round(price * gpus, 4),
                            })

                    st.session_state["model_result"] = {
                        "model": chosen_model,
                        "placement": m_placement,
                        "cost": m_cost,
                        "breakdown": m_breakdown,
                        "per_gpu_rows": m_rows,
                    }

        model_result = st.session_state.get("model_result")
        if model_result:
            delta_cost = (model_result["breakdown"]["total_cost"] - breakdown["total_cost"]) * fx
            delta_compute = (model_result["breakdown"]["compute_cost"] - breakdown["compute_cost"]) * fx
            delta_egress = (model_result["breakdown"]["egress_cost"] - breakdown["egress_cost"]) * fx
            delta_inter = (model_result["breakdown"]["inter_provider_cost"] - breakdown["inter_provider_cost"]) * fx
            delta_epoch = (model_result["breakdown"]["cost_per_epoch"] - breakdown["cost_per_epoch"]) * fx

            st.markdown("#### Delta (model − base)")
            d1, d2, d3, d4, d5 = st.columns(5)
            with d1:
                st.metric(
                    "Total Δ",
                    f"{delta_cost:,.2f} {currency}",
                    delta=f"{delta_cost:,.2f}",
                    delta_color="inverse",
                )
            with d2:
                st.metric(
                    "Compute Δ",
                    f"{delta_compute:,.2f} {currency}",
                    delta=f"{delta_compute:,.2f}",
                    delta_color="inverse",
                )
            with d3:
                st.metric(
                    "Egress Δ",
                    f"{delta_egress:,.2f} {currency}",
                    delta=f"{delta_egress:,.2f}",
                    delta_color="inverse",
                )
            with d4:
                st.metric(
                    "Inter-provider Δ",
                    f"{delta_inter:,.2f} {currency}",
                    delta=f"{delta_inter:,.2f}",
                    delta_color="inverse",
                )
            with d5:
                st.metric(
                    "Per-epoch Δ",
                    f"{delta_epoch:,.2f} {currency}",
                    delta=f"{delta_epoch:,.2f}",
                    delta_color="inverse",
                )

            left, right = st.columns(2)
            with left:
                render_cost_details(breakdown, fx, currency, "Base placement", base_result.get("per_gpu_rows"))
            with right:
                render_cost_details(
                    model_result["breakdown"],
                    fx,
                    currency,
                    f"Model-filtered: {model_result['model']}",
                    model_result.get("per_gpu_rows"),
                )
        else:
            render_cost_details(breakdown, fx, currency, "Base placement", base_result.get("per_gpu_rows"))

    with tabs[2]:
        st.markdown("### Rejected providers (high RTT)")
        if len(forbidden) == 0:
            st.info("No providers rejected by RTT constraint.")
        else:
            st.write(forbidden)

        st.markdown("### Pairwise inter-provider cost matrix")
        used_providers = sorted({k for k, v in placement.items() if v > 0})
        if len(used_providers) > 1:
            matrix = pd.DataFrame(0.0, index=used_providers, columns=used_providers)
            for (src, dst), cost in breakdown["pairwise_costs"].items():
                matrix.loc[src, dst] = cost * fx
            st.dataframe(matrix, use_container_width=True)
        else:
            st.info("Need at least two providers to show pairwise costs.")

        st.markdown("### Provider egress rates ($/GB)")
        rate_df = pd.DataFrame(
            [{"Provider": k, "Egress $/GB": v} for k, v in breakdown["egress_rate_by_provider"].items()]
        )
        st.dataframe(rate_df, use_container_width=True)

    st.markdown("")
    st.markdown(
        """
<div class="card">
  <div class="section-title">System insight</div>
  <div class="footer-note">
    Geo-NAP optimizes placement using network-aware pricing, capacity constraints,
    and automatic region fallback to behave like a real multi-cloud GPU scheduler.
  </div>
</div>
""",
        unsafe_allow_html=True,
    )
