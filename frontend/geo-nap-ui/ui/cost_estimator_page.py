from pathlib import Path
import sys
from typing import Any, Dict, List

import pandas as pd
import streamlit as st


APP_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP_ROOT))

from ui.services.cost_estimator_api import CostEstimatorApiError, estimate_cost


st.set_page_config(
    page_title="Geo-NAP | Cost Estimator",
    layout="wide",
    page_icon="🧮",
)

# Sidebar navigation is handled centrally by ui/router.py via st.navigation.

ink = "#14110d"
muted = "#4a3f36"
hero_ink = "#1c140e"
hero_muted = "#3c2f24"
border = "#e0d3c0"

css = f"""
<style>
@import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Work+Sans:wght@400;500;600&display=swap");

:root {{
  --bg: #f7f4ef;
  --ink: {ink};
  --muted: {muted};
  --accent: #f26430;
  --card: #fffaf3;
  --border: {border};
  --hero-ink: {hero_ink};
  --hero-muted: {hero_muted};
}}

html, body, [class*="css"] {{
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
  padding: 28px;
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

.section {{
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 16px;
  margin-bottom: 14px;
}}

.section h3 {{
  margin-top: 0;
}}

.section-note {{
  color: var(--muted);
  font-size: 0.92rem;
}}

.stButton > button {{
  background: linear-gradient(135deg, #e65825, #ff7a45);
  color: white;
  border: none;
  border-radius: 10px;
  font-weight: 600;
  padding: 0.65rem 1rem;
}}
</style>
"""
st.markdown(css, unsafe_allow_html=True)


def init_state() -> None:
    if "ce_selected_providers" not in st.session_state:
        st.session_state["ce_selected_providers"] = ["azure", "aws"]
    if "ce_region" not in st.session_state:
        st.session_state["ce_region"] = "centralindia"
    if "ce_loading" not in st.session_state:
        st.session_state["ce_loading"] = False
    if "ce_results" not in st.session_state:
        st.session_state["ce_results"] = []
    if "ce_error" not in st.session_state:
        st.session_state["ce_error"] = None


def build_payload(cloud_providers: List[str], region: str) -> Dict[str, Any]:
    return {
        "cloudProviders": cloud_providers,
        "region": region,
        "requirement": {
            "compute": [
                {
                    "vCPU": 8,
                    "ramGB": 16,
                    "storageGB": 500,
                    "osType": "linux",
                    "quantity": 1,
                }
            ],
            "database": {
                "engine": "postgres",
                "storageGB": 200,
                "ha": False,
            },
            "network": {
                "dataEgressGB": 100,
            },
        },
    }


def render_provider_card(result: Dict[str, Any]) -> None:
    provider = str(result.get("provider", "-")).upper()
    region = str(result.get("region", "-"))
    summary = result.get("summary", {}) if isinstance(result, dict) else {}
    breakdown = result.get("breakdown", {}) if isinstance(result, dict) else {}

    monthly = float(summary.get("monthlyTotal", 0.0))
    yearly = float(summary.get("yearlyTotal", 0.0))

    compute = float(breakdown.get("compute", 0.0))
    storage = float(breakdown.get("storage", 0.0))
    database = float(breakdown.get("database", 0.0))
    network = float(breakdown.get("networkEgress", 0.0))

    st.markdown('<div class="section">', unsafe_allow_html=True)
    st.markdown(f"### {provider}")
    st.caption(f"Region: {region}")
    st.metric("Monthly Cost", f"₹{monthly:,.2f}")
    st.metric("Yearly Cost", f"₹{yearly:,.2f}")

    breakdown_df = pd.DataFrame(
        [
            {"Component": "Compute", "Cost (INR)": round(compute, 2)},
            {"Component": "Storage", "Cost (INR)": round(storage, 2)},
            {"Component": "Database", "Cost (INR)": round(database, 2)},
            {"Component": "Network", "Cost (INR)": round(network, 2)},
            {"Component": "Total", "Cost (INR)": round(monthly, 2)},
        ]
    )
    st.markdown("#### Breakdown")
    st.table(breakdown_df)
    st.markdown("</div>", unsafe_allow_html=True)


init_state()

st.markdown(
    """
<div class="hero">
  <h1>Automated Multi-Cloud Cost Estimator</h1>
  <p>Upload infrastructure requirements and compare detailed cloud cost estimates side by side.</p>
</div>
""",
    unsafe_allow_html=True,
)

st.markdown("")

st.markdown('<div class="section">', unsafe_allow_html=True)
st.markdown("### File Upload Area")
uploaded_file = st.file_uploader(
    "Upload requirement file",
    type=["csv", "json", "xlsx"],
    help="Current flow uses static sample requirement payload for backend integration.",
)
if uploaded_file is not None:
    st.caption(
        f"Loaded file: `{uploaded_file.name}` ({uploaded_file.size} bytes). "
        "Static payload is still used for estimate requests."
    )
else:
    st.caption("No file uploaded yet. Static payload is used for estimate requests.")
st.markdown("</div>", unsafe_allow_html=True)

st.markdown('<div class="section">', unsafe_allow_html=True)
st.markdown("### Cloud Provider Selection")
c1, c2, c3 = st.columns(3)
with c1:
    use_azure = st.checkbox(
        "Azure", value="azure" in st.session_state["ce_selected_providers"]
    )
with c2:
    use_aws = st.checkbox(
        "AWS", value="aws" in st.session_state["ce_selected_providers"]
    )
with c3:
    use_gcp = st.checkbox(
        "GCP", value="gcp" in st.session_state["ce_selected_providers"]
    )

selected_providers: List[str] = []
if use_azure:
    selected_providers.append("azure")
if use_aws:
    selected_providers.append("aws")
if use_gcp:
    selected_providers.append("gcp")
st.session_state["ce_selected_providers"] = selected_providers

if not selected_providers:
    st.warning("Select at least one provider to run cost estimation.")
st.markdown("</div>", unsafe_allow_html=True)

st.markdown('<div class="section">', unsafe_allow_html=True)
st.markdown("### Region Selector")
region_options = [
    "centralindia",
    "ap-south-1",
    "us-east-1",
    "westus2",
    "europe-west4",
]
default_region = st.session_state["ce_region"]
default_index = (
    region_options.index(default_region)
    if default_region in region_options
    else 0
)
region = st.selectbox(
    "Region",
    region_options,
    index=default_index,
    help="Selected region is forwarded to the backend estimate request.",
)
st.session_state["ce_region"] = region
st.markdown("</div>", unsafe_allow_html=True)

st.markdown('<div class="section">', unsafe_allow_html=True)
st.markdown("### Estimate")

is_loading = bool(st.session_state["ce_loading"])
estimate_disabled = is_loading or len(selected_providers) == 0
estimate_clicked = st.button(
    "Estimate",
    use_container_width=True,
    disabled=estimate_disabled,
)

if estimate_clicked:
    st.session_state["ce_loading"] = True
    st.session_state["ce_error"] = None
    st.session_state["ce_results"] = []
    payload = build_payload(selected_providers, region)

    try:
        with st.spinner("Calculating cost..."):
            response = estimate_cost(payload)
            results = response.get("results", [])
            if not isinstance(results, list):
                raise CostEstimatorApiError(
                    "Invalid response from cost-estimator-service: `results` must be a list."
                )
            st.session_state["ce_results"] = results
    except CostEstimatorApiError as exc:
        st.session_state["ce_error"] = str(exc)
    except Exception as exc:
        st.session_state["ce_error"] = f"Unexpected error: {exc}"
    finally:
        st.session_state["ce_loading"] = False

st.markdown("</div>", unsafe_allow_html=True)

if st.session_state["ce_error"]:
    st.error(st.session_state["ce_error"])

results = st.session_state["ce_results"]
if results:
    st.markdown("### Provider Cost Comparison")
    result_cols = st.columns(len(results))
    for idx, result in enumerate(results):
        with result_cols[idx]:
            render_provider_card(result)
else:
    st.markdown('<div class="section">', unsafe_allow_html=True)
    st.markdown("### Result Comparison Table")
    placeholder_df = pd.DataFrame(
        [
            {
                "Provider": "AWS",
                "Region": region,
                "Monthly Cost (INR)": "-",
                "Yearly Cost (INR)": "-",
            },
            {
                "Provider": "Azure",
                "Region": region,
                "Monthly Cost (INR)": "-",
                "Yearly Cost (INR)": "-",
            },
            {
                "Provider": "GCP",
                "Region": region,
                "Monthly Cost (INR)": "-",
                "Yearly Cost (INR)": "-",
            },
        ]
    )
    st.dataframe(placeholder_df, use_container_width=True)
    st.markdown(
        '<div class="section-note">Run Estimate to fetch provider costs from backend service.</div>',
        unsafe_allow_html=True,
    )
    st.markdown("</div>", unsafe_allow_html=True)

