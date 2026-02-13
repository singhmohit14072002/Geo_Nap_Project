Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot "..\..\..\backend\geo-nap-platform")
docker compose up --build
