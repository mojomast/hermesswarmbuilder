# CNC Machining Center Interface Research & Design Report

**Client Identifier:** `cnc-machining`  
**Target Route:** `/next/cnc-machining/index.html`  
**Primary Metaphor:** Industrial 5-Axis CNC Machining Center & G-Code Motion Controller  
**Implementation Stack:** Alpine.js / Petite-Vue Reactive Engine (`../../vendor/alpine.js`), HTML5 Isometric 3D Toolpath Canvas, Precision Digital Readout (DRO), Physical-Style Pushbutton Console  

---

## 1. Operational Discipline: Industrial CNC Machining & G-Code Motion Control

Modern multi-axis machining centers (e.g. Fanuc 31i-B5, Siemens Sinumerik 840D sl, Haas NextGen Control, ISO 6983 / NIST RS274NGC) govern deterministic manufacturing processes through real-time trajectory generation, closed-loop feedback, and safety interlocks:
- **5-Axis Precision DRO**: Sub-micron coordinate tracking ($X, Y, Z$ linear, $A, B$ rotary) across Workpiece Coordinate Systems ($G54\text{--}G59$) and Distance-To-Go (DTG) remaining delta vectors.
- **G-Code Block Execution Stream**: Continuous stream of $N$-sequence blocks, modal group registers ($G00\text{--}G03, G17\text{--}G19, M03\text{--}M09$), and look-ahead trajectory velocity.
- **Isometric 3D Toolpath Canvas**: Real-time rendering of bounding stock envelopes, rapid moves ($G00$), linear cutting feeds ($G01$), and tool center point kinematics ($G43.4$).
- **Industrial Operator Hard-Keys**: Cycle Start (Green), Feed Hold (Amber), and twist-to-reset Emergency Stop (E-Stop mushroom).
- **Feed Rate Override (FRO)**: Dynamic potentiometer scaling execution pacing ($0\%\text{--}200\%$).

---

## 2. Authoritative Sources

1. **NIST IR 6556 (*The NIST RS274/NGC Interpreter - Version 3*)**  
   https://doi.org/10.6028/NIST.IR.6556  
   *Applied*: Canonical numerical control state machine; modal group orthogonality; G-code tokenizer.

2. **ISO 6983-1:2009 (*Automation systems — Numerical control — Program format and definitions of address words*)**  
   https://www.iso.org/standard/41662.html  
   *Applied*: Standard address word structure ($N, G, X, Y, Z, A, B, F, S, T, M$); project plans formatted as NC part programs (`O1001.NC`).

3. **ISO 13850:2015 (*Safety of machinery — Emergency stop function*)**  
   https://www.iso.org/standard/59970.html  
   *Applied*: Single-action mushroom latch E-stop with dedicated reset requirement before Cycle Start re-arming.

4. **Siemens SINUMERIK 840D sl / ONE Milling Operations Manual**  
   https://support.industry.siemens.com/cs/document/109818037/sinumerik-operate-milling  
   *Applied*: 4-quadrant pendant layout; tool turret wear offset tables; ShopMill conversational program management.

---

## 3. Framework and Dependency Research

- **Primary Framework**: Alpine.js (`../../vendor/alpine.js`). Ultra-lightweight reactive directives (`x-data`, `x-on`, `x-bind`) providing clean industrial component state bindings without bundling overhead.
- **Primary Renderer**: Hardware-Accelerated 2.5D/3D Canvas Toolpath Visualizer + 7-Segment DRO Numeric Font Rendering.
- **Zero Remote Dependencies**: 100% locally served via `../../headless-dashboard-client.js` and `../../vendor/alpine.js`.

---

## 4. Applied Design Decisions

- **5-Axis DRO Display**: High-contrast green phosphor coordinates ($X: +142.500\text{ mm}, Y: +84.200\text{ mm}, Z: -12.000\text{ mm}$).
- **3D Toolpath Viewport**: Real-time canvas rendering of bounding stock, cutting trajectory passes, and spindle vector.
- **ATC Turret Registry**: Tool pockets $T01\text{--}T06$ mapping agent roles to cutter offsets and wear metrics.
- **MDI Console & Deblock Intercom**: Direct manual input for operator steering and alarm resolution.

---

## 5. Accessibility Decisions

- **High-Contrast DRO**: $> 8.5:1$ contrast ratio using neon emerald on anthracite.
- **Keyboard Shortcuts**: `Space` for Cycle Start, `Esc` for Feed Hold, `Shift+Esc` for E-Stop, `J/K` for MPG handwheel jogging.
- **ARIA Live Regions**: Machine state transitions and alarms announced to screen readers.

---

## 6. Performance Decisions

- **Path2D Batching**: Toolpaths batch into cached segment paths to achieve 60 FPS under heavy tool execution loads.
- **Bounded G-Code Buffer**: 500 blocks sliding window to prevent memory accumulation.

---

## 7. Distinctions from the Other 19 Dashboards

- **vs. Broadsheet / Gallery**: High-precision industrial manufacturing machine pendant, whereas Broadsheet is a newspaper and Gallery is an art museum.
- **vs. Flight Annunciator**: Subtractive CNC machine tool kinematics and G-code motion, whereas Flight Annunciator is an aerospace cockpit.
- **vs. All Others**: The only dashboard modeling swarm execution as 5-axis CNC machining with DRO coordinates, G-code blocks, and Cycle Start / Feed Hold interlocks.
