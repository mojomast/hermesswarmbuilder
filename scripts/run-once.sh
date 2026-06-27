#!/usr/bin/env bash
set -euo pipefail
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
BUN_BIN="${BUN_BIN:-$(command -v bun)}"
exec "$BUN_BIN" "$HERMES_HOME/scripts/autonomous-project-midnight-runner.ts"
