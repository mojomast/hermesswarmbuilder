import { createDashboardClient, WORKFLOW_PHASES, OPERATION_COMMANDS, PROJECT_PLAN_ACTIONS } from "../../headless-dashboard-client.js";
import m from "../../vendor/mithril.js";

// DOM Selector shorthand
const $ = (id) => document.getElementById(id);
const client = createDashboardClient({ maxEvents: 1000, eventLimit: 500, pollIntervalMs: 4000 });

// State Management
let snapshot = client.getSnapshot();
let activeCmdTab = "runctrl";
let activePlanTab = "list";
let activeEvidenceTab = "spec";
let telemetryFilter = "all";
let selectedPlanId = null;
let selectedPlanDetail = null;
let selectedAssistanceId = null;
let assistanceDetail = null;
let selectedToolEvent = null;
let selectedFuelAssemblyId = "FA-01";

// Full client method bindings for complete feature coverage & smoke validation
export const actions = {
  selectRun: (runId) => client.selectRun(runId),
  selectIteration: (iterationId) => client.selectIteration(iterationId),
  loadArtifact: (name, runId) => client.loadArtifact(name, runId),
  loadLog: (name, runId, options) => client.loadLog(name, runId, options),
  loadDocument: (kind, runId) => client.loadDocument(kind, runId),
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

// Utilities
const esc = (str) => String(str ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]);
const json = (val) => { try { return JSON.stringify(val, null, 2); } catch { return String(val); } };
const lines = (val) => String(val || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const fmtDate = (d) => { if (!d) return "None"; const dt = new Date(d); return Number.isNaN(dt.valueOf()) ? String(d) : dt.toLocaleString(); };

function toast(msg, type = "info") {
  const el = $("rcToast");
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  el.style.background = type === "error" ? "#7f1d1d" : type === "warn" ? "#78350f" : "#0369a1";
  el.style.border = `1px solid ${type === "error" ? "#ef4444" : type === "warn" ? "#f59e0b" : "#00e5ff"}`;
  clearTimeout(el.__timer);
  el.__timer = setTimeout(() => { el.hidden = true; }, 4000);
}

// -------------------------------------------------------------
// 61-Element Hexagonal Core Lattice SVG Generator
// -------------------------------------------------------------
function renderHexCore() {
  const svg = $("hexCoreSvg");
  if (!svg) return;

  const hexRadius = 24;
  const hexHeight = hexRadius * 2;
  const cx = 300;
  const cy = 270;

  let hexElements = [];
  let idCounter = 1;
  const isBlocked = !!(snapshot.state?.block || snapshot.state?.blocker || snapshot.state?.hold);

  // Center hex: Ring 0 (FA-01)
  hexElements.push({
    id: `FA-01`,
    ring: 0,
    x: cx,
    y: cy,
    flux: isBlocked ? 0.22 : 0.96,
    power: isBlocked ? 8.2 : 38.4,
    burnup: 14250,
    temp: isBlocked ? 285.0 : 318.4
  });

  // Rings 1 to 4 (6 + 12 + 18 + 24 = 60 + 1 = 61 total assemblies)
  for (let ring = 1; ring <= 4; ring++) {
    const count = ring * 6;
    for (let i = 0; i < count; i++) {
      idCounter++;
      const id = `FA-${String(idCounter).padStart(2, "0")}`;
      const angle = ((i * 360) / count) * (Math.PI / 180);
      const dist = ring * (hexHeight * 0.78);
      const x = cx + dist * Math.cos(angle);
      const y = cy + dist * Math.sin(angle);
      const baseFlux = isBlocked ? 0.2 : Math.max(0.25, 1.0 - (ring * 0.16) + (Math.sin(idCounter * 1.5) * 0.08));

      hexElements.push({
        id,
        ring,
        x,
        y,
        flux: baseFlux,
        power: (baseFlux * 40.0).toFixed(1),
        burnup: 8000 + (idCounter * 180),
        temp: (290 + (baseFlux * 30)).toFixed(1)
      });
    }
  }

  // Draw SVG Elements
  svg.innerHTML = `
    <defs>
      <polygon id="hexShape" points="0,-22 19,-11 19,11 0,22 -19,11 -19,-11" />
    </defs>
    <!-- Core Boundary Ring & Flux Contours -->
    <circle cx="${cx}" cy="${cy}" r="225" fill="none" stroke="#1a2a3d" stroke-width="3" stroke-dasharray="6,4" />
    <circle cx="${cx}" cy="${cy}" r="170" fill="none" stroke="#131f2f" stroke-width="1.5" />
    <circle cx="${cx}" cy="${cy}" r="115" fill="none" stroke="#131f2f" stroke-width="1.5" />
    <circle cx="${cx}" cy="${cy}" r="60" fill="none" stroke="#131f2f" stroke-width="1.5" />

    ${hexElements.map(h => {
      const isSelected = h.id === selectedFuelAssemblyId;
      const color = isBlocked ? "#ef4444" : h.flux > 0.8 ? "#00e5ff" : h.flux > 0.5 ? "#10b981" : "#f59e0b";
      const fill = isSelected ? "rgba(0, 229, 255, 0.25)" : "#070c12";
      const strokeWidth = isSelected ? 3 : 1.5;

      return `
        <g transform="translate(${h.x}, ${h.y})" style="cursor:pointer;" data-fa-id="${h.id}" data-fa-ring="${h.ring}" data-fa-flux="${h.flux.toFixed(2)}" data-fa-power="${h.power}" data-fa-burnup="${h.burnup}" data-fa-temp="${h.temp}">
          <use href="#hexShape" fill="${fill}" stroke="${color}" stroke-width="${strokeWidth}" />
          <text text-anchor="middle" dy="4" fill="${color}" font-family="JetBrains Mono, monospace" font-size="8.5" font-weight="bold">${h.id}</text>
        </g>
      `;
    }).join("")}
  `;
}

// -------------------------------------------------------------
// Safety Parameter Display System (SPDS) 8-Axis Radar Polygon
// -------------------------------------------------------------
const spds = $("spdsCanvas");
const spdsCtx = spds ? spds.getContext("2d") : null;

const SPDS_PARAMETERS = [
  { name: "Reactivity", key: "reactivity", min: 0, max: 1 },
  { name: "Core Heat", key: "heat", min: 0, max: 1 },
  { name: "RCS Press", key: "rcs", min: 0, max: 1 },
  { name: "Containment", key: "containment", min: 0, max: 1 },
  { name: "Sec Sink", key: "sink", min: 0, max: 1 },
  { name: "Radiation", key: "radiation", min: 0, max: 1 },
  { name: "Swarm Health", key: "swarm", min: 0, max: 1 },
  { name: "Gate Compliance", key: "gates", min: 0, max: 1 }
];

function resizeSpds() {
  const dpr = window.devicePixelRatio || 1;
  if (spds && spds.parentElement) {
    const rect = spds.parentElement.getBoundingClientRect();
    spds.width = rect.width * dpr;
    spds.height = rect.height * dpr;
    spdsCtx?.scale(dpr, dpr);
  }
}
window.addEventListener("resize", resizeSpds);

function drawSpds() {
  if (!spds || !spdsCtx || !spds.parentElement) return;
  const w = spds.parentElement.getBoundingClientRect().width;
  const h = spds.parentElement.getBoundingClientRect().height;
  if (w === 0 || h === 0) return;

  spdsCtx.clearRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(cx, cy) - 26;
  const isBlocked = !!(snapshot.state?.block || snapshot.state?.blocker || snapshot.state?.hold);

  // Background Web Concentric Octagons
  for (let rStep = 1; rStep <= 4; rStep++) {
    const r = (radius / 4) * rStep;
    spdsCtx.strokeStyle = "#131f2f";
    spdsCtx.lineWidth = 1;
    spdsCtx.beginPath();
    for (let i = 0; i < 8; i++) {
      const angle = (i * 45) * (Math.PI / 180) - Math.PI / 2;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) spdsCtx.moveTo(x, y);
      else spdsCtx.lineTo(x, y);
    }
    spdsCtx.closePath();
    spdsCtx.stroke();
  }

  // 8 Axis Radial Spokes & Parameter Labels
  spdsCtx.strokeStyle = "#1a2a3d";
  spdsCtx.fillStyle = "#94a3b8";
  spdsCtx.font = "8px JetBrains Mono, monospace";

  for (let i = 0; i < 8; i++) {
    const angle = (i * 45) * (Math.PI / 180) - Math.PI / 2;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    spdsCtx.beginPath();
    spdsCtx.moveTo(cx, cy);
    spdsCtx.lineTo(x, y);
    spdsCtx.stroke();

    const lx = cx + (radius + 14) * Math.cos(angle);
    const ly = cy + (radius + 14) * Math.sin(angle);
    spdsCtx.textAlign = Math.abs(Math.cos(angle)) < 0.2 ? "center" : Math.cos(angle) > 0 ? "left" : "right";
    spdsCtx.fillText(SPDS_PARAMETERS[i].name, lx, ly + 3);
  }

  // Draw Dynamic SPDS State Polygon
  const polyColor = isBlocked ? "#ef4444" : "#00e5ff";
  const polyFill = isBlocked ? "rgba(239, 68, 68, 0.25)" : "rgba(0, 229, 255, 0.2)";

  spdsCtx.strokeStyle = polyColor;
  spdsCtx.fillStyle = polyFill;
  spdsCtx.lineWidth = 2;
  spdsCtx.beginPath();

  for (let i = 0; i < 8; i++) {
    const angle = (i * 45) * (Math.PI / 180) - Math.PI / 2;
    const baseVal = isBlocked ? 0.35 + (Math.sin(Date.now() * 0.003 + i) * 0.1) : 0.88 + (Math.sin(Date.now() * 0.001 + i) * 0.05);
    const r = radius * Math.max(0.1, Math.min(1.0, baseVal));
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) spdsCtx.moveTo(x, y);
    else spdsCtx.lineTo(x, y);
  }
  spdsCtx.closePath();
  spdsCtx.fill();
  spdsCtx.stroke();
}

// -------------------------------------------------------------
// UI Renderers for All 9 Core Features
// -------------------------------------------------------------

function renderHeader(snap) {
  const conn = snap.connection || {};
  const isBlocked = !!(snap.state?.block || snap.state?.blocker || snap.state?.hold);

  const linkEl = $("connectionStatus");
  if (linkEl) {
    linkEl.textContent = conn.paused ? "STREAM PAUSED" : `${(conn.status || "DISCONNECTED").toUpperCase()} (${(conn.transport || "SSE").toUpperCase()})`;
    linkEl.style.color = conn.paused ? "var(--rc-flux-amber)" : conn.status === "connected" ? "var(--rc-flux-green)" : "var(--rc-flux-red)";
  }

  const streamBtn = $("btnStreamToggle");
  if (streamBtn) streamBtn.textContent = conn.paused ? "RESUME STREAM" : "PAUSE STREAM";

  const tripEl = $("rpsTripStatus");
  if (tripEl) {
    tripEl.textContent = isBlocked ? "SCRAM / TRIPPED" : "ARMED / NORMAL";
    tripEl.style.color = isBlocked ? "var(--rc-flux-red)" : "var(--rc-flux-green)";
  }

  const powerEl = $("thermalPower");
  if (powerEl) powerEl.textContent = isBlocked ? "0.0% (SCRAMMED)" : "100.0% (3,400 MWth)";

  const badgeEl = $("spdsStatusBadge");
  if (badgeEl) {
    badgeEl.textContent = isBlocked ? "RPS TRIP ALARM" : "CLASS 1E NORMAL";
    badgeEl.className = `rc-badge ${isBlocked ? "danger" : "success"}`;
  }
}

function renderWorkflow(snap) {
  const phase = snap.state?.phase || "idle";
  const isBlocked = !!(snap.state?.block || snap.state?.blocker || snap.state?.hold);
  const currentRunId = snap.selectedRunId || snap.state?.currentRunId || "NONE";

  const phaseEl = $("rcPhase");
  if (phaseEl) {
    phaseEl.textContent = phase.toUpperCase();
    phaseEl.style.color = isBlocked ? "var(--rc-flux-red)" : "var(--rc-flux-green)";
  }

  const runEl = $("rcActiveRun");
  if (runEl) runEl.textContent = `RUN: ${currentRunId}`;

  const track = $("workflowPhases");
  if (track) {
    const currentIndex = WORKFLOW_PHASES.indexOf(phase);
    track.innerHTML = WORKFLOW_PHASES.map((p, idx) => {
      const cls = idx < currentIndex ? "past" : idx === currentIndex ? "current" : "";
      return `<span class="rc-phase-step ${cls}" role="listitem">${p}</span>`;
    }).join("");
  }

  const banner = $("rcBlockerBanner");
  if (banner) {
    if (isBlocked) {
      banner.hidden = false;
      const bInfo = snap.state?.block || snap.state?.blocker || snap.state?.hold || {};
      $("rcBlockerText").textContent = bInfo.reason || bInfo.message || "RPS SAFETY TRIP INTERLOCK TRIPPED: Reactor core deblock required.";
    } else {
      banner.hidden = true;
    }
  }
}

function renderRunsAndAgents(snap) {
  const runs = snap.runs || [];
  const runSelect = $("runSelect");
  if (runSelect) {
    const selected = snap.selectedRunId || snap.state?.currentRunId || "";
    runSelect.innerHTML = `<option value="">No run loaded</option>` + runs.map(r => `
      <option value="${esc(r.id)}" ${r.id === selected ? "selected" : ""}>
        ${esc(r.id)} [${esc(r.status || "idle")}] - ${esc(r.selectedProject || r.project || "default")}
      </option>
    `).join("");
  }
  if ($("runCount")) $("runCount").textContent = runs.length;

  const currentRun = snap.selectedRun?.run || runs.find(r => r.id === snap.selectedRunId) || {};
  if ($("runCardId")) $("runCardId").textContent = currentRun.id || "None";
  if ($("runCardProject")) $("runCardProject").textContent = currentRun.selectedProject || currentRun.project || "None";
  if ($("runCardStatus")) $("runCardStatus").textContent = currentRun.status || "Idle";
  if ($("runCardTask")) $("runCardTask").textContent = currentRun.task || currentRun.objective || "No task reported";

  const rawAgents = snap.state?.agents || {};
  const agents = Array.isArray(rawAgents) ? rawAgents : Object.values(rawAgents);
  const agentList = $("agentList");
  if (agentList) {
    if (!agents.length) {
      agentList.innerHTML = `<div class="rc-dim" style="padding:0.5rem;text-align:center;">No swarm control rods active.</div>`;
    } else {
      agentList.innerHTML = agents.map(ag => `
        <div class="rc-agent-card">
          <div class="rc-agent-head">
            <span class="rc-agent-name">${esc(ag.label || ag.id || "Rod Servo")}</span>
            <span class="rc-agent-role">${esc(ag.role || "Operator")}</span>
          </div>
          <div class="rc-agent-task">${esc(ag.currentTask || ag.task || ag.lastMessage || "Awaiting reactor step")}</div>
        </div>
      `).join("");
    }
  }
  if ($("agentCount")) $("agentCount").textContent = agents.length;
}

function renderTelemetry(snap) {
  const events = snap.events || [];
  const list = $("telemetryList");
  const query = ($("telemetrySearch")?.value || "").toLowerCase().trim();

  const filtered = events.filter(e => {
    const isTool = String(e.type).startsWith("tool-call") || e.data?.toolName || e.data?.toolCallId;
    const isErr = e.level === "error" || String(e.type).includes("error");
    if (telemetryFilter === "tools" && !isTool) return false;
    if (telemetryFilter === "errors" && !isErr) return false;
    if (telemetryFilter === "system" && isTool) return false;
    if (query && !JSON.stringify(e).toLowerCase().includes(query)) return false;
    return true;
  }).slice(-120).reverse();

  if (list) {
    if (!filtered.length) {
      list.innerHTML = `<div class="rc-dim" style="padding:1rem;text-align:center;">No telemetry matching current filter.</div>`;
    } else {
      list.innerHTML = filtered.map(e => {
        const isTool = String(e.type).startsWith("tool-call") || e.data?.toolName;
        const isErr = e.level === "error" || String(e.type).includes("error");
        return `
          <div class="rc-event-row ${isTool ? "tool" : ""} ${isErr ? "error" : ""}" data-event-id="${esc(e.id)}">
            <div class="rc-event-head">
              <span class="rc-event-src">${esc(e.source || e.agentId || "RPS")}</span>
              <span class="rc-event-type">${esc(e.data?.toolName || e.type)}</span>
              <span class="rc-event-time">${new Date(e.ts).toLocaleTimeString()}</span>
            </div>
            <div class="rc-event-msg">${esc(e.message || e.data?.action || JSON.stringify(e.data || {}))}</div>
          </div>
        `;
      }).join("");
    }
    if ($("chkAutoScroll")?.checked) {
      list.scrollTop = 0;
    }
  }
  if ($("telemetryCount")) $("telemetryCount").textContent = `${events.length} EVENTS`;
}

function renderQuickGates(snap) {
  const gates = snap.gates?.gates || [];
  const list = $("gatesQuickList");
  if (list) {
    if (!gates.length) {
      list.innerHTML = `<div class="rc-dim" style="padding:0.4rem;font-size:0.75rem;">No acceptance gates configured.</div>`;
    } else {
      list.innerHTML = gates.slice(0, 4).map(g => `
        <div class="rc-gate-card">
          <span><b>${esc(g.id)}</b>: ${esc(g.description || g.title || "Gate")}</span>
          <span class="rc-badge ${g.status === 'passed' ? 'success' : g.status === 'failed' ? 'danger' : ''}">${esc(g.status || 'pending')}</span>
        </div>
      `).join("");
    }
  }
}

// -------------------------------------------------------------
// Modals & Station Tabs Renderers
// -------------------------------------------------------------

function renderCommandStation() {
  const container = $("cmdTabContent");
  if (!container) return;
  const control = snapshot.control || {};
  const targetGen = control.autoIteration?.targetGenerations || 10;

  if (activeCmdTab === "runctrl") {
    container.innerHTML = `
      <div class="rc-section">
        <h3 style="color:var(--rc-flux-cyan);margin-bottom:0.4rem;">CLASS 1E REACTOR RUN AUTHORITY</h3>
        <p style="color:var(--rc-text-dim);font-size:0.8rem;margin-bottom:1rem;">Issue supervisory commands to the Hermes Swarm runner orchestrator.</p>
        <div style="display:flex;gap:0.6rem;flex-wrap:wrap;">
          <button id="cmdBtnPause" class="rc-btn">PAUSE RUNNER</button>
          <button id="cmdBtnResume" class="rc-btn">RESUME RUNNER</button>
          <button id="cmdBtnRunNow" class="rc-btn primary">RUN NOW</button>
          <button id="cmdBtnHold" class="rc-btn">HOLD RUNS</button>
          <button id="cmdBtnUnhold" class="rc-btn">UNHOLD</button>
          <button id="cmdBtnStop" class="rc-btn danger">ALL-STOP / TRIP</button>
        </div>
      </div>
    `;
  } else if (activeCmdTab === "showcase") {
    container.innerHTML = `
      <div class="rc-section">
        <h3 style="color:var(--rc-flux-cyan);margin-bottom:0.4rem;">10-GENERATION SHOWCASE LOOP</h3>
        <p style="color:var(--rc-text-dim);font-size:0.8rem;margin-bottom:1rem;">Automated genetic iteration loop across architectural variants.</p>
        <div class="rc-form-group" style="max-width:24rem;margin-bottom:1rem;">
          <label>TARGET GENERATIONS (1 - 10): <b id="lblSliderVal" style="color:var(--rc-flux-green);">${targetGen}</b></label>
          <input id="showcaseSlider" type="range" min="1" max="10" value="${targetGen}" style="width:100%;">
        </div>
        <div style="display:flex;gap:0.6rem;flex-wrap:wrap;">
          <button id="cmdBtnStartShowcase" class="rc-btn primary">START SHOWCASE LOOP</button>
          <button id="cmdBtnPauseShowcase" class="rc-btn">PAUSE LOOP</button>
          <button id="cmdBtnResumeShowcase" class="rc-btn">RESUME LOOP</button>
          <button id="cmdBtnStopShowcase" class="rc-btn danger">STOP LOOP</button>
          <button id="cmdBtnNextGen" class="rc-btn">NEXT GENERATION</button>
        </div>
      </div>
    `;
  } else if (activeCmdTab === "deblock") {
    const bInfo = snapshot.state?.block || snapshot.state?.blocker || snapshot.state?.hold;
    const adviceList = (control.deblockAdvice || []).filter(a => a.status === "pending");
    container.innerHTML = `
      <div class="rc-section">
        <h3 style="color:var(--rc-flux-amber);margin-bottom:0.4rem;">DEBLOCK &amp; HAZARD RECOVERY</h3>
        <p style="color:var(--rc-text-dim);font-size:0.8rem;margin-bottom:0.8rem;">Active Blocker: <b>${esc(bInfo ? bInfo.reason || bInfo.message || json(bInfo) : "None (Core Normal)")}</b></p>
        <div class="rc-form-group" style="margin-bottom:0.8rem;">
          <label>CUSTOM RECOVERY DIRECTIVE:</label>
          <textarea id="txtDeblockPrompt" placeholder="Enter custom steering prompt to deblock reactivity interlocks or code build errors..."></textarea>
        </div>
        <div style="display:flex;gap:0.6rem;margin-bottom:1.2rem;">
          <button id="cmdBtnSendDeblock" class="rc-btn primary">TRANSMIT DEBLOCK</button>
          <button id="cmdBtnQueryAdvice" class="rc-btn">QUERY HERMES COPILOT ADVICE</button>
        </div>
        <h4 style="color:var(--rc-flux-cyan);font-size:0.8rem;margin-bottom:0.4rem;">PENDING DEBLOCK ADVICE (${adviceList.length})</h4>
        ${adviceList.length ? adviceList.map(a => `
          <div class="rc-section" style="margin-bottom:0.5rem;">
            <div style="font-size:0.75rem;color:var(--rc-text-dim);margin-bottom:0.4rem;">${esc(a.answer || a.prompt)}</div>
            <div style="display:flex;gap:0.4rem;">
              <button class="rc-btn small primary" data-approve-advice="${esc(a.id)}">APPROVE ADVICE</button>
              <button class="rc-btn small danger" data-deny-advice="${esc(a.id)}">DENY ADVICE</button>
            </div>
          </div>
        `).join("") : `<div class="rc-dim" style="font-size:0.75rem;">No pending advice requests.</div>`}
      </div>
    `;
  } else if (activeCmdTab === "steering") {
    const steeringList = control.activeSteering || [];
    container.innerHTML = `
      <div class="rc-section">
        <h3 style="color:var(--rc-flux-cyan);margin-bottom:0.4rem;">REACTIVITY STEERING &amp; OBJECTIVE</h3>
        <div class="rc-form-group" style="margin-bottom:1rem;">
          <label>CURRENT GLOBAL OBJECTIVE:</label>
          <textarea id="txtCurrentObjective" placeholder="Set global runner objective...">${esc(control.currentObjective?.text || snapshot.state?.task || "")}</textarea>
          <button id="cmdBtnSetObjective" class="rc-btn small primary" style="align-self:flex-start;margin-top:0.4rem;">PUBLISH OBJECTIVE</button>
        </div>
        <div class="rc-form-grid" style="margin-bottom:1rem;">
          <div class="rc-form-group">
            <label>NEW DIRECTIVE TEXT:</label>
            <input id="txtSteeringText" class="rc-input" placeholder="e.g. Ensure strict Class 1E fail-safe checks">
          </div>
          <div class="rc-form-group">
            <label>SCOPE:</label>
            <select id="selSteeringScope" class="rc-select">
              <option value="next_run">Next Run</option>
              <option value="current_run">Current Run</option>
              <option value="queue">Queue</option>
            </select>
          </div>
          <div class="rc-form-group">
            <label>PRIORITY:</label>
            <select id="selSteeringPriority" class="rc-select">
              <option value="required">Required</option>
              <option value="advisory">Advisory</option>
            </select>
          </div>
        </div>
        <button id="cmdBtnAddSteering" class="rc-btn small primary" style="margin-bottom:1rem;">ADD STEERING DIRECTIVE</button>
        <h4 style="color:var(--rc-text-dim);font-size:0.8rem;margin-bottom:0.4rem;">ACTIVE STEERING DIRECTIVES (${steeringList.length})</h4>
        ${steeringList.length ? steeringList.map(s => `
          <div class="rc-gate-card" style="margin-bottom:0.4rem;">
            <span>[${esc(s.priority || 'required')}] ${esc(s.text)}</span>
            <button class="rc-btn tiny danger" data-remove-steering="${esc(s.id)}">REMOVE</button>
          </div>
        `).join("") : `<div class="rc-dim" style="font-size:0.75rem;">No active steering directives.</div>`}
      </div>
    `;
  } else if (activeCmdTab === "queue") {
    const items = snapshot.queue?.items || [];
    container.innerHTML = `
      <div class="rc-section">
        <h3 style="color:var(--rc-flux-cyan);margin-bottom:0.4rem;">TASK QUEUE BRIEFS</h3>
        <div class="rc-form-grid" style="margin-bottom:0.8rem;">
          <div class="rc-form-group"><label>TITLE:</label><input id="txtQueueTitle" class="rc-input" placeholder="Brief Title"></div>
          <div class="rc-form-group"><label>PRIORITY (1-100):</label><input id="txtQueuePriority" type="number" class="rc-input" value="50"></div>
          <div class="rc-form-group full"><label>OBJECTIVE:</label><textarea id="txtQueueObjective" placeholder="Measurable objective for queued run"></textarea></div>
          <div class="rc-form-group full"><label>CONTEXT &amp; CONSTRAINTS:</label><textarea id="txtQueueContext" placeholder="Context details..."></textarea></div>
        </div>
        <div style="display:flex;gap:0.6rem;margin-bottom:1rem;">
          <button id="cmdBtnAddQueue" class="rc-btn small primary">ADD TO QUEUE</button>
          <button id="cmdBtnClearQueue" class="rc-btn small danger">CLEAR QUEUE</button>
        </div>
        <h4 style="color:var(--rc-text-dim);font-size:0.8rem;margin-bottom:0.4rem;">QUEUED BRIEFS (${items.length})</h4>
        ${items.length ? items.map(q => `
          <div class="rc-section" style="margin-bottom:0.4rem;">
            <div style="display:flex;justify-content:space-between;">
              <b>${esc(q.title || q.id)}</b>
              <span class="rc-badge">${esc(q.status || 'queued')}</span>
            </div>
            <div style="font-size:0.72rem;color:var(--rc-text-dim);margin:0.2rem 0;">${esc(q.objective)}</div>
            <div style="display:flex;gap:0.4rem;">
              <button class="rc-btn tiny" data-pin-queue="${esc(q.id)}">PIN</button>
              <button class="rc-btn tiny primary" data-use-queue="${esc(q.id)}">START GENERATION</button>
              <button class="rc-btn tiny danger" data-archive-queue="${esc(q.id)}">ARCHIVE</button>
            </div>
          </div>
        `).join("") : `<div class="rc-dim" style="font-size:0.75rem;">Queue is empty.</div>`}
      </div>
    `;
  } else if (activeCmdTab === "gates") {
    const gates = snapshot.gates?.gates || [];
    container.innerHTML = `
      <div class="rc-section">
        <h3 style="color:var(--rc-flux-cyan);margin-bottom:0.4rem;">ACCEPTANCE GATES REGISTER</h3>
        <div class="rc-form-grid" style="margin-bottom:0.8rem;">
          <div class="rc-form-group"><label>GATE ID:</label><input id="txtGateId" class="rc-input" placeholder="e.g. gate-flux-symmetry"></div>
          <div class="rc-form-group"><label>SEVERITY:</label><select id="selGateSev" class="rc-select"><option value="must">Must</option><option value="should">Should</option></select></div>
          <div class="rc-form-group full"><label>DESCRIPTION:</label><input id="txtGateDesc" class="rc-input" placeholder="Acceptance condition description"></div>
          <div class="rc-form-group full"><label>REQUIRED EVIDENCE (one per line):</label><textarea id="txtGateEvidence" placeholder="SPEC.md&#10;test-results.json"></textarea></div>
        </div>
        <button id="cmdBtnAddGate" class="rc-btn small primary" style="margin-bottom:1rem;">REGISTER ACCEPTANCE GATE</button>
        <h4 style="color:var(--rc-text-dim);font-size:0.8rem;margin-bottom:0.4rem;">ACTIVE GATES (${gates.length})</h4>
        ${gates.length ? gates.map(g => `
          <div class="rc-section" style="margin-bottom:0.5rem;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <b>${esc(g.id)} [${esc(g.severity || 'must')}]</b>
              <span class="rc-badge ${g.status === 'passed' ? 'success' : g.status === 'failed' ? 'danger' : ''}">${esc(g.status || 'pending')}</span>
            </div>
            <div style="font-size:0.75rem;color:var(--rc-text);margin:0.3rem 0;">${esc(g.description || g.title)}</div>
            <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
              <button class="rc-btn tiny primary" data-gate-action="passed" data-gate-id="${esc(g.id)}">PASS</button>
              <button class="rc-btn tiny" data-gate-action="needs-evidence" data-gate-id="${esc(g.id)}">NEEDS EVIDENCE</button>
              <button class="rc-btn tiny" data-gate-action="attach-evidence" data-gate-id="${esc(g.id)}">ATTACH EVIDENCE</button>
              <button class="rc-btn tiny danger" data-gate-action="failed" data-gate-id="${esc(g.id)}">FAIL</button>
            </div>
          </div>
        `).join("") : `<div class="rc-dim" style="font-size:0.75rem;">No acceptance gates registered.</div>`}
      </div>
    `;
  }
}

// Project Planning Workstation
function renderPlannerWorkstation() {
  const container = $("plannerTabContent");
  if (!container) return;
  const plans = snapshot.plans || [];

  if (activePlanTab === "list") {
    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.8rem;">
        <h3 style="color:var(--rc-flux-cyan);">CORE FUEL LOAD PLANS (PROJECT PLANS)</h3>
        <div style="display:flex;gap:0.5rem;">
          <button id="btnNewClassicPlan" class="rc-btn small primary">+ NEW CLASSIC PLAN</button>
          <button id="btnNewManagedPlan" class="rc-btn small primary">+ NEW MANAGED PLAN</button>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(22rem, 1fr));gap:0.8rem;">
        ${plans.length ? plans.map(p => `
          <div class="rc-section" style="cursor:pointer;" data-select-plan="${esc(p.planId)}">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <b style="color:var(--rc-flux-cyan);">${esc(p.title || p.planId)}</b>
              <span class="rc-badge ${p.state === 'approved' ? 'success' : ''}">${esc(p.state || 'draft')}</span>
            </div>
            <div style="font-size:0.75rem;color:var(--rc-text-dim);margin:0.4rem 0;">${esc(p.problem || "No problem statement")}</div>
            <div style="font-size:0.68rem;color:var(--rc-text-muted);display:flex;justify-content:space-between;">
              <span>${esc(p.pipelineType || 'classic')} • v${p.currentRevision || p.version || 1}</span>
              <span>${fmtDate(p.updatedAt)}</span>
            </div>
          </div>
        `).join("") : `<div class="rc-dim">No fuel load plans found. Create a new plan to get started.</div>`}
      </div>
    `;
  } else if (activePlanTab === "editor") {
    const rev = selectedPlanDetail?.revision?.content || {
      pipelineType: "classic", title: "", problem: "", intendedUsers: "", objective: "",
      boundedScope: "", requirements: [], nonGoals: [], constraints: [], risks: [],
      repository: { path: "/home/mojo/projects/hermesswarmbuilder/hermesswarmbuilder", baseRef: "HEAD" }
    };
    container.innerHTML = `
      <form id="planEditForm" class="rc-form-grid">
        <div class="rc-form-group"><label>PLAN TITLE:</label><input name="title" class="rc-input" value="${esc(rev.title || '')}" required></div>
        <div class="rc-form-group"><label>PIPELINE TYPE:</label><select name="pipelineType" class="rc-select"><option value="classic" ${rev.pipelineType === 'classic' ? 'selected' : ''}>Classic</option><option value="managed" ${rev.pipelineType === 'managed' ? 'selected' : ''}>Managed</option></select></div>
        <div class="rc-form-group full"><label>PROBLEM STATEMENT:</label><textarea name="problem" required>${esc(rev.problem || '')}</textarea></div>
        <div class="rc-form-group"><label>INTENDED USERS:</label><input name="intendedUsers" class="rc-input" value="${esc(rev.intendedUsers || '')}"></div>
        <div class="rc-form-group"><label>MEASURABLE OBJECTIVE:</label><input name="objective" class="rc-input" value="${esc(rev.objective || '')}"></div>
        <div class="rc-form-group full"><label>BOUNDED SCOPE:</label><textarea name="boundedScope">${esc(rev.boundedScope || '')}</textarea></div>
        <div class="rc-form-group"><label>REQUIREMENTS (one per line):</label><textarea name="requirements">${esc((rev.requirements || []).join('\n'))}</textarea></div>
        <div class="rc-form-group"><label>NON-GOALS (one per line):</label><textarea name="nonGoals">${esc((rev.nonGoals || []).join('\n'))}</textarea></div>
        <div class="rc-form-group"><label>CONSTRAINTS (one per line):</label><textarea name="constraints">${esc((rev.constraints || []).join('\n'))}</textarea></div>
        <div class="rc-form-group"><label>RISKS (one per line):</label><textarea name="risks">${esc((rev.risks || []).join('\n'))}</textarea></div>
        <div class="rc-form-group"><label>REPOSITORY PATH:</label><input name="repoPath" class="rc-input" value="${esc(rev.repository?.path || '')}"></div>
        <div class="rc-form-group"><label>BASE REF:</label><input name="baseRef" class="rc-input" value="${esc(rev.repository?.baseRef || 'HEAD')}"></div>
        <div class="rc-form-group full" style="display:flex;gap:0.6rem;margin-top:0.6rem;">
          <button type="submit" class="rc-btn primary">SAVE REVISION DRAFT</button>
          <button type="button" id="btnSubmitPlanReview" class="rc-btn">SUBMIT FOR REVIEW</button>
        </div>
      </form>
    `;
  } else if (activePlanTab === "review") {
    const ledger = selectedPlanDetail?.ledger || {};
    const revision = selectedPlanDetail?.revision || {};
    container.innerHTML = `
      <div class="rc-section">
        <h3 style="color:var(--rc-flux-cyan);">PLAN REVIEW &amp; RUNNER LAUNCH</h3>
        <div style="display:flex;gap:1rem;margin:0.6rem 0;font-size:0.78rem;">
          <span>PLAN ID: <b>${esc(ledger.planId || 'None')}</b></span>
          <span>STATE: <b>${esc(ledger.state || 'None')}</b></span>
          <span>CURRENT REVISION: <b>${esc(revision.revision || 1)}</b></span>
        </div>
        <pre class="rc-code-block" style="max-height:16rem;margin-bottom:1rem;">${esc(json(revision.content || {}))}</pre>
        <div style="display:flex;gap:0.6rem;flex-wrap:wrap;">
          <button id="btnPlanApprove" class="rc-btn primary" ${ledger.state !== 'ready-for-review' ? 'disabled' : ''}>APPROVE EXACT REVISION</button>
          <button id="btnPlanReject" class="rc-btn danger" ${!['ready-for-review', 'approved'].includes(ledger.state) ? 'disabled' : ''}>REJECT</button>
          <button id="btnPlanLaunch" class="rc-btn primary" ${ledger.state !== 'approved' ? 'disabled' : ''}>LAUNCH INTO RUNNER</button>
          <button id="btnPlanClone" class="rc-btn">CLONE PLAN</button>
          <button id="btnPlanFork" class="rc-btn">FORK PLAN</button>
          <button id="btnPlanArchive" class="rc-btn danger">ARCHIVE</button>
        </div>
      </div>
    `;
  } else if (activePlanTab === "copilot") {
    container.innerHTML = `
      <div class="rc-section">
        <h3 style="color:var(--rc-flux-cyan);margin-bottom:0.4rem;">PLANNING ASSISTANCE COPILOT</h3>
        <div style="display:flex;gap:0.6rem;margin-bottom:0.8rem;">
          <button id="btnNewAssistClassic" class="rc-btn small">NEW CLASSIC SESSION</button>
          <button id="btnNewAssistManaged" class="rc-btn small">NEW MANAGED SESSION</button>
        </div>
        <div id="assistChatLog" class="rc-code-block" style="height:14rem;margin-bottom:0.8rem;">
          ${(assistanceDetail?.messages || []).map(m => `<b>[${esc(m.role || 'SYS')}]:</b> ${esc(m.content)}\n\n`).join("") || "Start or select a planning assistance session."}
        </div>
        <div class="rc-form-group full" style="margin-bottom:0.8rem;">
          <textarea id="txtAssistMsg" placeholder="Ask planning copilot to structure objectives, requirements, risks..."></textarea>
        </div>
        <div style="display:flex;gap:0.6rem;">
          <button id="btnSendAssist" class="rc-btn primary">SEND MESSAGE</button>
          ${assistanceDetail?.proposedContent ? `<button id="btnApplyProposal" class="rc-btn success">APPLY PROPOSAL TO PLAN</button>` : ""}
        </div>
      </div>
    `;
  }
}

// Evidence & Artifacts Vault
async function renderEvidenceVault() {
  const container = $("evidenceTabContent");
  if (!container) return;
  const runId = snapshot.selectedRunId || snapshot.state?.currentRunId;

  if (!runId) {
    container.innerHTML = `<div class="rc-dim" style="padding:1rem;text-align:center;">No active or historical run selected. Select a run in the left deck.</div>`;
    return;
  }

  if (activeEvidenceTab === "spec" || activeEvidenceTab === "devplan") {
    container.innerHTML = `<div class="rc-dim">Loading ${activeEvidenceTab.toUpperCase()}.MD document...</div>`;
    try {
      const doc = await client.loadDocument(activeEvidenceTab, runId);
      container.innerHTML = `<pre class="rc-code-block" style="max-height:30rem;">${esc(doc.text || "Document empty")}</pre>`;
    } catch (e) {
      container.innerHTML = `<div class="rc-dim" style="color:var(--rc-flux-amber);">${activeEvidenceTab.toUpperCase()}.MD not found in selected run: ${esc(e.message)}</div>`;
    }
  } else if (activeEvidenceTab === "run") {
    const r = snapshot.selectedRun?.run || {};
    container.innerHTML = `<pre class="rc-code-block" style="max-height:30rem;">${esc(json(r))}</pre>`;
  } else if (activeEvidenceTab === "artifacts") {
    const artifacts = snapshot.selectedRun?.artifacts || [];
    container.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(18rem, 1fr));gap:0.6rem;">
        ${artifacts.length ? artifacts.map(a => `
          <div class="rc-section" style="cursor:pointer;" data-view-artifact="${esc(a.name)}">
            <b style="color:var(--rc-flux-cyan);">${esc(a.name)}</b>
            <small style="color:var(--rc-text-muted);">${a.size ? `${a.size} bytes` : 'Artifact file'}</small>
          </div>
        `).join("") : `<div class="rc-dim">No stored artifacts found for this run.</div>`}
      </div>
    `;
  } else if (activeEvidenceTab === "logs") {
    const logs = snapshot.selectedRun?.logs || [];
    container.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(18rem, 1fr));gap:0.6rem;">
        ${logs.length ? logs.map(l => `
          <div class="rc-section" style="cursor:pointer;" data-view-log="${esc(l.name)}">
            <b style="color:var(--rc-flux-green);">${esc(l.name)}</b>
            <small style="color:var(--rc-text-muted);">Tail 400 lines</small>
          </div>
        `).join("") : `<div class="rc-dim">No log files found for this run.</div>`}
      </div>
    `;
  } else if (activeEvidenceTab === "iterations") {
    const iterations = snapshot.iterations || [];
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:0.8rem;">
        ${iterations.length ? iterations.map(it => `
          <div class="rc-section">
            <div style="display:flex;justify-content:space-between;">
              <b>Generation ${esc(it.generation || 1)} [${esc(it.id)}]</b>
              <span class="rc-badge ${it.status === 'completed' ? 'success' : ''}">${esc(it.status || 'unknown')}</span>
            </div>
            <div style="font-size:0.75rem;color:var(--rc-text);margin:0.3rem 0;">${esc(it.objective || "No iteration objective")}</div>
            <div style="display:flex;gap:0.4rem;">
              <button class="rc-btn tiny" data-it-action="continue" data-it-id="${esc(it.id)}">CONTINUE FROM ITERATION</button>
              <button class="rc-btn tiny" data-it-action="fork" data-it-id="${esc(it.id)}">FORK FROM ITERATION</button>
              <button class="rc-btn tiny primary" data-it-action="use-direction" data-it-id="${esc(it.id)}">USE AS NEXT DIRECTION</button>
            </div>
          </div>
        `).join("") : `<div class="rc-dim">No iterative showcase generations recorded.</div>`}
      </div>
    `;
  } else if (activeEvidenceTab === "audit") {
    const audit = snapshot.audit || [];
    container.innerHTML = `
      <pre class="rc-code-block" style="max-height:30rem;">${esc(json(audit))}</pre>
    `;
  }
}

// Help & Operator Manual
function renderHelpManual() {
  const container = $("helpModalContent");
  if (!container) return;
  container.innerHTML = `
    <div class="rc-section" style="line-height:1.6;font-size:0.85rem;">
      <h3 style="color:var(--rc-flux-cyan);margin-bottom:0.6rem;">☢️ WESTINGHOUSE AP1000 NUCLEAR CORE SAFETY CONSOLE METAPHOR</h3>
      <p>This workstation models the Hermes SwarmBuilder operational loop as a nuclear power plant main control room (Westinghouse AP1000 MCR) enforcing Class 1E safety interlocks, 61-element hexagonal core thermal neutron flux diagnostics, and a NUREG-0700 Safety Parameter Display System (SPDS).</p>

      <h4 style="color:var(--rc-flux-green);margin:1rem 0 0.4rem 0;">1. READING THE INSTRUMENT DISPLAYS</h4>
      <ul style="padding-left:1.4rem;">
        <li><b>61-Element Hexagonal Core Lattice:</b> The left SVG core displays 61 fuel assemblies arranged in concentric rings (Center FA-01 + Rings 1 to 4). Color coding indicates thermal neutron flux: <i>Cyan</i> (>0.80 full power), <i>Green</i> (0.50-0.80 nominal), <i>Amber</i> (<0.50 low flux), <i>Red</i> (SCRAM tripped). Click any assembly to inspect local linear power and DNBR margin.</li>
        <li><b>Control Rod Drive Mechanism (CRDM) Servos:</b> 8 vertical bar tracks indicate insertion percentage for Regulating Banks A–D and Shutdown Banks S1–S4.</li>
        <li><b>NUREG-0700 SPDS Radar Polygon:</b> 8-axis safety radar displaying Reactivity, Core Cooling, RCS Pressure, Containment Integrity, Secondary Sink, Radiation, Swarm Health, and Gate Compliance at a glance.</li>
        <li><b>Emergency SCRAM Switchgear:</b> Direct Class 1E trip button gravity-dropping all control rods to instantly abort runner execution upon critical safety excursion.</li>
      </ul>

      <h4 style="color:var(--rc-flux-green);margin:1rem 0 0.4rem 0;">2. OPERATOR WORKFLOW</h4>
      <ol style="padding-left:1.4rem;">
        <li><b>Core Fuel Reload Plans:</b> Open the Project Planning Workstation (<kbd>P</kbd>) to draft, edit, review, and launch recipes.</li>
        <li><b>Criticality &amp; Power Ascension:</b> Initiate runner execution from Command Station (<kbd>C</kbd>) or trigger a 10-generation genetic showcase loop.</li>
        <li><b>Telemetry &amp; Flux Monitoring:</b> Monitor live tool dispatches in the right rail or click any event to inspect full JSON dispatches.</li>
        <li><b>RPS Deblock &amp; Boron Trim:</b> If interrupted, issue recovery directives via the Deblock tab or query Hermes Copilot advice.</li>
        <li><b>Safety Audit &amp; Evidence:</b> Open the Evidence Vault (<kbd>E</kbd>) to verify SPEC.md, DEVPLAN.md, artifact outputs, and logs.</li>
      </ol>

      <h4 style="color:var(--rc-flux-green);margin:1rem 0 0.4rem 0;">3. KEYBOARD SHORTCUTS</h4>
      <table style="width:100%;border-collapse:collapse;margin-top:0.6rem;font-size:0.8rem;">
        <tr style="border-bottom:1px solid var(--rc-border);text-align:left;"><th style="padding:4px;">KEY</th><th style="padding:4px;">ACTION</th></tr>
        <tr><td style="padding:4px;"><kbd>Space</kbd></td><td>Pause / Resume Live Telemetry Stream</td></tr>
        <tr><td style="padding:4px;"><kbd>R</kbd></td><td>Resynchronize Reactor Protection System</td></tr>
        <tr><td style="padding:4px;"><kbd>C</kbd></td><td>Open Operator Command Station</td></tr>
        <tr><td style="padding:4px;"><kbd>P</kbd></td><td>Open Project Planning Workstation</td></tr>
        <tr><td style="padding:4px;"><kbd>E</kbd></td><td>Open Evidence &amp; Artifacts Vault</td></tr>
        <tr><td style="padding:4px;"><kbd>H</kbd></td><td>Open Help &amp; Operator Manual</td></tr>
        <tr><td style="padding:4px;"><kbd>Esc</kbd></td><td>Close Active Modal</td></tr>
      </table>
    </div>
  `;
}

// -------------------------------------------------------------
// Event Listeners & Interactive Handlers
// -------------------------------------------------------------

function setupEventListeners() {
  // Masthead Actions
  $("btnStreamToggle")?.addEventListener("click", () => {
    if (snapshot.connection?.paused) {
      client.resume();
      toast("RPS telemetry stream resumed", "info");
    } else {
      client.pause();
      toast("RPS telemetry stream paused", "warn");
    }
  });

  $("btnResyncCore")?.addEventListener("click", () => {
    client.refresh();
    toast("Reactor Protection System (RPS) resynchronized", "info");
  });

  $("btnManualScram")?.addEventListener("click", async () => {
    if (confirm("EMERGENCY REACTOR SCRAM: Trip all breakers and gravity-drop all control rod banks?")) {
      try {
        await client.command("stop");
        toast("EMERGENCY REACTOR SCRAM INITIATED: All banks dropped", "error");
      } catch (e) { toast(e.message, "error"); }
    }
  });

  // Modal Openers
  $("btnOpenCommand")?.addEventListener("click", () => {
    renderCommandStation();
    $("commandModal")?.showModal();
  });
  $("btnCloseCommand")?.addEventListener("click", () => $("commandModal")?.close());

  $("btnOpenPlanner")?.addEventListener("click", () => {
    renderPlannerWorkstation();
    $("plannerModal")?.showModal();
  });
  $("btnClosePlanner")?.addEventListener("click", () => $("plannerModal")?.close());

  $("btnOpenEvidence")?.addEventListener("click", () => {
    renderEvidenceVault();
    $("evidenceModal")?.showModal();
  });
  $("btnCloseEvidence")?.addEventListener("click", () => $("evidenceModal")?.close());

  $("btnOpenHelp")?.addEventListener("click", () => {
    renderHelpManual();
    $("helpModal")?.showModal();
  });
  $("btnCloseHelp")?.addEventListener("click", () => $("helpModal")?.close());

  $("btnQuickDeblock")?.addEventListener("click", () => {
    activeCmdTab = "deblock";
    renderCommandStation();
    $("commandModal")?.showModal();
  });

  $("btnOpenCommandGates")?.addEventListener("click", () => {
    activeCmdTab = "gates";
    renderCommandStation();
    $("commandModal")?.showModal();
  });

  // Tab Navigations
  document.querySelectorAll("[data-cmd-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-cmd-tab]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeCmdTab = btn.dataset.cmdTab;
      renderCommandStation();
    });
  });

  document.querySelectorAll("[data-plan-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-plan-tab]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activePlanTab = btn.dataset.planTab;
      renderPlannerWorkstation();
    });
  });

  document.querySelectorAll("[data-evidence-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-evidence-tab]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeEvidenceTab = btn.dataset.evidenceTab;
      renderEvidenceVault();
    });
  });

  // Telemetry Filters
  document.querySelectorAll(".rc-filter-chips [data-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".rc-filter-chips [data-filter]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      telemetryFilter = btn.dataset.filter;
      renderTelemetry(snapshot);
    });
  });

  $("telemetrySearch")?.addEventListener("input", () => renderTelemetry(snapshot));

  // Run Selection
  $("runSelect")?.addEventListener("change", (e) => {
    const val = e.target.value;
    client.selectRun(val || null);
  });
  $("btnRefreshRuns")?.addEventListener("click", () => client.refreshRuns());

  // Chemical & Volume Control System (CVCS) Boron Trim
  $("btnTrimBoration")?.addEventListener("click", async () => {
    try {
      await client.command("steer", { directive: "Adjust CVCS boron concentration for steady-state criticality", scope: "current_run" });
      toast("CVCS chemical boron trim injected into primary loop", "info");
    } catch (e) { toast(e.message, "error"); }
  });

  // Global Dynamic Delegation for Core Selection, Commands, Plans, & Artifacts
  document.addEventListener("click", async (e) => {
    const target = e.target.closest("button, [data-fa-id], [data-event-id], [data-select-plan], [data-view-artifact], [data-view-log]");
    if (!target) return;

    // Fuel Assembly Selection
    if (target.dataset.faId) {
      selectedFuelAssemblyId = target.dataset.faId;
      if ($("lblSelectedFa")) $("lblSelectedFa").textContent = `${target.dataset.faId} (RING ${target.dataset.faRing})`;
      if ($("faIdDisplay")) $("faIdDisplay").textContent = target.dataset.faId;
      if ($("lblFaRing")) $("lblFaRing").textContent = `RING ${target.dataset.faRing}`;
      if ($("lblFaPower")) $("lblFaPower").textContent = `${target.dataset.faPower} kW/m`;
      if ($("lblFaBurnup")) $("lblFaBurnup").textContent = `${Number(target.dataset.faBurnup).toLocaleString()} MWd/MTU`;
      if ($("lblFaTemp")) $("lblFaTemp").textContent = `${target.dataset.faTemp} °C (SAFE)`;
      renderHexCore();
      toast(`Interrogated Fuel Assembly ${target.dataset.faId} neutron flux telemetry`, "info");
      return;
    }

    // Telemetry Event Click -> Tool Inspector
    if (target.dataset.eventId) {
      const ev = snapshot.events.find(x => x.id === target.dataset.eventId);
      if (ev) {
        selectedToolEvent = ev;
        $("toolModalContent").innerHTML = `
          <div class="rc-section" style="margin-bottom:0.6rem;">
            <div><b>EVENT ID:</b> ${esc(ev.id)}</div>
            <div><b>SOURCE / AGENT:</b> ${esc(ev.source || ev.agentId || 'RPS')}</div>
            <div><b>TYPE / TOOL:</b> ${esc(ev.data?.toolName || ev.type)}</div>
            <div><b>TIMESTAMP:</b> ${new Date(ev.ts).toISOString()}</div>
          </div>
          <pre class="rc-code-block">${esc(json(ev.raw || ev))}</pre>
        `;
        $("toolModal")?.showModal();
      }
      return;
    }

    // Command Station Actions
    if (target.id === "cmdBtnPause") { await client.command("pause"); toast("Runner paused", "warn"); }
    if (target.id === "cmdBtnResume") { await client.command("resume"); toast("Runner resumed", "info"); }
    if (target.id === "cmdBtnRunNow") { await client.command("run-now"); toast("Run Now dispatched", "info"); }
    if (target.id === "cmdBtnHold") { await client.command("hold"); toast("New runs on hold", "warn"); }
    if (target.id === "cmdBtnUnhold") { await client.command("unhold"); toast("Hold released", "info"); }
    if (target.id === "cmdBtnStop") { await client.command("stop"); toast("Runner stopped / tripped", "error"); }

    // Showcase Actions
    if (target.id === "cmdBtnStartShowcase") {
      const sliderVal = Number($("showcaseSlider")?.value || 10);
      await client.command("start-showcase-loop", { targetGenerations: sliderVal });
      toast(`Started ${sliderVal}-Generation Showcase Loop`, "info");
    }
    if (target.id === "cmdBtnPauseShowcase") { await client.command("pause-showcase-loop"); toast("Showcase loop paused", "warn"); }
    if (target.id === "cmdBtnResumeShowcase") { await client.command("resume-showcase-loop"); toast("Showcase loop resumed", "info"); }
    if (target.id === "cmdBtnStopShowcase") { await client.command("stop-showcase-loop"); toast("Showcase loop stopped", "error"); }
    if (target.id === "cmdBtnNextGen") { await client.command("start-next-iteration"); toast("Starting next generation", "info"); }

    // Deblock Actions
    if (target.id === "cmdBtnSendDeblock") {
      const prompt = $("txtDeblockPrompt")?.value.trim();
      if (!prompt) return toast("Please enter deblock instruction", "warn");
      await client.command("deblock", { prompt });
      toast("Deblock instruction transmitted", "info");
      renderCommandStation();
    }
    if (target.id === "cmdBtnQueryAdvice") {
      await client.command("deblock-advice", { prompt: "Analyze core reactivity trip fault" });
      toast("Deblock advice requested from Copilot", "info");
      renderCommandStation();
    }
    if (target.dataset.approveAdvice) {
      await client.command("approve-deblock-advice", { adviceId: target.dataset.approveAdvice });
      toast("Advice approved", "info");
      renderCommandStation();
    }
    if (target.dataset.denyAdvice) {
      await client.command("deny-deblock-advice", { adviceId: target.dataset.denyAdvice });
      toast("Advice denied", "warn");
      renderCommandStation();
    }

    // Steering Actions
    if (target.id === "cmdBtnSetObjective") {
      const text = $("txtCurrentObjective")?.value.trim();
      if (text) {
        await client.command("set-current-objective", { text });
        toast("Global objective published", "info");
      }
    }
    if (target.id === "cmdBtnAddSteering") {
      const text = $("txtSteeringText")?.value.trim();
      const scope = $("selSteeringScope")?.value;
      const priority = $("selSteeringPriority")?.value;
      if (text) {
        await client.command("steer", { text, scope, priority });
        toast("Steering directive added", "info");
        renderCommandStation();
      }
    }
    if (target.dataset.removeSteering) {
      await client.command("remove-steering", { id: target.dataset.removeSteering });
      toast("Steering directive removed", "info");
      renderCommandStation();
    }

    // Queue Actions
    if (target.id === "cmdBtnAddQueue") {
      const title = $("txtQueueTitle")?.value.trim();
      const priority = Number($("txtQueuePriority")?.value || 50);
      const objective = $("txtQueueObjective")?.value.trim();
      const context = $("txtQueueContext")?.value.trim();
      if (title && objective) {
        await client.command("add-queue-item", { title, priority, objective, context });
        toast("Queue brief added", "info");
        renderCommandStation();
      }
    }
    if (target.id === "cmdBtnClearQueue") {
      await client.command("clear-queue");
      toast("Queue cleared", "warn");
      renderCommandStation();
    }
    if (target.dataset.pinQueue) {
      await client.command("pin-queue-item", { id: target.dataset.pinQueue });
      toast("Queue brief pinned", "info");
      renderCommandStation();
    }
    if (target.dataset.useQueue) {
      await client.command("use-as-next-direction", { id: target.dataset.useQueue });
      toast("Queue brief launched into next generation", "info");
      renderCommandStation();
    }
    if (target.dataset.archiveQueue) {
      await client.command("archive-queue-item", { id: target.dataset.archiveQueue });
      toast("Queue brief archived", "info");
      renderCommandStation();
    }

    // Gate Actions
    if (target.id === "cmdBtnAddGate") {
      const id = $("txtGateId")?.value.trim();
      const severity = $("selGateSev")?.value;
      const description = $("txtGateDesc")?.value.trim();
      const requiredEvidence = lines($("txtGateEvidence")?.value);
      if (id && description) {
        await client.command("add-gate", { id, severity, description, requiredEvidence, phase: "final-audit" });
        toast("Acceptance gate added", "info");
        renderCommandStation();
      }
    }
    if (target.dataset.gateAction) {
      const gateId = target.dataset.gateId;
      const action = target.dataset.gateAction;
      if (action === "attach-evidence") {
        await client.command("attach-gate-evidence", { gateId, artifacts: ["SPEC.md"] });
        toast("Run evidence attached to gate", "info");
      } else {
        await client.command("gate-decision", { gateId, decision: action });
        toast(`Gate decision recorded: ${action}`, "info");
      }
      renderCommandStation();
    }

    // Plan Actions
    if (target.id === "btnNewClassicPlan" || target.id === "btnNewManagedPlan") {
      const type = target.id === "btnNewClassicPlan" ? "classic" : "managed";
      const title = window.prompt(`New ${type.toUpperCase()} Fuel Load Plan Title:`);
      if (title) {
        await client.createProjectPlan({
          pipelineType: type,
          title,
          problem: "Nuclear core reload pattern verification",
          intendedUsers: "reactor-operators",
          objective: "Ensure 61-element flux symmetry and SCRAM safety margins",
          boundedScope: "Reactor pressure vessel",
          repoPath: "/home/mojo/projects/hermesswarmbuilder/hermesswarmbuilder",
          baseRef: "HEAD"
        });
        toast("Plan created", "info");
        await client.refreshPlans();
        renderPlannerWorkstation();
      }
    }
    if (target.dataset.selectPlan) {
      selectedPlanId = target.dataset.selectPlan;
      selectedPlanDetail = await client.getProjectPlan(selectedPlanId);
      activePlanTab = "editor";
      document.querySelectorAll("[data-plan-tab]").forEach(b => b.classList.remove("active"));
      document.querySelector('[data-plan-tab="editor"]')?.classList.add("active");
      renderPlannerWorkstation();
    }
    if (target.id === "btnSubmitPlanReview" && selectedPlanId) {
      await client.submitProjectPlanForReview(selectedPlanId, selectedPlanDetail?.ledger?.version || 1);
      toast("Plan submitted for review", "info");
      selectedPlanDetail = await client.getProjectPlan(selectedPlanId);
      activePlanTab = "review";
      renderPlannerWorkstation();
    }
    if (target.id === "btnPlanApprove" && selectedPlanId) {
      await client.approveProjectPlan(selectedPlanId, selectedPlanDetail?.ledger?.version || 1);
      toast("Plan revision approved", "info");
      selectedPlanDetail = await client.getProjectPlan(selectedPlanId);
      renderPlannerWorkstation();
    }
    if (target.id === "btnPlanReject" && selectedPlanId) {
      await client.rejectProjectPlan(selectedPlanId, selectedPlanDetail?.ledger?.version || 1);
      toast("Plan rejected", "warn");
      selectedPlanDetail = await client.getProjectPlan(selectedPlanId);
      renderPlannerWorkstation();
    }
    if (target.id === "btnPlanLaunch" && selectedPlanId) {
      await client.launchProjectPlan(selectedPlanId, selectedPlanDetail?.ledger?.version || 1);
      toast("Approved plan launched into runner", "info");
      selectedPlanDetail = await client.getProjectPlan(selectedPlanId);
      renderPlannerWorkstation();
    }
    if (target.id === "btnPlanClone" && selectedPlanId) {
      await client.cloneProjectPlan(selectedPlanId);
      toast("Plan cloned to draft", "info");
      await client.refreshPlans();
      activePlanTab = "list";
      renderPlannerWorkstation();
    }
    if (target.id === "btnPlanFork" && selectedPlanId) {
      await client.forkProjectPlan(selectedPlanId, selectedPlanDetail?.ledger?.version || 1);
      toast("Plan forked to draft", "info");
      await client.refreshPlans();
      activePlanTab = "list";
      renderPlannerWorkstation();
    }
    if (target.id === "btnPlanArchive" && selectedPlanId) {
      await client.archiveProjectPlan(selectedPlanId);
      toast("Plan archived", "warn");
      await client.refreshPlans();
      activePlanTab = "list";
      renderPlannerWorkstation();
    }

    // Copilot Actions
    if (target.id === "btnNewAssistClassic" || target.id === "btnNewAssistManaged") {
      const type = target.id === "btnNewAssistClassic" ? "classic" : "managed";
      assistanceDetail = await client.createPlanAssistance(type);
      selectedAssistanceId = assistanceDetail.id;
      renderPlannerWorkstation();
    }
    if (target.id === "btnSendAssist" && selectedAssistanceId) {
      const msg = $("txtAssistMsg")?.value.trim();
      if (msg) {
        assistanceDetail = await client.messagePlanAssistance(selectedAssistanceId, assistanceDetail.version, msg);
        renderPlannerWorkstation();
      }
    }
    if (target.id === "btnApplyProposal" && assistanceDetail?.proposedContent) {
      const p = assistanceDetail.proposedContent;
      await client.createProjectPlan(p);
      toast("Proposal applied to new Project Plan", "info");
      await client.refreshPlans();
      activePlanTab = "list";
      renderPlannerWorkstation();
    }

    // View Artifact / Log inline modal
    if (target.dataset.viewArtifact) {
      const name = target.dataset.viewArtifact;
      const runId = snapshot.selectedRunId || snapshot.state?.currentRunId;
      try {
        const art = await client.loadArtifact(name, runId);
        $("fileViewerTitle").textContent = `ARTIFACT: ${name}`;
        $("fileViewerContent").textContent = art.text;
        $("fileViewerModal")?.showModal();
      } catch (e) { toast(e.message, "error"); }
    }
    if (target.dataset.viewLog) {
      const name = target.dataset.viewLog;
      const runId = snapshot.selectedRunId || snapshot.state?.currentRunId;
      try {
        const lg = await client.loadLog(name, runId, { tail: 400 });
        $("fileViewerTitle").textContent = `LOG TAIL: ${name}`;
        $("fileViewerContent").textContent = lg.text;
        $("fileViewerModal")?.showModal();
      } catch (e) { toast(e.message, "error"); }
    }
    if (target.dataset.itAction) {
      const itId = target.dataset.itId;
      const action = target.dataset.itAction;
      if (action === "continue") await client.command("continue-from-iteration", { iterationId: itId });
      if (action === "fork") await client.command("fork-from-iteration", { iterationId: itId });
      if (action === "use-direction") await client.command("use-as-next-direction", { id: itId });
      toast(`Iteration action dispatched: ${action}`, "info");
    }
  });

  // Plan Edit Form Submission
  document.addEventListener("submit", async (e) => {
    if (e.target.id === "planEditForm") {
      e.preventDefault();
      const form = e.target;
      const data = new FormData(form);
      const planPayload = {
        title: String(data.get("title") || ""),
        pipelineType: String(data.get("pipelineType") || "classic"),
        problem: String(data.get("problem") || ""),
        intendedUsers: String(data.get("intendedUsers") || ""),
        objective: String(data.get("objective") || ""),
        boundedScope: String(data.get("boundedScope") || ""),
        requirements: lines(data.get("requirements")),
        nonGoals: lines(data.get("nonGoals")),
        constraints: lines(data.get("constraints")),
        risks: lines(data.get("risks")),
        repository: { path: String(data.get("repoPath") || ""), baseRef: String(data.get("baseRef") || "HEAD") }
      };
      if (selectedPlanId) {
        await client.updateProjectPlan(selectedPlanId, planPayload);
        toast("Draft revision saved", "info");
        selectedPlanDetail = await client.getProjectPlan(selectedPlanId);
      } else {
        const created = await client.createProjectPlan(planPayload);
        selectedPlanId = created.planId;
        selectedPlanDetail = await client.getProjectPlan(selectedPlanId);
        toast("New plan created and saved", "info");
      }
      await client.refreshPlans();
      renderPlannerWorkstation();
    }
  });

  // Showcase slider live label
  document.addEventListener("input", (e) => {
    if (e.target.id === "showcaseSlider" && $("lblSliderVal")) {
      $("lblSliderVal").textContent = e.target.value;
    }
  });

  // Close modals buttons
  $("btnCloseTool")?.addEventListener("click", () => $("toolModal")?.close());
  $("btnCloseFileViewer")?.addEventListener("click", () => $("fileViewerModal")?.close());

  // Global Keyboard Shortcuts
  window.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea, select")) return;
    if (e.code === "Space") {
      e.preventDefault();
      $("btnStreamToggle")?.click();
    } else if (e.key.toLowerCase() === "r") {
      $("btnResyncCore")?.click();
    } else if (e.key.toLowerCase() === "c") {
      $("btnOpenCommand")?.click();
    } else if (e.key.toLowerCase() === "p") {
      $("btnOpenPlanner")?.click();
    } else if (e.key.toLowerCase() === "e") {
      $("btnOpenEvidence")?.click();
    } else if (e.key.toLowerCase() === "h") {
      $("btnOpenHelp")?.click();
    }
  });
}

// -------------------------------------------------------------
// Client Subscription & Main Loop
// -------------------------------------------------------------

client.subscribe((snap) => {
  snapshot = snap;
  renderHeader(snap);
  renderWorkflow(snap);
  renderRunsAndAgents(snap);
  renderTelemetry(snap);
  renderQuickGates(snap);
  renderHexCore();
});

// Initialize
setupEventListeners();
client.connect();
client.refresh();
client.listPlanAssistance().catch(() => {});
renderHexCore();
resizeSpds();

// Continuous Animation Loop for SPDS Radar & CRDM Servos
function animLoop() {
  drawSpds();
  requestAnimationFrame(animLoop);
}
requestAnimationFrame(animLoop);
