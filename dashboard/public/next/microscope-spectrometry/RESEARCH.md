# Analytical Scanning Electron Microscope & Spectrometry Interface Research & Design Report

**Client Identifier:** `microscope-spectrometry`
**Target Route:** `/next/microscope-spectrometry/index.html`
**Core Metaphor:** Analytical Scanning Electron Microscope (SEM) and Energy Dispersive X-Ray (EDX) Spectrometry Workstation
**Primary Framework:** Native Web Components (Standard ESM Custom Elements v1 with `<sem-phosphor-scope>`, `<sem-edx-spectrometer>`, `<sem-vacuum-deck>`)
**Primary Renderer:** High-DPI Canvas 2D P31 Green Phosphor CRT Raster Decay Engine + Multi-Channel Analyzer (MCA) Histogram

---

## 1. Operational Discipline: Analytical SEM & High-Resolution Spectrometry

Analytical electron microscopy (e.g., JEOL JSM-IT800, ThermoFisher Helios/Phenom, Oxford Instruments AZtecLive, ISO 22493, ISO 22309) interrogates materials through a rigorous physics discipline:
- **Beam-Column Optics**: Focusing electron probes via accelerating potential ($0.5\text{--}30\text{ kV}$), probe current ($1\text{ pA}\text{--}50\text{ nA}$), condenser lenses, and stigmator coils.
- **Vacuum Safety Interlocks**: Multi-stage differential pumping (Roughing mechanical pump $\rightarrow$ Turbomolecular pump $\rightarrow$ Ion Getter Pump $< 5 \times 10^{-4}\text{ Pa}$) with automatic beam trip protection on pressure surges.
- **5-Axis Goniometer Stage**: Coordinate manipulation ($X, Y, Z, \text{Tilt }\theta, \text{Rotation }\phi$) with working distance ($WD = 10\text{ mm}$) collision envelopes.
- **P31 Phosphor CRT Raster Decay**: Exponential luminance decay ($\tau_{\text{slow}} \approx 250\text{ ms}$) balancing Fast Scan navigation against Slow Scan signal-to-noise integration.
- **Multi-Channel EDX Spectrometry**: Energy bins ($0.0\text{--}20.48\text{ keV}$, $\Delta E = 10\text{ eV/ch}$) recording characteristic elemental X-ray emissions ($\text{Si } K\alpha = 1.74\text{ keV}$, $\text{Ti } K\alpha = 4.51\text{ keV}$, $\text{Fe } K\alpha = 6.40\text{ keV}$, $\text{Cu } K\alpha = 8.04\text{ keV}$, $\text{Au } M\alpha = 2.12\text{ keV}$) and pulse-processor dead time ($< 40\%$).

---

## 2. Authoritative Sources

1. **ISO 22493:2014 (*Microbeam analysis — Scanning electron microscopy — Vocabulary*)**
   https://www.iso.org/standard/60458.html
   *Applied*: Standardizes terminology: probe diameter, accelerating voltage, interaction volume, working distance, and raster scan dwell times.

2. **ISO 22309:2011 (*Microbeam analysis — Quantitative analysis using energy-dispersive spectrometry*)**
   https://www.iso.org/standard/53702.html
   *Applied*: Prescribes overvoltage criteria ($E_0 / E_{\text{edge}} \ge 1.5$), dead-time limits ($< 40\%$), and background Bremsstrahlung continuum modeling.

3. **JEOL Electron Optics Operational Principles & Guide to Scanning Microscopy**
   https://www.jeolusa.com/APPLICATIONS/Electron-Optics/SEM
   *Applied*: High-vacuum chamber interlocks; column isolation valves; condenser lens spot size trade-offs.

4. **W3C WAI-ARIA APG — *Complex Graphic & Tabular Mirroring Guidelines***
   https://www.w3.org/WAI/tutorials/images/complex/
   *Applied*: Screen-reader accessible tabular mirroring for Canvas CRT raster displays, spectral histograms, modal dialog focus traps, and keyboard navigation.

---

## 3. Framework and Architecture Implementation

- **Primary Framework**: Native Web Components (Standard ESM Custom Elements v1: `<sem-phosphor-scope>`, `<sem-edx-spectrometer>`, `<sem-vacuum-deck>`). Zero external framework dependencies.
- **Primary Renderers**:
  1. High-DPI Canvas 2D Phosphor Decay CRT Raster Engine (`id="crtCanvas"`) with real-time electron beam sweep, agent probe tracking, and micron scale bar.
  2. Multi-Channel Analyzer (MCA) Histogram (`id="mcaCanvas"`) with live Bremsstrahlung continuum and characteristic peak labeling.
- **Zero Remote Dependencies**: 100% locally served via `../../headless-dashboard-client.js` and `../../dashboard-directory.js`.
- **4K & High-DPI Optimization**: Scalable `rem` unit typography (14px base scalable to 16px/18px on 2560px/3840px monitors), full-width flexbox and grid layouts utilizing screen space cleanly without cramped 8px text.

---

## 4. Operational Feature Completeness

1. **Live SSE Connection**: Real-time status lamps, stream pause/resume, full telemetry refresh, disconnect/reconnect toggle, transport reporting.
2. **16-Phase Workflow Progression**: Interactive 16-phase track with active phase status, active run identifier, and blocker recovery alert banner.
3. **Runs and Agents Selector**: Run dropdown selector with project details, status, and active task readout; agent probes list with role, status, and current execution.
4. **Live Telemetry & Traffic Feed**: Search filter, category filter chips (All, Tools, Errors, System), autoscroll toggle, and Tool Call Inspector modal with full raw JSON inputs/outputs.
5. **Operator Command Station**: Run authority (Pause, Resume, Run Now, Hold, Unhold, Stop), Showcase loop 1–10 generations slider and controls, Deblock & Recovery prompt with Copilot advice review/approval, Steering directives register, Task queue briefs (Add, Pin, Start Generation, Archive, Clear), Acceptance gates (Add, Pass, Needs Evidence, Attach Evidence, Fail).
6. **Project Planning Workstation**: Plan list (Classic/Managed), Plan Editor (Title, Problem, Users, Objective, Scope, Requirements, Non-Goals, Constraints, Risks, Repo Path, Base Ref), Save revision draft, Submit for review, Approve exact revision, Reject, Launch into runner, Clone, Fork, Archive, Immutable revision review.
7. **Planning Assistance Copilot**: Start new classic/managed conversation, browse threads, interactive chat stream, message input, inspect proposal drawer, Apply Proposal to Plan.
8. **Evidence & Artifacts Vault**: Dedicated tabbed inspector for SPEC.md, DEVPLAN.md, Run JSON, Artifacts with inline preview modal, Log tail viewer, Iteration scorecard, Audit trail.
9. **Help & Operator Manual**: Comprehensive modal explaining instrument physics metaphor, reading the CRT/EDX, operator workflows, and keyboard shortcuts (`Space`, `R`, `C`, `P`, `E`, `H`, `Esc`).

---

## 5. Accessibility Decisions

- **Accessible Tabular Mirroring**: Semantic HTML regions and role bindings for screen-reader navigation of electron optical data.
- **ARIA Live Regions**: Vacuum state changes, blocker alerts, and telemetry events announced via `aria-live="polite"`.
- **High-Contrast Optics**: P31 Phosphor green (`#22ee55`) and analytical cyan (`#38bdf8`) on deep chamber carbon black (`#050807`).
- **Keyboard Navigation**: Comprehensive hotkeys for instant hands-on-keyboard workstation management.

---

## 6. Distinctions from the Other 19 Dashboards

- **vs. Radar**: Cartesian electron-beam raster scanning with phosphor persistence and EDX X-ray spectrometry, whereas Radar is a polar RF sweep antenna.
- **vs. Reactor Core**: Microscopic analytical electron beam physics and vacuum chamber interlocks, whereas Reactor Core is a thermal megawatt nuclear fission core with 61-element hexagonal flux matrix.
- **vs. All Others**: The only dashboard modeling swarm observability as an analytical scanning electron microscope with high-vacuum interlocks and EDX spectrometry.
