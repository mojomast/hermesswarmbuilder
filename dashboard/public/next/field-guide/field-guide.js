import { createDashboardClient, OPERATION_COMMANDS, WORKFLOW_PHASES } from "../../headless-dashboard-client.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const lines = (value) => String(value || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
const when = (value) => value ? new Date(value).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "not recorded";
const text = (value, fallback = "Not reported") => typeof value === "string" && value.trim() ? value : fallback;
const terminal = new Set(["idle", "completed", "published", "failed", "stopped", "archived"]);

const client = createDashboardClient({ pollIntervalMs: 5000, maxEvents: 600 });
let model = client.getSnapshot();
let planDetail = null;
let assistanceDetail = null;
let sheetMode = "";
let pendingAction = null;
let sheetInvoker = null;
let busy = false;

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { node.hidden = true; }, 4500);
}

function report(error) {
  const message = error?.details?.length ? `${error.message}: ${error.details.join("; ")}` : error?.message || String(error);
  toast(message);
  return message;
}

function agents() {
  const state = model.state || {};
  const source = state.agents || {};
  const values = Array.isArray(source) ? source : Object.values(source);
  const found = new Map(values.map((agent) => [agent.id || agent.label || agent.role, agent]));
  for (const event of model.events) {
    const id = event.agentId || event.data?.agentId;
    if (id && !found.has(id)) found.set(id, { id, role: "event contact", status: "seen", lastMessage: event.message, updatedAt: event.ts });
  }
  return [...found.entries()].map(([id, agent]) => ({ id, label: agent.label || agent.role || id, role: agent.role || "agent", status: agent.status || "unknown", task: agent.currentTask || agent.task || agent.lastMessage || "No current task", updatedAt: agent.updatedAt || state.updatedAt }));
}

function selectedRun() {
  return model.selectedRunId || model.state?.currentRunId || model.runs[0]?.id || null;
}

function currentObjective() {
  const pinned = model.queue?.items?.find((item) => item.id === model.control?.pinnedQueueItemId);
  return model.control?.currentObjective?.text || pinned?.objective || model.state?.task || model.state?.currentTask || model.state?.currentProject || "No objective selected";
}

function iterationLimits(maxIterations = 1) {
  return { maxIterations: Number(maxIterations) || 1, maxVariantsPerIteration: 3, maxParallelVariants: 3, maxAcceptedFeatures: 4, maxVisualMotifChanges: 1, maxNewSections: 1, stopAfterNoImprovement: 1, minImprovementScore: .05 };
}

function renderConnection() {
  const connection = model.connection;
  const online = navigator.onLine;
  const node = $(".signal");
  node.className = `signal ${online && ["connected", "polling"].includes(connection.status) ? "live" : "offline"}`;
  $("#signalText").textContent = !online ? "Offline / local journal" : connection.paused ? "Live updates paused" : `${connection.status}${connection.transport ? ` / ${connection.transport}` : ""}`;
  $("#freshness").textContent = connection.lastRefreshAt ? `Last complete field copy ${when(connection.lastRefreshAt)}.${connection.paused ? " It may be stale." : ""}` : "No live reading yet. Local notes remain available.";
  $("#streamToggle").textContent = connection.paused ? "Resume updates" : "Pause updates";
  $("#connectionToggle").textContent = connection.status === "disconnected" ? "Reconnect" : "Disconnect";
}

function renderToday() {
  const state = model.state || {};
  const status = state.status || state.phase || "unknown";
  const stamp = $("#statusLabel");
  stamp.textContent = status.toUpperCase();
  stamp.className = `status-stamp ${/block|fail|stop/.test(status) ? "danger" : /hold|pause|unknown/.test(status) ? "warn" : ""}`;
  $("#objective").textContent = currentObjective();
  $("#taskLine").textContent = `${text(state.task || state.currentTask, "Awaiting a current task")} · run ${selectedRun() || "none"}`;
  const current = Math.max(0, WORKFLOW_PHASES.indexOf(state.phase));
  $("#workflow").innerHTML = WORKFLOW_PHASES.map((phase, index) => `<li class="${index === current ? "current" : ""}" ${index === current ? 'aria-current="step"' : ""}>${esc(phase.replaceAll("-", " "))}</li>`).join("");
  const gates = model.gates?.gates || [];
  $("#gateChecklist").innerHTML = gates.length ? gates.map((gate) => `<button class="gate-row ${gate.status === "passed" ? "passed" : ""}" data-gate-id="${esc(gate.id)}"><span class="gate-mark" aria-hidden="true">${gate.status === "passed" ? "✓" : ""}</span><span><b>${esc(gate.description || gate.title || gate.id)}</b><small>${esc((gate.requiredEvidence || []).join(", ") || "No evidence path specified")}</small></span><small>${esc(gate.status || "open")}</small></button>`).join("") : '<p class="empty">No gates in this field copy.</p>';
}

function renderCrew() {
  const query = $("#agentFilter").value.toLowerCase();
  const list = agents().filter((agent) => [agent.id, agent.label, agent.role, agent.status].join(" ").toLowerCase().includes(query));
  $("#agentList").innerHTML = list.length ? list.map((agent) => `<article class="contact"><i class="${terminal.has(agent.status) ? "" : "active"}" aria-hidden="true"></i><div><b>${esc(agent.label)}</b><small>${esc(agent.role)} · ${esc(agent.status)}</small><small>${esc(agent.task)}</small></div><button data-contact="${esc(agent.id)}">Trail</button></article>`).join("") : '<p class="empty">No matching contacts.</p>';
  const run = $("#runFilter").value;
  const agent = $("#eventAgentFilter").value;
  const kind = $("#eventTypeFilter").value;
  const search = $("#eventSearch").value.toLowerCase();
  let events = model.events.filter((event) => (!run || event.runId === run) && (!agent || event.agentId === agent));
  if (kind === "tools") events = events.filter((event) => event.data?.toolName || /tool/i.test(event.type));
  if (kind === "errors") events = events.filter((event) => ["warn", "error"].includes(event.level) || /block|fail|error/i.test(event.message));
  if (search) events = events.filter((event) => [event.message, event.type, event.data?.toolName].join(" ").toLowerCase().includes(search));
  $("#eventList").innerHTML = events.length ? events.slice(-80).reverse().map((event) => `<article class="log-entry"><time>${esc(when(event.ts))}</time> <b>${esc(event.agentId || event.source)}</b><p>${esc(event.message || event.type)}</p><details><summary>Event detail</summary><pre>${esc(JSON.stringify(event.raw, null, 2))}</pre></details></article>`).join("") : '<p class="empty">No events match these filters.</p>';
}

function syncSelects() {
  const preserve = (node, html) => { const value = node.value; node.innerHTML = html; if ($(`option[value="${CSS.escape(value)}"]`, node)) node.value = value; };
  const runs = model.runs || [];
  preserve($("#runFilter"), `<option value="">All runs</option>${runs.map((run) => `<option value="${esc(run.id)}">${esc(run.id)} · ${esc(run.status || "unknown")}</option>`).join("")}`);
  preserve($("#resourceRun"), runs.length ? runs.map((run) => `<option value="${esc(run.id)}">${esc(run.id)} · ${esc(run.status || "unknown")}</option>`).join("") : '<option value="">No runs</option>');
  preserve($("#eventAgentFilter"), `<option value="">All agents</option>${agents().map((agent) => `<option value="${esc(agent.id)}">${esc(agent.label)}</option>`).join("")}`);
  preserve($("#planSelect"), `<option value="">Select a plan</option>${model.plans.map((plan) => `<option value="${esc(plan.planId)}">${esc(plan.title || "Untitled")} · ${esc(plan.state)}</option>`).join("")}`);
  if (!$("#resourceRun").value && selectedRun()) $("#resourceRun").value = selectedRun();
}

function journalEntries() {
  try { return JSON.parse(localStorage.getItem("swarm-field-guide.journal.v1") || "[]"); } catch { return []; }
}

function renderJournal() {
  const entries = journalEntries();
  $("#journalEntries").innerHTML = entries.length ? entries.map((entry) => `<article class="journal-note"><header><b>Field note</b><time>${esc(when(entry.createdAt))}</time></header><pre>${esc(entry.note)}</pre>${entry.artifacts.length ? `<small>Artifacts: ${esc(entry.artifacts.join(", "))}</small>` : ""}<button data-delete-note="${esc(entry.id)}">Delete local note</button></article>`).join("") : '<p class="empty">No device notes yet.</p>';
  const resources = model.selectedRun || {};
  const buttons = [
    ...(resources.artifacts || []).map((item) => ({ kind: "artifact", name: item.name || item.path || item })),
    ...(resources.logs || []).map((item) => ({ kind: "log", name: item.name || item.path || item }))
  ];
  $("#resourceList").innerHTML = buttons.length ? buttons.map((item) => `<button class="resource-button" data-resource-kind="${item.kind}" data-resource-name="${esc(item.name)}"><b>${esc(item.name)}</b><small>${item.kind}</small></button>`).join("") : '<p class="empty">Select a run to load its evidence pack.</p>';
  $("#runDetail").textContent = JSON.stringify(model.selectedRun?.run || { message: "No run selected" }, null, 2);
}

function renderPlans() {
  if (!planDetail) {
    $("#planDetail").innerHTML = '<p class="empty">Select a saved plan, or begin a guided draft.</p>';
    return;
  }
  const ledger = planDetail.ledger;
  const revision = planDetail.revision;
  $("#planDetail").innerHTML = `<article class="plan-summary"><dl><dt>State</dt><dd><b>${esc(ledger.state)}</b></dd><dt>Revision</dt><dd>${esc(revision.revision)}</dd><dt>Digest</dt><dd>${esc(revision.contentDigest)}</dd><dt>Pipeline</dt><dd>${esc(revision.content.pipelineType)}</dd></dl><h3>${esc(revision.content.title || "Untitled plan")}</h3><p>${esc(revision.content.objective || "No objective yet")}</p><details><summary>Exact saved content</summary><pre class="plan-content">${esc(JSON.stringify(revision.content, null, 2))}</pre></details><div class="plan-actions"><button data-plan-action="edit">Edit</button><button data-plan-action="review">Ready for review</button><button data-plan-action="approve">Approve</button><button data-plan-action="reject">Reject</button><button class="primary" data-plan-action="launch">Launch</button><button data-plan-action="clone">Clone</button><button data-plan-action="fork">Fork</button><button data-plan-action="archive">Archive</button></div></article>`;
}

function renderIndex() {
  const auto = model.control?.autoIteration || {};
  $("#generationSummary").innerHTML = `<p><b>${esc(auto.completedGenerations || 0)} / ${esc(auto.targetGenerations || auto.maxIterations || 1)}</b> generations · next ${esc(auto.currentGeneration || 1)} · ${esc(auto.enabled ? auto.mode || "active" : "manual")}</p>`;
  $("#iterationList").innerHTML = model.iterations.length ? model.iterations.slice(0, 20).map((item) => `<div class="index-row"><b>${esc(item.objective || item.id)}</b><small>${esc(item.status || item.state || "unknown")} · ${esc(item.runId || "no run")}</small><div class="plan-actions"><button data-iteration-inspect="${esc(item.id)}">Inspect evidence</button><button data-iteration-action="continue" data-iteration-id="${esc(item.id)}" data-run-id="${esc(item.runId || "")}">Continue</button><button data-iteration-action="fork" data-iteration-id="${esc(item.id)}" data-run-id="${esc(item.runId || "")}">Fork</button><button data-iteration-action="direction" data-iteration-id="${esc(item.id)}" data-run-id="${esc(item.runId || "")}">Use direction</button></div></div>`).join("") : '<p class="empty">No iterations recorded.</p>';
  const detail = model.iterationDetail;
  const evidence = detail ? [detail.sourceEvidence, detail.evidence, detail.artifacts, detail.logs, detail.screenshots, detail.testResults].flatMap((value) => Array.isArray(value) ? value : value ? [value] : []) : [];
  $("#iterationDetail").innerHTML = detail ? `<article class="plan-summary"><h3>${esc(detail.objective || detail.id)}</h3><dl><dt>Iteration</dt><dd>${esc(detail.id)}</dd><dt>Run</dt><dd>${esc(detail.runId || "unlinked")}</dd><dt>Status</dt><dd>${esc(detail.status || "unknown")}</dd><dt>Repository</dt><dd>${esc(detail.repoPath || detail.run?.repoPath || "not reported")}</dd></dl><h4>Evidence inventory</h4>${evidence.length ? `<ul>${evidence.map((item) => `<li>${esc(typeof item === "string" ? item : item.path || item.file || item.name || JSON.stringify(item))}</li>`).join("")}</ul>` : '<p class="empty">No iteration evidence reported.</p>'}<details><summary>Complete iteration record</summary><pre class="plan-content">${esc(JSON.stringify(detail, null, 2))}</pre></details></article>` : "";
  const queue = model.queue?.items || [];
  $("#queueList").innerHTML = queue.length ? queue.map((item) => `<div class="index-row"><b>${esc(item.title)}</b><small>${esc(item.objective || "No objective")} · ${esc(item.status)}</small><div class="plan-actions"><button data-queue-action="pin" data-id="${esc(item.id)}">Pin</button><button data-queue-action="use" data-id="${esc(item.id)}">Use next</button><button data-queue-action="archive" data-id="${esc(item.id)}">Archive</button></div></div>`).join("") : '<p class="empty">Queue is clear.</p>';
  const blocker = model.state?.block || model.state?.blocker || model.state?.hold;
  const advice = model.control?.deblockAdvice?.find((item) => item.status === "pending");
  $("#blockerPanel").innerHTML = blocker || advice ? `<div class="local-notice"><b>${esc(blocker?.reason || blocker?.message || "Advice awaiting decision")}</b>${advice ? `<p>${esc(advice.answer)}</p><div class="plan-actions"><button data-advice="approve" data-id="${esc(advice.id)}">Approve advice</button><button data-advice="deny" data-id="${esc(advice.id)}">Deny</button></div>` : ""}<button data-open-sheet="blocker">Open blocker flow</button></div>` : "";
  const steering = model.control?.activeSteering || [];
  $("#steeringList").innerHTML = steering.length ? steering.map((item) => `<div class="index-row"><b>${esc(item.text)}</b><small>${esc(item.scope)} · ${esc(item.priority)}</small><button data-remove-steering="${esc(item.id)}">Remove</button></div>`).join("") : '<p class="empty">No active steering.</p>';
  $("#auditList").innerHTML = model.audit.length ? model.audit.map((item) => `<article class="log-entry"><time>${esc(when(item.ts))}</time><b> ${esc(item.action)}</b><p>${esc(JSON.stringify(item.summary || item.target || {}))}</p></article>`).join("") : '<p class="empty">No audit entries.</p>';
}

function renderAll() {
  const active = document.activeElement;
  const focus = active?.id ? { id: active.id } : active?.dataset && Object.keys(active.dataset).length ? { data: { ...active.dataset } } : null;
  renderConnection();
  syncSelects();
  renderToday();
  renderCrew();
  renderJournal();
  renderPlans();
  renderIndex();
  if (!active?.isConnected && focus) {
    const selector = focus.data ? Object.entries(focus.data).map(([key, value]) => `[data-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}="${CSS.escape(value)}"]`).join("") : "";
    const target = focus.id ? document.getElementById(focus.id) : selector ? document.querySelector(selector) : null;
    target?.focus({ preventScroll: true });
  }
}

const input = (name, label, value = "", options = {}) => `<label><span>${esc(label)}</span>${options.help ? `<small>${esc(options.help)}</small>` : ""}${options.textarea ? `<textarea name="${name}" ${options.required ? "required" : ""}>${esc(value)}</textarea>` : `<input name="${name}" type="${options.type || "text"}" value="${esc(value)}" ${options.required ? "required" : ""} ${options.min ? `min="${options.min}"` : ""} ${options.max ? `max="${options.max}"` : ""}>`}</label>`;
const select = (name, label, items, selected = "") => `<label><span>${esc(label)}</span><select name="${name}">${items.map(([value, title]) => `<option value="${esc(value)}" ${value === selected ? "selected" : ""}>${esc(title)}</option>`).join("")}</select></label>`;

function gateOptions() { return (model.gates?.gates || []).map((gate) => [gate.id, gate.description || gate.title || gate.id]); }
function runOptions() { return (model.runs || []).map((run) => [run.id, `${run.id} · ${run.status || "unknown"}`]); }

function openSheet(mode, context = {}) {
  sheetMode = mode;
  pendingAction = null;
  sheetInvoker = document.activeElement;
  const title = $("#sheetTitle");
  const body = $("#sheetBody");
  const submit = $("#sheetSubmit");
  $("#sheetReview").hidden = true;
  $("#sheetError").hidden = true;
  submit.textContent = "Review action";
  submit.disabled = false;
  const gateId = context.gateId || gateOptions()[0]?.[0] || "";
  const runId = selectedRun() || "";
  const setups = {
    next: ["Next safe action", `<fieldset><legend>Choose one bounded step</legend><label><input type="radio" name="choice" value="refresh" checked> Refresh before deciding</label><label><input type="radio" name="choice" value="run-now"> Request the scheduled runner now</label><label><input type="radio" name="choice" value="${model.connection.paused ? "resume-live" : "pause"}"> ${model.connection.paused ? "Resume" : "Pause"} live updates on this device</label><label><input type="radio" name="choice" value="hold"> Hold new run admission</label><label><input type="radio" name="choice" value="blocker"> Open blocker recovery</label></fieldset>`],
    gate: ["Gate evidence and decision", `${select("gateId", "Gate", gateOptions(), gateId)}${select("gateAction", "Action", [["attach", "Attach artifact evidence"], ["pass", "Mark passed with evidence"], ["defer", "Needs more evidence"], ["add", "Add a new gate"], ["update", "Update gate"]])}${input("artifacts", "Artifact paths, one per line", "artifacts/gate-report.json", { textarea: true })}${input("notes", "Field notes", "", { textarea: true })}${input("description", "Description (add/update)")}`],
    generation: ["Set iteration course", `${select("generationAction", "Action", [["objective", "Set current objective"], ["next", "Start one bounded generation"], ["target", "Set showcase target"], ["showcase", "Start showcase loop"], ["pause-showcase-loop", "Pause showcase loop"], ["resume-showcase-loop", "Resume showcase loop"], ["stop-showcase-loop", "Stop showcase loop"]])}${input("objective", "Objective", currentObjective(), { textarea: true, required: true })}${input("repoPath", "Repository path", model.control?.autoIteration?.repoPath || "")}${input("target", "Target generations", model.control?.autoIteration?.targetGenerations || 3, { type: "number", min: 1, max: 10 })}`],
    queue: ["Add dispatch item", `${input("title", "Short title", "", { required: true })}${input("objective", "Objective", "", { textarea: true, required: true })}${input("context", "Context", "", { textarea: true })}${input("constraints", "Constraints, one per line", "", { textarea: true })}${input("priority", "Priority", 50, { type: "number", min: 1, max: 100 })}<label><input type="checkbox" name="pin"> Pin and export as current idea</label>`],
    steer: ["Add steering", `${select("scope", "Scope", [["next_run", "Next run"], ["current_run", "Current run"]])}${select("priority", "Priority", [["required", "Required"], ["advisory", "Advisory"]])}${input("text", "Direction", "", { textarea: true, required: true })}`],
    blocker: ["Recover from blocker", `${select("blockerAction", "Action", [["advice", "Ask for recovery advice first"], ["deblock", "Queue my deblock prompt"]])}${input("prompt", "Focused recovery question or instruction", "", { textarea: true })}${input("runId", "Run identity", runId)}`],
    command: ["Operational command index", `${select("command", "Command", OPERATION_COMMANDS.map((command) => [command, command.replaceAll("-", " ")]))}${input("payload", "Payload (JSON object)", JSON.stringify({ reason: "Field operator command", runId }, null, 2), { textarea: true, help: "Advanced: inspect identities before review. Safe text only; no client command execution." })}`],
    assist: ["Planning assistance", `${select("assistAction", "Conversation", [["classic", "Start classic planning conversation"], ["managed", "Start managed planning conversation"], ...model.assistance.map((item) => [item.id, `${item.pipelineType} · ${item.messageCount} messages`])])}${input("message", "Planning message (optional when starting)", "", { textarea: true })}<label><input type="checkbox" name="createProposal"> Save the returned proposal as a new draft plan</label><p class="local-notice">Messages may go to the configured inference provider. Proposals do not approve, launch, or execute anything. Saving a proposal creates an editable draft only.</p>`],
    planEdit: ["Edit plan draft", input("content", "Full plan content (JSON)", JSON.stringify(planDetail?.revision?.content || {}, null, 2), { textarea: true })],
    planAction: [`${context.planAction?.replaceAll("-", " ") || "Plan"} exact revision`, `<input type="hidden" name="planAction" value="${esc(context.planAction || "")}">${["approve", "reject"].includes(context.planAction) ? input("notes", context.planAction === "reject" ? "Rejection notes (required)" : "Approval notes", "", { textarea: true, required: context.planAction === "reject" }) : ""}${context.planAction === "launch" ? input("confirmation", "Type LAUNCH to confirm the exact digest", "", { required: true }) : ""}<div class="local-notice"><b>${esc(planDetail?.revision?.content?.title || "Untitled plan")}</b><br>State ${esc(planDetail?.ledger?.state)} · revision ${esc(planDetail?.ledger?.currentRevision)}<br>${esc(planDetail?.ledger?.currentDigest)}</div>`]
  };
  const setup = setups[mode] || setups.command;
  title.textContent = setup[0];
  body.innerHTML = setup[1];
  $("#actionSheet").showModal();
  requestAnimationFrame(() => title.focus());
}

function formObject(form) {
  const result = Object.fromEntries(new FormData(form).entries());
  for (const checkbox of $$('input[type="checkbox"]', form)) result[checkbox.name] = checkbox.checked;
  return result;
}

function buildAction(data) {
  if (sheetMode === "next") {
    if (data.choice === "refresh") return { label: "Refresh all field data", local: "refresh" };
    if (data.choice === "pause") return { label: "Pause this device's live updates", local: "pause" };
    if (data.choice === "resume-live") return { label: "Refresh and resume this device's live updates", local: "resume" };
    if (data.choice === "blocker") return { label: "Continue to blocker recovery", local: "blocker" };
    return { label: `Send ${data.choice} command`, command: data.choice, payload: { reason: "Field operator action" } };
  }
  if (sheetMode === "gate") {
    if (data.gateAction === "add") return { label: `Add gate: ${data.description}`, command: "add-gate", payload: { id: data.gateId || undefined, description: data.description, requiredEvidence: lines(data.artifacts).join("\n") } };
    if (data.gateAction === "update") return { label: `Update gate ${data.gateId}`, command: "update-gate", payload: { gateId: data.gateId, description: data.description, requiredEvidence: lines(data.artifacts) } };
    if (data.gateAction === "attach") return { label: `Attach evidence to ${data.gateId}`, command: "attach-gate-evidence", payload: { gateId: data.gateId, runId: selectedRun(), artifacts: lines(data.artifacts), notes: data.notes } };
    const pass = data.gateAction === "pass";
    return { label: `${pass ? "Pass" : "Defer"} gate ${data.gateId}`, command: "gate-decision", payload: { gateId: data.gateId, runId: selectedRun(), status: pass ? "passed" : "needs-evidence", decision: pass ? "accepted" : "defer", evidenceArtifacts: lines(data.artifacts), notes: data.notes } };
  }
  if (sheetMode === "generation") {
    if (data.generationAction === "objective") return { label: "Replace current objective", command: "set-current-objective", payload: { text: data.objective, source: "field-guide", runId: selectedRun() } };
    if (data.generationAction === "target") return { label: `Set showcase target to ${data.target}`, command: "set-showcase-target", payload: { targetGenerations: Number(data.target) } };
    if (["pause-showcase-loop", "resume-showcase-loop", "stop-showcase-loop"].includes(data.generationAction)) return { label: data.generationAction.replaceAll("-", " "), command: data.generationAction, payload: { reason: "Field operator action" } };
    const payload = { runId: selectedRun(), repoPath: data.repoPath, objective: data.objective, targetGenerations: Number(data.target), changeText: "Complete one bounded objective-linked generation without unrelated feature or stack churn.", limits: iterationLimits(data.generationAction === "showcase" ? data.target : 1) };
    return data.generationAction === "showcase" ? { label: `Start ${data.target}-generation showcase loop`, command: "start-showcase-loop", payload: { ...payload, sourceRunId: selectedRun() } } : { label: "Start next bounded generation", command: "start-next-iteration", payload };
  }
  if (sheetMode === "queue") return { label: `Add queue item: ${data.title}`, command: "add-queue-item", payload: { ...data, priority: Number(data.priority), source: "field-guide" } };
  if (sheetMode === "steer") return { label: `Add ${data.priority} steering`, command: "steer", payload: data };
  if (sheetMode === "blocker") return { label: data.blockerAction === "advice" ? "Request advice without changing the run" : "Queue deblock steering", command: data.blockerAction === "advice" ? "deblock-advice" : "deblock", payload: { prompt: data.prompt, runId: data.runId || selectedRun() } };
  if (sheetMode === "command") {
    let payload;
    try { payload = JSON.parse(data.payload || "{}"); } catch { throw new Error("Payload must be a valid JSON object."); }
    if (!payload || Array.isArray(payload) || typeof payload !== "object") throw new Error("Payload must be a JSON object.");
    return { label: `Send operational command: ${data.command}`, command: data.command, payload };
  }
  if (sheetMode === "assist") return { label: data.assistAction.startsWith("assist-") ? "Continue planning conversation" : `Start ${data.assistAction} planning conversation`, assistance: data };
  if (sheetMode === "planEdit") {
    let content;
    try { content = JSON.parse(data.content); } catch { throw new Error("Plan content must be valid JSON."); }
    return { label: `Create revision ${planDetail.ledger.currentRevision + 1} and invalidate prior approval`, plan: "update", content };
  }
  if (sheetMode === "planAction") {
    if (data.planAction === "launch" && data.confirmation !== "LAUNCH") throw new Error("Type LAUNCH exactly to continue.");
    return { label: `${data.planAction} exact plan revision ${planDetail.ledger.currentRevision}`, planMutation: data.planAction, notes: data.notes || "", payload: { planId: planDetail.ledger.planId, revision: planDetail.ledger.currentRevision, planDigest: planDetail.ledger.currentDigest, notes: data.notes || "" } };
  }
  throw new Error("Unknown field action.");
}

async function executeAction(action) {
  if (action.local === "refresh") return client.refresh();
  if (action.local === "pause") return client.pause();
  if (action.local === "resume") return client.resume();
  if (action.local === "blocker") { $("#actionSheet").close(); openSheet("blocker"); return; }
  if (action.command) return client.command(action.command, action.payload, { refresh: true });
  if (action.assistance) {
    const choice = action.assistance.assistAction;
    assistanceDetail = choice.startsWith("assist-") ? await client.getPlanAssistance(choice) : await client.createPlanAssistance(choice);
    if (action.assistance.message) assistanceDetail = await client.messagePlanAssistance(assistanceDetail.id, assistanceDetail.version, action.assistance.message);
    if (action.assistance.createProposal && assistanceDetail.proposedContent) await client.createProjectPlan({ content: assistanceDetail.proposedContent }, { refresh: true });
    await client.listPlanAssistance();
    showAssistance();
    return;
  }
  if (action.plan === "update") {
    const planId = planDetail.ledger.planId;
    await client.updateProjectPlan({ planId, content: action.content }, { expectedVersion: planDetail.ledger.version, refresh: true });
    planDetail = await client.getProjectPlan(planId);
    renderAll();
    return;
  }
  if (action.planMutation) return executePlanMutation(action.planMutation, action.notes);
}

function showAssistance() {
  if (!assistanceDetail) return;
  const proposal = assistanceDetail.proposedContent;
  const transcript = (assistanceDetail.messages || []).map((message) => `${message.role.toUpperCase()} · ${when(message.createdAt)}\n${message.content}`).join("\n\n");
  openReader("Planning conversation", `${transcript || "No messages yet."}${proposal ? `\n\nPROPOSED PLAN\n${JSON.stringify(proposal, null, 2)}` : ""}`);
}

function openReader(title, content) {
  $("#readerTitle").textContent = title;
  $("#readerBody").textContent = content;
  $("#reader").showModal();
  requestAnimationFrame(() => $("#readerTitle").focus());
}

function defaultPlan(pipelineType) {
  return { pipelineType, title: "", problem: "", intendedUsers: "", objective: "", boundedScope: "", requirements: [], nonGoals: [], constraints: [], risks: [], repository: { path: null, baseRef: null, baseCommit: null }, acceptanceGates: [], validationPolicy: { id: "apb.runner-selected.v1", expectations: [], clientCommandsAllowed: false }, milestones: [], limits: { maxIterations: 1, maxVariantsPerIteration: 3, maxParallelVariants: 3, maxAcceptedFeatures: 4, maxVisualMotifChanges: 1, maxNewSections: 1, stopAfterNoImprovement: 1 }, lineage: { mode: "new", sourcePlanId: null, sourceRevision: null, sourceRunId: null, sourceIterationId: null } };
}

async function selectPlan(id) {
  planDetail = id ? await client.getProjectPlan(id) : null;
  renderPlans();
}

async function executePlanMutation(type, notes = "") {
  if (!planDetail) return;
  const { ledger, revision } = planDetail;
  const subject = { planId: ledger.planId, revision: ledger.currentRevision, planDigest: ledger.currentDigest };
  let result;
  if (["clone", "fork"].includes(type)) {
    result = await client[`${type}ProjectPlan`]({ ...subject, sourceRunId: selectedRun(), sourceIterationId: model.selectedIterationId || null, baseRef: revision.content.repository.baseRef }, { expectedVersion: ledger.version, refresh: true });
  } else if (type === "review") await client.submitProjectPlanForReview(subject, { expectedVersion: ledger.version, refresh: true });
  else if (type === "approve") await client.approveProjectPlan({ ...subject, notes }, { expectedVersion: ledger.version, refresh: true });
  else if (type === "reject") await client.rejectProjectPlan({ ...subject, notes }, { expectedVersion: ledger.version, refresh: true });
  else if (type === "launch") await client.launchProjectPlan(subject, { expectedVersion: ledger.version, refresh: true });
  else if (type === "archive") await client.archiveProjectPlan({ planId: ledger.planId }, { expectedVersion: ledger.version, refresh: true });
  await client.refreshPlans();
  planDetail = await client.getProjectPlan(result?.planId || ledger.planId).catch(() => null);
  renderAll();
  if (planDetail) $("#planSelect").value = planDetail.ledger.planId;
  toast(`Plan action ${type} completed.`);
}

function planAction(type) {
  if (type === "edit") openSheet("planEdit");
  else openSheet("planAction", { planAction: type });
}

function navigate(page) {
  $$("[data-nav]").forEach((button) => { const active = button.dataset.nav === page; button.classList.toggle("active", active); if (active) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current"); });
  $$(".leaf").forEach((leaf) => leaf.classList.toggle("active", leaf.dataset.page === page));
  const target = $(`#${CSS.escape(page)}`);
  if (matchMedia("(max-width:1099px)").matches) target.scrollIntoView({ block: "start" });
  const heading = target.querySelector("h2");
  heading?.setAttribute("tabindex", "-1");
  heading?.focus({ preventScroll: true });
}

client.subscribe((snapshot) => { model = snapshot; renderAll(); });

$("#sheetForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) return;
  const errorNode = $("#sheetError");
  try {
    if (!pendingAction) {
      if (!event.currentTarget.reportValidity()) return;
      pendingAction = buildAction(formObject(event.currentTarget));
      const payload = pendingAction.payload || pendingAction.content || pendingAction.assistance || {};
      $("#sheetReview").textContent = `${pendingAction.label}\n\nReview exact details:\n${JSON.stringify(payload, null, 2)}\n\nNothing has been sent yet.`;
      $("#sheetReview").hidden = false;
      $("#sheetSubmit").textContent = "Confirm and send";
      $("#sheetCancel").focus();
      return;
    }
    busy = true;
    $("#sheetSubmit").disabled = true;
    await executeAction(pendingAction);
    if ($("#actionSheet").open) $("#actionSheet").close();
    toast("Action completed and field copy refreshed.");
  } catch (error) {
    errorNode.textContent = report(error);
    errorNode.hidden = false;
    pendingAction = null;
    $("#sheetReview").hidden = true;
    $("#sheetSubmit").textContent = "Review action";
  } finally {
    busy = false;
    $("#sheetSubmit").disabled = false;
  }
});

$("#actionSheet").addEventListener("close", () => { pendingAction = null; if (sheetInvoker?.isConnected) sheetInvoker.focus(); });
$("#reader").addEventListener("close", () => { if (sheetInvoker?.isConnected) sheetInvoker.focus(); });
$("#reader").addEventListener("cancel", () => {});

document.addEventListener("click", async (event) => {
  const nav = event.target.closest("[data-nav]");
  if (nav) return navigate(nav.dataset.nav);
  const opener = event.target.closest("[data-open-sheet]");
  if (opener) return openSheet(opener.dataset.openSheet, { gateId: opener.dataset.gateId });
  if (event.target.closest("[data-close-sheet]")) return $("#actionSheet").close();
  const gate = event.target.closest("[data-gate-id]");
  if (gate) return openSheet("gate", { gateId: gate.dataset.gateId });
  if (event.target.closest("[data-close-reader]")) return $("#reader").close();
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action === "refresh") { try { await client.refresh(); toast("Field copy refreshed."); } catch (error) { report(error); } return; }
  const contact = event.target.closest("[data-contact]")?.dataset.contact;
  if (contact) { $("#eventAgentFilter").value = contact; renderCrew(); $("#eventHeading").scrollIntoView(); return; }
  const resource = event.target.closest("[data-resource-kind]");
  if (resource) {
    try { const result = resource.dataset.resourceKind === "artifact" ? await client.loadArtifact(resource.dataset.resourceName) : await client.loadLog(resource.dataset.resourceName); openReader(resource.dataset.resourceName, result.text); } catch (error) { report(error); }
    return;
  }
  const documentKind = event.target.closest("[data-document]")?.dataset.document;
  if (documentKind) { try { const result = await client.loadDocument(documentKind); openReader(result.name, result.text); } catch (error) { report(error); } return; }
  const noteId = event.target.closest("[data-delete-note]")?.dataset.deleteNote;
  if (noteId) { localStorage.setItem("swarm-field-guide.journal.v1", JSON.stringify(journalEntries().filter((entry) => entry.id !== noteId))); renderJournal(); return; }
  const newPlan = event.target.closest("[data-plan-new]")?.dataset.planNew;
  if (newPlan) { try { const result = await client.createProjectPlan({ content: defaultPlan(newPlan) }, { refresh: true }); await client.refreshPlans(); $("#planSelect").value = result.planId; await selectPlan(result.planId); toast("Draft created. Edit it before review."); } catch (error) { report(error); } return; }
  const planType = event.target.closest("[data-plan-action]")?.dataset.planAction;
  if (planType) { try { await planAction(planType); } catch (error) { report(error); } return; }
  const queueButton = event.target.closest("[data-queue-action]");
  if (queueButton) {
    const item = model.queue?.items?.find((candidate) => candidate.id === queueButton.dataset.id);
    const map = { pin: ["pin-queue-item", { id: item.id }], archive: ["archive-queue-item", { id: item.id }], use: ["start-next-iteration", { queueItemId: item.id, repoPath: item.target?.preferredRepo, objective: item.objective, changeText: item.context || `Complete one bounded generation for ${item.title}.`, acceptanceGateIds: item.acceptanceGateIds || [], limits: iterationLimits() }] };
    try { await client.command(...map[queueButton.dataset.queueAction], { refresh: true }); toast("Queue action completed."); } catch (error) { report(error); }
    return;
  }
  const iteration = event.target.closest("[data-iteration-action]");
  if (iteration) {
    const item = model.iterations.find((candidate) => candidate.id === iteration.dataset.iterationId) || {};
    const type = { continue: "continue-from-iteration", fork: "fork-from-iteration", direction: "use-as-next-direction" }[iteration.dataset.iterationAction];
    try { await client.command(type, { sourceIterationId: item.id, sourceRunId: item.runId, runId: item.runId, repoPath: item.repoPath, objective: item.objective, baseRef: item.commit || "HEAD", changeText: `Continue the bounded direction from ${item.id}.`, limits: iterationLimits() }, { refresh: true }); toast("Iteration direction queued."); } catch (error) { report(error); }
    return;
  }
  const iterationInspect = event.target.closest("[data-iteration-inspect]")?.dataset.iterationInspect;
  if (iterationInspect) { try { await client.selectIteration(iterationInspect); renderIndex(); $("#iterationDetail").scrollIntoView({ block: "nearest" }); } catch (error) { report(error); } return; }
  const steering = event.target.closest("[data-remove-steering]")?.dataset.removeSteering;
  if (steering) { try { await client.command("remove-steering", { id: steering }, { refresh: true }); } catch (error) { report(error); } return; }
  const advice = event.target.closest("[data-advice]");
  if (advice) { try { await client.command(`${advice.dataset.advice}-deblock-advice`, { adviceId: advice.dataset.id }, { refresh: true }); toast(`Advice ${advice.dataset.advice}d.`); } catch (error) { report(error); } }
});

$("#journalForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = formObject(event.currentTarget);
  const entries = [{ id: crypto.randomUUID?.() || String(Date.now()), createdAt: new Date().toISOString(), note: data.note, artifacts: lines(data.artifacts), runId: selectedRun() }, ...journalEntries()].slice(0, 100);
  localStorage.setItem("swarm-field-guide.journal.v1", JSON.stringify(entries));
  event.currentTarget.reset();
  renderJournal();
  toast("Field note saved on this device only.");
});

for (const selector of ["#agentFilter", "#runFilter", "#eventAgentFilter", "#eventTypeFilter", "#eventSearch"]) $(selector).addEventListener("input", renderCrew);
$("#resourceRun").addEventListener("change", async (event) => { try { await client.selectRun(event.target.value); } catch (error) { report(error); } });
$("#planSelect").addEventListener("change", async (event) => { try { await selectPlan(event.target.value); } catch (error) { report(error); } });
$("#streamToggle").addEventListener("click", () => model.connection.paused ? client.resume().catch(report) : client.pause());
$("#connectionToggle").addEventListener("click", () => model.connection.status === "disconnected" ? client.connect().catch(report) : client.disconnect());
window.addEventListener("online", () => { renderConnection(); client.resume().catch(report); });
window.addEventListener("offline", renderConnection);

if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("./sw.js").catch(() => {});
Promise.all([client.connect(), client.listPlanAssistance()]).catch(report);
