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
let scanLineY = 0;

function toast(msg, type = "info") {
  const el = $("semToast");
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  el.style.background = type === "error" ? "#7f1d1d" : type === "warn" ? "#78350f" : "#0369a1";
  el.style.border = `1px solid ${type === "error" ? "#ef4444" : type === "warn" ? "#fbbf24" : "#38bdf8"}`;
  setTimeout(() => { el.style.display = "none"; }, 3500);
}

// Canvas P31 Phosphor CRT Raster
const crt = $("crtCanvas");
const crtCtx = crt ? crt.getContext("2d") : null;

// Canvas EDX MCA Histogram
const mca = $("mcaCanvas");
const mcaCtx = mca ? mca.getContext("2d") : null;

function resizeCanvases() {
  if (crt) {
    const r1 = crt.parentElement.getBoundingClientRect();
    crt.width = r1.width * (window.devicePixelRatio || 1);
    crt.height = r1.height * (window.devicePixelRatio || 1);
    crtCtx?.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
  }
  if (mca) {
    const r2 = mca.parentElement.getBoundingClientRect();
    mca.width = r2.width * (window.devicePixelRatio || 1);
    mca.height = r2.height * (window.devicePixelRatio || 1);
    mcaCtx?.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
  }
}
window.addEventListener("resize", resizeCanvases);

// Render P31 Phosphor CRT Raster Scan
function drawCrt() {
  if (!crt || !crtCtx) return;
  const w = crt.parentElement.getBoundingClientRect().width;
  const h = crt.parentElement.getBoundingClientRect().height;

  // Phosphor exponential decay (semi-transparent clear)
  crtCtx.fillStyle = "rgba(5, 8, 7, 0.12)";
  crtCtx.fillRect(0, 0, w, h);

  // Active Scanning Raster Line
  crtCtx.strokeStyle = "rgba(34, 238, 85, 0.85)";
  crtCtx.lineWidth = 2;
  crtCtx.beginPath();
  crtCtx.moveTo(0, scanLineY);
  crtCtx.lineTo(w, scanLineY);
  crtCtx.stroke();

  // Swarm Agent Electron Beam Spots
  const agents = Object.values(snapshot.state?.agents || {});
  const numAgents = Math.max(1, agents.length);

  agents.forEach((ag, i) => {
    const x = (w / (numAgents + 1)) * (i + 1);
    const y = (h / 2) + Math.sin((i + 1) * 1.5) * (h * 0.25);

    // Glow Halo
    const grad = crtCtx.createRadialGradient(x, y, 2, x, y, 18);
    grad.addColorStop(0, "rgba(34, 238, 85, 1)");
    grad.addColorStop(0.5, "rgba(34, 238, 85, 0.4)");
    grad.addColorStop(1, "rgba(34, 238, 85, 0)");

    crtCtx.fillStyle = grad;
    crtCtx.beginPath();
    crtCtx.arc(x, y, 18, 0, Math.PI * 2);
    crtCtx.fill();

    // Crosshairs
    crtCtx.strokeStyle = "rgba(56, 189, 248, 0.5)";
    crtCtx.lineWidth = 1;
    crtCtx.beginPath();
    crtCtx.moveTo(x - 8, y); crtCtx.lineTo(x + 8, y);
    crtCtx.moveTo(x, y - 8); crtCtx.lineTo(x, y + 8);
    crtCtx.stroke();

    crtCtx.fillStyle = "#38bdf8";
    crtCtx.font = "9px JetBrains Mono, monospace";
    crtCtx.fillText(ag.role || ag.id || `AGENT_${i+1}`, x + 10, y - 4);
  });

  // Scale bar
  crtCtx.strokeStyle = "#fff";
  crtCtx.lineWidth = 3;
  crtCtx.beginPath();
  crtCtx.moveTo(w - 120, h - 20);
  crtCtx.lineTo(w - 20, h - 20);
  crtCtx.stroke();
  crtCtx.fillStyle = "#fff";
  crtCtx.font = "9px JetBrains Mono, monospace";
  crtCtx.fillText("10 µm", w - 80, h - 26);

  scanLineY = (scanLineY + 2) % h;
}

// Render EDX Energy Spectrum Histogram
function drawMca() {
  if (!mca || !mcaCtx) return;
  const w = mca.parentElement.getBoundingClientRect().width;
  const h = mca.parentElement.getBoundingClientRect().height;

  mcaCtx.clearRect(0, 0, w, h);

  // Background Grid
  mcaCtx.strokeStyle = "#161f2b";
  mcaCtx.lineWidth = 1;
  for (let i = 0; i <= 10; i++) {
    const x = (w / 10) * i;
    mcaCtx.beginPath(); mcaCtx.moveTo(x, 0); mcaCtx.lineTo(x, h); mcaCtx.stroke();
  }

  // Energy Histogram Bins (Bremsstrahlung Continuum + Peaks)
  mcaCtx.strokeStyle = "#38bdf8";
  mcaCtx.fillStyle = "rgba(56, 189, 248, 0.2)";
  mcaCtx.lineWidth = 1.5;
  mcaCtx.beginPath();
  mcaCtx.moveTo(0, h);

  const channels = 64;
  for (let i = 0; i < channels; i++) {
    const x = (w / channels) * i;
    // Energy in keV
    const kev = (i / channels) * 20.0;
    // Characteristic peak lines: Si Ka at 1.74 keV, Fe Ka at 6.4 keV, Cu Ka at 8.04 keV
    let counts = Math.max(5, 40 / (kev + 1));
    if (Math.abs(kev - 1.74) < 0.4) counts += 60; // Si Ka (LLM)
    if (Math.abs(kev - 6.40) < 0.5) counts += 80; // Fe Ka (Tool)
    if (Math.abs(kev - 8.04) < 0.5) counts += 45; // Cu Ka (Git)

    const y = h - Math.min(h - 10, counts * (h / 120));
    mcaCtx.lineTo(x, y);
  }
  mcaCtx.lineTo(w, h);
  mcaCtx.closePath();
  mcaCtx.fill();
  mcaCtx.stroke();

  // Peak Annotations
  mcaCtx.fillStyle = "#fbbf24";
  mcaCtx.font = "9px JetBrains Mono, monospace";
  mcaCtx.fillText("Si Kα (1.74 keV)", w * 0.1, 20);
  mcaCtx.fillText("Fe Kα (6.40 keV)", w * 0.32, 20);
  mcaCtx.fillText("Cu Kα (8.04 keV)", w * 0.42, 35);
}

// Vacuum & Beam Controls
$("btnPauseBeam")?.addEventListener("click", () => {
  client.pause();
  toast("Electron beam emission paused", "warn");
});
$("btnResumeBeam")?.addEventListener("click", () => {
  client.resume();
  toast("High voltage emission restored", "info");
});

$("btnBeamTrip")?.addEventListener("click", async () => {
  try {
    await client.command("stop");
    toast("EMERGENCY BEAM TRIP: High-voltage shutoff", "error");
  } catch (e) { toast(e.message, "error"); }
});

$("btnDeblockSem")?.addEventListener("click", async () => {
  const prompt = window.prompt("Enter vacuum interlock deblock directive:");
  if (!prompt) return;
  try {
    await client.command("deblock", { prompt });
    toast("Chamber interlock deblocked", "info");
  } catch (e) { toast(e.message, "error"); }
});

$("btnAdviceSem")?.addEventListener("click", async () => {
  try {
    await client.command("deblock-advice", { prompt: "Analyze beam astigmatism trip" });
    toast("Analytical optics advice requested", "info");
  } catch (e) { toast(e.message, "error"); }
});

$("btnShowcaseScan")?.addEventListener("click", async () => {
  try {
    await client.command("start-showcase-loop", { targetGenerations: 10 });
    toast("10-Generation Serial Microbeam Scan Initiated", "info");
  } catch (e) { toast(e.message, "error"); }
});

$("btnResyncSem")?.addEventListener("click", () => {
  client.refresh();
  toast("Beam column alignment synchronized", "info");
});

// Specimen Plans
$("btnNewSpecimenPlan")?.addEventListener("click", async () => {
  const title = window.prompt("Specimen Recipe Plan Title:");
  if (!title) return;
  try {
    await client.createProjectPlan({
      title,
      problem: "Analytical SEM microanalysis",
      users: "microscopists",
      objectives: "Verify electron beam raster and EDX histogram",
      scope: "Specimen chamber",
      repoPath: "/home/mojo/projects/hermesswarmbuilder/hermesswarmbuilder",
      baseRef: "HEAD"
    });
    toast("Specimen recipe registered", "info");
    await client.refreshPlans();
  } catch (e) { toast(e.message, "error"); }
});

function renderPlans(snap) {
  const list = $("specimenPlansList");
  if (!list) return;
  const plans = snap.plans?.items || [];
  list.innerHTML = plans.map(p => `
    <div style="background:#080b0e;border:1px solid var(--sem-border);padding:5px;border-radius:2px;font-size:9.5px;">
      <div style="display:flex;justify-content:space-between;">
        <b style="color:#fff;">${p.title || p.planId}</b>
        <span style="color:var(--sem-phosphor);">${p.status || 'draft'}</span>
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

  const phaseEl = $("semPhase");
  if (phaseEl) {
    phaseEl.textContent = phase.toUpperCase();
    phaseEl.style.color = isBlocked ? "var(--sem-red)" : "var(--sem-phosphor)";
  }

  const intEl = $("interlockStatus");
  if (intEl) {
    intEl.textContent = isBlocked ? "TRIPPED" : "ENGAGED";
    intEl.style.color = isBlocked ? "var(--sem-red)" : "var(--sem-phosphor)";
  }

  renderPlans(snap);
});

client.connect();
client.refresh();
resizeCanvases();

// Animation Loop
function loop() {
  drawCrt();
  drawMca();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
