import {
  createDashboardClient,
  WORKFLOW_PHASES,
  OPERATION_COMMANDS,
  PROJECT_PLAN_ACTIONS
} from "../../headless-dashboard-client.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const client = createDashboardClient({ maxEvents: 1200, eventLimit: 400, pauseBufferLimit: 3000 });
let snapshot = client.getSnapshot();
let selectedRunId = null;
let selectedCommand = null;
let pendingDispatch = null;
let activeAssistanceId = null;
let toastTimer = 0;
let previewOwnerRunId = null;

const array = (value) => Array.isArray(value) ? value : [];
const record = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const first = (...values) => values.find((value) => value !== undefined && value !== null && value !== "") ?? "";
const lines = (value) => String(value || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
const formatTime = (value) => {
  if (!value) return "not reported";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
};
const age = (value) => {
  if (!value) return "no sample";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (!Number.isFinite(seconds)) return "unknown";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
};
const json = (value) => JSON.stringify(value, null, 2);
const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

function currentObjectiveText() {
  return first(snapshot.control?.currentObjective?.text, snapshot.state?.currentObjective?.text, snapshot.state?.objective, selectedRun()?.objective, "");
}

function toast(message, error = false) {
  const target = $("#toast");
  target.textContent = message;
  target.className = `toast show${error ? " error" : ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { target.className = "toast"; }, 4200);
  if (error) $("#urgent").textContent = message;
}

function setContent(target, children) {
  target.replaceChildren(...children.filter(Boolean));
}

function announceGraphic(message, error = false) {
  $("#urgent").textContent = "";
  requestAnimationFrame(() => { $("#urgent").textContent = message; });
  toast(message, error);
}

const preservedScrollSelectors = [".inspector", ".table-scroll", "#command-list", "#plan-list", "#assist-list", "#assist-thread", ...["queue", "gates", "showcase", "lineage", "audit"].map((name) => `#lower-${name}`)];

function captureUiState() {
  const active = document.activeElement;
  const focusKey = active?.id ? `#${CSS.escape(active.id)}` : active?.dataset?.focusKey ? `[data-focus-key="${CSS.escape(active.dataset.focusKey)}"]` : null;
  const selection = active && "selectionStart" in active ? [active.selectionStart, active.selectionEnd] : null;
  return {
    focusKey,
    selection,
    scroll: preservedScrollSelectors.map((selector) => { const node = $(selector); return [selector, node?.scrollLeft || 0, node?.scrollTop || 0]; })
  };
}

function restoreUiState(state) {
  for (const [selector, left, top] of state.scroll) {
    const node = $(selector);
    if (node) { node.scrollLeft = left; node.scrollTop = top; }
  }
  if (!state.focusKey) return;
  const target = $(state.focusKey);
  if (!target) return;
  target.focus({ preventScroll: true });
  if (state.selection && "setSelectionRange" in target) target.setSelectionRange(...state.selection);
}

function el(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined || value === null) continue;
    if (key === "text") node.textContent = String(value);
    else if (key === "class") node.className = value;
    else if (key.startsWith("data-")) node.setAttribute(key, value);
    else node[key] = value;
  }
  node.append(...children.filter(Boolean));
  return node;
}

function entriesList(entries) {
  const dl = el("dl", { class: "kv" });
  for (const [term, value] of entries) {
    dl.append(el("dt", { text: term }), el("dd", { text: value || "not reported" }));
  }
  return dl;
}

function queueItems() {
  return array(snapshot.queue?.items || snapshot.queue);
}

function gates() {
  return array(snapshot.gates?.gates || snapshot.gates?.items || snapshot.gates);
}

function agents() {
  const source = snapshot.state?.agents;
  if (Array.isArray(source)) return source;
  return Object.entries(record(source)).map(([id, value]) => ({ id, ...record(value) }));
}

function currentRunId() {
  return snapshot.state?.currentRunId || null;
}

function selectedRun() {
  return snapshot.runs.find((run) => run?.id === selectedRunId) || (snapshot.selectedRun?.run?.id === selectedRunId ? snapshot.selectedRun.run : null);
}

function runEvents(runId) {
  return array(snapshot.events).filter((event) => event.runId === runId || event.data?.runId === runId);
}

function owningAgents(runId) {
  const ids = new Set(runEvents(runId).map((event) => event.agentId || event.data?.agentId).filter(Boolean));
  return agents().filter((agent) => first(agent.runId, agent.currentRunId) === runId || ids.has(agent.id));
}

function blockerFor(runId) {
  const stateBlock = first(snapshot.state?.blocker, snapshot.state?.block, snapshot.state?.hold);
  if (stateBlock && runId === currentRunId()) return typeof stateBlock === "string" ? { reason: stateBlock, runId } : { ...stateBlock, runId: first(stateBlock.runId, runId) };
  const run = snapshot.runs.find((item) => item.id === runId);
  const value = first(run?.blocker, run?.block, String(run?.status || "").includes("block") ? run?.lastAction : "");
  return value ? (typeof value === "string" ? { reason: value, runId } : { ...value, runId: first(value.runId, runId) }) : null;
}

function controlRequested() {
  const control = record(snapshot.control);
  const values = [];
  if (control.pause?.requested) values.push(`pause:${control.pause.mode || "checkpoint"}`);
  if (control.stop?.requested) values.push(`stop:${control.stop.mode || "graceful"}`);
  if (control.hold || control.held) values.push("hold");
  if (control.requestedRunNow) values.push("run-now");
  if (control.nextRunRequest) values.push(`next:${control.nextRunRequest.status || "pending"}`);
  return values.join(", ") || "none";
}

function renderStatus() {
  const connection = snapshot.connection || {};
  $("#link-status").textContent = `${connection.status || "disconnected"}${connection.transport ? ` / ${connection.transport}` : ""}`;
  const sample = first(connection.lastMessageAt, connection.lastRefreshAt);
  $("#freshness").textContent = age(sample);
  $("#freshness").className = sample && Date.now() - new Date(sample).getTime() > 30000 ? "danger" : "";
  $("#observed-phase").textContent = first(snapshot.state?.phase, snapshot.state?.status, "idle");
  $("#requested-state").textContent = controlRequested();
  const pauseButton = $('[data-stream="pause"]');
  pauseButton.textContent = connection.paused ? "Resume feed" : "Pause feed";
  pauseButton.setAttribute("aria-pressed", String(Boolean(connection.paused)));
}

function chooseRun(runId, load = true) {
  selectedRunId = runId;
  renderAll();
  if (load && runId) client.selectRun(runId).catch((error) => toast(`Run load failed: ${error.message}`, true));
}

function renderRunTable() {
  const body = $("#run-table");
  const rows = snapshot.runs.map((run) => {
    const events = runEvents(run.id);
    const blocker = blockerFor(run.id);
    const button = el("button", { text: run.id === selectedRunId ? "Selected" : "Inspect", type: "button", "data-focus-key": `run:${run.id}` });
    button.addEventListener("click", () => chooseRun(run.id));
    return el("tr", { "data-run": run.id, class: run.id === selectedRunId ? "selected" : "" }, [
      el("th", { text: run.id, scope: "row" }), el("td", { text: first(run.phase, run.status, run.id === currentRunId() ? snapshot.state?.phase : "unknown") }),
      el("td", { text: first(run.objective, run.selectedProject, "not reported") }), el("td", { text: owningAgents(run.id).length }),
      el("td", { text: events.length }), el("td", { text: blocker ? first(blocker.reason, blocker.message, blocker.error, "reported") : "clear" }), el("td", {}, [button])
    ]);
  });
  if (!rows.length) rows.push(el("tr", {}, [el("td", { text: "No runs reported by the API.", colSpan: 7 })]));
  setContent(body, rows);
}

function renderInspector() {
  const run = selectedRun();
  $("#inspector-title").textContent = run ? first(run.objective, run.id) : "No run selected";
  $("#selection-badge").textContent = run ? (run.id === currentRunId() ? "current run" : "historical run") : "none";
  const events = run ? runEvents(run.id) : [];
  setContent($("#selection-summary"), run ? [...entriesList([
    ["Run ID", run.id], ["Observed phase", first(run.phase, run.status, run.id === currentRunId() ? snapshot.state?.phase : "unknown")],
    ["Objective", first(run.objective, run.selectedProject)], ["Repository", first(run.repoPath, run.repository?.path, run.repository)],
    ["Started", formatTime(run.startedAt)], ["Last event", events.length ? `${age(events.at(-1).ts)} / ${events.at(-1).type}` : "none retained"]
  ]).childNodes] : []);

  const blocker = run ? blockerFor(run.id) : null;
  $("#blocker-card").hidden = !blocker;
  if (blocker) setContent($("#blocker-detail"), [...entriesList([
    ["Affected run", first(blocker.runId, run.id)], ["Agent / owner", first(blocker.agentId, blocker.ownerAgentId, blocker.owner)],
    ["Phase / location", first(blocker.phase, run.phase, snapshot.state?.phase)], ["Reason", first(blocker.reason, blocker.message, blocker.error)],
    ["First seen", formatTime(first(blocker.since, blocker.startedAt, blocker.createdAt))], ["Tool call", first(blocker.toolCallId, blocker.callId)],
    ["Artifact", first(blocker.artifact, blocker.artifactPath)], ["Log", first(blocker.log, blocker.logPath)],
    ["Safest reported action", first(blocker.safeRecoveryAction, blocker.suggestedAction, "Inspect evidence and ask for advice.")]
  ]).childNodes]);

  const eventNodes = events.slice(-40).reverse().map((event) => el("li", {}, [
    el("strong", { text: `${event.agentId || event.source || "system"} / ${event.type}` }),
    el("span", { text: event.message || event.data?.toolName || "No message" }),
    el("time", { text: `${formatTime(event.ts)} / ${event.data?.durationMs ? `${event.data.durationMs}ms` : event.level}` })
  ]));
  if (!eventNodes.length) eventNodes.push(el("li", { text: run ? "No retained telemetry owns this run ID." : "Select a run to filter exact owning-run telemetry." }));
  setContent($("#event-list"), eventNodes);
  renderResources();
  setContent($("#control-detail"), [...entriesList([
    ["Observed", first(snapshot.state?.phase, snapshot.state?.status, "idle")], ["Requested", controlRequested()],
    ["Selected target", selectedRunId || "none"], ["Current execution", currentRunId() || "none"],
    ["Stream", `${snapshot.connection?.status || "disconnected"}${snapshot.connection?.paused ? " / browser feed paused" : ""}`]
  ]).childNodes]);
}

function resourceButton(label, ownerRunId, handler) {
  const button = el("button", { type: "button", text: label, "data-focus-key": `resource:${ownerRunId}:${label}` });
  button.addEventListener("click", async () => {
    $("#resource-preview").textContent = `Loading resource owned by run ${ownerRunId}...`;
    try {
      const result = await handler();
      if (selectedRunId !== ownerRunId || snapshot.selectedRunId !== ownerRunId) return toast(`Resource loaded for ${ownerRunId}, but selection changed; preview was not replaced.`, true);
      previewOwnerRunId = ownerRunId;
      $("#resource-preview").textContent = `Owning run: ${ownerRunId}\nResource: ${result?.name || label}\n\n${result?.text ?? json(result)}`;
    } catch (error) {
      if (selectedRunId === ownerRunId) $("#resource-preview").textContent = `Owning run: ${ownerRunId}\nLoad failed: ${error.message}`;
      else toast(`Resource load for ${ownerRunId} failed after selection changed: ${error.message}`, true);
    }
  });
  return button;
}

function renderResources() {
  const target = $("#resource-list");
  const ownerRunId = selectedRunId;
  $("#resource-owner").textContent = ownerRunId ? `Owning run: ${ownerRunId}` : "No owning run selected";
  if (previewOwnerRunId && previewOwnerRunId !== ownerRunId) {
    previewOwnerRunId = null;
    $("#resource-preview").textContent = "Preview cleared because the owning-run selection changed.";
  }
  if (!ownerRunId || snapshot.selectedRunId !== ownerRunId || snapshot.selectedRun?.run?.id !== ownerRunId) {
    setContent(target, [el("p", { text: "Load the selected run to enumerate exact artifacts and logs." })]);
    return;
  }
  const items = [
    resourceButton("SPEC", ownerRunId, () => client.loadDocument("spec", ownerRunId)),
    resourceButton("DEVPLAN", ownerRunId, () => client.loadDocument("devplan", ownerRunId)),
    ...array(snapshot.selectedRun?.artifacts).map((item) => resourceButton(`Artifact: ${item.name || item.path}`, ownerRunId, () => client.loadArtifact(item.name || item.path, ownerRunId))),
    ...array(snapshot.selectedRun?.logs).map((item) => resourceButton(`Log: ${item.name || item.path}`, ownerRunId, () => client.loadLog(item.name || item.path, ownerRunId, { tail: 500 })))
  ];
  setContent(target, items);
}

function card(title, description, actions = []) {
  return el("article", { class: "card" }, [el("h3", { text: title }), el("p", { text: description }), el("div", { class: "button-row" }, actions)]);
}

function commandShortcut(label, command, payload = {}) {
  const identity = first(payload.itemId, payload.gateId, payload.sourceIterationId, payload.runId, "global");
  const button = el("button", { text: label, type: "button", "data-focus-key": `command:${command}:${identity}` });
  button.addEventListener("click", async () => {
    let authoritativePayload = payload;
    if (["continue-from-iteration", "fork-from-iteration", "use-as-next-direction"].includes(command) && payload.sourceIterationId) {
      try {
        await client.selectIteration(payload.sourceIterationId);
        snapshot = client.getSnapshot();
        authoritativePayload = iterationCommandPayload(command, snapshot.iterationDetail || snapshot.iterations.find((item) => item.id === payload.sourceIterationId) || payload);
      } catch (error) { toast(`Iteration load failed: ${error.message}`, true); return; }
    }
    openCommand(command, authoritativePayload);
  });
  return button;
}

function iterationCommandPayload(type, iteration) {
  const sourceRun = snapshot.runs.find((run) => run.id === iteration.runId) || {};
  const payload = {
    sourceIterationId: iteration.id || "",
    sourceRunId: iteration.runId || "",
    repoPath: first(iteration.repoPath, iteration.repository?.path, sourceRun.repoPath, sourceRun.repository?.path, snapshot.control?.autoIteration?.repoPath, ""),
    objective: first(iteration.objective, sourceRun.objective, currentObjectiveText()),
    baseRef: first(iteration.baseRef, iteration.repository?.baseRef, sourceRun.baseRef, sourceRun.repository?.baseRef, "HEAD"),
    changeText: first(iteration.steeringText, iteration.nextRecommendedDirection, ""),
    limits: { maxIterations: 1, maxVariantsPerIteration: 3, maxParallelVariants: 3, ...(isPlainObject(iteration.limits) ? structuredClone(iteration.limits) : {}) }
  };
  return payload;
}

function validateOperationPayload(type, payload) {
  if (!isPlainObject(payload)) throw new TypeError("Command payload must be a JSON object.");
  const required = {
    "start-next-iteration": ["repoPath", "objective", "baseRef", "changeText"],
    "continue-from-iteration": ["sourceIterationId", "sourceRunId", "repoPath", "objective", "baseRef", "changeText"],
    "fork-from-iteration": ["sourceIterationId", "sourceRunId", "repoPath", "objective", "baseRef", "changeText"],
    "use-as-next-direction": ["sourceIterationId", "sourceRunId", "repoPath", "objective", "baseRef", "changeText"]
  }[type];
  if (type === "add-gate" && typeof payload.requiredEvidence !== "string") throw new TypeError("add-gate requiredEvidence must be one newline-delimited string.");
  if (!required) return;
  const missing = required.filter((name) => typeof payload[name] !== "string" || !payload[name].trim());
  if (missing.length) throw new TypeError(`${type} requires non-empty ${missing.join(", ")}.`);
  if (!isPlainObject(payload.limits)) throw new TypeError(`${type} limits must be a JSON object.`);
  if (payload.acceptanceGateIds !== undefined && !Array.isArray(payload.acceptanceGateIds)) throw new TypeError(`${type} acceptanceGateIds must be an array.`);
  for (const [name, value] of Object.entries(payload.limits)) {
    if (!Number.isFinite(Number(value)) || Number(value) < 0) throw new TypeError(`${type} limit ${name} must be a nonnegative number.`);
  }
}

function renderLower(mode = $(".lower-tabs [aria-selected=true]")?.dataset.lower || "queue") {
  const target = $(`#lower-${mode}`);
  let children = [];
  if (mode === "queue") {
    children = queueItems().map((item) => card(`${item.title || item.id} / ${item.status || "queued"}`, `${item.objective || "No objective"} / priority ${first(item.priority, "not reported")}`, [
      commandShortcut("Pin", "pin-queue-item", { itemId: item.id }), commandShortcut("Archive", "archive-queue-item", { itemId: item.id })
    ]));
    children.unshift(card(`Staging reservoir / ${queueItems().length} item(s)`, "Queue pressure is shown before corridor admission. Pinning projects an item as current objective; it does not itself prove runner admission.", [commandShortcut("Add item", "add-queue-item"), commandShortcut("Clear all", "clear-queue")]));
  } else if (mode === "gates") {
    children = gates().map((gate) => card(`${gate.id} / ${gate.status || "pending"}`, `${first(gate.description, gate.title, "No description")} / ${array(gate.requiredEvidence).join(", ") || "no required evidence listed"}`, [
      commandShortcut("Decision", "gate-decision", { gateId: gate.id, runId: selectedRunId }), commandShortcut("Attach evidence", "attach-gate-evidence", { gateId: gate.id, runId: selectedRunId }), commandShortcut("Update", "update-gate", { gateId: gate.id })
    ]));
    children.unshift(card("Acceptance planes", "Gate decisions are auditable state changes. Evidence commands reference existing run artifacts; they do not create evidence.", [commandShortcut("Add gate", "add-gate")]));
  } else if (mode === "showcase") {
    const showcase = snapshot.control?.autoIteration || snapshot.control?.showcase || {};
    children = [card(`Showcase / ${showcase.enabled ? showcase.paused ? "paused" : "running" : "stopped"}`, `Generation ${first(showcase.currentGeneration, 0)} of ${first(showcase.targetGenerations, showcase.maxIterations, "not set")}. The loop is bounded by its command payload.`, [
      commandShortcut("Start", "start-showcase-loop"), commandShortcut("Pause", "pause-showcase-loop"), commandShortcut("Resume", "resume-showcase-loop"), commandShortcut("Set target", "set-showcase-target"), commandShortcut("Stop", "stop-showcase-loop")
    ])];
  } else if (mode === "lineage") {
    children = snapshot.iterations.map((iteration) => card(`${iteration.objective || iteration.id}`, `${iteration.status || "unknown"} / generation ${first(iteration.generation, "-")} / run ${first(iteration.runId, "unreported")}`, [
      commandShortcut("Continue", "continue-from-iteration", iterationCommandPayload("continue-from-iteration", iteration)),
      commandShortcut("Fork", "fork-from-iteration", iterationCommandPayload("fork-from-iteration", iteration)),
      commandShortcut("Use direction", "use-as-next-direction", iterationCommandPayload("use-as-next-direction", iteration))
    ]));
    children.unshift(card("Iteration lineage", "Terminal and historical runs are evidence. Continue, fork, or promote accepted direction into a bounded next request.", [commandShortcut("Start next", "start-next-iteration")]));
  } else {
    children = array(snapshot.audit).slice(0, 40).map((entry) => card(`${first(entry.type, entry.command, "command")} / ${first(entry.status, "recorded")}`, `${formatTime(first(entry.ts, entry.createdAt, entry.updatedAt))} / ${first(entry.actor, entry.target, entry.id, "no identity")}`, [el("button", { text: "Recorded", disabled: true })]));
    children.unshift(card("Lifecycle interpretation", "Accepted means requested intent was persisted. Use observed state and subsequent audit/event records to verify checkpoint observation and completion."));
  }
  if (children.length === 0) children.push(el("p", { text: `No ${mode} records reported.` }));
  setContent(target, [el("div", { class: "cards" }, children)]);
}

const commandMeta = {
  pause: ["Request a checkpoint pause.", { mode: "checkpoint", reason: "" }], hold: ["Pause admission of new runs.", { reason: "" }], resume: ["Resume execution and clear pause/stop requests.", {}], unhold: ["Enable run admission.", {}], stop: ["Request stop at the next checkpoint.", { mode: "graceful", reason: "" }], "run-now": ["Request runner admission on the next tick.", {}],
  steer: ["Add bounded operator steering.", { scope: "current_run", priority: "preferred", text: "", expires: { type: "until_removed" } }], deblock: ["Queue focused recovery instructions for the current blocked run.", { runId: "", prompt: "" }], "deblock-advice": ["Request non-executing recovery advice.", { runId: "", prompt: "" }], "approve-deblock-advice": ["Approve pending advice as current-run steering.", { adviceId: "" }], "deny-deblock-advice": ["Deny pending advice.", { adviceId: "" }], "remove-steering": ["Remove active steering.", { id: "" }], "set-current-objective": ["Set current objective projection.", { text: "", runId: "", source: "flowfield-command" }],
  "start-next-iteration": ["Queue a bounded managed iteration.", { repoPath: "", objective: "", baseRef: "HEAD", changeText: "", acceptanceGateIds: [], limits: { maxIterations: 1, maxVariantsPerIteration: 3, maxParallelVariants: 3 } }],
  "continue-from-iteration": ["Continue from an iteration through direct control.", { sourceIterationId: "", sourceRunId: "", repoPath: "", objective: "", baseRef: "HEAD", changeText: "", limits: { maxIterations: 1, maxVariantsPerIteration: 3, maxParallelVariants: 3 } }],
  "fork-from-iteration": ["Fork from an iteration through direct control.", { sourceIterationId: "", sourceRunId: "", repoPath: "", objective: "", baseRef: "HEAD", changeText: "", limits: { maxIterations: 1, maxVariantsPerIteration: 3, maxParallelVariants: 3 } }],
  "use-as-next-direction": ["Promote accepted iteration direction.", { sourceIterationId: "", sourceRunId: "", repoPath: "", objective: "", baseRef: "HEAD", changeText: "", limits: { maxIterations: 1, maxVariantsPerIteration: 3, maxParallelVariants: 3 } }],
  "start-showcase-loop": ["Start a bounded showcase catalogue loop.", { repoPath: "", objective: "", targetGenerations: 3, baseRef: "HEAD", acceptanceGateIds: [], limits: { maxVariantsPerIteration: 3, maxParallelVariants: 3, maxAcceptedFeatures: 4, maxVisualMotifChanges: 1, maxNewSections: 1, stopAfterNoImprovement: 1, minImprovementScore: 0.05 } }],
  "pause-showcase-loop": ["Pause showcase at a checkpoint.", { reason: "" }], "resume-showcase-loop": ["Resume showcase.", {}], "stop-showcase-loop": ["Stop showcase and clear its next request.", { reason: "" }], "set-showcase-target": ["Set showcase target from one to ten.", { targetGenerations: 3 }],
  "gate-decision": ["Record an auditable gate decision.", { gateId: "", runId: "", status: "needs-evidence", decision: "defer", evidenceArtifacts: [], notes: "" }], "attach-gate-evidence": ["Reference existing artifacts as gate evidence.", { gateId: "", runId: "", artifacts: [], notes: "" }],
  "add-queue-item": ["Add a bounded objective to the queue.", { title: "", objective: "", context: "", constraints: [], priority: 50, pin: false, acceptanceGateIds: [], target: {} }], "clear-queue": ["Clear queue, pinned objective, next request, and queue steering.", {}], "pin-queue-item": ["Pin a queue item.", { itemId: "" }], "archive-queue-item": ["Archive a queue item.", { itemId: "" }],
  "add-gate": ["Create an acceptance gate. Enter requiredEvidence as one newline-delimited string.", { id: "", phase: "building", severity: "must", description: "", requiredEvidence: "" }], "update-gate": ["Update an acceptance gate.", { gateId: "", phase: "building", severity: "must", description: "", requiredEvidence: [], status: "pending" }]
};
const dangerous = new Set(["stop", "approve-deblock-advice", "deny-deblock-advice", "start-next-iteration", "continue-from-iteration", "fork-from-iteration", "use-as-next-direction", "start-showcase-loop", "stop-showcase-loop", "gate-decision", "clear-queue", "archive-queue-item"]);

function initCommandList() {
  const groups = [
    ["Lifecycle", ["pause", "hold", "resume", "unhold", "stop", "run-now"]], ["Recovery and steering", ["steer", "deblock", "deblock-advice", "approve-deblock-advice", "deny-deblock-advice", "remove-steering", "set-current-objective"]],
    ["Iteration", ["start-next-iteration", "continue-from-iteration", "fork-from-iteration", "use-as-next-direction"]], ["Showcase", ["start-showcase-loop", "pause-showcase-loop", "resume-showcase-loop", "stop-showcase-loop", "set-showcase-target"]],
    ["Gates and queue", ["gate-decision", "attach-gate-evidence", "add-queue-item", "clear-queue", "pin-queue-item", "archive-queue-item", "add-gate", "update-gate"]]
  ];
  const nodes = [];
  for (const [title, commands] of groups) {
    nodes.push(el("p", { class: "eyebrow", text: title }));
    for (const command of commands) {
      const button = el("button", { type: "button", text: command, "data-command-name": command });
      button.addEventListener("click", () => selectCommand(command));
      nodes.push(button);
    }
  }
  setContent($("#command-list"), nodes);
  const rendered = $$('[data-command-name]', $("#command-list")).map((button) => button.dataset.commandName);
  if (rendered.length !== OPERATION_COMMANDS.length || OPERATION_COMMANDS.some((command) => !commandMeta[command] || !rendered.includes(command))) throw new Error(`Operational command parity failed: expected ${OPERATION_COMMANDS.length}, rendered ${rendered.length}.`);
}

function defaultsFor(command) {
  const defaults = structuredClone(commandMeta[command]?.[1] || {});
  if ("runId" in defaults && !defaults.runId) defaults.runId = selectedRunId || currentRunId() || "";
  if ("repoPath" in defaults && !defaults.repoPath) defaults.repoPath = first(selectedRun()?.repoPath, selectedRun()?.repository?.path, snapshot.control?.autoIteration?.repoPath, "");
  if ("objective" in defaults && !defaults.objective) defaults.objective = first(selectedRun()?.objective, currentObjectiveText());
  if (command === "set-current-objective" && !defaults.text) defaults.text = currentObjectiveText();
  return defaults;
}

function selectCommand(command, supplied = null) {
  selectedCommand = command;
  $$("[data-command-name]").forEach((button) => button.classList.toggle("active", button.dataset.commandName === command));
  $("#command-title").textContent = command;
  $("#command-description").textContent = commandMeta[command][0];
  $("#command-payload").value = json({ ...defaultsFor(command), ...record(supplied) });
  $("#command-warning").hidden = !dangerous.has(command);
  $("#command-warning").textContent = dangerous.has(command) ? "This command changes execution, lineage, approval, or destructive state. A separate confirmation is required." : "";
}

function openCommand(command = null, payload = null) {
  $("#command-dialog").showModal();
  selectCommand(command || selectedCommand || "pause", payload);
}

function reviewDispatch(kind, type, payload, options = {}) {
  pendingDispatch = { kind, type, payload, options };
  $("#confirm-preview").textContent = json({ action: type, payload, expectedVersion: options.expectedVersion });
  const phrase = kind === "operation" && type === "clear-queue" ? "CLEAR QUEUE" : "";
  $("#phrase-wrap").hidden = !phrase;
  $("#confirm-phrase").value = "";
  $("#confirm-send").dataset.phrase = phrase;
  $("#confirm-dialog").showModal();
}

async function revalidateRecoveryDispatch(type, payload) {
  if (!["deblock", "deblock-advice", "approve-deblock-advice"].includes(type)) return;
  await client.refreshState();
  await client.refreshControl();
  snapshot = client.getSnapshot();
  const runId = snapshot.state?.currentRunId || null;
  if (!runId) throw new Error(`${type} requires a current run after refresh.`);
  if (["deblock", "deblock-advice"].includes(type)) {
    const blocker = first(snapshot.state?.block, snapshot.state?.blocker, snapshot.state?.hold);
    if (!blocker) throw new Error(`${type} requires an active blocker on current run ${runId}; refreshed state reports none.`);
    if (payload.runId !== runId) throw new Error(`${type} ownership changed or is invalid: confirmed run ${payload.runId || "none"}, refreshed current run ${runId}. Review again.`);
    return;
  }
  const advice = array(snapshot.control?.deblockAdvice).find((item) => item?.id === payload.adviceId && item?.status === "pending");
  if (!advice) throw new Error(`Pending advice ${payload.adviceId || "none"} was not found after refresh.`);
  if (!advice.runId || advice.runId !== runId) throw new Error(`Advice ${payload.adviceId} is owned by run ${advice.runId || "unreported"}, not refreshed current run ${runId}.`);
}

async function dispatchPending() {
  if (!pendingDispatch) return;
  const phrase = $("#confirm-send").dataset.phrase;
  if (phrase && $("#confirm-phrase").value !== phrase) return toast(`Type ${phrase} exactly.`, true);
  const { kind, type, payload, options } = pendingDispatch;
  $("#confirm-send").disabled = true;
  try {
    let result;
    if (kind === "operation") {
      validateOperationPayload(type, payload);
      await revalidateRecoveryDispatch(type, payload);
      result = await client.command(type, payload, { refresh: true });
    }
    else result = await client.projectPlanCommand(type, payload, { ...options, refresh: true });
    $("#confirm-dialog").close();
    toast(`${type} accepted. Observe requested and actual lifecycle state.`);
    pendingDispatch = null;
    if (kind === "plan") renderPlans();
  } catch (error) { toast(`${type} failed: ${error.message}`, true); }
  finally { $("#confirm-send").disabled = false; }
}

function planLabel(name, text, control) {
  control.name = name;
  return el("label", { class: control.type === "checkbox" ? "checkbox-label" : "" }, [document.createTextNode(text), control]);
}

function initializePlanContractFields() {
  const form = $("#plan-form");
  const baseRefLabel = form.elements.baseRef.closest("label");
  baseRefLabel.after(planLabel("baseCommit", "Base commit", el("input")));
  const gatesField = form.elements.acceptanceGates;
  gatesField.closest("label").firstChild.textContent = "Acceptance gates (JSON array; requiredEvidence paths remain newline-formatted)";
  gatesField.value = "[]";
  const validationLabel = form.elements.validationExpectations.closest("label");
  validationLabel.before(planLabel("validationPolicyId", "Validation policy ID", el("input", { value: "apb.runner-selected.v1" })));
  validationLabel.after(planLabel("clientCommandsAllowed", "Allow validation client commands", el("input", { type: "checkbox" })));
  const limits = form.elements.maxIterations.closest("fieldset");
  limits.append(
    planLabel("maxAcceptedFeatures", "Accepted features", el("input", { type: "number", min: "1", value: "4" })),
    planLabel("maxVisualMotifChanges", "Visual motif changes", el("input", { type: "number", min: "0", value: "1" })),
    planLabel("maxNewSections", "New sections", el("input", { type: "number", min: "0", value: "1" })),
    planLabel("stopAfterNoImprovement", "Stop after no improvement", el("input", { type: "number", min: "1", value: "1" }))
  );
  const lineage = el("fieldset", {}, [
    el("legend", { text: "Lineage" }),
    planLabel("lineageMode", "Mode", el("select", {}, ["new", "clone", "fork"].map((value) => el("option", { value, text: value })))),
    planLabel("sourcePlanId", "Source plan ID", el("input")),
    planLabel("sourceRevision", "Source revision", el("input", { type: "number", min: "1" })),
    planLabel("sourceRunId", "Source run ID", el("input")),
    planLabel("sourceIterationId", "Source iteration ID", el("input"))
  ]);
  form.querySelector('button[type="submit"]').before(lineage);
  const applyRepositoryMode = () => {
    const classic = form.elements.pipelineType.value === "classic";
    if (classic) {
      form.elements.repositoryPath.value = "";
      form.elements.baseRef.value = "";
      form.elements.baseCommit.value = "";
    } else if (!form.elements.baseRef.value) form.elements.baseRef.value = "HEAD";
  };
  form.elements.pipelineType.addEventListener("change", applyRepositoryMode);
  applyRepositoryMode();
}

function defaultPlanContent(pipelineType = "classic") {
  return {
    pipelineType, title: "", problem: "", intendedUsers: "", objective: "", boundedScope: "",
    requirements: [], nonGoals: [], constraints: [], risks: [], repository: pipelineType === "managed" ? { path: null, baseRef: "HEAD", baseCommit: null } : { path: null, baseRef: null, baseCommit: null },
    acceptanceGates: [], validationPolicy: { id: "apb.runner-selected.v1", expectations: [], clientCommandsAllowed: false }, milestones: [],
    limits: { maxIterations: 1, maxVariantsPerIteration: 3, maxParallelVariants: 3, maxAcceptedFeatures: 4, maxVisualMotifChanges: 1, maxNewSections: 1, stopAfterNoImprovement: 1 },
    lineage: { mode: "new", sourcePlanId: null, sourceRevision: null, sourceRunId: null, sourceIterationId: null }
  };
}

function completePlanContent(value = {}) {
  const pipelineType = value.pipelineType === "managed" ? "managed" : "classic";
  const defaults = defaultPlanContent(pipelineType);
  const lineage = { ...defaults.lineage, ...record(value.lineage) };
  if (!["new", "clone", "fork"].includes(lineage.mode)) lineage.mode = "new";
  return {
    ...defaults, ...value, pipelineType,
    requirements: array(value.requirements), nonGoals: array(value.nonGoals), constraints: array(value.constraints), risks: array(value.risks),
    acceptanceGates: array(value.acceptanceGates).map((gate) => ({ ...record(gate), requiredEvidence: Array.isArray(gate?.requiredEvidence) ? gate.requiredEvidence.slice() : lines(gate?.requiredEvidence) })), milestones: array(value.milestones),
    repository: pipelineType === "classic" ? { path: null, baseRef: null, baseCommit: null } : { ...defaults.repository, ...record(value.repository) }, validationPolicy: { ...defaults.validationPolicy, ...record(value.validationPolicy), expectations: array(value.validationPolicy?.expectations) },
    limits: { ...defaults.limits, ...record(value.limits) }, lineage
  };
}

function planContent(form) {
  const data = new FormData(form);
  const pipelineType = data.get("pipelineType") === "managed" ? "managed" : "classic";
  let acceptanceGates;
  try { acceptanceGates = JSON.parse(String(data.get("acceptanceGates") || "[]")); }
  catch (error) { throw new TypeError(`Acceptance gates must be valid JSON: ${error.message}`); }
  if (!Array.isArray(acceptanceGates)) throw new TypeError("Acceptance gates must be a JSON array.");
  for (const gate of acceptanceGates) {
    if (!isPlainObject(gate)) throw new TypeError("Each acceptance gate must be an object.");
    if (typeof gate.requiredEvidence === "string") gate.requiredEvidence = lines(gate.requiredEvidence);
    if (gate.requiredEvidence === undefined) gate.requiredEvidence = [];
    if (!Array.isArray(gate.requiredEvidence)) throw new TypeError("Each gate requiredEvidence value must be an array or newline-delimited string.");
  }
  const lineageMode = String(data.get("lineageMode") || "new");
  if (!["new", "clone", "fork"].includes(lineageMode)) throw new TypeError("Plan lineage mode must be new, clone, or fork.");
  return {
    pipelineType, title: data.get("title"), problem: data.get("problem"), intendedUsers: data.get("intendedUsers"), objective: data.get("objective"), boundedScope: data.get("boundedScope"),
    requirements: lines(data.get("requirements")), nonGoals: lines(data.get("nonGoals")), constraints: lines(data.get("constraints")), risks: lines(data.get("risks")),
    repository: pipelineType === "classic" ? { path: null, baseRef: null, baseCommit: null } : { path: data.get("repositoryPath") || null, baseRef: data.get("baseRef") || null, baseCommit: data.get("baseCommit") || null }, acceptanceGates,
    validationPolicy: { id: data.get("validationPolicyId") || "apb.runner-selected.v1", expectations: lines(data.get("validationExpectations")), clientCommandsAllowed: data.get("clientCommandsAllowed") === "on" }, milestones: lines(data.get("milestones")),
    limits: Object.fromEntries(["maxIterations", "maxVariantsPerIteration", "maxParallelVariants", "maxAcceptedFeatures", "maxVisualMotifChanges", "maxNewSections", "stopAfterNoImprovement"].map((name) => [name, Number(data.get(name))])),
    lineage: { mode: lineageMode, sourcePlanId: data.get("sourcePlanId") || null, sourceRevision: Number(data.get("sourceRevision")) || null, sourceRunId: data.get("sourceRunId") || null, sourceIterationId: data.get("sourceIterationId") || null }
  };
}

function fillPlan(detail = null) {
  const form = $("#plan-form");
  form.reset();
  const ledger = detail?.ledger || {};
  const content = completePlanContent(detail?.revision?.content || {});
  form.elements.planId.value = ledger.planId || "";
  form.elements.version.value = ledger.version || "";
  for (const name of ["pipelineType", "title", "problem", "intendedUsers", "objective", "boundedScope"]) if (content[name] !== undefined) form.elements[name].value = content[name];
  for (const name of ["requirements", "nonGoals", "constraints", "risks", "milestones"]) form.elements[name].value = array(content[name]).join("\n");
  form.elements.repositoryPath.value = content.repository?.path || "";
  form.elements.baseRef.value = content.repository.baseRef || "";
  form.elements.baseCommit.value = content.repository.baseCommit || "";
  form.elements.validationPolicyId.value = content.validationPolicy.id;
  form.elements.clientCommandsAllowed.checked = Boolean(content.validationPolicy.clientCommandsAllowed);
  form.elements.validationExpectations.value = array(content.validationPolicy?.expectations).join("\n");
  form.elements.acceptanceGates.value = json(content.acceptanceGates);
  for (const name of ["maxIterations", "maxVariantsPerIteration", "maxParallelVariants", "maxAcceptedFeatures", "maxVisualMotifChanges", "maxNewSections", "stopAfterNoImprovement"]) form.elements[name].value = content.limits[name];
  form.elements.lineageMode.value = content.lineage.mode;
  for (const name of ["sourcePlanId", "sourceRevision", "sourceRunId", "sourceIterationId"]) form.elements[name].value = content.lineage[name] ?? "";
  renderPlanActions(ledger);
}

function renderPlanActions(ledger = snapshot.planDetail?.ledger || {}) {
  const target = $("#plan-actions");
  if (!ledger.planId) return setContent(target, []);
  const actions = PROJECT_PLAN_ACTIONS.filter((action) => !["project-plan.create", "project-plan.update"].includes(action)).map((action) => {
    const button = el("button", { text: action.replace("project-plan.", ""), type: "button" });
    button.addEventListener("click", () => {
      const revision = snapshot.planDetail?.revision || {};
      const payload = { planId: ledger.planId };
      if (!["project-plan.archive"].includes(action)) {
        payload.revision = ledger.currentRevision || revision.revision;
        payload.planDigest = ledger.currentDigest || revision.contentDigest;
      }
      if (action === "project-plan.reject") {
        payload.notes = window.prompt("Rejection rationale") || "";
        if (!payload.notes) return;
      }
      if (action === "project-plan.approve") payload.notes = window.prompt("Approval notes (optional)") || "";
      if (["project-plan.clone", "project-plan.fork"].includes(action)) {
        payload.sourceRunId = selectedRunId;
        payload.sourceIterationId = snapshot.selectedIterationId;
        payload.baseRef = revision.content?.pipelineType === "classic" ? null : revision.content?.repository?.baseRef || "HEAD";
      }
      reviewDispatch("plan", action, payload, { expectedVersion: ledger.version });
    });
    return button;
  });
  setContent(target, actions);
}

function renderPlans() {
  setContent($("#plan-list"), snapshot.plans.map((plan) => {
    const button = el("button", { text: `${plan.title || plan.planId} / ${plan.state || "unknown"} / v${plan.version || plan.currentRevision || "?"}`, type: "button", "data-focus-key": `plan:${plan.planId}` });
    button.addEventListener("click", async () => {
      try { fillPlan(await client.getProjectPlan(plan.planId)); } catch (error) { toast(error.message, true); }
    });
    return button;
  }));
  setContent($("#assist-list"), snapshot.assistance.map((thread) => {
    const button = el("button", { text: `${thread.pipelineType} / ${thread.messageCount} messages${thread.hasProposal ? " / proposal" : ""}`, type: "button", "data-focus-key": `assist:${thread.id}` });
    button.addEventListener("click", () => loadAssistance(thread.id));
    return button;
  }));
  const thread = snapshot.assistanceDetail;
  const nodes = thread ? array(thread.messages).map((message) => card(first(message.role, message.author, "message"), first(message.content, message.text, json(message)))) : [el("p", { text: "Select or create an assistance thread." })];
  if (thread?.proposedContent) nodes.push(card("Proposed plan content", json(thread.proposedContent)));
  setContent($("#assist-thread"), nodes);
}

async function loadAssistance(id) {
  activeAssistanceId = id;
  try { await client.getPlanAssistance(id); renderPlans(); } catch (error) { toast(error.message, true); }
}

function renderAll() {
  const uiState = captureUiState();
  if (!selectedRunId || !snapshot.runs.some((run) => run.id === selectedRunId)) selectedRunId = snapshot.state?.currentRunId || snapshot.runs[0]?.id || null;
  renderStatus();
  renderRunTable();
  renderInspector();
  renderLower();
  renderPlans();
  flow.setOperationalState(snapshot);
  restoreUiState(uiState);
}

// Raw WebGL2 transform-feedback flow volume. All particle state remains GPU-resident.
class FlowField {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = null;
    this.resources = null;
    this.frame = 0;
    this.lastTime = 0;
    this.motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
    this.frozen = this.motionQuery.matches;
    this.hidden = document.hidden;
    this.contextLost = false;
    this.rotation = [-0.24, -0.34];
    this.drag = null;
    this.lanes = 1;
    this.agentCount = 1;
    this.blockerLane = -1;
    this.blockerX = 0.25;
    this.gateCount = 1;
    this.selectedLane = -1;
    this.runIds = [];
    this.eventPhase = 0;
    this.initialize();
    this.bindEvents();
  }

  particleBudget() {
    const width = this.canvas.clientWidth;
    return width < 650 ? 3000 : width > 1800 ? 12000 : 7000;
  }

  initialize() {
    const gl = this.canvas.getContext("webgl2", { alpha: true, antialias: false, depth: true, powerPreference: "high-performance" });
    if (!gl) {
      $("#canvas-fallback").hidden = false;
      $("#gpu-status").textContent = "WebGL2 unavailable";
      announceGraphic("WebGL2 is unavailable. The semantic run table and all operational controls remain available.", true);
      return false;
    }
    this.gl = gl;
    try {
      this.dispose();
      this.resources = this.createResources();
      this.resize();
      $("#canvas-fallback").hidden = true;
      $("#gpu-status").textContent = "transform feedback active";
      $("#particle-count").textContent = `${this.resources.count.toLocaleString()} particles`;
      this.requestFrame();
      return true;
    } catch (error) {
      if (!gl.isContextLost()) {
        $("#canvas-fallback").hidden = false;
        $("#canvas-fallback").textContent = `GPU field failed: ${error.message}. Operational controls remain available.`;
        $("#gpu-status").textContent = "GPU initialization failed";
        announceGraphic(`WebGL flow-field initialization failed: ${error.message}. Semantic operations remain available.`, true);
      }
      return false;
    }
  }

  shader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  }

  program(vertex, fragment, varyings = null) {
    const gl = this.gl;
    const vs = this.shader(gl.VERTEX_SHADER, vertex);
    const fs = this.shader(gl.FRAGMENT_SHADER, fragment);
    const program = gl.createProgram();
    gl.attachShader(program, vs); gl.attachShader(program, fs);
    if (varyings) gl.transformFeedbackVaryings(program, varyings, gl.INTERLEAVED_ATTRIBS);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(gl.getProgramInfoLog(program) || gl.getShaderInfoLog(vs) || gl.getShaderInfoLog(fs));
    gl.deleteShader(vs); gl.deleteShader(fs);
    return program;
  }

  createResources() {
    const gl = this.gl;
    const updateVS = `#version 300 es
      precision highp float; layout(location=0) in vec4 aPosAge; layout(location=1) in vec4 aVelLane;
      uniform float uDt; uniform float uTime; uniform float uLaneCount; uniform float uBlockLane; uniform float uBlockX;
      out vec4 vPosAge; out vec4 vVelLane;
      float hash(float n){return fract(sin(n)*43758.5453123);}
      void main(){vec3 p=aPosAge.xyz; float age=aPosAge.w+uDt*(.19+hash(float(gl_VertexID))*.16); vec3 v=aVelLane.xyz; float lane=aVelLane.w;
        float laneY=(lane/max(1.0,uLaneCount-1.0)-.5)*1.7; float curl=sin(p.x*5.0+uTime*.55+lane*1.7);
        v.y+=(laneY-p.y)*uDt*1.4+curl*uDt*.055; v.z+=cos(p.x*4.0-uTime*.42+lane)*uDt*.06-p.z*uDt*.18;
        float blocked=step(abs(lane-uBlockLane),.25)*(1.0-smoothstep(.12,.55,abs(p.x-uBlockX)));
        v.y+=blocked*sin(uTime*7.0+float(gl_VertexID)*.17)*uDt*1.6; v.z+=blocked*cos(uTime*6.0+float(gl_VertexID)*.11)*uDt*1.3; v.x=mix(.22+.10*hash(float(gl_VertexID)*.31),.015,blocked);
        p+=v*uDt; if(p.x>1.28||age>1.0){float h=hash(float(gl_VertexID)*1.91);p=vec3(-1.28,laneY+(h-.5)*.19,(hash(float(gl_VertexID)*3.17)-.5)*.8);age=0.0;v=vec3(.22+.1*h,0.0,0.0);} v*=vec3(1.0,.992,.992);vPosAge=vec4(p,age);vVelLane=vec4(v,lane);}`;
    const updateFS = `#version 300 es
      precision mediump float; out vec4 color; void main(){color=vec4(0.0);}`;
    const drawVS = `#version 300 es
      precision highp float; layout(location=0) in vec4 aPosAge; layout(location=1) in vec4 aVelLane; uniform mat4 uMatrix; uniform float uTime; uniform float uEventPhase; uniform float uBlockLane; uniform float uSelectedLane; out float vPulse; out float vBlocked; out float vDepth; out float vEmitter; out float vSelected;
      void main(){gl_Position=uMatrix*vec4(aPosAge.xyz,1.0);float pulse=pow(max(0.0,sin(aPosAge.w*34.0-uEventPhase*1.7)),18.0);vPulse=pulse;vBlocked=step(abs(aVelLane.w-uBlockLane),.25);vDepth=clamp((aPosAge.z+1.0)*.5,0.0,1.0);vEmitter=1.0-smoothstep(-1.22,-1.05,aPosAge.x);vSelected=step(abs(aVelLane.w-uSelectedLane),.25);gl_PointSize=mix(1.4,5.5,max(max(pulse,vEmitter*.5),vSelected*.35))*(4.0/gl_Position.w);}`;
    const drawFS = `#version 300 es
      precision mediump float; in float vPulse; in float vBlocked; in float vDepth; in float vEmitter; in float vSelected; out vec4 color;
      void main(){vec2 q=gl_PointCoord-.5;if(dot(q,q)>.25)discard;vec3 base=mix(vec3(.16,.55,.51),vec3(.32,.95,.85),vDepth);base=mix(base,vec3(.52,.72,1.0),vSelected*.78);base=mix(base,vec3(.70,.98,.31),vEmitter);base=mix(base,vec3(1.0,.78,.32),vPulse);base=mix(base,vec3(1.0,.23,.18),vBlocked*.72);color=vec4(base,.25+vPulse*.7+vBlocked*.2+vEmitter*.2+vSelected*.18);}`;
    const structureVS = `#version 300 es
      precision highp float; uniform mat4 uMatrix; uniform float uLanes; uniform int uMode; uniform float uGates; uniform float uSelectedLane; out vec3 vColor;
      void main(){float instance=float(gl_InstanceID);float side=float(gl_VertexID);float y=(instance/max(1.0,uLanes-1.0)-.5)*1.7;vec3 p;
        if(uMode==0){p=vec3(mix(-1.3,1.3,side),y,0.0);vColor=mix(vec3(.18,.50,.45),vec3(.52,.72,1.0),step(abs(instance-uSelectedLane),.25));}else{vec2 q=gl_VertexID==0?vec2(-1,-1):gl_VertexID==1?vec2(1,-1):gl_VertexID==2?vec2(-1,1):gl_VertexID==3?vec2(-1,1):gl_VertexID==4?vec2(1,-1):vec2(1,1);if(uMode==1){float gx=-.85+(instance/max(1.0,uGates-1.0))*1.7;p=vec3(gx,q.x*1.05,q.y*.48);vColor=vec3(1.0,.66,.18);}else{p=vec3(-1.38,q.x*1.08,q.y*.58);vColor=vec3(.20,.48,.75);}}gl_Position=uMatrix*vec4(p,1.0);}`;
    const structureFS = `#version 300 es
      precision mediump float; in vec3 vColor; out vec4 color; void main(){color=vec4(vColor,.42);}`;
    const update = this.program(updateVS, updateFS, ["vPosAge", "vVelLane"]);
    const draw = this.program(drawVS, drawFS);
    const structure = this.program(structureVS, structureFS);
    const count = this.particleBudget();
    const seed = new Float32Array(count * 8);
    for (let i = 0; i < count; i += 1) {
      const lane = i % Math.max(1, Math.min(this.lanes, 16));
      const y = (lane / Math.max(1, this.lanes - 1) - .5) * 1.7;
      const offset = i * 8;
      const agentSlot = i % this.agentCount;
      const emitterZ = (agentSlot / Math.max(1, this.agentCount - 1) - .5) * .8;
      seed.set([-1.28 + ((i * 16807) % 10000) / 10000 * 2.56, y + (Math.sin(i * 19.19) * .09), emitterZ + Math.sin(i * 3.117) * .025, (i % 997) / 997, .24 + (i % 71) / 700, 0, 0, lane], offset);
    }
    const buffers = [gl.createBuffer(), gl.createBuffer()];
    for (const buffer of buffers) { gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, seed, gl.DYNAMIC_COPY); }
    const vaos = buffers.map((buffer) => {
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 32, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 16); return vao;
    });
    const feedbacks = buffers.map((buffer) => { const tf = gl.createTransformFeedback(); gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, tf); gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, buffer); return tf; });
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null); gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, null); gl.bindBuffer(gl.ARRAY_BUFFER, null); gl.bindVertexArray(null);
    const locations = {
      update: { dt: gl.getUniformLocation(update, "uDt"), time: gl.getUniformLocation(update, "uTime"), lanes: gl.getUniformLocation(update, "uLaneCount"), blockLane: gl.getUniformLocation(update, "uBlockLane"), blockX: gl.getUniformLocation(update, "uBlockX") },
      draw: { matrix: gl.getUniformLocation(draw, "uMatrix"), time: gl.getUniformLocation(draw, "uTime"), eventPhase: gl.getUniformLocation(draw, "uEventPhase"), blockLane: gl.getUniformLocation(draw, "uBlockLane"), selectedLane: gl.getUniformLocation(draw, "uSelectedLane") },
      structure: { matrix: gl.getUniformLocation(structure, "uMatrix"), lanes: gl.getUniformLocation(structure, "uLanes"), gates: gl.getUniformLocation(structure, "uGates"), mode: gl.getUniformLocation(structure, "uMode"), selectedLane: gl.getUniformLocation(structure, "uSelectedLane") }
    };
    return { update, draw, structure, buffers, vaos, feedbacks, locations, count, lanes: this.lanes, agents: this.agentCount, source: 0 };
  }

  dispose() {
    if (!this.gl || !this.resources || this.gl.isContextLost()) return;
    const gl = this.gl, r = this.resources;
    r.buffers.forEach((item) => gl.deleteBuffer(item)); r.vaos.forEach((item) => gl.deleteVertexArray(item)); r.feedbacks.forEach((item) => gl.deleteTransformFeedback(item));
    gl.deleteProgram(r.update); gl.deleteProgram(r.draw); gl.deleteProgram(r.structure); this.resources = null;
  }

  bindEvents() {
    this.canvas.addEventListener("webglcontextlost", (event) => { event.preventDefault(); this.contextLost = true; cancelAnimationFrame(this.frame); this.frame = 0; $("#gpu-status").textContent = "context lost / awaiting recovery"; $("#canvas-fallback").hidden = false; $("#canvas-fallback").textContent = "GPU context lost. Semantic data and operations remain live; visual recovery is automatic."; announceGraphic("WebGL context was lost. Semantic data and operational controls remain active while visual recovery is pending.", true); });
    this.canvas.addEventListener("webglcontextrestored", () => { this.contextLost = false; this.resources = null; const recovered = this.initialize(); if (recovered && this.resources && !this.gl.isContextLost()) announceGraphic("WebGL context recovered; shaders, transform feedback, particle buffers, corridor selection, and rendering were revalidated."); else announceGraphic("WebGL context restoration was reported, but the flow field could not be revalidated. Use the semantic run table.", true); });
    document.addEventListener("visibilitychange", () => { this.hidden = document.hidden; this.lastTime = 0; if (this.hidden) { cancelAnimationFrame(this.frame); this.frame = 0; } else this.requestFrame(); });
    new ResizeObserver(() => { this.resize(); this.requestFrame(); }).observe(this.canvas);
    const motionChanged = (event) => this.setFrozen(event.matches);
    if (this.motionQuery.addEventListener) this.motionQuery.addEventListener("change", motionChanged);
    else this.motionQuery.addListener?.(motionChanged);
    this.canvas.addEventListener("pointerdown", (event) => { this.drag = { lastX: event.clientX, lastY: event.clientY, startX: event.clientX, startY: event.clientY, moved: false }; this.canvas.setPointerCapture(event.pointerId); });
    this.canvas.addEventListener("pointermove", (event) => { if (!this.drag) return; if (Math.hypot(event.clientX - this.drag.startX, event.clientY - this.drag.startY) > 5) this.drag.moved = true; this.rotation[1] += (event.clientX - this.drag.lastX) * .006; this.rotation[0] = Math.max(-1.1, Math.min(.8, this.rotation[0] + (event.clientY - this.drag.lastY) * .006)); this.drag.lastX = event.clientX; this.drag.lastY = event.clientY; this.requestFrame(); });
    this.canvas.addEventListener("pointerup", (event) => { const moved = this.drag?.moved; this.drag = null; if (!moved) this.hitTestLane(event); });
  }

  resize() {
    if (!this.gl) return;
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    const width = Math.min(2560, Math.max(1, Math.round(this.canvas.clientWidth * dpr)));
    const height = Math.min(1440, Math.max(1, Math.round(this.canvas.clientHeight * dpr)));
    if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
  }

  matrix() {
    const aspect = this.canvas.width / Math.max(1, this.canvas.height);
    const f = 1 / Math.tan(Math.PI / 7), near = .1, far = 10;
    const projection = new Float32Array([f / aspect,0,0,0, 0,f,0,0, 0,0,(far+near)/(near-far),-1, 0,0,(2*far*near)/(near-far),0]);
    const [x, y] = this.rotation, cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y);
    const view = new Float32Array([cy, sx*sy, -cx*sy,0, 0,cx,sx,0, sy,-sx*cy,cx*cy,0, 0,0,-3.25,1]);
    const out = new Float32Array(16);
    for (let column = 0; column < 4; column += 1) for (let row = 0; row < 4; row += 1) out[column*4+row] = projection[row]*view[column*4] + projection[4+row]*view[column*4+1] + projection[8+row]*view[column*4+2] + projection[12+row]*view[column*4+3];
    return out;
  }

  hitTestLane(event) {
    if (!this.runIds.length) return;
    const rect = this.canvas.getBoundingClientRect();
    const matrix = this.matrix();
    let nearest = null;
    for (let lane = 0; lane < this.lanes; lane += 1) {
      const y = (lane / Math.max(1, this.lanes - 1) - .5) * 1.7;
      const clipX = matrix[4] * y + matrix[12];
      const clipY = matrix[5] * y + matrix[13];
      const clipW = matrix[7] * y + matrix[15];
      if (clipW <= 0) continue;
      const x = rect.left + (clipX / clipW * .5 + .5) * rect.width;
      const screenY = rect.top + (1 - (clipY / clipW * .5 + .5)) * rect.height;
      const distance = Math.hypot(event.clientX - x, event.clientY - screenY);
      if (!nearest || distance < nearest.distance) nearest = { lane, distance };
    }
    if (nearest && nearest.distance <= Math.max(34, rect.height / Math.max(8, this.lanes * 2))) {
      chooseRun(this.runIds[nearest.lane]);
      this.canvas.focus({ preventScroll: true });
    } else toast("No corridor was close enough. Use the semantic run table for exact selection.");
  }

  setOperationalState(model) {
    const nextLanes = Math.max(1, Math.min(16, model.runs.length || 1));
    const nextAgents = Math.max(1, Math.min(16, agents().length || 1));
    const topologyChanged = this.lanes !== nextLanes || this.agentCount !== nextAgents;
    this.lanes = nextLanes;
    this.agentCount = nextAgents;
    this.runIds = model.runs.map((run) => run.id);
    this.selectedLane = selectedRunId ? this.runIds.indexOf(selectedRunId) : -1;
    this.canvas.setAttribute("aria-label", selectedRunId ? `Three-dimensional run corridor field. Selected corridor owns run ${selectedRunId}. Use the semantic table for exact details and selection.` : "Three-dimensional run corridor field. No run is selected. Use the semantic table for exact details and selection.");
    const blockedId = model.state?.block || model.state?.blocker ? model.state?.currentRunId : model.runs.find((run) => run.block || run.blocker || String(run.status).includes("block"))?.id;
    this.blockerLane = blockedId ? model.runs.findIndex((run) => run.id === blockedId) : -1;
    const phase = first(model.state?.phase, "building");
    this.blockerX = -1.1 + Math.max(0, WORKFLOW_PHASES.indexOf(phase)) / Math.max(1, WORKFLOW_PHASES.length - 1) * 2.2;
    this.gateCount = Math.max(1, Math.min(12, gates().length || 1));
    this.eventPhase = model.events.length;
    if (topologyChanged && this.gl && this.resources && !this.contextLost) {
      try { this.dispose(); this.resources = this.createResources(); $("#particle-count").textContent = `${this.resources.count.toLocaleString()} particles`; }
      catch (error) { if (!this.gl.isContextLost()) toast(`GPU corridor rebuild failed: ${error.message}`, true); }
    }
    this.requestFrame();
  }

  setFrozen(value) {
    this.frozen = value;
    $("#motion-toggle").setAttribute("aria-pressed", String(value));
    $("#motion-toggle").textContent = value ? "Resume motion" : "Freeze motion";
    this.lastTime = 0;
    this.requestFrame();
  }

  requestFrame() {
    if (!this.frame && !this.hidden && !this.contextLost && this.resources) this.frame = requestAnimationFrame((time) => this.render(time));
  }

  render(time) {
    this.frame = 0;
    if (!this.gl || !this.resources || this.contextLost || this.hidden) return;
    const gl = this.gl, r = this.resources;
    this.resize();
    const dt = this.lastTime ? Math.min(.033, (time - this.lastTime) / 1000) : .016;
    this.lastTime = time;
    let drawIndex = r.source;
    if (!this.frozen) {
      const destination = 1 - r.source;
      gl.useProgram(r.update); gl.bindVertexArray(r.vaos[r.source]);
      gl.uniform1f(r.locations.update.dt, dt); gl.uniform1f(r.locations.update.time, time / 1000); gl.uniform1f(r.locations.update.lanes, this.lanes); gl.uniform1f(r.locations.update.blockLane, this.blockerLane); gl.uniform1f(r.locations.update.blockX, this.blockerX);
      gl.enable(gl.RASTERIZER_DISCARD); gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, r.feedbacks[destination]); gl.beginTransformFeedback(gl.POINTS); gl.drawArrays(gl.POINTS, 0, r.count); gl.endTransformFeedback(); gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null); gl.disable(gl.RASTERIZER_DISCARD);
      drawIndex = destination; r.source = destination;
    }
    gl.viewport(0, 0, this.canvas.width, this.canvas.height); gl.clearColor(.008,.028,.025,1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    const matrix = this.matrix();
    gl.useProgram(r.structure); gl.uniformMatrix4fv(r.locations.structure.matrix, false, matrix); gl.uniform1f(r.locations.structure.lanes, this.lanes); gl.uniform1f(r.locations.structure.gates, this.gateCount); gl.uniform1f(r.locations.structure.selectedLane, this.selectedLane); gl.bindVertexArray(null); gl.uniform1i(r.locations.structure.mode, 0); gl.drawArraysInstanced(gl.LINES, 0, 2, this.lanes); gl.uniform1i(r.locations.structure.mode, 1); gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.gateCount); gl.uniform1i(r.locations.structure.mode, 2); gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.useProgram(r.draw); gl.bindVertexArray(r.vaos[drawIndex]); gl.uniformMatrix4fv(r.locations.draw.matrix, false, matrix); gl.uniform1f(r.locations.draw.time, time / 1000); gl.uniform1f(r.locations.draw.eventPhase, this.eventPhase); gl.uniform1f(r.locations.draw.blockLane, this.blockerLane); gl.uniform1f(r.locations.draw.selectedLane, this.selectedLane); gl.drawArrays(gl.POINTS, 0, r.count); gl.depthMask(true); gl.bindVertexArray(null);
    if (!this.frozen) this.requestFrame();
  }
}

const flow = new FlowField($("#flow-canvas"));
flow.setFrozen(flow.frozen);
initializePlanContractFields();
initCommandList();

document.addEventListener("click", (event) => {
  const open = event.target.closest("[data-open]");
  if (open) {
    if (open.dataset.open === "command") openCommand();
    if (open.dataset.open === "plans") { $("#plans-dialog").showModal(); client.refreshPlans().then(() => client.listPlanAssistance()).catch((error) => toast(error.message, true)); }
    if (open.dataset.open === "help") $("#help-dialog").showModal();
  }
});

function setupTablist(tablist, dataName, panelPrefix, onActivate = () => {}) {
  const tabs = $$(`[role="tab"][data-${dataName}]`, tablist);
  const activate = (tab, focus = false) => {
    for (const item of tabs) {
      const selected = item === tab;
      item.setAttribute("aria-selected", String(selected));
      item.tabIndex = selected ? 0 : -1;
      const panel = document.getElementById(item.getAttribute("aria-controls") || `${panelPrefix}${item.dataset[dataName]}`);
      if (panel) panel.hidden = !selected;
    }
    onActivate(tab.dataset[dataName]);
    if (focus) tab.focus();
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activate(tab));
    tab.addEventListener("keydown", (event) => {
      let next = null;
      if (["ArrowRight", "ArrowDown"].includes(event.key)) next = tabs[(index + 1) % tabs.length];
      if (["ArrowLeft", "ArrowUp"].includes(event.key)) next = tabs[(index - 1 + tabs.length) % tabs.length];
      if (event.key === "Home") next = tabs[0];
      if (event.key === "End") next = tabs.at(-1);
      if (!next) return;
      event.preventDefault();
      activate(next, true);
    });
  });
}

setupTablist($(".tabs"), "tab", "tab-");
setupTablist($(".lower-tabs"), "lower", "lower-", renderLower);

function assertStaticParity() {
  if (OPERATION_COMMANDS.length !== 30) throw new Error(`Flowfield wording and command surface expect 30 operations; client exports ${OPERATION_COMMANDS.length}.`);
  const supportedPlanActions = new Set(["project-plan.create", "project-plan.update", ...PROJECT_PLAN_ACTIONS.filter((action) => !["project-plan.create", "project-plan.update"].includes(action))]);
  if (supportedPlanActions.size !== PROJECT_PLAN_ACTIONS.length || PROJECT_PLAN_ACTIONS.some((action) => !supportedPlanActions.has(action))) throw new Error("Project-plan action parity failed.");
  for (const tab of $$('[role="tab"]')) {
    const panel = document.getElementById(tab.getAttribute("aria-controls"));
    if (!panel || panel.getAttribute("role") !== "tabpanel" || panel.getAttribute("aria-labelledby") !== tab.id) throw new Error(`Tab parity failed for ${tab.id}.`);
  }
}

assertStaticParity();

$$('[data-stream]').forEach((button) => button.addEventListener("click", async () => {
  const wasPaused = Boolean(snapshot.connection?.paused);
  try {
    if (button.dataset.stream === "refresh") await client.refresh();
    else if (button.dataset.stream === "connect") await client.connect();
    else if (button.dataset.stream === "disconnect") client.disconnect();
    else if (wasPaused) await client.resume();
    else client.pause();
    const messages = { refresh: "Control-plane data refreshed.", connect: "Live feed connected and reconciled.", disconnect: "Browser feed disconnected; workflow continues." };
    toast(messages[button.dataset.stream] || (wasPaused ? "Feed resumed and reconciled." : "Browser feed paused; workflow continues."));
  } catch (error) { toast(error.message, true); }
}));

$("#motion-toggle").addEventListener("click", () => flow.setFrozen(!flow.frozen));
$("#view-reset").addEventListener("click", () => { flow.rotation = [-.24, -.34]; flow.requestFrame(); });
$("#load-resources").addEventListener("click", () => selectedRunId ? client.selectRun(selectedRunId).catch((error) => toast(error.message, true)) : toast("Select a run first.", true));
$("#inspect-blocker-resources").addEventListener("click", () => $('[data-tab="resources"]').click());
$("#prepare-advice").addEventListener("click", () => openCommand("deblock-advice", { runId: selectedRunId, prompt: "Assess the localized blocker and recommend the safest bounded mitigation." }));
$("#prepare-deblock").addEventListener("click", () => {
  if (selectedRunId !== currentRunId()) {
    const iteration = snapshot.iterations.find((item) => item.runId === selectedRunId) || { runId: selectedRunId };
    return openCommand("continue-from-iteration", iterationCommandPayload("continue-from-iteration", iteration));
  }
  openCommand("deblock", { runId: selectedRunId, prompt: "" });
});

$("#command-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!selectedCommand) return;
  try {
    const payload = JSON.parse($("#command-payload").value);
    validateOperationPayload(selectedCommand, payload);
    reviewDispatch("operation", selectedCommand, payload);
  }
  catch (error) { toast(`Payload is not valid JSON: ${error.message}`, true); }
});
$("#confirm-send").addEventListener("click", dispatchPending);

$("#new-plan").addEventListener("click", () => fillPlan());
$("#plan-form").addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const planId = event.currentTarget.elements.planId.value;
    const version = Number(event.currentTarget.elements.version.value) || undefined;
    const content = planContent(event.currentTarget);
    reviewDispatch("plan", planId ? "project-plan.update" : "project-plan.create", planId ? { planId, content } : { content }, { expectedVersion: version });
  } catch (error) { toast(error.message, true); }
});
$$('[data-assist-new]').forEach((button) => button.addEventListener("click", async () => {
  try { const thread = await client.createPlanAssistance(button.dataset.assistNew); activeAssistanceId = thread.id; renderPlans(); }
  catch (error) { toast(error.message, true); }
}));
$("#assist-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!activeAssistanceId) return toast("Select or create an assistance thread.", true);
  const message = new FormData(event.currentTarget).get("message");
  try { await client.messagePlanAssistance(activeAssistanceId, snapshot.assistanceDetail?.version || 1, message); event.currentTarget.reset(); renderPlans(); }
  catch (error) { toast(error.message, true); }
});
$("#apply-proposal").addEventListener("click", () => {
  const proposal = snapshot.assistanceDetail?.proposedContent;
  if (!proposal) return toast("This thread has no proposed plan content.", true);
  fillPlan({ ledger: {}, revision: { content: completePlanContent(proposal) } });
  toast("Proposal copied into a new identity-free draft with every plan contract field populated. Review before creating it.");
});

document.addEventListener("keydown", (event) => {
  if (["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) return;
  if (event.key === "?") $("#help-dialog").showModal();
  else if (event.key.toLowerCase() === "c") openCommand();
  else if (event.key.toLowerCase() === "p") $("#plans-dialog").showModal();
  else if (event.key.toLowerCase() === "f") flow.setFrozen(!flow.frozen);
  else if (event.key.toLowerCase() === "r") client.refresh().catch((error) => toast(error.message, true));
});

client.subscribe((model) => { snapshot = model; renderAll(); });
client.connect().catch((error) => toast(`Initial connection failed; polling recovery will continue: ${error.message}`, true));
setInterval(renderStatus, 1000);
