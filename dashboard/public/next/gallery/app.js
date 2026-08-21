import {
  createDashboardClient,
  WORKFLOW_PHASES,
  OPERATION_COMMANDS,
  PROJECT_PLAN_ACTIONS
} from "../../headless-dashboard-client.js";

const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const text = value => typeof value === "string" ? value : JSON.stringify(value, null, 2);
const clip = (value, limit = 24000) => { const result = text(value ?? ""); return result.length > limit ? `${result.slice(0, limit)}\n… ${result.length - limit} characters omitted` : result; };
const array = value => Array.isArray(value) ? value : value && typeof value === "object" ? Object.values(value) : value ? [value] : [];
const date = value => { if (!value) return "Not recorded"; const parsed = new Date(value); return Number.isNaN(parsed.valueOf()) ? String(value) : parsed.toLocaleString(); };
const clock = value => { if (!value) return "--:--"; const parsed = new Date(value); return Number.isNaN(parsed.valueOf()) ? String(value) : parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); };
const slug = value => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const safeJson = (value, fallback = {}) => { try { return JSON.parse(value); } catch { throw new Error("Payload must be valid JSON."); } };

const client = createDashboardClient({ maxEvents: 1000, pollIntervalMs: 4000 });
let snapshot = client.getSnapshot();
let agentFilter = "all";
let eventFilter = "all";
let archiveTab = "runs";
let searchQuery = "";
let selectedPlanId = null;
let planView = "plans";
let assistanceId = null;
let renderPending = false;
let drawerInvoker = null;
let plannerInvoker = null;
let toastTimer = null;

function phase() {
  const state = snapshot.state || {};
  const candidate = state.status === "complete" ? "completed" : state.phase || state.status || "idle";
  if (WORKFLOW_PHASES.includes(candidate)) return candidate;
  if (/devplan/i.test(candidate)) return "devplan-drafting";
  if (/spec/i.test(candidate)) return "spec-drafting";
  if (/build|implementation|running/i.test(candidate)) return "building";
  return "idle";
}

function allAgents() {
  const state = snapshot.state || {};
  const source = array(state.agents).map(item => ({
    id: item.id || item.label || item.role || "agent",
    label: item.label || item.role || item.id || "Agent",
    role: item.role || "subagent",
    status: item.status || "idle",
    task: item.currentTask || item.task || item.lastMessage || "Waiting for work",
    phase: item.currentPhase || state.phase || state.status || "idle",
    updatedAt: item.updatedAt || state.updatedAt,
    raw: item
  }));
  const known = new Map(source.map(item => [item.id, item]));
  for (const event of snapshot.events) {
    const id = event.agentId || event.data?.agentId;
    if (!id || id === "system" || known.has(id)) continue;
    known.set(id, { id, label: id, role: "event-derived agent", status: event.data?.status || "seen", task: event.message || event.type, phase: event.data?.phase || state.phase || "idle", updatedAt: event.ts, raw: event });
  }
  if (!known.has("main-orchestrator")) known.set("main-orchestrator", { id: "main-orchestrator", label: "Main Orchestrator", role: "scheduled workflow", status: state.status || "idle", task: state.currentTask || state.task || state.lastAction || "Monitoring the route", phase: state.phase || state.status || "idle", updatedAt: state.updatedAt, raw: state });
  return [...known.values()];
}

function toolCalls() {
  const calls = new Map();
  for (const event of snapshot.events) {
    const data = event.data || {};
    if (!String(event.type).startsWith("tool-call") && !data.toolName && !data.toolCallId && !data.tool) continue;
    const id = data.toolCallId || data.id || event.id;
    const previous = calls.get(id) || {};
    calls.set(id, {
      ...previous,
      id,
      agentId: event.agentId || data.agentId || previous.agentId,
      name: data.toolName || data.tool || data.name || previous.name || "tool",
      action: data.action || data.command || event.message || previous.action || "",
      status: String(event.type).includes("error") ? "error" : String(event.type).includes("end") ? "done" : data.status || previous.status || "running",
      input: data.sanitizedInput ?? data.input ?? data.args ?? previous.input,
      output: data.sanitizedOutput ?? data.output ?? data.result ?? previous.output,
      error: data.error ?? previous.error,
      updatedAt: event.ts
    });
  }
  return [...calls.values()];
}

function isAttention(status) { return /block|error|fail|hold|stop/i.test(String(status)); }
function active(status) { return !/idle|done|complete|completed|published|error/i.test(String(status)); }
function searched(...values) { return !searchQuery || values.map(value => text(value).toLowerCase()).join(" ").includes(searchQuery); }
function iterationLimits(maxIterations = 1) { return { maxIterations: Number(maxIterations) || 1, maxVariantsPerIteration: 3, maxParallelVariants: 3, maxAcceptedFeatures: 4, maxVisualMotifChanges: 1, maxNewSections: 1, stopAfterNoImprovement: 1, minImprovementScore: 0.05 }; }

function scheduleRender() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => { renderPending = false; render(); });
}

function render() {
  renderConnection();
  renderEntrance();
  renderExhibit();
  renderWorkflow();
  renderAgents();
  renderArchiveIndex();
  renderEvents();
  renderDesk();
  if (!$('planner').hidden) renderPlanner();
}

function renderConnection() {
  const connection = snapshot.connection;
  const label = connection.paused ? "Live updates paused" : `${connection.status}${connection.transport ? ` / ${connection.transport}` : ""}`;
  $("connectionLabel").textContent = label;
  $("statusLight").className = connection.status === "connected" ? "live" : connection.status === "degraded" || snapshot.error ? "error" : "";
  $("pauseStream").textContent = connection.paused ? "Resume live updates" : "Pause live updates";
  $("toggleConnection").textContent = connection.status === "disconnected" ? "Reconnect" : "Disconnect";
}

function renderEntrance() {
  const state = snapshot.state || {};
  $("entranceFacts").innerHTML = [
    ["Live run", state.currentRunId || "No active run"],
    ["Current phase", phase()],
    ["Agents present", allAgents().filter(item => active(item.status)).length],
    ["Last movement", date(state.updatedAt || snapshot.connection.lastMessageAt)]
  ].map(([term, value]) => `<div><dt>${esc(term)}</dt><dd>${esc(value)}</dd></div>`).join("");
}

function renderExhibit() {
  const state = snapshot.state || {};
  const control = snapshot.control || {};
  const queue = array(snapshot.queue?.items);
  const pinned = queue.find(item => item.id === control.pinnedQueueItemId) || queue.find(item => item.status === "pinned");
  const objective = control.currentObjective?.text || pinned?.objective || state.currentTask || state.task || state.currentProject || "Awaiting a current objective";
  const blocker = state.block || state.blocker || state.hold;
  $("heroExhibit").innerHTML = `<div><p class="kicker">Work no. ${esc(state.currentRunId || "unassigned")}</p><h3>${esc(objective)}</h3></div><div class="object-label"><p class="accession">LIVE OBJECT / ${esc(state.currentRunId || "NO-RUN")}</p><p>This is the work now occupying the center of the swarm. Its surrounding rooms show who is contributing, what evidence exists, and how the work arrived here.</p><dl><div><dt>Status</dt><dd class="status-word">${esc(state.status || phase())}</dd></div><div><dt>Phase</dt><dd>${esc(state.phase || phase())}</dd></div><div><dt>Project</dt><dd>${esc(state.selectedProject?.name || state.currentProject || "Not selected")}</dd></div><div><dt>Updated</dt><dd>${esc(date(state.updatedAt))}</dd></div></dl>${blocker ? `<p><b>Attention:</b> ${esc(blocker.reason || blocker.message || text(blocker))}</p>` : ""}</div>`;
}

function renderWorkflow() {
  const current = phase();
  const index = WORKFLOW_PHASES.indexOf(current);
  $("workflowRoute").innerHTML = WORKFLOW_PHASES.map((item, position) => `<li class="${position < index ? "done" : ""} ${item === current ? "current" : ""}" ${item === current ? 'aria-current="step"' : ""}>${esc(item)}</li>`).join("");
}

function renderAgents() {
  const tools = toolCalls();
  let agents = allAgents();
  if (agentFilter === "active") agents = agents.filter(item => active(item.status));
  if (agentFilter === "blocked") agents = agents.filter(item => isAttention(item.status));
  agents = agents.filter(item => searched(item.id, item.label, item.role, item.task, tools.filter(tool => tool.agentId === item.id)));
  $("agentRooms").innerHTML = agents.map((agent, index) => {
    const ownTools = tools.filter(tool => tool.agentId === agent.id);
    const events = snapshot.events.filter(event => event.agentId === agent.id).slice(-6).reverse();
    return `<li class="agent-room"><div class="door" aria-hidden="true">${String(index + 1).padStart(2, "0")}</div><div><h3>${esc(agent.label)}</h3><p><span class="status-mark ${esc(slug(agent.status))}"></span>${esc(agent.status)} / ${esc(agent.role)}</p></div><p class="task">${esc(agent.task)}</p><button data-agent-detail="${esc(agent.id)}">View room label</button><details><summary>Open studio record: ${ownTools.length} tools, ${events.length} recent events</summary><div class="studio-details"><div><h4>Tools</h4><ul class="tool-list">${ownTools.map(tool => `<li><button data-tool-detail="${esc(tool.id)}"><b>${esc(tool.name)}</b> ${esc(tool.action)}</button><small> ${esc(tool.status)}</small></li>`).join("") || "<li>No tools recorded.</li>"}</ul></div><div><h4>Recent record</h4><ol class="event-mini">${events.map(event => `<li><time>${esc(clock(event.ts))}</time> ${esc(event.message || event.type)}</li>`).join("") || "<li>No events recorded.</li>"}</ol></div></div></details></li>`;
  }).join("") || '<li class="empty">No agent rooms match this route.</li>';
}

function renderArchiveIndex() {
  const index = $("archiveIndex");
  document.querySelectorAll("[data-archive-tab]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.archiveTab === archiveTab)));
  if (archiveTab === "runs") index.innerHTML = snapshot.runs.filter(item => searched(item)).map(run => `<button data-run="${esc(run.id)}"><b>${esc(run.id)}</b><small>${esc(run.status || "unknown")} · ${esc(date(run.startedAt))}</small></button>`).join("") || '<p class="empty">No runs catalogued.</p>';
  if (archiveTab === "documents") index.innerHTML = `<button data-document="spec"><b>SPEC</b><small>Selected run specification</small></button><button data-document="devplan"><b>DEVPLAN</b><small>Selected run implementation plan</small></button>`;
  if (archiveTab === "files") {
    const resources = snapshot.selectedRun || {};
    index.innerHTML = [...array(resources.artifacts).map(file => ({ ...file, kind: "artifact" })), ...array(resources.logs).map(file => ({ ...file, kind: "log" }))].filter(item => searched(item)).map(file => `<button data-file-kind="${file.kind}" data-file="${esc(file.name)}"><b>${esc(file.name)}</b><small>${esc(file.kind)} · ${esc(file.size ?? "?")} bytes</small></button>`).join("") || '<p class="empty">No files in this drawer.</p>';
  }
  if (archiveTab === "iterations") index.innerHTML = snapshot.iterations.filter(item => searched(item)).map(item => `<button data-iteration="${esc(item.id)}"><b>${esc(item.objective || item.id)}</b><small>${esc(item.status || "unknown")} · run ${esc(item.runId || "unlinked")}</small></button>`).join("") || '<p class="empty">No iterations catalogued.</p>';
  if (archiveTab === "audit") index.innerHTML = array(snapshot.audit).map((item, position) => ({ item, position })).filter(({ item }) => searched(item)).map(({ item, position }) => `<button data-audit-detail="${position}"><b>${esc(item.action || item.type || "Audit record")}</b><small>${esc(date(item.ts || item.createdAt))} · ${esc(item.actor || item.createdBy || "system")}</small></button>`).join("") || '<p class="empty">No audit records catalogued.</p>';
}

function objectSheet(title, subtitle, metadata, body) {
  return `<div class="label-sheet"><header><p class="kicker">Archive object</p><h3>${esc(title)}</h3><p>${esc(subtitle)}</p></header><dl class="label-metadata">${metadata.map(([key, value]) => `<div><dt>${esc(key)}</dt><dd>${esc(value ?? "Not recorded")}</dd></div>`).join("")}</dl>${body}</div>`;
}

function showRun(run) {
  const resources = snapshot.selectedRun;
  $("archiveDisplay").innerHTML = objectSheet(run?.id || snapshot.selectedRunId, "Run record and resource provenance", [["Status", run?.status], ["Started", date(run?.startedAt)], ["Completed", date(run?.completedAt)], ["Artifacts", array(resources.artifacts).length], ["Logs", array(resources.logs).length], ["Project", run?.selectedProject]], `<div class="drawer-list"><details open><summary>Run record</summary><pre>${esc(clip(run))}</pre></details><details><summary>Artifact drawer (${array(resources.artifacts).length})</summary>${array(resources.artifacts).map(file => `<button data-file-kind="artifact" data-file="${esc(file.name)}">${esc(file.name)}</button>`).join("") || '<p class="empty">Empty.</p>'}</details><details><summary>Log drawer (${array(resources.logs).length})</summary>${array(resources.logs).map(file => `<button data-file-kind="log" data-file="${esc(file.name)}">${esc(file.name)}</button>`).join("") || '<p class="empty">Empty.</p>'}</details></div>`);
  $("archiveDisplay").focus({ preventScroll: true });
}

function evidenceLinks(detail) {
  const values = [];
  const add = value => { if (Array.isArray(value)) return value.forEach(add); if (typeof value === "string") values.push(value); else if (value && typeof value === "object") values.push(value.path || value.file || value.artifact || value.href || value.label || text(value)); };
  [detail.artifacts, detail.logs, detail.screenshots, detail.testResults, detail.sourceEvidence, detail.evidence, detail.gateDecisions].forEach(add);
  return values.slice(0, 30);
}

function showIteration(detail) {
  const lineage = detail.lineage || detail.projectLaunch || detail.run?.projectLaunch || {};
  const evidence = evidenceLinks(detail);
  const actions = detail.runId ? `<div class="control-row"><button data-lineage="continue" data-run-id="${esc(detail.runId)}" data-iteration-id="${esc(detail.id)}">Continue from iteration</button><button data-lineage="fork" data-run-id="${esc(detail.runId)}" data-iteration-id="${esc(detail.id)}">Fork from iteration</button><button data-lineage="direction" data-run-id="${esc(detail.runId)}" data-iteration-id="${esc(detail.id)}">Use as next direction</button></div>` : "";
  $("archiveDisplay").innerHTML = objectSheet(detail.objective || detail.id, "Iteration evidence and lineage", [["Iteration", detail.id], ["Run", detail.runId], ["Status", detail.status], ["Mode", detail.mode], ["Repository", detail.repoPath || detail.run?.repoPath], ["Commit", detail.commit || detail.run?.commit]], `${actions}<h4>Lineage</h4><pre>${esc(clip(lineage))}</pre><h4>Evidence labels</h4><ol>${evidence.map(item => `<li>${esc(item)}</li>`).join("") || "<li>No linked evidence.</li>"}</ol><details><summary>Complete iteration record</summary><pre>${esc(clip(detail))}</pre></details>`);
  $("archiveDisplay").focus({ preventScroll: true });
}

function filteredEvents() {
  let events = snapshot.events;
  if (eventFilter === "tools") events = events.filter(event => String(event.type).startsWith("tool-call") || event.data?.toolName || event.data?.toolCallId);
  if (eventFilter === "errors") events = events.filter(event => isAttention(event.level) || isAttention(event.type) || isAttention(event.message));
  return events.filter(event => searched(event.ts, event.source, event.type, event.message, event.agentId, event.runId)).slice(-300);
}

function renderEvents() {
  const events = filteredEvents();
  $("wallSummary").textContent = `${events.length} chronological records on view${searchQuery ? " after search" : ""}. Oldest appears first.`;
  $("eventWall").innerHTML = events.map(event => `<li class="${isAttention(event.level) || isAttention(event.type) ? "attention" : ""}"><time datetime="${esc(event.ts)}">${esc(clock(event.ts))}</time><span class="event-type">${esc(event.source)}<br>${esc(event.type)}</span><button data-event-detail="${esc(event.id)}">${esc(event.message || event.data?.action || event.type)}</button></li>`).join("") || '<li class="empty">No telemetry matches this view.</li>';
}

function renderDesk() {
  const control = snapshot.control || {};
  const state = snapshot.state || {};
  const blocker = state.block || state.blocker || state.hold;
  $("attentionNotice").textContent = blocker ? `Attention required: ${blocker.reason || blocker.message || text(blocker)}` : snapshot.error ? `Connection notice: ${snapshot.error.message}` : "";
  const advice = array(control.deblockAdvice).find(item => item.status === "pending");
  $("adviceDisplay").innerHTML = advice ? `<div class="advice"><b>Advice awaiting decision</b><p>${esc(advice.answer || advice.message)}</p><button data-advice="approve" data-advice-id="${esc(advice.id)}">Approve advice</button><button data-advice="deny" data-advice-id="${esc(advice.id)}">Deny advice</button></div>` : "";
  $("queueDisplay").innerHTML = array(snapshot.queue?.items).map(item => `<div class="queue-item"><b>${esc(item.title || item.id)}</b><small>${esc(item.objective || item.status || "")}</small><button data-queue="pin" data-id="${esc(item.id)}">Pin</button><button data-queue="use" data-id="${esc(item.id)}">Use direction</button><button data-queue="archive" data-id="${esc(item.id)}">Archive</button></div>`).join("") || '<p class="empty">Queue is clear.</p>';
  $("gateDisplay").innerHTML = array(snapshot.gates?.gates).map(gate => `<div class="gate-item"><b>${esc(gate.title || gate.description || gate.id)}</b><small>${esc(gate.status || gate.severity || "")}</small><button data-gate="pass" data-id="${esc(gate.id)}">Pass</button><button data-gate="evidence" data-id="${esc(gate.id)}">Needs evidence</button><button data-gate="attach" data-id="${esc(gate.id)}">Attach evidence…</button><button data-gate="update" data-id="${esc(gate.id)}">Amend…</button></div>`).join("") || '<p class="empty">No gates installed.</p>';
}

async function command(type, payload = {}) {
  setBusy(true);
  try { await client.command(type, payload, { refresh: true }); toast(`${type} accepted.`); }
  catch (error) { toast(`${type} failed: ${error.message}`, true); }
  finally { setBusy(false); }
}

function setBusy(busy) { document.querySelectorAll("#curator-desk button, #curator-desk input, #curator-desk textarea, #curator-desk select").forEach(element => element.disabled = busy); }
function toast(message, error = false) { clearTimeout(toastTimer); const element = $("toast"); element.textContent = message; element.style.background = error ? "#8d2b25" : "#181a19"; element.hidden = false; toastTimer = setTimeout(() => { element.hidden = true; }, 5500); }

function openDrawer(title, value, invoker = document.activeElement) {
  drawerInvoker = invoker;
  $("drawerTitle").textContent = title;
  $("drawerContent").innerHTML = `<pre>${esc(clip(value))}</pre>`;
  $("detailDrawer").hidden = false;
  $("closeDrawer").focus();
}

function closeDrawer() { $("detailDrawer").hidden = true; drawerInvoker?.focus?.({ preventScroll: true }); }

const defaultPlan = pipelineType => ({ pipelineType, title: "", problem: "", intendedUsers: "", objective: "", boundedScope: "", requirements: [], nonGoals: [], constraints: [], risks: [], repository: { path: null, baseRef: null, baseCommit: null }, acceptanceGates: [], validationPolicy: { id: "apb.runner-selected.v1", expectations: [], clientCommandsAllowed: false }, milestones: [], limits: { maxIterations: 1, maxVariantsPerIteration: 3, maxParallelVariants: 3, maxAcceptedFeatures: 4, maxVisualMotifChanges: 1, maxNewSections: 1, stopAfterNoImprovement: 1 }, lineage: { mode: "new", sourcePlanId: null, sourceRevision: null, sourceRunId: null, sourceIterationId: null } });

function openPlanner(invoker = document.activeElement) {
  plannerInvoker = invoker;
  $("planner").hidden = false;
  document.body.style.overflow = "hidden";
  Promise.all([client.refreshPlans(), client.listPlanAssistance()]).catch(error => toast(error.message, true)).finally(() => { renderPlanner(); $("closePlanner").focus(); });
}

function closePlanner() { $("planner").hidden = true; document.body.style.overflow = ""; plannerInvoker?.focus?.({ preventScroll: true }); }

function selectedPlan() { return snapshot.planDetail?.ledger?.planId === selectedPlanId ? snapshot.planDetail : null; }

function renderPlanner() {
  document.querySelectorAll("[data-plan-view]").forEach(button => button.classList.toggle("selected", button.dataset.planView === planView));
  $("planList").innerHTML = `<div class="control-row"><button data-new-plan="classic">New classic</button><button data-new-plan="managed">New managed</button></div>${snapshot.plans.map(plan => `<button class="plan-row ${plan.planId === selectedPlanId ? "selected" : ""}" data-plan-id="${esc(plan.planId)}"><b>${esc(plan.title || "Untitled plan")}</b><small>${esc(plan.pipelineType)} · ${esc(plan.state)} · revision ${esc(plan.currentRevision)}</small></button>`).join("") || '<p class="empty">No persisted plans.</p>'}`;
  const detail = selectedPlan();
  if (planView === "plans") $("planWorkspace").innerHTML = '<h3>Persisted plans</h3><p>Select a plan from the collection index, or create a bounded classic or managed draft.</p>';
  if (planView === "editor") renderPlanEditor(detail);
  if (planView === "review") renderPlanReview(detail);
  if (planView === "assist") renderAssistance();
}

function renderPlanEditor(detail) {
  if (!detail) { $("planWorkspace").innerHTML = '<p class="empty">Select or create a plan first.</p>'; return; }
  const content = detail.revision.content;
  $("planWorkspace").innerHTML = `<h3>Edit saved revision</h3><p>Plan ${esc(detail.ledger.planId)} / version ${esc(detail.ledger.version)}. Arrays and nested policy fields remain editable in the complete JSON document.</p><form id="planEditor" class="plan-form"><label>Pipeline<select name="pipelineType"><option ${content.pipelineType === "classic" ? "selected" : ""}>classic</option><option ${content.pipelineType === "managed" ? "selected" : ""}>managed</option></select></label><label>Title<input name="title" value="${esc(content.title)}" required></label><label class="wide">Problem<textarea name="problem" required>${esc(content.problem)}</textarea></label><label>Intended users<textarea name="intendedUsers">${esc(content.intendedUsers)}</textarea></label><label>Measurable objective<textarea name="objective" required>${esc(content.objective)}</textarea></label><label class="wide">Bounded scope<textarea name="boundedScope" required>${esc(content.boundedScope)}</textarea></label><label class="wide">Complete content JSON<textarea name="content">${esc(JSON.stringify(content, null, 2))}</textarea></label><div class="plan-actions"><button class="primary">Save new revision</button></div></form>`;
}

function renderPlanReview(detail) {
  if (!detail) { $("planWorkspace").innerHTML = '<p class="empty">Select a plan to review.</p>'; return; }
  const ledger = detail.ledger;
  $("planWorkspace").innerHTML = `<h3>Immutable review and launch</h3><dl class="label-metadata"><div><dt>State</dt><dd>${esc(ledger.state)}</dd></div><div><dt>Revision</dt><dd>${esc(ledger.currentRevision)}</dd></div><div><dt>Digest</dt><dd>${esc(ledger.currentDigest)}</dd></div></dl><pre>${esc(clip(detail.revision.content))}</pre><label>Decision notes<textarea id="decisionNotes"></textarea></label><div class="plan-actions"><button data-plan-action="project-plan.ready-for-review">Ready for review</button><button data-plan-action="project-plan.approve">Approve exact revision</button><button data-plan-action="project-plan.reject">Reject</button><button class="primary" data-plan-action="project-plan.launch">Launch approved plan</button><button data-plan-action="project-plan.clone">Clone</button><button data-plan-action="project-plan.fork">Fork</button><button class="danger" data-plan-action="project-plan.archive">Archive</button></div><details><summary>Launch and lineage records</summary><pre>${esc(clip({ launches: detail.launches, lineage: detail.revision.content.lineage }))}</pre></details>`;
}

function renderAssistance() {
  const detail = snapshot.assistanceDetail?.id === assistanceId ? snapshot.assistanceDetail : null;
  if (!detail) {
    $("planWorkspace").innerHTML = `<h3>Planning assistance</h3><p>Conversation suggestions do not save, approve, launch, or execute a project.</p><div class="control-row"><button data-new-assistance="classic">Start classic conversation</button><button data-new-assistance="managed">Start managed conversation</button></div><h4>Resume conversation</h4>${snapshot.assistance.map(item => `<button class="plan-row" data-assistance-id="${esc(item.id)}"><b>${esc(item.pipelineType)} assistance</b><small>${esc(item.messageCount)} messages · ${esc(date(item.updatedAt))}</small></button>`).join("") || '<p class="empty">No assistance conversations.</p>'}`;
    return;
  }
  $("planWorkspace").innerHTML = `<h3>Orchestrator assistance</h3><div class="transcript" role="log">${array(detail.messages).map(message => `<article class="${esc(message.role)}"><b>${esc(message.role)}</b><p>${esc(message.content)}</p><small>${esc(date(message.createdAt))}</small></article>`).join("") || '<p class="empty">Describe the project and its boundary.</p>'}</div><form id="assistanceForm"><label>Planning message<textarea name="message" required maxlength="16000"></textarea></label><button>Send message</button></form>${detail.proposedContent ? `<h4>Proposed bounded content</h4><pre>${esc(clip(detail.proposedContent))}</pre><button data-create-proposal>Create persisted proposal draft</button>` : ""}`;
}

async function loadPlan(id) {
  selectedPlanId = id;
  try { await client.getProjectPlan(id); renderPlanner(); }
  catch (error) { toast(error.message, true); }
}

async function planAction(type) {
  const detail = selectedPlan();
  if (!detail) return;
  const payload = { planId: detail.ledger.planId };
  if (type !== "project-plan.archive") Object.assign(payload, { revision: detail.ledger.currentRevision, planDigest: detail.ledger.currentDigest });
  if (["project-plan.approve", "project-plan.reject"].includes(type)) payload.notes = $("decisionNotes")?.value || "";
  if (type === "project-plan.reject" && !payload.notes.trim()) { toast("Rejection notes are required.", true); return; }
  if (["project-plan.clone", "project-plan.fork"].includes(type)) Object.assign(payload, { sourceRunId: snapshot.selectedRunId || null, sourceIterationId: snapshot.selectedIterationId || null, baseRef: detail.revision.content.repository?.baseRef || null });
  try {
    const result = await client.projectPlanCommand(type, payload, { expectedVersion: detail.ledger.version, refresh: true });
    if (result.planId) selectedPlanId = result.planId;
    await client.refreshPlans();
    await loadPlan(selectedPlanId);
    toast(`${type} accepted.`);
  } catch (error) { toast(`${type} failed: ${error.message}`, true); }
}

async function lineageCommand(mode, button) {
  const detail = snapshot.iterationDetail?.id === button.dataset.iterationId ? snapshot.iterationDetail : snapshot.iterations.find(item => item.id === button.dataset.iterationId) || {};
  const target = Number(snapshot.control?.autoIteration?.targetGenerations || 1);
  const payload = {
    runId: button.dataset.runId, sourceRunId: button.dataset.runId, sourceIterationId: button.dataset.iterationId,
    repoPath: detail.repoPath || detail.run?.repoPath || snapshot.control?.autoIteration?.repoPath || snapshot.state?.repoPath,
    baseRef: detail.commit || detail.run?.commit || "HEAD",
    objective: detail.objective || snapshot.control?.currentObjective?.text || snapshot.state?.task,
    changeText: `Continue one bounded objective-linked generation from iteration ${button.dataset.iterationId}.`,
    acceptanceGateIds: array(detail.acceptanceGateIds),
    limits: iterationLimits(Math.max(1, target))
  };
  const type = mode === "continue" ? "continue-from-iteration" : mode === "fork" ? "fork-from-iteration" : "use-as-next-direction";
  await command(type, payload);
}

function setupCommandOptions() { $("commandType").innerHTML = OPERATION_COMMANDS.map(item => `<option>${esc(item)}</option>`).join(""); }

document.addEventListener("click", async event => {
  const agentId = event.target.closest("[data-agent-detail]")?.dataset.agentDetail;
  if (agentId) { const agent = allAgents().find(item => item.id === agentId); openDrawer(`Room label: ${agent?.label || agentId}`, { agent, tools: toolCalls().filter(tool => tool.agentId === agentId), events: snapshot.events.filter(item => item.agentId === agentId).slice(-30) }, event.target); return; }
  const toolId = event.target.closest("[data-tool-detail]")?.dataset.toolDetail;
  if (toolId) { openDrawer("Tool label", toolCalls().find(item => item.id === toolId), event.target); return; }
  const eventId = event.target.closest("[data-event-detail]")?.dataset.eventDetail;
  if (eventId) { openDrawer("Telemetry record", snapshot.events.find(item => item.id === eventId), event.target); return; }
  const auditPosition = event.target.closest("[data-audit-detail]")?.dataset.auditDetail;
  if (auditPosition !== undefined) { openDrawer("Audit record", array(snapshot.audit)[Number(auditPosition)], event.target); return; }
  const agentFilterButton = event.target.closest("[data-agent-filter]");
  if (agentFilterButton) { agentFilter = agentFilterButton.dataset.agentFilter; document.querySelectorAll("[data-agent-filter]").forEach(button => button.classList.toggle("selected", button === agentFilterButton)); renderAgents(); return; }
  const eventFilterButton = event.target.closest("[data-event-filter]");
  if (eventFilterButton) { eventFilter = eventFilterButton.dataset.eventFilter; document.querySelectorAll("[data-event-filter]").forEach(button => button.classList.toggle("selected", button === eventFilterButton)); renderEvents(); return; }
  const archiveButton = event.target.closest("[data-archive-tab]");
  if (archiveButton) { archiveTab = archiveButton.dataset.archiveTab; renderArchiveIndex(); return; }
  const runId = event.target.closest("[data-run]")?.dataset.run;
  if (runId) { try { await client.selectRun(runId); showRun(snapshot.selectedRun.run || snapshot.runs.find(item => item.id === runId)); renderArchiveIndex(); } catch (error) { toast(error.message, true); } return; }
  const documentKind = event.target.closest("[data-document]")?.dataset.document;
  if (documentKind) { try { const document = await client.loadDocument(documentKind); $("archiveDisplay").innerHTML = objectSheet(document.name, `${documentKind.toUpperCase()} document for ${document.runId}`, [["Kind", documentKind], ["Run", document.runId], ["File", document.name]], `<pre>${esc(document.text)}</pre>`); $("archiveDisplay").focus({ preventScroll: true }); } catch (error) { toast(error.message, true); } return; }
  const fileButton = event.target.closest("[data-file]");
  if (fileButton) { try { const result = fileButton.dataset.fileKind === "log" ? await client.loadLog(fileButton.dataset.file) : await client.loadArtifact(fileButton.dataset.file); $("archiveDisplay").innerHTML = objectSheet(result.name, `${fileButton.dataset.fileKind} from selected run`, [["Run", result.runId], ["Object", result.name], ["Tail", result.tail || "complete"]], `<pre>${esc(result.text)}</pre>`); $("archiveDisplay").focus({ preventScroll: true }); } catch (error) { toast(error.message, true); } return; }
  const iterationId = event.target.closest("[data-iteration]")?.dataset.iteration;
  if (iterationId) { try { await client.selectIteration(iterationId); showIteration(snapshot.iterationDetail); } catch (error) { toast(error.message, true); } return; }
  const lineage = event.target.closest("[data-lineage]"); if (lineage) { await lineageCommand(lineage.dataset.lineage, lineage); return; }
  const direct = event.target.closest("[data-command]")?.dataset.command; if (direct) { await command(direct, { reason: "Swarm Gallery curator command" }); return; }
  const advice = event.target.closest("[data-advice]");
  if (advice) { const type = advice.dataset.advice === "request" ? "deblock-advice" : `${advice.dataset.advice}-deblock-advice`; const payload = advice.dataset.advice === "request" ? { runId: snapshot.state?.currentRunId || snapshot.selectedRunId, prompt: $("deblockForm").elements.prompt.value } : { adviceId: advice.dataset.adviceId }; await command(type, payload); return; }
  const showcase = event.target.closest("[data-showcase]")?.dataset.showcase;
  if (showcase) { const targetGenerations = Number($("showcaseTarget").value); await command(showcase === "start" ? "start-showcase-loop" : "set-showcase-target", showcase === "start" ? { sourceRunId: snapshot.state?.currentRunId || snapshot.selectedRunId, sourceIterationId: snapshot.selectedIterationId, repoPath: snapshot.control?.autoIteration?.repoPath || snapshot.state?.repoPath, objective: snapshot.control?.currentObjective?.text || snapshot.state?.currentTask || snapshot.state?.task, targetGenerations, limits: iterationLimits(targetGenerations) } : { targetGenerations }); return; }
  if (event.target.closest('[data-iteration-action="start"]')) { await command("start-next-iteration", { runId: snapshot.state?.currentRunId || snapshot.selectedRunId, repoPath: snapshot.control?.autoIteration?.repoPath || snapshot.state?.repoPath, objective: snapshot.control?.currentObjective?.text || snapshot.state?.task, changeText: "Complete one bounded objective-linked generation without unrelated churn.", limits: iterationLimits() }); return; }
  const queue = event.target.closest("[data-queue]");
  if (queue) { const item = array(snapshot.queue?.items).find(entry => entry.id === queue.dataset.id); const type = queue.dataset.queue === "pin" ? "pin-queue-item" : queue.dataset.queue === "archive" ? "archive-queue-item" : "start-next-iteration"; const payload = type === "start-next-iteration" ? { queueItemId: item.id, repoPath: item.target?.preferredRepo, objective: item.objective, changeText: item.context || `Complete one bounded generation for ${item.title}.`, acceptanceGateIds: item.acceptanceGateIds || [], limits: iterationLimits() } : { id: item.id }; await command(type, payload); return; }
  const gate = event.target.closest("[data-gate]");
  if (gate) {
    const record = array(snapshot.gates?.gates).find(item => item.id === gate.dataset.id) || {};
    if (gate.dataset.gate === "attach") {
      const paths = globalThis.prompt("Evidence artifact paths, one per line", array(record.requiredEvidence).join("\n"));
      if (paths === null) return;
      const artifacts = paths.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
      if (!artifacts.length) { toast("Enter at least one evidence artifact path.", true); return; }
      const notes = globalThis.prompt("Evidence notes", "Attached explicitly through the Gallery") ?? "";
      await command("attach-gate-evidence", { gateId: gate.dataset.id, runId: snapshot.selectedRunId, artifacts, notes });
      return;
    }
    if (gate.dataset.gate === "update") {
      const description = globalThis.prompt("Amended gate description", record.description || record.title || "");
      if (description === null || !description.trim()) return;
      const status = globalThis.prompt("Gate status", record.status || "pending");
      if (status === null || !status.trim()) return;
      const normalizedStatus = status.trim().toLowerCase();
      if (!["pending", "passed", "failed", "needs-evidence"].includes(normalizedStatus)) { toast("Gate status must be pending, passed, failed, or needs-evidence.", true); return; }
      await command("update-gate", { gateId: gate.dataset.id, description: description.trim(), status: normalizedStatus });
      return;
    }
    const passed = gate.dataset.gate === "pass";
    let evidenceArtifacts = [];
    if (passed) {
      const paths = globalThis.prompt("Evidence artifact paths supporting this pass, one per line", array(record.requiredEvidence).join("\n"));
      if (paths === null) return;
      evidenceArtifacts = paths.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
      if (!evidenceArtifacts.length) { toast("Passing a gate requires operator-supplied evidence paths.", true); return; }
    }
    await command("gate-decision", { gateId: gate.dataset.id, status: passed ? "passed" : "needs-evidence", decision: passed ? "accepted" : "defer", runId: snapshot.selectedRunId, evidenceArtifacts });
    return;
  }
  if (event.target.closest("#openPlanner")) { openPlanner(event.target); return; }
  if (event.target.closest("#closePlanner")) { closePlanner(); return; }
  if (event.target.closest("#closeDrawer")) { closeDrawer(); return; }
  const view = event.target.closest("[data-plan-view]")?.dataset.planView; if (view) { planView = view; renderPlanner(); return; }
  const newPlan = event.target.closest("[data-new-plan]")?.dataset.newPlan;
  if (newPlan) { try { const result = await client.createProjectPlan({ content: defaultPlan(newPlan) }, { refresh: true }); selectedPlanId = result.planId; await client.refreshPlans(); await loadPlan(selectedPlanId); planView = "editor"; renderPlanner(); } catch (error) { toast(error.message, true); } return; }
  const planId = event.target.closest("[data-plan-id]")?.dataset.planId; if (planId) { await loadPlan(planId); planView = "editor"; renderPlanner(); return; }
  const action = event.target.closest("[data-plan-action]")?.dataset.planAction; if (action && PROJECT_PLAN_ACTIONS.includes(action)) { await planAction(action); return; }
  const newAssistance = event.target.closest("[data-new-assistance]")?.dataset.newAssistance;
  if (newAssistance) { try { const detail = await client.createPlanAssistance(newAssistance); assistanceId = detail.id; renderPlanner(); } catch (error) { toast(error.message, true); } return; }
  const assistance = event.target.closest("[data-assistance-id]")?.dataset.assistanceId;
  if (assistance) { try { assistanceId = assistance; await client.getPlanAssistance(assistance); renderPlanner(); } catch (error) { toast(error.message, true); } return; }
  if (event.target.closest("[data-create-proposal]")) { const proposal = snapshot.assistanceDetail?.proposedContent; if (proposal) { try { const result = await client.createProjectPlan({ content: proposal }, { refresh: true }); selectedPlanId = result.planId; await client.refreshPlans(); await loadPlan(selectedPlanId); planView = "editor"; renderPlanner(); } catch (error) { toast(error.message, true); } } }
});

document.addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.target;
  if (form.id === "steerForm") { await command("steer", Object.fromEntries(new FormData(form))); form.reset(); }
  if (form.id === "deblockForm") { await command("deblock", { ...Object.fromEntries(new FormData(form)), runId: snapshot.state?.currentRunId || snapshot.selectedRunId }); form.reset(); }
  if (form.id === "queueForm") { const payload = Object.fromEntries(new FormData(form)); payload.pin = form.elements.pin.checked; payload.source = "swarm-gallery"; await command("add-queue-item", payload); form.reset(); }
  if (form.id === "gateForm") { await command("add-gate", Object.fromEntries(new FormData(form))); form.reset(); }
  if (form.id === "commandForm") { const values = Object.fromEntries(new FormData(form)); try { await command(values.type, safeJson(values.payload)); } catch (error) { toast(error.message, true); } }
  if (form.id === "planEditor") {
    const detail = selectedPlan(); if (!detail) return;
    try { const values = Object.fromEntries(new FormData(form)); const content = safeJson(values.content); Object.assign(content, { pipelineType: values.pipelineType, title: values.title, problem: values.problem, intendedUsers: values.intendedUsers, objective: values.objective, boundedScope: values.boundedScope }); await client.updateProjectPlan({ planId: detail.ledger.planId, content }, { expectedVersion: detail.ledger.version, refresh: true }); await loadPlan(detail.ledger.planId); toast("Plan revision saved."); } catch (error) { toast(error.message, true); }
  }
  if (form.id === "assistanceForm") { const detail = snapshot.assistanceDetail; try { await client.messagePlanAssistance(detail.id, detail.version, String(new FormData(form).get("message"))); form.reset(); renderPlanner(); } catch (error) { toast(error.message, true); } }
});

$("globalSearch").addEventListener("input", event => { searchQuery = event.target.value.trim().toLowerCase(); renderAgents(); renderArchiveIndex(); renderEvents(); });
$("refreshAll").addEventListener("click", () => client.refresh().catch(error => toast(error.message, true)));
$("pauseStream").addEventListener("click", () => snapshot.connection.paused ? client.resume().catch(error => toast(error.message, true)) : client.pause());
$("toggleConnection").addEventListener("click", () => snapshot.connection.status === "disconnected" ? client.connect().catch(error => toast(error.message, true)) : client.disconnect());

const rooms = [...document.querySelectorAll("main > .room")];
const roomObserver = new IntersectionObserver(entries => {
  const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (!visible) return;
  const link = document.querySelector(`[data-room-link="${visible.target.id}"]`);
  document.querySelectorAll("[data-room-link]").forEach(item => item.classList.toggle("active", item === link));
  $("currentRoomLabel").textContent = link?.textContent.replace(/^\d+/, "").trim() || visible.target.id;
}, { rootMargin: "-30% 0px -55%", threshold: [0, .1, .5] });
rooms.forEach(room => roomObserver.observe(room));

document.addEventListener("keydown", event => {
  if (event.key === "Escape") { if (!$("planner").hidden) closePlanner(); else if (!$("detailDrawer").hidden) closeDrawer(); return; }
  if (event.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) { event.preventDefault(); $("globalSearch").focus(); return; }
  if (event.altKey && ["ArrowDown", "ArrowUp"].includes(event.key)) {
    event.preventDefault();
    const activeRoom = rooms.findIndex(room => document.querySelector(`[data-room-link="${room.id}"]`)?.classList.contains("active"));
    const next = Math.max(0, Math.min(rooms.length - 1, activeRoom + (event.key === "ArrowDown" ? 1 : -1)));
    rooms[next].scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    rooms[next].focus({ preventScroll: true });
  }
  if (!$("planner").hidden && event.key === "Tab") {
    const focusable = [...$("planner").querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href]')].filter(item => item.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});

setupCommandOptions();
client.subscribe(next => { snapshot = next; scheduleRender(); });
client.connect().catch(error => toast(`Gallery data unavailable: ${error.message}`, true));
