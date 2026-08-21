import { createDashboardClient, WORKFLOW_PHASES } from "../../headless-dashboard-client.js";

const $ = (id) => document.getElementById(id);
const SVG_NS = "http://www.w3.org/2000/svg";
const ui = {
  target: null,
  scopeTab: "target",
  trayTab: "run",
  planTab: "plans",
  eventFilter: "all",
  query: "",
  resource: null,
  selectedPlanId: null,
  planDetail: null,
  planRevision: null,
  assistanceId: null,
  assistanceDetail: null,
  busy: false
};

const client = createDashboardClient({ pollIntervalMs: 4000, eventLimit: 400, maxEvents: 1200 });
let snapshot = client.getSnapshot();
let noticeTimer;

function node(tag, attrs = {}, children = []) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") element.className = value;
    else if (key === "text") element.textContent = value ?? "";
    else if (key.startsWith("on") && typeof value === "function") element.addEventListener(key.slice(2), value);
    else if (value !== undefined && value !== null && value !== false) element.setAttribute(key, value === true ? "" : String(value));
  }
  element.append(...(Array.isArray(children) ? children : [children]).filter(Boolean));
  return element;
}

function svgNode(tag, attrs = {}, children = []) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
  element.append(...children);
  return element;
}

function clear(element) { element.replaceChildren(); return element; }
function text(value, fallback = "-") { return value === undefined || value === null || value === "" ? fallback : String(value); }
function short(value, length = 34) { const source = text(value); return source.length > length ? `${source.slice(0, length - 3)}...` : source; }
function when(value) { if (!value) return "-"; const date = new Date(value); return Number.isNaN(date.valueOf()) ? text(value) : date.toLocaleString(); }
function items(value, key) { return Array.isArray(value) ? value : Array.isArray(value?.[key]) ? value[key] : []; }
function hash(value) { let result = 7; for (const char of String(value)) result = (result * 31 + char.charCodeAt(0)) >>> 0; return result; }
function phaseOf(value) { return value?.phase || value?.currentPhase || value?.status || "idle"; }
function phaseIndex(value) { const index = WORKFLOW_PHASES.indexOf(phaseOf(value)); return index < 0 ? 0 : index; }
function isBlocked(value) { return ["blocked", "deblocking", "on-hold"].includes(phaseOf(value)) || Boolean(value?.blocked || value?.blocker || value?.block); }
function currentRunId() { return snapshot.state?.currentRunId || snapshot.selectedRunId || null; }
function selectedRun() { return snapshot.runs.find((run) => run.id === snapshot.selectedRunId) || snapshot.selectedRun?.run; }

function notify(message, error = false) {
  const box = $("notice");
  box.textContent = text(message, "Command complete");
  box.className = `notice show${error ? " error" : ""}`;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { box.className = "notice"; }, 4500);
}

async function perform(label, action) {
  if (ui.busy) return;
  ui.busy = true;
  try {
    const result = await action();
    notify(`${label} accepted`);
    return result;
  } catch (error) {
    notify(`${label}: ${error.message || error}`, true);
    return null;
  } finally {
    ui.busy = false;
    renderCommandTray();
    renderPlanning();
  }
}

async function command(type, payload = {}) {
  return perform(type, () => client.command(type, payload, { refresh: true }));
}

function deriveAgents() {
  const raw = snapshot.state?.agents;
  const base = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.values(raw) : [];
  const map = new Map();
  for (const agent of base) {
    const id = agent.id || agent.agentId || agent.label || agent.role;
    if (id) map.set(String(id), { ...agent, id: String(id), label: agent.label || agent.role || id });
  }
  for (const event of snapshot.events) {
    const id = event.agentId || event.data?.agentId;
    if (!id || map.has(String(id))) continue;
    map.set(String(id), { id: String(id), label: String(id), role: "event-derived agent", status: "observed", currentTask: event.message, updatedAt: event.ts });
  }
  return [...map.values()];
}

function targetRecords() {
  const runs = snapshot.runs.map((run) => ({ type: "run", id: String(run.id), label: run.name || run.projectName || run.id, data: run }));
  const agents = deriveAgents().map((agent) => ({ type: "agent", id: agent.id, label: agent.label, data: agent }));
  return [...runs, ...agents];
}

function activeTarget() {
  const records = targetRecords();
  if (ui.target) {
    const match = records.find((record) => record.type === ui.target.type && record.id === ui.target.id);
    if (match) return match;
  }
  const runId = snapshot.selectedRunId || currentRunId();
  return records.find((record) => record.type === "run" && record.id === runId) || records[0] || null;
}

async function selectTarget(type, id, focusScope = false) {
  ui.target = { type, id };
  ui.resource = null;
  if (type === "run" && snapshot.selectedRunId !== id) {
    await perform("Select run", () => client.selectRun(id));
  }
  renderRadar();
  renderScope();
  if (focusScope) $("scopeTitle").focus?.();
}

function initGrid() {
  const grid = clear($("radarGrid"));
  grid.append(svgNode("circle", { cx: 500, cy: 500, r: 438, class: "grid-sector" }));
  for (const radius of [100, 185, 270, 355, 438]) grid.append(svgNode("circle", { cx: 500, cy: 500, r: radius, class: "grid-ring" }));
  for (let angle = 0; angle < 360; angle += 30) {
    const rad = angle * Math.PI / 180;
    grid.append(svgNode("line", { x1: 500 + 100 * Math.sin(rad), y1: 500 - 100 * Math.cos(rad), x2: 500 + 438 * Math.sin(rad), y2: 500 - 438 * Math.cos(rad), class: "grid-axis" }));
  }
  grid.append(svgNode("circle", { cx: 500, cy: 500, r: 7, fill: "#52e2cc" }), svgNode("circle", { cx: 500, cy: 500, r: 18, fill: "none", stroke: "#52e2cc", "stroke-width": 1 }));
}

function positionFor(record, index, total) {
  const phase = phaseIndex(record.data);
  const progress = phase / Math.max(1, WORKFLOW_PHASES.length - 1);
  const radius = 105 + progress * 320;
  const seeded = hash(`${record.type}:${record.id}`) % 360;
  const angle = (seeded + index * (total > 1 ? 11 : 0)) * Math.PI / 180;
  return { x: 500 + radius * Math.sin(angle), y: 500 - radius * Math.cos(angle), radius, angle };
}

function targetGraphic(record, index, records) {
  const position = positionFor(record, index, records.length);
  const blocked = isBlocked(record.data);
  const selected = activeTarget()?.type === record.type && activeTarget()?.id === record.id;
  const status = phaseOf(record.data);
  const group = svgNode("g", {
    class: `target ${record.type}${blocked ? " blocked" : ""}`,
    transform: `translate(${position.x.toFixed(1)} ${position.y.toFixed(1)})`,
    role: "button",
    tabindex: selected ? 0 : -1,
    "aria-label": `${record.type} ${record.label}, ${status}${blocked ? ", collision alert" : ""}`,
    "aria-pressed": selected,
    "data-target-type": record.type,
    "data-target-id": record.id
  });
  group.append(svgNode("circle", { r: 23, class: "hit" }), svgNode("circle", { r: 19, class: "focus-ring" }), svgNode("circle", { r: 27, class: "alert-ring" }));
  if (record.type === "run") group.append(svgNode("path", { d: "M 0 -10 L 10 0 L 0 10 L -10 0 Z", class: "run-symbol" }));
  else group.append(svgNode("circle", { r: 5.5, class: "agent-symbol" }), svgNode("line", { x1: 0, y1: 0, x2: 13, y2: -13, stroke: "#8ee6a8", "stroke-width": 2 }));
  const anchor = position.x > 730 ? "end" : "start";
  const labelX = position.x > 730 ? -17 : 17;
  group.append(svgNode("text", { x: labelX, y: -3, class: "target-label", "text-anchor": anchor }, [document.createTextNode(short(record.label, 22))]));
  group.append(svgNode("text", { x: labelX, y: 11, class: "target-sub", "text-anchor": anchor }, [document.createTextNode(short(status, 18))]));
  return { group, position };
}

function renderRadar() {
  const focusedTarget = document.activeElement?.closest?.("[data-target-type]");
  const focusedIdentity = focusedTarget ? `${focusedTarget.dataset.targetType}:${focusedTarget.dataset.targetId}` : null;
  const records = targetRecords();
  const selectedRun = snapshot.selectedRunId || currentRunId();
  const priority = (record) => record.type === "run" && record.id === selectedRun ? 0 : record.type === "run" && isBlocked(record.data) ? 1 : record.type === "agent" ? 2 : 3;
  const visualRecords = [...records].sort((a, b) => priority(a) - priority(b)).slice(0, 42);
  const trackLayer = clear($("radarTracks"));
  const agentLayer = clear($("radarAgents"));
  visualRecords.forEach((record, index) => {
    const { group, position } = targetGraphic(record, index, visualRecords);
    if (record.type === "run") {
      const active = record.id === currentRunId();
      trackLayer.append(svgNode("path", { d: `M 500 500 Q ${(500 + position.x) / 2 + 45} ${(500 + position.y) / 2 - 35} ${position.x} ${position.y}`, class: `track-path${active ? " active" : ""}`, "aria-hidden": true }));
      trackLayer.append(group);
    } else agentLayer.append(group);
  });
  $("radarEmpty").hidden = records.length > 0;
  $("runCount").textContent = snapshot.runs.length;
  $("agentCount").textContent = deriveAgents().length;
  $("alertCount").textContent = records.filter((record) => isBlocked(record.data)).length;
  if (focusedIdentity) {
    const replacement = [...$("radar").querySelectorAll("[data-target-type]")].find((item) => `${item.dataset.targetType}:${item.dataset.targetId}` === focusedIdentity);
    replacement?.focus();
  }
}

function factList(entries) {
  const dl = node("dl", { class: "facts" });
  for (const [label, value] of entries) dl.append(node("dt", { text: label }), node("dd", { text: text(value) }));
  return dl;
}

function section(title, children) { return node("section", { class: "scope-section" }, [node("h3", { text: title }), ...(Array.isArray(children) ? children : [children])]); }
function button(label, attrs = {}) { return node("button", { type: "button", text: label, ...attrs }); }
function field(label, control) { return node("label", { class: "field" }, [node("span", { text: label }), control]); }

function renderTargetTab(container, target) {
  if (!target) {
    container.append(node("div", { class: "empty", text: "No run or agent targets are present in the latest snapshot." }));
    return;
  }
  const data = target.data;
  container.append(section("Identification", factList([
    ["kind", target.type], ["identity", target.id], ["status", data.status], ["workflow", phaseOf(data)],
    ["updated", when(data.updatedAt || data.endedAt || data.startedAt)], ["task", data.currentTask || data.task || data.objective]
  ])));
  if (isBlocked(data)) container.append(node("div", { class: "alert-box", text: `COLLISION ALERT / ${text(data.blocker?.reason || data.block?.reason || data.reason || data.lastMessage, "Workflow is blocked or held")}` }));
  const records = targetRecords();
  const list = node("ul", { class: "target-list", "aria-label": "All radar targets" });
  for (const record of records) {
    const row = button("", { class: `target-row${isBlocked(record.data) ? " blocked" : ""}`, "data-select-type": record.type, "data-select-id": record.id });
    row.append(node("span", { "aria-hidden": true }), node("span", { text: record.label }), node("small", { text: phaseOf(record.data) }));
    list.append(node("li", {}, row));
  }
  container.append(section("Target index", list));
  if (target.type === "agent") {
    const events = snapshot.events.filter((event) => (event.agentId || event.data?.agentId) === target.id).slice(-10).reverse();
    container.append(section("Agent activity", trafficList(events)));
  }
}

function isToolEvent(event) { return Boolean(event.data?.toolName || event.raw?.toolName || String(event.type).toLowerCase().includes("tool")); }
function filteredEvents() {
  const query = ui.query.trim().toLowerCase();
  return snapshot.events.filter((event) => {
    if (ui.eventFilter === "tools" && !isToolEvent(event)) return false;
    if (ui.eventFilter === "alerts" && event.level !== "error" && !String(event.type).includes("error")) return false;
    if (!query) return true;
    return [event.type, event.message, event.source, event.agentId, event.data?.toolName].some((value) => String(value || "").toLowerCase().includes(query));
  }).slice(-80).reverse();
}

function trafficList(events) {
  const list = node("div", { class: "traffic-list", role: "log" });
  for (const event of events) {
    const row = button("", { class: `traffic-row${event.level === "error" ? " error" : ""}`, "data-event-id": event.id });
    row.append(node("time", { text: new Date(event.ts).toLocaleTimeString() }), node("span", { text: short(event.message || event.type, 58) }));
    if (isToolEvent(event)) row.append(node("span", { class: "tool-badge", text: "TOOL" }));
    list.append(row);
  }
  if (!events.length) list.append(node("div", { class: "empty", text: "No traffic matches this scope." }));
  return list;
}

function renderTrafficTab(container) {
  const search = node("input", { type: "search", value: ui.query, placeholder: "Search events, agents, tools", "aria-label": "Search traffic" });
  search.addEventListener("input", () => { ui.query = search.value; renderScope(); requestAnimationFrame(() => $("scopeContent").querySelector('input[type="search"]')?.focus()); });
  const filter = node("select", { "aria-label": "Traffic filter" });
  for (const value of ["all", "tools", "alerts"]) filter.append(node("option", { value, text: value, selected: value === ui.eventFilter }));
  filter.addEventListener("change", () => { ui.eventFilter = filter.value; renderScope(); });
  container.append(node("div", { class: "search-line" }, [search, filter]), trafficList(filteredEvents()));
}

function resourceButton(label, kind, name) { return button(label, { "data-resource-kind": kind, "data-resource-name": name || "" }); }
function renderEvidenceTab(container) {
  const run = selectedRun();
  if (ui.resource) container.append(section(ui.resource.title, node("pre", { class: "raw", text: ui.resource.text })));
  if (!snapshot.selectedRunId) {
    container.append(node("div", { class: "empty", text: "Select a run target to inspect evidence." }));
    return;
  }
  container.append(section("Run record", [factList([["run", snapshot.selectedRunId], ["status", run?.status], ["phase", phaseOf(run)], ["started", when(run?.startedAt)], ["ended", when(run?.endedAt)]]), node("div", { class: "button-line" }, [resourceButton("Run JSON", "json"), resourceButton("SPEC", "document", "spec"), resourceButton("DEVPLAN", "document", "devplan")])]));
  const artifacts = items(snapshot.selectedRun?.artifacts, "items");
  const artifactList = node("div", { class: "file-list" });
  for (const artifact of artifacts) artifactList.append(resourceButton(artifact.name || artifact.path || String(artifact), "artifact", artifact.name || artifact.path || String(artifact)));
  container.append(section(`Artifacts / ${artifacts.length}`, artifactList.children.length ? artifactList : node("div", { class: "empty", text: "No artifacts reported." })));
  const logs = items(snapshot.selectedRun?.logs, "items");
  const logList = node("div", { class: "file-list" });
  for (const log of logs) logList.append(resourceButton(log.name || String(log), "log", log.name || String(log)));
  container.append(section(`Logs / ${logs.length}`, logList.children.length ? logList : node("div", { class: "empty", text: "No logs reported." })));
  const iterations = snapshot.iterations.filter((iteration) => iteration.runId === snapshot.selectedRunId || iteration.id === snapshot.selectedRunId);
  const iterationList = node("div", { class: "item-list" });
  for (const iteration of iterations) iterationList.append(button(iteration.title || iteration.objective || iteration.id, { "data-iteration-id": iteration.id }));
  container.append(section(`Iteration evidence / ${iterations.length}`, iterationList.children.length ? iterationList : node("div", { class: "empty", text: "No linked iterations." })));
}

function renderScope() {
  const target = activeTarget();
  $("scopeKicker").textContent = target ? `${target.type.toUpperCase()} TARGET` : "TARGET SCOPE";
  $("scopeTitle").textContent = target?.label || "No target";
  $("scopeStatus").textContent = target ? phaseOf(target.data).toUpperCase() : "STANDBY";
  $("scopeStatus").className = `status-tag${target && isBlocked(target.data) ? " alert" : ""}`;
  document.querySelectorAll("[data-tab]").forEach((tab) => tab.setAttribute("aria-selected", String(tab.dataset.tab === ui.scopeTab)));
  const content = clear($("scopeContent"));
  if (ui.scopeTab === "target") renderTargetTab(content, target);
  else if (ui.scopeTab === "traffic") renderTrafficTab(content);
  else renderEvidenceTab(content);
}

function renderChrome() {
  const connection = snapshot.connection;
  const live = connection.status === "connected" || connection.status === "polling";
  $("connectionLamp").className = `lamp ${live ? "live" : connection.status === "degraded" ? "degraded" : ""}`;
  $("connectionText").textContent = connection.paused ? "FROZEN" : connection.status.toUpperCase();
  $("transportText").textContent = `${text(connection.transport, "no transport")} / ${connection.lastMessageAt ? `last ${when(connection.lastMessageAt)}` : "no signal"}`;
  $("streamToggle").textContent = connection.paused ? "Unfreeze" : "Freeze";
  $("currentRun").textContent = currentRunId() || "NO ACTIVE RUN";
  const currentPhase = phaseOf(snapshot.state || selectedRun());
  const strip = clear($("phaseStrip"));
  const current = WORKFLOW_PHASES.indexOf(currentPhase);
  WORKFLOW_PHASES.forEach((phase, index) => strip.append(node("span", { class: `phase${index < current ? " done" : ""}${index === current ? " current" : ""}${phase === "blocked" && currentPhase === phase ? " alert" : ""}`, title: phase })));
  const scale = clear($("workflowScale"));
  const labels = [["Acquire", 0], ["Specify", 3], ["Review", 6], ["Plan", 8], ["Build", 10], ["Publish", 15]];
  for (const [label, index] of labels) scale.append(node("span", { class: current >= index && current < (labels[labels.findIndex((x) => x[0] === label) + 1]?.[1] ?? 99) ? "current" : "", text: label }));
}

function render() {
  renderChrome();
  renderRadar();
  renderScope();
  if ($("commandTray").open) renderCommandTray();
  if ($("planningTray").open) renderPlanning();
}

function formInput(name, label, options = {}) {
  const control = options.textarea ? node("textarea", { name, required: options.required, placeholder: options.placeholder, maxlength: options.maxlength }) : node("input", { name, type: options.type || "text", required: options.required, placeholder: options.placeholder, value: options.value, min: options.min, max: options.max });
  return field(label, control);
}

function operationalButtons() {
  return node("div", { class: "button-line" }, ["pause", "resume", "hold", "unhold", "stop", "run-now"].map((type) => button(type, { "data-op-command": type, class: type === "stop" ? "danger" : "" })));
}

function runCommands(container) {
  const auto = snapshot.control?.autoIteration || {};
  const target = Number(auto.targetGenerations || auto.maxIterations || 10);
  const showcase = node("div", { class: "command-block" }, [node("h3", { text: "Showcase vector" })]);
  showcase.append(field("Target generations", node("input", { id: "showcaseTarget", type: "number", min: 1, max: 10, value: target })), node("div", { class: "button-line" }, [button("Start", { "data-showcase": "start" }), button("Pause", { "data-op-command": "pause-showcase-loop" }), button("Resume", { "data-op-command": "resume-showcase-loop" }), button("Stop", { "data-op-command": "stop-showcase-loop", class: "danger" }), button("Set target", { "data-showcase": "target" })]));
  const nextForm = node("form", { id: "nextForm", class: "command-block" }, [node("h3", { text: "Next iteration" }), formInput("repoPath", "Absolute repository path", { required: true, value: snapshot.control?.autoIteration?.repoPath || snapshot.state?.repoPath || "/home/mojo/autonomous-projects/hermes-showcase-site" }), formInput("objective", "Objective", { required: true, value: snapshot.control?.currentObjective?.text || snapshot.state?.objective || "Advance the current bounded objective." }), formInput("changeText", "Bounded change", { textarea: true, required: true, placeholder: "One bounded objective-linked generation" }), button("Start next iteration", { type: "submit", class: "primary" })]);
  const lineage = node("div", { class: "command-block" }, [node("h3", { text: "Iteration lineage" })]);
  for (const iteration of snapshot.iterations.slice(0, 10)) lineage.append(node("div", { class: "item-row" }, [node("span", { text: iteration.objective || iteration.id }), button("Continue", { "data-lineage": "continue-from-iteration", "data-id": iteration.id }), button("Fork", { "data-lineage": "fork-from-iteration", "data-id": iteration.id }), button("Use", { "data-lineage": "use-as-next-direction", "data-id": iteration.id })]));
  container.append(node("div", { class: "command-block" }, [node("h3", { text: "Run clearance" }), operationalButtons()]), showcase, nextForm, lineage);
}

function recoveryCommands(container) {
  const blocker = snapshot.state?.blocker || snapshot.state?.block || snapshot.state?.hold;
  const block = node("div", { class: "command-block" }, [node("h3", { text: "Collision resolution" })]);
  if (blocker) block.append(node("div", { class: "alert-box", text: text(blocker.reason || blocker.message || blocker) }));
  block.append(node("form", { id: "deblockForm" }, [formInput("prompt", "Deblock direction", { textarea: true, required: true, maxlength: 8000 }), node("div", { class: "button-line" }, [button("Send deblock", { type: "submit", class: "primary" }), button("Ask advice", { "data-deblock-advice": true })])]));
  const adviceList = node("div", { class: "item-list" });
  for (const advice of (snapshot.control?.deblockAdvice || []).filter((entry) => entry.status === "pending")) adviceList.append(node("div", { class: "item-row" }, [node("span", { text: short(advice.answer, 90) }), button("Approve", { "data-advice": "approve", "data-id": advice.id }), button("Deny", { "data-advice": "deny", "data-id": advice.id })]));
  block.append(adviceList);
  const steering = node("div", { class: "command-block" }, [node("h3", { text: "Steering vectors" }), node("form", { id: "objectiveForm" }, [formInput("text", "Current objective", { textarea: true, required: true, value: snapshot.control?.currentObjective?.text || snapshot.state?.objective }), button("Set objective", { type: "submit" })]), node("form", { id: "steerForm" }, [formInput("text", "Directive", { textarea: true, required: true }), formInput("runId", "Run ID", { value: currentRunId() }), button("Apply steering", { type: "submit", class: "primary" })])]);
  for (const vector of snapshot.control?.activeSteering || []) steering.append(node("div", { class: "item-row" }, [node("span", { text: vector.directive || vector.text || vector.id }), button("Remove", { "data-remove-steering": vector.id })]));
  container.append(block, steering);
}

function queueCommands(container) {
  const add = node("form", { id: "queueForm", class: "command-block" }, [node("h3", { text: "Add direction" }), formInput("title", "Title", { required: true }), formInput("objective", "Objective", { textarea: true, required: true }), formInput("context", "Context", { textarea: true }), formInput("preferredRepo", "Preferred repository"), field("Pin immediately", node("input", { name: "pin", type: "checkbox" })), button("Add to queue", { type: "submit", class: "primary" }), button("Clear queue", { type: "button", "data-op-command": "clear-queue", class: "danger" })]);
  const list = node("div", { class: "command-block" }, [node("h3", { text: "Queued vectors" })]);
  for (const item of items(snapshot.queue, "items")) list.append(node("div", { class: "item-row" }, [node("span", { text: item.title || item.objective || item.id }), button("Pin", { "data-queue": "pin", "data-id": item.id }), button("Use", { "data-queue": "use", "data-id": item.id }), button("Archive", { "data-queue": "archive", "data-id": item.id })]));
  container.append(add, list);
}

function gateCommands(container) {
  const add = node("form", { id: "gateForm", class: "command-block" }, [node("h3", { text: "Add acceptance gate" }), formInput("id", "Gate ID", { required: true }), formInput("description", "Description", { textarea: true, required: true }), formInput("severity", "Severity", { value: "must" }), formInput("requiredEvidence", "Required evidence paths (comma separated)"), button("Add gate", { type: "submit", class: "primary" })]);
  const list = node("div", { class: "command-block" }, [node("h3", { text: "Gate decisions" })]);
  for (const gate of items(snapshot.gates, "gates")) list.append(node("div", { class: "item-row" }, [node("span", { text: `${gate.id} / ${gate.description || gate.title || gate.status || "gate"}` }), button("Pass", { "data-gate": "pass", "data-id": gate.id }), button("Need evidence", { "data-gate": "defer", "data-id": gate.id }), button("Attach evidence", { "data-gate": "attach", "data-id": gate.id }), button("Reset", { "data-gate": "update", "data-id": gate.id })]));
  container.append(add, list);
}

function renderCommandTray() {
  const container = clear($("commandContent"));
  document.querySelectorAll("[data-tray-tab]").forEach((tab) => tab.classList.toggle("active", tab.dataset.trayTab === ui.trayTab));
  const grid = node("div", { class: "command-grid" });
  if (ui.trayTab === "run") runCommands(grid);
  else if (ui.trayTab === "recovery") recoveryCommands(grid);
  else if (ui.trayTab === "queue") queueCommands(grid);
  else gateCommands(grid);
  container.append(grid);
}

function planDefaults(pipelineType, values = {}) {
  return {
    pipelineType, title: values.title || "", problem: values.problem || "", intendedUsers: values.intendedUsers || "", objective: values.objective || "", boundedScope: values.boundedScope || "",
    requirements: values.requirements || [], nonGoals: values.nonGoals || [], constraints: values.constraints || [], risks: values.risks || [],
    repository: { path: values.repositoryPath || null, baseRef: values.baseRef || null, baseCommit: null }, acceptanceGates: [],
    validationPolicy: { id: "apb.runner-selected.v1", expectations: [], clientCommandsAllowed: false }, milestones: [],
    limits: { maxIterations: 1, maxVariantsPerIteration: 3, maxParallelVariants: 3, maxAcceptedFeatures: 4, maxVisualMotifChanges: 1, maxNewSections: 1, stopAfterNoImprovement: 1 },
    lineage: { mode: "new", sourcePlanId: null, sourceRevision: null, sourceRunId: null, sourceIterationId: null }
  };
}

async function loadPlan(planId) {
  ui.selectedPlanId = planId;
  ui.planRevision = null;
  ui.planDetail = await perform("Load plan", () => client.getProjectPlan(planId));
  renderPlanning();
}

function planListPane() {
  const pane = node("div", { class: "plan-list" });
  const create = node("form", { id: "planCreateForm" }, [
    node("h3", { text: "New plan" }),
    field("Pipeline", node("select", { name: "pipelineType" }, [node("option", { value: "classic", text: "classic" }), node("option", { value: "managed", text: "managed" })])),
    formInput("title", "Title", { required: true }),
    formInput("problem", "Problem", { textarea: true, required: true }),
    formInput("intendedUsers", "Intended users", { required: true }),
    formInput("objective", "Measurable objective", { textarea: true, required: true }),
    formInput("boundedScope", "Bounded scope", { textarea: true, required: true }),
    formInput("repositoryPath", "Repository path (managed only)"),
    formInput("baseRef", "Base ref (managed only)"),
    button("Create plan", { type: "submit", class: "primary" })
  ]);
  pane.append(create);
  for (const plan of snapshot.plans) {
    const row = button("", { class: "target-row", "data-plan-id": plan.planId });
    row.append(node("span"), node("span", { text: plan.title || "Untitled plan" }), node("small", { text: `${plan.state} / r${plan.currentRevision}` }));
    pane.append(row);
  }
  return pane;
}

function renderPlans(container) {
  const workspace = node("div", { class: "planning-grid" }, [planListPane()]);
  const detail = node("div", { class: "plan-editor" });
  detail.append(node("h3", { text: "Persisted project flight plans" }), node("p", { text: "Select a plan to inspect it, or create a bounded classic or managed plan." }));
  if (ui.planDetail) detail.append(factList([["plan", ui.planDetail.ledger?.planId], ["state", ui.planDetail.ledger?.state], ["revision", ui.planDetail.revision?.revision], ["digest", ui.planDetail.revision?.contentDigest], ["active launch", ui.planDetail.ledger?.activeLaunchId]]));
  workspace.append(detail); container.append(workspace);
}

function renderPlanEditor(container) {
  const detail = ui.planDetail;
  if (!detail) { container.append(node("div", { class: "empty", text: "Select a plan in Plans before editing." })); return; }
  const form = node("form", { id: "planEditorForm" }, [node("h3", { text: `Edit ${detail.revision.content.title || detail.ledger.planId}` }), field("Plan content JSON", node("textarea", { name: "content", required: true })), button("Save new revision", { type: "submit", class: "primary" })]);
  form.querySelector("textarea").value = JSON.stringify(detail.revision.content, null, 2);
  container.append(form);
}

function renderPlanReview(container) {
  const detail = ui.planDetail;
  if (!detail) { container.append(node("div", { class: "empty", text: "Select a plan before review." })); return; }
  const ledger = detail.ledger;
  const revision = detail.revision;
  const revisions = node("div", { class: "button-line", "aria-label": "Saved plan revisions" }, (detail.revisions || []).map((item) => button(`Revision ${item.revision}`, { "data-plan-revision": item.revision })));
  container.append(factList([["plan", ledger.planId], ["state", ledger.state], ["version", ledger.version], ["revision", revision.revision], ["digest", revision.contentDigest]]), node("pre", { class: "raw", text: JSON.stringify(revision.content, null, 2) }), section("Revision history", [revisions, ui.planRevision ? node("pre", { class: "raw", text: JSON.stringify(ui.planRevision, null, 2) }) : node("p", { text: "Select a saved revision to inspect its immutable content." })]), field("Decision notes", node("textarea", { id: "decisionNotes" })), node("div", { class: "button-line" }, [button("Ready for review", { "data-plan-action": "ready" }), button("Approve", { "data-plan-action": "approve", class: "primary" }), button("Reject", { "data-plan-action": "reject", class: "danger" }), button("Launch", { "data-plan-action": "launch" }), button("Clone", { "data-plan-action": "clone" }), button("Fork", { "data-plan-action": "fork" }), button("Archive", { "data-plan-action": "archive", class: "danger" })]));
}

async function loadAssistance(id) {
  ui.assistanceId = id;
  ui.assistanceDetail = await perform("Load conversation", () => client.getPlanAssistance(id));
  renderPlanning();
}

function renderAssistance(container) {
  const controls = node("div", { class: "button-line" }, [button("Start classic conversation", { "data-new-assist": "classic" }), button("Start managed conversation", { "data-new-assist": "managed" }), button("Refresh conversations", { "data-assist-refresh": true })]);
  container.append(controls, node("p", { text: "Messages may be sent to the configured inference provider. Suggestions do not save, approve, launch, or execute a plan." }));
  const list = node("div", { class: "item-list" });
  for (const conversation of snapshot.assistance) list.append(button(`${conversation.pipelineType} / ${conversation.messageCount} messages`, { "data-assist-id": conversation.id }));
  container.append(list);
  const detail = ui.assistanceDetail;
  if (!detail) return;
  const transcript = node("div", { role: "log", "aria-live": "polite" });
  for (const message of detail.messages || []) transcript.append(node("div", { class: `message ${message.role}`, text: `${message.role}: ${message.content}` }));
  const form = node("form", { id: "assistanceForm" }, [field("Planning message", node("textarea", { name: "message", required: true, maxlength: 16000 })), button("Send", { type: "submit", class: "primary" })]);
  container.append(transcript, form);
  if (detail.proposedContent) container.append(button("Create plan from proposal", { "data-create-proposal": true }));
}

function renderPlanning() {
  const container = clear($("planningContent"));
  document.querySelectorAll("[data-plan-tab]").forEach((tab) => tab.classList.toggle("active", tab.dataset.planTab === ui.planTab));
  if (ui.planTab === "plans") renderPlans(container);
  else if (ui.planTab === "editor") renderPlanEditor(container);
  else if (ui.planTab === "review") renderPlanReview(container);
  else renderAssistance(container);
}

async function planAction(action) {
  const detail = ui.planDetail;
  if (!detail) return;
  const ledger = detail.ledger;
  const revision = detail.revision;
  const identity = { planId: ledger.planId, revision: ledger.currentRevision, planDigest: ledger.currentDigest };
  const options = { expectedVersion: ledger.version, refresh: true };
  const notes = $("decisionNotes")?.value.trim() || "";
  if (action === "reject" && !notes) { notify("Reject plan: decision notes are required", true); return; }
  let result;
  if (action === "ready") result = await perform("Ready for review", () => client.submitProjectPlanForReview(identity, options));
  if (action === "approve") result = await perform("Approve plan", () => client.approveProjectPlan({ ...identity, notes }, options));
  if (action === "reject") result = await perform("Reject plan", () => client.rejectProjectPlan({ ...identity, notes }, options));
  if (action === "launch") result = await perform("Launch plan", () => client.launchProjectPlan(identity, options));
  if (action === "clone") result = await perform("Clone plan", () => client.cloneProjectPlan({ ...identity, sourceRunId: currentRunId(), sourceIterationId: snapshot.selectedIterationId }, options));
  if (action === "fork") result = await perform("Fork plan", () => client.forkProjectPlan({ ...identity, sourceRunId: currentRunId(), sourceIterationId: snapshot.selectedIterationId, baseRef: revision.content.repository?.baseRef || "HEAD" }, options));
  if (action === "archive") result = await perform("Archive plan", () => client.archiveProjectPlan({ planId: ledger.planId }, options));
  if (result?.planId && result.planId !== ledger.planId) ui.selectedPlanId = result.planId;
  if (ui.selectedPlanId) await loadPlan(ui.selectedPlanId);
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-target-type]");
  if (target) { await selectTarget(target.dataset.targetType, target.dataset.targetId); return; }
  const indexed = event.target.closest("[data-select-type]");
  if (indexed) { await selectTarget(indexed.dataset.selectType, indexed.dataset.selectId); return; }
  const tab = event.target.closest("[data-tab]");
  if (tab) { ui.scopeTab = tab.dataset.tab; renderScope(); return; }
  const trayTab = event.target.closest("[data-tray-tab]");
  if (trayTab) { ui.trayTab = trayTab.dataset.trayTab; renderCommandTray(); return; }
  const planTab = event.target.closest("[data-plan-tab]");
  if (planTab) { ui.planTab = planTab.dataset.planTab; renderPlanning(); return; }
  const op = event.target.closest("[data-command],[data-op-command]");
  if (op) { await command(op.dataset.command || op.dataset.opCommand, { reason: "Radar operator command" }); return; }
  const showcase = event.target.closest("[data-showcase]");
  if (showcase) {
    const targetGenerations = Number($("showcaseTarget")?.value || 10);
    if (showcase.dataset.showcase === "target") await command("set-showcase-target", { targetGenerations });
    else await command("start-showcase-loop", { sourceRunId: currentRunId(), sourceIterationId: snapshot.selectedIterationId, repoPath: snapshot.control?.autoIteration?.repoPath || snapshot.state?.repoPath, objective: snapshot.control?.currentObjective?.text || snapshot.state?.objective || "Bounded showcase progression", targetGenerations, limits: { maxIterations: targetGenerations, maxVariantsPerIteration: 3, maxParallelVariants: 3, maxAcceptedFeatures: 4, maxVisualMotifChanges: 1, maxNewSections: 1, stopAfterNoImprovement: 1 } });
    return;
  }
  if (event.target.closest("[data-deblock-advice]")) { await command("deblock-advice", { runId: currentRunId(), prompt: $("deblockForm")?.elements.prompt.value || "" }); return; }
  const advice = event.target.closest("[data-advice]");
  if (advice) { await command(advice.dataset.advice === "approve" ? "approve-deblock-advice" : "deny-deblock-advice", { adviceId: advice.dataset.id }); return; }
  const remove = event.target.closest("[data-remove-steering]");
  if (remove) { await command("remove-steering", { id: remove.dataset.removeSteering }); return; }
  const queue = event.target.closest("[data-queue]");
  if (queue) {
    const item = items(snapshot.queue, "items").find((entry) => String(entry.id) === queue.dataset.id);
    if (queue.dataset.queue === "pin") await command("pin-queue-item", { id: queue.dataset.id });
    if (queue.dataset.queue === "archive") await command("archive-queue-item", { id: queue.dataset.id });
    if (queue.dataset.queue === "use") await command("start-next-iteration", { queueItemId: item?.id, repoPath: item?.target?.preferredRepo || item?.preferredRepo, objective: item?.objective, changeText: item?.context || item?.title, acceptanceGateIds: item?.acceptanceGateIds || [] });
    return;
  }
  const lineage = event.target.closest("[data-lineage]");
  if (lineage) {
    const iteration = snapshot.iterations.find((entry) => String(entry.id) === lineage.dataset.id);
    await command(lineage.dataset.lineage, {
      sourceIterationId: iteration?.id,
      sourceRunId: iteration?.runId,
      repoPath: iteration?.repoPath || snapshot.control?.autoIteration?.repoPath,
      baseRef: iteration?.commit || "HEAD",
      objective: iteration?.objective || snapshot.control?.currentObjective?.text,
      changeText: iteration?.steeringText || `Continue one bounded direction from ${iteration?.id}`,
      limits: snapshot.control?.autoIteration || { maxIterations: 1, maxVariantsPerIteration: 3, maxParallelVariants: 3 }
    });
    return;
  }
  const gate = event.target.closest("[data-gate]");
  if (gate) {
    const evidenceArtifacts = ["artifacts/gate-report.json", "artifacts/gate-decisions.json"];
    if (gate.dataset.gate === "attach") await command("attach-gate-evidence", { gateId: gate.dataset.id, runId: snapshot.selectedRunId, evidenceArtifacts });
    else if (gate.dataset.gate === "update") await command("update-gate", { gateId: gate.dataset.id, status: "pending" });
    else await command("gate-decision", { gateId: gate.dataset.id, runId: snapshot.selectedRunId, status: gate.dataset.gate === "pass" ? "passed" : "needs-evidence", decision: gate.dataset.gate === "pass" ? "accepted" : "defer", evidenceArtifacts });
    return;
  }
  const resource = event.target.closest("[data-resource-kind]");
  if (resource) {
    const kind = resource.dataset.resourceKind;
    await perform("Load evidence", async () => {
      let result;
      if (kind === "json") result = snapshot.selectedRun?.run || selectedRun();
      if (kind === "artifact") result = await client.loadArtifact(resource.dataset.resourceName);
      if (kind === "log") result = await client.loadLog(resource.dataset.resourceName);
      if (kind === "document") result = await client.loadDocument(resource.dataset.resourceName);
      ui.resource = { title: resource.textContent, text: typeof result === "string" ? result : result?.text || JSON.stringify(result, null, 2) };
      renderScope();
    });
    return;
  }
  const eventRow = event.target.closest("[data-event-id]");
  if (eventRow) { const found = snapshot.events.find((entry) => entry.id === eventRow.dataset.eventId); ui.resource = { title: "Event payload", text: JSON.stringify(found?.raw || found, null, 2) }; ui.scopeTab = "evidence"; renderScope(); return; }
  const iteration = event.target.closest("[data-iteration-id]");
  if (iteration) { await perform("Load iteration", () => client.selectIteration(iteration.dataset.iterationId)); ui.resource = { title: "Iteration evidence", text: JSON.stringify(client.getSnapshot().iterationDetail, null, 2) }; renderScope(); return; }
  const plan = event.target.closest("[data-plan-id]");
  if (plan) { await loadPlan(plan.dataset.planId); return; }
  const action = event.target.closest("[data-plan-action]");
  if (action) { await planAction(action.dataset.planAction); return; }
  const revision = event.target.closest("[data-plan-revision]");
  if (revision && ui.planDetail) { ui.planRevision = await perform("Load revision", () => client.getProjectPlanRevision(ui.planDetail.ledger.planId, Number(revision.dataset.planRevision))); renderPlanning(); return; }
  const newAssist = event.target.closest("[data-new-assist]");
  if (newAssist) { ui.assistanceDetail = await perform("Start assistance", () => client.createPlanAssistance(newAssist.dataset.newAssist)); if (ui.assistanceDetail) { ui.assistanceId = ui.assistanceDetail.id; await client.listPlanAssistance(); } renderPlanning(); return; }
  if (event.target.closest("[data-assist-refresh]")) { await perform("Refresh assistance", () => client.listPlanAssistance()); renderPlanning(); return; }
  const assist = event.target.closest("[data-assist-id]");
  if (assist) { await loadAssistance(assist.dataset.assistId); return; }
  if (event.target.closest("[data-create-proposal]")) { const result = await perform("Create proposed plan", () => client.createProjectPlan({ content: ui.assistanceDetail.proposedContent }, { refresh: true })); if (result?.planId) await loadPlan(result.planId); return; }
});

document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!["nextForm", "deblockForm", "objectiveForm", "steerForm", "queueForm", "gateForm", "planCreateForm", "planEditorForm", "assistanceForm"].includes(form.id)) return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  if (form.id === "nextForm") await command("start-next-iteration", { runId: currentRunId(), repoPath: snapshot.control?.autoIteration?.repoPath || snapshot.state?.repoPath, ...data });
  if (form.id === "deblockForm") await command("deblock", { runId: currentRunId(), ...data });
  if (form.id === "objectiveForm") await command("set-current-objective", { ...data, runId: currentRunId(), source: "radar" });
  if (form.id === "steerForm") await command("steer", data);
  if (form.id === "queueForm") await command("add-queue-item", { ...data, pin: form.elements.pin.checked, source: "radar", target: { preferredRepo: data.preferredRepo || null } });
  if (form.id === "gateForm") await command("add-gate", { ...data, requiredEvidence: data.requiredEvidence.split(",").map((value) => value.trim()).filter(Boolean).join("\n") });
  if (form.id === "planCreateForm") {
    const result = await perform("Create plan", () => client.createProjectPlan({ content: planDefaults(data.pipelineType, data) }, { refresh: true }));
    if (result?.planId) { await loadPlan(result.planId); ui.planTab = "editor"; renderPlanning(); }
  }
  if (form.id === "planEditorForm") {
    try {
      const content = JSON.parse(data.content);
      await perform("Update plan", () => client.updateProjectPlan({ planId: ui.planDetail.ledger.planId, content }, { expectedVersion: ui.planDetail.ledger.version, refresh: true }));
      await loadPlan(ui.planDetail.ledger.planId);
    } catch (error) { notify(`Plan JSON: ${error.message}`, true); }
  }
  if (form.id === "assistanceForm") { ui.assistanceDetail = await perform("Send planning message", () => client.messagePlanAssistance(ui.assistanceDetail.id, ui.assistanceDetail.version, data.message)); renderPlanning(); }
  if (!["planCreateForm", "planEditorForm", "assistanceForm"].includes(form.id)) form.reset();
});

$("radar").addEventListener("keydown", async (event) => {
  const targets = [...$("radar").querySelectorAll(".target")];
  const index = targets.indexOf(document.activeElement);
  if (index < 0) return;
  let next = index;
  if (["ArrowRight", "ArrowDown"].includes(event.key)) next = (index + 1) % targets.length;
  else if (["ArrowLeft", "ArrowUp"].includes(event.key)) next = (index - 1 + targets.length) % targets.length;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = targets.length - 1;
  else if (["Enter", " "].includes(event.key)) { event.preventDefault(); await selectTarget(document.activeElement.dataset.targetType, document.activeElement.dataset.targetId); return; }
  else return;
  event.preventDefault();
  targets.forEach((target, targetIndex) => target.setAttribute("tabindex", targetIndex === next ? "0" : "-1"));
  targets[next].focus();
});

$("streamToggle").addEventListener("click", async () => snapshot.connection.paused ? client.resume().catch((error) => notify(error.message, true)) : client.pause());
$("connectButton").addEventListener("click", () => perform("Reconnect", () => client.connect()));
$("disconnectButton").addEventListener("click", () => { client.disconnect(); notify("Live transport disconnected"); });
$("refreshButton").addEventListener("click", () => perform("Refresh", () => client.refresh()));
$("openCommands").addEventListener("click", () => { renderCommandTray(); $("commandTray").showModal(); });
$("openPlanning").addEventListener("click", async () => { $("planningTray").showModal(); await Promise.allSettled([client.refreshPlans(), client.listPlanAssistance()]); renderPlanning(); });

initGrid();
client.subscribe((next) => { snapshot = next; if (!ui.selectedPlanId && next.plans[0]) ui.selectedPlanId = next.plans[0].planId; render(); });
client.connect().catch((error) => notify(`Initial connection: ${error.message}`, true));
