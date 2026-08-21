# Clean-Slate Frontends

The ten clients under `dashboard/public/next/` are independent frontend implementations. They share the server contract and `headless-dashboard-client.js`, but no renderer, stylesheet, DOM structure, or design system.

| Client | Primary model | Route |
|---|---|---|
| Radar | Polar SVG tracks and target scope | `/next/radar/index.html` |
| Daily Swarm | Editorial document and live news wire | `/next/broadsheet/index.html` |
| Sequencer | Canvas timeline, tracks, clips, and transport | `/next/sequencer/index.html` |
| Operator Shell | Command grammar and split text buffers | `/next/operator-shell/index.html` |
| Control Table | Spreadsheet workbook and ARIA grid | `/next/control-table/index.html` |
| Field Guide | Mobile guided tasks and field binder | `/next/field-guide/index.html` |
| Constellation | Orbital SVG graph and semantic tables | `/next/constellation/index.html` |
| Casefiles | Case folders, exhibits, and authorization records | `/next/casefiles/index.html` |
| Patchbay | Modular signal routing and output scope | `/next/patchbay/index.html` |
| Swarm Gallery | Museum rooms, exhibits, archive, and curator desk | `/next/gallery/index.html` |

Each directory contains `RESEARCH.md` with independently gathered interface guidance and the decisions applied to that client.

## Shared Functional Contract

Every client exposes:

- live SSE state and events with refresh, pause/resume, disconnect, and reconnect;
- workflow, runs, agents, event/tool activity, search, and filtering;
- pause, resume, hold, stop, run-now, showcase, target, and iteration controls;
- blocker prompts, recovery advice decisions, steering, queues, and gates;
- run JSON, artifacts, logs, SPEC, DEVPLAN, audit, and iteration evidence;
- project-plan create, edit, review, approve, reject, launch, clone, fork, and archive;
- persisted planning-assistance conversations and proposal-to-draft workflows.

The headless client performs no DOM access. It owns bounded snapshots, SSE/polling recovery, selection/resource loading, command envelopes, project-plan methods, planning-assistance methods, and subscription lifecycle.
