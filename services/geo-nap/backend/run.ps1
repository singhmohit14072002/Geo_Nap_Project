Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot "..\..\..\apps\gpu-cost-estimator\backend")
docker compose up --build
