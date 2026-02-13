# Geo-NAP Frontend

Streamlit UI and Python Geo-NAP engine for network-aware multi-cloud GPU placement.

## Folder Layout
- `ui/app.py`: web application
- `engine.py`: placement and cost engine
- `live/`: provider discovery scripts
- `cache/providers.json`: discovered provider cache
- `models/`, `optimizer/`, `simulator/`: supporting modules and experiments

## Run Locally
From this folder (`frontend/geo-nap-ui`):

```powershell
python live/discover_all.py
python -m streamlit run ui/app.py --server.address 127.0.0.1 --server.port 8501
```

Or from repo root:

```powershell
./services/geo-nap/frontend/run.ps1
```
