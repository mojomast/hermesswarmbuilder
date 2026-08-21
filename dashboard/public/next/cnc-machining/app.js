import { createDashboardClient, WORKFLOW_PHASES, OPERATION_COMMANDS, PROJECT_PLAN_ACTIONS } from "../../headless-dashboard-client.js";

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
let toolpathPoints = [];
let angle = 0;

function toast(msg, type = "info") {
  const el = $("cncToast");
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  el.style.background = type === "error" ? "#991b1b" : type === "warn" ? "#b45309" : "#047857";
  el.style.border = `1px solid ${type === "error" ? "#ef4444" : type === "warn" ? "#f59e0b" : "#10b981"}`;
  setTimeout(() => { el.style.display = "none"; }, 3500);
}

// 3D Isometric Toolpath Canvas
const canvas = $("toolpathCanvas");
const ctx = canvas ? canvas.getContext("2d") : null;

function resizeCanvas() {
  if (!canvas) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * (window.devicePixelRatio || 1);
  canvas.height = rect.height * (window.devicePixelRatio || 1);
  ctx?.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
  drawToolpath();
}
window.addEventListener("resize", resizeCanvas);

function drawToolpath() {
  if (!canvas || !ctx) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2 + 30;

  // Draw 3D Isometric Bounding Stock Box
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);

  const iso = (x, y, z) => {
    const rad = angle * Math.PI / 180;
    const rx = x * Math.cos(rad) - y * Math.sin(rad);
    const ry = x * Math.sin(rad) + y * Math.cos(rad);
    return {
      px: cx + (rx - ry) * 0.866,
      py: cy + (rx + ry) * 0.5 - z
    };
  };

  // Stock Box Wireframe
  const corners = [
    [-120, -80, 0], [120, -80, 0], [120, 80, 0], [-120, 80, 0],
    [-120, -80, 60], [120, -80, 60], [120, 80, 60], [-120, 80, 60]
  ].map(c => iso(...c));

  ctx.beginPath();
  // Bottom
  ctx.moveTo(corners[0].px, corners[0].py);
  ctx.lineTo(corners[1].px, corners[1].py);
  ctx.lineTo(corners[2].px, corners[2].py);
  ctx.lineTo(corners[3].px, corners[3].py);
  ctx.closePath();
  // Top
  ctx.moveTo(corners[4].px, corners[4].py);
  ctx.lineTo(corners[5].px, corners[5].py);
  ctx.lineTo(corners[6].px, corners[6].py);
  ctx.lineTo(corners[7].px, corners[7].py);
  ctx.closePath();
  // Verticals
  for (let i = 0; i < 4; i++) {
    ctx.moveTo(corners[i].px, corners[i].py);
    ctx.lineTo(corners[i+4].px, corners[i+4].py);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw Cutting Passes (Green G01 trajectories)
  ctx.strokeStyle = "#22c55e";
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (toolpathPoints.length > 1) {
    toolpathPoints.forEach((pt, i) => {
      const p = iso(pt.x, pt.y, pt.z);
      if (i === 0) ctx.moveTo(p.px, p.py);
      else ctx.lineTo(p.px, p.py);
    });
  } else {
    // Default spiral cutpath
    for (let t = 0; t < 50; t++) {
      const rad = t * 0.3;
      const x = Math.cos(rad) * (t * 2);
      const y = Math.sin(rad) * (t * 1.5);
      const z = Math.min(40, t);
      const p = iso(x, y, z);
      if (t === 0) ctx.moveTo(p.px, p.py);
      else ctx.lineTo(p.px, p.py);
    }
  }
  ctx.stroke();

  // Spindle Head Vector
  const head = iso(30, 20, 45);
  ctx.fillStyle = "#06b6d4";
  ctx.beginPath();
  ctx.arc(head.px, head.py, 5, 0, Math.PI * 2);
  ctx.fill();
}

// DRO & G-Code Updates
function updatePendant(snap) {
  const isBlocked = !!(snap.state?.block || snap.state?.blocker || snap.state?.hold);
  const phase = snap.state?.phase || "idle";

  const cycleEl = $("cyclePhase");
  if (cycleEl) {
    cycleEl.textContent = phase.toUpperCase();
    cycleEl.style.color = isBlocked ? "var(--cnc-red)" : "var(--cnc-dro-green)";
  }

  // Update DRO Numbers
  const progressPct = snap.events?.length ? Math.min(100, snap.events.length / 5) : 0;
  const droX = $("droX");
  if (droX) droX.textContent = `+${progressPct.toFixed(3).padStart(7, '0')}`;

  const droZ = $("droZ");
  if (droZ) droZ.textContent = `-${Object.keys(snap.state?.agents || {}).length}.000`;

  // G-Code Stream
  const gcodeBuf = $("gcodeBuffer");
  if (gcodeBuf && snap.events?.length) {
    const recent = snap.events.slice(-8);
    gcodeBuf.innerHTML = recent.map((e, idx) => `
      <div class="cnc-gcode-line ${idx === recent.length - 1 ? 'active' : ''}">
        <span>N${String((idx + 1) * 10).padStart(4, '0')}</span>
        <span>G01 (AGENT: ${e.agentId || 'SYS'}) [TASK: ${e.type || 'EXEC'}]</span>
      </div>
    `).join("");
  }
}

// Hard-Key Controls
$("btnCycleStart")?.addEventListener("click", async () => {
  try {
    await client.command("run-now");
    toast("CYCLE START: Motion sequence initiated", "info");
  } catch (e) { toast(e.message, "error"); }
});

$("btnFeedHold")?.addEventListener("click", () => {
  client.pause();
  toast("FEED HOLD: Axes halted at current block", "warn");
});

$("btnEStop")?.addEventListener("click", async () => {
  try {
    await client.command("stop");
    toast("EMERGENCY STOP (E-STOP) LATCHED", "error");
  } catch (e) { toast(e.message, "error"); }
});

$("btnMdiSteer")?.addEventListener("click", async () => {
  const directive = window.prompt("MDI Manual Data Input Directive (e.g. G04 P5):");
  if (!directive) return;
  try {
    await client.command("steer", { directive, scope: "current" });
    toast(`MDI EXECUTED: "${directive}"`, "info");
  } catch (e) { toast(e.message, "error"); }
});

$("btnRefresh")?.addEventListener("click", () => {
  client.refresh();
  toast("DNC Bus Re-synchronized", "info");
});

// NC Part Programs
$("btnNewNcPlan")?.addEventListener("click", async () => {
  const title = window.prompt("NC Part Program Title:");
  if (!title) return;
  try {
    await client.createProjectPlan({
      title,
      problem: "5-Axis toolpath optimization",
      users: "machinists",
      objectives: "Verify CNC motion and G-code execution",
      scope: "CNC spindle",
      repoPath: "/home/mojo/projects/hermesswarmbuilder/hermesswarmbuilder",
      baseRef: "HEAD"
    });
    toast("NC Program drafted to CAM registry", "info");
    await client.refreshPlans();
  } catch (e) { toast(e.message, "error"); }
});

function renderPlans(snap) {
  const list = $("ncPlansList");
  if (!list) return;
  const plans = snap.plans?.items || [];
  list.innerHTML = plans.map((p, idx) => `
    <div style="background:#090d12;border:1px solid #1a222d;padding:4px;border-radius:2px;font-size:9.5px;">
      <div style="display:flex;justify-content:space-between;">
        <b style="color:#fff;">O${1000 + idx} (${p.title || p.planId})</b>
        <span style="color:var(--cnc-dro-green);">${p.status || 'draft'}</span>
      </div>
    </div>
  `).join("");
}

// Client Subscription
client.subscribe((snap) => {
  snapshot = snap;
  updatePendant(snap);
  renderPlans(snap);
});

client.connect();
client.refresh();
resizeCanvas();

function loop() {
  angle = (angle + 0.3) % 360;
  drawToolpath();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
