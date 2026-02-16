from pathlib import Path
import sys
from typing import Any, Dict, List, Set

import pandas as pd
import streamlit as st


APP_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP_ROOT))

from ui.services.ai_extraction_api import (  # noqa: E402
    AiExtractionApiError,
    extract_requirements,
    submit_clarifications,
)
from ui.services.cost_estimator_api import (  # noqa: E402
    CostEstimatorApiError,
    estimate_cost,
)


st.set_page_config(
    page_title="Geo-NAP | Cost Estimator",
    layout="wide",
    page_icon="🧮",
)

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


def sample_requirement() -> Dict[str, Any]:
    return {
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
    }


def init_state() -> None:
    defaults = {
        "ce_selected_providers": ["azure", "aws"],
        "ce_region": "centralindia",
        "ce_loading": False,
        "ce_results": [],
        "ce_error": None,
        "ce_extraction_error": None,
        "ce_extraction_loading": False,
        "ce_requirement": None,
        "ce_extraction_candidate": None,
        "ce_clarification_questions": [],
        "ce_clarification_issues": [],
    }
    for key, value in defaults.items():
        if key not in st.session_state:
            st.session_state[key] = value


def build_payload(
    cloud_providers: List[str],
    region: str,
    requirement: Dict[str, Any],
) -> Dict[str, Any]:
    return {
        "cloudProviders": cloud_providers,
        "region": region,
        "requirement": requirement,
    }


def issue_codes(issues: List[Dict[str, Any]]) -> Set[str]:
    return {str(item.get("code", "")).strip() for item in issues if isinstance(item, dict)}


def render_provider_card(result: Dict[str, Any]) -> None:
    provider = str(result.get("provider", "-")).upper()
    region = str(result.get("region", "-"))
    summary = result.get("summary", {}) if isinstance(result, dict) else {}
    breakdown = result.get("breakdown", {}) if isinstance(result, dict) else {}
    details = result.get("details", []) if isinstance(result, dict) else []

    monthly = float(summary.get("monthlyTotal", 0.0))
    yearly = float(summary.get("yearlyTotal", 0.0))

    compute = float(breakdown.get("compute", 0.0))
    storage = float(breakdown.get("storage", 0.0))
    database = float(breakdown.get("database", 0.0))
    network = float(breakdown.get("networkEgress", 0.0))

    st.markdown('<div class="section">', unsafe_allow_html=True)
    st.markdown(f"### {provider}")
    st.caption(f"Region: {region}")

    machine_rows = []
    for row in details:
        if isinstance(row, dict) and str(row.get("serviceType", "")) == "compute":
            machine_rows.append(
                {
                    "Machine": str(row.get("sku", "-")),
                    "Qty": row.get("quantity", "-"),
                    "Monthly (INR)": round(float(row.get("monthlyCost", 0.0)), 2),
                }
            )
    if machine_rows:
        st.markdown("#### Machine details")
        st.dataframe(pd.DataFrame(machine_rows), use_container_width=True, hide_index=True)

    st.metric("Monthly Cost", f"₹{monthly:,.2f}")
    st.metric("Yearly Cost", f"₹{yearly:,.2f}")

    breakdown_df = pd.DataFrame(
        [
            {
                "Component": "Compute",
                "Cost (INR)": round(compute, 2),
                "Explanation": "Includes GPU VM price (GPU + CPU + RAM)",
            },
            {
                "Component": "Storage",
                "Cost (INR)": round(storage, 2),
                "Explanation": "Attached block/object storage capacity",
            },
            {
                "Component": "Database",
                "Cost (INR)": round(database, 2),
                "Explanation": "Managed database service charges",
            },
            {
                "Component": "Network Egress",
                "Cost (INR)": round(network, 2),
                "Explanation": "Outbound data transfer cost",
            },
            {
                "Component": "Total",
                "Cost (INR)": round(monthly, 2),
                "Explanation": "Sum of all monthly components",
            },
        ]
    )
    st.markdown("#### Breakdown")
    st.dataframe(breakdown_df, use_container_width=True, hide_index=True)
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
st.markdown("### File Upload & Requirement Extraction")
uploaded_file = st.file_uploader(
    "Upload infrastructure file",
    type=["pdf", "xlsx", "xls", "csv", "txt", "json"],
    help="Geo-NAP extracts compute, database, network, and region requirements from uploaded files.",
)

left_action, right_action = st.columns([1, 1])
extract_clicked = left_action.button("Extract requirements", use_container_width=True)
use_sample_clicked = right_action.button("Use sample requirement", use_container_width=True)

if use_sample_clicked:
    st.session_state["ce_requirement"] = sample_requirement()
    st.session_state["ce_extraction_candidate"] = None
    st.session_state["ce_clarification_questions"] = []
    st.session_state["ce_clarification_issues"] = []
    st.session_state["ce_extraction_error"] = None

if extract_clicked:
    if uploaded_file is None:
        st.session_state["ce_extraction_error"] = "Please upload a file before extraction."
    else:
        st.session_state["ce_extraction_loading"] = True
        st.session_state["ce_extraction_error"] = None
        st.session_state["ce_requirement"] = None
        st.session_state["ce_results"] = []
        st.session_state["ce_error"] = None

        try:
            with st.spinner("Extracting requirements..."):
                payload = extract_requirements(
                    uploaded_file.name,
                    uploaded_file.getvalue(),
                    uploaded_file.type,
                )

            status = str(payload.get("status", "")).upper()
            if status == "VALID":
                requirement = payload.get("requirement")
                if not isinstance(requirement, dict):
                    raise AiExtractionApiError("Extraction response missing requirement object.")
                st.session_state["ce_requirement"] = requirement
                st.session_state["ce_extraction_candidate"] = None
                st.session_state["ce_clarification_questions"] = []
                st.session_state["ce_clarification_issues"] = []
            elif status == "NEEDS_CLARIFICATION":
                st.session_state["ce_extraction_candidate"] = payload.get("candidate")
                st.session_state["ce_clarification_questions"] = payload.get("questions", [])
                st.session_state["ce_clarification_issues"] = payload.get("issues", [])
            else:
                raise AiExtractionApiError("Unknown extraction status returned by backend.")
        except AiExtractionApiError as exc:
            st.session_state["ce_extraction_error"] = str(exc)
        except Exception as exc:
            st.session_state["ce_extraction_error"] = f"Unexpected extraction error: {exc}"
        finally:
            st.session_state["ce_extraction_loading"] = False

if st.session_state["ce_extraction_error"]:
    st.error(st.session_state["ce_extraction_error"])

if st.session_state["ce_requirement"]:
    req_obj = st.session_state["ce_requirement"]
    st.success("Requirements extracted and validated. Ready for cost estimation.")
    if isinstance(req_obj, dict):
        region_in_req = req_obj.get("region")
        if isinstance(region_in_req, str) and region_in_req.strip():
            st.session_state["ce_region"] = region_in_req.strip()
    st.json(req_obj)

candidate = st.session_state.get("ce_extraction_candidate")
issues = st.session_state.get("ce_clarification_issues", [])
questions = st.session_state.get("ce_clarification_questions", [])

if isinstance(candidate, dict) and issues:
    st.warning("Additional details are required before estimation.")
    if questions:
        for q in questions:
            st.caption(f"- {q}")

    codes = issue_codes(issues)
    compute_candidate = {}
    if isinstance(candidate.get("compute"), list) and candidate["compute"]:
        first_item = candidate["compute"][0]
        if isinstance(first_item, dict):
            compute_candidate = first_item

    db_candidate = candidate.get("database") if isinstance(candidate.get("database"), dict) else {}
    net_candidate = candidate.get("network") if isinstance(candidate.get("network"), dict) else {}

    with st.form("clarification_form"):
        st.markdown("#### Clarify missing fields")

        region_value = st.text_input(
            "Deployment region",
            value=str(candidate.get("region") or st.session_state["ce_region"]),
            disabled="REGION_MISSING" not in codes,
        )

        c1, c2, c3 = st.columns(3)
        with c1:
            vcpu = st.number_input(
                "vCPU",
                min_value=1,
                value=int(compute_candidate.get("vCPU") or 8),
                step=1,
                disabled=not any(code in codes for code in ["COMPUTE_CPU_MISSING", "UNREALISTIC_COMPUTE_CONFIG"]),
            )
        with c2:
            ram_gb = st.number_input(
                "RAM (GB)",
                min_value=1.0,
                value=float(compute_candidate.get("ramGB") or 16.0),
                step=1.0,
                disabled=not any(code in codes for code in ["COMPUTE_RAM_MISSING", "UNREALISTIC_COMPUTE_CONFIG"]),
            )
        with c3:
            quantity = st.number_input(
                "Instance quantity",
                min_value=1,
                value=int(compute_candidate.get("quantity") or 1),
                step=1,
                disabled="COMPUTE_QUANTITY_MISSING" not in codes,
            )

        s1, s2, s3 = st.columns(3)
        with s1:
            storage_gb = st.number_input(
                "Storage (GB)",
                min_value=0.0,
                value=float(compute_candidate.get("storageGB") or 100.0),
                step=10.0,
                disabled="COMPUTE_STORAGE_GB_MISSING" not in codes,
            )
        with s2:
            os_type = st.selectbox(
                "OS type",
                ["linux", "windows"],
                index=0 if str(compute_candidate.get("osType") or "linux") == "linux" else 1,
                disabled="COMPUTE_OS_MISSING" not in codes,
            )
        with s3:
            storage_type = st.selectbox(
                "Storage type",
                ["ssd", "hdd", "standard"],
                index=0,
                disabled="COMPUTE_STORAGE_TYPE_MISSING" not in codes,
            )

        d1, d2, d3 = st.columns(3)
        with d1:
            db_engine = st.selectbox(
                "Database engine",
                ["postgres", "mysql", "mssql", "none"],
                index=["postgres", "mysql", "mssql", "none"].index(str(db_candidate.get("engine") or "postgres")),
                disabled="DATABASE_ENGINE_MISSING" not in codes and "DATABASE_MISSING" not in codes,
            )
        with d2:
            db_storage = st.number_input(
                "DB storage (GB)",
                min_value=0.0,
                value=float(db_candidate.get("storageGB") or 100.0),
                step=10.0,
                disabled="DATABASE_MISSING" not in codes,
            )
        with d3:
            db_ha = st.checkbox(
                "Database HA",
                value=bool(db_candidate.get("ha", False)),
                disabled="DATABASE_HA_UNDEFINED" not in codes and "DATABASE_MISSING" not in codes,
            )

        data_egress = st.number_input(
            "Network egress (GB)",
            min_value=0.0,
            value=float(net_candidate.get("dataEgressGB") or 100.0),
            step=10.0,
            disabled="NETWORK_EGRESS_MISSING_OR_ZERO" not in codes and "NETWORK_MISSING" not in codes,
        )

        clarify_clicked = st.form_submit_button("Submit clarifications", use_container_width=True)

    if clarify_clicked:
        clarifications: Dict[str, Any] = {}

        if "REGION_MISSING" in codes:
            clarifications["region"] = region_value.strip()

        compute_patch: Dict[str, Any] = {}
        if "COMPUTE_CPU_MISSING" in codes or "UNREALISTIC_COMPUTE_CONFIG" in codes:
            compute_patch["vCPU"] = int(vcpu)
        if "COMPUTE_RAM_MISSING" in codes or "UNREALISTIC_COMPUTE_CONFIG" in codes:
            compute_patch["ramGB"] = float(ram_gb)
        if "COMPUTE_STORAGE_GB_MISSING" in codes:
            compute_patch["storageGB"] = float(storage_gb)
        if "COMPUTE_STORAGE_TYPE_MISSING" in codes:
            compute_patch["storageType"] = storage_type
        if "COMPUTE_QUANTITY_MISSING" in codes:
            compute_patch["quantity"] = int(quantity)
        if "COMPUTE_OS_MISSING" in codes:
            compute_patch["osType"] = os_type
        if compute_patch:
            clarifications["compute"] = [compute_patch]

        database_patch: Dict[str, Any] = {}
        if "DATABASE_ENGINE_MISSING" in codes or "DATABASE_MISSING" in codes:
            database_patch["engine"] = db_engine
        if "DATABASE_HA_UNDEFINED" in codes or "DATABASE_MISSING" in codes:
            database_patch["ha"] = bool(db_ha)
        if "DATABASE_MISSING" in codes:
            database_patch["storageGB"] = float(db_storage)
        if database_patch:
            clarifications["database"] = database_patch

        network_patch: Dict[str, Any] = {}
        if "NETWORK_EGRESS_MISSING_OR_ZERO" in codes or "NETWORK_MISSING" in codes:
            network_patch["dataEgressGB"] = float(data_egress)
        if network_patch:
            clarifications["network"] = network_patch

        try:
            with st.spinner("Validating clarifications..."):
                resp = submit_clarifications(candidate, clarifications)

            status = str(resp.get("status", "")).upper()
            if status == "VALID":
                requirement = resp.get("requirement")
                if not isinstance(requirement, dict):
                    raise AiExtractionApiError("Clarification response missing requirement object.")
                st.session_state["ce_requirement"] = requirement
                st.session_state["ce_extraction_candidate"] = None
                st.session_state["ce_clarification_questions"] = []
                st.session_state["ce_clarification_issues"] = []
                st.rerun()
            elif status == "NEEDS_CLARIFICATION":
                st.session_state["ce_extraction_candidate"] = resp.get("candidate")
                st.session_state["ce_clarification_questions"] = resp.get("questions", [])
                st.session_state["ce_clarification_issues"] = resp.get("issues", [])
                st.warning("More details are needed. Please review the new clarification list.")
            else:
                raise AiExtractionApiError("Unknown clarification status returned by backend.")
        except AiExtractionApiError as exc:
            st.error(str(exc))
        except Exception as exc:
            st.error(f"Unexpected clarification error: {exc}")

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

    requirement = st.session_state.get("ce_requirement")
    if not isinstance(requirement, dict):
        requirement = sample_requirement()

    payload = build_payload(selected_providers, region, requirement)

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
    st.dataframe(placeholder_df, use_container_width=True, hide_index=True)
    st.markdown(
        '<div class="section-note">Extract requirements from file (or use sample), then run Estimate.</div>',
        unsafe_allow_html=True,
    )
    st.markdown("</div>", unsafe_allow_html=True)
