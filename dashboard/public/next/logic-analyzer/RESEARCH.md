# Logic Analyzer Interface Research & Design Report
**Dashboard Route:** `/next/logic-analyzer/index.html`
**Client Codebase Archetype:** Digital Logic Analyzer, Hardware Bus Probe, and Timing Diagram Analyzer
**Primary Framework:** Preact 10 (`../../vendor/preact.js`)
**Primary Renderer:** High-DPI Canvas 2D Digital Waveform Timing Diagram & Protocol Bus Disassembler

---

## 1. Design Discipline Researched

Digital logic analyzers (e.g., Tektronix TLA7000 Series, Saleae Logic Pro 16, HP/Agilent/Keysight 16700/16800 Series, IEEE 1450 Standard Test Interface Language) are purpose-built for capturing, decoding, and troubleshooting high-speed digital state machines, asynchronous hardware buses, and mixed-signal protocol stacks.

Key operational principles applied:
- **Asynchronous Timing & Synchronous State Analysis**: Timing mode plots signals against continuous elapsed time (wall-clock µs/ms/s); State mode records transitions synchronized to external strobes (workflow phase changes, tool call events, queue dispatches).
- **Channel Pod Grouping & Bus Synthesis**: Discrete single-bit probe lines are grouped into multi-bit symbolic buses with chamfered hexagonal packet envelopes (`< 0x0A: BUILDING >`, `< git_commit >`, `< terminal >`).
- **Sequential Trigger State Machine**: Multi-stage triggers (`IF Phase == 'building' AND Agent == 'coder' THEN CAPTURE T0`) isolate anomalous transient events, blocker faults, and glitch pulses.
- **Delta-Time Measurement Cursors**: Persistent measurement cursors (C1 in cyan, C2 in magenta) calculate Δt, instantaneous frequency ($f = 1/\Delta t$), and compare instantaneous channel logic states.
- **Synchronized State Listing (Protocol Disassembler)**: A tabular disassembler cross-indexes packet payloads with timeline positions, supporting search, channel filtering, and deep JSON disassembly.

---

## 2. Authoritative Sources

1. **Keysight Technologies — *Understanding Logic Analyzers (Application Note 5989-1864EN)***
   https://www.keysight.com/us/en/assets/7018-06714/application-notes/5989-1864.pdf
   *Applied*: Distinguishes asynchronous timing analysis from synchronous state analysis; establishes channel grouping into symbolic buses; specifies synchronized dual-view architectures where State Listings scroll in lockstep with Timing Waveforms.

2. **Tektronix — *XYZs of Logic Analyzers (Primer / Application Note)***
   https://www.tek.com/en/documents/primer/xyzs-logic-analyzers
   *Applied*: Defines multi-level sequential trigger state machines, pre/post-trigger ring buffer allocation, glitch-latch detection, and memory depth qualification.

3. **Saleae Logic 2 — *User Documentation & Measurement Guides***
   https://support.saleae.com/user-guide
   *Applied*: Fast wheel/pinch time-scale zooming centered on the pointer; high-level protocol packet analyzer tables with instant filtering; dual-cursor (Δt, f) delta measurements.

4. **W3C WAI-ARIA APG — *Data Grid & Complex Visualization Specifications***
   https://www.w3.org/WAI/ARIA/apg/patterns/grid/
   https://www.w3.org/WAI/tutorials/images/complex/
   *Applied*: Provides a synchronized, keyboard-accessible ARIA Data Grid alongside the Canvas waveform display; non-color-dependent logic level representations.

---

## 3. Framework and Dependency Research

- **Primary Framework**: Preact 10 (`../../vendor/preact.js`). Preact provides a high-performance virtual DOM engine with JSX/`h` component architecture, delivering instantaneous rendering for the inspector deck, pattern generator dialog, and project planning workstations with zero bloat.
- **Primary Renderer**: High-DPI Canvas 2D timing engine with double-buffering and dynamic device-pixel-ratio (`window.devicePixelRatio`) scaling, rendering thousands of square-wave transitions and bus packets at a locked 60 FPS.
- **Zero Remote Dependencies**: 100% self-contained locally via `../../headless-dashboard-client.js` and `../../vendor/preact.js`.

---

## 4. Applied Design Decisions & Complete Feature Architecture

1. **Live SSE Connection Engine**: Real-time event ingestion with status lamps (connected/polling/error), sample rate indicators (100 kS/s), buffer depth counters (0/2000), single-trigger resync, and stream pause/resume controls.
2. **Runs & Agents Hardware Deck**: Select active and archived runs, view target project details (repoPath, baseRef, objective), inspect active agent pod probes, and monitor fault glitch states.
3. **Live Telemetry & Protocol Disassembler**: Searchable, filterable tabular state listing exposing sample #, timestamp, pod channel, event action, and disassembled payload summary with full JSON inspection modal.
4. **Evidence & Artifacts Dissector**: Direct loading of `SPEC.md`, `DEVPLAN.md`, Run Record JSON, artifact files, log tailing (100-5000 lines), and iteration scorecards with `continue-from-iteration`, `fork-from-iteration`, and `use-as-next-direction` actions.
5. **Operator Pattern Generator & Command Station**: Complete run authority controls (pause, resume, hold, unhold, stop, run-now), showcase loop 1-10 slider and loop automation, deblock recovery prompt, advice queries, steering directives, priority queue management, and acceptance gate verdicts.
6. **Project Planning ROM Workstation**: Complete plan lifecycle management (classic and managed plans), revision draft saving, review submission, approval, rejection with notes, runner pipeline launching, cloning, forking, and archiving.
7. **AI Planning Copilot**: Real-time planning conversations, prompt refinement, proposed content inspection, and 1-click proposal application to draft plans.
8. **Hardware Manual & Operator Guide**: Interactive help dialog detailing probe pod specifications, waveform reading guidelines, and keyboard shortcuts.
9. **4K & High-DPI Display Optimization**: Base typography set to 14px (scaling to 16px on 4K), scalable rem units, and generous responsive grid layouts.

---

## 5. Accessibility Decisions

- **Accessible State Grid**: A fully synchronized ARIA Data Grid (`role="grid"`, `aria-roledescription="State Listing"`) exposes all logic transitions, timestamps, and packet payloads for screen reader users.
- **Keyboard Traversal**: Arrow keys, PageUp/PageDown, Home/End for waveform navigation; `T` jumps to trigger T0; `C` opens pattern generator; `Space` toggles acquisition pause/resume.
- **Redundant Coding**: High/Low states use explicit vertical step offsets, geometric hatch fills, and text badges (`[HIGH]`, `[LOW]`, `[TRIP]`, `[PASS]`) in addition to color.
- **Reduced Motion**: Respects `prefers-reduced-motion: reduce` by disabling timebase auto-scroll animations.

---

## 6. Performance Decisions

- **Binary-Search Culling**: Viewport rendering slices samples in $O(\log N)$ time, ignoring off-screen history.
- **Bounded Sample Ring Buffer**: 2,000 samples max in memory to prevent browser memory growth during multi-hour runs.
- **Batched Path2D Geometry**: Single-bit channel paths are pre-batched to minimize Canvas state switches.

---

## 7. Distinctions from the Other Dashboards

- **vs. Radar**: Linear Cartesian microsecond timebase with digital square waves, whereas Radar uses polar radial workflow distance.
- **vs. Broadsheet**: Hardware test bench with timing traces and protocol disassemblers, whereas Broadsheet is an editorial print newspaper.
- **vs. Sequencer**: Digital discrete logic (0/1 logic levels, bus envelopes, delta-t cursors, trigger machines), whereas Sequencer is a musical DAW with measures and beats.
- **vs. Operator Shell**: Waveform graphics and interactive timebase canvas, whereas Operator Shell is a pure text CLI.
- **vs. Control Table**: Time-domain oscilloscope/analyzer with synchronized disassembler, whereas Control Table is a spreadsheet ledger.
- **vs. All Others**: The only dashboard modeling swarm operations as digital integrated circuit signals, logic pods, hardware bus probes, and trigger state machines.
