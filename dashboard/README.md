# Autonomous Project Builder Dashboard

Live steering and observability system for Hermes autonomous project builder runs on the host machine.

- **Service**: `autonomous-projects-dashboard.service`
- **URL**: `http://<hermes-hostname-or-ip>:9200/` or `http://127.0.0.1:9200/`
- **State root**: `~/.hermes/autonomous-projects`
- **Runner**: `~/.hermes/scripts/autonomous-project-midnight-runner.ts`

## Screenshot

![Steering cockpit](../docs/screenshots/steering-cockpit.png)

## Dynamic dashboard views

The top navigation switches between 5 views:

1. **Studio (`/`)**: steering cockpit, current-step/live-activity summary, density/layout customization, orchestrator status, subagent stack, event console, and resource inspectors.
2. **Command Matrix (`/matrix.html`)**: high-density observability grid with swarm node status and tool telemetry.
3. **Timeline Stream (`/timeline.html`)**: chronological pipeline/event stream with time deltas and bottleneck cues.
4. **Developer Console (`/console.html`)**: terminal/IDE-style event and artifact inspection.
5. **Swarm Ops (`/ultimate.html`)**: expanded operational swarm view.

## Steering cockpit

The Studio view is a narrow local control plane, not an arbitrary shell. It can:

- add and pin next-build queue items,
- preserve Hermes-generated tournament ideas as queue candidates,
- add steering directives for current/next/global scope,
- add acceptance gates with required evidence,
- pause at a safe checkpoint,
- hold or resume future hourly launches,
- request a run on the next runner tick.

The dashboard writes only auditable JSON/JSONL control files:

```text
control.json
queue.json
gates.json
commands.jsonl
audit.jsonl
```

Pinned queue items are exported to `idea.txt` for compatibility with the existing runner prompt and are appended to the launched prompt as a hard selector override.

## Studio layout customization

The Studio view supports operator-local layout preferences for long-running dashboard sessions:

- **Density**: switch between comfortable, compact, and dense layouts to control spacing and information density.
- **Section visibility**: hide or show major Studio sections when focusing on live activity, artifacts, logs, or run control.
- **Collapse/expand state**: collapse major panels, collapse all agents, expand active agents, and preserve expanded agent/tool details across live refreshes.
- **Current step / live activity**: the active run generation, phase, task, last action, selected repo, active agents, and recent telemetry are surfaced as a concise run-progress deck.

These preferences are stored only in browser `localStorage` under `hermes.apb.dashboard.*`. They are presentation preferences, not runner commands, and they do not write `control.json`, `queue.json`, `gates.json`, or command/audit logs.

## Performance model

Live views receive state, event, and heartbeat updates over SSE. The server now tails the event file rather than reparsing the full JSONL history every tick, supports `after` cursors, and redacts secret-shaped strings on output. The browser coalesces live renders, caps raw/tool buffers, prevents duplicated polling loops, and avoids refreshing artifact/log listings on every heartbeat.

Inspector and drawer panes preserve their current DOM whenever the selected run, tab, artifact/log selection, and resource metadata have not changed. SPEC/DEVPLAN content is cached per run after loading so heartbeat refreshes do not flash the pane back to a loading state.

When updating dashboard renderers, prefer keyed reconciliation, capped lists, render scheduling, or render keys over wholesale `innerHTML` replacement for panels with scroll state, previews, expanded rows, or async document loads.


## Iteration and lineage controls

The dashboard is also the operator surface for bounded iteration, resume, and fork workflows.

Important concepts:

- **Run**: one runner invocation visible in the run list.
- **Iteration**: a bounded improvement pass attached to a run or source run.
- **Resume point**: the artifacts needed to continue later.
- **Fork**: a new iteration that keeps source evidence but explores a different direction.
- **Decision**: an auditable outcome attached to a gate, variant, synthesis, or operator command.

Supported command types include `start-next-iteration`, `continue-from-iteration`, `fork-from-iteration`, `use-as-next-direction`, `gate-decision`, and `attach-gate-evidence`.

Iteration lineage is exposed through:

```text
GET /api/iterations
GET /api/iterations/:id
```

Detailed iteration responses include run state, iteration state, source evidence, variants, evaluations, synthesis/mashup output, gate decisions, artifact listings, log listings, load warnings, and a redaction marker.

The flagship dashboard workflow is the Hermes Unique Showcase Website catalogue loop. Mission Control starts/pauses/stops it, shows generation progress, and lets an operator continue, fork, or promote accepted features as the next direction. The API command is `start-showcase-loop`; the bounded runner enforces variant, parallelism, accepted-feature, motif, and new-section caps.

## Iteration detail product view

The iteration inspector should stay evidence-first and lightweight:

- variant cards summarize the claim, changed files, diff availability, and links to evidence;
- evaluator tables compare rubric totals and hard-gate failures;
- synthesis panels separate accepted features from rejected features with rationale;
- gate matrices show pass/fail/needs-evidence status and evidence URLs;
- source ancestry shows source run, source iteration, base ref, mashup branch, and accepted commit;
- controls issue declarative commands only: continue, fork, use accepted direction, attach evidence, or record a gate decision.

Avoid dumping giant raw payloads into the DOM. Prefer capped summaries, lazy raw JSON expansion, and artifact links so long-running dashboard tabs remain usable.
