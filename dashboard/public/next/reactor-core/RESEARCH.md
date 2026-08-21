# Nuclear Reactor Core & Fusion Safety Console Interface Research & Design Report

**Client Route:** `/next/reactor-core/index.html`  
**Client Codebase Archetype:** Nuclear Reactor Class 1E Safety Console & Tokamak Fusion Plasma Diagnostics Workstation  
**Primary Framework:** Mithril.js (Fast Lightweight Hyperscript VDOM Engine, `../../vendor/mithril.js`)  
**Primary Renderer:** 61-Element Hexagonal Core Flux Matrix + Control Rod Servo Gauge + Class 1E SPDS Radar Polygon  

---

## 1. Design Discipline Researched

Nuclear power plant main control rooms and magnetic confinement fusion facilities (e.g. Westinghouse AP1000 MCR, US NRC NUREG-0700 Rev 2, IAEA Safety Standards SSG-39, ITER CODAC system) enforce deterministic safety interlocks:
- **61-Element Hexagonal Core Lattice**: Real-time axial neutron flux distribution ($MW_{\text{th}}$), quadrant power tilt ratio (QPTR), and departure from nucleate boiling ratio (DNBR).
- **Control Rod Drive Mechanism (CRDM) Servos**: Individual rod bank step indicators (Shutdown Banks S1–S4, Regulating Banks A–D) tracking exact percentage insertion.
- **Safety Parameter Display System (SPDS)**: 8-parameter radar polygon providing holistic plant safety assessment at a single glance (Reactivity, Core Cooling, RCS Inventory, Containment Pressure, Radiation, Secondary Heat Sink).
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

4. **W3C WAI-ARIA APG — *Status, Slider, and Dialog Patterns***  
   https://www.w3.org/WAI/ARIA/apg/  
   *Applied*: Accessible tabular data representations for hexagonal core fuel assemblies; ARIA live regions for SPDS safety limit alerts.

---

## 3. Framework and Dependency Research

- **Primary Framework**: Mithril.js (`../../vendor/mithril.js`). Mithril provides an ultra-fast, minimal virtual DOM library with hyperscript syntax (`m("div", ...)`), fast differential tree patching, and zero build toolchain requirements.
- **Primary Renderer**: SVG Hexagonal Core Geometry + Canvas SPDS Radar Polygon + CSS Control Rod Servo Tracks.
- **Zero Remote Dependencies**: 100% locally served via `../../headless-dashboard-client.js` and `../../vendor/mithril.js`.

---

## 4. Applied Design Decisions

- **Hexagonal Fuel Matrix**: SVG lattice of 61 hexagonal fuel assemblies color-coded by thermal neutron flux.
- **Control Rod Servos**: Vertical bar gauges displaying bank insertion percentages.
- **SPDS Polygon**: 8-axis radar polygon showing real-time swarm safety parameters.
- **SCRAM Switchgear**: Armed emergency button triggering instant runner abort with safety audit latching.

---

## 5. Accessibility Decisions

- **Accessible Core Fuel Table**: Hexagonal fuel elements mirrored in a semantic HTML table for screen readers.
- **Roving Focus**: Keyboard navigation through control rod banks and core zones.
- **Class 1E High Contrast**: Strict compliance with high-contrast safety legibility standards.

---

## 6. Performance Decisions

- **Mithril Diffing Optimization**: Re-renders only changed fuel assemblies without re-parsing static SVG definitions.
- **SVG Hexagonal Re-use**: Hexagon geometry defined once in `<defs>` and instanced via `<use>`.

---

## 7. Distinctions from the Other 19 Dashboards

- **vs. SCADA Powergrid**: Nuclear fission core physics with neutron flux matrices and SCRAM interlocks, whereas SCADA Powergrid is an electrical transmission substation.
- **vs. Microscope Spectrometry**: Nuclear thermal megawatt reactor core, whereas Microscope is an analytical electron beam instrument.
- **vs. All Others**: The only dashboard modeling swarm operations as a nuclear reactor core with hexagonal fuel matrices, control rod servos, and armed SCRAM protection.
