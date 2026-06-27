#!/usr/bin/env bash
set -euo pipefail
WEB_HUB="${WEB_HUB:-$HOME/.hermes/web-hub/index.html}"
PORT="${PORT:-9200}"
HOST="${PUBLIC_HOST:-$(hostname -f 2>/dev/null || hostname)}"
if [[ ! -f "$WEB_HUB" ]]; then
  echo "web hub not found: $WEB_HUB" >&2
  exit 1
fi
if grep -q "Autonomous Project Builder" "$WEB_HUB"; then
  echo "Autonomous Project Builder card already present."
  exit 0
fi
python3 - "$WEB_HUB" "$HOST" "$PORT" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]); host=sys.argv[2]; port=sys.argv[3]
s=p.read_text()
card = f"""
      <a class=\"card\" href=\"http://{host}:{port}/\">
        <h2>Autonomous Project Builder <span class=\"port\">:{port}</span></h2>
        <p>Live cockpit for local autonomous project selection, reviewed specs/devplans, subagent orchestration, blockers, artifacts, logs, and validated completion.</p>
        <div class=\"meta\"><span class=\"pill\">midnight cron</span><span class=\"pill\">read-only monitor</span></div>
      </a>
"""
idx=s.rfind('</main>')
if idx == -1: idx=s.rfind('</body>')
p.write_text(s[:idx]+card+s[idx:])
PY
