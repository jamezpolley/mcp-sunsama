$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$env:SUNSAMA_EMAIL = "op://Private/Sunsama/email"
$env:SUNSAMA_PASSWORD = "op://Private/Sunsama/password"
op run --account T26JAJX2KFGJ7PCGFCVGVYHOHA -- node dist/main.js
