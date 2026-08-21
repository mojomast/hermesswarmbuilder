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
let assistanceListMode = true;
const pendingCommands = new Set();
let lastCommand = null;

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
function age(value) {
  if (!value) return "not reported";
  const elapsed = Date.now() - new Date(value).valueOf();
  if (!Number.isFinite(elapsed)) return String(value);
  if (elapsed < 60_000) return `${Math.max(0, Math.round(elapsed / 1000))}s ago`;
  if (elapsed < 3_600_000) return `${Math.round(elapsed / 60_000)}m ago`;
  return `${Math.round(elapsed / 3_600_000)}h ago`;
}
function asRecord(value, fallbackReason = "") {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  return value ? { reason: String(value) } : fallbackReason ? { reason: fallbackReason } : null;
}

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
      runId: first(source.runId, model.state?.currentRunId),
      stateOwned: true,
      status: first(source.status, "idle"),
      task: first(source.currentTask, source.task, source.currentPhase, model.state?.phase, "Awaiting work")
    });
  }
  for (const event of model.events) {
    const id = first(event.agentId, event.data?.agentId, event.source);
    if (!id || id === "system" || id === "operator") continue;
    const existing = map.get(id) || { id, label: id, role: inferRole(id), status: "observed", task: first(event.message, event.type), eventDerived: true };
    const activity = [...arr(existing.activity), event].slice(-40);
    map.set(id, {
      ...existing,
      runId: existing.stateOwned ? existing.runId : first(event.runId, event.data?.runId, existing.runId),
      activity,
      lastEvent: event,
      lastSeenAt: event.ts,
      latestError: event.level === "error" || event.data?.error ? event : existing.latestError,
      status: isBlocked(existing.status) ? existing.status : event.level === "error" ? "error" : existing.status,
      task: first(existing.currentTask, existing.task, event.message, event.type)
    });
  }
  return [...map.values()].map((agent) => {
    const activity = arr(agent.activity).filter((event) => !agent.runId || event.runId === agent.runId);
    const lastEvent = activity.at(-1) || null;
    const latestError = activity.slice().reverse().find((event) => event.level === "error" || event.data?.error);
    return { ...agent, activity, lastEvent, lastSeenAt: lastEvent?.ts || agent.updatedAt, latestError };
  }).sort((a, b) => a.role.localeCompare(b.role) || a.id.localeCompare(b.id));
}

function deriveBlockers(model) {
  const state = model.state || {};
  const sources = [
    ...arr(state.blockers),
    asRecord(state.block),
    asRecord(state.blocker),
    asRecord(state.hold, isBlocked(state.status) ? state.lastAction : "")
  ].filter(Boolean);
  const seen = new Set();
  return sources.map((source, index) => {
    const runId = first(source.runId, state.currentRunId, "");
    const agentId = first(source.agentId, source.ownerAgentId, "");
    const reason = first(source.reason, source.message, source.error, source.description, state.lastAction, "Blocked without a reported reason");
    const id = String(first(source.id, `${runId || "current"}:${agentId || source.phase || index}:${reason}`)).slice(0, 180);
    if (seen.has(id)) return null;
    seen.add(id);
    return {
      ...source, id, runId, agentId, reason,
      status: first(source.status, state.status, "blocked"),
      phase: first(source.phase, state.phase, "blocked"),
      since: first(source.since, source.startedAt, source.createdAt, state.updatedAt),
      owner: first(source.owner, source.agent, agentId, "not reported"),
      suggestedAction: first(source.suggestedAction, source.safeRecoveryAction, source.recoveryAction, "Inspect run evidence before choosing a recovery action."),
      artifact: first(source.artifact, source.artifactPath, source.failureArtifact),
      log: first(source.log, source.logPath),
      toolCallId: first(source.toolCallId, source.callId)
    };
  }).filter(Boolean);
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
  const blockers = deriveBlockers(model);
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
  for (const blocker of blockers) result.push({ type: "blocker", id: blocker.id, label: short(blocker.reason, 54), status: blocker.status, role: first(blocker.phase, "anomaly"), relationship: `Affects ${blocker.agentId ? `agent ${blocker.agentId}` : blocker.runId ? `run ${blocker.runId}` : "the current workflow"}`, data: blocker });
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

function focusLocator(node) {
  if (!(node instanceof Element) || node === document.body) return null;
  if (node.id) return `#${CSS.escape(node.id)}`;
  const scope = node.closest("#semantic-network") ? "#semantic-network " : node.closest("#navigate-panel") ? "#navigate-panel " : node.closest("#inspect-panel") ? "#inspect-panel " : node.closest("#actions-panel") ? "#actions-panel " : "";
  for (const name of ["data-object-id", "data-select-id", "data-context-action", "data-load-run", "data-load-artifact", "data-load-log", "data-gate-field", "data-gate-decision", "data-gate-evidence", "data-gate-update", "data-command", "aria-label"]) {
    if (node.hasAttribute(name)) return `${scope}${node.tagName.toLowerCase()}[${name}="${CSS.escape(node.getAttribute(name))}"]`;
  }
  return null;
}

function actionDrafts() {
  return $$(".action-card input, .action-card textarea, .action-card select", $("#actions-panel")).map((control) => {
    const card = control.closest(".action-card").querySelector("h4")?.textContent || "card";
    const key = `${card}|${control.name || control.getAttribute("data-gate-field") || control.getAttribute("aria-label") || control.type}`;
    return [key, control.type === "checkbox" ? control.checked : control.value];
  });
}

function restoreActionDrafts(drafts) {
  const values = new Map(drafts);
  for (const control of $$(".action-card input, .action-card textarea, .action-card select", $("#actions-panel"))) {
    const card = control.closest(".action-card").querySelector("h4")?.textContent || "card";
    const key = `${card}|${control.name || control.getAttribute("data-gate-field") || control.getAttribute("aria-label") || control.type}`;
    if (!values.has(key)) continue;
    if (control.type === "checkbox") control.checked = values.get(key); else control.value = values.get(key);
  }
}

function render() {
  const focused = document.activeElement;
  const focusSelector = focusLocator(focused);
  const drafts = actionDrafts();
  objects = deriveObjects(snapshot);
  relationships = deriveRelationships(snapshot);
  const refreshed = objects.find((item) => item.type === selected.type && item.id === selected.id);
  if (refreshed) selected = refreshed;
  else if (!["event", "tool", "audit", "artifact", "log", "document"].includes(selected.type)) selected = objects[0];
  $("#phase-kicker").textContent = `${first(snapshot.state?.phase, snapshot.state?.status, "idle")} / ${snapshot.connection.status}`.toUpperCase();
  $("#objective").textContent = currentObjective();
  const connection = $("#connection");
  connection.textContent = snapshot.connection.status.toUpperCase();
  connection.className = `signal ${snapshot.connection.status}`;
  const signalTime = first(snapshot.connection.lastMessageAt, snapshot.connection.lastRefreshAt);
  $("#freshness").textContent = snapshot.connection.paused ? `VIEW FROZEN / ${age(signalTime)}` : `${snapshot.connection.transport || "no transport"} / ${age(signalTime)}`.toUpperCase();
  $("#toggle-connection").textContent = snapshot.connection.status === "disconnected" ? "Reconnect" : "Disconnect";
  renderMap();
  renderIndex();
  renderSemanticTables();
  renderNavigation();
  renderInspector();
  renderActionState();
  renderPlans();
  restoreActionDrafts(drafts);
  if (focusSelector) $(focusSelector)?.focus({ preventScroll: true });
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
  const clusters = { queue: { x: 1010, y: 180 }, gate: { x: 1030, y: 380 }, plan: { x: 990, y: 590 }, iteration: { x: 240, y: 165 }, blocker: { x: 600, y: 90 } };
  for (const [type, center] of Object.entries(clusters)) {
    objects.filter((item) => item.type === type).slice(0, 5).forEach((item, index, list) => {
      const point = polar(center.x, center.y, list.length === 1 ? 0 : 32 + index * 5, index * (360 / list.length));
      positions.set(`${type}:${item.id}`, point);
    });
  }
  return positions;
}

function appendNode(layer, item, point, compact = false) {
  const isSelected = selected.type === item.type && selected.id === item.id;
  const group = svgEl("g", {
    class: `sky-node ${item.type} ${isBlocked(item.status) ? "blocked" : ""} ${isSelected ? "selected" : ""}`,
    transform: `translate(${point.x} ${point.y})`, tabindex: isSelected || (item.type === "orchestrator" && !objects.some((entry) => entry.type === selected.type && entry.id === selected.id)) ? "0" : "-1", role: "button",
    "aria-label": `${item.type}: ${item.label}; status ${item.status}; ${item.relationship}`,
    "data-object-type": item.type, "data-object-id": item.id
  });
  const size = item.type === "orchestrator" ? 47 : compact ? 21 : 27;
  group.append(svgEl("circle", { class: "halo", r: size + 8 }));
  if (["run", "queue"].includes(item.type)) group.append(svgEl("rect", { class: "body", x: -size, y: -size, width: size * 2, height: size * 2, rx: item.type === "queue" ? 10 : 2 }));
  else if (item.type === "blocker") group.append(svgEl("path", { class: "body", d: `M0 ${-size}L${size} ${size}H${-size}Z` }));
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
  const counts = (type, shown = 5) => `${type.toUpperCase()} ${Math.min(objects.filter((item) => item.type === type).length, shown)}/${objects.filter((item) => item.type === type).length}`;
  const clusterLabels = [[1010, 112, counts("queue")], [1030, 312, counts("gate")], [990, 522, counts("plan")], [240, 97, counts("iteration")], [600, 35, counts("blocker")], [180, 662, counts("run")]];
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
  for (const blocker of objects.filter((item) => item.type === "blocker").slice(0, 5)) {
    const source = positions.get(`blocker:${blocker.id}`);
    const target = positions.get(`agent:${blocker.data.agentId}`) || positions.get(`run:${blocker.data.runId}`) || positions.get("orchestrator:orchestrator");
    if (source && target) pathLayer.append(svgEl("path", { d: `M${source.x} ${source.y}L${target.x} ${target.y}`, class: "relationship anomaly-link", role: "none" }));
  }
  const overviewTypes = new Set(["orchestrator", "agent", "run", "queue", "gate", "plan", "iteration", "blocker"]);
  for (const item of objects) {
    if (!overviewTypes.has(item.type)) continue;
    const point = positions.get(`${item.type}:${item.id}`);
    if (point) appendNode(nodeLayer, item, point, ["queue", "gate", "plan", "iteration", "blocker"].includes(item.type));
  }
}

function inspectButton(item, text = "Inspect") {
  return el("button", { type: "button", text, "data-select-type": item.type, "data-select-id": item.id });
}

function renderIndex() {
  const index = $("#node-index");
  const navigable = objects.filter((item) => ["orchestrator", "agent", "run", "queue", "gate", "plan", "iteration", "blocker"].includes(item.type));
  const buttons = navigable.map((item, position) => {
    const active = selected.type === item.type && selected.id === item.id;
    const button = el("button", {
      type: "button", class: "index-node", tabindex: active || (!navigable.some((entry) => entry.type === selected.type && entry.id === selected.id) && position === 0) ? "0" : "-1",
      "aria-current": active ? "true" : null, "data-type": item.type, "data-select-type": item.type, "data-select-id": item.id
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
    blocker: objects.filter((item) => item.type === "blocker"),
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
  if (selected.type === "run" && snapshot.selectedRunId === selected.id && snapshot.selectedRun?.run) return snapshot.selectedRun.run;
  if (selected.type === "iteration" && snapshot.selectedIterationId === selected.id && snapshot.iterationDetail) return snapshot.iterationDetail;
  return selected.data || {};
}

function selectionRunId(item = selected) {
  const data = item.data || selectedData();
  if (item.type === "run") return item.id;
  return first(data.runId, data.currentRunId, data.sourceRunId, data.lastEvent?.runId, data.lastEvent?.data?.runId,
    item.type === "orchestrator" || item.type === "blocker" ? snapshot.state?.currentRunId : "");
}

function relatedEvents(item = selected) {
  const data = item.data || {};
  const runId = selectionRunId(item);
  return relationships.filter((entry) => {
    if (["event", "tool"].includes(item.type)) return entry.id === item.id;
    if (item.type === "agent") return (entry.source === item.id || entry.data?.agentId === item.id) && (!runId || entry.runId === runId);
    if (item.type === "run") return entry.runId === item.id;
    if (item.type === "blocker") return (data.toolCallId && entry.data?.data?.toolCallId === data.toolCallId) || (runId && entry.runId === runId && (!data.agentId || entry.source === data.agentId || entry.data?.agentId === data.agentId));
    return runId && entry.runId === runId;
  }).slice(-20).reverse();
}

function selectedBlocker() {
  if (selected.type === "blocker") return selected.data;
  const runId = selectionRunId();
  const projected = objects.find((item) => item.type === "blocker" && (
    (selected.type === "agent" && item.data.agentId === selected.id) ||
    (runId && item.data.runId === runId) ||
    (selected.type === "orchestrator" && item.data.runId === snapshot.state?.currentRunId)
  ))?.data;
  if (projected) return projected;
  const data = selectedData();
  const local = asRecord(first(data.block, data.blocker, data.hold, isBlocked(data.status) ? first(data.error, data.lastAction, data.lastMessage) : ""));
  if (!local) return null;
  return {
    ...local, runId, agentId: selected.type === "agent" ? selected.id : first(local.agentId, ""),
    status: first(local.status, data.status, "blocked"), phase: first(local.phase, data.phase, "blocked"),
    reason: first(local.reason, local.message, local.error, "Blocked without a reported reason"),
    since: first(local.since, local.startedAt, data.updatedAt), owner: first(local.owner, local.agentId, "not reported"),
    suggestedAction: first(local.suggestedAction, local.safeRecoveryAction, "Inspect run evidence before choosing a recovery action."),
    artifact: first(local.artifact, local.artifactPath), log: first(local.log, local.logPath), toolCallId: first(local.toolCallId, local.callId)
  };
}

function dossierFields(fields) {
  return el("dl", { class: "dossier-fields" }, fields.filter(([, value]) => value !== undefined && value !== null && value !== "").flatMap(([term, value]) => [el("dt", { text: term }), el("dd", { text: String(value) })]));
}

function contextAction(text, action, className = "") {
  return el("button", { type: "button", text, class: className, "data-context-action": action });
}

function eventTrack(events) {
  if (!events.length) return el("p", { class: "empty", text: "No correlated telemetry retained for this selection." });
  return el("ol", { class: "event-track" }, events.map((entry) => el("li", { class: isBlocked(entry.status) ? "error" : "" }, [
    el("button", { type: "button", "data-select-type": entry.kind, "data-select-id": entry.id }, [el("b", { text: short(entry.label, 50) }), el("small", { text: `${entry.kind} / ${entry.source} / ${age(entry.ts)}` })]),
    entry.data?.data?.durationMs ? el("span", { text: `${entry.data.data.durationMs}ms` }) : null
  ])));
}

function renderSelectionContext() {
  const data = selectedData();
  const runId = selectionRunId();
  const currentRun = snapshot.state?.currentRunId;
  const blocker = selectedBlocker();
  const iteration = associatedIteration();
  const events = relatedEvents();
  const sections = [];
  if (selected.type === "agent") {
    sections.push(el("section", { class: "dossier-section" }, [el("h3", { text: "Agent activity" }), dossierFields([
      ["Current run", runId || "not reported"], ["Phase", first(data.currentPhase, data.phase, runId === currentRun ? snapshot.state?.phase : "", "not reported")],
      ["Current task", first(data.currentTask, data.task, "not reported")], ["Last message", first(data.lastMessage, data.lastEvent?.message, "not reported")],
      ["Last seen", data.lastSeenAt ? `${date(data.lastSeenAt)} / ${age(data.lastSeenAt)}` : "not reported"],
      ["Current artifact", data.currentArtifact], ["Agent log", data.logPath], ["Latest error", first(data.latestError?.data?.error, data.latestError?.message)]
    ]), el("div", { class: "context-actions" }, [runId ? contextAction("Inspect owning run", "inspect-run") : null, contextAction("Open run controls", "open-actions")]) ]));
  }
  if (selected.type === "run") {
    const iteration = associatedIteration();
    sections.push(el("section", { class: "dossier-section" }, [el("h3", { text: "Run flight record" }), dossierFields([
      ["Run", selected.id], ["Objective", first(data.objective, data.selectedProject, data.currentProject, selected.id === currentRun ? currentObjective() : "not reported")],
      ["Phase", first(data.phase, snapshot.state?.currentRunId === selected.id ? snapshot.state?.phase : "not reported")],
      ["Current task", first(data.currentTask, data.task, snapshot.state?.currentRunId === selected.id ? snapshot.state?.currentTask : "")],
      ["Last action", first(data.lastAction, snapshot.state?.currentRunId === selected.id ? snapshot.state?.lastAction : "")],
      ["Repository", first(data.repoPath, data.repository, "not reported")], ["Started", date(data.startedAt)], ["Completed", date(data.completedAt)]
    ]), el("div", { class: "context-actions" }, [selected.id === currentRun ? contextAction("Manage current run", "open-actions") : iteration ? contextAction("Prepare continuation", "prepare-continuation") : contextAction("Review evidence and plans", "open-actions")]) ]));
  }
  if (blocker) {
    const isCurrent = !blocker.runId || blocker.runId === currentRun;
    const pending = arr(snapshot.control?.deblockRequests).filter((item) => !blocker.runId || item.runId === blocker.runId);
    sections.push(el("section", { class: "dossier-section anomaly-dossier" }, [
      el("div", { class: "dossier-heading" }, [el("h3", { text: "Anomaly track" }), el("span", { text: isCurrent ? "CURRENT RUN" : "HISTORICAL" })]),
      el("p", { class: "anomaly-reason", text: blocker.reason }), dossierFields([
        ["Affected run", blocker.runId || currentRun || "not reported"], ["Affected agent", blocker.agentId || "not reported"], ["Phase", blocker.phase],
        ["Owner", blocker.owner], ["First seen", blocker.since ? `${date(blocker.since)} / ${age(blocker.since)}` : "not reported"],
        ["Tool call", blocker.toolCallId], ["Artifact", blocker.artifact], ["Log", blocker.log],
        ["Safest reported action", blocker.suggestedAction], ["Recovery requests", pending.length ? pending.map((item) => `${item.status || "pending"} ${item.id || ""}`).join(", ") : "none"]
      ]),
      el("p", { class: "safety-note", text: isCurrent ? "Deblock records steering for the current orchestrator. Managed terminal work must continue in a new lineage request." : "Historical runs are evidence-only. Create a continuation, fork, or a new reviewed plan; do not target them with the current-run deblock command." }),
      el("div", { class: "context-actions" }, [
        blocker.runId ? contextAction("Inspect affected run", "inspect-run") : null,
        isCurrent ? contextAction("Ask recovery adviser", "prepare-advice") : null,
        isCurrent ? contextAction("Prepare deblock instruction", "prepare-deblock", "primary") : null,
        iteration ? contextAction("Prepare continuation", "prepare-continuation") : null, iteration ? contextAction("Prepare fork", "prepare-fork") : null
      ])
    ]));
  }
  if (["agent", "run", "blocker", "event", "tool", "iteration"].includes(selected.type)) {
    sections.push(el("section", { class: "dossier-section" }, [el("h3", { text: `Recent correlated telemetry (${events.length})` }), eventTrack(events)]));
  }
  if (["queue", "gate"].includes(selected.type)) sections.push(el("section", { class: "dossier-section" }, [el("h3", { text: `${selected.type === "gate" ? "Gate" : "Queue"} control` }), el("p", { text: selected.type === "gate" ? "Open controls to record a decision, attach evidence references, or update this gate. Gate records do not create required evidence files." : "Open controls to pin or archive this queue item. Inspect its objective and constraints before changing priority." }), contextAction(`Manage ${selected.type}`, "open-actions") ]));
  replace($("#selection-context"), sections);
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
  renderSelectionContext();
  const actions = [];
  const runId = selectionRunId();
  if (selected.type === "run") {
    actions.push(el("button", { type: "button", text: "Load run resources", "data-load-run": selected.id }));
    actions.push(el("button", { type: "button", text: "Open SPEC", "data-load-document": "spec" }));
    actions.push(el("button", { type: "button", text: "Open DEVPLAN", "data-load-document": "devplan" }));
  }
  if (selected.type === "iteration") actions.push(el("button", { type: "button", text: "Load iteration evidence", "data-load-iteration": selected.id }));
  if (selected.type === "plan") actions.push(el("button", { type: "button", text: "Open plan workspace", "data-open-plan": selected.id }));
  if (runId && snapshot.selectedRunId === runId && snapshot.selectedRun?.artifacts?.length) actions.push(...snapshot.selectedRun.artifacts.map((item) => el("button", { type: "button", text: `Artifact: ${short(item.name || item.path, 28)}`, "data-load-artifact": item.name || item.path, "data-resource-run": runId })));
  if (runId && snapshot.selectedRunId === runId && snapshot.selectedRun?.logs?.length) actions.push(...snapshot.selectedRun.logs.map((item) => el("button", { type: "button", text: `Log: ${short(item.name || item.path, 28)}`, "data-load-log": item.name || item.path, "data-resource-run": runId })));
  replace($("#resource-actions"), actions);
  const inspector = $("#object-inspector");
  inspector.className = "tree";
  replace(inspector, treeView(data, selected.type));
}

function actionCard(title, body, actions = []) {
  return el("article", { class: "action-card" }, [el("h4", { text: title }), el("p", { text: body }), el("div", { class: "actions" }, actions)]);
}

function commandButton(text, command, payload = {}, className = "") {
  const button = el("button", { type: "button", text, class: className, "data-command": command });
  button._payload = payload;
  return button;
}

function renderActionState() {
  const state = snapshot.state || {};
  const control = snapshot.control || {};
  const selectedRun = selectionRunId();
  const auto = control.autoIteration || {};
  const controlFields = dossierFields([
    ["Selected target", selectedRun || "none"], ["Current run", state.currentRunId || "none"], ["Observed workflow", first(state.phase, state.status, "idle")],
    ["Run admission", first(control.runAdmission, "enabled")], ["Pause request", control.pause?.requested ? `${control.pause.mode || "checkpoint"}: ${control.pause.reason || "requested"}` : "none"],
    ["Stop request", control.stop?.requested ? `${control.stop.mode || "graceful"}: ${control.stop.reason || "requested"}` : "none"], ["Run-now request", control.requestedRunNow ? "pending next runner tick" : "none"],
    ["Next run request", control.nextRunRequest ? `${control.nextRunRequest.status || "pending"} / ${control.nextRunRequest.id || "unidentified"}` : "none"],
    ["Showcase loop", auto.enabled ? `${auto.paused ? "paused" : "enabled"} / generation ${first(auto.currentGeneration, 1)} of ${first(auto.targetGenerations, auto.maxIterations, 1)}` : "disabled"],
    ["Last command", lastCommand ? `${lastCommand.type} / ${lastCommand.status} / ${age(lastCommand.at)}` : "none this session"]
  ]);
  replace($("#control-state"), [el("h3", { text: "Control-plane state" }), controlFields, el("p", { class: "safety-note", text: "Requested controls are persisted intent. Pause and stop are observed at runner checkpoints; accepted does not mean completed." })]);
  const blocker = first(state.block, state.blocker, state.hold, objects.find((item) => item.type === "blocker")?.data, isBlocked(state.status) ? state.lastAction : "");
  $("#blocker-indicator").textContent = blocker ? "ACTION" : "CLEAR";
  const blockRecord = asRecord(blocker);
  const blockObject = objects.find((item) => item.type === "blocker" && (blockRecord?.id ? item.data.id === blockRecord.id : item.data.reason === first(blockRecord?.reason, blockRecord?.message, blockRecord?.error) && item.data.runId === first(blockRecord?.runId, state.currentRunId, "") && item.data.agentId === first(blockRecord?.agentId, blockRecord?.ownerAgentId, "") && item.data.phase === first(blockRecord?.phase, state.phase, "blocked") && item.data.since === first(blockRecord?.since, blockRecord?.startedAt, blockRecord?.createdAt, state.updatedAt)));
  replace($("#blocker-detail"), blockRecord ? actionCard("Active anomaly", first(blockRecord.reason, blockRecord.message, blockRecord.error, "Blocker details are available from the anomaly node."), blockObject ? [commandButton("Inspect anomaly", "_select", { type: "blocker", id: blockObject.id })] : []) : el("p", { class: "empty", text: "No active blocker reported." }));
  const advice = arr(control.deblockAdvice);
  replace($("#advice-list"), advice.map((item) => actionCard(`Advice ${item.status}`, first(item.answer, item.prompt), item.status === "pending" ? [
    commandButton("Approve", "approve-deblock-advice", { adviceId: item.id }, "primary"), commandButton("Deny", "deny-deblock-advice", { adviceId: item.id }, "danger")
  ] : [])));
  replace($("#steering-list"), arr(snapshot.control?.activeSteering).map((item) => actionCard(first(item.scope, "steering"), item.text, [commandButton("Remove", "remove-steering", { id: item.id }, "danger")])));
  replace($("#queue-actions"), arr(snapshot.queue?.items).map((item) => actionCard(`${item.title || item.id} / ${item.status}`, item.objective, [
    commandButton("Inspect", "_select", { type: "queue", id: item.id }), commandButton("Pin", "pin-queue-item", { id: item.id }), commandButton("Archive", "archive-queue-item", { id: item.id }, "danger")
  ])));
  replace($("#gate-actions"), arr(snapshot.gates?.gates).map((gate) => {
    const status = el("select", { "aria-label": `Decision for ${gate.id}` }, [el("option", { value: "", text: "Choose decision" }), el("option", { value: "passed", text: "passed" }), el("option", { value: "needs-evidence", text: "needs evidence" }), el("option", { value: "failed", text: "failed" })]);
    const evidence = el("input", { placeholder: "Evidence artifact paths, comma-separated", "aria-label": `Evidence for ${gate.id}`, "data-gate-field": "evidence" });
    const notes = el("input", { placeholder: "Operator notes", "aria-label": `Notes for ${gate.id}`, "data-gate-field": "notes" });
    const description = el("input", { value: first(gate.description, gate.title), "aria-label": `Description for ${gate.id}`, "data-gate-field": "description" });
    const decide = el("button", { type: "button", text: "Record decision", "data-gate-decision": gate.id });
    const attach = el("button", { type: "button", text: "Attach evidence", "data-gate-evidence": gate.id });
    const update = el("button", { type: "button", text: "Update gate", "data-gate-update": gate.id });
    return actionCard(`${gate.id} / ${gate.status || "pending"}`, `${first(gate.description, gate.title)}${arr(gate.requiredEvidence).length ? ` / requires: ${arr(gate.requiredEvidence).join(", ")}` : ""}`, [status, evidence, notes, decide, attach, description, update]);
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
  $$('[data-command]').forEach((button) => { if (button.dataset.command !== "_select") button.disabled = pendingCommands.has(button.dataset.command); });
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
  const runId = selectionRunId(item);
  if (runId && snapshot.selectedRunId !== runId) client.selectRun(runId).catch(toast);
  if (item.type === "iteration" && snapshot.selectedIterationId !== item.id) client.selectIteration(item.id).catch(toast);
  const runIteration = item.type === "run" ? arr(snapshot.iterations).find((iteration) => iteration.runId === item.id) : null;
  if (runIteration && snapshot.selectedIterationId !== runIteration.id) client.selectIteration(runIteration.id).catch(toast);
  if (focusDock) { showDock("inspect"); $("#selection-title").focus({ preventScroll: true }); }
}

function associatedIteration() {
  if (selected.type === "iteration") return selectedData();
  const runId = selectionRunId();
  return arr(snapshot.iterations).find((item) => item.runId === runId) || (snapshot.iterationDetail?.runId === runId ? snapshot.iterationDetail : null);
}

function prepareContextAction(action) {
  const runId = selectionRunId();
  const blocker = selectedBlocker();
  if (action === "inspect-run" && runId) { selectObject("run", runId, true); return; }
  showDock("actions");
  if (action === "open-actions") {
    const section = selected.type === "gate" ? $("#gates-section") : selected.type === "queue" ? $("#queue-section") : $("#operations-section");
    section.open = true;
    section.scrollIntoView({ block: "start", behavior: globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    $("summary", section).focus();
    return;
  }
  if (action === "prepare-advice" || action === "prepare-deblock") {
    const section = $("#deblock-section"); section.open = true;
    const form = $(`[data-command-form="${action === "prepare-advice" ? "deblock-advice" : "deblock"}"]`);
    form.elements.prompt.value ||= action === "prepare-advice" ? `Recommend the smallest safe recovery for: ${blocker?.reason || "the current blocker"}` : first(blocker?.suggestedAction, `Investigate and safely recover from: ${blocker?.reason || "the current blocker"}`);
    form.elements.prompt.focus();
    return;
  }
  if (["prepare-continuation", "prepare-fork"].includes(action)) {
    const section = $("#lineage-section"); section.open = true;
    const form = $('[data-special="lineage"]');
    const iteration = associatedIteration() || {};
    form.elements.mode.value = action === "prepare-fork" ? "fork-from-iteration" : "continue-from-iteration";
    form.elements.repoPath.value ||= first(iteration.repoPath, selectedData().repoPath, snapshot.control?.autoIteration?.repoPath, snapshot.state?.repoPath);
    form.elements.baseRef.value = first(iteration.commit, iteration.baseRef, selectedData().baseRef, "HEAD");
    form.elements.objective.value ||= first(iteration.objective, selectedData().objective, currentObjective());
    form.elements.changeText.value ||= first(blocker?.suggestedAction, "Apply the smallest bounded recovery described by the run handoff and preserved evidence.");
    form.elements.changeText.focus();
  }
}

function payloadFromForm(form) {
  const data = {};
  for (const [key, value] of new FormData(form).entries()) data[key] = value;
  for (const checkbox of $$('input[type="checkbox"]', form)) data[checkbox.name] = checkbox.checked;
  data.runId ||= snapshot.state?.currentRunId || "";
  return data;
}

async function runCommand(type, payload = {}, confirmText = "") {
  if (type === "_select") { if (payload.id) selectObject(payload.type, payload.id, true); return; }
  const destructive = {
    stop: "Request a graceful stop for the current run at its next safe checkpoint?",
    "stop-showcase-loop": "Stop the showcase loop and clear its pending iteration request?",
    "clear-queue": "Clear queued work and queue-linked steering? Pause and stop controls will be preserved.",
    "archive-queue-item": `Archive queue item ${payload.id || ""}?`
  };
  confirmText ||= destructive[type] || "";
  if (confirmText && !globalThis.confirm(confirmText)) return;
  if (pendingCommands.has(type)) return;
  const notice = $("#action-notice");
  const staleMs = Date.now() - new Date(first(snapshot.connection.lastRefreshAt, snapshot.connection.lastMessageAt, 0)).valueOf();
  pendingCommands.add(type);
  const submittedRunId = payload.runId;
  lastCommand = { type, target: "refreshing control plane", status: "validating", at: new Date().toISOString() };
  notice.className = "notice"; notice.textContent = `Validating ${type} against current control state...`;
  scheduleRender();
  try {
    if (Number.isFinite(staleMs) && staleMs > 30_000) await client.refresh();
    if (["deblock", "deblock-advice"].includes(type)) {
      const currentRunId = snapshot.state?.currentRunId;
      const activeBlocker = first(snapshot.state?.block, snapshot.state?.blocker, snapshot.state?.hold, arr(snapshot.state?.blockers)[0], isBlocked(snapshot.state?.status) ? snapshot.state?.lastAction : "");
      if (!submittedRunId || !currentRunId) throw Object.assign(new Error("No current run is available for recovery. Inspect historical evidence and create a continuation, fork, or reviewed plan instead."), { status: 409 });
      if (submittedRunId !== currentRunId) throw Object.assign(new Error("The current run changed while validating this recovery. Inspect the new state before submitting another deblock action."), { status: 409 });
      if (!activeBlocker) throw Object.assign(new Error("The current run no longer reports an active blocker. Refresh its dossier before issuing recovery guidance."), { status: 409 });
    }
    lastCommand = { ...lastCommand, target: first(payload.gateId, payload.id, payload.sourceIterationId, payload.runId, payload.sourceRunId, snapshot.state?.currentRunId, "control plane") };
    lastCommand = { ...lastCommand, status: "sending" };
    const correlationId = globalThis.crypto?.randomUUID?.() || `constellation-${Date.now()}`;
    const result = await client.command(type, payload, { actor: "constellation-operator", correlationId, idempotencyKey: `${type}-${correlationId}`, refresh: true });
    lastCommand = { ...lastCommand, status: "accepted", commandId: result.commandId || null, at: new Date().toISOString() };
    notice.textContent = `${type} intent accepted for ${lastCommand.target}${result.commandId ? ` / ${result.commandId}` : ""}. Confirm observed state above.`;
  } catch (error) {
    lastCommand = { ...lastCommand, status: error.status == null ? "outcome unknown" : "rejected", at: new Date().toISOString() };
    notice.className = "notice error";
    notice.textContent = `${type} failed: ${error.message}${error.details?.length ? ` / ${error.details.join("; ")}` : ""}`;
  } finally {
    pendingCommands.delete(type);
    scheduleRender();
  }
}

async function openPlan(id) {
  try {
    planDetail = await client.getProjectPlan(id);
    showDock("plans"); renderPlans(); $("#plans-tab").focus();
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
  try { assistanceListMode = true; await client.listPlanAssistance(); showDock("plans"); $("#assistance-section").open = true; renderAssistance(); $("#assistance-section summary").focus(); } catch (error) { toast(error); }
}

async function createAssistance(pipelineType) {
  try { assistanceListMode = false; await client.createPlanAssistance(pipelineType); renderAssistance(); } catch (error) { toast(error); }
}

function renderAssistance() {
  const detail = snapshot.assistanceDetail;
  const workspace = $("#assistance-workspace");
  if (!detail || assistanceListMode) {
    const signature = `list:${snapshot.assistance.map((item) => `${item.id}:${item.version || item.messageCount}`).join("|")}`;
    if (workspace.dataset.signature === signature) return;
    workspace.dataset.signature = signature;
    replace(workspace, [el("p", { class: "empty", text: "Planning assistance is discussion only and does not save, approve, launch, or execute." }), el("div", { class: "context-actions" }, [el("button", { type: "button", text: "New classic conversation", "data-new-assistance": "classic" }), el("button", { type: "button", text: "New managed conversation", "data-new-assistance": "managed" })]), ...snapshot.assistance.map((item) => el("button", { type: "button", class: "object-row", text: `${item.pipelineType} / ${item.messageCount} messages`, "data-assistance-id": item.id }))]);
    return;
  }
  const signature = `${detail.id}:${detail.version}:${detail.messages?.length || 0}:${Boolean(detail.proposedContent)}`;
  if (workspace.dataset.signature === signature) return;
  workspace.dataset.signature = signature;
  const log = el("div", { class: "assist-log", role: "log", "aria-live": "polite" }, arr(detail.messages).map((message) => el("article", { class: `assist-message ${message.role}` }, [el("b", { text: message.role }), el("p", { text: message.content }), el("small", { text: date(message.createdAt) })])));
  const form = el("form", { id: "assistance-form", class: "form-stack" }, [el("label", {}, [el("span", { text: "Planning message" }), el("textarea", { name: "message", maxlength: "16000", required: "" })]), el("button", { text: "Send to planning orchestrator" })]);
  const children = [el("button", { type: "button", text: "Back to conversations", id: "assistance-back" }), el("p", { class: "notice", text: "Messages may be sent to the configured inference provider. Suggestions do not mutate plans." }), log, form];
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
  const contextActionNode = event.target.closest("[data-context-action]");
  if (contextActionNode) { prepareContextAction(contextActionNode.dataset.contextAction); return; }
  const command = event.target.closest("[data-command]");
  if (command) { await runCommand(command.dataset.command, command._payload || { reason: "Constellation operator command" }, command.dataset.confirm || ""); return; }
  const loadRun = event.target.closest("[data-load-run]");
  if (loadRun) { try { await client.selectRun(loadRun.dataset.loadRun); } catch (error) { toast(error); } return; }
  const loadIteration = event.target.closest("[data-load-iteration]");
  if (loadIteration) { try { await client.selectIteration(loadIteration.dataset.loadIteration); selected.data = client.getSnapshot().iterationDetail; renderInspector(); } catch (error) { toast(error); } return; }
  const documentButton = event.target.closest("[data-load-document]");
  if (documentButton) { try { const result = await client.loadDocument(documentButton.dataset.loadDocument, selected.type === "run" ? selected.id : snapshot.selectedRunId); selected = { type: "document", id: result.name, label: result.name, status: "loaded", role: result.kind, data: result }; renderInspector(); } catch (error) { toast(error); } return; }
  const artifact = event.target.closest("[data-load-artifact]");
  if (artifact) { try { const result = await client.loadArtifact(artifact.dataset.loadArtifact, artifact.dataset.resourceRun); selected = { type: "artifact", id: result.name, label: result.name, status: "loaded", role: "run evidence", data: result }; renderInspector(); } catch (error) { toast(error); } return; }
  const log = event.target.closest("[data-load-log]");
  if (log) { try { const result = await client.loadLog(log.dataset.loadLog, log.dataset.resourceRun); selected = { type: "log", id: result.name, label: result.name, status: "loaded", role: "run evidence", data: result }; renderInspector(); } catch (error) { toast(error); } return; }
  const open = event.target.closest("[data-open-plan]"); if (open) { await openPlan(open.dataset.openPlan); return; }
  const plan = event.target.closest("[data-plan-action]"); if (plan) { await planAction(plan.dataset.planAction); return; }
  const gateDecision = event.target.closest("[data-gate-decision]");
  if (gateDecision) { const card = gateDecision.closest(".action-card"), status = $("select", card).value, evidenceArtifacts = $('[data-gate-field="evidence"]', card).value.split(",").map((item) => item.trim()).filter(Boolean), notes = $('[data-gate-field="notes"]', card).value; if (!status) { toast(new Error("Choose a gate decision before recording it.")); return; } await runCommand("gate-decision", { gateId: gateDecision.dataset.gateDecision, runId: selectionRunId() || snapshot.state?.currentRunId || null, status, decision: status, evidenceArtifacts, notes }); return; }
  const gateEvidence = event.target.closest("[data-gate-evidence]");
  if (gateEvidence) { const card = gateEvidence.closest(".action-card"), artifacts = $('[data-gate-field="evidence"]', card).value.split(",").map((item) => item.trim()).filter(Boolean), notes = $('[data-gate-field="notes"]', card).value; if (!artifacts.length) { toast(new Error("Enter at least one existing artifact path.")); return; } await runCommand("attach-gate-evidence", { gateId: gateEvidence.dataset.gateEvidence, runId: selectionRunId() || snapshot.state?.currentRunId || null, artifacts, notes }); return; }
  const gateUpdate = event.target.closest("[data-gate-update]");
  if (gateUpdate) { const description = $('[data-gate-field="description"]', gateUpdate.closest(".action-card")).value; await runCommand("update-gate", { gateId: gateUpdate.dataset.gateUpdate, description }); return; }
  const assistance = event.target.closest("[data-assistance-id]"); if (assistance) { try { assistanceListMode = false; await client.getPlanAssistance(assistance.dataset.assistanceId); renderAssistance(); } catch (error) { toast(error); } return; }
  const newAssistance = event.target.closest("[data-new-assistance]"); if (newAssistance) { await createAssistance(newAssistance.dataset.newAssistance); return; }
  if (event.target.closest("#assistance-back")) { assistanceListMode = true; await client.listPlanAssistance().catch(toast); renderAssistance(); return; }
});

document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  if (form.dataset.commandForm) {
    const payload = payloadFromForm(form);
    if (form.dataset.commandForm === "add-queue-item") {
      payload.acceptanceGateIds = String(payload.acceptanceGateIds || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
      payload.target = payload.preferredRepo ? { preferredRepo: payload.preferredRepo } : {};
      delete payload.preferredRepo;
    }
    await runCommand(form.dataset.commandForm, payload); return;
  }
  if (form.dataset.special === "showcase") {
    const payload = payloadFromForm(form), target = Number(payload.targetGenerations);
    payload.sourceRunId = snapshot.state?.currentRunId || snapshot.selectedRunId || null;
    payload.sourceIterationId = snapshot.selectedIterationId;
    payload.limits = iterationLimits(target);
    await runCommand("start-showcase-loop", payload); return;
  }
  if (form.dataset.special === "next-iteration") { await runCommand("start-next-iteration", { runId: snapshot.state?.currentRunId || snapshot.selectedRunId, repoPath: first(snapshot.control?.autoIteration?.repoPath, "/home/mojo/autonomous-projects/hermes-showcase-site"), objective: currentObjective(), changeText: form.elements.changeText.value, limits: iterationLimits() }); return; }
  if (form.dataset.special === "lineage") { const data = payloadFromForm(form), type = data.mode, iteration = associatedIteration() || {}, detail = snapshot.iterationDetail?.id === iteration.id || snapshot.iterationDetail?.runId === iteration.runId ? snapshot.iterationDetail : {}; delete data.mode; data.sourceRunId = selected.type === "run" ? selected.id : first(selected.data?.runId, iteration.runId, snapshot.selectedRunId, snapshot.state?.currentRunId); data.sourceIterationId = selected.type === "iteration" ? selected.id : first(iteration.id, snapshot.selectedIterationId); data.acceptanceGateIds = arr(first(detail.iterationState?.acceptanceGateIds, iteration.acceptanceGateIds)); data.snapshottedAcceptanceGates = arr(detail.iterationState?.acceptanceGates); data.limits = first(detail.iterationState?.limits, iteration.limits, iterationLimits()); await runCommand(type, data); return; }
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
  if (event.key === "ArrowRight") next = tabs[(index + 1) % tabs.length];
  if (event.key === "ArrowLeft") next = tabs[(index - 1 + tabs.length) % tabs.length];
  if (event.key === "Home") next = tabs[0];
  if (event.key === "End") next = tabs.at(-1);
  if (next) { event.preventDefault(); showDock(next.dataset.dock); next.focus(); }
});

$("#constellation").addEventListener("keydown", (event) => {
  const node = event.target.closest(".sky-node"); if (!node) return;
  if (["Enter", " "].includes(event.key)) { event.preventDefault(); selectObject(node.dataset.objectType, node.dataset.objectId, true); return; }
  const nodes = $$(".sky-node", event.currentTarget), index = nodes.indexOf(node);
  let next = null;
  if (["ArrowRight", "ArrowDown"].includes(event.key)) next = nodes[(index + 1) % nodes.length];
  if (["ArrowLeft", "ArrowUp"].includes(event.key)) next = nodes[(index - 1 + nodes.length) % nodes.length];
  if (event.key === "Home") next = nodes[0];
  if (event.key === "End") next = nodes.at(-1);
  if (next) { event.preventDefault(); nodes.forEach((item) => item.setAttribute("tabindex", "-1")); next.setAttribute("tabindex", "0"); next.focus(); }
});

$("#object-filter").addEventListener("input", (event) => { filter = lower(event.target.value.trim()); renderNavigation(); });
$("#refresh").addEventListener("click", () => client.refresh().catch(toast));
$("#pause-stream").addEventListener("click", () => client.pause());
$("#resume-stream").addEventListener("click", () => client.resume().catch(toast));
$("#toggle-connection").addEventListener("click", () => snapshot.connection.status === "disconnected" ? client.connect().catch(toast) : client.disconnect());
$("#new-classic-plan").addEventListener("click", async () => { try { const result = await client.createProjectPlan({ content: defaultPlanContent("classic") }); await client.refreshPlans(); await openPlan(result.planId); } catch (error) { toast(error); } });
$("#new-managed-plan").addEventListener("click", async () => { try { const result = await client.createProjectPlan({ content: defaultPlanContent("managed") }); await client.refreshPlans(); await openPlan(result.planId); } catch (error) { toast(error); } });
$("#planning-assist").addEventListener("click", startAssistance);
$("#actions-panel").addEventListener("focusout", () => scheduleRender());
$("#open-help").addEventListener("click", () => $("#help-dialog").showModal());
$("#close-help").addEventListener("click", () => $("#help-dialog").close());
$("#help-dialog").addEventListener("click", (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
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
