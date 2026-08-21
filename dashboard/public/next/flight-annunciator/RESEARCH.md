# Flight Annunciator Interface Research & Design Report

**Client Route:** `/next/flight-annunciator/index.html`
**Architecture:** SolidJS Fine-Grained Reactive Signals (Zero Virtual DOM Reconciliation)
**Design Archetype:** Aerospace Master Warning & Caution Annunciator Matrix, Overhead Tactile Split-Legend Korry Push-Button Switchboards, Guarded Mechanical Safety Flip-Covers, Synoptic System Vector Bus Schematics, and Electronic Checklist (ECL/QRH) Closed-Loop Execution.

---

## 1. Aerospace Operational Discipline & Human Factors Research

Commercial and aerospace flight decks (Boeing 777/787 EICAS, Airbus A350/A380 ECAM, Space Shuttle Caution & Warning system) operate under foundational human factors principles:
1. **"Dark Cockpit" ("Lights Out") Philosophy**: Under nominal execution, all switchboard legends and annunciator tiles remain dark ("dead-front"). Only abnormal conditions, active manual overrides, armed gates, or system faults illuminate brightly.
2. **Three-Tier Alert Hierarchy**: Immediate separation of Warnings (Red / flashing / action-immediate), Cautions (Amber / steady / action-subsequent), and Advisories/Status (Cyan/White / informational).
3. **Physical Tactile Split-Legend Korry 389/40 Pushbuttons**: Two-field split illuminated pushbuttons (Upper Legend: Fault/Warning, Lower Legend: Status/Armed/Active).
4. **Guarded Flip-Cover Safety Interlocks**: Spring-loaded hinged protective covers with 3D perspective flip-to-arm kinematics for high-consequence operations.
5. **Electronic Checklist (ECL / QRH)**: Step-by-step verification flows directly connected to deblock and steering actions.

---

## 2. Authoritative Sources

1. **FAA Advisory Circular AC 25.1322-1 (*Flightcrew Alerting*) & AC 25-11B (*Electronic Flight Displays*)**
   https://www.faa.gov/documentLibrary/media/Advisory_Circular/AC_25-11B.pdf
   *Applied*: Establishes sensory alert triangulation (visual + auditory + tactile), nuisance alert suppression, and strict color coding (Red Warning, Amber Caution, Cyan Advisory, Green Normal).

2. **NASA Space Flight Human-System Standard NASA-STD-3001, Vol. 2 (*Displays and Controls*)**
   https://standards.nasa.gov/standard/NASA/NASA-STD-3001-VOL-2
   *Applied*: Mandates physical separation of guarded actuators for irreversible actions; high contrast dead-front legends ($> 7:1$ illuminated ratio); push-to-test lamp test functionality.

3. **Airbus Flight Safety Briefing Notes (*Cockpit Philosophy & ECAM Handling*)**
   https://safetyfirst.airbus.com/
   *Applied*: Lights-Out baseline; closed-loop Electronic Checklist where items step from Cyan (pending) to Green (sensed compliance).

---

## 3. Framework and Dependency Research

- **Primary Framework**: SolidJS (`../../vendor/solid.js`). SolidJS utilizes fine-grained reactive signals (`createSignal`, `createEffect`) without virtual DOM diffing, updating exact text nodes and CSS tokens directly under high-frequency SSE bursts.
- **Primary Renderer**: CSS Hardware-Accelerated Split-Legend Korry Switches + 3D Perspective Guard Covers + SVG Synoptic Bus Schematic.
- **Zero Remote Dependencies**: 100% locally served via `../../headless-dashboard-client.js` and `../../vendor/solid.js`.

---

## 4. Applied Design Decisions

- **Glareshield Masthead**: Central Master Warning & Master Caution beacons with 16-phase flight sequence bar.
- **Overhead Switchboard**: 4 Bays (Core/Power SSE Bus, Hydraulics/Run Propulsion, Avionics/Telemetry, Flight Management/Plan Deck).
- **Guarded Safety Actuators**: Translucent flip-up covers for `ABORT RUN`, `FLUSH QUEUE`, `LAUNCH PLAN`.
- **Center Synoptic Display**: Dynamic SVG flow schematic connecting Power, Swarm Fleet, Gate Interlocks, and Artifact Depot.
- **Electronic Checklist (ECL)**: Closed-loop remediation for `FAULT_SWARM_BLOCKED` and `GATE_NEED_EVIDENCE`.

---

## 5. Accessibility Decisions

- **ARIA Roles**: Korry buttons implement `role="switch"`, `aria-checked`, `aria-label`; flip guards implement `role="button"`, `aria-expanded`.
- **High-Contrast Dark-Field**: Illuminated legends exceed 12:1 contrast ratio against dead-front bezels.
- **Keyboard Shortcuts**: `T` for Lamp Test, `M` for Master Caution Silence, `Space` for button actuation, `C` for Checklist focus.

---

## 6. Performance Decisions

- **Zero Virtual DOM**: SolidJS compiles bindings into direct DOM mutations without tree diffing.
- **GPU 3D Kinematics**: Guard cover flip animations use `transform: rotateX(-125deg)` on GPU composite layers.

---

## 7. Distinctions from the Other 19 Dashboards

- **vs. Radar**: Aerospace cockpit annunciator matrix and tactile switchboard, whereas Radar is an ATC polar radar scope.
- **vs. Logic Analyzer**: Aerospace flight deck caution/warning panels and guarded switches, whereas Logic Analyzer is an electronic digital oscilloscope.
- **vs. All Others**: The only dashboard implementing the Dark Cockpit "Lights Out" philosophy, tactile split-legend Korry pushbuttons, 3D guarded flip covers, and closed-loop Electronic Checklists (ECL).
