#!/bin/bash
# Used on Linux/macOS/WSL. On Windows, .mcp.json invokes run.ps1 instead.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export SUNSAMA_EMAIL="op://Private/Sunsama/email"
export SUNSAMA_PASSWORD="op://Private/Sunsama/password"
exec op run --account T26JAJX2KFGJ7PCGFCVGVYHOHA -- node "$SCRIPT_DIR/dist/main.js"
