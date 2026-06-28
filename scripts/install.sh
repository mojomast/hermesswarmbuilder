#!/usr/bin/env bash
set -euo pipefail
PORT="${PORT:-9200}"
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
STATE_ROOT="${AUTONOMOUS_PROJECTS_STATE_ROOT:-$HERMES_HOME/autonomous-projects}"
DASHBOARD_DIR="${AUTONOMOUS_PROJECTS_DASHBOARD_DIR:-$HERMES_HOME/autonomous-projects-dashboard}"
SCRIPTS_DIR="$HERMES_HOME/scripts"
BUN_BIN="${BUN_BIN:-$(command -v bun || true)}"
INSTALL_CRON="${INSTALL_CRON:-1}"
INSTALL_SERVICE="${INSTALL_SERVICE:-1}"

if [[ -z "$BUN_BIN" ]]; then
  echo "bun is required. Install Bun or set BUN_BIN=/path/to/bun" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$STATE_ROOT/runs" "$STATE_ROOT/logs" "$STATE_ROOT/artifacts" "$SCRIPTS_DIR"
rm -rf "$DASHBOARD_DIR"
mkdir -p "$DASHBOARD_DIR"
cp -R "$REPO_ROOT/dashboard/." "$DASHBOARD_DIR/"
cp "$REPO_ROOT/runner/autonomous-project-midnight-runner.ts" "$SCRIPTS_DIR/autonomous-project-midnight-runner.ts"
cp "$REPO_ROOT/telemetry/telemetry.py" "$STATE_ROOT/telemetry.py"
cp "$REPO_ROOT/prompts/runner-prompt.md" "$STATE_ROOT/runner-prompt.md"
chmod +x "$SCRIPTS_DIR/autonomous-project-midnight-runner.ts" "$STATE_ROOT/telemetry.py"

if [[ ! -f "$STATE_ROOT/state.json" ]]; then
  cat > "$STATE_ROOT/state.json" <<JSON
{
  "schemaVersion": "apb.state.v1",
  "currentRunId": null,
  "status": "idle",
  "phase": "idle",
  "updatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "agents": {},
  "decisions": [],
  "capabilities": { "readOnlyDashboard": true, "browserTerminal": false, "scheduledRunner": true }
}
JSON
fi
[[ -f "$STATE_ROOT/events.jsonl" ]] || : > "$STATE_ROOT/events.jsonl"

if [[ "$INSTALL_SERVICE" == "1" ]]; then
  mkdir -p "$HOME/.config/systemd/user"
  sed \
    -e "s#{{DASHBOARD_DIR}}#$DASHBOARD_DIR#g" \
    -e "s#{{BUN_BIN}}#$BUN_BIN#g" \
    -e "s#{{PORT}}#$PORT#g" \
    -e "s#{{STATE_ROOT}}#$STATE_ROOT#g" \
    "$REPO_ROOT/systemd/autonomous-projects-dashboard.service.template" > "$HOME/.config/systemd/user/autonomous-projects-dashboard.service"
  systemctl --user daemon-reload
  systemctl --user enable autonomous-projects-dashboard.service
  if systemctl --user is-active --quiet autonomous-projects-dashboard.service; then
    systemctl --user restart autonomous-projects-dashboard.service
  else
    systemctl --user start autonomous-projects-dashboard.service
  fi
fi

if [[ "$INSTALL_CRON" == "1" ]]; then
  CRON_LINE="0 0 * * * $BUN_BIN $SCRIPTS_DIR/autonomous-project-midnight-runner.ts >> $STATE_ROOT/logs/midnight-runner.log 2>&1"
  TMP="$(mktemp)"
  crontab -l 2>/dev/null | grep -vF "$SCRIPTS_DIR/autonomous-project-midnight-runner.ts" > "$TMP" || true
  {
    cat "$TMP"
    echo ""
    echo "# Hermes Swarm Builder midnight workflow (non-overlapping; dashboard on :$PORT)"
    echo "$CRON_LINE"
  } | crontab -
  rm -f "$TMP"
fi

HOST="${PUBLIC_HOST:-$(hostname -f 2>/dev/null || hostname)}"
cat <<OUT
Hermes Swarm Builder installed.
Dashboard service: autonomous-projects-dashboard.service
State root: $STATE_ROOT
Runner: $SCRIPTS_DIR/autonomous-project-midnight-runner.ts
Prompt: $STATE_ROOT/runner-prompt.md
Telemetry helper: $STATE_ROOT/telemetry.py

Open the dashboard:
  http://$HOST:$PORT/

Local check:
  curl -I http://127.0.0.1:$PORT/
OUT
