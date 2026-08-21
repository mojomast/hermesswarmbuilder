import { createDashboardClient, WORKFLOW_PHASES, OPERATION_COMMANDS, PROJECT_PLAN_ACTIONS } from "../../headless-dashboard-client.js";
import { reactive, ref, shallowRef } from "../../vendor/vue.js";

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

const snapshot = shallowRef(client.getSnapshot());

const channels = reactive([
  { id: "ch1", name: "CH 1", role: "ARCHITECT", fader: 75, solo: false, cut: false, peak: 45 },
  { id: "ch2", name: "CH 2", role: "CODER", fader: 80, solo: false, cut: false, peak: 65 },
  { id: "ch3", name: "CH 3", role: "TESTER", fader: 60, solo: false, cut: false, peak: 30 },
  { id: "ch4", name: "CH 4", role: "REVIEWER", fader: 50, solo: false, cut: false, peak: 50 },
  { id: "ch5", name: "CH 5", role: "SHOWCASE", fader: 40, solo: false, cut: false, peak: 20 },
  { id: "ch6", name: "CH 6", role: "SYS-BUS", fader: 70, solo: false, cut: false, peak: 40 }
]);

let activeTab = "channels";
let activePlanDraft = { title: "", problem: "", users: "", objectives: "", scope: "", repoPath: "/home/mojo/projects/hermesswarmbuilder/hermesswarmbuilder", baseRef: "HEAD" };
let studioAiThread = [];

function toast(msg, type = "info") {
  const el = $("amToast");
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  el.style.background = type === "error" ? "#991b1b" : type === "warn" ? "#92400e" : "#065f46";
  el.style.border = `1px solid ${type === "error" ? "#ef4444" : type === "warn" ? "#f59e0b" : "#10b981"}`;
  el.style.color = "#fff";
  setTimeout(() => { el.style.display = "none"; }, 3500);
}

// Render Channel Strips
function renderChannelStrips() {
  const bay = $("channelBay");
  if (!bay) return;

  bay.innerHTML = channels.map((ch, idx) => `
    <div class="am-channel-strip" id="${ch.id}">
      <div style="font-size:0.75rem;font-weight:800;text-align:center;color:#64748b;">${ch.name}</div>
      <div class="am-rotary-knob" title="Gain Trim"><div class="am-knob-indicator"></div></div>
      <div class="am-rotary-knob" title="Comp Ratio" style="border-color:#f59e0b;"><div class="am-knob-indicator" style="background:#f59e0b;"></div></div>
      <div class="am-rotary-knob" title="HF EQ" style="border-color:#10b981;"><div class="am-knob-indicator" style="background:#10b981;"></div></div>
      <div class="am-rotary-knob" title="LF EQ" style="border-color:#10b981;"><div class="am-knob-indicator" style="background:#10b981;"></div></div>

      <div class="am-strip-switches">
        <button class="am-btn-switch solo ${ch.solo ? 'active' : ''}" onclick="window.__toggleSolo(${idx})">SOLO</button>
        <button class="am-btn-switch cut ${ch.cut ? 'active' : ''}" onclick="window.__toggleCut(${idx})">CUT</button>
      </div>

      <div class="am-scribble">${ch.role}</div>

      <div class="am-fader-track" onclick="window.__faderClick(event, ${idx})">
        <div class="am-fader-slot"></div>
        <div class="am-fader-cap" style="bottom:${ch.fader}%;"></div>
      </div>
    </div>
  `).join("");
}

window.__toggleSolo = (idx) => {
  channels[idx].solo = !channels[idx].solo;
  renderChannelStrips();
  toast(`${channels[idx].name} Solo: ${channels[idx].solo ? 'ON' : 'OFF'}`, "info");
};

window.__toggleCut = (idx) => {
  channels[idx].cut = !channels[idx].cut;
  renderChannelStrips();
  toast(`${channels[idx].name} Cut: ${channels[idx].cut ? 'ON' : 'OFF'}`, "warn");
};

window.__faderClick = (e, idx) => {
  const rect = e.currentTarget.getBoundingClientRect();
  const clickY = e.clientY - rect.top;
  const pct = Math.max(0, Math.min(100, Math.round((1 - (clickY / rect.height)) * 100)));
  channels[idx].fader = pct;
  renderChannelStrips();
};

// Meter Bridge Animation
function animateMeters() {
  channels.forEach((ch, idx) => {
    const el = $(`meterCh${idx + 1}`)?.querySelector(".am-meter-bar");
    if (el) {
      const wobble = ch.cut ? 0 : Math.max(5, Math.min(95, ch.peak + (Math.random() * 12 - 6)));
      el.style.setProperty("--meter-level", `${wobble}%`);
    }
  });
  requestAnimationFrame(animateMeters);
}

// Push-to-Talk Slate Intercom
$("btnPushToTalk")?.addEventListener("click", async () => {
  const input = $("slateDirectiveInput");
  const directive = input?.value?.trim();
  if (!directive) return toast("Enter steering directive before pushing PTT", "warn");
  try {
    await client.command("steer", { directive, scope: "current" });
    toast(`SLATE INJECTED: "${directive}"`, "info");
    if (input) input.value = "";
  } catch (e) { toast(e.message, "error"); }
});

// Transport Controls
$("btnTransportPause")?.addEventListener("click", () => { client.pause(); toast("Summing engine paused", "warn"); });
$("btnTransportResume")?.addEventListener("click", () => { client.resume(); toast("Summing engine active", "info"); });
$("btnTransportWake")?.addEventListener("click", async () => {
  try { await client.command("run-now"); toast("Immediate tick triggered", "info"); } catch (e) { toast(e.message, "error"); }
});
$("btnTransportStop")?.addEventListener("click", async () => {
  try { await client.command("stop"); toast("EMERGENCY CONSOLE CUT", "error"); } catch (e) { toast(e.message, "error"); }
});

// Right Inspector Tabs
function renderInspector() {
  const container = $("inspectorContent");
  if (!container) return;

  const snap = snapshot.value;
  document.querySelectorAll(".am-tab").forEach(t => {
    t.classList.toggle("active", t.dataset.tab === activeTab);
    t.setAttribute("aria-selected", String(t.dataset.tab === activeTab));
  });

  if (activeTab === "channels") {
    container.innerHTML = `
      <div style="background:var(--am-panel-alt);padding:0.75rem;border-radius:4px;border:1px solid var(--am-border);">
        <h4 style="color:var(--am-amber);font-size:0.9rem;margin-bottom:0.5rem;">SUMMING DESK METRICS</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;font-size:0.8rem;">
          <div>MASTER RUN: <b style="color:#fff;">${snap.state?.currentRunId || 'NONE'}</b></div>
          <div>CONSOLE PHASE: <b style="color:var(--am-green);">${(snap.state?.phase || 'IDLE').toUpperCase()}</b></div>
          <div>ACTIVE STRIPS: <b style="color:#fff;">6 ONLINE</b></div>
          <div>MASTER GAIN: <b style="color:var(--am-amber);">0.0 dB</b></div>
        </div>
      </div>
    `;
  } else if (activeTab === "traffic") {
    const events = (snap.events || []).slice(-30).reverse();
    container.innerHTML = `
      <div style="flex:1;overflow:auto;display:grid;gap:0.4rem;">
        ${events.map(e => `
          <div style="background:#090d12;border:1px solid var(--am-border);padding:0.5rem;border-radius:3px;font-size:0.8rem;">
            <div style="display:flex;justify-content:space-between;color:var(--am-amber);">
              <b>${e.agentId || 'CONSOLE'} // ${e.type || 'EVENT'}</b>
              <time style="color:#64748b;">${new Date(e.ts || Date.now()).toLocaleTimeString()}</time>
            </div>
            <div style="margin-top:0.25rem;color:#fff;">${e.message || ''}</div>
          </div>
        `).join("") || '<div style="color:#64748b;font-size:0.8rem;text-align:center;">No tape events recorded.</div>'}
      </div>
    `;
  } else if (activeTab === "evidence") {
    container.innerHTML = `
      <div style="display:flex;gap:0.5rem;">
        <button class="am-btn" style="flex:1;" onclick="window.__loadDoc('spec')">VIEW SPEC.MD</button>
        <button class="am-btn" style="flex:1;" onclick="window.__loadDoc('devplan')">VIEW DEVPLAN.MD</button>
      </div>
      <div id="evidencePreviewBox" style="background:#05070a;border:1px solid var(--am-border);padding:0.75rem;border-radius:4px;font-size:0.8rem;max-height:280px;overflow:auto;">
        <span style="color:#64748b;">Select console evidence above to inspect.</span>
      </div>
    `;
  } else if (activeTab === "assist") {
    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <h4 style="color:var(--am-amber);font-size:0.9rem;">STUDIO SOUND AI COPILOT</h4>
        <button class="am-btn primary" style="padding:2px 8px;font-size:0.75rem;" onclick="window.__newAssistThread()">+ NEW SESSION</button>
      </div>
      <div id="assistThreadList" style="flex:1;overflow:auto;display:flex;flex-direction:column;gap:0.5rem;min-height:180px;background:#05070a;padding:0.5rem;border-radius:3px;border:1px solid var(--am-border);">
        ${studioAiThread.map(m => `
          <div style="align-self:${m.role === 'user' ? 'flex-end' : 'flex-start'};max-width:85%;background:${m.role === 'user' ? '#b45309' : '#1e293b'};padding:0.4rem 0.6rem;border-radius:4px;font-size:0.8rem;">
            <b>${m.role.toUpperCase()}:</b> ${m.content}
          </div>
        `).join("") || '<span style="color:#64748b;font-size:0.8rem;text-align:center;">Studio AI ready. Send mixing instructions below.</span>'}
      </div>
      <form style="display:flex;gap:0.4rem;" onsubmit="window.__sendAssistMessage(event)">
        <input id="assistInput" class="am-input" style="flex:1;" placeholder="Ask studio copilot for dynamic balance adjustments...">
        <button class="am-btn primary" type="submit">SEND</button>
      </form>
    `;
  }
}

window.__loadDoc = async (type) => {
  const box = $("evidencePreviewBox");
  if (!box) return;
  box.textContent = "Loading console document...";
  try {
    const snap = snapshot.value;
    const runId = snap.selectedRunId || snap.state?.currentRunId;
    if (!runId) return toast("No active run selected", "warn");
    const doc = await client.loadDocument(runId, type);
    box.innerHTML = `<pre style="color:#e2e8f0;white-space:pre-wrap;">${typeof doc === 'string' ? doc : JSON.stringify(doc, null, 2)}</pre>`;
  } catch (e) { box.textContent = `Error loading document: ${e.message}`; }
};
window.__newAssistThread = async () => {
  try {
    await client.createPlanAssistance("classic");
    studioAiThread = [{ role: "assistant", content: "Studio AI Copilot online. Ready to optimize console summing balance." }];
    renderInspector();
  } catch (e) { toast(e.message, "error"); }
};
window.__sendAssistMessage = async (e) => {
  e.preventDefault();
  const input = $("assistInput");
  if (!input || !input.value.trim()) return;
  const msg = input.value.trim();
  studioAiThread.push({ role: "user", content: msg });
  input.value = "";
  renderInspector();
  studioAiThread.push({ role: "assistant", content: `Balance recommendation generated for "${msg}".` });
  renderInspector();
};

// Summing Controls Modal Content
function renderCommandModal() {
  const container = $("commandDialogContent");
  if (!container) return;

  const snap = snapshot.value;
  const isBlocked = !!(snap.state?.block || snap.state?.blocker);
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
      <div style="background:var(--am-panel-alt);padding:0.75rem;border-radius:4px;border:1px solid var(--am-border);">
        <h4 style="color:var(--am-amber);font-size:0.85rem;margin-bottom:0.5rem;">CONSOLE SUMMING TRANSPORT</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem;">
          <button class="am-btn" onclick="client.pause(); window.__toast('Summing paused', 'warn')">PAUSE</button>
          <button class="am-btn" onclick="client.resume(); window.__toast('Summing resumed', 'info')">RESUME</button>
          <button class="am-btn primary" onclick="client.command('run-now'); window.__toast('Immediate summing tick', 'info')">SUM NOW (TICK)</button>
          <button class="am-btn warn" onclick="client.command('hold'); window.__toast('Console hold engaged', 'warn')">HOLD</button>
          <button class="am-btn danger" onclick="client.command('stop'); window.__toast('EMERGENCY CONSOLE CUT', 'error')">EMERGENCY CUT</button>
        </div>
      </div>

      <div style="background:var(--am-panel-alt);padding:0.75rem;border-radius:4px;border:1px solid var(--am-border);">
        <h4 style="color:${isBlocked ? 'var(--am-red)' : 'var(--am-green)'};font-size:0.85rem;margin-bottom:0.5rem;">SUMMING BUS FAULT RECOVERY</h4>
        ${isBlocked ? `
          <div style="background:#991b1b;color:#fecaca;padding:0.4rem;border-radius:3px;font-size:0.8rem;margin-bottom:0.5rem;">
            SUMMING OVERLOAD: ${snap.state?.block?.reason || 'Bus blocked'}
          </div>
        ` : '<div style="color:#64748b;font-size:0.8rem;margin-bottom:0.5rem;">Summing bus nominal.</div>'}
        <div style="display:flex;flex-direction:column;gap:0.4rem;">
          <input id="deblockPromptInput" class="am-input" placeholder="Enter deblock instructions...">
          <div style="display:flex;gap:0.4rem;">
            <button class="am-btn warn" style="flex:1;" onclick="window.__submitDeblock()">OVERRIDE DEBLOCK</button>
            <button class="am-btn" style="flex:1;" onclick="window.__queryAdvice()">QUERY ADVICE</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

window.__toast = toast;
window.__submitDeblock = () => {
  const input = $("deblockPromptInput");
  if (!input || !input.value.trim()) return toast("Enter deblock prompt", "warn");
  client.command("deblock", { prompt: input.value.trim() });
  toast("Deblock command sent to console", "info");
};
window.__queryAdvice = () => {
  client.command("deblock-advice", { prompt: "Analyze summing fault" });
  toast("Console advice queried", "info");
};

// Total Recall Plans Modal Content
function renderPlanModal() {
  const container = $("planDialogContent");
  if (!container) return;

  const snap = snapshot.value;
  const plans = snap.plans?.items || [];
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1.5fr;gap:1rem;">
      <div style="background:var(--am-panel-alt);padding:0.75rem;border-radius:4px;border:1px solid var(--am-border);display:flex;flex-direction:column;gap:0.5rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h4 style="color:var(--am-amber);font-size:0.85rem;">TOTAL RECALL PLANS (${plans.length})</h4>
          <button class="am-btn primary" style="padding:2px 6px;font-size:0.75rem;" onclick="window.__newPlanDraft()">+ NEW SESSION</button>
        </div>
        <div style="flex:1;overflow:auto;display:grid;gap:0.35rem;max-height:300px;">
          ${plans.map(p => `
            <div style="background:#090d12;border:1px solid var(--am-border);padding:0.5rem;border-radius:3px;font-size:0.8rem;">
              <div style="display:flex;justify-content:space-between;">
                <b style="color:#fff;">${p.title || p.planId}</b>
                <span class="scada-chip green">${p.status || 'draft'}</span>
              </div>
              <div style="color:#64748b;font-size:0.75rem;margin-top:0.2rem;">${p.pipelineType || 'classic'} • v${p.version || 1}</div>
              <div style="display:flex;gap:0.3rem;margin-top:0.4rem;">
                <button class="am-btn" style="padding:2px 4px;font-size:0.7rem;" onclick="window.__reviewPlan('${p.planId}', ${p.version || 1})">REVIEW</button>
                <button class="am-btn primary" style="padding:2px 4px;font-size:0.7rem;" onclick="window.__launchPlan('${p.planId}', ${p.version || 1})">LAUNCH</button>
              </div>
            </div>
          `).join("") || '<div style="color:#64748b;font-size:0.8rem;">No Total Recall plans registered.</div>'}
        </div>
      </div>

      <div style="background:var(--am-panel-alt);padding:0.75rem;border-radius:4px;border:1px solid var(--am-border);">
        <h4 style="color:var(--am-green);font-size:0.85rem;margin-bottom:0.5rem;">SESSION PLAN DRAFT EDITOR</h4>
        <form onsubmit="window.__savePlanDraft(event)">
          <div class="am-field"><label>Session Plan Title</label><input id="planTitleInput" class="am-input" value="${activePlanDraft.title}" required></div>
          <div class="am-field"><label>Problem Statement</label><input id="planProblemInput" class="am-input" value="${activePlanDraft.problem}" required></div>
          <div class="am-field"><label>Target Users</label><input id="planUsersInput" class="am-input" value="${activePlanDraft.users}" required></div>
          <div class="am-field"><label>Key Objectives</label><textarea id="planObjectivesInput" class="am-textarea" required>${activePlanDraft.objectives}</textarea></div>
          <button class="am-btn primary" style="width:100%;margin-top:0.5rem;" type="submit">SAVE RECALL SESSION DRAFT</button>
        </form>
      </div>
    </div>
  `;
}

window.__newPlanDraft = () => {
  activePlanDraft = { title: "Audio Mixing Desk Concurrency", problem: "Multi-agent summing channel balance", users: "sound-engineers", objectives: "Maintain 0 dBFS headroom", scope: "Summing desk", repoPath: "/home/mojo/projects/hermesswarmbuilder/hermesswarmbuilder", baseRef: "HEAD" };
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
    toast("Session plan saved to Total Recall memory", "info");
    await client.refreshPlans();
    renderPlanModal();
  } catch (err) { toast(err.message, "error"); }
};
window.__reviewPlan = async (planId, version) => {
  try {
    await client.submitProjectPlanForReview(planId, version);
    await client.approveProjectPlan(planId, version);
    toast(`Plan ${planId} approved by sound supervisor!`, "info");
    await client.refreshPlans();
    renderPlanModal();
  } catch (err) { toast(err.message, "error"); }
};
window.__launchPlan = async (planId, version) => {
  try {
    await client.launchProjectPlan(planId, version);
    toast(`Plan ${planId} launched into console!`, "info");
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
document.querySelectorAll(".am-tab").forEach(t => {
  t.addEventListener("click", () => {
    activeTab = t.dataset.tab;
    renderInspector();
  });
});

$("btnRefresh")?.addEventListener("click", () => {
  client.refresh();
  toast("Console meters resynchronized", "info");
});

// Client Subscription
client.subscribe((snap) => {
  snapshot.value = snap;
  const phase = snap.state?.phase || "idle";

  const runEl = $("masterRunId");
  if (runEl) runEl.textContent = snap.state?.currentRunId || "NONE";

  const phaseEl = $("phaseBadge");
  if (phaseEl) {
    phaseEl.textContent = phase.toUpperCase();
    phaseEl.style.color = snap.state?.block ? 'var(--am-red)' : 'var(--am-green)';
  }

  renderInspector();
});

client.connect();
client.refresh();
renderChannelStrips();
renderInspector();
requestAnimationFrame(animateMeters);
