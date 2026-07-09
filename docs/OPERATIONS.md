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
curl http://127.0.0.1:9200/api/control
curl http://127.0.0.1:9200/api/queue
curl http://127.0.0.1:9200/api/gates
```

## Check cron

```bash
crontab -l | grep autonomous-project-midnight-runner
```

Expected line:

```cron
0 * * * * /path/to/bun ~/.hermes/scripts/autonomous-project-midnight-runner.ts >> ~/.hermes/autonomous-projects/logs/midnight-runner.log 2>&1
```

The file name remains `autonomous-project-midnight-runner.ts` for backward compatibility, but the installed schedule is hourly and non-overlapping.

## Steering from the browser

Open `http://127.0.0.1:9200/` and use **Steering Cockpit**:

- **Add to queue**: add a user idea or Hermes self-improvement idea.
- **Pin**: mark the next build target and export it to `idea.txt`.
- **Pause checkpoint**: ask the runner/orchestrator to pause at a safe boundary.
- **Hold new runs**: prevent future hourly launches until resumed.
- **Resume**: clear pause/hold/stop requests.
- **Run next tick**: record an audited run-now request for the next runner invocation.
- **Add gate**: add acceptance evidence required for the next spec/devplan/final audit.

These controls write local files under `~/.hermes/autonomous-projects` and do not expose shell execution.

### Continuous 10-generation showcase loop

Use **Run 10-generation showcase loop** when the goal is to browse a catalogue of versions of the same site rather than launch unrelated projects. The control writes:

- `control.autoIteration.enabled = true`
- `control.autoIteration.mode = "showcase-loop"`
- `targetGenerations` / `completedGenerations` / `currentGeneration`
- target `repoPath`, objective, and bounded caps
- a pending `control.nextRunRequest` for the first generation

The runner performs one bounded worktree generation, writes variant/evaluation/synthesis/gate artifacts, then queues the next generation from the accepted mashup commit. It self-spawns the next runner tick after a safe delay, so the loop continues without waiting for the hourly cron while still respecting the single-run lock.

Operator controls:

- **Pause loop**: pause at the next checkpoint without deleting loop configuration.
- **Resume loop**: clear pause/stop and allow the next queued generation.
- **Stop loop**: disable `autoIteration`, clear pending next-run request, and preserve completed generations.
- **Set target**: adjust the target from 1 to 10 generations.

API example:

```bash
curl -X POST http://127.0.0.1:9200/api/commands \
  -H 'content-type: application/json' \
  -d '{"type":"start-showcase-loop","payload":{"repoPath":"/home/mojo/autonomous-projects/hermes-showcase-site","targetGenerations":10}}'
```



## Resume, continue, and fork operations

Use iteration controls when improving or branching from previous work instead of starting a fresh project.

- **Start next iteration**: begin a bounded improvement pass for the current objective.
- **Continue from iteration**: keep pursuing the same direction from a previous run/iteration.
- **Fork from iteration**: branch from previous evidence into a different direction.
- **Use as next direction**: promote a prior result, variant, or synthesis into the next runner tick.

These commands write `control.nextRunRequest`, request the next runner tick, and update `iterations.json` lineage. The runner then creates the resume scaffold in the new run directory.

### Request a continuation by API

```bash
curl -X POST http://127.0.0.1:9200/api/commands \
  -H 'content-type: application/json' \
  -d '{
    "type": "continue-from-iteration",
    "actor": "operator",
    "payload": {
      "sourceRunId": "RUN_ID",
      "repoPath": "/absolute/path/to/repo",
      "objective": "Continue improving the selected project",
      "changeText": "Preserve the current direction and complete the next bounded generation."
    }
  }'
```

### Request a fork by API

```bash
curl -X POST http://127.0.0.1:9200/api/commands \
  -H 'content-type: application/json' \
  -d '{
    "type": "fork-from-iteration",
    "actor": "operator",
    "payload": {
      "sourceRunId": "RUN_ID",
      "sourceIterationId": "ITERATION_ID",
      "repoPath": "/absolute/path/to/repo",
      "objective": "Explore an alternate direction from the prior evidence",
      "changeText": "Use the same source evidence but pursue a different synthesis."
    }
  }'
```

### Inspect iteration lineage

```bash
curl http://127.0.0.1:9200/api/iterations
curl http://127.0.0.1:9200/api/iterations/ITERATION_ID
```

### Future agent cannot resume

Check that the previous run has `iteration-state.json`, `artifacts/source-evidence.json`, `artifacts/synthesis/synthesis.json`, `artifacts/gate-decisions.json`, and `artifacts/artifact-manifest.json`. Then inspect `/api/iterations` and `/api/control`. If `control.nextRunRequest` is missing, issue `continue-from-iteration` or `fork-from-iteration` again.

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
print(json.dumps({k:s.get(k) for k in ['currentRunId','status','phase','task','lastAction','selectedProject','repoPath','qualityGate','updatedAt']}, indent=2))
PY
```


## Cleanup and browser validation gates

Before accepting a generated web/browser project, require evidence for cleanup and visual/browser quality. These gates keep the Builder from shipping impressive-looking but unverified slop.

Required evidence for UI projects:

- dependency install/build/test commands that passed,
- Playwright or browser smoke coverage when the project has a UI,
- generated artifact cleanup,
- no committed `node_modules`, build output, screenshots, videos, traces, run logs, temp worktrees, `.db`, `.npy`, `.pt`, or secret files,
- `git status --short` clean except intended source/docs/test/config changes before committing.

Useful operator checks:

```bash
git status --short
git diff --stat
git worktree list
git worktree prune
```

Suggested browser gate evidence:

```bash
npm test            # or bun test / pnpm test, depending on the project
npm run build
npx playwright test # when Playwright is configured
```

Treat `npx playwright install --with-deps` as an operator-controlled setup step. Browser binaries, traces, screenshots, videos, and Playwright caches are runtime/generated evidence; list them in artifacts when useful, but do not commit them as source unless they are intentionally curated documentation assets.

## Common issues

### Dashboard does not load

- Check Bun path in `~/.config/systemd/user/autonomous-projects-dashboard.service`.
- Check port conflicts: `ss -ltnp '( sport = :9200 )'`.
- Check service logs: `journalctl --user -u autonomous-projects-dashboard.service -n 100 --no-pager`.

### Browser gets slow

- Check `~/.hermes/autonomous-projects/events.jsonl` size.
- Current server builds tail/cursor responses, but old installed copies may still full-parse the file. Re-run `./scripts/install.sh` and restart the service.
- Close duplicate dashboard tabs if the browser has many active SSE connections.

### Runs overlap

The runner uses `~/.hermes/autonomous-projects/autonomous-project.lock`. If a process died and left a stale lock, inspect the PID file before removing it.

### Artifacts/log previews are stale

The browser caches previews per run/file in memory to avoid flashing during SSE updates. Refresh the page to clear the in-memory preview cache.

### A generated project is too weak

Use the Steering Cockpit to add stricter gates and pin an improvement pass for the same repo. You can also edit `~/.hermes/autonomous-projects/runner-prompt.md` for global policy changes.
