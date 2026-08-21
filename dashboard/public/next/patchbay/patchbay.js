import { createDashboardClient, WORKFLOW_PHASES } from "../../headless-dashboard-client.js";

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

function el(tag, options = {}, ...children) {
  const node = tag === "path" ? document.createElementNS("http://www.w3.org/2000/svg", tag) : document.createElement(tag);
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

function renderHeader() {
  const state = snapshot.state || {};
  const connection = snapshot.connection || {};
  const pieces = [connection.status, connection.transport, state.currentRunId || "no run", statusOf(state), state.selectedProject?.name || state.currentProject || "no project"];
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
    return el("article", { class: "channel", "data-status": agent.status },
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
    if (monitorMode === "tools") return el("div", { class: "scope-row" }, el("time", { text: item.status }), el("span", { text: `${item.agentId} / ${item.name} / ${item.action}` }));
    return el("div", { class: "scope-row" }, el("time", { text: new Date(item.ts).toLocaleTimeString() }), el("span", { text: `${item.level} / ${item.source} / ${item.type}: ${item.message}` }));
  }) : [el("p", { class: "module-note", text: `No ${monitorMode} match the monitor.` })]));
}

function entry(title, subtitle, actions = [], body = "") {
  return el("article", { class: "list-entry" },
    el("div", { class: "list-entry-head" }, el("strong", { text: title }), el("small", { text: subtitle })),
    body ? el("p", { text: body }) : null,
    actions.length ? el("div", { class: "button-row" }, actions) : null
  );
}

function renderControl() {
  const control = snapshot.control || {};
  setText("admissionState", control.runAdmission || "enabled");
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
  $("queueList").replaceChildren(...(items.length ? items.map((item) => entry(
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
  return [
    button("Mark passed", { gateAction: "passed", id: gate.id }, { class: "hot" }),
    button("Needs evidence", { gateAction: "needs", id: gate.id }),
    button("Attach selected run evidence", { gateAction: "evidence", id: gate.id }),
    button("Reset pending", { gateAction: "reset", id: gate.id })
  ];
}
function renderGates() {
  const gates = arr(snapshot.gates?.gates);
  setText("gateCount", gates.length);
  $("gateList").replaceChildren(...(gates.length ? gates.map((gate) => entry(
    gate.description || gate.title || gate.id, `${gate.id} / ${gate.severity || "must"} / ${gate.status || "pending"}`,
    gateActions(gate), `Required evidence: ${arr(gate.requiredEvidence).join(", ") || "none specified"}`
  )) : [el("p", { class: "module-note", text: "No acceptance gates patched." })]));
}

async function showEvidence(tab = evidenceTab) {
  evidenceTab = tab;
  setText("evidenceState", tab);
  document.querySelectorAll("[data-evidence-tab]").forEach((node) => {
    if (node.getAttribute("role") === "tab") node.setAttribute("aria-selected", String(node.dataset.evidenceTab === tab));
  });
  const resources = $("resourceList");
  const output = $("evidenceOutput");
  resources.replaceChildren();
  if (tab === "run") output.textContent = json(snapshot.selectedRun?.run || snapshot.state || { message: "No run selected" });
  else if (tab === "iteration") output.textContent = json(snapshot.iterationDetail || snapshot.iterations.find((item) => item.id === snapshot.selectedIterationId) || { message: "No iteration selected" });
  else if (tab === "audit") output.textContent = json(snapshot.audit);
  else if (tab === "spec" || tab === "devplan") {
    output.textContent = `Loading ${tab.toUpperCase()} document...`;
    try { const document = await client.loadDocument(tab); output.textContent = document.text; } catch (error) { output.textContent = `${tab.toUpperCase()} unavailable: ${errorMessage(error)}`; }
  } else {
    const files = tab === "artifacts" ? arr(snapshot.selectedRun?.artifacts) : arr(snapshot.selectedRun?.logs);
    resources.replaceChildren(...files.map((file) => button(`${file.name}${file.size != null ? ` / ${file.size} B` : ""}`, { resource: tab, name: file.name })));
    output.textContent = files.length ? `Select a ${tab === "artifacts" ? "stored artifact" : "log tail"} above.` : `No ${tab} are available for this run.`;
  }
}

function renderEvidence() {
  if (["run", "iteration", "audit"].includes(evidenceTab)) showEvidence(evidenceTab);
  else if (["artifacts", "logs"].includes(evidenceTab)) {
    const files = evidenceTab === "artifacts" ? arr(snapshot.selectedRun?.artifacts) : arr(snapshot.selectedRun?.logs);
    $("resourceList").replaceChildren(...files.map((file) => button(`${file.name}${file.size != null ? ` / ${file.size} B` : ""}`, { resource: evidenceTab, name: file.name })));
  }
}

function renderAll() {
  renderHeader(); renderWorkflow(); renderRuns(); renderAgents(); renderMonitor(); renderControl(); renderDeblock(); renderQueue(); renderShowcase(); renderGates(); renderEvidence();
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
    return el("path", { class: `cable ${type}`, d: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}` });
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

async function runCommand(type, payload = {}) {
  return task(type, () => client.command(type, payload, { refresh: true }));
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

function renderPlanner() { renderPlanList(); renderPlanEditor(); renderPlanReview(); renderAssistance(); setPlannerPane(plannerPane); }
function setPlannerPane(pane) {
  plannerPane = pane;
  document.querySelectorAll("[data-plan-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.planPanel === pane));
  document.querySelectorAll("[data-plan-pane]").forEach((control) => control.setAttribute("aria-pressed", String(control.dataset.planPane === pane)));
}
function planError(message = "") { $("planError").hidden = !message; $("planError").textContent = message; setText("planStatus", message ? "Action failed" : "Ready"); }
async function loadPlan(id) { selectedPlanId = id; selectedPlan = await client.getProjectPlan(id); renderPlanner(); }
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
    if (type === "clear-queue" && !confirm("Clear the entire queue and queue-linked steering?")) return;
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
  if (form.id === "deblockForm") { const data = Object.fromEntries(new FormData(form)); if (await runCommand("deblock", { ...data, runId: snapshot.state?.currentRunId || snapshot.selectedRunId })) form.reset(); }
  if (form.id === "queueForm") { const data = Object.fromEntries(new FormData(form)); if (await runCommand("add-queue-item", { ...data, pin: form.elements.pin.checked, source: "patchbay" })) form.reset(); }
  if (form.id === "gateForm") { const data = Object.fromEntries(new FormData(form)); if (!data.id) delete data.id; if (await runCommand("add-gate", data)) form.reset(); }
  if (form.id === "assistanceForm" && assistanceDetail) {
    const message = String(new FormData(form).get("message") || "");
    try { assistanceDetail = await client.messagePlanAssistance(assistanceDetail.id, assistanceDetail.version, message); await client.listPlanAssistance(); renderAssistance(); } catch (error) { planError(errorMessage(error)); }
  }
});

document.addEventListener("click", async (event) => {
  const target = event.target.closest("button");
  if (!target) return;
  if (target.dataset.action) { await handleAction(target.dataset.action); return; }
  if (target.id === "setObjective") { const text = $("steerForm").elements.text.value.trim(); if (!text) return notify("Enter an objective before setting it.", true); await runCommand("set-current-objective", { text, source: "patchbay", runId: snapshot.selectedRunId || snapshot.state?.currentRunId || null }); return; }
  if (target.dataset.monitor) { monitorMode = target.dataset.monitor; renderMonitor(); return; }
  if (target.dataset.evidenceTab) { await showEvidence(target.dataset.evidenceTab); $("evidenceModule").scrollIntoView({ block: "nearest" }); return; }
  if (target.dataset.removeSteering) { await runCommand("remove-steering", { id: target.dataset.removeSteering }); return; }
  if (target.dataset.advice) { await runCommand(`${target.dataset.decision === "approve" ? "approve" : "deny"}-deblock-advice`, { adviceId: target.dataset.advice }); return; }
  if (target.id === "askAdvice") { await runCommand("deblock-advice", { prompt: $("deblockForm").elements.prompt.value, runId: snapshot.state?.currentRunId || snapshot.selectedRunId }); return; }
  if (target.dataset.queueAction) {
    const item = arr(snapshot.queue?.items).find((candidate) => candidate.id === target.dataset.id);
    if (target.dataset.queueAction === "pin") await runCommand("pin-queue-item", { id: item.id });
    if (target.dataset.queueAction === "archive") await runCommand("archive-queue-item", { id: item.id });
    if (target.dataset.queueAction === "use") await runCommand("start-next-iteration", { ...iterationPayload(), queueItemId: item.id, repoPath: item.target?.preferredRepo || $("repoPath").value.trim(), objective: item.objective, changeText: item.context || `Complete one bounded generation for ${item.title}.`, acceptanceGateIds: item.acceptanceGateIds || [] });
    return;
  }
  if (target.dataset.lineage) { if (!snapshot.selectedIterationId) return notify("Select an iteration before choosing a lineage action.", true); await runCommand(target.dataset.lineage, iterationPayload()); return; }
  if (target.dataset.gateAction) {
    const id = target.dataset.id, runId = snapshot.selectedRunId || snapshot.state?.currentRunId || null;
    if (target.dataset.gateAction === "passed") await runCommand("gate-decision", { gateId: id, runId, status: "passed", decision: "accepted", evidenceArtifacts: ["artifacts/gate-report.json", "artifacts/gate-decisions.json"] });
    if (target.dataset.gateAction === "needs") await runCommand("gate-decision", { gateId: id, runId, status: "needs-evidence", decision: "defer", evidenceArtifacts: [] });
    if (target.dataset.gateAction === "evidence") await runCommand("attach-gate-evidence", { gateId: id, runId, artifacts: arr(snapshot.selectedRun?.artifacts).map((file) => file.name), notes: "Attached explicitly from Patchbay evidence scope." });
    if (target.dataset.gateAction === "reset") await runCommand("update-gate", { gateId: id, status: "pending" });
    return;
  }
  if (target.dataset.resource) {
    $("evidenceOutput").textContent = `Loading ${target.dataset.name}...`;
    try { const result = target.dataset.resource === "artifacts" ? await client.loadArtifact(target.dataset.name) : await client.loadLog(target.dataset.name); $("evidenceOutput").textContent = result.text; } catch (error) { $("evidenceOutput").textContent = errorMessage(error); }
    return;
  }
  if (target.dataset.planPane) { setPlannerPane(target.dataset.planPane); return; }
  if (target.dataset.newPlan) { const result = await client.createProjectPlan({ content: planDefaults(target.dataset.newPlan) }, { refresh: true }); await loadPlan(result.planId); setPlannerPane("edit"); return; }
  if (target.dataset.selectPlan) { await loadPlan(target.dataset.selectPlan); setPlannerPane("edit"); return; }
  if (target.dataset.planAction) { await planLifecycle(target.dataset.planAction); return; }
  if (target.dataset.newAssistance) { assistanceDetail = await client.createPlanAssistance(target.dataset.newAssistance); selectedAssistanceId = assistanceDetail.id; await client.listPlanAssistance(); renderAssistance(); return; }
  if (target.dataset.selectAssistance) { selectedAssistanceId = target.dataset.selectAssistance; assistanceDetail = await client.getPlanAssistance(selectedAssistanceId); renderAssistance(); return; }
  if (target.dataset.assistanceBack) { assistanceDetail = null; selectedAssistanceId = null; renderAssistance(); return; }
  if (target.dataset.assistanceProposal && assistanceDetail?.proposedContent) { const result = await client.createProjectPlan({ content: assistanceDetail.proposedContent }, { refresh: true }); await loadPlan(result.planId); setPlannerPane("edit"); }
});

async function planLifecycle(action) {
  if (!selectedPlan) return;
  const ledger = selectedPlan.ledger, revision = selectedPlan.revision;
  const subject = { planId: ledger.planId, revision: ledger.currentRevision, planDigest: ledger.currentDigest };
  if (action === "update") { const form = $("projectPlanForm"); await mutatePlan("project-plan.update", { planId: ledger.planId, content: contentFromPlanForm(form, revision.content) }); }
  if (action === "ready") await mutatePlan("project-plan.ready-for-review", subject);
  if (action === "approve") await mutatePlan("project-plan.approve", { ...subject, notes: $("planDecisionNotes")?.value || "" });
  if (action === "reject") {
    const notes = $("planDecisionNotes")?.value.trim() || "";
    if (!notes) return planError("Rejection notes are required.");
    await mutatePlan("project-plan.reject", { ...subject, notes });
  }
  if (action === "launch") { if (!$("planLaunchConfirm")?.checked) return planError("Confirm the approved revision and source-branch safety boundary before launch."); await mutatePlan("project-plan.launch", subject); }
  if (["clone", "fork"].includes(action)) await mutatePlan(`project-plan.${action}`, { ...subject, sourceRunId: snapshot.selectedRunId || null, sourceIterationId: snapshot.selectedIterationId || null, baseRef: revision.content.repository?.baseRef || null });
  if (action === "archive") { if (confirm("Archive this persisted plan?")) await mutatePlan("project-plan.archive", { planId: ledger.planId }); }
}

$("runSelect").addEventListener("change", async (event) => { await client.selectRun(event.target.value); await showEvidence("run"); });
$("iterationSelect").addEventListener("change", async (event) => { await client.selectIteration(event.target.value); await showEvidence("iteration"); });
$("eventFilter").addEventListener("input", renderMonitor);
$("refreshButton").addEventListener("click", () => task("Refresh", () => client.refresh()));
$("streamToggle").addEventListener("click", async () => { if (snapshot.connection.paused) await client.resume(); else client.pause(); });
$("connectionToggle").addEventListener("click", () => snapshot.connection.status === "disconnected" ? client.connect().catch((error) => notify(errorMessage(error), true)) : client.disconnect());
$("linearToggle").addEventListener("click", () => { const active = document.body.classList.toggle("linear"); $("linearToggle").setAttribute("aria-pressed", String(active)); $("linearToggle").textContent = active ? "Patch field view" : "Linear controls"; requestCables(); });
$("openPlanner").addEventListener("click", async () => { $("planner").hidden = false; document.body.style.overflow = "hidden"; await Promise.all([client.refreshPlans(), client.listPlanAssistance()]); if (!selectedPlanId && client.getSnapshot().plans[0]) await loadPlan(client.getSnapshot().plans[0].planId); else renderPlanner(); $("closePlanner").focus(); });
$("closePlanner").addEventListener("click", () => { $("planner").hidden = true; document.body.style.overflow = ""; $("openPlanner").focus(); });

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("planner").hidden) { $("closePlanner").click(); return; }
  if (event.key === "Tab" && !$("planner").hidden) {
    const focusable = [...$("planner").querySelectorAll("button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href],[tabindex]:not([tabindex='-1'])")].filter((node) => node.getClientRects().length);
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    return;
  }
  if (event.key.toLowerCase() === "m" && !event.target.matches("input,textarea,select") && $("planner").hidden) { event.preventDefault(); document.querySelector("[data-module]")?.focus(); return; }
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
client.subscribe((next) => { snapshot = next; renderAll(); if (!$("planner").hidden) renderPlanList(); });
client.connect().catch((error) => notify(`Initial connection failed: ${errorMessage(error)}`, true));
