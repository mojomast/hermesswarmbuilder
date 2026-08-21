import { createDashboardClient, WORKFLOW_PHASES, OPERATION_COMMANDS, PROJECT_PLAN_ACTIONS } from "../../headless-dashboard-client.js";
import * as d3 from "../../vendor/d3.js";

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
let activeTab = "bgp";
let activePlanDraft = { title: "", problem: "", users: "", objectives: "", scope: "", repoPath: "/home/mojo/projects/hermesswarmbuilder/hermesswarmbuilder", baseRef: "HEAD" };
let nocAiThread = [];

function toast(msg, type = "info") {
  const el = $("nocToast");
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  el.style.background = type === "error" ? "#991b1b" : type === "warn" ? "#92400e" : "#0369a1";
  el.style.border = `1px solid ${type === "error" ? "#ef4444" : type === "warn" ? "#f59e0b" : "#00f0ff"}`;
  el.style.color = "#fff";
  setTimeout(() => { el.style.display = "none"; }, 3500);
}

// Render D3 BGP Topology Mesh
function renderD3Mesh() {
  const svg = d3.select("#nocTopologySvg");
  if (svg.empty()) return;

  const rect = svg.node().parentElement.getBoundingClientRect();
  const width = rect.width || 600;
  const height = rect.height || 300;

  svg.attr("viewBox", [0, 0, width, height]);
  svg.selectAll("*").remove();

  const isBlocked = !!(snapshot.state?.block || snapshot.state?.blocker);
  const nodes = [
    { id: "AS65001", name: "TIER-1 CORE", role: "ARCHITECT", x: width * 0.5, y: height * 0.5 },
    { id: "AS65002", name: "PEER NORTH", role: "CODER", x: width * 0.25, y: height * 0.3 },
    { id: "AS65003", name: "PEER SOUTH", role: "TESTER", x: width * 0.75, y: height * 0.3 },
    { id: "AS65004", name: "IXP WEST", role: "REVIEWER", x: width * 0.25, y: height * 0.7 },
    { id: "AS65005", name: "IXP EAST", role: "SHOWCASE", x: width * 0.75, y: height * 0.7 }
  ];

  const links = [
    { source: "AS65001", target: "AS65002" },
    { source: "AS65001", target: "AS65003" },
    { source: "AS65001", target: "AS65004" },
    { source: "AS65001", target: "AS65005" },
    { source: "AS65002", target: "AS65004" },
    { source: "AS65003", target: "AS65005" }
  ];

  // Draw links
  svg.append("g")
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("x1", d => nodes.find(n => n.id === d.source).x)
    .attr("y1", d => nodes.find(n => n.id === d.source).y)
    .attr("x2", d => nodes.find(n => n.id === d.target).x)
    .attr("y2", d => nodes.find(n => n.id === d.target).y)
    .attr("stroke", isBlocked ? "#ef4444" : "#00f0ff")
    .attr("stroke-width", 2)
    .attr("stroke-opacity", 0.6);

  // Draw nodes
  const nodeG = svg.append("g")
    .selectAll("g")
    .data(nodes)
    .join("g")
    .attr("transform", d => `translate(${d.x},${d.y})`);

  nodeG.append("circle")
    .attr("r", 18)
    .attr("fill", "#090d12")
    .attr("stroke", isBlocked ? "#ef4444" : "#10b981")
    .attr("stroke-width", 3);

  nodeG.append("text")
    .attr("dy", 4)
    .attr("text-anchor", "middle")
    .attr("fill", "#fff")
    .attr("font-size", 10)
    .attr("font-family", "JetBrains Mono")
    .attr("font-weight", "bold")
    .text(d => d.id.slice(-3));

  nodeG.append("text")
    .attr("dy", 32)
    .attr("text-anchor", "middle")
    .attr("fill", "#94a3b8")
    .attr("font-size", 10)
    .text(d => d.name);
}

// Render DWDM 16-Lambda Matrix
function renderDwdmMatrix() {
  const grid = $("dwdmGrid");
  if (!grid) return;

  const isBlocked = !!(snapshot.state?.block || snapshot.state?.blocker);
  const lambdas = Array.from({ length: 16 }, (_, i) => ({
    lambda: `λ${i + 1}`,
    nm: (1530 + i * 0.8).toFixed(1),
    dbm: (-2.1 - (i % 4) * 0.6).toFixed(1),
    fault: isBlocked && i === 4
  }));

  grid.innerHTML = lambdas.map(l => `
    <div class="noc-lambda-cell ${l.fault ? 'fault' : 'active'}">
      <div style="display:flex;justify-content:space-between;color:var(--noc-cyan);font-weight:bold;">
        <span>${l.lambda}</span>
        <span style="color:#64748b;">${l.nm}nm</span>
      </div>
      <div style="color:${l.fault ? 'var(--noc-red)' : 'var(--noc-green)'};font-weight:bold;margin-top:2px;">
        ${l.fault ? 'BER TRIP' : `${l.dbm} dBm`}
      </div>
    </div>
  `).join("");
}

// Right Inspector Tabs
function renderInspector() {
  const container = $("inspectorContent");
  if (!container) return;

  document.querySelectorAll(".noc-tab").forEach(t => {
    t.classList.toggle("active", t.dataset.tab === activeTab);
    t.setAttribute("aria-selected", String(t.dataset.tab === activeTab));
  });

  if (activeTab === "bgp") {
    const agents = Object.values(snapshot.state?.agents || {});
    container.innerHTML = `
      <div style="background:var(--noc-panel-alt);padding:0.75rem;border-radius:4px;border:1px solid var(--noc-border);">
        <h4 style="color:var(--noc-cyan);font-size:0.9rem;margin-bottom:0.5rem;">TIER-1 BACKBONE TELEMETRY</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;font-size:0.8rem;">
          <div>ACTIVE RUN: <b style="color:#fff;">${snapshot.state?.currentRunId || 'NONE'}</b></div>
          <div>BGP STATE: <b style="color:var(--noc-green);">${(snapshot.state?.phase || 'IDLE').toUpperCase()}</b></div>
          <div>PEER SESSIONS: <b style="color:#fff;">${agents.length} ESTABLISHED</b></div>
          <div>BACKBONE LOAD: <b style="color:var(--noc-cyan);">4.2 Tbps</b></div>
        </div>
      </div>

      <div>
        <h4 style="color:var(--noc-green);font-size:0.9rem;margin-bottom:0.5rem;">BGP NEIGHBOR ROSTER (${agents.length})</h4>
        <div style="display:grid;gap:0.4rem;">
          ${agents.map(ag => `
            <div style="background:#090d12;border:1px solid var(--noc-border);padding:0.5rem;border-radius:3px;font-size:0.8rem;">
              <div style="display:flex;justify-content:space-between;">
                <b style="color:#fff;">AS (${ag.role || ag.id})</b>
                <span class="scada-chip green">${ag.status || 'established'}</span>
              </div>
              <div style="color:var(--noc-text-dim);font-size:0.75rem;margin-top:0.2rem;">ROUTES: ${ag.currentTask || ag.task || 'Full internet routing'}</div>
            </div>
          `).join("") || '<div style="color:#64748b;font-size:0.8rem;">No active BGP peers connected.</div>'}
        </div>
      </div>
    `;
  } else if (activeTab === "traffic") {
    const events = (snapshot.events || []).slice(-30).reverse();
    container.innerHTML = `
      <div style="flex:1;overflow:auto;display:grid;gap:0.4rem;">
        ${events.map(e => `
          <div style="background:#090d12;border:1px solid var(--noc-border);padding:0.5rem;border-radius:3px;font-size:0.8rem;">
            <div style="display:flex;justify-content:space-between;color:var(--noc-cyan);">
              <b>${e.agentId || 'NOC'} // ${e.type || 'PACKET'}</b>
              <time style="color:#64748b;">${new Date(e.ts || Date.now()).toLocaleTimeString()}</time>
            </div>
            <div style="margin-top:0.25rem;color:#fff;">${e.message || ''}</div>
          </div>
        `).join("") || '<div style="color:#64748b;font-size:0.8rem;text-align:center;">No packet tap events recorded.</div>'}
      </div>
    `;
  } else if (activeTab === "evidence") {
    container.innerHTML = `
      <div style="display:flex;gap:0.5rem;">
        <button class="noc-btn" style="flex:1;" onclick="window.__loadDoc('spec')">VIEW SPEC.MD</button>
        <button class="noc-btn" style="flex:1;" onclick="window.__loadDoc('devplan')">VIEW DEVPLAN.MD</button>
      </div>
      <div id="evidencePreviewBox" style="background:#05070a;border:1px solid var(--noc-border);padding:0.75rem;border-radius:4px;font-size:0.8rem;max-height:280px;overflow:auto;">
        <span style="color:#64748b;">Select peering evidence above to inspect.</span>
      </div>
    `;
  } else if (activeTab === "assist") {
    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <h4 style="color:var(--noc-cyan);font-size:0.9rem;">NOC ROUTE OPTIMIZATION AI</h4>
        <button class="noc-btn primary" style="padding:2px 8px;font-size:0.75rem;" onclick="window.__newAssistThread()">+ NEW SESSION</button>
      </div>
      <div id="assistThreadList" style="flex:1;overflow:auto;display:flex;flex-direction:column;gap:0.5rem;min-height:180px;background:#05070a;padding:0.5rem;border-radius:3px;border:1px solid var(--noc-border);">
        ${nocAiThread.map(m => `
          <div style="align-self:${m.role === 'user' ? 'flex-end' : 'flex-start'};max-width:85%;background:${m.role === 'user' ? '#0369a1' : '#1e293b'};padding:0.4rem 0.6rem;border-radius:4px;font-size:0.8rem;">
            <b>${m.role.toUpperCase()}:</b> ${m.content}
          </div>
        `).join("") || '<span style="color:#64748b;font-size:0.8rem;text-align:center;">NOC AI ready. Send routing optimization prompt below.</span>'}
      </div>
      <form style="display:flex;gap:0.4rem;" onsubmit="window.__sendAssistMessage(event)">
        <input id="assistInput" class="noc-input" style="flex:1;" placeholder="Ask NOC copilot for BGP path damping adjustments...">
        <button class="noc-btn primary" type="submit">SEND</button>
      </form>
    `;
  }
}

window.__loadDoc = async (type) => {
  const box = $("evidencePreviewBox");
  if (!box) return;
  box.textContent = "Loading peering document...";
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
    nocAiThread = [{ role: "assistant", content: "NOC Route AI online. Ready to optimize backbone traffic engineering." }];
    renderInspector();
  } catch (e) { toast(e.message, "error"); }
};
window.__sendAssistMessage = async (e) => {
  e.preventDefault();
  const input = $("assistInput");
  if (!input || !input.value.trim()) return;
  const msg = input.value.trim();
  nocAiThread.push({ role: "user", content: msg });
  input.value = "";
  renderInspector();
  nocAiThread.push({ role: "assistant", content: `BGP traffic proposal generated for "${msg}".` });
  renderInspector();
};

// Route Actions Modal Content
function renderCommandModal() {
  const container = $("commandDialogContent");
  if (!container) return;

  const isBlocked = !!(snapshot.state?.block || snapshot.state?.blocker);
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
      <div style="background:var(--noc-panel-alt);padding:0.75rem;border-radius:4px;border:1px solid var(--noc-border);">
        <h4 style="color:var(--noc-cyan);font-size:0.85rem;margin-bottom:0.5rem;">NOC ROUTE TRANSPORT</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem;">
          <button class="noc-btn" onclick="client.pause(); window.__toast('BGP propagation paused', 'warn')">PAUSE</button>
          <button class="noc-btn" onclick="client.resume(); window.__toast('BGP propagation active', 'info')">RESUME</button>
          <button class="noc-btn primary" onclick="client.command('run-now'); window.__toast('Immediate route tick dispatched', 'info')">PROPAGATE (TICK)</button>
          <button class="noc-btn danger" onclick="client.command('stop'); window.__toast('EMERGENCY BGP CUTOUT', 'error')">EMERGENCY CUT</button>
        </div>
        <div style="margin-top:0.75rem;">
          <label style="font-size:0.8rem;color:var(--noc-text-dim);">10-GEN SHOWCASE TRACE:</label>
          <div style="display:flex;gap:0.5rem;align-items:center;margin-top:0.25rem;">
            <input type="range" id="showcaseGenSlider" min="1" max="10" value="10" style="flex:1;">
            <button class="noc-btn primary" onclick="window.__startShowcase()">START SHOWCASE</button>
          </div>
        </div>
      </div>

      <div style="background:var(--noc-panel-alt);padding:0.75rem;border-radius:4px;border:1px solid var(--noc-border);">
        <h4 style="color:${isBlocked ? 'var(--noc-red)' : 'var(--noc-green)'};font-size:0.85rem;margin-bottom:0.5rem;">ROUTE FLAP RECOVERY</h4>
        ${isBlocked ? `
          <div style="background:#991b1b;color:#fecaca;padding:0.4rem;border-radius:3px;font-size:0.8rem;margin-bottom:0.5rem;">
            BGP HOLDDOWN: ${snapshot.state?.block?.reason || 'Route flap detected'}
          </div>
        ` : '<div style="color:#64748b;font-size:0.8rem;margin-bottom:0.5rem;">Backbone routing converged.</div>'}
        <div style="display:flex;flex-direction:column;gap:0.4rem;">
          <input id="deblockPromptInput" class="noc-input" placeholder="Enter BGP deblock instructions...">
          <div style="display:flex;gap:0.4rem;">
            <button class="noc-btn warn" style="flex:1;" onclick="window.__submitDeblock()">OVERRIDE DEBLOCK</button>
            <button class="noc-btn" style="flex:1;" onclick="window.__queryAdvice()">QUERY ADVICE</button>
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
  toast(`Showcase route trace initiated for ${targetGenerations} generations`, "info");
};
window.__submitDeblock = () => {
  const input = $("deblockPromptInput");
  if (!input || !input.value.trim()) return toast("Enter deblock prompt", "warn");
  client.command("deblock", { prompt: input.value.trim() });
  toast("Deblock route injected into BGP mesh", "info");
};
window.__queryAdvice = () => {
  client.command("deblock-advice", { prompt: "Analyze route flap" });
  toast("NOC advice queried", "info");
};

// Peering Plans Modal Content
function renderPlanModal() {
  const container = $("planDialogContent");
  if (!container) return;

  const plans = snapshot.plans?.items || [];
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1.5fr;gap:1rem;">
      <div style="background:var(--noc-panel-alt);padding:0.75rem;border-radius:4px;border:1px solid var(--noc-border);display:flex;flex-direction:column;gap:0.5rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h4 style="color:var(--noc-cyan);font-size:0.85rem;">PEERING PLANS (${plans.length})</h4>
          <button class="noc-btn primary" style="padding:2px 6px;font-size:0.75rem;" onclick="window.__newPlanDraft()">+ NEW PLAN</button>
        </div>
        <div style="flex:1;overflow:auto;display:grid;gap:0.35rem;max-height:300px;">
          ${plans.map(p => `
            <div style="background:#090d12;border:1px solid var(--noc-border);padding:0.5rem;border-radius:3px;font-size:0.8rem;">
              <div style="display:flex;justify-content:space-between;">
                <b style="color:#fff;">${p.title || p.planId}</b>
                <span class="scada-chip green">${p.status || 'draft'}</span>
              </div>
              <div style="color:#64748b;font-size:0.75rem;margin-top:0.2rem;">${p.pipelineType || 'classic'} • v${p.version || 1}</div>
              <div style="display:flex;gap:0.3rem;margin-top:0.4rem;">
                <button class="noc-btn" style="padding:2px 4px;font-size:0.7rem;" onclick="window.__reviewPlan('${p.planId}', ${p.version || 1})">REVIEW</button>
                <button class="noc-btn primary" style="padding:2px 4px;font-size:0.7rem;" onclick="window.__launchPlan('${p.planId}', ${p.version || 1})">ADVERTISE</button>
              </div>
            </div>
          `).join("") || '<div style="color:#64748b;font-size:0.8rem;">No peering plans registered.</div>'}
        </div>
      </div>

      <div style="background:var(--noc-panel-alt);padding:0.75rem;border-radius:4px;border:1px solid var(--noc-border);">
        <h4 style="color:var(--noc-green);font-size:0.85rem;margin-bottom:0.5rem;">PEERING PLAN DRAFT EDITOR</h4>
        <form onsubmit="window.__savePlanDraft(event)">
          <div class="noc-field"><label>Peering Plan Title</label><input id="planTitleInput" class="noc-input" value="${activePlanDraft.title}" required></div>
          <div class="noc-field"><label>Problem Statement</label><input id="planProblemInput" class="noc-input" value="${activePlanDraft.problem}" required></div>
          <div class="noc-field"><label>Target Users</label><input id="planUsersInput" class="noc-input" value="${activePlanDraft.users}" required></div>
          <div class="noc-field"><label>Key Objectives</label><textarea id="planObjectivesInput" class="noc-textarea" required>${activePlanDraft.objectives}</textarea></div>
          <button class="noc-btn primary" style="width:100%;margin-top:0.5rem;" type="submit">SAVE PEERING PLAN DRAFT</button>
        </form>
      </div>
    </div>
  `;
}

window.__newPlanDraft = () => {
  activePlanDraft = { title: "Tier-1 BGP Traffic Engineering", problem: "Optimum multi-homed transit route selection", users: "noc-controllers", objectives: "Ensure 99.999% backbone availability", scope: "Backbone mesh", repoPath: "/home/mojo/projects/hermesswarmbuilder/hermesswarmbuilder", baseRef: "HEAD" };
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
    toast("Peering plan saved to NOC database", "info");
    await client.refreshPlans();
    renderPlanModal();
  } catch (err) { toast(err.message, "error"); }
};
window.__reviewPlan = async (planId, version) => {
  try {
    await client.submitProjectPlanForReview(planId, version);
    await client.approveProjectPlan(planId, version);
    toast(`Plan ${planId} approved by NOC supervisor!`, "info");
    await client.refreshPlans();
    renderPlanModal();
  } catch (err) { toast(err.message, "error"); }
};
window.__launchPlan = async (planId, version) => {
  try {
    await client.launchProjectPlan(planId, version);
    toast(`Plan ${planId} advertised to backbone!`, "info");
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
document.querySelectorAll(".noc-tab").forEach(t => {
  t.addEventListener("click", () => {
    activeTab = t.dataset.tab;
    renderInspector();
  });
});

$("btnRefresh")?.addEventListener("click", () => {
  client.refresh();
  toast("BGP routing tables resynchronized", "info");
});

// Client Subscription
client.subscribe((snap) => {
  snapshot = snap;
  const isBlocked = !!(snap.state?.block || snap.state?.blocker);
  const phase = snap.state?.phase || "idle";

  const runEl = $("nocRunId");
  if (runEl) runEl.textContent = snap.state?.currentRunId || "NONE";

  const phaseEl = $("nocPhase");
  if (phaseEl) {
    phaseEl.textContent = phase.toUpperCase();
    phaseEl.style.color = isBlocked ? "var(--noc-red)" : "var(--noc-cyan)";
  }

  renderD3Mesh();
  renderDwdmMatrix();
  renderInspector();
});

client.connect();
client.refresh();
renderD3Mesh();
renderDwdmMatrix();
renderInspector();
