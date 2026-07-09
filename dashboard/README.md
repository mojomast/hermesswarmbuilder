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

1. **Studio (`/`)**: steering cockpit, orchestrator status, subagent stack, event console, and resource inspectors.
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
