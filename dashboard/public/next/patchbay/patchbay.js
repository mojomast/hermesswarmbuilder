import { createDashboardClient, WORKFLOW_PHASES, OPERATION_COMMANDS, PROJECT_PLAN_ACTIONS } from "../../headless-dashboard-client.js";

const $ = (id) => document.getElementById(id);
const client = createDashboardClient({ maxEvents: 1000, eventLimit: 500 });
let snapshot = client.getSnapshot();
let monitorMode = "events";
let evidenceTab = "run";
let selectedPlanId = null;
let selectedPlan = null;
let selectedAssistanceId = null;
let assistanceDetail = null;
let plannerPane = "list";
let busy = false;
let toastTimer;
let cableFrame;
let selectedObject = null;
let inspectorInvoker = null;
let commandHistory = [];
let selectedPlanRevision = null;
let inspectorResourceText = "Select a resource for redacted server output.";
let evidenceRequestRevision = 0;
let plannerInvoker = null;
let inspectorResourceRevision = 0;
let suppressPlannerFocusRestore = false;
let renderedPlannerPlanId = null;
let suppressInspectorFocusRestore = false;

function el(tag, options = {}, ...children) {
  const node = ["path", "g"].includes(tag) ? document.createElementNS("http://www.w3.org/2000/svg", tag) : document.createElement(tag);
  for (const [key, value] of Object.entries(options)) {
    if (value == null || value === false) continue;
    if (key === "class") node.setAttribute("class", value);
    else if (key === "text") node.textContent = String(value);
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key === "checked") node.checked = Boolean(value);
    else if (key === "selected") node.selected = Boolean(value);
    else if (key === "disabled") node.disabled = Boolean(value);
    else if (key === "value") node.value = value;
    else node.setAttribute(key, String(value));
  }
  for (const child of children.flat()) {
    if (child == null) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function button(text, dataset = {}, options = {}) {
  return el("button", { type: "button", text, dataset, ...options });
}

function setText(id, value) { const node = $(id); if (node) node.textContent = String(value ?? ""); }
function arr(value) { return Array.isArray(value) ? value : []; }
function lines(value) { return String(value || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean); }
function date(value) { if (!value) return "not reported"; const d = new Date(value); return Number.isNaN(d.valueOf()) ? String(value) : d.toLocaleString(); }
function age(value) { const elapsed = Date.now() - new Date(value || 0).valueOf(); if (!Number.isFinite(elapsed)) return "unknown age"; if (elapsed < 60000) return `${Math.max(0, Math.round(elapsed / 1000))}s ago`; if (elapsed < 3600000) return `${Math.round(elapsed / 60000)}m ago`; return `${Math.round(elapsed / 3600000)}h ago`; }
function json(value) { try { return JSON.stringify(value, null, 2); } catch { return String(value); } }
function statusOf(state = snapshot.state || {}) {
  const candidate = state.status === "complete" ? "completed" : state.status || state.phase || "idle";
  if (WORKFLOW_PHASES.includes(candidate)) return candidate;
  if (["implementation", "build", "running"].includes(candidate)) return "building";
  return candidate;
}
function currentObjective() {
  const pinned = arr(snapshot.queue?.items).find((item) => item.id === snapshot.control?.pinnedQueueItemId);
  return snapshot.control?.currentObjective?.text || pinned?.objective || snapshot.state?.task || snapshot.state?.currentTask || "";
}
function notify(message, error = false) {
  const toast = $("toast");
  toast.textContent = String(message);
  toast.hidden = false;
  toast.style.borderColor = error ? "var(--danger)" : "var(--amber)";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 6500);
}
function errorMessage(error) {
  const details = arr(error?.details).join("; ");
  return [error?.message || String(error), details].filter(Boolean).join(": ");
}
async function task(label, operation) {
  if (busy) return;
  busy = true;
  try {
    const result = await operation();
    notify(`${label} accepted.`);
    return result;
  } catch (error) {
    notify(`${label} failed: ${errorMessage(error)}`, true);
    return null;
  } finally {
    busy = false;
  }
}

function facts(target, entries) {
  target.replaceChildren(...entries.map(([term, value]) => el("div", {}, el("dt", { text: term }), el("dd", { text: value ?? "not reported" }))));
}

function deriveTools() {
  const tools = new Map();
  for (const event of snapshot.events) {
    const data = event.data || {};
    const isTool = String(event.type).startsWith("tool-call") || data.toolName || data.toolCallId || data.tool;
    if (!isTool) continue;
    const id = data.toolCallId || data.id || event.id;
    const previous = tools.get(id) || {};
    tools.set(id, {
      ...previous, id,
      agentId: event.agentId || data.agentId || previous.agentId || "unknown",
      name: data.toolName || data.tool || data.name || previous.name || "tool",
      action: data.action || data.command || event.message || previous.action || "",
      status: String(event.type).includes("error") ? "error" : String(event.type).includes("end") ? "done" : data.status || previous.status || "running",
      input: data.sanitizedInput ?? data.input ?? previous.input,
      output: data.sanitizedOutput ?? data.output ?? previous.output,
      updatedAt: event.ts
    });
  }
  return [...tools.values()];
}

function deriveAgents() {
  const state = snapshot.state || {};
  const source = state.agents || {};
  const raw = Array.isArray(source) ? source : Object.values(source);
  const agents = new Map(raw.map((agent) => {
    const id = agent.id || agent.label || agent.role || "agent";
    return [id, { id, label: agent.label || agent.role || id, role: agent.role || "agent", status: agent.status || "idle", task: agent.currentTask || agent.task || agent.lastMessage || "No task reported" }];
  }));
  if (!agents.has("main-orchestrator")) agents.set("main-orchestrator", { id: "main-orchestrator", label: "Main orchestrator", role: "workflow source", status: state.status || "idle", task: state.currentTask || state.task || state.lastAction || "Monitoring workflow" });
  for (const event of snapshot.events.slice(-250)) {
    const id = event.agentId || event.data?.agentId;
    if (id && id !== "system" && !agents.has(id)) agents.set(id, { id, label: id, role: "event-derived agent", status: "observed", task: event.message || event.type });
  }
  return [...agents.values()];
}

function currentBlocker() {
  const state = snapshot.state || {};
  const source = arr(state.blockers)[0] || state.block || state.blocker || state.hold || null;
  if (source && typeof source === "object") return { ...source, runId: source.runId || state.currentRunId || null };
  if (source) return { reason: String(source), runId: state.currentRunId || null };
  if (["blocked", "deblocking", "on-hold"].includes(statusOf(state))) return { reason: state.lastAction || "Blocked without a reported reason", runId: state.currentRunId || null, phase: state.phase, since: state.updatedAt };
  return null;
}

function preserveOperatorState() {
  const active = document.activeElement;
  const fields = [...document.querySelectorAll("main input,main textarea,main select")].map((node) => [node.id || `${node.form?.id || "main"}:${node.name}`, node.type === "checkbox" ? node.checked : node.multiple ? [...node.selectedOptions].map((option) => option.value) : node.value]);
  const attribute = ["inspectId", "inspectorAction", "inspectResource", "planRevision", "selectPlan"].find((name) => active?.dataset?.[name]);
  return { fields, focus: active?.id ? { id: active.id } : attribute ? { attribute, value: active.dataset[attribute], name: active.dataset.name } : null, selection: active?.selectionStart == null ? null : [active.selectionStart, active.selectionEnd] };
}

function restoreOperatorState(saved) {
  const values = new Map(saved.fields);
  for (const node of document.querySelectorAll("main input,main textarea,main select")) {
    const key = node.id || `${node.form?.id || "main"}:${node.name}`;
    if (!values.has(key) || node.id === "runSelect" || node.id === "iterationSelect") continue;
    if (node.type === "checkbox") node.checked = values.get(key);
    else if (node.multiple) { const selected = new Set(values.get(key)); for (const option of node.options) option.selected = selected.has(option.value); }
    else node.value = values.get(key);
  }
  if (!saved.focus) return;
  const node = saved.focus.id ? document.getElementById(saved.focus.id) : document.querySelector(`[data-${saved.focus.attribute.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}="${CSS.escape(saved.focus.value)}"]${saved.focus.name ? `[data-name="${CSS.escape(saved.focus.name)}"]` : ""}`);
  node?.focus({ preventScroll: true });
  if (saved.selection && node?.setSelectionRange) try { node.setSelectionRange(...saved.selection); } catch {}
}

function captureControlState(root) {
  const controls = [...root.querySelectorAll("input,textarea,select")].map((node) => {
    const key = node.id || node.name;
    const value = node.type === "checkbox" ? node.checked : node.multiple ? [...node.selectedOptions].map((option) => option.value) : node.value;
    return key ? [key, value] : null;
  }).filter(Boolean);
  const active = root.contains(document.activeElement) ? document.activeElement : null;
  const attribute = ["planRevision", "planAction", "selectPlan", "planPane", "newPlan", "newAssistance", "selectAssistance", "assistanceBack"].find((name) => active?.dataset?.[name]);
  const focus = active?.id ? { id: active.id } : active?.name ? { name: active.name } : attribute ? { attribute, value: active.dataset[attribute] } : null;
  return { controls, focus, selection: active?.selectionStart == null ? null : [active.selectionStart, active.selectionEnd] };
}

function restoreControlState(root, saved) {
  if (!saved) return;
  const values = new Map(saved.controls);
  for (const node of root.querySelectorAll("input,textarea,select")) {
    const key = node.id || node.name;
    if (!key || !values.has(key)) continue;
    if (node.type === "checkbox") node.checked = values.get(key);
    else if (node.multiple) { const selected = new Set(values.get(key)); for (const option of node.options) option.selected = selected.has(option.value); }
    else node.value = values.get(key);
  }
  if (!saved.focus) return;
  const dataName = saved.focus.attribute?.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  const node = saved.focus.id ? document.getElementById(saved.focus.id) : saved.focus.name ? root.querySelector(`[name="${CSS.escape(saved.focus.name)}"]`) : root.querySelector(`[data-${dataName}="${CSS.escape(saved.focus.value)}"]`);
  node?.focus({ preventScroll: true });
  if (saved.selection && node?.setSelectionRange) try { node.setSelectionRange(...saved.selection); } catch {}
}

function objectRecord(type, id) {
  if (type === "run") return snapshot.selectedRunId === id && snapshot.selectedRun?.run ? snapshot.selectedRun.run : snapshot.runs.find((item) => item.id === id);
  if (type === "agent") return deriveAgents().find((item) => item.id === id);
  if (type === "event") return snapshot.events.find((item) => item.id === id);
  if (type === "tool") return deriveTools().find((item) => item.id === id);
  if (type === "queue") return arr(snapshot.queue?.items).find((item) => item.id === id);
  if (type === "gate") return arr(snapshot.gates?.gates).find((item) => item.id === id);
  if (type === "iteration") return snapshot.iterationDetail?.id === id ? snapshot.iterationDetail : snapshot.iterations.find((item) => item.id === id || item.runId === id);
  if (type === "plan") return selectedPlan?.ledger?.planId === id ? selectedPlan : snapshot.plans.find((item) => item.planId === id);
  if (type === "blocker") return currentBlocker();
  if (type === "module") { const node = document.getElementById(id); return { id, title: node?.querySelector("h2")?.textContent, code: node?.querySelector(".module-code")?.textContent, purpose: node?.getAttribute("aria-labelledby") }; }
  if (type === "cable") { const [from, to] = id.split(":"); return { id, from, to, meaning: "A visual route between authoritative modules; control uses the labeled endpoints, not cable dragging." }; }
  return null;
}

function owningRunId(type, data) {
  if (type === "run") return selectedObject?.id;
  if (type === "event") return data?.runId || data?.data?.runId;
  if (type === "tool") return snapshot.events.find((event) => event.data?.toolCallId === data?.id || event.id === data?.id)?.runId;
  if (type === "agent") return data?.runId || data?.lastEvent?.runId || snapshot.state?.currentRunId;
  if (type === "iteration") return data?.runId || data?.sourceRunId;
  if (type === "blocker") return data?.runId || snapshot.state?.currentRunId;
  if (type === "gate") return arr(data?.decisions).find((item) => item.runId)?.runId || arr(data?.evidence).find((item) => item.runId)?.runId || snapshot.selectedRunId;
  if (type === "queue") return data?.runId || null;
  if (type === "plan") return arr(data?.launches).at(-1)?.runId || null;
  return null;
}

function relatedActivity(type, id, runId) {
  return snapshot.events.filter((event) => {
    if (type === "event") return event.id === id;
    if (type === "tool") return event.id === id || event.data?.toolCallId === id;
    if (type === "agent") return event.agentId === id && (!runId || event.runId === runId);
    return runId && event.runId === runId;
  }).slice(-30).reverse();
}

function section(title, ...children) { return el("section", { class: "inspector-section" }, el("h3", { text: title }), ...children); }
function inspectorAction(text, action, options = {}) { return button(text, { inspectorAction: action }, options); }

function renderInspector() {
  if (!$("inspector").open || !selectedObject) return;
  const data = objectRecord(selectedObject.type, selectedObject.id) || selectedObject.data || {};
  const runId = owningRunId(selectedObject.type, data);
  const currentRunId = snapshot.state?.currentRunId || null;
  const isCurrent = Boolean(runId && runId === currentRunId);
  const run = runId === snapshot.selectedRunId ? snapshot.selectedRun?.run : snapshot.runs.find((item) => item.id === runId);
  const iteration = snapshot.iterations.find((item) => item.runId === runId || item.id === data?.sourceIterationId);
  const blocker = selectedObject.type === "blocker" ? data : (runId && currentBlocker()?.runId === runId ? currentBlocker() : data?.block || data?.blocker || null);
  const activity = relatedActivity(selectedObject.type, selectedObject.id, runId);
  const resources = runId === snapshot.selectedRunId ? snapshot.selectedRun : { artifacts: [], logs: [] };
  const historicalSafety = run?.safety || run?.control?.safety || data?.safety || "not snapshotted in this record";
  setText("inspectorTitle", `${selectedObject.type}: ${selectedObject.label || selectedObject.id}`);
  setText("inspectorStatus", `${runId ? `Owning run ${runId}` : "No owning run reported"} / ${isCurrent ? "CURRENT" : runId ? "HISTORICAL OR TERMINAL" : "UNBOUND"} / ${activity.length} correlated events`);
  const remediation = [];
  if (blocker && isCurrent) remediation.push(inspectorAction("Ask recovery advice", "advice"), inspectorAction("Prepare current-run deblock", "deblock", { class: "hot" }));
  if (runId && !isCurrent) remediation.push(inspectorAction("Continue from evidence", "continue"), inspectorAction("Fork alternate recovery", "fork"), inspectorAction("Use as next direction", "direction"), inspectorAction("Recover through reviewed plan", "plan"));
  if (iteration && !remediation.length) remediation.push(inspectorAction("Continue iteration", "continue"), inspectorAction("Fork iteration", "fork"));
  const resourceButtons = [
    ...(runId ? [button("Document / SPEC", { inspectResource: "document", name: "spec", runId }), button("Document / DEVPLAN", { inspectResource: "document", name: "devplan", runId })] : []),
    ...arr(resources.artifacts).map((item) => button(`Artifact / ${item.name}`, { inspectResource: "artifact", name: item.name, runId })),
    ...arr(resources.logs).map((item) => button(`Log / ${item.name}`, { inspectResource: "log", name: item.name, runId }))
  ];
  $("inspectorBody").replaceChildren(
    section("Authority and ownership", factsNode([["Object", selectedObject.id], ["Type", selectedObject.type], ["Owning run", runId || "not reported"], ["Run relation", isCurrent ? "current active run" : runId ? "historical or terminal evidence" : "not run-bound"], ["Observed phase", isCurrent ? snapshot.state?.phase : run?.phase || run?.status], ["Updated", date(data?.updatedAt || data?.ts || run?.modifiedAt)]])),
    blocker ? section("Exact blocker location", el("p", { class: "anomaly", text: blocker.reason || blocker.message || blocker.error || "Reason not reported" }), factsNode([["Run", blocker.runId || runId], ["Agent / owner", blocker.agentId || blocker.owner || blocker.ownerAgentId], ["Phase", blocker.phase || run?.phase], ["Since", date(blocker.since || blocker.startedAt || blocker.createdAt)], ["Tool call", blocker.toolCallId || blocker.callId], ["Artifact", blocker.artifact || blocker.artifactPath || blocker.failureArtifact], ["Log", blocker.log || blocker.logPath], ["Reported safe action", blocker.suggestedAction || blocker.safeRecoveryAction || blocker.recoveryAction]]), el("p", { class: "safety-note", text: isCurrent ? "Advice and deblock record current-run steering. Re-check observed state after acceptance." : "Historical runs cannot be deblocked in place. Recover through continuation, fork, next direction, or a newly reviewed plan." }), el("div", { class: "button-row" }, remediation)) : remediation.length ? section("Supported remediation", el("p", { class: "safety-note", text: isCurrent ? "Use current controls and verify observed state." : "This record is not the current run; recovery creates new lineage." }), el("div", { class: "button-row" }, remediation)) : null,
    section("Requested vs observed", factsNode([["Observed workflow", `${statusOf(snapshot.state)} / ${snapshot.state?.phase || "idle"}`], ["Pause intent", snapshot.control?.pause?.requested ? `${snapshot.control.pause.mode || "checkpoint"} requested` : "none"], ["Stop intent", snapshot.control?.stop?.requested ? `${snapshot.control.stop.mode || "graceful"} requested` : "none"], ["Run-now intent", snapshot.control?.requestedRunNow ? "pending runner tick" : "none"], ["Next run intent", snapshot.control?.nextRunRequest ? `${snapshot.control.nextRunRequest.status || "pending"} / ${snapshot.control.nextRunRequest.id}` : "none"], ["Current safety rules", json(snapshot.control?.safety || {})], ["Historical safety snapshot", json(historicalSafety)]])),
    section("Owning-run activity", activity.length ? el("ol", { class: "activity-track" }, ...activity.map((event) => el("li", {}, button(`${date(event.ts)} / ${event.agentId || event.source} / ${event.type}\n${event.message}`, { inspectType: "event", inspectId: event.id })))) : el("p", { class: "module-note", text: "No correlated events retained in the client window." })),
    section("Evidence and resources", runId && runId !== snapshot.selectedRunId ? inspectorAction("Load owning-run resources", "load-run") : null, resourceButtons.length ? el("div", { class: "resource-list" }, resourceButtons) : el("p", { class: "module-note", text: runId ? "Load the owning run to enumerate all artifacts and logs." : "This object has no reported owning-run resources." }), el("pre", { id: "inspectorResource", tabindex: "0", text: inspectorResourceText })),
    section("Command lifecycle", commandHistory.length ? el("ol", { class: "command-track" }, ...commandHistory.map((item) => el("li", {}, el("b", { text: `${item.type} / ${item.status}` }), el("small", { text: `${item.commandId || "no receipt"} / target ${item.target} / ${date(item.requestedAt)}` })))) : el("p", { class: "module-note", text: "No commands issued in this Patchbay session." }), el("p", { class: "safety-note", text: "Accepted means persisted by the command API. Completion must be confirmed in observed state, events, audit records, or run evidence." })),
    section("Audit evidence", el("pre", { tabindex: "0", text: json(arr(snapshot.audit).filter((item) => !runId || item.target?.runId === runId || item.payload?.runId === runId || item.payload?.sourceRunId === runId).slice(-30).reverse()) })),
    section("Complete authoritative record", el("pre", { tabindex: "0", text: json(data) }))
  );
}

function factsNode(entries) { const node = el("dl", { class: "inspector-facts" }); facts(node, entries); return node; }

async function inspect(type, id, invoker = document.activeElement) {
  selectedObject = { type, id, label: id };
  inspectorResourceRevision += 1;
  inspectorResourceText = "Select a resource for redacted server output.";
  if (!$("inspector").open) { inspectorInvoker = invoker; $("inspector").showModal(); }
  const data = objectRecord(type, id);
  const runId = owningRunId(type, data);
  if (runId && snapshot.selectedRunId !== runId) await client.selectRun(runId).catch((error) => notify(errorMessage(error), true));
  if (type === "iteration" && snapshot.selectedIterationId !== id) await client.selectIteration(id).catch((error) => notify(errorMessage(error), true));
  if (type === "plan" && selectedPlanId !== id) await loadPlan(id).catch((error) => notify(errorMessage(error), true));
  renderInspector();
  $("inspectorTitle").focus({ preventScroll: true });
}

function closeInspector(restoreFocus = true) {
  if (!$("inspector").open) return;
  suppressInspectorFocusRestore = !restoreFocus;
  $("inspector").close();
}

function renderHeader() {
  const state = snapshot.state || {};
  const connection = snapshot.connection || {};
  const signalAt = connection.lastMessageAt || connection.lastRefreshAt;
  const pieces = [connection.status, connection.transport, signalAt ? `signal ${age(signalAt)}` : "no signal", connection.paused ? "view frozen" : null, state.currentRunId || "no run", statusOf(state), state.selectedProject?.name || state.currentProject || "no project"];
  setText("systemReadout", pieces.filter(Boolean).join(" / "));
  setText("streamToggle", connection.paused ? "Resume stream" : "Pause stream");
  setText("connectionToggle", connection.status === "disconnected" ? "Reconnect" : "Disconnect");
}

function renderWorkflow() {
  const state = snapshot.state || {};
  const current = statusOf(state);
  const currentIndex = WORKFLOW_PHASES.indexOf(current);
  setText("workflowState", current);
  $("workflowPhases").replaceChildren(...WORKFLOW_PHASES.map((phase, index) => el("span", {
    class: "phase-step", text: phase, "aria-current": phase === current ? "step" : null, "data-complete": currentIndex >= 0 && index < currentIndex ? "true" : "false",
    title: phase === current ? `Current workflow phase: ${phase}` : `Workflow phase: ${phase}`
  })));
  facts($("workflowFacts"), [
    ["Run", state.currentRunId || "none"], ["Phase", state.phase || current], ["Status", state.status || current],
    ["SPEC", state.specAdherence?.status || state.specAdherence || "not started"], ["DEVPLAN", state.devplanAdherence?.status || state.devplanAdherence || "not started"], ["Updated", date(state.updatedAt)]
  ]);
}

function renderRuns() {
  const select = $("runSelect");
  const selected = snapshot.selectedRunId || snapshot.state?.currentRunId || "";
  select.replaceChildren(...(snapshot.runs.length ? snapshot.runs.map((run) => el("option", { value: run.id, text: `${run.id} / ${run.status || "unknown"}`, selected: run.id === selected })) : [el("option", { value: "", text: "No run available" })]));
  setText("runCount", snapshot.runs.length);
  const run = snapshot.selectedRun?.run || snapshot.runs.find((item) => item.id === selected);
  setText("runSummary", run ? `${run.status || "unknown"} / ${run.selectedProject || run.project || "no project"} / started ${date(run.startedAt)}` : "Waiting for a run source.");
}

function renderAgents() {
  const agents = deriveAgents();
  const tools = deriveTools();
  setText("agentCount", `${agents.filter((agent) => !["idle", "done", "completed"].includes(agent.status)).length} active`);
  $("agentList").replaceChildren(...agents.map((agent) => {
    const activeTool = tools.filter((tool) => tool.agentId === agent.id).at(-1);
    return el("button", { class: "channel inspectable", "data-status": agent.status, dataset: { inspectType: "agent", inspectId: agent.id }, "aria-label": `Inspect agent ${agent.label}, ${agent.status}` },
      el("i", { class: "channel-signal", "aria-hidden": "true" }),
      el("div", {}, el("strong", { text: agent.label }), el("small", { text: `${agent.role} / ${agent.status}` }), el("small", { text: agent.task })),
      activeTool ? el("span", { class: "tool-pip", text: `${activeTool.name}: ${activeTool.status}` }) : el("span", { class: "tool-pip", text: "no tool" })
    );
  }));
}

function renderMonitor() {
  const query = $("eventFilter").value.trim().toLowerCase();
  const tools = deriveTools();
  const source = monitorMode === "tools" ? tools : snapshot.events.slice().reverse();
  const filtered = source.filter((item) => !query || json(item).toLowerCase().includes(query)).slice(0, 120);
  setText("eventCount", monitorMode === "tools" ? `${tools.length} tools` : `${snapshot.events.length} events`);
  document.querySelectorAll("[data-monitor]").forEach((node) => node.setAttribute("aria-pressed", String(node.dataset.monitor === monitorMode)));
  $("eventList").replaceChildren(...(filtered.length ? filtered.map((item) => {
    if (monitorMode === "tools") return el("button", { class: "scope-row inspectable", dataset: { inspectType: "tool", inspectId: item.id } }, el("time", { text: item.status }), el("span", { text: `${item.agentId} / ${item.name} / ${item.action}` }));
    return el("button", { class: "scope-row inspectable", dataset: { inspectType: "event", inspectId: item.id } }, el("time", { text: new Date(item.ts).toLocaleTimeString() }), el("span", { text: `${item.level} / ${item.source} / ${item.type}: ${item.message}` }));
  }) : [el("p", { class: "module-note", text: `No ${monitorMode} match the monitor.` })]));
}

function entry(title, subtitle, actions = [], body = "") {
  return el("article", { class: "list-entry" },
    el("div", { class: "list-entry-head" }, el("strong", { text: title }), el("small", { text: subtitle })),
    body ? el("p", { text: body }) : null,
    actions.length ? el("div", { class: "button-row" }, actions) : null
  );
}

function inspectEntry(type, id, title, subtitle, actions = [], body = "") {
  const item = entry(title, subtitle, actions, body);
  item.querySelector(".list-entry-head").replaceWith(button(`${title}\n${subtitle}`, { inspectType: type, inspectId: id }, { class: "list-entry-head inspectable" }));
  return item;
}

function renderControl() {
  const control = snapshot.control || {};
  setText("admissionState", control.runAdmission || "enabled");
  facts($("controlFacts"), [["Observed", `${statusOf(snapshot.state)} / ${snapshot.state?.phase || "idle"}`], ["Pause request", control.pause?.requested ? `${control.pause.mode || "checkpoint"} pending` : "none"], ["Stop request", control.stop?.requested ? `${control.stop.mode || "graceful"} pending` : "none"], ["Run now", control.requestedRunNow ? "requested" : "clear"]]);
  const active = arr(control.activeSteering);
  $("steeringList").replaceChildren(...(active.length ? active.map((steering) => entry(
    steering.text || "Empty directive", `${steering.scope || "next_run"} / ${steering.priority || "required"}`,
    [button("Remove steering", { removeSteering: steering.id })]
  )) : [el("p", { class: "module-note", text: `No steering patched. Current objective: ${currentObjective() || "none"}` })]));
}

function renderDeblock() {
  const state = snapshot.state || {};
  const blocker = state.block || state.blocker || state.hold || (snapshot.control?.pause?.requested ? snapshot.control.pause : null);
  setText("blockState", blocker ? state.status || "blocked" : "clear");
  setText("blockerReadout", blocker ? blocker.reason || blocker.message || json(blocker) : "No blocker reported.");
  const advice = arr(snapshot.control?.deblockAdvice).filter((item) => item.status === "pending");
  $("adviceReadout").replaceChildren(...(advice.length ? advice.map((item) => entry(
    "Advice awaiting decision", `${item.id} / requested ${date(item.requestedAt)}`,
    [button("Approve advice", { advice: item.id, decision: "approve" }, { class: "hot" }), button("Deny advice", { advice: item.id, decision: "deny" })], item.answer
  )) : [el("p", { class: "module-note", text: `${arr(snapshot.control?.deblockRequests).filter((item) => item.status === "pending").length} pending recovery prompts.` })]));
}

function renderQueue() {
  const items = arr(snapshot.queue?.items);
  setText("queueCount", items.filter((item) => item.status !== "archived").length);
  $("queueList").replaceChildren(...(items.length ? items.map((item) => inspectEntry("queue", item.id,
    item.title || "Untitled project", `${item.status || "queued"} / priority ${item.priority || 50}`,
    [button("Pin", { queueAction: "pin", id: item.id }), button("Use as next direction", { queueAction: "use", id: item.id }, { class: "hot" }), button("Archive", { queueAction: "archive", id: item.id })],
    item.objective || "No objective supplied"
  )) : [el("p", { class: "module-note", text: "Queue has no direction items." })]));
}

function renderShowcase() {
  const auto = snapshot.control?.autoIteration || {};
  setText("loopState", auto.enabled ? (snapshot.control?.pause?.requested ? "paused" : "running") : "manual");
  facts($("iterationFacts"), [["Generation", `${auto.completedGenerations || 0} / ${auto.targetGenerations || 10}`], ["Current", auto.currentGeneration || 0], ["Mode", auto.mode || "manual"], ["Variants", auto.maxVariantsPerIteration || 3]]);
  if (!$("iterationObjective").matches(":focus") && !$("iterationObjective").value) $("iterationObjective").value = currentObjective();
  if (!$("repoPath").matches(":focus") && auto.repoPath) $("repoPath").value = auto.repoPath;
  if (!$("showcaseTarget").matches(":focus")) $("showcaseTarget").value = auto.targetGenerations || $("showcaseTarget").value || 10;
  const select = $("iterationSelect");
  select.replaceChildren(...(snapshot.iterations.length ? snapshot.iterations.map((item) => el("option", { value: item.id, text: `${item.generation ? `G${item.generation}` : item.id} / ${item.status || "unknown"} / ${item.objective || "no objective"}`, selected: item.id === snapshot.selectedIterationId })) : [el("option", { value: "", text: "No iteration available" })]));
}

function gateActions(gate) {
  const artifacts = arr(snapshot.selectedRun?.artifacts);
  const evidence = el("select", { id: `gateEvidence-${gate.id}`, name: `gate-evidence-${gate.id}`, multiple: "", size: Math.min(Math.max(artifacts.length, 2), 5), "aria-label": `Authoritative artifacts for gate ${gate.id}` }, ...artifacts.map((file) => el("option", { value: file.name, text: file.name })));
  return [
    evidence,
    button("Pass with selected evidence", { gateAction: "passed", id: gate.id }, { class: "hot", disabled: !artifacts.length }),
    button("Record needs evidence", { gateAction: "needs", id: gate.id }),
    button("Attach selected evidence", { gateAction: "evidence", id: gate.id }, { disabled: !artifacts.length }),
    button("Reset pending", { gateAction: "reset", id: gate.id })
  ];
}
function renderGates() {
  const gates = arr(snapshot.gates?.gates);
  setText("gateCount", gates.length);
  $("gateList").replaceChildren(...(gates.length ? gates.map((gate) => inspectEntry("gate", gate.id,
    gate.description || gate.title || gate.id, `${gate.id} / ${gate.severity || "must"} / ${gate.status || "pending"}`,
    gateActions(gate), `Required evidence: ${arr(gate.requiredEvidence).join(", ") || "none specified"}`
  )) : [el("p", { class: "module-note", text: "No acceptance gates patched." })]));
}

function evidenceRequestCurrent(revision, tab, runId) {
  return revision === evidenceRequestRevision && tab === evidenceTab && runId === snapshot.selectedRunId;
}

function selectEvidenceTab(tab) {
  evidenceTab = tab;
  setText("evidenceState", tab);
  document.querySelectorAll("[data-evidence-tab]").forEach((node) => {
    if (node.getAttribute("role") !== "tab") return;
    const selected = node.dataset.evidenceTab === tab;
    node.setAttribute("aria-selected", String(selected));
    node.tabIndex = selected ? 0 : -1;
    if (selected) $("evidencePanel").setAttribute("aria-labelledby", node.id);
  });
}

function renderEvidenceSync(tab) {
  const resources = $("resourceList");
  const output = $("evidenceOutput");
  resources.replaceChildren();
  if (tab === "run") output.textContent = json(snapshot.selectedRun?.run || snapshot.state || { message: "No run selected" });
  else if (tab === "iteration") output.textContent = json(snapshot.iterationDetail || snapshot.iterations.find((item) => item.id === snapshot.selectedIterationId) || { message: "No iteration selected" });
  else if (tab === "audit") output.textContent = json(snapshot.audit);
  else if (tab === "artifacts" || tab === "logs") {
    const files = tab === "artifacts" ? arr(snapshot.selectedRun?.artifacts) : arr(snapshot.selectedRun?.logs);
    resources.replaceChildren(...files.map((file) => button(`${file.name}${file.size != null ? ` / ${file.size} B` : ""}`, { resource: tab, name: file.name, runId: snapshot.selectedRunId || "" })));
    output.textContent = files.length ? `Select a ${tab === "artifacts" ? "stored artifact" : "log tail"} above.` : `No ${tab} are available for this run.`;
  }
}

async function showEvidence(tab = evidenceTab) {
  const revision = ++evidenceRequestRevision;
  const runId = snapshot.selectedRunId;
  selectEvidenceTab(tab);
  if (tab !== "spec" && tab !== "devplan") { renderEvidenceSync(tab); return; }
  $("resourceList").replaceChildren();
  $("evidenceOutput").textContent = runId ? `Loading ${tab.toUpperCase()} document...` : `No run selected for ${tab.toUpperCase()}.`;
  if (!runId) return;
  try {
    const document = await client.loadDocument(tab, runId);
    if (evidenceRequestCurrent(revision, tab, runId)) $("evidenceOutput").textContent = document.text;
  } catch (error) {
    if (evidenceRequestCurrent(revision, tab, runId)) $("evidenceOutput").textContent = `${tab.toUpperCase()} unavailable: ${errorMessage(error)}`;
  }
}

function renderEvidence() {
  selectEvidenceTab(evidenceTab);
  if (!["spec", "devplan"].includes(evidenceTab)) renderEvidenceSync(evidenceTab);
}

function renderAll() {
  const preserved = preserveOperatorState();
  renderHeader(); renderWorkflow(); renderRuns(); renderAgents(); renderMonitor(); renderControl(); renderDeblock(); renderQueue(); renderShowcase(); renderGates(); renderEvidence(); renderInspector();
  restoreOperatorState(preserved);
  requestCables();
}

function requestCables() { cancelAnimationFrame(cableFrame); cableFrame = requestAnimationFrame(drawCables); }
function drawCables() {
  const svg = $("cableLayer");
  if (document.body.classList.contains("linear") || innerWidth <= 680) { svg.replaceChildren(); return; }
  const fieldRect = $("patchField").getBoundingClientRect();
  svg.setAttribute("viewBox", `0 0 ${fieldRect.width} ${fieldRect.height}`);
  const routes = [
    ["workflow-out", "agent-in", "signal"], ["agent-out", "event-in", "signal"], ["control-out", "queue-in", "control"],
    ["control-out", "deblock-in", "control"], ["queue-out", "showcase-in", "control"], ["showcase-out", "gate-in", "control"],
    ["run-out", "evidence-in", "evidence"], ["gate-out", "evidence-in", "evidence"]
  ];
  svg.replaceChildren(...routes.map(([from, to, type]) => {
    const a = document.querySelector(`[data-port="${from}"]`)?.getBoundingClientRect();
    const b = document.querySelector(`[data-port="${to}"]`)?.getBoundingClientRect();
    if (!a || !b) return null;
    const x1 = a.left + a.width / 2 - fieldRect.left, y1 = a.top + a.height / 2 - fieldRect.top;
    const x2 = b.left + b.width / 2 - fieldRect.left, y2 = b.top + b.height / 2 - fieldRect.top;
    const bend = Math.max(42, Math.abs(x2 - x1) * .46);
    const d = `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
    return el("g", { class: "cable-route", dataset: { inspectType: "cable", inspectId: `${from}:${to}` }, tabindex: "0", role: "button", "aria-label": `Inspect ${type} cable from ${from} to ${to}` }, el("path", { class: "cable-hit", d, "aria-hidden": "true" }), el("path", { class: `cable ${type}`, d, "aria-hidden": "true" }));
  }).filter(Boolean));
}

function iterationPayload() {
  const selected = snapshot.iterations.find((item) => item.id === snapshot.selectedIterationId) || {};
  return {
    sourceRunId: selected.runId || snapshot.selectedRunId || null,
    sourceIterationId: selected.id || null,
    repoPath: $("repoPath").value.trim(), baseRef: selected.commit || "HEAD",
    objective: $("iterationObjective").value.trim() || currentObjective(), changeText: $("changeText").value.trim(),
    acceptanceGateIds: arr(snapshot.gates?.gates).map((gate) => gate.id),
    limits: { maxIterations: Number($("showcaseTarget").value), maxVariantsPerIteration: 3, maxParallelVariants: 3, maxAcceptedFeatures: 4, maxVisualMotifChanges: 1, maxNewSections: 1, stopAfterNoImprovement: 1, minImprovementScore: .05 }
  };
}

async function exactLineagePayload() {
  const summary = snapshot.iterations.find((item) => item.id === snapshot.selectedIterationId || item.runId === snapshot.selectedIterationId);
  if (!summary) throw new Error("Select a source iteration before creating lineage.");
  const requestedIterationId = summary.id;
  const detail = await client.loadIterationDetail(summary.id);
  if (snapshot.selectedIterationId !== requestedIterationId) throw new Error("The selected source iteration changed while its exact detail was loading; review the new selection before retrying.");
  const state = detail?.iterationState || {};
  const snapshottedAcceptanceGates = arr(state.acceptanceGates).length ? arr(state.acceptanceGates) : arr(detail?.snapshottedAcceptanceGates);
  const acceptanceGateIds = arr(state.acceptanceGateIds).length ? arr(state.acceptanceGateIds) : snapshottedAcceptanceGates.length ? snapshottedAcceptanceGates.map((gate) => gate.id).filter(Boolean) : arr(detail?.acceptanceGateIds);
  const limits = state.limits || detail?.limits;
  const repoPath = state.repoPath || detail?.repoPath || detail?.run?.repoPath;
  const baseRef = state.baseRef || detail?.baseRef || detail?.commit || detail?.run?.commit;
  if (!detail?.runId || !detail?.id || !repoPath || !baseRef || !limits) throw new Error("The exact source iteration is missing run, iteration, repository, base, or limits authority; lineage was not queued.");
  return {
    sourceRunId: detail.runId,
    sourceIterationId: detail.id,
    repoPath,
    baseRef,
    objective: $("iterationObjective").value.trim() || detail.objective,
    changeText: $("changeText").value.trim(),
    acceptanceGateIds,
    snapshottedAcceptanceGates,
    limits
  };
}

async function runCommand(type, payload = {}) {
  const runId = payload.runId || snapshot.state?.currentRunId;
  if (["deblock", "deblock-advice"].includes(type) && (!runId || runId !== snapshot.state?.currentRunId || !currentBlocker())) { notify("Recovery commands require the currently active blocked run. Use continuation, fork, or plan recovery for historical work.", true); return null; }
  const confirmation = commandConfirmation(type, payload);
  if (confirmation && !confirm(confirmation)) return null;
  const receipt = { type, target: payload.gateId || payload.id || payload.sourceIterationId || runId || "control", status: "sending", requestedAt: new Date().toISOString() };
  commandHistory.unshift(receipt); commandHistory = commandHistory.slice(0, 30); renderInspector();
  try {
    const result = await client.command(type, payload, { actor: "patchbay-operator", correlationId: crypto.randomUUID?.() || `patchbay-${Date.now()}`, refresh: true });
    Object.assign(receipt, { status: "accepted-intent", commandId: result.commandId, result, completedAt: new Date().toISOString() });
    notify(`${type} accepted as intent${result.commandId ? ` / ${result.commandId}` : ""}. Confirm observed state.`);
    return result;
  } catch (error) {
    Object.assign(receipt, { status: error?.status == null ? "outcome-unknown" : "rejected", error: errorMessage(error), completedAt: new Date().toISOString() });
    notify(`${type} ${receipt.status}: ${errorMessage(error)}`, true);
    return null;
  } finally { renderInspector(); }
}

function commandConfirmation(type, payload) {
  const runId = payload.runId || payload.sourceRunId || snapshot.state?.currentRunId || "no current run";
  const iterationId = payload.sourceIterationId || "no source iteration";
  const repo = payload.repoPath || "repository not reported";
  const base = payload.baseRef || "base not reported";
  const objective = String(payload.objective || currentObjective() || "objective not reported").slice(0, 180);
  const advice = arr(snapshot.control?.deblockAdvice).find((item) => item.id === payload.adviceId);
  if (type === "run-now") return `Request runner execution now for current run ${snapshot.state?.currentRunId || "none"}?`;
  if (type === "start-next-iteration") return `Start the next iteration for ${payload.queueItemId ? `queue item ${payload.queueItemId}` : `run ${runId}`}, source iteration ${payload.sourceIterationId || "none"}, repository ${repo}, base ${base}, objective "${objective}"?`;
  if (type === "start-showcase-loop") return `Start ${payload.targetGenerations || payload.limits?.maxIterations || "the configured"} showcase generations in ${repo} for objective "${objective}"?`;
  if (type === "continue-from-iteration") return `Queue a continuation from run ${runId}, iteration ${iterationId}, repository ${repo}, exact base ${base}?`;
  if (type === "fork-from-iteration") return `Queue a fork from run ${runId}, iteration ${iterationId}, repository ${repo}, exact base ${base}?`;
  if (type === "use-as-next-direction") return `Use run ${runId}, iteration ${iterationId} as the next direction in ${repo} from exact base ${base}?`;
  if (type === "deblock") return `Queue direct deblock steering for current run ${payload.runId || "none"} using prompt "${String(payload.prompt || payload.text || "").slice(0, 180)}"?`;
  if (type === "deblock-advice") return `Request recovery advice for current run ${payload.runId || "none"} and blocker "${String(currentBlocker()?.reason || "not reported").slice(0, 180)}"? Advice will require a separate approval decision.`;
  if (type === "approve-deblock-advice") return `Approve recovery advice ${payload.adviceId || "unknown"} for run ${advice?.runId || runId} and queue its continuation?`;
  if (type === "deny-deblock-advice") return `Deny recovery advice ${payload.adviceId || "unknown"} for run ${advice?.runId || runId}? No continuation will be queued.`;
  if (type === "resume") return `Resume current run ${snapshot.state?.currentRunId || "none"} and clear persisted pause/stop intent?`;
  if (type === "unhold") return `Re-enable run admission and clear hold intent for current run ${snapshot.state?.currentRunId || "none"}?`;
  if (type === "resume-showcase-loop") return `Resume showcase execution at generation ${snapshot.control?.autoIteration?.currentGeneration || "unknown"} of ${snapshot.control?.autoIteration?.targetGenerations || "unknown"}?`;
  if (type === "stop") return `Request a graceful stop for current run ${snapshot.state?.currentRunId || "none"} at its next safe checkpoint?`;
  if (type === "stop-showcase-loop") return `Stop the showcase loop for ${snapshot.control?.autoIteration?.repoPath || "the configured repository"} and clear its pending iteration request?`;
  if (type === "clear-queue") return `Clear all ${arr(snapshot.queue?.items).length} queue items and queue-linked steering?`;
  if (type === "archive-queue-item") return `Archive queue item ${payload.id || payload.itemId || "unknown"}?`;
  if (type === "gate-decision") return `Record gate ${payload.gateId || payload.id || "unknown"} as ${payload.status || "updated"} for run ${payload.runId || "none"} with ${arr(payload.evidenceArtifacts).length} explicitly selected evidence artifact(s)?`;
  if (type === "attach-gate-evidence") return `Attach ${arr(payload.artifacts || payload.evidenceArtifacts).length} explicitly selected artifact(s) to gate ${payload.gateId || payload.id || "unknown"} for run ${payload.runId || "none"}?`;
  return "";
}

const planDefaults = (pipelineType) => ({
  pipelineType, title: "", problem: "", intendedUsers: "", objective: "", boundedScope: "", requirements: [], nonGoals: [], constraints: [], risks: [],
  repository: { path: null, baseRef: null, baseCommit: null }, acceptanceGates: [],
  validationPolicy: { id: "apb.runner-selected.v1", expectations: [], clientCommandsAllowed: false }, milestones: [],
  limits: { maxIterations: 1, maxVariantsPerIteration: 3, maxParallelVariants: 3, maxAcceptedFeatures: 4, maxVisualMotifChanges: 1, maxNewSections: 1, stopAfterNoImprovement: 1 },
  lineage: { mode: "new", sourcePlanId: null, sourceRevision: null, sourceRunId: null, sourceIterationId: null }
});

function planField(name, label, value, options = {}) {
  const control = options.textarea ? el("textarea", { name, text: value || "", required: options.required || null }) : options.select ? el("select", { name }, ...options.select.map((item) => el("option", { value: item, text: item, selected: item === value }))) : el("input", { name, type: options.type || "text", value: value ?? "", min: options.min, max: options.max, required: options.required || null });
  return el("label", { class: options.wide ? "wide" : "" }, label, control, options.help ? el("small", { text: options.help }) : null);
}
function gateText(gates) { return arr(gates).map((gate) => `${gate.id} | ${gate.description} | ${gate.severity} | ${arr(gate.requiredEvidence).join(", ")}`).join("\n"); }
function parsePlanGates(value) { return lines(value).map((line, index) => { const [id, description, severity = "must", evidence = ""] = line.split("|").map((x) => x.trim()); const requiredEvidence = evidence.split(",").map((x) => x.trim()).filter(Boolean); return { id: id || `gate-${index + 1}`, description, severity, required: Boolean(requiredEvidence.length), requiredEvidence }; }); }

function contentFromPlanForm(form, old) {
  const data = new FormData(form);
  const pipelineType = String(data.get("pipelineType"));
  return {
    ...old, pipelineType, title: String(data.get("title") || ""), problem: String(data.get("problem") || ""), intendedUsers: String(data.get("intendedUsers") || ""), objective: String(data.get("objective") || ""), boundedScope: String(data.get("boundedScope") || ""),
    requirements: lines(data.get("requirements")), nonGoals: lines(data.get("nonGoals")), constraints: lines(data.get("constraints")), risks: lines(data.get("risks")), milestones: lines(data.get("milestones")),
    repository: pipelineType === "managed" ? { path: String(data.get("repositoryPath") || "") || null, baseRef: String(data.get("baseRef") || "") || null, baseCommit: null } : { path: null, baseRef: null, baseCommit: null },
    acceptanceGates: parsePlanGates(data.get("acceptanceGates")), validationPolicy: { id: "apb.runner-selected.v1", expectations: lines(data.get("validationExpectations")), clientCommandsAllowed: false },
    limits: { maxIterations: Number(data.get("maxIterations")), maxVariantsPerIteration: Number(data.get("maxVariantsPerIteration")), maxParallelVariants: Number(data.get("maxParallelVariants")), maxAcceptedFeatures: Number(data.get("maxAcceptedFeatures")), maxVisualMotifChanges: Number(data.get("maxVisualMotifChanges")), maxNewSections: Number(data.get("maxNewSections")), stopAfterNoImprovement: Number(data.get("stopAfterNoImprovement")) }
  };
}

function renderPlanList() {
  const list = $("planList");
  list.replaceChildren(...(snapshot.plans.length ? snapshot.plans.map((plan) => button(`${plan.title || "Untitled plan"}\n${plan.pipelineType} / ${plan.state} / revision ${plan.currentRevision}`, { selectPlan: plan.planId }, { class: "plan-row", "aria-current": plan.planId === selectedPlanId ? "true" : "false" })) : [el("p", { class: "empty-state", text: "No persisted plans." })]));
}

function renderPlanEditor() {
  const host = $("planEditor");
  if (!selectedPlan) { host.replaceChildren(el("p", { class: "empty-state", text: "Create or select a plan." })); return; }
  const content = selectedPlan.revision.content;
  const limits = content.limits || {};
  const form = el("form", { id: "projectPlanForm", class: "plan-form" },
    planField("pipelineType", "Pipeline", content.pipelineType, { select: ["classic", "managed"] }), planField("title", "Title", content.title, { required: true }),
    planField("problem", "Problem", content.problem, { textarea: true, wide: true, required: true }), planField("intendedUsers", "Intended users", content.intendedUsers, { textarea: true }), planField("objective", "Measurable objective", content.objective, { textarea: true }),
    planField("boundedScope", "Bounded scope", content.boundedScope, { textarea: true, wide: true }), planField("requirements", "Requirements", arr(content.requirements).join("\n"), { textarea: true, help: "One per line" }), planField("nonGoals", "Non-goals", arr(content.nonGoals).join("\n"), { textarea: true }),
    planField("constraints", "Constraints", arr(content.constraints).join("\n"), { textarea: true }), planField("risks", "Risks", arr(content.risks).join("\n"), { textarea: true }), planField("repositoryPath", "Repository path", content.repository?.path || ""), planField("baseRef", "Base ref", content.repository?.baseRef || ""),
    planField("acceptanceGates", "Acceptance gates", gateText(content.acceptanceGates), { textarea: true, wide: true, help: "id | description | must/should | artifact paths" }), planField("validationExpectations", "Validation expectations", arr(content.validationPolicy?.expectations).join("\n"), { textarea: true }), planField("milestones", "Milestones", arr(content.milestones).join("\n"), { textarea: true }),
    ...["maxIterations", "maxVariantsPerIteration", "maxParallelVariants", "maxAcceptedFeatures", "maxVisualMotifChanges", "maxNewSections", "stopAfterNoImprovement"].map((name) => planField(name, name.replace(/([A-Z])/g, " $1"), limits[name] ?? 1, { type: "number", min: 0, max: 20 })),
    el("div", { class: "plan-actions" }, button("Save new revision", { planAction: "update" }, { class: "hot" }), button("Submit for review", { planAction: "ready" }))
  );
  host.replaceChildren(form);
}

function reviewSummary(content) {
  return [`TITLE\n${content.title}`, `PROBLEM\n${content.problem}`, `USERS\n${content.intendedUsers}`, `OBJECTIVE\n${content.objective}`, `BOUNDED SCOPE\n${content.boundedScope}`, `REQUIREMENTS\n${arr(content.requirements).map((x) => `- ${x}`).join("\n")}`, `NON-GOALS\n${arr(content.nonGoals).map((x) => `- ${x}`).join("\n")}`, `CONSTRAINTS\n${arr(content.constraints).map((x) => `- ${x}`).join("\n")}`, `RISKS\n${arr(content.risks).map((x) => `- ${x}`).join("\n")}`, `GATES\n${gateText(content.acceptanceGates)}`, `MILESTONES\n${arr(content.milestones).join("\n")}`, `LIMITS\n${json(content.limits)}`].join("\n\n");
}

function renderPlanReview() {
  const host = $("planReview");
  if (!selectedPlan) { host.replaceChildren(el("p", { class: "empty-state", text: "Select a saved revision." })); return; }
  const ledger = selectedPlan.ledger, revision = selectedPlan.revision;
  const notes = el("textarea", { id: "planDecisionNotes", placeholder: "Approval or rejection notes" });
  const launchConfirm = el("input", { id: "planLaunchConfirm", type: "checkbox" });
  host.replaceChildren(
    el("article", { class: "review-block" }, el("h3", { text: "Immutable saved revision" }), el("dl", {}, el("dt", { text: "State" }), el("dd", { text: ledger.state }), el("dt", { text: "Revision" }), el("dd", { text: revision.revision }), el("dt", { text: "Digest" }), el("dd", { text: revision.contentDigest }), el("dt", { text: "Plan ID" }), el("dd", { text: ledger.planId })), el("pre", { text: reviewSummary(revision.content) })),
    el("article", { class: "review-block" }, el("h3", { text: "Explicit lifecycle actions" }), el("label", {}, "Decision notes", notes), el("label", { class: "check" }, launchConfirm, " Confirm approved revision and source-branch safety boundary before launch"),
      el("div", { class: "button-row" }, button("Approve exact revision", { planAction: "approve" }, { class: "hot", disabled: ledger.state !== "ready-for-review" }), button("Reject revision", { planAction: "reject" }, { disabled: !["ready-for-review", "approved"].includes(ledger.state) }), button("Launch approved plan", { planAction: "launch" }, { disabled: ledger.state !== "approved" }), button("Clone to draft", { planAction: "clone" }), button("Fork to draft", { planAction: "fork" }), button("Archive plan", { planAction: "archive" }, { class: "danger" }))
    ),
    el("article", { class: "review-block" }, el("h3", { text: "Saved revisions" }), el("div", { class: "button-row" }, ...arr(selectedPlan.revisions).map((item) => button(`Revision ${item.revision}${item.revision === revision.revision ? " / current" : ""}`, { planRevision: item.revision }))), el("pre", { id: "planRevisionPreview", text: selectedPlanRevision ? json(selectedPlanRevision) : "Select a revision to inspect its immutable content and digest." })),
    el("article", { class: "review-block" }, el("h3", { text: "Launch and decision evidence" }), el("pre", { text: json({ decisions: selectedPlan.decisions, launches: selectedPlan.launches }) }))
  );
}

function renderAssistance() {
  const host = $("planAssist");
  const items = snapshot.assistance;
  if (!assistanceDetail) {
    host.replaceChildren(el("h3", { text: "Planning assistance" }), el("p", { class: "module-note", text: "Suggestions are discussion only. They do not save, approve, launch, or execute." }), el("div", { class: "button-row" }, button("Start classic assistance", { newAssistance: "classic" }), button("Start managed assistance", { newAssistance: "managed" })),
      ...items.map((item) => button(`${item.pipelineType} conversation / ${item.messageCount || 0} messages / ${date(item.updatedAt)}`, { selectAssistance: item.id }, { class: "plan-row" })));
    return;
  }
  const transcript = el("div", { role: "log", "aria-live": "polite" }, ...arr(assistanceDetail.messages).map((message) => el("article", { class: `assist-message ${message.role}` }, el("strong", { text: message.role === "user" ? "You" : "Orchestrator" }), el("p", { text: message.content }), el("small", { text: date(message.createdAt) }))));
  const form = el("form", { id: "assistanceForm" }, planField("message", "Planning message", "", { textarea: true, required: true, wide: true }), el("div", { class: "button-row" }, el("button", { type: "submit", class: "hot", text: "Send planning message" }), assistanceDetail.proposedContent ? button("Create editable plan from proposal", { assistanceProposal: "create" }) : null, button("Back to conversations", { assistanceBack: "true" })));
  host.replaceChildren(el("h3", { text: `${assistanceDetail.pipelineType} planning conversation` }), el("p", { class: "module-note", text: "Provider disclosure: messages may be sent to the configured inference provider." }), transcript, form);
}

function renderPlanner() {
  const planId = selectedPlan?.ledger?.planId || null;
  const saved = renderedPlannerPlanId === planId ? captureControlState($("planner")) : null;
  renderPlanList(); renderPlanEditor(); renderPlanReview(); renderAssistance(); setPlannerPane(plannerPane);
  renderedPlannerPlanId = planId;
  restoreControlState($("planner"), saved);
}
function setPlannerPane(pane) {
  plannerPane = pane;
  document.querySelectorAll("[data-plan-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.planPanel === pane));
  document.querySelectorAll("[data-plan-pane]").forEach((control) => {
    const selected = control.dataset.planPane === pane;
    control.setAttribute("aria-pressed", String(selected));
    control.tabIndex = selected ? 0 : -1;
  });
}
function planError(message = "") { $("planError").hidden = !message; $("planError").textContent = message; setText("planStatus", message ? "Action failed" : "Ready"); }
async function loadPlan(id) { selectedPlanId = id; selectedPlanRevision = null; selectedPlan = await client.getProjectPlan(id); renderPlanner(); }

async function openPlanner(invoker = $("openPlanner"), refresh = true) {
  plannerInvoker = invoker;
  if (!$("planner").open) $("planner").showModal();
  if (refresh) {
    await Promise.all([client.refreshPlans(), client.listPlanAssistance()]);
    if (!selectedPlanId && client.getSnapshot().plans[0]) await loadPlan(client.getSnapshot().plans[0].planId);
    else renderPlanner();
  }
  $("closePlanner").focus();
}
async function mutatePlan(type, payload, options = {}) {
  if (!selectedPlan && type !== "project-plan.create") return;
  planError(); setText("planStatus", "Saving...");
  try {
    const result = await client.projectPlanCommand(type, payload, { expectedVersion: selectedPlan?.ledger.version, refresh: true, ...options });
    selectedPlanId = result.planId || selectedPlanId;
    await client.refreshPlans();
    await loadPlan(selectedPlanId);
    setText("planStatus", "Saved");
  } catch (error) { planError(errorMessage(error)); }
}

async function handleAction(type) {
  if (["pause", "resume", "hold", "unhold", "stop", "run-now", "clear-queue", "pause-showcase-loop", "resume-showcase-loop", "stop-showcase-loop"].includes(type)) {
    await runCommand(type, { reason: "Patchbay operator command" }); return;
  }
  if (type === "set-showcase-target") { await runCommand(type, { targetGenerations: Number($("showcaseTarget").value) }); return; }
  if (type === "start-next-iteration") { await runCommand(type, iterationPayload()); return; }
  if (type === "start-showcase-loop") { const payload = iterationPayload(); await runCommand(type, { ...payload, targetGenerations: Number($("showcaseTarget").value) }); }
}

document.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  if (form.id === "steerForm") { const data = Object.fromEntries(new FormData(form)); if (await runCommand("steer", data)) form.reset(); }
  if (form.id === "deblockForm") { const data = Object.fromEntries(new FormData(form)); if (await runCommand("deblock", { ...data, runId: snapshot.state?.currentRunId || null })) form.reset(); }
  if (form.id === "queueForm") { const data = Object.fromEntries(new FormData(form)); if (await runCommand("add-queue-item", { ...data, pin: form.elements.pin.checked, source: "patchbay" })) form.reset(); }
  if (form.id === "gateForm") { const data = Object.fromEntries(new FormData(form)); if (!data.id) delete data.id; if (await runCommand("add-gate", data)) form.reset(); }
  if (form.id === "assistanceForm" && assistanceDetail) {
    const message = String(new FormData(form).get("message") || "");
    try { assistanceDetail = await client.messagePlanAssistance(assistanceDetail.id, assistanceDetail.version, message); await client.listPlanAssistance(); renderAssistance(); } catch (error) { planError(errorMessage(error)); }
  }
});

document.addEventListener("click", async (event) => {
  const inspectTarget = event.target.closest("[data-inspect-type]");
  if (inspectTarget) { await inspect(inspectTarget.dataset.inspectType, inspectTarget.dataset.inspectId, inspectTarget); return; }
  const target = event.target.closest("button");
  if (!target) {
    const module = event.target.closest("[data-module]");
    if (module) await inspect("module", module.id, module);
    return;
  }
  if (target.dataset.inspectCurrent) { const type = target.dataset.inspectCurrent; const id = type === "run" ? snapshot.selectedRunId || snapshot.state?.currentRunId : snapshot.selectedIterationId; if (id) await inspect(type, id, target); return; }
  if (target.dataset.action) { await handleAction(target.dataset.action); return; }
  if (target.id === "setObjective") { const text = $("steerForm").elements.text.value.trim(); if (!text) return notify("Enter an objective before setting it.", true); await runCommand("set-current-objective", { text, source: "patchbay", runId: snapshot.state?.currentRunId || null }); return; }
  if (target.dataset.monitor) { monitorMode = target.dataset.monitor; renderMonitor(); return; }
  if (target.dataset.evidenceTab) { await showEvidence(target.dataset.evidenceTab); $("evidenceModule").scrollIntoView({ block: "nearest" }); return; }
  if (target.dataset.removeSteering) { await runCommand("remove-steering", { id: target.dataset.removeSteering }); return; }
  if (target.dataset.advice) { await runCommand(`${target.dataset.decision === "approve" ? "approve" : "deny"}-deblock-advice`, { adviceId: target.dataset.advice }); return; }
  if (target.id === "askAdvice") { await runCommand("deblock-advice", { prompt: $("deblockForm").elements.prompt.value, runId: snapshot.state?.currentRunId || null }); return; }
  if (target.dataset.queueAction) {
    const item = arr(snapshot.queue?.items).find((candidate) => candidate.id === target.dataset.id);
    if (target.dataset.queueAction === "pin") await runCommand("pin-queue-item", { id: item.id });
    if (target.dataset.queueAction === "archive") await runCommand("archive-queue-item", { id: item.id });
    if (target.dataset.queueAction === "use") await runCommand("start-next-iteration", { ...iterationPayload(), queueItemId: item.id, repoPath: item.target?.preferredRepo || $("repoPath").value.trim(), objective: item.objective, changeText: item.context || `Complete one bounded generation for ${item.title}.`, acceptanceGateIds: item.acceptanceGateIds || [] });
    return;
  }
  if (target.dataset.lineage) {
    if (!snapshot.selectedIterationId) return notify("Select an iteration before choosing a lineage action.", true);
    try { await runCommand(target.dataset.lineage, await exactLineagePayload()); } catch (error) { notify(errorMessage(error), true); }
    return;
  }
  if (target.dataset.gateAction) {
    const id = target.dataset.id, runId = snapshot.selectedRunId || null;
    const select = document.getElementById(`gateEvidence-${id}`);
    const evidenceArtifacts = select ? [...select.selectedOptions].map((option) => option.value) : [];
    if (!runId) return notify("Select and load an authoritative run before recording gate state.", true);
    if (target.dataset.gateAction === "passed") {
      if (!evidenceArtifacts.length) return notify("Select one or more authoritative artifacts, or record Needs evidence without evidence claims.", true);
      await runCommand("gate-decision", { gateId: id, runId, status: "passed", decision: "accepted", evidenceArtifacts });
    }
    if (target.dataset.gateAction === "needs") await runCommand("gate-decision", { gateId: id, runId, status: "needs-evidence", decision: "defer", evidenceArtifacts: [] });
    if (target.dataset.gateAction === "evidence") {
      if (!evidenceArtifacts.length) return notify("Select one or more authoritative artifacts before attaching evidence.", true);
      await runCommand("attach-gate-evidence", { gateId: id, runId, artifacts: evidenceArtifacts, notes: "Explicitly selected from the loaded run artifact inventory in Patchbay." });
    }
    if (target.dataset.gateAction === "reset") await runCommand("update-gate", { gateId: id, status: "pending" });
    return;
  }
  if (target.dataset.resource) {
    const revision = ++evidenceRequestRevision, tab = target.dataset.resource, runId = target.dataset.runId || snapshot.selectedRunId;
    $("evidenceOutput").textContent = `Loading ${target.dataset.name}...`;
    try {
      const result = tab === "artifacts" ? await client.loadArtifact(target.dataset.name, runId) : await client.loadLog(target.dataset.name, runId);
      if (evidenceRequestCurrent(revision, tab, runId)) $("evidenceOutput").textContent = result.text;
    } catch (error) { if (evidenceRequestCurrent(revision, tab, runId)) $("evidenceOutput").textContent = errorMessage(error); }
    return;
  }
  if (target.dataset.planPane) { setPlannerPane(target.dataset.planPane); return; }
  if (target.dataset.newPlan) { const result = await client.createProjectPlan({ content: planDefaults(target.dataset.newPlan) }, { refresh: true }); await loadPlan(result.planId); setPlannerPane("edit"); return; }
  if (target.dataset.selectPlan) { await loadPlan(target.dataset.selectPlan); setPlannerPane("edit"); suppressPlannerFocusRestore = true; $("planner").close(); await inspect("plan", target.dataset.selectPlan, $("openPlanner")); return; }
  if (target.dataset.planRevision) { try { const saved = captureControlState($("planner")); selectedPlanRevision = await client.getProjectPlanRevision(selectedPlanId, Number(target.dataset.planRevision)); renderPlanReview(); restoreControlState($("planner"), saved); } catch (error) { planError(errorMessage(error)); } return; }
  if (target.dataset.planAction) { await planLifecycle(target.dataset.planAction); return; }
  if (target.dataset.newAssistance) { assistanceDetail = await client.createPlanAssistance(target.dataset.newAssistance); selectedAssistanceId = assistanceDetail.id; await client.listPlanAssistance(); renderAssistance(); return; }
  if (target.dataset.selectAssistance) { selectedAssistanceId = target.dataset.selectAssistance; assistanceDetail = await client.getPlanAssistance(selectedAssistanceId); renderAssistance(); return; }
  if (target.dataset.assistanceBack) { assistanceDetail = null; selectedAssistanceId = null; renderAssistance(); return; }
  if (target.dataset.assistanceProposal && assistanceDetail?.proposedContent) { const result = await client.createProjectPlan({ content: assistanceDetail.proposedContent }, { refresh: true }); await loadPlan(result.planId); setPlannerPane("edit"); }
});

document.addEventListener("click", async (event) => {
  const action = event.target.closest("[data-inspector-action]")?.dataset.inspectorAction;
  if (!action || !selectedObject) return;
  const data = objectRecord(selectedObject.type, selectedObject.id) || {};
  const runId = owningRunId(selectedObject.type, data);
  const iteration = snapshot.iterations.find((item) => item.runId === runId || item.id === data.sourceIterationId);
  if (action === "load-run" && runId) { await client.selectRun(runId); renderInspector(); return; }
  if (["continue", "fork", "direction"].includes(action)) {
    if (!iteration) return notify("No iteration lineage is recorded for this run. Use reviewed plan recovery.", true);
    await client.selectIteration(iteration.id);
    const detail = client.getSnapshot().iterationDetail || iteration;
    $("repoPath").value = detail.repoPath || detail.run?.repoPath || "";
    $("iterationObjective").value = detail.objective || currentObjective();
    $("changeText").value = currentBlocker()?.suggestedAction || detail.nextRecommendedDirection || "Apply one bounded evidence-backed recovery without unrelated changes.";
    $("iterationSelect").value = iteration.id;
    closeInspector(false);
    $("showcaseModule").scrollIntoView({ block: "start" }); $("changeText").focus();
    notify(`${action} recovery prepared. Review repository, objective, bounded change, gates, and limits before submitting.`);
    return;
  }
  if (action === "advice" || action === "deblock") {
    const blocker = currentBlocker();
    $("deblockForm").elements.prompt.value = action === "advice" ? `Recommend the smallest safe recovery for: ${blocker?.reason || "the active blocker"}` : blocker?.suggestedAction || `Safely recover from: ${blocker?.reason || "the active blocker"}`;
    closeInspector(false);
    $("deblockModule").scrollIntoView({ block: "center" }); $("deblockForm").elements.prompt.focus();
    return;
  }
  if (action === "plan") {
    const run = runId === snapshot.selectedRunId ? snapshot.selectedRun?.run : snapshot.runs.find((item) => item.id === runId);
    const seed = planDefaults(run?.repoPath || iteration?.repoPath ? "managed" : "classic");
    seed.title = `Recover ${runId}`; seed.problem = `Terminal or historical run ${runId} requires a new reviewed recovery path.`; seed.intendedUsers = "SwarmBuilder operators"; seed.objective = data.objective || iteration?.objective || currentObjective(); seed.boundedScope = "Define and review one bounded evidence-backed recovery before launch.";
    seed.requirements = ["Preserve and inspect source-run evidence", "Validate the bounded recovery through runner-selected checks"]; seed.nonGoals = ["Mutating the historical run in place"]; seed.constraints = ["Do not bypass project-plan review or source-branch safety"]; seed.risks = ["Source evidence or repository state may be stale"]; seed.milestones = ["Review source evidence", "Approve exact revision", "Launch bounded recovery"];
    seed.acceptanceGates = arr(snapshot.gates?.gates).map((gate) => ({ id: gate.id, description: gate.description || gate.title || gate.id, severity: gate.severity === "should" ? "should" : "must", required: arr(gate.requiredEvidence).length > 0, requiredEvidence: arr(gate.requiredEvidence) }));
    seed.lineage = { mode: "clone", sourcePlanId: null, sourceRevision: null, sourceRunId: runId, sourceIterationId: iteration?.id || null };
    if (seed.pipelineType === "managed") seed.repository = { path: run?.repoPath || iteration?.repoPath || null, baseRef: iteration?.commit || "HEAD", baseCommit: null };
    if (!confirm(`Create an editable recovery-plan draft for historical run ${runId}, source iteration ${iteration?.id || "none"}, repository ${seed.repository.path || "not bound"}, base ${seed.repository.baseRef || "not bound"}?`)) return;
    try { const result = await client.createProjectPlan({ content: seed }, { refresh: true }); await loadPlan(result.planId); closeInspector(false); setPlannerPane("edit"); await openPlanner($("openPlanner"), false); } catch (error) { notify(errorMessage(error), true); }
  }
});

document.addEventListener("click", async (event) => {
  const resource = event.target.closest("[data-inspect-resource]");
  if (!resource) return;
  const revision = ++inspectorResourceRevision, objectKey = `${selectedObject?.type}:${selectedObject?.id}`, runId = resource.dataset.runId;
  const output = $("inspectorResource"); inspectorResourceText = `Loading ${resource.dataset.name}...`; output.textContent = inspectorResourceText;
  try {
    const result = resource.dataset.inspectResource === "artifact" ? await client.loadArtifact(resource.dataset.name, runId) : resource.dataset.inspectResource === "document" ? await client.loadDocument(resource.dataset.name, runId) : await client.loadLog(resource.dataset.name, runId);
    if (revision !== inspectorResourceRevision || objectKey !== `${selectedObject?.type}:${selectedObject?.id}`) return;
    inspectorResourceText = result.text; $("inspectorResource").textContent = inspectorResourceText;
  } catch (error) {
    if (revision !== inspectorResourceRevision || objectKey !== `${selectedObject?.type}:${selectedObject?.id}`) return;
    inspectorResourceText = errorMessage(error); $("inspectorResource").textContent = inspectorResourceText;
  }
});

async function planLifecycle(action) {
  if (!selectedPlan) return;
  const ledger = selectedPlan.ledger, revision = selectedPlan.revision;
  const subject = { planId: ledger.planId, revision: ledger.currentRevision, planDigest: ledger.currentDigest };
  if (action === "update") { const form = $("projectPlanForm"); await mutatePlan("project-plan.update", { planId: ledger.planId, content: contentFromPlanForm(form, revision.content) }); }
  if (action === "ready") await mutatePlan("project-plan.ready-for-review", subject);
  if (action === "approve") { if (!confirm(`Approve exact revision ${revision.revision} with digest ${revision.contentDigest}?`)) return; await mutatePlan("project-plan.approve", { ...subject, notes: $("planDecisionNotes")?.value || "" }); }
  if (action === "reject") {
    const notes = $("planDecisionNotes")?.value.trim() || "";
    if (!notes) return planError("Rejection notes are required.");
    await mutatePlan("project-plan.reject", { ...subject, notes });
  }
  if (action === "launch") { if (!$("planLaunchConfirm")?.checked) return planError("Confirm the approved revision and source-branch safety boundary before launch."); if (!confirm(`Launch plan ${ledger.planId}, exact revision ${revision.revision}, digest ${revision.contentDigest}, pipeline ${revision.content.pipelineType}?`)) return; await mutatePlan("project-plan.launch", subject); }
  if (["clone", "fork"].includes(action)) { if (!confirm(`${action === "fork" ? "Fork" : "Clone"} plan ${ledger.planId}, revision ${revision.revision}, from run ${snapshot.selectedRunId || "none"}, iteration ${snapshot.selectedIterationId || "none"}?`)) return; await mutatePlan(`project-plan.${action}`, { ...subject, sourceRunId: snapshot.selectedRunId || null, sourceIterationId: snapshot.selectedIterationId || null, baseRef: revision.content.repository?.baseRef || null }); }
  if (action === "archive") { if (confirm("Archive this persisted plan?")) await mutatePlan("project-plan.archive", { planId: ledger.planId }); }
}

$("runSelect").addEventListener("change", async (event) => { await client.selectRun(event.target.value); await showEvidence("run"); if (event.target.value) await inspect("run", event.target.value, event.target); });
$("iterationSelect").addEventListener("change", async (event) => { await client.selectIteration(event.target.value); await showEvidence("iteration"); if (event.target.value) await inspect("iteration", event.target.value, event.target); });
$("eventFilter").addEventListener("input", renderMonitor);
$("refreshButton").addEventListener("click", () => task("Refresh", () => client.refresh()));
$("streamToggle").addEventListener("click", async () => { if (snapshot.connection.paused) await client.resume(); else client.pause(); });
$("connectionToggle").addEventListener("click", () => snapshot.connection.status === "disconnected" ? client.connect().catch((error) => notify(errorMessage(error), true)) : client.disconnect());
$("linearToggle").addEventListener("click", () => { const active = document.body.classList.toggle("linear"); $("linearToggle").setAttribute("aria-pressed", String(active)); $("linearToggle").textContent = active ? "Patch field view" : "Linear controls"; requestCables(); });
$("openInspector").addEventListener("click", (event) => { selectedObject ||= { type: "module", id: "workflowModule", label: "Workflow sequencer" }; inspectorInvoker = event.currentTarget; if (!$("inspector").open) $("inspector").showModal(); renderInspector(); $("inspectorTitle").focus(); });
$("closeInspector").addEventListener("click", () => closeInspector());
$("inspector").addEventListener("close", () => { if (suppressInspectorFocusRestore) { suppressInspectorFocusRestore = false; inspectorInvoker = null; return; } const target = inspectorInvoker?.isConnected ? inspectorInvoker : $("openInspector"); inspectorInvoker = null; target?.focus({ preventScroll: true }); });
$("helpCommands").replaceChildren(...OPERATION_COMMANDS.map((name) => el("code", { text: name })));
$("helpPlanActions").replaceChildren(...PROJECT_PLAN_ACTIONS.map((name) => el("code", { text: name })));
$("openHelp").addEventListener("click", () => { $("helpDialog").showModal(); $("helpTitle").focus(); });
$("closeHelp").addEventListener("click", () => $("helpDialog").close());
$("helpDialog").addEventListener("click", (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
$("openPlanner").addEventListener("click", (event) => openPlanner(event.currentTarget).catch((error) => notify(errorMessage(error), true)));
$("closePlanner").addEventListener("click", () => $("planner").close());
$("planner").addEventListener("close", () => { if (suppressPlannerFocusRestore) { suppressPlannerFocusRestore = false; plannerInvoker = null; return; } const target = plannerInvoker?.isConnected ? plannerInvoker : $("openPlanner"); plannerInvoker = null; target?.focus({ preventScroll: true }); });

document.addEventListener("keydown", (event) => {
  const evidenceTabControl = event.target.closest?.('[role="tab"][data-evidence-tab]');
  if (evidenceTabControl && ["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) {
    const tabs = [...document.querySelectorAll('[role="tab"][data-evidence-tab]')], index = tabs.indexOf(evidenceTabControl);
    const next = event.key === "Home" ? tabs[0] : event.key === "End" ? tabs.at(-1) : tabs[(index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
    event.preventDefault(); next.focus(); showEvidence(next.dataset.evidenceTab).catch((error) => notify(errorMessage(error), true)); return;
  }
  const plannerTabControl = event.target.closest?.("[data-plan-pane]");
  if (plannerTabControl && ["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) {
    const tabs = [...document.querySelectorAll("[data-plan-pane]")], index = tabs.indexOf(plannerTabControl);
    const next = event.key === "Home" ? tabs[0] : event.key === "End" ? tabs.at(-1) : tabs[(index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
    event.preventDefault(); setPlannerPane(next.dataset.planPane); next.focus(); return;
  }
  const cable = event.target.closest?.(".cable-route[data-inspect-type]");
  if (cable && ["Enter", " "].includes(event.key)) { event.preventDefault(); inspect("cable", cable.dataset.inspectId, cable); return; }
  const focusedModule = event.target.matches?.("[data-module]") ? event.target : null;
  if (focusedModule && ["Enter", " "].includes(event.key)) { event.preventDefault(); inspect("module", focusedModule.id, focusedModule); return; }
  if (event.key.toLowerCase() === "m" && !event.target.matches("input,textarea,select") && !$("planner").open) { event.preventDefault(); document.querySelector("[data-module]")?.focus(); return; }
  if (!event.target.closest("[data-module]") || !["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key) || event.target.matches("input,textarea,select")) return;
  const modules = [...document.querySelectorAll("[data-module]")];
  const current = event.target.closest("[data-module]");
  const delta = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1;
  event.preventDefault();
  modules[(modules.indexOf(current) + delta + modules.length) % modules.length].focus();
});

const resizeObserver = new ResizeObserver(requestCables);
document.querySelectorAll("[data-port]").forEach((port) => { port.dataset.label = port.dataset.port.replace(/-(in|out)$/, " $1"); });
document.querySelectorAll("[data-module]").forEach((module) => resizeObserver.observe(module));
window.addEventListener("resize", requestCables);
window.addEventListener("unhandledrejection", (event) => { notify(`Action failed: ${errorMessage(event.reason)}`, true); event.preventDefault(); });
client.subscribe((next) => { snapshot = next; renderAll(); if ($("planner").open && !$("planList").contains(document.activeElement)) renderPlanList(); });
client.connect().catch((error) => notify(`Initial connection failed: ${errorMessage(error)}`, true));
setInterval(renderHeader, 1000);
