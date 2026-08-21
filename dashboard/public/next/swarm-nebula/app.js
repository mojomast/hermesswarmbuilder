import {
  createDashboardClient,
  OPERATION_COMMANDS,
  PROJECT_PLAN_ACTIONS,
  WORKFLOW_PHASES
} from "../../headless-dashboard-client.js";
import * as THREE from "../../vendor/three.js";

const client = createDashboardClient({ maxEvents: 1500, eventLimit: 500, auditLimit: 200, pollIntervalMs: 4000 });
const planLifecycleActions = [
  "project-plan.create", "project-plan.update", "project-plan.ready-for-review",
  "project-plan.approve", "project-plan.reject", "project-plan.launch",
  "project-plan.clone", "project-plan.fork", "project-plan.archive"
];
if (planLifecycleActions.some((action) => !PROJECT_PLAN_ACTIONS.includes(action)) || planLifecycleActions.length !== PROJECT_PLAN_ACTIONS.length) throw new Error("Project-plan action catalog is out of sync");
const $ = (id) => document.getElementById(id);
const arr = (value) => Array.isArray(value) ? value : value && typeof value === "object" ? Object.values(value) : value ? [value] : [];
const first = (...values) => values.find((value) => value !== undefined && value !== null && value !== "") ?? "";
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const lines = (value) => String(value || "").split(/\r?\n|,/).map((part) => part.trim()).filter(Boolean);
const clip = (value, limit = 40000) => {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text?.length > limit ? `${text.slice(0, limit)}\n... ${text.length - limit} characters omitted` : text || "";
};
const recordId = (value, fallback = "record") => String(first(value?.id, value?.runId, value?.planId, value?.gateId, fallback));
const isBlocked = (value) => ["block", "error", "fail", "hold"].some((word) => String(value || "").toLowerCase().includes(word));
const formatDate = (value) => {
  if (!value) return "not reported";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleString();
};
const age = (value) => {
  const elapsed = Date.now() - Date.parse(value);
  if (!Number.isFinite(elapsed)) return "no signal";
  if (elapsed < 60000) return `${Math.max(0, Math.round(elapsed / 1000))}s`;
  if (elapsed < 3600000) return `${Math.round(elapsed / 60000)}m`;
  return `${Math.round(elapsed / 3600000)}h`;
};
const hash = (text) => {
  let value = 2166136261;
  for (const char of String(text)) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
};

let snapshot = client.getSnapshot();
let objects = [];
let relationships = [];
let selectedKey = "system:control-plane";
let activeTab = "inspect";
let selectedCommand = "pause";
let commandSerial = 0;
const commandHistory = [];
let selectedPlanId = null;
let planRevisionPreview = null;
let assistanceListMode = true;
let renderPending = false;
let freshnessTimer;

function currentObjective() {
  const pinned = arr(snapshot.queue?.items).find((item) => item.id === snapshot.control?.pinnedQueueItemId);
  return first(snapshot.control?.currentObjective?.text, pinned?.objective, snapshot.state?.objective, snapshot.state?.currentTask, "No objective reported");
}

function deriveAgents() {
  const map = new Map();
  for (const source of arr(snapshot.state?.agents)) {
    const id = recordId(source, source?.role || source?.label || "agent");
    map.set(id, { ...source, id, status: first(source.status, "idle"), runId: first(source.runId, snapshot.state?.currentRunId), stateOwned: true });
  }
  for (const event of snapshot.events) {
    const id = first(event.agentId, event.data?.agentId, event.source);
    if (!id || ["system", "operator", "unknown"].includes(id)) continue;
    const old = map.get(id) || { id, status: "observed", eventDerived: true };
    map.set(id, { ...old, lastEvent: event, lastSeenAt: event.ts, runId: old.stateOwned ? old.runId : first(event.runId, old.runId), events: [...arr(old.events), event].slice(-100) });
  }
  return [...map.values()];
}

function blockerRecord(source, fallback = {}, fallbackRunId = null) {
  if (!source) return null;
  const value = typeof source === "object" ? source : { reason: String(source) };
  const runId = first(value.runId, fallbackRunId);
  const reason = first(value.reason, value.message, value.error, value.description, fallback.lastAction, "Blocker without a reported reason");
  return { ...value, runId, reason, agentId: first(value.agentId, value.ownerAgentId), status: first(value.status, fallback.status, "blocked"), phase: first(value.phase, fallback.phase, "blocked"), since: first(value.since, value.startedAt, value.createdAt, fallback.updatedAt), id: String(first(value.id, `${runId}:${reason}`)).slice(0, 180) };
}

function deriveBlockers() {
  const result = [];
  const seen = new Set();
  const add = (value, fallback, fallbackRunId = null) => {
    const blocker = blockerRecord(value, fallback, fallbackRunId);
    if (!blocker || seen.has(blocker.id)) return;
    seen.add(blocker.id); result.push(blocker);
  };
  for (const item of arr(snapshot.state?.blockers)) add(item, snapshot.state);
  for (const key of ["block", "blocker", "hold"]) add(snapshot.state?.[key], snapshot.state, snapshot.state?.currentRunId || null);
  for (const run of snapshot.runs) {
    const runId = recordId(run, "");
    for (const key of ["block", "blocker", "hold"]) add(run?.[key], run, runId || null);
    if (isBlocked(run?.status) && !run.block && !run.blocker) add(first(run.error, run.lastAction, run.message), run, runId || null);
  }
  return result;
}

function activeCurrentBlocker() {
  const currentRunId = snapshot.state?.currentRunId || null;
  if (!currentRunId) return null;
  const direct = [snapshot.state?.block, snapshot.state?.blocker, snapshot.state?.hold]
    .map((source) => blockerRecord(source, snapshot.state || {}, currentRunId))
    .find((blocker) => blocker?.runId === currentRunId);
  if (direct) return direct;
  return arr(snapshot.state?.blockers)
    .map((source) => blockerRecord(source, snapshot.state || {}))
    .find((blocker) => blocker?.runId === currentRunId) || null;
}

function deriveModel() {
  const agents = deriveAgents();
  const blockers = deriveBlockers();
  const model = [{ key: "system:control-plane", type: "system", id: "control-plane", label: "Control plane", status: first(snapshot.state?.status, "idle"), runId: snapshot.state?.currentRunId || "", activity: currentObjective(), data: snapshot.state || {} }];
  for (const run of snapshot.runs) model.push({ key: `run:${recordId(run)}`, type: "run", id: recordId(run), label: first(run.name, run.objective, run.id), status: first(run.status, run.phase, "unknown"), runId: recordId(run), activity: first(run.currentTask, run.objective, "Run record"), data: run });
  for (const agent of agents) model.push({ key: `agent:${agent.id}`, type: "agent", id: agent.id, label: first(agent.label, agent.name, agent.role, agent.id), status: agent.status, runId: agent.runId || "", activity: first(agent.currentTask, agent.task, agent.lastEvent?.message, "Awaiting activity"), data: agent });
  for (const blocker of blockers) model.push({ key: `blocker:${blocker.id}`, type: "blocker", id: blocker.id, label: blocker.reason, status: blocker.status, runId: blocker.runId || "", activity: first(blocker.suggestedAction, "Inspect evidence and choose recovery"), data: blocker });
  for (const item of arr(snapshot.queue?.items)) model.push({ key: `queue:${recordId(item)}`, type: "queue", id: recordId(item), label: first(item.title, item.objective, item.id), status: first(item.status, "queued"), runId: item.runId || "", activity: first(item.objective, item.context, "Queued objective"), data: item });
  for (const gate of arr(snapshot.gates?.gates)) model.push({ key: `gate:${recordId(gate)}`, type: "gate", id: recordId(gate), label: first(gate.description, gate.title, gate.id), status: first(gate.status, "pending"), runId: gate.runId || "", activity: arr(gate.requiredEvidence).join(", ") || "No required evidence paths", data: gate });
  for (const iteration of snapshot.iterations) model.push({ key: `iteration:${recordId(iteration)}`, type: "iteration", id: recordId(iteration), label: first(iteration.objective, iteration.id), status: first(iteration.status, "unknown"), runId: first(iteration.runId, iteration.sourceRunId), activity: `Generation ${first(iteration.generation, "not reported")} / ${first(iteration.mode, "lineage")}`, data: iteration });
  for (const plan of snapshot.plans) model.push({ key: `plan:${recordId(plan)}`, type: "plan", id: recordId(plan), label: first(plan.title, plan.planId), status: first(plan.state, "draft"), runId: plan.runId || "", activity: `${first(plan.pipelineType, "plan")} / revision ${first(plan.currentRevision, "not reported")}`, data: plan });
  const retained = snapshot.events.slice(-1500);
  retained.forEach((event) => {
    const tool = Boolean(event.data?.toolCallId || event.data?.toolName || String(event.type).includes("tool-call"));
    const type = tool ? "tool" : "event";
    model.push({ key: `${type}:${event.id}`, type, id: event.id, label: first(event.data?.toolName, event.message, event.type), status: first(event.data?.status, event.level, "info"), runId: event.runId || "", activity: first(event.message, event.type), data: event });
  });
  relationships = retained.slice(-1000).map((event) => ({ id: event.id, ts: event.ts, source: first(event.agentId, event.source, "system"), kind: event.data?.toolCallId || event.data?.toolName || String(event.type).includes("tool-call") ? "tool" : "event", runId: event.runId || "", message: first(event.data?.toolName, event.message, event.type), event }));
  objects = model;
  if (!objects.some((item) => item.key === selectedKey)) selectedKey = "system:control-plane";
}

const selectedObject = () => objects.find((item) => item.key === selectedKey) || objects[0];

function notify(message, error = false) {
  const toast = $("toast");
  toast.textContent = message; toast.className = `toast${error ? " error" : ""}`; toast.hidden = false;
  clearTimeout(notify.timer); notify.timer = setTimeout(() => { toast.hidden = true; }, 5000);
}

function keyValues(entries) {
  return `<dl class="kv">${entries.filter(([, value]) => value !== undefined && value !== null && value !== "").map(([label, value]) => `<dt>${esc(label)}</dt><dd>${esc(typeof value === "object" ? clip(value, 1000) : value)}</dd>`).join("")}</dl>`;
}

function selectObject(key, focus = false) {
  const item = objects.find((entry) => entry.key === key);
  if (!item) return;
  selectedKey = key;
  if (item.type === "iteration" && snapshot.selectedIterationId !== item.id) client.selectIteration(item.id).catch((error) => notify(error.message, true));
  renderSelection(); renderObjectList(); renderSemantic();
  sceneController.highlight(key);
  if (focus) document.querySelector(`[data-object-key="${CSS.escape(key)}"]`)?.focus();
}

function renderHeader() {
  const connection = snapshot.connection;
  $("connectionState").textContent = connection.status.toUpperCase();
  $("transportState").textContent = (connection.transport || "no transport").toUpperCase();
  $("signalLamp").className = ["connected", "polling"].includes(connection.status) ? "live" : "";
  $("currentRun").textContent = snapshot.state?.currentRunId || "NO ACTIVE RUN";
  $("phaseState").textContent = first(snapshot.state?.phase, snapshot.state?.status, "idle").toUpperCase();
  $("freezeButton").textContent = connection.paused ? "Resume view" : "Freeze view";
  $("freezeButton").setAttribute("aria-pressed", String(connection.paused));
  $("connectionButton").textContent = connection.status === "disconnected" ? "Reconnect" : "Disconnect";
  renderFreshness();
}

function renderFreshness() {
  const signal = first(snapshot.connection.lastMessageAt, snapshot.connection.lastRefreshAt);
  const elapsed = Date.now() - Date.parse(signal), stale = Number.isFinite(elapsed) && elapsed > 15000;
  $("freshness").textContent = `${snapshot.connection.paused ? "FROZEN / " : stale ? "STALE / " : ""}${age(signal).toUpperCase()}`;
}

function relatedEvents(item) {
  return relationships.filter((entry) => item.type === "agent" ? entry.source === item.id && (!item.runId || entry.runId === item.runId) : item.type === "run" ? entry.runId === item.id : ["event", "tool"].includes(item.type) ? entry.id === item.id : item.runId && entry.runId === item.runId).slice(-100).reverse();
}

function renderSelection() {
  const item = selectedObject();
  if (!item) return;
  $("selectionTitle").textContent = item.label;
  $("selectionKind").textContent = item.type.toUpperCase();
  document.querySelectorAll(".tabs [role=tab]").forEach((button) => { button.setAttribute("aria-selected", String(button.dataset.tab === activeTab)); button.tabIndex = button.dataset.tab === activeTab ? 0 : -1; });
  $("inspector").setAttribute("aria-labelledby", `tab-${activeTab}`);
  const data = item.data || {};
  let content = "";
  if (activeTab === "inspect") {
    content = keyValues([["Type", item.type], ["Identifier", item.id], ["Status", item.status], ["Owning run", item.runId || "not reported"], ["Activity", item.activity], ["Phase", first(data.currentPhase, data.phase)], ["Updated", formatDate(first(data.updatedAt, data.ts, data.completedAt))]]);
    if (item.type === "blocker") content += `<p class="anomaly"><b>${esc(data.reason)}</b><br>${item.runId === snapshot.state?.currentRunId ? "Current blocker: deblock and advice controls may target it." : "Historical blocker: evidence and lineage actions only; current-run deblock is not offered."}</p>`;
    content += `<details><summary>Raw authoritative record</summary><pre>${esc(clip(data))}</pre></details>`;
  } else if (activeTab === "activity") {
    const events = relatedEvents(item);
    content = `<h3>Correlated activity (${events.length})</h3><ol class="activity-list">${events.map((entry) => `<li><b>${esc(entry.message)}</b><small>${esc(entry.kind)} / ${esc(entry.source)} / ${esc(formatDate(entry.ts))}</small></li>`).join("") || "<li>No retained correlated activity.</li>"}</ol>`;
  } else if (activeTab === "resources") content = renderResources(item);
  else content = renderSelectionControls(item);
  $("inspector").innerHTML = content;
}

function activateTab(tab, focus = false) {
  if (!tab || !["inspect", "activity", "resources", "control"].includes(tab)) return;
  activeTab = tab;
  renderSelection();
  if (focus) $(`tab-${tab}`)?.focus({ preventScroll: true });
}

function renderResources(item) {
  const runId = item.type === "run" ? item.id : item.runId;
  if (!runId) return "<p>No run is associated with this object.</p>";
  const loaded = snapshot.selectedRunId === runId ? snapshot.selectedRun : null;
  return `<h3>Run resources</h3><p>Target: <b>${esc(runId)}</b></p><div class="resource-grid"><button data-load-run="${esc(runId)}">Load authoritative resources</button><button data-document="spec" data-run="${esc(runId)}">Open SPEC</button><button data-document="devplan" data-run="${esc(runId)}">Open DEVPLAN</button></div>${loaded ? `<h3>Artifacts (${loaded.artifacts.length})</h3><div class="resource-grid">${loaded.artifacts.map((resource) => `<button data-resource="artifact" data-name="${esc(resource.name || resource.path)}" data-run="${esc(runId)}">${esc(resource.name || resource.path)}</button>`).join("") || "None"}</div><h3>Logs (${loaded.logs.length})</h3><div class="resource-grid">${loaded.logs.map((resource) => `<button data-resource="log" data-name="${esc(resource.name || resource.path)}" data-run="${esc(runId)}">${esc(resource.name || resource.path)}</button>`).join("") || "None"}</div>` : "<p>Load resources to list artifacts and logs.</p>"}`;
}

function renderSelectionControls(item) {
  const buttons = [];
  const add = (command, label = command) => buttons.push(`<button data-prepare-command="${command}">${esc(label)}</button>`);
  if (item.type === "agent") { add("steer", "Add current-run/global steering"); add("set-current-objective", "Set current objective"); }
  if (item.type === "run") { add("run-now", "Run now"); add("start-next-iteration", "Next iteration"); add("continue-from-iteration", "Continue lineage"); add("fork-from-iteration", "Fork lineage"); }
  if (item.type === "queue") { add("pin-queue-item", "Pin objective"); add("archive-queue-item", "Archive objective"); add("start-next-iteration", "Run objective"); }
  if (item.type === "gate") { add("gate-decision", "Record decision"); add("attach-gate-evidence", "Attach evidence"); add("update-gate", "Update gate"); }
  if (item.type === "iteration") { add("continue-from-iteration", "Continue lineage"); add("fork-from-iteration", "Fork lineage"); add("use-as-next-direction", "Use next direction"); }
  if (item.type === "blocker") {
    if (item.runId === snapshot.state?.currentRunId) { add("deblock", "Deblock current run"); add("deblock-advice", "Ask recovery advice"); }
    else { add("continue-from-iteration", "Continue from evidence"); add("fork-from-iteration", "Fork from evidence"); }
  }
  if (["event", "tool"].includes(item.type) && item.runId) { add("continue-from-iteration", "Continue from run"); add("use-as-next-direction", "Use as next direction"); }
  const scopeNote = item.type === "agent" ? " Agent inspection supplies context only; steering cannot target an individual agent and applies through a supported current-run, next-run, or queue scope." : "";
  return `<h3>Context-safe controls</h3><p>Selected inspection record: ${esc(item.id)}.${esc(scopeNote)} Commands are validated and sent through the control plane.</p><div class="button-row">${buttons.join("") || "Use the complete Command surface for system operations."}</div><button data-open-command>Open all ${OPERATION_COMMANDS.length} commands</button>`;
}

function renderObjectList() {
  const query = $("objectFilter").value.trim().toLowerCase();
  const visible = objects.filter((item) => !query || `${item.label} ${item.type} ${item.status} ${item.runId}`.toLowerCase().includes(query)).slice(0, 500);
  $("objectCount").textContent = `${objects.length} objects`;
  $("objectList").innerHTML = visible.map((item, index) => `<button type="button" role="option" data-object-key="${esc(item.key)}" aria-selected="${item.key === selectedKey}" tabindex="${item.key === selectedKey || (!visible.some((entry) => entry.key === selectedKey) && index === 0) ? 0 : -1}"><b>${esc(item.label)}</b><small>${esc(item.type)} / ${esc(item.status)}</small></button>`).join("");
}

function renderSemantic() {
  $("semanticCount").textContent = `${objects.length} objects / ${relationships.length} relationships`;
  $("semanticObjects").innerHTML = objects.map((item) => `<tr><th scope="row">${esc(item.label)}</th><td>${esc(item.type)}</td><td>${esc(item.status)}</td><td>${esc(item.runId || "none")}</td><td>${esc(item.activity)}</td><td><button data-object-key="${esc(item.key)}">Inspect</button></td></tr>`).join("") || '<tr><td colspan="6">No objects reported.</td></tr>';
  $("semanticRelationships").innerHTML = relationships.slice().reverse().map((item) => `<tr><td>${esc(formatDate(item.ts))}</td><th scope="row">${esc(item.source)}</th><td>${esc(item.kind)}</td><td>${esc(item.runId || "none")}</td><td>${esc(item.message)}</td><td><button data-object-key="${esc(`${item.kind}:${item.id}`)}">Inspect</button></td></tr>`).join("") || '<tr><td colspan="6">No relationships reported.</td></tr>';
}

function ledgerRows(rows) {
  return rows.map(([title, detail, state, anomaly]) => `<div class="ledger-row${anomaly ? " anomaly" : ""}"><b>${esc(title)}</b><span>${esc(detail)}</span><small>${esc(state)}</small></div>`).join("");
}

function renderLedgers() {
  const control = snapshot.control || {}, state = snapshot.state || {}, auto = control.autoIteration || {};
  $("controlLedger").innerHTML = ledgerRows([
    ["Observed workflow", first(state.phase, state.status, "idle"), `OBSERVED / PHASE ${Math.max(0, WORKFLOW_PHASES.indexOf(first(state.phase, state.status))) + 1} OF ${WORKFLOW_PHASES.length}`],
    ["Pause request", control.pause?.requested ? first(control.pause.reason, control.pause.mode, "requested") : "none", "REQUESTED"],
    ["Stop request", control.stop?.requested ? first(control.stop.reason, control.stop.mode, "requested") : "none", "REQUESTED"],
    ["Run admission", first(control.runAdmission, "enabled"), "CONTROL"],
    ["Run now", control.requestedRunNow ? "next runner tick pending" : "none", "REQUESTED"]
  ]);
  const blockers = deriveBlockers();
  $("blockerLedger").innerHTML = blockers.length ? ledgerRows(blockers.map((blocker) => [blocker.reason, `${blocker.runId || "no run"} / ${blocker.agentId || "no agent"}`, blocker.runId === state.currentRunId ? "CURRENT / REMEDIABLE" : "HISTORICAL / EVIDENCE", true])) : '<div class="ledger-row"><b>Clear field</b><span>No blocker reported</span><small>OBSERVED</small></div>';
  const queue = arr(snapshot.queue?.items), gates = arr(snapshot.gates?.gates);
  $("workLedger").innerHTML = ledgerRows([...queue.slice(0, 4).map((item) => [first(item.title, item.id), item.objective || "No objective", `${item.id === control.pinnedQueueItemId ? "PINNED / " : ""}${item.status || "QUEUED"}`]), ...gates.slice(0, 4).map((gate) => [first(gate.description, gate.id), arr(gate.requiredEvidence).join(", ") || "No evidence paths", `GATE / ${gate.status || "PENDING"}`])]) || '<p>No queue items or gates.</p>';
  $("lineageLedger").innerHTML = ledgerRows([
    ["Showcase loop", auto.enabled ? auto.paused ? "paused" : "running" : "disabled", `GEN ${first(auto.currentGeneration, 0)} / ${first(auto.targetGenerations, auto.maxIterations, 0)}`],
    ["Next run request", control.nextRunRequest ? first(control.nextRunRequest.id, "pending request") : "none", first(control.nextRunRequest?.status, "CONTROL")],
    ["Iterations", `${snapshot.iterations.length} retained`, snapshot.selectedIterationId ? `SELECTED ${snapshot.selectedIterationId}` : "NO SELECTION"],
    ["Objective", currentObjective(), "AUTHORITATIVE"]
  ]);
}

function focusDescriptor(element) {
  if (!(element instanceof Element) || element === document.body) return null;
  const scope = element.closest("[id]");
  if (!scope) return null;
  if (element.id) return { scope: scope.id, selector: `#${CSS.escape(element.id)}` };
  if (element.hasAttribute("data-resource")) return { scope: scope.id, selector: `[data-resource="${CSS.escape(element.dataset.resource)}"][data-name="${CSS.escape(element.dataset.name || "")}"][data-run="${CSS.escape(element.dataset.run || "")}"]` };
  for (const attribute of ["data-object-key", "data-tab", "data-plan-id", "data-plan-action", "data-plan-revision", "data-command-name", "data-prepare-command", "data-resource", "data-document", "data-assistance-id", "name"]) {
    if (element.hasAttribute(attribute)) return { scope: scope.id, selector: `[${attribute}="${CSS.escape(element.getAttribute(attribute))}"]` };
  }
  const focusable = [...scope.querySelectorAll("button, input, textarea, select, summary, [tabindex]")];
  const index = focusable.indexOf(element);
  return index >= 0 ? { scope: scope.id, index } : null;
}

function draftKey(control) {
  const scope = control.closest("form, dialog, #inspector") || control.closest("[id]");
  const identity = scope?.id || scope?.dataset?.action || scope?.tagName || "page";
  return `${identity}|${control.name || control.id || control.getAttribute("aria-label") || control.type}`;
}

function captureUIState() {
  const active = document.activeElement;
  const drafts = new Map([...document.querySelectorAll("#inspector input, #inspector textarea, #inspector select, #commandDialog input, #commandDialog textarea, #commandDialog select, #plansDialog input, #plansDialog textarea, #plansDialog select")].map((control) => [draftKey(control), { value: control.value, checked: control.checked, start: control.selectionStart, end: control.selectionEnd }]));
  const scroll = new Map(["inspector", "objectList", "planList", "planWorkspace", "assistanceWorkspace", "commandCatalog"].map((id) => [id, { top: $(id)?.scrollTop || 0, left: $(id)?.scrollLeft || 0 }]));
  const disclosures = new Map(["inspector", "planWorkspace", "assistanceWorkspace", "commandDialog"].map((id) => [id, [...($(id)?.querySelectorAll("details") || [])].map((details) => details.open)]));
  return { focus: focusDescriptor(active), drafts, scroll, disclosures, windowX: window.scrollX, windowY: window.scrollY };
}

function restoreUIState(state) {
  for (const control of document.querySelectorAll("#inspector input, #inspector textarea, #inspector select, #commandDialog input, #commandDialog textarea, #commandDialog select, #plansDialog input, #plansDialog textarea, #plansDialog select")) {
    const draft = state.drafts.get(draftKey(control));
    if (!draft) continue;
    if (control.type === "checkbox" || control.type === "radio") control.checked = draft.checked; else control.value = draft.value;
  }
  for (const [id, openStates] of state.disclosures) [...($(id)?.querySelectorAll("details") || [])].forEach((details, index) => { details.open = Boolean(openStates[index]); });
  for (const [id, position] of state.scroll) { const element = $(id); if (element) { element.scrollTop = position.top; element.scrollLeft = position.left; } }
  window.scrollTo(state.windowX, state.windowY);
  if (!state.focus) return;
  const scope = $(state.focus.scope);
  const target = state.focus.selector ? state.focus.selector.startsWith("#") ? document.querySelector(state.focus.selector) : scope?.querySelector(state.focus.selector) : scope?.querySelectorAll("button, input, textarea, select, summary, [tabindex]")[state.focus.index];
  if (!(target instanceof HTMLElement)) return;
  if (target.matches("#objectList [data-object-key]")) {
    document.querySelectorAll("#objectList [data-object-key]").forEach((button) => { button.tabIndex = button === target ? 0 : -1; });
  }
  target.focus({ preventScroll: true });
  const draft = state.drafts.get(draftKey(target));
  if (draft && typeof target.setSelectionRange === "function" && draft.start !== null) target.setSelectionRange(draft.start, draft.end);
}

function scheduleRender() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => {
    const uiState = captureUIState();
    renderPending = false; deriveModel(); renderHeader(); renderSelection(); renderObjectList(); renderSemantic(); renderLedgers(); renderPlans(); sceneController.rebuild(objects); restoreUIState(uiState);
  });
}

// The scene stores operational records in userData; the DOM remains the authority for labels and controls.
const sceneController = (() => {
  const canvas = $("nebulaCanvas");
  let renderer, scene, camera, cloud, runMesh, selectedHalo, animationFrame, resizeObserver;
  let agentMeshes = [], blockerMeshes = [], pickTargets = [], pointObjects = [];
  let theta = 0.55, phi = 1.1, radius = 18, dragging = false, lastPointer = null, contextLost = false;
  const reducedQuery = matchMedia("(prefers-reduced-motion: reduce)");
  const raycaster = new THREE.Raycaster();
  raycaster.params.Points.threshold = 0.16;

  function positionFor(item, runPositions) {
    if (item.type === "system") return new THREE.Vector3(0, 0, 0);
    const seed = hash(item.key), angle = (seed % 6283) / 1000, z = ((seed >>> 8) % 2000) / 1000 - 1;
    if (item.type === "run") return runPositions.get(item.id) || new THREE.Vector3();
    const center = runPositions.get(item.runId) || new THREE.Vector3(0, 0, 0);
    const band = item.type === "agent" ? 1.25 : item.type === "blocker" ? 2.05 : 1.8 + ((seed >>> 16) % 1800) / 1000;
    const radial = Math.sqrt(Math.max(0, 1 - z * z));
    return center.clone().add(new THREE.Vector3(Math.cos(angle) * radial * band, z * band, Math.sin(angle) * radial * band));
  }

  function init() {
    if (contextLost) return;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    } catch (error) {
      $("webglNotice").hidden = false; $("webglNotice").textContent = `WebGL is unavailable: ${error.message}. Use the complete semantic command space below.`;
      $("semanticView").open = true; return;
    }
    renderer.setClearColor(0x03040a, 1);
    scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x03040a, 0.035);
    camera = new THREE.PerspectiveCamera(52, 1, 0.05, 120);
    const starPositions = new Float32Array(900 * 3);
    for (let index = 0; index < 900; index++) {
      const seed = hash(`background-${index}`), r = 24 + (seed % 1900) / 100, z = ((seed >>> 8) % 2000) / 1000 - 1, angle = ((seed >>> 16) % 6283) / 1000, radial = Math.sqrt(1 - z * z);
      starPositions.set([Math.cos(angle) * radial * r, z * r, Math.sin(angle) * radial * r], index * 3);
    }
    const stars = new THREE.BufferGeometry(); stars.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: 0x515a80, size: 0.035, transparent: true, opacity: 0.7 })));
    selectedHalo = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.018, 8, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false }));
    selectedHalo.visible = false; scene.add(selectedHalo);
    resizeObserver = new ResizeObserver(resize); resizeObserver.observe(canvas);
    resize(); updateCamera(); animate();
    $("webglNotice").hidden = true;
  }

  function disposeDynamic() {
    for (const target of [cloud, runMesh, ...agentMeshes, ...blockerMeshes]) {
      if (!target) continue; scene?.remove(target); target.geometry?.dispose();
      if (Array.isArray(target.material)) target.material.forEach((material) => material.dispose()); else target.material?.dispose();
    }
    cloud = runMesh = null; agentMeshes = []; blockerMeshes = []; pickTargets = []; pointObjects = [];
  }

  function rebuild(model) {
    if (!scene || contextLost) return;
    disposeDynamic();
    const runs = model.filter((item) => item.type === "run").slice(0, 80);
    const runPositions = new Map();
    runs.forEach((run, index) => {
      const y = 1 - 2 * ((index + 0.5) / Math.max(runs.length, 1)), radial = Math.sqrt(Math.max(0, 1 - y * y)), angle = index * 2.399963;
      runPositions.set(run.id, new THREE.Vector3(Math.cos(angle) * radial * 5, y * 5, Math.sin(angle) * radial * 5));
    });
    if (runs.length) {
      runMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.34, 1), new THREE.MeshBasicMaterial({ color: 0xf5f0ff }), runs.length);
      const matrix = new THREE.Matrix4(); runs.forEach((run, index) => matrix.setPosition(runPositions.get(run.id)) && runMesh.setMatrixAt(index, matrix));
      runMesh.instanceMatrix.needsUpdate = true; runMesh.userData.items = runs; scene.add(runMesh); pickTargets.push(runMesh);
    }
    for (const item of model.filter((entry) => entry.type === "agent").slice(0, 160)) {
      const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ color: isBlocked(item.status) ? 0xff5a71 : 0x69e6ec }));
      mesh.position.copy(positionFor(item, runPositions)); mesh.userData.item = item; scene.add(mesh); agentMeshes.push(mesh); pickTargets.push(mesh);
    }
    for (const item of model.filter((entry) => entry.type === "blocker").slice(0, 40)) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.72, 16, 10), new THREE.MeshBasicMaterial({ color: 0xff425f, wireframe: true, transparent: true, opacity: 0.72 }));
      mesh.position.copy(positionFor(item, runPositions)); mesh.userData.item = item; mesh.userData.seed = hash(item.id) % 1000; scene.add(mesh); blockerMeshes.push(mesh); pickTargets.push(mesh);
    }
    pointObjects = model.filter((entry) => ["event", "tool"].includes(entry.type)).slice(-1500);
    if (pointObjects.length) {
      const positions = new Float32Array(pointObjects.length * 3), colors = new Float32Array(pointObjects.length * 3), color = new THREE.Color();
      pointObjects.forEach((item, index) => {
        positions.set(positionFor(item, runPositions).toArray(), index * 3);
        color.set(item.type === "tool" ? 0xffbd64 : isBlocked(item.status) ? 0xff5a71 : 0xa98cff); colors.set(color.toArray(), index * 3);
      });
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3)); geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      cloud = new THREE.Points(geometry, new THREE.PointsMaterial({ size: 0.1, vertexColors: true, transparent: true, opacity: 0.88, sizeAttenuation: true }));
      cloud.userData.items = pointObjects; scene.add(cloud); pickTargets.push(cloud);
    }
    highlight(selectedKey);
    if (reducedQuery.matches) animate();
  }

  function highlight(key) {
    if (!selectedHalo || !scene) return;
    const direct = [...agentMeshes, ...blockerMeshes].find((mesh) => mesh.userData.item?.key === key);
    if (direct) { selectedHalo.position.copy(direct.position); selectedHalo.scale.setScalar(direct.userData.item.type === "blocker" ? 1.8 : 0.75); selectedHalo.visible = true; return; }
    const runIndex = runMesh?.userData.items.findIndex((item) => item.key === key) ?? -1;
    if (runIndex >= 0) { const matrix = new THREE.Matrix4(); runMesh.getMatrixAt(runIndex, matrix); selectedHalo.position.setFromMatrixPosition(matrix); selectedHalo.scale.setScalar(1); selectedHalo.visible = true; return; }
    const pointIndex = pointObjects.findIndex((item) => item.key === key);
    if (pointIndex >= 0 && cloud) { selectedHalo.position.fromBufferAttribute(cloud.geometry.attributes.position, pointIndex); selectedHalo.scale.setScalar(0.48); selectedHalo.visible = true; return; }
    selectedHalo.visible = false;
  }

  function updateCamera() {
    if (!camera) return;
    phi = Math.max(0.12, Math.min(Math.PI - 0.12, phi)); radius = Math.max(7, Math.min(34, radius));
    camera.position.set(radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta)); camera.lookAt(0, 0, 0);
    $("azimuth").textContent = String(Math.round((theta * 180 / Math.PI + 360) % 360)).padStart(3, "0");
    $("elevation").textContent = String(Math.round(90 - phi * 180 / Math.PI)).padStart(3, "0"); $("range").textContent = radius.toFixed(1);
    if (reducedQuery.matches && renderer && scene) renderer.render(scene, camera);
  }

  function resize() {
    if (!renderer || !camera) return;
    const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight), ratio = Math.min(devicePixelRatio || 1, 1.5), maxPixels = 3840 * 2160;
    let drawWidth = Math.floor(width * ratio), drawHeight = Math.floor(height * ratio), scale = Math.min(1, Math.sqrt(maxPixels / (drawWidth * drawHeight)));
    drawWidth = Math.max(1, Math.floor(drawWidth * scale)); drawHeight = Math.max(1, Math.floor(drawHeight * scale));
    if (canvas.width !== drawWidth || canvas.height !== drawHeight) renderer.setSize(drawWidth, drawHeight, false);
    camera.aspect = width / height; camera.updateProjectionMatrix();
  }

  function animate(time = 0) {
    cancelAnimationFrame(animationFrame);
    if (!renderer || contextLost || document.hidden) return;
    if (!reducedQuery.matches) {
      if (cloud) cloud.rotation.y = time * 0.000015;
      blockerMeshes.forEach((mesh) => mesh.scale.setScalar(1 + ((time * 0.00035 + mesh.userData.seed) % 1) * 0.28));
      if (selectedHalo?.visible) selectedHalo.lookAt(camera.position);
    }
    renderer.render(scene, camera);
    $("renderStats").textContent = `${pointObjects.length} PTS / ${renderer.info.render.calls} DC`;
    if (!reducedQuery.matches) animationFrame = requestAnimationFrame(animate);
  }

  function pick(event) {
    if (!camera || !scene || dragging) return;
    const bounds = canvas.getBoundingClientRect(), pointer = new THREE.Vector2(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickTargets, false)[0];
    if (!hit) return;
    const item = hit.object === cloud ? pointObjects[hit.index] : hit.object === runMesh ? runMesh.userData.items[hit.instanceId] : hit.object.userData.item;
    if (item) selectObject(item.key);
  }

  canvas.addEventListener("pointerdown", (event) => { dragging = false; lastPointer = { x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId); });
  canvas.addEventListener("pointermove", (event) => { if (!lastPointer) return; const dx = event.clientX - lastPointer.x, dy = event.clientY - lastPointer.y; if (Math.abs(dx) + Math.abs(dy) > 3) dragging = true; theta -= dx * 0.006; phi -= dy * 0.006; lastPointer = { x: event.clientX, y: event.clientY }; updateCamera(); });
  canvas.addEventListener("pointerup", (event) => { const wasDragging = dragging; lastPointer = null; dragging = wasDragging; if (!wasDragging) pick(event); queueMicrotask(() => { dragging = false; }); });
  canvas.addEventListener("wheel", (event) => { event.preventDefault(); radius += Math.sign(event.deltaY) * 1.1; updateCamera(); }, { passive: false });
  canvas.addEventListener("webglcontextlost", (event) => { event.preventDefault(); contextLost = true; cancelAnimationFrame(animationFrame); $("webglNotice").hidden = false; $("webglNotice").textContent = "WebGL context lost. The semantic command space remains fully operational; waiting for restoration."; $("semanticView").open = true; });
  canvas.addEventListener("webglcontextrestored", () => { contextLost = false; resizeObserver?.disconnect(); renderer?.dispose(); renderer = scene = camera = null; init(); rebuild(objects); notify("WebGL context restored from the current authoritative snapshot."); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) animate(); else cancelAnimationFrame(animationFrame); });
  reducedQuery.addEventListener?.("change", () => animate());

  return {
    init, rebuild, highlight,
    camera(action) {
      if (action === "left") theta -= 0.18; if (action === "right") theta += 0.18; if (action === "up") phi -= 0.14; if (action === "down") phi += 0.14; if (action === "in") radius -= 1.5; if (action === "out") radius += 1.5;
      if (action === "reset") { theta = 0.55; phi = 1.1; radius = 18; } updateCamera();
    }
  };
})();

const operationGroups = {
  "Run lifecycle": ["pause", "hold", "resume", "unhold", "stop", "run-now"],
  "Steering & recovery": ["steer", "deblock", "deblock-advice", "approve-deblock-advice", "deny-deblock-advice", "remove-steering", "set-current-objective"],
  "Iteration lineage": ["start-next-iteration", "continue-from-iteration", "fork-from-iteration", "use-as-next-direction"],
  "Showcase loop": ["start-showcase-loop", "pause-showcase-loop", "resume-showcase-loop", "stop-showcase-loop", "set-showcase-target"],
  "Queue & gates": ["gate-decision", "attach-gate-evidence", "add-queue-item", "clear-queue", "pin-queue-item", "archive-queue-item", "add-gate", "update-gate"]
};
const operationFields = {
  steer: [["text", "General steering instruction", "textarea", true], ["scope", "Supported scope", "select", true, ["current_run", "next_run", "queue"]], ["priority", "Priority", "select", true, ["required", "advisory"]]],
  deblock: [["prompt", "Recovery instruction", "textarea", true], ["runId", "Current run ID"]],
  "deblock-advice": [["prompt", "Recovery question", "textarea", true], ["runId", "Current run ID"]],
  "approve-deblock-advice": [["adviceId", "Advice ID", "text", true]], "deny-deblock-advice": [["adviceId", "Advice ID", "text", true]],
  "remove-steering": [["id", "Steering ID", "text", true]], "set-current-objective": [["objective", "Objective", "textarea", true], ["runId", "Run ID"]],
  "start-next-iteration": [["runId", "Source run"], ["queueItemId", "Queue item"], ["repoPath", "Repository path"], ["objective", "Objective", "textarea", true], ["changeText", "Bounded change", "textarea", true], ["acceptanceGateIds", "Gate IDs"]],
  "continue-from-iteration": [["runId", "Source run", "text", true], ["sourceIterationId", "Source iteration"], ["repoPath", "Repository path"], ["changeText", "Continuation direction", "textarea", true]],
  "fork-from-iteration": [["runId", "Source run", "text", true], ["sourceIterationId", "Source iteration"], ["repoPath", "Repository path"], ["changeText", "Fork direction", "textarea", true]],
  "use-as-next-direction": [["sourceRunId", "Source run", "text", true], ["sourceIterationId", "Source iteration", "text", true], ["repoPath", "Repository path", "text", true], ["baseRef", "Base ref", "text", true], ["objective", "Objective", "textarea", true], ["changeText", "Accepted direction", "textarea", true]],
  "start-showcase-loop": [["sourceRunId", "Source run"], ["sourceIterationId", "Source iteration"], ["repoPath", "Repository path", "text", true], ["objective", "Objective", "textarea", true], ["targetGenerations", "Target generations", "number", true]],
  "set-showcase-target": [["targetGenerations", "Target generations", "number", true]],
  "gate-decision": [["gateId", "Gate ID", "text", true], ["status", "Gate status", "select", true, ["passed", "failed", "needs-evidence"]], ["decision", "Decision", "select", true, ["accepted", "rejected", "defer"]], ["runId", "Run ID"], ["notes", "Notes", "textarea"], ["evidenceArtifacts", "Evidence artifact paths"]],
  "attach-gate-evidence": [["gateId", "Gate ID", "text", true], ["runId", "Run ID", "text", true], ["evidenceArtifacts", "Evidence artifact paths", "textarea", true]],
  "add-queue-item": [["title", "Title", "text", true], ["objective", "Objective", "textarea", true], ["context", "Context / bounded change", "textarea"], ["preferredRepo", "Preferred repository"], ["priority", "Priority", "number"], ["acceptanceGateIds", "Gate IDs"], ["pin", "Pin immediately", "checkbox"]],
  "pin-queue-item": [["id", "Queue item ID", "text", true]], "archive-queue-item": [["id", "Queue item ID", "text", true]],
  "add-gate": [["id", "Gate ID", "text", true], ["description", "Description", "textarea", true], ["severity", "Severity", "select", true, ["must", "should"]], ["requiredEvidence", "Required evidence paths", "textarea"]],
  "update-gate": [["id", "Gate ID", "text", true], ["description", "Description", "textarea"], ["severity", "Severity", "select", false, ["must", "should"]], ["requiredEvidence", "Required evidence paths", "textarea"]]
};
const confirmationCommands = new Set(OPERATION_COMMANDS);

function operationSeed() {
  const item = selectedObject(), data = item?.data || {}, iteration = item?.type === "iteration" ? data : snapshot.iterationDetail || snapshot.iterations.find((entry) => entry.runId === item?.runId) || {};
  return { id: data.id || item?.id, runId: item?.type === "run" ? item.id : item?.runId || snapshot.state?.currentRunId, sourceRunId: item?.runId || snapshot.state?.currentRunId, sourceIterationId: first(iteration.id, snapshot.selectedIterationId), queueItemId: item?.type === "queue" ? item.id : "", gateId: item?.type === "gate" ? item.id : "", repoPath: first(data.repoPath, iteration.repoPath, snapshot.control?.autoIteration?.repoPath), baseRef: first(data.baseRef, iteration.baseRef, iteration.commit, "HEAD"), objective: first(data.objective, currentObjective()), changeText: "Complete one bounded objective-linked generation without unrelated changes.", targetGenerations: first(snapshot.control?.autoIteration?.targetGenerations, 10), adviceId: arr(snapshot.control?.deblockAdvice).find((entry) => entry.status === "pending")?.id, priority: 50, scope: "current_run" };
}

function fieldMarkup([name, label, type = "text", required = false, choices = []], value) {
  if (type === "textarea") return `<label>${esc(label)}<textarea name="${esc(name)}" ${required ? "required" : ""}>${esc(value || "")}</textarea></label>`;
  if (type === "select") return `<label>${esc(label)}<select name="${esc(name)}" ${required ? "required" : ""}>${choices.map((choice) => `<option value="${esc(choice)}">${esc(choice)}</option>`).join("")}</select></label>`;
  if (type === "checkbox") return `<label><input name="${esc(name)}" type="checkbox"> ${esc(label)}</label>`;
  return `<label>${esc(label)}<input name="${esc(name)}" type="${esc(type)}" value="${esc(value || "")}" ${type === "number" ? 'min="1" max="100"' : ""} ${required ? "required" : ""}></label>`;
}

function renderCommandCatalog() {
  $("commandCatalog").innerHTML = Object.entries(operationGroups).map(([group, commands]) => `<h3>${esc(group)}</h3>${commands.map((command) => `<button type="button" data-command-name="${command}" class="${command === selectedCommand ? "active" : ""}">${esc(command)}</button>`).join("")}`).join("");
  if (OPERATION_COMMANDS.some((command) => !Object.values(operationGroups).flat().includes(command))) throw new Error("Operation catalog is incomplete");
}

function renderOperationForm() {
  renderCommandCatalog(); const seed = operationSeed(), definitions = operationFields[selectedCommand] || [];
  $("operationTitle").textContent = selectedCommand;
  $("operationDescription").textContent = selectedCommand === "steer" ? "Steering uses only supported current-run, next-run, or queue scope. The inspected agent is context, not a command target." : ["pause", "hold", "stop"].includes(selectedCommand) ? "This persists workflow intent. It does not freeze this display and may be observed only at a safe checkpoint." : selectedCommand === "deblock-advice" ? "Advice is inert until a separate approve or deny command." : "Review target identity and payload. Accepted does not mean execution has completed.";
  $("operationFields").innerHTML = definitions.length ? `<div class="field-pair">${definitions.map((definition) => fieldMarkup(definition, seed[definition[0]])).join("")}</div>` : "<p>This command has no required payload fields. Additional JSON remains optional.</p>";
  $("payloadJson").value = "{}"; $("operationError").textContent = "";
  $("operationConfirmation").hidden = !confirmationCommands.has(selectedCommand); $("operationConfirmation").querySelector("input").checked = false;
}

function openCommand(command = selectedCommand) {
  selectedCommand = OPERATION_COMMANDS.includes(command) ? command : "pause"; renderOperationForm(); renderCommandHistory(); $("commandDialog").showModal();
}

function renderCommandHistory() {
  $("commandHistory").innerHTML = commandHistory.slice().reverse().map((item) => `<li><b>${esc(item.command)} / ${esc(item.state)}</b><small>${esc(formatDate(item.at))}${item.message ? ` / ${esc(item.message)}` : ""}</small></li>`).join("") || "<li>No commands sent in this session.</li>";
}

async function submitOperation(form) {
  if (!form.reportValidity()) return;
  const command = selectedCommand;
  const confirmation = $("operationConfirmation");
  if (!confirmation.hidden && !confirmation.querySelector("input").checked) { $("operationError").textContent = "Explicit confirmation is required."; return; }
  let extra;
  try { extra = JSON.parse($("payloadJson").value || "{}"); if (!extra || Array.isArray(extra) || typeof extra !== "object") throw new Error("JSON payload must be an object"); }
  catch (error) { $("operationError").textContent = error.message; return; }
  const data = new FormData(form), payload = { ...extra };
  for (const [key, value] of data) if (value !== "") payload[key] = value;
  for (const key of ["acceptanceGateIds", "evidenceArtifacts"]) if (payload[key]) payload[key] = lines(payload[key]);
  if (command === "update-gate" && payload.requiredEvidence) payload.requiredEvidence = lines(payload.requiredEvidence);
  for (const key of ["targetGenerations", "priority"]) if (payload[key]) payload[key] = Number(payload[key]);
  if (form.elements.pin) payload.pin = form.elements.pin.checked;
  if (command === "add-queue-item") { payload.source = "swarm-nebula"; if (payload.preferredRepo) { payload.target = { preferredRepo: payload.preferredRepo }; delete payload.preferredRepo; } }
  if (command === "steer") { delete payload.agentId; delete payload.runId; }
  if (command === "start-showcase-loop") payload.limits = { maxIterations: payload.targetGenerations, maxVariantsPerIteration: 3, maxParallelVariants: 3, maxAcceptedFeatures: 4, maxVisualMotifChanges: 1, maxNewSections: 1, stopAfterNoImprovement: 1, minImprovementScore: 0.05 };
  if (["start-next-iteration", "continue-from-iteration", "fork-from-iteration", "use-as-next-direction"].includes(command) && !payload.limits) payload.limits = { maxIterations: 1, maxVariantsPerIteration: 3, maxParallelVariants: 3 };
  if (["deblock", "deblock-advice", "approve-deblock-advice", "deny-deblock-advice"].includes(command)) {
    try { await client.refresh(); } catch (error) { $("operationError").textContent = `Safety revalidation failed: ${error.message}`; return; }
    const currentRunId = snapshot.state?.currentRunId || null;
    const currentBlocker = activeCurrentBlocker();
    if (!currentRunId || !currentBlocker) { $("operationError").textContent = "Dispatch stopped: the refreshed current run has no active blocker."; return; }
    if (["deblock", "deblock-advice"].includes(command) && payload.runId !== currentRunId) { $("operationError").textContent = `Dispatch stopped: target run changed from ${payload.runId || "none"} to ${currentRunId}. Review and confirm again.`; return; }
    if (["approve-deblock-advice", "deny-deblock-advice"].includes(command)) {
      const advice = arr(snapshot.control?.deblockAdvice).find((item) => item.id === payload.adviceId && item.status === "pending");
      if (!advice || advice.runId !== currentRunId) { $("operationError").textContent = "Dispatch stopped: pending advice no longer belongs to the refreshed current blocked run."; return; }
    }
  }
  const entry = { id: ++commandSerial, command, state: "pending", at: new Date().toISOString() }; commandHistory.push(entry); renderCommandHistory();
  form.querySelector("button[type=submit]").disabled = true;
  try { await client.command(command, payload, { refresh: true }); entry.state = "accepted"; entry.message = "Intent persisted; awaiting observed state"; notify(`${command} accepted by the control plane.`); renderOperationForm(); }
  catch (error) { entry.state = "failed"; entry.message = [error.message, ...arr(error.details)].join(" / "); $("operationError").textContent = entry.message; notify(entry.message, true); }
  finally { form.querySelector("button[type=submit]").disabled = false; renderCommandHistory(); }
}

function planDefaults(pipelineType = "classic") {
  return { pipelineType, title: "", problem: "", intendedUsers: "", objective: "", boundedScope: "", requirements: [], nonGoals: [], constraints: [], risks: [], repository: { path: null, baseRef: null, baseCommit: null }, acceptanceGates: [], validationPolicy: { id: "apb.runner-selected.v1", expectations: [], clientCommandsAllowed: false }, milestones: [], limits: { maxIterations: 1, maxVariantsPerIteration: 3, maxParallelVariants: 3, maxAcceptedFeatures: 4, maxVisualMotifChanges: 1, maxNewSections: 1, stopAfterNoImprovement: 1 }, lineage: { mode: "new", sourcePlanId: null, sourceRevision: null, sourceRunId: null, sourceIterationId: null } };
}

function planField(name, label, value, textarea = false, required = false) {
  return `<label>${esc(label)}${textarea ? `<textarea name="${name}" ${required ? "required" : ""}>${esc(Array.isArray(value) ? value.join("\n") : value || "")}</textarea>` : `<input name="${name}" value="${esc(value || "")}" ${required ? "required" : ""}>`}</label>`;
}

function planEditor(content = planDefaults(), action = "project-plan.create") {
  return `<form id="planForm" class="plan-form" data-action="${action}"><p>Plan content is declarative. Client-supplied executable validation commands are not accepted.</p><fieldset><legend>Project definition</legend><label>Pipeline<select name="pipelineType"><option value="classic" ${content.pipelineType === "classic" ? "selected" : ""}>classic</option><option value="managed" ${content.pipelineType === "managed" ? "selected" : ""}>managed</option></select></label>${planField("title", "Title", content.title, false, true)}${planField("problem", "Problem", content.problem, true, true)}${planField("intendedUsers", "Intended users", content.intendedUsers, true, true)}${planField("objective", "Measurable objective", content.objective, true, true)}${planField("boundedScope", "Bounded scope", content.boundedScope, true, true)}</fieldset><fieldset><legend>Boundaries</legend>${planField("requirements", "Requirements, one per line", content.requirements, true, true)}${planField("nonGoals", "Non-goals, one per line", content.nonGoals, true)}${planField("constraints", "Constraints, one per line", content.constraints, true)}${planField("risks", "Risks, one per line", content.risks, true)}</fieldset><fieldset><legend>Delivery and evidence</legend>${planField("repositoryPath", "Managed repository path", content.repository?.path)}${planField("baseRef", "Base ref", content.repository?.baseRef)}${planField("acceptanceGates", "Gates: id | description | severity | evidence paths", arr(content.acceptanceGates).map((gate) => `${gate.id} | ${gate.description} | ${gate.severity || "must"} | ${arr(gate.requiredEvidence).join(", ")}`).join("\n"), true)}${planField("validationExpectations", "Validation expectations", content.validationPolicy?.expectations, true, true)}${planField("milestones", "Milestones", content.milestones, true)}</fieldset><fieldset><legend>Bounded limits</legend><div class="field-pair">${planField("maxIterations", "Max iterations", content.limits?.maxIterations || 1)}${planField("maxParallelVariants", "Max parallel variants", content.limits?.maxParallelVariants || 3)}</div></fieldset><p class="form-error" role="alert"></p><button class="hot" type="submit">${action === "project-plan.create" ? "Create persisted draft" : "Save new revision"}</button></form>`;
}

function collectPlan(form, existing) {
  const data = new FormData(form), pipelineType = String(data.get("pipelineType")), base = existing || planDefaults(pipelineType);
  const gates = String(data.get("acceptanceGates") || "").split(/\r?\n/).filter(Boolean).map((row, index) => { const [id, description, severity = "must", evidence = ""] = row.split("|").map((part) => part.trim()); const requiredEvidence = lines(evidence); return { id: id || `gate-${index + 1}`, description, severity: severity === "should" ? "should" : "must", required: requiredEvidence.length > 0, requiredEvidence }; });
  return { ...base, pipelineType, title: String(data.get("title")), problem: String(data.get("problem")), intendedUsers: String(data.get("intendedUsers")), objective: String(data.get("objective")), boundedScope: String(data.get("boundedScope")), requirements: lines(data.get("requirements")), nonGoals: lines(data.get("nonGoals")), constraints: lines(data.get("constraints")), risks: lines(data.get("risks")), repository: pipelineType === "managed" ? { path: String(data.get("repositoryPath") || "") || null, baseRef: String(data.get("baseRef") || "") || null, baseCommit: base.repository?.baseCommit || null } : { path: null, baseRef: null, baseCommit: null }, acceptanceGates: gates, validationPolicy: { id: "apb.runner-selected.v1", expectations: lines(data.get("validationExpectations")), clientCommandsAllowed: false }, milestones: lines(data.get("milestones")), limits: { ...base.limits, maxIterations: Number(data.get("maxIterations")) || 1, maxParallelVariants: Number(data.get("maxParallelVariants")) || 1 } };
}

function renderPlans() {
  if (!$("plansDialog").open) return;
  $("planList").innerHTML = snapshot.plans.map((plan) => `<button type="button" data-plan-id="${esc(plan.planId)}"><span><b>${esc(first(plan.title, plan.planId))}</b><br><small>${esc(plan.pipelineType)} / rev ${esc(plan.currentRevision)}</small></span><span>${esc(plan.state)}</span></button>`).join("") || "<p>No persisted plans.</p>";
  const detail = snapshot.planDetail;
  if (!selectedPlanId || !detail || detail.ledger?.planId !== selectedPlanId) return;
  const ledger = detail.ledger, revision = detail.revision;
  $("planWorkspace").innerHTML = `<h3>${esc(revision.content.title)}</h3>${keyValues([["State", ledger.state], ["Plan", ledger.planId], ["Revision", revision.revision], ["Version", ledger.version], ["Digest", revision.contentDigest]])}<div class="button-row">${planLifecycleActions.slice(2).map((action) => `<button data-plan-action="${action}">${esc(action.replace("project-plan.", ""))}</button>`).join("")}</div><details><summary>Edit and save a new revision</summary>${planEditor(revision.content, "project-plan.update")}</details><h3>Saved revisions</h3><div class="button-row">${arr(detail.revisions).map((item) => `<button data-plan-revision="${esc(item.revision)}">Revision ${esc(item.revision)}</button>`).join("")}</div>${planRevisionPreview ? `<pre>${esc(clip(planRevisionPreview))}</pre>` : ""}<details><summary>Decisions and launches</summary><pre>${esc(clip({ decisions: detail.decisions, launches: detail.launches }))}</pre></details>`;
}

async function loadPlan(planId) {
  selectedPlanId = planId; planRevisionPreview = null; $("planWorkspace").innerHTML = "<p>Loading plan ledger...</p>";
  try { await client.getProjectPlan(planId); renderPlans(); } catch (error) { $("planWorkspace").innerHTML = `<p class="form-error">${esc(error.message)}</p>`; }
}

async function submitPlan(form) {
  if (!form.reportValidity()) return;
  const detail = snapshot.planDetail, action = form.dataset.action, existing = action === "project-plan.update" ? detail?.revision?.content : null, content = collectPlan(form, existing);
  const target = action === "project-plan.update" ? `plan ${detail.ledger.planId} as a new revision` : "a new persisted project-plan draft";
  if (!confirm(`Persist ${target}? Review repository, limits, gates, and validation expectations before continuing.`)) return;
  try {
    const payload = action === "project-plan.update" ? { planId: detail.ledger.planId, content } : { content };
    const result = await client.projectPlanCommand(action, payload, { expectedVersion: action === "project-plan.update" ? detail.ledger.version : undefined, refresh: true });
    selectedPlanId = result?.planId || selectedPlanId; if (selectedPlanId) await client.getProjectPlan(selectedPlanId); notify("Project-plan revision persisted."); renderPlans();
  } catch (error) { form.querySelector(".form-error").textContent = [error.message, ...arr(error.details)].join(" / "); }
}

async function planAction(action) {
  const detail = snapshot.planDetail; if (!detail) return;
  const ledger = detail.ledger, revision = detail.revision;
  let payload = { planId: ledger.planId, revision: revision.revision, planDigest: revision.contentDigest };
  if (["project-plan.approve", "project-plan.reject"].includes(action)) { const notes = prompt(`${action.replace("project-plan.", "")} decision notes:`); if (notes === null || (action.endsWith("reject") && !notes.trim())) return; payload.notes = notes; }
  if (["project-plan.clone", "project-plan.fork"].includes(action)) payload = { ...payload, sourceRunId: snapshot.selectedRunId || null, sourceIterationId: snapshot.selectedIterationId || null, baseRef: revision.content.repository?.baseRef || "HEAD" };
  if (action === "project-plan.archive") payload = { planId: ledger.planId };
  if (planLifecycleActions.slice(2).includes(action) && !confirm(`${action.replace("project-plan.", "")} plan ${ledger.planId}, revision ${revision.revision}, digest ${revision.contentDigest}? This is a consequential lifecycle or lineage mutation.`)) return;
  try { const result = await client.projectPlanCommand(action, payload, { expectedVersion: ledger.version, refresh: true }); selectedPlanId = result?.planId || (action === "project-plan.archive" ? null : selectedPlanId); if (selectedPlanId) await client.getProjectPlan(selectedPlanId); notify(`${action} accepted.`); renderPlans(); }
  catch (error) { notify([error.message, ...arr(error.details)].join(" / "), true); }
}

async function renderAssistance() {
  const detail = snapshot.assistanceDetail;
  if (assistanceListMode || !detail) {
    try { await client.listPlanAssistance(); } catch (error) { notify(error.message, true); }
    $("assistanceWorkspace").innerHTML = `<p>Suggestions are discussion only and cannot execute.</p><div class="plan-list">${snapshot.assistance.map((item) => `<button data-assistance-id="${esc(item.id)}"><span>${esc(item.pipelineType)}</span><span>${esc(item.messageCount)} turns</span></button>`).join("")}</div>`; return;
  }
  $("assistanceWorkspace").innerHTML = `<p>Discussion only. Persist a proposal explicitly before lifecycle actions.</p>${arr(detail.messages).map((message) => `<div class="assist-message ${esc(message.role)}"><b>${esc(message.role)}</b><p>${esc(message.content)}</p></div>`).join("")}<form id="assistanceForm" class="assist-form"><label>Planning message<textarea name="message" maxlength="16000" required></textarea></label><div class="button-row"><button type="submit">Send</button>${detail.proposedContent ? '<button type="button" data-create-proposal>Create persisted draft from proposal</button>' : ""}<button type="button" data-assistance-list>Conversations</button></div><p class="form-error"></p></form>`;
}

async function openPlans() {
  $("plansDialog").showModal();
  try { await Promise.all([client.refreshPlans(), client.listPlanAssistance()]); renderPlans(); await renderAssistance(); } catch (error) { notify(error.message, true); }
}

async function loadResource(kind, name, runId) {
  $("resourceTitle").textContent = name; $("resourceContent").textContent = "Loading..."; $("resourceDialog").showModal();
  try { const result = kind === "artifact" ? await client.loadArtifact(name, runId) : await client.loadLog(name, runId); $("resourceContent").textContent = result.text; }
  catch (error) { $("resourceContent").textContent = [error.message, ...arr(error.details)].join(" / "); }
}

async function loadDocument(kind, runId) {
  $("resourceTitle").textContent = kind.toUpperCase(); $("resourceContent").textContent = "Loading approved document candidate..."; $("resourceDialog").showModal();
  try { const result = await client.loadDocument(kind, runId); $("resourceTitle").textContent = result.name; $("resourceContent").textContent = result.text; }
  catch (error) { $("resourceContent").textContent = [error.message, ...arr(error.details)].join(" / "); }
}

document.addEventListener("click", async (event) => {
  const objectButton = event.target.closest("[data-object-key]"); if (objectButton) { selectObject(objectButton.dataset.objectKey); return; }
  const tab = event.target.closest(".tabs [role=tab]"); if (tab) { activateTab(tab.dataset.tab); return; }
  const camera = event.target.closest("[data-camera]"); if (camera) { sceneController.camera(camera.dataset.camera); return; }
  const prepare = event.target.closest("[data-prepare-command]"); if (prepare) { openCommand(prepare.dataset.prepareCommand); return; }
  if (event.target.closest("[data-open-command]")) { openCommand(); return; }
  const commandName = event.target.closest("[data-command-name]"); if (commandName) { selectedCommand = commandName.dataset.commandName; renderOperationForm(); return; }
  const loadRun = event.target.closest("[data-load-run]"); if (loadRun) { try { await client.selectRun(loadRun.dataset.loadRun); activeTab = "resources"; renderSelection(); } catch (error) { notify(error.message, true); } return; }
  const resource = event.target.closest("[data-resource]"); if (resource) { loadResource(resource.dataset.resource, resource.dataset.name, resource.dataset.run); return; }
  const documentButton = event.target.closest("[data-document]"); if (documentButton) { loadDocument(documentButton.dataset.document, documentButton.dataset.run); return; }
  const plan = event.target.closest("[data-plan-id]"); if (plan) { loadPlan(plan.dataset.planId); return; }
  const action = event.target.closest("[data-plan-action]"); if (action) { planAction(action.dataset.planAction); return; }
  const revision = event.target.closest("[data-plan-revision]"); if (revision) { try { planRevisionPreview = await client.getProjectPlanRevision(selectedPlanId, revision.dataset.planRevision); renderPlans(); } catch (error) { notify(error.message, true); } return; }
  const assistance = event.target.closest("[data-assistance-id]"); if (assistance) { try { assistanceListMode = false; await client.getPlanAssistance(assistance.dataset.assistanceId); renderAssistance(); } catch (error) { notify(error.message, true); } return; }
  if (event.target.closest("[data-assistance-list]")) { assistanceListMode = true; await client.listPlanAssistance(); renderAssistance(); return; }
  if (event.target.closest("[data-create-proposal]")) { const detail = snapshot.assistanceDetail; if (!detail?.proposedContent || !confirm("Create a persisted project-plan draft from this inert proposal?")) return; try { const result = await client.createProjectPlan({ content: detail.proposedContent }, { refresh: true }); selectedPlanId = result.planId; await client.getProjectPlan(selectedPlanId); renderPlans(); notify("Proposal persisted as a draft."); } catch (error) { notify(error.message, true); } }
});

document.querySelector(".tabs").addEventListener("keydown", (event) => {
  const tab = event.target.closest("[role=tab]");
  if (!tab) return;
  const tabs = [...event.currentTarget.querySelectorAll("[role=tab]")];
  const index = tabs.indexOf(tab);
  let next = index;
  if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
  else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = tabs.length - 1;
  else return;
  event.preventDefault();
  activateTab(tabs[next].dataset.tab, true);
});

document.addEventListener("submit", async (event) => {
  if (event.target.id === "operationForm") { event.preventDefault(); await submitOperation(event.target); }
  if (event.target.id === "planForm") { event.preventDefault(); await submitPlan(event.target); }
  if (event.target.id === "assistanceForm") { event.preventDefault(); const detail = snapshot.assistanceDetail, message = new FormData(event.target).get("message"); try { await client.messagePlanAssistance(detail.id, detail.version, String(message)); await renderAssistance(); } catch (error) { event.target.querySelector(".form-error").textContent = error.message; } }
});

$("objectList").addEventListener("keydown", (event) => {
  const button = event.target.closest("[data-object-key]"); if (!button) return;
  const buttons = [...$("objectList").querySelectorAll("[data-object-key]")], index = buttons.indexOf(button); let next = index;
  if (event.key === "ArrowDown" || event.key === "ArrowRight") next++; else if (event.key === "ArrowUp" || event.key === "ArrowLeft") next--; else if (event.key === "Home") next = 0; else if (event.key === "End") next = buttons.length - 1; else if (["Enter", " "].includes(event.key)) { event.preventDefault(); selectObject(button.dataset.objectKey); return; } else return;
  event.preventDefault(); next = Math.max(0, Math.min(buttons.length - 1, next)); button.tabIndex = -1; buttons[next].tabIndex = 0; buttons[next].focus();
});
$("objectFilter").addEventListener("input", renderObjectList);
$("refreshButton").addEventListener("click", async () => { try { await client.refresh(); notify("Full telemetry synchronization complete."); } catch (error) { notify(error.message, true); } });
$("freezeButton").addEventListener("click", async () => { try { if (snapshot.connection.paused) await client.resume(); else client.pause(); } catch (error) { notify(error.message, true); } });
$("connectionButton").addEventListener("click", async () => { try { if (snapshot.connection.status === "disconnected") await client.connect(); else client.disconnect(); } catch (error) { notify(error.message, true); } });
$("commandButton").addEventListener("click", () => openCommand());
$("plansButton").addEventListener("click", openPlans);
$("helpButton").addEventListener("click", () => $("helpDialog").showModal());
$("newPlanButton").addEventListener("click", () => { selectedPlanId = null; $("planWorkspace").innerHTML = `<h3>New persisted draft</h3>${planEditor()}`; });
$("newAssistButton").addEventListener("click", async () => { const pipelineType = confirm("Use managed planning assistance? Choose Cancel for classic.") ? "managed" : "classic"; try { assistanceListMode = false; await client.createPlanAssistance(pipelineType); renderAssistance(); } catch (error) { notify(error.message, true); } });

client.subscribe((nextSnapshot) => { snapshot = nextSnapshot; scheduleRender(); });
sceneController.init();
clearInterval(freshnessTimer); freshnessTimer = setInterval(renderFreshness, 1000);
client.connect().catch((error) => notify(`Initial synchronization failed; fallback/reconnect remains active: ${error.message}`, true));
