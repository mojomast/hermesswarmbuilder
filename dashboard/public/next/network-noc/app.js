import { createDashboardClient, WORKFLOW_PHASES, OPERATION_COMMANDS, PROJECT_PLAN_ACTIONS } from "../../headless-dashboard-client.js";
import * as d3 from "../../vendor/d3.js";

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

function toast(msg, type = "info") {
  const el = $("nocToast");
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  el.style.background = type === "error" ? "#7f1d1d" : type === "warn" ? "#78350f" : "#064e3b";
  el.style.border = `1px solid ${type === "error" ? "#ef4444" : type === "warn" ? "#f59e0b" : "#10b981"}`;
  setTimeout(() => { el.style.display = "none"; }, 3500);
}

// D3 Force Graph Topology
const nodes = [
  { id: "AS65001", name: "AS65001 (ORCHESTRATOR)", group: "core", x: 200, y: 150 },
  { id: "AS65002", name: "AS65002 (LEAD ARCHITECT)", group: "peer", x: 350, y: 100 },
  { id: "AS65003", name: "AS65003 (CODE GENERATOR)", group: "peer", x: 350, y: 220 },
  { id: "AS65004", name: "AS65004 (QA EVALUATOR)", group: "peer", x: 500, y: 150 },
  { id: "AS65005", name: "AS65005 (DEBLOCK RELAY)", group: "relay", x: 200, y: 280 },
  { id: "AS65006", name: "AS65006 (SHOWCASE LOOP)", group: "transit", x: 500, y: 280 }
];

const links = [
  { source: "AS65001", target: "AS65002", load: "78%" },
  { source: "AS65001", target: "AS65003", load: "92%" },
  { source: "AS65002", target: "AS65004", load: "45%" },
  { source: "AS65003", target: "AS65004", load: "85%" },
  { source: "AS65001", target: "AS65005", load: "12%" },
  { source: "AS65004", target: "AS65006", load: "30%" }
];

function initD3Topology() {
  const svg = d3.select("#nocTopologySvg");
  if (svg.empty()) return;

  const rect = svg.node().parentElement.getBoundingClientRect();
  svg.attr("viewBox", `0 0 ${rect.width || 700} ${rect.height || 450}`);

  const g = svg.append("g");

  // Links
  const link = g.append("g")
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("stroke", "#1e293b")
    .attr("stroke-width", 3)
    .attr("stroke-dasharray", "4,2");

  // Nodes
  const node = g.append("g")
    .selectAll("g")
    .data(nodes)
    .join("g")
    .attr("cursor", "pointer")
    .on("click", (e, d) => toast(`Selected ASN node: ${d.name}`, "info"));

  node.append("circle")
    .attr("r", 18)
    .attr("fill", d => d.group === "core" ? "#0369a1" : d.group === "relay" ? "#78350f" : "#0f172a")
    .attr("stroke", d => d.group === "core" ? "#00f0ff" : d.group === "relay" ? "#f59e0b" : "#10b981")
    .attr("stroke-width", 2);

  node.append("text")
    .attr("dy", 4)
    .attr("text-anchor", "middle")
    .attr("fill", "#fff")
    .attr("font-family", "JetBrains Mono")
    .attr("font-size", 9)
    .attr("font-weight", "bold")
    .text(d => d.id.slice(2));

  node.append("text")
    .attr("dy", 30)
    .attr("text-anchor", "middle")
    .attr("fill", "#94a3b8")
    .attr("font-size", 8.5)
    .text(d => d.name);

  // Force simulation
  const simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id(d => d.id).distance(140))
    .force("charge", d3.forceManyBody().strength(-300))
    .force("center", d3.forceCenter((rect.width || 700) / 2, (rect.height || 450) / 2))
    .on("tick", () => {
      link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

      node.attr("transform", d => `translate(${d.x},${d.y})`);
    });
}

// Render DWDM 16-Lambda Matrix
function renderDwdmMatrix() {
  const strip = $("dwdmStrip");
  if (!strip) return;

  const lambdas = Array.from({ length: 16 }, (_, i) => ({
    id: `λ${i + 1}`,
    nm: (1530 + i * 0.8).toFixed(1),
    active: i < 6,
    power: (-3.2 - Math.random() * 2).toFixed(1)
  }));

  strip.innerHTML = lambdas.map(l => `
    <div class="noc-lambda-cell ${l.active ? 'active' : ''}">
      <b style="color:${l.active ? '#00f0ff' : '#64748b'};">${l.id}</b>
      <span style="color:#94a3b8;">${l.nm}nm</span>
      <span style="color:${l.active ? '#10b981' : '#475569'};">${l.power}dB</span>
    </div>
  `).join("");
}

// X.733 Alarm Triage Wall
function updateAlarmTable(snap) {
  const isBlocked = !!(snap.state?.block || snap.state?.blocker || snap.state?.hold);
  const tbody = $("alarmTableBody");
  if (!tbody) return;

  if (isBlocked) {
    tbody.innerHTML = `
      <tr style="background:#33070b;color:#f87171;">
        <td><b style="color:#ef4444;">CRIT</b></td>
        <td>AS65003 (CODER)</td>
        <td>BGP FLAP: Swarm Execution Blocked</td>
        <td><button class="noc-btn" style="background:#7f1d1d;padding:2px 4px;font-size:8.5px;" onclick="window.__nocDeblock()">DEBLOCK</button></td>
      </tr>
    `;
  } else {
    tbody.innerHTML = `
      <tr>
        <td><span style="color:#10b981;">NORM</span></td>
        <td>AS65001 (CORE)</td>
        <td>BGP Session Established (100% SLA)</td>
        <td><span style="color:#64748b;">NONE</span></td>
      </tr>
    `;
  }
}

window.__nocDeblock = async () => {
  const prompt = window.prompt("Enter BGP route flap isolation & deblock directive:");
  if (!prompt) return;
  try {
    await client.command("deblock", { prompt });
    toast("BGP route flap deblocked", "info");
  } catch (e) { toast(e.message, "error"); }
};

// NOC Toolbar Handlers
$("btnResyncNoc")?.addEventListener("click", () => {
  client.refresh();
  toast("BGP Routing Information Base (RIB) Resynced", "info");
});

$("btnCutoverNoc")?.addEventListener("click", async () => {
  try {
    await client.command("stop");
    toast("BGP SESSION WITHDRAWAL: Backbone halted", "error");
  } catch (e) { toast(e.message, "error"); }
});

$("btnDeblockNoc")?.addEventListener("click", () => window.__nocDeblock());

// Maintenance Window Plans
$("btnNewMaintPlan")?.addEventListener("click", async () => {
  const title = window.prompt("Maintenance Window Plan Title:");
  if (!title) return;
  try {
    await client.createProjectPlan({
      title,
      problem: "Tier-1 BGP mesh routing",
      users: "noc-controllers",
      objectives: "Verify D3 force network topology and optical DWDM matrix",
      scope: "Global backbone",
      repoPath: "/home/mojo/projects/hermesswarmbuilder/hermesswarmbuilder",
      baseRef: "HEAD"
    });
    toast("Maintenance plan registered", "info");
    await client.refreshPlans();
  } catch (e) { toast(e.message, "error"); }
});

function renderPlans(snap) {
  const list = $("maintPlansList");
  if (!list) return;
  const plans = snap.plans?.items || [];
  list.innerHTML = plans.map(p => `
    <div style="background:#090d12;border:1px solid var(--noc-border);padding:5px;border-radius:2px;font-size:9.5px;">
      <div style="display:flex;justify-content:space-between;">
        <b style="color:#fff;">${p.title || p.planId}</b>
        <span style="color:var(--noc-green);">${p.status || 'draft'}</span>
      </div>
      <small style="color:#64748b;">${p.pipelineType || 'classic'} • v${p.version || 1}</small>
    </div>
  `).join("");
}

// Client Subscription
client.subscribe((snap) => {
  snapshot = snap;
  const phase = snap.state?.phase || "idle";

  const runEl = $("nocActiveRun");
  if (runEl) runEl.textContent = snap.state?.currentRunId || "NONE";
  const phaseEl = $("nocPhase");
  if (phaseEl) phaseEl.textContent = phase.toUpperCase();

  updateAlarmTable(snap);
  renderPlans(snap);
});

client.connect();
client.refresh();
renderDwdmMatrix();
setTimeout(initD3Topology, 50);
