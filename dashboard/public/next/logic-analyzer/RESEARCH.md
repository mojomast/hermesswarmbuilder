# Logic Analyzer Interface Research & Design Report
**Dashboard Route:** `/next/logic-analyzer/index.html`  
**Client Codebase Archetype:** Digital Logic Analyzer, Hardware Bus Probe, and Timing Diagram Analyzer  
**Primary Framework:** Preact (Reactive UI Components & Virtualized State Engine)  
**Primary Renderer:** High-DPI Canvas 2D Digital Waveform Pipeline & Protocol Bus Disassembler  

---

## 1. Design Discipline Researched

Digital logic analyzers (e.g., Tektronix TLA7000, Saleae Logic Pro 16, HP/Agilent/Keysight 16700/16800 Series, IEEE 1450 Standard Test Interface Language) are purpose-built for capturing, decoding, and troubleshooting high-speed digital state machines and asynchronous hardware buses.

Key operational principles applied:
- **Asynchronous Timing & Synchronous State Analysis**: Timing mode plots signals against continuous elapsed time (wall-clock µs/ms); State mode records transitions synchronized to external strobes (workflow phase changes, tool call events).
- **Channel Pod Grouping & Bus Synthesis**: Discrete single-bit probe lines are grouped into multi-bit symbolic buses with chamfered hexagonal packet envelopes (`< 0x0A: BUILDING >`, `< git_commit >`).
- **Sequential Trigger State Machine**: Multi-stage triggers (`IF Phase == 'building' AND Agent == 'coder' THEN CAPTURE T0`) isolate anomalous transient events and blocker faults.
- **Delta-Time Measurement Cursors**: Persistent measurement cursors (C1, C2) calculate Δt, frequency (f = 1/Δt), and compare instantaneous channel logic states.
- **Synchronized State Listing**: A tabular disassembler cross-indexes packet payloads with timeline positions.

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

- **Primary Framework**: Preact 10 (`../../vendor/preact.js`). Preact provides an ultra-lightweight (3KB) virtual DOM engine with hooks (`useState`, `useEffect`, `useMemo`, `useRef`), delivering high rendering efficiency for control panels and modals without framework bloat.
- **Primary Renderer**: High-DPI Canvas 2D timing engine with double-buffering and binary-search viewport clipping (`bisectLeft`/`bisectRight`), rendering thousands of square-wave transitions and bus packets at 60 FPS.
- **Zero Remote Dependencies**: 100% self-contained locally via `../../headless-dashboard-client.js` and `../../vendor/preact.js`.

---

## 4. Applied Design Decisions

- **Signal Hierarchy**:
  - `POD 0`: CLK_SSE (Transport Heartbeat), CLK_POLL, BUFFER_LEVEL
  - `POD 1`: PHASE_BUS (16-state decoded workflow bus)
  - `POD 2`: AGENT_PROBES (Individual binary lines for each active/idle agent)
  - `POD 3`: TOOL_IO_BUS (Decoded tool invocation packets with duration and status)
  - `POD 4`: BLOCKER_GLITCH (Glitch line firing high on blocker/hold conditions)
  - `POD 5`: GATE_EVAL_BUS & QUEUE_BUS (Acceptance gate verdicts & priority queue items)
- **Timebase & Scale**: Linear time ruler with scrubbable viewport from 100ms/div up to 10s/div.
- **Interactive Measurement Cursors**: Movable C1 (cyan) and C2 (magenta) cursors with dynamic Δt, f, and state diff readout.
- **Pattern Generator & ROM Programmer**: Integrated control deck for dispatching operational commands, deblock directives, and complete project plan lifecycle actions.

---

## 5. Accessibility Decisions

- **Accessible State Grid**: A fully synchronized ARIA Data Grid (`role="grid"`, `aria-roledescription="State Listing"`) exposes all logic transitions, timestamps, and packet payloads for screen reader users.
- **Keyboard Traversal**: Arrow keys, PageUp/PageDown, Home/End for waveform navigation; `T` jumps to trigger T0; `C` centers on Cursor 1; `Space` toggles acquisition pause/resume.
- **Redundant Coding**: High/Low states use explicit vertical step offsets, geometric hatch fills, and text badges (`[HIGH]`, `[LOW]`, `[TRIP]`, `[PASS]`) in addition to color.
- **Reduced Motion**: Respects `prefers-reduced-motion: reduce` by disabling timebase auto-scroll animations.

---

## 6. Performance Decisions

- **Binary-Search Culling**: Viewport rendering slices samples in O(log N) time, ignoring off-screen history.
- **Bounded Sample Ring Buffer**: 5,000 samples max in memory to prevent browser memory growth during multi-hour runs.
- **Batched Path2D Geometry**: Single-bit channel paths are pre-batched to minimize Canvas state switches.

---

## 7. Distinctions from the Other 19 Dashboards

- **vs. Radar**: Linear Cartesian microsecond timebase with digital square waves, whereas Radar uses polar radial workflow distance.
- **vs. Broadsheet**: Hardware test bench with timing traces and protocol disassemblers, whereas Broadsheet is an editorial print newspaper.
- **vs. Sequencer**: Digital discrete logic (0/1 logic levels, bus envelopes, delta-t cursors, trigger machines), whereas Sequencer is a musical DAW with measures and beats.
- **vs. Operator Shell**: Waveform graphics and interactive timebase canvas, whereas Operator Shell is a pure text CLI.
- **vs. Control Table**: Time-domain oscilloscope/analyzer with synchronized disassembler, whereas Control Table is a spreadsheet ledger.
- **vs. All Others**: The only dashboard modeling swarm operations as digital integrated circuit signals, logic pods, hardware bus probes, and trigger state machines.
