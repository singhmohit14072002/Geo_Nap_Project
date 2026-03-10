# Geo-NAP Monorepo

This repository is split into separate frontend and backend codebases so you can publish them independently.

## Folders
- `backend/geo-nap-platform/`: Node.js/TypeScript microservices backend (`planner`, `pricing`, `simulation`, `intelligence`, `recommendation`)
- `frontend/geo-nap-ui/`: Python Streamlit frontend + Geo-NAP placement engine + discovery scripts
- `services/geo-nap/`: convenience run scripts and architecture notes

## Architecture Overview

Geo-NAP is a distributed application strictly separated into a frontend and a containerized microservices backend.

### Backend (Node.js/TypeScript Microservices)
The backend consists of several independent microservices supported by robust data infrastructure:
- **Microservices:** `planner`, `pricing`, `simulation`, `intelligence`, `recommendation`, and `requirement-normalizer`.
- **Databases & Infrastructure:**
  - **PostgreSQL:** The primary relational database for persistent storage (e.g., application state, intelligence data).
  - **Redis:** Used for high-speed caching (such as pricing data) to reduce latency.
  - **RabbitMQ:** A message broker facilitating asynchronous, event-driven communication between microservices.
- **Deployment:** Containerized using Docker, orchestratable locally via Docker Compose.

### Frontend (Python Streamlit)
The user interface is built completely in Python using Streamlit.
- Provides interactive dashboards for the Geo-NAP placement engine, cost estimator, and system discovery.
- Connects synchronously to the backend REST APIs to fetch data and trigger simulations.

## Prerequisites
- **Docker & Docker Compose**: Required to run the backend microservices and databases.
- **Python 3.10+**: Required to run the frontend Streamlit application.
- **Node.js**: (Optional) For backend development and package management.

## Run Locally

### 1. Start the Backend
The backend consists of Node.js microservices and depends on PostgreSQL, Redis, and RabbitMQ.
It is containerized and can be started using Docker Compose.

**Using the provided script (Windows):**
```powershell
./services/geo-nap/backend/run.ps1
```

**Manual execution via Docker Compose:**
```bash
cd backend/geo-nap-platform
docker compose up --build
```
*Ensure all containers are healthy before using the frontend.*

### 2. Start the Frontend
The frontend is built with Python and Streamlit. You need to set up the Python environment and install the required packages.

**First-time Setup & Run Manually:**
```bash
cd frontend/geo-nap-ui

# Create a virtual environment
python -m venv .venv

# Activate the virtual environment
# On Windows:
.venv\Scripts\activate
# On macOS/Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run the Streamlit application
python -m streamlit run ui/router.py --server.address 127.0.0.1 --server.port 8501
```

**Using the provided script (Windows):**
*Note: Please ensure dependencies are already installed in `.venv` as shown above.*
```powershell
./services/geo-nap/frontend/run.ps1
```

Once both are running, access the application in your browser at: **http://127.0.0.1:8501**

## Independent GitHub Push
If you want separate GitHub repositories:
1. Push `frontend/geo-nap-ui` as one repo.
2. Push `backend/geo-nap-platform` as another repo.
