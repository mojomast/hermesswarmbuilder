# Analytical Scanning Electron Microscope & Spectrometry Interface Research & Design Report

**Client Identifier:** `microscope-spectrometry`  
**Target Route:** `/next/microscope-spectrometry/index.html`  
**Core Metaphor:** Analytical Scanning Electron Microscope (SEM) and Energy Dispersive X-Ray (EDX) Spectrometry Workstation  
**Primary Framework:** Native Web Components (Standard ESM Custom Elements v1 with Open Shadow DOM encapsulation)  
**Primary Renderer:** Canvas 2D P31 Green Phosphor CRT Raster Decay Engine + SVG/Canvas Multi-Channel Analyzer (MCA) Histogram  

---

## 1. Operational Discipline: Analytical SEM & High-Resolution Spectrometry

Analytical electron microscopy (e.g., JEOL JSM-IT800, ThermoFisher Helios/Phenom, Oxford Instruments AZtecLive, ISO 22493, ISO 22309) interrogates materials through a rigorous physics discipline:
- **Beam-Column Optics**: Focusing electron probes via accelerating potential ($0.5\text{--}30\text{ kV}$), probe current ($1\text{ pA}\text{--}50\text{ nA}$), condenser lenses, and stigmator coils.
- **Vacuum Safety Interlocks**: Multi-stage differential pumping (Roughing mechanical pump $\rightarrow$ Turbomolecular pump $\rightarrow$ Ion Getter Pump $< 5 \times 10^{-4}\text{ Pa}$) with automatic beam trip protection on pressure surges.
- **5-Axis Goniometer Stage**: Coordinate manipulation ($X, Y, Z, \text{Tilt }\theta, \text{Rotation }\phi$) with working distance ($WD = 10\text{ mm}$) collision envelopes.
- **P31 Phosphor CRT Raster Decay**: Exponential luminance decay ($\tau_{\text{slow}} \approx 250\text{ ms}$) balancing Fast Scan navigation against Slow Scan signal-to-noise integration.
- **Multi-Channel EDX Spectrometry**: Energy bins ($0.0\text{--}20.48\text{ keV}$, $\Delta E = 10\text{ eV/ch}$) recording characteristic elemental X-ray emissions ($\text{Si } K\alpha$, $\text{Fe } K\alpha$, $\text{Cu } K\alpha$) and pulse-processor dead time ($< 40\%$).

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
   *Applied*: Screen-reader accessible tabular mirroring for Canvas CRT raster displays and spectral histograms.

---

## 3. Framework and Dependency Research

- **Primary Framework**: Native Web Components (Standard ESM Custom Elements v1 with Shadow DOM encapsulation). Zero external framework dependencies.
- **Primary Renderer**: High-DPI Canvas 2D Phosphor Decay CRT Raster Engine + Multi-Channel Analyzer (MCA) Histogram Bin Visualizer.
- **Zero Remote Dependencies**: 100% locally served via `../../headless-dashboard-client.js`.

---

## 4. Applied Design Decisions

- **P31 Phosphor CRT Viewport**: Canvas 2D visualizer mapping swarm agents to electron beam spots with realistic exponential decay and microbeam noise.
- **EDX MCA Histogram**: Real-time energy spectrum mapping tool calls to characteristic X-ray emission lines ($\text{Si } K\alpha = 1.74\text{ keV}$, $\text{Fe } K\alpha = 6.40\text{ keV}$).
- **Vacuum Interlock Deck**: Penning/Pirani bar meters and chamber safety interlocks.
- **Specimen Recipe Planner**: Project plan management mapped to analytical specimen synthesis recipes.

---

## 5. Accessibility Decisions

- **Accessible Tabular Mirroring**: An internal, screen-reader-accessible HTML table mirrors the CRT canvas and spectral histogram.
- **ARIA Live Alerts**: Vacuum state changes and beam trip alarms announced via `aria-live="assertive"`.
- **High-Contrast Optics**: Phosphor green ($#22ee55$) on deep shadow mask black ($#050807$).

---

## 6. Performance Decisions

- **Direct TypedArray Blitting**: Canvas decay operates on raw 32-bit `Uint32Array` pixel buffers.
- **Shadow DOM Scoping**: Style isolation prevents global CSS recalculation pauses.

---

## 7. Distinctions from the Other 19 Dashboards

- **vs. Radar**: Cartesian electron-beam raster scanning with phosphor decay and X-ray spectrometry, whereas Radar is a polar radio antenna scope.
- **vs. CNC Machining**: Analytical physics characterization and electron optics, whereas CNC Machining is a subtractive mechanical tool controller.
- **vs. All Others**: The only dashboard modeling swarm observability as an analytical scanning electron microscope with high-vacuum interlocks and EDX spectrometry.
