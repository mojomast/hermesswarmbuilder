import { createDashboardClient, WORKFLOW_PHASES, OPERATION_COMMANDS, PROJECT_PLAN_ACTIONS } from "../../headless-dashboard-client.js";
import { writable, get } from "../../vendor/svelte.js";

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

// Svelte Stores
const snapshotStore = writable(client.getSnapshot());
const pgmSource = writable("cam1");
const pvwSource = writable("cam2");
const tbarPosition = writable(0);

function toast(msg, type = "info") {
  const el = $("bsToast");
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  el.style.background = type === "error" ? "#7f1d1d" : type === "warn" ? "#78350f" : "#064e3b";
  el.style.border = `1px solid ${type === "error" ? "#ef4444" : type === "warn" ? "#f59e0b" : "#10b981"}`;
  setTimeout(() => { el.style.display = "none"; }, 3500);
}

// Multiviewer Monitor Updates
function updateMultiviewer(snap) {
  const isBlocked = !!(snap.state?.block || snap.state?.blocker || snap.state?.hold);
  const phase = snap.state?.phase || "idle";

  const pgmBody = $("pgmBody");
  if (pgmBody) {
    pgmBody.innerHTML = `
      <div style="font-size:11px;color:#fff;font-weight:bold;">ON-AIR BROADCAST STREAM</div>
      <div>RUN ID: <b style="color:#00f0ff;">${snap.state?.currentRunId || 'NONE'}</b></div>
      <div>PHASE: <b style="color:#10b981;">${phase.toUpperCase()}</b></div>
      <div>AGENTS: <b>${Object.keys(snap.state?.agents || {}).length}</b> ACTIVE</div>
      <div>LATEST EVENT: <span style="color:#94a3b8;">${snap.events?.[snap.events.length - 1]?.type || 'IDLE'}</span></div>
    `;
  }

  const pvwBody = $("pvwBody");
  if (pvwBody) {
    pvwBody.innerHTML = `
      <div style="font-size:11px;color:#f59e0b;font-weight:bold;">CUED PREVIEW BUS</div>
      <div>QUEUE DEPTH: <b>${snap.queue?.items?.length || 0}</b> ITEMS</div>
      <div>GATES ARMED: <b>${snap.gates?.gates?.length || 0}</b> GATES</div>
      <div>NEXT ACTION: <span style="color:#94a3b8;">Auto-Transition on Phase Trigger</span></div>
    `;
  }

  const blockerBadge = $("blockerBadge");
  if (blockerBadge) {
    blockerBadge.textContent = isBlocked ? "TRIPPED" : "NORMAL";
    blockerBadge.style.color = isBlocked ? "#ef4444" : "#10b981";
  }

  const aux2Body = $("aux2Body");
  if (aux2Body) {
    aux2Body.innerHTML = isBlocked ? `
      <div style="color:#ef4444;font-weight:bold;">CRITICAL BLOCKER INTERRUPT</div>
      <div style="font-size:9.5px;">${JSON.stringify(snap.state?.blocker || snap.state?.block || '')}</div>
      <button class="bs-btn-crosspoint" style="background:#7f1d1d;color:#fff;margin-top:4px;" onclick="window.__bsDeblock()">EXECUTE DEBLOCK</button>
    ` : `<div>All production subcarrier signals nominal.</div>`;
  }
}

window.__bsDeblock = async () => {
  const prompt = window.prompt("Enter technical director deblock directive:");
  if (!prompt) return;
  try {
    await client.command("deblock", { prompt });
    toast("Deblock command transmitted to on-air run", "info");
  } catch (e) { toast(e.message, "error"); }
};

// Crosspoint Bus Selection
function updateCrosspoints() {
  const pgm = get(pgmSource);
  const pvw = get(pvwSource);

  document.querySelectorAll("#pgmBusButtons .bs-btn-crosspoint").forEach(b => {
    b.classList.toggle("active-pgm", b.dataset.source === pgm);
  });
  document.querySelectorAll("#pvwBusButtons .bs-btn-crosspoint").forEach(b => {
    b.classList.toggle("active-pvw", b.dataset.source === pvw);
  });

  const pgmBadge = $("pgmSourceBadge");
  if (pgmBadge) pgmBadge.textContent = pgm.toUpperCase();
  const pvwBadge = $("pvwSourceBadge");
  if (pvwBadge) pvwBadge.textContent = pvw.toUpperCase();
}

document.querySelectorAll("#pgmBusButtons .bs-btn-crosspoint").forEach(b => {
  b.addEventListener("click", () => {
    pgmSource.set(b.dataset.source);
    updateCrosspoints();
    toast(`PGM switched to ${b.dataset.source.toUpperCase()}`, "info");
  });
});

document.querySelectorAll("#pvwBusButtons .bs-btn-crosspoint").forEach(b => {
  b.addEventListener("click", () => {
    pvwSource.set(b.dataset.source);
    updateCrosspoints();
    toast(`PVW cued to ${b.dataset.source.toUpperCase()}`, "info");
  });
});

// CUT & AUTO Transition Triggers
function executeTransition() {
  const currentPgm = get(pgmSource);
  const currentPvw = get(pvwSource);
  pgmSource.set(currentPvw);
  pvwSource.set(currentPgm);
  updateCrosspoints();
}

$("btnCut")?.addEventListener("click", () => {
  executeTransition();
  toast("TAKE / CUT executed", "info");
});

$("btnAuto")?.addEventListener("click", () => {
  const handle = $("tbarHandle");
  if (handle) {
    handle.style.transition = "top 0.4s ease";
    handle.style.top = "100px";
    setTimeout(() => {
      executeTransition();
      handle.style.top = "10px";
      setTimeout(() => { handle.style.transition = ""; }, 100);
    }, 400);
  }
  toast("AUTO DISSOLVE executed", "info");
});

// DSK Keyer Overlays
$("btnDsk1")?.addEventListener("click", async () => {
  const runId = get(snapshotStore).state?.currentRunId;
  if (!runId) return toast("No active run", "warn");
  try {
    const doc = await client.loadDocument(runId, "spec");
    toast(`DSK 1 KEYED: SPEC.md (${doc.text.length} bytes)`, "info");
  } catch (e) { toast(e.message, "error"); }
});

$("btnDsk2")?.addEventListener("click", async () => {
  const runId = get(snapshotStore).state?.currentRunId;
  if (!runId) return toast("No active run", "warn");
  try {
    const doc = await client.loadDocument(runId, "devplan");
    toast(`DSK 2 KEYED: DEVPLAN.md (${doc.text.length} bytes)`, "info");
  } catch (e) { toast(e.message, "error"); }
});

$("btnDeblockAdvice")?.addEventListener("click", async () => {
  try {
    await client.command("deblock-advice", { prompt: "Analyze MCR feed disruption" });
    toast("Deblock advice queried", "info");
  } catch (e) { toast(e.message, "error"); }
});

// Showcase Macro Cue
$("btnShowcaseLoop")?.addEventListener("click", async () => {
  try {
    await client.command("start-showcase-loop", { targetGenerations: 10 });
    toast("Showcase 10-Generation Loop CUED ON-AIR", "info");
  } catch (e) { toast(e.message, "error"); }
});

// Emergency Fade to Black
$("btnEStop")?.addEventListener("click", async () => {
  try {
    await client.command("stop");
    toast("FADE TO BLACK: Production aborted", "error");
  } catch (e) { toast(e.message, "error"); }
});

$("btnResyncFeed")?.addEventListener("click", () => {
  client.refresh();
  toast("All broadcast feeds resynchronized", "info");
});

// Project Plans List
$("btnNewStudioPlan")?.addEventListener("click", async () => {
  const title = window.prompt("Studio Broadcast Plan Title:");
  if (!title) return;
  try {
    await client.createProjectPlan({
      title,
      problem: "Broadcast MCR automation",
      users: "technical-directors",
      objectives: "Verify video production switching",
      scope: "Master control",
      repoPath: "/home/mojo/projects/hermesswarmbuilder/hermesswarmbuilder",
      baseRef: "HEAD"
    });
    toast("Studio plan drafted", "info");
    await client.refreshPlans();
  } catch (e) { toast(e.message, "error"); }
});

function renderPlans(snap) {
  const list = $("studioPlansList");
  if (!list) return;
  const plans = snap.plans?.items || [];
  list.innerHTML = plans.map(p => `
    <div style="background:#090d12;border:1px solid #1a222d;padding:6px;border-radius:2px;">
      <div style="display:flex;justify-content:space-between;">
        <b>${p.title || p.planId}</b>
        <span style="color:#00f0ff;">${p.status || 'draft'}</span>
      </div>
      <small style="color:#64748b;">${p.pipelineType || 'classic'} • v${p.version || 1}</small>
    </div>
  `).join("");
}

// Client Subscription
client.subscribe((snap) => {
  snapshotStore.set(snap);
  const phase = snap.state?.phase || "idle";

  const runText = $("activeRunText");
  if (runText) runText.textContent = snap.state?.currentRunId || "NONE";
  const phaseText = $("activePhaseText");
  if (phaseText) phaseText.textContent = phase.toUpperCase();

  updateMultiviewer(snap);
  renderPlans(snap);
});

client.connect();
client.refresh();
updateCrosspoints();
