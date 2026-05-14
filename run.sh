#!/bin/bash
# Credential refs (SUNSAMA_EMAIL, SUNSAMA_PASSWORD) come from env.
#
# First-time setup: run `npm install && npm run build` in this directory.
# Without dist/main.js the launcher errors and the MCP client sees -32000.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec /home/james/git/claude/expert-couscous/op-run-mcp.sh node "$SCRIPT_DIR/dist/main.js"
