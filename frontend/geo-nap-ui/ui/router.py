from pathlib import Path

import streamlit as st


UI_DIR = Path(__file__).resolve().parent

home_page = st.Page(
    str(UI_DIR / "app.py"),
    title="Geo-NAP",
    icon="🌍",
    default=True,
)
cost_estimator_page = st.Page(
    str(UI_DIR / "cost_estimator_page.py"),
    title="Cost Estimator",
    icon="🧮",
    url_path="cost-estimator",
)

navigation = st.navigation(
    [home_page, cost_estimator_page],
    position="sidebar",
)
navigation.run()
