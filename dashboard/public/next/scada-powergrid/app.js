import { createDashboardClient, WORKFLOW_PHASES, OPERATION_COMMANDS, PROJECT_PLAN_ACTIONS } from "../../headless-dashboard-client.js";
import { html, render } from "../../vendor/lit.js";

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
let activeTab = "bays";
let pendingSboAction = null;
let selectedBay = "BAY_GEN1";

function toast(msg, type = "info") {
  const el = $("scadaToast");
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  el.style.background = type === "error" ? "#7f1d1d" : type === "warn" ? "#78350f" : "#064e3b";
  el.style.border = `1px solid ${type === "error" ? "#ef4444" : type === "warn" ? "#f59e0b" : "#10b981"}`;
  setTimeout(() => { el.style.display = "none"; }, 3500);
}

// Substation Equipment Models
const BAYS = [
  { id: "BAY_GEN1", name: "BAY 1: LEAD ARCHITECT (IN-FEED)", bus: "500kV", status: "closed", mw: 180 },
  { id: "BAY_FEED2", name: "BAY 2: CODE GENERATOR (LOAD)", bus: "500kV", status: "closed", mw: 140 },
  { id: "BAY_FEED3", name: "BAY 3: TEST RUNNER (LOAD)", bus: "230kV", status: "closed", mw: 85 },
  { id: "BAY_TIE", name: "BAY 4: BUS COUPLER (TIE)", bus: "TIE", status: "closed", mw: 0 },
  { id: "BAY_GATE", name: "BAY 5: ACCEPTANCE GATE RELAY", bus: "230kV", status: "open", mw: 45 }
];

function renderSLD() {
  const sld = $("sldCanvas");
  if (!sld) return;

  const isBlocked = !!(snapshot.state?.block || snapshot.state?.blocker || snapshot.state?.hold);
  const phase = snapshot.state?.phase || "idle";

  sld.innerHTML = `
    <!-- 500kV Bus A (Cyan) -->
    <line x1="100" y1="120" x2="900" y2="120" stroke="#00f0ff" stroke-width="8" stroke-linecap="round" />
    <text x="110" y="105" fill="#00f0ff" font-family="JetBrains Mono" font-size="12" font-weight="bold">500 kV MAIN BUS A (ORCHESTRATION)</text>

    <!-- 230kV Bus B (Amber) -->
    <line x1="100" y1="360" x2="900" y2="360" stroke="#f59e0b" stroke-width="8" stroke-linecap="round" />
    <text x="110" y="345" fill="#f59e0b" font-family="JetBrains Mono" font-size="12" font-weight="bold">230 kV TRANSFER BUS B (EXECUTION)</text>

    <!-- Infeed Generator 1 (Bay 1) -->
    <g transform="translate(180, 20)" style="cursor:pointer;" onclick="window.__selectBay('BAY_GEN1')">
      <circle cx="20" cy="20" r="18" fill="#1e293b" stroke="#00f0ff" stroke-width="2" />
      <text x="14" y="25" fill="#00f0ff" font-size="14" font-weight="bold">G1</text>
      <line x1="20" y1="38" x2="20" y2="60" stroke="#00f0ff" stroke-width="3" />
      <!-- Breaker CB-101 -->
      <rect x="10" y="60" width="20" height="20" fill="${isBlocked ? '#ef4444' : '#10b981'}" stroke="#fff" stroke-width="1.5" />
      <line x1="20" y1="80" x2="20" y2="120" stroke="#00f0ff" stroke-width="3" />
      <text x="-15" y="105" fill="#94a3b8" font-size="9">CB-101 (RUN)</text>
    </g>

    <!-- Feeder 2 (Bay 2 - Code Engine) -->
    <g transform="translate(380, 120)" style="cursor:pointer;" onclick="window.__selectBay('BAY_FEED2')">
      <line x1="20" y1="0" x2="20" y2="40" stroke="#00f0ff" stroke-width="3" />
      <rect x="10" y="40" width="20" height="20" fill="#10b981" stroke="#fff" stroke-width="1.5" />
      <line x1="20" y1="60" x2="20" y2="100" stroke="#00f0ff" stroke-width="3" />
      <circle cx="20" cy="115" r="15" fill="#1e293b" stroke="#00f0ff" stroke-width="2" />
      <text x="13" y="119" fill="#00f0ff" font-size="10">DEV</text>
      <text x="35" y="55" fill="#94a3b8" font-size="9">CB-102</text>
    </g>

    <!-- Step-down Transformer YPTR-T1 -->
    <g transform="translate(560, 120)">
      <line x1="40" y1="0" x2="40" y2="50" stroke="#00f0ff" stroke-width="3" />
      <circle cx="40" cy="70" r="22" fill="none" stroke="#00f0ff" stroke-width="3" />
      <circle cx="40" cy="95" r="22" fill="none" stroke="#f59e0b" stroke-width="3" />
      <line x1="40" y1="117" x2="40" y2="170" stroke="#f59e0b" stroke-width="3" />
      <rect x="30" y="170" width="20" height="20" fill="#10b981" stroke="#fff" stroke-width="1.5" />
      <line x1="40" y1="190" x2="40" y2="240" stroke="#f59e0b" stroke-width="3" />
      <text x="70" y="85" fill="#94a3b8" font-size="10">XFMR T1</text>
      <text x="70" y="100" fill="#94a3b8" font-size="9">500/230 kV</text>
    </g>

    <!-- Feeder 3 (Bay 3 - Test Bay) -->
    <g transform="translate(740, 360)" style="cursor:pointer;" onclick="window.__selectBay('BAY_FEED3')">
      <line x1="20" y1="0" x2="20" y2="40" stroke="#f59e0b" stroke-width="3" />
      <rect x="10" y="40" width="20" height="20" fill="#10b981" stroke="#fff" stroke-width="1.5" />
      <line x1="20" y1="60" x2="20" y2="100" stroke="#f59e0b" stroke-width="3" />
      <polygon points="10,100 30,100 20,120" fill="#f59e0b" />
      <text x="35" y="55" fill="#94a3b8" font-size="9">CB-201 (QA)</text>
    </g>

    <!-- Acceptance Gate Interlock Bay -->
    <g transform="translate(300, 360)" style="cursor:pointer;" onclick="window.__selectBay('BAY_GATE')">
      <line x1="20" y1="0" x2="20" y2="40" stroke="#f59e0b" stroke-width="3" />
      <!-- Open breaker symbol -->
      <rect x="10" y="40" width="20" height="20" fill="#64748b" stroke="#fff" stroke-width="1.5" />
      <line x1="20" y1="60" x2="20" y2="100" stroke="#64748b" stroke-width="3" />
      <rect x="5" y="100" width="30" height="20" fill="#0f172a" stroke="#f59e0b" />
      <text x="10" y="114" fill="#f59e0b" font-size="9">GATES</text>
      <text x="35" y="55" fill="#94a3b8" font-size="9">CB-202</text>
    </g>
  `;
}

window.__selectBay = (bayId) => {
  selectedBay = bayId;
  activeTab = "bays";
  renderBayDock();
};

function renderBayDock() {
  const container = $("bayDockContent");
  if (!container) return;

  const content = (() => {
    if (activeTab === "bays") {
      const bay = BAYS.find(b => b.id === selectedBay) || BAYS[0];
      return html`
        <div style="padding:4px;">
          <h4 style="color:#00f0ff;margin-bottom:8px;font-size:11px;">BAY CONTROL UNIT: ${bay.name}</h4>
          <div style="background:#0f172a;border:1px solid #1e293b;padding:8px;border-radius:2px;margin-bottom:12px;">
            <div>STATUS: <b style="color:#10b981;">ENERGIZED & CLOSED [10]</b></div>
            <div>VOLTAGE CLASS: <b>${bay.bus}</b></div>
            <div>ACTIVE POWER: <b>${bay.mw} MW</b></div>
            <div>RUN CONTEXT: <b>${snapshot.state?.currentRunId || "NONE"}</b></div>
            <div>WORKFLOW PHASE: <b style="color:#00f0ff;">${snapshot.state?.phase || "IDLE"}</b></div>
          </div>

          <h5 style="color:#94a3b8;margin-bottom:6px;">SELECT-BEFORE-OPERATE SWITCHING ACTIONS</h5>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px;">
            <button class="scada-btn" @click=${() => armSbo("PAUSE_RUN", "Request graceful hold of active bay stream")}>ARM PAUSE</button>
            <button class="scada-btn" @click=${() => armSbo("RESUME_RUN", "Request resume of held grid telemetry")}>ARM RESUME</button>
            <button class="scada-btn" @click=${() => armSbo("WAKE_RUN", "Trigger immediate dispatch tick")}>ARM RUN NOW</button>
            <button class="scada-btn danger" @click=${() => armSbo("TRIP_RUN", "Emergency trip active run breakers")}>ARM E-TRIP</button>
          </div>

          <h5 style="color:#94a3b8;margin-bottom:6px;">DEBLOCK & STEERING INTERLOCKS</h5>
          <div style="display:flex;gap:6px;">
            <button class="scada-btn" style="background:#0369a1;" @click=${deblockModal}>OVERRIDE DEBLOCK</button>
            <button class="scada-btn" @click=${deblockAdvice}>REQUEST ADVICE</button>
          </div>
        </div>
      `;
    }

    if (activeTab === "evidence") {
      return html`
        <div>
          <h4 style="color:#00f0ff;margin-bottom:8px;">RELAY & EVENT LOG EVIDENCE</h4>
          <div style="display:flex;gap:4px;margin-bottom:8px;">
            <button class="scada-btn" @click=${() => loadDoc("spec")}>SPEC.md</button>
            <button class="scada-btn" @click=${() => loadDoc("devplan")}>DEVPLAN.md</button>
          </div>
          <pre id="scadaDocPreview" style="background:#05080c;padding:6px;border:1px solid #1e293b;max-height:220px;overflow:auto;font-size:9.5px;color:#94a3b8;">
${JSON.stringify(snapshot.events?.slice(-10) || [], null, 2)}
          </pre>
        </div>
      `;
    }

    if (activeTab === "plans") {
      const plans = snapshot.plans?.items || [];
      return html`
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <h4 style="color:#00f0ff;">GRID DISPATCH PLANS</h4>
            <button class="scada-btn" style="background:#047857;" @click=${createPlanModal}>+ NEW PLAN</button>
          </div>
          <div style="display:grid;gap:6px;">
            ${plans.map(p => html`
              <div style="background:#0f172a;border:1px solid #1e293b;padding:6px;border-radius:2px;cursor:pointer;" @click=${() => selectPlan(p.planId)}>
                <div style="display:flex;justify-content:space-between;">
                  <b>${p.title || p.planId}</b>
                  <span style="color:#10b981;">${p.status || "draft"}</span>
                </div>
                <small style="color:#64748b;">${p.pipelineType || "classic"} • v${p.version || 1}</small>
              </div>
            `)}
          </div>
        </div>
      `;
    }

    if (activeTab === "assist") {
      return html`
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <h4 style="color:#00f0ff;">DISPATCH AI ASSISTANT</h4>
            <button class="scada-btn" style="background:#047857;" @click=${startAssist}>+ NEW SESSION</button>
          </div>
          <div style="display:grid;gap:6px;">
            ${(snapshot.assistance || []).map(a => html`
              <div style="background:#0f172a;border:1px solid #1e293b;padding:6px;cursor:pointer;" @click=${() => messageAssist(a.id)}>
                <b>${a.id.slice(0, 20)}</b>
                <div style="color:#64748b;font-size:10px;">${a.pipelineType} • ${a.messageCount || 0} msgs</div>
              </div>
            `)}
          </div>
        </div>
      `;
    }

    return html``;
  })();

  render(content, container);
}

function armSbo(action, desc) {
  pendingSboAction = action;
  const descEl = $("sboDescription");
  if (descEl) descEl.textContent = `${desc}. Armed interlock expires in 30 seconds. Confirm execution?`;
  $("sboDialog")?.showModal();
}

$("btnCancelSbo")?.addEventListener("click", () => {
  pendingSboAction = null;
  $("sboDialog")?.close();
  toast("SBO sequence cancelled by operator", "warn");
});

$("btnExecuteSbo")?.addEventListener("click", async () => {
  $("sboDialog")?.close();
  const action = pendingSboAction;
  pendingSboAction = null;

  try {
    if (action === "PAUSE_RUN") await client.command("pause");
    else if (action === "RESUME_RUN") await client.command("resume");
    else if (action === "WAKE_RUN") await client.command("run-now");
    else if (action === "TRIP_RUN") await client.command("stop");
    toast(`SBO Action ${action} successfully executed`, "info");
  } catch (e) { toast(`SBO execution failed: ${e.message}`, "error"); }
});

async function deblockModal() {
  const prompt = window.prompt("Enter operator deblock authorization:");
  if (!prompt) return;
  try {
    await client.command("deblock", { prompt });
    toast("Deblock command transmitted", "info");
  } catch (e) { toast(e.message, "error"); }
}

async function deblockAdvice() {
  try {
    await client.command("deblock-advice", { prompt: "Analyze substation trip" });
    toast("Deblock advice requested", "info");
  } catch (e) { toast(e.message, "error"); }
}

async function loadDoc(type) {
  const runId = snapshot.state?.currentRunId;
  if (!runId) return toast("No active run selected", "warn");
  try {
    const doc = await client.loadDocument(runId, type);
    const pre = $("scadaDocPreview");
    if (pre) pre.textContent = doc.text;
  } catch (e) { toast(e.message, "error"); }
}

async function selectPlan(planId) {
  try {
    const detail = await client.getProjectPlan(planId);
    activeTab = "evidence";
    document.querySelectorAll(".scada-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === "evidence"));
    renderBayDock();
    const pre = $("scadaDocPreview");
    if (pre) pre.textContent = JSON.stringify(detail, null, 2);
  } catch (e) { toast(e.message, "error"); }
}

async function createPlanModal() {
  const title = window.prompt("Grid Plan Title:");
  if (!title) return;
  try {
    await client.createProjectPlan({
      title,
      problem: "Transmission line balancing",
      users: "dispatchers",
      objectives: "Verify SCADA telemetry and SBO switching",
      scope: "Substation network",
      repoPath: "/home/mojo/projects/hermesswarmbuilder/hermesswarmbuilder",
      baseRef: "HEAD"
    });
    toast("Grid plan created", "info");
    await client.refreshPlans();
    renderBayDock();
  } catch (e) { toast(e.message, "error"); }
}

async function startAssist() {
  try {
    const s = await client.createPlanAssistance("managed");
    toast(`Assistant initialized: ${s.id}`, "info");
    renderBayDock();
  } catch (e) { toast(e.message, "error"); }
}

async function messageAssist(id) {
  const msg = window.prompt("Message to Dispatch Assistant:");
  if (!msg) return;
  try {
    const d = await client.getPlanAssistance(id);
    await client.messagePlanAssistance(id, d.version || 1, msg);
    toast("Assistant updated", "info");
    renderBayDock();
  } catch (e) { toast(e.message, "error"); }
}

// Tab handlers
document.querySelectorAll(".scada-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".scada-tab").forEach(t => {
      t.classList.remove("active");
      t.setAttribute("aria-selected", "false");
    });
    tab.classList.add("active");
    tab.setAttribute("aria-selected", "true");
    activeTab = tab.dataset.tab;
    renderBayDock();
  });
});

$("btnAckAlarms")?.addEventListener("click", () => toast("All alarms acknowledged", "info"));
$("btnRefresh")?.addEventListener("click", () => { client.refresh(); toast("Substation telemetry synchronized", "info"); });
$("btnEmergencyTrip")?.addEventListener("click", () => armSbo("TRIP_RUN", "EMERGENCY POWER GRID TRIP (SCRAM)"));

// Subscription to Headless Client
client.subscribe((snap) => {
  snapshot = snap;
  const phase = snapshot.state?.phase || "IDLE";
  const phaseEl = $("phaseDisplay");
  if (phaseEl) phaseEl.textContent = phase.toUpperCase();

  const connEl = $("connStatus");
  if (connEl) {
    connEl.textContent = snapshot.connection?.status === "connected" ? "SSE_LINKED" : "POLLING_FALLBACK";
    connEl.style.color = snapshot.connection?.status === "connected" ? "var(--scada-closed)" : "var(--scada-bus-230)";
  }

  // Update alarm tiles
  const isBlocked = !!(snapshot.state?.block || snapshot.state?.blocker || snapshot.state?.hold);
  const blockerTile = $("tileBlocker");
  if (blockerTile) {
    blockerTile.className = isBlocked ? "ann-tile active-red" : "ann-tile";
    blockerTile.textContent = isBlocked ? "BLOCKER TRIP: ACTIVE" : "BLOCKER TRIP: NORMAL";
  }

  renderSLD();
  renderBayDock();
});

client.connect();
client.refresh();
renderSLD();
renderBayDock();
