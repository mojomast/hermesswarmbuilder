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
curl http://127.0.0.1:9200/api/project-plans
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

Layout-only controls are also available in the dashboard and are separate from steering commands:

- **Density**: choose compact/comfortable/dense spacing for the current browser.
- **Hide/show sections**: reduce visual noise by hiding panels that are not needed during the current operation.
- **Collapse all / expand active**: quickly compress subagent/tool detail or expand only active work.
- **Current step / live activity**: use the run-progress summary to see the active generation, phase, task, last action, repo, and recent telemetry before opening logs or raw JSON.

Steering controls write local files under `~/.hermes/autonomous-projects` and do not expose shell execution. Layout controls are browser-local `localStorage` preferences and do not affect runner state.

## Planning cockpit workflow

Use **Plan project** for reviewed launches:

1. Create a classic fresh-build draft or managed existing-repository draft. Save writes immutable child revisions.
2. Complete problem/users/objective/scope, requirements, non-goals, constraints, risks, gates/evidence paths, validation expectations, milestones, and bounded limits. Managed plans also require an absolute local Git root and explicit base ref.
3. Submit for review. The server validates the complete `apb.project-plan.v1`; for managed work it resolves the repo root and freezes the full `baseCommit` in the review revision.
4. Review the displayed revision number and digest, then approve or reject it. Approval is an append-only decision bound to that plan, revision, digest, and pipeline type; it is launch authority, not gate or completion evidence.
5. Confirm the no-source-branch-mutation/manual-promotion boundary and launch. No launch-time override is accepted.
6. Monitor distinct plan, approval, launch, request, run, and managed iteration ids. Review gate evidence and terminal handoff; promote an accepted managed branch/commit only through a separate manual operator action.

Any edit after review or approval creates a new revision, returns the ledger to `draft`, and clears effective approval. The historical decision remains for audit but cannot launch the new content. An active launch cannot be edited or archived.

Planning storage is `~/.hermes/autonomous-projects/project-plans/`: global `index.json` and `idempotency.json`, then `<plan-id>/ledger.json`, `revisions/000001.json`, `decisions/<decision-id>.json`, and `launches/<launch-id>.json`. The pending pointer is `control.json.projectLaunchRequest`. On claim, exact planning snapshots appear as `runs/<run-id>/{approved-project-plan.json,project-plan-approval.json,project-launch.json}` and duplicate copies under `runs/<run-id>/artifacts/project-plan/`.

### Planning API

```text
GET  /api/project-plans
GET  /api/project-plans/:planId
GET  /api/project-plans/:planId/revisions/:revision
POST /api/project-plans/commands
```

The POST body uses `apb.project-plan-command.v1`. Supported types are `project-plan.create`, `project-plan.update`, `project-plan.ready-for-review`, `project-plan.approve`, `project-plan.reject`, `project-plan.launch`, `project-plan.clone`, `project-plan.fork`, and `project-plan.archive`.

```json
{
  "schemaVersion": "apb.project-plan-command.v1",
  "type": "project-plan.approve",
  "idempotencyKey": "approve-operator-generated-id",
  "expectedVersion": 4,
  "payload": {
    "planId": "plan-...",
    "revision": 3,
    "planDigest": "sha256:...",
    "notes": "Reviewed exact scope and safety boundary"
  }
}
```

Use the current `ledger.version` as `expectedVersion` on every command after create; clone/fork compare it to the source ledger. Stale values return HTTP 409. Create, approve, launch, clone, and fork require idempotency keys. An identical type/expected-version/payload retry returns the original persisted result; key reuse with a different subject returns HTTP 409. The actor is derived server-side as `local-operator`, regardless of a client `actor` field.

Do not add shell, argv, command, script, executable, environment, or validation-command fields. Planning validation policy must be `apb.runner-selected.v1` with `clientCommandsAllowed: false`; launch payload is only the exact plan id, revision, and digest.

### Continuous 10-generation showcase loop

Use **Run 10-generation showcase loop** when the goal is to browse a catalogue of versions of the same site rather than launch unrelated projects. The control writes:

- `control.autoIteration.enabled = true`
- `control.autoIteration.mode = "showcase-loop"`
- `targetGenerations` / `completedGenerations` / `currentGeneration`
- target `repoPath`, objective, and bounded caps
- a pending `control.nextRunRequest` for the first generation

The runner performs one bounded worktree generation, writes variant/evaluation/synthesis/gate artifacts, then queues the next generation from the accepted mashup commit. It self-spawns the next runner tick after a safe delay, so the loop continues without waiting for the hourly cron while still respecting the single-run lock.

Each managed run freezes approved inputs and configured gates while creating `lifecycle-contract.json`. That file is a mutable progress projection: lifecycle state, base resolution, blockers, checkpoints, and terminal timestamps change during execution, while approved planning inputs remain preserved in their run-local snapshots. Validation commands are selected by runner policy from the repository; dashboard/client-provided command strings are never executed. Inspect `artifacts/handoff.json` for the accepted branch/commit and exact review/promotion action, or for the blocker/pause reason and safe recovery action. Promotion is always manual: the runner does not merge, push, deploy, publish, or change the normal source branch.

Preflight expectations:

- `repoPath` is absolute and points at a git repo.
- The repo is clean before launch. Commit, stash, or intentionally discard local/generated files first; do not rely on the runner to guess.
- `baseRef` resolves, usually `HEAD` or the previous accepted mashup commit.
- Runtime worktrees are created under the run root, not inside the source repo.

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

For a run launched from a project plan, use the run/iteration Continue or Fork action to create a new clone/fork plan in `draft`. Inspect and edit that draft, then submit, approve, and launch it as a new transaction. Pause and graceful stop preserve the current managed run at the next checkpoint, update the existing launch to `paused`, and write a handoff; they do not make the same approved launch reclaimable. Continue/fork therefore uses a new plan and exact approval rather than mutating the old launch.

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
curl -sS -o /tmp/apb-iterations.json http://127.0.0.1:9200/api/iterations
curl -sS -o /tmp/apb-iteration-detail.json http://127.0.0.1:9200/api/iterations/ITERATION_ID
```

Do not pipe downloaded dashboard JSON directly into shell or language interpreters. Save it to a file first, then inspect it with a trusted tool.

Useful fields in the detail response:

- `iterationState`: objective, source run, base ref, generation limits, and status.
- `variants`: variant JSON claims plus captured diffs.
- `evaluations`: scores, hard-gate findings, and evaluator rationale.
- `synthesis`: accepted/rejected features and mashup lineage.
- `gateDecisions`: pass/fail/needs-evidence decisions and links.
- `sourceEvidence`: resume/fork ancestry.
- `artifacts` / `logs`: bounded listings for deeper inspection.

### Future agent cannot resume

Check that the previous run has `lifecycle-contract.json`, `iteration-state.json`, `artifacts/source-evidence.json`, `artifacts/synthesis/synthesis.json`, `artifacts/gate-decisions.json`, `artifacts/handoff.json`, and `artifacts/artifact-manifest.json`. Then inspect `/api/iterations` and `/api/control`. If `control.nextRunRequest` is missing or terminal, issue `continue-from-iteration` or `fork-from-iteration` again using the handoff's safe recovery action.

### Restart and rejected-launch recovery

- Dashboard restart is safe: plans, revisions, decisions, idempotency results, launches, and ledger versions are disk-backed. Reload the planner and use the latest version; do not retry a stale unsaved edit blindly.
- A pending, unclaimed launch remains in `control.json` and can be claimed by a later runner tick. Runner locking prevents concurrent claims.
- A claimed launch has run-local planning snapshots. If the runner process dies, do not recreate or edit those snapshots and do not assume the `running` launch is automatically resumed. Inspect the run root and logs, then clone/fork to a new draft and obtain a new approval/launch when recovery requires more work.
- A malformed, stale, tampered, already-claimed, or no-longer-approved pointer is marked `rejected` before Hermes work and global state becomes blocked. Preserve the records for audit, correct the source conditions, then clone/fork into a new draft and launch only after fresh review and approval. Never repair a digest or id in place.
- For managed preflight rejection or later blocking, use `artifacts/handoff.json` when present. Confirm the approved base ref still resolves to the approved full commit, the repo is clean, required evidence is available, and runner-selected validation can pass.

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

### Repository verification

The implemented planning contract is covered by:

```bash
bun scripts/project-plans-helper-smoke.ts
bun scripts/smoke-runner-project-launch.ts
bun run --cwd dashboard check
node scripts/smoke-runner-managed-lifecycle.mjs
node scripts/smoke-runner-classic-evidence-contract.mjs
node scripts/smoke-runner-classic-completion.mjs
node scripts/smoke-runner-progress-budget.mjs
node scripts/smoke-runner-scaffold.mjs
node scripts/smoke-dashboard-iteration.mjs
git diff --check
```

The end-to-end project-launch smoke exercises the real dashboard and runner with temporary state/repositories: restart persistence, immutable revisions, stale-version conflicts, exact approval invalidation, idempotent launch, classic/managed routing, exact base/gate/limit snapshots, identity reconciliation, handoff visibility, command rejection, and source-branch preservation.

Manual browser checks should cover desktop and narrow/mobile layouts: open **Plan project**; create and persist both draft types; verify dirty-edit protection and refresh conflict messaging; submit a managed plan and confirm the resolved full base commit; approve/reject exact revisions; verify editing invalidates approval; confirm launch requires the safety checkbox; watch launch/request/run/iteration status refresh; open run, iteration, artifacts, and managed handoff links; exercise terminal Continue/Fork draft creation; restart the dashboard and confirm state returns. Also verify no arbitrary command field is presented, secret-shaped API output is redacted, keyboard focus remains usable, and the normal source branch remains unchanged.

## Common issues

### Dashboard does not load

- Check Bun path in `~/.config/systemd/user/autonomous-projects-dashboard.service`.
- Check port conflicts: `ss -ltnp '( sport = :9200 )'`.
- Check service logs: `journalctl --user -u autonomous-projects-dashboard.service -n 100 --no-pager`.

### Browser gets slow

- Check `~/.hermes/autonomous-projects/events.jsonl` size.
- Current server builds tail/cursor responses, but old installed copies may still full-parse the file. Re-run `./scripts/install.sh` and restart the service.
- Close duplicate dashboard tabs if the browser has many active SSE connections.

- Switch the Studio view to compact or dense layout and hide/collapse sections that are not needed for the current inspection. These settings are browser-local and can be reset from the Sections menu or by clearing dashboard site data.

### Runs overlap

The runner uses `~/.hermes/autonomous-projects/autonomous-project.lock`. If a process died and left a stale lock, inspect the PID file before removing it.

### Artifacts/log previews are stale

The browser caches previews per run/file in memory to avoid flashing during SSE updates. Refresh the page to clear the in-memory preview cache.

### Managed loop blocks immediately

Check the run's `artifacts/gate-decisions.json`, `run.json`, and runner log. Common causes are dirty target repo, missing git repo, invalid base ref, existing stale worktree path, no valid variant artifact, or failed validation command. Fix the target repo or gate evidence, then issue `continue-from-iteration` or restart the showcase loop.

### A generated project is too weak

Use the Steering Cockpit to add stricter gates and pin an improvement pass for the same repo. For the showcase site, prefer another bounded generation or fork with a specific taste/quality directive rather than broad prompt churn. You can also edit `~/.hermes/autonomous-projects/runner-prompt.md` for global policy changes.
