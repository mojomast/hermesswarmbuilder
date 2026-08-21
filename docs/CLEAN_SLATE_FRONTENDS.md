# Clean-Slate Frontends

The twenty-three clients under `dashboard/public/next/` are independent frontend implementations. They share the server contract and `headless-dashboard-client.js`, but no renderer, stylesheet, DOM structure, or design system.

| Client | Primary model | Primary Framework / Renderer | Route |
|---|---|---|---|
| Radar | Polar SVG tracks and target scope | Vanilla DOM + Polar SVG | `/next/radar/index.html` |
| Daily Swarm | Editorial document and live news wire | Serif Typography + CSS Broadsheet | `/next/broadsheet/index.html` |
| Sequencer | Canvas timeline, tracks, clips, and transport | Canvas 2D DAW Timeline | `/next/sequencer/index.html` |
| Operator Shell | Command grammar and split text buffers | VT100 TUI Terminal Emulator | `/next/operator-shell/index.html` |
| Control Table | Spreadsheet workbook and ARIA grid | ARIA Data Grid + Formula Engine | `/next/control-table/index.html` |
| Field Guide | Mobile guided tasks and field binder | Mobile Card Binder + Offline Cache | `/next/field-guide/index.html` |
| Constellation | Orbital SVG graph and semantic tables | Orbital SVG Force Graph | `/next/constellation/index.html` |
| Casefiles | Case folders, exhibits, and authorization records | Forensic Evidence Bureau | `/next/casefiles/index.html` |
| Patchbay | Modular signal routing and output scope | Eurorack Modular Synth + Cable Layer | `/next/patchbay/index.html` |
| Swarm Gallery | Museum rooms, exhibits, archive, and curator desk | Art Museum Exhibition Rooms | `/next/gallery/index.html` |
| Logic Analyzer | Digital waveform timing, bus packet decoder, cursors | Preact + Canvas 2D Timing Traces | `/next/logic-analyzer/index.html` |
| SCADA PowerGrid | Substation single-line diagram & SBO interlocks | Lit Web Components + Vector SLD Mimic | `/next/scada-powergrid/index.html` |
| Flight Annunciator | Aerospace master warning & split-legend Korry switchboard | SolidJS + Guarded Safety Flip Covers | `/next/flight-annunciator/index.html` |
| Broadcast Switcher | TV master control room, multiviewer & T-bar fader | Svelte + PGM/PVW Crosspoint Matrix | `/next/broadcast-switcher/index.html` |
| Audio Mixer | Large-format summing desk, EBU R68 VU meters, faders | Vue 3 + 8-Stage Channel Strips | `/next/audio-mixer/index.html` |
| CNC Machining | 5-Axis DRO coordinate readout & isometric toolpath | Alpine.js + 3D Toolpath Canvas | `/next/cnc-machining/index.html` |
| Robotics Teleop | Planetary rover GDS, 6-DOF kinematics, DSN link | Three.js / WebGL + Telemetry HUD | `/next/robotics-teleop/index.html` |
| Network NOC | Global BGP-4 routing mesh & DWDM optical matrix | D3.js + ITU-T X.733 Alarm Triage | `/next/network-noc/index.html` |
| Microscope Spectrometry | Analytical SEM phosphor CRT raster & EDX histogram | Native Web Components + Shadow DOM | `/next/microscope-spectrometry/index.html` |
| Reactor Core | Nuclear Class 1E safety console, flux matrix, SCRAM | Mithril.js + Hexagonal Core Matrix | `/next/reactor-core/index.html` |
| Swarm Nebula | Spherical run stars, agent clouds, event particles, blocker shockwaves | Three.js Instancing + Point Clouds + Ray Picking | `/next/swarm-nebula/index.html` |
| Flowfield Command | 3D execution corridors, agent emitters, gate planes, blocker turbulence | Raw WebGL2 Transform Feedback + GPU Ping-Pong Buffers | `/next/flowfield-command/index.html` |
| Voxel Foundry | Fabrication cell, voxel workpieces, toolheads, inspection gantries, sparks | Raw WebGL2 Instanced Cubes + Framebuffer Picking | `/next/voxel-foundry/index.html` |

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
