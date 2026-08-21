import { createDashboardClient, WORKFLOW_PHASES, OPERATION_COMMANDS, PROJECT_PLAN_ACTIONS } from "../../headless-dashboard-client.js";
import { h, render } from "../../vendor/preact.js";

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
let activeTab = "signals";
let isPaused = false;
let samples = [];
let cursor1 = 0;
let cursor2 = 0;
let timeWindow = 10; // seconds visible
let selectedSample = null;
let activePlan = null;
let activeAssistance = null;

// Audio or Tone feedback placeholder
function toast(msg, type = "info") {
  const el = $("statusToast");
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  el.style.background = type === "error" ? "#551122" : type === "warn" ? "#554400" : "#004455";
  el.style.border = `1px solid ${type === "error" ? "#f35" : type === "warn" ? "#fb0" : "#0ef"}`;
  setTimeout(() => { el.style.display = "none"; }, 3500);
}

// Logic Channels definition
const CHANNELS = [
  { id: "clk", name: "POD0: CLK_SSE", type: "clock", color: "#00e5ff" },
  { id: "phase", name: "POD1: PHASE_BUS", type: "bus", color: "#ffb700" },
  { id: "agent", name: "POD2: AGENT_ACT", type: "digital", color: "#00ff66" },
  { id: "tool", name: "POD3: TOOL_IO_BUS", type: "bus", color: "#ff007f" },
  { id: "block", name: "POD4: BLOCK_GLITCH", type: "glitch", color: "#ff3355" },
  { id: "gate", name: "POD5: GATE_EVAL", type: "digital", color: "#aa66ff" }
];

function recordSample(event) {
  const ts = Date.now();
  const sample = {
    id: event?.id || `s-${samples.length}`,
    ts,
    timeStr: new Date(ts).toISOString().slice(11, 23),
    phase: snapshot.state?.phase || snapshot.state?.status || "idle",
    agent: event?.agentId || "sys",
    tool: event?.data?.toolName || event?.type || "idle",
    isBlocked: !!(snapshot.state?.block || snapshot.state?.blocker || snapshot.state?.hold),
    gate: snapshot.gates?.gates?.length ? snapshot.gates.gates[0].status : "none",
    raw: event
  };
  samples.push(sample);
  if (samples.length > 2000) samples.shift();
  updateStateListing();
}

// Canvas Waveform Drawing
const canvas = $("waveformCanvas");
const ctx = canvas ? canvas.getContext("2d") : null;

function resizeCanvas() {
  if (!canvas) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * (window.devicePixelRatio || 1);
  canvas.height = rect.height * (window.devicePixelRatio || 1);
  ctx?.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
  drawWaveforms();
}
window.addEventListener("resize", resizeCanvas);

function drawWaveforms() {
  if (!canvas || !ctx) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  ctx.clearRect(0, 0, w, h);

  // Background grid
  ctx.strokeStyle = "#121924";
  ctx.lineWidth = 1;
  const divisions = 10;
  for (let i = 0; i <= divisions; i++) {
    const x = (w / divisions) * i;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  // Draw Channels
  const channelHeight = h / (CHANNELS.length + 1);
  const now = Date.now();
  const startTime = now - timeWindow * 1000;

  CHANNELS.forEach((ch, idx) => {
    const yBase = channelHeight * (idx + 1);
    const yTop = yBase - channelHeight * 0.65;
    const yMid = (yBase + yTop) / 2;

    // Label
    ctx.fillStyle = "#5c6c7f";
    ctx.font = "10px JetBrains Mono, monospace";
    ctx.fillText(ch.name, 10, yTop - 4);

    // Channel baseline
    ctx.strokeStyle = "#1a2433";
    ctx.beginPath();
    ctx.moveTo(0, yBase);
    ctx.lineTo(w, yBase);
    ctx.stroke();

    // Render transitions
    ctx.strokeStyle = ch.color;
    ctx.fillStyle = ch.color;
    ctx.lineWidth = 1.5;

    if (ch.type === "bus") {
      // Draw chamfered bus packet envelopes
      let lastX = 0;
      let lastVal = "";
      samples.forEach((s) => {
        const x = ((s.ts - startTime) / (timeWindow * 1000)) * w;
        if (x < 0) return;
        const val = ch.id === "phase" ? s.phase : s.tool;
        if (val !== lastVal) {
          if (lastX > 0) {
            ctx.beginPath();
            ctx.moveTo(lastX, yMid);
            ctx.lineTo(lastX + 4, yTop);
            ctx.lineTo(x - 4, yTop);
            ctx.lineTo(x, yMid);
            ctx.lineTo(x - 4, yBase);
            ctx.lineTo(lastX + 4, yBase);
            ctx.closePath();
            ctx.stroke();
            if (x - lastX > 30) {
              ctx.fillText(lastVal.slice(0, 10), lastX + 6, yMid + 3);
            }
          }
          lastX = x;
          lastVal = val;
        }
      });
    } else {
      // Digital square wave
      ctx.beginPath();
      let lastX = 0;
      let lastHigh = false;
      samples.forEach((s) => {
        const x = ((s.ts - startTime) / (timeWindow * 1000)) * w;
        if (x < 0) return;
        const high = ch.id === "block" ? s.isBlocked : ch.id === "clk" ? (s.ts % 1000 > 500) : s.agent !== "sys";
        const y = high ? yTop : yBase;
        if (lastX === 0) ctx.moveTo(x, y);
        else {
          ctx.lineTo(x, lastHigh ? yTop : yBase);
          ctx.lineTo(x, y);
        }
        lastX = x;
        lastHigh = high;
      });
      ctx.lineTo(w, lastHigh ? yTop : yBase);
      ctx.stroke();
    }
  });

  // Render Cursor 1 (Cyan) & Cursor 2 (Magenta)
  const c1X = w * 0.25;
  const c2X = w * 0.75;
  ctx.strokeStyle = "#00e5ff";
  ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(c1X, 0); ctx.lineTo(c1X, h); ctx.stroke();

  ctx.strokeStyle = "#ff007f";
  ctx.beginPath(); ctx.moveTo(c2X, 0); ctx.lineTo(c2X, h); ctx.stroke();
  ctx.setLineDash([]);
}

function updateStateListing() {
  const tbody = $("stateListingBody");
  if (!tbody) return;
  const recent = samples.slice(-25).reverse();
  tbody.innerHTML = recent.map((s) => `
    <tr class="${selectedSample?.id === s.id ? 'selected' : ''}" onclick="window.__selectSample('${s.id}')">
      <td>${s.id}</td>
      <td>${s.timeStr}</td>
      <td><span class="la-chip info">${s.phase}</span></td>
      <td>${s.tool}</td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;">${JSON.stringify(s.raw?.data || s.raw?.message || s.raw || "")}</td>
    </tr>
  `).join("");
  const countEl = $("listingCount");
  if (countEl) countEl.textContent = `${samples.length} SAMPLES`;
}

window.__selectSample = (id) => {
  selectedSample = samples.find(s => s.id === id);
  updateStateListing();
  renderInspector();
};

// Inspector Panel (Preact Components)
function renderInspector() {
  const container = $("inspectorContent");
  if (!container) return;

  const content = (() => {
    if (activeTab === "signals") {
      return h("div", null,
        h("h4", { style: "color:var(--la-cyan);margin-bottom:8px;font-size:11px;" }, "ACQUIRED SIGNAL PROBES"),
        h("div", { style: "display:grid;gap:6px;" },
          h("div", { class: "la-chip info" }, `RUN: ${snapshot.state?.currentRunId || "NONE"} (${snapshot.state?.phase || "IDLE"})`),
          h("div", null, `Active Agents: ${Object.keys(snapshot.state?.agents || {}).length}`),
          h("div", null, `Queue Depth: ${snapshot.queue?.items?.length || 0}`),
          h("div", null, `Acceptance Gates: ${snapshot.gates?.gates?.length || 0}`),
          snapshot.state?.blocker ? h("div", { class: "la-chip fail" }, `BLOCKER: ${JSON.stringify(snapshot.state.blocker)}`) : null
        ),
        h("div", { style: "margin-top:12px;border-top:1px solid #223;padding-top:8px;" },
          h("h5", { style: "color:var(--la-text-dim);margin-bottom:4px;" }, "DEBLOCK INTERLOCK CONTROL"),
          h("button", {
            class: "la-btn danger",
            onClick: async () => {
              const prompt = window.prompt("Enter deblock instructions:");
              if (prompt) {
                try {
                  await client.command("deblock", { prompt });
                  toast("Deblock command transmitted", "info");
                } catch (e) { toast(e.message, "error"); }
              }
            }
          }, "OVERRIDE DEBLOCK"),
          h("button", {
            class: "la-btn",
            style: "margin-left:6px;",
            onClick: async () => {
              try {
                await client.command("deblock-advice", { prompt: "Analyze blocker" });
                toast("Deblock advice requested", "info");
              } catch (e) { toast(e.message, "error"); }
            }
          }, "REQUEST ADVICE")
        )
      );
    }

    if (activeTab === "evidence") {
      return h("div", null,
        h("h4", { style: "color:var(--la-cyan);margin-bottom:8px;" }, "TELEMETRY EVIDENCE DISSECTOR"),
        h("div", { style: "display:flex;gap:4px;margin-bottom:8px;" },
          h("button", { class: "la-btn", onClick: () => loadDoc("spec") }, "SPEC.md"),
          h("button", { class: "la-btn", onClick: () => loadDoc("devplan") }, "DEVPLAN.md")
        ),
        h("pre", { id: "docPreview", style: "background:#05080c;padding:6px;border:1px solid #1a2332;max-height:220px;overflow:auto;font-size:9.5px;color:#aaccdd;" },
          selectedSample ? JSON.stringify(selectedSample.raw, null, 2) : "Select sample or document above"
        )
      );
    }

    if (activeTab === "plans") {
      const plans = snapshot.plans?.items || [];
      return h("div", null,
        h("div", { style: "display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;" },
          h("h4", { style: "color:var(--la-cyan);" }, "PROJECT PLAN ROM REGISTRY"),
          h("button", { class: "la-btn primary", onClick: createPlanModal }, "+ NEW PLAN")
        ),
        h("div", { style: "display:grid;gap:6px;" },
          plans.length === 0 ? h("div", { style: "color:#556;" }, "No plans registered in ROM") :
          plans.map(p => h("div", {
            style: "background:#0d131c;border:1px solid #1a2332;padding:6px;border-radius:3px;cursor:pointer;",
            onClick: () => selectPlan(p.planId)
          },
            h("div", { style: "display:flex;justify-content:space-between;" },
              h("b", { style: "color:#fff;" }, p.title || p.planId),
              h("span", { class: "la-chip info" }, p.status || "draft")
            ),
            h("small", { style: "color:#5c6c7f;" }, `v${p.version || 1} • ${p.pipelineType || "classic"}`)
          ))
        )
      );
    }

    if (activeTab === "assist") {
      const assists = snapshot.assistance || [];
      return h("div", null,
        h("div", { style: "display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;" },
          h("h4", { style: "color:var(--la-cyan);" }, "AI PLANNING ASSISTANT"),
          h("button", { class: "la-btn primary", onClick: startAssist }, "+ NEW SESSION")
        ),
        h("div", { style: "display:grid;gap:6px;" },
          assists.map(a => h("div", {
            style: "background:#0d131c;border:1px solid #1a2332;padding:6px;border-radius:3px;",
            onClick: () => openAssist(a.id)
          },
            h("div", { style: "display:flex;justify-content:space-between;" },
              h("b", null, a.id.slice(0, 18)),
              h("span", { class: "la-chip warn" }, a.pipelineType)
            ),
            h("small", { style: "color:#5c6c7f;" }, `${a.messageCount || 0} messages`)
          ))
        )
      );
    }

    return null;
  })();

  render(content, container);
}

async function loadDoc(type) {
  const runId = snapshot.state?.currentRunId;
  if (!runId) return toast("No active run selected", "warn");
  try {
    const doc = await client.loadDocument(runId, type);
    const pre = $("docPreview");
    if (pre) pre.textContent = doc.text;
  } catch (e) { toast(`Document load failed: ${e.message}`, "error"); }
}

async function selectPlan(planId) {
  try {
    const detail = await client.getProjectPlan(planId);
    activePlan = detail;
    const pre = $("docPreview");
    if (pre) pre.textContent = JSON.stringify(detail, null, 2);
    activeTab = "evidence";
    document.querySelectorAll(".la-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === "evidence"));
    renderInspector();
  } catch (e) { toast(e.message, "error"); }
}

async function createPlanModal() {
  const title = window.prompt("Project Plan Title:");
  if (!title) return;
  try {
    await client.createProjectPlan({
      title,
      problem: "Hardware orchestration",
      users: "operators",
      objectives: "Verify logic analyzer integration",
      scope: "Full stack",
      repoPath: "/home/mojo/projects/hermesswarmbuilder/hermesswarmbuilder",
      baseRef: "HEAD"
    });
    toast("Project plan created", "info");
    await client.refreshPlans();
    renderInspector();
  } catch (e) { toast(e.message, "error"); }
}

async function startAssist() {
  try {
    const session = await client.createPlanAssistance("managed");
    toast(`Assistance session created: ${session.id}`, "info");
    renderInspector();
  } catch (e) { toast(e.message, "error"); }
}

async function openAssist(id) {
  const msg = window.prompt("Message to AI Assistant:");
  if (!msg) return;
  try {
    const detail = await client.getPlanAssistance(id);
    await client.messagePlanAssistance(id, detail.version || 1, msg);
    toast("Assistant responded", "info");
    renderInspector();
  } catch (e) { toast(e.message, "error"); }
}

// Pattern Generator Modal (Operation Commands)
function renderPatternGen() {
  const container = $("patternGenContent");
  if (!container) return;

  const content = h("div", null,
    h("div", { style: "display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px;" },
      h("button", { class: "la-btn", onClick: () => execCmd("pause") }, "PAUSE RUN"),
      h("button", { class: "la-btn", onClick: () => execCmd("resume") }, "RESUME RUN"),
      h("button", { class: "la-btn", onClick: () => execCmd("hold") }, "HOLD NEXT"),
      h("button", { class: "la-btn", onClick: () => execCmd("unhold") }, "UNHOLD"),
      h("button", { class: "la-btn danger", onClick: () => execCmd("stop") }, "STOP RUN"),
      h("button", { class: "la-btn primary", onClick: () => execCmd("run-now") }, "RUN NOW (WAKE)")
    ),
    h("div", { style: "display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:12px;" },
      h("button", { class: "la-btn", onClick: () => execCmd("start-showcase-loop", { targetGenerations: 10 }) }, "START SHOWCASE LOOP"),
      h("button", { class: "la-btn", onClick: () => execCmd("stop-showcase-loop") }, "STOP SHOWCASE LOOP"),
      h("button", { class: "la-btn", onClick: () => execCmd("clear-queue") }, "CLEAR QUEUE"),
      h("button", { class: "la-btn", onClick: () => execCmd("add-queue-item", { title: "Queued Probe Task" }) }, "+ ADD QUEUE ITEM")
    ),
    h("div", { style: "display:grid;grid-template-columns:repeat(2,1fr);gap:8px;" },
      h("button", { class: "la-btn", onClick: () => execCmd("start-next-iteration") }, "NEXT ITERATION"),
      h("button", { class: "la-btn", onClick: () => execCmd("add-gate", { title: "Timing Verification Gate" }) }, "+ ADD GATE")
    )
  );

  render(content, container);
}

async function execCmd(type, payload = {}) {
  try {
    await client.command(type, payload);
    toast(`Command ${type} accepted`, "info");
  } catch (e) { toast(`Command error: ${e.message}`, "error"); }
}

// Event Listeners & Tab Handlers
document.querySelectorAll(".la-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".la-tab").forEach(t => {
      t.classList.remove("active");
      t.setAttribute("aria-selected", "false");
    });
    tab.classList.add("active");
    tab.setAttribute("aria-selected", "true");
    activeTab = tab.dataset.tab;
    renderInspector();
  });
});

$("btnRunStop")?.addEventListener("click", () => {
  isPaused = !isPaused;
  if (isPaused) client.pause(); else client.resume();
  $("btnRunStop").textContent = isPaused ? "RESUME" : "RUN / STOP";
  toast(isPaused ? "Acquisition frozen" : "Acquisition resumed", "info");
});

$("btnSingle")?.addEventListener("click", () => {
  client.refresh();
  toast("Single trigger fired", "info");
});

$("btnRefresh")?.addEventListener("click", () => {
  client.refresh();
  toast("Full resync executed", "info");
});

$("btnCommands")?.addEventListener("click", () => {
  renderPatternGen();
  $("patternGenDialog")?.showModal();
});
$("btnClosePatternGen")?.addEventListener("click", () => $("patternGenDialog")?.close());

$("btnPlanning")?.addEventListener("click", () => {
  activeTab = "plans";
  document.querySelectorAll(".la-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === "plans"));
  renderInspector();
});

// Subscribe to Headless Client
client.subscribe((snap) => {
  snapshot = snap;
  const phase = snapshot.state?.phase || snapshot.state?.status || "IDLE";
  const badge = $("phaseBadge");
  if (badge) {
    badge.textContent = phase.toUpperCase();
    badge.className = `la-chip ${phase.includes("block") ? "fail" : phase === "completed" ? "pass" : "info"}`;
  }
  const lamp = $("connectionLamp");
  if (lamp) {
    lamp.className = `la-lamp ${snapshot.connection?.status === "connected" ? "active" : snapshot.connection?.status === "polling" ? "stale" : "error"}`;
  }
  const connText = $("connectionText");
  if (connText) connText.textContent = snapshot.connection?.status?.toUpperCase() || "DISCONNECTED";

  recordSample({ type: "snapshot", data: { phase, status: snapshot.state?.status } });
  renderInspector();
});

// Ingest live events
client.connect();
client.refresh();

// Animation Loop for Waveforms
function animationLoop() {
  drawWaveforms();
  requestAnimationFrame(animationLoop);
}
resizeCanvas();
requestAnimationFrame(animationLoop);
