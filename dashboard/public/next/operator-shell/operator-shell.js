import {
  createDashboardClient,
  OPERATION_COMMANDS,
  PROJECT_PLAN_ACTIONS,
  WORKFLOW_PHASES
} from "../../headless-dashboard-client.js";

const client = createDashboardClient({ maxEvents: 1000, maxRawMessages: 80 });
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const text = (value, fallback = "-") => value === undefined || value === null || value === "" ? fallback : String(value);
const list = (value) => Array.isArray(value) ? value : value && typeof value === "object" ? Object.values(value) : value ? [value] : [];
const json = (value) => JSON.stringify(value, null, 2);
const clip = (value, maximum = 100000) => {
  const output = typeof value === "string" ? value : json(value);
  return output.length > maximum ? `${output.slice(0, maximum)}\n\n[output clipped at ${maximum} characters]` : output;
};
const dateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleString();
};
const time = (value) => {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.valueOf()) ? "--:--:--" : date.toLocaleTimeString([], { hour12: false });
};
const node = (tag, options = {}, children = []) => {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined || value === null) continue;
    if (key === "className") element.className = value;
    else if (key === "text") element.textContent = value;
    else if (key === "dataset") Object.assign(element.dataset, value);
    else if (key === "attrs") for (const [name, attr] of Object.entries(value)) element.setAttribute(name, attr);
    else element[key] = value;
  }
  for (const child of Array.isArray(children) ? children : [children]) if (child) element.append(child);
  return element;
};

const ui = {
  snapshot: client.getSnapshot(),
  activeBuffer: 0,
  buffers: [
    { commandId: "show.workflow", args: {}, title: "workflow", path: "apb://state/workflow" },
    { commandId: "show.events", args: {}, title: "events", path: "apb://events/live" }
  ],
  paletteIndex: 0,
  promptIndex: 0,
  paletteMatches: [],
  promptMatches: [],
  history: loadPreference("history", []),
  historyIndex: 0,
  lastEventCount: 0,
  announceStream: loadPreference("announceStream", false),
  renderQueued: false,
  formCommand: null,
  confirmResolve: null,
  returnFocus: null,
  subscribed: false
};

function loadPreference(key, fallback) {
  try { return JSON.parse(localStorage.getItem(`hermes.operator-shell.${key}`)) ?? fallback; }
  catch { return fallback; }
}

function savePreference(key, value) {
  try { localStorage.setItem(`hermes.operator-shell.${key}`, JSON.stringify(value)); } catch {}
}

function announce(message, urgent = false) {
  const output = urgent ? $("#alertStatus") : $("#politeStatus");
  output.textContent = "";
  requestAnimationFrame(() => { output.textContent = message; });
}

function setResult(message, tone = "neutral") {
  const result = $("#resultHint");
  result.textContent = message;
  result.dataset.tone = tone;
}

function toneFor(value) {
  const source = String(value || "").toLowerCase();
  if (/error|fail|block|stop|reject|deny|disconnect|degrad/.test(source)) return "danger";
  if (/warn|hold|pause|pending|needs|request|connecting|polling/.test(source)) return "warn";
  if (/complete|pass|approve|ready|connected|running|active|enabled|published/.test(source)) return "ok";
  return "neutral";
}

function section(title, subtitle) {
  const heading = node("h2", {}, [node("span", { text: title })]);
  if (subtitle) heading.append(node("small", { text: subtitle }));
  return node("section", { className: "buffer-section" }, [heading]);
}

function empty(message) {
  return node("div", { className: "empty-state", text: message });
}

function raw(value) {
  return node("pre", { className: "raw-view", text: clip(value) });
}

function token(value) {
  return node("span", { className: "status-token", text: text(value), dataset: { tone: toneFor(value) } });
}

function summaryGrid(entries) {
  const grid = node("div", { className: "summary-grid" });
  for (const [label, value] of entries) {
    const content = value instanceof Node ? value : node("strong", { text: text(value) });
    grid.append(node("div", { className: "datum" }, [node("span", { text: label }), content]));
  }
  return grid;
}

function table(columns, rows, emptyMessage = "No records") {
  if (!rows.length) return empty(emptyMessage);
  const head = node("thead", {}, [node("tr", {}, columns.map((column) => node("th", { text: column.label })))]);
  const body = node("tbody");
  rows.forEach((row) => {
    const tr = node("tr");
    columns.forEach((column) => {
      const value = typeof column.value === "function" ? column.value(row) : row[column.value || column.label];
      tr.append(node("td", {}, value instanceof Node ? [value] : [node("span", { text: text(value) })]));
    });
    body.append(tr);
  });
  return node("table", { className: "text-table" }, [head, body]);
}

function commandButton(label, commandId, args = {}) {
  return node("button", { type: "button", text: label, dataset: { commandId, commandArgs: json(args) } });
}

function toolCalls(events) {
  const calls = new Map();
  for (const event of events) {
    const data = event.data || {};
    if (!String(event.type).startsWith("tool-call") && !data.toolName && !data.toolCallId && !data.tool) continue;
    const id = data.toolCallId || data.id || event.id;
    const old = calls.get(id) || {};
    calls.set(id, {
      ...old,
      id,
      agentId: event.agentId || data.agentId || old.agentId,
      name: data.toolName || data.tool || data.name || old.name || "tool",
      action: data.action || data.command || data.summary || event.message || old.action || "",
      status: String(event.type).includes("error") ? "error" : String(event.type).includes("end") ? "done" : data.status || old.status || "running",
      durationMs: data.durationMs ?? old.durationMs,
      updatedAt: event.ts,
      input: data.input ?? data.args ?? data.sanitizedInput ?? old.input,
      output: data.output ?? data.result ?? data.sanitizedOutput ?? old.output,
      error: data.error ?? old.error
    });
  }
  return [...calls.values()];
}

function agents(snapshot) {
  const source = list(snapshot.state?.agents);
  const found = new Map();
  source.forEach((agent) => {
    const id = agent.id || agent.label || agent.role;
    if (id) found.set(id, { ...agent, id });
  });
  snapshot.events.forEach((event) => {
    if (event.agentId && !found.has(event.agentId)) found.set(event.agentId, { id: event.agentId, status: "observed", role: "event source" });
  });
  return [...found.values()];
}

const planDefaults = (pipelineType = "classic") => ({
  pipelineType,
  title: "",
  problem: "",
  intendedUsers: "",
  objective: "",
  boundedScope: "",
  requirements: [],
  nonGoals: [],
  constraints: [],
  risks: [],
  repository: { path: null, baseRef: null, baseCommit: null },
  acceptanceGates: [],
  validationPolicy: { id: "apb.runner-selected.v1", expectations: [], clientCommandsAllowed: false },
  milestones: [],
  limits: { maxIterations: 1, maxVariantsPerIteration: 3, maxParallelVariants: 3, maxAcceptedFeatures: 4, maxVisualMotifChanges: 1, maxNewSections: 1, stopAfterNoImprovement: 1 },
  lineage: { mode: "new", sourcePlanId: null, sourceRevision: null, sourceRunId: null, sourceIterationId: null }
});

const f = {
  text: (name, label, options = {}) => ({ name, label, type: "text", ...options }),
  number: (name, label, options = {}) => ({ name, label, type: "number", ...options }),
  textarea: (name, label, options = {}) => ({ name, label, type: "textarea", wide: true, ...options }),
  json: (name, label, options = {}) => ({ name, label, type: "json", wide: true, ...options }),
  checkbox: (name, label, options = {}) => ({ name, label, type: "checkbox", ...options }),
  select: (name, label, choices, options = {}) => ({ name, label, type: "select", choices, ...options })
};

const operationalDefinitions = {
  "pause": { description: "Request a checkpoint pause.", fields: [f.select("mode", "Pause mode", ["checkpoint", "immediate"]), f.textarea("reason", "Reason", { required: false })] },
  "hold": { description: "Pause admission of new runs.", fields: [f.textarea("reason", "Reason", { required: false })] },
  "resume": { description: "Resume execution and clear pause/stop requests." },
  "unhold": { description: "Enable run admission again." },
  "stop": { description: "Request the active workflow stop at a checkpoint.", danger: "The active workflow will receive a stop request at its next checkpoint.", fields: [f.select("mode", "Stop mode", ["graceful", "checkpoint"]), f.textarea("reason", "Reason", { required: false })] },
  "run-now": { description: "Request runner admission on the next tick." },
  "steer": { description: "Add bounded operator steering.", fields: [f.select("scope", "Scope", ["next_run", "current_run", "queue"]), f.select("priority", "Priority", ["required", "preferred"]), f.textarea("text", "Steering text", { required: true }), f.json("expires", "Expiry", { default: { type: "until_removed" } })] },
  "deblock": { description: "Queue a focused recovery prompt for a blocked run.", fields: [f.text("runId", "Run ID", { default: () => ui.snapshot.state?.currentRunId || "" }), f.textarea("prompt", "Deblock prompt", { required: true, maxlength: 8000 })] },
  "deblock-advice": { description: "Ask the configured adviser for a non-executing recovery recommendation.", fields: [f.text("runId", "Run ID", { default: () => ui.snapshot.state?.currentRunId || "" }), f.textarea("prompt", "Advice question", { required: false, maxlength: 8000 })] },
  "approve-deblock-advice": { description: "Approve advice and queue its answer as current-run steering.", danger: "This advice will become executable current-run steering.", fields: [f.text("adviceId", "Pending advice ID", { required: true })] },
  "deny-deblock-advice": { description: "Deny pending deblock advice without changing the run.", danger: "The selected advice will be marked denied.", fields: [f.text("adviceId", "Pending advice ID", { required: true })] },
  "remove-steering": { description: "Remove an active steering instruction.", fields: [f.text("id", "Steering ID", { required: true })] },
  "set-current-objective": { description: "Set the operator's current objective projection.", fields: [f.textarea("text", "Objective", { required: true }), f.text("runId", "Run ID"), f.text("queueItemId", "Queue item ID"), f.text("source", "Source", { default: "operator" })] },
  "start-next-iteration": { description: "Queue a bounded managed iteration.", danger: "A new managed iteration request will be admitted on the next runner tick.", fields: [f.text("repoPath", "Repository path", { required: true }), f.textarea("objective", "Objective", { required: true }), f.text("baseRef", "Base ref", { default: "HEAD" }), f.textarea("changeText", "Bounded change"), f.json("acceptanceGateIds", "Acceptance gate IDs", { default: [] }), f.json("limits", "Iteration limits", { default: { maxIterations: 1, maxVariantsPerIteration: 3, maxParallelVariants: 3 } })] },
  "continue-from-iteration": { description: "Continue from an iteration through the legacy direct control path.", danger: "A continuation request will be queued directly, without creating a fresh project-plan approval.", fields: [f.text("sourceIterationId", "Source iteration ID", { required: true }), f.text("sourceRunId", "Source run ID", { required: true }), f.text("repoPath", "Repository path", { required: true }), f.textarea("objective", "Objective", { required: true }), f.text("baseRef", "Base ref", { default: "HEAD" }), f.textarea("changeText", "Bounded change"), f.json("limits", "Limits", { default: {} })] },
  "fork-from-iteration": { description: "Fork from an iteration through the legacy direct control path.", danger: "A fork request will be queued directly, without creating a fresh project-plan approval.", fields: [f.text("sourceIterationId", "Source iteration ID", { required: true }), f.text("sourceRunId", "Source run ID", { required: true }), f.text("repoPath", "Repository path", { required: true }), f.textarea("objective", "Fork objective", { required: true }), f.text("baseRef", "Base ref", { default: "HEAD" }), f.textarea("changeText", "Bounded change"), f.json("limits", "Limits", { default: {} })] },
  "use-as-next-direction": { description: "Promote accepted iteration direction into a direct next request.", danger: "The accepted direction will be queued as the next runner request.", fields: [f.text("sourceIterationId", "Source iteration ID", { required: true }), f.text("sourceRunId", "Source run ID", { required: true }), f.text("repoPath", "Repository path", { required: true }), f.textarea("objective", "Next objective", { required: true }), f.text("baseRef", "Base ref", { default: "HEAD" }), f.textarea("changeText", "Accepted direction", { required: true }), f.json("limits", "Limits", { default: {} })] },
  "start-showcase-loop": { description: "Start the bounded showcase catalogue loop.", danger: "A multi-generation showcase loop and its first run request will start.", fields: [f.text("repoPath", "Repository path", { required: true }), f.textarea("objective", "Objective", { required: true }), f.number("targetGenerations", "Target generations", { default: 10, min: 1, max: 10 }), f.text("baseRef", "Base ref", { default: "HEAD" }), f.json("acceptanceGateIds", "Acceptance gate IDs", { default: [] }), f.json("limits", "Safety limits", { default: { maxVariantsPerIteration: 3, maxParallelVariants: 3, maxAcceptedFeatures: 4, maxVisualMotifChanges: 1, maxNewSections: 1, stopAfterNoImprovement: 1, minImprovementScore: 0.05 } })] },
  "pause-showcase-loop": { description: "Pause the showcase loop at a checkpoint.", fields: [f.textarea("reason", "Reason")] },
  "resume-showcase-loop": { description: "Resume a paused showcase loop." },
  "stop-showcase-loop": { description: "Stop the showcase loop and clear its next request.", danger: "The showcase loop will stop and its pending next-run request will be cleared.", fields: [f.textarea("reason", "Reason")] },
  "set-showcase-target": { description: "Set the showcase target from one to ten generations.", fields: [f.number("targetGenerations", "Target generations", { required: true, default: 10, min: 1, max: 10 })] },
  "gate-decision": { description: "Record an auditable acceptance-gate decision.", danger: "This decision will change the selected gate's status and be attached to the run when provided.", fields: [f.text("gateId", "Gate ID", { required: true }), f.text("runId", "Run ID"), f.select("status", "Status", ["passed", "failed", "needs-evidence"]), f.text("decision", "Decision"), f.json("evidenceArtifacts", "Evidence artifacts", { default: [] }), f.textarea("notes", "Notes")] },
  "attach-gate-evidence": { description: "Attach artifact evidence to an acceptance gate.", fields: [f.text("gateId", "Gate ID", { required: true }), f.text("runId", "Run ID"), f.json("artifacts", "Artifact paths", { default: [] }), f.textarea("notes", "Notes")] },
  "add-queue-item": { description: "Add a bounded project objective to the autonomous queue.", fields: [f.text("title", "Title", { required: true }), f.textarea("objective", "Objective", { required: true }), f.textarea("context", "Context"), f.textarea("constraints", "Constraints", { help: "One per line" }), f.number("priority", "Priority", { default: 50 }), f.checkbox("pin", "Pin immediately"), f.json("acceptanceGateIds", "Acceptance gate IDs", { default: [] }), f.json("target", "Target", { default: {} })] },
  "clear-queue": { description: "Clear all queue items and queue-linked steering.", danger: "All queue items, the pinned objective, pending next-run request, and queue-linked steering will be cleared.", phrase: "CLEAR QUEUE" },
  "pin-queue-item": { description: "Pin a queue item and export it as the current idea.", fields: [f.text("itemId", "Queue item ID", { required: true })] },
  "archive-queue-item": { description: "Archive one queue item.", danger: "The selected queue item will be archived and unpinned if currently pinned.", fields: [f.text("itemId", "Queue item ID", { required: true })] },
  "add-gate": { description: "Create an acceptance gate.", fields: [f.text("id", "Gate ID"), f.select("phase", "Phase", WORKFLOW_PHASES), f.select("severity", "Severity", ["must", "should"]), f.textarea("description", "Description", { required: true }), f.textarea("requiredEvidence", "Required evidence", { help: "One path per line" })] },
  "update-gate": { description: "Update an existing acceptance gate.", fields: [f.text("gateId", "Gate ID", { required: true }), f.select("phase", "Phase", WORKFLOW_PHASES), f.select("severity", "Severity", ["must", "should"]), f.textarea("description", "Description"), f.textarea("requiredEvidence", "Required evidence", { help: "One path per line" }), f.select("status", "Status", ["pending", "passed", "failed", "needs-evidence"])] }
};

const commands = [];
const addCommand = (command) => commands.push({ aliases: [], fields: [], ...command });

function addViewCommands() {
  const definitions = [
    ["workflow", "Workflow and control state", "refreshState"],
    ["runs", "Runs and current selection", "refreshRuns"],
    ["agents", "Agents inferred from state and events", null],
    ["events", "Live normalized event stream", "refreshEvents"],
    ["tools", "Structured tool-call activity", null],
    ["queue", "Autonomous work queue", "refreshQueue"],
    ["gates", "Acceptance gates, evidence, and decisions", "refreshGates"],
    ["audit", "Operator command audit", "refreshAudit"],
    ["iterations", "Iteration lineage and outcomes", "refreshIterations"],
    ["plans", "Persisted project-plan ledgers", "refreshPlans"],
    ["assistance", "Planning-assistance conversations", "listPlanAssistance"],
    ["resources", "Selected run data, artifacts, logs, and documents", "loadRunResources"],
    ["raw", "Headless client snapshot", null]
  ];
  definitions.forEach(([name, description, method]) => addCommand({
    id: `show.${name}`,
    grammar: `show ${name}`,
    title: `Show ${name}`,
    group: "View",
    method: method || "getSnapshot",
    description,
    aliases: [name],
    bufferView: name
  }));
  addCommand({ id: "search.data", grammar: "search <text>", title: "Search operational data", group: "View", method: "getSnapshot", description: "Search runs, agents, events, tools, queue, gates, iterations, and plans.", fields: [f.text("query", "Search text", { required: true })], bufferView: "search" });
  addCommand({ id: "open.run", grammar: "open run <id>", title: "Open run", group: "View", method: "selectRun", description: "Select a run and load run data, artifacts, and logs.", fields: [f.text("runId", "Run ID", { required: true })], run: async ({ runId }) => { await client.selectRun(runId); return openBuffer("resources", { runId }, `run ${runId}`, `apb://runs/${runId}`); } });
  addCommand({ id: "open.artifact", grammar: "open artifact <name>", title: "Open artifact", group: "View", method: "loadArtifact", description: "Load escaped artifact text from the selected run.", fields: [f.text("name", "Artifact path", { required: true }), f.text("runId", "Run ID", { default: () => ui.snapshot.selectedRunId || "" })], run: async (args) => showLoadedResource(await client.loadArtifact(args.name, args.runId), "artifact") });
  addCommand({ id: "open.log", grammar: "open log <name>", title: "Open log", group: "View", method: "loadLog", description: "Load a bounded tail from a selected run log.", fields: [f.text("name", "Log name", { required: true }), f.text("runId", "Run ID", { default: () => ui.snapshot.selectedRunId || "" }), f.number("tail", "Tail lines", { default: 400, min: 1, max: 100000 })], run: async (args) => showLoadedResource(await client.loadLog(args.name, args.runId, { tail: args.tail }), "log") });
  addCommand({ id: "open.document", grammar: "open document <spec|devplan>", title: "Open SPEC or DEVPLAN", group: "View", method: "loadDocument", description: "Resolve and load a generated SPEC or DEVPLAN artifact.", fields: [f.select("kind", "Document", ["spec", "devplan"]), f.text("runId", "Run ID", { default: () => ui.snapshot.selectedRunId || "" })], run: async (args) => showLoadedResource(await client.loadDocument(args.kind, args.runId), args.kind) });
  addCommand({ id: "open.iteration", grammar: "open iteration <id>", title: "Open iteration", group: "View", method: "selectIteration", description: "Select and load full iteration evidence and lineage.", fields: [f.text("iterationId", "Iteration ID or run ID", { required: true })], run: async ({ iterationId }) => { await client.selectIteration(iterationId); return openBuffer("iteration-detail", { iterationId }, `iteration ${iterationId}`, `apb://iterations/${iterationId}`); } });
}

function addStreamCommands() {
  addCommand({ id: "stream.connect", grammar: "stream connect", title: "Connect live stream", group: "Stream", method: "connect", description: "Refresh all data and connect SSE, with polling fallback.", run: () => client.connect() });
  addCommand({ id: "stream.pause", grammar: "stream pause", title: "Pause live stream", group: "Stream", method: "pause", description: "Pause browser-side live updates without changing workflow execution.", run: () => client.pause() });
  addCommand({ id: "stream.resume", grammar: "stream resume", title: "Resume live stream", group: "Stream", method: "resume", description: "Refresh data and resume browser-side live updates.", run: () => client.resume() });
  addCommand({ id: "stream.disconnect", grammar: "stream disconnect", title: "Disconnect live stream", group: "Stream", method: "disconnect", description: "Close browser SSE and polling without changing workflow execution.", run: () => client.disconnect() });
  addCommand({ id: "stream.refresh", grammar: "refresh all", title: "Refresh all data", group: "Stream", method: "refresh", description: "Refresh all headless-client read models now.", aliases: ["refresh"], run: () => client.refresh() });
  const refreshes = [
    ["state", "refreshState"], ["runs", "refreshRuns"], ["events", "refreshEvents"],
    ["control", "refreshControl"], ["queue", "refreshQueue"], ["gates", "refreshGates"],
    ["audit", "refreshAudit"], ["iterations", "refreshIterations"], ["plans", "refreshPlans"]
  ];
  refreshes.forEach(([name, method]) => addCommand({ id: `refresh.${name}`, grammar: `refresh ${name}`, title: `Refresh ${name}`, group: "Stream", method, description: `Refresh only ${name} data.`, run: () => client[method]() }));
  addCommand({ id: "events.ingest", grammar: "events ingest", title: "Ingest local event records", group: "Stream", method: "ingestEvents", description: "Advanced: normalize event records into the local bounded client buffer. No server write occurs.", fields: [f.json("events", "Event array", { required: true, default: [] })], run: ({ events }) => client.ingestEvents(events) });
  addCommand({ id: "stream.unsubscribe", grammar: "stream unsubscribe view", title: "Unsubscribe shell rendering", group: "Stream", method: "unsubscribe", description: "Advanced: detach the shell's model listener without disconnecting the client transport.", run: () => { client.unsubscribe(onSnapshot); ui.subscribed = false; return { subscribed: false, transport: client.getSnapshot().connection }; } });
  addCommand({ id: "stream.subscribe", grammar: "stream subscribe view", title: "Subscribe shell rendering", group: "Stream", method: "subscribe", description: "Attach the shell model listener after it has been explicitly unsubscribed.", run: () => { if (!ui.subscribed) client.subscribe(onSnapshot); return { subscribed: true, transport: client.getSnapshot().connection }; } });
  addCommand({ id: "iteration.reload", grammar: "refresh iteration detail", title: "Refresh selected iteration detail", group: "Stream", method: "loadIterationDetail", description: "Reload full evidence for the selected iteration.", run: () => client.loadIterationDetail() });
}

function addOperationalCommands() {
  OPERATION_COMMANDS.forEach((type) => {
    const definition = operationalDefinitions[type];
    addCommand({
      id: `operate.${type}`,
      grammar: `action ${type}`,
      title: type.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" "),
      group: "Operate",
      method: `command("${type}")`,
      aliases: [type],
      ...definition,
      run: async (payload) => client.command(type, payload, { refresh: true })
    });
  });
}

function selectedPlanId(args = {}) {
  return args.planId || ui.snapshot.planDetail?.ledger?.planId || ui.snapshot.plans[0]?.planId || "";
}

async function planDetail(args = {}) {
  const planId = selectedPlanId(args);
  if (!planId) throw new Error("A project plan ID is required");
  if (ui.snapshot.planDetail?.ledger?.planId === planId) return ui.snapshot.planDetail;
  return client.getProjectPlan(planId);
}

function exactPlanPayload(detail, notes) {
  return { planId: detail.ledger.planId, revision: detail.ledger.currentRevision, planDigest: detail.ledger.currentDigest, ...(notes !== undefined ? { notes } : {}) };
}

function addPlanCommands() {
  addCommand({ id: "plan.open", grammar: "plan open <id>", title: "Open project plan", group: "Plans", method: "getProjectPlan", description: "Load plan ledger, current revision, decisions, launches, and revision lineage.", fields: [f.text("planId", "Plan ID", { required: true })], run: async (args) => { await client.getProjectPlan(args.planId); return openBuffer("plan-detail", args, `plan ${args.planId}`, `apb://plans/${args.planId}`); } });
  addCommand({ id: "plan.revision", grammar: "plan revision <plan> <revision>", title: "Open project-plan revision", group: "Plans", method: "getProjectPlanRevision", description: "Load one immutable saved plan revision.", fields: [f.text("planId", "Plan ID", { required: true }), f.number("revision", "Revision", { required: true, min: 1 })], run: async (args) => showLoadedResource(await client.getProjectPlanRevision(args.planId, args.revision), "plan revision") });
  addCommand({ id: "plan.raw-command", grammar: "plan raw command", title: "Run generic project-plan command", group: "Plans", method: "projectPlanCommand", description: "Advanced exact-envelope access. Prefer the action-specific plan commands, which derive current version and digest safely.", danger: "The supplied project-plan action and payload will be sent exactly as entered.", fields: [f.select("type", "Action", PROJECT_PLAN_ACTIONS), f.json("payload", "Exact payload", { required: true, default: {} }), f.number("expectedVersion", "Expected ledger version", { required: true, min: 1 })], run: (args) => client.projectPlanCommand(args.type, args.payload, { expectedVersion: args.expectedVersion, refresh: true }) });

  const definitions = {
    "project-plan.create": { method: "createProjectPlan", description: "Create a persisted draft from complete validated content.", fields: [f.json("content", "Project plan content", { required: true, default: planDefaults("classic") })], run: (args) => client.createProjectPlan({ content: args.content }, { refresh: true }) },
    "project-plan.update": { method: "updateProjectPlan", description: "Save complete content as a new immutable revision.", fields: [f.text("planId", "Plan ID", { required: true, default: () => selectedPlanId() }), f.json("content", "Complete plan content", { required: true, default: () => ui.snapshot.planDetail?.revision?.content || planDefaults("classic") })], run: async (args) => { const detail = await planDetail(args); return client.updateProjectPlan({ planId: detail.ledger.planId, content: args.content }, { expectedVersion: detail.ledger.version, refresh: true }); } },
    "project-plan.ready-for-review": { method: "submitProjectPlanForReview", description: "Validate and freeze the exact current revision for review.", fields: [f.text("planId", "Plan ID", { required: true, default: () => selectedPlanId() })], run: async (args) => { const detail = await planDetail(args); return client.submitProjectPlanForReview(exactPlanPayload(detail), { expectedVersion: detail.ledger.version, refresh: true }); } },
    "project-plan.approve": { method: "approveProjectPlan", description: "Approve the exact valid review revision.", danger: "The exact plan revision and digest will become approved for launch.", fields: [f.text("planId", "Plan ID", { required: true, default: () => selectedPlanId() }), f.textarea("notes", "Approval notes")], run: async (args) => { const detail = await planDetail(args); return client.approveProjectPlan(exactPlanPayload(detail, args.notes || ""), { expectedVersion: detail.ledger.version, refresh: true }); } },
    "project-plan.reject": { method: "rejectProjectPlan", description: "Reject the exact review revision with required notes.", danger: "The effective approval will be removed and the plan revision marked rejected.", fields: [f.text("planId", "Plan ID", { required: true, default: () => selectedPlanId() }), f.textarea("notes", "Rejection notes", { required: true })], run: async (args) => { const detail = await planDetail(args); return client.rejectProjectPlan(exactPlanPayload(detail, args.notes), { expectedVersion: detail.ledger.version, refresh: true }); } },
    "project-plan.launch": { method: "launchProjectPlan", description: "Launch the exact currently approved plan revision.", danger: "The approved plan will be admitted to the runner and may begin autonomous work.", fields: [f.text("planId", "Plan ID", { required: true, default: () => selectedPlanId() })], run: async (args) => { const detail = await planDetail(args); return client.launchProjectPlan(exactPlanPayload(detail), { expectedVersion: detail.ledger.version, refresh: true }); } },
    "project-plan.clone": { method: "cloneProjectPlan", description: "Create a draft clone with explicit lineage.", fields: [f.text("planId", "Source plan ID", { required: true, default: () => selectedPlanId() }), f.text("sourceRunId", "Source run ID"), f.text("sourceIterationId", "Source iteration ID"), f.text("baseRef", "New base ref")], run: async (args) => { const detail = await planDetail(args); return client.cloneProjectPlan({ ...exactPlanPayload(detail), sourceRunId: args.sourceRunId || null, sourceIterationId: args.sourceIterationId || null, baseRef: args.baseRef || detail.revision.content.repository.baseRef }, { expectedVersion: detail.ledger.version, refresh: true }); } },
    "project-plan.fork": { method: "forkProjectPlan", description: "Create a draft fork with explicit lineage.", fields: [f.text("planId", "Source plan ID", { required: true, default: () => selectedPlanId() }), f.text("sourceRunId", "Source run ID"), f.text("sourceIterationId", "Source iteration ID"), f.text("baseRef", "Fork base ref")], run: async (args) => { const detail = await planDetail(args); return client.forkProjectPlan({ ...exactPlanPayload(detail), sourceRunId: args.sourceRunId || null, sourceIterationId: args.sourceIterationId || null, baseRef: args.baseRef || detail.revision.content.repository.baseRef }, { expectedVersion: detail.ledger.version, refresh: true }); } },
    "project-plan.archive": { method: "archiveProjectPlan", description: "Archive an inactive project plan.", danger: "The plan will be archived and its effective approval removed.", phrase: (args) => `ARCHIVE ${selectedPlanId(args)}`, fields: [f.text("planId", "Plan ID", { required: true, default: () => selectedPlanId() })], run: async (args) => { const detail = await planDetail(args); return client.archiveProjectPlan({ planId: detail.ledger.planId }, { expectedVersion: detail.ledger.version, refresh: true }); } }
  };
  PROJECT_PLAN_ACTIONS.forEach((type) => {
    const definition = definitions[type];
    addCommand({ id: `plan.${type.slice(13)}`, grammar: type.replace("project-plan.", "plan "), title: type.slice(13).split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ") + " plan", group: "Plans", aliases: [type], ...definition });
  });
}

function addAssistanceCommands() {
  addCommand({ id: "assist.list", grammar: "assist list", title: "List planning conversations", group: "Assist", method: "listPlanAssistance", description: "List persisted planning-assistance conversations.", run: async () => { await client.listPlanAssistance(); return openBuffer("assistance", {}, "assistance", "apb://assistance"); } });
  addCommand({ id: "assist.create", grammar: "assist create", title: "Start planning assistance", group: "Assist", method: "createPlanAssistance", description: "Start a bounded classic or managed planning conversation. Messages may reach the configured inference provider.", fields: [f.select("pipelineType", "Pipeline", ["classic", "managed"])], run: async ({ pipelineType }) => { const detail = await client.createPlanAssistance(pipelineType); return openBuffer("assistance-detail", { id: detail.id }, `assistance ${detail.id}`, `apb://assistance/${detail.id}`); } });
  addCommand({ id: "assist.open", grammar: "assist open <id>", title: "Open planning conversation", group: "Assist", method: "getPlanAssistance", description: "Load a planning transcript and inert proposed content.", fields: [f.text("id", "Conversation ID", { required: true })], run: async ({ id }) => { await client.getPlanAssistance(id); return openBuffer("assistance-detail", { id }, `assistance ${id}`, `apb://assistance/${id}`); } });
  addCommand({ id: "assist.message", grammar: "assist message <id>", title: "Message planning assistance", group: "Assist", method: "messagePlanAssistance", description: "Send a planning message. Do not include secrets. Suggestions cannot execute or approve work.", fields: [f.text("id", "Conversation ID", { required: true, default: () => ui.snapshot.assistanceDetail?.id || "" }), f.textarea("message", "Planning message", { required: true, maxlength: 16000 })], run: async (args) => { const detail = ui.snapshot.assistanceDetail?.id === args.id ? ui.snapshot.assistanceDetail : await client.getPlanAssistance(args.id); const result = await client.messagePlanAssistance(args.id, detail.version, args.message); openBuffer("assistance-detail", { id: result.id }, `assistance ${result.id}`, `apb://assistance/${result.id}`); return result; } });
  addCommand({ id: "assist.persist", grammar: "assist persist proposal", title: "Create plan from assistance proposal", group: "Assist", method: "createProjectPlan", description: "Explicitly persist the current inert proposal as a new project-plan draft.", fields: [f.text("id", "Conversation ID", { required: true, default: () => ui.snapshot.assistanceDetail?.id || "" })], run: async (args) => { const detail = ui.snapshot.assistanceDetail?.id === args.id ? ui.snapshot.assistanceDetail : await client.getPlanAssistance(args.id); if (!detail.proposedContent) throw new Error("This conversation has no validated proposal"); return client.createProjectPlan({ content: detail.proposedContent }, { refresh: true }); } });
}

function addSystemCommands() {
  addCommand({ id: "help", grammar: "help", title: "Open command help", group: "System", method: "getSnapshot", aliases: ["?"], description: "Show grammar, key bindings, and every available command.", bufferView: "help" });
  addCommand({ id: "theme.cycle", grammar: "theme cycle", title: "Cycle color theme", group: "System", method: "browser preference", description: "Switch between paper and low-glare slate themes.", run: cycleTheme });
  addCommand({ id: "buffer.swap", grammar: "buffer swap", title: "Swap text buffers", group: "System", method: "browser view", description: "Exchange the left and right buffer contents.", run: swapBuffers });
  addCommand({ id: "buffer.focus1", grammar: "buffer 1", title: "Focus buffer 1", group: "System", method: "browser view", description: "Make text buffer 1 active.", run: () => focusBuffer(0, true) });
  addCommand({ id: "buffer.focus2", grammar: "buffer 2", title: "Focus buffer 2", group: "System", method: "browser view", description: "Make text buffer 2 active.", run: () => focusBuffer(1, true) });
}

addViewCommands();
addStreamCommands();
addOperationalCommands();
addPlanCommands();
addAssistanceCommands();
addSystemCommands();

const commandById = new Map(commands.map((command) => [command.id, command]));

function commandSearch(query) {
  const terms = String(query || "").toLowerCase().trim().split(/\s+/).filter(Boolean);
  return commands.map((command, index) => {
    const haystack = [command.title, command.grammar, command.group, command.method, command.description, ...command.aliases].join(" ").toLowerCase();
    if (!terms.every((term) => haystack.includes(term))) return null;
    const input = terms.join(" ");
    const grammar = command.grammar.toLowerCase();
    const score = grammar === input ? 0 : grammar.startsWith(input) ? 1 : command.title.toLowerCase().startsWith(input) ? 2 : haystack.indexOf(input) >= 0 ? 3 : 4;
    return { command, score, index };
  }).filter(Boolean).sort((a, b) => a.score - b.score || a.index - b.index).map((item) => item.command);
}

function resolveInput(value) {
  const input = value.trim();
  const lower = input.toLowerCase();
  const direct = commands.find((command) => command.grammar.toLowerCase() === lower || command.id === lower || command.aliases.some((alias) => alias.toLowerCase() === lower));
  if (direct) return { command: direct, args: {} };
  let match = input.match(/^show\s+([\w-]+)$/i);
  if (match && commandById.has(`show.${match[1].toLowerCase()}`)) return { command: commandById.get(`show.${match[1].toLowerCase()}`), args: {} };
  match = input.match(/^search\s+(.+)$/i);
  if (match) return { command: commandById.get("search.data"), args: { query: match[1] } };
  match = input.match(/^open\s+(run|artifact|log|iteration)\s+(.+)$/i);
  if (match) return { command: commandById.get(`open.${match[1].toLowerCase()}`), args: { [match[1].toLowerCase() === "iteration" ? "iterationId" : match[1].toLowerCase() === "run" ? "runId" : "name"]: match[2] } };
  match = input.match(/^open\s+(?:document|doc)\s+(spec|devplan)$/i);
  if (match) return { command: commandById.get("open.document"), args: { kind: match[1].toLowerCase(), runId: ui.snapshot.selectedRunId } };
  match = input.match(/^action\s+([\w-]+)$/i);
  if (match && commandById.has(`operate.${match[1]}`)) return { command: commandById.get(`operate.${match[1]}`), args: {} };
  match = input.match(/^plan\s+open\s+(.+)$/i);
  if (match) return { command: commandById.get("plan.open"), args: { planId: match[1] } };
  match = input.match(/^assist\s+open\s+(.+)$/i);
  if (match) return { command: commandById.get("assist.open"), args: { id: match[1] } };
  const matches = commandSearch(input);
  return matches.length === 1 ? { command: matches[0], args: {} } : null;
}

async function executeCommand(command, suppliedArgs = {}, options = {}) {
  closePalette();
  const needsFields = command.fields.some((field) => suppliedArgs[field.name] === undefined && (field.required || command.fields.length > 1 || field.type !== "text"));
  if (!options.fromForm && command.fields.length && (needsFields || Object.keys(suppliedArgs).length === 0)) {
    openCommandForm(command, suppliedArgs);
    return;
  }
  if (command.bufferView) {
    try {
      if (typeof client[command.method] === "function") await client[command.method]();
      openBuffer(command.bufferView, suppliedArgs, command.bufferView, `apb://${command.bufferView}`);
      rememberCommand(command.grammar);
      setResult(`${command.title} opened`, "ok");
    } catch (error) {
      setResult(error?.message || String(error), "danger");
      announce(`${command.title} failed. ${error?.message || error}`, true);
    }
    return;
  }
  try {
    if (command.danger) {
      const phrase = typeof command.phrase === "function" ? command.phrase(suppliedArgs) : command.phrase;
      const allowed = await confirmOperation(command, suppliedArgs, phrase);
      if (!allowed) { setResult("command cancelled"); return; }
    }
    setBusy(true, `running ${command.grammar}`);
    const result = await command.run(suppliedArgs);
    rememberCommand(options.line || command.grammar);
    setResult(`${command.title}: complete`, "ok");
    announce(`${command.title} completed successfully.`);
    if (result && result !== ui.snapshot && typeof result === "object" && !command.id.startsWith("stream.")) showResult(command, result);
  } catch (error) {
    const details = list(error?.details).join("; ");
    const message = `${error?.message || error}${details ? `: ${details}` : ""}`;
    setResult(message, "danger");
    announce(`${command.title} failed. ${message}`, true);
  } finally {
    setBusy(false);
  }
}

function setBusy(busy, message) {
  $("#runCommand").disabled = busy;
  $("#commandInput").setAttribute("aria-busy", String(busy));
  if (busy) setResult(message || "working");
}

function rememberCommand(line) {
  if (!line) return;
  ui.history = [...ui.history.filter((item) => item !== line), line].slice(-100);
  ui.historyIndex = ui.history.length;
  savePreference("history", ui.history);
}

function showResult(command, result) {
  const target = ui.activeBuffer;
  ui.buffers[target] = { commandId: "result", args: { result }, title: `${command.title} result`, path: `apb://commands/${command.id}` };
  renderBuffer(target);
}

function showLoadedResource(result, kind) {
  ui.buffers[ui.activeBuffer] = { commandId: "loaded-resource", args: { result }, title: `${kind}: ${result.name || result.revision || "detail"}`, path: `apb://${kind.replaceAll(" ", "-")}/${result.name || result.runId || "detail"}` };
  renderBuffer(ui.activeBuffer);
  return result;
}

function openBuffer(view, args = {}, title = view, path = `apb://${view}`) {
  ui.buffers[ui.activeBuffer] = { commandId: `show.${view}`, args, title, path, view };
  renderBuffer(ui.activeBuffer);
  return ui.buffers[ui.activeBuffer];
}

function focusBuffer(index, focus = false) {
  ui.activeBuffer = Number(index);
  $$(".buffer").forEach((buffer, position) => buffer.classList.toggle("active", position === ui.activeBuffer));
  $("#bufferStatus").textContent = `buffer 0${ui.activeBuffer + 1}`;
  if (focus) $(`#buffer${ui.activeBuffer}`).focus();
}

function swapBuffers() {
  ui.buffers.reverse();
  renderBuffer(0);
  renderBuffer(1);
}

function cycleTheme() {
  const theme = document.documentElement.dataset.theme === "paper" ? "slate" : "paper";
  document.documentElement.dataset.theme = theme;
  savePreference("theme", theme);
  setResult(`${theme} theme`, "ok");
}

function renderBuffer(index) {
  const descriptor = ui.buffers[index];
  const body = $(`#buffer${index}Body`);
  $(`#buffer${index}Title`).textContent = descriptor.title;
  $(`#buffer${index}Path`).textContent = descriptor.path;
  const view = descriptor.view || descriptor.commandId.replace(/^show\./, "");
  const changedView = body.dataset.view !== view;
  if (changedView || view !== "events") {
    body.replaceChildren();
    body.dataset.view = view;
    if (changedView) delete body.dataset.logReady;
  }
  if (view === "events") {
    body.setAttribute("role", "log");
    body.setAttribute("aria-label", "Operational event log");
    body.setAttribute("aria-live", body.dataset.logReady && ui.announceStream ? "polite" : "off");
    body.setAttribute("aria-relevant", "additions text");
  } else {
    body.removeAttribute("role");
    body.removeAttribute("aria-live");
    body.removeAttribute("aria-relevant");
    body.removeAttribute("aria-label");
  }
  const renderer = renderers[view];
  if (renderer) renderer(body, descriptor.args);
  else if (descriptor.commandId === "result" || descriptor.commandId === "loaded-resource") body.append(raw(descriptor.args.result));
  else body.append(empty("No renderer is registered for this resource."));
  if (view === "events" && !body.dataset.logReady) requestAnimationFrame(() => {
    body.dataset.logReady = "true";
    body.setAttribute("aria-live", ui.announceStream ? "polite" : "off");
  });
}

const renderers = {
  workflow(body) {
    const s = ui.snapshot.state || {};
    const c = ui.snapshot.control || {};
    const intro = section("Workflow", "live state and control projection");
    intro.append(summaryGrid([
      ["Status", token(s.status || s.phase || "unknown")],
      ["Phase", s.phase],
      ["Current run", s.currentRunId],
      ["Project", s.selectedProject?.name || s.currentProject],
      ["Task", s.task || s.currentTask],
      ["Run admission", token(c.runAdmission || "unknown")],
      ["Transport", token(ui.snapshot.connection.status)],
      ["Updated", dateTime(s.updatedAt)]
    ]));
    body.append(intro);
    const objective = section("Objective and controls");
    objective.append(summaryGrid([
      ["Objective", c.currentObjective?.text || "No current objective"],
      ["Pause", c.pause?.requested ? `${c.pause.mode || "checkpoint"}: ${c.pause.reason || "requested"}` : "not requested"],
      ["Stop", c.stop?.requested ? `${c.stop.mode || "graceful"}: ${c.stop.reason || "requested"}` : "not requested"],
      ["Showcase", c.autoIteration?.enabled ? `generation ${c.autoIteration.currentGeneration || 1}/${c.autoIteration.targetGenerations || c.autoIteration.maxIterations || "?"}` : "disabled"]
    ]));
    objective.append(node("div", { className: "resource-actions" }, [commandButton("Pause workflow", "operate.pause"), commandButton("Resume workflow", "operate.resume"), commandButton("Steer objective", "operate.steer"), commandButton("Start iteration", "operate.start-next-iteration"), commandButton("Show raw", "show.raw")]));
    body.append(objective);
    if (s.block || s.blocker || s.hold) { const blocked = section("Blocker", "operator attention required"); blocked.append(raw(s.block || s.blocker || s.hold), node("div", { className: "resource-actions" }, [commandButton("Request advice", "operate.deblock-advice"), commandButton("Queue deblock", "operate.deblock")])); body.append(blocked); }
  },
  runs(body) {
    const area = section("Runs", `${ui.snapshot.runs.length} recorded`);
    area.append(table([
      { label: "Run", value: (run) => commandButton(run.id, "open.run", { runId: run.id }) },
      { label: "Status", value: (run) => token(run.status || "unknown") },
      { label: "Project", value: (run) => run.project || run.projectName || run.selectedProject?.name },
      { label: "Started", value: (run) => dateTime(run.startedAt || run.createdAt) },
      { label: "Updated", value: (run) => dateTime(run.updatedAt || run.completedAt) }
    ], ui.snapshot.runs, "No runs have been recorded."));
    body.append(area);
  },
  agents(body) {
    const rows = agents(ui.snapshot);
    const area = section("Agents", `${rows.length} observed`);
    area.append(table([
      { label: "Agent", value: (agent) => agent.label || agent.id },
      { label: "Role", value: (agent) => agent.role },
      { label: "Status", value: (agent) => token(agent.status || "unknown") },
      { label: "Phase", value: (agent) => agent.currentPhase || ui.snapshot.state?.phase },
      { label: "Current task", value: (agent) => agent.currentTask || agent.task || agent.lastMessage }
    ], rows, "No agents are represented in current state or events."));
    body.append(area);
  },
  events(body, args = {}) {
    let events = ui.snapshot.events;
    if (args.query) { const query = args.query.toLowerCase(); events = events.filter((event) => json(event).toLowerCase().includes(query)); }
    const visible = events.slice(-500);
    const existing = new Map($$("[data-event-id]", body).map((element) => [element.dataset.eventId, element]));
    const valid = new Set(visible.map((event) => event.id));
    body.querySelector(".empty-state")?.remove();
    visible.forEach((event, index) => {
      let line = existing.get(event.id);
      if (!line) line = node("div", { className: "event-line", dataset: { eventId: event.id } }, [
        node("time", { text: time(event.ts), dateTime: event.ts }),
        node("span", { className: "event-level", text: event.level || "info", dataset: { tone: toneFor(event.level) } }),
        node("span", { className: "event-source", text: event.agentId || event.source || "system" }),
        node("span", { className: "event-message" }, [node("b", { text: event.type || "event" }), node("span", { text: event.message || text(event.data) })])
      ]);
      if (body.children[index] !== line) body.insertBefore(line, body.children[index] || null);
    });
    existing.forEach((element, id) => { if (!valid.has(id)) element.remove(); });
    if (!visible.length) body.append(empty("No events match the current view."));
  },
  tools(body) {
    const rows = toolCalls(ui.snapshot.events).reverse();
    const area = section("Tool calls", `${rows.length} correlated`);
    area.append(table([
      { label: "Tool", value: "name" },
      { label: "Agent", value: "agentId" },
      { label: "Status", value: (tool) => token(tool.status) },
      { label: "Action", value: "action" },
      { label: "Duration", value: (tool) => tool.durationMs === undefined ? "-" : `${tool.durationMs} ms` },
      { label: "Updated", value: (tool) => dateTime(tool.updatedAt) }
    ], rows, "No structured tool calls have been observed."));
    body.append(area);
  },
  queue(body) {
    const items = list(ui.snapshot.queue?.items);
    const area = section("Queue", `${items.length} items`);
    area.append(node("div", { className: "resource-actions" }, [commandButton("Add item", "operate.add-queue-item"), commandButton("Clear queue", "operate.clear-queue")]));
    area.append(table([
      { label: "Item", value: "id" }, { label: "Priority", value: "priority" }, { label: "Status", value: (item) => token(item.status) },
      { label: "Title", value: "title" }, { label: "Objective", value: "objective" },
      { label: "Actions", value: (item) => node("div", { className: "resource-actions" }, [commandButton("Pin", "operate.pin-queue-item", { itemId: item.id }), commandButton("Archive", "operate.archive-queue-item", { itemId: item.id })]) }
    ], items, "The autonomous queue is empty."));
    body.append(area);
  },
  gates(body) {
    const gates = list(ui.snapshot.gates?.gates);
    const area = section("Acceptance gates", `${gates.length} defined`);
    area.append(node("div", { className: "resource-actions" }, [commandButton("Create gate", "operate.add-gate"), commandButton("Record decision", "operate.gate-decision"), commandButton("Attach evidence", "operate.attach-gate-evidence")]));
    area.append(table([
      { label: "Gate", value: "id" }, { label: "Phase", value: "phase" }, { label: "Severity", value: "severity" }, { label: "Status", value: (gate) => token(gate.status) },
      { label: "Description", value: (gate) => gate.description || gate.title }, { label: "Evidence", value: (gate) => `${list(gate.evidence).length} attached / ${list(gate.requiredEvidence).length} required` },
      { label: "Action", value: (gate) => commandButton("Update", "operate.update-gate", { gateId: gate.id, phase: gate.phase, severity: gate.severity, description: gate.description, requiredEvidence: list(gate.requiredEvidence).join("\n"), status: gate.status }) }
    ], gates, "No acceptance gates are defined."));
    body.append(area);
  },
  audit(body) {
    const area = section("Audit", `${ui.snapshot.audit.length} recent records`);
    area.append(table([
      { label: "Time", value: (entry) => dateTime(entry.ts) }, { label: "Actor", value: "actor" }, { label: "Action", value: "action" },
      { label: "Target", value: (entry) => typeof entry.target === "object" ? clip(entry.target, 120) : entry.target }, { label: "Result", value: (entry) => clip(entry.result, 180) }
    ], ui.snapshot.audit.slice().reverse(), "No audit records are available."));
    body.append(area);
  },
  iterations(body) {
    const area = section("Iteration lineage", `${ui.snapshot.iterations.length} iterations`);
    area.append(table([
      { label: "Iteration", value: (item) => commandButton(item.id || item.runId, "open.iteration", { iterationId: item.id || item.runId }) }, { label: "Run", value: "runId" },
      { label: "Status", value: (item) => token(item.status) }, { label: "Mode", value: "mode" }, { label: "Objective", value: "objective" },
      { label: "Source", value: (item) => item.sourceIterationId || item.sourceRunId }, { label: "Updated", value: (item) => dateTime(item.updatedAt || item.completedAt) }
    ], ui.snapshot.iterations, "No iteration lineage is available."));
    body.append(area);
  },
  "iteration-detail"(body) {
    const detail = ui.snapshot.iterationDetail;
    if (!detail) return body.append(empty("Iteration detail is loading or unavailable."));
    const overview = section("Iteration", detail.id || detail.runId);
    overview.append(summaryGrid([["Status", token(detail.status)], ["Run", detail.runId], ["Mode", detail.mode], ["Objective", detail.objective], ["Gate", token(detail.gateStatus || detail.evidence?.gateReport?.data?.status)], ["Repository", detail.repoPath || detail.run?.repoPath], ["Commit", detail.commit || detail.run?.commit], ["Started", dateTime(detail.startedAt)]]));
    body.append(overview);
    for (const [title, value] of [["Variants", detail.variants], ["Evaluations", detail.evaluations], ["Synthesis", detail.synthesis], ["Gate decisions", detail.gateDecisions || detail.gateDecisionsFromControl], ["Source evidence", detail.sourceEvidence], ["Run data", detail.run]]) {
      const area = section(title, `${list(value).length || (value ? 1 : 0)} records`); area.append(raw(value || [])); body.append(area);
    }
  },
  plans(body) {
    const area = section("Project plans", `${ui.snapshot.plans.length} persisted`);
    area.append(node("div", { className: "resource-actions" }, [commandButton("New draft", "plan.create"), commandButton("Planning assistance", "assist.create")]));
    area.append(table([
      { label: "Plan", value: (plan) => commandButton(plan.planId, "plan.open", { planId: plan.planId }) }, { label: "State", value: (plan) => token(plan.state) },
      { label: "Pipeline", value: "pipelineType" }, { label: "Title", value: (plan) => plan.title || "Untitled" }, { label: "Revision", value: "currentRevision" },
      { label: "Launch", value: (plan) => plan.activeLaunchId || "-" }, { label: "Updated", value: (plan) => dateTime(plan.updatedAt) }
    ], ui.snapshot.plans, "No project plans exist."));
    body.append(area);
  },
  "plan-detail"(body) {
    const detail = ui.snapshot.planDetail;
    if (!detail) return body.append(empty("Plan detail is loading or unavailable."));
    const ledger = detail.ledger;
    const overview = section("Plan ledger", ledger.planId);
    overview.append(summaryGrid([["State", token(ledger.state)], ["Version", ledger.version], ["Current revision", ledger.currentRevision], ["Digest", ledger.currentDigest], ["Effective approval", ledger.effectiveApprovalId], ["Active launch", ledger.activeLaunchId], ["Updated", dateTime(ledger.updatedAt)]]));
    overview.append(node("div", { className: "resource-actions" }, [commandButton("Edit revision", "plan.update", { planId: ledger.planId }), commandButton("Ready for review", "plan.ready-for-review", { planId: ledger.planId }), commandButton("Approve", "plan.approve", { planId: ledger.planId }), commandButton("Reject", "plan.reject", { planId: ledger.planId }), commandButton("Launch", "plan.launch", { planId: ledger.planId }), commandButton("Clone", "plan.clone", { planId: ledger.planId }), commandButton("Fork", "plan.fork", { planId: ledger.planId }), commandButton("Archive", "plan.archive", { planId: ledger.planId })]));
    body.append(overview);
    const content = section("Current immutable revision", `revision ${detail.revision.revision}`); content.append(raw(detail.revision)); body.append(content);
    const lineage = section("Decisions and launches", `${list(detail.decisions).length} decisions / ${list(detail.launches).length} launches`); lineage.append(raw({ decisions: detail.decisions, launches: detail.launches, revisions: detail.revisions?.map((revision) => ({ revision: revision.revision, digest: revision.contentDigest, createdAt: revision.createdAt })) })); body.append(lineage);
  },
  assistance(body) {
    const area = section("Planning assistance", `${ui.snapshot.assistance.length} conversations`);
    area.append(node("div", { className: "resource-actions" }, [commandButton("Start conversation", "assist.create")]));
    area.append(table([
      { label: "Conversation", value: (item) => commandButton(item.id, "assist.open", { id: item.id }) }, { label: "Pipeline", value: "pipelineType" },
      { label: "Messages", value: "messageCount" }, { label: "Version", value: "version" }, { label: "Updated", value: (item) => dateTime(item.updatedAt) }
    ], ui.snapshot.assistance, "No planning conversations exist."));
    body.append(area);
  },
  "assistance-detail"(body) {
    const detail = ui.snapshot.assistanceDetail;
    if (!detail) return body.append(empty("Planning conversation is loading or unavailable."));
    const overview = section("Planning conversation", `${detail.pipelineType} / version ${detail.version}`);
    overview.append(node("p", { text: "Messages may be sent to the configured inference provider. Suggestions are inert and cannot save, approve, launch, or execute work." }));
    overview.append(node("div", { className: "resource-actions" }, [commandButton("Send message", "assist.message", { id: detail.id }), commandButton("Persist proposal as draft", "assist.persist", { id: detail.id })])); body.append(overview);
    const transcript = section("Transcript", `${list(detail.messages).length} messages`);
    list(detail.messages).forEach((message) => transcript.append(node("article", { className: "assistance-message", dataset: { role: message.role } }, [node("header", {}, [node("strong", { text: message.role }), node("time", { text: dateTime(message.createdAt) })]), node("p", { text: message.content })])));
    if (!detail.messages?.length) transcript.append(empty("Describe the project, users, boundaries, and success criteria."));
    body.append(transcript);
    const proposal = section("Validated proposal", detail.proposedContent ? "inert until explicitly persisted" : "not available"); proposal.append(detail.proposedContent ? raw(detail.proposedContent) : empty("Continue the conversation to develop a complete proposal.")); body.append(proposal);
  },
  resources(body) {
    const selected = ui.snapshot.selectedRun;
    const run = selected.run;
    if (!run) return body.append(empty("Select a run to load its data, artifacts, and logs."));
    const overview = section("Run data", ui.snapshot.selectedRunId); overview.append(raw(run)); body.append(overview);
    const artifactsArea = section("Artifacts", `${selected.artifacts.length} files`);
    artifactsArea.append(node("div", { className: "resource-actions" }, [commandButton("Open SPEC", "open.document", { kind: "spec", runId: ui.snapshot.selectedRunId }), commandButton("Open DEVPLAN", "open.document", { kind: "devplan", runId: ui.snapshot.selectedRunId }), ...selected.artifacts.map((artifact) => commandButton(artifact.name, "open.artifact", { name: artifact.name, runId: ui.snapshot.selectedRunId }))])); body.append(artifactsArea);
    const logsArea = section("Logs", `${selected.logs.length} files`); logsArea.append(node("div", { className: "resource-actions" }, selected.logs.map((log) => commandButton(log.name, "open.log", { name: log.name, runId: ui.snapshot.selectedRunId, tail: 400 })))); body.append(logsArea);
  },
  search(body, args = {}) {
    const query = String(args.query || "").toLowerCase();
    const sources = [
      ["Runs", ui.snapshot.runs, (item) => commandButton(item.id, "open.run", { runId: item.id })],
      ["Agents", agents(ui.snapshot), (item) => item.id],
      ["Events", ui.snapshot.events, (item) => `${time(item.ts)} ${item.source} ${item.type} ${item.message}`],
      ["Tools", toolCalls(ui.snapshot.events), (item) => `${item.name} ${item.agentId} ${item.action} ${item.status}`],
      ["Queue", list(ui.snapshot.queue?.items), (item) => `${item.id} ${item.title} ${item.objective}`],
      ["Gates", list(ui.snapshot.gates?.gates), (item) => `${item.id} ${item.description || item.title} ${item.status}`],
      ["Iterations", ui.snapshot.iterations, (item) => commandButton(item.id || item.runId, "open.iteration", { iterationId: item.id || item.runId })],
      ["Plans", ui.snapshot.plans, (item) => commandButton(`${item.planId} ${item.title || "Untitled"}`, "plan.open", { planId: item.planId })]
    ];
    let count = 0;
    sources.forEach(([title, items, format]) => {
      const matches = items.filter((item) => json(item).toLowerCase().includes(query));
      if (!matches.length) return;
      count += matches.length;
      const area = section(title, `${matches.length} matches`);
      const actions = node("div", { className: "resource-actions" }); matches.slice(0, 100).forEach((item) => { const output = format(item); actions.append(output instanceof Node ? output : node("button", { type: "button", text: clip(output, 240) })); }); area.append(actions); body.append(area);
    });
    if (!count) body.append(empty(`No operational records match “${args.query || ""}”.`));
  },
  raw(body) { body.append(raw(ui.snapshot)); },
  help(body) {
    const grammar = section("Command grammar", `${commands.length} commands`);
    grammar.append(raw("show <resource>\nopen run|artifact|log|document|iteration <id>\nsearch <text>\naction <operation>\nplan <action>\nassist <action>\nstream <action>\nrefresh <resource>")); body.append(grammar);
    for (const group of [...new Set(commands.map((command) => command.group))]) {
      const area = section(group, `${commands.filter((command) => command.group === group).length} commands`);
      area.append(table([{ label: "Grammar", value: (command) => commandButton(command.grammar, command.id) }, { label: "Client method", value: "method" }, { label: "Description", value: "description" }], commands.filter((command) => command.group === group))); body.append(area);
    }
  }
};

function renderResourceTree() {
  const groups = [
    ["state", [["workflow", "show.workflow"], ["agents", "show.agents"], ["queue", "show.queue"], ["gates", "show.gates"]]],
    ["history", [[`runs [${ui.snapshot.runs.length}]`, "show.runs"], [`events [${ui.snapshot.events.length}]`, "show.events"], [`audit [${ui.snapshot.audit.length}]`, "show.audit"], [`iterations [${ui.snapshot.iterations.length}]`, "show.iterations"]]],
    ["planning", [[`plans [${ui.snapshot.plans.length}]`, "show.plans"], [`assistance [${ui.snapshot.assistance.length}]`, "show.assistance"]]],
    ["selected-run", [[text(ui.snapshot.selectedRunId, "none"), "show.resources"], ...ui.snapshot.selectedRun.artifacts.slice(0, 30).map((item) => [item.name, "open.artifact", { name: item.name, runId: ui.snapshot.selectedRunId }]), ...ui.snapshot.selectedRun.logs.slice(0, 20).map((item) => [item.name, "open.log", { name: item.name, runId: ui.snapshot.selectedRunId, tail: 400 }])]]
  ];
  const tree = $("#resourceTree"); tree.replaceChildren();
  groups.forEach(([name, items], index) => {
    const details = node("details", { className: "resource-group", open: index < 3 });
    details.append(node("summary", { text: name }));
    const content = node("div", { className: "resource-list" });
    items.forEach(([label, commandId, args = {}]) => content.append(commandButton(label, commandId, args)));
    details.append(content); tree.append(details);
  });
  $("#resourceCount").textContent = String(groups.reduce((sum, group) => sum + group[1].length, 0));
}

function renderStatus() {
  const connection = ui.snapshot.connection;
  const status = $("#connectionStatus");
  status.textContent = `${connection.status.toUpperCase()}${connection.transport ? ` / ${connection.transport.toUpperCase()}` : ""}`;
  status.dataset.tone = toneFor(connection.status);
  const workflow = ui.snapshot.state?.phase || ui.snapshot.state?.status || "unknown";
  $("#workflowStatus").textContent = `workflow: ${workflow}`;
  $("#runStatus").textContent = `run: ${ui.snapshot.selectedRunId || "none"}`;
  $("#eventStatus").textContent = `events: ${ui.snapshot.events.length}`;
  $("#promptContext").textContent = `${ui.snapshot.state?.currentProject || ui.snapshot.state?.selectedProject?.name || "operator"}@${workflow}`;
}

function scheduleRender() {
  if (ui.renderQueued) return;
  ui.renderQueued = true;
  requestAnimationFrame(() => {
    ui.renderQueued = false;
    renderStatus(); renderResourceTree();
    ui.buffers.forEach((buffer, index) => {
      const view = buffer.view || buffer.commandId.replace(/^show\./, "");
      if (["workflow", "events", "agents", "tools", "queue", "gates", "audit", "iterations", "plans", "assistance", "resources", "iteration-detail", "plan-detail", "assistance-detail", "raw", "search"].includes(view)) renderBuffer(index);
    });
  });
}

function renderMenus() {
  const strip = $("#menuStrip");
  for (const group of ["View", "Stream", "Operate", "Plans", "Assist"]) {
    const details = node("details", { className: "command-menu" });
    details.append(node("summary", { text: group }));
    const panel = node("div", { className: "command-menu-panel" });
    commands.filter((command) => command.group === group).forEach((command) => panel.append(node("button", { type: "button", dataset: { commandId: command.id } }, [node("span", { text: command.title }), node("code", { text: command.grammar }), node("small", { text: command.description })])));
    details.append(panel); strip.append(details);
  }
}

function optionNode(command, index, selected) {
  return node("div", { className: "palette-option", id: `command-option-${index}`, attrs: { role: "option", "aria-selected": String(selected) }, dataset: { commandId: command.id } }, [node("strong", { text: command.title }), node("code", { text: command.grammar }), node("small", { text: `${command.group} / ${command.method} / ${command.description}` })]);
}

function renderPalette() {
  const query = $("#paletteInput").value;
  ui.paletteMatches = commandSearch(query);
  ui.paletteIndex = Math.max(0, Math.min(ui.paletteIndex, ui.paletteMatches.length - 1));
  const output = $("#paletteResults"); output.replaceChildren();
  ui.paletteMatches.forEach((command, index) => output.append(optionNode(command, index, index === ui.paletteIndex)));
  $("#paletteMeta").textContent = `${ui.paletteMatches.length} of ${commands.length} commands / type ? for help`;
  $("#paletteInput").setAttribute("aria-activedescendant", ui.paletteMatches.length ? `command-option-${ui.paletteIndex}` : "");
  output.children[ui.paletteIndex]?.scrollIntoView({ block: "nearest" });
}

function renderPromptSuggestions() {
  const input = $("#commandInput");
  const query = input.value;
  ui.promptMatches = query ? commandSearch(query).slice(0, 7) : [];
  ui.promptIndex = Math.max(0, Math.min(ui.promptIndex, ui.promptMatches.length - 1));
  const output = $("#promptSuggestions"); output.replaceChildren();
  ui.promptMatches.forEach((command, index) => output.append(optionNode(command, `prompt-${index}`, index === ui.promptIndex)));
  output.hidden = !ui.promptMatches.length;
  input.setAttribute("aria-expanded", String(!!ui.promptMatches.length));
  input.setAttribute("aria-activedescendant", ui.promptMatches.length ? `command-option-prompt-${ui.promptIndex}` : "");
}

function openPalette(query = "") {
  ui.returnFocus = document.activeElement;
  $("#paletteInput").value = query;
  ui.paletteIndex = 0;
  $("#palette").showModal();
  renderPalette();
  $("#paletteInput").focus();
}

function closePalette() {
  if ($("#palette").open) $("#palette").close();
}

function fieldDefault(field, supplied) {
  if (supplied[field.name] !== undefined) return supplied[field.name];
  return typeof field.default === "function" ? field.default() : field.default;
}

function openCommandForm(command, supplied = {}) {
  ui.formCommand = command;
  ui.returnFocus = document.activeElement;
  $("#commandDialogGroup").textContent = command.group;
  $("#commandDialogTitle").textContent = command.title;
  $("#commandDialogMethod").textContent = `${command.grammar} / ${command.method}`;
  $("#commandDialogDescription").textContent = command.description;
  $("#commandFormError").hidden = true;
  const fields = $("#commandFields"); fields.replaceChildren();
  command.fields.forEach((field) => {
    const value = fieldDefault(field, supplied);
    let control;
    if (field.type === "textarea" || field.type === "json") {
      const options = { name: field.name, required: !!field.required, className: field.type === "json" ? "json-input" : "", value: field.type === "json" ? json(value ?? {}) : text(value, "") };
      if (field.maxlength !== undefined) options.maxLength = field.maxlength;
      control = node("textarea", options);
    } else if (field.type === "select") {
      control = node("select", { name: field.name, required: !!field.required });
      field.choices.forEach((choice) => control.append(node("option", { value: choice, text: choice, selected: choice === value })));
    } else if (field.type === "checkbox") control = node("input", { type: "checkbox", name: field.name, checked: !!value });
    else {
      const options = { type: field.type, name: field.name, value: value ?? "", required: !!field.required, min: field.min, max: field.max };
      if (field.maxlength !== undefined) options.maxLength = field.maxlength;
      control = node("input", options);
    }
    fields.append(node("label", { className: `field${field.wide ? " wide" : ""}` }, [node("span", { text: field.label }), field.help ? node("small", { text: field.help }) : null, control]));
  });
  $("#commandSubmit").textContent = command.danger ? `Review ${command.title}` : `Run ${command.title}`;
  $("#commandDialog").showModal();
  $("#commandFields").querySelector("input, textarea, select")?.focus();
}

function collectForm(command) {
  const formData = new FormData($("#commandForm"));
  const result = {};
  command.fields.forEach((field) => {
    if (field.type === "checkbox") result[field.name] = $(`[name="${field.name}"]`, $("#commandForm")).checked;
    else if (field.type === "number") result[field.name] = Number(formData.get(field.name));
    else if (field.type === "json") {
      const value = String(formData.get(field.name) || "").trim();
      try { result[field.name] = value ? JSON.parse(value) : null; }
      catch (error) { throw new Error(`${field.label} must be valid JSON: ${error.message}`); }
    } else result[field.name] = String(formData.get(field.name) || "");
  });
  return result;
}

function confirmOperation(command, args, phrase) {
  return new Promise((resolve) => {
    ui.confirmResolve = resolve;
    ui.returnFocus = document.activeElement;
    $("#confirmTitle").textContent = command.title;
    $("#confirmConsequence").textContent = command.danger;
    $("#confirmPayload").textContent = clip(args, 3000);
    $("#confirmPhraseWrap").hidden = !phrase;
    $("#confirmPhrase").textContent = phrase || "";
    $("#confirmInput").value = "";
    $("#confirmSubmit").textContent = command.title;
    $("#confirmSubmit").disabled = !!phrase;
    $("#confirmDialog").showModal();
    $("#confirmCancel").focus();
  });
}

function closeDialog(id) {
  const dialog = $(`#${id}`);
  if (dialog.open) dialog.close();
}

function trapDialogFocus(event) {
  const dialog = event.currentTarget;
  if (event.key !== "Tab") return;
  const focusable = $$('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])', dialog).filter((element) => element.getClientRects().length);
  if (!focusable.length) return;
  const first = focusable[0], last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

function runPrompt() {
  const input = $("#commandInput");
  const line = input.value.trim();
  if (!line) return;
  const resolved = resolveInput(line);
  if (!resolved) { setResult("No unique command. Open the palette to choose.", "danger"); openPalette(line); return; }
  input.value = ""; renderPromptSuggestions();
  executeCommand(resolved.command, resolved.args, { line });
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    const paletteButton = event.target.closest("[data-open-palette]");
    if (paletteButton) { openPalette(); return; }
    const close = event.target.closest("[data-close-dialog]");
    if (close) { closeDialog(close.dataset.closeDialog); return; }
    const focus = event.target.closest("[data-focus-buffer]");
    if (focus) { focusBuffer(focus.dataset.focusBuffer, true); return; }
    const swap = event.target.closest("[data-swap-buffer]");
    if (swap) { swapBuffers(); return; }
    const commandElement = event.target.closest("[data-command-id]");
    if (commandElement) {
      const command = commandById.get(commandElement.dataset.commandId);
      let args = {};
      try { args = JSON.parse(commandElement.dataset.commandArgs || "{}"); } catch {}
      if (command) executeCommand(command, args);
      commandElement.closest("details")?.removeAttribute("open");
    }
  });
  $("#runCommand").addEventListener("click", runPrompt);
  $("#commandInput").addEventListener("input", () => { ui.promptIndex = 0; renderPromptSuggestions(); });
  $("#commandInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); runPrompt(); }
    else if (event.key === "Tab" && ui.promptMatches.length) { event.preventDefault(); $("#commandInput").value = ui.promptMatches[ui.promptIndex].grammar; renderPromptSuggestions(); }
    else if (event.key === "ArrowDown" && ui.promptMatches.length) { event.preventDefault(); ui.promptIndex = (ui.promptIndex + 1) % ui.promptMatches.length; renderPromptSuggestions(); }
    else if (event.key === "ArrowUp" && ui.promptMatches.length) { event.preventDefault(); ui.promptIndex = (ui.promptIndex - 1 + ui.promptMatches.length) % ui.promptMatches.length; renderPromptSuggestions(); }
    else if (event.key === "ArrowUp" && !ui.promptMatches.length && ui.history.length) { event.preventDefault(); ui.historyIndex = Math.max(0, ui.historyIndex - 1); event.currentTarget.value = ui.history[ui.historyIndex] || ""; }
    else if (event.key === "ArrowDown" && !ui.promptMatches.length && ui.history.length) { event.preventDefault(); ui.historyIndex = Math.min(ui.history.length, ui.historyIndex + 1); event.currentTarget.value = ui.history[ui.historyIndex] || ""; }
    else if (event.key === "Escape") { $("#promptSuggestions").hidden = true; event.currentTarget.setAttribute("aria-expanded", "false"); }
  });
  $("#paletteInput").addEventListener("input", () => { ui.paletteIndex = 0; renderPalette(); });
  $("#paletteInput").addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") { event.preventDefault(); ui.paletteIndex = (ui.paletteIndex + 1) % Math.max(ui.paletteMatches.length, 1); renderPalette(); }
    else if (event.key === "ArrowUp") { event.preventDefault(); ui.paletteIndex = (ui.paletteIndex - 1 + Math.max(ui.paletteMatches.length, 1)) % Math.max(ui.paletteMatches.length, 1); renderPalette(); }
    else if (event.key === "Enter" && ui.paletteMatches.length) { event.preventDefault(); executeCommand(ui.paletteMatches[ui.paletteIndex]); }
  });
  $("#paletteResults").addEventListener("mousemove", (event) => { const option = event.target.closest("[data-command-id]"); if (!option) return; ui.paletteIndex = ui.paletteMatches.findIndex((command) => command.id === option.dataset.commandId); renderPalette(); });
  $("#commandForm").addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const args = collectForm(ui.formCommand);
      $("#commandDialog").close();
      executeCommand(ui.formCommand, args, { fromForm: true });
    } catch (error) { $("#commandFormError").hidden = false; $("#commandFormError").textContent = error.message; }
  });
  $("#confirmInput").addEventListener("input", () => { $("#confirmSubmit").disabled = $("#confirmInput").value !== $("#confirmPhrase").textContent; });
  $("#confirmCancel").addEventListener("click", () => { $("#confirmDialog").close(); ui.confirmResolve?.(false); ui.confirmResolve = null; });
  $("#confirmForm").addEventListener("submit", (event) => { event.preventDefault(); if ($("#confirmSubmit").disabled) return; $("#confirmDialog").close(); ui.confirmResolve?.(true); ui.confirmResolve = null; });
  [$("#palette"), $("#commandDialog"), $("#confirmDialog")].forEach((dialog) => {
    dialog.addEventListener("keydown", trapDialogFocus);
    dialog.addEventListener("close", () => { if (ui.returnFocus instanceof HTMLElement && ui.returnFocus.isConnected) ui.returnFocus.focus(); });
    dialog.addEventListener("cancel", () => { if (dialog.id === "confirmDialog" && ui.confirmResolve) { ui.confirmResolve(false); ui.confirmResolve = null; } });
  });
  $("#announceToggle").addEventListener("click", () => {
    ui.announceStream = !ui.announceStream;
    savePreference("announceStream", ui.announceStream);
    $("#announceToggle").setAttribute("aria-pressed", String(ui.announceStream));
    $("#announceToggle").textContent = `screen-reader stream: ${ui.announceStream ? "live" : "summaries"}`;
    $$(".buffer-body").filter((body) => body.dataset.view === "events").forEach((body) => body.setAttribute("aria-live", ui.announceStream ? "polite" : "off"));
    announce(`Live event announcements ${ui.announceStream ? "enabled" : "disabled"}.`);
  });
  document.addEventListener("keydown", (event) => {
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.shiftKey && event.key.toLowerCase() === "p") { event.preventDefault(); if (!$("#palette").open) openPalette(); }
    else if (modifier && ["1", "2"].includes(event.key) && !$("dialog[open]")) { event.preventDefault(); focusBuffer(Number(event.key) - 1, true); }
    else if (event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) && !$("dialog[open]")) { event.preventDefault(); $("#commandInput").focus(); }
    else if (event.key === "?" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) && !$("dialog[open]")) { event.preventDefault(); executeCommand(commandById.get("help")); }
  });
  const splitter = $(".splitter"); let drag = null;
  splitter.addEventListener("pointerdown", (event) => { drag = event.pointerId; splitter.setPointerCapture(event.pointerId); });
  splitter.addEventListener("pointermove", (event) => { if (drag !== event.pointerId) return; const rect = $(".buffers").getBoundingClientRect(); setSplit(((event.clientX - rect.left) / rect.width) * 100); });
  splitter.addEventListener("pointerup", () => { drag = null; });
  splitter.addEventListener("keydown", (event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); const current = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--split")); setSplit(current + (event.key === "ArrowRight" ? 2 : -2)); } });
}

function setSplit(percent) {
  const bounded = Math.max(25, Math.min(75, percent));
  document.documentElement.style.setProperty("--split", `${bounded}%`);
  $(".splitter").setAttribute("aria-valuenow", String(Math.round(bounded)));
}

function initialize() {
  document.documentElement.dataset.theme = loadPreference("theme", "paper");
  ui.historyIndex = ui.history.length;
  $("#announceToggle").setAttribute("aria-pressed", String(ui.announceStream));
  $("#announceToggle").textContent = `screen-reader stream: ${ui.announceStream ? "live" : "summaries"}`;
  $("#buffer1Body").setAttribute("aria-live", ui.announceStream ? "polite" : "off");
  renderMenus(); bindEvents(); focusBuffer(0); renderBuffer(0); renderBuffer(1); renderResourceTree(); renderStatus();
  client.subscribe(onSnapshot);
  client.connect().then(() => announce("Operator Shell connected and data loaded.")).catch((error) => { setResult(error.message || String(error), "danger"); announce(`Initial connection failed. ${error.message || error}`, true); });
  setInterval(() => { $("#clock").textContent = time(); }, 1000);
  $("#clock").textContent = time();
  window.addEventListener("beforeunload", () => client.disconnect(), { once: true });
}

function onSnapshot(snapshot) {
  ui.subscribed = true;
  const added = snapshot.events.length - ui.lastEventCount;
  ui.snapshot = snapshot;
  if (added > 0 && ui.lastEventCount > 0) announce(`${added} new operational event${added === 1 ? "" : "s"}. Latest: ${snapshot.events.at(-1)?.message || snapshot.events.at(-1)?.type || "event"}.`);
  ui.lastEventCount = snapshot.events.length;
  scheduleRender();
}

initialize();
