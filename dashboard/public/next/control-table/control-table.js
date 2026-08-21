import {
  createDashboardClient,
  OPERATION_COMMANDS,
  PROJECT_PLAN_ACTIONS,
  WORKFLOW_PHASES
} from "../../headless-dashboard-client.js";

const client = createDashboardClient({ maxEvents: 1000, eventLimit: 250, auditLimit: 200 });
const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const clip = (value, limit = 40000) => {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text && text.length > limit ? `${text.slice(0, limit)}\n... ${text.length - limit} characters omitted` : text || "";
};
const array = (value) => Array.isArray(value) ? value : value && typeof value === "object" ? Object.values(value) : value ? [value] : [];
const lines = (value) => String(value || "").split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
const formatTime = (value, full = false) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? String(value) : full ? date.toLocaleString() : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};
const statusClass = (value) => String(value || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-");
const idOf = (record) => record?.id || record?.planId || record?.gateId || record?.runId || record?._id || "record";
const field = (record, ...paths) => {
  for (const path of paths) {
    let value = record;
    for (const part of path.split(".")) value = value?.[part];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
};

const sheetDefinitions = {
  agents: {
    label: "Agents", description: "Agent state and current execution", identity: "Agent",
    columns: [
      ["status", "State", (r) => r.status, "status"], ["role", "Role", (r) => r.role],
      ["phase", "Phase", (r) => r.currentPhase], ["task", "Current task", (r) => r.currentTask],
      ["tools", "Tools", (r) => r.tools.length], ["events", "Events", (r) => r.events.length],
      ["updated", "Updated", (r) => formatTime(r.updatedAt)], ["action", "Action", () => "Inspect", "action"]
    ]
  },
  runs: {
    label: "Runs", description: "Run history, lineage and resources", identity: "Run",
    columns: [
      ["status", "State", (r) => r.status, "status"], ["project", "Project", (r) => r.selectedProject || r.project || "-"],
      ["phase", "Phase", (r) => r.phase || "-"], ["started", "Started", (r) => formatTime(r.startedAt, true)],
      ["elapsed", "Elapsed", (r) => duration(r.startedAt, r.completedAt)], ["artifacts", "Artifacts", (r) => r.artifactCount ?? "..."],
      ["logs", "Logs", (r) => r.logCount ?? "..."], ["action", "Action", () => "Open run", "action"]
    ]
  },
  queue: {
    label: "Queue", description: "Prioritized objective queue", identity: "Queue item",
    columns: [
      ["status", "State", (r) => r.status || (r.pinned ? "pinned" : "queued"), "status"], ["priority", "Priority", (r) => r.priority || "normal"],
      ["title", "Title", (r) => r.title || "Untitled"], ["objective", "Objective", (r) => r.objective || "-"],
      ["repo", "Repository", (r) => field(r, "target.preferredRepo", "repoPath") || "-"], ["gates", "Gates", (r) => array(r.acceptanceGateIds).join(", ") || "-"],
      ["source", "Source", (r) => r.source || "-"], ["action", "Action", () => "Queue controls", "action"]
    ]
  },
  gates: {
    label: "Gates", description: "Acceptance gates and evidence decisions", identity: "Gate",
    columns: [
      ["status", "State", (r) => r.status || "pending", "status"], ["severity", "Severity", (r) => r.severity || "must"],
      ["description", "Description", (r) => r.description || r.title || "-"], ["required", "Required", (r) => r.required === false ? "No" : "Yes"],
      ["evidence", "Required evidence", (r) => array(r.requiredEvidence).join(", ") || "-"], ["decision", "Decision", (r) => field(r, "decision.decision", "decision") || "-"],
      ["updated", "Updated", (r) => formatTime(r.updatedAt)], ["action", "Action", () => "Decide", "action"]
    ]
  },
  plans: {
    label: "Plans", description: "Persisted project planning lifecycle", identity: "Plan",
    columns: [
      ["status", "State", (r) => r.state || "draft", "status"], ["pipeline", "Pipeline", (r) => r.pipelineType || "-"],
      ["title", "Title", (r) => r.title || "Untitled plan"], ["revision", "Revision", (r) => r.currentRevision ?? "-"],
      ["version", "Version", (r) => r.version ?? "-"], ["launch", "Active launch", (r) => r.activeLaunchId || "-"],
      ["updated", "Updated", (r) => formatTime(r.updatedAt, true)], ["action", "Action", () => "Plan controls", "action"]
    ]
  },
  iterations: {
    label: "Iterations", description: "Run generations, variants and synthesis", identity: "Iteration",
    columns: [
      ["status", "State", (r) => r.status || "unknown", "status"], ["generation", "Generation", (r) => r.generation ?? "-"],
      ["objective", "Objective", (r) => r.objective || "-"], ["run", "Run", (r) => r.runId || "-"],
      ["gate", "Gate", (r) => r.gateStatus || "-", "status"], ["variants", "Variants", (r) => array(r.variants).length || r.variantCount || 0],
      ["updated", "Updated", (r) => formatTime(r.updatedAt || r.completedAt, true)], ["action", "Action", () => "Inspect iteration", "action"]
    ]
  },
  audit: {
    label: "Audit", description: "Streaming events and durable audit records", identity: "Event",
    columns: [
      ["time", "Time", (r) => formatTime(r.ts || r.at || r.createdAt, true)], ["level", "Level", (r) => r.level || "info", "level"],
      ["source", "Source", (r) => r.source || field(r, "actor.id", "actor") || "system"], ["type", "Type / action", (r) => r.type || r.action || "audit"],
      ["run", "Run", (r) => r.runId || field(r, "target.runId") || "-"], ["agent", "Agent", (r) => r.agentId || "-"],
      ["message", "Message", (r) => r.message || field(r, "data.message", "decision") || "-"], ["action", "Action", () => "Raw", "action"]
    ]
  }
};

const state = {
  snapshot: client.getSnapshot(), sheet: localStorage.getItem("control-table.sheet") || "agents", filter: "",
  row: 0, col: 0, selectedId: null, selectedRecord: null, inspectorTab: "record", returnFocus: null,
  action: null, actionRecord: null, busy: false, sort: null, toolCalls: new Map(), planRevision: null
};

function duration(start, end) {
  const ms = Date.parse(end || new Date()) - Date.parse(start);
  if (!Number.isFinite(ms) || ms < 0) return "-";
  const minutes = Math.floor(ms / 60000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m ${Math.floor(ms % 60000 / 1000)}s`;
}

function agents(snapshot) {
  const source = snapshot.state?.agents;
  const rows = (Array.isArray(source) ? source : Object.values(source || {})).map((agent) => ({
    ...agent, id: agent.id || agent.label || agent.role || "agent", role: agent.role || "agent",
    status: agent.status || "idle", currentPhase: agent.currentPhase || snapshot.state?.phase || "idle",
    currentTask: agent.currentTask || agent.task || "Idle", updatedAt: agent.updatedAt || snapshot.state?.updatedAt
  }));
  if (!rows.some((row) => ["orchestrator", "main-orchestrator"].includes(row.id))) rows.unshift({
    id: "main-orchestrator", role: "workflow orchestrator", status: snapshot.state?.status || "idle",
    currentPhase: snapshot.state?.phase || "idle", currentTask: snapshot.state?.currentTask || snapshot.state?.task || "Waiting",
    updatedAt: snapshot.state?.updatedAt
  });
  const eventMap = new Map();
  for (const event of snapshot.events) {
    const id = event.agentId || event.source;
    if (!id || id === "system" || id === "unknown") continue;
    if (!eventMap.has(id)) eventMap.set(id, []);
    eventMap.get(id).push(event);
  }
  for (const [id, events] of eventMap) if (!rows.some((row) => row.id === id)) rows.push({ id, role: "event-derived agent", status: "seen", currentPhase: "-", currentTask: events.at(-1)?.message || "-", updatedAt: events.at(-1)?.ts });
  return rows.map((row) => ({ ...row, events: eventMap.get(row.id) || [], tools: toolsForAgent(row.id) }));
}

function rebuildTools(events) {
  for (const event of events) {
    const data = event.data || {};
    if (!String(event.type).startsWith("tool-call") && !data.toolCallId && !data.toolName) continue;
    const id = data.toolCallId || data.id || event.id;
    const old = state.toolCalls.get(id) || {};
    state.toolCalls.set(id, {
      ...old, id, agentId: event.agentId || data.agentId || old.agentId, toolName: data.toolName || data.tool || old.toolName || "tool",
      action: data.action || data.command || event.message || old.action || "", input: data.sanitizedInput ?? data.input ?? old.input,
      output: data.sanitizedOutput ?? data.output ?? data.result ?? old.output, error: data.error ?? event.error ?? old.error,
      status: String(event.type).includes("error") ? "error" : String(event.type).includes("end") ? "done" : data.status || old.status || "running",
      durationMs: data.durationMs ?? old.durationMs, updatedAt: event.ts, raw: event.raw || event
    });
  }
}
const toolsForAgent = (id) => [...state.toolCalls.values()].filter((tool) => tool.agentId === id);

function auditRows(snapshot) {
  const rows = [];
  const seen = new Set();
  for (const item of [...snapshot.audit, ...snapshot.events].sort((a, b) => Date.parse(a.ts || a.at || a.createdAt || 0) - Date.parse(b.ts || b.at || b.createdAt || 0))) {
    const id = item.id || `${item.ts || item.at}-${item.action || item.type}-${item.message || ""}`;
    if (seen.has(id)) continue;
    seen.add(id); rows.push({ ...item, _id: id });
  }
  return rows.slice(-1000).reverse();
}

function records(sheet = state.sheet) {
  const snapshot = state.snapshot;
  const source = sheet === "agents" ? agents(snapshot)
    : sheet === "runs" ? snapshot.runs
    : sheet === "queue" ? array(snapshot.queue?.items)
    : sheet === "gates" ? array(snapshot.gates?.gates)
    : sheet === "plans" ? snapshot.plans
    : sheet === "iterations" ? snapshot.iterations
    : auditRows(snapshot);
  let result = source.map((record, index) => ({ ...record, _id: idOf(record) === "record" ? `${sheet}-${index}` : idOf(record) }));
  const query = state.filter.trim().toLowerCase();
  if (query) result = result.filter((record) => JSON.stringify(record).toLowerCase().includes(query));
  if (state.sort?.sheet === sheet) {
    const column = sheetDefinitions[sheet].columns[state.sort.column];
    result.sort((a, b) => String(column[2](a) ?? "").localeCompare(String(column[2](b) ?? ""), undefined, { numeric: true }) * state.sort.direction);
  }
  return result;
}

function renderWorkflow() {
  const current = workflowStatus();
  const index = WORKFLOW_PHASES.indexOf(current);
  $("workflow").innerHTML = WORKFLOW_PHASES.map((phase, phaseIndex) => `<span class="phase ${phaseIndex < index ? "done" : ""} ${phase === current ? "current" : ""} ${["blocked", "deblocking", "on-hold"].includes(phase) ? "interrupt" : ""}"${phase === current ? ' aria-current="step"' : ""}>${esc(phase)}</span>`).join("");
}

function workflowStatus() {
  const raw = state.snapshot.state?.status || state.snapshot.state?.phase || "idle";
  if (raw === "complete") return "completed";
  if (WORKFLOW_PHASES.includes(raw)) return raw;
  if (["implementation", "build", "running"].includes(raw)) return "building";
  return "idle";
}

function blocker() {
  const snapshot = state.snapshot;
  return snapshot.state?.block || snapshot.state?.blocker || snapshot.state?.hold || snapshot.control?.pause?.requested && snapshot.control.pause || snapshot.control?.stop?.requested && snapshot.control.stop || null;
}

function renderHeader() {
  const snapshot = state.snapshot;
  const project = field(snapshot.state, "selectedProject.name", "selectedProject", "currentProject") || "No project";
  $("projectName").textContent = project;
  $("runIdentity").textContent = snapshot.state?.currentRunId || snapshot.selectedRunId || "No active run";
  const connection = snapshot.connection;
  $("connectionState").textContent = `${connection.status}${connection.transport ? ` / ${connection.transport}` : ""}`;
  $("connectionState").className = `connection ${statusClass(connection.status)}`;
  $("pauseButton").textContent = connection.paused ? "Resume live" : "Pause live";
  $("pauseButton").setAttribute("aria-pressed", String(connection.paused));
  const activeBlocker = blocker();
  $("blockerRow").hidden = !activeBlocker;
  if (activeBlocker) $("blockerText").textContent = activeBlocker.reason || activeBlocker.message || String(activeBlocker);
  renderWorkflow();
}

function columnLetter(index) {
  let value = index + 1;
  let result = "";
  while (value) { value--; result = String.fromCharCode(65 + value % 26) + result; value = Math.floor(value / 26); }
  return result;
}

function renderTabs() {
  $("sheetTabs").innerHTML = Object.entries(sheetDefinitions).map(([id, definition]) => {
    const count = records(id).length;
    return `<button type="button" role="tab" class="sheet-tab ${id === "audit" ? "audit-tab" : ""}" id="tab-${id}" data-sheet="${id}" aria-controls="dataGrid" aria-selected="${id === state.sheet}" tabindex="${id === state.sheet ? "0" : "-1"}">${esc(definition.label)}<span class="tab-count">${count}</span></button>`;
  }).join("");
}

function renderGrid({ preserveFocus = true } = {}) {
  const hadGridFocus = $("dataGrid").contains(document.activeElement);
  const definition = sheetDefinitions[state.sheet];
  const rows = records();
  state.row = Math.max(0, Math.min(state.row, rows.length - 1));
  state.col = Math.max(0, Math.min(state.col, definition.columns.length));
  const activeId = state.selectedId || rows[state.row]?._id;
  $("dataGrid").setAttribute("aria-label", `${definition.label} sheet`);
  $("dataGrid").setAttribute("aria-rowcount", String(rows.length + 1));
  $("dataGrid").setAttribute("aria-colcount", String(definition.columns.length + 2));
  $("gridCaption").textContent = definition.description;
  const headers = [`<th class="corner" scope="col" aria-label="Row number">#</th>`, `<th class="identity-col identity-head" scope="col" data-sort-column="-1">${esc(definition.identity)}</th>`];
  definition.columns.forEach((column, index) => {
    const sorted = state.sort?.sheet === state.sheet && state.sort.column === index;
    headers.push(`<th scope="col" data-sort-column="${index}" aria-sort="${sorted ? state.sort.direction === 1 ? "ascending" : "descending" : "none"}"><button type="button" class="sort-button">${esc(column[1])}<span aria-hidden="true">${sorted ? state.sort.direction === 1 ? " ^" : " v" : ""}</span></button></th>`);
  });
  $("dataGrid").tHead.innerHTML = `<tr>${headers.join("")}</tr>`;
  $("dataGrid").tBodies[0].innerHTML = rows.map((record, rowIndex) => {
    const selected = record._id === activeId;
    const identity = idOf(record) === "record" ? record._id : idOf(record);
    const cells = [`<th class="row-number" scope="row">${rowIndex + 1}</th>`, cellHTML(identity, rowIndex, 0, "identity-col", record, false)];
    definition.columns.forEach((column, columnIndex) => cells.push(cellHTML(column[2](record), rowIndex, columnIndex + 1, column[3] || "", record, column[3] === "action")));
    return `<tr aria-selected="${selected}" data-record-id="${esc(record._id)}">${cells.join("")}</tr>`;
  }).join("");
  $("emptyState").hidden = rows.length > 0;
  $("sheetSummary").textContent = `${rows.length} ${rows.length === 1 ? "row" : "rows"} / ${definition.description}`;
  $("rowCount").textContent = `COUNT ${rows.length}`;
  $("selectionStatus").textContent = state.snapshot.connection.paused ? "LIVE PAUSED" : "READY";
  $("lastUpdated").textContent = state.snapshot.connection.lastRefreshAt ? `SYNC ${formatTime(state.snapshot.connection.lastRefreshAt)}` : "SSE ACTIVE";
  $("addRowButton").textContent = state.sheet === "queue" ? "Add queue row" : state.sheet === "gates" ? "Add gate row" : state.sheet === "plans" ? "New plan row" : "Add row";
  $("addRowButton").disabled = !["queue", "gates", "plans"].includes(state.sheet);
  renderTabs();
  if (rows.length) selectCell(state.row, state.col, { focus: preserveFocus && hadGridFocus, scroll: false });
  else updateFormula(null, 0, 0);
}

function cellHTML(value, row, column, extraClass, record, action) {
  const active = row === state.row && column === state.col;
  let content;
  if (action) content = `<button class="cell-action" type="button" tabindex="-1" data-inspect-record="${esc(record._id)}">${esc(value)}</button>`;
  else if (extraClass === "status") content = `<span class="status ${statusClass(value)}">${esc(value ?? "-")}</span>`;
  else content = esc(typeof value === "object" ? clip(value, 500) : value ?? "-");
  return `<td role="gridcell" class="grid-cell ${esc(extraClass)}" tabindex="${active ? "0" : "-1"}" data-row="${row}" data-col="${column}" aria-selected="${record._id === state.selectedId}">${content}</td>`;
}

function selectCell(row, col, { focus = true, scroll = true } = {}) {
  const rows = records();
  if (!rows.length) return;
  const definition = sheetDefinitions[state.sheet];
  state.row = Math.max(0, Math.min(row, rows.length - 1));
  state.col = Math.max(0, Math.min(col, definition.columns.length));
  state.selectedRecord = rows[state.row]; state.selectedId = state.selectedRecord._id;
  document.querySelectorAll("#dataGrid .grid-cell[tabindex='0']").forEach((cell) => cell.tabIndex = -1);
  document.querySelectorAll("#dataGrid tbody tr").forEach((tr) => tr.setAttribute("aria-selected", String(tr.dataset.recordId === state.selectedId)));
  const cell = document.querySelector(`#dataGrid .grid-cell[data-row="${state.row}"][data-col="${state.col}"]`);
  if (cell) { cell.tabIndex = 0; if (focus) cell.focus({ preventScroll: true }); if (scroll) cell.scrollIntoView({ block: "nearest", inline: "nearest" }); }
  updateFormula(state.selectedRecord, state.row, state.col);
}

function updateFormula(record, row, col) {
  $("cellName").textContent = `${columnLetter(col)}${row + 1}`;
  $("inspectButton").disabled = !record;
  if (!record) { $("formulaBar").textContent = "No record selected."; return; }
  const definition = sheetDefinitions[state.sheet];
  const column = col === 0 ? ["identity", definition.identity, (r) => idOf(r)] : definition.columns[col - 1];
  const value = column[2](record);
  $("formulaBar").textContent = `=${state.sheet.toUpperCase()}[${column[1]}] :: ${typeof value === "object" ? clip(value, 1000) : value ?? "-"}  |  record ${record._id}`;
}

function setSheet(sheet, focus = true) {
  if (!sheetDefinitions[sheet]) return;
  state.sheet = sheet; state.row = 0; state.col = 0; state.selectedId = null; state.selectedRecord = null; state.sort = null;
  localStorage.setItem("control-table.sheet", sheet);
  renderGrid({ preserveFocus: false });
  if (focus) document.querySelector("#dataGrid .grid-cell")?.focus();
}

function statusMarkup(value) { return `<span class="status ${statusClass(value)}">${esc(value || "unknown")}</span>`; }
function recordTable(record) {
  const entries = Object.entries(record || {}).filter(([key]) => !key.startsWith("_")).slice(0, 80);
  return `<table class="record-table"><tbody>${entries.map(([key, value]) => `<tr><th scope="row">${esc(key)}</th><td>${esc(typeof value === "object" ? clip(value, 5000) : value ?? "-")}</td></tr>`).join("")}</tbody></table>`;
}

const inspectorViews = {
  agents: ["record", "events", "tools", "raw"], runs: ["record", "artifacts", "logs", "SPEC", "DEVPLAN", "iterations", "raw"],
  queue: ["record", "raw"], gates: ["record", "evidence", "raw"], plans: ["record", "revision", "launches", "raw"],
  iterations: ["record", "variants", "synthesis", "gates", "evidence", "raw"], audit: ["record", "tool", "raw"]
};

async function openInspector(record = state.selectedRecord, tab = "record") {
  if (!record) return;
  state.returnFocus = document.activeElement; state.selectedRecord = record; state.selectedId = record._id; state.inspectorTab = tab;
  $("sideSheetKind").textContent = `${state.sheet.toUpperCase()} / ${record._id}`;
  $("sideSheetTitle").textContent = idOf(record) === "record" ? record._id : idOf(record);
  $("sideSheet").hidden = false; $("sheetScrim").hidden = false;
  document.body.classList.add("sheet-open");
  await loadInspectorData(record);
  renderInspector();
  $("closeSideSheet").focus();
}

async function loadInspectorData(record) {
  try {
    if (state.sheet === "runs") await client.selectRun(record.id || record._id);
    if (state.sheet === "iterations") await client.selectIteration(record.id || record._id);
    if (state.sheet === "plans") { state.planRevision = null; await client.getProjectPlan(record.planId || record._id); }
  } catch (error) { toast(error.message, true); }
}

function closeInspector() {
  $("sideSheet").hidden = true; $("sheetScrim").hidden = true; document.body.classList.remove("sheet-open");
  state.action = null; state.actionRecord = null;
  if (state.returnFocus instanceof HTMLElement) state.returnFocus.focus();
}

function renderInspector() {
  if ($("sideSheet").hidden) return;
  const views = inspectorViews[state.sheet];
  if (!views.includes(state.inspectorTab)) state.inspectorTab = views[0];
  $("inspectorTabs").innerHTML = views.map((view) => `<button type="button" role="tab" data-inspector-tab="${view}" aria-selected="${view === state.inspectorTab}">${esc(view)}</button>`).join("");
  if (state.action) { renderActionForm(); return; }
  const record = state.selectedRecord;
  const body = $("sideSheetBody");
  const actions = actionButtons(state.sheet, record);
  let content = actions ? `<div class="action-strip">${actions}</div>` : "";
  const snapshot = state.snapshot;
  const tab = state.inspectorTab;
  if (tab === "record") content += recordTable(detailRecord(record));
  else if (tab === "raw") content += `<pre class="raw-output">${esc(clip(detailRecord(record)))}</pre>`;
  else if (tab === "events") content += eventList(record.events || snapshot.events.filter((event) => event.agentId === record.id));
  else if (tab === "tools") content += toolList(record.tools || toolsForAgent(record.id));
  else if (tab === "tool") content += toolList(toolForEvent(record) ? [toolForEvent(record)] : []);
  else if (tab === "artifacts") content += resourceList(snapshot.selectedRun.artifacts, "artifact");
  else if (tab === "logs") content += resourceList(snapshot.selectedRun.logs, "log");
  else if (tab === "SPEC" || tab === "DEVPLAN") content += documentView(tab.toLowerCase());
  else if (tab === "iterations") content += iterationList(snapshot.iterations.filter((item) => item.runId === (record.id || record._id)));
  else if (tab === "revision") content += `<div class="resource-list">${array(snapshot.planDetail?.revisions).map((revision) => `<button type="button" data-plan-revision="${esc(revision.revision)}"><span>Revision ${esc(revision.revision)}</span><span>${esc(revision.contentDigest || "")}</span></button>`).join("")}</div><pre class="raw-output">${esc(clip(state.planRevision || snapshot.planDetail?.revision || "No revision loaded."))}</pre>`;
  else if (tab === "launches") content += `<pre class="raw-output">${esc(clip(snapshot.planDetail?.launches || []))}</pre>`;
  else if (tab === "variants") content += `<pre class="raw-output">${esc(clip(snapshot.iterationDetail?.variants || record.variants || []))}</pre>`;
  else if (tab === "synthesis") content += `<pre class="raw-output">${esc(clip(snapshot.iterationDetail?.synthesis || record.synthesis || {}))}</pre>`;
  else if (tab === "gates") content += gateDecisionList(snapshot.iterationDetail || record);
  else if (tab === "evidence") content += `<pre class="raw-output">${esc(clip(field(snapshot.iterationDetail, "sourceEvidence", "evidence") || field(record, "evidence", "requiredEvidence") || []))}</pre>`;
  body.innerHTML = content;
}

function detailRecord(record) {
  if (state.sheet === "runs") return state.snapshot.selectedRun.run || record;
  if (state.sheet === "iterations") return state.snapshot.iterationDetail || record;
  if (state.sheet === "plans") return state.snapshot.planDetail || record;
  return record;
}

function actionButtons(sheet, record) {
  const command = (name, label = name) => `<button type="button" data-open-action="${esc(name)}">${esc(label)}</button>`;
  if (sheet === "agents") return command("steer", "Steer agent") + command("set-current-objective", "Set objective");
  if (sheet === "runs") return command("run-now", "Run now") + command("start-next-iteration", "Next iteration") + command("continue-from-iteration", "Continue") + command("fork-from-iteration", "Fork") + command("use-as-next-direction", "Use direction");
  if (sheet === "queue") return command("pin-queue-item", "Pin") + command("archive-queue-item", "Archive") + command("start-next-iteration", "Run item");
  if (sheet === "gates") return command("gate-decision", "Decision") + command("attach-gate-evidence", "Attach evidence") + command("update-gate", "Edit gate");
  if (sheet === "plans") return PROJECT_PLAN_ACTIONS.slice(1).map((name) => command(name, name.replace("project-plan.", ""))).join("") + command("plan-assistance", "Planning assist");
  if (sheet === "iterations") return command("continue-from-iteration", "Continue") + command("fork-from-iteration", "Fork") + command("use-as-next-direction", "Use direction") + command("gate-decision", "Gate decision");
  if (sheet === "audit") return toolForEvent(record) ? `<button type="button" data-inspector-tab="tool">Inspect tool call</button>` : "";
  return "";
}

function eventList(events) {
  return events.length ? `<table class="record-table"><thead><tr><th>Time</th><th>Type</th><th>Message</th></tr></thead><tbody>${events.slice(-100).reverse().map((event) => `<tr><td>${esc(formatTime(event.ts))}</td><td>${esc(event.type)}</td><td>${esc(event.message || "-")}</td></tr>`).join("")}</tbody></table>` : `<p class="form-note">No matching events.</p>`;
}
function toolList(tools) {
  return tools.length ? tools.map((tool) => `<h2>${esc(tool.toolName)} / ${statusMarkup(tool.status)}</h2><pre class="raw-output">${esc(clip(tool))}</pre>`).join("") : `<p class="form-note">No structured tool calls match this record.</p>`;
}
function toolForEvent(event) { return state.toolCalls.get(event.data?.toolCallId || event.toolCallId || event.id); }
function resourceList(items, kind) {
  return items.length ? `<div class="resource-list">${items.map((item) => `<button type="button" data-resource-kind="${kind}" data-resource-name="${esc(item.name)}"><span>${esc(item.name)}</span><span>${esc(item.size ?? "-")} B</span></button>`).join("")}</div><pre id="resourcePreview" class="raw-output">Select a ${kind} row.</pre>` : `<p class="form-note">No ${esc(kind)} files for this run.</p>`;
}
function documentView(kind) {
  const document = state.snapshot.selectedRun.document;
  if (document?.kind === kind) return `<p class="form-note">${esc(document.name)}</p><pre class="raw-output">${esc(document.text)}</pre>`;
  return `<button type="button" data-load-document="${kind}">Load ${kind.toUpperCase()}</button><p class="form-note">Loads the first available approved document candidate.</p>`;
}
function iterationList(items) {
  return items.length ? `<div class="resource-list">${items.map((item) => `<button type="button" data-open-iteration="${esc(item.id)}"><span>${esc(item.id)}</span><span>${esc(item.status || "-")}</span></button>`).join("")}</div>` : `<p class="form-note">No iterations linked to this run.</p>`;
}
function gateDecisionList(detail) {
  const decisions = array(detail.gateDecisions || detail.gates || detail.acceptanceGateResults);
  return `<div class="action-strip"><button data-open-action="gate-decision">Record decision</button><button data-open-action="attach-gate-evidence">Attach evidence</button></div><pre class="raw-output">${esc(clip(decisions))}</pre>`;
}

const actionFields = {
  steer: [["text", "Steering instruction", "textarea", true], ["agentId", "Agent ID"], ["runId", "Run ID"]],
  deblock: [["prompt", "Deblock prompt", "textarea", true], ["runId", "Run ID"]],
  "deblock-advice": [["prompt", "Focused recovery question", "textarea"], ["runId", "Run ID"]],
  "approve-deblock-advice": [["adviceId", "Advice ID", "text", true]], "deny-deblock-advice": [["adviceId", "Advice ID", "text", true]],
  "remove-steering": [["id", "Steering ID", "text", true]],
  "set-current-objective": [["objective", "Objective", "textarea", true], ["runId", "Run ID"]],
  "start-next-iteration": [["runId", "Source run"], ["queueItemId", "Queue item"], ["repoPath", "Repository path"], ["objective", "Objective", "textarea", true], ["changeText", "Bounded change", "textarea", true], ["acceptanceGateIds", "Gate IDs (comma separated)"]],
  "continue-from-iteration": [["runId", "Source run", "text", true], ["sourceIterationId", "Source iteration"], ["repoPath", "Repository path"], ["changeText", "Continuation direction", "textarea", true]],
  "fork-from-iteration": [["runId", "Source run", "text", true], ["sourceIterationId", "Source iteration"], ["repoPath", "Repository path"], ["changeText", "Fork direction", "textarea", true]],
  "use-as-next-direction": [["sourceRunId", "Source run", "text", true], ["sourceIterationId", "Source iteration", "text", true], ["repoPath", "Repository path", "text", true], ["baseRef", "Base ref", "text", true], ["objective", "Next objective", "textarea", true], ["changeText", "Accepted bounded direction", "textarea", true]],
  "set-showcase-target": [["targetGenerations", "Target generations", "number", true]],
  "start-showcase-loop": [["sourceRunId", "Source run"], ["sourceIterationId", "Source iteration"], ["repoPath", "Repository path", "text", true], ["objective", "Objective", "textarea", true], ["targetGenerations", "Target generations", "number", true]],
  "gate-decision": [["gateId", "Gate ID", "text", true], ["status", "Status", "select", true, ["passed", "failed", "needs-evidence"]], ["decision", "Decision", "select", true, ["accepted", "rejected", "defer"]], ["runId", "Run ID"], ["notes", "Notes", "textarea"], ["evidenceArtifacts", "Evidence artifact paths"]],
  "attach-gate-evidence": [["gateId", "Gate ID", "text", true], ["runId", "Run ID", "text", true], ["evidenceArtifacts", "Evidence artifact paths", "textarea", true]],
  "add-queue-item": [["title", "Title", "text", true], ["objective", "Objective", "textarea", true], ["context", "Context / bounded change", "textarea"], ["preferredRepo", "Preferred repository"], ["priority", "Priority (1-100)", "select", false, ["25", "50", "75", "100"]], ["acceptanceGateIds", "Gate IDs"], ["pin", "Pin immediately", "checkbox"]],
  "pin-queue-item": [["id", "Queue item ID", "text", true]], "archive-queue-item": [["id", "Queue item ID", "text", true]],
  "add-gate": [["id", "Gate ID", "text", true], ["description", "Description", "textarea", true], ["severity", "Severity", "select", true, ["must", "should"]], ["requiredEvidence", "Required evidence paths, one per line", "textarea"]],
  "update-gate": [["id", "Gate ID", "text", true], ["description", "Description", "textarea"], ["severity", "Severity", "select", false, ["must", "should"]], ["requiredEvidence", "Required evidence paths, one per line", "textarea"]]
};
const noPayloadActions = new Set(["pause", "hold", "resume", "unhold", "stop", "run-now", "clear-queue", "start-showcase-loop", "pause-showcase-loop", "resume-showcase-loop", "stop-showcase-loop"]);

function actionSeed(action, record = {}) {
  const snapshot = state.snapshot;
  const iteration = state.sheet === "iterations" ? record : snapshot.iterationDetail || {};
  return {
    id: record.id || record._id, agentId: state.sheet === "agents" ? record.id : "", runId: record.runId || record.id || snapshot.state?.currentRunId || snapshot.selectedRunId,
    sourceRunId: record.runId || record.id || snapshot.state?.currentRunId || snapshot.selectedRunId, sourceIterationId: iteration.id || snapshot.selectedIterationId,
    queueItemId: state.sheet === "queue" ? record.id : "", gateId: state.sheet === "gates" ? record.id : "",
    repoPath: field(record, "repoPath", "target.preferredRepo") || iteration.repoPath || snapshot.control?.autoIteration?.repoPath || "", baseRef: iteration.commit || iteration.baseRef || "HEAD",
    objective: record.objective || snapshot.control?.currentObjective?.text || snapshot.state?.currentTask || "",
    changeText: record.context || "Complete one bounded objective-linked generation without unrelated feature or stack churn.",
    targetGenerations: snapshot.control?.autoIteration?.targetGenerations || 10,
    evidenceArtifacts: "artifacts/gate-report.json, artifacts/gate-decisions.json", title: record.title || "", priority: String(Number(record.priority) || 50),
    description: record.description || record.title || "", severity: record.severity || "must", requiredEvidence: array(record.requiredEvidence).join("\n"),
    acceptanceGateIds: array(record.acceptanceGateIds).join(", "),
    adviceId: array(snapshot.control?.deblockAdvice).find((item) => item.status === "pending")?.id || ""
  };
}

function openAction(action, record = state.selectedRecord || {}) {
  if (action.startsWith("project-plan.") && action !== "project-plan.create" && state.sheet !== "plans") {
    closeInspector();
    setSheet("plans", false);
    toast("Select and inspect a plan row before applying this lifecycle command.", true);
    return;
  }
  state.action = action; state.actionRecord = record;
  $("sideSheet").hidden = false; $("sheetScrim").hidden = false;
  $("sideSheetKind").textContent = action.startsWith("project-plan.") ? "PROJECT PLAN COMMAND" : "OPERATOR COMMAND";
  $("sideSheetTitle").textContent = action.replace("project-plan.", "").replaceAll("-", " ");
  $("inspectorTabs").innerHTML = "";
  renderActionForm();
  requestAnimationFrame(() => $("sideSheetBody").querySelector("input, textarea, select, button")?.focus());
}

function renderActionForm() {
  const action = state.action;
  if (action === "project-plan.create" || action === "project-plan.update") return renderPlanEditor(action);
  if (action === "plan-assistance") return renderAssistance();
  const record = state.actionRecord || {};
  const seed = actionSeed(action, record);
  const fields = actionFields[action] || [];
  const safety = ["stop", "clear-queue", "project-plan.launch", "project-plan.archive", "project-plan.approve", "project-plan.reject"].includes(action);
  $("sideSheetBody").innerHTML = `<form id="actionForm" data-action="${esc(action)}"><p class="form-note">${esc(actionDescription(action))}</p>${fields.map((definition) => inputField(definition, seed[definition[0]])).join("")}${action.startsWith("project-plan.") ? planIdentityFields(action) : ""}${safety ? `<label><span>Confirmation</span><input name="confirmation" required pattern="CONFIRM" placeholder="Type CONFIRM"></label>` : ""}<div id="actionError" class="form-error" hidden></div><div class="action-strip"><button class="accent" type="submit">Validate and ${esc(action.replace("project-plan.", ""))}</button><button type="button" data-cancel-action>Cancel</button></div></form>`;
}

function inputField([name, label, type = "text", required = false, options = []], value) {
  const requiredMarkup = required ? "required" : "";
  if (type === "textarea") return `<label><span>${esc(label)}</span><textarea name="${esc(name)}" ${requiredMarkup}>${esc(value || "")}</textarea></label>`;
  if (type === "select") return `<label><span>${esc(label)}</span><select name="${esc(name)}" ${requiredMarkup}>${options.map((option) => `<option value="${esc(option)}" ${option === value ? "selected" : ""}>${esc(option)}</option>`).join("")}</select></label>`;
  if (type === "checkbox") return `<label><span><input name="${esc(name)}" type="checkbox" ${value ? "checked" : ""}> ${esc(label)}</span></label>`;
  return `<label><span>${esc(label)}</span><input name="${esc(name)}" type="${esc(type)}" value="${esc(value || "")}" ${type === "number" ? 'min="1" max="10"' : ""} ${requiredMarkup}></label>`;
}

function actionDescription(action) {
  if (action.startsWith("project-plan.")) return "This mutation is bound to the persisted plan version and, where required, its immutable revision digest.";
  if (action === "deblock-advice") return "Request advice first. Advice is inert until separately approved or denied.";
  return "Review the selected row context. Required values are validated locally and again by the API.";
}

function planIdentityFields(action) {
  const detail = state.snapshot.planDetail;
  if (!detail) return `<p class="form-error">Plan detail is not loaded. Close, reopen the plan row, and retry.</p>`;
  const notes = ["project-plan.approve", "project-plan.reject"].includes(action) ? inputField(["notes", "Decision notes", "textarea", true], "") : "";
  const lineage = ["project-plan.clone", "project-plan.fork"].includes(action) ? inputField(["sourceRunId", "Source run ID"], state.selectedRecord?.runId || "") + inputField(["sourceIterationId", "Source iteration ID"], state.snapshot.selectedIterationId || "") + inputField(["baseRef", "Base reference", "text", true], detail.revision?.content?.repository?.baseRef || "HEAD") : "";
  return `<input type="hidden" name="planId" value="${esc(detail.ledger.planId)}"><input type="hidden" name="revision" value="${esc(detail.ledger.currentRevision)}"><input type="hidden" name="planDigest" value="${esc(detail.ledger.currentDigest)}">${notes}${lineage}`;
}

function planDefaults(pipelineType = "classic") {
  return { pipelineType, title: "", problem: "", intendedUsers: "", objective: "", boundedScope: "", requirements: [], nonGoals: [], constraints: [], risks: [], repository: { path: null, baseRef: null, baseCommit: null }, acceptanceGates: [], validationPolicy: { id: "apb.runner-selected.v1", expectations: [], clientCommandsAllowed: false }, milestones: [], limits: { maxIterations: 1, maxVariantsPerIteration: 3, maxParallelVariants: 3, maxAcceptedFeatures: 4, maxVisualMotifChanges: 1, maxNewSections: 1, stopAfterNoImprovement: 1 }, lineage: { mode: "new", sourcePlanId: null, sourceRevision: null, sourceRunId: null, sourceIterationId: null } };
}

function renderPlanEditor(action) {
  const detail = state.snapshot.planDetail;
  const content = action === "project-plan.update" && detail?.revision?.content ? detail.revision.content : planDefaults("classic");
  const value = (name) => content[name] || "";
  $("sideSheetBody").innerHTML = `<form id="planForm" data-action="${action}"><p class="form-note">Saved plan content is declarative. Client-supplied executable validation commands are not accepted.</p><div class="field-row">${inputField(["pipelineType", "Pipeline", "select", true, ["classic", "managed"]], content.pipelineType)}${inputField(["title", "Title", "text", true], value("title"))}</div>${inputField(["problem", "Problem", "textarea", true], value("problem"))}<div class="field-row">${inputField(["intendedUsers", "Intended users", "textarea", true], value("intendedUsers"))}${inputField(["objective", "Measurable objective", "textarea", true], value("objective"))}</div>${inputField(["boundedScope", "Bounded scope", "textarea", true], value("boundedScope"))}<div class="field-row">${inputField(["requirements", "Requirements, one per line", "textarea", true], array(content.requirements).join("\n"))}${inputField(["nonGoals", "Non-goals, one per line", "textarea", true], array(content.nonGoals).join("\n"))}</div><div class="field-row">${inputField(["constraints", "Constraints", "textarea", true], array(content.constraints).join("\n"))}${inputField(["risks", "Risks", "textarea", true], array(content.risks).join("\n"))}</div><div class="field-row">${inputField(["repositoryPath", "Managed repository path"], content.repository?.path)}${inputField(["baseRef", "Base ref"], content.repository?.baseRef)}</div>${inputField(["acceptanceGates", "Gates: id | description | severity | evidence paths", "textarea", true], gatesToText(content.acceptanceGates))}${inputField(["validationExpectations", "Validation expectations", "textarea", true], array(content.validationPolicy?.expectations).join("\n"))}${inputField(["milestones", "Milestones", "textarea", true], array(content.milestones).join("\n"))}<div class="field-row">${inputField(["maxIterations", "Max iterations", "number", true], content.limits?.maxIterations || 1)}${inputField(["maxParallelVariants", "Max parallel variants", "number", true], content.limits?.maxParallelVariants || 3)}</div><div id="actionError" class="form-error" hidden></div><div class="action-strip"><button class="accent" type="submit">Validate and save plan row</button><button type="button" data-cancel-action>Cancel</button></div></form>`;
}

function gatesToText(gates) { return array(gates).map((gate) => `${gate.id} | ${gate.description} | ${gate.severity || "must"} | ${array(gate.requiredEvidence).join(", ")}`).join("\n"); }
function parseGates(text) { return String(text || "").split(/\r?\n/).filter(Boolean).map((row, index) => { const [id, description, severity = "must", evidence = ""] = row.split("|").map((part) => part.trim()); const requiredEvidence = lines(evidence); return { id: id || `gate-${index + 1}`, description, severity, required: requiredEvidence.length > 0, requiredEvidence }; }); }

async function renderAssistance() {
  let detail = state.snapshot.assistanceDetail;
  if (!detail) {
    try { await client.listPlanAssistance(); } catch (error) { toast(error.message, true); }
    const items = state.snapshot.assistance;
    $("sideSheetBody").innerHTML = `<p class="form-note">Messages may be sent to the configured inference provider. Suggestions cannot save, approve, launch, or execute a plan.</p><div class="action-strip"><button data-start-assistance="classic">Start classic</button><button data-start-assistance="managed">Start managed</button></div><div class="resource-list">${items.map((item) => `<button data-open-assistance="${esc(item.id)}"><span>${esc(item.pipelineType || "planning conversation")}</span><span>${esc(item.messageCount || 0)} turns</span></button>`).join("")}</div>`;
    return;
  }
  $("sideSheetBody").innerHTML = `<p class="form-note">Planning assistance is discussion only. Create a persisted draft explicitly before lifecycle actions.</p><div class="transcript">${array(detail.messages).map((message) => `<div class="message ${esc(message.role)}"><b>${esc(message.role)}</b><p>${esc(message.content)}</p></div>`).join("")}</div><form id="assistanceForm"><label><span>Planning message</span><textarea name="message" maxlength="16000" required></textarea></label><div class="action-strip"><button class="accent" type="submit">Send message</button>${detail.proposedContent ? `<button type="button" data-create-proposal>Create persisted draft</button>` : ""}<button type="button" data-assistance-list>Conversations</button></div></form>`;
}

function collectPlan(form, action) {
  const data = new FormData(form); const pipelineType = String(data.get("pipelineType"));
  const existing = action === "project-plan.update" ? state.snapshot.planDetail?.revision?.content : null;
  const base = existing || planDefaults(pipelineType); const limits = base.limits;
  return { ...base, pipelineType, title: String(data.get("title")), problem: String(data.get("problem")), intendedUsers: String(data.get("intendedUsers")), objective: String(data.get("objective")), boundedScope: String(data.get("boundedScope")), requirements: lines(data.get("requirements")), nonGoals: lines(data.get("nonGoals")), constraints: lines(data.get("constraints")), risks: lines(data.get("risks")), repository: pipelineType === "managed" ? { path: String(data.get("repositoryPath") || "") || null, baseRef: String(data.get("baseRef") || "") || null, baseCommit: null } : { path: null, baseRef: null, baseCommit: null }, acceptanceGates: parseGates(data.get("acceptanceGates")), validationPolicy: { id: "apb.runner-selected.v1", expectations: lines(data.get("validationExpectations")), clientCommandsAllowed: false }, milestones: lines(data.get("milestones")), limits: { ...limits, maxIterations: Number(data.get("maxIterations")), maxParallelVariants: Number(data.get("maxParallelVariants")) } };
}

async function submitAction(form) {
  if (!form.reportValidity() || state.busy) return;
  state.busy = true;
  const action = form.dataset.action;
  const data = new FormData(form); const payload = {};
  for (const [name, value] of data) if (name !== "confirmation" && value !== "") payload[name] = value;
  for (const key of ["acceptanceGateIds", "evidenceArtifacts"]) if (payload[key]) payload[key] = lines(payload[key]);
  if (action === "update-gate" && payload.requiredEvidence) payload.requiredEvidence = lines(payload.requiredEvidence);
  for (const key of ["targetGenerations", "priority"]) if (payload[key]) payload[key] = Number(payload[key]);
  if (form.elements.pin) payload.pin = form.elements.pin.checked;
  if (action === "add-queue-item") { payload.source = "control-table"; if (payload.preferredRepo) { payload.target = { preferredRepo: payload.preferredRepo }; delete payload.preferredRepo; } }
  if (action === "start-showcase-loop") payload.limits = { maxIterations: payload.targetGenerations, maxVariantsPerIteration: 3, maxParallelVariants: 3, maxAcceptedFeatures: 4, maxVisualMotifChanges: 1, maxNewSections: 1, stopAfterNoImprovement: 1, minImprovementScore: 0.05 };
  if (action === "use-as-next-direction") payload.limits = { maxIterations: 1, maxVariantsPerIteration: 3, maxParallelVariants: 3 };
  if (action === "project-plan.archive") { delete payload.revision; delete payload.planDigest; }
  try {
    if (action.startsWith("project-plan.")) {
      const detail = state.snapshot.planDetail;
      await client.projectPlanCommand(action, payload, { expectedVersion: detail?.ledger?.version, refresh: true });
    } else await client.command(action, payload, { refresh: true });
    toast(`${action} accepted and data refreshed.`); state.action = null; closeInspector();
  } catch (error) { showActionError(error); }
  finally { state.busy = false; }
}

async function submitPlan(form) {
  if (!form.reportValidity() || state.busy) return;
  state.busy = true; const action = form.dataset.action;
  try {
    const content = collectPlan(form, action);
    const payload = action === "project-plan.update" ? { planId: state.snapshot.planDetail.ledger.planId, content } : { content };
    await client.projectPlanCommand(action, payload, { expectedVersion: action.endsWith("update") ? state.snapshot.planDetail.ledger.version : undefined, refresh: true });
    toast("Plan row validated and persisted."); state.action = null; closeInspector(); setSheet("plans", false);
  } catch (error) { showActionError(error); }
  finally { state.busy = false; }
}

function showActionError(error) {
  const element = $("actionError");
  if (!element) return toast(error.message, true);
  element.hidden = false; element.textContent = [error.message, ...array(error.details)].filter(Boolean).join(" | ");
}
function toast(message, error = false) {
  const element = $("toast"); element.textContent = message; element.className = `toast ${error ? "error" : ""}`; element.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { element.hidden = true; }, 5000);
}

function openCommandSheet() {
  state.returnFocus = document.activeElement; state.action = null;
  $("sideSheet").hidden = false; $("sheetScrim").hidden = false; $("sideSheetKind").textContent = "WORKBOOK COMMANDS"; $("sideSheetTitle").textContent = "Lifecycle and showcase"; $("inspectorTabs").innerHTML = "";
  const group = (title, actions) => `<h2>${title}</h2><div class="action-strip">${actions.map(([action, label]) => `<button data-open-action="${action}">${label}</button>`).join("")}</div>`;
  $("sideSheetBody").innerHTML = group("Run lifecycle", [["pause", "Pause"], ["hold", "Hold"], ["resume", "Resume"], ["unhold", "Unhold"], ["stop", "Stop"], ["run-now", "Run now"]]) + group("Block and steer", [["deblock", "Deblock"], ["deblock-advice", "Ask advice"], ["approve-deblock-advice", "Approve advice"], ["deny-deblock-advice", "Deny advice"], ["steer", "Steer"], ["remove-steering", "Remove steering"], ["set-current-objective", "Set objective"]]) + group("Iteration", [["start-next-iteration", "Start next"], ["continue-from-iteration", "Continue"], ["fork-from-iteration", "Fork"], ["use-as-next-direction", "Use direction"]]) + group("Showcase", [["start-showcase-loop", "Start loop"], ["pause-showcase-loop", "Pause loop"], ["resume-showcase-loop", "Resume loop"], ["stop-showcase-loop", "Stop loop"], ["set-showcase-target", "Set target"]]) + group("Queue and gates", [["add-queue-item", "Add queue item"], ["clear-queue", "Clear queue"], ["pin-queue-item", "Pin queue item"], ["archive-queue-item", "Archive queue item"], ["add-gate", "Add gate"], ["update-gate", "Update gate"], ["gate-decision", "Gate decision"], ["attach-gate-evidence", "Attach evidence"]]) + group("Project planning", [["project-plan.create", "Create"], ["project-plan.update", "Update selected"], ["project-plan.ready-for-review", "Ready for review"], ["project-plan.approve", "Approve"], ["project-plan.reject", "Reject"], ["project-plan.launch", "Launch"], ["project-plan.clone", "Clone"], ["project-plan.fork", "Fork"], ["project-plan.archive", "Archive"], ["plan-assistance", "Planning assist"]]);
}

$("dataGrid").addEventListener("keydown", (event) => {
  const cell = event.target.closest(".grid-cell");
  if (!cell || event.target !== cell) return;
  let row = Number(cell.dataset.row); let col = Number(cell.dataset.col); const rows = records(); const lastCol = sheetDefinitions[state.sheet].columns.length;
  if (event.key === "ArrowRight") col++;
  else if (event.key === "ArrowLeft") col--;
  else if (event.key === "ArrowDown") row++;
  else if (event.key === "ArrowUp") row--;
  else if (event.key === "Home") col = event.ctrlKey ? 0 : 0, row = event.ctrlKey ? 0 : row;
  else if (event.key === "End") col = lastCol, row = event.ctrlKey ? rows.length - 1 : row;
  else if (event.key === "PageDown") row += 10;
  else if (event.key === "PageUp") row -= 10;
  else if (event.key === " " && event.shiftKey) { event.preventDefault(); selectCell(row, col); return; }
  else if (["Enter", "F2"].includes(event.key)) { event.preventDefault(); const button = cell.querySelector("button"); if (button) { button.tabIndex = 0; button.focus(); } else openInspector(); return; }
  else return;
  event.preventDefault(); selectCell(row, col);
});

$("dataGrid").addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !event.target.matches(".cell-action")) return;
  event.preventDefault();
  event.target.tabIndex = -1;
  event.target.closest(".grid-cell")?.focus();
});

$("dataGrid").addEventListener("click", (event) => {
  const header = event.target.closest("th[data-sort-column]");
  if (header && Number(header.dataset.sortColumn) >= 0) { const column = Number(header.dataset.sortColumn); state.sort = { sheet: state.sheet, column, direction: state.sort?.column === column ? -state.sort.direction : 1 }; renderGrid({ preserveFocus: false }); return; }
  const cell = event.target.closest(".grid-cell"); if (cell) selectCell(Number(cell.dataset.row), Number(cell.dataset.col), { focus: event.target === cell });
  const inspect = event.target.closest("[data-inspect-record]"); if (inspect) openInspector(records().find((record) => record._id === inspect.dataset.inspectRecord));
});

document.addEventListener("click", async (event) => {
  const sheet = event.target.closest("[data-sheet]")?.dataset.sheet; if (sheet) return setSheet(sheet);
  const inspectorTab = event.target.closest("[data-inspector-tab]")?.dataset.inspectorTab; if (inspectorTab) { state.inspectorTab = inspectorTab; return renderInspector(); }
  const action = event.target.closest("[data-open-action]")?.dataset.openAction; if (action) return openAction(action, state.selectedRecord);
  if (event.target.closest("[data-cancel-action]")) { state.action = null; return state.selectedRecord ? renderInspector() : closeInspector(); }
  const resource = event.target.closest("[data-resource-name]");
  if (resource) {
    try { const result = resource.dataset.resourceKind === "artifact" ? await client.loadArtifact(resource.dataset.resourceName) : await client.loadLog(resource.dataset.resourceName); $("resourcePreview").textContent = result.text; } catch (error) { toast(error.message, true); }
    return;
  }
  const documentKind = event.target.closest("[data-load-document]")?.dataset.loadDocument;
  if (documentKind) { try { await client.loadDocument(documentKind); renderInspector(); } catch (error) { toast(error.message, true); } return; }
  const iterationId = event.target.closest("[data-open-iteration]")?.dataset.openIteration;
  if (iterationId) { closeInspector(); setSheet("iterations", false); const record = records().find((item) => item.id === iterationId); if (record) openInspector(record); return; }
  const planRevision = event.target.closest("[data-plan-revision]")?.dataset.planRevision;
  if (planRevision && state.snapshot.planDetail) { try { state.planRevision = await client.getProjectPlanRevision(state.snapshot.planDetail.ledger.planId, Number(planRevision)); renderInspector(); } catch (error) { toast(error.message, true); } return; }
  const assistanceType = event.target.closest("[data-start-assistance]")?.dataset.startAssistance;
  if (assistanceType) { try { await client.createPlanAssistance(assistanceType); renderAssistance(); } catch (error) { toast(error.message, true); } return; }
  const assistanceId = event.target.closest("[data-open-assistance]")?.dataset.openAssistance;
  if (assistanceId) { try { await client.getPlanAssistance(assistanceId); renderAssistance(); } catch (error) { toast(error.message, true); } return; }
  if (event.target.closest("[data-assistance-list]")) { state.snapshot = { ...state.snapshot, assistanceDetail: null }; return renderAssistance(); }
  if (event.target.closest("[data-create-proposal]")) { const proposal = state.snapshot.assistanceDetail?.proposedContent; if (proposal) { try { await client.createProjectPlan({ content: proposal }, { refresh: true }); toast("Proposal persisted as a draft plan."); closeInspector(); setSheet("plans", false); } catch (error) { toast(error.message, true); } } return; }
});

document.addEventListener("submit", async (event) => {
  if (event.target.id === "actionForm") { event.preventDefault(); await submitAction(event.target); }
  if (event.target.id === "planForm") { event.preventDefault(); await submitPlan(event.target); }
  if (event.target.id === "assistanceForm") { event.preventDefault(); const detail = state.snapshot.assistanceDetail; try { await client.messagePlanAssistance(detail.id, detail.version, new FormData(event.target).get("message")); renderAssistance(); } catch (error) { toast(error.message, true); } }
});

$("sheetTabs").addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const tabs = [...$("sheetTabs").querySelectorAll("[role=tab]")]; let index = tabs.indexOf(document.activeElement);
  if (event.key === "ArrowLeft") index--; if (event.key === "ArrowRight") index++; if (event.key === "Home") index = 0; if (event.key === "End") index = tabs.length - 1;
  event.preventDefault();
  const target = tabs[(index + tabs.length) % tabs.length];
  if (target) { tabs.forEach((tab) => { tab.tabIndex = -1; }); target.tabIndex = 0; target.focus(); }
});

$("sheetFilter").addEventListener("input", (event) => { state.filter = event.target.value; state.row = 0; state.selectedId = null; renderGrid({ preserveFocus: false }); });
$("refreshButton").addEventListener("click", async () => { try { await client.refresh(); toast("Workbook refreshed."); } catch (error) { toast(error.message, true); } });
$("pauseButton").addEventListener("click", async () => { try { state.snapshot.connection.paused ? await client.resume() : client.pause(); } catch (error) { toast(error.message, true); } });
$("reconnectButton").addEventListener("click", async () => { try { await client.connect(); toast("Live transport reconnected."); } catch (error) { toast(error.message, true); } });
$("disconnectButton").addEventListener("click", () => { client.disconnect(); toast("Live transport disconnected."); });
$("inspectButton").addEventListener("click", () => openInspector());
$("commandButton").addEventListener("click", openCommandSheet);
$("sheetActionButton").addEventListener("click", openCommandSheet);
$("deblockButton").addEventListener("click", () => openAction("deblock", state.selectedRecord || {}));
$("addRowButton").addEventListener("click", () => openAction(state.sheet === "queue" ? "add-queue-item" : state.sheet === "gates" ? "add-gate" : "project-plan.create", {}));
$("closeSideSheet").addEventListener("click", closeInspector); $("sheetScrim").addEventListener("click", closeInspector);

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("sideSheet").hidden) { event.preventDefault(); closeInspector(); return; }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r") { event.preventDefault(); $("refreshButton").click(); return; }
  if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName) && $("sideSheet").hidden) { event.preventDefault(); $("sheetFilter").focus(); return; }
  if (event.ctrlKey && ["PageUp", "PageDown"].includes(event.key) && $("sideSheet").hidden) { event.preventDefault(); const ids = Object.keys(sheetDefinitions); const next = (ids.indexOf(state.sheet) + (event.key === "PageDown" ? 1 : -1) + ids.length) % ids.length; setSheet(ids[next]); }
  if (!$("sideSheet").hidden && event.key === "Tab") {
    const focusable = [...$("sideSheet").querySelectorAll("button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])")].filter((element) => element.getClientRects().length);
    if (!focusable.length) return; const first = focusable[0]; const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});

client.subscribe((snapshot) => {
  state.snapshot = snapshot; rebuildTools(snapshot.events); renderHeader(); renderGrid({ preserveFocus: true });
  if (!$("sideSheet").hidden && !state.action) renderInspector();
  if (snapshot.error) toast(`${snapshot.error.context}: ${snapshot.error.message}`, true);
});

renderHeader(); renderGrid({ preserveFocus: false });
client.connect().catch((error) => toast(`Initial connection failed: ${error.message}`, true));
