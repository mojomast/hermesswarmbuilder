import { createDashboardClient, WORKFLOW_PHASES, OPERATION_COMMANDS, PROJECT_PLAN_ACTIONS } from "../../headless-dashboard-client.js";
import { h, render } from "../../vendor/preact.js";

// DOM Selector Helper
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Headless Dashboard Client Instance
const client = createDashboardClient({ maxEvents: 2000, eventLimit: 500, pollIntervalMs: 4000 });

// Full client method bindings for complete feature coverage & smoke assertions
const actions = {
  createDashboardClient: () => client,
  selectRun: (runId) => client.selectRun(runId),
  selectIteration: (iterationId) => client.selectIteration(iterationId),
  loadArtifact: (name, runId) => client.loadArtifact(name, runId),
  loadLog: (name, runId, opts) => client.loadLog(name, runId, opts),
  loadDocument: (type, runId) => client.loadDocument(type, runId),
  getProjectPlan: (planId) => client.getProjectPlan(planId),
  getProjectPlanRevision: (planId, rev) => client.getProjectPlanRevision(planId, rev),
  listPlanAssistance: () => client.listPlanAssistance(),
  createPlanAssistance: (type) => client.createPlanAssistance(type),
  getPlanAssistance: (id) => client.getPlanAssistance(id),
  messagePlanAssistance: (id, ver, msg) => client.messagePlanAssistance(id, ver, msg),
  createProjectPlan: (data) => client.createProjectPlan(data),
  updateProjectPlan: (data) => client.updateProjectPlan(data),
  submitProjectPlanForReview: (data) => client.submitProjectPlanForReview(data),
  approveProjectPlan: (data) => client.approveProjectPlan(data),
  rejectProjectPlan: (data) => client.rejectProjectPlan(data),
  launchProjectPlan: (data) => client.launchProjectPlan(data),
  cloneProjectPlan: (data) => client.cloneProjectPlan(data),
  forkProjectPlan: (data) => client.forkProjectPlan(data),
  archiveProjectPlan: (data) => client.archiveProjectPlan(data),
  command: (type, payload) => client.command(type, payload, { refresh: true })
};

// Global App State
let snapshot = client.getSnapshot();
let activeTab = "signals";
let isPaused = false;
let samples = [];
let maxSamples = 2000;
let timeWindow = 5; // seconds visible in window (0.5s to 20s)
let cursor1Ratio = 0.25; // 0.0 to 1.0 within canvas width
let cursor2Ratio = 0.75;
let draggingCursor = null;
let autoScroll = true;
let selectedSample = null;
let activePlan = null;
let activePlanRevision = null;
let activeAssistance = null;
let filterKind = "all";
let searchQuery = "";
let noticeTimer = null;

// Audio / Visual Toast Notification
function toast(msg, type = "info") {
  const el = $("statusToast");
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  el.className = `la-toast la-chip ${type === "error" ? "fail" : type === "warn" ? "warn" : "info"}`;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { el.style.display = "none"; }, 4000);
}

// Logic Analyzer Channel Definitions (Hardware Probe Pods)
const CHANNELS = [
  { id: "clk", name: "POD0: CLK_SSE", type: "clock", color: "#00e5ff", desc: "SSE Transport Sync Heartbeat" },
  { id: "phase", name: "POD1: PHASE_BUS", type: "bus", color: "#ffb700", desc: "Decoded 16-State Workflow Phase Bus" },
  { id: "orch", name: "POD2: ORCHESTRATOR", type: "digital", color: "#00ff66", desc: "Main Orchestrator Active Line" },
  { id: "agent", name: "POD3: AGENT_WORKERS", type: "digital", color: "#38bdf8", desc: "Active Worker Agents Probes" },
  { id: "tool", name: "POD4: TOOL_IO_BUS", type: "bus", color: "#ff007f", desc: "Tool Call & Terminal IO Packets" },
  { id: "block", name: "POD5: BLOCK_GLITCH", type: "glitch", color: "#ff3355", desc: "Blocker / Hold Glitch Fault Sensor" },
  { id: "gate", name: "POD6: GATE_EVAL", type: "digital", color: "#aa66ff", desc: "Acceptance Gate Evaluation Line" },
  { id: "queue", name: "POD7: QUEUE_STROBE", type: "digital", color: "#fb923c", desc: "Priority Queue Execution Strobe" }
];

// Ingest Logic Samples
function recordSample(event = null) {
  const now = Date.now();
  const state = snapshot.state || {};
  const currentBlocker = state.block || state.blocker || state.hold || (snapshot.control?.pause?.requested ? snapshot.control.pause : null);
  const activeAgents = Object.keys(state.agents || {}).length;
  const toolName = event?.data?.toolName || event?.data?.action || event?.type || "";

  const sample = {
    id: event?.id || `SMP-${samples.length + 1}`,
    sampleNum: samples.length + 1,
    ts: now,
    timeStr: new Date(now).toISOString().slice(11, 23),
    phase: state.phase || state.status || "idle",
    agent: event?.agentId || event?.source || "orchestrator",
    orchActive: state.status === "building" || state.phase?.includes("drafting") || state.phase?.includes("review"),
    agentCount: activeAgents,
    tool: toolName,
    isBlocked: !!currentBlocker,
    gatePassed: (snapshot.gates?.gates || []).every(g => g.status === "passed"),
    queueDepth: (snapshot.queue?.items || []).filter(i => i.status !== "archived").length,
    raw: event || { type: "heartbeat", stateSummary: { phase: state.phase, runId: state.currentRunId } }
  };

  samples.push(sample);
  if (samples.length > maxSamples) samples.shift();
  updateStateListing();
}

// Canvas Waveform 2D Rendering Engine
const canvas = $("waveformCanvas");
const ctx = canvas ? canvas.getContext("2d") : null;

function resizeCanvas() {
  if (!canvas) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx?.scale(dpr, dpr);
  drawWaveforms();
}
window.addEventListener("resize", resizeCanvas);

function drawWaveforms() {
  if (!canvas || !ctx) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  if (w <= 0 || h <= 0) return;

  ctx.clearRect(0, 0, w, h);

  // Background Grid Lines
  ctx.strokeStyle = "#121922";
  ctx.lineWidth = 1;
  const divisions = 10;
  for (let i = 0; i <= divisions; i++) {
    const x = (w / divisions) * i;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  const numChannels = CHANNELS.length;
  const channelHeight = h / (numChannels + 1.2);
  const now = Date.now();
  const startTime = now - timeWindow * 1000;

  // Render Horizontal Channel Strips
  CHANNELS.forEach((ch, idx) => {
    const yBase = channelHeight * (idx + 1.1);
    const yTop = yBase - channelHeight * 0.65;
    const yMid = (yBase + yTop) / 2;

    // Channel label & separator
    ctx.fillStyle = "#62758d";
    ctx.font = "11px JetBrains Mono, monospace";
    ctx.fillText(ch.name, 12, yTop - 5);

    ctx.strokeStyle = "#16202c";
    ctx.beginPath();
    ctx.moveTo(0, yBase);
    ctx.lineTo(w, yBase);
    ctx.stroke();

    // Render Logic Signal Waveforms
    ctx.strokeStyle = ch.color;
    ctx.fillStyle = ch.color;
    ctx.lineWidth = 1.75;

    if (ch.type === "bus") {
      // Hexagonal Packet Bus Protocol Envelopes
      let lastX = 0;
      let lastVal = "";
      samples.forEach((s) => {
        const x = ((s.ts - startTime) / (timeWindow * 1000)) * w;
        if (x < 0) return;
        const val = ch.id === "phase" ? s.phase : s.tool || "IDLE";
        if (val !== lastVal) {
          if (lastX > 0 && x > lastX) {
            const chamfer = Math.min(6, (x - lastX) / 2);
            ctx.beginPath();
            ctx.moveTo(lastX, yMid);
            ctx.lineTo(lastX + chamfer, yTop);
            ctx.lineTo(x - chamfer, yTop);
            ctx.lineTo(x, yMid);
            ctx.lineTo(x - chamfer, yBase);
            ctx.lineTo(lastX + chamfer, yBase);
            ctx.closePath();
            ctx.stroke();

            if (x - lastX > 38 && lastVal) {
              ctx.save();
              ctx.font = "10px JetBrains Mono, monospace";
              ctx.fillStyle = ch.color;
              ctx.fillText(lastVal.slice(0, 18), lastX + 8, yMid + 3.5);
              ctx.restore();
            }
          }
          lastX = x;
          lastVal = val;
        }
      });
      if (lastX > 0 && lastX < w) {
        ctx.beginPath();
        ctx.moveTo(lastX, yMid);
        ctx.lineTo(lastX + 4, yTop);
        ctx.lineTo(w, yTop);
        ctx.lineTo(w, yBase);
        ctx.lineTo(lastX + 4, yBase);
        ctx.closePath();
        ctx.stroke();
      }
    } else if (ch.type === "glitch") {
      // Glitch Sensor: Pulses high with hatched fill on blocker condition
      ctx.beginPath();
      let lastX = 0;
      let lastHigh = false;
      samples.forEach((s) => {
        const x = ((s.ts - startTime) / (timeWindow * 1000)) * w;
        if (x < 0) return;
        const high = s.isBlocked;
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
    } else {
      // Discrete Binary Digital Square Wave
      ctx.beginPath();
      let lastX = 0;
      let lastHigh = false;
      samples.forEach((s) => {
        const x = ((s.ts - startTime) / (timeWindow * 1000)) * w;
        if (x < 0) return;
        let high = false;
        if (ch.id === "clk") high = Math.floor(s.ts / 250) % 2 === 0;
        else if (ch.id === "orch") high = s.orchActive;
        else if (ch.id === "agent") high = s.agentCount > 0;
        else if (ch.id === "gate") high = s.gatePassed;
        else if (ch.id === "queue") high = s.queueDepth > 0;

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

  // Render Measurement Cursors C1 (Cyan) & C2 (Magenta)
  const c1X = w * cursor1Ratio;
  const c2X = w * cursor2Ratio;

  // C1 Cursor Line
  ctx.strokeStyle = "#00e5ff";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(c1X, 0);
  ctx.lineTo(c1X, h);
  ctx.stroke();

  // C1 Cursor Handle
  ctx.fillStyle = "#00e5ff";
  ctx.beginPath();
  ctx.moveTo(c1X - 6, 0);
  ctx.lineTo(c1X + 6, 0);
  ctx.lineTo(c1X, 10);
  ctx.closePath();
  ctx.fill();

  // C2 Cursor Line
  ctx.strokeStyle = "#ff007f";
  ctx.beginPath();
  ctx.moveTo(c2X, 0);
  ctx.lineTo(c2X, h);
  ctx.stroke();

  // C2 Cursor Handle
  ctx.fillStyle = "#ff007f";
  ctx.beginPath();
  ctx.moveTo(c2X - 6, 0);
  ctx.lineTo(c2X + 6, 0);
  ctx.lineTo(c2X, 10);
  ctx.closePath();
  ctx.fill();
  ctx.setLineDash([]);

  // Calculate Delta Measurements
  const c1Time = startTime + cursor1Ratio * timeWindow * 1000;
  const c2Time = startTime + cursor2Ratio * timeWindow * 1000;
  const deltaSec = Math.abs((c2Time - c1Time) / 1000);
  const freqHz = deltaSec > 0 ? (1 / deltaSec).toFixed(2) : "0.0";

  $("c1Val").textContent = `T=${((c1Time - now) / 1000).toFixed(3)}s`;
  $("c2Val").textContent = `T=${((c2Time - now) / 1000).toFixed(3)}s`;
  $("deltaTVal").textContent = `${deltaSec.toFixed(3)}s`;
  $("freqVal").textContent = `${freqHz} Hz`;

  // Sample under C1
  const closestSample = samples.find(s => Math.abs(s.ts - c1Time) < 500) || samples[samples.length - 1];
  if (closestSample) {
    $("c1BusState").textContent = `${closestSample.phase.toUpperCase()} | ${closestSample.tool || "IDLE"}`;
  }
}

// Canvas Cursor Dragging and Interactivity
if (canvas) {
  canvas.addEventListener("mousedown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = x / rect.width;
    const dist1 = Math.abs(ratio - cursor1Ratio);
    const dist2 = Math.abs(ratio - cursor2Ratio);

    if (dist1 < 0.05) draggingCursor = "C1";
    else if (dist2 < 0.05) draggingCursor = "C2";
    else if (dist1 < dist2) {
      cursor1Ratio = Math.max(0, Math.min(1, ratio));
      draggingCursor = "C1";
    } else {
      cursor2Ratio = Math.max(0, Math.min(1, ratio));
      draggingCursor = "C2";
    }
    drawWaveforms();
  });

  window.addEventListener("mousemove", (e) => {
    if (!draggingCursor || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const ratio = x / rect.width;
    if (draggingCursor === "C1") cursor1Ratio = ratio;
    else if (draggingCursor === "C2") cursor2Ratio = ratio;
    drawWaveforms();
  });

  window.addEventListener("mouseup", () => { draggingCursor = null; });
}

// Synchronized State Listing Table (Bus Disassembler)
function updateStateListing() {
  const tbody = $("stateListingBody");
  if (!tbody) return;

  const query = searchQuery.toLowerCase();
  let list = samples.slice().reverse();

  if (filterKind === "tools") list = list.filter(s => !!s.tool && s.tool !== "heartbeat");
  else if (filterKind === "alerts") list = list.filter(s => s.isBlocked || String(s.raw?.level).includes("error") || String(s.raw?.type).includes("error"));
  else if (filterKind === "system") list = list.filter(s => s.agent === "system" || s.agent === "orchestrator");

  if (query) {
    list = list.filter(s => JSON.stringify(s).toLowerCase().includes(query));
  }

  $("listingCount").textContent = `${samples.length} SAMPLES`;

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--la-text-dim);padding:24px;">No disassembler frames match the active filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.slice(0, 100).map(s => {
    const isSelected = selectedSample?.id === s.id;
    const isErr = s.isBlocked || String(s.raw?.level).includes("error") || String(s.raw?.type).includes("error");
    const payloadStr = JSON.stringify(s.raw?.data || s.raw?.message || s.raw || "");
    return `
      <tr class="${isSelected ? 'selected' : ''} ${isErr ? 'error-row' : ''}" onclick="window.__selectDisasmSample('${esc(s.id)}')">
        <td><strong style="color:var(--la-cyan);">${esc(s.id)}</strong></td>
        <td>${esc(s.timeStr)}</td>
        <td><span class="la-chip ${s.phase.includes('block') ? 'fail' : 'info'}">${esc(s.phase)}</span></td>
        <td><span style="color:${s.tool ? 'var(--la-magenta)' : 'var(--la-text-dim)'};">${esc(s.tool || 'IDLE_STROBE')}</span></td>
        <td style="max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--la-text);">${esc(payloadStr)}</td>
        <td style="text-align:center;">
          <button class="la-btn xs" type="button" onclick="event.stopPropagation(); window.__inspectSamplePayload('${esc(s.id)}')">VIEW</button>
        </td>
      </tr>
    `;
  }).join("");
}

window.__selectDisasmSample = (id) => {
  selectedSample = samples.find(s => s.id === id);
  updateStateListing();
  renderInspector();
};

window.__inspectSamplePayload = (id) => {
  const s = samples.find(item => item.id === id);
  if (!s) return;
  openEvidenceModal(`FRAME DISASSEMBLY: ${s.id}`, `Sample #${s.sampleNum} | Captured at ${s.timeStr} | Phase: ${s.phase}`, JSON.stringify(s.raw, null, 2));
};

// Evidence Viewer Modal Utility
function openEvidenceModal(title, meta, content) {
  $("evidenceViewerTitle").textContent = title;
  $("evidenceMeta").textContent = meta;
  $("evidenceBody").textContent = typeof content === "string" ? content : JSON.stringify(content, null, 2);
  $("evidenceViewerDialog")?.showModal();
}

$("btnCloseEvidence")?.addEventListener("click", () => $("evidenceViewerDialog")?.close());
$("btnCopyEvidence")?.addEventListener("click", () => {
  const text = $("evidenceBody").textContent;
  navigator.clipboard.writeText(text).then(() => toast("Copied to clipboard", "info"));
});

// Operator Command Execution Helper
async function execCommand(type, payload = {}, successMsg = `Command ${type} transmitted`) {
  try {
    await client.command(type, payload, { refresh: true });
    toast(successMsg, "info");
    await client.refresh();
    renderInspector();
  } catch (err) {
    toast(`Command failed: ${err.message}`, "error");
  }
}

// Main Inspector Panel Rendering (Preact Components)
function renderInspector() {
  const container = $("inspectorContent");
  if (!container) return;

  const state = snapshot.state || {};
  const control = snapshot.control || {};
  const queue = snapshot.queue || { items: [] };
  const gates = snapshot.gates || { gates: [] };
  const currentBlocker = state.block || state.blocker || state.hold || (control.pause?.requested ? control.pause : null);
  const runs = snapshot.runs || [];
  const selectedRun = snapshot.selectedRun || {};

  const content = (() => {
    // 1. SIGNALS & RUNS TAB
    if (activeTab === "signals") {
      return h("div", { style: "display:flex;flex-direction:column;gap:12px;" },
        // Run Selection & Status
        h("div", { class: "la-card" },
          h("div", { class: "la-card-title" },
            h("span", null, "ACTIVE RUN HARDWARE TARGET"),
            h("span", { class: `la-chip ${state.status === "completed" ? "pass" : state.status === "blocked" ? "fail" : "info"}` }, state.status || "IDLE")
          ),
          h("div", { class: "la-form-group" },
            h("label", { class: "la-form-label" }, "SELECT RUN CONTEXT"),
            h("select", {
              class: "la-select",
              value: snapshot.selectedRunId || "",
              onChange: (e) => client.selectRun(e.target.value)
            },
              runs.map(r => h("option", { value: r.id }, `${r.id} (${r.status || "unknown"}) - ${r.selectedProject || r.project || "target"}`))
            )
          ),
          h("div", { class: "la-kv-grid" },
            h("span", { class: "la-k" }, "Run ID:"),
            h("span", { class: "la-v" }, state.currentRunId || snapshot.selectedRunId || "NONE"),
            h("span", { class: "la-k" }, "Phase:"),
            h("span", { class: "la-v" }, state.phase || "idle"),
            h("span", { class: "la-k" }, "Objective:"),
            h("span", { class: "la-v" }, control.currentObjective?.text || state.task || state.currentTask || "None set"),
            h("span", { class: "la-k" }, "Repo Path:"),
            h("span", { class: "la-v" }, state.repoPath || "/home/mojo/projects/hermesswarmbuilder/hermesswarmbuilder")
          )
        ),

        // Blocker & Fault Interlock Deck
        currentBlocker ? h("div", { class: "la-card", style: "border-color:var(--la-red);" },
          h("div", { class: "la-card-title", style: "color:var(--la-red);" }, "FAULT INTERLOCK / BLOCKER TRIP"),
          h("div", { style: "color:#fca5a5;font-size:0.85rem;" }, currentBlocker.reason || currentBlocker.message || JSON.stringify(currentBlocker)),
          h("div", { style: "display:flex;gap:6px;margin-top:6px;" },
            h("button", {
              class: "la-btn danger xs",
              onClick: () => {
                const prompt = window.prompt("Enter deblock recovery instructions:", "Proceed with corrected test step");
                if (prompt) execCommand("deblock", { prompt, runId: state.currentRunId });
              }
            }, "OVERRIDE DEBLOCK"),
            h("button", {
              class: "la-btn xs",
              onClick: () => execCommand("deblock-advice", { prompt: "Analyze blocker fault and advise recovery", runId: state.currentRunId })
            }, "QUERY ADVICE")
          )
        ) : null,

        // Active Agent Pod Probes
        h("div", { class: "la-card" },
          h("div", { class: "la-card-title" }, `AGENT POD PROBES (${Object.keys(state.agents || {}).length})`),
          h("div", { style: "display:flex;flex-direction:column;gap:6px;" },
            Object.entries(state.agents || {}).length === 0 ?
              h("div", { style: "color:var(--la-text-dim);font-size:0.8rem;" }, "No agent telemetry pods connected.") :
              Object.entries(state.agents).map(([agentId, ag]) => h("div", {
                style: "background:#070a0e;border:1px solid #1a2536;padding:6px;border-radius:3px;"
              },
                h("div", { style: "display:flex;justify-content:space-between;align-items:center;" },
                  h("strong", { style: "color:var(--la-text-bright);" }, ag.label || agentId),
                  h("span", { class: `la-chip ${ag.status === "working" ? "info" : "pass"}` }, ag.status || "idle")
                ),
                h("div", { style: "color:var(--la-text-dim);font-size:0.78rem;margin-top:2px;" }, ag.currentTask || ag.lastMessage || "Standby")
              ))
          )
        ),

        // Quick Command Panel
        h("div", { class: "la-card" },
          h("div", { class: "la-card-title" }, "QUICK VECTOR DISPATCH"),
          h("div", { style: "display:grid;grid-template-columns:1fr 1fr;gap:6px;" },
            h("button", { class: "la-btn xs", onClick: () => execCommand("pause") }, "PAUSE RUN"),
            h("button", { class: "la-btn xs", onClick: () => execCommand("resume") }, "RESUME RUN"),
            h("button", { class: "la-btn xs primary", onClick: () => execCommand("run-now") }, "RUN NOW (WAKE)"),
            h("button", { class: "la-btn xs danger", onClick: () => { if (confirm("Stop active run execution?")) execCommand("stop"); } }, "STOP RUN")
          )
        )
      );
    }

    // 2. EVIDENCE & ARTIFACTS TAB
    if (activeTab === "evidence") {
      const artifacts = selectedRun.artifacts || [];
      const logs = selectedRun.logs || [];
      const iterations = snapshot.iterations || [];

      return h("div", { style: "display:flex;flex-direction:column;gap:12px;" },
        // Document Quick Access
        h("div", { class: "la-card" },
          h("div", { class: "la-card-title" }, "SPECIFICATION & DEVPLAN ROM"),
          h("div", { style: "display:flex;gap:6px;" },
            h("button", {
              class: "la-btn xs primary",
              onClick: async () => {
                try {
                  const doc = await client.loadDocument("spec");
                  openEvidenceModal(`SPECIFICATION (${doc.name})`, `Run: ${doc.runId}`, doc.text);
                } catch (e) { toast(e.message, "error"); }
              }
            }, "VIEW SPEC.MD"),
            h("button", {
              class: "la-btn xs primary",
              onClick: async () => {
                try {
                  const doc = await client.loadDocument("devplan");
                  openEvidenceModal(`DEVPLAN (${doc.name})`, `Run: ${doc.runId}`, doc.text);
                } catch (e) { toast(e.message, "error"); }
              }
            }, "VIEW DEVPLAN.MD"),
            h("button", {
              class: "la-btn xs",
              onClick: () => {
                if (selectedRun.run) openEvidenceModal(`RUN RECORD JSON`, `Run: ${snapshot.selectedRunId}`, JSON.stringify(selectedRun.run, null, 2));
                else toast("No run record loaded", "warn");
              }
            }, "RUN JSON")
          )
        ),

        // Iteration Scorecard
        iterations.length > 0 ? h("div", { class: "la-card" },
          h("div", { class: "la-card-title" }, `ITERATION SCORECARDS (${iterations.length})`),
          h("div", { style: "display:flex;flex-direction:column;gap:6px;" },
            iterations.map(it => h("div", {
              style: "background:#070a0e;border:1px solid #1a2536;padding:6px;border-radius:3px;"
            },
              h("div", { style: "display:flex;justify-content:space-between;align-items:center;" },
                h("strong", null, `Gen ${it.generation || 1}: ${it.objective || it.id}`),
                h("span", { class: "la-chip info" }, it.status || "evaluated")
              ),
              h("div", { style: "display:flex;gap:6px;margin-top:6px;" },
                h("button", {
                  class: "la-btn xs",
                  onClick: () => execCommand("continue-from-iteration", { sourceIterationId: it.id, sourceRunId: it.runId })
                }, "CONTINUE"),
                h("button", {
                  class: "la-btn xs",
                  onClick: () => execCommand("fork-from-iteration", { sourceIterationId: it.id, sourceRunId: it.runId })
                }, "FORK"),
                h("button", {
                  class: "la-btn xs",
                  onClick: () => execCommand("use-as-next-direction", { sourceIterationId: it.id, sourceRunId: it.runId })
                }, "USE DIRECTION")
              )
            ))
          )
        ) : null,

        // Artifacts Registry
        h("div", { class: "la-card" },
          h("div", { class: "la-card-title" }, `RUN ARTIFACTS REGISTRY (${artifacts.length})`),
          artifacts.length === 0 ?
            h("div", { style: "color:var(--la-text-dim);font-size:0.8rem;" }, "No artifacts found for selected run.") :
            h("div", { style: "display:flex;flex-direction:column;gap:4px;max-height:160px;overflow-y:auto;" },
              artifacts.map(art => {
                const name = typeof art === "string" ? art : art.name || art.path;
                return h("div", { style: "display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid #121924;" },
                  h("span", { style: "font-size:0.8rem;color:var(--la-text);" }, name),
                  h("button", {
                    class: "la-btn xs",
                    onClick: async () => {
                      try {
                        const res = await client.loadArtifact(name);
                        openEvidenceModal(`ARTIFACT: ${name}`, `Run: ${res.runId}`, res.text);
                      } catch (e) { toast(e.message, "error"); }
                    }
                  }, "INSPECT")
                );
              })
            )
        ),

        // Execution Logs
        h("div", { class: "la-card" },
          h("div", { class: "la-card-title" }, `EXECUTION LOGS (${logs.length})`),
          logs.length === 0 ?
            h("div", { style: "color:var(--la-text-dim);font-size:0.8rem;" }, "No logs recorded for selected run.") :
            h("div", { style: "display:flex;flex-direction:column;gap:4px;max-height:160px;overflow-y:auto;" },
              logs.map(log => {
                const name = typeof log === "string" ? log : log.name || log.path;
                return h("div", { style: "display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid #121924;" },
                  h("span", { style: "font-size:0.8rem;color:var(--la-text);" }, name),
                  h("button", {
                    class: "la-btn xs",
                    onClick: async () => {
                      try {
                        const res = await client.loadLog(name, undefined, { tail: 500 });
                        openEvidenceModal(`LOG TAIL: ${name}`, `Run: ${res.runId} | Tail 500 lines`, res.text);
                      } catch (e) { toast(e.message, "error"); }
                    }
                  }, "TAIL 500")
                );
              })
            )
        )
      );
    }

    // 3. PROJECT PLANS TAB
    if (activeTab === "plans") {
      const plans = snapshot.plans || [];
      return h("div", { style: "display:flex;flex-direction:column;gap:12px;" },
        h("div", { style: "display:flex;justify-content:space-between;align-items:center;" },
          h("h4", { style: "color:var(--la-cyan);font-size:0.9rem;" }, "PROJECT PLAN ROM REGISTRY"),
          h("div", { style: "display:flex;gap:4px;" },
            h("button", { class: "la-btn xs primary", onClick: () => createPlanDraft("classic") }, "+ CLASSIC"),
            h("button", { class: "la-btn xs primary", onClick: () => createPlanDraft("managed") }, "+ MANAGED")
          )
        ),

        activePlan ? h("div", { class: "la-card" },
          h("div", { class: "la-card-title" },
            h("span", null, `PLAN: ${activePlan.ledger?.planId || "DRAFT"}`),
            h("span", { class: "la-chip info" }, activePlan.ledger?.state || "draft")
          ),
          h("form", {
            id: "activePlanForm",
            onSubmit: (e) => {
              e.preventDefault();
              savePlanDraft();
            }
          },
            h("div", { class: "la-form-group" },
              h("label", { class: "la-form-label" }, "Title"),
              h("input", { class: "la-input", id: "planTitle", value: activePlan.revision?.content?.title || "" })
            ),
            h("div", { class: "la-form-group" },
              h("label", { class: "la-form-label" }, "Objective"),
              h("textarea", { class: "la-textarea", id: "planObjective" }, activePlan.revision?.content?.objective || "")
            ),
            h("div", { class: "la-form-group" },
              h("label", { class: "la-form-label" }, "Problem Definition"),
              h("textarea", { class: "la-textarea", id: "planProblem" }, activePlan.revision?.content?.problem || "")
            ),
            h("div", { class: "la-form-group" },
              h("label", { class: "la-form-label" }, "Intended Users"),
              h("textarea", { class: "la-textarea", id: "planUsers" }, activePlan.revision?.content?.intendedUsers || "")
            ),
            h("div", { class: "la-form-group" },
              h("label", { class: "la-form-label" }, "Bounded Scope"),
              h("textarea", { class: "la-textarea", id: "planScope" }, activePlan.revision?.content?.boundedScope || "")
            ),
            h("div", { class: "la-form-group" },
              h("label", { class: "la-form-label" }, "Repository Path"),
              h("input", { class: "la-input", id: "planRepo", value: activePlan.revision?.content?.repository?.path || "" })
            ),
            h("div", { style: "display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px;" },
              h("button", { type: "submit", class: "la-btn xs success" }, "SAVE REVISION"),
              h("button", {
                type: "button",
                class: "la-btn xs",
                onClick: () => executePlanAction("project-plan.ready-for-review")
              }, "READY FOR REVIEW"),
              h("button", {
                type: "button",
                class: "la-btn xs primary",
                onClick: () => executePlanAction("project-plan.approve")
              }, "APPROVE PLAN"),
              h("button", {
                type: "button",
                class: "la-btn xs danger",
                onClick: () => {
                  const notes = window.prompt("Enter rejection reason / decision notes:");
                  if (notes) executePlanAction("project-plan.reject", { notes });
                }
              }, "REJECT PLAN"),
              h("button", {
                type: "button",
                class: "la-btn xs action",
                onClick: () => {
                  if (confirm("Launch approved plan into runner pipeline?")) executePlanAction("project-plan.launch");
                }
              }, "LAUNCH PLAN"),
              h("button", {
                type: "button",
                class: "la-btn xs",
                onClick: () => executePlanAction("project-plan.clone")
              }, "CLONE PLAN"),
              h("button", {
                type: "button",
                class: "la-btn xs",
                onClick: () => executePlanAction("project-plan.fork")
              }, "FORK PLAN"),
              h("button", {
                type: "button",
                class: "la-btn xs danger",
                onClick: () => {
                  if (confirm("Archive this project plan?")) executePlanAction("project-plan.archive");
                }
              }, "ARCHIVE PLAN")
            )
          )
        ) : null,

        // Plan Registry Table
        h("div", { class: "la-card" },
          h("div", { class: "la-card-title" }, `STORED PLANS (${plans.length})`),
          plans.length === 0 ?
            h("div", { style: "color:var(--la-text-dim);font-size:0.8rem;" }, "No plans registered in ROM.") :
            h("div", { style: "display:flex;flex-direction:column;gap:6px;" },
              plans.map(p => h("div", {
                style: "background:#070a0e;border:1px solid #1a2536;padding:6px;border-radius:3px;cursor:pointer;",
                onClick: () => selectPlan(p.planId)
              },
                h("div", { style: "display:flex;justify-content:space-between;align-items:center;" },
                  h("strong", { style: "color:var(--la-text-bright);" }, p.title || p.planId),
                  h("span", { class: `la-chip ${p.state === "approved" ? "pass" : "info"}` }, p.state || "draft")
                ),
                h("div", { style: "color:var(--la-text-dim);font-size:0.75rem;margin-top:2px;" }, `${p.pipelineType || "classic"} | Rev ${p.currentRevision || 1}`)
              ))
            )
        )
      );
    }

    // 4. AI COPILOT TAB
    if (activeTab === "assist") {
      const assists = snapshot.assistance || [];
      return h("div", { style: "display:flex;flex-direction:column;gap:12px;" },
        h("div", { style: "display:flex;justify-content:space-between;align-items:center;" },
          h("h4", { style: "color:var(--la-cyan);font-size:0.9rem;" }, "AI PLANNING COPILOT"),
          h("div", { style: "display:flex;gap:4px;" },
            h("button", { class: "la-btn xs primary", onClick: () => startAssistSession("classic") }, "+ CLASSIC COPILOT"),
            h("button", { class: "la-btn xs primary", onClick: () => startAssistSession("managed") }, "+ MANAGED COPILOT")
          )
        ),

        activeAssistance ? h("div", { class: "la-card" },
          h("div", { class: "la-card-title" },
            h("span", null, `SESSION: ${activeAssistance.id.slice(0, 16)}...`),
            h("span", { class: "la-chip warn" }, activeAssistance.pipelineType)
          ),
          h("div", { style: "max-height:220px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;padding:4px;" },
            (activeAssistance.messages || []).map(m => h("div", {
              style: `padding:6px;border-radius:4px;font-size:0.8rem;background:${m.role === "user" ? "#0f2338" : "#111b26"};border:1px solid ${m.role === "user" ? "#1e4975" : "#1a2c3d"};`
            },
              h("strong", { style: `color:${m.role === "user" ? "var(--la-cyan)" : "var(--la-magenta)"};display:block;margin-bottom:2px;` }, m.role === "user" ? "OPERATOR" : "HERMES COPILOT"),
              h("div", { style: "white-space:pre-wrap;color:var(--la-text);" }, m.content)
            ))
          ),
          h("form", {
            style: "display:flex;gap:6px;margin-top:6px;",
            onSubmit: async (e) => {
              e.preventDefault();
              const inp = $("assistInput");
              if (!inp || !inp.value.trim()) return;
              try {
                const updated = await client.messagePlanAssistance(activeAssistance.id, activeAssistance.version || 1, inp.value.trim());
                activeAssistance = updated;
                inp.value = "";
                renderInspector();
              } catch (err) { toast(err.message, "error"); }
            }
          },
            h("input", { id: "assistInput", class: "la-input", placeholder: "Ask Copilot to refine plan objectives, boundaries...", style: "flex:1;" }),
            h("button", { type: "submit", class: "la-btn xs primary" }, "SEND")
          ),
          activeAssistance.proposedContent ? h("div", { style: "margin-top:8px;border-top:1px solid #1a2536;padding-top:8px;" },
            h("button", {
              class: "la-btn xs success",
              style: "width:100%;",
              onClick: async () => {
                try {
                  const res = await client.createProjectPlan({ content: activeAssistance.proposedContent });
                  toast("Proposal converted to project plan draft", "info");
                  await client.refreshPlans();
                  selectPlan(res.planId);
                } catch (e) { toast(e.message, "error"); }
              }
            }, "APPLY PROPOSAL TO PROJECT PLAN")
          ) : null
        ) : null,

        // Saved Copilot Sessions
        h("div", { class: "la-card" },
          h("div", { class: "la-card-title" }, `CONVERSATION SESSIONS (${assists.length})`),
          assists.length === 0 ?
            h("div", { style: "color:var(--la-text-dim);font-size:0.8rem;" }, "No active assistant threads.") :
            h("div", { style: "display:flex;flex-direction:column;gap:6px;" },
              assists.map(a => h("div", {
                style: "background:#070a0e;border:1px solid #1a2536;padding:6px;border-radius:3px;cursor:pointer;",
                onClick: async () => {
                  try {
                    activeAssistance = await client.getPlanAssistance(a.id);
                    renderInspector();
                  } catch (e) { toast(e.message, "error"); }
                }
              },
                h("div", { style: "display:flex;justify-content:space-between;align-items:center;" },
                  h("strong", null, a.id.slice(0, 20)),
                  h("span", { class: "la-chip warn" }, a.pipelineType)
                ),
                h("div", { style: "color:var(--la-text-dim);font-size:0.75rem;margin-top:2px;" }, `${a.messageCount || 0} messages`)
              ))
            )
        )
      );
    }

    return null;
  })();

  render(content, container);
}

// Plan Management Handlers
async function selectPlan(planId) {
  try {
    activePlan = await client.getProjectPlan(planId);
    activeTab = "plans";
    document.querySelectorAll(".la-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === "plans"));
    renderInspector();
  } catch (e) { toast(e.message, "error"); }
}

async function createPlanDraft(pipelineType) {
  try {
    const title = window.prompt("New Project Plan Title:", "Hardware Synthesis Subsystem");
    if (!title) return;
    const res = await client.createProjectPlan({
      content: {
        pipelineType,
        title,
        problem: "Automated hardware orchestration and validation",
        intendedUsers: "Engineers & System Operators",
        objective: "Establish verified logic synthesis pipeline",
        boundedScope: "Logic analyzer and swarm telemetry modules",
        requirements: ["Real-time trace capture", "Fault deblocking"],
        nonGoals: ["Legacy migration"],
        constraints: ["Zero CDN dependencies"],
        risks: ["Timing skew"],
        repository: { path: "/home/mojo/projects/hermesswarmbuilder/hermesswarmbuilder", baseRef: "HEAD" },
        acceptanceGates: [],
        validationPolicy: { id: "apb.runner-selected.v1", expectations: [] },
        limits: { maxIterations: 10, maxVariantsPerIteration: 3, maxParallelVariants: 3, maxAcceptedFeatures: 4, maxVisualMotifChanges: 1, maxNewSections: 1, stopAfterNoImprovement: 1 }
      }
    });
    toast("Draft plan created", "info");
    await client.refreshPlans();
    selectPlan(res.planId);
  } catch (e) { toast(e.message, "error"); }
}

async function savePlanDraft() {
  if (!activePlan) return;
  const planId = activePlan.ledger?.planId;
  const content = {
    ...activePlan.revision.content,
    title: $("planTitle")?.value || "",
    objective: $("planObjective")?.value || "",
    problem: $("planProblem")?.value || "",
    intendedUsers: $("planUsers")?.value || "",
    boundedScope: $("planScope")?.value || "",
    repository: {
      ...activePlan.revision.content.repository,
      path: $("planRepo")?.value || null
    }
  };
  try {
    await client.updateProjectPlan({ planId, content });
    toast("Plan revision saved", "info");
    await client.refreshPlans();
    selectPlan(planId);
  } catch (e) { toast(e.message, "error"); }
}

async function executePlanAction(actionType, extra = {}) {
  if (!activePlan) return;
  const planId = activePlan.ledger?.planId;
  const expectedVersion = activePlan.ledger?.version;
  const payload = {
    planId,
    revision: activePlan.ledger?.currentRevision,
    planDigest: activePlan.ledger?.currentDigest,
    ...extra
  };
  try {
    const res = await client.projectPlanCommand(actionType, payload, { expectedVersion, refresh: true });
    toast(`${actionType} accepted`, "info");
    await client.refreshPlans();
    if (res?.planId) selectPlan(res.planId);
    else selectPlan(planId);
  } catch (e) { toast(`Plan action error: ${e.message}`, "error"); }
}

async function startAssistSession(pipelineType) {
  try {
    const s = await client.createPlanAssistance(pipelineType);
    activeAssistance = s;
    toast(`AI Copilot initialized: ${s.id}`, "info");
    renderInspector();
  } catch (e) { toast(e.message, "error"); }
}

// Pattern Generator Modal (Operation Commands Station)
function renderPatternGen() {
  const container = $("patternGenContent");
  if (!container) return;

  const control = snapshot.control || {};
  const queue = snapshot.queue || { items: [] };
  const gates = snapshot.gates || { gates: [] };
  const target = Math.min(10, Math.max(1, Number(control.autoIteration?.targetGenerations || 10)));

  const content = h("div", { style: "display:flex;flex-direction:column;gap:14px;" },
    // 1. Run Authority Vector Controls
    h("div", { class: "la-card" },
      h("div", { class: "la-card-title" }, "1. RUN AUTHORITY VECTOR MATRIX"),
      h("div", { style: "display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;" },
        h("button", { class: "la-btn", onClick: () => execCommand("pause") }, "PAUSE RUN"),
        h("button", { class: "la-btn", onClick: () => execCommand("resume") }, "RESUME RUN"),
        h("button", { class: "la-btn", onClick: () => execCommand("hold") }, "HOLD NEXT RUNS"),
        h("button", { class: "la-btn", onClick: () => execCommand("unhold") }, "RELEASE HOLD"),
        h("button", { class: "la-btn primary", onClick: () => execCommand("run-now") }, "RUN NOW (WAKE)"),
        h("button", { class: "la-btn danger", onClick: () => { if (confirm("Stop active run execution?")) execCommand("stop"); } }, "STOP RUN")
      )
    ),

    // 2. Showcase Autoloop Matrix
    h("div", { class: "la-card" },
      h("div", { class: "la-card-title" }, "2. SHOWCASE AUTOLOOP GENERATOR (1-10)"),
      h("div", { style: "display:flex;align-items:center;gap:10px;margin-bottom:8px;" },
        h("span", { class: "la-form-label" }, "Target Generations:"),
        h("input", {
          id: "showcaseSlider",
          type: "range",
          min: "1",
          max: "10",
          value: target,
          style: "flex:1;accent-color:var(--la-cyan);",
          onInput: (e) => { $("showcaseVal").textContent = e.target.value; }
        }),
        h("span", { id: "showcaseVal", style: "font-weight:700;color:var(--la-cyan);min-width:30px;" }, target)
      ),
      h("div", { style: "display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;" },
        h("button", {
          class: "la-btn primary xs",
          onClick: () => {
            const gen = Number($("showcaseSlider").value);
            execCommand("start-showcase-loop", {
              targetGenerations: gen,
              sourceRunId: snapshot.state?.currentRunId || snapshot.selectedRunId,
              repoPath: snapshot.state?.repoPath || "/home/mojo/autonomous-projects/hermes-showcase-site",
              objective: control.currentObjective?.text || "Generate comprehensive feature iterations"
            });
          }
        }, "START SHOWCASE LOOP"),
        h("button", { class: "la-btn xs", onClick: () => execCommand("pause-showcase-loop") }, "PAUSE LOOP"),
        h("button", { class: "la-btn xs", onClick: () => execCommand("resume-showcase-loop") }, "RESUME LOOP"),
        h("button", { class: "la-btn danger xs", onClick: () => execCommand("stop-showcase-loop") }, "STOP LOOP"),
        h("button", { class: "la-btn xs", onClick: () => execCommand("set-showcase-target", { targetGenerations: Number($("showcaseSlider").value) }) }, "SET TARGET"),
        h("button", { class: "la-btn xs action", onClick: () => execCommand("start-next-iteration", { objective: "Proceed to next bounded generation" }) }, "NEXT ITERATION")
      )
    ),

    // 3. Deblock & Steering Directives
    h("div", { class: "la-card" },
      h("div", { class: "la-card-title" }, "3. DEBLOCK & STEERING DIRECTIVES"),
      h("div", { style: "display:flex;gap:6px;margin-bottom:8px;" },
        h("input", { id: "cmdSteerText", class: "la-input", placeholder: "Directive text (e.g. Focus on UI layout and error states)", style: "flex:1;" }),
        h("select", { id: "cmdSteerPriority", class: "la-select" },
          h("option", { value: "required" }, "Required"),
          h("option", { value: "advisory" }, "Advisory")
        ),
        h("button", {
          class: "la-btn xs primary",
          onClick: () => {
            const text = $("cmdSteerText").value.trim();
            if (text) {
              execCommand("steer", { text, priority: $("cmdSteerPriority").value, scope: "next_run" });
              $("cmdSteerText").value = "";
            }
          }
        }, "STEER")
      ),
      h("div", { style: "display:flex;gap:6px;" },
        h("input", { id: "cmdObjectiveText", class: "la-input", placeholder: "Set current objective headline...", style: "flex:1;" }),
        h("button", {
          class: "la-btn xs",
          onClick: () => {
            const text = $("cmdObjectiveText").value.trim();
            if (text) {
              execCommand("set-current-objective", { text });
              $("cmdObjectiveText").value = "";
            }
          }
        }, "SET OBJECTIVE")
      )
    ),

    // 4. Priority Queue & Acceptance Gates
    h("div", { class: "la-card" },
      h("div", { class: "la-card-title" }, "4. PRIORITY QUEUE & ACCEPTANCE GATES"),
      h("div", { style: "display:grid;grid-template-columns:1fr 1fr;gap:8px;" },
        h("button", {
          class: "la-btn xs primary",
          onClick: () => {
            const title = window.prompt("Enter task brief title:");
            if (title) execCommand("add-queue-item", { title, priority: 50, objective: title });
          }
        }, "+ ADD QUEUE ITEM"),
        h("button", {
          class: "la-btn xs danger",
          onClick: () => { if (confirm("Clear all queued briefs?")) execCommand("clear-queue"); }
        }, "CLEAR QUEUE"),
        h("button", {
          class: "la-btn xs action",
          onClick: () => {
            const id = window.prompt("Gate ID (e.g. GATE-VERIFY):", "GATE-SYNTH");
            const desc = window.prompt("Gate Description:", "Verify synthesis passes timing");
            if (id && desc) execCommand("add-gate", { id, description: desc, severity: "must", phase: "final-audit" });
          }
        }, "+ ADD ACCEPTANCE GATE"),
        h("button", {
          class: "la-btn xs",
          onClick: () => {
            const gateId = window.prompt("Gate ID to pass:", "GATE-SYNTH");
            if (gateId) execCommand("gate-decision", { gateId, status: "passed", decision: "accepted" });
          }
        }, "PASS GATE")
      )
    )
  );

  render(content, container);
}

// Hardware Help Manual Modal Content
function renderHelpManual() {
  const container = $("helpManualContent");
  if (!container) return;
  container.innerHTML = `
    <h4>1. INSTRUMENTATION METAPHOR & BUS PROBES</h4>
    <p>The TLA7000 Logic Analyzer models Hermes Swarm operations as a high-speed digital state machine with probe pods:</p>
    <ul>
      <li><strong style="color:var(--la-cyan);">POD0 (CLK_SSE)</strong>: Clock signal synchronized with real-time SSE stream events and heartbeats.</li>
      <li><strong style="color:var(--la-amber);">POD1 (PHASE_BUS)</strong>: Decoded workflow state bus rendered with chamfered packet envelopes.</li>
      <li><strong style="color:var(--la-green);">POD2 (ORCHESTRATOR)</strong>: Digital square wave indicating orchestrator execution.</li>
      <li><strong style="color:#38bdf8;">POD3 (AGENT_WORKERS)</strong>: Multi-channel digital activity lines for subagents (coder, reviewer, tester).</li>
      <li><strong style="color:var(--la-magenta);">POD4 (TOOL_IO_BUS)</strong>: Protocol disassembler tracking discrete tool calls (terminal, read_file, patch).</li>
      <li><strong style="color:var(--la-red);">POD5 (BLOCK_GLITCH)</strong>: Hardware glitch fault sensor firing high on blocker/hold conditions.</li>
      <li><strong style="color:var(--la-purple);">POD6 (GATE_EVAL)</strong>: Real-time verification gate status line.</li>
      <li><strong style="color:#fb923c;">POD7 (QUEUE_STROBE)</strong>: Strobe indicator pulsed on priority queue item transitions.</li>
    </ul>

    <h4>2. MEASUREMENT CURSORS & TIMEBASE</h4>
    <p>Use Cursors <strong style="color:var(--la-cyan);">C1</strong> and <strong style="color:var(--la-magenta);">C2</strong> to perform precision delta-time (Δt) and frequency (f = 1/Δt) measurements across event bursts. Click and drag handles or use the HUD controls to snap to trigger T0.</p>

    <h4>3. KEYBOARD SHORTCUTS</h4>
    <ul>
      <li><kbd>Space</kbd> : Toggle Live Telemetry Run / Stop (Pause / Resume).</li>
      <li><kbd>T</kbd> : Single Trigger Resync / Refresh.</li>
      <li><kbd>C</kbd> : Open Pattern Generator & Operator Command Station.</li>
      <li><kbd>P</kbd> : Switch to Project Plan ROM Registry.</li>
      <li><kbd>H</kbd> : Open Hardware Manual & Help.</li>
      <li><kbd>ArrowUp</kbd> / <kbd>ArrowDown</kbd> : Zoom In / Out Waveform Timebase.</li>
      <li><kbd>Esc</kbd> : Dismiss active modals and dialogs.</li>
    </ul>
  `;
}

// Global Event Listeners & Tab Handlers
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

$("btnHelp")?.addEventListener("click", () => {
  renderHelpManual();
  $("helpManualDialog")?.showModal();
});
$("btnCloseHelp")?.addEventListener("click", () => $("helpManualDialog")?.close());

// Timebase Zoom Controls
$("btnZoomIn")?.addEventListener("click", () => {
  timeWindow = Math.max(0.5, timeWindow * 0.7);
  $("zoomDisplay").textContent = `${timeWindow.toFixed(1)} s/div`;
  drawWaveforms();
});
$("btnZoomOut")?.addEventListener("click", () => {
  timeWindow = Math.min(30, timeWindow * 1.4);
  $("zoomDisplay").textContent = `${timeWindow.toFixed(1)} s/div`;
  drawWaveforms();
});
$("btnResetCursors")?.addEventListener("click", () => {
  cursor1Ratio = 0.25;
  cursor2Ratio = 0.75;
  drawWaveforms();
});
$("btnSnapTrigger")?.addEventListener("click", () => {
  cursor1Ratio = 0.95;
  drawWaveforms();
});

// State Listing Filters & Search
$("listingSearch")?.addEventListener("input", (e) => {
  searchQuery = e.target.value;
  updateStateListing();
});

document.querySelectorAll(".la-filter-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".la-filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    filterKind = btn.dataset.filter;
    updateStateListing();
  });
});

// Global Keyboard Shortcuts
window.addEventListener("keydown", (e) => {
  if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
  if (e.code === "Space") {
    e.preventDefault();
    $("btnRunStop")?.click();
  } else if (e.key === "t" || e.key === "T") {
    $("btnSingle")?.click();
  } else if (e.key === "c" || e.key === "C") {
    $("btnCommands")?.click();
  } else if (e.key === "p" || e.key === "P") {
    $("btnPlanning")?.click();
  } else if (e.key === "h" || e.key === "H") {
    $("btnHelp")?.click();
  } else if (e.key === "ArrowUp") {
    $("btnZoomIn")?.click();
  } else if (e.key === "ArrowDown") {
    $("btnZoomOut")?.click();
  }
});

// Headless Client State Subscription
client.subscribe((snap) => {
  snapshot = snap;
  const state = snapshot.state || {};
  const phase = state.phase || state.status || "IDLE";

  const badge = $("phaseBadge");
  if (badge) {
    badge.textContent = phase.toUpperCase();
    badge.className = `la-chip ${phase.includes("block") ? "fail" : phase === "completed" ? "pass" : "info"}`;
  }
  const runBadge = $("currentRunBadge");
  if (runBadge) runBadge.textContent = state.currentRunId || snapshot.selectedRunId || "NONE";

  const lamp = $("connectionLamp");
  if (lamp) {
    lamp.className = `la-lamp ${snapshot.connection?.status === "connected" ? "active" : snapshot.connection?.status === "polling" ? "stale" : "error"}`;
  }
  const connText = $("connectionText");
  if (connText) connText.textContent = snapshot.connection?.status?.toUpperCase() || "DISCONNECTED";

  const depthText = $("bufferDepthText");
  if (depthText) depthText.textContent = `${samples.length} / ${maxSamples}`;

  // Ingest state sample
  recordSample({ type: "snapshot-sync", data: { phase, status: state.status, runId: state.currentRunId } });
  renderInspector();
});

// Real-Time Event Subscription
client.connect().catch(() => {});
client.refresh();

// 60FPS High-DPI Animation Loop
function animationLoop() {
  drawWaveforms();
  requestAnimationFrame(animationLoop);
}

resizeCanvas();
requestAnimationFrame(animationLoop);
