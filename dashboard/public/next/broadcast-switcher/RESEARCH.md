# Broadcast Switcher Interface Research & Design Report

**Client Route:** `/next/broadcast-switcher/index.html`  
**Client Codebase Archetype:** Television Broadcast Master Control Room & Production Video Switcher  
**Primary Framework:** Svelte Stores & Reactive Engine (`../../vendor/svelte.js`)  
**Primary Renderer:** High-Performance Multiviewer Monitor Wall + Tactile Crosspoint Matrix Bus + Hardware T-Bar Transition Fader  

---

## 1. Design Discipline Researched

Professional live video production switchers (e.g., Grass Valley Kayenne, Ross Video Acuity, Blackmagic Design ATEM Constellation 8K, Sony MLS-X1) govern high-stakes live broadcast events under zero-latency constraints.

Key operational principles applied:
- **Program (PGM) vs. Preview (PVW) Dual Bus Architecture**: The operator composes, inspects, and stages incoming video feeds on the PVW bus without affecting the live on-air PGM output until a deliberate transition occurs.
- **Tally Signaling Matrix**: Red Tally illuminates sources actively broadcast on-air (PGM); Green/Amber Tally illuminates sources cued on Preview (PVW).
- **Physical Transition T-Bar & CUT / AUTO Triggers**: Tactile fader bar executes manual wipes and dissolves, while `CUT` executes instantaneous zero-frame hard takes and `AUTO` executes timed transitions (e.g. 1.0s MIX/WIPE).
- **Multiviewer Wall (SMPTE ST 2110)**: Quad-split and 8-split monitor grids displaying live streaming camera feeds, UMD (Under-Monitor Display) tally text, and audio peak PPM meters conforming to EBU R128.
- **Downstream Keyers (DSK)**: Independent overlay channels superimposing graphics (SPEC.md, DEVPLAN.md) over background video feeds.

---

## 2. Authoritative Sources

1. **SMPTE ST 2110 Standards Suite (*Professional Media Over Managed IP Networks*)**  
   https://www.smpte.org/standards  
   *Applied*: Separates media payload streams into discrete essences (Video / Telemetry, Audio / Logs, Ancillary / State Metadata); establishes low-latency synchronization.

2. **EBU Recommendation R128 (*Loudness normalisation and permitted maximum level of audio signals*)**  
   https://tech.ebu.ch/publications/r128  
   *Applied*: Fast quasi-peak and short-term loudness PPM meter ballistics integrated into multiviewer monitor tiles.

3. **Grass Valley — *Kayenne Video Production Center Operations & User Guide***  
   https://www.grassvalley.com/products/production-switchers/kayenne/  
   *Applied*: Dual-bus PGM/PVW crosspoint matrix layout; tactile T-bar transition kinematics; DSK tie and cutover logic; macro cue sequencing for automated loops.

4. **W3C WAI-ARIA APG — *Toolbar, Grid, and Status Role Guidelines***  
   https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/  
   *Applied*: Accessible keyboard hotkeys for crosspoint takes (`1-8`, `Space` for CUT, `Enter` for AUTO); high-visibility tally state badges.

---

## 3. Framework and Dependency Research

- **Primary Framework**: Svelte Store Architecture (`../../vendor/svelte.js`). Uses fine-grained writable and derived stores (`writable`, `derived`, `get`) for reactive state distribution across multiviewer monitors and crosspoint buttons.
- **Primary Renderer**: CSS Grid Multiviewer Monitor Wall + Hardware-Accelerated SVG T-Bar Fader + Canvas PPM Audio Peak Meter.
- **Zero Remote Dependencies**: 100% locally served via `../../headless-dashboard-client.js` and `../../vendor/svelte.js`.

---

## 4. Applied Design Decisions

- **Multiviewer Layout**: Top-deck quad-split monitor wall (PGM Live Feed, PVW Cue Feed, CAM 1 Lead Architect, CAM 2 Coder, CAM 3 Tester, CAM 4 Showcase).
- **Crosspoint Switcher Bus**: PGM Row (Red Tally) and PVW Row (Green Tally) with 8 selectable agent/source crosspoints.
- **Transition Block**: Center-mounted mechanical T-bar with interactive drag, `CUT` button, and `AUTO` dissolve trigger.
- **DSK Overlay Panel**: DSK 1 (SPEC.md) and DSK 2 (DEVPLAN.md) on-air keyer controls.
- **Macro Sequencer**: Macro trigger deck for Showcase Loops and automated multi-generation iterations.

---

## 5. Accessibility Decisions

- **Keyboard Hotkeys**: `1-8` for PVW source select; `Space` for instant CUT transition; `Enter` for AUTO mix; `T` for T-bar travel; `Esc` for emergency black.
- **High-Visibility Tally**: Solid red and green borders with explicit `[ON-AIR]` and `[PREVIEW]` text badges.
- **Reduced Motion**: Respects `prefers-reduced-motion` by converting T-bar dissolves to instantaneous cuts.

---

## 6. Performance Decisions

- **Decoupled Video Streams**: Multiviewer tiles update only on state changes using Svelte store subscriptions.
- **CSS GPU Transitions**: T-bar handle movement utilizes `transform: translateY(...)` for 60 FPS fluidity.

---

## 7. Distinctions from the Other 19 Dashboards

- **vs. Audio Mixer**: Video broadcast switcher with PGM/PVW buses, T-bar wipes, multiviewer monitors, and DSK overlays, whereas Audio Mixer is an audio fader summing console.
- **vs. Flight Annunciator**: Master control room video production switcher, whereas Flight Annunciator is an aerospace cockpit overhead board.
- **vs. All Others**: The only dashboard modeling swarm orchestration as a live multi-camera broadcast production with PGM/PVW crosspoint buses and T-bar transitions.
