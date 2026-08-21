# CNC Machining Center Interface Research & Design Report

**Client Identifier:** `cnc-machining`
**Target Route:** `/next/cnc-machining/index.html`
**Primary Metaphor:** Industrial 5-Axis CNC Machining Center & G-Code Motion Controller
**Implementation Stack:** Alpine.js Reactive Engine (`../../vendor/alpine.js`), HTML5 Isometric 3D Toolpath Canvas, Precision Digital Readout (DRO), Physical-Style Pushbutton Console

---

## 1. Operational Discipline: Industrial CNC Machining & G-Code Motion Control

Modern multi-axis machining centers (e.g. Fanuc 31i-B5, Siemens Sinumerik 840D sl / ONE, Haas NextGen Control, ISO 6983 / NIST RS274NGC) govern deterministic manufacturing processes through real-time trajectory generation, closed-loop feedback, and safety interlocks:
- **5-Axis Precision DRO**: Sub-micron coordinate tracking ($X, Y, Z$ linear, $A, B$ rotary) across Workpiece Coordinate Systems ($G54\text{--}G59$) and Distance-To-Go (DTG) remaining delta vectors.
- **G-Code Block Execution Stream**: Continuous stream of $N$-sequence blocks, modal group registers ($G00\text{--}G03, G17\text{--}G19, M03\text{--}M09$), and look-ahead trajectory velocity.
- **Isometric 3D Toolpath Canvas**: Real-time rendering of bounding stock envelopes, rapid moves ($G00$), linear cutting feeds ($G01$), and tool center point kinematics ($G43.4$).
- **Industrial Operator Hard-Keys**: Cycle Start (Green), Feed Hold (Amber), and twist-to-reset Emergency Stop (E-Stop mushroom).
- **Feed Rate Override (FRO)**: Dynamic potentiometer scaling execution pacing ($10\%\text{--}150\%$).

---

## 2. Authoritative Sources

1. **NIST IR 6556 (*The NIST RS274/NGC Interpreter - Version 3*)**
   https://doi.org/10.6028/NIST.IR.6556
   *Applied*: Canonical numerical control state machine; modal group orthogonality; G-code tokenizer.

2. **ISO 6983-1:2009 (*Automation systems — Numerical control — Program format and definitions of address words*)**
   https://www.iso.org/standard/41662.html
   *Applied*: Standard address word structure ($N, G, X, Y, Z, A, B, F, S, T, M$); project plans formatted as NC part programs (`O1001.NC`).

3. **ISO 13850:2015 (*Safety of machinery — Emergency stop function*)**
   https://www.iso.org/standard/59970.html
   *Applied*: Single-action mushroom latch E-stop with dedicated reset requirement before Cycle Start re-arming.

4. **Siemens SINUMERIK 840D sl / ONE Milling Operations Manual**
   https://support.industry.siemens.com/cs/document/109818037/sinumerik-operate-milling
   *Applied*: 4-quadrant pendant layout; tool turret wear offset tables; ShopMill conversational program management.

---

## 3. Framework and Dependency Research

- **Primary Framework**: Alpine.js (`../../vendor/alpine.js`). Lightweight declarative reactive directives (`x-data`, `x-show`, `x-model`, `x-text`, `x-bind`) providing clean industrial component state bindings without external runtime bundlers.
- **Primary Renderer**: Hardware-Accelerated 3D Isometric Canvas Toolpath Visualizer with dynamic particle chip ejection + 5-Axis DRO numeric display.
- **Zero Remote Dependencies**: 100% locally served via `../../headless-dashboard-client.js` and `../../vendor/alpine.js`.

---

## 4. Operational Feature Coverage (Hermes SwarmBuilder)

1. **Live SSE Connection & Andon Light Tower**: Complete SSE stream lifecycle management (`connect`, `disconnect`, `pause`, `resume`, `refresh`), 3-color Andon beacon light tower (Green running, Amber hold, Red alarm), and transport status indicators.
2. **Runs & Agents Navigator**: Run dropdown selector with instant loading via `selectRun(runId)`, Automatic Tool Changer (ATC) turret pockets T01-T06, spindle load readouts, and alarm interrupt indicators.
3. **Live Telemetry & Traffic Feed (DNC Logs)**: Search filter bar, category filter pills (All, Tool Calls, Alarms/Errors, Cycle States, Part Artifacts), and expandable JSON inspector for tool inputs, outputs, duration, and errors with copy-to-clipboard.
4. **Evidence & Quality Inspection Metrology Lab (CMM)**: Document tabs for `SPEC.md`, `DEVPLAN.md`, `run.json`, machined part artifacts with inline viewer, machine logs with configurable tail reader (100-2000 lines), and Iteration Tolerance Scorecard.
5. **Machining Command Station & Deblock Intercom**:
   - Motion Controls: Cycle Start (Run Now tick), Feed Hold (Pause), Cycle Resume, Intake Hold, Unhold, Emergency Stop, and 5-Axis Showcase Loop 1-10 slider.
   - Alarm Deblock & Recovery Suite: Alarm diagnostics display, custom recovery directive injection, Hermes AI advisory query, review/approve/deny advice, and active steering directives manager.
   - Part Queue Manager: Enqueue NC jobs, pin priority objectives, archive items, and clear part queue.
   - Go / No-Go Gauges: Register tolerance inspection gauges, evaluate pass/fail decisions, and attach CMM evidence.
6. **CAM Project Planning Workstation**:
   - NC Part Program List (`O1001.NC`, etc.) with status pills.
   - NC Program Editor Form: Title, Problem Spec, Target Machinists/Users, Objectives, Scope, Git Repo Path, Base Reference, and CAM Pipeline Architecture (Classic / Managed).
   - NC Actions: Save Draft, Submit CAM Review, Approve, Reject, Post & Launch into Spindle, Clone, Fork (revision increment), and Archive.
7. **Planning Assistance Copilot (Hermes CAM Copilot)**:
   - Multi-turn conversation threads with orchestrator AI.
   - Message dispatch with real-time response rendering.
   - Proposal Inspector with 1-click "Apply Proposal to CAM Planner" merge button.
8. **Operator Manual & CNC Machinist's Handbook**:
   - Fanuc 31i-B5 controller guide, reading the 5-Axis DRO and spindle tachometer, G-Code & M-Code instruction reference, and complete keyboard shortcuts table.
9. **4K & High-DPI Display Optimization**:
   - Base font size 14.5px–16px, scalable rem units, responsive grid and flexbox layouts utilizing full 4K screen real estate cleanly.

---

## 5. Distinctions from Other Dashboards

- **vs. Broadsheet / Gallery**: High-precision industrial manufacturing machine pendant, whereas Broadsheet is a newspaper and Gallery is an art museum.
- **vs. Flight Annunciator**: Subtractive CNC machine tool kinematics and G-code motion, whereas Flight Annunciator is an aerospace cockpit.
- **vs. Audio Mixer**: Subtractive 5-axis manufacturing and G-code motion control, whereas Audio Mixer is acoustic stem summing with EBU R68 VU meters.
- **vs. All Others**: The only dashboard modeling swarm execution as 5-axis CNC machining with DRO coordinates, G-code blocks, and Cycle Start / Feed Hold interlocks.
