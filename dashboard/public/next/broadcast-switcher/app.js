import { createDashboardClient, WORKFLOW_PHASES, OPERATION_COMMANDS, PROJECT_PLAN_ACTIONS } from "../../headless-dashboard-client.js";
import { writable, get } from "../../vendor/svelte.js";

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
};

// Svelte Stores
const snapshotStore = writable(client.getSnapshot());
const pgmSource = writable("cam1");
const pvwSource = writable("cam2");
const tbarPosition = writable(0);

let activeTab = "sources";
let dsk1Active = false;
let dsk2Active = false;
let activePlanDraft = { title: "", problem: "", users: "", objectives: "", scope: "", repoPath: "/home/mojo/projects/hermesswarmbuilder/hermesswarmbuilder", baseRef: "HEAD" };
let mcrCopilotThread = [];

function toast(msg, type = "info") {
  const el = $("bsToast");
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  el.style.background = type === "error" ? "#991b1b" : type === "warn" ? "#92400e" : "#065f46";
  el.style.border = `1px solid ${type === "error" ? "#ef4444" : type === "warn" ? "#f59e0b" : "#10b981"}`;
  el.style.color = "#fff";
  setTimeout(() => { el.style.display = "none"; }, 3500);
}

// Crosspoints Selection & Transitions
window.__selectPgm = (src) => {
  pgmSource.set(src);
  toast(`PGM TAKE: ${src.toUpperCase()}`, "info");
};
window.__selectPvw = (src) => {
  pvwSource.set(src);
  toast(`PVW CUED: ${src.toUpperCase()}`, "info");
};

$("btnCut")?.addEventListener("click", () => {
  const curPgm = get(pgmSource);
  const curPvw = get(pvwSource);
  pgmSource.set(curPvw);
  pvwSource.set(curPgm);
  toast(`CUT TRANSITION: Now ON-AIR: ${curPvw.toUpperCase()}`, "info");
});

$("btnAuto")?.addEventListener("click", () => {
  let pos = 0;
  const timer = setInterval(() => {
    pos += 5;
    tbarPosition.set(pos);
    if (pos >= 100) {
      clearInterval(timer);
      const curPgm = get(pgmSource);
      const curPvw = get(pvwSource);
      pgmSource.set(curPvw);
      pvwSource.set(curPgm);
      tbarPosition.set(0);
      toast(`AUTO TRANSITION COMPLETE: ON-AIR: ${curPvw.toUpperCase()}`, "info");
    }
  }, 20);
});

window.__tbarClick = (e) => {
  const rect = e.currentTarget.getBoundingClientRect();
  const clickY = e.clientY - rect.top;
  const pct = Math.max(0, Math.min(100, Math.round((1 - (clickY / rect.height)) * 100)));
  tbarPosition.set(pct);
  if (pct >= 95) {
    const curPgm = get(pgmSource);
    const curPvw = get(pvwSource);
    pgmSource.set(curPvw);
    pvwSource.set(curPgm);
    tbarPosition.set(0);
    toast(`MANUAL T-BAR TRANSITION: ON-AIR: ${curPvw.toUpperCase()}`, "info");
  }
};

window.__toggleDsk = (idx) => {
  if (idx === 1) dsk1Active = !dsk1Active;
  if (idx === 2) dsk2Active = !dsk2Active;
  $("btnDsk1")?.classList.toggle("pgm-active", dsk1Active);
  $("btnDsk2")?.classList.toggle("pgm-active", dsk2Active);
  toast(`DSK ${idx} Overlay: ${dsk1Active || dsk2Active ? 'ON-AIR' : 'OFF'}`, "warn");
};

tbarPosition.subscribe((pos) => {
  const handle = $("tbarHandle");
  const posText = $("tbarPosText");
  if (handle) handle.style.bottom = `${pos}%`;
  if (posText) posText.textContent = `${pos}% (${pos > 50 ? 'PGM MIX' : 'PVW'})`;
});

// Right Inspector Tabs
function renderInspector() {
  const container = $("inspectorContent");
  if (!container) return;

  const snap = get(snapshotStore);
  document.querySelectorAll(".bs-tab").forEach(t => {
    t.classList.toggle("active", t.dataset.tab === activeTab);
    t.setAttribute("aria-selected", String(t.dataset.tab === activeTab));
  });

  if (activeTab === "sources") {
    const agents = Object.values(snap.state?.agents || {});
    container.innerHTML = `
      <div style="background:var(--bs-panel-alt);padding:0.75rem;border-radius:4px;border:1px solid var(--bs-border);">
        <h4 style="color:var(--bs-red);font-size:0.9rem;margin-bottom:0.5rem;">BROADCAST MCR STATUS</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;font-size:0.8rem;">
          <div>ACTIVE RUN: <b style="color:#fff;">${snap.state?.currentRunId || 'NONE'}</b></div>
          <div>ON-AIR PHASE: <b style="color:var(--bs-green);">${(snap.state?.phase || 'IDLE').toUpperCase()}</b></div>
          <div>CAMERA FEEDS: <b style="color:#fff;">${agents.length} LIVE</b></div>
          <div>TALLY STATE: <b style="color:var(--bs-red);">LOCKED</b></div>
        </div>
      </div>

      <div>
        <h4 style="color:var(--bs-cyan);font-size:0.9rem;margin-bottom:0.5rem;">STUDIO CAMERA AGENT ROSTER (${agents.length})</h4>
        <div style="display:grid;gap:0.4rem;">
          ${agents.map(ag => `
            <div style="background:#090d12;border:1px solid var(--bs-border);padding:0.5rem;border-radius:3px;font-size:0.8rem;">
              <div style="display:flex;justify-content:space-between;">
                <b style="color:#fff;">CAM (${ag.role || ag.id})</b>
                <span class="bs-tally-pill pvw">${ag.status || 'live'}</span>
              </div>
              <div style="color:var(--bs-text-dim);font-size:0.75rem;margin-top:0.2rem;">TASK: ${ag.currentTask || ag.task || 'Broadcasting'}</div>
            </div>
          `).join("") || '<div style="color:#64748b;font-size:0.8rem;">No active camera feeds connected.</div>'}
        </div>
      </div>
    `;
  } else if (activeTab === "traffic") {
    const events = (snap.events || []).slice(-30).reverse();
    container.innerHTML = `
      <div style="flex:1;overflow:auto;display:grid;gap:0.4rem;">
        ${events.map(e => `
          <div style="background:#090d12;border:1px solid var(--bs-border);padding:0.5rem;border-radius:3px;font-size:0.8rem;">
            <div style="display:flex;justify-content:space-between;color:var(--bs-red);">
              <b>${e.agentId || 'MCR'} // ${e.type || 'EVENT'}</b>
              <time style="color:#64748b;">${new Date(e.ts || Date.now()).toLocaleTimeString()}</time>
            </div>
            <div style="margin-top:0.25rem;color:#fff;">${e.message || ''}</div>
          </div>
        `).join("") || '<div style="color:#64748b;font-size:0.8rem;text-align:center;">No broadcast line events.</div>'}
      </div>
    `;
  } else if (activeTab === "evidence") {
    container.innerHTML = `
      <div style="display:flex;gap:0.5rem;">
        <button class="bs-btn" style="flex:1;" onclick="window.__loadDoc('spec')">VIEW SPEC.MD</button>
        <button class="bs-btn" style="flex:1;" onclick="window.__loadDoc('devplan')">VIEW DEVPLAN.MD</button>
      </div>
      <div id="evidencePreviewBox" style="background:#05070a;border:1px solid var(--bs-border);padding:0.75rem;border-radius:4px;font-size:0.8rem;max-height:280px;overflow:auto;">
        <span style="color:#64748b;">Select broadcast evidence document above to inspect.</span>
      </div>
    `;
  } else if (activeTab === "assist") {
    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <h4 style="color:var(--bs-red);font-size:0.9rem;">MCR TECHNICAL COPILOT</h4>
        <button class="bs-btn primary" style="padding:2px 8px;font-size:0.75rem;" onclick="window.__newAssistThread()">+ NEW SESSION</button>
      </div>
      <div id="assistThreadList" style="flex:1;overflow:auto;display:flex;flex-direction:column;gap:0.5rem;min-height:180px;background:#05070a;padding:0.5rem;border-radius:3px;border:1px solid var(--bs-border);">
        ${mcrCopilotThread.map(m => `
          <div style="align-self:${m.role === 'user' ? 'flex-end' : 'flex-start'};max-width:85%;background:${m.role === 'user' ? '#991b1b' : '#1e293b'};padding:0.4rem 0.6rem;border-radius:4px;font-size:0.8rem;">
            <b>${m.role.toUpperCase()}:</b> ${m.content}
          </div>
        `).join("") || '<span style="color:#64748b;font-size:0.8rem;text-align:center;">MCR Copilot ready. Send macro cue below.</span>'}
      </div>
      <form style="display:flex;gap:0.4rem;" onsubmit="window.__sendAssistMessage(event)">
        <input id="assistInput" class="bs-input" style="flex:1;" placeholder="Ask MCR copilot for broadcast macro sequence...">
        <button class="bs-btn primary" type="submit">SEND</button>
      </form>
    `;
  }
}

window.__loadDoc = async (type) => {
  const box = $("evidencePreviewBox");
  if (!box) return;
  box.textContent = "Loading broadcast document...";
  try {
    const snap = get(snapshotStore);
    const runId = snap.selectedRunId || snap.state?.currentRunId;
    if (!runId) return toast("No active run selected", "warn");
    const doc = await client.loadDocument(runId, type);
    box.innerHTML = `<pre style="color:#e2e8f0;white-space:pre-wrap;">${typeof doc === 'string' ? doc : JSON.stringify(doc, null, 2)}</pre>`;
  } catch (e) { box.textContent = `Error loading document: ${e.message}`; }
};
window.__newAssistThread = async () => {
  try {
    await client.createPlanAssistance("classic");
    mcrCopilotThread = [{ role: "assistant", content: "MCR Technical Director Copilot online. Ready to organize broadcast rundowns." }];
    renderInspector();
  } catch (e) { toast(e.message, "error"); }
};
window.__sendAssistMessage = async (e) => {
  e.preventDefault();
  const input = $("assistInput");
  if (!input || !input.value.trim()) return;
  const msg = input.value.trim();
  mcrCopilotThread.push({ role: "user", content: msg });
  input.value = "";
  renderInspector();
  mcrCopilotThread.push({ role: "assistant", content: `Broadcast rundown proposal generated for "${msg}".` });
  renderInspector();
};

// Cue Macros / Command Modal Content
function renderCommandModal() {
  const container = $("commandDialogContent");
  if (!container) return;

  const snap = get(snapshotStore);
  const isBlocked = !!(snap.state?.block || snap.state?.blocker);
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
      <div style="background:var(--bs-panel-alt);padding:0.75rem;border-radius:4px;border:1px solid var(--bs-border);">
        <h4 style="color:var(--bs-red);font-size:0.85rem;margin-bottom:0.5rem;">MCR BROADCAST TRANSPORT</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem;">
          <button class="bs-btn" onclick="client.pause(); window.__toast('Broadcast stream paused', 'warn')">PAUSE</button>
          <button class="bs-btn" onclick="client.resume(); window.__toast('Broadcast stream live', 'info')">RESUME</button>
          <button class="bs-btn primary" onclick="client.command('run-now'); window.__toast('Immediate broadcast tick', 'info')">TAKE NOW (TICK)</button>
          <button class="bs-btn warn" onclick="client.command('hold'); window.__toast('Broadcast hold engaged', 'warn')">HOLD</button>
          <button class="bs-btn danger" onclick="client.command('stop'); window.__toast('EMERGENCY CONSOLE CUT', 'error')">EMERGENCY CUT</button>
        </div>
        <div style="margin-top:0.75rem;">
          <label style="font-size:0.8rem;color:var(--bs-text-dim);">10-GEN SHOWCASE RUNDOWN:</label>
          <div style="display:flex;gap:0.5rem;align-items:center;margin-top:0.25rem;">
            <input type="range" id="showcaseGenSlider" min="1" max="10" value="10" style="flex:1;">
            <button class="bs-btn primary" onclick="window.__startShowcase()">START SHOWCASE</button>
          </div>
        </div>
      </div>

      <div style="background:var(--bs-panel-alt);padding:0.75rem;border-radius:4px;border:1px solid var(--bs-border);">
        <h4 style="color:${isBlocked ? 'var(--bs-red)' : 'var(--bs-green)'};font-size:0.85rem;margin-bottom:0.5rem;">ON-AIR FAULT RECOVERY</h4>
        ${isBlocked ? `
          <div style="background:#991b1b;color:#fecaca;padding:0.4rem;border-radius:3px;font-size:0.8rem;margin-bottom:0.5rem;">
            ON-AIR HOLD: ${snap.state?.block?.reason || 'Broadcast stream blocked'}
          </div>
        ` : '<div style="color:#64748b;font-size:0.8rem;margin-bottom:0.5rem;">Broadcast transmission nominal.</div>'}
        <div style="display:flex;flex-direction:column;gap:0.4rem;">
          <input id="deblockPromptInput" class="bs-input" placeholder="Enter broadcast deblock prompt...">
          <div style="display:flex;gap:0.4rem;">
            <button class="bs-btn warn" style="flex:1;" onclick="window.__submitDeblock()">OVERRIDE DEBLOCK</button>
            <button class="bs-btn" style="flex:1;" onclick="window.__queryAdvice()">QUERY ADVICE</button>
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
  toast(`Broadcast showcase initiated for ${targetGenerations} generations`, "info");
};
window.__submitDeblock = () => {
  const input = $("deblockPromptInput");
  if (!input || !input.value.trim()) return toast("Enter deblock prompt", "warn");
  client.command("deblock", { prompt: input.value.trim() });
  toast("Deblock directive sent to MCR", "info");
};
window.__queryAdvice = () => {
  client.command("deblock-advice", { prompt: "Analyze broadcast fault" });
  toast("MCR advice queried", "info");
};

// Studio Run Plans Modal Content
function renderPlanModal() {
  const container = $("planDialogContent");
  if (!container) return;

  const snap = get(snapshotStore);
  const plans = snap.plans?.items || [];
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1.5fr;gap:1rem;">
      <div style="background:var(--bs-panel-alt);padding:0.75rem;border-radius:4px;border:1px solid var(--bs-border);display:flex;flex-direction:column;gap:0.5rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h4 style="color:var(--bs-red);font-size:0.85rem;">STUDIO PLANS (${plans.length})</h4>
          <button class="bs-btn primary" style="padding:2px 6px;font-size:0.75rem;" onclick="window.__newPlanDraft()">+ NEW PLAN</button>
        </div>
        <div style="flex:1;overflow:auto;display:grid;gap:0.35rem;max-height:300px;">
          ${plans.map(p => `
            <div style="background:#090d12;border:1px solid var(--bs-border);padding:0.5rem;border-radius:3px;font-size:0.8rem;">
              <div style="display:flex;justify-content:space-between;">
                <b style="color:#fff;">${p.title || p.planId}</b>
                <span class="bs-tally-pill pvw">${p.status || 'draft'}</span>
              </div>
              <div style="color:#64748b;font-size:0.75rem;margin-top:0.2rem;">${p.pipelineType || 'classic'} • v${p.version || 1}</div>
              <div style="display:flex;gap:0.3rem;margin-top:0.4rem;">
                <button class="bs-btn" style="padding:2px 4px;font-size:0.7rem;" onclick="window.__reviewPlan('${p.planId}', ${p.version || 1})">REVIEW</button>
                <button class="bs-btn primary" style="padding:2px 4px;font-size:0.7rem;" onclick="window.__launchPlan('${p.planId}', ${p.version || 1})">LAUNCH</button>
              </div>
            </div>
          `).join("") || '<div style="color:#64748b;font-size:0.8rem;">No studio plans registered.</div>'}
        </div>
      </div>

      <div style="background:var(--bs-panel-alt);padding:0.75rem;border-radius:4px;border:1px solid var(--bs-border);">
        <h4 style="color:var(--bs-green);font-size:0.85rem;margin-bottom:0.5rem;">STUDIO PLAN DRAFT EDITOR</h4>
        <form onsubmit="window.__savePlanDraft(event)">
          <div class="bs-field"><label>Plan Title</label><input id="planTitleInput" class="bs-input" value="${activePlanDraft.title}" required></div>
          <div class="bs-field"><label>Problem Statement</label><input id="planProblemInput" class="bs-input" value="${activePlanDraft.problem}" required></div>
          <div class="bs-field"><label>Target Users</label><input id="planUsersInput" class="bs-input" value="${activePlanDraft.users}" required></div>
          <div class="bs-field"><label>Key Objectives</label><textarea id="planObjectivesInput" class="bs-textarea" required>${activePlanDraft.objectives}</textarea></div>
          <button class="bs-btn primary" style="width:100%;margin-top:0.5rem;" type="submit">SAVE STUDIO PLAN DRAFT</button>
        </form>
      </div>
    </div>
  `;
}

window.__newPlanDraft = () => {
  activePlanDraft = { title: "Live Swarm Broadcast Production", problem: "Multi-camera subagent stream aggregation", users: "technical-directors", objectives: "Ensure 100% broadcast uptime", scope: "Production switcher", repoPath: "/home/mojo/projects/hermesswarmbuilder/hermesswarmbuilder", baseRef: "HEAD" };
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
    toast("Studio plan saved to MCR rundown", "info");
    await client.refreshPlans();
    renderPlanModal();
  } catch (err) { toast(err.message, "error"); }
};
window.__reviewPlan = async (planId, version) => {
  try {
    await client.submitProjectPlanForReview(planId, version);
    await client.approveProjectPlan(planId, version);
    toast(`Plan ${planId} approved by technical director!`, "info");
    await client.refreshPlans();
    renderPlanModal();
  } catch (err) { toast(err.message, "error"); }
};
window.__launchPlan = async (planId, version) => {
  try {
    await client.launchProjectPlan(planId, version);
    toast(`Plan ${planId} launched on air!`, "info");
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
document.querySelectorAll(".bs-tab").forEach(t => {
  t.addEventListener("click", () => {
    activeTab = t.dataset.tab;
    renderInspector();
  });
});

$("btnRefresh")?.addEventListener("click", () => {
  client.refresh();
  toast("MCR feed resynchronized", "info");
});

// Client Subscription
client.subscribe((snap) => {
  snapshotStore.set(snap);
  const phase = snap.state?.phase || "idle";

  const runText = $("runIdText");
  if (runText) runText.textContent = `RUN: ${snap.state?.currentRunId || 'NONE'}`;

  const phaseText = $("phaseText");
  if (phaseText) {
    phaseText.textContent = phase.toUpperCase();
    phaseText.style.color = snap.state?.block ? 'var(--bs-red)' : 'var(--bs-green)';
  }

  // Update Multiviewer feeds
  const agents = Object.values(snap.state?.agents || {});
  if ($("cam1Status")) $("cam1Status").textContent = agents[0] ? `${agents[0].role}: ${agents[0].status}` : "STANDBY";
  if ($("cam2Status")) $("cam2Status").textContent = agents[1] ? `${agents[1].role}: ${agents[1].status}` : "STANDBY";
  if ($("cam3Status")) $("cam3Status").textContent = agents[2] ? `${agents[2].role}: ${agents[2].status}` : "STANDBY";
  if ($("cam4Status")) $("cam4Status").textContent = agents[3] ? `${agents[3].role}: ${agents[3].status}` : "STANDBY";

  renderInspector();
});

client.connect();
client.refresh();
renderInspector();
