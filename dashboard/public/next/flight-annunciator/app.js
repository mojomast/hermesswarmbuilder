import { createDashboardClient, WORKFLOW_PHASES, OPERATION_COMMANDS, PROJECT_PLAN_ACTIONS } from "../../headless-dashboard-client.js";
import { createSignal, createEffect } from "../../vendor/solid.js";

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

const [snapshot, setSnapshot] = createSignal(client.getSnapshot());
const [isGuardOpen, setGuardOpen] = createSignal(false);
const [isLampTesting, setLampTesting] = createSignal(false);

function toast(msg, type = "info") {
  const el = $("faToast");
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  el.style.background = type === "error" ? "#33070b" : type === "warn" ? "#2b1c02" : "#01242e";
  el.style.border = `1px solid ${type === "error" ? "#ff3344" : type === "warn" ? "#ffb703" : "#00f0ff"}`;
  setTimeout(() => { el.style.display = "none"; }, 3500);
}

// 16-Phase Sequence Bar
function updateSequenceBar(phase) {
  const bar = $("flightSequenceBar");
  if (!bar) return;
  bar.innerHTML = WORKFLOW_PHASES.map((p) => {
    const isActive = p === phase;
    return `<div class="fa-seq-seg ${isActive ? 'active' : ''}">${p.slice(0, 5).toUpperCase()}</div>`;
  }).join("");
}

// Synoptic Flow Canvas (MFD)
function drawSynoptic(snap) {
  const svg = $("synopticCanvas");
  if (!svg) return;

  const isBlocked = !!(snap.state?.block || snap.state?.blocker || snap.state?.hold);
  const phase = snap.state?.phase || "idle";

  svg.innerHTML = `
    <!-- Top Stream Bus (Cyan) -->
    <rect x="40" y="40" width="160" height="60" rx="4" fill="#0d1114" stroke="#00f0ff" stroke-width="2" />
    <text x="55" y="65" fill="#00f0ff" font-family="JetBrains Mono" font-size="11" font-weight="bold">CORE AVIONICS</text>
    <text x="55" y="85" fill="#94a3b8" font-size="9.5">SSE: ${snap.connection?.status?.toUpperCase() || 'OFFLINE'}</text>

    <!-- Vector Flow Arrow -->
    <line x1="200" y1="70" x2="320" y2="70" stroke="${isBlocked ? '#ff3344' : '#00f0ff'}" stroke-width="3" stroke-dasharray="6,3" />

    <!-- Center Swarm Propulsion Unit -->
    <rect x="320" y="30" width="220" height="80" rx="4" fill="#0d1114" stroke="${isBlocked ? '#ff3344' : '#00ff88'}" stroke-width="2" />
    <text x="335" y="55" fill="${isBlocked ? '#ff3344' : '#00ff88'}" font-family="JetBrains Mono" font-size="11" font-weight="bold">SWARM PROPULSION</text>
    <text x="335" y="75" fill="#fff" font-size="10">PHASE: ${phase.toUpperCase()}</text>
    <text x="335" y="95" fill="#94a3b8" font-size="9.5">RUN: ${snap.state?.currentRunId || 'NONE'}</text>

    <!-- Gate Interlock Valve -->
    <line x1="540" y1="70" x2="640" y2="70" stroke="#00f0ff" stroke-width="3" />
    <polygon points="640,55 670,70 640,85" fill="#00f0ff" />
    <rect x="670" y="40" width="100" height="60" rx="4" fill="#0d1114" stroke="#ffb703" stroke-width="2" />
    <text x="680" y="65" fill="#ffb703" font-family="JetBrains Mono" font-size="10" font-weight="bold">GATES (QA)</text>
    <text x="680" y="85" fill="#94a3b8" font-size="9">RELAYS: ARMED</text>

    <!-- Lower Evidence Bus -->
    <line x1="430" y1="110" x2="430" y2="180" stroke="#00f0ff" stroke-width="2" />
    <rect x="260" y="180" width="340" height="120" rx="4" fill="#090c0e" stroke="#222a30" stroke-width="1.5" />
    <text x="280" y="205" fill="#00f0ff" font-size="10" font-weight="bold">TELEMETRY & FLIGHT RECORDER</text>
    <text x="280" y="230" fill="#64748b" font-size="9.5">EVENTS LOGGED: ${snap.events?.length || 0}</text>
    <text x="280" y="250" fill="#64748b" font-size="9.5">QUEUE ITEMS: ${snap.queue?.items?.length || 0}</text>
    <text x="280" y="270" fill="#64748b" font-size="9.5">BLOCKERS: ${isBlocked ? 'TRIPPED [CHECKLIST]' : 'NONE'}</text>
  `;
}

// Electronic Checklist Step Handler
function updateEcl(snap) {
  const isBlocked = !!(snap.state?.block || snap.state?.blocker || snap.state?.hold);
  const title = $("eclFaultTitle");
  const list = $("eclStepsList");
  if (!list || !title) return;

  if (isBlocked) {
    title.textContent = "FAULT: SWARM_BLOCKED / INTERLOCK OPEN";
    title.style.color = "var(--fa-red)";
    list.innerHTML = `
      <div class="fa-ecl-step pending"><span>1. INSPECT BLOCKER PROMPT</span><span>[PENDING]</span></div>
      <div class="fa-ecl-step pending"><span>2. QUERY HERMES ADVICE</span><button class="master-caut-btn" style="padding:1px 4px;font-size:8px;" onclick="window.__eclAdvice()">QUERY</button></div>
      <div class="fa-ecl-step pending"><span>3. ARMED DEBLOCK OVERRIDE</span><button class="master-caut-btn" style="padding:1px 4px;font-size:8px;color:#ff3344;" onclick="window.__eclDeblock()">DEBLOCK</button></div>
    `;
  } else {
    title.textContent = "NOMINAL FLIGHT PROFILE";
    title.style.color = "var(--fa-green)";
    list.innerHTML = `
      <div class="fa-ecl-step complete"><span>1. SSE TELEMETRY STREAM</span><span>[VERIFIED GREEN]</span></div>
      <div class="fa-ecl-step complete"><span>2. ACTIVE AGENT CONCURRENCY</span><span>[NORMAL]</span></div>
      <div class="fa-ecl-step complete"><span>3. ACCEPTANCE GATE RELAYS</span><span>[ARMED]</span></div>
    `;
  }
}

window.__eclAdvice = async () => {
  try {
    await client.command("deblock-advice", { prompt: "Analyze flight block" });
    toast("Flight copilot advice requested", "info");
  } catch (e) { toast(e.message, "error"); }
};

window.__eclDeblock = async () => {
  const prompt = window.prompt("Enter flight-crew deblock directive:");
  if (!prompt) return;
  try {
    await client.command("deblock", { prompt });
    toast("Deblock override engaged", "info");
  } catch (e) { toast(e.message, "error"); }
};

// Guarded Abort Switch Kinematics
const guardEl = $("guardAbort");
guardEl?.addEventListener("click", (e) => {
  e.stopPropagation();
  const next = !isGuardOpen();
  setGuardOpen(next);
  guardEl.classList.toggle("guard-open", next);
  guardEl.setAttribute("aria-expanded", String(next));
  toast(next ? "Emergency Guard ARMED" : "Emergency Guard SAFED", next ? "warn" : "info");
});

$("swAbort")?.querySelector(".korry-btn")?.addEventListener("click", async () => {
  if (!isGuardOpen()) return toast("Safety guard is closed! Flip guard to arm.", "warn");
  try {
    await client.command("stop");
    toast("EMERGENCY ABORT TRANSMITTED", "error");
    setGuardOpen(false);
    guardEl?.classList.remove("guard-open");
  } catch (e) { toast(e.message, "error"); }
});

// Master Alert Beacons
$("btnMasterWarn")?.addEventListener("click", () => {
  $("btnMasterWarn")?.classList.remove("active");
  toast("Master Warning silenced", "info");
});
$("btnMasterCaut")?.addEventListener("click", () => {
  $("btnMasterCaut")?.classList.remove("active");
  toast("Master Caution acknowledged", "info");
});

// Push-to-Test Lamp Test
$("btnLampTest")?.addEventListener("click", () => {
  setLampTesting(true);
  document.querySelectorAll(".legend-field").forEach(l => l.classList.add("lit-green"));
  document.querySelectorAll(".fa-seq-seg").forEach(s => s.classList.add("active"));
  toast("LAMP TEST: All filaments verified", "info");
  setTimeout(() => {
    setLampTesting(false);
    document.querySelectorAll(".legend-field").forEach(l => l.classList.remove("lit-green"));
    updateSequenceBar(snapshot().state?.phase || "idle");
  }, 2000);
});

// Switchboard Handlers
$("swRunNow")?.addEventListener("click", async () => {
  try {
    await client.command("run-now");
    toast("Run Now tick dispatched", "info");
  } catch (e) { toast(e.message, "error"); }
});

$("swPause")?.addEventListener("click", () => {
  client.pause();
  toast("Telemetry stream paused", "warn");
});

$("swSync")?.addEventListener("click", () => {
  client.refresh();
  toast("Master resync completed", "info");
});

$("btnNewFlightPlan")?.addEventListener("click", async () => {
  const title = window.prompt("Flight Project Plan Title:");
  if (!title) return;
  try {
    await client.createProjectPlan({
      title,
      problem: "Aerospace avionics navigation",
      users: "flight-crew",
      objectives: "Verify flight annunciator cockpit telemetry",
      scope: "Avionics suite",
      repoPath: "/home/mojo/projects/hermesswarmbuilder/hermesswarmbuilder",
      baseRef: "HEAD"
    });
    toast("Flight plan drafted", "info");
    await client.refreshPlans();
  } catch (e) { toast(e.message, "error"); }
});

$("btnLaunchAssist")?.addEventListener("click", async () => {
  try {
    const s = await client.createPlanAssistance("managed");
    toast(`AI Copilot session initialized: ${s.id}`, "info");
  } catch (e) { toast(e.message, "error"); }
});

// Render Project Plans List
function renderPlans(snap) {
  const list = $("fmsPlansList");
  if (!list) return;
  const plans = snap.plans?.items || [];
  list.innerHTML = plans.map(p => `
    <div style="background:#07090b;border:1px solid #1a2228;padding:6px;border-radius:2px;">
      <div style="display:flex;justify-content:space-between;">
        <b style="color:#fff;">${p.title || p.planId}</b>
        <span style="color:var(--fa-cyan);">${p.status || 'draft'}</span>
      </div>
      <small style="color:#64748b;">${p.pipelineType || 'classic'} • v${p.version || 1}</small>
    </div>
  `).join("");
}

// Subscribe to Headless Client
client.subscribe((snap) => {
  setSnapshot(snap);
  const phase = snap.state?.phase || "idle";
  const isBlocked = !!(snap.state?.block || snap.state?.blocker || snap.state?.hold);

  if (!isLampTesting()) {
    updateSequenceBar(phase);
  }

  if (isBlocked) {
    $("btnMasterWarn")?.classList.add("active");
    $("btnMasterCaut")?.classList.add("active");
  }

  drawSynoptic(snap);
  updateEcl(snap);
  renderPlans(snap);
});

client.connect();
client.refresh();
updateSequenceBar("idle");
