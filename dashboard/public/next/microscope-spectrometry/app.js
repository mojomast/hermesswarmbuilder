import { createDashboardClient, WORKFLOW_PHASES, OPERATION_COMMANDS, PROJECT_PLAN_ACTIONS } from "../../headless-dashboard-client.js";

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

let snapshot = client.getSnapshot();
let activeTab = "column";
let scanY = 0;
let activePlanDraft = { title: "", problem: "", users: "", objectives: "", scope: "", repoPath: "/home/mojo/projects/hermesswarmbuilder/hermesswarmbuilder", baseRef: "HEAD" };
let opticsAiThread = [];

function toast(msg, type = "info") {
  const el = $("semToast");
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  el.style.background = type === "error" ? "#991b1b" : type === "warn" ? "#92400e" : "#065f46";
  el.style.border = `1px solid ${type === "error" ? "#ef4444" : type === "warn" ? "#f59e0b" : "#22ee55"}`;
  el.style.color = "#fff";
  setTimeout(() => { el.style.display = "none"; }, 3500);
}

// P31 Phosphor CRT Raster Display Canvas
const crtCanvas = $("crtCanvas");
const crtCtx = crtCanvas ? crtCanvas.getContext("2d") : null;

// EDX Multi-Channel Analyzer (MCA) Histogram Canvas
const mcaCanvas = $("mcaCanvas");
const mcaCtx = mcaCanvas ? mcaCanvas.getContext("2d") : null;

function resizeCanvases() {
  if (crtCanvas && crtCtx) {
    const rect = crtCanvas.parentElement.getBoundingClientRect();
    crtCanvas.width = rect.width * (window.devicePixelRatio || 1);
    crtCanvas.height = rect.height * (window.devicePixelRatio || 1);
    crtCtx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
  }
  if (mcaCanvas && mcaCtx) {
    const rect = mcaCanvas.parentElement.getBoundingClientRect();
    mcaCanvas.width = rect.width * (window.devicePixelRatio || 1);
    mcaCanvas.height = rect.height * (window.devicePixelRatio || 1);
    mcaCtx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
  }
}
window.addEventListener("resize", resizeCanvases);

function drawCrt() {
  if (!crtCanvas || !crtCtx) return;
  const rect = crtCanvas.parentElement.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;

  // Phosphor Decay Background
  crtCtx.fillStyle = "rgba(0, 5, 2, 0.12)";
  crtCtx.fillRect(0, 0, w, h);

  // Raster Scan Beam Line
  scanY = (scanY + 2) % h;
  crtCtx.strokeStyle = "rgba(34, 238, 85, 0.8)";
  crtCtx.lineWidth = 2;
  crtCtx.beginPath();
  crtCtx.moveTo(0, scanY);
  crtCtx.lineTo(w, scanY);
  crtCtx.stroke();

  // Specimen Microstructure Particles (Agents)
  const isBlocked = !!(snapshot.state?.block || snapshot.state?.blocker);
  const color = isBlocked ? "rgba(239, 68, 68, 0.8)" : "rgba(34, 238, 85, 0.7)";

  crtCtx.fillStyle = color;
  for (let i = 0; i < 18; i++) {
    const px = ((i * 137 + 45) % w);
    const py = ((i * 89 + 30) % h);
    crtCtx.beginPath();
    crtCtx.arc(px, py, 4 + (i % 4), 0, Math.PI * 2);
    crtCtx.fill();
  }

  // Crosshairs & Scale Bar
  crtCtx.strokeStyle = "rgba(56, 189, 248, 0.4)";
  crtCtx.lineWidth = 1;
  crtCtx.beginPath();
  crtCtx.moveTo(w / 2 - 20, h / 2); crtCtx.lineTo(w / 2 + 20, h / 2);
  crtCtx.moveTo(w / 2, h / 2 - 20); crtCtx.lineTo(w / 2, h / 2 + 20);
  crtCtx.stroke();

  crtCtx.fillStyle = "#38bdf8";
  crtCtx.font = "10px JetBrains Mono";
  crtCtx.fillText("MAG: 5,000x | WD: 10.0mm | HV: 15.0kV", 12, h - 12);
}

function drawMca() {
  if (!mcaCanvas || !mcaCtx) return;
  const rect = mcaCanvas.parentElement.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;

  mcaCtx.fillStyle = "#040608";
  mcaCtx.fillRect(0, 0, w, h);

  // MCA Spectrum Line
  mcaCtx.strokeStyle = "#38bdf8";
  mcaCtx.lineWidth = 1.5;
  mcaCtx.beginPath();

  const numBins = 60;
  for (let i = 0; i < numBins; i++) {
    const x = (i / numBins) * w;
    let counts = 10 + Math.sin(i * 0.2) * 8 + Math.random() * 6;
    if (i === 8) counts = 85; // Si Kα (1.74 keV)
    if (i === 24) counts = 120; // Fe Kα (6.40 keV)
    if (i === 32) counts = 95; // Cu Kα (8.04 keV)
    const y = h - 20 - (counts / 140) * (h - 40);
    if (i === 0) mcaCtx.moveTo(x, y);
    else mcaCtx.lineTo(x, y);
  }
  mcaCtx.stroke();
}

// Right Inspector Tabs
function renderInspector() {
  const container = $("inspectorContent");
  if (!container) return;

  document.querySelectorAll(".sem-tab").forEach(t => {
    t.classList.toggle("active", t.dataset.tab === activeTab);
    t.setAttribute("aria-selected", String(t.dataset.tab === activeTab));
  });

  if (activeTab === "column") {
    const agents = Object.values(snapshot.state?.agents || {});
    container.innerHTML = `
      <div style="background:var(--sem-panel-alt);padding:0.75rem;border-radius:4px;border:1px solid var(--sem-border);">
        <h4 style="color:var(--sem-p31);font-size:0.9rem;margin-bottom:0.5rem;">ELECTRON COLUMN PARAMETERS</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;font-size:0.8rem;">
          <div>ACCEL VOLTAGE: <b style="color:#fff;">15.0 kV</b></div>
          <div>PROBE CURRENT: <b style="color:var(--sem-p31);">1.2 nA</b></div>
          <div>SPECIMEN RUN: <b style="color:#fff;">${snapshot.state?.currentRunId || 'NONE'}</b></div>
          <div>VACUUM CHAMBER: <b style="color:var(--sem-p31);">2.1e-5 Pa</b></div>
        </div>
      </div>

      <div>
        <h4 style="color:var(--sem-cyan);font-size:0.9rem;margin-bottom:0.5rem;">SPECIMEN ROSTER (${agents.length})</h4>
        <div style="display:grid;gap:0.4rem;">
          ${agents.map(ag => `
            <div style="background:#090d12;border:1px solid var(--sem-border);padding:0.5rem;border-radius:3px;font-size:0.8rem;">
              <div style="display:flex;justify-content:space-between;">
                <b style="color:#fff;">SPECIMEN (${ag.role || ag.id})</b>
                <span class="scada-chip green">${ag.status || 'analyzing'}</span>
              </div>
              <div style="color:var(--sem-text-dim);font-size:0.75rem;margin-top:0.2rem;">TASK: ${ag.currentTask || ag.task || 'Microbeam scanning'}</div>
            </div>
          `).join("") || '<div style="color:#64748b;font-size:0.8rem;">No active specimen targets.</div>'}
        </div>
      </div>
    `;
  } else if (activeTab === "traffic") {
    const events = (snapshot.events || []).slice(-30).reverse();
    container.innerHTML = `
      <div style="flex:1;overflow:auto;display:grid;gap:0.4rem;">
        ${events.map(e => `
          <div style="background:#090d12;border:1px solid var(--sem-border);padding:0.5rem;border-radius:3px;font-size:0.8rem;">
            <div style="display:flex;justify-content:space-between;color:var(--sem-p31);">
              <b>${e.agentId || 'SEM'} // ${e.type || 'DETECTOR'}</b>
              <time style="color:#64748b;">${new Date(e.ts || Date.now()).toLocaleTimeString()}</time>
            </div>
            <div style="margin-top:0.25rem;color:#fff;">${e.message || ''}</div>
          </div>
        `).join("") || '<div style="color:#64748b;font-size:0.8rem;text-align:center;">No detector logs recorded.</div>'}
      </div>
    `;
  } else if (activeTab === "evidence") {
    container.innerHTML = `
      <div style="display:flex;gap:0.5rem;">
        <button class="sem-btn" style="flex:1;" onclick="window.__loadDoc('spec')">VIEW SPEC.MD</button>
        <button class="sem-btn" style="flex:1;" onclick="window.__loadDoc('devplan')">VIEW DEVPLAN.MD</button>
      </div>
      <div id="evidencePreviewBox" style="background:#05070a;border:1px solid var(--sem-border);padding:0.75rem;border-radius:4px;font-size:0.8rem;max-height:280px;overflow:auto;">
        <span style="color:#64748b;">Select spectral evidence above to inspect.</span>
      </div>
    `;
  } else if (activeTab === "assist") {
    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <h4 style="color:var(--sem-p31);font-size:0.9rem;">OPTICS AI COPILOT</h4>
        <button class="sem-btn primary" style="padding:2px 8px;font-size:0.75rem;" onclick="window.__newAssistThread()">+ NEW SESSION</button>
      </div>
      <div id="assistThreadList" style="flex:1;overflow:auto;display:flex;flex-direction:column;gap:0.5rem;min-height:180px;background:#05070a;padding:0.5rem;border-radius:3px;border:1px solid var(--sem-border);">
        ${opticsAiThread.map(m => `
          <div style="align-self:${m.role === 'user' ? 'flex-end' : 'flex-start'};max-width:85%;background:${m.role === 'user' ? '#065f46' : '#1e293b'};padding:0.4rem 0.6rem;border-radius:4px;font-size:0.8rem;">
            <b>${m.role.toUpperCase()}:</b> ${m.content}
          </div>
        `).join("") || '<span style="color:#64748b;font-size:0.8rem;text-align:center;">Optics AI ready. Send microbeam prompt below.</span>'}
      </div>
      <form style="display:flex;gap:0.4rem;" onsubmit="window.__sendAssistMessage(event)">
        <input id="assistInput" class="sem-input" style="flex:1;" placeholder="Ask Optics copilot for astigmatism alignment...">
        <button class="sem-btn primary" type="submit">SEND</button>
      </form>
    `;
  }
}

window.__loadDoc = async (type) => {
  const box = $("evidencePreviewBox");
  if (!box) return;
  box.textContent = "Loading spectra document...";
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
    opticsAiThread = [{ role: "assistant", content: "Optics AI Copilot online. Ready to calibrate electron beam." }];
    renderInspector();
  } catch (e) { toast(e.message, "error"); }
};
window.__sendAssistMessage = async (e) => {
  e.preventDefault();
  const input = $("assistInput");
  if (!input || !input.value.trim()) return;
  const msg = input.value.trim();
  opticsAiThread.push({ role: "user", content: msg });
  input.value = "";
  renderInspector();
  opticsAiThread.push({ role: "assistant", content: `Microbeam proposal computed for "${msg}".` });
  renderInspector();
};

// Optics Commands Modal Content
function renderCommandModal() {
  const container = $("commandDialogContent");
  if (!container) return;

  const isBlocked = !!(snapshot.state?.block || snapshot.state?.blocker);
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
      <div style="background:var(--sem-panel-alt);padding:0.75rem;border-radius:4px;border:1px solid var(--sem-border);">
        <h4 style="color:var(--sem-p31);font-size:0.85rem;margin-bottom:0.5rem;">ELECTRON BEAM TRANSPORT</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem;">
          <button class="sem-btn" onclick="client.pause(); window.__toast('Beam scan paused', 'warn')">PAUSE</button>
          <button class="sem-btn" onclick="client.resume(); window.__toast('Beam scan active', 'info')">RESUME</button>
          <button class="sem-btn primary" onclick="client.command('run-now'); window.__toast('Immediate beam tick dispatched', 'info')">SCAN NOW (TICK)</button>
          <button class="sem-btn danger" onclick="client.command('stop'); window.__toast('EMERGENCY BEAM TRIP', 'error')">BEAM TRIP</button>
        </div>
        <div style="margin-top:0.75rem;">
          <label style="font-size:0.8rem;color:var(--sem-text-dim);">10-GEN SHOWCASE SCAN:</label>
          <div style="display:flex;gap:0.5rem;align-items:center;margin-top:0.25rem;">
            <input type="range" id="showcaseGenSlider" min="1" max="10" value="10" style="flex:1;">
            <button class="sem-btn primary" onclick="window.__startShowcase()">START SHOWCASE</button>
          </div>
        </div>
      </div>

      <div style="background:var(--sem-panel-alt);padding:0.75rem;border-radius:4px;border:1px solid var(--sem-border);">
        <h4 style="color:${isBlocked ? 'var(--sem-red)' : 'var(--sem-p31)'};font-size:0.85rem;margin-bottom:0.5rem;">VACUUM INTERLOCK RECOVERY</h4>
        ${isBlocked ? `
          <div style="background:#991b1b;color:#fecaca;padding:0.4rem;border-radius:3px;font-size:0.8rem;margin-bottom:0.5rem;">
            VACUUM FAULT: ${snapshot.state?.block?.reason || 'Chamber interlock tripped'}
          </div>
        ` : '<div style="color:#64748b;font-size:0.8rem;margin-bottom:0.5rem;">Chamber vacuum nominal.</div>'}
        <div style="display:flex;flex-direction:column;gap:0.4rem;">
          <input id="deblockPromptInput" class="sem-input" placeholder="Enter vacuum deblock instructions...">
          <div style="display:flex;gap:0.4rem;">
            <button class="sem-btn warn" style="flex:1;" onclick="window.__submitDeblock()">OVERRIDE DEBLOCK</button>
            <button class="sem-btn" style="flex:1;" onclick="window.__queryAdvice()">QUERY ADVICE</button>
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
  toast(`Showcase scan initiated for ${targetGenerations} generations`, "info");
};
window.__submitDeblock = () => {
  const input = $("deblockPromptInput");
  if (!input || !input.value.trim()) return toast("Enter deblock prompt", "warn");
  client.command("deblock", { prompt: input.value.trim() });
  toast("Deblock command sent to column", "info");
};
window.__queryAdvice = () => {
  client.command("deblock-advice", { prompt: "Analyze chamber fault" });
  toast("Optics advice queried", "info");
};

// Analysis Plans Modal Content
function renderPlanModal() {
  const container = $("planDialogContent");
  if (!container) return;

  const plans = snapshot.plans?.items || [];
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1.5fr;gap:1rem;">
      <div style="background:var(--sem-panel-alt);padding:0.75rem;border-radius:4px;border:1px solid var(--sem-border);display:flex;flex-direction:column;gap:0.5rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h4 style="color:var(--sem-p31);font-size:0.85rem;">ANALYSIS PLANS (${plans.length})</h4>
          <button class="sem-btn primary" style="padding:2px 6px;font-size:0.75rem;" onclick="window.__newPlanDraft()">+ NEW PLAN</button>
        </div>
        <div style="flex:1;overflow:auto;display:grid;gap:0.35rem;max-height:300px;">
          ${plans.map(p => `
            <div style="background:#090d12;border:1px solid var(--sem-border);padding:0.5rem;border-radius:3px;font-size:0.8rem;">
              <div style="display:flex;justify-content:space-between;">
                <b style="color:#fff;">${p.title || p.planId}</b>
                <span class="scada-chip green">${p.status || 'draft'}</span>
              </div>
              <div style="color:#64748b;font-size:0.75rem;margin-top:0.2rem;">${p.pipelineType || 'classic'} • v${p.version || 1}</div>
              <div style="display:flex;gap:0.3rem;margin-top:0.4rem;">
                <button class="sem-btn" style="padding:2px 4px;font-size:0.7rem;" onclick="window.__reviewPlan('${p.planId}', ${p.version || 1})">REVIEW</button>
                <button class="sem-btn primary" style="padding:2px 4px;font-size:0.7rem;" onclick="window.__launchPlan('${p.planId}', ${p.version || 1})">EXECUTE</button>
              </div>
            </div>
          `).join("") || '<div style="color:#64748b;font-size:0.8rem;">No analysis plans registered.</div>'}
        </div>
      </div>

      <div style="background:var(--sem-panel-alt);padding:0.75rem;border-radius:4px;border:1px solid var(--sem-border);">
        <h4 style="color:var(--sem-cyan);font-size:0.85rem;margin-bottom:0.5rem;">ANALYSIS PLAN DRAFT EDITOR</h4>
        <form onsubmit="window.__savePlanDraft(event)">
          <div class="sem-field"><label>Plan Title</label><input id="planTitleInput" class="sem-input" value="${activePlanDraft.title}" required></div>
          <div class="sem-field"><label>Problem Statement</label><input id="planProblemInput" class="sem-input" value="${activePlanDraft.problem}" required></div>
          <div class="sem-field"><label>Target Users</label><input id="planUsersInput" class="sem-input" value="${activePlanDraft.users}" required></div>
          <div class="sem-field"><label>Key Objectives</label><textarea id="planObjectivesInput" class="sem-textarea" required>${activePlanDraft.objectives}</textarea></div>
          <button class="sem-btn primary" style="width:100%;margin-top:0.5rem;" type="submit">SAVE ANALYSIS PLAN</button>
        </form>
      </div>
    </div>
  `;
}

window.__newPlanDraft = () => {
  activePlanDraft = { title: "EDX Microbeam Quantitative Assay", problem: "High-resolution elemental peak quantification", users: "microscopists", objectives: "Maintain 15kV electron probe focus", scope: "Beam column", repoPath: "/home/mojo/projects/hermesswarmbuilder/hermesswarmbuilder", baseRef: "HEAD" };
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
    toast("Analysis plan saved to SEM database", "info");
    await client.refreshPlans();
    renderPlanModal();
  } catch (err) { toast(err.message, "error"); }
};
window.__reviewPlan = async (planId, version) => {
  try {
    await client.submitProjectPlanForReview(planId, version);
    await client.approveProjectPlan(planId, version);
    toast(`Plan ${planId} approved by laboratory director!`, "info");
    await client.refreshPlans();
    renderPlanModal();
  } catch (err) { toast(err.message, "error"); }
};
window.__launchPlan = async (planId, version) => {
  try {
    await client.launchProjectPlan(planId, version);
    toast(`Plan ${planId} executed on SEM electron column!`, "info");
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
document.querySelectorAll(".sem-tab").forEach(t => {
  t.addEventListener("click", () => {
    activeTab = t.dataset.tab;
    renderInspector();
  });
});

$("btnRasterScan")?.addEventListener("click", async () => {
  try { await client.command("run-now"); toast("RASTER SCAN tick initiated", "info"); } catch (e) { toast(e.message, "error"); }
});

$("btnRefresh")?.addEventListener("click", () => {
  client.refresh();
  toast("Electron beam resynchronized", "info");
});

// Client Subscription
client.subscribe((snap) => {
  snapshot = snap;
  const isBlocked = !!(snap.state?.block || snap.state?.blocker);
  const phase = snap.state?.phase || "idle";

  const runEl = $("semRunId");
  if (runEl) runEl.textContent = snap.state?.currentRunId || "NONE";

  const phaseEl = $("semPhase");
  if (phaseEl) {
    phaseEl.textContent = phase.toUpperCase();
    phaseEl.style.color = isBlocked ? "var(--sem-red)" : "var(--sem-p31)";
  }

  renderInspector();
});

client.connect();
client.refresh();
resizeCanvases();
renderInspector();

function loop() {
  drawCrt();
  drawMca();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
