# Audio Mixer Interface Research & Design Report

**Client Route:** `/next/audio-mixer/index.html`
**Client Codebase Archetype:** Large-Format Professional Audio Mixing Console & Mastering Desk
**Primary Framework:** Vue 3 (`../../vendor/vue.js`)
**Primary Renderer:** Multi-Segment EBU R68 LED Peak/RMS VU Meter Bridges + 100mm Motorized Long-Throw Faders + Master Center Section Hub

---

## 1. Design Discipline Researched

Large-format professional audio mixing consoles (e.g., Solid State Logic SSL 9000J / Duality δ, AMS Neve 88RS, Studer Vista with Vistonics, Calrec Apollo) represent decades of physical ergonomics for monitoring and balancing dozens of high-bandwidth concurrent signals:
- **8-Stage Channel Strip Signal Flow**: Input Gain Trim, Dynamics Compressor/Gate (with visual Gain Reduction metering), 4-Band Parametric EQ, Aux Sends 1-4 (Telemetry, Queue, Audit, Deblock feeds), Pan Pot, OLED Scribble Strip, Solo-In-Place / Cut, and 100mm Long-Throw Motorized Faders.
- **Master Center Section Ergonomics**: VCA Group Masters (Orchestration, Core Engineering, Review, Showcase), Control Room Monitor Matrix (Main Mix PGM, Aux Cue, Solo PFL, Sum Mono), Emergency Console Cut, and Studio Talkback Slate Intercom.
- **EBU R68 & AES-2id Metering Standards**: Quasi-peak ballistics ($10\text{ms}$ attack, $2.8\text{s}$ decay) with $-18\text{ dBFS}$ digital headroom alignment, clip indicators, and phase correlation vectors.
- **Total Recall Session Ledger**: Complete plan lifecycle snapshots, parameter diffing, and immutable revision management.

---

## 2. Authoritative Sources

1. **Solid State Logic — *Duality Delta & SL 9000 J Technical Reference Manual***
   https://www.solidstatelogic.com/products/duality-fuse
   *Applied*: VCA group trim logic; central master routing architecture; Total Recall immutable parameter serialization; OLED digital scribble strips.

2. **European Broadcasting Union — *Technical Recommendation EBU R68 & EBU R128***
   https://tech.ebu.ch/publications/r068
   *Applied*: Standardized $-18\text{ dBFS}$ headroom alignment; logarithmic falloff decay for visual meter scannability without flicker; true peak clipping thresholds.

3. **Audio Engineering Society — *AES3-2009 / AES-2id Digital Audio Interfacing Guidelines***
   https://www.aes.org/standards/
   *Applied*: Stream clock frame synchronization; true-peak clip detection indicators; phase correlation meter physics.

4. **W3C WAI-ARIA APG — *Slider, Dialog, and Landmark Patterns***
   https://www.w3.org/WAI/ARIA/apg/patterns/slider/
   *Applied*: Accessible 100mm faders (`role="slider"`, `aria-valuemin="-60"`, `aria-valuemax="10"`, `aria-valuenow="0"`); Solo/Cut switches (`role="switch"`); modal dialogs with focus trapping and `Escape` key dismiss.

---

## 3. Framework and Dependency Research

- **Primary Framework**: Vue 3 (`../../vendor/vue.js`). Utilizes `createApp`, `reactive`, `ref`, `computed`, `watch`, and `nextTick` to manage high-frequency telemetry without virtual DOM thrashing.
- **Primary Renderer**: Hardware-accelerated CSS Custom Properties for fader/meter ballistics + SVG Rotary Knobs + Tactile Fader Track Assemblies.
- **Zero Remote Dependencies**: 100% locally served via `../../headless-dashboard-client.js` and `../../vendor/vue.js`.

---

## 4. Operational Feature Coverage (Hermes SwarmBuilder)

1. **Live SSE Connection & Status Lamps**: Complete SSE stream lifecycle management (`connect`, `disconnect`, `pause`, `resume`, `refresh`), connection state lamps, transport indicators (SSE vs Polling), and auto-reconnect fallback.
2. **Runs & Agents Navigator**: Run dropdown selector with instant loading via `selectRun(runId)`, agent activity lamps, current task telemetry, and real-time blocker strobe alarm.
3. **Live Telemetry & Traffic Feed (Tape Deck Stream)**: Search query bar, filter chips (All, Tool Calls, Errors, State Changes, Artifacts), and expandable JSON inspector for full tool call inputs, outputs, duration, and errors with copy-to-clipboard.
4. **Evidence & Artifacts Inspector**: Document tabs for `SPEC.md`, `DEVPLAN.md`, `run.json`, saved file artifacts with inline viewer, log files with configurable tail reader (100-2000 lines), and Iteration Evidence Scorecard.
5. **Operator Command Station / Patchbay**:
   - Run Controls: Run Now tick, Pause, Resume, Intake Hold, Unhold, Panic Stop, and Showcase Loop 1-10 slider.
   - Deblock & Recovery Suite: Active blocker prompt inspection, custom deblock prompt dispatch, query Hermes AI advice, review/approve/deny advice, and active steering directives manager.
   - Queue Manager: Enqueue tasks, pin priority objectives, archive items, and clear queue.
   - Quality Gatekeeper: Register acceptance gates, evaluate pass/fail decisions, and attach evidence.
6. **Total Recall Project Planning Workstation**:
   - Plan List with status filtering (draft, review, approved, active, archived).
   - Full Plan Form Editor: Title, Problem Statement, Target Users, Objectives, Scope, Git Repo Path, Base Reference, and Pipeline Architecture (Classic / Managed).
   - Plan Actions: Save Draft, Submit Review, Approve, Reject, Launch into Runner, Clone, Fork (revision increment), and Archive.
7. **Planning Assistance Copilot**:
   - Multi-turn conversation threads with orchestrator AI.
   - Message dispatch with real-time response rendering.
   - Proposal Inspector with 1-click "Apply Proposal to Plan" merge button.
8. **Operator Manual & Sound Engineer's Handbook**:
   - Audio console metaphor guide, reading EBU R68 VU meters and faders, Swarm Summing architecture, and complete keyboard shortcuts matrix.
9. **4K & High-DPI Display Optimization**:
   - Base font size 14.5px–16px, scalable rem units, responsive grid and flexbox layouts utilizing full 4K screen real estate cleanly.

---

## 5. Distinctions from Other Dashboards

- **vs. Patchbay**: Fixed-bus multi-channel summing console with vertical channel strips, 100mm faders, and VU meters, whereas Patchbay is a modular Eurorack synth with point-to-point patch cords.
- **vs. Sequencer**: Real-time channel fader desk and meter bridge, whereas Sequencer is a horizontal DAW arrangement timeline.
- **vs. Broadcast Switcher**: Professional audio mixing console with EQ/dynamics and faders, whereas Broadcast Switcher is a video master control switcher.
- **vs. CNC Machining**: Acoustic and musical stem summing with EBU R68 metering, whereas CNC Machining is subtractive manufacturing with 5-axis DRO and G-code motion control.
