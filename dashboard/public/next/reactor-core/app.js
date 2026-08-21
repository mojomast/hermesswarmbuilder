import { createDashboardClient, WORKFLOW_PHASES, OPERATION_COMMANDS } from "../../headless-dashboard-client.js";

const $ = (id) => document.getElementById(id);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const client = createDashboardClient({ maxEvents: 1000, eventLimit: 500, pollIntervalMs: 4000 });
const arr = (value) => Array.isArray(value) ? value : [];
const first = (...values) => values.find((value) => value !== undefined && value !== null && value !== "") ?? "";
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const json = (value) => { try { return JSON.stringify(value, null, 2); } catch { return String(value); } };
const lines = (value) => String(value || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
const lower = (value) => String(value || "").toLowerCase();
const blocked = (value) => ["blocked", "failed", "error", "on-hold", "deblocking"].some((part) => lower(value).includes(part));

let snapshot = client.getSnapshot();
let activeCmdTab = "runctrl";
let activePlanTab = "list";
let activeEvidenceTab = "spec";
let telemetryFilter = "all";
let selected = { type: "channel", id: "CH-01", label: "Channel 01", status: "empty", data: {}, channel: 1 };
let selectedPlanDetail = null;
let assistanceDetail = null;
let lastCommand = null;
let renderQueued = false;
let evidenceRequestRevision = 0;
let resourceRequestRevision = 0;
let lastAnnouncedConnection = "";
let lastAnnouncedEventId = "";
const pendingCommands = new Set();
const commandViewStates = new Map();
const plannerViewStates = new Map();

export const actions = Object.freeze({
  selectRun: (id) => client.selectRun(id), selectIteration: (id) => client.selectIteration(id),
  loadArtifact: (name, runId) => client.loadArtifact(name, runId), loadLog: (name, runId, options) => client.loadLog(name, runId, options),
  loadDocument: (kind, runId) => client.loadDocument(kind, runId), command: (type, payload, options) => client.command(type, payload, options),
  getProjectPlan: (id) => client.getProjectPlan(id), listPlanAssistance: () => client.listPlanAssistance()
});

function date(value) {
  if (!value) return "not reported";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? String(value) : parsed.toLocaleString();
}

function age(value) {
  const elapsed = Date.now() - new Date(value || 0).valueOf();
  if (!Number.isFinite(elapsed) || !value) return "no reading";
  if (elapsed < 60_000) return `${Math.max(0, Math.round(elapsed / 1000))}s ago`;
  if (elapsed < 3_600_000) return `${Math.round(elapsed / 60_000)}m ago`;
  return `${Math.round(elapsed / 3_600_000)}h ago`;
}

function toast(message, type = "info") {
  const node = $("rcToast");
  node.textContent = message?.message || String(message);
  node.hidden = false;
  node.className = `rc-toast ${type}`;
  clearTimeout(node._timer);
  node._timer = setTimeout(() => { node.hidden = true; }, 6000);
}

function controlKey(control) {
  const form = control.closest("form");
  const owner = first(form?.dataset.draftOwner, form?.id, form?.dataset.commandForm, form?.dataset.special, form?.dataset.gateForm, "view");
  const commandIdentity = control.dataset.command ? `${control.dataset.command}|${control.dataset.payload || ""}` : "";
  const identity = first(control.id, control.name, commandIdentity, control.dataset.queueStart, control.dataset.gateAction, control.dataset.objectId, control.dataset.planAction, control.dataset.assistanceId, control.dataset.planId, control.dataset.newPlan, control.dataset.newAssistance, control.textContent?.trim());
  return `${owner}|${identity}`;
}

function captureControls(root, view, previous = null) {
  if (!root || !view || root.dataset.renderView !== view) return previous;
  const active = document.activeElement;
  const focusedControl = root.contains(active) && active.matches?.("input, textarea, select, button") ? active : null;
  const focusKey = focusedControl ? controlKey(focusedControl) : previous?.focusKey || "";
  const values = $$('input, textarea, select', root).map((control) => [
    controlKey(control), control.type === "checkbox" ? control.checked : control.value
  ]);
  const scroll = [["__root", root.scrollTop, root.scrollLeft], ...$$('textarea', root).map((node) => [controlKey(node), node.scrollTop, node.scrollLeft])];
  const selection = focusedControl && typeof focusedControl.selectionStart === "number" ? { key: focusKey, start: focusedControl.selectionStart, end: focusedControl.selectionEnd, direction: focusedControl.selectionDirection } : previous?.selection || null;
  return { focusKey, values, scroll, selection };
}

function restoreControls(root, view, saved) {
  root.dataset.renderView = view;
  if (!saved) return;
  const values = new Map(saved.values);
  $$('input, textarea, select', root).forEach((control) => {
    const key = controlKey(control);
    if (!values.has(key)) return;
    if (control.type === "checkbox") control.checked = values.get(key);
    else control.value = values.get(key);
  });
  const scroll = new Map(saved.scroll?.map(([key, top, left]) => [key, { top, left }]) || []);
  const rootScroll = scroll.get("__root");
  if (rootScroll) { root.scrollTop = rootScroll.top; root.scrollLeft = rootScroll.left; }
  $$('textarea', root).forEach((node) => {
    const position = scroll.get(controlKey(node));
    if (position) { node.scrollTop = position.top; node.scrollLeft = position.left; }
  });
  if (saved.focusKey) {
    const target = $$("input, textarea, select, button", root).find((control) => controlKey(control) === saved.focusKey);
    if (target && !target.disabled) {
      target.focus({ preventScroll: true });
      if (saved.selection?.key === saved.focusKey && typeof target.setSelectionRange === "function") target.setSelectionRange(saved.selection.start, saved.selection.end, saved.selection.direction || "none");
    }
  }
}

function preserveRenderedView(root, states) {
  const view = root?.dataset.renderView;
  if (view) states.set(view, captureControls(root, view, states.get(view)));
}

function plannerViewKey() {
  return activePlanTab === "copilot" ? `copilot:${assistanceDetail?.id || "list"}` : activePlanTab;
}

function announceLiveChanges(next) {
  const announcements = [];
  const connection = next.connection?.status || "disconnected";
  if (lastAnnouncedConnection && connection !== lastAnnouncedConnection) announcements.push(`Connection ${connection}`);
  lastAnnouncedConnection = connection;
  const event = arr(next.events).at(-1);
  if (event?.id && lastAnnouncedEventId && event.id !== lastAnnouncedEventId) announcements.push(`${first(event.data?.toolName, event.type, "Event")}: ${first(event.message, event.data?.action, event.level, "updated")}`);
  if (event?.id) lastAnnouncedEventId = event.id;
  if (announcements.length) $("rcLiveStatus").textContent = announcements.join(". ").slice(0, 240);
}

function currentObjective() {
  const pinned = arr(snapshot.queue?.items).find((item) => item.id === snapshot.control?.pinnedQueueItemId);
  return first(snapshot.control?.currentObjective?.text, pinned?.objective, snapshot.state?.objective, snapshot.state?.task, "");
}

function stateBlockers() {
  const state = snapshot.state || {};
  const values = [...arr(state.blockers), state.block, state.blocker, blocked(state.status) ? state.hold || state.lastAction : null].filter(Boolean);
  return values.map((value, index) => {
    const data = typeof value === "object" ? value : { reason: String(value) };
    return { ...data, id: String(first(data.id, `blocker-${index}`)), reason: first(data.reason, data.message, data.error, state.lastAction, "Reason not reported"), runId: first(data.runId, state.currentRunId), status: first(data.status, state.status, "blocked") };
  });
}

function normalizedEvents() {
  return arr(snapshot.events).map((event) => ({
    type: event.data?.toolName || lower(event.type).includes("tool") ? "tool" : "event",
    id: event.id, label: first(event.data?.toolName, event.message, event.type, "event"),
    status: first(event.data?.status, event.level, "info"), data: event
  }));
}

function operationalObjects() {
  const objects = [];
  stateBlockers().forEach((item) => objects.push({ type: "blocker", id: item.id, label: item.reason, status: item.status, data: item }));
  const rawAgents = Array.isArray(snapshot.state?.agents) ? snapshot.state.agents : Object.values(snapshot.state?.agents || {});
  rawAgents.forEach((item, index) => objects.push({ type: "agent", id: String(first(item.id, item.name, `agent-${index}`)), label: first(item.label, item.name, item.role, item.id, `Agent ${index + 1}`), status: first(item.status, "observed"), data: item }));
  arr(snapshot.runs).forEach((item) => objects.push({ type: "run", id: item.id, label: first(item.selectedProject, item.id), status: first(item.status, "unknown"), data: item }));
  arr(snapshot.iterations).forEach((item) => objects.push({ type: "iteration", id: item.id, label: first(item.objective, item.id), status: first(item.status, "unknown"), data: item }));
  arr(snapshot.queue?.items).forEach((item) => objects.push({ type: "queue", id: item.id, label: first(item.title, item.id), status: first(item.status, "queued"), data: item }));
  arr(snapshot.gates?.gates).forEach((item) => objects.push({ type: "gate", id: item.id, label: first(item.description, item.title, item.id), status: first(item.status, "pending"), data: item }));
  arr(snapshot.plans).forEach((item) => objects.push({ type: "plan", id: item.planId, label: first(item.title, item.planId), status: first(item.state, "draft"), data: item }));
  normalizedEvents().slice(-30).reverse().forEach((item) => objects.push(item));
  return objects;
}

function runIdFor(item = selected) {
  return first(item.type === "run" ? item.id : "", item.data?.runId, item.data?.sourceRunId, item.data?.data?.runId, item.type === "agent" ? snapshot.state?.currentRunId : "");
}

function correlatedEvents(item = selected) {
  const runId = runIdFor(item);
  return arr(snapshot.events).filter((event) => {
    if (["event", "tool"].includes(item.type)) return event.id === item.id;
    if (item.type === "agent") return first(event.agentId, event.data?.agentId, event.source) === item.id && (!runId || event.runId === runId);
    if (item.type === "run") return event.runId === item.id;
    if (item.type === "gate") return event.data?.gateId === item.id || lower(json(event)).includes(lower(item.id));
    if (item.type === "queue") return event.data?.queueItemId === item.id || lower(json(event)).includes(lower(item.id));
    if (item.type === "iteration") return event.data?.iterationId === item.id || (runId && event.runId === runId);
    if (item.type === "blocker") return (item.data.toolCallId && event.data?.toolCallId === item.data.toolCallId) || (runId && event.runId === runId);
    return false;
  }).slice(-25).reverse();
}

function blockerFor(item = selected) {
  const runId = runIdFor(item);
  return stateBlockers().find((blocker) => item.type === "blocker" && blocker.id === item.id || runId && blocker.runId === runId || item.type === "agent" && first(blocker.agentId, blocker.ownerAgentId) === item.id) || null;
}

function objectOwner(item) {
  const data = item.data || {};
  if (item.type === "agent") return first(data.label, data.name, data.id, item.id);
  if (["event", "tool"].includes(item.type)) return first(data.agentId, data.data?.agentId, data.source, "system");
  return first(data.owner, data.ownerAgentId, data.agentId, data.createdBy, data.updatedBy, data.requestedBy, data.decidedBy, data.ledger?.createdBy, data.ledger?.updatedBy, "not reported");
}

function objectWork(item) {
  const data = item.data || {};
  return first(data.currentTask, data.task, data.objective, data.description, data.title, data.revision?.content?.objective, data.revision?.content?.problem, data.message, data.data?.action, data.reason, "not reported");
}

function recoveryFor(item, blocker) {
  if (blocker) return first(blocker.suggestedAction, blocker.safeRecoveryAction, blocker.recoveryAction, "Inspect evidence, then prepare deblock guidance for the current run or a continuation/fork for historical work.");
  if (item.type === "gate") return "Attach existing run artifact paths, then record a gate decision; a decision does not create evidence.";
  if (item.type === "iteration") return "Load iteration evidence, then continue, fork, or use its direction with a complete bounded request.";
  if (item.type === "queue") return "Pin the brief or start a bounded iteration using its objective, repository target, constraints, and gates.";
  if (item.type === "plan") return "Edit a new immutable revision, submit it for review, approve the exact digest, then launch.";
  if (["event", "tool"].includes(item.type) && blocked(item.status)) return "Inspect sanitized input/output and the owning run resources before steering, deblocking, continuing, or forking.";
  return "No recovery is indicated by current server state. Continue monitoring correlated telemetry.";
}

function selectObject(type, id, open = true, channel = null) {
  const object = operationalObjects().find((item) => item.type === type && item.id === id);
  if (object) selected = { ...object, ...(channel ? { channel } : {}) };
  else if (type === "channel") selected = { type, id, label: id, status: "empty", data: {}, channel: Number(id.replace(/\D/g, "")) };
  const runId = runIdFor(selected);
  let detailRequest = null;
  if (selected.type === "run") detailRequest = client.selectRun(selected.id).then(() => client.getSnapshot().selectedRun?.run);
  else if (selected.type === "iteration") detailRequest = client.selectIteration(selected.id).then(() => client.getSnapshot().iterationDetail);
  else if (selected.type === "plan") detailRequest = client.getProjectPlan(selected.id);
  else if (runId && snapshot.selectedRunId !== runId) client.selectRun(runId).catch((error) => toast(error, "error"));
  renderSelectionSummary();
  renderHexCore();
  if (open) openDossier();
  if (detailRequest) detailRequest.then((detail) => {
    if (!detail || selected.type !== type || selected.id !== id) return;
    selected = { ...selected, data: detail, status: first(detail.ledger?.state, detail.status, detail.state, selected.status), label: first(detail.revision?.content?.title, detail.objective, detail.id, selected.label) };
    renderSelectionSummary();
    if (open && $("dossierModal").open) openDossier();
  }).catch((error) => toast(error, "error"));
}

function renderSelectionSummary() {
  const events = correlatedEvents();
  const blocker = blockerFor();
  $("lblSelectedFa").textContent = `${selected.channel ? `CH-${String(selected.channel).padStart(2, "0")} / ` : ""}${selected.type.toUpperCase()} ${selected.id}`;
  $("faIdDisplay").textContent = selected.id;
  $("lblFaRing").textContent = selected.type === "channel" ? "UNASSIGNED CHANNEL" : selected.type.toUpperCase();
  $("lblFaPower").textContent = objectOwner(selected);
  $("lblFaBurnup").textContent = objectWork(selected);
  $("lblFaTemp").textContent = selected.status;
  $("lblFaDnbr").textContent = String(events.length);
  $("lblFaQptr").textContent = blocker ? "ACTION AVAILABLE" : "MONITOR";
}

function evidenceNames(item) {
  const data = item.data || {};
  return [...new Set([
    ...arr(data.requiredEvidence), ...arr(data.evidenceArtifacts), ...arr(data.artifacts).map((entry) => entry.name || entry.path || entry),
    data.artifact, data.artifactPath, data.log, data.logPath
  ].filter(Boolean))];
}

function openDossier() {
  const item = selected;
  const events = correlatedEvents(item);
  const blocker = blockerFor(item);
  const runId = runIdFor(item);
  const resources = runId === snapshot.selectedRunId ? snapshot.selectedRun : {};
  const evidence = [...evidenceNames(item), ...arr(resources.artifacts).map((entry) => entry.name), ...arr(resources.logs).map((entry) => entry.name)];
  $("dossierModalTitle").textContent = `${item.type.toUpperCase()} DOSSIER // ${item.id}`;
  $("dossierModalContent").innerHTML = `
    <section class="rc-dossier-grid" aria-label="Authoritative selection summary">
      ${[["Identifier", item.id], ["Channel / rod", item.channel ? `CH-${String(item.channel).padStart(2, "0")}` : first(item.rod, "not applicable")], ["Type", item.type], ["Observed status", item.status], ["Owner", objectOwner(item)], ["Current work", objectWork(item)], ["Owning run", runId || "not reported"], ["Updated", date(first(item.data?.updatedAt, item.data?.ts, item.data?.modifiedAt))], ["Correlated telemetry", events.length]].map(([term, value]) => `<div><span>${esc(term)}</span><strong>${esc(value)}</strong></div>`).join("")}
    </section>
    <section class="rc-section ${blocker ? "anomaly" : ""}"><h3>BLOCKER LOCATION &amp; SUPPORTED RECOVERY</h3><p>${esc(blocker ? first(blocker.reason, blocker.message) : "No correlated blocker is reported.")}</p><dl class="rc-inline-dl"><dt>Location</dt><dd>${esc(first(blocker?.artifact, blocker?.log, blocker?.phase, runId, "not reported"))}</dd><dt>Recovery</dt><dd>${esc(recoveryFor(item, blocker))}</dd></dl><div class="rc-action-row">${blocker && (!blocker.runId || blocker.runId === snapshot.state?.currentRunId) ? '<button class="rc-btn primary" data-dossier-action="deblock">PREPARE DEBLOCK</button>' : ""}${["run", "iteration", "blocker"].includes(item.type) && runId ? `<button class="rc-btn" data-dossier-action="evidence" data-owning-run="${esc(runId)}">OPEN RUN EVIDENCE</button>` : ""}${item.type === "plan" ? '<button class="rc-btn" data-dossier-action="plan">OPEN PLAN</button>' : ""}</div></section>
    <section class="rc-section"><h3>EVIDENCE &amp; RESOURCES (${evidence.length})</h3>${evidence.length ? `<ul class="rc-resource-list">${evidence.slice(0, 80).map((name) => `<li>${esc(name)}</li>`).join("")}</ul>` : '<p class="rc-dim">No resource reference is reported for this object.</p>'}</section>
    <section class="rc-section"><h3>CORRELATED TELEMETRY (${events.length})</h3>${events.length ? `<ol class="rc-event-track">${events.map((event) => `<li><button data-object-type="${event.data?.toolName || lower(event.type).includes("tool") ? "tool" : "event"}" data-object-id="${esc(event.id)}"><b>${esc(first(event.data?.toolName, event.type))}</b><span>${esc(first(event.source, event.agentId, "system"))} / ${esc(date(event.ts))}</span></button></li>`).join("")}</ol>` : '<p class="rc-dim">No retained telemetry correlates to this selection.</p>'}</section>
    <details class="rc-section"><summary>Complete sanitized record</summary><pre class="rc-code-block">${esc(json(item.data))}</pre></details>`;
  const dialog = $("dossierModal");
  if (!dialog.open) dialog.showModal();
  $("dossierModalTitle").focus();
}

function renderHexCore() {
  const svg = $("hexCoreSvg");
  const objects = operationalObjects().slice(0, 61);
  $("lblAvgFlux").textContent = `${objects.length} / 61`;
  const cells = [];
  let number = 1;
  const add = (ring, angle, distance) => {
    const object = objects[number - 1];
    const x = 300 + distance * Math.cos(angle), y = 270 + distance * Math.sin(angle);
    cells.push({ number, ring, x, y, object }); number += 1;
  };
  add(0, 0, 0);
  for (let ring = 1; ring <= 4; ring += 1) for (let index = 0; index < ring * 6; index += 1) add(ring, index * Math.PI * 2 / (ring * 6), ring * 43);
  svg.innerHTML = `<defs><polygon id="hexShape" points="0,-22 19,-11 19,11 0,22 -19,11 -19,-11"/></defs><circle cx="300" cy="270" r="225" class="core-boundary"/>${cells.map((cell) => {
    const object = cell.object;
    const id = object?.id || `CH-${String(cell.number).padStart(2, "0")}`;
    const active = selected.id === id && (object ? selected.type === object.type : selected.type === "channel");
    const state = blocked(object?.status) ? "blocked" : object ? "occupied" : "empty";
    return `<g transform="translate(${cell.x} ${cell.y})" class="rc-hex ${state} ${active ? "selected" : ""}" tabindex="${active || cell.number === 1 ? "0" : "-1"}" role="button" aria-label="Channel ${cell.number}: ${esc(object ? `${object.type} ${object.label}, status ${object.status}` : "unassigned")}" data-channel="${cell.number}" data-object-type="${esc(object?.type || "channel")}" data-object-id="${esc(id)}"><use href="#hexShape"/><text text-anchor="middle" dy="-1">${String(cell.number).padStart(2, "0")}</text><text class="kind" text-anchor="middle" dy="10">${esc(object?.type?.slice(0, 4).toUpperCase() || "OPEN")}</text></g>`;
  }).join("")}`;
}

function deriveAgents() {
  const raw = Array.isArray(snapshot.state?.agents) ? snapshot.state.agents : Object.values(snapshot.state?.agents || {});
  return raw.map((item, index) => ({ ...item, id: String(first(item.id, item.name, `agent-${index}`)), label: first(item.label, item.name, item.role, item.id, `Agent ${index + 1}`) }));
}

function renderRods() {
  const agents = deriveAgents();
  const rods = agents.length ? agents : Array.from({ length: 8 }, (_, index) => ({ id: `rod-${index + 1}`, label: `UNASSIGNED ${index + 1}`, status: "idle", placeholder: true }));
  $("rodDeck").innerHTML = rods.slice(0, 12).map((agent) => {
    const eventCount = agent.placeholder ? 0 : correlatedEvents({ type: "agent", id: agent.id, data: agent }).length;
    const position = Math.min(100, agent.status === "running" ? 85 : blocked(agent.status) ? 100 : eventCount * 8);
    return `<button class="rc-rod-unit" type="button" ${agent.placeholder ? "disabled" : `data-rod="${esc(agent.label)}" data-object-type="agent" data-object-id="${esc(agent.id)}"`} aria-label="${esc(agent.label)}, ${esc(agent.status)}"><span class="rc-rod-track"><span class="rc-rod-bar" style="--rod-pos:${position}%"></span></span><span class="rc-rod-label">${esc(agent.label)} / ${esc(agent.status)}</span></button>`;
  }).join("");
}

function renderHeader() {
  const connection = snapshot.connection || {};
  $("connectionStatus").textContent = `${connection.status || "disconnected"} / ${connection.transport || "none"}`.toUpperCase();
  $("connectionStatus").className = `rc-stat-val ${connection.status}`;
  renderFreshness();
  $("thermalPower").textContent = first(snapshot.state?.phase, snapshot.state?.status, "idle").toUpperCase();
  const control = snapshot.control || {};
  $("rpsTripStatus").textContent = control.stop?.requested ? "STOP REQUESTED" : control.pause?.requested ? "PAUSE REQUESTED" : control.requestedRunNow ? "RUN-NOW REQUESTED" : "NONE";
  $("btnStreamToggle").textContent = connection.paused ? "RESUME / CATCH UP" : "FREEZE VIEW";
  $("btnConnectionToggle").textContent = connection.status === "disconnected" ? "RECONNECT" : "DISCONNECT";
  const blocker = stateBlockers()[0];
  $("spdsStatusBadge").textContent = blocker ? "BLOCKER REPORTED" : "NO BLOCKER";
  $("spdsStatusBadge").className = `rc-badge ${blocker ? "danger" : "success"}`;
}

function renderFreshness() {
  const connection = snapshot.connection || {};
  const value = `${connection.paused ? "FROZEN / " : ""}${age(first(connection.lastMessageAt, connection.lastRefreshAt))}`.toUpperCase();
  $("coreDeltaT").textContent = value;
  $$('[data-freshness-output]').forEach((node) => { node.textContent = value; });
}

function renderWorkflow() {
  const phase = first(snapshot.state?.phase, snapshot.state?.status, "idle");
  const index = WORKFLOW_PHASES.indexOf(phase);
  $("rcPhase").textContent = phase.toUpperCase();
  $("rcActiveRun").textContent = `RUN: ${first(snapshot.state?.currentRunId, "NONE")}`;
  $("workflowPhases").innerHTML = WORKFLOW_PHASES.map((item, position) => `<span class="rc-phase-step ${position < index ? "past" : position === index ? "current" : ""}" role="listitem">${esc(item)}</span>`).join("");
  const blocker = stateBlockers()[0];
  $("rcBlockerBanner").hidden = !blocker;
  if (blocker) $("rcBlockerText").textContent = `${blocker.reason} / ${first(blocker.runId, "current workflow")}`;
}

function renderRunsAndAgents() {
  const selectedRun = first(snapshot.selectedRunId, snapshot.state?.currentRunId);
  $("runSelect").innerHTML = '<option value="">No run loaded</option>' + arr(snapshot.runs).map((run) => `<option value="${esc(run.id)}" ${run.id === selectedRun ? "selected" : ""}>${esc(run.id)} / ${esc(run.status || "unknown")} / ${esc(first(run.selectedProject, "unassigned"))}</option>`).join("");
  $("runCount").textContent = arr(snapshot.runs).length;
  const run = snapshot.selectedRun?.run || arr(snapshot.runs).find((item) => item.id === selectedRun) || {};
  $("runCardId").textContent = first(run.id, "None"); $("runCardProject").textContent = first(run.selectedProject?.name, run.selectedProject, run.currentProject, "None");
  $("runCardStatus").textContent = first(run.status, run.state, "Idle"); $("runCardTask").textContent = first(run.task, run.objective, "No task reported");
  const agents = deriveAgents(); $("agentCount").textContent = agents.length;
  $("agentList").innerHTML = agents.length ? agents.map((agent) => `<button class="rc-agent-card" type="button" data-object-type="agent" data-object-id="${esc(agent.id)}"><span class="rc-agent-head"><span class="rc-agent-name">${esc(agent.label)}</span><span class="rc-agent-role">${esc(first(agent.role, agent.status, "agent"))}</span></span><span class="rc-agent-task">${esc(first(agent.currentTask, agent.task, agent.lastMessage, "Awaiting work"))}</span></button>`).join("") : '<p class="rc-dim">No agents reported by server state.</p>';
  renderRods();
}

function renderTelemetry() {
  const query = lower($("telemetrySearch").value.trim());
  const filtered = arr(snapshot.events).filter((event) => {
    const tool = Boolean(event.data?.toolName || lower(event.type).includes("tool"));
    const error = event.level === "error" || blocked(event.data?.status) || lower(event.type).includes("error");
    return !(telemetryFilter === "tools" && !tool || telemetryFilter === "errors" && !error || telemetryFilter === "system" && tool || query && !lower(json(event)).includes(query));
  }).slice(-150).reverse();
  $("telemetryCount").textContent = `${arr(snapshot.events).length} EVENTS`;
  $("telemetryList").innerHTML = filtered.length ? filtered.map((event) => {
    const type = event.data?.toolName || lower(event.type).includes("tool") ? "tool" : "event";
    return `<button class="rc-event-row ${type} ${event.level === "error" ? "error" : ""}" data-object-type="${type}" data-object-id="${esc(event.id)}"><span class="rc-event-head"><span class="rc-event-src">${esc(first(event.source, event.agentId, "system"))}</span><span class="rc-event-type">${esc(first(event.data?.toolName, event.type))}</span><time class="rc-event-time">${esc(date(event.ts))}</time></span><span class="rc-event-msg">${esc(first(event.message, event.data?.action, json(event.data)))}</span></button>`;
  }).join("") : '<p class="rc-dim">No telemetry matches the filter.</p>';
}

function renderQuickGates() {
  $("gatesQuickList").innerHTML = arr(snapshot.gates?.gates).slice(0, 6).map((gate) => `<button class="rc-gate-card" data-object-type="gate" data-object-id="${esc(gate.id)}"><span><b>${esc(gate.id)}</b>: ${esc(first(gate.description, gate.title, "Gate"))}</span><span class="rc-badge ${gate.status === "passed" ? "success" : gate.status === "failed" ? "danger" : ""}">${esc(first(gate.status, "pending"))}</span></button>`).join("") || '<p class="rc-dim">No gates configured.</p>';
}

function drawOverview() {
  const canvas = $("spdsCanvas"), parent = canvas.parentElement, rect = parent.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, rect.width * dpr); canvas.height = Math.max(1, rect.height * dpr);
  const context = canvas.getContext("2d"); context.scale(dpr, dpr); context.clearRect(0, 0, rect.width, rect.height);
  const values = [deriveAgents().length, arr(snapshot.runs).length, arr(snapshot.iterations).length, arr(snapshot.queue?.items).length, arr(snapshot.gates?.gates).length, arr(snapshot.plans).length, stateBlockers().length, Math.min(arr(snapshot.events).length, 100)];
  const labels = ["Agents", "Runs", "Iterations", "Queue", "Gates", "Plans", "Blockers", "Events"];
  const maxima = [12, 20, 20, 20, 20, 20, 5, 100], cx = rect.width / 2, cy = rect.height / 2, radius = Math.max(20, Math.min(cx, cy) - 28);
  context.font = "9px ui-monospace"; context.strokeStyle = "#294260"; context.fillStyle = "#94a3b8";
  labels.forEach((label, index) => { const angle = index * Math.PI / 4 - Math.PI / 2, x = cx + radius * Math.cos(angle), y = cy + radius * Math.sin(angle); context.beginPath(); context.moveTo(cx, cy); context.lineTo(x, y); context.stroke(); context.textAlign = Math.cos(angle) > .2 ? "left" : Math.cos(angle) < -.2 ? "right" : "center"; context.fillText(`${label} ${values[index]}`, cx + (radius + 10) * Math.cos(angle), cy + (radius + 10) * Math.sin(angle)); });
  context.beginPath(); values.forEach((value, index) => { const angle = index * Math.PI / 4 - Math.PI / 2, r = radius * Math.min(1, value / maxima[index]), x = cx + r * Math.cos(angle), y = cy + r * Math.sin(angle); index ? context.lineTo(x, y) : context.moveTo(x, y); }); context.closePath(); context.fillStyle = stateBlockers().length ? "rgba(239,68,68,.22)" : "rgba(0,229,255,.18)"; context.strokeStyle = stateBlockers().length ? "#ef4444" : "#00e5ff"; context.fill(); context.stroke();
  const summary = labels.map((label, index) => `${label}: ${values[index]} of display scale ${maxima[index]}`).join("; ");
  canvas.setAttribute("aria-label", `SwarmBuilder operations summary. ${summary}`);
  $("spdsSemantic").innerHTML = labels.map((label, index) => `<div><dt>${esc(label)}</dt><dd>${values[index]} <span>display scale ${maxima[index]}</span></dd></div>`).join("");
}

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; renderMain(); });
}

function renderMain() {
  const active = document.activeElement;
  const focus = active?.id ? `#${CSS.escape(active.id)}` : active?.dataset?.objectType && active?.dataset?.objectId ? `[data-object-type="${CSS.escape(active.dataset.objectType)}"][data-object-id="${CSS.escape(active.dataset.objectId)}"]` : null;
  renderHeader(); renderWorkflow(); renderRunsAndAgents(); renderTelemetry(); renderQuickGates(); renderHexCore(); renderSelectionSummary(); drawOverview();
  if (focus) document.querySelector(focus)?.focus({ preventScroll: true });
}

function controlStateHtml() {
  const control = snapshot.control || {}, auto = control.autoIteration || {};
  return `<div class="rc-dossier-grid">${[
    ["Observed workflow", first(snapshot.state?.phase, snapshot.state?.status, "idle")], ["Observed run", first(snapshot.state?.currentRunId, "none")],
    ["Run admission", first(control.runAdmission, "enabled")], ["Pause intent", control.pause?.requested ? `${control.pause.mode || "checkpoint"} / ${control.pause.reason || "no reason"}` : "none"],
    ["Stop intent", control.stop?.requested ? `${control.stop.mode || "graceful"} / ${control.stop.reason || "no reason"}` : "none"], ["Run-now intent", control.requestedRunNow ? "pending runner tick" : "none"],
    ["Next request", control.nextRunRequest ? `${control.nextRunRequest.status || "pending"} / ${control.nextRunRequest.id}` : "none"], ["Showcase", auto.enabled ? `generation ${auto.currentGeneration || 1} / ${auto.targetGenerations || auto.maxIterations || 1}` : "disabled"],
    ["Last command", lastCommand ? `${lastCommand.type} / ${lastCommand.status} / ${lastCommand.commandId || "no receipt"}` : "none this session"]
  ].map(([term, value]) => `<div><span>${esc(term)}</span><strong>${esc(value)}</strong></div>`).join("")}<div><span>Freshness</span><strong data-freshness-output>${esc(`${snapshot.connection?.paused ? "FROZEN / " : ""}${age(first(snapshot.connection?.lastMessageAt, snapshot.connection?.lastRefreshAt))}`.toUpperCase())}</strong></div></div><p class="rc-safety-note">Accepted means persisted intent, not completed work. Pause and stop are observed at runner checkpoints. Confirm the observed state above.</p>`;
}

function limitNumber(value, fallback, minimum = 1) {
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum ? number : fallback;
}

function planLimits(source = {}) {
  return {
    maxIterations: limitNumber(source.maxIterations, 1), maxVariantsPerIteration: limitNumber(source.maxVariantsPerIteration, 3),
    maxParallelVariants: limitNumber(source.maxParallelVariants, 3), maxAcceptedFeatures: limitNumber(source.maxAcceptedFeatures, 4),
    maxVisualMotifChanges: limitNumber(source.maxVisualMotifChanges, 1, 0), maxNewSections: limitNumber(source.maxNewSections, 1, 0),
    stopAfterNoImprovement: limitNumber(source.stopAfterNoImprovement, 1)
  };
}

function iterationLimits(maxIterations = 1, source = {}) {
  const iterations = limitNumber(maxIterations, 1);
  return { ...planLimits({ ...source, maxIterations: iterations }), targetGenerations: limitNumber(source.targetGenerations, iterations), minImprovementScore: limitNumber(source.minImprovementScore, .05, 0) };
}

function iterationDefaults(iteration = {}) {
  const detail = snapshot.iterationDetail && [snapshot.iterationDetail.id, snapshot.iterationDetail.runId].includes(iteration.id) ? snapshot.iterationDetail : {};
  return {
    sourceRunId: first(iteration.runId, iteration.sourceRunId, snapshot.selectedRunId, snapshot.state?.currentRunId), sourceIterationId: first(iteration.id, snapshot.selectedIterationId),
    repoPath: first(iteration.repoPath, detail.iterationState?.repoPath, snapshot.control?.autoIteration?.repoPath, snapshot.state?.repoPath), baseRef: first(iteration.commit, iteration.baseRef, detail.iterationState?.baseRef, "HEAD"),
    objective: first(iteration.objective, currentObjective()), changeText: first(iteration.nextRecommendedDirection, iteration.steeringText, "Complete one bounded objective-linked generation without unrelated feature or stack churn."),
    acceptanceGateIds: arr(first(detail.iterationState?.acceptanceGateIds, iteration.acceptanceGateIds)), snapshottedAcceptanceGates: arr(detail.iterationState?.acceptanceGates), limits: first(detail.iterationState?.limits, iteration.limits, iterationLimits())
  };
}

const COMMAND_CONFIRMATIONS = Object.freeze({
  deblock: (payload) => `Queue direct deblock guidance for current run ${payload.runId || "unknown"}?`,
  "deny-deblock-advice": (payload) => `Deny recovery advice ${payload.adviceId || "unknown"}?`,
  stop: (payload) => `Request a ${payload.mode || "graceful"} stop for run ${payload.runId || snapshot.state?.currentRunId || "current"} at its next checkpoint?`,
  "stop-showcase-loop": () => "Stop the showcase loop and clear its pending iteration request?",
  "clear-queue": () => `Clear ${arr(snapshot.queue?.items).length} queue items and queue-linked steering?`,
  "archive-queue-item": (payload) => `Archive queue item ${payload.id || payload.itemId || "unknown"}?`,
  "approve-deblock-advice": (payload) => `Approve advice ${payload.adviceId || "unknown"} and queue its recovery continuation?`,
  "start-showcase-loop": (payload) => `Start a ${payload.targetGenerations || payload.limits?.targetGenerations || "bounded"}-generation showcase for ${payload.repoPath || "the submitted repository"}?`,
  "start-next-iteration": (payload) => `Queue a bounded iteration for ${payload.repoPath || "the submitted repository"}?`,
  "continue-from-iteration": (payload) => `Continue exact iteration ${payload.sourceIterationId || "unknown"} from run ${payload.sourceRunId || "unknown"}?`,
  "fork-from-iteration": (payload) => `Fork exact iteration ${payload.sourceIterationId || "unknown"} from run ${payload.sourceRunId || "unknown"}?`,
  "use-as-next-direction": (payload) => `Use exact iteration ${payload.sourceIterationId || "unknown"} as the next direction?`,
  "gate-decision": (payload) => `Record ${payload.status || payload.decision || "a decision"} for gate ${payload.gateId || payload.id || "unknown"}${payload.runId ? ` on run ${payload.runId}` : ""}?`
});

function commandConfirmation(type, payload) {
  return COMMAND_CONFIRMATIONS[type]?.(payload) || "";
}

async function revalidateRecovery(type, payload) {
  if (!["deblock", "deblock-advice"].includes(type)) return;
  const submittedRunId = String(payload.runId || "").trim();
  if (!submittedRunId) throw Object.assign(new Error("Recovery requires the current run ID; refresh the blocker dossier and resubmit."), { status: 409 });
  await client.refreshState();
  const current = client.getSnapshot();
  const currentRunId = current.state?.currentRunId;
  const state = current.state || {};
  const activeBlocker = first(state.block, state.blocker, arr(state.blockers)[0], blocked(first(state.status, state.phase)) ? state.hold || state.lastAction : "");
  if (!currentRunId || submittedRunId !== currentRunId) throw Object.assign(new Error("The current run changed while validating recovery. Inspect the current blocker before submitting guidance."), { status: 409 });
  if (!activeBlocker) throw Object.assign(new Error("The current run no longer reports an active blocker. Recovery was not dispatched."), { status: 409 });
}

async function exactLineagePayload(raw, type) {
  const sourceIterationId = String(raw.sourceIterationId || "").trim();
  if (!sourceIterationId) {
    if (type !== "start-next-iteration") throw new Error(`${type} requires an exact sourceIterationId`);
    return { ...raw, acceptanceGateIds: lines(raw.acceptanceGateIds), snapshottedAcceptanceGates: [], limits: iterationLimits() };
  }
  await client.selectIteration(sourceIterationId);
  const current = client.getSnapshot();
  const detail = current.iterationDetail;
  const source = arr(current.iterations).find((item) => item.id === sourceIterationId);
  if (!detail || detail.id !== sourceIterationId || !source) throw Object.assign(new Error(`Exact source iteration ${sourceIterationId} could not be resolved`), { status: 409 });
  if (raw.sourceRunId && raw.sourceRunId !== detail.runId) throw Object.assign(new Error(`Source run ${raw.sourceRunId} does not own iteration ${sourceIterationId}`), { status: 409 });
  const sourceState = detail.iterationState || {};
  const sourceLimits = first(sourceState.limits, detail.limits, source.limits);
  if (!sourceLimits || typeof sourceLimits !== "object" || Array.isArray(sourceLimits)) throw Object.assign(new Error(`Source iteration ${sourceIterationId} has no persisted limits; lineage request was not dispatched`), { status: 409 });
  const missingLimitKeys = Object.keys(planLimits()).filter((key) => !Object.hasOwn(sourceLimits, key));
  if (missingLimitKeys.length) throw Object.assign(new Error(`Source iteration ${sourceIterationId} has incomplete persisted limits: ${missingLimitKeys.join(", ")}`), { status: 409 });
  const acceptanceGateIds = arr(first(sourceState.acceptanceGateIds, detail.acceptanceGateIds, source.acceptanceGateIds));
  const snapshottedAcceptanceGates = arr(sourceState.acceptanceGates);
  if (acceptanceGateIds.length) {
    if (!snapshottedAcceptanceGates.length) throw Object.assign(new Error(`Source iteration ${sourceIterationId} requires gate snapshots, but none are persisted`), { status: 409 });
    const snapshotIds = new Set(snapshottedAcceptanceGates.map((gate) => gate?.id).filter(Boolean));
    const missingGateIds = acceptanceGateIds.filter((id) => !snapshotIds.has(id));
    if (missingGateIds.length) throw Object.assign(new Error(`Source iteration ${sourceIterationId} is missing required gate snapshots: ${missingGateIds.join(", ")}`), { status: 409 });
  }
  return {
    ...raw, sourceIterationId: detail.id, sourceRunId: detail.runId,
    repoPath: first(raw.repoPath, sourceState.repoPath, detail.repoPath, source.repoPath),
    baseRef: first(raw.baseRef, sourceState.baseRef, detail.commit, detail.baseRef, source.commit, source.baseRef, "HEAD"),
    objective: first(raw.objective, sourceState.objective, detail.objective, source.objective),
    acceptanceGateIds,
    snapshottedAcceptanceGates,
    limits: iterationLimits(Number(sourceLimits?.maxIterations || 1), sourceLimits || {})
  };
}

async function issueCommand(type, payload = {}) {
  if (!OPERATION_COMMANDS.includes(type)) throw new Error(`Unsupported command: ${type}`);
  if (pendingCommands.has(type)) return null;
  pendingCommands.add(type); lastCommand = { type, status: "validating", at: new Date().toISOString() }; renderCommandStation();
  try {
    const confirmation = commandConfirmation(type, payload);
    if (confirmation && !confirm(confirmation)) return null;
    const stale = Date.now() - new Date(first(snapshot.connection.lastMessageAt, snapshot.connection.lastRefreshAt, 0)).valueOf();
    if (Number.isFinite(stale) && stale > 30_000) await client.refresh();
    await revalidateRecovery(type, payload);
    const correlationId = crypto.randomUUID?.() || `reactor-${Date.now()}`;
    lastCommand = { ...lastCommand, status: "sending", target: first(payload.gateId, payload.id, payload.sourceIterationId, payload.sourceRunId, snapshot.state?.currentRunId, "control") };
    const result = await client.command(type, payload, { actor: "reactor-core-operator", correlationId, idempotencyKey: `${type}-${correlationId}`, refresh: true });
    lastCommand = { ...lastCommand, status: "accepted", commandId: result.commandId, result, at: new Date().toISOString() };
    toast(`${type} accepted${result.commandId ? ` / ${result.commandId}` : ""}; verify observed state`, "info");
    return result;
  } catch (error) {
    lastCommand = { ...lastCommand, status: error.status == null ? "outcome unknown" : "rejected", error: error.message, at: new Date().toISOString() };
    toast(`${type}: ${error.message}${error.details?.length ? ` / ${error.details.join("; ")}` : ""}`, "error");
    throw error;
  } finally { pendingCommands.delete(type); renderCommandStation(); }
}

function renderCommandStation() {
  const root = $("cmdTabContent"); if (!root) return;
  preserveRenderedView(root, commandViewStates);
  const saved = commandViewStates.get(activeCmdTab) || null;
  const control = snapshot.control || {};
  if (activeCmdTab === "runctrl") root.innerHTML = `${controlStateHtml()}<section class="rc-section"><h3>RUN LIFECYCLE INTENT</h3><div class="rc-action-row">${[["pause", "PAUSE"], ["hold", "HOLD ADMISSION"], ["resume", "RESUME"], ["unhold", "UNHOLD"], ["run-now", "RUN NOW"], ["stop", "ALL-STOP"]].map(([type, label]) => `<button class="rc-btn ${type === "stop" ? "danger" : type === "run-now" ? "primary" : ""}" data-command="${type}">${label}</button>`).join("")}</div></section>`;
  if (activeCmdTab === "showcase") root.innerHTML = `${controlStateHtml()}<form class="rc-form-grid" data-special="showcase"><label class="rc-form-group">REPOSITORY PATH<input class="rc-input" name="repoPath" value="${esc(first(control.autoIteration?.repoPath, ""))}" required></label><label class="rc-form-group">BASE REF<input class="rc-input" name="baseRef" value="HEAD" required></label><label class="rc-form-group full">OBJECTIVE<textarea name="objective" required>${esc(currentObjective())}</textarea></label><label class="rc-form-group">TARGET GENERATIONS<input class="rc-input" name="targetGenerations" type="number" min="1" max="10" value="${Number(control.autoIteration?.targetGenerations || 10)}"></label><label class="rc-form-group full">BOUNDED FIRST CHANGE<textarea name="changeText" required>Start a bounded same-site showcase catalogue generation.</textarea></label><div class="rc-action-row full"><button class="rc-btn primary">START LOOP</button><button type="button" class="rc-btn" data-command="set-showcase-target">SET TARGET ONLY</button><button type="button" class="rc-btn" data-command="pause-showcase-loop">PAUSE</button><button type="button" class="rc-btn" data-command="resume-showcase-loop">RESUME</button><button type="button" class="rc-btn danger" data-command="stop-showcase-loop">STOP</button></div></form>`;
  if (activeCmdTab === "deblock") root.innerHTML = `${controlStateHtml()}<section class="rc-section"><h3>BLOCKER &amp; RECOVERY</h3><p>${esc(stateBlockers()[0]?.reason || "No active blocker reported")}</p><form data-command-form="deblock" class="rc-form-group"><input type="hidden" name="runId" value="${esc(snapshot.state?.currentRunId || "")}"><label>RECOVERY INSTRUCTION<textarea name="prompt" required></textarea></label><button class="rc-btn primary">QUEUE DEBLOCK STEERING</button></form><form data-command-form="deblock-advice" class="rc-form-group"><input type="hidden" name="runId" value="${esc(snapshot.state?.currentRunId || "")}"><label>ADVISER QUESTION<textarea name="prompt" required>Recommend the smallest non-destructive recovery using available evidence.</textarea></label><button class="rc-btn">REQUEST ADVICE</button></form></section>${arr(control.deblockAdvice).map((advice) => `<section class="rc-section"><h4>ADVICE / ${esc(advice.status)}</h4><p>${esc(first(advice.answer, advice.prompt))}</p>${advice.status === "pending" ? `<div class="rc-action-row"><button class="rc-btn primary" data-command="approve-deblock-advice" data-payload='${esc(json({ adviceId: advice.id }))}'>APPROVE</button><button class="rc-btn danger" data-command="deny-deblock-advice" data-payload='${esc(json({ adviceId: advice.id }))}'>DENY</button></div>` : ""}</section>`).join("")}`;
  if (activeCmdTab === "steering") root.innerHTML = `<form data-command-form="set-current-objective" class="rc-form-group"><label>CURRENT OBJECTIVE<textarea name="text" required>${esc(currentObjective())}</textarea></label><button class="rc-btn primary">SET OBJECTIVE</button></form><form data-command-form="steer" class="rc-form-grid"><label class="rc-form-group full">DIRECTIVE<textarea name="text" required></textarea></label><label class="rc-form-group">SCOPE<select class="rc-select" name="scope"><option>next_run</option><option>current_run</option><option>queue</option></select></label><label class="rc-form-group">PRIORITY<select class="rc-select" name="priority"><option>required</option><option>advisory</option></select></label><button class="rc-btn primary">ADD DIRECTIVE</button></form>${arr(control.activeSteering).map((item) => `<section class="rc-gate-card"><span>${esc(item.scope)} / ${esc(item.text)}</span><button class="rc-btn tiny danger" data-command="remove-steering" data-payload='${esc(json({ id: item.id }))}'>REMOVE</button></section>`).join("")}`;
  if (activeCmdTab === "queue") root.innerHTML = `<form data-command-form="add-queue-item" class="rc-form-grid"><label class="rc-form-group">TITLE<input class="rc-input" name="title" required></label><label class="rc-form-group">PRIORITY<input class="rc-input" type="number" name="priority" min="1" max="100" value="50"></label><label class="rc-form-group full">OBJECTIVE<textarea name="objective" required></textarea></label><label class="rc-form-group full">CONTEXT / BOUNDED CHANGE<textarea name="context"></textarea></label><label class="rc-form-group">PREFERRED REPOSITORY<input class="rc-input" name="preferredRepo"></label><label class="rc-form-group">GATE IDS, ONE PER LINE<textarea name="acceptanceGateIds"></textarea></label><button class="rc-btn primary">ADD BRIEF</button><button type="button" class="rc-btn danger" data-command="clear-queue">CLEAR QUEUE</button></form>${arr(snapshot.queue?.items).map((item) => `<section class="rc-section"><button class="rc-object-title" data-object-type="queue" data-object-id="${esc(item.id)}">${esc(first(item.title, item.id))} / ${esc(item.status)}</button><p>${esc(item.objective)}</p><div class="rc-action-row"><button class="rc-btn" data-command="pin-queue-item" data-payload='${esc(json({ id: item.id }))}'>PIN</button><button class="rc-btn primary" data-queue-start="${esc(item.id)}">START BOUNDED ITERATION</button><button class="rc-btn danger" data-command="archive-queue-item" data-payload='${esc(json({ id: item.id }))}'>ARCHIVE</button></div></section>`).join("")}`;
  if (activeCmdTab === "gates") root.innerHTML = `<form data-command-form="add-gate" class="rc-form-grid"><label class="rc-form-group">ID<input class="rc-input" name="id" required pattern="[A-Za-z0-9._-]+"></label><label class="rc-form-group">SEVERITY<select class="rc-select" name="severity"><option>must</option><option>should</option></select></label><label class="rc-form-group full">DESCRIPTION<textarea name="description" required></textarea></label><label class="rc-form-group full">REQUIRED EVIDENCE, ONE PATH PER LINE<textarea name="requiredEvidence"></textarea></label><input type="hidden" name="phase" value="final-audit"><button class="rc-btn primary">ADD GATE</button></form>${arr(snapshot.gates?.gates).map((gate) => `<form class="rc-section" data-gate-form="${esc(gate.id)}"><button type="button" class="rc-object-title" data-object-type="gate" data-object-id="${esc(gate.id)}">${esc(gate.id)} / ${esc(gate.status || "pending")}</button><label>DESCRIPTION<input class="rc-input" name="description" value="${esc(first(gate.description, gate.title))}"></label><label>DECISION<select class="rc-select" name="status"><option value="">Choose</option><option>passed</option><option>needs-evidence</option><option>failed</option></select></label><label>EVIDENCE PATHS<textarea name="artifacts"></textarea></label><label>NOTES<textarea name="notes"></textarea></label><div class="rc-action-row"><button data-gate-action="decision" class="rc-btn primary">RECORD DECISION</button><button data-gate-action="evidence" class="rc-btn">ATTACH EVIDENCE</button><button data-gate-action="update" class="rc-btn">UPDATE DEFINITION</button></div></form>`).join("")}`;
  if (activeCmdTab === "lineage") { const defaults = iterationDefaults(snapshot.iterations.find((item) => item.id === snapshot.selectedIterationId) || {}); root.innerHTML = `<form data-special="lineage" class="rc-form-grid"><label class="rc-form-group">MODE<select class="rc-select" name="mode"><option>start-next-iteration</option><option>continue-from-iteration</option><option>fork-from-iteration</option><option>use-as-next-direction</option></select></label><label class="rc-form-group">SOURCE ITERATION<input class="rc-input" name="sourceIterationId" value="${esc(defaults.sourceIterationId)}"></label><label class="rc-form-group">SOURCE RUN<input class="rc-input" name="sourceRunId" value="${esc(defaults.sourceRunId)}"></label><label class="rc-form-group">REPOSITORY PATH<input class="rc-input" name="repoPath" value="${esc(defaults.repoPath)}" required></label><label class="rc-form-group">BASE REF<input class="rc-input" name="baseRef" value="${esc(defaults.baseRef)}" required></label><label class="rc-form-group full">OBJECTIVE<textarea name="objective" required>${esc(defaults.objective)}</textarea></label><label class="rc-form-group full">BOUNDED CHANGE<textarea name="changeText" required>${esc(defaults.changeText)}</textarea></label><label class="rc-form-group">GATE IDS, ONE PER LINE<textarea name="acceptanceGateIds">${esc(defaults.acceptanceGateIds.join("\n"))}</textarea></label><button class="rc-btn primary">QUEUE COMPLETE REQUEST</button></form>${arr(snapshot.iterations).map((item) => `<button class="rc-agent-card" data-object-type="iteration" data-object-id="${esc(item.id)}"><b>${esc(first(item.objective, item.id))}</b><span>${esc(item.status)} / ${esc(item.runId || "no run")}</span></button>`).join("")}`; }
  if (activeCmdTab === "protocol") root.innerHTML = `${controlStateHtml()}<form data-special="protocol" class="rc-form-grid"><label class="rc-form-group">SUPPORTED OPERATION<select class="rc-select" name="type">${OPERATION_COMMANDS.map((type) => `<option>${type}</option>`).join("")}</select></label><label class="rc-form-group full">PAYLOAD JSON<textarea name="payload" spellcheck="false">{}</textarea></label><button class="rc-btn primary">VALIDATE &amp; DISPATCH</button></form><p class="rc-safety-note">All ${OPERATION_COMMANDS.length} server-supported operation commands are exposed. Prefer the guided controls because iteration, gate, and recovery operations require contextual payloads.</p>`;
  $$('[data-command]', root).forEach((button) => { button.disabled = pendingCommands.has(button.dataset.command); });
  restoreControls(root, activeCmdTab, saved);
}

function defaultPlanContent(pipelineType) {
  return { pipelineType, title: "", problem: "", intendedUsers: "", objective: "", boundedScope: "", requirements: [], nonGoals: [], constraints: [], risks: [], repository: { path: pipelineType === "managed" ? "" : null, baseRef: pipelineType === "managed" ? "HEAD" : null, baseCommit: null }, acceptanceGates: [], validationPolicy: { id: "apb.runner-selected.v1", expectations: [], clientCommandsAllowed: false }, milestones: [], limits: planLimits(), lineage: { mode: "new", sourcePlanId: null, sourceRevision: null, sourceRunId: null, sourceIterationId: null } };
}

function renderPlannerWorkstation() {
  const root = $("plannerTabContent"); if (!root) return;
  preserveRenderedView(root, plannerViewStates);
  const view = plannerViewKey();
  const saved = plannerViewStates.get(view) || null;
  if (activePlanTab === "list") root.innerHTML = `<div class="rc-action-row"><button class="rc-btn primary" data-new-plan="classic">NEW CLASSIC</button><button class="rc-btn primary" data-new-plan="managed">NEW MANAGED</button></div>${arr(snapshot.plans).map((plan) => `<button class="rc-section rc-plan-row" data-plan-id="${esc(plan.planId)}"><b>${esc(first(plan.title, plan.planId))}</b><span>${esc(plan.state)} / ${esc(plan.pipelineType)} / revision ${esc(plan.currentRevision)}</span></button>`).join("") || '<p class="rc-dim">No plans saved.</p>'}`;
  if (activePlanTab === "editor") {
    const content = selectedPlanDetail?.revision?.content || defaultPlanContent("classic");
    root.innerHTML = `<form id="planEditForm" class="rc-form-grid"><label class="rc-form-group">TITLE<input class="rc-input" name="title" value="${esc(content.title)}" required></label><label class="rc-form-group">PIPELINE<select class="rc-select" name="pipelineType"><option ${content.pipelineType === "classic" ? "selected" : ""}>classic</option><option ${content.pipelineType === "managed" ? "selected" : ""}>managed</option></select></label>${[["problem", "PROBLEM", content.problem], ["intendedUsers", "INTENDED USERS", content.intendedUsers], ["objective", "OBJECTIVE", content.objective], ["boundedScope", "BOUNDED SCOPE", content.boundedScope], ["requirements", "REQUIREMENTS", arr(content.requirements).join("\n")], ["nonGoals", "NON-GOALS", arr(content.nonGoals).join("\n")], ["constraints", "CONSTRAINTS", arr(content.constraints).join("\n")], ["risks", "RISKS", arr(content.risks).join("\n")], ["acceptanceGates", "GATES: id|severity|description|evidence,evidence", arr(content.acceptanceGates).map((gate) => `${gate.id}|${gate.severity}|${gate.description}|${arr(gate.requiredEvidence).join(",")}`).join("\n")], ["validationExpectations", "VALIDATION EXPECTATIONS", arr(content.validationPolicy?.expectations).join("\n")], ["milestones", "MILESTONES", arr(content.milestones).join("\n")]].map(([name, label, value]) => `<label class="rc-form-group ${["problem", "objective", "boundedScope"].includes(name) ? "full" : ""}">${label}<textarea name="${name}">${esc(value)}</textarea></label>`).join("")}<label class="rc-form-group">REPOSITORY PATH<input class="rc-input" name="repoPath" value="${esc(content.repository?.path || "")}"></label><label class="rc-form-group">BASE REF<input class="rc-input" name="baseRef" value="${esc(content.repository?.baseRef || "HEAD")}"></label><button class="rc-btn primary">SAVE NEW REVISION</button></form>`;
  }
  if (activePlanTab === "review") {
    const detail = selectedPlanDetail, ledger = detail?.ledger || {}, revision = detail?.revision || {};
    root.innerHTML = detail ? `<section class="rc-section"><div class="rc-dossier-grid">${[["Plan", ledger.planId], ["State", ledger.state], ["Version", ledger.version], ["Revision", revision.revision], ["Digest", revision.contentDigest]].map(([a,b]) => `<div><span>${a}</span><strong>${esc(b)}</strong></div>`).join("")}</div><label>DECISION NOTES<textarea id="planNotes"></textarea></label><div class="rc-action-row">${["ready", "approve", "reject", "launch", "clone", "fork", "archive"].map((action) => `<button class="rc-btn ${action === "reject" || action === "archive" ? "danger" : action === "approve" || action === "launch" ? "primary" : ""}" data-plan-action="${action}">${action.toUpperCase()}</button>`).join("")}</div><details><summary>Revision and lifecycle evidence</summary><pre class="rc-code-block">${esc(json(detail))}</pre></details></section>` : '<p class="rc-dim">Select a plan first.</p>';
  }
  if (activePlanTab === "copilot") {
    root.innerHTML = `<p class="rc-safety-note">Planning assistance is discussion only. It does not save, approve, launch, or execute. Messages may reach the configured inference provider.</p><div class="rc-action-row"><button class="rc-btn" data-new-assistance="classic">NEW CLASSIC CONVERSATION</button><button class="rc-btn" data-new-assistance="managed">NEW MANAGED CONVERSATION</button><button class="rc-btn" data-assistance-list>REFRESH THREADS</button></div><div class="rc-assist-grid"><aside>${arr(snapshot.assistance).map((item) => `<button class="rc-agent-card" data-assistance-id="${esc(item.id)}">${esc(item.pipelineType)} / ${Number(item.messageCount || 0)} messages${item.hasProposal ? " / proposal" : ""}</button>`).join("")}</aside><section>${assistanceDetail ? `<div id="assistLog" class="rc-code-block rc-assist-log"></div><form id="assistForm" data-draft-owner="assistance:${esc(assistanceDetail.id)}"><textarea name="message" maxlength="16000" required></textarea><button class="rc-btn primary">SEND MESSAGE</button></form>${assistanceDetail.proposedContent ? '<button class="rc-btn primary" data-create-proposal>CREATE EDITABLE DRAFT FROM PROPOSAL</button>' : ""}` : '<p class="rc-dim">Select or start a conversation.</p>'}</section></div>`;
    const log = $("assistLog");
    if (log) arr(assistanceDetail.messages).forEach((message) => {
      const article = document.createElement("article"), role = document.createElement("b"), content = document.createElement("p");
      role.textContent = String(message.role || "unknown"); content.textContent = String(message.content || "");
      article.append(role, content); log.append(article);
    });
  }
  restoreControls(root, view, saved);
}

function parsePlan(form, old) {
  const data = new FormData(form), list = (name) => lines(data.get(name));
  const gates = list("acceptanceGates").map((line) => { const [id, severity = "must", description = "", evidence = ""] = line.split("|"); return { id, severity: severity === "should" ? "should" : "must", description, required: Boolean(evidence), requiredEvidence: evidence.split(",").map((item) => item.trim()).filter(Boolean) }; });
  const pipelineType = String(data.get("pipelineType"));
  return { ...old, pipelineType, title: String(data.get("title")), problem: String(data.get("problem")), intendedUsers: String(data.get("intendedUsers")), objective: String(data.get("objective")), boundedScope: String(data.get("boundedScope")), requirements: list("requirements"), nonGoals: list("nonGoals"), constraints: list("constraints"), risks: list("risks"), acceptanceGates: gates, validationPolicy: { id: "apb.runner-selected.v1", expectations: list("validationExpectations"), clientCommandsAllowed: false }, milestones: list("milestones"), limits: planLimits(old.limits), repository: pipelineType === "managed" ? { path: String(data.get("repoPath")) || null, baseRef: String(data.get("baseRef")) || null, baseCommit: null } : { path: null, baseRef: null, baseCommit: null } };
}

const PLAN_CONFIRMATIONS = Object.freeze({
  ready: (ledger) => `Submit plan ${ledger.planId} revision ${ledger.currentRevision} for review?`,
  approve: (ledger) => `Approve exact plan ${ledger.planId} revision ${ledger.currentRevision} at version ${ledger.version}?`,
  reject: (ledger) => `Reject plan ${ledger.planId} revision ${ledger.currentRevision}?`,
  launch: (ledger) => `Launch exact approved plan ${ledger.planId} revision ${ledger.currentRevision} under runner-selected validation?`,
  clone: (ledger) => `Clone plan ${ledger.planId} into a new editable draft?`,
  fork: (ledger) => `Fork plan ${ledger.planId} revision ${ledger.currentRevision} into a new editable draft?`,
  archive: (ledger) => `Archive project plan ${ledger.planId}?`
});

async function planAction(action) {
  if (!selectedPlanDetail) return;
  const ledger = selectedPlanDetail.ledger, revision = selectedPlanDetail.revision, notes = $("planNotes")?.value || "";
  const subject = { planId: ledger.planId, revision: ledger.currentRevision, planDigest: ledger.currentDigest };
  const options = { expectedVersion: ledger.version };
  try {
    const confirmation = PLAN_CONFIRMATIONS[action]?.(ledger);
    if (confirmation && !confirm(confirmation)) return;
    if (action === "ready") await client.submitProjectPlanForReview(subject, options);
    if (action === "approve") await client.approveProjectPlan({ ...subject, notes }, options);
    if (action === "reject") { if (!notes.trim()) throw new Error("Rejection notes are required"); await client.rejectProjectPlan({ ...subject, notes }, options); }
    if (action === "launch") await client.launchProjectPlan(subject, options);
    if (["clone", "fork"].includes(action)) { const payload = { ...subject, sourceRunId: selected.type === "run" ? selected.id : null, sourceIterationId: selected.type === "iteration" ? selected.id : null, baseRef: revision.content.pipelineType === "managed" ? first(revision.content.repository?.baseRef, "HEAD") : null }; const result = action === "clone" ? await client.cloneProjectPlan(payload, options) : await client.forkProjectPlan(payload, options); selectedPlanDetail = await client.getProjectPlan(result.planId); }
    if (action === "archive") await client.archiveProjectPlan({ planId: ledger.planId }, options);
    await client.refreshPlans(); if (action !== "archive") selectedPlanDetail = await client.getProjectPlan(selectedPlanDetail.ledger.planId); renderPlannerWorkstation();
  } catch (error) { toast(error, "error"); }
}

async function renderEvidenceVault() {
  const root = $("evidenceTabContent"), runId = first(snapshot.selectedRunId, snapshot.state?.currentRunId), tab = activeEvidenceTab;
  const requestOwner = ++evidenceRequestRevision;
  const ownsRequest = () => requestOwner === evidenceRequestRevision && tab === activeEvidenceTab && runId === first(snapshot.selectedRunId, snapshot.state?.currentRunId);
  if (!runId) { root.innerHTML = '<p class="rc-dim">Select a run to inspect evidence.</p>'; return; }
  if (["spec", "devplan"].includes(tab)) {
    root.innerHTML = `<p class="rc-dim">Loading ${tab}...</p>`;
    try {
      const document = await client.loadDocument(tab, runId);
      if (ownsRequest()) root.innerHTML = `<pre class="rc-code-block">${esc(document.text)}</pre>`;
    } catch (error) { if (ownsRequest()) root.innerHTML = `<p class="rc-dim">${esc(error.message)}</p>`; }
    return;
  }
  if (!ownsRequest()) return;
  if (tab === "run") root.innerHTML = `<pre class="rc-code-block">${esc(json(snapshot.selectedRun?.run || {}))}</pre>`;
  if (tab === "artifacts") root.innerHTML = arr(snapshot.selectedRun?.artifacts).map((item) => `<button class="rc-agent-card" data-resource="artifact" data-name="${esc(item.name)}">${esc(item.name)} / ${item.size || 0} bytes</button>`).join("") || '<p class="rc-dim">No artifacts.</p>';
  if (tab === "logs") root.innerHTML = arr(snapshot.selectedRun?.logs).map((item) => `<button class="rc-agent-card" data-resource="log" data-name="${esc(item.name)}">${esc(item.name)}</button>`).join("") || '<p class="rc-dim">No logs.</p>';
  if (tab === "iterations") root.innerHTML = arr(snapshot.iterations).map((item) => `<button class="rc-agent-card" data-object-type="iteration" data-object-id="${esc(item.id)}"><b>${esc(first(item.objective, item.id))}</b><span>${esc(item.status)} / ${esc(item.runId || "no run")}</span></button>`).join("") || '<p class="rc-dim">No iterations.</p>';
  if (tab === "audit") root.innerHTML = `<pre class="rc-code-block">${esc(json(snapshot.audit))}</pre>`;
}

function renderHelpManual() {
  $("helpModalContent").innerHTML = `<section class="rc-section rc-help"><h3>ABOUT THIS CONSOLE</h3><p>Reactor Core is a software operations metaphor for Hermes SwarmBuilder. It is not a nuclear control system, physical process display, or safety system. Every status and count shown here is derived from the dashboard server; requested controls are intent until runner state confirms them.</p><h3>READING THE DISPLAY</h3><ul><li>The 61 hex channels map reported blockers, agents, runs, iterations, queue items, gates, plans, events, and tools. Empty channels do not invent values.</li><li>Agent rods show server-reported agents and retained correlated event activity.</li><li>The overview polygon is a count summary, not a safety limit display.</li><li>Select any channel, rod, agent, run, gate, queue item, iteration, plan, blocker, event, or tool to open its dossier.</li></ul><h3>CONTROL LIFECYCLE</h3><ol><li>Review connection freshness and observed state.</li><li>Open Command Station. Guided controls generate complete payloads; All Commands exposes every supported operation.</li><li>An accepted receipt means intent was persisted. Verify observed workflow, run, pause/stop request, next request, and later telemetry.</li><li>For a blocker, inspect location and evidence. Deblock only the current run; continue or fork historical/terminal work.</li></ol><h3>PLANS &amp; EVIDENCE</h3><p>Plans follow create, edit revision, ready-for-review, exact-revision approval or rejection, launch, clone/fork, and archive. Planning assistance only proposes content. Gate decisions reference evidence but do not create files.</p><h3>STREAM &amp; ACCESSIBILITY</h3><p>Freeze View pauses presentation and labels readings stale; Resume catches up and refreshes. Disconnect closes browser SSE/polling without stopping workflow. Native dialogs contain keyboard focus and return it on close. Motion is disabled under reduced-motion preferences.</p><h3>KEYS</h3><p><kbd>Space</kbd> freeze/resume, <kbd>R</kbd> refresh, <kbd>C</kbd> commands, <kbd>P</kbd> plans, <kbd>E</kbd> evidence, <kbd>H</kbd> help, <kbd>Escape</kbd> close dialog. Arrow keys navigate the hex matrix.</p></section>`;
}

function formPayload(form) {
  const data = {};
  for (const [key, value] of new FormData(form)) data[key] = value;
  return data;
}

function activateModalTab(kind, value, focus = true) {
  const attribute = `data-${kind}-tab`;
  const tab = document.querySelector(`[${attribute}="${CSS.escape(value)}"]`);
  if (!tab) return null;
  const tabs = $$(`[role="tab"][${attribute}]`, tab.closest('[role="tablist"]'));
  tabs.forEach((item) => {
    const active = item === tab;
    item.classList.toggle("active", active);
    item.setAttribute("aria-selected", String(active));
    item.tabIndex = active ? 0 : -1;
  });
  const panel = $(tab.getAttribute("aria-controls"));
  panel?.setAttribute("aria-labelledby", tab.id);
  let result = null;
  if (kind === "cmd") { activeCmdTab = value; result = renderCommandStation(); }
  if (kind === "plan") { activePlanTab = value; result = renderPlannerWorkstation(); }
  if (kind === "evidence") { activeEvidenceTab = value; result = renderEvidenceVault(); }
  if (focus) tab.focus({ preventScroll: true });
  return result;
}

function setupModalTabs() {
  $$('.rc-modal-tabs[role="tablist"]').forEach((tablist) => {
    tablist.addEventListener("click", (event) => {
      const tab = event.target.closest('[role="tab"]');
      if (!tab) return;
      const kind = tab.dataset.cmdTab ? "cmd" : tab.dataset.planTab ? "plan" : "evidence";
      activateModalTab(kind, tab.dataset[`${kind}Tab`], false);
    });
    tablist.addEventListener("keydown", (event) => {
      const tab = event.target.closest('[role="tab"]');
      if (!tab) return;
      const tabs = $$('[role="tab"]', tablist), index = tabs.indexOf(tab);
      let next = null;
      if (["ArrowRight", "ArrowDown"].includes(event.key)) next = tabs[(index + 1) % tabs.length];
      if (["ArrowLeft", "ArrowUp"].includes(event.key)) next = tabs[(index - 1 + tabs.length) % tabs.length];
      if (event.key === "Home") next = tabs[0];
      if (event.key === "End") next = tabs.at(-1);
      if (!next) return;
      event.preventDefault();
      const kind = next.dataset.cmdTab ? "cmd" : next.dataset.planTab ? "plan" : "evidence";
      activateModalTab(kind, next.dataset[`${kind}Tab`]);
    });
  });
}

function setupEvents() {
  $("btnStreamToggle").addEventListener("click", () => snapshot.connection.paused ? client.resume().catch((error) => toast(error, "error")) : client.pause());
  $("btnConnectionToggle").addEventListener("click", () => snapshot.connection.status === "disconnected" ? client.connect().catch((error) => toast(error, "error")) : client.disconnect());
  $("btnResyncCore").addEventListener("click", () => client.refresh().catch((error) => toast(error, "error")));
  $("btnManualScram").addEventListener("click", () => issueCommand("stop", { mode: "graceful", runId: snapshot.state?.currentRunId, reason: "Reactor Core operator all-stop" }).catch(() => {}));
  const openers = [["btnOpenCommand", "commandModal", renderCommandStation], ["btnOpenPlanner", "plannerModal", renderPlannerWorkstation], ["btnOpenEvidence", "evidenceModal", renderEvidenceVault], ["btnOpenHelp", "helpModal", renderHelpManual]];
  openers.forEach(([button, dialog, render]) => $(button).addEventListener("click", () => { render(); $(dialog).showModal(); }));
  [["btnCloseCommand", "commandModal"], ["btnClosePlanner", "plannerModal"], ["btnCloseEvidence", "evidenceModal"], ["btnCloseHelp", "helpModal"], ["btnCloseDossier", "dossierModal"], ["btnCloseTool", "toolModal"], ["btnCloseFileViewer", "fileViewerModal"]].forEach(([button, dialog]) => $(button)?.addEventListener("click", () => $(dialog).close()));
  $("btnInspectSelection").addEventListener("click", openDossier);
  $("btnQuickDeblock").addEventListener("click", () => { activateModalTab("cmd", "deblock", false); $("commandModal").showModal(); });
  $("btnOpenCommandGates").addEventListener("click", () => { activateModalTab("cmd", "gates", false); $("commandModal").showModal(); });
  $("btnRefreshRuns").addEventListener("click", () => client.refreshRuns().catch((error) => toast(error, "error")));
  $("runSelect").addEventListener("change", (event) => event.target.value ? selectObject("run", event.target.value, false) : client.selectRun(null));
  $("telemetrySearch").addEventListener("input", renderTelemetry);
  $$(".rc-filter-chips [data-filter]").forEach((button) => button.addEventListener("click", () => { $$(".rc-filter-chips [data-filter]").forEach((item) => item.classList.toggle("active", item === button)); telemetryFilter = button.dataset.filter; renderTelemetry(); }));
  setupModalTabs();

  document.addEventListener("click", async (event) => {
    const object = event.target.closest("[data-object-type][data-object-id]"); if (object) { selectObject(object.dataset.objectType, object.dataset.objectId, !object.dataset.rod, Number(object.dataset.channel) || null); if (object.dataset.rod) { selected.rod = object.dataset.rod; openDossier(); } return; }
    const command = event.target.closest("[data-command]"); if (command) { let payload = command.dataset.payload ? JSON.parse(command.dataset.payload) : { reason: "Reactor Core operator request" }; if (command.dataset.command === "set-showcase-target") payload = { targetGenerations: Number(command.closest("form")?.elements.targetGenerations?.value || 10) }; issueCommand(command.dataset.command, payload).catch(() => {}); return; }
    const queueStart = event.target.closest("[data-queue-start]"); if (queueStart) { const item = arr(snapshot.queue?.items).find((entry) => entry.id === queueStart.dataset.queueStart); const payload = { ...iterationDefaults(), queueItemId: item.id, repoPath: first(item.target?.preferredRepo, item.preferredRepo, snapshot.control?.autoIteration?.repoPath, snapshot.state?.repoPath), objective: item.objective, changeText: first(item.context, item.title), acceptanceGateIds: arr(item.acceptanceGateIds) }; issueCommand("start-next-iteration", payload).catch(() => {}); return; }
    const plan = event.target.closest("[data-plan-id]"); if (plan) { try { selectedPlanDetail = await client.getProjectPlan(plan.dataset.planId); selected = { type: "plan", id: plan.dataset.planId, label: selectedPlanDetail.revision.content.title, status: selectedPlanDetail.ledger.state, data: selectedPlanDetail }; activateModalTab("plan", "editor", false); } catch (error) { toast(error, "error"); } return; }
    const newPlan = event.target.closest("[data-new-plan]"); if (newPlan) { try { const result = await client.createProjectPlan({ content: defaultPlanContent(newPlan.dataset.newPlan) }); await client.refreshPlans(); selectedPlanDetail = await client.getProjectPlan(result.planId); activateModalTab("plan", "editor", false); } catch (error) { toast(error, "error"); } return; }
    const planButton = event.target.closest("[data-plan-action]"); if (planButton) { await planAction(planButton.dataset.planAction); return; }
    const assistance = event.target.closest("[data-assistance-id]"); if (assistance) { try { assistanceDetail = await client.getPlanAssistance(assistance.dataset.assistanceId); renderPlannerWorkstation(); } catch (error) { toast(error, "error"); } return; }
    const newAssistance = event.target.closest("[data-new-assistance]"); if (newAssistance) { try { assistanceDetail = await client.createPlanAssistance(newAssistance.dataset.newAssistance); await client.listPlanAssistance(); renderPlannerWorkstation(); } catch (error) { toast(error, "error"); } return; }
    if (event.target.closest("[data-assistance-list]")) { await client.listPlanAssistance().catch((error) => toast(error, "error")); renderPlannerWorkstation(); return; }
    if (event.target.closest("[data-create-proposal]") && assistanceDetail?.proposedContent) { try { const result = await client.createProjectPlan({ content: assistanceDetail.proposedContent }); await client.refreshPlans(); selectedPlanDetail = await client.getProjectPlan(result.planId); activateModalTab("plan", "editor", false); } catch (error) { toast(error, "error"); } return; }
    const resource = event.target.closest("[data-resource]"); if (resource) { const requestOwner = ++resourceRequestRevision, runId = snapshot.selectedRunId, kind = resource.dataset.resource, name = resource.dataset.name; try { const result = kind === "log" ? await client.loadLog(name, runId, { tail: 400 }) : await client.loadArtifact(name, runId); if (requestOwner !== resourceRequestRevision || runId !== snapshot.selectedRunId) return; $("fileViewerTitle").textContent = `${kind.toUpperCase()}: ${name}`; $("fileViewerContent").textContent = result.text; $("fileViewerModal").showModal(); } catch (error) { if (requestOwner === resourceRequestRevision && runId === snapshot.selectedRunId) toast(error, "error"); } return; }
    const dossierAction = event.target.closest("[data-dossier-action]"); if (dossierAction) { $("dossierModal").close(); if (dossierAction.dataset.dossierAction === "deblock") { activateModalTab("cmd", "deblock", false); $("commandModal").showModal(); } if (dossierAction.dataset.dossierAction === "evidence") { const owningRun = dossierAction.dataset.owningRun; if (!owningRun) { toast("Dossier evidence action has no owning run", "error"); return; } try { await client.selectRun(owningRun); const current = client.getSnapshot(); if (current.selectedRunId !== owningRun || current.selectedRun?.run?.id !== owningRun) throw new Error(`Could not load exact owning run ${owningRun}`); $("evidenceModal").showModal(); await activateModalTab("evidence", "run", false); } catch (error) { toast(error, "error"); } } if (dossierAction.dataset.dossierAction === "plan") { selectedPlanDetail = await client.getProjectPlan(selected.id); activateModalTab("plan", "review", false); $("plannerModal").showModal(); } }
  });

  document.addEventListener("submit", async (event) => {
    const form = event.target; if (!(form instanceof HTMLFormElement)) return; event.preventDefault();
    try {
      if (form.dataset.commandForm) { const payload = formPayload(form); if (form.dataset.commandForm === "add-queue-item") { payload.acceptanceGateIds = lines(payload.acceptanceGateIds); payload.target = payload.preferredRepo ? { preferredRepo: payload.preferredRepo } : {}; delete payload.preferredRepo; } await issueCommand(form.dataset.commandForm, payload); return; }
      if (form.dataset.special === "showcase") { const payload = formPayload(form), target = Number(payload.targetGenerations); payload.sourceRunId = first(snapshot.state?.currentRunId, snapshot.selectedRunId); payload.sourceIterationId = snapshot.selectedIterationId; payload.acceptanceGateIds = arr(snapshot.gates?.gates).map((gate) => gate.id); payload.limits = iterationLimits(target); await issueCommand("start-showcase-loop", payload); return; }
      if (form.dataset.special === "lineage") { const data = formPayload(form), type = data.mode; delete data.mode; const payload = await exactLineagePayload(data, type); await issueCommand(type, payload); return; }
      if (form.dataset.special === "protocol") { const data = formPayload(form), payload = JSON.parse(data.payload); await issueCommand(data.type, payload); return; }
      if (form.dataset.gateForm) { const data = formPayload(form), action = event.submitter?.dataset.gateAction, base = { gateId: form.dataset.gateForm, runId: first(snapshot.selectedRunId, snapshot.state?.currentRunId), notes: data.notes }; if (action === "decision") { if (!data.status) throw new Error("Choose a gate decision"); await issueCommand("gate-decision", { ...base, status: data.status, decision: data.status, evidenceArtifacts: lines(data.artifacts) }); } if (action === "evidence") { const artifacts = lines(data.artifacts); if (!artifacts.length) throw new Error("Enter at least one existing artifact path"); await issueCommand("attach-gate-evidence", { ...base, artifacts }); } if (action === "update") await issueCommand("update-gate", { gateId: form.dataset.gateForm, description: data.description }); return; }
      if (form.id === "planEditForm" && selectedPlanDetail) { const content = parsePlan(form, selectedPlanDetail.revision.content); await client.updateProjectPlan({ planId: selectedPlanDetail.ledger.planId, content }, { expectedVersion: selectedPlanDetail.ledger.version }); await client.refreshPlans(); selectedPlanDetail = await client.getProjectPlan(selectedPlanDetail.ledger.planId); renderPlannerWorkstation(); return; }
      if (form.id === "assistForm" && assistanceDetail) { assistanceDetail = await client.messagePlanAssistance(assistanceDetail.id, assistanceDetail.version, new FormData(form).get("message")); form.reset(); await client.listPlanAssistance(); renderPlannerWorkstation(); }
    } catch (error) { toast(error, "error"); }
  });

  $("hexCoreSvg").addEventListener("keydown", (event) => { const current = event.target.closest(".rc-hex"); if (!current) return; const nodes = $$(".rc-hex", event.currentTarget), index = nodes.indexOf(current); let next; if (["ArrowRight", "ArrowDown"].includes(event.key)) next = nodes[(index + 1) % nodes.length]; if (["ArrowLeft", "ArrowUp"].includes(event.key)) next = nodes[(index - 1 + nodes.length) % nodes.length]; if (event.key === "Home") next = nodes[0]; if (event.key === "End") next = nodes.at(-1); if (["Enter", " "].includes(event.key)) { event.preventDefault(); selectObject(current.dataset.objectType, current.dataset.objectId, true, Number(current.dataset.channel)); } else if (next) { event.preventDefault(); nodes.forEach((node) => node.tabIndex = -1); next.tabIndex = 0; next.focus(); } });
  window.addEventListener("keydown", (event) => { if (event.target.matches("input, textarea, select") || event.ctrlKey || event.metaKey || event.altKey) return; const key = event.key.toLowerCase(); if (event.code === "Space") { event.preventDefault(); $("btnStreamToggle").click(); } if (key === "r") $("btnResyncCore").click(); if (key === "c") $("btnOpenCommand").click(); if (key === "p") $("btnOpenPlanner").click(); if (key === "e") $("btnOpenEvidence").click(); if (key === "h") $("btnOpenHelp").click(); });
  window.addEventListener("resize", drawOverview);
}

client.subscribe((next) => { snapshot = next; announceLiveChanges(next); if (snapshot.planDetail && selectedPlanDetail?.ledger?.planId === snapshot.planDetail.ledger?.planId) selectedPlanDetail = snapshot.planDetail; if (snapshot.assistanceDetail) assistanceDetail = snapshot.assistanceDetail; scheduleRender(); });
setupEvents();
renderMain();
setInterval(renderFreshness, 1000);
client.connect().catch((error) => toast(error, "error"));
client.listPlanAssistance().catch(() => {});
