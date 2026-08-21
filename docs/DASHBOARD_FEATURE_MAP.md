# Dashboard Feature Map

This map is the parity contract for the legacy Studio at `/` and the six full-control interface studies. Each study deliberately reuses `dashboard/public/app.js`; every action below therefore has the same API, persistence, safety checks, and live-update behavior across the set.

## Full-Control Interface Studies

- `/command-center.html`: balanced operational command surface.
- `/flight-deck.html`: aerospace mission flight deck.
- `/briefing-room.html`: editorial intelligence briefing room.
- `/swarm-atlas.html`: cartographic expedition atlas.
- `/switchyard.html`: industrial rail dispatch board.
- `/quiet-observatory.html`: low-fatigue scientific observatory.

Every dashboard, including the five legacy tools, loads `dashboard-directory.js`. Its fixed directory links all eleven live surfaces without duplicating navigation data in each implementation.

## Global And Live State

- Sixteen-state workflow strip from idle through published.
- Current run, project, phase, SPEC adherence, DEVPLAN adherence, and update time.
- Server-sent event stream with polling fallback, pause/resume, manual refresh, and connection state.
- Global telemetry search, density modes, section visibility, section collapse, keyboard search (`/`), density (`D`), and escape handling.
- Browser-local persistence for run, agent, inspector, telemetry tab, expansion, follow, density, section layout, and console height.

## Operational Overview

- Current/selected run identity, objective, blocker or hold reason, actionable requests, queue count, and pending plan count.
- Context-sensitive safe action, current-run focus, selected-run inspection, Mission Control access, and Project Planner access.
- Current generation, phase, live activity, task, active-agent count, blocker, elapsed time, repository, and recent decisions.
- Explicit blocker recovery with a bounded operator prompt, optional Hermes advice, approve/deny decision, and pending deblock requests.

## Mission Control

- Start a bounded ten-generation showcase loop.
- Pause, resume, or stop the loop; hold future runs; start one bounded generation.
- Set generation target from one through ten.
- Display repository, objective, current/completed generation, loop state, variant limit, parallel limit, accepted-feature limit, motif-change limit, new-section limit, and plateau stop.
- Add scoped, prioritized steering and remove active steering.
- Add, immediately pin, pin later, archive, or promote a next-build queue item.
- Add acceptance gates with phase, severity, and required evidence.
- Record gate pass or needs-evidence decisions against a run.
- Browse relevant iterations and create continuation, fork, or accepted-direction plan drafts.
- Display recent control audit records and iteration lineage.

## Runs, Agents, And Telemetry

- Select historical/current runs and load their run JSON, artifacts, and logs.
- List declared and event-inferred agents with deterministic workflow-role ordering.
- Filter all activity, active agents, tools, errors, or artifacts.
- Expand/collapse individual agents, all agents, or active agents.
- Inspect role, phase, task, current artifact, block state, recent message, event tail, and raw agent state.
- Reconstruct tool lifecycles with name, action, status, duration, input, output, error, agent, call ID, and raw payload.
- Docked Events, Tool Calls, Logs, Artifacts, and Raw SSE feeds with follow mode and resizable height.

## Evidence Inspector

- Agent details and raw projected state.
- SPEC and DEVPLAN previews with adherence state and filename fallbacks.
- Recursive artifact index with bounded, cached inline previews.
- Log index with cached bounded tails.
- Raw selected-run JSON.
- Evidence-first iteration detail: identities, repository, commit, tests, screenshots, source links, variant scorecards, rubric values, verdicts, synthesis, accepted/rejected features, gate matrix, and raw source/evaluation/synthesis/gate/detail payloads.

## Project Planning

- Start/resume a bounded planning-orchestrator conversation for classic or managed pipelines.
- Create a persisted draft from a validated proposal, or directly create classic/managed plans.
- Edit title, problem, users, objective, bounded scope, requirements, non-goals, constraints, risks, repository/base ref, acceptance gates/evidence, validation expectations, milestones, delivery limits, and lineage.
- Save immutable revisions with optimistic concurrency and field-level validation.
- Submit for review, inspect the exact digest-bound revision, approve, or reject with notes.
- Confirm the source-branch/promotion safety boundary and launch the exact approved revision.
- Track plan, approval, launch, request, run, and iteration identities.
- Open a launched run/iteration and create continuation or fork drafts for another reviewed launch.
- Focus trap, mobile planning panes, unsaved-change warning, save/conflict/error state, and privacy disclosure.

## Supporting Views

- `/matrix.html`: dense swarm and telemetry matrix.
- `/timeline.html`: chronological waterfall and bottleneck analysis.
- `/console.html`: terminal/IDE-style telemetry and resource browser.
- `/ultimate.html`: topology and expanded subagent deck.
- `/`: original Studio, preserved as the legacy full-control dashboard.

## Backend-Only Capabilities

The server additionally accepts ordinary stop, set-current-objective, gate update, gate evidence attachment, queue clear, and plan archive commands. These were not dedicated controls in the legacy Studio and are intentionally not claimed as UI parity.
