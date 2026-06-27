# Operations

## Start/stop dashboard

```bash
systemctl --user start autonomous-projects-dashboard.service
systemctl --user stop autonomous-projects-dashboard.service
systemctl --user restart autonomous-projects-dashboard.service
systemctl --user status autonomous-projects-dashboard.service --no-pager
```

## Check dashboard

```bash
curl -I http://127.0.0.1:9200/
curl http://127.0.0.1:9200/api/state
curl 'http://127.0.0.1:9200/api/events?limit=5'
```

## Check cron

```bash
crontab -l | grep autonomous-project-midnight-runner
```

Expected line:

```cron
0 0 * * * /path/to/bun ~/.hermes/scripts/autonomous-project-midnight-runner.ts >> ~/.hermes/autonomous-projects/logs/midnight-runner.log 2>&1
```

## Trigger a run manually

```bash
bun ~/.hermes/scripts/autonomous-project-midnight-runner.ts \
  >> ~/.hermes/autonomous-projects/logs/manual-runner-$(date +%Y%m%d-%H%M%S).log 2>&1
```

## Inspect current run

```bash
python3 - <<'PY'
import json
from pathlib import Path
s=json.load(open(Path.home()/'.hermes/autonomous-projects/state.json'))
print(json.dumps({k:s.get(k) for k in ['currentRunId','status','phase','task','lastAction','updatedAt']}, indent=2))
PY
```

## Common issues

### Dashboard does not load

- Check Bun path in `~/.config/systemd/user/autonomous-projects-dashboard.service`.
- Check port conflicts: `ss -ltnp '( sport = :9200 )'`.
- Check service logs: `journalctl --user -u autonomous-projects-dashboard.service -n 100 --no-pager`.

### Runs overlap

The runner uses `~/.hermes/autonomous-projects/autonomous-project.lock`. If a process died and left a stale lock, inspect the PID file before removing it.

### Artifacts/log previews are stale

The browser caches previews per run/file in memory to avoid flashing during SSE updates. Refresh the page to clear the in-memory preview cache.

### A generated project is too weak

Edit `~/.hermes/autonomous-projects/runner-prompt.md` and strengthen the steering directive or quality gates before triggering the next run.
