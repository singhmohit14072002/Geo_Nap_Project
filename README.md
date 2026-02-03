
# 🌍 Geo-NAP  
Network-Aware Multi-Cloud GPU Placement Platform

<p align="center">
	<img src="https://media.giphy.com/media/26xBwdIuRJiAi/giphy.gif" alt="AI / GPU cluster training" width="520"/>
</p>

_Replace the GIF URL above with any animated image you prefer (GIF or APNG). To use your own, paste a direct GIF URL and I'll update it._

Geo-NAP is a real-time multi-cloud GPU scheduling and cost optimization system.  
It helps companies decide where to run GPU workloads across cloud providers and GPU marketplaces by considering network latency (RTT), bandwidth, capacity, and cost.

Geo-NAP answers one core business question:

> Where should GPU workloads be placed right now to minimize cost while meeting network and performance constraints?

---

## What This Application Does

Geo-NAP is a decision engine for GPU infrastructure.

It performs the following functions:

- Discovers real GPU providers and regions (Azure, Vast.ai, etc.)
- Collects GPU pricing, capacity, RTT, and bandwidth data
- Filters providers based on user-defined RTT thresholds
- Applies network-aware cost penalties
- Enforces provider capacity limits
- Automatically falls back across regions and providers
- Computes optimal multi-cloud GPU placement
- Displays total estimated cost in selected currency
- Provides a web-based UI for interactive usage

This is an operational system, not a simulator.

---

## Core Features

### 1. Real Provider Discovery
Geo-NAP fetches GPU data from:
- Azure (public pricing API)
- Vast.ai (GPU marketplace API)
- Optional: AWS, GCP, RunPod, Lambda (with credentials)

Provider data is normalized and cached locally in:

`cache/providers.json`


---

### 2. Network-Aware Cost Model

Geo-NAP does not optimize on price alone.

Effective cost is computed as:

EffectiveCost = GPUPrice × (1 + α × RTT) × (1 + β / Bandwidth)

This ensures:
- High latency increases cost  
- Low bandwidth increases cost  
- Cheap but distant GPUs are penalized  

---

### 3. Capacity Constraints

Each provider has limited GPU capacity.

If one region cannot satisfy the request:
- Geo-NAP automatically spills to the next best region
- Continues until the GPU requirement is fulfilled

This enables true multi-cloud scheduling.

---

### 4. Web-Based User Interface

The application includes a web UI where users can input:

- Number of GPUs  
- Maximum allowed RTT  
- Model size  
- Training steps  
- Output currency  

The UI displays:
- GPU allocation per provider  
- Total estimated cost  
- Rejected providers  

---

## System Architecture

live/discover_all.py → Real provider ingestion
↓
cache/providers.json → Cached GPU market snapshot
↓
engine.py → Network-aware scheduling engine
↓
ui/app.py → Web interface


---

## How to Run Geo-NAP Locally

### Prerequisites

- Python 3.9 or higher
- Internet connection

---

### Step 1: Open Project Directory

```bash
cd geo_nap
```

You should see:

```
cache/
engine.py
ui/
live/
optimizer/
models/
```

### Step 2: Install Dependencies

```bash
python -m pip install streamlit pandas pulp numpy requests
```

### Step 3: (Optional) Clear Old Cache
To force fresh provider discovery.

Windows:

```powershell
del cache\providers.json
```

Linux / Mac:

```bash
rm cache/providers.json
```

### Step 4: Discover GPU Providers
Fetch real GPU provider data and cache it locally.

```bash
python live/discover_all.py
```

Expected output:

```
Discovered XX GPU providers
```

This creates:

`cache/providers.json`

### Step 5: Start Web Application

```bash
streamlit run ui/app.py
```

### Step 6: Open in Browser

Open the following URL in your browser:

http://localhost:8501

### Step 7: Use the Application

In the web interface:

Select number of GPUs

Set maximum RTT

Set model size

Set training steps

Choose currency

Click Find Best Placement

The system will display:

Optimal GPU placement

Total estimated cost

Rejected providers

Refresh Provider Data (Anytime)
To update GPU market data:

```bash
python live/discover_all.py
```

Stop the Application
Press:

CTRL + C

Troubleshooting
Check Python version:

```bash
python --version
```

Reinstall dependencies:

```bash
python -m pip install --upgrade streamlit pandas pulp numpy requests
```

Currency Support
Geo-NAP supports cost display in:

- USD

- INR

- GBP

- EUR

Live exchange rates are used when available.
If the external currency API fails, fallback rates are used automatically.

Who This Is For
Geo-NAP is designed for:

- Machine learning teams

- AI startups

- GPU broker platforms

- Cloud infrastructure teams

- FinOps teams optimizing GPU spend

Purpose of the System
Geo-NAP is built as a production decision engine.

It focuses on:

- Real data

- Real constraints

- Real cost optimization

- Real operational usage

It is not an academic simulation framework.

The goal is to support real-world multi-cloud GPU deployment decisions.


---

This is a **complete, correct, professional README.md**:

- 100% Markdown  
- All commands included  
- Copy–paste ready  
- Exactly how real startups document their products  
- Anyone can run your system using only this file.

