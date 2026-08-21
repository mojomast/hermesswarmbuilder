import { createDashboardClient, WORKFLOW_PHASES } from "../../headless-dashboard-client.js";

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const array = (value) => Array.isArray(value) ? value : value && typeof value === "object" ? Object.values(value) : value ? [value] : [];
const lines = (value) => String(value || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
const date = (value) => value ? new Date(value).toLocaleString() : "Not reported";
const time = (value) => value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--:--";
const clip = (value, length = 180) => { const text = typeof value === "string" ? value : JSON.stringify(value, null, 2); return text?.length > length ? `${text.slice(0, length - 1)}...` : text || ""; };
const norm = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

const client = createDashboardClient({ maxEvents: 1000, eventLimit: 500, auditLimit: 100 });
let snapshot = client.getSnapshot();
let mode = "arrangement";
let zoom = Number(localStorage.getItem("hermes.sequencer.zoom")) || 84;
let density = localStorage.getItem("hermes.sequencer.density") || "compact";
let query = "";
let eventType = "all";
let selected = null;
let playhead = 0;
let planSelection = null;
let planRevisionPreview = null;
let assistanceSelection = null;
let resourceTab = "run";
let resourcePreview = null;
let busy = false;
let messageTimer;
let drawQueued = false;
let clips = [];
let tracks = [];
let hitRegions = [];

const phaseAliases = {
  scan: "inventory-scanning", inventory: "inventory-scanning", implementation: "building", build: "building",
  complete: "completed", done: "completed", spec: "spec-drafting", devplan: "devplan-drafting"
};

function workflowPhase() {
  const raw = snapshot.state?.phase || snapshot.state?.status || "idle";
  if (WORKFLOW_PHASES.includes(raw)) return raw;
  return phaseAliases[String(raw).toLowerCase()] || "idle";
}

function inferPhase(event) {
  const raw = event.data?.phase || event.raw?.phase || event.message || event.type;
  const key = norm(raw);
  const found = WORKFLOW_PHASES.find((phase) => key.includes(norm(phase)));
  if (found) return found;
  const timestamp = Date.parse(event.ts);
  const run = snapshot.selectedRun.run;
  const start = Date.parse(run?.startedAt || snapshot.state?.startedAt);
  const end = Date.parse(run?.completedAt || snapshot.state?.updatedAt || Date.now());
  if (Number.isFinite(timestamp) && Number.isFinite(start) && end > start) {
    return WORKFLOW_PHASES[Math.min(WORKFLOW_PHASES.length - 1, Math.floor(((timestamp - start) / (end - start)) * WORKFLOW_PHASES.length))];
  }
  return workflowPhase();
}

function agents() {
  const stateAgents = array(snapshot.state?.agents).map((agent) => ({
    ...agent,
    id: agent.id || agent.label || agent.role || "agent",
    label: agent.label || agent.role || agent.id || "Agent",
    status: agent.status || "idle"
  }));
  const seen = new Map(stateAgents.map((agent) => [agent.id, agent]));
  for (const event of snapshot.events) {
    const id = event.agentId || event.source || "system";
    if (!seen.has(id)) seen.set(id, { id, label: id, role: "event-derived", status: "observed" });
  }
  if (!seen.size) seen.set("orchestrator", { id: "orchestrator", label: "Orchestrator", role: "workflow", status: snapshot.state?.status || "idle" });
  return [...seen.values()];
}

function isTool(event) {
  return String(event.type).startsWith("tool-call") || event.data?.toolName || event.data?.toolCallId || event.data?.tool;
}

function filteredEvents() {
  const selectedRun = snapshot.selectedRunId;
  const needle = query.toLowerCase();
  return snapshot.events.filter((event) => {
    if (selectedRun && event.runId && event.runId !== selectedRun) return false;
    if (eventType === "tools" && !isTool(event)) return false;
    if (eventType === "errors" && !(["error", "warn"].includes(event.level) || /error|fail|block/i.test(event.message))) return false;
    if (eventType === "events" && isTool(event)) return false;
    return !needle || [event.agentId, event.source, event.type, event.message, event.data?.toolName].join(" ").toLowerCase().includes(needle);
  });
}

function buildArrangement() {
  tracks = agents();
  const trackIndex = new Map(tracks.map((track, index) => [track.id, index]));
  clips = filteredEvents().slice(-500).map((event, index) => {
    const agentId = event.agentId || event.source || "system";
    const phase = inferPhase(event);
    const phaseIndex = Math.max(0, WORKFLOW_PHASES.indexOf(phase));
    const samePhase = snapshot.events.filter((candidate) => inferPhase(candidate) === phase);
    const ordinal = Math.max(0, samePhase.findIndex((candidate) => candidate.id === event.id));
    const fraction = Math.min(.82, .08 + (ordinal % 9) * .09);
    const type = isTool(event) ? "tool" : event.level === "error" ? "error" : "event";
    return { id: event.id, event, agentId, track: trackIndex.get(agentId) ?? 0, phase, phaseIndex, position: phaseIndex + fraction, width: isTool(event) ? .38 : .24, type, index };
  });
  if (selected?.kind === "clip" && !clips.some((item) => item.id === selected.id)) selected = null;
}

function phaseIndex() {
  return Math.max(0, WORKFLOW_PHASES.indexOf(workflowPhase()));
}

function canvasMetrics() {
  const trackHeight = density === "dense" ? 46 : density === "comfortable" ? 82 : 64;
  return { header: innerWidth > 2200 ? 280 : innerWidth < 560 ? 132 : 220, ruler: 64, marker: 34, trackHeight, automation: 72 };
}

function fitCanvas() {
  const available = Math.max(360, $("canvasScroller").clientWidth - canvasMetrics().header);
  zoom = Math.max(42, Math.min(180, Math.floor(available / WORKFLOW_PHASES.length)));
  syncViewControls();
  drawTimeline();
}

function syncViewControls() {
  $("zoom").value = String(zoom);
  $("zoomValue").value = `${zoom} px`;
  $("density").value = density;
  document.documentElement.dataset.density = density;
  localStorage.setItem("hermes.sequencer.zoom", String(zoom));
  localStorage.setItem("hermes.sequencer.density", density);
}

function drawTimeline() {
  buildArrangement();
  const canvas = $("timeline");
  const scroller = $("canvasScroller");
  if (!canvas || !scroller) return;
  const { header, ruler, marker, trackHeight, automation } = canvasMetrics();
  const cssWidth = header + WORKFLOW_PHASES.length * zoom;
  const cssHeight = ruler + marker + tracks.length * trackHeight + automation;
  const ratio = Math.min(2, devicePixelRatio || 1);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.ceil(cssWidth * ratio);
  canvas.height = Math.ceil(cssHeight * ratio);
  const context = canvas.getContext("2d");
  context.scale(ratio, ratio);
  context.textBaseline = "middle";
  context.clearRect(0, 0, cssWidth, cssHeight);
  hitRegions = [];

  context.fillStyle = "#171a19";
  context.fillRect(0, 0, header, cssHeight);
  context.fillStyle = "#121413";
  context.fillRect(header, 0, cssWidth - header, ruler);
  context.strokeStyle = "#383d39";
  context.lineWidth = 1;
  context.font = "700 10px ui-monospace, monospace";

  WORKFLOW_PHASES.forEach((phase, index) => {
    const x = header + index * zoom;
    context.fillStyle = index === phaseIndex() ? "#222a1c" : index % 2 ? "#101211" : "#131614";
    context.fillRect(x, ruler, zoom, cssHeight - ruler);
    context.strokeStyle = index === phaseIndex() ? "#c8f06a" : "#383d39";
    context.beginPath(); context.moveTo(x, 0); context.lineTo(x, cssHeight); context.stroke();
    context.fillStyle = index === phaseIndex() ? "#c8f06a" : "#a7ada5";
    context.fillText(String(index + 1).padStart(2, "0"), x + 7, 14);
    context.save(); context.beginPath(); context.rect(x + 5, 25, zoom - 10, 31); context.clip();
    context.font = "700 10px system-ui"; context.fillText(phase, x + 7, 40); context.restore();
    for (let beat = 1; beat < 4; beat++) {
      const beatX = x + beat * zoom / 4;
      context.strokeStyle = "#252925"; context.beginPath(); context.moveTo(beatX, ruler); context.lineTo(beatX, cssHeight); context.stroke();
    }
  });

  context.fillStyle = "#1c201e";
  context.fillRect(header, ruler, cssWidth - header, marker);
  context.fillStyle = "#a7ada5"; context.font = "700 10px system-ui"; context.fillText("GATE MARKERS", 12, ruler + marker / 2);
  const gates = array(snapshot.gates?.gates);
  gates.forEach((gate, index) => {
    const indexFromPhase = WORKFLOW_PHASES.indexOf(gate.phase);
    const measure = indexFromPhase >= 0 ? indexFromPhase : Math.min(WORKFLOW_PHASES.length - 1, Math.floor((index + 1) * WORKFLOW_PHASES.length / (gates.length + 1)));
    const x = header + measure * zoom + 4;
    context.fillStyle = "#ffc45b";
    context.beginPath(); context.moveTo(x, ruler + 4); context.lineTo(x + 8, ruler + 12); context.lineTo(x, ruler + 20); context.closePath(); context.fill();
    context.save(); context.beginPath(); context.rect(x + 11, ruler, Math.max(0, zoom - 18), marker); context.clip();
    context.fillStyle = "#ffe0a1"; context.fillText(gate.id || gate.title || `gate ${index + 1}`, x + 12, ruler + marker / 2); context.restore();
    hitRegions.push({ x, y: ruler, width: zoom, height: marker, item: { kind: "gate", id: gate.id, data: gate } });
  });

  tracks.forEach((track, index) => {
    const y = ruler + marker + index * trackHeight;
    context.fillStyle = index % 2 ? "#171a19" : "#1a1d1b"; context.fillRect(0, y, header, trackHeight);
    context.strokeStyle = "#383d39"; context.beginPath(); context.moveTo(0, y + trackHeight); context.lineTo(cssWidth, y + trackHeight); context.stroke();
    context.fillStyle = "#f1f1e8"; context.font = "700 12px system-ui"; context.fillText(clip(track.label, 25), 13, y + trackHeight * .38);
    context.fillStyle = "#a7ada5"; context.font = "10px system-ui"; context.fillText(`${track.status || "idle"} / ${track.role || "agent"}`, 13, y + trackHeight * .69);
    hitRegions.push({ x: 0, y, width: header, height: trackHeight, item: { kind: "track", id: track.id, data: track } });
  });

  for (const item of clips) {
    const y = ruler + marker + item.track * trackHeight + 7;
    const x = header + item.position * zoom;
    const width = Math.max(30, item.width * zoom);
    const height = Math.max(25, trackHeight - 14);
    const active = selected?.kind === "clip" && selected.id === item.id;
    context.fillStyle = item.type === "error" ? "#7a302b" : item.type === "tool" ? "#285954" : "#394531";
    context.fillRect(x, y, width, height);
    context.strokeStyle = active ? "#f1f1e8" : item.type === "error" ? "#ff7a6d" : item.type === "tool" ? "#79d8d0" : "#c8f06a";
    context.lineWidth = active ? 3 : 1; context.strokeRect(x + .5, y + .5, width - 1, height - 1);
    context.save(); context.beginPath(); context.rect(x + 5, y + 2, width - 10, height - 4); context.clip();
    context.fillStyle = "#f7f8ef"; context.font = "700 10px system-ui";
    context.fillText(item.type.toUpperCase(), x + 5, y + 10);
    context.font = "10px system-ui"; context.fillText(clip(item.event.data?.toolName || item.event.message || item.event.type, 38), x + 5, y + height - 10);
    context.restore();
    hitRegions.push({ x, y, width, height, item: { kind: "clip", id: item.id, data: item } });
  }

  const autoY = ruler + marker + tracks.length * trackHeight;
  context.fillStyle = "#151918"; context.fillRect(0, autoY, cssWidth, automation);
  context.fillStyle = "#79d8d0"; context.font = "700 10px system-ui"; context.fillText("STEERING AUTOMATION", 12, autoY + 18);
  const steering = array(snapshot.control?.activeSteering);
  context.strokeStyle = "#79d8d0"; context.lineWidth = 2; context.beginPath();
  steering.forEach((automationItem, index) => {
    const x = header + ((index + 1) / (steering.length + 1)) * (WORKFLOW_PHASES.length * zoom);
    const y = autoY + 48 - (index % 3) * 10;
    if (!index) context.moveTo(header, autoY + 48); context.lineTo(x, y);
    context.fillStyle = "#79d8d0"; context.fillRect(x - 3, y - 3, 6, 6);
    hitRegions.push({ x: x - 8, y: y - 8, width: 16, height: 16, item: { kind: "steering", id: automationItem.id, data: automationItem } });
  });
  if (steering.length) context.lineTo(cssWidth, autoY + 34); context.stroke();

  const playX = header + Math.max(0, Math.min(WORKFLOW_PHASES.length, playhead)) * zoom;
  context.strokeStyle = "#ffffff"; context.lineWidth = 1; context.beginPath(); context.moveTo(playX, 0); context.lineTo(playX, cssHeight); context.stroke();
  context.fillStyle = "#ffffff"; context.beginPath(); context.moveTo(playX - 5, 0); context.lineTo(playX + 5, 0); context.lineTo(playX, 8); context.closePath(); context.fill();
  renderSemanticList();
  updatePosition();
}

function renderSemanticList() {
  $("semanticList").innerHTML = clips.map((item) => `<div role="listitem"><button class="semantic-row" data-select-clip="${esc(item.id)}" aria-current="${selected?.id === item.id}"><span>${esc(`${item.phaseIndex + 1}.${Math.floor((item.position % 1) * 4) + 1}`)}</span><span>${esc(item.agentId)}</span><span>${esc(item.type)}</span><span>${esc(item.event.message || item.event.type)}</span></button></div>`).join("") || '<p class="muted">No matching clips in this arrangement.</p>';
}

function updatePosition() {
  const measure = Math.floor(playhead);
  const beat = Math.floor((playhead - measure) * 4) + 1;
  $("position").value = `${String(measure + 1).padStart(2, "0")}.${beat}`;
}

function selectItem(item, focusInspector = false) {
  selected = item;
  if (item?.kind === "clip") playhead = item.data.position;
  $("selectionStatus").textContent = item ? `${item.kind}: ${item.id || "selected"}` : "No clip selected";
  drawTimeline();
  renderInspector();
  if (focusInspector && innerWidth <= 900) openInspector();
}

function showMessage(text, isError = false) {
  clearTimeout(messageTimer);
  $("notice").textContent = text;
  $("notice").style.color = isError ? "var(--red)" : "var(--lime)";
  messageTimer = setTimeout(() => { $("notice").textContent = ""; }, 7000);
}

async function act(label, action) {
  if (busy) return;
  busy = true;
  showMessage(`${label}...`);
  try {
    const result = await action();
    showMessage(`${label} complete.`);
    return result;
  } catch (error) {
    showMessage(`${label} failed: ${error.message || error}`, true);
  } finally {
    busy = false;
  }
}

async function command(type, payload = {}) {
  return act(type, async () => {
    const result = await client.command(type, payload);
    await client.refresh();
    return result;
  });
}

function setMode(next) {
  mode = next;
  document.querySelectorAll("[data-mode]").forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  renderInspector();
  openInspector();
}

function openInspector() { $("inspector").classList.add("open"); }
function closeInspector() { $("inspector").classList.remove("open"); }

function modeHead(title, description) {
  return `<div class="mode-head"><div><h3>${esc(title)}</h3><p>${esc(description)}</p></div></div>`;
}

function formField(name, label, value = "", options = {}) {
  const common = `name="${esc(name)}"${options.required ? " required" : ""}${options.min != null ? ` min="${options.min}"` : ""}${options.max != null ? ` max="${options.max}"` : ""}`;
  const control = options.select
    ? `<select ${common}>${options.select.map((item) => `<option value="${esc(item)}"${item === value ? " selected" : ""}>${esc(item)}</option>`).join("")}</select>`
    : options.textarea ? `<textarea ${common}>${esc(value)}</textarea>` : `<input type="${options.type || "text"}" value="${esc(value)}" ${common}>`;
  return `<label class="field ${options.wide ? "wide" : ""}"><span>${esc(label)}</span>${control}${options.help ? `<small class="muted">${esc(options.help)}</small>` : ""}</label>`;
}

function renderSelection() {
  if (!selected) return `${modeHead("Arrangement inspector", "Select any clip, track, gate marker, or automation point.")}<p class="muted">Use the canvas, arrow keys, or accessible event list. Events remain fully inspectable without reading the canvas.</p>`;
  if (selected.kind === "clip") {
    const event = selected.data.event;
    return `${modeHead(event.data?.toolName || event.type, event.message || "Timeline event")}
      <div class="statline"><div><span>Position</span><strong>${selected.data.phaseIndex + 1}.${Math.floor((selected.data.position % 1) * 4) + 1}</strong></div><div><span>Agent track</span><strong>${esc(selected.data.agentId)}</strong></div><div><span>Level</span><strong>${esc(event.level)}</strong></div><div><span>Time</span><strong>${esc(date(event.ts))}</strong></div></div>
      <section class="panel-section"><h3>Clip payload</h3><pre>${esc(JSON.stringify(event.raw || event, null, 2))}</pre></section>`;
  }
  if (selected.kind === "track") {
    const trackEvents = snapshot.events.filter((event) => (event.agentId || event.source) === selected.id).slice(-20).reverse();
    return `${modeHead(selected.data.label || selected.id, selected.data.role || "Agent track")}<div class="statline"><div><span>Status</span><strong>${esc(selected.data.status)}</strong></div><div><span>Phase</span><strong>${esc(selected.data.currentPhase || workflowPhase())}</strong></div></div><p>${esc(selected.data.currentTask || selected.data.lastMessage || "No current task reported.")}</p><section class="panel-section"><h3>Recent clips</h3><div class="stack">${trackEvents.map((event) => `<button class="list-button" data-select-clip="${esc(event.id)}"><strong>${esc(event.message || event.type)}</strong><small>${esc(time(event.ts))} / ${esc(event.type)}</small></button>`).join("") || '<p class="muted">No events.</p>'}</div></section><details><summary>Raw agent</summary><pre>${esc(JSON.stringify(selected.data, null, 2))}</pre></details>`;
  }
  return `${modeHead(selected.kind === "gate" ? "Gate marker" : "Steering automation", selected.id)}<pre>${esc(JSON.stringify(selected.data, null, 2))}</pre>`;
}

function renderOperations() {
  const state = snapshot.state || {};
  const control = snapshot.control || {};
  const blocker = state.block || state.blocker || state.hold;
  const advice = array(control.deblockAdvice).find((item) => item.status === "pending");
  const steering = array(control.activeSteering);
  const target = control.autoIteration?.targetGenerations || control.autoIteration?.maxIterations || 10;
  return `${modeHead("Operations", "Lifecycle, showcase, recovery, and steering automation")}
    <div class="statline"><div><span>Workflow</span><strong>${esc(workflowPhase())}</strong></div><div><span>Admission</span><strong>${esc(control.runAdmission || "enabled")}</strong></div><div><span>Run</span><strong>${esc(state.currentRunId || "none")}</strong></div><div><span>Objective</span><strong>${esc(control.currentObjective?.text || state.currentTask || "unset")}</strong></div></div>
    <section class="panel-section"><h3>Lifecycle transport</h3><div class="action-strip">${["pause", "hold", "resume", "unhold", "stop", "run-now"].map((type) => `<button data-command="${type}"${type === "stop" ? ' class="danger"' : ""}>${type}</button>`).join("")}</div></section>
    <section class="panel-section"><h3>Showcase controls</h3><div class="action-strip"><button class="primary" data-showcase="start-showcase-loop">Start loop</button><button data-command="pause-showcase-loop">Pause</button><button data-command="resume-showcase-loop">Resume</button><button class="danger" data-command="stop-showcase-loop">Stop</button></div><form id="targetForm" class="inline">${formField("targetGenerations", "Target generations", target, { type: "number", min: 1, max: 10, required: true })}<button>Set target</button></form></section>
    <section class="panel-section"><h3>Generate / lineage</h3><div class="action-strip"><button data-start-generation>Start next generation</button>${snapshot.selectedIterationId ? `<button data-iteration-command="continue-from-iteration">Continue selected</button><button data-iteration-command="fork-from-iteration">Fork selected</button>` : ""}</div></section>
    ${blocker ? `<section class="panel-section error"><h3>Active blocker</h3><p>${esc(blocker.reason || blocker.message || blocker)}</p><form id="deblockForm">${formField("prompt", "Recovery prompt", "", { textarea: true })}<div class="action-strip"><button class="primary">Queue deblock</button><button type="button" data-command="deblock-advice">Ask advice</button></div></form>${advice ? `<div class="row"><strong>${esc(advice.answer)}</strong><div class="action-strip"><button data-advice="approve" data-id="${esc(advice.id)}">Approve advice</button><button data-advice="deny" data-id="${esc(advice.id)}">Deny advice</button></div></div>` : ""}</section>` : `<section class="panel-section"><h3>Recovery</h3><p class="muted">No blocker reported. Advice and deblock controls appear when relevant.</p></section>`}
    <section class="panel-section"><h3>Steering automation</h3><form id="steerForm">${formField("instruction", "Instruction", "", { textarea: true, required: true })}<button class="primary">Add steering</button></form><form id="objectiveForm" class="inline">${formField("text", "Current objective", control.currentObjective?.text || "", { required: true })}<button>Set objective</button></form><div class="stack">${steering.map((item) => `<div class="row automation"><header><strong>${esc(item.id)}</strong><button data-remove-steering="${esc(item.id)}">Remove</button></header><span>${esc(item.instruction || item.text || item.objective || clip(item))}</span></div>`).join("") || '<p class="muted">No active steering.</p>'}</div></section>`;
}

function renderQueue() {
  const items = array(snapshot.queue?.items);
  return `${modeHead("Upcoming set list", "Queue, pin, archive, and next-direction controls")}<div class="action-strip"><button class="danger" data-command="clear-queue">Clear queue</button></div>
    <form id="queueForm" class="panel-section"><h3>Add queue item</h3>${formField("objective", "Objective", "", { textarea: true, required: true })}${formField("preferredRepo", "Preferred repository")}${formField("mode", "Mode", "managed", { select: ["managed", "classic"] })}<label><input type="checkbox" name="pin"> Pin after adding</label><br><button class="primary">Add to set list</button></form>
    <section class="panel-section"><h3>${items.length} items</h3><div class="stack">${items.map((item, index) => `<article class="row${item.status === "pinned" ? " selected" : ""}"><header><strong>${index + 1}. ${esc(item.objective || item.title || item.id)}</strong><span>${esc(item.status || "queued")}</span></header><small>${esc(item.id)}${item.target?.preferredRepo ? ` / ${esc(item.target.preferredRepo)}` : ""}</small><div class="action-strip"><button data-queue="pin" data-id="${esc(item.id)}">Pin</button><button data-queue="use" data-id="${esc(item.id)}">Use next</button><button data-queue="archive" data-id="${esc(item.id)}">Archive</button></div></article>`).join("") || '<p class="muted">The upcoming set list is empty.</p>'}</div></section>`;
}

function renderGates() {
  const gates = array(snapshot.gates?.gates);
  return `${modeHead("Gate markers", "Acceptance markers, evidence, updates, and decisions")}
    <form id="gateForm" class="panel-section"><h3>Add marker</h3>${formField("id", "Gate ID", "", { required: true })}${formField("description", "Description", "", { textarea: true, required: true })}${formField("severity", "Severity", "must", { select: ["must", "should"] })}${formField("requiredEvidence", "Required evidence paths", "", { textarea: true, help: "One path per line" })}<button class="primary">Add gate</button></form>
    <div class="stack">${gates.map((gate) => `<article class="row marker"><header><strong>${esc(gate.title || gate.description || gate.id)}</strong><span>${esc(gate.status || "pending")}</span></header><small>${esc(gate.id)} / ${esc(gate.severity || "must")}</small><form class="gateDecisionForm" data-id="${esc(gate.id)}">${formField("status", "Status", gate.status || "passed", { select: ["passed", "failed", "needs-evidence", "pending"] })}${formField("decision", "Decision", gate.decision || "accepted", { select: ["accepted", "rejected", "defer"] })}${formField("evidenceArtifacts", "Evidence paths", array(gate.evidenceArtifacts || gate.requiredEvidence).join("\n"), { textarea: true })}${formField("notes", "Notes", gate.notes || "", { textarea: true })}<div class="action-strip"><button>Record decision</button><button type="button" data-update-gate="${esc(gate.id)}">Update definition</button><button type="button" data-attach-evidence="${esc(gate.id)}">Attach evidence</button></div></form></article>`).join("") || '<p class="muted">No gate markers.</p>'}</div>`;
}

function renderResources() {
  const selectedRun = snapshot.selectedRun;
  const run = selectedRun.run;
  const tabs = ["run", "spec", "devplan", "artifacts", "logs"];
  let content = "";
  if (resourcePreview) content = `<button data-clear-preview>Back to file list</button><h3>${esc(resourcePreview.name)}</h3><pre>${esc(resourcePreview.text)}</pre>`;
  else if (resourceTab === "run") content = run ? `<pre>${esc(JSON.stringify(run, null, 2))}</pre>` : '<p class="muted">No run selected.</p>';
  else if (["spec", "devplan"].includes(resourceTab)) content = `<button class="primary" data-load-document="${resourceTab}">Load ${resourceTab.toUpperCase()} document</button><p class="muted">Document candidates are resolved through the dashboard client.</p>`;
  else {
    const files = resourceTab === "artifacts" ? selectedRun.artifacts : selectedRun.logs;
    content = `<div class="stack">${files.map((file) => `<button class="file-button" data-resource-kind="${resourceTab === "artifacts" ? "artifact" : "log"}" data-resource-name="${esc(file.name)}"><strong>${esc(file.name)}</strong><small>${esc(file.size)} bytes / ${esc(date(file.modifiedAt))}</small></button>`).join("") || `<p class="muted">No ${resourceTab} for this run.</p>`}</div>`;
  }
  return `${modeHead("Run resources", "Run record, documents, artifacts, and logs")}<div class="tabs">${tabs.map((tab) => `<button data-resource-tab="${tab}" class="${resourceTab === tab ? "active" : ""}">${tab}</button>`).join("")}</div>${content}`;
}

function renderIterations() {
  const detail = snapshot.iterationDetail;
  return `${modeHead("Iterations", "Inspect evidence and choose continuation or fork pathways")}<div class="stack">${snapshot.iterations.map((iteration) => `<button class="list-button${snapshot.selectedIterationId === iteration.id ? " selected" : ""}" data-iteration="${esc(iteration.id)}"><strong>${esc(iteration.objective || iteration.id)}</strong><small>${esc(iteration.status || "unknown")} / generation ${esc(iteration.generation || "-")} / ${esc(date(iteration.startedAt))}</small></button>`).join("") || '<p class="muted">No iterations recorded.</p>'}</div>${detail ? `<section class="panel-section"><h3>${esc(detail.objective || detail.id)}</h3><div class="statline"><div><span>Status</span><strong>${esc(detail.status || "unknown")}</strong></div><div><span>Gate</span><strong>${esc(detail.gateStatus || "unknown")}</strong></div><div><span>Variants</span><strong>${array(detail.variants).length}</strong></div><div><span>Evidence</span><strong>${array(detail.artifacts).length}</strong></div></div><div class="action-strip"><button class="primary" data-iteration-command="continue-from-iteration">Continue</button><button data-iteration-command="fork-from-iteration">Fork</button><button data-iteration-command="use-as-next-direction">Use accepted direction</button></div><details><summary>Complete iteration record</summary><pre>${esc(JSON.stringify(detail, null, 2))}</pre></details></section>` : ""}`;
}

const planDefaults = (pipelineType) => ({
  pipelineType, title: "", problem: "", intendedUsers: "", objective: "", boundedScope: "", requirements: [], nonGoals: [], constraints: [], risks: [],
  repository: { path: null, baseRef: null, baseCommit: null }, acceptanceGates: [],
  validationPolicy: { id: "apb.runner-selected.v1", expectations: [], clientCommandsAllowed: false }, milestones: [],
  limits: { maxIterations: 1, maxVariantsPerIteration: 3, maxParallelVariants: 3, maxAcceptedFeatures: 4, maxVisualMotifChanges: 1, maxNewSections: 1, stopAfterNoImprovement: 1 },
  lineage: { mode: "new", sourcePlanId: null, sourceRevision: null, sourceRunId: null, sourceIterationId: null }
});

function parseGates(value) {
  return lines(value).map((line, index) => { const [id, description, severity = "must", evidence = ""] = line.split("|").map((part) => part.trim()); const requiredEvidence = evidence.split(",").map((part) => part.trim()).filter(Boolean); return { id: id || `gate-${index + 1}`, description, severity, required: Boolean(requiredEvidence.length), requiredEvidence }; });
}

function planForm(content) {
  const limits = content.limits || planDefaults(content.pipelineType).limits;
  return `<form id="planForm" class="form-grid">
    ${formField("pipelineType", "Pipeline", content.pipelineType, { select: ["classic", "managed"] })}${formField("title", "Title", content.title, { required: true })}
    ${formField("problem", "Problem", content.problem, { textarea: true, wide: true, required: true })}${formField("intendedUsers", "Intended users", content.intendedUsers, { textarea: true })}${formField("objective", "Measurable objective", content.objective, { textarea: true, required: true })}
    ${formField("boundedScope", "Bounded scope", content.boundedScope, { textarea: true, wide: true, required: true })}${formField("requirements", "Requirements", array(content.requirements).join("\n"), { textarea: true })}${formField("nonGoals", "Non-goals", array(content.nonGoals).join("\n"), { textarea: true })}${formField("constraints", "Constraints", array(content.constraints).join("\n"), { textarea: true })}${formField("risks", "Risks", array(content.risks).join("\n"), { textarea: true })}
    ${formField("repositoryPath", "Repository path", content.repository?.path || "")}${formField("baseRef", "Base ref", content.repository?.baseRef || "")}${formField("acceptanceGates", "Acceptance gates", array(content.acceptanceGates).map((gate) => `${gate.id} | ${gate.description} | ${gate.severity} | ${array(gate.requiredEvidence).join(", ")}`).join("\n"), { textarea: true, wide: true, help: "id | description | severity | evidence paths" })}${formField("validationExpectations", "Validation expectations", array(content.validationPolicy?.expectations).join("\n"), { textarea: true })}${formField("milestones", "Milestones", array(content.milestones).join("\n"), { textarea: true })}
    ${Object.entries(limits).map(([key, value]) => formField(key, key, value, { type: "number", min: 0, max: 20 })).join("")}
    <div class="wide action-strip"><button class="primary">Save revision</button><button type="button" data-plan-action="project-plan.ready-for-review">Ready for review</button></div></form>`;
}

function collectPlan(form, old) {
  const data = new FormData(form);
  const pipelineType = String(data.get("pipelineType"));
  const limitKeys = ["maxIterations", "maxVariantsPerIteration", "maxParallelVariants", "maxAcceptedFeatures", "maxVisualMotifChanges", "maxNewSections", "stopAfterNoImprovement"];
  return { ...old, pipelineType, title: String(data.get("title")), problem: String(data.get("problem")), intendedUsers: String(data.get("intendedUsers")), objective: String(data.get("objective")), boundedScope: String(data.get("boundedScope")), requirements: lines(data.get("requirements")), nonGoals: lines(data.get("nonGoals")), constraints: lines(data.get("constraints")), risks: lines(data.get("risks")), repository: pipelineType === "managed" ? { path: String(data.get("repositoryPath")) || null, baseRef: String(data.get("baseRef")) || null, baseCommit: null } : { path: null, baseRef: null, baseCommit: null }, acceptanceGates: parseGates(data.get("acceptanceGates")), validationPolicy: { id: "apb.runner-selected.v1", expectations: lines(data.get("validationExpectations")), clientCommandsAllowed: false }, milestones: lines(data.get("milestones")), limits: Object.fromEntries(limitKeys.map((key) => [key, Number(data.get(key))])) };
}

function renderPlans() {
  const detail = snapshot.planDetail;
  return `${modeHead("Project plans", "Complete edit, review, approval, launch, lineage, and archive workflow")}
    <div class="action-strip"><button data-create-plan="classic">New classic</button><button data-create-plan="managed">New managed</button></div>
    <div class="stack">${snapshot.plans.map((plan) => `<button class="list-button${planSelection === plan.planId ? " selected" : ""}" data-plan="${esc(plan.planId)}"><strong>${esc(plan.title || "Untitled plan")}</strong><small>${esc(plan.pipelineType)} / ${esc(plan.state)} / revision ${esc(plan.currentRevision)}</small></button>`).join("") || '<p class="muted">No persisted plans.</p>'}</div>
    ${detail ? `<section class="panel-section"><div class="statline"><div><span>State</span><strong>${esc(detail.ledger.state)}</strong></div><div><span>Revision</span><strong>${esc(detail.revision.revision)}</strong></div><div><span>Digest</span><strong>${esc(detail.revision.contentDigest)}</strong></div><div><span>Version</span><strong>${esc(detail.ledger.version)}</strong></div></div>${planForm(detail.revision.content)}<section class="review-box"><h3>Immutable review and decision</h3><pre>${esc(JSON.stringify(detail.revision.content, null, 2))}</pre>${formField("decisionNotes", "Decision notes", "", { textarea: true })}<div class="action-strip"><button data-plan-action="project-plan.approve">Approve</button><button class="danger" data-plan-action="project-plan.reject">Reject</button><button class="primary" data-plan-action="project-plan.launch">Launch</button><button data-plan-action="project-plan.clone">Clone</button><button data-plan-action="project-plan.fork">Fork</button><button class="danger" data-plan-action="project-plan.archive">Archive</button></div><h3>Saved revisions</h3><div class="action-strip">${array(detail.revisions).map((item) => `<button data-plan-revision="${esc(item.revision)}">Revision ${esc(item.revision)}</button>`).join("")}</div>${planRevisionPreview ? `<pre>${esc(JSON.stringify(planRevisionPreview, null, 2))}</pre>` : ""}<details><summary>Revision, decision, and launch history</summary><pre>${esc(JSON.stringify({ revisions: detail.revisions, decisions: detail.decisions, launches: detail.launches }, null, 2))}</pre></details></section></section>` : ""}`;
}

function renderAssist() {
  const detail = snapshot.assistanceDetail;
  return `${modeHead("Planning assistance", "Conversation proposes content but never saves, approves, or launches")}
    <p class="muted">Messages may be sent to the configured inference provider. Suggestions remain discussion until explicitly converted into a project plan.</p>
    <div class="action-strip"><button data-create-assistance="classic">Start classic conversation</button><button data-create-assistance="managed">Start managed conversation</button>${detail?.proposedContent ? '<button class="primary" data-create-from-proposal>Create plan from proposal</button>' : ""}</div>
    <div class="stack">${snapshot.assistance.map((item) => `<button class="list-button${assistanceSelection === item.id ? " selected" : ""}" data-assistance="${esc(item.id)}"><strong>${esc(item.pipelineType)} conversation</strong><small>${esc(item.messageCount)} messages / ${esc(date(item.updatedAt))}</small></button>`).join("") || '<p class="muted">No conversations yet.</p>'}</div>
    ${detail ? `<section class="panel-section"><div class="stack">${array(detail.messages).map((item) => `<article class="assist-message ${esc(item.role)}"><strong>${item.role === "user" ? "You" : "Orchestrator"}</strong><p>${esc(item.content)}</p><small>${esc(date(item.createdAt))}</small></article>`).join("") || '<p class="muted">Describe the project and bounded outcome.</p>'}</div><form id="assistForm">${formField("message", "Planning message", "", { textarea: true, required: true })}<button class="primary">Send message</button></form>${detail.proposedContent ? `<details><summary>Proposed plan content</summary><pre>${esc(JSON.stringify(detail.proposedContent, null, 2))}</pre></details>` : ""}</section>` : ""}`;
}

function renderInspector() {
  const renderers = { arrangement: renderSelection, operations: renderOperations, queue: renderQueue, gates: renderGates, resources: renderResources, iterations: renderIterations, plans: renderPlans, assist: renderAssist };
  $("inspectorTitle").textContent = mode === "arrangement" ? "Inspector" : mode.replace(/\b\w/g, (char) => char.toUpperCase());
  $("inspectorBody").innerHTML = renderers[mode]();
}

function renderTop() {
  const connection = snapshot.connection;
  $("connection").textContent = `${connection.status}${connection.transport ? ` / ${connection.transport}` : ""}`;
  $("connectionLamp").className = `lamp ${connection.status === "connected" ? "live" : ["polling", "connecting", "degraded"].includes(connection.status) ? "degraded" : ""}`;
  $("liveToggle").textContent = connection.paused ? "Resume live" : "Pause live";
  const current = snapshot.selectedRunId;
  $("runSelect").innerHTML = `<option value="">No arrangement</option>${snapshot.runs.map((run) => `<option value="${esc(run.id)}"${run.id === current ? " selected" : ""}>${esc(run.id)} / ${esc(run.status || "unknown")}</option>`).join("")}`;
}

function renderAll() {
  renderTop();
  renderInspector();
  if (!drawQueued) {
    drawQueued = true;
    requestAnimationFrame(() => { drawQueued = false; drawTimeline(); });
  }
}

async function selectPlan(id) {
  planSelection = id;
  planRevisionPreview = null;
  await act("Load plan", () => client.getProjectPlan(id));
  renderInspector();
}

async function planAction(type) {
  const detail = snapshot.planDetail;
  if (!detail) return;
  const planId = detail.ledger.planId;
  const revision = detail.revision.revision;
  const planDigest = detail.revision.contentDigest;
  const notes = document.querySelector('[name="decisionNotes"]')?.value || "";
  const base = { planId, revision, planDigest };
  let payload = base;
  if (type === "project-plan.launch" && !confirm("Launch this exact approved revision through the bounded project-plan pathway?")) return;
  if (type === "project-plan.reject") payload = { ...base, notes: notes || "Rejected by operator" };
  if (type === "project-plan.approve") payload = { ...base, notes };
  if (type === "project-plan.archive") payload = { planId };
  if (["project-plan.clone", "project-plan.fork"].includes(type)) payload = { ...base, sourceRunId: snapshot.selectedRunId || null, sourceIterationId: snapshot.selectedIterationId || null };
  if (type === "project-plan.fork") payload.baseRef = detail.revision.content.repository?.baseRef || "HEAD";
  await act(type, async () => {
    const result = await client.projectPlanCommand(type, payload, { expectedVersion: detail.ledger.version, refresh: true });
    planSelection = result?.planId || planId;
    planRevisionPreview = null;
    await client.getProjectPlan(planSelection);
  });
}

async function handleSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  const data = new FormData(form);
  if (form.id === "targetForm") return command("set-showcase-target", { targetGenerations: Number(data.get("targetGenerations")) });
  if (form.id === "deblockForm") return command("deblock", { runId: snapshot.state?.currentRunId || snapshot.selectedRunId, prompt: String(data.get("prompt") || "") });
  if (form.id === "steerForm") return command("steer", { runId: snapshot.state?.currentRunId || snapshot.selectedRunId, text: String(data.get("instruction")), source: "sequencer" });
  if (form.id === "objectiveForm") return command("set-current-objective", { text: String(data.get("text")), source: "sequencer" });
  if (form.id === "queueForm") return command("add-queue-item", { objective: String(data.get("objective")), mode: String(data.get("mode")), target: { preferredRepo: String(data.get("preferredRepo")) || null }, pin: data.get("pin") === "on", source: "sequencer" });
  if (form.id === "gateForm") return command("add-gate", { id: String(data.get("id")), description: String(data.get("description")), severity: String(data.get("severity")), requiredEvidence: lines(data.get("requiredEvidence")).join("\n") });
  if (form.classList.contains("gateDecisionForm")) return command("gate-decision", { gateId: form.dataset.id, runId: snapshot.selectedRunId || snapshot.state?.currentRunId, status: String(data.get("status")), decision: String(data.get("decision")), evidenceArtifacts: lines(data.get("evidenceArtifacts")), notes: String(data.get("notes")) });
  if (form.id === "planForm") {
    const detail = snapshot.planDetail;
    const content = collectPlan(form, detail.revision.content);
    return act("Save plan", async () => { await client.updateProjectPlan({ planId: detail.ledger.planId, content }, { expectedVersion: detail.ledger.version, refresh: true }); await client.getProjectPlan(detail.ledger.planId); });
  }
  if (form.id === "assistForm") return act("Send planning message", async () => { await client.messagePlanAssistance(snapshot.assistanceDetail.id, snapshot.assistanceDetail.version, String(data.get("message"))); await client.listPlanAssistance(); });
}

document.addEventListener("submit", handleSubmit);
document.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.mode) return setMode(button.dataset.mode);
  if (button.dataset.selectClip) { const item = clips.find((candidate) => candidate.id === button.dataset.selectClip); if (item) selectItem({ kind: "clip", id: item.id, data: item }, true); return; }
  if (button.dataset.command) return command(button.dataset.command, button.dataset.command === "deblock-advice" ? { runId: snapshot.state?.currentRunId || snapshot.selectedRunId, prompt: document.querySelector('#deblockForm [name="prompt"]')?.value || "" } : { reason: "Sequencer operator command" });
  if (button.dataset.showcase) {
    const targetGenerations = Number(snapshot.control?.autoIteration?.targetGenerations || 10);
    return command(button.dataset.showcase, {
      sourceRunId: snapshot.state?.currentRunId || snapshot.selectedRunId,
      sourceIterationId: snapshot.selectedIterationId || null,
      repoPath: snapshot.iterationDetail?.repoPath || snapshot.control?.autoIteration?.repoPath || snapshot.state?.repoPath,
      objective: snapshot.control?.currentObjective?.text || snapshot.state?.objective || snapshot.state?.currentTask || "Bounded showcase progression",
      targetGenerations,
      limits: { maxIterations: targetGenerations, maxVariantsPerIteration: 3, maxParallelVariants: 3, maxAcceptedFeatures: 4, maxVisualMotifChanges: 1, maxNewSections: 1, stopAfterNoImprovement: 1, minImprovementScore: .05 }
    });
  }
  if (button.hasAttribute("data-start-generation")) return command("start-next-iteration", { runId: snapshot.state?.currentRunId || snapshot.selectedRunId, repoPath: snapshot.control?.autoIteration?.repoPath || snapshot.state?.repoPath, objective: snapshot.control?.currentObjective?.text || snapshot.state?.objective || snapshot.state?.currentTask, changeText: "Complete one bounded objective-linked generation without unrelated feature or stack churn." });
  if (button.dataset.advice) return command(button.dataset.advice === "approve" ? "approve-deblock-advice" : "deny-deblock-advice", { adviceId: button.dataset.id, runId: snapshot.state?.currentRunId || snapshot.selectedRunId });
  if (button.dataset.removeSteering) return command("remove-steering", { id: button.dataset.removeSteering });
  if (button.dataset.queue) {
    const item = array(snapshot.queue?.items).find((entry) => String(entry.id) === button.dataset.id);
    if (button.dataset.queue === "use") return command("start-next-iteration", { queueItemId: item?.id, repoPath: item?.target?.preferredRepo || item?.preferredRepo, objective: item?.objective, changeText: item?.context || item?.title || "Complete the selected queue direction.", acceptanceGateIds: item?.acceptanceGateIds || [] });
    return command(button.dataset.queue === "pin" ? "pin-queue-item" : "archive-queue-item", { id: button.dataset.id });
  }
  if (button.dataset.updateGate) {
    const form = button.closest("form"); const data = new FormData(form);
    return command("update-gate", { gateId: button.dataset.updateGate, status: String(data.get("status")), notes: String(data.get("notes")), requiredEvidence: lines(data.get("evidenceArtifacts")) });
  }
  if (button.dataset.attachEvidence) {
    const form = button.closest("form"); const data = new FormData(form);
    return command("attach-gate-evidence", { gateId: button.dataset.attachEvidence, runId: snapshot.selectedRunId || snapshot.state?.currentRunId, evidenceArtifacts: lines(data.get("evidenceArtifacts")) });
  }
  if (button.dataset.resourceTab) { resourceTab = button.dataset.resourceTab; resourcePreview = null; return renderInspector(); }
  if (button.hasAttribute("data-clear-preview")) { resourcePreview = null; return renderInspector(); }
  if (button.dataset.loadDocument) return act(`Load ${button.dataset.loadDocument}`, async () => { resourcePreview = await client.loadDocument(button.dataset.loadDocument); renderInspector(); });
  if (button.dataset.resourceName) return act("Load resource", async () => { resourcePreview = button.dataset.resourceKind === "artifact" ? await client.loadArtifact(button.dataset.resourceName) : await client.loadLog(button.dataset.resourceName); renderInspector(); });
  if (button.dataset.iteration) { await act("Load iteration", () => client.selectIteration(button.dataset.iteration)); return renderInspector(); }
  if (button.dataset.iterationCommand) {
    const detail = snapshot.iterationDetail || snapshot.iterations.find((item) => item.id === snapshot.selectedIterationId) || {};
    const direction = detail.steeringText || detail.nextRecommendedDirection || `${button.dataset.iterationCommand.replaceAll("-", " ")} from ${detail.id || snapshot.selectedIterationId}`;
    return command(button.dataset.iterationCommand, {
      sourceIterationId: detail.id || snapshot.selectedIterationId,
      sourceRunId: detail.runId || snapshot.selectedRunId,
      repoPath: detail.repoPath || snapshot.control?.autoIteration?.repoPath || snapshot.state?.repoPath,
      baseRef: detail.commit || detail.baseRef || "HEAD",
      objective: detail.objective || snapshot.control?.currentObjective?.text || snapshot.state?.objective || "Continue the selected bounded iteration direction.",
      changeText: direction,
      acceptanceGateIds: array(detail.acceptanceGateIds),
      limits: { maxIterations: 1, maxVariantsPerIteration: 3, maxParallelVariants: 3 }
    });
  }
  if (button.dataset.plan) return selectPlan(button.dataset.plan);
  if (button.dataset.planRevision && snapshot.planDetail) return act("Load plan revision", async () => { planRevisionPreview = await client.getProjectPlanRevision(snapshot.planDetail.ledger.planId, Number(button.dataset.planRevision)); renderInspector(); });
  if (button.dataset.createPlan) return act("Create plan", async () => { const result = await client.createProjectPlan({ content: planDefaults(button.dataset.createPlan) }, { refresh: true }); planSelection = result.planId; await client.getProjectPlan(result.planId); });
  if (button.dataset.planAction) return planAction(button.dataset.planAction);
  if (button.dataset.createAssistance) return act("Start planning conversation", async () => { const detail = await client.createPlanAssistance(button.dataset.createAssistance); assistanceSelection = detail.id; await client.listPlanAssistance(); });
  if (button.dataset.assistance) return act("Load conversation", async () => { assistanceSelection = button.dataset.assistance; await client.getPlanAssistance(button.dataset.assistance); });
  if (button.hasAttribute("data-create-from-proposal")) return act("Create plan from proposal", async () => { const detail = snapshot.assistanceDetail; const result = await client.createProjectPlan({ content: detail.proposedContent }, { refresh: true }); planSelection = result.planId; await client.getProjectPlan(result.planId); setMode("plans"); });
});

$("timeline").addEventListener("pointerdown", (event) => {
  const rect = $("timeline").getBoundingClientRect();
  const x = event.clientX - rect.left; const y = event.clientY - rect.top;
  const region = [...hitRegions].reverse().find((candidate) => x >= candidate.x && x <= candidate.x + candidate.width && y >= candidate.y && y <= candidate.y + candidate.height);
  if (region) selectItem(region.item, true);
  else { playhead = Math.max(0, Math.min(WORKFLOW_PHASES.length - .01, (x - canvasMetrics().header) / zoom)); drawTimeline(); }
});

function navigateClips(direction, byTrack = false) {
  if (!clips.length) return;
  let index = selected?.kind === "clip" ? clips.findIndex((item) => item.id === selected.id) : -1;
  if (byTrack && index >= 0) {
    const current = clips[index]; const targetTrack = Math.max(0, Math.min(tracks.length - 1, current.track + direction));
    let best = clips.filter((item) => item.track === targetTrack).sort((a, b) => Math.abs(a.position - current.position) - Math.abs(b.position - current.position))[0];
    if (best) index = clips.indexOf(best);
  } else index = Math.max(0, Math.min(clips.length - 1, index + direction));
  const item = clips[index];
  selectItem({ kind: "clip", id: item.id, data: item });
  const x = canvasMetrics().header + item.position * zoom;
  $("canvasScroller").scrollTo({ left: Math.max(0, x - $("canvasScroller").clientWidth / 2), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

$("canvasScroller").addEventListener("keydown", (event) => {
  if (event.key === "ArrowRight") navigateClips(1);
  else if (event.key === "ArrowLeft") navigateClips(-1);
  else if (event.key === "ArrowDown") navigateClips(1, true);
  else if (event.key === "ArrowUp") navigateClips(-1, true);
  else if (event.key === "Home") { const item = clips[0]; if (item) selectItem({ kind: "clip", id: item.id, data: item }); }
  else if (event.key === "End") { const item = clips.at(-1); if (item) selectItem({ kind: "clip", id: item.id, data: item }); }
  else if (event.key === "Enter" && selected) openInspector();
  else if (["+", "="].includes(event.key)) { zoom = Math.min(180, zoom + 6); syncViewControls(); drawTimeline(); }
  else if (event.key === "-") { zoom = Math.max(42, zoom - 6); syncViewControls(); drawTimeline(); }
  else return;
  event.preventDefault();
});

$("filter").addEventListener("input", (event) => { query = event.target.value; drawTimeline(); });
$("eventType").addEventListener("change", (event) => { eventType = event.target.value; drawTimeline(); });
$("density").addEventListener("change", (event) => { density = event.target.value; syncViewControls(); drawTimeline(); });
$("zoom").addEventListener("input", (event) => { zoom = Number(event.target.value); syncViewControls(); drawTimeline(); });
$("fit").addEventListener("click", fitCanvas);
$("goStart").addEventListener("click", () => { playhead = 0; $("canvasScroller").scrollLeft = 0; drawTimeline(); });
$("refresh").addEventListener("click", () => act("Refresh", () => client.refresh()));
$("liveToggle").addEventListener("click", () => snapshot.connection.paused ? act("Resume live", () => client.resume()) : client.pause());
$("reconnect").addEventListener("click", () => act("Reconnect live", () => client.connect()));
$("disconnect").addEventListener("click", () => { client.disconnect(); showMessage("Live transport disconnected."); });
$("runSelect").addEventListener("change", (event) => act("Load arrangement", () => client.selectRun(event.target.value || null)));
$("openModes").addEventListener("click", () => { const open = $("modeRail").classList.toggle("open"); $("openModes").setAttribute("aria-expanded", String(open)); });
$("closeInspector").addEventListener("click", closeInspector);
window.addEventListener("resize", () => drawTimeline());
document.addEventListener("keydown", (event) => {
  if (event.target.matches("input,textarea,select,[contenteditable=true]") || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.code === "Space") { event.preventDefault(); snapshot.connection.paused ? act("Resume live", () => client.resume()) : client.pause(); }
  if (event.key.toLowerCase() === "r") { event.preventDefault(); act("Refresh", () => client.refresh()); }
  if (event.key === "Escape") closeInspector();
});

client.subscribe((next) => { snapshot = next; renderAll(); });
syncViewControls();
client.connect().then(async () => {
  await client.listPlanAssistance().catch(() => {});
  if (snapshot.selectedRunId && !snapshot.selectedRun.run) await client.loadRunResources().catch(() => {});
}).catch((error) => showMessage(`Connection failed: ${error.message}`, true));
