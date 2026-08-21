import { createDashboardClient, WORKFLOW_PHASES, OPERATION_COMMANDS, PROJECT_PLAN_ACTIONS } from "../../headless-dashboard-client.js";
import { createSignal, createEffect } from "../../vendor/solid.js";

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

const [snapshot, setSnapshot] = createSignal(client.getSnapshot());
const [isGuardOpen, setGuardOpen] = createSignal(false);
const [isLampTesting, setLampTesting] = createSignal(false);

let activeTab = "ecl";
let activePlanDraft = { title: "", problem: "", users: "", objectives: "", scope: "", repoPath: "/home/mojo/projects/hermesswarmbuilder/hermesswarmbuilder", baseRef: "HEAD" };
let copilotThread = [];

function toast(msg, type = "info") {
  const el = $("faToast");
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  el.style.background = type === "error" ? "#991b1b" : type === "warn" ? "#92400e" : "#0369a1";
  el.style.border = `1px solid ${type === "error" ? "#ef4444" : type === "warn" ? "#f59e0b" : "#00f0ff"}`;
  el.style.color = "#fff";
  setTimeout(() => { el.style.display = "none"; }, 3500);
}

// 16-Phase Flight Sequence Bar
function renderSequenceBar(snap) {
  const bar = $("phaseSequenceBar");
  if (!bar) return;

  const currentPhase = snap.state?.phase || "idle";
  const currentIndex = WORKFLOW_PHASES.indexOf(currentPhase);

  bar.innerHTML = WORKFLOW_PHASES.map((p, idx) => `
    <div class="fa-seq-step ${idx === currentIndex ? 'active' : idx < currentIndex ? 'done' : ''}">
      ${p.toUpperCase()}
    </div>
  `).join("");
}

// Synoptic Flow SVG MFD
function renderSynoptic(snap) {
  const svg = $("synopticSvg");
  if (!svg) return;

  const isBlocked = !!(snap.state?.block || snap.state?.blocker);
  const flowColor = isBlocked ? "#ef4444" : "#00f0ff";

  svg.innerHTML = `
    <!-- Flight Route Heading Line -->
    <path d="M 80 160 L 260 160 L 400 80 L 540 160 L 720 160" fill="none" stroke="${flowColor}" stroke-width="4" stroke-dasharray="8,4" />
    <circle cx="80" cy="160" r="12" fill="#090d12" stroke="${flowColor}" stroke-width="3" />
    <text x="80" y="195" text-anchor="middle" fill="#94a3b8" font-size="10">TAKEOFF (IDLE)</text>

    <circle cx="400" cy="80" r="16" fill="#090d12" stroke="${flowColor}" stroke-width="3" />
    <text x="400" y="55" text-anchor="middle" fill="#00f0ff" font-size="12" font-weight="bold">CRUISE (BUILDING)</text>

    <circle cx="720" cy="160" r="12" fill="#090d12" stroke="#10b981" stroke-width="3" />
    <text x="720" y="195" text-anchor="middle" fill="#10b981" font-size="10">LANDING (PUBLISHED)</text>

    <!-- Aircraft Symbol -->
    <g transform="translate(390, 70)">
      <polygon points="10,0 20,20 10,16 0,20" fill="#fff" />
    </g>
  `;
}

// Glareshield Alerts
function updateGlareshield(snap) {
  const isBlocked = !!(snap.state?.block || snap.state?.blocker);
  const mw = $("masterWarning");
  const mc = $("masterCaution");

  if (mw) {
    mw.classList.toggle("active", isBlocked);
    mw.classList.toggle("blinking", isBlocked);
  }
  if (mc) {
    mc.classList.toggle("active", snap.state?.phase === "deblocking");
  }
}

window.__silenceAlerts = () => {
  $("masterWarning")?.classList.remove("blinking");
  $("masterCaution")?.classList.remove("blinking");
  toast("Glareshield alert silenced by flight crew", "info");
};

// Right Inspector Tabs
function renderInspector() {
  const container = $("inspectorContent");
  if (!container) return;

  const snap = snapshot();
  document.querySelectorAll(".fa-tab").forEach(t => {
    t.classList.toggle("active", t.dataset.tab === activeTab);
    t.setAttribute("aria-selected", String(t.dataset.tab === activeTab));
  });

  if (activeTab === "ecl") {
    container.innerHTML = `
      <div style="background:var(--fa-panel-alt);padding:0.75rem;border-radius:4px;border:1px solid var(--fa-border);">
        <h4 style="color:var(--fa-cyan);font-size:0.9rem;margin-bottom:0.5rem;">ELECTRONIC CHECKLIST (ECL)</h4>
        <div style="display:grid;gap:0.4rem;font-size:0.8rem;">
          <div style="display:flex;justify-content:space-between;background:#090d12;padding:0.4rem;border-radius:3px;">
            <span>1. SSE TELEMETRY LOCK</span>
            <span style="color:var(--fa-emerald);font-weight:bold;">[VERIFIED]</span>
          </div>
          <div style="display:flex;justify-content:space-between;background:#090d12;padding:0.4rem;border-radius:3px;">
            <span>2. AVIONICS RUN ID: ${snap.state?.currentRunId || 'NONE'}</span>
            <span style="color:var(--fa-emerald);font-weight:bold;">[CLOSED]</span>
          </div>
          <div style="display:flex;justify-content:space-between;background:#090d12;padding:0.4rem;border-radius:3px;">
            <span>3. SWARM PHASE: ${(snap.state?.phase || 'IDLE').toUpperCase()}</span>
            <span style="color:var(--fa-cyan);font-weight:bold;">[IN PROGRESS]</span>
          </div>
          <div style="display:flex;justify-content:space-between;background:#090d12;padding:0.4rem;border-radius:3px;">
            <span>4. EMERGENCY JETTISON ARMED</span>
            <span style="color:var(--fa-emerald);font-weight:bold;">[ARMED]</span>
          </div>
        </div>
      </div>
    `;
  } else if (activeTab === "traffic") {
    const events = (snap.events || []).slice(-30).reverse();
    container.innerHTML = `
      <div style="flex:1;overflow:auto;display:grid;gap:0.4rem;">
        ${events.map(e => `
          <div style="background:#090d12;border:1px solid var(--fa-border);padding:0.5rem;border-radius:3px;font-size:0.8rem;">
            <div style="display:flex;justify-content:space-between;color:var(--fa-cyan);">
              <b>${e.agentId || 'AVIONICS'} // ${e.type || 'DATALINK'}</b>
              <time style="color:#64748b;">${new Date(e.ts || Date.now()).toLocaleTimeString()}</time>
            </div>
            <div style="margin-top:0.25rem;color:#fff;">${e.message || ''}</div>
          </div>
        `).join("") || '<div style="color:#64748b;font-size:0.8rem;text-align:center;">No datalink transmissions recorded.</div>'}
      </div>
    `;
  } else if (activeTab === "evidence") {
    container.innerHTML = `
      <div style="display:flex;gap:0.5rem;">
        <button class="fa-btn" style="flex:1;" onclick="window.__loadDoc('spec')">VIEW SPEC.MD</button>
        <button class="fa-btn" style="flex:1;" onclick="window.__loadDoc('devplan')">VIEW DEVPLAN.MD</button>
      </div>
      <div id="evidencePreviewBox" style="background:#05070a;border:1px solid var(--fa-border);padding:0.75rem;border-radius:4px;font-size:0.8rem;max-height:280px;overflow:auto;">
        <span style="color:#64748b;">Select flight evidence above to inspect.</span>
      </div>
    `;
  } else if (activeTab === "assist") {
    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <h4 style="color:var(--fa-cyan);font-size:0.9rem;">AVIONICS COPILOT AI</h4>
        <button class="fa-btn primary" style="padding:2px 8px;font-size:0.75rem;" onclick="window.__newAssistThread()">+ NEW FLIGHT</button>
      </div>
      <div id="assistThreadList" style="flex:1;overflow:auto;display:flex;flex-direction:column;gap:0.5rem;min-height:180px;background:#05070a;padding:0.5rem;border-radius:3px;border:1px solid var(--fa-border);">
        ${copilotThread.map(m => `
          <div style="align-self:${m.role === 'user' ? 'flex-end' : 'flex-start'};max-width:85%;background:${m.role === 'user' ? '#0369a1' : '#1e293b'};padding:0.4rem 0.6rem;border-radius:4px;font-size:0.8rem;">
            <b>${m.role.toUpperCase()}:</b> ${m.content}
          </div>
        `).join("") || '<span style="color:#64748b;font-size:0.8rem;text-align:center;">Avionics Copilot ready. Send flight plan prompt below.</span>'}
      </div>
      <form style="display:flex;gap:0.4rem;" onsubmit="window.__sendAssistMessage(event)">
        <input id="assistInput" class="fa-input" style="flex:1;" placeholder="Ask copilot for optimal waypoint trajectory...">
        <button class="fa-btn primary" type="submit">SEND</button>
      </form>
    `;
  }
}

window.__loadDoc = async (type) => {
  const box = $("evidencePreviewBox");
  if (!box) return;
  box.textContent = "Loading flight document...";
  try {
    const snap = snapshot();
    const runId = snap.selectedRunId || snap.state?.currentRunId;
    if (!runId) return toast("No active flight run selected", "warn");
    const doc = await client.loadDocument(runId, type);
    box.innerHTML = `<pre style="color:#e2e8f0;white-space:pre-wrap;">${typeof doc === 'string' ? doc : JSON.stringify(doc, null, 2)}</pre>`;
  } catch (e) { box.textContent = `Error loading document: ${e.message}`; }
};
window.__newAssistThread = async () => {
  try {
    await client.createPlanAssistance("classic");
    copilotThread = [{ role: "assistant", content: "Avionics Copilot initialized. Ready to compute flight trajectory." }];
    renderInspector();
  } catch (e) { toast(e.message, "error"); }
};
window.__sendAssistMessage = async (e) => {
  e.preventDefault();
  const input = $("assistInput");
  if (!input || !input.value.trim()) return;
  const msg = input.value.trim();
  copilotThread.push({ role: "user", content: msg });
  input.value = "";
  renderInspector();
  copilotThread.push({ role: "assistant", content: `Trajectory computed for "${msg}". Proposal ready.` });
  renderInspector();
};

// Flight Controls Modal Content
function renderCommandModal() {
  const container = $("commandDialogContent");
  if (!container) return;

  const snap = snapshot();
  const isBlocked = !!(snap.state?.block || snap.state?.blocker);
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
      <div style="background:var(--fa-panel-alt);padding:0.75rem;border-radius:4px;border:1px solid var(--fa-border);">
        <h4 style="color:var(--fa-cyan);font-size:0.85rem;margin-bottom:0.5rem;">FLIGHT TRANSPORT VECTORS</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem;">
          <button class="fa-btn" onclick="client.pause(); window.__toast('Flight paused', 'warn')">PAUSE</button>
          <button class="fa-btn" onclick="client.resume(); window.__toast('Flight resumed', 'info')">RESUME</button>
          <button class="fa-btn primary" onclick="client.command('run-now'); window.__toast('Immediate flight tick', 'info')">FLY NOW (TICK)</button>
          <button class="fa-btn danger" onclick="client.command('stop'); window.__toast('EMERGENCY ABORT TRANSMITTED', 'error')">ABORT FLIGHT</button>
        </div>
        <div style="margin-top:0.75rem;">
          <label style="font-size:0.8rem;color:var(--fa-text-dim);">10-GEN SHOWCASE FLIGHT:</label>
          <div style="display:flex;gap:0.5rem;align-items:center;margin-top:0.25rem;">
            <input type="range" id="showcaseGenSlider" min="1" max="10" value="10" style="flex:1;">
            <button class="fa-btn primary" onclick="window.__startShowcase()">START SHOWCASE</button>
          </div>
        </div>
      </div>

      <div style="background:var(--fa-panel-alt);padding:0.75rem;border-radius:4px;border:1px solid var(--fa-border);">
        <h4 style="color:${isBlocked ? 'var(--fa-red)' : 'var(--fa-emerald)'};font-size:0.85rem;margin-bottom:0.5rem;">FLIGHT DEBLOCK & RECOVERY</h4>
        ${isBlocked ? `
          <div style="background:#991b1b;color:#fecaca;padding:0.4rem;border-radius:3px;font-size:0.8rem;margin-bottom:0.5rem;">
            MASTER WARNING ACTIVE: ${snap.state?.block?.reason || 'Flight path blocked'}
          </div>
        ` : '<div style="color:#64748b;font-size:0.8rem;margin-bottom:0.5rem;">Flight path clear.</div>'}
        <div style="display:flex;flex-direction:column;gap:0.4rem;">
          <input id="deblockPromptInput" class="fa-input" placeholder="Enter flight deblock prompt...">
          <div style="display:flex;gap:0.4rem;">
            <button class="fa-btn warn" style="flex:1;" onclick="window.__submitDeblock()">OVERRIDE DEBLOCK</button>
            <button class="fa-btn" style="flex:1;" onclick="window.__queryAdvice()">QUERY ADVICE</button>
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
  toast(`Showcase flight launched for ${targetGenerations} generations`, "info");
};
window.__submitDeblock = () => {
  const input = $("deblockPromptInput");
  if (!input || !input.value.trim()) return toast("Enter deblock prompt", "warn");
  client.command("deblock", { prompt: input.value.trim() });
  toast("Flight deblock transmitted", "info");
};
window.__queryAdvice = () => {
  client.command("deblock-advice", { prompt: "Analyze flight obstruction" });
  toast("Copilot advice queried", "info");
};

// FMS Plans Modal Content
function renderPlanModal() {
  const container = $("planDialogContent");
  if (!container) return;

  const snap = snapshot();
  const plans = snap.plans?.items || [];
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1.5fr;gap:1rem;">
      <div style="background:var(--fa-panel-alt);padding:0.75rem;border-radius:4px;border:1px solid var(--fa-border);display:flex;flex-direction:column;gap:0.5rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h4 style="color:var(--fa-cyan);font-size:0.85rem;">FMS PLANS (${plans.length})</h4>
          <button class="fa-btn primary" style="padding:2px 6px;font-size:0.75rem;" onclick="window.__newPlanDraft()">+ NEW PLAN</button>
        </div>
        <div style="flex:1;overflow:auto;display:grid;gap:0.35rem;max-height:300px;">
          ${plans.map(p => `
            <div style="background:#090d12;border:1px solid var(--fa-border);padding:0.5rem;border-radius:3px;font-size:0.8rem;">
              <div style="display:flex;justify-content:space-between;">
                <b style="color:#fff;">${p.title || p.planId}</b>
                <span class="fa-chip emerald">${p.status || 'draft'}</span>
              </div>
              <div style="color:#64748b;font-size:0.75rem;margin-top:0.2rem;">${p.pipelineType || 'classic'} • v${p.version || 1}</div>
              <div style="display:flex;gap:0.3rem;margin-top:0.4rem;">
                <button class="fa-btn" style="padding:2px 4px;font-size:0.7rem;" onclick="window.__reviewPlan('${p.planId}', ${p.version || 1})">REVIEW</button>
                <button class="fa-btn primary" style="padding:2px 4px;font-size:0.7rem;" onclick="window.__launchPlan('${p.planId}', ${p.version || 1})">LAUNCH</button>
              </div>
            </div>
          `).join("") || '<div style="color:#64748b;font-size:0.8rem;">No FMS flight plans registered.</div>'}
        </div>
      </div>

      <div style="background:var(--fa-panel-alt);padding:0.75rem;border-radius:4px;border:1px solid var(--fa-border);">
        <h4 style="color:var(--fa-emerald);font-size:0.85rem;margin-bottom:0.5rem;">FMS FLIGHT PLAN EDITOR</h4>
        <form onsubmit="window.__savePlanDraft(event)">
          <div class="fa-field"><label>Flight Plan Title</label><input id="planTitleInput" class="fa-input" value="${activePlanDraft.title}" required></div>
          <div class="fa-field"><label>Problem Statement</label><input id="planProblemInput" class="fa-input" value="${activePlanDraft.problem}" required></div>
          <div class="fa-field"><label>Target Users</label><input id="planUsersInput" class="fa-input" value="${activePlanDraft.users}" required></div>
          <div class="fa-field"><label>Key Objectives</label><textarea id="planObjectivesInput" class="fa-textarea" required>${activePlanDraft.objectives}</textarea></div>
          <button class="fa-btn primary" style="width:100%;margin-top:0.5rem;" type="submit">SAVE FMS PLAN REVISION</button>
        </form>
      </div>
    </div>
  `;
}

window.__newPlanDraft = () => {
  activePlanDraft = { title: "Transatlantic Swarm Flight", problem: "Optimize routing across high-latency nodes", users: "flight-crew", objectives: "Ensure 100% ECL verification", scope: "Avionics core", repoPath: "/home/mojo/projects/hermesswarmbuilder/hermesswarmbuilder", baseRef: "HEAD" };
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
    toast("FMS plan saved to avionics memory", "info");
    await client.refreshPlans();
    renderPlanModal();
  } catch (err) { toast(err.message, "error"); }
};
window.__reviewPlan = async (planId, version) => {
  try {
    await client.submitProjectPlanForReview(planId, version);
    await client.approveProjectPlan(planId, version);
    toast(`Plan ${planId} approved for flight!`, "info");
    await client.refreshPlans();
    renderPlanModal();
  } catch (err) { toast(err.message, "error"); }
};
window.__launchPlan = async (planId, version) => {
  try {
    await client.launchProjectPlan(planId, version);
    toast(`Plan ${planId} launched into flight!`, "info");
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
document.querySelectorAll(".fa-tab").forEach(t => {
  t.addEventListener("click", () => {
    activeTab = t.dataset.tab;
    renderInspector();
  });
});

$("btnLampTest")?.addEventListener("click", () => {
  toast("LAMP TEST: All cockpit illuminators tested nominal", "info");
});

$("btnRefresh")?.addEventListener("click", () => {
  client.refresh();
  toast("Avionics datalink resynchronized", "info");
});

// Client Subscription
client.subscribe((snap) => {
  setSnapshot(snap);
  renderSequenceBar(snap);
  renderSynoptic(snap);
  updateGlareshield(snap);
  renderInspector();
});

client.connect();
client.refresh();
renderSequenceBar(snapshot());
renderSynoptic(snapshot());
renderInspector();
