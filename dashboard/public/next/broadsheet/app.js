import { createDashboardClient, WORKFLOW_PHASES } from "../../headless-dashboard-client.js";

const client = createDashboardClient({ maxEvents: 1000, eventLimit: 500, pollIntervalMs: 4000 });
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const text = (value, fallback = "Not reported") => String(value ?? "").trim() || fallback;
const list = (value) => String(value ?? "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
const validDate = (value) => { const result = value ? new Date(value) : null; return result && !Number.isNaN(result.valueOf()) ? result : null; };
const date = (value, options) => { const result = validDate(value); return result ? new Intl.DateTimeFormat(undefined, options || { dateStyle: "medium", timeStyle: "short" }).format(result) : "Unfiled"; };
const time = (value) => { const result = validDate(value); return result ? new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(result) : "--:--"; };
const json = (value) => JSON.stringify(value, null, 2);
const id = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const statusClass = (value) => String(value || "idle").toLowerCase().replace(/[^a-z0-9-]/g, "-");
const clip = (value, length = 240) => { const copy = text(value, ""); return copy.length > length ? `${copy.slice(0, length)}...` : copy; };

let model = client.getSnapshot();
let selectedAgent = "";
let deskTab = "controls";
let planTab = "ledger";
let selectedPlanId = "";
let planDetail = null;
let planRevision = null;
let selectedAssistanceId = "";
let assistanceDetail = null;
let noticeTimer = 0;
let confirmWork = null;
const dialogOpeners = new WeakMap();

function notify(message, error = false) {
  const node = $("#notices");
  node.textContent = message;
  node.className = `notices show${error ? " error" : ""}`;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { node.className = "notices"; }, 5000);
}

function failure(error) {
  const details = Array.isArray(error?.details) ? `: ${error.details.join("; ")}` : "";
  notify(`${error?.message || error || "The operation failed"}${details}`, true);
}

function objective() {
  const pinned = (model.queue?.items || []).find((item) => item.id === model.control?.pinnedQueueItemId);
  return model.control?.currentObjective?.text || pinned?.objective || model.state?.task || model.state?.currentTask || model.state?.currentProject || "No objective has been filed";
}

function blocker() {
  return model.state?.block || model.state?.blocker || model.state?.hold || (model.control?.pause?.requested ? model.control.pause : null) || (model.control?.stop?.requested ? model.control.stop : null);
}

function agents() {
  const raw = model.state?.agents || [];
  const values = Array.isArray(raw) ? raw : Object.values(raw);
  const found = new Map();
  for (const item of values) {
    const agentId = item.id || item.label || item.role || "agent";
    found.set(agentId, { ...item, id: agentId, label: item.label || item.role || agentId });
  }
  for (const event of model.events) {
    const agentId = event.agentId || event.data?.agentId;
    if (!agentId || found.has(agentId) || agentId === "system") continue;
    found.set(agentId, { id: agentId, label: agentId, role: "wire correspondent", status: "seen", currentTask: event.message, lastMessage: event.message, updatedAt: event.ts });
  }
  if (!found.size || !found.has("orchestrator")) found.set("orchestrator", { id: "orchestrator", label: "Main Orchestrator", role: "editor in chief", status: model.state?.status || "idle", currentTask: model.state?.currentTask || model.state?.task, lastMessage: model.state?.lastAction, updatedAt: model.state?.updatedAt });
  return [...found.values()];
}

function renderMasthead() {
  const connection = model.connection || {};
  const connectionNode = $("#connectionState");
  connectionNode.textContent = connection.paused ? "Stream paused" : `${text(connection.status, "Connecting")} ${connection.transport ? `via ${connection.transport}` : ""}`;
  connectionNode.classList.toggle("paused", connection.paused);
  $("#pauseStream").textContent = connection.paused ? "Resume stream" : "Pause stream";
  $("#dateline").textContent = new Intl.DateTimeFormat(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(new Date());
  $("#editionStamp").textContent = `Updated ${time(model.state?.updatedAt || connection.lastMessageAt || connection.lastRefreshAt)}`;
  $("#runCount").textContent = `${model.runs.length} edition${model.runs.length === 1 ? "" : "s"}`;
}

function renderLead() {
  const state = model.state || {};
  const currentBlocker = blocker();
  $("#objectiveHeadline").textContent = objective();
  $("#leadDeck").textContent = state.lastAction || state.currentTask || state.task || "Awaiting the next operational dispatch.";
  $("#leadFacts").innerHTML = [
    `Status: ${text(state.status || state.phase, "idle")}`,
    `Run: ${text(state.currentRunId, "none")}`,
    `Phase: ${text(state.phase, "idle")}`,
    `Agents reporting: ${agents().length}`,
    `Queue: ${(model.queue?.items || []).filter((item) => item.status !== "archived").length}`
  ].map((item) => `<span>${esc(item)}</span>`).join("");
  const breaking = $("#breaking");
  if (currentBlocker) {
    breaking.hidden = false;
    breaking.innerHTML = `<b>Breaking: ${esc(state.status === "blocked" ? "Run blocked" : "Interruption")}</b><p>${esc(currentBlocker.reason || currentBlocker.message || currentBlocker.text || "Operator attention is required.")}</p> <button type="button" data-open-dialog="deskDialog">Respond at Mission Control</button>`;
  } else breaking.hidden = true;
  const current = WORKFLOW_PHASES.indexOf(state.phase || state.status);
  $("#workflow").innerHTML = WORKFLOW_PHASES.map((phase, index) => `<span class="${index < current ? "past" : index === current ? "current" : ""}"${index === current ? ' aria-current="step"' : ""}>${esc(phase)}</span>`).join("");
}

function renderEditions() {
  const selected = model.selectedRunId || model.state?.currentRunId;
  $("#editionList").innerHTML = model.runs.length ? model.runs.map((run, index) => `
    <article class="edition">
      <div class="meta">Edition ${String(index + 1).padStart(2, "0")} / ${esc(run.status || "unknown")} / ${esc(date(run.startedAt))}</div>
      <button type="button" data-select-run="${esc(run.id)}" aria-pressed="${run.id === selected}">
        <h3>${esc(run.selectedProject || run.project || run.id)}</h3>
        <p>${esc(run.id)}${run.id === model.state?.currentRunId ? " / current edition" : ""}</p>
      </button>
      <p>${esc(clip(run.task || run.objective || run.lastAction || `A ${run.status || "recorded"} operational run.`))}</p>
    </article>`).join("") : '<p class="empty">No run editions have reached the archive.</p>';
}

function renderAgents() {
  const values = agents();
  if (!selectedAgent) selectedAgent = values[0]?.id || "";
  $("#agentColumns").innerHTML = values.map((agent) => {
    const events = model.events.filter((event) => event.agentId === agent.id || event.source === agent.id).slice(-4).reverse();
    return `<details class="agent-dispatch" ${agent.id === selectedAgent ? "open" : ""}>
      <summary><span class="status-mark ${statusClass(agent.status)}"></span><h3>${esc(agent.label)}</h3><p class="byline">By ${esc(agent.role || "swarm correspondent")} / ${esc(agent.status || "idle")}</p></summary>
      <p class="copy">${esc(agent.currentTask || agent.lastMessage || "This correspondent has not filed a dispatch.")}</p>
      <p class="meta">Desk: ${esc(agent.currentPhase || model.state?.phase || "unassigned")} / filed ${esc(date(agent.updatedAt))}</p>
      <button type="button" data-select-agent="${esc(agent.id)}">Select correspondent</button>
      ${events.length ? `<ol>${events.map((event) => `<li>${esc(time(event.ts))}: ${esc(event.message || event.type)}</li>`).join("")}</ol>` : ""}
    </details>`;
  }).join("");
}

function renderDeskBrief() {
  const control = model.control || {};
  const pendingAdvice = (control.deblockAdvice || []).filter((item) => item.status === "pending").length;
  const pendingGates = (model.gates?.gates || []).filter((gate) => !["passed", "approved"].includes(gate.status)).length;
  $("#deskBrief").innerHTML = `<p>${esc(blocker() ? "The desk is convened around an active interruption." : "The desk is open for bounded operator decisions.")}</p><ul><li>${(control.activeSteering || []).length} active steering directives</li><li>${(model.queue?.items || []).filter((item) => item.status !== "archived").length} queue briefs</li><li>${pendingGates} unresolved gates</li><li>${pendingAdvice} advice decision${pendingAdvice === 1 ? "" : "s"} awaiting review</li></ul>`;
}

function resourceName(item) { return typeof item === "string" ? item : item?.name || item?.path || item?.id || "unnamed record"; }

function renderSources() {
  const runSelect = $("#runSelect");
  runSelect.innerHTML = `<option value="">No run</option>${model.runs.map((run) => `<option value="${esc(run.id)}" ${run.id === model.selectedRunId ? "selected" : ""}>${esc(run.id)}</option>`).join("")}`;
  const iterationSelect = $("#iterationSelect");
  iterationSelect.innerHTML = `<option value="">No iteration</option>${model.iterations.map((item) => `<option value="${esc(item.id)}" ${item.id === model.selectedIterationId ? "selected" : ""}>${esc(item.generation ? `Generation ${item.generation}: ` : "")}${esc(item.objective || item.id)}</option>`).join("")}`;
  const records = [
    ...(model.selectedRun?.run ? [{ kind: "run", name: `Run record: ${model.selectedRunId}`, item: model.selectedRun.run }] : []),
    ...(model.selectedRun?.artifacts || []).map((item) => ({ kind: "artifact", name: resourceName(item), item })),
    ...(model.selectedRun?.logs || []).map((item) => ({ kind: "log", name: resourceName(item), item })),
    ...(model.iterationDetail ? [{ kind: "iteration", name: `Iteration ${model.iterationDetail.id || model.selectedIterationId}`, item: model.iterationDetail }] : [])
  ];
  $("#sourceFolios").innerHTML = records.length ? records.map((record, index) => `<article class="folio"><span class="folio-no">${index + 1}</span><div class="meta">${esc(record.kind)} / ${esc(model.selectedRunId || "current")}</div><h3><button type="button" data-source-kind="${esc(record.kind)}" data-source-name="${esc(record.name)}">${esc(record.name)}</button></h3>${record.kind === "iteration" ? `<div class="action-row"><button data-iteration-action="continue-from-iteration">Continue</button><button data-iteration-action="fork-from-iteration">Fork</button><button data-iteration-action="use-as-next-direction">Use as next direction</button></div>` : ""}</article>`).join("") : '<p class="empty">Select a run edition to inspect its documents, artifacts, and logs.</p>';
}

function toolEvent(event) {
  return String(event.type).startsWith("tool-call") || event.data?.toolName || event.data?.toolCallId || /\b(tool|terminal|patch|read_file|write_file)\b/i.test(event.message || "");
}

function renderWire() {
  const data = new FormData($("#wireFilter"));
  const query = String(data.get("query") || "").toLowerCase();
  const kind = String(data.get("kind") || "all");
  const visible = model.events.filter((event) => {
    if (kind === "tools" && !toolEvent(event)) return false;
    if (kind === "errors" && event.level !== "error" && !String(event.type).includes("error")) return false;
    if (kind === "events" && toolEvent(event)) return false;
    return !query || json(event).toLowerCase().includes(query);
  }).slice(-300);
  const wire = $("#wireList");
  wire.innerHTML = visible.length ? visible.map((event) => `<li class="wire-item ${event.level === "error" ? "error" : ""}"><span class="wire-meta">${esc(time(event.ts))}</span><span>${esc(event.source)}</span><span>${esc(event.data?.toolName || event.type)}</span><span>${esc(event.message || event.data?.action || "Dispatch received")}</span><details><summary>Read raw dispatch</summary><pre class="raw">${esc(json(event.raw || event))}</pre></details></li>`).join("") : '<li class="empty">No wire reports match this search.</li>';
  if ($("#followWire").checked) requestAnimationFrame(() => { wire.scrollTop = wire.scrollHeight; });
}

function renderAll() {
  renderMasthead(); renderLead(); renderEditions(); renderAgents(); renderDeskBrief(); renderSources(); renderWire();
}

async function runCommand(type, payload = {}, message = `${type} accepted`) {
  try { await client.command(type, payload, { refresh: true }); notify(message); renderDesk(); }
  catch (error) { failure(error); }
}

function confirmDecision(title, message, work) {
  $("#confirmTitle").textContent = title;
  $("#confirmText").textContent = message;
  confirmWork = work;
  dialogOpeners.set($("#confirmDialog"), document.activeElement);
  $("#confirmDialog").showModal();
  $("#confirmTitle").focus();
}

function renderDesk() {
  const control = model.control || {};
  const items = model.queue?.items || [];
  const gates = model.gates?.gates || [];
  const target = Math.min(10, Math.max(1, Number(control.autoIteration?.targetGenerations || 10)));
  const tabs = {
    controls: `<div class="desk-grid"><section><h3>Run authority</h3><p>Commands take effect immediately or at the runner's next safe checkpoint.</p><div class="action-row"><button data-command="pause">Pause</button><button data-command="resume">Resume</button><button data-command="hold">Hold new runs</button><button data-command="unhold">Release hold</button><button data-command="run-now">Run now</button><button class="danger" data-confirm-command="stop">Stop run</button></div></section><section><h3>Showcase press</h3><p>${esc(control.autoIteration?.enabled ? `Running generation ${control.autoIteration.currentGeneration || 1} of ${target}` : "The showcase loop is not running.")}</p><label>Generation target <input id="showcaseTarget" type="number" min="1" max="10" value="${target}"></label><div class="action-row"><button data-showcase="start">Start showcase loop</button><button data-command="pause-showcase-loop">Pause loop</button><button data-command="resume-showcase-loop">Resume loop</button><button class="danger" data-confirm-command="stop-showcase-loop">Stop loop</button><button data-set-target>Set target</button><button data-next-generation>Start next generation</button></div></section></div>`,
    steering: `<div class="desk-grid"><section><h3>Set the headline</h3><form id="objectiveForm" class="field-grid"><label class="wide">Current objective<textarea name="text" required maxlength="8000">${esc(objective())}</textarea></label><button>Publish objective</button></form></section><section><h3>File steering</h3><form id="steerForm" class="field-grid"><label class="wide">Directive<textarea name="text" required maxlength="8000"></textarea></label><label>Scope<select name="scope"><option value="next_run">Next run</option><option value="current_run">Current run</option><option value="queue">Queue</option></select></label><label>Priority<select name="priority"><option value="required">Required</option><option value="advisory">Advisory</option></select></label><button>File directive</button></form></section><section><h3>Active directives</h3>${(control.activeSteering || []).map((item) => `<article class="decision-record"><b>${esc(item.priority)} / ${esc(item.scope)}</b><p>${esc(item.text)}</p><button data-remove-steering="${esc(item.id)}">Withdraw directive</button></article>`).join("") || '<p class="empty">No active steering.</p>'}</section><section><h3>Deblock desk</h3><p>${esc(blocker()?.reason || blocker()?.message || "No blocker is currently reported.")}</p><form id="deblockForm"><label>Recovery instruction<textarea name="prompt" maxlength="8000"></textarea></label><div class="action-row"><button>Send deblock instruction</button><button type="button" data-advice>Ask for advice</button></div></form>${(control.deblockAdvice || []).filter((item) => item.status === "pending").map((item) => `<article class="decision-record"><b>Advice awaiting decision</b><p>${esc(item.answer)}</p><button data-advice-decision="approve" data-advice-id="${esc(item.id)}">Approve advice</button> <button data-advice-decision="deny" data-advice-id="${esc(item.id)}">Deny advice</button></article>`).join("")}</section></div>`,
    queue: `<div class="desk-grid"><section><h3>Add a brief</h3><form id="queueForm" class="field-grid"><label>Title<input name="title" required maxlength="200"></label><label>Priority<input name="priority" type="number" min="1" max="100" value="50"></label><label class="wide">Objective<textarea name="objective" required></textarea></label><label>Context<textarea name="context"></textarea></label><label>Constraints, one per line<textarea name="constraints"></textarea></label><label><input name="pin" type="checkbox"> Pin as current direction</label><button>Add to queue</button></form><button class="danger" data-clear-queue>Clear entire queue</button></section><section><h3>Filed briefs</h3>${items.map((item) => `<article class="queue-record"><div class="meta">${esc(item.status)} / priority ${esc(item.priority)} / ${esc(item.id)}</div><h4>${esc(item.title)}</h4><p>${esc(item.objective)}</p><div class="action-row"><button data-pin-queue="${esc(item.id)}">Pin direction</button><button data-run-queue="${esc(item.id)}">Start generation</button><button data-archive-queue="${esc(item.id)}">Archive</button></div></article>`).join("") || '<p class="empty">The queue is empty.</p>'}</section></div>`,
    gates: `<div class="desk-grid"><section><h3>Add acceptance gate</h3><form id="gateForm" class="field-grid"><label>Gate id<input name="id" pattern="[A-Za-z0-9._-]+"></label><label>Phase<input name="phase" value="final-audit"></label><label>Severity<select name="severity"><option value="must">Must</option><option value="should">Should</option></select></label><label class="wide">Description<textarea name="description" required></textarea></label><label class="wide">Required evidence, one path per line<textarea name="requiredEvidence"></textarea></label><button>Add gate</button></form></section><section><h3>Decision book</h3>${gates.map((gate) => `<details class="gate-record"><summary><b>${esc(gate.id)}</b> / ${esc(gate.status || "pending")} / ${esc(gate.severity)}</summary><p>${esc(gate.description || gate.title)}</p><div class="action-row"><button data-gate-decision="passed" data-gate-id="${esc(gate.id)}">Pass gate</button><button data-gate-decision="needs-evidence" data-gate-id="${esc(gate.id)}">Request evidence</button></div><form data-update-gate-form="${esc(gate.id)}"><label>Description<textarea name="description">${esc(gate.description || gate.title || "")}</textarea></label><label>Severity<select name="severity"><option value="must"${gate.severity === "must" ? " selected" : ""}>Must</option><option value="should"${gate.severity === "should" ? " selected" : ""}>Should</option></select></label><label>Status<select name="status">${["pending", "passed", "failed", "needs-evidence"].map((status) => `<option value="${status}"${status === gate.status ? " selected" : ""}>${status}</option>`).join("")}</select></label><label>Required evidence, one path per line<textarea name="requiredEvidence">${esc((gate.requiredEvidence || []).join("\n"))}</textarea></label><button>Update gate</button></form><form data-evidence-form="${esc(gate.id)}"><label>Evidence paths, one per line<textarea name="artifacts"></textarea></label><label>Notes<textarea name="notes"></textarea></label><button>Attach evidence</button></form></details>`).join("") || '<p class="empty">No gates have been filed.</p>'}</section></div>`
  };
  $("#deskContent").innerHTML = tabs[deskTab];
  $$('[data-desk-tab]').forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.deskTab === deskTab)));
}

function planDefaults(pipelineType) {
  return { pipelineType, title: "", problem: "", intendedUsers: "", objective: "", boundedScope: "", requirements: [], nonGoals: [], constraints: [], risks: [], repository: { path: null, baseRef: null, baseCommit: null }, acceptanceGates: [], validationPolicy: { id: "apb.runner-selected.v1", expectations: [], clientCommandsAllowed: false }, milestones: [], limits: { maxIterations: 1, maxVariantsPerIteration: 3, maxParallelVariants: 3, maxAcceptedFeatures: 4, maxVisualMotifChanges: 1, maxNewSections: 1, stopAfterNoImprovement: 1 }, lineage: { mode: "new", sourcePlanId: null, sourceRevision: null, sourceRunId: null, sourceIterationId: null } };
}

function planFields(content) {
  const gates = (content.acceptanceGates || []).map((gate) => `${gate.id} | ${gate.description} | ${gate.severity} | ${(gate.requiredEvidence || []).join(", ")}`).join("\n");
  return `<form id="planForm" class="plan-form"><section class="plan-section"><h3>Project</h3><label>Pipeline<select name="pipelineType"><option value="classic" ${content.pipelineType === "classic" ? "selected" : ""}>Classic</option><option value="managed" ${content.pipelineType === "managed" ? "selected" : ""}>Managed</option></select></label><label>Title<input name="title" value="${esc(content.title)}"></label><label>Problem<textarea name="problem">${esc(content.problem)}</textarea></label><label>Intended users<textarea name="intendedUsers">${esc(content.intendedUsers)}</textarea></label><label>Objective<textarea name="objective">${esc(content.objective)}</textarea></label><label>Bounded scope<textarea name="boundedScope">${esc(content.boundedScope)}</textarea></label></section><section class="plan-section"><h3>Boundaries</h3>${["requirements", "nonGoals", "constraints", "risks", "milestones"].map((name) => `<label>${esc(name)}, one per line<textarea name="${name}">${esc((content[name] || []).join("\n"))}</textarea></label>`).join("")}</section><section class="plan-section"><h3>Repository &amp; evidence</h3><label>Repository path<input name="repositoryPath" value="${esc(content.repository?.path || "")}"></label><label>Base ref<input name="baseRef" value="${esc(content.repository?.baseRef || "")}"></label><label class="wide">Acceptance gates: id | description | must/should | evidence paths<textarea name="acceptanceGates">${esc(gates)}</textarea></label><label class="wide">Validation expectations, one per line<textarea name="validationExpectations">${esc((content.validationPolicy?.expectations || []).join("\n"))}</textarea></label></section><section class="plan-section"><h3>Limits</h3>${Object.entries(content.limits || {}).map(([name, value]) => `<label>${esc(name)}<input name="${esc(name)}" type="number" min="0" value="${esc(value)}"></label>`).join("")}<div class="plan-actions"><button>Save new revision</button></div></section></form>`;
}

function collectPlan(form) {
  const data = new FormData(form);
  const old = planDetail.revision.content;
  const pipelineType = String(data.get("pipelineType"));
  const acceptanceGates = list(data.get("acceptanceGates")).map((row, index) => { const [gateId, description, severity = "must", evidence = ""] = row.split("|").map((part) => part.trim()); const requiredEvidence = evidence.split(",").map((part) => part.trim()).filter(Boolean); return { id: gateId || `gate-${index + 1}`, description, severity, required: !!requiredEvidence.length, requiredEvidence }; });
  const limits = Object.fromEntries(Object.keys(old.limits).map((name) => [name, Number(data.get(name))]));
  return { ...old, pipelineType, title: String(data.get("title") || ""), problem: String(data.get("problem") || ""), intendedUsers: String(data.get("intendedUsers") || ""), objective: String(data.get("objective") || ""), boundedScope: String(data.get("boundedScope") || ""), requirements: list(data.get("requirements")), nonGoals: list(data.get("nonGoals")), constraints: list(data.get("constraints")), risks: list(data.get("risks")), milestones: list(data.get("milestones")), repository: pipelineType === "managed" ? { path: String(data.get("repositoryPath") || "") || null, baseRef: String(data.get("baseRef") || "") || null, baseCommit: null } : { path: null, baseRef: null, baseCommit: null }, acceptanceGates, validationPolicy: { id: "apb.runner-selected.v1", expectations: list(data.get("validationExpectations")), clientCommandsAllowed: false }, limits };
}

async function loadPlan(planId) {
  selectedPlanId = planId;
  planRevision = null;
  try { planDetail = await client.getProjectPlan(planId); planTab = "editor"; renderPlan(); }
  catch (error) { failure(error); }
}

function renderPlan() {
  const plans = model.plans || [];
  const ledger = planDetail?.ledger;
  const revision = planDetail?.revision;
  let body = "";
  if (planTab === "ledger") body = `<div class="action-row"><button data-new-plan="classic">New classic plan</button><button data-new-plan="managed">New managed plan</button></div><div class="plan-list">${plans.map((plan) => `<button class="plan-row" data-select-plan="${esc(plan.planId)}" aria-current="${plan.planId === selectedPlanId}"><strong>${esc(plan.title || "Untitled plan")}</strong><small>${esc(plan.pipelineType)} / ${esc(plan.state)} / revision ${esc(plan.currentRevision)}</small><small>${esc(date(plan.updatedAt))}</small></button>`).join("") || '<p class="empty">No persisted plans.</p>'}</div>`;
  if (planTab === "editor") body = revision ? planFields(revision.content) : '<p class="empty">Select or create a plan from the ledger.</p>';
  if (planTab === "review") body = revision ? `<div class="desk-grid"><section><h3>Immutable revision ${esc(revision.revision)}</h3><div class="meta">${esc(ledger.state)} / digest ${esc(revision.contentDigest)}</div><pre class="review-copy">${esc(json(revision.content))}</pre><h3>Revision archive</h3><div class="action-row">${(planDetail.revisions || []).map((item) => `<button data-plan-revision="${esc(item.revision)}">Revision ${esc(item.revision)}</button>`).join("")}</div>${planRevision ? `<pre class="review-copy">${esc(json(planRevision))}</pre>` : ""}</section><section><h3>Lifecycle decisions</h3><label>Decision notes<textarea id="decisionNotes"></textarea></label><div class="action-row"><button data-plan-action="ready" ${ledger.state !== "draft" ? "disabled" : ""}>Ready for review</button><button data-plan-action="approve" ${ledger.state !== "ready-for-review" ? "disabled" : ""}>Approve exact revision</button><button data-plan-action="reject" ${!["ready-for-review", "approved"].includes(ledger.state) ? "disabled" : ""}>Reject</button><button class="danger" data-plan-action="launch" ${ledger.state !== "approved" ? "disabled" : ""}>Launch approved plan</button></div><h3>Lineage &amp; archive</h3><div class="action-row"><button data-plan-action="clone">Clone plan</button><button data-plan-action="fork">Fork plan</button><button data-plan-action="archive" ${ledger.activeLaunchId ? "disabled" : ""}>Archive plan</button></div>${(planDetail.decisions || []).map((decision) => `<article class="decision-record"><b>${esc(decision.decision)}</b> / ${esc(date(decision.decidedAt))}<p>${esc(decision.notes || "No notes")}</p></article>`).join("")}</section></div>` : '<p class="empty">Select a plan before review.</p>';
  if (planTab === "assist") body = renderAssistance();
  $("#planContent").innerHTML = body;
  $("#planStatus").textContent = ledger ? `${ledger.state} / revision ${ledger.currentRevision}` : `${plans.length} plans`;
  $$('[data-plan-tab]').forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.planTab === planTab)));
}

function renderAssistance() {
  if (!assistanceDetail) return `<p>Planning assistance is advisory. It cannot save, approve, launch, or execute a plan.</p><div class="action-row"><button data-new-assistance="classic">Start classic conversation</button><button data-new-assistance="managed">Start managed conversation</button></div><h3>Resume a conversation</h3>${(model.assistance || []).map((item) => `<button class="plan-row" data-select-assistance="${esc(item.id)}"><strong>${esc(item.pipelineType)} conversation</strong><small>${item.messageCount} messages / ${esc(date(item.updatedAt))}</small></button>`).join("") || '<p class="empty">No saved conversations.</p>'}`;
  return `<div class="action-row"><button data-assistance-list>All conversations</button>${assistanceDetail.proposedContent ? '<button data-create-proposal>Create plan from proposal</button>' : ""}</div><div role="log" aria-live="polite">${(assistanceDetail.messages || []).map((message) => `<article class="assist-message ${esc(message.role)}"><b>${message.role === "user" ? "Operator" : "Planning assistant"}</b><p>${esc(message.content)}</p><small>${esc(date(message.createdAt))}</small></article>`).join("") || '<p class="empty">Describe the project, users, boundaries, and measure of success.</p>'}</div><form id="assistanceForm"><label>Planning message<textarea name="message" maxlength="16000" required></textarea></label><button>Send message</button></form>${assistanceDetail.proposedContent ? `<details><summary>Read current proposal</summary><pre class="raw">${esc(json(assistanceDetail.proposedContent))}</pre></details>` : ""}`;
}

async function mutatePlan(type, payload, options = {}) {
  try {
    $("#planStatus").textContent = "Filing decision...";
    const detail = planDetail;
    const result = await client.projectPlanCommand(type, payload, { expectedVersion: detail?.ledger.version, refresh: true, ...options });
    selectedPlanId = result.planId || selectedPlanId;
    planRevision = null;
    await client.refreshPlans();
    planDetail = await client.getProjectPlan(selectedPlanId);
    notify(`${type.replace("project-plan.", "Plan ")} accepted`);
    renderPlan();
  } catch (error) { failure(error); renderPlan(); }
}

function openDialog(dialogId, opener) {
  const dialog = document.getElementById(dialogId);
  dialogOpeners.set(dialog, opener || document.activeElement);
  if (dialogId === "deskDialog") renderDesk();
  if (dialogId === "planDialog") { client.listPlanAssistance().catch(() => {}); renderPlan(); }
  dialog.showModal();
  $("h2", dialog)?.focus();
}

document.addEventListener("click", async (event) => {
  const open = event.target.closest("[data-open-dialog]");
  if (open) { openDialog(open.dataset.openDialog, open); return; }
  const close = event.target.closest("[data-close-dialog]");
  if (close) { close.closest("dialog").close(); return; }
  const runButton = event.target.closest("[data-select-run]");
  if (runButton) { try { await client.selectRun(runButton.dataset.selectRun); notify(`Edition ${runButton.dataset.selectRun} selected`); } catch (error) { failure(error); } return; }
  const agentButton = event.target.closest("[data-select-agent]");
  if (agentButton) { selectedAgent = agentButton.dataset.selectAgent; renderAgents(); renderWire(); notify(`${selectedAgent} selected`); return; }
  const deskButton = event.target.closest("[data-desk-tab]");
  if (deskButton) { deskTab = deskButton.dataset.deskTab; renderDesk(); return; }
  const planButton = event.target.closest("[data-plan-tab]");
  if (planButton) { planTab = planButton.dataset.planTab; renderPlan(); return; }
  const command = event.target.closest("[data-command]");
  if (command) { await runCommand(command.dataset.command, { reason: "Daily Swarm operator decision" }); return; }
  const confirmCommand = event.target.closest("[data-confirm-command]");
  if (confirmCommand) { const type = confirmCommand.dataset.confirmCommand; confirmDecision(`Confirm ${type}`, `This will issue the ${type} command. Unsaved run progress may be lost.`, () => runCommand(type, { reason: "Daily Swarm operator decision" })); return; }
  if (event.target.closest("[data-set-target]")) { await runCommand("set-showcase-target", { targetGenerations: Number($("#showcaseTarget").value) }); return; }
  if (event.target.closest("[data-next-generation]")) { await runCommand("start-next-iteration", { runId: model.state?.currentRunId || model.selectedRunId, repoPath: model.control?.autoIteration?.repoPath, objective: objective(), changeText: "Complete one bounded objective-linked generation without unrelated feature or stack churn." }); return; }
  const showcase = event.target.closest("[data-showcase]");
  if (showcase) { const target = Number($("#showcaseTarget").value); await runCommand("start-showcase-loop", { sourceRunId: model.state?.currentRunId || model.selectedRunId, sourceIterationId: model.selectedIterationId, repoPath: model.iterationDetail?.repoPath || model.control?.autoIteration?.repoPath || "/home/mojo/autonomous-projects/hermes-showcase-site", objective: objective(), targetGenerations: target, limits: { maxIterations: target, maxVariantsPerIteration: 3, maxParallelVariants: 3, maxAcceptedFeatures: 4, maxVisualMotifChanges: 1, maxNewSections: 1, stopAfterNoImprovement: 1, minImprovementScore: .05 } }); return; }
  const remove = event.target.closest("[data-remove-steering]");
  if (remove) { await runCommand("remove-steering", { id: remove.dataset.removeSteering }); return; }
  if (event.target.closest("[data-advice]")) { await runCommand("deblock-advice", { prompt: $("#deblockForm [name=prompt]")?.value || "", runId: model.state?.currentRunId || model.selectedRunId }); return; }
  const advice = event.target.closest("[data-advice-decision]");
  if (advice) { await runCommand(`${advice.dataset.adviceDecision}-deblock-advice`, { adviceId: advice.dataset.adviceId }); return; }
  const pin = event.target.closest("[data-pin-queue]");
  if (pin) { await runCommand("pin-queue-item", { id: pin.dataset.pinQueue }); return; }
  const archive = event.target.closest("[data-archive-queue]");
  if (archive) { await runCommand("archive-queue-item", { id: archive.dataset.archiveQueue }); return; }
  const queueRun = event.target.closest("[data-run-queue]");
  if (queueRun) { const item = (model.queue?.items || []).find((entry) => entry.id === queueRun.dataset.runQueue); await runCommand("start-next-iteration", { queueItemId: item.id, repoPath: item.target?.preferredRepo || model.control?.autoIteration?.repoPath, objective: item.objective, changeText: item.context || `Complete one bounded generation for ${item.title}.`, acceptanceGateIds: item.acceptanceGateIds || [] }); return; }
  if (event.target.closest("[data-clear-queue]")) { confirmDecision("Clear the queue?", "This also clears queue-linked steering and the current objective. This cannot be undone from this page.", () => runCommand("clear-queue")); return; }
  const gate = event.target.closest("[data-gate-decision]");
  if (gate) { const passed = gate.dataset.gateDecision === "passed"; await runCommand("gate-decision", { gateId: gate.dataset.gateId, status: gate.dataset.gateDecision, decision: passed ? "accepted" : "defer", runId: model.selectedRunId || model.state?.currentRunId, evidenceArtifacts: ["artifacts/gate-report.json", "artifacts/gate-decisions.json"] }); return; }
  const iterationAction = event.target.closest("[data-iteration-action]");
  if (iterationAction && model.iterationDetail) {
    const iteration = model.iterationDetail;
    await runCommand(iterationAction.dataset.iterationAction, { sourceRunId: iteration.runId || model.selectedRunId, sourceIterationId: iteration.id || model.selectedIterationId, repoPath: iteration.repoPath || model.control?.autoIteration?.repoPath, baseRef: iteration.commit || "HEAD", objective: iteration.objective || objective(), changeText: iteration.steeringText || `Continue one bounded generation from ${iteration.id || model.selectedIterationId}.`, acceptanceGateIds: iteration.acceptanceGateIds || [], limits: model.control?.autoIteration || planDefaults("managed").limits });
    return;
  }
  const newPlan = event.target.closest("[data-new-plan]");
  if (newPlan) { try { const result = await client.createProjectPlan({ content: planDefaults(newPlan.dataset.newPlan) }, { refresh: true }); await client.refreshPlans(); await loadPlan(result.planId); notify("Draft plan created"); } catch (error) { failure(error); } return; }
  const selectPlan = event.target.closest("[data-select-plan]");
  if (selectPlan) { await loadPlan(selectPlan.dataset.selectPlan); return; }
  const planAction = event.target.closest("[data-plan-action]");
  if (planAction && planDetail) {
    const action = planAction.dataset.planAction, ledger = planDetail.ledger, revision = planDetail.revision;
    const subject = { planId: ledger.planId, revision: ledger.currentRevision, planDigest: ledger.currentDigest };
    if (action === "ready") await mutatePlan("project-plan.ready-for-review", subject);
    if (action === "approve") await mutatePlan("project-plan.approve", { ...subject, notes: $("#decisionNotes")?.value || "" });
    if (action === "reject") { const notes = $("#decisionNotes")?.value.trim() || ""; if (!notes) { failure(new Error("Decision notes are required to reject a plan")); return; } await mutatePlan("project-plan.reject", { ...subject, notes }); }
    if (action === "clone" || action === "fork") await mutatePlan(`project-plan.${action}`, { ...subject, sourceRunId: model.selectedRunId || null, sourceIterationId: model.selectedIterationId || null, baseRef: revision.content.repository?.baseRef || null });
    if (action === "archive") confirmDecision("Archive this plan?", "The plan will leave the active ledger and its approval will be cleared.", () => mutatePlan("project-plan.archive", { planId: ledger.planId }));
    if (action === "launch") confirmDecision("Launch approved revision?", `Launch revision ${ledger.currentRevision}, digest ${ledger.currentDigest}. The runner will use the approved source and promotion safety boundary.`, () => mutatePlan("project-plan.launch", subject));
    return;
  }
  const revisionButton = event.target.closest("[data-plan-revision]");
  if (revisionButton && planDetail) { try { planRevision = await client.getProjectPlanRevision(planDetail.ledger.planId, Number(revisionButton.dataset.planRevision)); renderPlan(); } catch (error) { failure(error); } return; }
  const newAssistance = event.target.closest("[data-new-assistance]");
  if (newAssistance) { try { assistanceDetail = await client.createPlanAssistance(newAssistance.dataset.newAssistance); selectedAssistanceId = assistanceDetail.id; renderPlan(); } catch (error) { failure(error); } return; }
  const selectAssistance = event.target.closest("[data-select-assistance]");
  if (selectAssistance) { try { assistanceDetail = await client.getPlanAssistance(selectAssistance.dataset.selectAssistance); selectedAssistanceId = assistanceDetail.id; renderPlan(); } catch (error) { failure(error); } return; }
  if (event.target.closest("[data-assistance-list]")) { assistanceDetail = null; await client.listPlanAssistance().catch(failure); renderPlan(); return; }
  if (event.target.closest("[data-create-proposal]") && assistanceDetail?.proposedContent) { try { const result = await client.createProjectPlan({ content: assistanceDetail.proposedContent }, { refresh: true }); await client.refreshPlans(); await loadPlan(result.planId); notify("Proposal copied into a persisted draft"); } catch (error) { failure(error); } }
});

document.addEventListener("submit", async (event) => {
  const form = event.target;
  event.preventDefault();
  if (form.id === "objectiveForm") await runCommand("set-current-objective", { text: String(new FormData(form).get("text")), source: "daily-swarm" });
  if (form.id === "steerForm") await runCommand("steer", Object.fromEntries(new FormData(form)));
  if (form.id === "deblockForm") await runCommand("deblock", { prompt: String(new FormData(form).get("prompt")), runId: model.state?.currentRunId || model.selectedRunId });
  if (form.id === "queueForm") { const data = Object.fromEntries(new FormData(form)); data.pin = form.elements.pin.checked; data.source = "daily-swarm"; await runCommand("add-queue-item", data); }
  if (form.id === "gateForm") await runCommand("add-gate", Object.fromEntries(new FormData(form)));
  if (form.matches("[data-evidence-form]")) { const data = new FormData(form); await runCommand("attach-gate-evidence", { gateId: form.dataset.evidenceForm, runId: model.selectedRunId || model.state?.currentRunId, artifacts: list(data.get("artifacts")), notes: String(data.get("notes") || "") }); }
  if (form.matches("[data-update-gate-form]")) { const data = new FormData(form); await runCommand("update-gate", { gateId: form.dataset.updateGateForm, description: String(data.get("description") || ""), severity: String(data.get("severity")), status: String(data.get("status")), requiredEvidence: list(data.get("requiredEvidence")) }); }
  if (form.id === "planForm" && planDetail) await mutatePlan("project-plan.update", { planId: planDetail.ledger.planId, content: collectPlan(form) });
  if (form.id === "assistanceForm" && assistanceDetail) { try { const message = String(new FormData(form).get("message")); assistanceDetail = await client.messagePlanAssistance(assistanceDetail.id, assistanceDetail.version, message); renderPlan(); } catch (error) { failure(error); } }
});

$("#confirmDialog").addEventListener("close", () => { const work = confirmWork; confirmWork = null; if ($("#confirmDialog").returnValue === "confirm") work?.(); });
$$('dialog').forEach((dialog) => dialog.addEventListener("close", () => {
  const opener = dialogOpeners.get(dialog);
  if (opener?.isConnected) opener.focus();
}));
$("#refreshNow").addEventListener("click", () => client.refresh().then(() => notify("Edition refreshed")).catch(failure));
$("#pauseStream").addEventListener("click", () => { if (model.connection.paused) client.resume().catch(failure); else client.pause(); });
$("#connectStream").addEventListener("click", () => client.connect().then(() => notify("Live stream reconnected")).catch(failure));
$("#disconnectStream").addEventListener("click", () => { client.disconnect(); notify("Live stream disconnected"); });
$("#wireFilter").addEventListener("input", renderWire);
$("#followWire").addEventListener("change", renderWire);
$("#runSelect").addEventListener("change", (event) => client.selectRun(event.target.value || null).catch(failure));
$("#iterationSelect").addEventListener("change", (event) => client.selectIteration(event.target.value || null).catch(failure));

document.addEventListener("click", async (event) => {
  const documentButton = event.target.closest("[data-document]");
  const sourceButton = event.target.closest("[data-source-kind]");
  if (!documentButton && !sourceButton) return;
  const reader = $("#sourceReader");
  try {
    let title, content;
    if (documentButton) { const result = await client.loadDocument(documentButton.dataset.document); title = result.name; content = result.text; }
    if (sourceButton?.dataset.sourceKind === "artifact") { const result = await client.loadArtifact(sourceButton.dataset.sourceName); title = result.name; content = result.text; }
    if (sourceButton?.dataset.sourceKind === "log") { const result = await client.loadLog(sourceButton.dataset.sourceName, undefined, { tail: 1000 }); title = result.name; content = result.text; }
    if (sourceButton?.dataset.sourceKind === "run") { title = sourceButton.dataset.sourceName; content = json(model.selectedRun.run); }
    if (sourceButton?.dataset.sourceKind === "iteration") { title = sourceButton.dataset.sourceName; content = json(model.iterationDetail); }
    reader.hidden = false;
    reader.innerHTML = `<header><h3>${esc(title)}</h3><button type="button" data-close-reader>Close source</button></header><pre>${esc(content)}</pre>`;
    reader.focus(); reader.scrollIntoView({ block: "start" });
  } catch (error) { failure(error); }
});
document.addEventListener("click", (event) => { if (event.target.closest("[data-close-reader]")) { $("#sourceReader").hidden = true; } });

client.subscribe((snapshot) => {
  model = snapshot;
  if (!selectedPlanId && model.plans[0]) selectedPlanId = model.plans[0].planId;
  renderAll();
  if ($("#deskDialog").open && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) renderDesk();
  if ($("#planDialog").open && planTab === "ledger") renderPlan();
});

client.connect().catch(failure);
