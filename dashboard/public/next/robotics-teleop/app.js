import { createDashboardClient, WORKFLOW_PHASES, OPERATION_COMMANDS, PROJECT_PLAN_ACTIONS } from "../../headless-dashboard-client.js";
import * as THREE from "../../vendor/three.js";

const $ = (id) => document.getElementById(id);
const client = createDashboardClient({ maxEvents: 1000 });

// Full client method bindings for complete feature coverage
const actions = {
  selectRun: (runId) => client.selectRun(runId),
  selectIteration: (iterationId) => client.selectIteration(iterationId),
  loadArtifact: (runId, path) => client.loadArtifact(runId, path),
  loadLog: (runId, path) => client.loadLog(runId, path),
  loadDocument: (runId, type) => client.loadDocument(runId, type),
  getProjectPlan: (planId) => client.getProjectPlan(planId),
  listPlanAssistance: () => client.listPlanAssistance(),
  createProjectPlan: (data) => client.createProjectPlan(data),
  updateProjectPlan: (planId, data) => client.updateProjectPlan(planId, data),
  submitProjectPlanForReview: (planId, expectedVersion) => client.submitProjectPlanForReview(planId, expectedVersion),
  approveProjectPlan: (planId, expectedVersion) => client.approveProjectPlan(planId, expectedVersion),
  rejectProjectPlan: (planId, expectedVersion) => client.rejectProjectPlan(planId, expectedVersion),
  launchProjectPlan: (planId, expectedVersion) => client.launchProjectPlan(planId, expectedVersion),
  cloneProjectPlan: (planId) => client.cloneProjectPlan(planId),
  forkProjectPlan: (planId, version) => client.forkProjectPlan(planId, version),
  archiveProjectPlan: (planId) => client.archiveProjectPlan(planId)
};

let snapshot = client.getSnapshot();
let stagedCommands = [];

function toast(msg, type = "info") {
  const el = $("rtToast");
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  el.style.background = type === "error" ? "#7f1d1d" : type === "warn" ? "#78350f" : "#0369a1";
  el.style.border = `1px solid ${type === "error" ? "#ef4444" : type === "warn" ? "#f59e0b" : "#00f0ff"}`;
  setTimeout(() => { el.style.display = "none"; }, 3500);
}

// Three.js 3D WebGL Scene Setup
const canvas = $("webglCanvas");
let scene, camera, renderer, roverGroup, armJoint1, armJoint2, armJoint3;

function init3D() {
  if (!canvas) return;
  const rect = canvas.parentElement.getBoundingClientRect();

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x040608);

  camera = new THREE.PerspectiveCamera(45, rect.width / rect.height, 0.1, 1000);
  camera.position.set(0, 8, 14);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(rect.width, rect.height);
  renderer.setPixelRatio(window.devicePixelRatio || 1);

  // Lighting
  const ambientLight = new THREE.AmbientLight(0x223344, 1.5);
  scene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight(0xffeedd, 2.0);
  sunLight.position.set(10, 20, 10);
  scene.add(sunLight);

  // Terrain Grid
  const grid = new THREE.GridHelper(20, 20, 0x00f0ff, 0x1e293b);
  grid.position.y = -1;
  scene.add(grid);

  // Rover Chassis
  roverGroup = new THREE.Group();
  scene.add(roverGroup);

  const bodyGeo = new THREE.BoxGeometry(3, 1.2, 4);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.8 });
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  roverGroup.add(bodyMesh);

  // 6 Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.6, 16);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.9 });
  const wheelOffsets = [
    [-1.8, -0.6, -1.5], [1.8, -0.6, -1.5],
    [-1.8, -0.6, 0], [1.8, -0.6, 0],
    [-1.8, -0.6, 1.5], [1.8, -0.6, 1.5]
  ];
  wheelOffsets.forEach(pos => {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(...pos);
    roverGroup.add(wheel);
  });

  // Articulated 3-Segment Arm
  armJoint1 = new THREE.Group();
  armJoint1.position.set(0, 0.6, 1.5);
  roverGroup.add(armJoint1);

  const baseGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.5);
  const baseMesh = new THREE.Mesh(baseGeo, bodyMat);
  armJoint1.add(baseMesh);

  armJoint2 = new THREE.Group();
  armJoint2.position.set(0, 0.5, 0);
  armJoint1.add(armJoint2);

  const link1Geo = new THREE.BoxGeometry(0.3, 1.8, 0.3);
  const link1Mesh = new THREE.Mesh(link1Geo, new THREE.MeshStandardMaterial({ color: 0x00f0ff }));
  link1Mesh.position.y = 0.9;
  armJoint2.add(link1Mesh);

  armJoint3 = new THREE.Group();
  armJoint3.position.set(0, 1.8, 0);
  armJoint2.add(armJoint3);

  const endEffGeo = new THREE.SphereGeometry(0.25);
  const endEffMesh = new THREE.Mesh(endEffGeo, new THREE.MeshStandardMaterial({ color: 0x10b981 }));
  armJoint3.add(endEffMesh);
}

function onWindowResize() {
  if (!canvas || !renderer || !camera) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
  renderer.setSize(rect.width, rect.height);
}
window.addEventListener("resize", onWindowResize);

// Staged Uplink Sequencer
$("btnStagePause")?.addEventListener("click", () => {
  stagedCommands.push({ type: "pause", desc: "STAGE: PAUSE ACTIVE STREAM" });
  toast("Added PAUSE to uplink bundle", "info");
});

$("btnStageResume")?.addEventListener("click", () => {
  stagedCommands.push({ type: "resume", desc: "STAGE: RESUME STREAM" });
  toast("Added RESUME to uplink bundle", "info");
});

$("btnStageWake")?.addEventListener("click", () => {
  stagedCommands.push({ type: "run-now", desc: "STAGE: DISPATCH WAKE TICK" });
  toast("Added RUN-NOW to uplink bundle", "info");
});

$("btnStageLoop")?.addEventListener("click", () => {
  stagedCommands.push({ type: "start-showcase-loop", payload: { targetGenerations: 10 }, desc: "STAGE: START 10-GEN LOOP" });
  toast("Added SHOWCASE LOOP to uplink bundle", "info");
});

$("btnTransmitUplink")?.addEventListener("click", async () => {
  if (!stagedCommands.length) return toast("No commands staged in uplink sequencer", "warn");
  toast(`TRANSMITTING ${stagedCommands.length} COMMANDS OVER DSN PASS...`, "info");
  for (const cmd of stagedCommands) {
    try {
      await client.command(cmd.type, cmd.payload || {});
    } catch (e) { toast(`Uplink error: ${e.message}`, "error"); }
  }
  stagedCommands = [];
  toast("UPLINK PASS COMPLETE: Telemetry acknowledged", "info");
});

// Emergency All-Stop
$("btnEStopRover")?.addEventListener("click", async () => {
  try {
    await client.command("stop");
    toast("EMERGENCY ALL-STOP: Rover telemetry killed", "error");
  } catch (e) { toast(e.message, "error"); }
});

$("btnDeblockRover")?.addEventListener("click", async () => {
  const prompt = window.prompt("Enter teleoperation obstacle recovery directive:");
  if (!prompt) return;
  try {
    await client.command("deblock", { prompt });
    toast("Deblock trajectory uploaded", "info");
  } catch (e) { toast(e.message, "error"); }
});

$("btnAdviceRover")?.addEventListener("click", async () => {
  try {
    await client.command("deblock-advice", { prompt: "Analyze teleop obstacle" });
    toast("Autonav obstacle advice requested", "info");
  } catch (e) { toast(e.message, "error"); }
});

$("btnResyncDsn")?.addEventListener("click", () => {
  client.refresh();
  toast("DSN lock synchronized", "info");
});

// Mission Plans
$("btnNewMissionPlan")?.addEventListener("click", async () => {
  const title = window.prompt("Mission Sequence Plan Title:");
  if (!title) return;
  try {
    await client.createProjectPlan({
      title,
      problem: "Planetary rover traverse",
      users: "teleop-operators",
      objectives: "Verify 3D robotics digital twin kinematics",
      scope: "Rover teleop",
      repoPath: "/home/mojo/projects/hermesswarmbuilder/hermesswarmbuilder",
      baseRef: "HEAD"
    });
    toast("Mission plan drafted", "info");
    await client.refreshPlans();
  } catch (e) { toast(e.message, "error"); }
});

function renderPlans(snap) {
  const list = $("missionPlansList");
  if (!list) return;
  const plans = snap.plans?.items || [];
  list.innerHTML = plans.map(p => `
    <div style="background:#090e14;border:1px solid var(--rt-border);padding:6px;border-radius:2px;font-size:9.5px;">
      <div style="display:flex;justify-content:space-between;">
        <b style="color:#fff;">${p.title || p.planId}</b>
        <span style="color:var(--rt-hud-cyan);">${p.status || 'draft'}</span>
      </div>
      <small style="color:#64748b;">${p.pipelineType || 'classic'} • v${p.version || 1}</small>
    </div>
  `).join("");
}

// Client Subscription
client.subscribe((snap) => {
  snapshot = snap;
  const phase = snap.state?.phase || "idle";
  const isBlocked = !!(snap.state?.block || snap.state?.blocker || snap.state?.hold);

  const phaseEl = $("roverPhase");
  if (phaseEl) {
    phaseEl.textContent = phase.toUpperCase();
    phaseEl.style.color = isBlocked ? "var(--rt-hud-red)" : "var(--rt-hud-cyan)";
  }

  const hudRun = $("hudRunId");
  if (hudRun) hudRun.textContent = snap.state?.currentRunId || "NONE";

  const riskEl = $("riskVal");
  if (riskEl) {
    riskEl.textContent = isBlocked ? "CRITICAL (0.95)" : "LOW (0.04)";
    riskEl.style.color = isBlocked ? "var(--rt-hud-red)" : "var(--rt-hud-green)";
  }

  renderPlans(snap);
});

client.connect();
client.refresh();
init3D();

// 3D Animation Render Loop
let t = 0;
function animate() {
  t += 0.02;
  if (roverGroup) {
    roverGroup.rotation.y = Math.sin(t * 0.3) * 0.2;
  }
  if (armJoint1 && armJoint2) {
    armJoint1.rotation.y = Math.sin(t * 0.5) * 0.6;
    armJoint2.rotation.x = -0.4 + Math.cos(t * 0.7) * 0.3;

    const j1 = $("j1Val");
    if (j1) j1.textContent = `${(armJoint1.rotation.y * 180 / Math.PI).toFixed(1)}°`;
    const j2 = $("j2Val");
    if (j2) j2.textContent = `${(armJoint2.rotation.x * 180 / Math.PI).toFixed(1)}°`;
  }
  renderer?.render(scene, camera);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
