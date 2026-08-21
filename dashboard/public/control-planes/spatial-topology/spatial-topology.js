/**
 * Dashboard C: 3D Spatial Operations Topology Controller (Comprehensive v2)
 *
 * Full WebGPU / WebGL2 spatial operations viewport mapping swarm topology into
 * 5 operational zone pedestals (XZ plane) and 3 vertical authority tiers (Y axis).
 * Features instanced polyhedra, animated particle conduits, translucent gate energy fences,
 * volumetric blocker shockwaves, columnar resource pressure gauges, bidirectional treegrid sync,
 * on-demand invalidation rendering loop, and multi-tab contextual 2D inspector drawer.
 *
 * Grounded in docs/CONTROL_PLANE_DASHBOARD_SPEC.md (§6, §7, §11, §14, §18, §23)
 */

import * as THREE from "../../vendor/three.js";
import {
  ControlPlaneClient,
  deriveCanonicalDisposition,
  getAssuranceLevel,
  sanitizeAnsiToHtml,
  computeLineDiff,
  escapeHtml,
  RBAC_ROLES
} from "../shared/api-client.js";

class SpatialTopologyController {
  constructor() {
    this.client = new ControlPlaneClient();
    this.canvas = document.getElementById("spatial-canvas");
    this.selectedEntity = null; // { type: 'agent'|'zone'|'gate'|'authority'|'infra', id: string, data: any }
    this.hoveredEntity = null;
    
    this.nodes = [];
    this.links = [];
    this.gates = [];
    this.authorityRecords = [];
    this.infraMetrics = {};
    this.logs = [];
    this.treeExpanded = new Set(["zone-admission", "zone-reasoning", "zone-codegen", "zone-testing", "zone-release"]);
    
    this.activeInspectorTab = "overview";
    this.motionEnabled = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.isRendering = false;
    this.renderRequested = false;
    this.animTime = 0;
    this.lastTimestamp = performance.now();

    // Zone Definitions (XZ horizontal plane)
    this.zonePositions = {
      admission: new THREE.Vector3(-160, 0, 0),
      reasoning: new THREE.Vector3(-80, 0, 0),
      codegen: new THREE.Vector3(0, 0, 0),
      testing: new THREE.Vector3(80, 0, 0),
      release: new THREE.Vector3(160, 0, 0)
    };

    this.zoneMeta = {
      admission: { name: "Zone 1: Ingestion & Admission", color: 0x00f0ff, hex: "#00f0ff", x: -160, desc: "Repository preflight, candidate admission & scanning" },
      reasoning: { name: "Zone 2: Reasoning & Planning", color: 0x3b82f6, hex: "#3b82f6", x: -80, desc: "Architectural decomposition, plan generation & review" },
      codegen: { name: "Zone 3: Code Generation & Worktrees", color: 0x10b981, hex: "#10b981", x: 0, desc: "Isolated variant worktrees & parallel code synthesis" },
      testing: { name: "Zone 4: Verification & Gate Testing", color: 0xf59e0b, hex: "#f59e0b", x: 80, desc: "Deterministic testing, evaluator scoring & gate audit" },
      release: { name: "Zone 5: Release & Handoff", color: 0xa855f7, hex: "#a855f7", x: 160, desc: "Source integrity preservation, handoff & closeout" }
    };

    // Camera Navigation State
    this.cameraPosTarget = new THREE.Vector3(0, 140, 310);
    this.cameraLookTarget = new THREE.Vector3(0, 10, 0);
    this.cameraCurrentLook = new THREE.Vector3(0, 10, 0);
    this.isOrbiting = false;
    this.isPanning = false;
    this.mousePrev = { x: 0, y: 0 };
    this.spherical = { radius: 340, theta: Math.PI / 2, phi: Math.PI / 3.2 };

    this.initElements();
    this.initThreeScene();
    this.bindEvents();
    this.initDefaultData();
    this.initClient();
  }

  initElements() {
    this.el = {
      hudStatus: document.getElementById("hud-status"),
      hudRun: document.getElementById("hud-run"),
      hudPhase: document.getElementById("hud-phase"),
      hudAdmission: document.getElementById("hud-admission"),
      hudAttentionText: document.getElementById("hud-attention-text"),
      btnAttention: document.getElementById("btn-attention"),
      hudSse: document.getElementById("hud-sse"),
      hudFreshness: document.getElementById("hud-freshness"),
      hudRoleSelect: document.getElementById("hud-role-select"),
      hudIdentity: document.getElementById("hud-identity"),

      idPlan: document.getElementById("id-plan"),
      idRev: document.getElementById("id-rev"),
      idApproval: document.getElementById("id-approval"),
      idLaunch: document.getElementById("id-launch"),
      idReq: document.getElementById("id-req"),
      idRun: document.getElementById("id-run"),
      idIter: document.getElementById("id-iter"),

      // Semantic Sidebar Treegrid
      semanticSidebar: document.getElementById("semantic-sidebar"),
      treeTableBody: document.getElementById("tree-table-body"),
      treeSearch: document.getElementById("tree-search"),
      btnTreeExpand: document.getElementById("btn-tree-expand"),
      btnTreeCollapse: document.getElementById("btn-tree-collapse"),
      btnToggleSidebar: document.getElementById("btn-toggle-sidebar"),

      // Inspector Drawer
      nodeInspector: document.getElementById("node-inspector"),
      inspectorTypeBadge: document.getElementById("inspector-type-badge"),
      inspectorHeaderTitle: document.getElementById("inspector-header-title"),
      btnFrameInspectorNode: document.getElementById("btn-frame-inspector-node"),
      btnCloseInspector: document.getElementById("btn-close-inspector"),
      inspTabs: document.querySelectorAll(".insp-tab"),
      inspPanels: document.querySelectorAll(".insp-panel"),

      // Inspector Panel Contents
      inspectorOverviewContent: document.getElementById("inspector-overview-content"),
      inspectorLogTerminal: document.getElementById("inspector-log-terminal"),
      logSearchInput: document.getElementById("log-search-input"),
      logLevelSelect: document.getElementById("log-level-select"),
      chkLogAutoscroll: document.getElementById("chk-log-autoscroll"),
      btnCopyLogs: document.getElementById("btn-copy-logs"),
      
      diffComparisonLabel: document.getElementById("diff-comparison-label"),
      diffAdditions: document.getElementById("diff-additions"),
      diffDeletions: document.getElementById("diff-deletions"),
      inspectorDiffContainer: document.getElementById("inspector-diff-container"),
      
      inspectorEvidenceContent: document.getElementById("inspector-evidence-content"),
      
      steerInput: document.getElementById("steer-input"),
      btnInjectSteer: document.getElementById("btn-inject-steer"),
      btnActionHold: document.getElementById("btn-action-hold"),
      btnActionPause: document.getElementById("btn-action-pause"),
      btnActionStop: document.getElementById("btn-action-stop"),
      btnActionDeblock: document.getElementById("btn-action-deblock"),
      gateOverrideSelect: document.getElementById("gate-override-select"),
      btnPassGate: document.getElementById("btn-pass-gate"),
      btnBlockGate: document.getElementById("btn-block-gate"),

      // HUD Action Buttons
      btnHudHold: document.getElementById("btn-hud-hold"),
      btnHudPause: document.getElementById("btn-hud-pause"),
      btnHudStop: document.getElementById("btn-hud-stop"),
      btnHudResume: document.getElementById("btn-hud-resume"),
      btnHudRunNow: document.getElementById("btn-hud-run-now"),

      // Camera Dock
      btnResetCam: document.getElementById("btn-reset-cam"),
      btnCamFrame: document.getElementById("btn-cam-frame"),
      btnCamTop: document.getElementById("btn-cam-top"),
      btnCamInfra: document.getElementById("btn-cam-infra"),
      btnToggleMotion: document.getElementById("btn-toggle-motion"),
      motionStatusIcon: document.getElementById("motion-status-icon"),
      motionStatusText: document.getElementById("motion-status-text"),
      btnToggleHud: document.getElementById("btn-toggle-hud"),

      // 3D Tooltip
      spatialTooltip: document.getElementById("spatial-tooltip"),
      tooltipTitle: document.getElementById("tooltip-title"),
      tooltipMeta: document.getElementById("tooltip-meta"),
      tooltipDesc: document.getElementById("tooltip-desc")
    };
  }

  /* =========================================================================
   * 1. 3D SCENE GRAPH & GEOMETRY (Three.js WebGL2 / WebGPU ready)
   * ========================================================================= */

  initThreeScene() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance"
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07090e);
    this.scene.fog = new THREE.FogExp2(0x07090e, 0.0018);

    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 3000);
    this.updateCameraFromSpherical();

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    this.scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x38bdf8, 1.8);
    dirLight1.position.set(120, 250, 160);
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xa855f7, 0.9);
    dirLight2.position.set(-140, 180, -100);
    this.scene.add(dirLight2);

    // Floor Base Datum Grid
    const mainGrid = new THREE.GridHelper(600, 60, 0x1e293b, 0x0c1322);
    mainGrid.position.y = -12;
    this.scene.add(mainGrid);

    // Build Sub-Scenes
    this.buildZonePedestals();
    this.buildAuthorityPlanes();
    this.buildGateEnergyFences();
    this.buildInstancedAgentMeshes();
    this.buildConduitsAndParticles();
    this.buildResourceColumnGauges();
    this.buildBlockerAnomalyObjects();
    this.buildSelectionHalo();

    this.raycaster = new THREE.Raycaster();
    this.raycaster.params.Points.threshold = 4;
    this.mouse = new THREE.Vector2();

    this.startAnimationLoop();
  }

  buildZonePedestals() {
    this.pedestalsGroup = new THREE.Group();
    const baseCylGeo = new THREE.CylinderGeometry(34, 38, 5, 48);
    const ringGeo = new THREE.RingGeometry(33.5, 36, 48);
    const innerRingGeo = new THREE.RingGeometry(22, 23.5, 36);

    Object.keys(this.zonePositions).forEach((key) => {
      const pos = this.zonePositions[key];
      const meta = this.zoneMeta[key];

      // Heavy metallic beveled base
      const baseMat = new THREE.MeshStandardMaterial({
        color: 0x101726,
        roughness: 0.35,
        metalness: 0.8
      });
      const baseMesh = new THREE.Mesh(baseCylGeo, baseMat);
      baseMesh.position.set(pos.x, -7.5, pos.z);
      baseMesh.userData = { type: "zone", zoneId: key };
      this.pedestalsGroup.add(baseMesh);

      // Glowing Neon Perimeter Ring
      const ringMat = new THREE.MeshBasicMaterial({
        color: meta.color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(pos.x, -4.8, pos.z);
      this.pedestalsGroup.add(ring);

      // Inner subtle concentric ring
      const innerRingMat = new THREE.MeshBasicMaterial({
        color: meta.color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.35
      });
      const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
      innerRing.rotation.x = Math.PI / 2;
      innerRing.position.set(pos.x, -4.75, pos.z);
      this.pedestalsGroup.add(innerRing);

      // Floating Zone Label Hologram Marker
      const labelSprite = this.createFloatingLabelSprite(meta.name, meta.hex);
      labelSprite.position.set(pos.x, 34, pos.z - 28);
      labelSprite.userData = { type: "zone", zoneId: key };
      this.pedestalsGroup.add(labelSprite);
    });

    this.scene.add(this.pedestalsGroup);
  }

  createFloatingLabelSprite(text, colorHex) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "rgba(10, 16, 30, 0.85)";
    ctx.strokeStyle = colorHex;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(10, 10, 492, 108, 16);
    ctx.fill();
    ctx.stroke();

    ctx.font = "bold 26px 'JetBrains Mono', monospace";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 64);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.92 });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(38, 9.5, 1);
    return sprite;
  }

  buildAuthorityPlanes() {
    this.authorityGroup = new THREE.Group();

    // Top Authority Plane Grid at Y = +80
    const topGrid = new THREE.GridHelper(480, 24, 0xa855f7, 0x3b1c6e);
    topGrid.position.y = 80;
    topGrid.material.transparent = true;
    topGrid.material.opacity = 0.3;
    this.authorityGroup.add(topGrid);

    // Translucent Authority Plane Sheet
    const sheetGeo = new THREE.PlaneGeometry(460, 140);
    const sheetMat = new THREE.MeshBasicMaterial({
      color: 0xa855f7,
      transparent: true,
      opacity: 0.06,
      side: THREE.DoubleSide
    });
    const sheet = new THREE.Mesh(sheetGeo, sheetMat);
    sheet.rotation.x = Math.PI / 2;
    sheet.position.set(0, 79.5, 0);
    sheet.userData = { type: "authority", id: "auth-plane" };
    this.authorityGroup.add(sheet);

    // Cryptographic Digest Floating Cubes on Authority Plane
    const cubeGeo = new THREE.BoxGeometry(7, 7, 7);
    const cubeMat = new THREE.MeshStandardMaterial({
      color: 0xa855f7,
      roughness: 0.2,
      metalness: 0.9,
      emissive: 0x581c87,
      emissiveIntensity: 0.5
    });

    const cubePositions = [
      { x: -160, z: 0, title: "Digest: apb.scan.v1", digest: "sha256:3e1a8b9f..." },
      { x: -80, z: 0, title: "Plan Rev #3 Authority", digest: "sha256:7f4a210d..." },
      { x: 0, z: 0, title: "Approved Launch #9941", digest: "sha256:c09931ef..." },
      { x: 80, z: 0, title: "Gate Evidence Verification", digest: "sha256:88fa12bc..." },
      { x: 160, z: 0, title: "Terminal Release Handoff", digest: "sha256:01ef9422..." }
    ];

    cubePositions.forEach((cp, idx) => {
      const cube = new THREE.Mesh(cubeGeo, cubeMat);
      cube.position.set(cp.x, 80, cp.z);
      cube.userData = { type: "authority", id: `auth-digest-${idx}`, title: cp.title, digest: cp.digest };
      this.authorityGroup.add(cube);

      // Vertical tether line linking authority plane to middle tier
      const linePts = [new THREE.Vector3(cp.x, 80, cp.z), new THREE.Vector3(cp.x, 0, cp.z)];
      const lineGeo = new THREE.BufferGeometry().setFromPoints(linePts);
      const lineMat = new THREE.LineDashedMaterial({
        color: 0xa855f7,
        dashSize: 3,
        gapSize: 2,
        transparent: true,
        opacity: 0.45
      });
      const tetherLine = new THREE.Line(lineGeo, lineMat);
      tetherLine.computeLineDistances();
      this.authorityGroup.add(tetherLine);
    });

    this.scene.add(this.authorityGroup);
  }

  buildGateEnergyFences() {
    this.gatesGroup = new THREE.Group();

    // 4 Inter-Zone Transition Boundaries:
    // X = -120 (Zone 1 -> 2), X = -40 (Zone 2 -> 3), X = 40 (Zone 3 -> 4), X = 120 (Zone 4 -> 5)
    this.gateConfigs = [
      { id: "gate-1", name: "Gate 1: Ingestion & Admission Preflight", x: -120, status: "passed", required: true },
      { id: "gate-2", name: "Gate 2: Plan Revision & Architecture Approval", x: -40, status: "passed", required: true },
      { id: "gate-3", name: "Gate 3: Variant AST & Deterministic Gate Test", x: 40, status: "testing", required: true },
      { id: "gate-4", name: "Gate 4: Source Integrity & Release Closeout", x: 120, status: "pending", required: true }
    ];

    const fenceGeo = new THREE.PlaneGeometry(1, 40);
    this.gateMeshes = [];

    this.gateConfigs.forEach((gc) => {
      let color = 0x10b981;
      if (gc.status === "testing" || gc.status === "pending") color = 0xf59e0b;
      if (gc.status === "failed") color = 0xf43f5e;

      const fenceMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.32,
        side: THREE.DoubleSide,
        wireframe: false
      });

      // Wide energy curtain across Z axis
      const curtainGeo = new THREE.PlaneGeometry(70, 42);
      const curtain = new THREE.Mesh(curtainGeo, fenceMat);
      curtain.rotation.y = Math.PI / 2;
      curtain.position.set(gc.x, 15, 0);
      curtain.userData = { type: "gate", gateId: gc.id, data: gc };
      this.gatesGroup.add(curtain);

      // Outer glowing frame
      const frameGeo = new THREE.EdgesGeometry(curtainGeo);
      const frameMat = new THREE.LineBasicMaterial({ color, linewidth: 2, transparent: true, opacity: 0.8 });
      const frame = new THREE.LineSegments(frameGeo, frameMat);
      frame.rotation.y = Math.PI / 2;
      frame.position.set(gc.x, 15, 0);
      this.gatesGroup.add(frame);

      this.gateMeshes.push({ config: gc, mesh: curtain, frame });
    });

    this.scene.add(this.gatesGroup);
  }

  buildInstancedAgentMeshes() {
    // Sharp faceted polyhedra (Icosahedron / Octahedron)
    const agentGeo = new THREE.IcosahedronGeometry(4.5, 0);
    const agentMat = new THREE.MeshStandardMaterial({
      roughness: 0.25,
      metalness: 0.85,
      flatShading: true
    });

    this.agentMesh = new THREE.InstancedMesh(agentGeo, agentMat, 250);
    this.agentMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.agentMesh.count = 0;
    this.scene.add(this.agentMesh);
  }

  buildConduitsAndParticles() {
    // 1. Instanced Conduit Cylinders
    const conduitGeo = new THREE.CylinderGeometry(0.75, 0.75, 1, 10);
    const conduitMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.55
    });
    this.conduitMesh = new THREE.InstancedMesh(conduitGeo, conduitMat, 300);
    this.conduitMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.conduitMesh.count = 0;
    this.scene.add(this.conduitMesh);

    // 2. Instanced Glowing Flow Particles traveling along conduits
    const particleGeo = new THREE.SphereGeometry(1.4, 8, 8);
    const particleMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.95
    });
    this.particleMesh = new THREE.InstancedMesh(particleGeo, particleMat, 300);
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.count = 0;
    this.scene.add(this.particleMesh);
  }

  buildResourceColumnGauges() {
    this.resourceGaugesGroup = new THREE.Group();

    // 4 Columnar Gauges per Zone at Y = -50 (CPU, Memory, Token Burn, Disk Heat)
    this.gaugeMeshes = [];
    const colGeo = new THREE.CylinderGeometry(1.6, 1.6, 1, 12);

    Object.keys(this.zonePositions).forEach((zoneKey) => {
      const pos = this.zonePositions[zoneKey];
      const colOffsets = [
        { key: "cpu", dx: -7, dz: -7, label: "CPU", color: 0x38bdf8, val: 34 },
        { key: "mem", dx: 7, dz: -7, label: "RAM", color: 0x10b981, val: 48 },
        { key: "tokens", dx: -7, dz: 7, label: "Tokens", color: 0xf59e0b, val: 62 },
        { key: "disk", dx: 7, dz: 7, label: "Disk", color: 0xa855f7, val: 20 }
      ];

      colOffsets.forEach((col) => {
        const colMat = new THREE.MeshStandardMaterial({
          color: col.color,
          roughness: 0.3,
          metalness: 0.7,
          wireframe: false,
          transparent: true,
          opacity: 0.75
        });
        const mesh = new THREE.Mesh(colGeo, colMat);
        mesh.position.set(pos.x + col.dx, -50, pos.z + col.dz);
        mesh.userData = { type: "infra", zone: zoneKey, metric: col.key, label: col.label };
        this.resourceGaugesGroup.add(mesh);
        this.gaugeMeshes.push({ mesh, zoneKey, ...col });
      });

      // Bottom infrastructure baseline datum line
      const baseLineGeo = new THREE.RingGeometry(16, 17.5, 24);
      const baseLineMat = new THREE.MeshBasicMaterial({ color: 0x33466e, side: THREE.DoubleSide, transparent: true, opacity: 0.4 });
      const baseLine = new THREE.Mesh(baseLineGeo, baseLineMat);
      baseLine.rotation.x = Math.PI / 2;
      baseLine.position.set(pos.x, -50, pos.z);
      this.resourceGaugesGroup.add(baseLine);
    });

    this.scene.add(this.resourceGaugesGroup);
  }

  buildBlockerAnomalyObjects() {
    this.blockerGroup = new THREE.Group();

    // 1. Rotating Pulsing Wireframe Cage
    const cageGeo = new THREE.IcosahedronGeometry(9, 1);
    const cageMat = new THREE.MeshBasicMaterial({
      color: 0xf43f5e,
      wireframe: true,
      transparent: true,
      opacity: 0.85
    });
    this.blockerCage = new THREE.Mesh(cageGeo, cageMat);
    this.blockerCage.visible = false;
    this.blockerGroup.add(this.blockerCage);

    // 2. Shockwave Expanding Rings
    const ringGeo = new THREE.RingGeometry(8, 9.5, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xf43f5e,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6
    });
    this.shockwaveRing = new THREE.Mesh(ringGeo, ringMat);
    this.shockwaveRing.rotation.x = Math.PI / 2;
    this.shockwaveRing.visible = false;
    this.blockerGroup.add(this.shockwaveRing);

    this.scene.add(this.blockerGroup);
  }

  buildSelectionHalo() {
    const haloGeo = new THREE.TorusGeometry(7.5, 0.4, 16, 36);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.9
    });
    this.selectionHalo = new THREE.Mesh(haloGeo, haloMat);
    this.selectionHalo.rotation.x = Math.PI / 2;
    this.selectionHalo.visible = false;
    this.scene.add(this.selectionHalo);
  }

  /* =========================================================================
   * 2. DATA SYNTHESIS & REALISTIC DEFAULT MOCK TOPOLOGY
   * ========================================================================= */

  initDefaultData() {
    // Rich realistic agents adhering to spec §11 & §23
    this.nodes = [
      {
        id: "ingest-scanner",
        label: "Ingestion Scanner",
        role: "orchestrator",
        zone: "admission",
        status: "running",
        phase: "admission",
        task: "Scanning repository preflight status and validating working tree clean state",
        assurance: "Runner-verified",
        worktree: "main (base @ commit 8fa12c)",
        cpu: 18,
        mem: "420 MB",
        tokens: "12k/min",
        logs: [
          "\x1b[36m[PREFLIGHT]\x1b[0m Verified git status: clean working tree",
          "\x1b[32m[OK]\x1b[0m Ingestion contract valid: apb.preflight.v1"
        ]
      },
      {
        id: "spec-architect",
        label: "Specification Architect",
        role: "spec-writer",
        zone: "reasoning",
        status: "running",
        phase: "planning",
        task: "Drafting immutable system specification revision #3 (strict schema apb.spec.v1)",
        assurance: "Runner-verified",
        worktree: "spec/rev-3-arch",
        cpu: 29,
        mem: "780 MB",
        tokens: "38k/min",
        logs: [
          "\x1b[35m[SPEC]\x1b[0m Decomposing requirements into modular sub-plans",
          "\x1b[32m[DIGEST]\x1b[0m Computed SHA-256 digest: sha256:7f4a210d48"
        ]
      },
      {
        id: "lead-planner",
        label: "Lead Planner",
        role: "planner",
        zone: "reasoning",
        status: "running",
        phase: "planning",
        task: "Validating resource quotas, gate invariants, and concurrency bounds",
        assurance: "Runner-verified",
        worktree: "plan/rev-3",
        cpu: 24,
        mem: "640 MB",
        tokens: "24k/min",
        logs: [
          "\x1b[34m[PLAN]\x1b[0m Generating DAG dependencies for parallel variant worktrees",
          "\x1b[32m[PASS]\x1b[0m Approval authority registered for launch #9941"
        ]
      },
      {
        id: "worker-ast",
        label: "CodeGen Alpha: AST Optimizer",
        role: "worker",
        zone: "codegen",
        status: "running",
        phase: "codegen",
        task: "Synthesizing AST pass for zero-allocation stream buffer pipeline",
        assurance: "Agent-attested",
        worktree: "apb/run/variant-ast-v1",
        cpu: 72,
        mem: "1.4 GB",
        tokens: "84k/min",
        logs: [
          "\x1b[36m[AST]\x1b[0m Transforming buffer parser to zero-copy memory slices",
          "\x1b[33m[WARN]\x1b[0m Branch complexity score: 14.2 (nominal < 15.0)",
          "\x1b[32m[DONE]\x1b[0m Emitted 480 LOC to worktree variant-ast-v1"
        ]
      },
      {
        id: "worker-batch",
        label: "CodeGen Beta: Batch Pipeline",
        role: "worker",
        zone: "codegen",
        status: "running",
        phase: "codegen",
        task: "Implementing vectorized parallel batch processing in worktree variant-batch",
        assurance: "Agent-attested",
        worktree: "apb/run/variant-batch",
        cpu: 64,
        mem: "1.2 GB",
        tokens: "68k/min",
        logs: [
          "\x1b[34m[BATCH]\x1b[0m Generating batch processing queue dispatcher",
          "\x1b[32m[PASS]\x1b[0m Syntax validation and lint check passed"
        ]
      },
      {
        id: "worker-cache",
        label: "CodeGen Gamma: LRU Cache",
        role: "worker",
        zone: "codegen",
        status: "idle",
        phase: "codegen",
        task: "Standby for synthesis cherry-pick resolution",
        assurance: "Agent-attested",
        worktree: "apb/run/variant-cache",
        cpu: 8,
        mem: "320 MB",
        tokens: "2k/min",
        logs: [
          "\x1b[90m[IDLE]\x1b[0m Worktree variant-cache generated and awaiting evaluator comparison"
        ]
      },
      {
        id: "eval-audit",
        label: "Validation Evaluator",
        role: "evaluator",
        zone: "testing",
        status: "awaiting_gate",
        phase: "validation",
        task: "Comparing variant benchmarks: Score Alpha (94/100) vs Score Beta (88/100)",
        assurance: "Runner-verified",
        worktree: "eval/generation-1",
        cpu: 44,
        mem: "890 MB",
        tokens: "45k/min",
        logs: [
          "\x1b[35m[EVAL]\x1b[0m Running comparative benchmark suite",
          "\x1b[32m[WINNER]\x1b[0m Variant Alpha selected (94.2% test throughput)",
          "\x1b[33m[AWAIT]\x1b[0m Holding for Hard-Gate verification check"
        ]
      },
      {
        id: "gate-checker",
        label: "Hard-Gate Test Runner",
        role: "gate-verifier",
        zone: "testing",
        status: "blocked",
        phase: "validation",
        task: "BLOCKED: Gate 3 AST deterministic lint check failed on line 142 (undeclared variable)",
        assurance: "Runner-verified",
        worktree: "eval/gate-3-check",
        cpu: 12,
        mem: "410 MB",
        tokens: "5k/min",
        logs: [
          "\x1b[31m[FAIL]\x1b[0m Deterministic linter violation: ReferenceError at parser.ts:142",
          "\x1b[31m[BLOCKED]\x1b[0m Task blocked awaiting operator :deblock or retry directive"
        ]
      },
      {
        id: "release-packager",
        label: "Release & Handoff Packager",
        role: "release",
        zone: "release",
        status: "idle",
        phase: "release",
        task: "Queued: Awaiting gate closeout before source branch preservation and handoff",
        assurance: "Runner-verified",
        worktree: "release/v1.4.0",
        cpu: 4,
        mem: "210 MB",
        tokens: "0k/min",
        logs: [
          "\x1b[90m[QUEUED]\x1b[0m Ready to assemble final release handoff bundle upon gate closeout"
        ]
      }
    ];

    // Compute 3D Positions for Nodes within Zones
    this.nodes.forEach((node, idx) => {
      const basePos = this.zonePositions[node.zone] || new THREE.Vector3(0, 0, 0);
      const zoneNodes = this.nodes.filter((n) => n.zone === node.zone);
      const inZoneIdx = zoneNodes.indexOf(node);
      const angle = (inZoneIdx * 2 * Math.PI) / Math.max(zoneNodes.length, 1);
      const radius = zoneNodes.length > 1 ? 16 : 0;

      const pos = new THREE.Vector3(
        basePos.x + Math.cos(angle) * radius,
        10 + (inZoneIdx % 2) * 5,
        basePos.z + Math.sin(angle) * radius
      );
      node.position = pos;
    });

    // Directed Conduits
    this.links = [
      { src: "ingest-scanner", dst: "spec-architect" },
      { src: "spec-architect", dst: "lead-planner" },
      { src: "lead-planner", dst: "worker-ast" },
      { src: "lead-planner", dst: "worker-batch" },
      { src: "lead-planner", dst: "worker-cache" },
      { src: "worker-ast", dst: "eval-audit" },
      { src: "worker-batch", dst: "eval-audit" },
      { src: "eval-audit", dst: "gate-checker" },
      { src: "gate-checker", dst: "release-packager" }
    ];

    // Update 3D Geometry
    this.updateInstancedMeshes();
    this.renderAccessibleTreegrid();
    this.updateHUDFromState();

    // Select initial node (the blocked node to showcase attention, or the first active node)
    const blockedNode = this.nodes.find((n) => n.status === "blocked") || this.nodes[0];
    if (blockedNode) {
      this.selectEntity({ type: "agent", id: blockedNode.id, data: blockedNode });
    }
  }

  async initClient() {
    this.client.subscribe((msg) => this.handleClientUpdate(msg));
    try {
      await this.client.resyncSnapshots();
      this.client.connectStream();
    } catch (e) {
      console.info("[Topology] Operating in offline rich simulation mode.");
    }
  }

  handleClientUpdate(msg) {
    if (msg.type === "state-update" || msg.type === "resynchronized") {
      this.updateFromBackendState();
    } else if (msg.type === "stream-status") {
      this.updateConnectionStatus(msg.status);
    }
  }

  updateConnectionStatus(status) {
    if (status === "live") {
      this.el.hudSse.className = "hud-badge-sse live";
      this.el.hudSse.textContent = "● LIVE SSE";
    } else if (status === "reconnecting") {
      this.el.hudSse.className = "hud-badge-sse reconnecting";
      this.el.hudSse.textContent = "◌ RECONNECTING";
    } else {
      this.el.hudSse.className = "hud-badge-sse offline";
      this.el.hudSse.textContent = "✕ OFFLINE";
    }
  }

  updateFromBackendState() {
    const state = this.client.cachedState || {};
    const control = this.client.cachedControl || {};
    const disposition = deriveCanonicalDisposition(state, control, null, null);

    this.el.hudStatus.textContent = disposition.label;
    this.el.hudStatus.className = `hud-pill ${disposition.severity === 'error' ? 'error' : disposition.severity === 'success' ? 'success' : disposition.severity === 'warning' ? 'warning' : 'active'}`;
    this.el.hudRun.textContent = state.currentRunId || "run-20260821-0842-q9x";
    this.el.hudPhase.textContent = state.phase || "Execution";
    this.el.hudAdmission.textContent = control.runAdmission === "paused" ? "PAUSED" : control.runAdmission === "held" ? "HELD" : "ENABLED";

    const blockedCount = this.nodes.filter((n) => n.status === "blocked").length;
    this.el.hudAttentionText.textContent = blockedCount > 0 ? `${blockedCount} Blocker Incident` : "0 Incidents";
    this.el.btnAttention.className = `hud-pill attention-btn ${blockedCount > 0 ? 'alert' : 'ok'}`;

    // Cross-resource identity strip
    this.el.idPlan.textContent = (state.planId || "apb-swarm-04").slice(0, 12);
    this.el.idRev.textContent = `#${state.revision || 3}`;
    this.el.idApproval.textContent = "Approved (sha256:7f4a...)";
    this.el.idLaunch.textContent = state.launchId || "lnch-9941";
    this.el.idReq.textContent = "req-0842";
    this.el.idRun.textContent = state.currentRunId || "run-20260821-0842-q9x";
    this.el.idIter.textContent = state.iterationId || "iter-03 (Gen 2)";

    this.requestRender();
  }

  updateHUDFromState() {
    this.updateFromBackendState();
  }

  /* =========================================================================
   * 3. INSTANCED MESH UPDATES & ANIMATIONS
   * ========================================================================= */

  updateInstancedMeshes() {
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    // 1. Agents Instanced Mesh
    this.agentMesh.count = this.nodes.length;
    let hasBlocked = false;
    let blockedPos = null;

    this.nodes.forEach((node, i) => {
      dummy.position.copy(node.position);
      const isSelected = this.selectedEntity?.type === "agent" && this.selectedEntity.id === node.id;
      const isHovered = this.hoveredEntity?.type === "agent" && this.hoveredEntity.id === node.id;

      let scale = 1.0;
      if (isSelected) scale = 1.45;
      else if (isHovered) scale = 1.25;

      dummy.scale.setScalar(scale);
      dummy.rotation.y = this.animTime * 0.5 + i;
      dummy.updateMatrix();
      this.agentMesh.setMatrixAt(i, dummy.matrix);

      // Status Colors
      if (node.status === "running") color.setHex(0x10b981); // Emerald active
      else if (node.status === "idle") color.setHex(0x00f0ff); // Cyan idle
      else if (node.status === "awaiting_gate") color.setHex(0xf59e0b); // Amber awaiting gate
      else if (node.status === "blocked") {
        color.setHex(0xf43f5e); // Rose blocked
        hasBlocked = true;
        blockedPos = node.position;
      } else color.setHex(0x38bdf8);

      this.agentMesh.setColorAt(i, color);
    });

    this.agentMesh.instanceMatrix.needsUpdate = true;
    if (this.agentMesh.instanceColor) this.agentMesh.instanceColor.needsUpdate = true;

    // 2. Conduits Instanced Mesh
    const yAxis = new THREE.Vector3(0, 1, 0);
    this.conduitMesh.count = this.links.length;
    this.particleMesh.count = this.links.length;

    this.links.forEach((link, i) => {
      const srcNode = this.nodes.find((n) => n.id === link.src);
      const dstNode = this.nodes.find((n) => n.id === link.dst);
      if (!srcNode || !dstNode) return;

      const src = srcNode.position;
      const dst = dstNode.position;
      const midpoint = new THREE.Vector3().addVectors(src, dst).multiplyScalar(0.5);
      const delta = new THREE.Vector3().subVectors(dst, src);
      const dist = delta.length();

      if (dist > 0.01) {
        const quat = new THREE.Quaternion().setFromUnitVectors(yAxis, delta.clone().normalize());
        dummy.position.copy(midpoint);
        dummy.quaternion.copy(quat);
        dummy.scale.set(1, dist, 1);
        dummy.updateMatrix();
        this.conduitMesh.setMatrixAt(i, dummy.matrix);

        // Animated Flow Particle traveling src -> dst
        const particleProgress = (this.animTime * 0.8 + i * 0.3) % 1.0;
        const particlePos = new THREE.Vector3().lerpVectors(src, dst, particleProgress);
        dummy.position.copy(particlePos);
        dummy.quaternion.set(0, 0, 0, 1);
        dummy.scale.setScalar(1.0 + Math.sin(this.animTime * 4 + i) * 0.3);
        dummy.updateMatrix();
        this.particleMesh.setMatrixAt(i, dummy.matrix);
      }
    });

    this.conduitMesh.instanceMatrix.needsUpdate = true;
    this.particleMesh.instanceMatrix.needsUpdate = true;

    // 3. Volumetric Blocker Anomaly Updates
    if (hasBlocked && blockedPos) {
      this.blockerCage.visible = true;
      this.blockerCage.position.copy(blockedPos);
      this.blockerCage.rotation.x = this.animTime * 0.8;
      this.blockerCage.rotation.y = this.animTime * 1.2;
      const cagePulse = 1.0 + Math.sin(this.animTime * 5) * 0.18;
      this.blockerCage.scale.setScalar(cagePulse);

      this.shockwaveRing.visible = true;
      this.shockwaveRing.position.set(blockedPos.x, blockedPos.y - 3.5, blockedPos.z);
      const ringScale = 1.0 + (this.animTime * 2.0 % 2.5);
      this.shockwaveRing.scale.setScalar(ringScale);
      this.shockwaveRing.material.opacity = Math.max(0, 0.8 - (ringScale / 3.5));
    } else {
      this.blockerCage.visible = false;
      this.shockwaveRing.visible = false;
    }

    // 4. Update Selection Halo
    if (this.selectedEntity?.type === "agent") {
      const selNode = this.nodes.find((n) => n.id === this.selectedEntity.id);
      if (selNode) {
        this.selectionHalo.visible = true;
        this.selectionHalo.position.set(selNode.position.x, selNode.position.y - 3.8, selNode.position.z);
        this.selectionHalo.rotation.z = this.animTime * 1.5;
      }
    } else {
      this.selectionHalo.visible = false;
    }

    // 5. Update Resource Column Heights
    this.gaugeMeshes.forEach((g, idx) => {
      const height = 4 + (g.val / 100) * 26 + Math.sin(this.animTime * 1.5 + idx) * 1.5;
      g.mesh.scale.set(1, height, 1);
      g.mesh.position.y = -50 + height / 2;
    });
  }

  /* =========================================================================
   * 4. ACCESSIBLE SEMANTIC TREEGRID & BIDIRECTIONAL SYNC (WCAG 2.2 AA)
   * ========================================================================= */

  renderAccessibleTreegrid() {
    const filter = (this.el.treeSearch.value || "").toLowerCase().trim();
    let rowsHtml = "";

    const zones = ["admission", "reasoning", "codegen", "testing", "release"];

    zones.forEach((zoneKey, zoneIdx) => {
      const meta = this.zoneMeta[zoneKey];
      const zoneId = `zone-${zoneKey}`;
      const isExpanded = this.treeExpanded.has(zoneId);
      const isSelected = this.selectedEntity?.type === "zone" && this.selectedEntity.id === zoneKey;

      const zoneNodes = this.nodes.filter((n) => n.zone === zoneKey);
      const zoneGates = this.gateConfigs.filter((g) => {
        if (zoneKey === "admission" && g.id === "gate-1") return true;
        if (zoneKey === "reasoning" && g.id === "gate-2") return true;
        if (zoneKey === "testing" && g.id === "gate-3") return true;
        if (zoneKey === "release" && g.id === "gate-4") return true;
        return false;
      });

      // Check filter matching
      const zoneMatches = meta.name.toLowerCase().includes(filter) ||
        zoneNodes.some((n) => n.label.toLowerCase().includes(filter) || n.role.toLowerCase().includes(filter)) ||
        zoneGates.some((g) => g.name.toLowerCase().includes(filter));

      if (filter && !zoneMatches) return;

      // Zone Parent Row (Level 1)
      rowsHtml += `
        <tr class="zone-row ${isSelected ? 'selected' : ''}" data-type="zone" data-id="${zoneKey}" role="row" aria-level="1" aria-expanded="${isExpanded}" tabindex="0">
          <td class="tree-indent-1">
            <span class="tree-cell-expand">
              <button class="tree-expander-btn" data-toggle="${zoneId}" aria-label="Toggle ${escapeHtml(meta.name)}">${isExpanded ? '▼' : '▶'}</button>
              <strong style="color: ${meta.hex};">${escapeHtml(meta.name)}</strong>
            </span>
          </td>
          <td><span class="hud-pill" style="border-color: ${meta.hex}; color: ${meta.hex};">XZ @ ${meta.x}</span></td>
          <td><span class="hud-pill active">${zoneNodes.length} Agents</span></td>
        </tr>
      `;

      // Child Rows (Level 2)
      if (isExpanded || filter) {
        // 1. Gates in this Zone
        zoneGates.forEach((gate) => {
          const isGateSel = this.selectedEntity?.type === "gate" && this.selectedEntity.id === gate.id;
          rowsHtml += `
            <tr class="${isGateSel ? 'selected' : ''}" data-type="gate" data-id="${gate.id}" role="row" aria-level="2" tabindex="0">
              <td class="tree-indent-2">
                <span class="tree-cell-expand">
                  <span style="color: var(--color-warning);">🛡️</span>
                  <span>${escapeHtml(gate.name)}</span>
                </span>
              </td>
              <td><span class="hud-pill warning">Gate Barrier</span></td>
              <td><span class="hud-pill ${gate.status === 'passed' ? 'success' : gate.status === 'failed' ? 'error' : 'warning'}">${gate.status.toUpperCase()}</span></td>
            </tr>
          `;
        });

        // 2. Agents in this Zone
        zoneNodes.forEach((node) => {
          if (filter && !node.label.toLowerCase().includes(filter) && !node.role.toLowerCase().includes(filter)) return;
          const isNodeSel = this.selectedEntity?.type === "agent" && this.selectedEntity.id === node.id;
          let statusPillClass = "active";
          if (node.status === "running") statusPillClass = "success";
          else if (node.status === "blocked") statusPillClass = "error";
          else if (node.status === "awaiting_gate") statusPillClass = "warning";

          rowsHtml += `
            <tr class="${isNodeSel ? 'selected' : ''}" data-type="agent" data-id="${node.id}" role="row" aria-level="2" tabindex="0">
              <td class="tree-indent-2">
                <span class="tree-cell-expand">
                  <span style="color: ${node.status === 'running' ? 'var(--color-success)' : node.status === 'blocked' ? 'var(--color-error)' : 'var(--color-active)'};">◈</span>
                  <strong>${escapeHtml(node.label)}</strong>
                </span>
              </td>
              <td><span class="hud-pill active">${escapeHtml(node.role)}</span></td>
              <td><span class="hud-pill ${statusPillClass}">${node.status.toUpperCase()}</span></td>
            </tr>
          `;
        });

        // 3. Infrastructure Gauge Metric Row
        const isInfraSel = this.selectedEntity?.type === "infra" && this.selectedEntity.id === zoneKey;
        rowsHtml += `
          <tr class="${isInfraSel ? 'selected' : ''}" data-type="infra" data-id="${zoneKey}" role="row" aria-level="2" tabindex="0">
            <td class="tree-indent-2" style="color: var(--text-muted);">
              <span class="tree-cell-expand">
                <span>📊</span>
                <span>Infra Pressure Gauges</span>
              </span>
            </td>
            <td><span class="hud-pill" style="color: var(--color-infra); border-color: rgba(6,182,212,0.3);">Y = -50 Tier</span></td>
            <td style="font-family: var(--font-mono); font-size: 9px; color: var(--text-secondary);">Nominal load</td>
          </tr>
        `;
      }
    });

    this.el.treeTableBody.innerHTML = rowsHtml;
    this.bindTreegridItemEvents();
  }

  bindTreegridItemEvents() {
    this.el.treeTableBody.querySelectorAll("tr").forEach((row) => {
      row.addEventListener("click", (e) => {
        if (e.target.closest(".tree-expander-btn")) {
          const zoneId = e.target.closest(".tree-expander-btn").getAttribute("data-toggle");
          if (this.treeExpanded.has(zoneId)) this.treeExpanded.delete(zoneId);
          else this.treeExpanded.add(zoneId);
          this.renderAccessibleTreegrid();
          return;
        }

        const type = row.getAttribute("data-type");
        const id = row.getAttribute("data-id");
        this.selectEntityById(type, id);
      });

      row.addEventListener("keydown", (e) => {
        const rows = Array.from(this.el.treeTableBody.querySelectorAll("tr"));
        const currentIndex = rows.indexOf(row);

        if (e.key === "ArrowDown") {
          e.preventDefault();
          if (currentIndex < rows.length - 1) rows[currentIndex + 1].focus();
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          if (currentIndex > 0) rows[currentIndex - 1].focus();
        } else if (e.key === "ArrowRight") {
          const type = row.getAttribute("data-type");
          if (type === "zone") {
            const zoneId = `zone-${row.getAttribute("data-id")}`;
            this.treeExpanded.add(zoneId);
            this.renderAccessibleTreegrid();
          }
        } else if (e.key === "ArrowLeft") {
          const type = row.getAttribute("data-type");
          if (type === "zone") {
            const zoneId = `zone-${row.getAttribute("data-id")}`;
            this.treeExpanded.delete(zoneId);
            this.renderAccessibleTreegrid();
          }
        } else if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          const type = row.getAttribute("data-type");
          const id = row.getAttribute("data-id");
          this.selectEntityById(type, id);
        } else if (e.key.toLowerCase() === "f") {
          e.preventDefault();
          this.frameSelectedEntity();
        }
      });
    });
  }

  /* =========================================================================
   * 5. SELECTION, INSPECTOR DRAWER & CAMERA FRAMING
   * ========================================================================= */

  selectEntityById(type, id) {
    let entityData = null;
    if (type === "agent") entityData = this.nodes.find((n) => n.id === id);
    else if (type === "zone") entityData = this.zoneMeta[id];
    else if (type === "gate") entityData = this.gateConfigs.find((g) => g.id === id);
    else if (type === "infra") entityData = { zone: id, metrics: this.gaugeMeshes.filter((g) => g.zoneKey === id) };
    else if (type === "authority") entityData = { id, title: "Authority Verification Record" };

    if (entityData) {
      this.selectEntity({ type, id, data: entityData });
    }
  }

  selectEntity(entity) {
    this.selectedEntity = entity;
    this.updateInstancedMeshes();
    this.renderAccessibleTreegrid();
    this.renderInspectorDrawer();

    // Auto-frame camera to selected entity
    this.frameSelectedEntity();
    this.requestRender();
  }

  renderInspectorDrawer() {
    if (!this.selectedEntity) return;

    const { type, id, data } = this.selectedEntity;
    this.el.inspectorTypeBadge.textContent = type.toUpperCase();
    this.el.inspectorTypeBadge.className = `inspector-pill ${type === 'agent' ? 'active' : type === 'gate' ? 'warning' : type === 'authority' ? 'authority' : 'active'}`;

    if (type === "agent") {
      this.el.inspectorHeaderTitle.textContent = data.label || id;
      this.renderAgentOverview(data);
      this.renderAgentLogs(data);
      this.renderAgentDiffs(data);
      this.renderAgentEvidence(data);
    } else if (type === "zone") {
      this.el.inspectorHeaderTitle.textContent = data.name;
      this.renderZoneOverview(id, data);
    } else if (type === "gate") {
      this.el.inspectorHeaderTitle.textContent = data.name;
      this.renderGateOverview(data);
    } else if (type === "infra") {
      this.el.inspectorHeaderTitle.textContent = `Infra Gauges: ${this.zoneMeta[id]?.name || id}`;
      this.renderInfraOverview(id, data);
    } else if (type === "authority") {
      this.el.inspectorHeaderTitle.textContent = data.title || "Authority Record";
      this.renderAuthorityOverview(data);
    }
  }

  renderAgentOverview(agent) {
    this.el.inspectorOverviewContent.innerHTML = `
      <div class="insp-card">
        <div class="insp-card-title">
          <span>Agent Identity &amp; Lifecycle</span>
          <span class="hud-pill ${agent.status === 'running' ? 'success' : agent.status === 'blocked' ? 'error' : 'warning'}">${agent.status.toUpperCase()}</span>
        </div>
        <div class="insp-meta-grid">
          <div class="insp-meta-item"><span class="meta-k">Role:</span><span class="meta-v">${escapeHtml(agent.role)}</span></div>
          <div class="insp-meta-item"><span class="meta-k">Zone:</span><span class="meta-v">${escapeHtml(agent.zone)}</span></div>
          <div class="insp-meta-item"><span class="meta-k">Assurance:</span><span class="meta-v" style="color: var(--color-success);">${escapeHtml(agent.assurance)}</span></div>
          <div class="insp-meta-item"><span class="meta-k">Preserved Worktree:</span><span class="meta-v mono" style="font-size: 9px;">${escapeHtml(agent.worktree)}</span></div>
        </div>
      </div>

      <div class="insp-card">
        <div class="insp-card-title">Active Task Telemetry</div>
        <p style="color: var(--text-primary); font-size: 11px; margin-bottom: 8px;">${escapeHtml(agent.task)}</p>
        <div style="font-family: var(--font-mono); font-size: 9px; color: var(--text-muted);">
          Correlated ToolCall: <code>tool-call-8941-exec</code> • Freshness: <span style="color: var(--color-success);">Fresh (&lt;2s)</span>
        </div>
      </div>

      <div class="insp-card">
        <div class="insp-card-title">Resource Pressure (Bottom Tier Y=-50)</div>
        <div class="metric-bar-wrap">
          <div class="metric-bar-label"><span>CPU Utilization:</span><span>${agent.cpu}%</span></div>
          <div class="metric-bar-track"><div class="metric-bar-fill ${agent.cpu > 70 ? 'warning' : ''}" style="width: ${agent.cpu}%;"></div></div>
        </div>
        <div class="metric-bar-wrap">
          <div class="metric-bar-label"><span>Memory Allocation:</span><span>${agent.mem}</span></div>
          <div class="metric-bar-track"><div class="metric-bar-fill success" style="width: 45%;"></div></div>
        </div>
        <div class="metric-bar-wrap">
          <div class="metric-bar-label"><span>Token Burn Rate:</span><span>${agent.tokens}</span></div>
          <div class="metric-bar-track"><div class="metric-bar-fill warning" style="width: 60%;"></div></div>
        </div>
      </div>

      ${agent.status === 'blocked' ? `
        <div class="insp-card" style="border-color: var(--color-error); background: rgba(244,63,94,0.08);">
          <div class="insp-card-title" style="color: var(--color-error);">⚠️ Blocked Anomaly Action Required</div>
          <p style="color: #fca5a5; font-size: 10px; margin-bottom: 8px;">Gate invariant check failed. Operator deblock prompt or retry directive is required to clear pipeline barrier.</p>
          <button id="btn-quick-deblock" class="hud-btn danger" style="width: 100%;">:deblock Clear Anomaly</button>
        </div>
      ` : ''}
    `;

    const quickDeblock = document.getElementById("btn-quick-deblock");
    if (quickDeblock) {
      quickDeblock.addEventListener("click", () => {
        agent.status = "running";
        agent.task = "Resumed: Operator deblocked task invariant. Re-executing test pass.";
        this.updateInstancedMeshes();
        this.renderAccessibleTreegrid();
        this.renderAgentOverview(agent);
        this.updateHUDFromState();
      });
    }
  }

  renderAgentLogs(agent) {
    const rawLogs = agent.logs || [
      "[INFO] Agent initialized in isolated sandbox environment",
      "[INFO] Fetching task telemetry and branch context"
    ];

    const filterText = (this.el.logSearchInput.value || "").toLowerCase();
    const levelFilter = this.el.logLevelSelect.value;

    const filtered = rawLogs.filter((line) => {
      if (filterText && !line.toLowerCase().includes(filterText)) return false;
      if (levelFilter === "error" && !line.includes("FAIL") && !line.includes("ERROR") && !line.includes("BLOCKED")) return false;
      if (levelFilter === "warn" && !line.includes("WARN") && !line.includes("FAIL")) return false;
      return true;
    });

    this.el.inspectorLogTerminal.innerHTML = filtered.map((line) => `
      <span class="log-line">${sanitizeAnsiToHtml(line)}</span>
    `).join("");

    if (this.el.chkLogAutoscroll.checked) {
      this.el.inspectorLogTerminal.scrollTop = this.el.inspectorLogTerminal.scrollHeight;
    }
  }

  renderAgentDiffs(agent) {
    const oldText = `// System Plan Revision #2\nexport interface BufferConfig {\n  chunkSize: number;\n  maxConcurrency: number;\n}`;
    const newText = `// System Plan Revision #3 (Optimized Zero-Copy)\nexport interface BufferConfig {\n  chunkSize: number;\n  maxConcurrency: number;\n  zeroCopyBufferPool: boolean;\n  memoryQuotaBytes: number;\n}`;

    const diff = computeLineDiff(oldText, newText);
    this.el.diffComparisonLabel.textContent = `Revision Diff: Rev #2 ➔ Rev #3 (${agent.worktree})`;
    this.el.diffAdditions.textContent = `+${diff.addedCount}`;
    this.el.diffDeletions.textContent = `-${diff.deletedCount}`;

    this.el.inspectorDiffContainer.innerHTML = diff.lines.map((l) => `
      <div class="diff-row ${l.type}">
        <span style="opacity: 0.6; min-width: 14px;">${l.type === 'add' ? '+' : l.type === 'del' ? '-' : ' '}</span>
        <span>${escapeHtml(l.text)}</span>
      </div>
    `).join("");
  }

  renderAgentEvidence(agent) {
    this.el.inspectorEvidenceContent.innerHTML = `
      <div class="insp-card">
        <div class="insp-card-title">
          <span>Gate Evidence &amp; Verification</span>
          <span class="hud-pill success">${escapeHtml(agent.assurance)}</span>
        </div>
        <p style="color: var(--text-secondary); font-size: 10px; margin-bottom: 6px;">
          Cryptographic evidence bundle independently verified by runner closeout policy.
        </p>
        <table class="evidence-table">
          <thead>
            <tr>
              <th>Artifact / Path</th>
              <th>Digest</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="mono">artifacts/lint-report.json</td>
              <td class="mono" style="font-size: 9px;">sha256:4a81...</td>
              <td><span class="hud-pill success">VALID</span></td>
            </tr>
            <tr>
              <td class="mono">artifacts/eval-benchmark.json</td>
              <td class="mono" style="font-size: 9px;">sha256:91ef...</td>
              <td><span class="hud-pill success">PASS (94.2%)</span></td>
            </tr>
            <tr>
              <td class="mono">worktree/diff.patch</td>
              <td class="mono" style="font-size: 9px;">sha256:11bb...</td>
              <td><span class="hud-pill active">SIGNED</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  renderZoneOverview(zoneKey, meta) {
    const zoneNodes = this.nodes.filter((n) => n.zone === zoneKey);
    this.el.inspectorOverviewContent.innerHTML = `
      <div class="insp-card">
        <div class="insp-card-title">
          <span>Operational Zone Information</span>
          <span class="hud-pill active">XZ @ X=${meta.x}</span>
        </div>
        <p style="color: var(--text-primary); margin-bottom: 8px;">${escapeHtml(meta.desc)}</p>
        <div class="insp-meta-grid">
          <div class="insp-meta-item"><span class="meta-k">Active Swarm Nodes:</span><span class="meta-v">${zoneNodes.length}</span></div>
          <div class="insp-meta-item"><span class="meta-k">Authority Level:</span><span class="meta-v" style="color: var(--color-authority);">Plane Y=+80</span></div>
          <div class="insp-meta-item"><span class="meta-k">Perimeter Ring:</span><span class="meta-v" style="color: ${meta.hex};">${meta.hex}</span></div>
          <div class="insp-meta-item"><span class="meta-k">Infrastructure Tier:</span><span class="meta-v" style="color: var(--color-infra);">Y=-50 Gauges</span></div>
        </div>
      </div>
    `;
  }

  renderGateOverview(gate) {
    this.el.inspectorOverviewContent.innerHTML = `
      <div class="insp-card">
        <div class="insp-card-title">
          <span>Translucent Energy Fence Gate Barrier</span>
          <span class="hud-pill ${gate.status === 'passed' ? 'success' : gate.status === 'failed' ? 'error' : 'warning'}">${gate.status.toUpperCase()}</span>
        </div>
        <p style="color: var(--text-primary); margin-bottom: 8px;">${escapeHtml(gate.name)}</p>
        <div class="insp-meta-grid">
          <div class="insp-meta-item"><span class="meta-k">Gate Coordinate:</span><span class="meta-v mono">X = ${gate.x}</span></div>
          <div class="insp-meta-item"><span class="meta-k">Enforcement:</span><span class="meta-v">${gate.required ? 'Strict Hard Gate' : 'Soft Rubric'}</span></div>
          <div class="insp-meta-item"><span class="meta-k">Verifier:</span><span class="meta-v">Runner Invariant Engine</span></div>
          <div class="insp-meta-item"><span class="meta-k">Cryptographic Digest:</span><span class="meta-v mono" style="font-size: 9px;">sha256:88fa12bc...</span></div>
        </div>
      </div>
    `;
  }

  renderInfraOverview(zoneKey, data) {
    this.el.inspectorOverviewContent.innerHTML = `
      <div class="insp-card">
        <div class="insp-card-title">
          <span>Infrastructure Resource Column Gauges</span>
          <span class="hud-pill" style="color: var(--color-infra);">Tier Y = -50</span>
        </div>
        <p style="color: var(--text-secondary); margin-bottom: 8px;">
          Vertical columnar gauges below ${escapeHtml(this.zoneMeta[zoneKey]?.name || zoneKey)} monitoring hardware and token consumption.
        </p>
        <div class="metric-bar-wrap">
          <div class="metric-bar-label"><span>CPU Pressure Column:</span><span>34% Nominal</span></div>
          <div class="metric-bar-track"><div class="metric-bar-fill" style="width: 34%;"></div></div>
        </div>
        <div class="metric-bar-wrap">
          <div class="metric-bar-label"><span>Memory Allocation:</span><span>48% (1.8 GB)</span></div>
          <div class="metric-bar-track"><div class="metric-bar-fill success" style="width: 48%;"></div></div>
        </div>
        <div class="metric-bar-wrap">
          <div class="metric-bar-label"><span>Token Burn Rate:</span><span>62% (42k tokens/min)</span></div>
          <div class="metric-bar-track"><div class="metric-bar-fill warning" style="width: 62%;"></div></div>
        </div>
        <div class="metric-bar-wrap">
          <div class="metric-bar-label"><span>Disk I/O Heat:</span><span>20% Nominal</span></div>
          <div class="metric-bar-track"><div class="metric-bar-fill success" style="width: 20%;"></div></div>
        </div>
      </div>
    `;
  }

  renderAuthorityOverview(data) {
    this.el.inspectorOverviewContent.innerHTML = `
      <div class="insp-card">
        <div class="insp-card-title">
          <span>Top Authority Plane (Y = +80)</span>
          <span class="hud-pill authority">IMMUTABLE</span>
        </div>
        <p style="color: var(--text-primary); margin-bottom: 8px;">${escapeHtml(data.title || 'Plan Revision Authority')}</p>
        <div class="insp-meta-grid">
          <div class="insp-meta-item"><span class="meta-k">Authority Digest:</span><span class="meta-v mono" style="font-size: 9px;">${escapeHtml(data.digest || 'sha256:7f4a210d...')}</span></div>
          <div class="insp-meta-item"><span class="meta-k">Approval Status:</span><span class="meta-v" style="color: var(--color-success);">Operator Approved</span></div>
          <div class="insp-meta-item"><span class="meta-k">Schema Version:</span><span class="meta-v mono">apb.project-plan.v1</span></div>
          <div class="insp-meta-item"><span class="meta-k">Signer Identity:</span><span class="meta-v">local-operator</span></div>
        </div>
      </div>
    `;
  }

  frameSelectedEntity() {
    if (!this.selectedEntity) return;

    let targetPos = new THREE.Vector3(0, 0, 0);
    const { type, id } = this.selectedEntity;

    if (type === "agent") {
      const node = this.nodes.find((n) => n.id === id);
      if (node) targetPos.copy(node.position);
    } else if (type === "zone") {
      const pos = this.zonePositions[id];
      if (pos) targetPos.copy(pos);
    } else if (type === "gate") {
      const gate = this.gateConfigs.find((g) => g.id === id);
      if (gate) targetPos.set(gate.x, 15, 0);
    } else if (type === "infra") {
      const pos = this.zonePositions[id];
      if (pos) targetPos.set(pos.x, -45, pos.z);
    } else if (type === "authority") {
      targetPos.set(0, 80, 0);
    }

    this.smoothCameraTo(
      new THREE.Vector3(targetPos.x, targetPos.y + 40, targetPos.z + 85),
      targetPos
    );
  }

  frameZone(zoneKey) {
    const pos = this.zonePositions[zoneKey];
    if (!pos) return;
    this.selectEntityById("zone", zoneKey);
    this.smoothCameraTo(
      new THREE.Vector3(pos.x, 50, pos.z + 110),
      new THREE.Vector3(pos.x, 5, pos.z)
    );
  }

  frameTopAuthority() {
    this.selectEntityById("authority", "auth-plane");
    this.smoothCameraTo(
      new THREE.Vector3(0, 160, 160),
      new THREE.Vector3(0, 80, 0)
    );
  }

  frameInfraTier() {
    this.selectEntityById("infra", "codegen");
    this.smoothCameraTo(
      new THREE.Vector3(0, -20, 120),
      new THREE.Vector3(0, -50, 0)
    );
  }

  resetCamera() {
    this.spherical = { radius: 340, theta: Math.PI / 2, phi: Math.PI / 3.2 };
    this.smoothCameraTo(new THREE.Vector3(0, 140, 310), new THREE.Vector3(0, 10, 0));
  }

  smoothCameraTo(pos, lookAt) {
    this.cameraPosTarget.copy(pos);
    this.cameraLookTarget.copy(lookAt);
    this.requestRender();
  }

  /* =========================================================================
   * 6. CAMERA ORBIT / PAN / ZOOM & RENDERING LOOP
   * ========================================================================= */

  updateCameraFromSpherical() {
    const s = this.spherical;
    s.phi = Math.max(0.05, Math.min(Math.PI / 2 - 0.02, s.phi));
    s.radius = Math.max(30, Math.min(800, s.radius));

    const x = s.radius * Math.sin(s.phi) * Math.sin(s.theta);
    const y = s.radius * Math.cos(s.phi);
    const z = s.radius * Math.sin(s.phi) * Math.cos(s.theta);

    this.cameraPosTarget.set(this.cameraLookTarget.x + x, this.cameraLookTarget.y + y, this.cameraLookTarget.z + z);
  }

  startAnimationLoop() {
    const loop = (time) => {
      requestAnimationFrame(loop);
      const delta = (time - this.lastTimestamp) / 1000;
      this.lastTimestamp = time;

      if (this.motionEnabled) {
        this.animTime += delta;
      }

      // Smooth Camera Lerp
      const posLerpFactor = 0.12;
      this.camera.position.lerp(this.cameraPosTarget, posLerpFactor);
      this.cameraCurrentLook.lerp(this.cameraLookTarget, posLerpFactor);
      this.camera.lookAt(this.cameraCurrentLook);

      const isCameraMoving = this.camera.position.distanceTo(this.cameraPosTarget) > 0.05;

      // Update 3D Geometry and render if motion enabled, camera moving, or render requested
      if (this.motionEnabled || isCameraMoving || this.renderRequested) {
        this.updateInstancedMeshes();
        this.renderer.render(this.scene, this.camera);
        this.renderRequested = false;
      }
    };

    requestAnimationFrame(loop);
  }

  requestRender() {
    this.renderRequested = true;
  }

  /* =========================================================================
   * 7. EVENT LISTENERS & USER INTERACTIONS
   * ========================================================================= */

  bindEvents() {
    // Window Resize
    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.requestRender();
    });

    // Mouse / Pointer Controls for Canvas Orbit & Pan
    this.canvas.addEventListener("mousedown", (e) => {
      if (e.button === 0) this.isOrbiting = true;
      if (e.button === 2 || e.button === 1) this.isPanning = true;
      this.mousePrev = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener("mousemove", (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (this.isOrbiting) {
        const dx = e.clientX - this.mousePrev.x;
        const dy = e.clientY - this.mousePrev.y;
        this.spherical.theta -= dx * 0.006;
        this.spherical.phi -= dy * 0.006;
        this.updateCameraFromSpherical();
        this.requestRender();
      } else if (this.isPanning) {
        const dx = e.clientX - this.mousePrev.x;
        const dy = e.clientY - this.mousePrev.y;
        const panSpeed = 0.35;
        this.cameraLookTarget.x -= dx * panSpeed;
        this.cameraLookTarget.z += dy * panSpeed;
        this.cameraPosTarget.x -= dx * panSpeed;
        this.cameraPosTarget.z += dy * panSpeed;
        this.requestRender();
      } else {
        // Raycast Hover Detection
        this.handleRaycastHover(e);
      }

      this.mousePrev = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener("mouseup", () => {
      this.isOrbiting = false;
      this.isPanning = false;
    });

    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    // Wheel Zoom / Dolly
    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.spherical.radius += e.deltaY * 0.3;
      this.updateCameraFromSpherical();
      this.requestRender();
    }, { passive: false });

    // Click Raycasting on Canvas
    this.canvas.addEventListener("click", (e) => {
      this.handleRaycastClick(e);
    });

    // Keyboard Shortcuts
    window.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;

      if (e.key === "1") this.frameZone("admission");
      else if (e.key === "2") this.frameZone("reasoning");
      else if (e.key === "3") this.frameZone("codegen");
      else if (e.key === "4") this.frameZone("testing");
      else if (e.key === "5") this.frameZone("release");
      else if (e.key.toLowerCase() === "t") this.frameTopAuthority();
      else if (e.key.toLowerCase() === "i") this.frameInfraTier();
      else if (e.key.toLowerCase() === "r" || e.key === "Home") this.resetCamera();
      else if (e.key.toLowerCase() === "f") this.frameSelectedEntity();
    });

    // Tree Search Filter
    this.el.treeSearch.addEventListener("input", () => this.renderAccessibleTreegrid());

    // Tree Expand / Collapse All
    this.el.btnTreeExpand.addEventListener("click", () => {
      this.treeExpanded = new Set(["zone-admission", "zone-reasoning", "zone-codegen", "zone-testing", "zone-release"]);
      this.renderAccessibleTreegrid();
    });

    this.el.btnTreeCollapse.addEventListener("click", () => {
      this.treeExpanded.clear();
      this.renderAccessibleTreegrid();
    });

    // Toggle Sidebar & Inspector
    this.el.btnToggleSidebar.addEventListener("click", () => {
      this.el.semanticSidebar.classList.toggle("collapsed");
    });

    this.el.btnCloseInspector.addEventListener("click", () => {
      this.el.nodeInspector.classList.toggle("collapsed");
    });

    this.el.btnFrameInspectorNode.addEventListener("click", () => this.frameSelectedEntity());

    // Inspector Tab Switching
    this.el.inspTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const targetPanel = tab.getAttribute("data-panel");
        this.el.inspTabs.forEach((t) => {
          t.classList.remove("active");
          t.setAttribute("aria-selected", "false");
        });
        this.el.inspPanels.forEach((p) => p.classList.remove("active"));

        tab.classList.add("active");
        tab.setAttribute("aria-selected", "true");
        const panel = document.getElementById(`panel-${targetPanel}`);
        if (panel) panel.classList.add("active");
      });
    });

    // Log Controls
    this.el.logSearchInput.addEventListener("input", () => {
      if (this.selectedEntity?.type === "agent") this.renderAgentLogs(this.selectedEntity.data);
    });

    this.el.logLevelSelect.addEventListener("change", () => {
      if (this.selectedEntity?.type === "agent") this.renderAgentLogs(this.selectedEntity.data);
    });

    this.el.btnCopyLogs.addEventListener("click", () => {
      const text = this.el.inspectorLogTerminal.innerText;
      navigator.clipboard?.writeText(text);
      this.el.btnCopyLogs.textContent = "Copied!";
      setTimeout(() => (this.el.btnCopyLogs.textContent = "Copy"), 1500);
    });

    // Live Steering Directive Injection
    this.el.btnInjectSteer.addEventListener("click", async () => {
      const text = this.el.steerInput.value.trim();
      if (!text) return;
      try {
        await this.client.steer(text);
        this.el.steerInput.value = "";
        alert(`Steering directive dispatched: "${text}"`);
      } catch (e) {
        alert(`Steering dispatched (simulation mode): "${text}"`);
        this.el.steerInput.value = "";
      }
    });

    // Action Card Buttons
    this.el.btnActionHold.addEventListener("click", () => this.client.holdAdmission().catch(() => {}));
    this.el.btnActionPause.addEventListener("click", () => this.client.pauseCheckpoint().catch(() => {}));
    this.el.btnActionStop.addEventListener("click", () => this.client.gracefulStop().catch(() => {}));
    this.el.btnActionDeblock.addEventListener("click", () => {
      const blockedNode = this.nodes.find((n) => n.status === "blocked");
      if (blockedNode) {
        blockedNode.status = "running";
        blockedNode.task = "Deblocked by operator. Proceeding with execution.";
        this.updateInstancedMeshes();
        this.renderAccessibleTreegrid();
        this.renderAgentOverview(blockedNode);
        this.updateHUDFromState();
      }
    });

    // Manual Gate Override
    this.el.btnPassGate.addEventListener("click", () => {
      const gateId = this.el.gateOverrideSelect.value;
      const gate = this.gateConfigs.find((g) => g.id === gateId);
      if (gate) {
        gate.status = "passed";
        this.updateGateFences();
        this.renderAccessibleTreegrid();
      }
    });

    this.el.btnBlockGate.addEventListener("click", () => {
      const gateId = this.el.gateOverrideSelect.value;
      const gate = this.gateConfigs.find((g) => g.id === gateId);
      if (gate) {
        gate.status = "failed";
        this.updateGateFences();
        this.renderAccessibleTreegrid();
      }
    });

    // Top HUD Quick Controls
    this.el.btnHudHold.addEventListener("click", () => this.client.holdAdmission().catch(() => {}));
    this.el.btnHudPause.addEventListener("click", () => this.client.pauseCheckpoint().catch(() => {}));
    this.el.btnHudStop.addEventListener("click", () => this.client.gracefulStop().catch(() => {}));
    this.el.btnHudResume.addEventListener("click", () => this.client.resumeAdmission().catch(() => {}));
    this.el.btnHudRunNow.addEventListener("click", () => this.client.requestRunNow().catch(() => {}));

    // RBAC Role Select
    this.el.hudRoleSelect.addEventListener("change", (e) => {
      this.client.setRole(e.target.value);
    });

    // Attention Queue Button (Focus Blocker)
    this.el.btnAttention.addEventListener("click", () => {
      const blockedNode = this.nodes.find((n) => n.status === "blocked");
      if (blockedNode) {
        this.selectEntity({ type: "agent", id: blockedNode.id, data: blockedNode });
      }
    });

    // Camera Dock Buttons
    this.el.btnResetCam.addEventListener("click", () => this.resetCamera());
    this.el.btnCamFrame.addEventListener("click", () => this.frameSelectedEntity());
    this.el.btnCamTop.addEventListener("click", () => this.frameTopAuthority());
    this.el.btnCamInfra.addEventListener("click", () => this.frameInfraTier());

    document.querySelectorAll("[data-zone]").forEach((btn) => {
      btn.addEventListener("click", () => this.frameZone(btn.getAttribute("data-zone")));
    });

    // Motion Toggle
    this.el.btnToggleMotion.addEventListener("click", () => {
      this.motionEnabled = !this.motionEnabled;
      this.el.motionStatusText.textContent = `Motion: ${this.motionEnabled ? 'ON' : 'OFF'}`;
      this.el.motionStatusIcon.textContent = this.motionEnabled ? '▶' : '⏸';
      this.requestRender();
    });

    // Toggle HUD Clean View
    this.el.btnToggleHud.addEventListener("click", () => {
      document.body.classList.toggle("hud-hidden");
    });
  }

  updateGateFences() {
    this.gateMeshes.forEach(({ config, mesh, frame }) => {
      let color = 0x10b981;
      if (config.status === "testing" || config.status === "pending") color = 0xf59e0b;
      if (config.status === "failed") color = 0xf43f5e;
      mesh.material.color.setHex(color);
      frame.material.color.setHex(color);
    });
    this.requestRender();
  }

  handleRaycastHover(e) {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects([this.agentMesh, ...this.pedestalsGroup.children, ...this.authorityGroup.children]);

    if (intersects.length > 0) {
      const hit = intersects[0];
      if (hit.object === this.agentMesh && hit.instanceId !== undefined && this.nodes[hit.instanceId]) {
        const node = this.nodes[hit.instanceId];
        this.hoveredEntity = { type: "agent", id: node.id, data: node };
        this.showTooltip(e.clientX, e.clientY, node.label, `${node.zone.toUpperCase()} • ${node.status.toUpperCase()}`, node.task);
        this.requestRender();
        return;
      }
    }

    this.hoveredEntity = null;
    this.hideTooltip();
  }

  handleRaycastClick(e) {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects([
      this.agentMesh,
      ...this.pedestalsGroup.children,
      ...this.authorityGroup.children,
      ...this.gatesGroup.children
    ]);

    if (intersects.length > 0) {
      const hit = intersects[0];
      if (hit.object === this.agentMesh && hit.instanceId !== undefined && this.nodes[hit.instanceId]) {
        const node = this.nodes[hit.instanceId];
        this.selectEntity({ type: "agent", id: node.id, data: node });
        return;
      }

      if (hit.object.userData?.type) {
        const ud = hit.object.userData;
        this.selectEntityById(ud.type, ud.zoneId || ud.gateId || ud.id);
      }
    }
  }

  showTooltip(x, y, title, meta, desc) {
    this.el.spatialTooltip.style.display = "block";
    this.el.spatialTooltip.style.left = `${x}px`;
    this.el.spatialTooltip.style.top = `${y}px`;
    this.el.tooltipTitle.textContent = title;
    this.el.tooltipMeta.textContent = meta;
    this.el.tooltipDesc.textContent = desc;
  }

  hideTooltip() {
    this.el.spatialTooltip.style.display = "none";
  }
}

// Bootstrap on DOM ready
window.addEventListener("DOMContentLoaded", () => {
  window.spatialTopologyApp = new SpatialTopologyController();
});
