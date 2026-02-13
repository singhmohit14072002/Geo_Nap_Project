Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot "..\..\..\frontend\geo-nap-ui")
python -m streamlit run ui/router.py --server.address 127.0.0.1 --server.port 8501
