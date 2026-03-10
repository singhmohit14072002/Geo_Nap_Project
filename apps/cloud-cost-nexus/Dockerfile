FROM python:3.11-slim AS build

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.11-slim AS runtime

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV STREAMLIT_SERVER_PORT=8501
ENV STREAMLIT_SERVER_HEADLESS=true
ENV STREAMLIT_BROWSER_GATHER_USAGE_STATS=false

COPY --from=build /install /usr/local
COPY . .

EXPOSE 8501
CMD ["streamlit", "run", "ui/router.py", "--server.port=8501", "--server.address=0.0.0.0", "--server.headless=true"]
