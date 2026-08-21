# Nuclear Reactor Core & Fusion Safety Console Interface Research & Design Report

**Client Route:** `/next/reactor-core/index.html`
**Client Codebase Archetype:** Nuclear Reactor Class 1E Safety Console & Tokamak Fusion Plasma Diagnostics Workstation
**Primary Framework:** Mithril.js (Fast Lightweight Hyperscript VDOM Engine, `../../vendor/mithril.js`)
**Primary Renderer:** 61-Element Hexagonal Core Axial Flux Matrix + Control Rod Servo Deck + NUREG-0700 SPDS Radar Polygon

---

## 1. Operational Discipline: Class 1E Nuclear Reactor Safety & SPDS

Nuclear power plant main control rooms and magnetic confinement fusion facilities (e.g. Westinghouse AP1000 MCR, US NRC NUREG-0700 Rev 2, IAEA Safety Standards SSG-39, ITER CODAC system) enforce deterministic safety interlocks:
- **61-Element Hexagonal Core Lattice**: Real-time axial neutron flux distribution ($MW_{\text{th}}$), quadrant power tilt ratio (QPTR), and departure from nucleate boiling ratio (DNBR). Center assembly (`FA-01`) is surrounded by 4 concentric hexagonal rings (Ring 1: 6 assemblies, Ring 2: 12 assemblies, Ring 3: 18 assemblies, Ring 4: 24 assemblies) totaling 61 fuel assemblies.
- **Control Rod Drive Mechanism (CRDM) Servos**: Individual rod bank step indicators (Shutdown Banks S1–S4, Regulating Banks A–D) tracking exact percentage insertion.
- **Safety Parameter Display System (SPDS)**: 8-parameter radar polygon providing holistic plant safety assessment at a single glance (Reactivity Margin, Core Cooling, RCS Pressure, Containment Integrity, Secondary Sink, Radiation Monitor, Swarm Health, Gate Compliance).
- **Armed Emergency SCRAM / Trip Switchgear**: Dual-action mechanical confirmation (flip safety interlock cover $\rightarrow$ depress mushroom scram switch) to gravity-drop all control rod banks within $1.8\text{ seconds}$.
- **Chemical & Volume Control (CVCS)**: Boration and dilution rate controls for long-term reactivity steering.

---

## 2. Authoritative Sources

1. **US NRC — *NUREG-0700 Rev 2: Human-System Interface Design Review Guidelines***
   https://www.nrc.gov/reading-rm/doc-collections/nuregs/staff/sr0700/
   *Applied*: Safety Parameter Display System (SPDS) polygon architecture; Class 1E color conventions (Green Safe/Trip Normal, Yellow Warning/Pre-trip, Red Emergency SCRAM); non-ambiguous push-to-trip interlocks.

2. **IAEA Safety Standards Series No. SSG-39 (*Design of Instrumentation and Control Systems for Nuclear Power Plants*)**
   https://www.iaea.org/publications/10850/design-of-instrumentation-and-control-systems-for-nuclear-power-plants
   *Applied*: Defense-in-depth separation of operational control from reactor protection systems (RPS); deterministic fail-safe response modes.

3. **ITER CODAC — *Control, Data Access and Communication System Design Specification***
   https://www.iter.org/mach/codac
   *Applied*: Hexagonal magnetic fusion plasma equilibrium diagnostics; real-time magnetic flux loop monitoring.

4. **W3C WAI-ARIA APG — *Complex Graphic & Tabular Mirroring Guidelines***
   https://www.w3.org/WAI/tutorials/images/complex/
   *Applied*: Accessible tabular data representations for hexagonal core fuel assemblies; ARIA live regions for SPDS safety limit alerts; keyboard shortcuts for operator station.

---

## 3. Framework and Architecture Implementation

- **Primary Framework**: Mithril.js (`../../vendor/mithril.js`). Mithril provides an ultra-fast, minimal virtual DOM library with hyperscript syntax (`m("div", ...)`), fast differential tree patching, and zero build toolchain requirements.
- **Primary Renderers**:
  1. 61-Element Hexagonal Core Lattice SVG (`id="hexCoreSvg"`) with concentric rings 0–4, interactive assembly click inspection, and flux contour rings.
  2. 8-Bank CRDM Control Rod Servos Deck (`class="rc-rod-deck"`) with vertical linear insertion bar gauges.
  3. 8-Axis Safety Parameter Display System (SPDS) Canvas Radar Polygon (`id="spdsCanvas"`) with real-time reactivity monitoring.
- **Zero Remote Dependencies**: 100% locally served via `../../headless-dashboard-client.js`, `../../dashboard-directory.js`, and `../../vendor/mithril.js`.
- **4K & High-DPI Optimization**: Scalable `rem` unit typography (14px base scalable to 16px/18px on 2560px/3840px monitors), full-width flexbox and grid layouts utilizing screen space cleanly without cramped 8px text.

---

## 4. Operational Feature Completeness

1. **Live SSE Connection**: Real-time status lamps, stream pause/resume, full telemetry refresh, disconnect/reconnect toggle, transport reporting.
2. **16-Phase Workflow Progression**: Interactive 16-phase track with active phase status, active run identifier, and blocker recovery alert banner.
3. **Runs and Agents Selector**: Run dropdown selector with project details, status, and active task readout; agent probes list with role, status, and current execution.
4. **Live Telemetry & Traffic Feed**: Search filter, category filter chips (All, Tools, Errors, System), autoscroll toggle, and Tool Call Inspector modal with full raw JSON inputs/outputs.
5. **Operator Command Station**: Run authority (Pause, Resume, Run Now, Hold, Unhold, Stop/SCRAM), Showcase loop 1–10 generations slider and controls, Deblock & Recovery prompt with Copilot advice review/approval, Steering directives register, Task queue briefs (Add, Pin, Start Generation, Archive, Clear), Acceptance gates (Add, Pass, Needs Evidence, Attach Evidence, Fail).
6. **Project Planning Workstation**: Plan list (Classic/Managed), Plan Editor (Title, Problem, Users, Objective, Scope, Requirements, Non-Goals, Constraints, Risks, Repo Path, Base Ref), Save revision draft, Submit for review, Approve exact revision, Reject, Launch into runner, Clone, Fork, Archive, Immutable revision review.
7. **Planning Assistance Copilot**: Start new classic/managed conversation, browse threads, interactive chat stream, message input, inspect proposal drawer, Apply Proposal to Plan.
8. **Evidence & Artifacts Vault**: Dedicated tabbed inspector for SPEC.md, DEVPLAN.md, Run JSON, Artifacts with inline preview modal, Log tail viewer, Iteration scorecard, Audit trail.
9. **Help & Operator Manual**: Comprehensive modal explaining instrument physics metaphor, reading the 61-hex core, CRDM servos, SPDS radar, operator workflows, and keyboard shortcuts (`Space`, `R`, `C`, `P`, `E`, `H`, `Esc`).

---

## 5. Accessibility Decisions

- **Accessible Core Fuel Table**: Hexagonal fuel elements mirrored with semantic ARIA labels and attributes for screen readers.
- **Roving Focus**: Keyboard navigation through control rod banks, core zones, and modal tab systems.
- **Class 1E High Contrast**: Strict compliance with high-contrast safety legibility standards (`#00e5ff` cyan, `#10b981` green, `#f59e0b` amber, `#ef4444` trip red on `#05070a` obsidian slate).
- **Keyboard Shortcuts**: Comprehensive hotkeys for instant hands-on-keyboard workstation management.

---

## 6. Distinctions from the Other 19 Dashboards

- **vs. SCADA Powergrid**: Nuclear fission core physics with 61-hex neutron flux matrices and emergency SCRAM switchgear, whereas SCADA Powergrid is an electrical transmission substation single-line diagram.
- **vs. Microscope Spectrometry**: Nuclear thermal megawatt reactor core and primary coolant loops, whereas Microscope is an analytical electron beam instrument with vacuum interlocks and EDX spectrometry.
- **vs. All Others**: The only dashboard modeling swarm operations as a nuclear reactor core with 61-element hexagonal fuel matrices, control rod servos, and armed SCRAM protection.
