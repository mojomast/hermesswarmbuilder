/**
 * Dashboard D: 3D Temporal Mission Environment Controller (Spec §6, §7, §13, §15, §23)
 * Full WebGL2/WebGPU spatiotemporal mission environment with longitudinal Z-axis corridor,
 * radially diverging cubic Bézier variant branches, 3D octahedron rubric prisms,
 * synthesis convergence funnel, 2D orthographic radar HUD, and timeline scrubber dock.
 */

import * as THREE from "../../vendor/three.js";
import {
  ControlPlaneClient,
  deriveCanonicalDisposition,
  getAssuranceLevel,
  computeLineDiff,
  escapeHtml,
  sanitizeMarkdownToHtml
} from "../shared/api-client.js";

// ==========================================
// 1. RICH DEFAULT / MOCK DATA ENGINE
// ==========================================

const DEFAULT_CHAMBERS = [
  {
    id: "history",
    name: "Historical Archive Racks",
    z: -300,
    status: "archived",
    phase: "lineage-ledger",
    desc: "Past iteration runs, immutable lineage ledger, and previous generation outcomes.",
    duration: "6.2h cumulative",
    checkpoints: "Iterations 1-3 preserved",
    artifacts: ["archive/iter-001.json", "archive/iter-002.json", "archive/iter-003.json"]
  },
  {
    id: "spec",
    name: "1. Specification Chamber",
    z: -150,
    status: "passed",
    phase: "spec-approved",
    desc: "Frozen base ref binding, acceptance criteria, scope boundaries, and acceptance gates.",
    duration: "4m 12s",
    checkpoints: "Base Commit: 7a3f8c2 (main)",
    artifacts: ["specs/mission-spec.json", "plans/project-plan.json"]
  },
  {
    id: "draft",
    name: "2. Architecture Chamber",
    z: -75,
    status: "passed",
    phase: "devplan-approved",
    desc: "Modular subsystem decomposition, agent role assignments, and isolation topology.",
    duration: "8m 45s",
    checkpoints: "Subsystems: 5 modules decomposed",
    artifacts: ["architecture/modular-topology.json"]
  },
  {
    id: "arena",
    name: "3. Variant Exploration Arena",
    z: 0,
    status: "active",
    phase: "variant-generation",
    desc: "K=3 candidate variants radially diverging in isolated worktrees along 3D cubic Bézier splines.",
    duration: "14m 20s (active)",
    checkpoints: "Branches: 3 isolated worktrees",
    artifacts: ["variants/v1-balanced/", "variants/v2-cyber-minimal/", "variants/v3-dense-instrument/"]
  },
  {
    id: "eval",
    name: "4. Evaluation Radar Arena",
    z: 75,
    status: "passed",
    phase: "multi-axis-evaluation",
    desc: "Multi-dimensional rubric scoring across objective fit, accessibility, performance, and visual polish.",
    duration: "6m 10s",
    checkpoints: "3D Octahedron Rubric Prisms",
    artifacts: ["eval/eval-matrix.json", "eval/rubric-scores.json"]
  },
  {
    id: "synth",
    name: "5. Synthesis Funnel",
    z: 150,
    status: "passed",
    phase: "synthesis-convergence",
    desc: "Translucent Bézier convergence funnel selecting winning features into golden release trunk.",
    duration: "3m 50s",
    checkpoints: "Integration: Winner Selection + Cherry-Pick",
    artifacts: ["synthesis/accepted-features.json", "synthesis/synthesis-record.json"]
  },
  {
    id: "gate",
    name: "6. Gate & Release Crystal",
    z: 250,
    status: "passed",
    phase: "terminal-handoff",
    desc: "Rotating emerald dodecahedron crystal with runner-verified gate closeout and handoff actions.",
    duration: "1m 30s",
    checkpoints: "Release Hash: b8e41a9 (feat/release-trunk)",
    artifacts: ["gates/closeout-evidence.json", "handoff/terminal-summary.md"]
  }
];

const DEFAULT_VARIANTS = [
  {
    id: "v1-balanced",
    name: "Variant 1: Balanced High-Density",
    branch: "feat/var-1-balanced",
    commit: "a1b2c3d",
    color: "#10b981",
    threeColor: 0x10b981,
    angle: 0,
    isWinner: true,
    recommendation: "ACCEPT (Winner)",
    totalScore: 94.2,
    scores: {
      objectiveFit: 96,
      userValue: 95,
      visualQuality: 92,
      implementationQuality: 98,
      accessibility: 94,
      performance: 90
    },
    hardGateViolations: 0,
    scopeCompliance: "100% within limits",
    changes: [
      "Added 3D longitudinal corridor with Three.js WebGL2/WebGPU",
      "Built 2D orthographic radar rubric inspector without 3D distortion",
      "Integrated continuous Z-axis timeline scrubber with hotkeys",
      "Ensured full WCAG 2.2 AA contrast & prefers-reduced-motion compliance"
    ],
    risks: "None identified. All 18 automated test suites passed.",
    evaluatorRationale: "Variant 1 achieves outstanding objective adherence, pristine visual hierarchy, zero hard-gate violations, and 100% runner-verified validation pass rate.",
    diffOld: `class MissionCorridor {
  constructor() {
    this.status = "idle";
  }
}`,
    diffNew: `class MissionCorridor {
  constructor() {
    this.status = "active";
    this.chambers = DEFAULT_CHAMBERS;
    this.camera = new THREE.PerspectiveCamera(50, aspect, 1, 3500);
    this.initLongitudinalSpine();
    this.initDivergingBranches();
  }
}`
  },
  {
    id: "v2-cyber-minimal",
    name: "Variant 2: Cyber-Minimalist",
    branch: "feat/var-2-cyber-minimal",
    commit: "c3d4e5f",
    color: "#38bdf8",
    threeColor: 0x38bdf8,
    angle: (2 * Math.PI) / 3,
    isWinner: false,
    recommendation: "REJECT (Secondary)",
    totalScore: 81.5,
    scores: {
      objectiveFit: 84,
      userValue: 80,
      visualQuality: 88,
      implementationQuality: 82,
      accessibility: 78,
      performance: 88
    },
    hardGateViolations: 0,
    scopeCompliance: "Within limits",
    changes: [
      "Implemented minimalist wireframe corridor aesthetics",
      "Added basic timeline slider without orthographic radar chart",
      "Omitted chronological waterfall sidebar"
    ],
    risks: "Missing accessible left sidebar stage list.",
    evaluatorRationale: "Clean cyberpunk aesthetic but lacks required WCAG 2.2 AA accessibility waterfall table and comprehensive radar rubric HUD.",
    diffOld: `const visualMode = "standard";`,
    diffNew: `const visualMode = "cyber-wireframe";
const enableGlow = true;`
  },
  {
    id: "v3-dense-instrument",
    name: "Variant 3: Dense Telemetry Grid",
    branch: "feat/var-3-dense-telemetry",
    commit: "e5f6a7b",
    color: "#f59e0b",
    threeColor: 0xf59e0b,
    angle: (4 * Math.PI) / 3,
    isWinner: false,
    recommendation: "REJECT (Scope Breach)",
    totalScore: 68.0,
    scores: {
      objectiveFit: 70,
      userValue: 65,
      visualQuality: 60,
      implementationQuality: 74,
      accessibility: 72,
      performance: 67
    },
    hardGateViolations: 1,
    scopeCompliance: "Exceeded max DOM node count",
    changes: [
      "Rendered 40 simultaneous floating telemetry canvas elements",
      "Added unredacted process memory inspector",
      "Attempted client-side shell execution"
    ],
    risks: "Hard-gate violation: Client-side execution violates Spec §3.3 safety boundary.",
    evaluatorRationale: "High telemetry density but broke safety bounds by introducing unvalidated client shell execution.",
    diffOld: `function runSafe() { return true; }`,
    diffNew: `function runSafe() { 
  // Violates safety boundary
  return execArbitraryCommand(); 
}`
  }
];

const DEFAULT_HISTORICAL_RUNS = [
  { id: "run-098-init", z: -350, name: "Iteration 1: Baseline Architecture", status: "completed", score: "78.4", date: "2026-08-19" },
  { id: "run-101-alpha", z: -280, name: "Iteration 2: Telemetry Integration", status: "completed", score: "86.1", date: "2026-08-20" },
  { id: "run-102-beta", z: -210, name: "Iteration 3: 3D Math & Conduits", status: "completed", score: "89.8", date: "2026-08-21" }
];

const DEFAULT_GATES = [
  { id: "gate-01-integrity", desc: "Source branch integrity (main untouched)", required: true, assurance: "Runner-verified", status: "PASSED", path: "evidence/source-integrity.json" },
  { id: "gate-02-rubric", desc: "Evaluation score threshold >= 85.0/100", required: true, assurance: "Runner-verified", status: "PASSED", path: "eval/eval-matrix.json" },
  { id: "gate-03-wcag", desc: "WCAG 2.2 AA Contrast & keyboard navigation", required: true, assurance: "Runner-verified", status: "PASSED", path: "evidence/a11y-audit.json" },
  { id: "gate-04-safety", desc: "No client-side shell / unvalidated command injection", required: true, assurance: "Runner-verified", status: "PASSED", path: "evidence/safety-audit.json" },
  { id: "gate-05-operator", desc: "Operator immutable plan revision approval", required: true, assurance: "Operator-attested", status: "PASSED", path: "plans/approval-digest.json" }
];

// ==========================================
// 2. MAIN CONTROLLER CLASS
// ==========================================

class TemporalMissionController {
  constructor() {
    this.client = new ControlPlaneClient();
    this.canvas = document.getElementById("temporal-canvas");
    this.tooltip = document.getElementById("canvas-tooltip");
    
    this.chambers = DEFAULT_CHAMBERS;
    this.variants = DEFAULT_VARIANTS;
    this.historicalRuns = DEFAULT_HISTORICAL_RUNS;
    this.gates = DEFAULT_GATES;
    
    this.selectedChamberIndex = 3; // Default to Chamber 3: Variant Exploration Arena (Z=0)
    this.selectedVariantId = "v1-balanced";
    this.activeInspectorTab = "radar";
    this.isTourRunning = false;
    this.tourZ = 0;
    this.tourDirection = 1;
    
    this.reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.isRendering = false;
    this.needsRender = true;
    this.animatingUntil = performance.now() + 3000;
    
    this.cameraCurrentPos = new THREE.Vector3(0, 32, 70);
    this.cameraTargetPos = new THREE.Vector3(0, 32, 70);
    this.cameraLookAtCurrent = new THREE.Vector3(0, 0, 0);
    this.cameraLookAtTarget = new THREE.Vector3(0, 0, 0);

    this.interactiveObjects = [];
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.initElements();
    this.initThreeScene();
    this.bindDOMEvents();
    this.initApp();
  }

  initElements() {
    this.el = {
      hudStatus: document.getElementById("hud-status"),
      hudRun: document.getElementById("hud-run"),
      hudPipeline: document.getElementById("hud-pipeline"),
      hudGen: document.getElementById("hud-gen"),
      hudAdmission: document.getElementById("hud-admission"),
      hudObjective: document.getElementById("hud-objective"),
      hudIdentity: document.getElementById("hud-identity"),
      streamDot: document.getElementById("stream-status-dot"),
      waterfallList: document.getElementById("waterfall-list"),
      inspectorTitle: document.getElementById("inspector-title"),
      inspectorZPill: document.getElementById("inspector-z-pill"),
      inspectorContent: document.getElementById("inspector-content"),
      inspectorPanel: document.querySelector(".chamber-inspector"),
      btnToggleInspector: document.getElementById("btn-toggle-inspector"),
      inspectorTabs: document.querySelectorAll(".inspector-tab"),
      scrubberSlider: document.getElementById("scrubber-slider"),
      sliderLabel: document.getElementById("slider-label"),
      btnScrubPrev: document.getElementById("btn-scrub-prev"),
      btnScrubNext: document.getElementById("btn-scrub-next"),
      btnAutoTour: document.getElementById("btn-auto-tour"),
      btnResetView: document.getElementById("btn-reset-view"),
      bookmarkButtons: document.querySelectorAll(".btn-bookmark"),
      btnPause: document.getElementById("btn-pause-checkpoint"),
      btnStop: document.getElementById("btn-graceful-stop"),
      btnResume: document.getElementById("btn-resume"),
      btnRunNow: document.getElementById("btn-run-now"),
      btnSteerModal: document.getElementById("btn-steer-modal"),
      steerDialog: document.getElementById("steer-dialog"),
      btnCloseSteerDialog: document.getElementById("btn-close-steer-dialog"),
      btnCancelSteer: document.getElementById("btn-cancel-steer"),
      btnSubmitSteer: document.getElementById("btn-submit-steer"),
      steerText: document.getElementById("steer-text"),
      steerScope: document.getElementById("steer-scope"),
      steerPriority: document.getElementById("steer-priority"),
      rawDialog: document.getElementById("raw-dialog"),
      rawModalCode: document.getElementById("raw-modal-code"),
      btnCloseRawDialog: document.getElementById("btn-close-raw-dialog"),
      btnCloseRaw: document.getElementById("btn-close-raw"),
      btnCopyRaw: document.getElementById("btn-copy-raw")
    };
  }

  // ==========================================
  // 3. THREE.JS 3D SCENE CONSTRUCTION
  // ==========================================

  initThreeScene() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070c);
    this.scene.fog = new THREE.FogExp2(0x05070c, 0.0018);

    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 3500);
    this.camera.position.copy(this.cameraCurrentPos);
    this.camera.lookAt(this.cameraLookAtCurrent);

    // Dynamic Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xa855f7, 1.6);
    dirLight.position.set(40, 100, 80);
    this.scene.add(dirLight);

    const accentLight = new THREE.DirectionalLight(0x38bdf8, 1.2);
    accentLight.position.set(-60, 80, -100);
    this.scene.add(accentLight);

    // Build the 3D Longitudinal World
    this.buildStarfieldParticles();
    this.buildCorridorSpineAndGrid();
    this.buildHistoricalArchiveRacks();
    this.buildChamberPortals();
    this.buildDivergingVariantBranches();
    this.buildSynthesisFunnel();
    this.buildTerminalReleaseCrystal();

    this.startRenderLoop();
  }

  buildStarfieldParticles() {
    const particleCount = 1200;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 800;
      positions[i * 3 + 1] = (Math.random() - 0.2) * 400;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 1200;

      // Color variation: cyan, purple, white
      const cType = Math.random();
      if (cType > 0.6) {
        colors[i * 3] = 0.66; colors[i * 3 + 1] = 0.33; colors[i * 3 + 2] = 0.97; // purple
      } else if (cType > 0.3) {
        colors[i * 3] = 0.22; colors[i * 3 + 1] = 0.74; colors[i * 3 + 2] = 0.97; // cyan
      } else {
        colors[i * 3] = 0.8; colors[i * 3 + 1] = 0.85; colors[i * 3 + 2] = 0.95; // white
      }
    }

    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 2.2,
      vertexColors: true,
      transparent: true,
      opacity: 0.65
    });

    this.starfield = new THREE.Points(geo, mat);
    this.scene.add(this.starfield);
  }

  buildCorridorSpineAndGrid() {
    // 1. Dual Glowing Guide Rails along Z-Axis (-450m to +300m)
    const railOffset = 18;
    const spineGeoLeft = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-railOffset, -10, -450),
      new THREE.Vector3(-railOffset, -10, 300)
    ]);
    const spineGeoRight = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(railOffset, -10, -450),
      new THREE.Vector3(railOffset, -10, 300)
    ]);
    const railMat = new THREE.LineBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0.55 });
    this.scene.add(new THREE.Line(spineGeoLeft, railMat));
    this.scene.add(new THREE.Line(spineGeoRight, railMat));

    // 2. Longitudinal Center Glow Line
    const centerGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -10, -450),
      new THREE.Vector3(0, -10, 300)
    ]);
    const centerMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.75 });
    this.scene.add(new THREE.Line(centerGeo, centerMat));

    // 3. Metric Tick Rings along Z-axis at every 25m
    const tickRingGeo = new THREE.RingGeometry(17.8, 18.2, 32);
    const tickRingMat = new THREE.MeshBasicMaterial({ color: 0xa855f7, side: THREE.DoubleSide, transparent: true, opacity: 0.35 });

    for (let z = -400; z <= 250; z += 25) {
      const ring = new THREE.Mesh(tickRingGeo, tickRingMat);
      ring.position.set(0, -10, z);
      ring.rotation.x = Math.PI / 2;
      this.scene.add(ring);
    }
  }

  buildHistoricalArchiveRacks() {
    // Historical archive crystal pedestals in Z in [-400, -200]
    this.archiveCrystals = [];

    this.historicalRuns.forEach((run) => {
      const group = new THREE.Group();
      group.position.set(0, 0, run.z);

      // Base pedestal
      const pedestalGeo = new THREE.CylinderGeometry(8, 10, 3, 16);
      const pedestalMat = new THREE.MeshStandardMaterial({ color: 0x131b2e, roughness: 0.4, metalness: 0.8 });
      const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
      pedestal.position.y = -8.5;
      group.add(pedestal);

      // Glowing crystal octahedron
      const crystalGeo = new THREE.OctahedronGeometry(5);
      const crystalMat = new THREE.MeshStandardMaterial({
        color: 0xc084fc,
        roughness: 0.15,
        metalness: 0.85,
        emissive: 0x6b21a8,
        emissiveIntensity: 0.35
      });
      const crystal = new THREE.Mesh(crystalGeo, crystalMat);
      crystal.position.y = 2;
      crystal.userData = { type: "history", runId: run.id, name: run.name, z: run.z };
      group.add(crystal);
      this.archiveCrystals.push(crystal);
      this.interactiveObjects.push(crystal);

      // Floating holographic ring
      const ringGeo = new THREE.RingGeometry(7, 7.8, 24);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xa855f7, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 2;
      group.add(ring);

      this.scene.add(group);
    });
  }

  buildChamberPortals() {
    this.chamberPortals = [];

    this.chambers.forEach((ch, idx) => {
      const group = new THREE.Group();
      group.position.set(0, 0, ch.z);

      // Holographic Spec Portal Arch (Torus)
      const archGeo = new THREE.TorusGeometry(26, 0.9, 16, 48);
      const archMat = new THREE.MeshStandardMaterial({
        color: idx === 3 ? 0x38bdf8 : idx === 6 ? 0x10b981 : 0x8b5cf6,
        roughness: 0.25,
        metalness: 0.85,
        emissive: idx === 3 ? 0x0284c7 : idx === 6 ? 0x047857 : 0x5b21b6,
        emissiveIntensity: 0.3
      });
      const arch = new THREE.Mesh(archGeo, archMat);
      arch.userData = { type: "chamber", index: idx, name: ch.name, z: ch.z };
      group.add(arch);
      this.interactiveObjects.push(arch);
      this.chamberPortals.push(arch);

      // Modular Disc Platform Floor
      const discGeo = new THREE.CircleGeometry(20, 32);
      const discMat = new THREE.MeshBasicMaterial({
        color: 0x0b111e,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.65
      });
      const disc = new THREE.Mesh(discGeo, discMat);
      disc.rotation.x = Math.PI / 2;
      disc.position.y = -10;
      group.add(disc);

      // Chamber 1 (Spec): Add floating holographic requirement plane
      if (idx === 1) {
        const wireGeo = new THREE.PlaneGeometry(16, 10);
        const wireMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true, transparent: true, opacity: 0.5 });
        const wirePlane = new THREE.Mesh(wireGeo, wireMat);
        wirePlane.position.set(0, 6, 0);
        group.add(wirePlane);
      }

      // Chamber 2 (Arch Drafting): Add rotating concentric decomposition ring
      if (idx === 2) {
        this.archDiscGroup = new THREE.Group();
        const outerRingGeo = new THREE.RingGeometry(10, 12, 6);
        const outerRingMat = new THREE.MeshBasicMaterial({ color: 0x818cf8, wireframe: true, side: THREE.DoubleSide });
        const outerRing = new THREE.Mesh(outerRingGeo, outerRingMat);
        outerRing.rotation.x = Math.PI / 2;
        this.archDiscGroup.add(outerRing);

        // Subsystem node satellites
        for (let s = 0; s < 5; s++) {
          const sAngle = (s * 2 * Math.PI) / 5;
          const nodeGeo = new THREE.SphereGeometry(1.2, 8, 8);
          const nodeMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8 });
          const node = new THREE.Mesh(nodeGeo, nodeMat);
          node.position.set(11 * Math.cos(sAngle), 0, 11 * Math.sin(sAngle));
          this.archDiscGroup.add(node);
        }
        this.archDiscGroup.position.y = -4;
        group.add(this.archDiscGroup);
      }

      this.scene.add(group);
    });
  }

  buildDivergingVariantBranches() {
    const kVariants = this.variants.length;
    const radius = 28;
    this.variantEndpoints = [];
    this.radarPrisms = [];

    this.variants.forEach((v, k) => {
      const angle = (k * 2 * Math.PI) / kVariants;
      v.angle = angle;

      // 3D Cubic Bézier Curve: (0,0,-15) -> radial expansion -> endpoint at Z=75
      const curve = new THREE.CubicBezierCurve3(
        new THREE.Vector3(0, 0, -10),
        new THREE.Vector3(radius * Math.cos(angle) * 0.35, radius * Math.sin(angle) * 0.35 + 2, 20),
        new THREE.Vector3(radius * Math.cos(angle) * 0.85, radius * Math.sin(angle) * 0.85 + 4, 50),
        new THREE.Vector3(radius * Math.cos(angle), radius * Math.sin(angle) + 4, 75)
      );

      // Glowing 3D branch tube
      const tubeGeo = new THREE.TubeGeometry(curve, 36, 0.9, 8, false);
      const tubeMat = new THREE.MeshStandardMaterial({
        color: v.threeColor,
        roughness: 0.25,
        metalness: 0.8,
        emissive: v.threeColor,
        emissiveIntensity: v.isWinner ? 0.45 : 0.2
      });
      const tube = new THREE.Mesh(tubeGeo, tubeMat);
      this.scene.add(tube);

      // Worktree Node at endpoint
      const endPoint = curve.getPoint(1);
      const nodeGeo = new THREE.IcosahedronGeometry(3.5);
      const nodeMat = new THREE.MeshStandardMaterial({
        color: v.threeColor,
        roughness: 0.2,
        metalness: 0.9,
        emissive: v.threeColor,
        emissiveIntensity: 0.3
      });
      const worktreeNode = new THREE.Mesh(nodeGeo, nodeMat);
      worktreeNode.position.copy(endPoint);
      worktreeNode.userData = { type: "variant", variantId: v.id, name: v.name, z: 75 };
      this.scene.add(worktreeNode);
      this.interactiveObjects.push(worktreeNode);
      this.variantEndpoints.push(worktreeNode);

      // Chamber 4: 3D Polygonal Octahedron Rubric Prism hovering above endpoint
      const scoreHeight = 8 + (v.totalScore / 100) * 8; // Score height indicator
      const prismGeo = new THREE.OctahedronGeometry(4.5 + (v.totalScore / 100) * 1.5);
      const prismMat = new THREE.MeshStandardMaterial({
        color: v.threeColor,
        wireframe: !v.isWinner,
        roughness: 0.2,
        metalness: 0.8,
        emissive: v.threeColor,
        emissiveIntensity: v.isWinner ? 0.6 : 0.25
      });
      const prism = new THREE.Mesh(prismGeo, prismMat);
      prism.position.set(endPoint.x, endPoint.y + scoreHeight, endPoint.z);
      prism.userData = { type: "variant", variantId: v.id, name: `${v.name} (Score: ${v.totalScore})`, z: 75 };
      this.scene.add(prism);
      this.interactiveObjects.push(prism);
      this.radarPrisms.push(prism);

      // Elevation line from worktree node to prism
      const elevGeo = new THREE.BufferGeometry().setFromPoints([endPoint, prism.position]);
      const elevMat = new THREE.LineDashedMaterial({ color: v.threeColor, dashSize: 1, gapSize: 0.5 });
      const elevLine = new THREE.Line(elevGeo, elevMat);
      elevLine.computeLineDistances();
      this.scene.add(elevLine);
    });
  }

  buildSynthesisFunnel() {
    // Chamber 5 (Z = +150m): Inverted translucent Bézier cone converging winning features into golden trunk
    const funnelGeo = new THREE.ConeGeometry(28, 70, 24, 2, true);
    const funnelMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      wireframe: true,
      transparent: true,
      opacity: 0.45,
      emissive: 0x059669,
      emissiveIntensity: 0.2
    });
    this.synthesisFunnel = new THREE.Mesh(funnelGeo, funnelMat);
    this.synthesisFunnel.rotation.x = Math.PI / 2;
    this.synthesisFunnel.position.set(0, 4, 115);
    this.synthesisFunnel.userData = { type: "chamber", index: 5, name: "5. Synthesis Convergence Funnel", z: 150 };
    this.scene.add(this.synthesisFunnel);
    this.interactiveObjects.push(this.synthesisFunnel);

    // Golden Release Trunk Tube (Z=150 to Z=250)
    const trunkPoints = [new THREE.Vector3(0, 4, 150), new THREE.Vector3(0, 4, 250)];
    const trunkCurve = new THREE.CatmullRomCurve3(trunkPoints);
    const trunkGeo = new THREE.TubeGeometry(trunkCurve, 20, 1.4, 12, false);
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.2,
      metalness: 0.9,
      emissive: 0xd97706,
      emissiveIntensity: 0.45
    });
    this.releaseTrunk = new THREE.Mesh(trunkGeo, trunkMat);
    this.scene.add(this.releaseTrunk);
  }

  buildTerminalReleaseCrystal() {
    // Chamber 6 (Z = +250m): Rotating Emerald Dodecahedron Release Crystal
    const crystalGeo = new THREE.DodecahedronGeometry(8.5);
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      roughness: 0.1,
      metalness: 0.9,
      emissive: 0x10b981,
      emissiveIntensity: 0.55
    });
    this.releaseCrystal = new THREE.Mesh(crystalGeo, crystalMat);
    this.releaseCrystal.position.set(0, 4, 250);
    this.releaseCrystal.userData = { type: "chamber", index: 6, name: "6. Terminal Release Crystal", z: 250 };
    this.scene.add(this.releaseCrystal);
    this.interactiveObjects.push(this.releaseCrystal);

    // 3 Orbiting validation verification rings
    this.validationRings = [];
    const ringColors = [0x10b981, 0x38bdf8, 0xa855f7];
    const ringRadii = [13, 16, 19];

    ringRadii.forEach((r, idx) => {
      const rGeo = new THREE.RingGeometry(r - 0.25, r + 0.25, 36);
      const rMat = new THREE.MeshBasicMaterial({ color: ringColors[idx], side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
      const ringMesh = new THREE.Mesh(rGeo, rMat);
      ringMesh.position.set(0, 4, 250);
      ringMesh.rotation.x = Math.PI / 4 + idx * 0.4;
      ringMesh.rotation.y = idx * 0.5;
      this.scene.add(ringMesh);
      this.validationRings.push(ringMesh);
    });

    // Vertical terminal emission beam
    const beamGeo = new THREE.CylinderGeometry(0.8, 0.8, 120, 16);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.35 });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(0, 60, 250);
    this.scene.add(beam);
  }

  // ==========================================
  // 4. RENDERING & ON-DEMAND LOOP
  // ==========================================

  requestRender(durationMs = 2000) {
    this.needsRender = true;
    this.animatingUntil = Math.max(this.animatingUntil, performance.now() + durationMs);
  }

  startRenderLoop() {
    const animate = () => {
      requestAnimationFrame(animate);
      const now = performance.now();

      // Camera lerp towards target
      if (!this.reduceMotion) {
        this.cameraCurrentPos.lerp(this.cameraTargetPos, 0.08);
        this.cameraLookAtCurrent.lerp(this.cameraLookAtTarget, 0.08);
        this.camera.position.copy(this.cameraCurrentPos);
        this.camera.lookAt(this.cameraLookAtCurrent);
      } else {
        this.camera.position.copy(this.cameraTargetPos);
        this.camera.lookAt(this.cameraLookAtTarget);
      }

      // Continuous subtle rotations if not reduced-motion
      if (!this.reduceMotion) {
        if (this.releaseCrystal) {
          this.releaseCrystal.rotation.y += 0.008;
          this.releaseCrystal.rotation.x += 0.004;
        }
        if (this.validationRings) {
          this.validationRings.forEach((r, i) => {
            r.rotation.z += 0.006 * (i % 2 === 0 ? 1 : -1);
          });
        }
        if (this.radarPrisms) {
          this.radarPrisms.forEach((p, i) => {
            p.rotation.y += 0.01 + i * 0.003;
          });
        }
        if (this.archDiscGroup) {
          this.archDiscGroup.rotation.y += 0.005;
        }
        if (this.archiveCrystals) {
          this.archiveCrystals.forEach((c) => {
            c.rotation.y += 0.006;
          });
        }
      }

      // Auto-tour cruise
      if (this.isTourRunning) {
        this.tourZ += 0.8 * this.tourDirection;
        if (this.tourZ > 250) this.tourDirection = -1;
        if (this.tourZ < -350) this.tourDirection = 1;
        this.scrubToZ(this.tourZ, false);
      }

      // Render if dirty or animating
      if (this.needsRender || now < this.animatingUntil || this.isTourRunning) {
        this.renderer.render(this.scene, this.camera);
        if (now >= this.animatingUntil && !this.isTourRunning) {
          this.needsRender = false;
        }
      }
    };

    animate();
  }

  // ==========================================
  // 5. DOM EVENTS & INTERACTIVITY
  // ==========================================

  bindDOMEvents() {
    // Window Resize
    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.requestRender();
    });

    // Scrubber Slider
    this.el.scrubberSlider?.addEventListener("input", (e) => {
      const z = parseInt(e.target.value, 10);
      this.isTourRunning = false;
      this.el.btnAutoTour?.classList.remove("running");
      this.scrubToZ(z, true);
    });

    // Step Buttons
    this.el.btnScrubPrev?.addEventListener("click", () => this.jumpChamber(-1));
    this.el.btnScrubNext?.addEventListener("click", () => this.jumpChamber(1));

    // Chamber Quick Bookmarks
    this.el.bookmarkButtons?.forEach((btn) => {
      btn.addEventListener("click", () => {
        const z = parseInt(btn.getAttribute("data-z"), 10);
        this.isTourRunning = false;
        this.el.btnAutoTour?.classList.remove("running");
        this.scrubToZ(z, true);
      });
    });

    // Auto-tour toggle
    this.el.btnAutoTour?.addEventListener("click", () => {
      this.isTourRunning = !this.isTourRunning;
      this.el.btnAutoTour.classList.toggle("running", this.isTourRunning);
      this.tourZ = parseFloat(this.el.scrubberSlider.value);
      this.requestRender(100000);
    });

    // Reset View
    this.el.btnResetView?.addEventListener("click", () => {
      this.selectChamber(3); // Variant Arena Z=0
    });

    // Keyboard Hotkeys: ArrowLeft, ArrowRight, Home, R, 1-7, Space
    window.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;

      if (e.key === "ArrowLeft") { e.preventDefault(); this.jumpChamber(-1); }
      if (e.key === "ArrowRight") { e.preventDefault(); this.jumpChamber(1); }
      if (e.key === "Home" || e.key.toLowerCase() === "r") { e.preventDefault(); this.selectChamber(3); }
      if (e.key === " ") {
        e.preventDefault();
        this.el.btnAutoTour?.click();
      }
      if (e.key >= "1" && e.key <= "7") {
        const chamberIdx = parseInt(e.key, 10) - 1;
        if (chamberIdx >= 0 && chamberIdx < this.chambers.length) {
          this.selectChamber(chamberIdx);
        }
      }
    });

    // Inspector Tab Switching
    this.el.inspectorTabs?.forEach((tab) => {
      tab.addEventListener("click", () => {
        const tabId = tab.getAttribute("data-tab");
        this.setActiveInspectorTab(tabId);
      });
    });

    // Inspector Toggle Collapse
    this.el.btnToggleInspector?.addEventListener("click", () => {
      this.el.inspectorPanel?.classList.toggle("collapsed");
    });

    // Runtime Control Action Buttons
    this.el.btnPause?.addEventListener("click", () => this.handlePauseCheckpoint());
    this.el.btnStop?.addEventListener("click", () => this.handleGracefulStop());
    this.el.btnResume?.addEventListener("click", () => this.handleResumeAdmission());
    this.el.btnRunNow?.addEventListener("click", () => this.handleRunNow());
    this.el.btnSteerModal?.addEventListener("click", () => this.el.steerDialog?.showModal());

    // Steer Modal Form
    this.el.btnCloseSteerDialog?.addEventListener("click", () => this.el.steerDialog?.close());
    this.el.btnCancelSteer?.addEventListener("click", () => this.el.steerDialog?.close());
    this.el.btnSubmitSteer?.addEventListener("click", () => this.handleSubmitSteer());

    // Raw Modal
    this.el.btnCloseRawDialog?.addEventListener("click", () => this.el.rawDialog?.close());
    this.el.btnCloseRaw?.addEventListener("click", () => this.el.rawDialog?.close());
    this.el.btnCopyRaw?.addEventListener("click", () => {
      if (this.el.rawModalCode) {
        navigator.clipboard.writeText(this.el.rawModalCode.textContent || "");
        alert("Copied to clipboard!");
      }
    });

    // 3D Canvas Pointer Raycasting & Hover Tooltip
    this.canvas.addEventListener("pointermove", (e) => this.handlePointerMove(e));
    this.canvas.addEventListener("click", (e) => this.handleCanvasClick(e));
  }

  handlePointerMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.interactiveObjects, true);

    if (intersects.length > 0) {
      let hit = intersects[0].object;
      while (hit && !hit.userData?.name && hit.parent) {
        hit = hit.parent;
      }

      if (hit?.userData?.name) {
        this.canvas.style.cursor = "pointer";
        this.tooltip.style.display = "block";
        this.tooltip.style.left = `${e.clientX}px`;
        this.tooltip.style.top = `${e.clientY}px`;
        this.tooltip.textContent = `${hit.userData.name} (Z = ${hit.userData.z ?? 0}m)`;
        return;
      }
    }

    this.canvas.style.cursor = "default";
    this.tooltip.style.display = "none";
  }

  handleCanvasClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.interactiveObjects, true);

    if (intersects.length > 0) {
      let hit = intersects[0].object;
      while (hit && !hit.userData?.type && hit.parent) {
        hit = hit.parent;
      }

      if (hit?.userData) {
        const u = hit.userData;
        if (u.type === "chamber") {
          this.selectChamber(u.index);
        } else if (u.type === "variant") {
          this.selectedVariantId = u.variantId;
          this.selectChamber(3); // Go to Variant Arena
          this.setActiveInspectorTab("variants");
        } else if (u.type === "history") {
          this.selectChamber(0); // Go to Historical Archives
          this.setActiveInspectorTab("overview");
        }
      }
    }
  }

  // ==========================================
  // 6. INITIALIZATION & LIVE SYNC
  // ==========================================

  async initApp() {
    this.renderTopHud();
    this.renderWaterfall();
    this.selectChamber(this.selectedChamberIndex);

    // Subscribe to shared ControlPlaneClient
    this.client.subscribe((msg) => this.handleClientUpdate(msg));

    try {
      await this.client.resyncSnapshots();
      this.client.connectStream();
    } catch (err) {
      console.info("[TemporalController] Running in rich offline/default mode:", err);
    }
  }

  handleClientUpdate(msg) {
    if (msg.type === "stream-status") {
      this.el.streamDot.className = `stream-dot ${msg.status === 'live' ? 'connected' : msg.status === 'reconnecting' ? 'reconnecting' : 'offline'}`;
    }

    if (msg.type === "state-update" || msg.type === "resynchronized") {
      const state = this.client.cachedState || {};
      const disposition = deriveCanonicalDisposition(state, this.client.cachedControl, null, null);
      
      this.el.hudStatus.textContent = disposition.label;
      this.el.hudStatus.className = `status-badge ${disposition.class || 'status-active'}`;
      this.el.hudRun.textContent = state.currentRunId || 'run-103-spatial';
      this.el.hudPipeline.textContent = state.pipeline || 'Managed';
      
      if (state.objective) {
        this.el.hudObjective.textContent = state.objective;
      }

      this.renderTopHud();
      this.renderWaterfall();
      this.renderInspectorContent();
    }
  }

  // ==========================================
  // 7. HUD & WATERFALL RENDERING
  // ==========================================

  renderTopHud() {
    const state = this.client.cachedState || {};
    const planId = state.planId ? state.planId.slice(0, 8) : "plan-9021";
    const rev = state.revision || 3;
    const approval = "sha256:7f4a2...";
    const launch = state.launchId || "lnch-002";
    const request = "req-11";
    const run = state.currentRunId || "run-103-spatial";
    const iter = state.iterationId || "iter-004-spatial";

    // Spec §6.4: Identity Lineage Strip: Plan -> Rev -> Approval -> Launch -> Request -> Run -> Iteration
    this.el.hudIdentity.innerHTML = `
      <span class="identity-node" title="Plan ID: ${planId}">Plan: <strong>${planId}</strong></span>
      <span class="identity-arrow">➔</span>
      <span class="identity-node" title="Revision: #${rev}">Rev: <strong>#${rev}</strong></span>
      <span class="identity-arrow">➔</span>
      <span class="identity-node" title="Approval Digest: ${approval}">Approval: <strong>${approval}</strong></span>
      <span class="identity-arrow">➔</span>
      <span class="identity-node" title="Launch Authority Slot: ${launch}">Launch: <strong>${launch}</strong></span>
      <span class="identity-arrow">➔</span>
      <span class="identity-node" title="Runner Ticket Request: ${request}">Request: <strong>${request}</strong></span>
      <span class="identity-arrow">➔</span>
      <span class="identity-node" title="Active Runner Process: ${run}">Run: <strong>${run}</strong></span>
      <span class="identity-arrow">➔</span>
      <span class="identity-node" title="Managed Iteration: ${iter}">Iteration: <strong>${iter}</strong></span>
    `;
  }

  renderWaterfall() {
    this.el.waterfallList.innerHTML = this.chambers.map((ch, idx) => `
      <div class="chamber-card ${idx === this.selectedChamberIndex ? 'active' : ''}" data-idx="${idx}" tabindex="0" role="listitem" aria-label="${ch.name}">
        <div class="card-top-row">
          <span class="card-name">${escapeHtml(ch.name)}</span>
          <span class="card-z-tag font-mono">Z = ${ch.z}m</span>
        </div>
        <div class="card-desc">${escapeHtml(ch.desc)}</div>
        <div class="card-meta-row">
          <span class="card-status-pill card-status-${ch.status}">${escapeHtml(ch.status)}</span>
          <span>${escapeHtml(ch.duration)}</span>
        </div>
      </div>
    `).join("");

    this.el.waterfallList.querySelectorAll(".chamber-card").forEach((card) => {
      card.addEventListener("click", () => {
        const idx = parseInt(card.getAttribute("data-idx"), 10);
        this.selectChamber(idx);
      });
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          const idx = parseInt(card.getAttribute("data-idx"), 10);
          this.selectChamber(idx);
        }
      });
    });
  }

  // ==========================================
  // 8. NAVIGATION & CAMERA SCRUBBING
  // ==========================================

  selectChamber(idx) {
    this.selectedChamberIndex = Math.max(0, Math.min(idx, this.chambers.length - 1));
    const ch = this.chambers[this.selectedChamberIndex];

    this.el.scrubberSlider.value = ch.z;
    this.el.sliderLabel.textContent = `${ch.name} (Z = ${ch.z}m)`;
    this.el.inspectorTitle.textContent = ch.name;
    this.el.inspectorZPill.textContent = `Z = ${ch.z}m`;

    // Highlight active bookmark button
    this.el.bookmarkButtons?.forEach((btn) => {
      const bZ = parseInt(btn.getAttribute("data-z"), 10);
      btn.classList.toggle("active", Math.abs(bZ - ch.z) < 20);
    });

    this.renderWaterfall();
    this.renderInspectorContent();
    this.scrubToZ(ch.z, true);
  }

  jumpChamber(delta) {
    this.selectChamber(this.selectedChamberIndex + delta);
  }

  scrubToZ(zPos, updateLabel = true) {
    if (updateLabel) {
      this.el.scrubberSlider.value = zPos;
      // Find closest chamber for label
      let closest = this.chambers[0];
      let minDiff = 9999;
      this.chambers.forEach((c) => {
        const diff = Math.abs(c.z - zPos);
        if (diff < minDiff) { minDiff = diff; closest = c; }
      });
      this.el.sliderLabel.textContent = `${closest.name} (Z = ${zPos}m)`;
    }

    // Set camera target
    this.cameraTargetPos.set(0, 32, zPos + 75);
    this.cameraLookAtTarget.set(0, 0, zPos);
    this.requestRender();
  }

  setActiveInspectorTab(tabId) {
    this.activeInspectorTab = tabId;
    this.el.inspectorTabs.forEach((tab) => {
      const isMatch = tab.getAttribute("data-tab") === tabId;
      tab.classList.toggle("active", isMatch);
      tab.setAttribute("aria-selected", isMatch ? "true" : "false");
    });
    this.renderInspectorContent();
  }

  // ==========================================
  // 9. RIGHT INSPECTOR TAB VIEWS (Spec §13, §14, §15)
  // ==========================================

  renderInspectorContent() {
    const ch = this.chambers[this.selectedChamberIndex];

    switch (this.activeInspectorTab) {
      case "radar":
        this.render2DRadarRubricView();
        break;
      case "variants":
        this.renderVariantsAndDiffsView();
        break;
      case "synthesis":
        this.renderSynthesisView();
        break;
      case "gates":
        this.renderGatesView();
        break;
      case "handoff":
        this.renderHandoffView();
        break;
      default:
        this.renderOverviewView(ch);
        break;
    }
  }

  renderOverviewView(ch) {
    this.el.inspectorContent.innerHTML = `
      <div class="inspector-section">
        <div class="section-title">
          <span>Chamber Overview</span>
          <span class="status-badge status-active font-mono">${escapeHtml(ch.phase)}</span>
        </div>
        <div class="section-card">
          <p style="color: var(--text-secondary); margin-bottom: 8px;">${escapeHtml(ch.desc)}</p>
          <div style="font-family: var(--font-mono); font-size: 10px; display: flex; flex-direction: column; gap: 4px; color: var(--text-muted);">
            <div><strong>Longitudinal Coordinate:</strong> Z = ${ch.z}m</div>
            <div><strong>Stage Execution Time:</strong> ${escapeHtml(ch.duration)}</div>
            <div><strong>Checkpoint State:</strong> ${escapeHtml(ch.checkpoints)}</div>
            <div><strong>State Integrity:</strong> Authoritative immutable record (SHA-256)</div>
          </div>
        </div>
      </div>

      <div class="inspector-section">
        <div class="section-title">Associated Artifacts</div>
        <div class="section-card">
          <ul style="padding-left: 16px; font-family: var(--font-mono); font-size: 10px; color: var(--color-time-light);">
            ${ch.artifacts.map(a => `<li>${escapeHtml(a)}</li>`).join("")}
          </ul>
        </div>
      </div>
    `;
  }

  /**
   * 2D Orthographic Radar / Rubric HUD (Spec §13.3)
   * Renders 6-axis SVG radar chart mathematically comparing all variants without perspective distortion.
   */
  render2DRadarRubricView() {
    const axes = [
      { key: "objectiveFit", label: "Objective Fit" },
      { key: "userValue", label: "User Value" },
      { key: "visualQuality", label: "Visual Quality" },
      { key: "implementationQuality", label: "Impl Quality" },
      { key: "accessibility", label: "Accessibility" },
      { key: "performance", label: "Performance" }
    ];

    const cx = 150, cy = 115, r = 80;
    const numAxes = axes.length;

    // Build SVG Grid Webs & Axes
    let gridSvg = "";
    [0.25, 0.5, 0.75, 1.0].forEach((level) => {
      const levelR = r * level;
      const pts = [];
      for (let i = 0; i < numAxes; i++) {
        const angle = (i * 2 * Math.PI) / numAxes - Math.PI / 2;
        pts.push(`${cx + levelR * Math.cos(angle)},${cy + levelR * Math.sin(angle)}`);
      }
      gridSvg += `<polygon points="${pts.join(" ")}" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1" />`;
    });

    // Axis Lines & Labels
    let axesSvg = "";
    axes.forEach((axis, i) => {
      const angle = (i * 2 * Math.PI) / numAxes - Math.PI / 2;
      const x2 = cx + r * Math.cos(angle);
      const y2 = cy + r * Math.sin(angle);
      const lx = cx + (r + 18) * Math.cos(angle);
      const ly = cy + (r + 18) * Math.sin(angle);

      axesSvg += `
        <line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}" stroke="rgba(255,255,255,0.15)" stroke-width="1" />
        <text x="${lx}" y="${ly}" fill="#94a3b8" font-size="8" font-family="monospace" text-anchor="middle" dominant-baseline="middle">${axis.label}</text>
      `;
    });

    // Variant Polygons
    let polygonsSvg = "";
    this.variants.forEach((v) => {
      const pts = [];
      axes.forEach((axis, i) => {
        const angle = (i * 2 * Math.PI) / numAxes - Math.PI / 2;
        const val = (v.scores[axis.key] || 50) / 100;
        const px = cx + r * val * Math.cos(angle);
        const py = cy + r * val * Math.sin(angle);
        pts.push(`${px},${py}`);
      });

      polygonsSvg += `
        <polygon points="${pts.join(" ")}" fill="${v.color}" fill-opacity="${v.isWinner ? '0.35' : '0.15'}" stroke="${v.color}" stroke-width="${v.isWinner ? '2.5' : '1.5'}" />
      `;
    });

    // Score comparison matrix table
    const matrixRows = axes.map((axis) => `
      <tr>
        <td>${escapeHtml(axis.label)}</td>
        ${this.variants.map((v) => `
          <td>
            <span class="score-bar-track">
              <span class="score-bar-fill" style="width: ${v.scores[axis.key]}%; background: ${v.color};"></span>
            </span>
            ${v.scores[axis.key]}
          </td>
        `).join("")}
      </tr>
    `).join("");

    this.el.inspectorContent.innerHTML = `
      <div class="inspector-section">
        <div class="section-title">
          <span>2D Orthographic Radar Rubric HUD</span>
          <span style="font-size: 10px; color: var(--text-muted);">Zero Perspective Distortion</span>
        </div>
        
        <div class="radar-chart-container">
          <svg class="radar-svg" viewBox="0 0 300 240">
            ${gridSvg}
            ${axesSvg}
            ${polygonsSvg}
          </svg>

          <div class="radar-legend">
            ${this.variants.map(v => `
              <div class="legend-item">
                <span class="legend-color-dot" style="background: ${v.color};"></span>
                <span style="color: ${v.color}; font-weight: ${v.isWinner ? '700' : '500'};">${v.name.split(':')[0]} (${v.totalScore})</span>
              </div>
            `).join("")}
          </div>
        </div>
      </div>

      <div class="inspector-section">
        <div class="section-title">Mathematical Score Matrix (Spec §13.3)</div>
        <div class="section-card">
          <table class="score-matrix-table">
            <thead>
              <tr>
                <th>Criterion</th>
                ${this.variants.map(v => `<th style="color: ${v.color};">${v.name.split(':')[0]}</th>`).join("")}
              </tr>
            </thead>
            <tbody>
              ${matrixRows}
              <tr style="border-top: 2px solid var(--border-hud); font-weight: 700;">
                <td>Total Score</td>
                ${this.variants.map(v => `<td style="color: ${v.color}; font-size: 11px;">${v.totalScore} / 100</td>`).join("")}
              </tr>
              <tr>
                <td>Hard Violations</td>
                ${this.variants.map(v => `<td style="color: ${v.hardGateViolations > 0 ? 'var(--color-error)' : 'var(--color-success)'};">${v.hardGateViolations}</td>`).join("")}
              </tr>
              <tr>
                <td>Recommendation</td>
                ${this.variants.map(v => `<td style="font-size: 9px; font-weight: 700; color: ${v.isWinner ? 'var(--color-success)' : 'var(--text-muted)'};">${v.recommendation}</td>`).join("")}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  /**
   * Variant Detail & Diffs View (Spec §13.4)
   */
  renderVariantsAndDiffsView() {
    const selectedVariant = this.variants.find(v => v.id === this.selectedVariantId) || this.variants[0];
    const lineDiff = computeLineDiff(selectedVariant.diffOld, selectedVariant.diffNew);

    const diffHtml = lineDiff.map(d => `
      <div class="diff-line ${d.type}">
        <span class="diff-num">${d.newNum ?? d.oldNum ?? ' '}</span>
        <span>${d.type === 'add' ? '+ ' : d.type === 'del' ? '- ' : '  '}${escapeHtml(d.line)}</span>
      </div>
    `).join("");

    this.el.inspectorContent.innerHTML = `
      <div class="inspector-section">
        <div class="section-title">Select Candidate Variant</div>
        <div class="variant-selector-pills">
          ${this.variants.map(v => `
            <button class="btn-variant-pill ${v.id === selectedVariant.id ? 'active' : ''}" data-vid="${v.id}" style="border-color: ${v.id === selectedVariant.id ? v.color : 'transparent'};">
              ${escapeHtml(v.name.split(':')[0])}
            </button>
          `).join("")}
        </div>
      </div>

      <div class="inspector-section">
        <div class="section-title">
          <span>${escapeHtml(selectedVariant.name)}</span>
          <span class="status-badge ${selectedVariant.isWinner ? 'status-success' : 'status-warning'}">${selectedVariant.recommendation}</span>
        </div>
        <div class="section-card">
          <div style="font-family: var(--font-mono); font-size: 10px; margin-bottom: 8px;">
            <div><strong>Branch:</strong> <code style="color: var(--color-time-light);">${selectedVariant.branch}</code></div>
            <div><strong>Commit:</strong> <code style="color: var(--color-active);">${selectedVariant.commit}</code></div>
            <div><strong>Scope Budget:</strong> ${escapeHtml(selectedVariant.scopeCompliance)}</div>
            <div><strong>Total Score:</strong> <span style="color: ${selectedVariant.color}; font-weight: 700;">${selectedVariant.totalScore} / 100</span></div>
          </div>
          
          <div style="margin-bottom: 8px;">
            <strong style="font-size: 11px;">Feature Claims:</strong>
            <ul style="padding-left: 16px; font-size: 10px; color: var(--text-secondary); margin-top: 4px;">
              ${selectedVariant.changes.map(c => `<li>${escapeHtml(c)}</li>`).join("")}
            </ul>
          </div>

          <div style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 4px; font-size: 10px;">
            <strong style="color: var(--color-time-light);">Evaluator Rationale:</strong>
            <p style="color: var(--text-muted); margin-top: 2px;">${escapeHtml(selectedVariant.evaluatorRationale)}</p>
          </div>
        </div>
      </div>

      <div class="inspector-section">
        <div class="section-title">
          <span>Code Diff (${selectedVariant.branch})</span>
          <button id="btn-open-raw-diff" class="btn-copy-cmd">View Raw</button>
        </div>
        <div class="diff-container">
          ${diffHtml}
        </div>
      </div>
    `;

    // Bind variant selector pills
    this.el.inspectorContent.querySelectorAll(".btn-variant-pill").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.selectedVariantId = btn.getAttribute("data-vid");
        this.renderVariantsAndDiffsView();
      });
    });

    // Bind Raw button
    this.el.inspectorContent.querySelector("#btn-open-raw-diff")?.addEventListener("click", () => {
      this.el.rawModalCode.textContent = `=== Code Diff: ${selectedVariant.branch} ===\n\n--- a/corridor.js\n+++ b/corridor.js\n${selectedVariant.diffNew}`;
      this.el.rawDialog?.showModal();
    });
  }

  /**
   * Synthesis & Feature Lineage View (Spec §13.5)
   */
  renderSynthesisView() {
    const winner = this.variants.find(v => v.isWinner) || this.variants[0];

    this.el.inspectorContent.innerHTML = `
      <div class="inspector-section">
        <div class="section-title">
          <span>Synthesis & Integration Record</span>
          <span class="status-badge status-success">Passed</span>
        </div>
        <div class="section-card">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <div>
              <strong style="color: var(--color-success); font-size: 12px;">Winning Variant:</strong>
              <div style="font-family: var(--font-mono); font-size: 11px;">${winner.name}</div>
            </div>
            <div style="text-align: right;">
              <span class="status-badge status-success font-mono">${winner.totalScore} pts</span>
            </div>
          </div>

          <div style="background: rgba(168, 85, 247, 0.1); border: 1px solid rgba(168, 85, 247, 0.3); padding: 8px; border-radius: 4px; font-size: 10px; margin-bottom: 10px;">
            <strong style="color: var(--color-time-light);">Integration Strategy (Spec §13.5):</strong>
            <p style="color: var(--text-secondary); margin-top: 2px;">
              <strong>Winner Selection + Cherry-Pick Integration</strong>. The runner cherry-picks the accepted commits from <code>${winner.branch}</code> into release trunk <code>feat/release-trunk</code>. Multi-variant branch blending is not used.
            </p>
          </div>

          <div style="font-family: var(--font-mono); font-size: 10px; color: var(--text-muted); margin-bottom: 8px;">
            <div><strong>Source Branch Integrity:</strong> <span style="color: var(--color-success);">PRESERVED</span> (main untouched)</div>
            <div><strong>Release Commit:</strong> <code>b8e41a9</code> (feat/release-trunk)</div>
          </div>
        </div>
      </div>

      <div class="inspector-section">
        <div class="section-title">Accepted vs Rejected Feature Set</div>
        <div class="feature-list-group">
          ${winner.changes.map(c => `
            <div class="feature-tag accepted">
              <span>✔</span>
              <span>${escapeHtml(c)}</span>
            </div>
          `).join("")}
          <div class="feature-tag rejected">
            <span>✖</span>
            <span>Unredacted process memory inspector (Rejected: security boundary)</span>
          </div>
          <div class="feature-tag rejected">
            <span>✖</span>
            <span>Client-side shell injection (Rejected: safety breach)</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Gate Evidence & Assurance View (Spec §14.2, §14.3)
   */
  renderGatesView() {
    this.el.inspectorContent.innerHTML = `
      <div class="inspector-section">
        <div class="section-title">
          <span>Acceptance Gates & Evidence</span>
          <span class="status-badge status-success">All Gates Verified</span>
        </div>
        <div class="section-card" style="padding: 0;">
          ${this.gates.map(g => `
            <div class="gate-row">
              <div style="flex: 1; padding-right: 8px;">
                <div class="gate-id">${escapeHtml(g.id)}</div>
                <div style="color: var(--text-secondary); font-size: 10px;">${escapeHtml(g.desc)}</div>
                <div style="font-family: var(--font-mono); font-size: 9px; color: var(--text-muted); margin-top: 2px;">
                  Path: <code>${escapeHtml(g.path)}</code>
                </div>
              </div>
              <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                <span class="${g.assurance === 'Runner-verified' ? 'gate-badge-runner' : 'gate-badge-agent'}">${g.assurance}</span>
                <span class="status-badge status-success" style="font-size: 9px;">${g.status}</span>
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  /**
   * Handoff & Recovery View (Spec §15.1, §15.2)
   */
  renderHandoffView() {
    this.el.inspectorContent.innerHTML = `
      <div class="inspector-section">
        <div class="section-title">
          <span>Terminal Handoff & Review</span>
          <span class="status-badge status-success">Ready for Review</span>
        </div>
        <div class="section-card">
          <p style="color: var(--text-secondary); margin-bottom: 8px;">
            Managed iteration completed all verification stages with zero hard-gate violations. Accepted release trunk is preserved and ready for operator review.
          </p>

          <div style="font-family: var(--font-mono); font-size: 10px; margin-bottom: 10px; display: flex; flex-direction: column; gap: 3px;">
            <div><strong>Accepted Branch:</strong> <code>feat/var-1-balanced</code></div>
            <div><strong>Release Commit:</strong> <code>b8e41a9</code></div>
            <div><strong>Base Commit:</strong> <code>7a3f8c2</code> (main preserved)</div>
            <div><strong>Rollback Guidance:</strong> Clean Git worktree; revert branch pointer if needed.</div>
          </div>

          <strong style="font-size: 11px;">Git Review Command:</strong>
          <div class="code-command-box" style="margin-top: 4px;">
            <span id="cmd-text">git checkout feat/var-1-balanced && git log -n 5</span>
            <button id="btn-copy-git" class="btn-copy-cmd">Copy</button>
          </div>
        </div>
      </div>

      <div class="inspector-section">
        <div class="section-title">Next Operator Actions</div>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <button id="btn-next-gen" class="btn-hud btn-accent" style="padding: 8px; text-align: center;">
            🚀 Authorize Next Generation (Gen 2 / 10)
          </button>
          <button id="btn-fork-draft" class="btn-hud" style="padding: 8px; text-align: center;">
            🍴 Create Fork Draft Plan from this Checkpoint
          </button>
        </div>
      </div>
    `;

    this.el.inspectorContent.querySelector("#btn-copy-git")?.addEventListener("click", () => {
      const txt = this.el.inspectorContent.querySelector("#cmd-text")?.textContent || "";
      navigator.clipboard.writeText(txt);
      alert("Review command copied to clipboard!");
    });

    this.el.inspectorContent.querySelector("#btn-next-gen")?.addEventListener("click", () => {
      alert("Next generation ticket submitted to scheduler queue.");
    });
  }

  // ==========================================
  // 10. RUNTIME CONTROL HANDLERS
  // ==========================================

  async handlePauseCheckpoint() {
    if (!confirm("Pause active run at next safe checkpoint (Spec §6.3, §15.3)?")) return;
    try {
      await this.client.pauseCheckpoint("Operator requested checkpoint pause via 3D Temporal HUD");
      alert("Pause intent registered. Execution will pause at next safe checkpoint.");
    } catch (err) {
      alert(`Pause failed: ${err.message}`);
    }
  }

  async handleGracefulStop() {
    if (!confirm("Gracefully stop active run at boundary and write terminal evidence (Spec §6.3)?")) return;
    try {
      await this.client.gracefulStop("Operator requested graceful stop via 3D Temporal HUD");
      alert("Graceful stop intent registered.");
    } catch (err) {
      alert(`Stop failed: ${err.message}`);
    }
  }

  async handleResumeAdmission() {
    try {
      await this.client.resumeAdmission();
      alert("Admission resumed.");
    } catch (err) {
      alert(`Resume failed: ${err.message}`);
    }
  }

  async handleRunNow() {
    try {
      await this.client.requestRunNow();
      alert("Immediate runner tick requested.");
    } catch (err) {
      alert(`Run Now failed: ${err.message}`);
    }
  }

  async handleSubmitSteer() {
    const text = this.el.steerText?.value?.trim();
    if (!text) {
      alert("Please provide a steering directive.");
      return;
    }
    const scope = this.el.steerScope?.value || "next_run";
    const priority = this.el.steerPriority?.value || "required";

    try {
      await this.client.steer(text, scope, priority);
      this.el.steerDialog?.close();
      this.el.steerText.value = "";
      alert("Steering directive dispatched successfully.");
    } catch (err) {
      alert(`Steering dispatch failed: ${err.message}`);
    }
  }
}

// Bootstrap on DOM ready
window.addEventListener("DOMContentLoaded", () => {
  window.temporalMissionApp = new TemporalMissionController();
});
