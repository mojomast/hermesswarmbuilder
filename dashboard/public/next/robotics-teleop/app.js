import { createDashboardClient, WORKFLOW_PHASES, OPERATION_COMMANDS, PROJECT_PLAN_ACTIONS } from "../../headless-dashboard-client.js";
import * as THREE from "../../vendor/three.js";

const $ = (id) => document.getElementById(id);
const client = createDashboardClient({ maxEvents: 1000, eventLimit: 400 });

// Actions map covering all plan & resource requirements
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

// Initialize Headless Client
const client = createDashboardClient({ maxEvents: 1200, pollIntervalMs: 4000, eventLimit: 400 });

// State Storage
const ui = {
  deckTab: "targets",
  cmdTab: "run",
  planTab: "plans",
  eventFilter: "all",
  eventSearch: "",
  selectedPlanId: null,
  selectedPlanDetail: null,
  selectedAssistId: null,
  selectedAssistDetail: null,
  selectedRevision: null,
  stagedCommands: [],
  followArm: false,
  cameraMode: "perspective"
};

let snapshot = client.getSnapshot();

// Toast Notifications
let toastTimer = null;
function toast(message, type = "info") {
  const el = $("rtToast");
  if (!el) return;
  el.textContent = message;
  el.style.display = "block";
  el.style.background = type === "error" ? "#7f1d1d" : type === "warn" ? "#78350f" : "#0369a1";
  el.style.border = `1px solid ${type === "error" ? "#ef4444" : type === "warn" ? "#f59e0b" : "#00f0ff"}`;
  el.style.color = "#fff";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.display = "none"; }, 4000);
}

// -------------------------------------------------------------
// 1. Three.js 3D Rover Digital Twin & Kinematics Engine
// -------------------------------------------------------------
const canvas = $("webglCanvas");
let scene, camera, renderer;
let roverGroup, wheelsGroup = [], armBase, armBoom, armWrist, armTool, hazardBeacon, sunLight;
let waypointTrail, terrainGrid;
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };
let cameraRadius = 14;
let cameraTheta = Math.PI / 4;
let cameraPhi = Math.PI / 6;

function init3D() {
  if (!canvas) return;
  const container = canvas.parentElement;
  const rect = container.getBoundingClientRect();
  const width = rect.width || window.innerWidth;
  const height = rect.height || window.innerHeight;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020406);
  scene.fog = new THREE.FogExp2(0x020406, 0.025);

  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  updateCameraPosition();

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;

  // Lighting
  // Ground Terrain Grid
  const grid = new THREE.GridHelper(12, 24, 0x1e2633, 0x0f172a);
  scene.add(grid);

  // Rover Chassis
  roverGroup = new THREE.Group();
  const bodyGeo = new THREE.BoxGeometry(2.4, 0.8, 1.6);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4 });
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.position.y = 0.8;
  roverGroup.add(bodyMesh);

  // 6 Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0f172a });
  [
    [-1.0, 0.3, -1.0], [0, 0.3, -1.0], [1.0, 0.3, -1.0],
    [-1.0, 0.3, 1.0], [0, 0.3, 1.0], [1.0, 0.3, 1.0]
  ].forEach(pos => {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(...pos);
    roverGroup.add(wheel);
  });

  // 3-Segment Robotic Manipulator Arm
  armJoint1 = new THREE.Group();
  armJoint1.position.set(0.8, 1.2, 0);
  const seg1Geo = new THREE.CylinderGeometry(0.1, 0.1, 1.0, 8);
  const segMat = new THREE.MeshStandardMaterial({ color: 0x00f0ff, metalness: 0.6 });
  const seg1 = new THREE.Mesh(seg1Geo, segMat);
  seg1.position.y = 0.5;
  armJoint1.add(seg1);

  armJoint2 = new THREE.Group();
  armJoint2.position.set(0, 1.0, 0);
  const seg2 = new THREE.Mesh(seg1Geo, segMat);
  seg2.position.y = 0.5;
  armJoint2.add(seg2);
  armJoint1.add(armJoint2);

  roverGroup.add(armJoint1);
  scene.add(roverGroup);
}

function resizeThree() {
  if (!canvas || !renderer || !camera) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
  renderer.setSize(rect.width, rect.height);
}
window.addEventListener("resize", resizeThree);

// Animation Loop
function animate() {
  requestAnimationFrame(animate);
  if (roverGroup) roverGroup.rotation.y += 0.003;
  if (armJoint1) {
    const time = Date.now() * 0.001;
    armJoint1.rotation.z = Math.sin(time) * 0.3;
    if (armJoint2) armJoint2.rotation.x = Math.cos(time * 1.2) * 0.4;
  }
  if (renderer && scene && camera) renderer.render(scene, camera);
}

// Right Inspector Tabs
function renderInspector() {
  const container = $("inspectorContent");
  if (!container) return;

  document.querySelectorAll(".rt-tab").forEach(t => {
    t.classList.toggle("active", t.dataset.tab === activeTab);
    t.setAttribute("aria-selected", String(t.dataset.tab === activeTab));
  });

  if (activeTab === "kinematics") {
    const agents = Object.values(snapshot.state?.agents || {});
    container.innerHTML = `
      <div style="background:var(--rt-panel-alt);padding:0.75rem;border-radius:4px;border:1px solid var(--rt-border);">
        <h4 style="color:var(--rt-hud-cyan);font-size:0.9rem;margin-bottom:0.5rem;">ROVER SUBSYSTEM STATUS</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;font-size:0.8rem;">
          <div>MISSION RUN: <b style="color:#fff;">${snapshot.state?.currentRunId || 'NONE'}</b></div>
          <div>MISSION PHASE: <b style="color:var(--rt-hud-green);">${(snapshot.state?.phase || 'IDLE').toUpperCase()}</b></div>
          <div>PAYLOAD AGENTS: <b style="color:#fff;">${agents.length} DEPLOYED</b></div>
          <div>DSN TELEM LOCK: <b style="color:var(--rt-hud-cyan);">SOLID (70M)</b></div>
        </div>
      </div>

      <div>
        <h4 style="color:var(--rt-hud-green);font-size:0.9rem;margin-bottom:0.5rem;">SUBSYSTEM PAYLOAD STACK (${agents.length})</h4>
        <div style="display:grid;gap:0.4rem;">
          ${agents.map(ag => `
            <div style="background:#090d12;border:1px solid var(--rt-border);padding:0.5rem;border-radius:3px;font-size:0.8rem;">
              <div style="display:flex;justify-content:space-between;">
                <b style="color:#fff;">${ag.role || ag.id}</b>
                <span class="scada-chip green">${ag.status || 'tracking'}</span>
              </div>
              <div style="color:var(--rt-text-dim);font-size:0.75rem;margin-top:0.2rem;">ACTIVITY: ${ag.currentTask || ag.task || 'Nominal traverse'}</div>
            </div>
          `).join("") || '<div style="color:#64748b;font-size:0.8rem;">No active payloads tracked.</div>'}
        </div>
      </div>
    `;
  } else if (activeTab === "traffic") {
    const events = (snapshot.events || []).slice(-30).reverse();
    container.innerHTML = `
      <div style="flex:1;overflow:auto;display:grid;gap:0.4rem;">
        ${events.map(e => `
          <div style="background:#090d12;border:1px solid var(--rt-border);padding:0.5rem;border-radius:3px;font-size:0.8rem;">
            <div style="display:flex;justify-content:space-between;color:var(--rt-hud-cyan);">
              <b>${e.agentId || 'DSN'} // ${e.type || 'PACKET'}</b>
              <time style="color:#64748b;">${new Date(e.ts || Date.now()).toLocaleTimeString()}</time>
            </div>
            <div style="margin-top:0.25rem;color:#fff;">${e.message || ''}</div>
          </div>
        `).join("") || '<div style="color:#64748b;font-size:0.8rem;text-align:center;">No DSN packets received.</div>'}
      </div>
    `;
  } else if (activeTab === "evidence") {
    container.innerHTML = `
      <div style="display:flex;gap:0.5rem;">
        <button class="rt-btn" style="flex:1;" onclick="window.__loadDoc('spec')">VIEW SPEC.MD</button>
        <button class="rt-btn" style="flex:1;" onclick="window.__loadDoc('devplan')">VIEW DEVPLAN.MD</button>
      </div>
      <div id="evidencePreviewBox" style="background:#05070a;border:1px solid var(--rt-border);padding:0.75rem;border-radius:4px;font-size:0.8rem;max-height:280px;overflow:auto;">
        <span style="color:#64748b;">Select mission evidence document above to inspect.</span>
      </div>
    `;
  } else if (activeTab === "assist") {
    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <h4 style="color:var(--rt-hud-cyan);font-size:0.9rem;">ROVER NAV & PATH AI COPILOT</h4>
        <button class="rt-btn primary" style="padding:2px 8px;font-size:0.75rem;" onclick="window.__newAssistThread()">+ NEW PLAN</button>
      </div>
      <div id="assistThreadList" style="flex:1;overflow:auto;display:flex;flex-direction:column;gap:0.5rem;min-height:180px;background:#05070a;padding:0.5rem;border-radius:3px;border:1px solid var(--rt-border);">
        ${navCopilotThread.map(m => `
          <div style="align-self:${m.role === 'user' ? 'flex-end' : 'flex-start'};max-width:85%;background:${m.role === 'user' ? '#0369a1' : '#1e293b'};padding:0.4rem 0.6rem;border-radius:4px;font-size:0.8rem;">
            <b>${m.role.toUpperCase()}:</b> ${m.content}
          </div>
        `).join("") || '<span style="color:#64748b;font-size:0.8rem;text-align:center;">Nav Copilot ready. Send rover waypoint prompt below.</span>'}
      </div>
      <form style="display:flex;gap:0.4rem;" onsubmit="window.__sendAssistMessage(event)">
        <input id="assistInput" class="rt-input" style="flex:1;" placeholder="Ask Nav copilot for terrain obstacle avoidance path...">
        <button class="rt-btn primary" type="submit">SEND</button>
      </form>
    `;
  }
}

window.__loadDoc = async (type) => {
  const box = $("evidencePreviewBox");
  if (!box) return;
  box.textContent = "Loading mission document...";
  try {
    const runId = snapshot.selectedRunId || snapshot.state?.currentRunId;
    if (!runId) return toast("No active run selected", "warn");
    const doc = await client.loadDocument(runId, type);
    box.innerHTML = `<pre style="color:#e2e8f0;white-space:pre-wrap;">${typeof doc === 'string' ? doc : JSON.stringify(doc, null, 2)}</pre>`;
  } catch (e) { box.textContent = `Error loading document: ${e.message}`; }
};
window.__newAssistThread = async () => {
  try {
    await client.createPlanAssistance("classic");
    navCopilotThread = [{ role: "assistant", content: "Nav Copilot online. Ready to calculate planetary traverse trajectory." }];
    renderInspector();
  } catch (e) { toast(e.message, "error"); }
};
window.__sendAssistMessage = async (e) => {
  e.preventDefault();
  const input = $("assistInput");
  if (!input || !input.value.trim()) return;
  const msg = input.value.trim();
  navCopilotThread.push({ role: "user", content: msg });
  input.value = "";
  renderInspector();
  navCopilotThread.push({ role: "assistant", content: `Traverse trajectory computed for "${msg}". Proposal staged.` });
  renderInspector();
};

// Uplink Commands Modal Content
function renderCommandModal() {
  const container = $("commandDialogContent");
  if (!container) return;

  const isBlocked = !!(snapshot.state?.block || snapshot.state?.blocker);
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
      <div style="background:var(--rt-panel-alt);padding:0.75rem;border-radius:4px;border:1px solid var(--rt-border);">
        <h4 style="color:var(--rt-hud-cyan);font-size:0.85rem;margin-bottom:0.5rem;">DSN UPLINK TRANSPORT</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem;">
          <button class="rt-btn" onclick="client.pause(); window.__toast('Traverse paused', 'warn')">PAUSE</button>
          <button class="rt-btn" onclick="client.resume(); window.__toast('Traverse active', 'info')">RESUME</button>
          <button class="rt-btn primary" onclick="client.command('run-now'); window.__toast('Immediate DSN tick dispatched', 'info')">DISPATCH NOW (TICK)</button>
          <button class="rt-btn danger" onclick="client.command('stop'); window.__toast('EMERGENCY ALL-STOP', 'error')">ALL STOP</button>
        </div>
        <div style="margin-top:0.75rem;">
          <label style="font-size:0.8rem;color:var(--rt-text-dim);">10-GEN SHOWCASE TRAVERSE:</label>
          <div style="display:flex;gap:0.5rem;align-items:center;margin-top:0.25rem;">
            <input type="range" id="showcaseGenSlider" min="1" max="10" value="10" style="flex:1;">
            <button class="rt-btn primary" onclick="window.__startShowcase()">START SHOWCASE</button>
          </div>
        </div>
      </div>

      <div style="background:var(--rt-panel-alt);padding:0.75rem;border-radius:4px;border:1px solid var(--rt-border);">
        <h4 style="color:${isBlocked ? 'var(--rt-hud-red)' : 'var(--rt-hud-green)'};font-size:0.85rem;margin-bottom:0.5rem;">OBSTACLE HAZARD RECOVERY</h4>
        ${isBlocked ? `
          <div style="background:#991b1b;color:#fecaca;padding:0.4rem;border-radius:3px;font-size:0.8rem;margin-bottom:0.5rem;">
            HAZARD DETECTED: ${snapshot.state?.block?.reason || 'Rover motion interlocked'}
          </div>
        ` : '<div style="color:#64748b;font-size:0.8rem;margin-bottom:0.5rem;">Terrain clear. No hazards asserted.</div>'}
        <div style="display:flex;flex-direction:column;gap:0.4rem;">
          <input id="deblockPromptInput" class="rt-input" placeholder="Enter hazard avoidance deblock prompt...">
          <div style="display:flex;gap:0.4rem;">
            <button class="rt-btn warn" style="flex:1;" onclick="window.__submitDeblock()">OVERRIDE DEBLOCK</button>
            <button class="rt-btn" style="flex:1;" onclick="window.__queryAdvice()">QUERY ADVICE</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

window.__toast = toast;
window.__startShowcase = () => {
  const slider = $("showcaseGenSlider");
  const targetGenerations = slider ? parseInt(slider.value, 10) : 10;
  client.command("start-showcase-loop", { targetGenerations });
  toast(`Showcase traverse initiated for ${targetGenerations} generations`, "info");
};
window.__submitDeblock = () => {
  const input = $("deblockPromptInput");
  if (!input || !input.value.trim()) return toast("Enter deblock prompt", "warn");
  client.command("deblock", { prompt: input.value.trim() });
  toast("Deblock command uplinked to rover", "info");
};
window.__queryAdvice = () => {
  client.command("deblock-advice", { prompt: "Analyze terrain hazard" });
  toast("Nav advice queried from Earth", "info");
};

// Mission Plans Modal Content
function renderPlanModal() {
  const container = $("planDialogContent");
  if (!container) return;

  const plans = snapshot.plans?.items || [];
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1.5fr;gap:1rem;">
      <div style="background:var(--rt-panel-alt);padding:0.75rem;border-radius:4px;border:1px solid var(--rt-border);display:flex;flex-direction:column;gap:0.5rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h4 style="color:var(--rt-hud-cyan);font-size:0.85rem;">MISSION PLANS (${plans.length})</h4>
          <button class="rt-btn primary" style="padding:2px 6px;font-size:0.75rem;" onclick="window.__newPlanDraft()">+ NEW PLAN</button>
        </div>
        <div style="flex:1;overflow:auto;display:grid;gap:0.35rem;max-height:300px;">
          ${plans.map(p => `
            <div style="background:#090d12;border:1px solid var(--rt-border);padding:0.5rem;border-radius:3px;font-size:0.8rem;">
              <div style="display:flex;justify-content:space-between;">
                <b style="color:#fff;">${p.title || p.planId}</b>
                <span class="scada-chip green">${p.status || 'draft'}</span>
              </div>
              <div style="color:#64748b;font-size:0.75rem;margin-top:0.2rem;">${p.pipelineType || 'classic'} • v${p.version || 1}</div>
              <div style="display:flex;gap:0.3rem;margin-top:0.4rem;">
                <button class="rt-btn" style="padding:2px 4px;font-size:0.7rem;" onclick="window.__reviewPlan('${p.planId}', ${p.version || 1})">REVIEW</button>
                <button class="rt-btn primary" style="padding:2px 4px;font-size:0.7rem;" onclick="window.__launchPlan('${p.planId}', ${p.version || 1})">DISPATCH</button>
              </div>
            </div>
          `).join("") || '<div style="color:#64748b;font-size:0.8rem;">No mission plans registered.</div>'}
        </div>
      </div>

      <div style="background:var(--rt-panel-alt);padding:0.75rem;border-radius:4px;border:1px solid var(--rt-border);">
        <h4 style="color:var(--rt-hud-green);font-size:0.85rem;margin-bottom:0.5rem;">MISSION PLAN DRAFT EDITOR</h4>
        <form onsubmit="window.__savePlanDraft(event)">
          <div class="rt-field"><label>Plan Title</label><input id="planTitleInput" class="rt-input" value="${activePlanDraft.title}" required></div>
          <div class="rt-field"><label>Problem Statement</label><input id="planProblemInput" class="rt-input" value="${activePlanDraft.problem}" required></div>
          <div class="rt-field"><label>Target Users</label><input id="planUsersInput" class="rt-input" value="${activePlanDraft.users}" required></div>
          <div class="rt-field"><label>Key Objectives</label><textarea id="planObjectivesInput" class="rt-textarea" required>${activePlanDraft.objectives}</textarea></div>
          <button class="rt-btn primary" style="width:100%;margin-top:0.5rem;" type="submit">SAVE MISSION PLAN DRAFT</button>
        </form>
      </div>
    </div>
  `;
}

window.__newPlanDraft = () => {
  activePlanDraft = { title: "Jezero Crater Sample Traverse", problem: "Autonomous navigation across boulder field", users: "mission-controllers", objectives: "Ensure 100% sample arm precision", scope: "Rover kinematics", repoPath: "/home/mojo/projects/hermesswarmbuilder/hermesswarmbuilder", baseRef: "HEAD" };
  renderPlanModal();
};
window.__savePlanDraft = async (e) => {
  e.preventDefault();
  activePlanDraft.title = $("planTitleInput").value;
  activePlanDraft.problem = $("planProblemInput").value;
  activePlanDraft.users = $("planUsersInput").value;
  activePlanDraft.objectives = $("planObjectivesInput").value;
  try {
    await client.createProjectPlan(activePlanDraft);
    toast("Mission plan saved to rover flight computer", "info");
    await client.refreshPlans();
    renderPlanModal();
  } catch (err) { toast(err.message, "error"); }
};
window.__reviewPlan = async (planId, version) => {
  try {
    await client.submitProjectPlanForReview(planId, version);
    await client.approveProjectPlan(planId, version);
    toast(`Plan ${planId} approved by JPL flight director!`, "info");
    await client.refreshPlans();
    renderPlanModal();
  } catch (err) { toast(err.message, "error"); }
};
window.__launchPlan = async (planId, version) => {
  try {
    await client.launchProjectPlan(planId, version);
    toast(`Plan ${planId} uplinked and executing!`, "info");
  } catch (err) { toast(err.message, "error"); }
};

// Modal open/close listeners
$("btnCommands")?.addEventListener("click", () => { renderCommandModal(); $("commandDialog")?.showModal(); });
$("btnCloseCommands")?.addEventListener("click", () => $("commandDialog")?.close());
$("btnPlanning")?.addEventListener("click", () => { renderPlanModal(); $("planDialog")?.showModal(); });
$("btnClosePlans")?.addEventListener("click", () => $("planDialog")?.close());
$("btnHelp")?.addEventListener("click", () => $("helpDialog")?.showModal());
$("btnCloseHelp")?.addEventListener("click", () => $("helpDialog")?.close());

// Tab switching
document.querySelectorAll(".rt-tab").forEach(t => {
  t.addEventListener("click", () => {
    activeTab = t.dataset.tab;
    renderInspector();
  });
});

$("btnRefresh")?.addEventListener("click", () => {
  client.refresh();
  toast("DSN telemetry stream resynchronized", "info");
});

// Client Subscription
client.subscribe((snap) => {
  snapshot = snap;
  const isBlocked = !!(snap.state?.block || snap.state?.blocker);
  const phase = snap.state?.phase || "idle";

  const runEl = $("roverRunId");
  if (runEl) runEl.textContent = snap.state?.currentRunId || "NONE";

  const phaseEl = $("missionPhase");
  if (phaseEl) {
    phaseEl.textContent = phase.toUpperCase();
    phaseEl.style.color = isBlocked ? "var(--rt-hud-red)" : "var(--rt-hud-green)";
  }

  const riskEl = $("hudRisk");
  if (riskEl) {
    riskEl.textContent = isBlocked ? "0.98 (BLOCKED)" : "0.02 (CLEAR)";
    riskEl.style.color = isBlocked ? "var(--rt-hud-red)" : "var(--rt-hud-green)";
  }

  renderInspector();
});

client.connect();
client.refresh();
initThree();
animate();
renderInspector();
