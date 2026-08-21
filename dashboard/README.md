# Autonomous Project Builder Dashboard

Live steering and observability system for Hermes autonomous project builder runs on the host machine.

- **Service**: `autonomous-projects-dashboard.service`
- **URL**: `http://<hermes-hostname-or-ip>:9200/` or `http://127.0.0.1:9200/`
- **State root**: `~/.hermes/autonomous-projects`
- **Runner**: `~/.hermes/scripts/autonomous-project-midnight-runner.ts`

## Screenshot

![Steering cockpit](../docs/screenshots/steering-cockpit.png)

## Dynamic dashboard views

The dashboard provides twenty-three clean-slate clients, six full-control interface studies, and five preserved legacy views. A shared **Dashboards** directory in the lower-left corner links every view from every other view.

### Clean-slate clients

These clients share only the DOM-free `headless-dashboard-client.js` API/SSE layer. They do not load the legacy `app.js` renderer or `styles.css`, and each implements its own information architecture and interaction model.

1. **Radar (`/next/radar/index.html`)**: polar SVG operational picture.
2. **Daily Swarm (`/next/broadsheet/index.html`)**: vertically flowing editorial broadsheet.
3. **Swarm Sequencer (`/next/sequencer/index.html`)**: Canvas timeline with tracks, clips, markers, and transport controls.
4. **Operator Shell (`/next/operator-shell/index.html`)**: keyboard command environment with split text buffers.
5. **Control Table (`/next/control-table/index.html`)**: spreadsheet workbook with ARIA grid navigation.
6. **Field Guide (`/next/field-guide/index.html`)**: mobile-first guided operations binder.
7. **Constellation (`/next/constellation/index.html`)**: orbital SVG graph with a semantic network equivalent.
8. **Casefiles (`/next/casefiles/index.html`)**: evidence-focused case registry and authorization bureau.
9. **Patchbay (`/next/patchbay/index.html`)**: modular signal-routing control surface.
10. **Swarm Gallery (`/next/gallery/index.html`)**: room-based exhibition and curator workflow.
11. **Logic Analyzer (`/next/logic-analyzer/index.html`)**: digital waveform timing, bus packet decoder, and measurement cursors.
12. **SCADA PowerGrid (`/next/scada-powergrid/index.html`)**: high-voltage substation single-line diagram mimic and SBO switchgear.
13. **Flight Annunciator (`/next/flight-annunciator/index.html`)**: aerospace master warning & caution annunciator and split-legend switchboard.
14. **Broadcast Switcher (`/next/broadcast-switcher/index.html`)**: TV master control room multiviewer, PGM/PVW matrix, and T-bar fader.
15. **Audio Mixer (`/next/audio-mixer/index.html`)**: large-format summing desk, 8-stage channel strips, EBU R68 VU meters, and motorized faders.
16. **CNC Machining (`/next/cnc-machining/index.html`)**: 5-axis DRO coordinate readout, isometric 3D toolpath canvas, and G-code motion.
17. **Robotics Teleop (`/next/robotics-teleop/index.html`)**: planetary rover 3D digital twin, 6-DOF kinematics, and staged DSN uplink.
18. **Network NOC (`/next/network-noc/index.html`)**: global BGP-4 routing mesh, DWDM optical matrix, and ITU-T X.733 alarm triage.
19. **Microscope Spectrometry (`/next/microscope-spectrometry/index.html`)**: analytical SEM P31 phosphor CRT raster scan and EDX histogram.
20. **Reactor Core (`/next/reactor-core/index.html`)**: nuclear Class 1E safety console, 61-element hexagonal flux matrix, and armed SCRAM.
21. **Swarm Nebula (`/next/swarm-nebula/index.html`)**: Three.js instanced 3D command sphere with agent particles, run stars, blocker shockwaves, and ray picking.
22. **Flowfield Command (`/next/flowfield-command/index.html`)**: raw WebGL2 transform-feedback execution corridors, gate planes, emitters, and turbulence regions.
23. **Voxel Foundry (`/next/voxel-foundry/index.html`)**: raw WebGL2 instanced fabrication cell with voxel workpieces, robotic toolheads, spark particles, and GPU picking.

Research sources and applied design decisions are stored in each client directory. See [`docs/CLEAN_SLATE_FRONTENDS.md`](../docs/CLEAN_SLATE_FRONTENDS.md) for architecture and parity details.

### Earlier interface studies

1. **Command Center (`/command-center.html`)**: primary operator surface with full Studio feature parity, live priorities first, immediately reachable controls, and layouts tuned for 1080p through 4K.
2. **Flight Deck (`/flight-deck.html`)**: aerospace mission deck with annunciators, crew roster, evidence bay, and telemetry recorder.
3. **Briefing Room (`/briefing-room.html`)**: editorial intelligence dossier with front-page decisions, correspondents, sources, and live wire.
4. **Swarm Atlas (`/swarm-atlas.html`)**: cartographic field view with route coordinates, expedition agents, field station, and survey journal.
5. **Switchyard (`/switchyard.html`)**: industrial dispatch board with route blocks, crews, interlocks, and event recorder.
6. **Quiet Observatory (`/quiet-observatory.html`)**: spacious low-fatigue surface with observation channels, instrument shelf, notebooks, and time-series record.
7. **Studio (`/`)**: preserved original steering cockpit, current-step/live-activity summary, density/layout customization, orchestrator status, subagent stack, event console, and resource inspectors.
8. **Command Matrix (`/matrix.html`)**: high-density observability grid with swarm node status and tool telemetry.
9. **Timeline Stream (`/timeline.html`)**: chronological pipeline/event stream with time deltas and bottleneck cues.
10. **Developer Console (`/console.html`)**: terminal/IDE-style event and artifact inspection.
11. **Swarm Ops (`/ultimate.html`)**: expanded operational swarm view.

The complete UI parity contract is maintained in [`docs/DASHBOARD_FEATURE_MAP.md`](../docs/DASHBOARD_FEATURE_MAP.md).

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

`clear-queue` atomically clears active queue items, the pin, current objective, pending next-run request, run-now wake flag, and steering records structurally linked to those queue items. It preserves cleared queue and steering records in bounded history for audit, and intentionally does not resume paused or stopped work. The runner writes `runner-parity.json` on each successful locked tick. The dashboard reports `compatible`, `unverified`, or `incompatible` runner parity by comparing that durable receipt's source digest with the configured installed runner; verify parity before relying on a newly added runner-control protocol.

## Project planning cockpit

**Plan project** provides the persisted operator workflow: create a classic or managed draft, save revisions, submit a complete revision for review, approve or reject the exact revision, confirm launch, monitor identity/status reconciliation, and open run, iteration, artifact, and handoff views. The server, not a client-supplied actor, records planning authority as `local-operator`.

The planning records live under the configured state root:

```text
project-plans/index.json
project-plans/idempotency.json
project-plans/<plan-id>/ledger.json
project-plans/<plan-id>/revisions/000001.json
project-plans/<plan-id>/decisions/<decision-id>.json
project-plans/<plan-id>/launches/<launch-id>.json
control.json                         # projectLaunchRequest pointer
runs/<run-id>/approved-project-plan.json
runs/<run-id>/project-plan-approval.json
runs/<run-id>/project-launch.json
runs/<run-id>/artifacts/project-plan/*
```

`apb.project-plan.v1` revisions and `apb.project-plan-decision.v1` decisions are immutable files. `apb.project-plan-ledger.v1`, `apb.project-launch.v1`, and the `apb.project-launch-pointer.v1` are restart-safe projections whose status/version fields advance. The run-local planning files preserve the exact approved inputs. For managed runs, `lifecycle-contract.json` contains frozen inputs but is itself a mutable lifecycle projection.

Read APIs:

```text
GET /api/project-plans
GET /api/project-plans/:planId
GET /api/project-plans/:planId/revisions/:revision
```

All planning writes use `POST /api/project-plans/commands` with `schemaVersion: "apb.project-plan-command.v1"`. Implemented command types are `project-plan.create`, `project-plan.update`, `project-plan.ready-for-review`, `project-plan.approve`, `project-plan.reject`, `project-plan.launch`, `project-plan.clone`, `project-plan.fork`, and `project-plan.archive`.

Every command except create carries the current ledger `expectedVersion`; a stale value returns HTTP 409 without overwriting newer state. Create, approve, launch, clone, and fork require a bounded idempotency key. Retrying the same type, expected version, and payload returns the persisted original result without a second revision/decision/launch/audit transaction; reusing the key for a different subject returns HTTP 409.

Review and decision commands carry the current revision and SHA-256 content digest. Approval additionally binds the pipeline type in its digest-protected decision. Any later edit creates a new revision, resets state to `draft`, invalidates the effective approval, and requires review/approval again. Managed review validates the local Git root and resolves the named base ref into the exact `baseCommit`; launch accepts no repository, gate, limit, environment, or validation override.

Classic launches route to the existing single-agent SPEC/DEVPLAN/build/final-audit contract and have no managed iteration id. Managed launches route to the bounded worktree loop and preserve the approved repository/base commit, gate definitions/evidence paths, and limit snapshot even if `gates.json` or other dashboard projections later change. Both routes preserve normal source branches and never merge, push, deploy, or publish.

### Planning assistance

**Plan with orchestrator** starts or resumes a persisted `apb.plan-assistance.v1` conversation before a project plan exists. Each `project-plans/assistance/<assistance-id>.json` file records a version, server-authorized `classic` or `managed` pipeline, bounded redacted transcript, latest validated full `proposedContent`, and creation/update timestamps. Files are atomically replaced with mode `0600`.

```text
GET  /api/plan-assistance
POST /api/plan-assistance
GET  /api/plan-assistance/:id
POST /api/plan-assistance/:id/messages
```

Create accepts exactly `schemaVersion` and `pipelineType`; a message accepts exactly `schemaVersion`, `expectedVersion`, and `message`. Stale versions return structured HTTP 409 assistance errors. The server invokes only configured `HERMES_BIN` with the fixed no-tool planner argv, bounded runtime/output, server prompt, server environment, and assistance storage as cwd. Marked JSON is parsed strictly, and proposals pass the same project-content normalizer as persisted drafts. Managed `baseCommit` remains null and validation remains runner-selected with client commands disabled.

Assistance is not a plan command or authority path. It cannot call project-plan control, approval, launch, shell, files, web, terminal, skills, hooks, worktrees, or delegation. Invalid model output persists no turn or proposal. Messages may be sent to the configured inference provider; common secret shapes are redacted, but operators must not submit secrets. A suggestion remains inert until the operator explicitly chooses **Create persisted draft from proposal**; direct **New classic** and **New managed** remain available.

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

Legacy direct iteration command types include `start-next-iteration`, `continue-from-iteration`, `fork-from-iteration`, `use-as-next-direction`, `gate-decision`, and `attach-gate-evidence`. From a planning-cockpit launch, the Continue/Fork controls instead create a new clone/fork plan draft and require fresh exact approval before another launch.

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
