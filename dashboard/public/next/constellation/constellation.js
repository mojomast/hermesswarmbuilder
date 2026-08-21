import { createDashboardClient, WORKFLOW_PHASES } from "../../headless-dashboard-client.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const client = createDashboardClient({ maxEvents: 1000, maxRawMessages: 100, pollIntervalMs: 4000 });

let snapshot = client.getSnapshot();
let selected = { type: "orchestrator", id: "orchestrator", label: "Orchestrator", status: "idle", data: null };
let objects = [];
let relationships = [];
let planDetail = null;
let filter = "";
let renderQueued = false;

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = String(value);
    else if (key === "hidden") node.hidden = Boolean(value);
    else if (key.startsWith("data-")) node.setAttribute(key, String(value));
    else node.setAttribute(key, String(value));
  }
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child === null || child === undefined) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function svgEl(tag, attrs = {}, text = null) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text !== null) node.textContent = String(text);
  return node;
}

function replace(node, children) {
  node.replaceChildren(...(Array.isArray(children) ? children : [children]).filter(Boolean));
}

function arr(value) { return Array.isArray(value) ? value : []; }
function first(...values) { return values.find((value) => value !== undefined && value !== null && value !== "") ?? ""; }
function lower(value) { return String(value || "").toLowerCase(); }
function short(value, length = 38) {
  const text = String(value ?? "");
  return text.length > length ? `${text.slice(0, length - 1)}...` : text;
}
function date(value) {
  if (!value) return "not reported";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? String(value) : parsed.toLocaleString();
}
function objectId(value, fallback) { return String(first(value?.id, value?.planId, value?.runId, fallback)); }
function isBlocked(value) { return ["blocked", "deblocking", "on-hold", "failed", "error"].some((status) => lower(value).includes(status)); }

function inferRole(id, source = {}) {
  const text = lower(`${source.role || ""} ${id || ""}`);
  if (text.includes("orchestrat")) return "orchestration";
  if (text.includes("spec") || text.includes("research")) return "specification";
  if (text.includes("plan")) return "planning";
  if (text.includes("build") || text.includes("worker")) return "building";
  if (text.includes("test") || text.includes("audit")) return "assurance";
  if (text.includes("doc")) return "documentation";
  if (text.includes("deblock")) return "recovery";
  if (text.includes("select") || text.includes("inventory")) return "discovery";
  return source.role || "agent";
}

function deriveAgents(model) {
  const raw = Array.isArray(model.state?.agents) ? model.state.agents : Object.values(model.state?.agents || {});
  const map = new Map();
  for (const source of raw) {
    const id = objectId(source, source?.label || source?.role);
    if (!id) continue;
    map.set(id, {
      ...source,
      id,
      label: first(source.label, source.name, source.role, id),
      role: inferRole(id, source),
      status: first(source.status, "idle"),
      task: first(source.currentTask, source.task, source.currentPhase, model.state?.phase, "Awaiting work")
    });
  }
  for (const event of model.events) {
    const id = first(event.agentId, event.data?.agentId, event.source);
    if (!id || id === "system" || id === "operator" || map.has(id)) continue;
    map.set(id, { id, label: id, role: inferRole(id), status: event.level === "error" ? "error" : "observed", task: first(event.message, event.type), eventDerived: true });
  }
  return [...map.values()].sort((a, b) => a.role.localeCompare(b.role) || a.id.localeCompare(b.id));
}

function deriveRelationships(model) {
  return model.events.map((event) => {
    const toolName = first(event.data?.toolName, event.raw?.toolName, event.type?.includes("tool") ? event.message : "");
    const kind = toolName || lower(event.type).includes("tool") ? "tool" : "event";
    return {
      id: event.id,
      source: first(event.agentId, event.data?.agentId, event.source, "system"),
      runId: first(event.runId, event.data?.runId, ""),
      kind,
      toolName,
      status: first(event.data?.status, event.level, "info"),
      label: first(toolName, event.message, event.type, "event"),
      ts: event.ts,
      data: event
    };
  });
}

function deriveObjects(model) {
  const agents = deriveAgents(model);
  const result = [{
    type: "orchestrator", id: "orchestrator", label: "Primary orchestrator",
    status: first(model.state?.status, "idle"), role: first(model.state?.phase, model.state?.status, "workflow"),
    relationship: "Primary body; coordinates all active agents and systems", data: model.state || {}
  }];
  for (const agent of agents) result.push({ type: "agent", id: agent.id, label: agent.label, status: agent.status, role: agent.role, relationship: `Orbits orchestrator in the ${agent.role} role band`, data: agent });
  for (const run of model.runs) result.push({ type: "run", id: objectId(run, "run"), label: first(run.objective, run.name, run.id, "Run"), status: first(run.status, "unknown"), role: first(run.phase, run.mode, "run system"), relationship: "Run system linked to participating agents and event paths", data: run });
  for (const iteration of model.iterations) result.push({ type: "iteration", id: objectId(iteration, "iteration"), label: first(iteration.objective, iteration.id, "Iteration"), status: first(iteration.status, "unknown"), role: first(iteration.mode, `generation ${iteration.generation || "?"}`), relationship: `Iteration lineage${iteration.sourceRunId ? ` from ${iteration.sourceRunId}` : ""}`, data: iteration });
  for (const item of arr(model.queue?.items)) result.push({ type: "queue", id: objectId(item, "queue"), label: first(item.title, item.objective, item.id, "Queue item"), status: first(item.status, "queued"), role: `priority ${first(item.priority, 50)}`, relationship: model.control?.pinnedQueueItemId === item.id ? "Pinned queue satellite; supplies current direction" : "Queue satellite", data: item });
  for (const gate of arr(model.gates?.gates)) result.push({ type: "gate", id: objectId(gate, "gate"), label: first(gate.description, gate.title, gate.id, "Gate"), status: first(gate.status, "pending"), role: first(gate.phase, gate.severity, "gate"), relationship: "Decision gate satellite; evidence attaches to runs", data: gate });
  for (const plan of model.plans) result.push({ type: "plan", id: objectId(plan, "plan"), label: first(plan.title, plan.planId, "Project plan"), status: first(plan.state, "draft"), role: first(plan.pipelineType, "project plan"), relationship: "Persisted project-plan satellite with revision lifecycle", data: plan });
  return result;
}

function currentObjective() {
  const pinned = arr(snapshot.queue?.items).find((item) => item.id === snapshot.control?.pinnedQueueItemId);
  return first(snapshot.control?.currentObjective?.text, pinned?.objective, snapshot.state?.objective, snapshot.state?.task, "No active objective reported");
}

function iterationLimits(maxIterations = 1) {
  return { maxIterations: Number(maxIterations) || 1, maxVariantsPerIteration: 3, maxParallelVariants: 3, maxAcceptedFeatures: 4, maxVisualMotifChanges: 1, maxNewSections: 1, stopAfterNoImprovement: 1, minImprovementScore: .05 };
}

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}

function render() {
  objects = deriveObjects(snapshot);
  relationships = deriveRelationships(snapshot);
  const refreshed = objects.find((item) => item.type === selected.type && item.id === selected.id);
  if (refreshed) selected = refreshed;
  $("#phase-kicker").textContent = `${first(snapshot.state?.phase, snapshot.state?.status, "idle")} / ${snapshot.connection.status}`.toUpperCase();
  $("#objective").textContent = currentObjective();
  const connection = $("#connection");
  connection.textContent = snapshot.connection.status.toUpperCase();
  connection.className = `signal ${snapshot.connection.status}`;
  $("#toggle-connection").textContent = snapshot.connection.status === "disconnected" ? "Reconnect" : "Disconnect";
  renderMap();
  renderIndex();
  renderSemanticTables();
  renderNavigation();
  renderInspector();
  renderActionState();
  renderPlans();
}

function polar(cx, cy, radius, angle) {
  const radians = (angle - 90) * Math.PI / 180;
  return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) };
}
function arcPath(cx, cy, radius, start, end) {
  const from = polar(cx, cy, radius, end);
  const to = polar(cx, cy, radius, start);
  return `M${from.x.toFixed(2)} ${from.y.toFixed(2)}A${radius} ${radius} 0 ${end - start <= 180 ? 0 : 1} 0 ${to.x.toFixed(2)} ${to.y.toFixed(2)}`;
}

function renderPhases(layer) {
  const current = first(snapshot.state?.phase, snapshot.state?.status, "idle");
  const currentIndex = WORKFLOW_PHASES.indexOf(current);
  layer.append(svgEl("circle", { cx: 600, cy: 380, r: 345, class: "orbit" }));
  WORKFLOW_PHASES.forEach((phase, index) => {
    const start = index * (360 / WORKFLOW_PHASES.length) + 1;
    const end = (index + 1) * (360 / WORKFLOW_PHASES.length) - 1;
    const stateClass = phase === current ? "current" : currentIndex >= 0 && index < currentIndex ? "done" : "";
    layer.append(svgEl("path", { d: arcPath(600, 380, 345, start, end), class: `phase-arc ${stateClass}`, role: "none" }));
    const point = polar(600, 380, 365, start + (end - start) / 2);
    const text = svgEl("text", { x: point.x, y: point.y, class: `phase-label ${stateClass}`, "text-anchor": "middle", transform: `rotate(${start + (end - start) / 2} ${point.x} ${point.y})` }, short(phase, 14));
    layer.append(text);
  });
}

function nodePositionMap() {
  const positions = new Map([["orchestrator:orchestrator", { x: 600, y: 380 }]]);
  const agents = objects.filter((item) => item.type === "agent").slice(0, 18);
  const roleGroups = new Map();
  for (const agent of agents) {
    const group = roleGroups.get(agent.role) || [];
    group.push(agent); roleGroups.set(agent.role, group);
  }
  let roleOffset = 0;
  for (const group of roleGroups.values()) {
    group.forEach((agent, index) => {
      const angle = roleOffset + index * Math.min(18, 42 / Math.max(group.length, 1));
      positions.set(`agent:${agent.id}`, polar(600, 380, 180 + (roleOffset % 3) * 34, angle));
    });
    roleOffset += 360 / Math.max(roleGroups.size, 1);
  }
  objects.filter((item) => item.type === "run").slice(0, 5).forEach((item, index) => positions.set(`run:${item.id}`, { x: 150 + index * 76, y: 585 - (index % 2) * 50 }));
  const clusters = { queue: { x: 1010, y: 180 }, gate: { x: 1030, y: 380 }, plan: { x: 990, y: 590 }, iteration: { x: 240, y: 165 } };
  for (const [type, center] of Object.entries(clusters)) {
    objects.filter((item) => item.type === type).slice(0, 5).forEach((item, index, list) => {
      const point = polar(center.x, center.y, list.length === 1 ? 0 : 32 + index * 5, index * (360 / list.length));
      positions.set(`${type}:${item.id}`, point);
    });
  }
  return positions;
}

function appendNode(layer, item, point, compact = false) {
  const group = svgEl("g", {
    class: `sky-node ${item.type} ${isBlocked(item.status) ? "blocked" : ""} ${selected.type === item.type && selected.id === item.id ? "selected" : ""}`,
    transform: `translate(${point.x} ${point.y})`, tabindex: "0", role: "button",
    "aria-label": `${item.type}: ${item.label}; status ${item.status}; ${item.relationship}`,
    "data-object-type": item.type, "data-object-id": item.id
  });
  const size = item.type === "orchestrator" ? 47 : compact ? 21 : 27;
  group.append(svgEl("circle", { class: "halo", r: size + 8 }));
  if (["run", "queue"].includes(item.type)) group.append(svgEl("rect", { class: "body", x: -size, y: -size, width: size * 2, height: size * 2, rx: item.type === "queue" ? 10 : 2 }));
  else if (item.type === "gate") group.append(svgEl("path", { class: "body", d: `M0 ${-size}L${size} 0L0 ${size}L${-size} 0Z` }));
  else if (item.type === "plan") group.append(svgEl("path", { class: "body", d: `M${-size * .85} ${-size}H${size * .85}L${size} 0L${size * .85} ${size}H${-size * .85}L${-size} 0Z` }));
  else if (item.type === "iteration") group.append(svgEl("path", { class: "body", d: `M0 ${-size}L${size * .86} ${-size / 2}L${size * .86} ${size / 2}L0 ${size}L${-size * .86} ${size / 2}L${-size * .86} ${-size / 2}Z` }));
  else group.append(svgEl("circle", { class: "body", r: size }));
  group.append(svgEl("circle", { class: "status-notch", cx: size * .68, cy: -size * .68, r: item.type === "orchestrator" ? 6 : 4 }));
  group.append(svgEl("text", { y: size + 15, "text-anchor": "middle" }, short(item.label, item.type === "orchestrator" ? 28 : 18)));
  group.append(svgEl("text", { y: size + 27, class: "sub", "text-anchor": "middle" }, short(item.status, 16)));
  layer.append(group);
}

function renderMap() {
  const phaseLayer = $("#phase-layer"), pathLayer = $("#path-layer"), systemLayer = $("#system-layer"), nodeLayer = $("#node-layer");
  phaseLayer.replaceChildren(); pathLayer.replaceChildren(); systemLayer.replaceChildren(); nodeLayer.replaceChildren();
  renderPhases(phaseLayer);
  const positions = nodePositionMap();
  systemLayer.append(svgEl("circle", { cx: 600, cy: 380, r: 180, class: "orbit" }));
  systemLayer.append(svgEl("circle", { cx: 600, cy: 380, r: 248, class: "orbit" }));
  const clusterLabels = [[1010, 112, "QUEUE"], [1030, 312, "GATES"], [990, 522, "PLANS"], [240, 97, "ITERATIONS"], [180, 662, "RUN SYSTEMS"]];
  clusterLabels.forEach(([x, y, text]) => systemLayer.append(svgEl("text", { x, y, class: "cluster-label", "text-anchor": "middle" }, text)));
  for (const item of objects.filter((entry) => entry.type === "run").slice(0, 5)) {
    const point = positions.get(`run:${item.id}`);
    if (!point) continue;
    systemLayer.append(svgEl("ellipse", { cx: point.x, cy: point.y, rx: 47, ry: 32, class: "run-system" }));
  }
  const visibleRelationships = relationships.slice(-45);
  visibleRelationships.forEach((relationship, index) => {
    const source = positions.get(`agent:${relationship.source}`) || positions.get(`run:${relationship.runId}`) || { x: 600, y: 380 };
    const target = relationship.runId ? positions.get(`run:${relationship.runId}`) || { x: 600, y: 380 } : { x: 600, y: 380 };
    const bend = 18 + (index % 5) * 7;
    pathLayer.append(svgEl("path", { d: `M${source.x} ${source.y}Q${(source.x + target.x) / 2 + bend} ${(source.y + target.y) / 2 - bend} ${target.x} ${target.y}`, class: `relationship ${relationship.kind}`, role: "none" }));
  });
  const overviewTypes = new Set(["orchestrator", "agent", "run", "queue", "gate", "plan", "iteration"]);
  for (const item of objects) {
    if (!overviewTypes.has(item.type)) continue;
    const point = positions.get(`${item.type}:${item.id}`);
    if (point) appendNode(nodeLayer, item, point, ["queue", "gate", "plan", "iteration"].includes(item.type));
  }
}

function inspectButton(item, text = "Inspect") {
  return el("button", { type: "button", text, "data-select-type": item.type, "data-select-id": item.id });
}

function renderIndex() {
  const index = $("#node-index");
  const navigable = objects.filter((item) => ["orchestrator", "agent", "run", "queue", "gate", "plan", "iteration"].includes(item.type));
  const buttons = navigable.map((item, position) => {
    const active = selected.type === item.type && selected.id === item.id;
    const button = el("button", {
      type: "button", class: "index-node", role: "gridcell", tabindex: active || (!navigable.some((entry) => entry.type === selected.type && entry.id === selected.id) && position === 0) ? "0" : "-1",
      "aria-selected": String(active), "data-type": item.type, "data-select-type": item.type, "data-select-id": item.id
    }, [el("b", { text: short(item.label, 24) }), el("small", { text: `${item.type} / ${item.status}` })]);
    return button;
  });
  replace(index, buttons);
}

function renderSemanticTables() {
  $("#semantic-count").textContent = `${objects.length} objects / ${relationships.length} relationships`;
  const objectRows = objects.map((item) => el("tr", {}, [
    el("th", { scope: "row", text: item.label }), el("td", { text: item.type }), el("td", { text: item.role }),
    el("td", { text: item.status }), el("td", { text: item.relationship }), el("td", {}, inspectButton(item))
  ]));
  replace($("#object-table"), objectRows.length ? objectRows : el("tr", {}, el("td", { colspan: "6", text: "No objects reported." })));
  const relationshipRows = relationships.slice().reverse().map((item) => el("tr", {}, [
    el("td", { text: date(item.ts) }), el("th", { scope: "row", text: item.source }), el("td", { text: item.kind }),
    el("td", { text: item.runId || "none" }), el("td", { text: item.label }), el("td", {}, inspectButton({ type: item.kind, id: item.id }, "Inspect"))
  ]));
  replace($("#relationship-table"), relationshipRows.length ? relationshipRows : el("tr", {}, el("td", { colspan: "6", text: "No relationships observed." })));
}

function navRow(item, subtitle) {
  return el("button", { type: "button", class: "object-row", "data-select-type": item.type, "data-select-id": item.id }, [
    el("b", { text: item.label }), el("small", { text: item.status }), el("small", { text: subtitle || item.role }), el("span", { text: "→", "aria-hidden": "true" })
  ]);
}

function renderNavigation() {
  const matching = (text) => !filter || lower(text).includes(filter);
  const groups = {
    run: objects.filter((item) => item.type === "run"), agent: objects.filter((item) => item.type === "agent"),
    iteration: objects.filter((item) => item.type === "iteration"),
    event: relationships.filter((item) => item.kind === "event").map((item) => ({ type: "event", id: item.id, label: item.label, status: item.status, role: `${item.source} / ${date(item.ts)}` })),
    tool: relationships.filter((item) => item.kind === "tool").map((item) => ({ type: "tool", id: item.id, label: item.label, status: item.status, role: `${item.source} / ${date(item.ts)}` })),
    audit: arr(snapshot.audit).map((item, index) => ({ type: "audit", id: String(first(item.id, index)), label: first(item.action, item.type, "Audit record"), status: first(item.status, item.result?.status, "recorded"), role: date(item.ts) }))
  };
  for (const [type, items] of Object.entries(groups)) {
    const visible = items.filter((item) => matching(`${item.label} ${item.status} ${item.role} ${item.id}`));
    const listId = type === "run" ? "run-list" : type === "agent" ? "agent-list" : type === "iteration" ? "iteration-list" : `${type}-list`;
    replace($(`#${listId}`), visible.map((item) => navRow(item)) || []);
    $(`#${type}-count`).textContent = String(items.length);
  }
}

function treeView(value, key = "root", depth = 0) {
  if (value === null || value === undefined) return el("span", { class: "tree-null", text: "null" });
  if (typeof value !== "object") return el("span", { class: "tree-value", text: typeof value === "string" ? value : JSON.stringify(value) });
  const entries = Array.isArray(value) ? value.map((child, index) => [index, child]) : Object.entries(value);
  const details = el("details", { open: depth < 1 ? "" : null });
  details.append(el("summary", { text: `${key} ${Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`}` }));
  for (const [childKey, child] of entries) {
    const row = el("div");
    if (child && typeof child === "object") row.append(treeView(child, childKey, depth + 1));
    else row.append(el("span", { class: "tree-key", text: `${childKey}: ` }), treeView(child, childKey, depth + 1));
    details.append(row);
  }
  return details;
}

function selectedData() {
  if (["event", "tool"].includes(selected.type)) return relationships.find((item) => item.id === selected.id)?.data || selected.data || {};
  if (selected.type === "audit") return arr(snapshot.audit).find((item, index) => String(first(item.id, index)) === selected.id) || selected.data || {};
  return selected.data || {};
}

function summaryCells(item) {
  const data = selectedData();
  const values = [
    ["Type", item.type], ["Status", first(item.status, data.status, "unknown")], ["Role / phase", first(item.role, data.role, data.phase, data.type, "not reported")],
    ["Identifier", item.id], ["Updated", date(first(data.updatedAt, data.ts, data.completedAt, data.startedAt))], ["Relationship", first(item.relationship, data.runId ? `Linked to ${data.runId}` : "Recorded operational object")]
  ];
  return values.map(([label, value]) => el("div", { class: "summary-cell" }, [el("span", { text: label }), el("strong", { text: value })]));
}

function renderInspector() {
  const data = selectedData();
  $("#selection-title").textContent = selected.label || selected.id;
  $("#selection-status").textContent = first(selected.status, data.status, "recorded");
  replace($("#object-summary"), summaryCells(selected));
  const actions = [];
  if (selected.type === "run") {
    actions.push(el("button", { type: "button", text: "Load run resources", "data-load-run": selected.id }));
    actions.push(el("button", { type: "button", text: "Open SPEC", "data-load-document": "spec" }));
    actions.push(el("button", { type: "button", text: "Open DEVPLAN", "data-load-document": "devplan" }));
  }
  if (selected.type === "iteration") actions.push(el("button", { type: "button", text: "Load iteration evidence", "data-load-iteration": selected.id }));
  if (selected.type === "plan") actions.push(el("button", { type: "button", text: "Open plan workspace", "data-open-plan": selected.id }));
  if (snapshot.selectedRun?.artifacts?.length) actions.push(...snapshot.selectedRun.artifacts.map((item) => el("button", { type: "button", text: `Artifact: ${short(item.name || item.path, 20)}`, "data-load-artifact": item.name || item.path })).slice(0, 8));
  if (snapshot.selectedRun?.logs?.length) actions.push(...snapshot.selectedRun.logs.map((item) => el("button", { type: "button", text: `Log: ${short(item.name || item.path, 20)}`, "data-load-log": item.name || item.path })).slice(0, 8));
  replace($("#resource-actions"), actions);
  const inspector = $("#object-inspector");
  inspector.className = "tree";
  replace(inspector, treeView(data, selected.type));
}

function actionCard(title, body, actions = []) {
  return el("article", { class: "action-card" }, [el("b", { text: title }), el("p", { text: body }), el("div", { class: "actions" }, actions)]);
}

function commandButton(text, command, payload = {}, className = "") {
  const button = el("button", { type: "button", text, class: className, "data-command": command });
  button._payload = payload;
  return button;
}

function renderActionState() {
  const state = snapshot.state || {};
  const blocker = first(state.block, state.blocker, state.hold, isBlocked(state.status) ? state.lastAction : "");
  $("#blocker-indicator").textContent = blocker ? "ACTION" : "CLEAR";
  replace($("#blocker-detail"), blocker ? actionCard("Active anomaly", typeof blocker === "string" ? blocker : JSON.stringify(blocker)) : el("p", { class: "empty", text: "No active blocker reported." }));
  const advice = arr(snapshot.control?.deblockAdvice);
  replace($("#advice-list"), advice.map((item) => actionCard(`Advice ${item.status}`, first(item.answer, item.prompt), item.status === "pending" ? [
    commandButton("Approve", "approve-deblock-advice", { adviceId: item.id }, "primary"), commandButton("Deny", "deny-deblock-advice", { adviceId: item.id }, "danger")
  ] : [])));
  replace($("#steering-list"), arr(snapshot.control?.activeSteering).map((item) => actionCard(first(item.scope, "steering"), item.text, [commandButton("Remove", "remove-steering", { id: item.id }, "danger")])));
  replace($("#queue-actions"), arr(snapshot.queue?.items).map((item) => actionCard(`${item.title || item.id} / ${item.status}`, item.objective, [
    commandButton("Inspect", "_select", { type: "queue", id: item.id }), commandButton("Pin", "pin-queue-item", { id: item.id }), commandButton("Archive", "archive-queue-item", { id: item.id }, "danger")
  ])));
  replace($("#gate-actions"), arr(snapshot.gates?.gates).map((gate) => {
    const status = el("select", { "aria-label": `Decision for ${gate.id}` }, [el("option", { value: "passed", text: "passed" }), el("option", { value: "needs-evidence", text: "needs evidence" }), el("option", { value: "failed", text: "failed" })]);
    const evidence = el("input", { placeholder: "Evidence artifact paths, comma-separated", "aria-label": `Evidence for ${gate.id}`, "data-gate-field": "evidence" });
    const description = el("input", { value: first(gate.description, gate.title), "aria-label": `Description for ${gate.id}`, "data-gate-field": "description" });
    const decide = el("button", { type: "button", text: "Record decision", "data-gate-decision": gate.id });
    const attach = el("button", { type: "button", text: "Attach evidence", "data-gate-evidence": gate.id });
    const update = el("button", { type: "button", text: "Update gate", "data-gate-update": gate.id });
    return actionCard(`${gate.id} / ${gate.status || "pending"}`, first(gate.description, gate.title), [status, evidence, decide, attach, description, update]);
  }));
  const showcaseObjective = $('[data-special="showcase"] [name="objective"]');
  if (showcaseObjective && !showcaseObjective.value) showcaseObjective.value = currentObjective();
  const objectiveInput = $('[data-command-form="set-current-objective"] [name="text"]');
  if (objectiveInput && !objectiveInput.value) objectiveInput.value = currentObjective();
  const lineage = $('[data-special="lineage"]');
  if (lineage) {
    const iteration = selected.type === "iteration" ? selected.data : snapshot.iterationDetail || snapshot.iterations[0] || {};
    if (!lineage.elements.repoPath.value) lineage.elements.repoPath.value = first(iteration.repoPath, snapshot.control?.autoIteration?.repoPath, "");
    if (!lineage.elements.objective.value) lineage.elements.objective.value = first(iteration.objective, currentObjective());
  }
}

function defaultPlanContent(pipelineType) {
  return {
    pipelineType, title: "", problem: "", intendedUsers: "", objective: "", boundedScope: "",
    requirements: [], nonGoals: [], constraints: [], risks: [],
    repository: { path: null, baseRef: null, baseCommit: null },
    acceptanceGates: [], validationPolicy: { id: "apb.runner-selected.v1", expectations: [], clientCommandsAllowed: false },
    milestones: [], limits: { maxIterations: 1, maxVariantsPerIteration: 3, maxParallelVariants: 3, maxAcceptedFeatures: 4, maxVisualMotifChanges: 1, maxNewSections: 1, stopAfterNoImprovement: 1 },
    lineage: { mode: "new", sourcePlanId: null, sourceRevision: null, sourceRunId: null, sourceIterationId: null }
  };
}

function planField(name, label, value, textarea = false) {
  const control = textarea ? el("textarea", { name, required: ["title", "problem", "intendedUsers", "objective", "boundedScope"].includes(name) ? "" : null }) : el("input", { name, value: value ?? "", required: ["title"].includes(name) ? "" : null });
  if (textarea) control.value = Array.isArray(value) ? value.join("\n") : value ?? "";
  return el("label", {}, [el("span", { text: label }), control]);
}

function gatesText(gates) {
  return arr(gates).map((gate) => `${gate.id || "gate"}|${gate.severity || "must"}|${gate.description || ""}|${arr(gate.requiredEvidence).join(",")}`).join("\n");
}

function parseGates(text) {
  return String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [id, severity = "must", description = "", evidence = ""] = line.split("|");
    return { id: id.trim(), description: description.trim(), severity: severity.trim() === "should" ? "should" : "must", required: Boolean(evidence.trim()), requiredEvidence: evidence.split(",").map((item) => item.trim()).filter(Boolean) };
  });
}

function planEditor(detail) {
  const content = detail.revision.content;
  const form = el("form", { class: "plan-editor", id: "plan-editor-form" });
  const pipeline = el("select", { name: "pipelineType" }, [el("option", { value: "classic", text: "classic" }), el("option", { value: "managed", text: "managed" })]);
  pipeline.value = content.pipelineType;
  const project = el("fieldset", {}, [el("legend", { text: "Project definition" }), el("label", {}, [el("span", { text: "Pipeline" }), pipeline]), planField("title", "Title", content.title), planField("problem", "Problem", content.problem, true), planField("intendedUsers", "Intended users", content.intendedUsers, true), planField("objective", "Measurable objective", content.objective, true), planField("boundedScope", "Bounded scope", content.boundedScope, true)]);
  const boundaries = el("fieldset", {}, [el("legend", { text: "Boundaries" }), planField("requirements", "Requirements, one per line", content.requirements, true), planField("nonGoals", "Non-goals, one per line", content.nonGoals, true), planField("constraints", "Constraints, one per line", content.constraints, true), planField("risks", "Risks, one per line", content.risks, true)]);
  const delivery = el("fieldset", {}, [el("legend", { text: "Delivery and evidence" }), planField("repositoryPath", "Repository path", content.repository?.path), planField("baseRef", "Base ref", content.repository?.baseRef), planField("acceptanceGates", "Gates: id|severity|description|evidence,evidence", gatesText(content.acceptanceGates), true), planField("validationExpectations", "Validation expectations, one per line", content.validationPolicy?.expectations, true), planField("milestones", "Milestones, one per line", content.milestones, true)]);
  const limits = el("fieldset", {}, [el("legend", { text: "Safety limits" })]);
  for (const [name, value] of Object.entries(content.limits || {})) limits.append(planField(name, name.replace(/([A-Z])/g, " $1"), value));
  form.append(project, boundaries, delivery, limits, el("button", { class: "primary", text: "Save new revision" }));
  return form;
}

function renderPlans() {
  replace($("#plan-list"), snapshot.plans.map((plan) => navRow({ type: "plan", id: plan.planId, label: first(plan.title, plan.planId), status: plan.state, role: `${plan.pipelineType} / revision ${plan.currentRevision}` })));
  if (!planDetail) return;
  const ledger = planDetail.ledger, revision = planDetail.revision;
  const workspace = $("#plan-workspace");
  const signature = `${ledger.planId}:${ledger.version}:${revision.revision}`;
  if (workspace.dataset.signature === signature) return;
  workspace.dataset.signature = signature;
  const metadata = el("div", { class: "plan-meta" }, [
    el("div", { class: "summary-cell" }, [el("span", { text: "State" }), el("strong", { text: ledger.state })]),
    el("div", { class: "summary-cell" }, [el("span", { text: "Revision" }), el("strong", { text: revision.revision })]),
    el("div", { class: "summary-cell" }, [el("span", { text: "Version" }), el("strong", { text: ledger.version })]),
    el("div", { class: "summary-cell" }, [el("span", { text: "Digest" }), el("strong", { class: "digest", text: revision.contentDigest })])
  ]);
  const actions = el("div", { class: "plan-actions" }, [
    el("button", { type: "button", text: "Ready for review", "data-plan-action": "ready" }),
    el("button", { type: "button", class: "primary", text: "Approve exact revision", "data-plan-action": "approve" }),
    el("button", { type: "button", class: "danger", text: "Reject", "data-plan-action": "reject" }),
    el("button", { type: "button", text: "Launch approved plan", "data-plan-action": "launch" }),
    el("button", { type: "button", text: "Clone", "data-plan-action": "clone" }),
    el("button", { type: "button", text: "Fork", "data-plan-action": "fork" }),
    el("button", { type: "button", class: "danger", text: "Archive", "data-plan-action": "archive" })
  ]);
  const notes = el("label", {}, [el("span", { text: "Decision notes" }), el("textarea", { id: "plan-decision-notes" })]);
  replace(workspace, [el("h3", { text: revision.content.title || ledger.planId }), metadata, planEditor(planDetail), notes, actions,
    el("details", {}, [el("summary", { text: `Revision and launch evidence (${planDetail.revisions?.length || 0} revisions)` }), el("div", { class: "tree" }, treeView({ revisions: planDetail.revisions, decisions: planDetail.decisions, launches: planDetail.launches }, "plan evidence"))])
  ]);
}

function collectPlan(form, old) {
  const data = new FormData(form);
  const lines = (name) => String(data.get(name) || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  const number = (name) => Number(data.get(name));
  return {
    ...old,
    pipelineType: String(data.get("pipelineType") || old.pipelineType),
    title: String(data.get("title") || ""), problem: String(data.get("problem") || ""), intendedUsers: String(data.get("intendedUsers") || ""), objective: String(data.get("objective") || ""), boundedScope: String(data.get("boundedScope") || ""),
    requirements: lines("requirements"), nonGoals: lines("nonGoals"), constraints: lines("constraints"), risks: lines("risks"), milestones: lines("milestones"),
    repository: String(data.get("pipelineType") || old.pipelineType) === "managed" ? { path: String(data.get("repositoryPath") || "") || null, baseRef: String(data.get("baseRef") || "") || null, baseCommit: null } : { path: null, baseRef: null, baseCommit: null },
    acceptanceGates: parseGates(data.get("acceptanceGates")), validationPolicy: { id: "apb.runner-selected.v1", expectations: lines("validationExpectations"), clientCommandsAllowed: false },
    limits: { maxIterations: number("maxIterations"), maxVariantsPerIteration: number("maxVariantsPerIteration"), maxParallelVariants: number("maxParallelVariants"), maxAcceptedFeatures: number("maxAcceptedFeatures"), maxVisualMotifChanges: number("maxVisualMotifChanges"), maxNewSections: number("maxNewSections"), stopAfterNoImprovement: number("stopAfterNoImprovement") }
  };
}

function showDock(name) {
  $$('[role="tab"][data-dock]').forEach((tab) => { const active = tab.dataset.dock === name; tab.setAttribute("aria-selected", String(active)); tab.tabIndex = active ? 0 : -1; });
  $$(".dock-panel").forEach((panel) => { panel.hidden = panel.id !== `${name}-panel`; });
}

function selectObject(type, id, focusDock = false) {
  let item = objects.find((entry) => entry.type === type && entry.id === id);
  if (!item && ["event", "tool"].includes(type)) {
    const relationship = relationships.find((entry) => entry.id === id);
    if (relationship) item = { type, id, label: relationship.label, status: relationship.status, role: relationship.source, relationship: `${type} path from ${relationship.source}${relationship.runId ? ` to ${relationship.runId}` : ""}`, data: relationship.data };
  }
  if (!item && type === "audit") {
    const data = arr(snapshot.audit).find((entry, index) => String(first(entry.id, index)) === id);
    if (data) item = { type, id, label: first(data.action, data.type, "Audit record"), status: first(data.status, "recorded"), role: "audit evidence", data };
  }
  if (!item) return;
  selected = item;
  renderMap(); renderIndex(); renderInspector();
  if (focusDock) { showDock("inspect"); $("#selection-title").focus({ preventScroll: true }); }
}

function payloadFromForm(form) {
  const data = {};
  for (const [key, value] of new FormData(form).entries()) data[key] = value;
  for (const checkbox of $$('input[type="checkbox"]', form)) data[checkbox.name] = checkbox.checked;
  if (selected.type === "run") data.runId ||= selected.id;
  else data.runId ||= snapshot.state?.currentRunId || snapshot.selectedRunId || "";
  return data;
}

async function runCommand(type, payload = {}, confirmText = "") {
  if (type === "_select") { selectObject(payload.type, payload.id, true); return; }
  if (confirmText && !globalThis.confirm(confirmText)) return;
  const notice = $("#action-notice");
  notice.className = "notice"; notice.textContent = `Sending ${type}...`;
  try {
    const result = await client.command(type, payload, { actor: "constellation-operator", refresh: true });
    notice.textContent = `${type} accepted${result.commandId ? ` / ${result.commandId}` : ""}`;
  } catch (error) {
    notice.className = "notice error";
    notice.textContent = `${type} failed: ${error.message}${error.details?.length ? ` / ${error.details.join("; ")}` : ""}`;
  }
}

async function openPlan(id) {
  try {
    planDetail = await client.getProjectPlan(id);
    showDock("plans"); renderPlans();
  } catch (error) { toast(error); }
}

function toast(error) {
  const node = $("#toast");
  node.textContent = error?.message || String(error); node.hidden = false;
  setTimeout(() => { node.hidden = true; }, 6500);
}

async function refreshPlanDetail() {
  await client.refreshPlans();
  if (planDetail?.ledger?.planId) planDetail = await client.getProjectPlan(planDetail.ledger.planId);
  renderPlans();
}

async function planAction(action) {
  if (!planDetail) return;
  const ledger = planDetail.ledger, revision = planDetail.revision;
  const subject = { planId: ledger.planId, revision: ledger.currentRevision, planDigest: ledger.currentDigest };
  const options = { expectedVersion: ledger.version };
  const notes = $("#plan-decision-notes")?.value || "";
  try {
    if (action === "ready") await client.submitProjectPlanForReview(subject, options);
    if (action === "approve") await client.approveProjectPlan({ ...subject, notes }, options);
    if (action === "reject") {
      if (!notes.trim()) throw new Error("Rejection notes are required.");
      await client.rejectProjectPlan({ ...subject, notes }, options);
    }
    if (action === "launch") {
      if (!globalThis.confirm("Launch the exact approved revision under runner-selected validation?")) return;
      await client.launchProjectPlan(subject, options);
    }
    if (["clone", "fork"].includes(action)) {
      const payload = { ...subject, sourceRunId: selected.type === "run" ? selected.id : null, sourceIterationId: selected.type === "iteration" ? selected.id : null, baseRef: revision.content.pipelineType === "classic" ? null : first(revision.content.repository?.baseRef, "HEAD") };
      const result = action === "clone" ? await client.cloneProjectPlan(payload, options) : await client.forkProjectPlan(payload, options);
      planDetail = await client.getProjectPlan(result.planId);
    }
    if (action === "archive") {
      if (!globalThis.confirm("Archive this project plan?")) return;
      await client.archiveProjectPlan({ planId: ledger.planId }, options);
    }
    await refreshPlanDetail();
  } catch (error) { toast(error); }
}

async function startAssistance() {
  const pipelineType = globalThis.prompt("Assistance pipeline: classic or managed", "classic");
  if (!pipelineType || !["classic", "managed"].includes(pipelineType)) return;
  try { await client.listPlanAssistance(); await client.createPlanAssistance(pipelineType); renderAssistance(); } catch (error) { toast(error); }
}

function renderAssistance() {
  const detail = snapshot.assistanceDetail;
  const workspace = $("#assistance-workspace");
  if (!detail) {
    const signature = `list:${snapshot.assistance.map((item) => `${item.id}:${item.version || item.messageCount}`).join("|")}`;
    if (workspace.dataset.signature === signature) return;
    workspace.dataset.signature = signature;
    replace(workspace, [el("p", { class: "empty", text: "Planning assistance is discussion only and does not save, approve, launch, or execute." }), ...snapshot.assistance.map((item) => el("button", { type: "button", class: "object-row", text: `${item.pipelineType} / ${item.messageCount} messages`, "data-assistance-id": item.id }))]);
    return;
  }
  const signature = `${detail.id}:${detail.version}:${detail.messages?.length || 0}:${Boolean(detail.proposedContent)}`;
  if (workspace.dataset.signature === signature) return;
  workspace.dataset.signature = signature;
  const log = el("div", { class: "assist-log", role: "log", "aria-live": "polite" }, arr(detail.messages).map((message) => el("article", { class: `assist-message ${message.role}` }, [el("b", { text: message.role }), el("p", { text: message.content }), el("small", { text: date(message.createdAt) })])));
  const form = el("form", { id: "assistance-form", class: "form-stack" }, [el("label", {}, [el("span", { text: "Planning message" }), el("textarea", { name: "message", maxlength: "16000", required: "" })]), el("button", { text: "Send to planning orchestrator" })]);
  const children = [el("p", { class: "notice", text: "Messages may be sent to the configured inference provider. Suggestions do not mutate plans." }), log, form];
  if (detail.proposedContent) children.push(el("button", { type: "button", class: "primary", text: "Create editable draft from proposal", id: "create-proposal" }), el("div", { class: "tree" }, treeView(detail.proposedContent, "proposed content")));
  replace(workspace, children);
}

document.addEventListener("click", async (event) => {
  const tab = event.target.closest("[data-dock]");
  if (tab) { showDock(tab.dataset.dock); if (tab.dataset.dock === "plans") client.refreshPlans().catch(toast); return; }
  const select = event.target.closest("[data-select-type]");
  if (select) { selectObject(select.dataset.selectType, select.dataset.selectId, true); return; }
  const svgNode = event.target.closest(".sky-node");
  if (svgNode) { selectObject(svgNode.dataset.objectType, svgNode.dataset.objectId, true); return; }
  const command = event.target.closest("[data-command]");
  if (command) { await runCommand(command.dataset.command, command._payload || { reason: "Constellation operator command" }, command.dataset.confirm || ""); return; }
  const loadRun = event.target.closest("[data-load-run]");
  if (loadRun) { try { await client.selectRun(loadRun.dataset.loadRun); } catch (error) { toast(error); } return; }
  const loadIteration = event.target.closest("[data-load-iteration]");
  if (loadIteration) { try { await client.selectIteration(loadIteration.dataset.loadIteration); selected.data = client.getSnapshot().iterationDetail; renderInspector(); } catch (error) { toast(error); } return; }
  const documentButton = event.target.closest("[data-load-document]");
  if (documentButton) { try { const result = await client.loadDocument(documentButton.dataset.loadDocument, selected.type === "run" ? selected.id : snapshot.selectedRunId); selected = { type: "document", id: result.name, label: result.name, status: "loaded", role: result.kind, data: result }; renderInspector(); } catch (error) { toast(error); } return; }
  const artifact = event.target.closest("[data-load-artifact]");
  if (artifact) { try { const result = await client.loadArtifact(artifact.dataset.loadArtifact); selected = { type: "artifact", id: result.name, label: result.name, status: "loaded", role: "run evidence", data: result }; renderInspector(); } catch (error) { toast(error); } return; }
  const log = event.target.closest("[data-load-log]");
  if (log) { try { const result = await client.loadLog(log.dataset.loadLog); selected = { type: "log", id: result.name, label: result.name, status: "loaded", role: "run evidence", data: result }; renderInspector(); } catch (error) { toast(error); } return; }
  const open = event.target.closest("[data-open-plan]"); if (open) { await openPlan(open.dataset.openPlan); return; }
  const plan = event.target.closest("[data-plan-action]"); if (plan) { await planAction(plan.dataset.planAction); return; }
  const gateDecision = event.target.closest("[data-gate-decision]");
  if (gateDecision) { const card = gateDecision.closest(".action-card"), status = $("select", card).value, evidenceArtifacts = $('[data-gate-field="evidence"]', card).value.split(",").map((item) => item.trim()).filter(Boolean); await runCommand("gate-decision", { gateId: gateDecision.dataset.gateDecision, runId: snapshot.selectedRunId || snapshot.state?.currentRunId || null, status, decision: status, evidenceArtifacts }); return; }
  const gateEvidence = event.target.closest("[data-gate-evidence]");
  if (gateEvidence) { const artifacts = $('[data-gate-field="evidence"]', gateEvidence.closest(".action-card")).value.split(",").map((item) => item.trim()).filter(Boolean); await runCommand("attach-gate-evidence", { gateId: gateEvidence.dataset.gateEvidence, runId: snapshot.selectedRunId || snapshot.state?.currentRunId || null, artifacts }); return; }
  const gateUpdate = event.target.closest("[data-gate-update]");
  if (gateUpdate) { const description = $('[data-gate-field="description"]', gateUpdate.closest(".action-card")).value; await runCommand("update-gate", { gateId: gateUpdate.dataset.gateUpdate, description }); return; }
  const assistance = event.target.closest("[data-assistance-id]"); if (assistance) { try { await client.getPlanAssistance(assistance.dataset.assistanceId); renderAssistance(); } catch (error) { toast(error); } return; }
});

document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  if (form.dataset.commandForm) { await runCommand(form.dataset.commandForm, payloadFromForm(form)); return; }
  if (form.dataset.special === "showcase") {
    const payload = payloadFromForm(form), target = Number(payload.targetGenerations);
    payload.sourceRunId = snapshot.state?.currentRunId || snapshot.selectedRunId || null;
    payload.sourceIterationId = snapshot.selectedIterationId;
    payload.limits = iterationLimits(target);
    await runCommand("start-showcase-loop", payload); return;
  }
  if (form.dataset.special === "next-iteration") { await runCommand("start-next-iteration", { runId: snapshot.state?.currentRunId || snapshot.selectedRunId, repoPath: first(snapshot.control?.autoIteration?.repoPath, "/home/mojo/autonomous-projects/hermes-showcase-site"), objective: currentObjective(), changeText: form.elements.changeText.value, limits: iterationLimits() }); return; }
  if (form.dataset.special === "lineage") { const data = payloadFromForm(form), type = data.mode; delete data.mode; data.sourceRunId = selected.type === "run" ? selected.id : first(selected.data?.runId, snapshot.selectedRunId, snapshot.state?.currentRunId); data.sourceIterationId = selected.type === "iteration" ? selected.id : first(snapshot.selectedIterationId, selected.data?.id); data.limits = iterationLimits(); await runCommand(type, data); return; }
  if (form.id === "plan-editor-form" && planDetail) { try { await client.updateProjectPlan({ planId: planDetail.ledger.planId, content: collectPlan(form, planDetail.revision.content) }, { expectedVersion: planDetail.ledger.version }); await refreshPlanDetail(); } catch (error) { toast(error); } return; }
  if (form.id === "assistance-form") { try { await client.messagePlanAssistance(snapshot.assistanceDetail.id, snapshot.assistanceDetail.version, new FormData(form).get("message")); renderAssistance(); } catch (error) { toast(error); } }
});

$("#node-index").addEventListener("keydown", (event) => {
  const current = event.target.closest(".index-node"); if (!current) return;
  const items = $$(".index-node", event.currentTarget), index = items.indexOf(current);
  let next = null;
  if (["ArrowRight", "ArrowDown"].includes(event.key)) next = items[(index + 1) % items.length];
  if (["ArrowLeft", "ArrowUp"].includes(event.key)) next = items[(index - 1 + items.length) % items.length];
  if (event.key === "Home") next = items[0]; if (event.key === "End") next = items.at(-1);
  if (next) { event.preventDefault(); items.forEach((item) => item.tabIndex = -1); next.tabIndex = 0; next.focus(); }
});

$(".dock-tabs").addEventListener("keydown", (event) => {
  const current = event.target.closest('[role="tab"][data-dock]');
  if (!current) return;
  const tabs = $$('[role="tab"][data-dock]', event.currentTarget), index = tabs.indexOf(current);
  let next;
  if (["ArrowRight", "ArrowDown"].includes(event.key)) next = tabs[(index + 1) % tabs.length];
  if (["ArrowLeft", "ArrowUp"].includes(event.key)) next = tabs[(index - 1 + tabs.length) % tabs.length];
  if (event.key === "Home") next = tabs[0];
  if (event.key === "End") next = tabs.at(-1);
  if (next) { event.preventDefault(); showDock(next.dataset.dock); next.focus(); }
});

$("#constellation").addEventListener("keydown", (event) => {
  if (!["Enter", " "].includes(event.key)) return;
  const node = event.target.closest(".sky-node"); if (!node) return;
  event.preventDefault(); selectObject(node.dataset.objectType, node.dataset.objectId, true);
});

$("#object-filter").addEventListener("input", (event) => { filter = lower(event.target.value.trim()); renderNavigation(); });
$("#refresh").addEventListener("click", () => client.refresh().catch(toast));
$("#pause-stream").addEventListener("click", () => client.pause());
$("#resume-stream").addEventListener("click", () => client.resume().catch(toast));
$("#toggle-connection").addEventListener("click", () => snapshot.connection.status === "disconnected" ? client.connect().catch(toast) : client.disconnect());
$("#new-classic-plan").addEventListener("click", async () => { try { const result = await client.createProjectPlan({ content: defaultPlanContent("classic") }); await client.refreshPlans(); await openPlan(result.planId); } catch (error) { toast(error); } });
$("#new-managed-plan").addEventListener("click", async () => { try { const result = await client.createProjectPlan({ content: defaultPlanContent("managed") }); await client.refreshPlans(); await openPlan(result.planId); } catch (error) { toast(error); } });
$("#planning-assist").addEventListener("click", startAssistance);
$("#actions-panel").addEventListener("click", async (event) => {
  if (!event.target.closest('[data-special-button="showcase-target"]')) return;
  const targetGenerations = Number($('[data-special="showcase"] [name="targetGenerations"]').value || 10);
  await runCommand("set-showcase-target", { targetGenerations });
});
$("#assistance-workspace").addEventListener("click", async (event) => {
  if (!event.target.closest("#create-proposal") || !snapshot.assistanceDetail?.proposedContent) return;
  try { const result = await client.createProjectPlan({ content: snapshot.assistanceDetail.proposedContent }); await client.refreshPlans(); await openPlan(result.planId); } catch (error) { toast(error); }
});

client.subscribe((next) => { snapshot = next; scheduleRender(); if (next.assistanceDetail) renderAssistance(); });
client.connect().catch((error) => { toast(error); scheduleRender(); });
