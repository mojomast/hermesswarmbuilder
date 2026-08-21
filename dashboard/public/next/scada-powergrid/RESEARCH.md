# SCADA-PowerGrid Interface Research & Design Report

**Client Identifier:** `scada-powergrid`
**Target Route:** `/next/scada-powergrid/index.html`
**Core Metaphor:** High-Voltage Electrical Substation & Transmission Grid SCADA Human-Machine Interface (HMI)
**Implementation Technology:** Lit 3 (`../../vendor/lit.js`), Dynamic SVG Single-Line Diagram (SLD) Mimic, Topological Busbar Coloring Engine, Two-Step Select-Before-Operate (SBO) Interlocking Switchgear, ISA-18.2 Annunciator Matrix.

---

## 1. Operational Discipline: High-Voltage Electrical Substation & Power Grid SCADA

Power transmission and distribution grid control centers operate under strict international engineering standards that prioritize rapid situational awareness, deterministic control execution, fault isolation, and the prevention of operator error during high-stress grid disturbances.

Key standards applied:
- **IEC 61850 (Substation Automation)**: Models primary equipment as Logical Nodes (`XCBR` Circuit Breakers, `XSWI` Disconnectors, `CSWI` Switch Controllers, `CILO` Interlocking Logic, `MMXU` Measurement Units, `YPTR` Transformers).
- **IEEE Std C37.1 (SCADA Master Stations) & IEEE 1613**: Four-tier display hierarchy (World Mimic, Substation SLD, Bay Instrumentation, Device Diagnostics).
- **EPRI SCADA HMI & ISA-101 / ISA-18.2**: Dark neutral canvas (`#070a0e`), dynamic topological coloring (Energized Cyan `#00f0ff` for 500kV, Amber `#f59e0b` for 230kV, Closed Green `#10b981`, Tripped Red `#ef4444`, Isolated Gray `#64748b`), 12-state alarm annunciator tiles.
- **Two-Step Select-Before-Operate (SBO)**: All switching commands require a two-stage transactional sequence (Arm/Select with 30s reservation timeout $\rightarrow$ Operator Verify Interlocks $\rightarrow$ Confirm Execute).

---

## 2. Authoritative Sources

1. **IEC 61850-7-4 & IEC 61850-7-2 (Communication Networks and Systems for Power Utility Automation)**
   https://webstore.iec.ch/publication/6013
   *Applied*: Logical node decomposition (`XCBR` for runner breakers, `CSWI` for operator controls, `MMXU` for metrics); enhanced security SBO control models; standardized binary contact states (`01` open, `10` closed, `00` tripped).

2. **IEEE Std C37.1-2007 (IEEE Standard for SCADA and Automation Systems)**
   https://standards.ieee.org/ieee/C37.1/4066/
   *Applied*: Four-tier display hierarchy; operator visual ergonomics; deterministic stale telemetry presentation with hatched warning borders.

3. **EPRI Human Factors Guidance for Control Room & Digital HSI Design (EPRI 3002004310)**
   https://www.epri.com/research/products/000000003002004310
   *Applied*: Dark-slate high-performance substrate; ISA-18.2 annunciator alarm tile grid; non-color-dependent equipment status (geometric solid/hollow symbol redundancy).

4. **ISA-101.01-2015 (Human Machine Interfaces for Process Automation Systems)**
   https://www.isa.org/standards-and-publications/isa-standards/isa-standards-committees/isa101
   *Applied*: Situational awareness principles; hierarchical navigation from overview SLD to bay-level diagnostics; standardized alarm prioritization.

---

## 3. Framework and Dependency Research

- **Primary Framework**: Lit 3 (`../../vendor/lit.js`). Lit provides native Web Components with reactive properties, declarative HTML templates via tagged template literals (`html`, `svg`), and scoped shadow DOM styling with zero runtime build step.
- **Primary Renderer**: Vector SVG Single-Line Diagram (SLD) with hardware-accelerated SVG matrix transforms and real-time Breadth-First Topological Line Coloring.
- **Zero Remote Dependencies**: 100% locally served via `../../headless-dashboard-client.js` and `../../vendor/lit.js`.

---

## 4. Applied Design Decisions & Complete Feature Architecture

1. **Live SSE Connection Engine**: Real-time substation telemetry stream with grid frequency metering (60.00 Hz nominal), system MW/MVAR load, connection status lamps, stream pause/resume, and telemetry synchronization.
2. **ISA-18.2 Annunciator Alarm Matrix**: 12-tile alarm array monitoring 500kV Bus A, 230kV Bus B, autotransformer YPTR-T1, fault blocker trips, acceptance gate synchrocheck, priority queue depth, and circuit breaker positions (`CB-101`, `CB-102`, `CB-201`).
3. **Substation Single-Line Diagram (SLD)**: Vector SVG mimic with energized busbar lighting, generator in-feed (Orchestrator), development bay, QA tester bay, autotransformer step-down, and gate/queue feeders with click-to-select bay navigation.
4. **Sequence of Events (SOE) Telemetry Feed**: High-resolution SOE tabular log with search filtering, switchgear/protection filtering, and full JSON event dissection modals.
5. **Two-Step Select-Before-Operate (SBO) Interlock System**: Armed confirmation modal with 30-second reservation countdown and interlocking verification before executing critical switching actions (Pause, Resume, Run-Now, E-Trip / SCRAM).
6. **Substation Operator Command Station**: Full dispatch control deck for showcase autoloop (1-10 slider), deblock recovery directives, advice reviews, steering directives, priority queue brief filing, and acceptance gate verdicts.
7. **Grid Dispatch Planning Workstation**: Complete project plan lifecycle management (classic and managed plans), revision draft saving, review submission, approval, rejection with decision notes, runner pipeline launching, cloning, forking, and archiving.
8. **Grid Dispatch AI Copilot**: Interactive dispatch assistance thread, proposal inspection, and 1-click proposal application to draft grid plans.
9. **Substation Operating Manual & Shortcuts**: Dedicated help modal detailing IEC 61850 logical nodes, SLD vector symbols, SBO switching procedures, and keyboard shortcuts.
10. **4K & High-DPI Display Optimization**: Base typography set to 14px (scaling to 16px on 4K), scalable rem units, and generous responsive grid layouts.

---

## 5. Accessibility Decisions

- **Semantic ARIA Grid**: The substation single-line diagram is mirrored by an accessible keyboard-navigable ARIA grid (`role="grid"`).
- **Roving Keyboard Focus**: Arrow keys traverse substation bays; `Space` acknowledges annunciator alarms; `S` synchronizes telemetry; `B` opens command deck; `P` switches to grid plans.
- **Redundant Coding**: Breakers display geometric states (solid filled rectangle = closed `[10]`, hollow open bar = open `[01]`, red flashing = tripped `[00]`), status badges, and high-contrast color.
- **Reduced Motion**: Respects `prefers-reduced-motion` by disabling alarm pulse animations.

---

## 6. Performance Decisions

- **Matrix Transform Pan/Zoom**: SVG viewport navigation mutates a single matrix transform with `will-change: transform`.
- **Lit Microtask Batching**: High-frequency telemetry updates batch into animation frames (`requestAnimationFrame`).

---

## 7. Distinctions from the Other Dashboards

- **vs. Radar**: Cartesian substation Single-Line Diagram with electrical busbars and SBO switchgear, whereas Radar is a polar air traffic scope.
- **vs. Logic Analyzer**: Power distribution network with transformers, MW/MVAR flows, and 2-step SBO interlocks, whereas Logic Analyzer is a digital IC timing probe.
- **vs. Switchyard**: High-voltage electrical transmission substation with MW/MVAR power flow, step-down transformers, and synchrocheck relays, whereas Switchyard is a mechanical railroad classification yard.
- **vs. All Others**: The only dashboard modeling swarm execution as an energized electrical grid with IEC 61850 logical nodes, bus couplers, and two-step Select-Before-Operate interlocks.
