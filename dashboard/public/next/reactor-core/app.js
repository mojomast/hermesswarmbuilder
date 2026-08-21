import { createDashboardClient, WORKFLOW_PHASES, OPERATION_COMMANDS, PROJECT_PLAN_ACTIONS } from "../../headless-dashboard-client.js";
import m from "../../vendor/mithril.js";

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
  const el = $("rcToast");
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  el.style.background = type === "error" ? "#7f1d1d" : type === "warn" ? "#78350f" : "#0369a1";
  el.style.border = `1px solid ${type === "error" ? "#ef4444" : type === "warn" ? "#f59e0b" : "#00e5ff"}`;
  setTimeout(() => { el.style.display = "none"; }, 3500);
}

// Generate 61-Element Hexagonal Core Grid
function renderHexCore() {
  const svg = $("hexCoreSvg");
  if (!svg) return;

  const hexRadius = 24;
  const hexWidth = hexRadius * Math.sqrt(3);
  const hexHeight = hexRadius * 2;
  const cx = 300;
  const cy = 270;

  // Hexagon rings: Ring 0 (1), Ring 1 (6), Ring 2 (12), Ring 3 (18), Ring 4 (24) = 61 total
  let hexElements = [];
  const ringCounts = [1, 6, 12, 18, 24];

  let idCounter = 1;
  const isBlocked = !!(snapshot.state?.block || snapshot.state?.blocker || snapshot.state?.hold);

  // Center hex
  hexElements.push({ id: `FA-01`, x: cx, y: cy, flux: isBlocked ? 0.2 : 0.95 });

  // Rings 1 to 4
  for (let ring = 1; ring <= 4; ring++) {
    for (let i = 0; i < ring * 6; i++) {
      idCounter++;
      const angle = (i * 60 / ring) * (Math.PI / 180);
      const dist = ring * (hexHeight * 0.78);
      const x = cx + dist * Math.cos(angle);
      const y = cy + dist * Math.sin(angle);
      hexElements.push({
        id: `FA-${String(idCounter).padStart(2, '0')}`,
        x, y,
        flux: Math.max(0.1, 1.0 - (ring * 0.18) + (Math.sin(idCounter) * 0.1))
      });
    }
  }

  // Draw SVG Hexagons
  svg.innerHTML = `
    <defs>
      <polygon id="hexShape" points="0,-22 19,-11 19,11 0,22 -19,11 -19,-11" />
    </defs>
    <!-- Core Boundary Ring -->
    <circle cx="${cx}" cy="${cy}" r="220" fill="none" stroke="#1e293b" stroke-width="3" stroke-dasharray="6,4" />

    ${hexElements.map(h => {
      const color = isBlocked ? "#ef4444" : h.flux > 0.8 ? "#00e5ff" : h.flux > 0.5 ? "#10b981" : "#f59e0b";
      return `
        <g transform="translate(${h.x}, ${h.y})" style="cursor:pointer;" onclick="window.__selectFuelElement('${h.id}')">
          <use href="#hexShape" fill="#0d141e" stroke="${color}" stroke-width="1.5" />
          <text text-anchor="middle" dy="4" fill="${color}" font-family="JetBrains Mono" font-size="8.5" font-weight="bold">${h.id}</text>
        </g>
      `;
    }).join("")}
  `;
}

window.__selectFuelElement = (id) => {
  toast(`Fuel Assembly ${id} telemetry interrogated`, "info");
};

// Emergency SCRAM
$("btnManualScram")?.addEventListener("click", async () => {
  try {
    await client.command("stop");
    toast("EMERGENCY REACTOR SCRAM: All control rod banks dropped", "error");
  } catch (e) { toast(e.message, "error"); }
});

$("btnDeblockCore")?.addEventListener("click", async () => {
  const prompt = window.prompt("Enter reactor core deblock directive:");
  if (!prompt) return;
  try {
    await client.command("deblock", { prompt });
    toast("Core reactivity interlock deblocked", "info");
  } catch (e) { toast(e.message, "error"); }
});

$("btnAdviceCore")?.addEventListener("click", async () => {
  try {
    await client.command("deblock-advice", { prompt: "Analyze core reactivity trip" });
    toast("Nuclear safety copilot advice requested", "info");
  } catch (e) { toast(e.message, "error"); }
});

$("btnBoration")?.addEventListener("click", async () => {
  try {
    await client.command("steer", { directive: "Adjust CVCS boron trim for stability", scope: "current" });
    toast("CVCS Boron reactivity trim injected", "info");
  } catch (e) { toast(e.message, "error"); }
});

$("btnResyncCore")?.addEventListener("click", () => {
  client.refresh();
  toast("Reactor Protection System (RPS) resynchronized", "info");
});

// Core Fuel Load Plans
$("btnNewFuelPlan")?.addEventListener("click", async () => {
  const title = window.prompt("Fuel Load Plan Title:");
  if (!title) return;
  try {
    await client.createProjectPlan({
      title,
      problem: "Nuclear core reload pattern",
      users: "reactor-operators",
      objectives: "Verify 61-element hexagonal core flux and SCRAM",
      scope: "Reactor vessel",
      repoPath: "/home/mojo/projects/hermesswarmbuilder/hermesswarmbuilder",
      baseRef: "HEAD"
    });
    toast("Fuel load plan registered", "info");
    await client.refreshPlans();
  } catch (e) { toast(e.message, "error"); }
});

function renderPlans(snap) {
  const list = $("fuelPlansList");
  if (!list) return;
  const plans = snap.plans?.items || [];
  list.innerHTML = plans.map(p => `
    <div style="background:#090d12;border:1px solid var(--rc-border);padding:5px;border-radius:2px;font-size:9.5px;">
      <div style="display:flex;justify-content:space-between;">
        <b style="color:#fff;">${p.title || p.planId}</b>
        <span style="color:var(--rc-flux-green);">${p.status || 'draft'}</span>
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

  const phaseEl = $("rcPhase");
  if (phaseEl) {
    phaseEl.textContent = phase.toUpperCase();
    phaseEl.style.color = isBlocked ? "var(--rc-flux-red)" : "var(--rc-flux-green)";
  }

  const tripEl = $("rpsTripStatus");
  if (tripEl) {
    tripEl.textContent = isBlocked ? "SCRAM / TRIPPED" : "ARMED / NORMAL";
    tripEl.style.color = isBlocked ? "var(--rc-flux-red)" : "var(--rc-flux-green)";
  }

  renderHexCore();
  renderPlans(snap);
});

client.connect();
client.refresh();
renderHexCore();
