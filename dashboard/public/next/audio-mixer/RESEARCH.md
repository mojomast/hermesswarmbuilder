# Audio Mixer Interface Research & Design Report

**Client Route:** `/next/audio-mixer/index.html`  
**Client Codebase Archetype:** Large-Format Professional Audio Mixing Console and DSP Routing Desk  
**Primary Framework:** Vue 3 Composition API (`../../vendor/vue.js`)  
**Primary Renderer:** Multi-Segment EBU R68 LED Peak/RMS VU Meter Bridges + 100mm Motorized Penny & Giles Faders + Crosspoint Soft-Patch Matrix  

---

## 1. Design Discipline Researched

Professional large-format mixing consoles (e.g., Solid State Logic Duality / 9000J, AMS Neve 88RS, Studer Vista with Vistonics, Calrec Apollo) represent decades of physical ergonomics for balancing dozens of high-bandwidth concurrent signals:
- **8-Stage Channel Strip Signal Flow**: Input Gain Trim, Dynamics Compressor/Gate (with visual Gain Reduction metering), 4-Band Parametric EQ, Aux Sends 1-4 (Log, Artifact, Event, Audit feeds), Pan Pot, OLED Scribble Strip, Solo-In-Place / Cut, and 100mm Long-Throw Faders.
- **Master Center Section Ergonomics**: VCA Group Masters (Orchestration, Core Engineering, Review, Showcase), Control Room Monitor Matrix (Main, Nearfield, Mono, Dim, Cut), and Talkback Slate Intercom.
- **EBU R68 & AES-2id Metering Standards**: Quasi-peak ballistics ($10\text{ms}$ attack, $2.8\text{s}$ decay) with $-18\text{ dBFS}$ digital headroom reference.
- **Total Recall Session Ledger**: Complete plan lifecycle snapshots and parameter diffing.

---

## 2. Authoritative Sources

1. **Solid State Logic — *Duality Delta & SL 9000 J Technical Reference Manual***  
   https://www.solidstatelogic.com/products/duality-fuse  
   *Applied*: VCA group trim logic; central master routing architecture; Total Recall immutable parameter serialization.

2. **European Broadcasting Union — *Technical Recommendation EBU R68 & EBU R128***  
   https://tech.ebu.ch/publications/r068  
   *Applied*: Standardized $-18\text{ dBFS}$ headroom alignment; logarithmic falloff decay for visual meter scannability without flicker.

3. **Audio Engineering Society — *AES3-2009 / AES-2id Digital Audio Interfacing Guidelines***  
   https://www.aes.org/standards/  
   *Applied*: Stream clock frame synchronization; true-peak clip detection indicators.

4. **W3C WAI-ARIA APG — *Slider and Region Patterns***  
   https://www.w3.org/WAI/ARIA/apg/patterns/slider/  
   *Applied*: Accessible 100mm faders (`role="slider"`, `aria-valuemin="-60"`, `aria-valuemax="10"`, `aria-valuenow="0"`); Solo/Cut switches (`role="switch"`).

---

## 3. Framework and Dependency Research

- **Primary Framework**: Vue 3 Composition API (`../../vendor/vue.js`). Uses `reactive`, `ref`, `computed`, and `shallowRef` to manage channel strip arrays and high-frequency telemetry with minimal reactive overhead.
- **Primary Renderer**: CSS Custom Properties for fader/meter ballistics + Accessible SVG Rotary Knobs + Tactile Fader Track Assemblies.
- **Zero Remote Dependencies**: 100% locally served via `../../headless-dashboard-client.js` and `../../vendor/vue.js`.

---

## 4. Applied Design Decisions

- **Channel Strip Bank**: 6 dedicated channels (Lead Architect, Code Generator, Test Verifier, Reviewer, Iteration Explorer, System Bus).
- **Overhead Meter Bridge**: Real-time LED ladder meters for each channel and Master L/R with peak hold.
- **Talkback Slate Buffer**: Push-to-Talk (PTT) intercom for injecting steering directives into the execution queue.
- **Matrix Routing Soft-Patch**: Crosspoint matrix patching agents to Acceptance Gates and Next-Build Queues.

---

## 5. Accessibility Decisions

- **ARIA Semantics**: Every fader operates as an accessible slider with descriptive `aria-valuetext` (e.g., `"0.0 dB (Unity Priority)"`).
- **Keyboard Navigation**: `1-6` for channel selection; `ArrowUp`/`ArrowDown` for fader trim; `S` for Solo; `M` for Cut; `Space` for Push-to-Talk.
- **High-Contrast OLED Scribble Strips**: High-contrast typography on matte charcoal bezels.

---

## 6. Performance Decisions

- **CSS Custom Properties**: High-frequency meter updates inject CSS variables (`--meter-level: 75%`) directly to bypass virtual DOM re-renders.
- **requestAnimationFrame Ballistics**: Meter decay physics execute on a dedicated 60 FPS animation tick.

---

## 7. Distinctions from the Other 19 Dashboards

- **vs. Patchbay**: Fixed-bus multi-channel summing console with vertical channel strips, 100mm faders, and VU meters, whereas Patchbay is a modular Eurorack synth with point-to-point patch cords.
- **vs. Sequencer**: Real-time channel fader desk and meter bridge, whereas Sequencer is a horizontal DAW arrangement timeline.
- **vs. Broadcast Switcher**: Professional audio mixing console with EQ/dynamics and faders, whereas Broadcast Switcher is a video master control switcher.
- **vs. All Others**: The only dashboard modeling swarm orchestration as multi-channel audio summing with EBU R68 metering and motorized faders.
