from pathlib import Path

import streamlit as st


UI_DIR = Path(__file__).resolve().parent

home_page = st.Page(
    str(UI_DIR.parents[1] / "gpu-cost-estimator" / "frontend" / "app.py"),
    title="GPU Cost Estimator",
    icon="🌍",
    default=True,
)
cost_estimator_page = st.Page(
    str(UI_DIR.parents[1] / "cloud-cost-estimator" / "frontend" / "cost_estimator_page.py"),
    title="Cloud Cost Estimator",
    icon="🧮",
    url_path="cost-estimator",
)

navigation = st.navigation(
    [home_page, cost_estimator_page],
    position="sidebar",
)
navigation.run()
