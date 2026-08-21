# SCADA-PowerGrid Interface Research & Design Report

**Client Identifier:** `scada-powergrid`  
**Target Route:** `/next/scada-powergrid/index.html`  
**Core Metaphor:** High-Voltage Electrical Substation & Transmission Grid SCADA Human-Machine Interface (HMI)  
**Implementation Technology:** Lit Web Components (ESM), Dynamic SVG Single-Line Diagram (SLD) Mimic, Topological Busbar Coloring Engine, Two-Step Select-Before-Operate (SBO) Interlocking Switchgear, ISA-18.2 Annunciator Matrix.

---

## 1. Operational Discipline: High-Voltage Electrical Substation & Power Grid SCADA

Power transmission and distribution grid control centers operate under strict international engineering standards that prioritize rapid situational awareness, deterministic control execution, fault isolation, and the prevention of operator error during high-stress grid disturbances.

Key standards applied:
- **IEC 61850 (Substation Automation)**: Models primary equipment as Logical Nodes (`XCBR` Circuit Breakers, `XSWI` Disconnectors, `CSWI` Switch Controllers, `CILO` Interlocking Logic, `MMXU` Measurement Units, `YPTR` Transformers).
- **IEEE Std C37.1 (SCADA Master Stations) & IEEE 1613**: Four-tier display hierarchy (World Mimic, Substation SLD, Bay Instrumentation, Device Diagnostics).
- **EPRI SCADA HMI & ISA-101 / ISA-18.2**: Dark neutral canvas (`#0d1117`), dynamic topological coloring (Energized Cyan/Amber, Isolated Gray, Tripped Red), 4-state alarm annunciator tiles (Unacknowledged flash, Acknowledged steady, Clear pulse, Normal dark).
- **Two-Step Select-Before-Operate (SBO)**: All switching commands require a two-stage transactional sequence (Arm/Select with 30s reservation timeout $\rightarrow$ Operator Verify Interlocks $\rightarrow$ Confirm Execute).

---

## 2. Authoritative Sources

1. **IEC 61850-7-4 & IEC 61850-7-2 (Communication Networks and Systems for Power Utility Automation)**  
   https://webstore.iec.ch/publication/6013  
   *Applied*: Logical node decomposition (`XCBR` for runner breakers, `CSWI` for operator controls, `MMXU` for metrics); enhanced security SBO control models; standardized binary contact states (`01` open, `10` closed).

2. **IEEE Std C37.1-2007 (IEEE Standard for SCADA and Automation Systems)**  
   https://standards.ieee.org/ieee/C37.1/4066/  
   *Applied*: Four-tier display hierarchy; operator visual ergonomics; deterministic stale telemetry presentation with hatched warning borders.

3. **EPRI Human Factors Guidance for Control Room & Digital HSI Design (EPRI 3002004310)**  
   https://www.epri.com/research/products/000000003002004310  
   *Applied*: Dark-slate high-performance substrate; ISA-18.2 annunciator alarm tile grid; non-color-dependent equipment status (geometric solid/hollow symbol redundancy).

---

## 3. Framework and Dependency Research

- **Primary Framework**: Lit 3 (`../../vendor/lit.js`). Lit provides native Web Components with reactive properties, declarative HTML templates via tagged template literals (`html`), and scoped shadow DOM styling with zero runtime build step.
- **Primary Renderer**: Vector SVG Single-Line Diagram (SLD) with hardware-accelerated SVG matrix transforms and real-time Breadth-First Topological Line Coloring.
- **Zero Remote Dependencies**: 100% locally served via `../../headless-dashboard-client.js` and `../../vendor/lit.js`.

---

## 4. Applied Design Decisions

- **Substation Topology**: Dual-busbar transmission layout (500 kV Bus A, 230 kV Bus B, step-down transformer YPTR-T1) with feeder bays representing active and queued runner tasks.
- **Topological Line Tracing**: Dynamic BFS sweep energizes conductors from active power infeeds through closed switchgear.
- **Two-Step SBO Modal**: Armed confirmation modal with 30-second countdown and interlocking check before command transmission.
- **24-Tile Annunciator Matrix**: Top-mounted ISA-18.2 alarm tile grid reflecting blocker trips, gate synchronisms, and plan requisitions.

---

## 5. Accessibility Decisions

- **Semantic ARIA Grid**: The substation single-line diagram is mirrored by an accessible keyboard-navigable ARIA grid (`role="grid"`).
- **Roving Keyboard Focus**: Arrow keys traverse substation bays; `Space`/`Enter` arms switchgear; `E` executes armed SBO commands.
- **Redundant Coding**: Breakers display geometric states (solid filled rectangle = closed, hollow open bar = open), status badges (`CLOSED [10]`, `OPEN [01]`), and high-contrast color.
- **Reduced Motion**: Respects `prefers-reduced-motion` by disabling animated current vector flows.

---

## 6. Performance Decisions

- **Matrix Transform Pan/Zoom**: SVG viewport navigation mutates a single matrix transform with `will-change: transform`.
- **Lit Microtask Batching**: High-frequency telemetry updates batch into animation frames (`requestAnimationFrame`).

---

## 7. Distinctions from the Other 19 Dashboards

- **vs. Radar**: Cartesian substation Single-Line Diagram with electrical busbars and SBO switchgear, whereas Radar is a polar air traffic scope.
- **vs. Switchyard**: High-voltage electrical transmission substation with MW/MVAR power flow, step-down transformers, and synchrocheck relays, whereas Switchyard is a mechanical railroad classification yard.
- **vs. All Others**: The only dashboard modeling swarm execution as an energized electrical grid with IEC 61850 logical nodes, bus couplers, and two-step Select-Before-Operate interlocks.
