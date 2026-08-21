# Robotics Teleoperation Workstation Interface Research & Design Report

**Client Route:** `/next/robotics-teleop/index.html`
**Client Codebase Archetype:** Planetary Rover & Hazardous Environment Robotics Teleoperation Workstation
**Primary Framework:** Three.js / WebGL Kinematics Engine (`../../vendor/three.js`)
**Primary Renderer:** 3D Articulated Robotic Arm/Rover Digital Twin + HUD Overlay + Terrain Costmap

---

## 1. Design Discipline Researched

Planetary rover operations (e.g. NASA JPL Mars 2020 Perseverance Ground Data System, Boston Dynamics Spot Teleop, ROS MoveIt UI, NASA-STD-3001) operate over high-latency communication horizons:
- **Digital Twin Kinematic Visualization**: Real-time 3D forward/inverse kinematics displaying 6-DOF joint angles ($\theta_1\text{--}\theta_6$), end-effector tool poses, and collision envelopes.
- **Staged Arm-and-Fire Uplink Sequencer**: Critical ground teleoperation forbids direct unbuffered execution. Commands are staged into sequence bundles, verified against simulation constraints, armed, and transmitted via DSN uplink passes.
- **Terrain Hazard Costmap**: 2D/3D navigation grid mapping terrain slope, obstacle step-height, and acceptance gate confidence.
- **Deep Space Network (DSN) Telemetry HUD**: Round-Trip Light Time (RTLT) latency, signal-to-noise ratio, and link horizon meters.

---

## 2. Authoritative Sources

1. **NASA JPL — *Mars 2020 Perseverance Rover Ground Data System & Teleoperation Guidelines***
   https://mars.nasa.gov/mars2020/mission/technology/
   *Applied*: Staged command uplink sequencing; terrain hazard costmap visualization; Deep Space Network (DSN) link budget monitoring.

2. **Open Robotics — *ROS 2 & MoveIt 2 Motion Planning Framework Specification***
   https://moveit.picknik.ai/
   *Applied*: 6-DOF robotic manipulator joint state modeling; Cartesian path trajectory validation; interactive end-effector marker manipulation.

3. **NASA-STD-3001, Vol. 2 (*Human Integration Design Handbook — Robotic Systems Controls*)**
   https://standards.nasa.gov/standard/NASA/NASA-STD-3001-VOL-2
   *Applied*: High-contrast telemetry HUDs; multi-tier safety interlocks; visual waypoint breadcrumb trails.

4. **W3C WebGL & Web Accessibility Initiative 3D Graphics Standards**
   https://www.w3.org/WAI/tutorials/images/complex/
   *Applied*: Fallback semantic ARIA tables alongside WebGL viewports; non-visual telemetry status announcements.

---

## 3. Framework and Dependency Research

- **Primary Framework**: Three.js (`../../vendor/three.js`). Hardware-accelerated WebGL 3D scene graph, perspective camera, ambient/directional lighting, and parametric mesh geometry for digital twin robotics rendering.
- **Primary Renderer**: WebGL 3D Canvas + CSS Telemetry HUD + Interactive Waypoint Grid.
- **Zero Remote Dependencies**: 100% locally served via `../../headless-dashboard-client.js` and `../../vendor/three.js`.

---

## 4. Applied Design Decisions

- **Digital Twin Rover**: Three.js 3D viewport rendering articulated chassis, rotating rocker-bogie wheels, and 6-DOF robotic arm.
- **DSN Signal Horizon Bar**: Visualizes link connection status, SSE heartbeat round-trip latency ($ms$), and buffer telemetry.
- **Uplink Command Sequencer**: Staging rack for operation commands (`pause`, `resume`, `steer`, `deblock`).
- **Mission Plan Flight Deck**: Project plan management mapped to planetary mission sequence plans.

---

## 5. Accessibility Decisions

- **Accessible Kinematics Table**: Semantic HTML data table alongside WebGL viewport listing active joint angles, rover coordinates, and battery power.
- **Keyboard Traversal**: `ArrowKeys` for orbital camera panning; `1-6` for joint selection; `Space` for staged command uplink.
- **High-Contrast Telemetry**: High-contrast safety HUD overlays ($> 7:1$ contrast ratio).

---

## 6. Performance Decisions

- **WebGL Frame Throttling**: Renders at 60 FPS during user interaction; throttles down when camera is stationary to preserve battery and CPU cycles.
- **Geometry Instancing**: Bounded mesh allocations for terrain grid tiles and waypoint path lines.

---

## 7. Distinctions from the Other 19 Dashboards

- **vs. Constellation**: Real-time 3D planetary robotics digital twin with 6-DOF joint kinematics, whereas Constellation is an astronomical orbital node-link graph.
- **vs. CNC Machining**: Rover teleoperation and space communications over DSN link horizons, whereas CNC Machining is a subtractive milling tool controller.
- **vs. All Others**: The only dashboard modeling swarm execution as planetary rover robotics with Three.js 3D kinematics, hazard costmaps, and staged uplink sequencers.
