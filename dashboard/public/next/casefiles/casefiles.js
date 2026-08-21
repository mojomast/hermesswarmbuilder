import { createDashboardClient, WORKFLOW_PHASES } from '../../headless-dashboard-client.js';

const client = createDashboardClient({ maxEvents: 1000, maxRawMessages: 80 });
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
const values = (value) => Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : value == null ? [] : [value];
const lineList = (value) => String(value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
const first = (...items) => items.find((item) => item !== undefined && item !== null && item !== '');
const formatDate = (value) => { if (!value) return 'Not reported'; const date = new Date(value); return Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'medium' }); };
const json = (value) => JSON.stringify(value, null, 2);
const artifactName = (value) => String(value || '').replace(/^\/?artifacts\//, '');
const uuid = (prefix) => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;

const ui = {
  tab: localStorage.getItem('casefiles.tab') || 'brief',
  query: '',
  paused: false,
  planTab: 'ledger',
  selectedPlanId: null,
  planDetail: null,
  selectedAssistanceId: null,
  assistanceDetail: null,
  busy: false,
  returnFocus: null,
};

function objective(snapshot) {
  const pinned = values(snapshot.queue?.items).find((item) => item.id === snapshot.control?.pinnedQueueItemId || item.status === 'pinned');
  return first(snapshot.control?.currentObjective?.text, pinned?.objective, snapshot.selectedRun.run?.objective, snapshot.state?.task, snapshot.state?.currentTask, snapshot.state?.selectedProject?.objective, 'No case brief filed.');
}
function iterationLimits(maxIterations = 1) { return { maxIterations: Number(maxIterations) || 1, maxVariantsPerIteration: 3, maxParallelVariants: 3, maxAcceptedFeatures: 4, maxVisualMotifChanges: 1, maxNewSections: 1, stopAfterNoImprovement: 1, minImprovementScore: 0.05 }; }

function investigators(snapshot) {
  const source = snapshot.state?.agents || {};
  const records = values(source).map((agent) => ({
    id: first(agent.id, agent.label, agent.role, 'unknown'),
    label: first(agent.label, agent.role, agent.id, 'Unknown investigator'),
    role: agent.role || 'investigator', status: agent.status || 'idle',
    task: first(agent.currentTask, agent.task, agent.lastMessage, 'No active assignment'),
    phase: first(agent.currentPhase, snapshot.state?.phase, snapshot.state?.status, 'idle'),
    artifact: agent.currentArtifact, updatedAt: first(agent.updatedAt, snapshot.state?.updatedAt), raw: agent,
  }));
  const known = new Set(records.map((record) => record.id));
  for (const event of snapshot.events) {
    const id = first(event.agentId, event.data?.agentId);
    if (id && id !== 'system' && !known.has(id)) {
      known.add(id); records.push({ id, label: id, role: 'journal-derived investigator', status: 'observed', task: event.message || event.type, phase: event.data?.phase || snapshot.state?.phase, updatedAt: event.ts, raw: event });
    }
  }
  if (!known.has('main-orchestrator')) records.unshift({ id: 'main-orchestrator', label: 'Lead investigator', role: 'workflow orchestrator', status: snapshot.state?.status || 'idle', task: first(snapshot.state?.currentTask, snapshot.state?.task, snapshot.state?.lastAction, 'Monitoring case'), phase: snapshot.state?.phase, updatedAt: snapshot.state?.updatedAt, raw: snapshot.state });
  return records;
}

function toolCalls(snapshot) {
  const calls = new Map();
  for (const event of snapshot.events) {
    const data = event.data || {};
    if (!String(event.type).startsWith('tool-call') && !data.toolName && !data.toolCallId && !data.tool) continue;
    const id = first(data.toolCallId, data.id, event.id);
    const prior = calls.get(id) || {};
    calls.set(id, { ...prior, id, name: first(data.toolName, data.tool, data.name, 'tool'), agentId: first(event.agentId, data.agentId, prior.agentId, event.source), action: first(data.action, data.command, data.summary, event.message, prior.action), input: first(data.input, data.args, data.sanitizedInput, prior.input), output: first(data.output, data.result, data.sanitizedOutput, prior.output), error: first(data.error, prior.error), status: String(event.type).includes('error') ? 'error' : String(event.type).includes('end') ? 'done' : first(data.status, prior.status, 'running'), updatedAt: event.ts });
  }
  return [...calls.values()];
}

function matches(record) {
  if (!ui.query) return true;
  return JSON.stringify(record).toLowerCase().includes(ui.query.toLowerCase());
}

function badge(status) { return `<span class="badge ${esc(status)}">${esc(status || 'unknown')}</span>`; }
function empty(message = 'No filed material in this section.') { return `<div class="empty"><strong>No record entered</strong><p>${esc(message)}</p></div>`; }
function header(title, note = '') { return `<header class="section-head"><h2>${esc(title)}</h2>${note ? `<p>${esc(note)}</p>` : ''}</header>`; }
function field(label, value) { return `<div class="field-record"><span>${esc(label)}</span><strong>${esc(value ?? 'Not reported')}</strong></div>`; }
function currentIteration(snapshot) { return snapshot.iterationDetail || snapshot.iterations.find((item) => item.id === snapshot.selectedIterationId || item.runId === snapshot.selectedRunId); }

function renderPhases(snapshot) {
  const phase = first(snapshot.state?.phase, snapshot.state?.status, 'idle');
  const index = WORKFLOW_PHASES.indexOf(phase);
  $('#phases').innerHTML = WORKFLOW_PHASES.map((item, position) => `<li class="${item === phase ? 'current' : position < index ? 'done' : ''}" ${item === phase ? 'aria-current="step"' : ''}>${esc(item)}</li>`).join('');
}

function renderRuns(snapshot) {
  const focusedRunId = document.activeElement?.closest?.('[data-run]')?.dataset.run;
  const runs = snapshot.runs.filter(matches);
  $('#caseCount').textContent = `${snapshot.runs.length} indexed`;
  $('#runList').innerHTML = runs.map((run) => {
    const id = first(run.id, run.runId);
    return `<button class="case-folder" role="option" aria-selected="${id === snapshot.selectedRunId}" data-run="${esc(id)}"><b>${esc(id)}</b><small>${esc(first(run.project, run.projectName, run.objective, run.status, 'Unclassified case'))}</small><small>${esc(formatDate(first(run.updatedAt, run.startedAt, run.createdAt)))}</small></button>`;
  }).join('') || empty('No matching case folders.');
  if (focusedRunId) $(`[data-run="${CSS.escape(focusedRunId)}"]`, $('#runList'))?.focus();
}

function renderCover(snapshot) {
  const run = snapshot.selectedRun.run || snapshot.runs.find((item) => first(item.id, item.runId) === snapshot.selectedRunId) || {};
  const status = first(run.status, snapshot.selectedRunId === snapshot.state?.currentRunId && snapshot.state?.status, 'unfiled');
  $('#caseCover').innerHTML = `<span class="file-number">Case file / ${esc(snapshot.selectedRunId || 'none selected')}</span><span class="stamp">${esc(status)}</span><h1 id="caseTitle">${esc(objective(snapshot))}</h1><div class="cover-meta"><span>Opened: ${esc(formatDate(first(run.startedAt, run.createdAt)))}</span><span>Last entry: ${esc(formatDate(first(run.updatedAt, run.completedAt, snapshot.state?.updatedAt)))}</span><span>Repository: ${esc(first(run.repoPath, snapshot.state?.repoPath, 'Not reported'))}</span></div>`;
}

function renderIndex(snapshot) {
  const run = snapshot.selectedRun.run || {};
  const events = snapshot.events.filter((event) => !snapshot.selectedRunId || event.runId === snapshot.selectedRunId);
  $('#caseIndex').innerHTML = `<dt>File number</dt><dd>${esc(snapshot.selectedRunId || 'None')}</dd><dt>Current phase</dt><dd>${esc(first(snapshot.state?.phase, run.phase, 'Not reported'))}</dd><dt>Investigators</dt><dd>${investigators(snapshot).length}</dd><dt>Journal entries</dt><dd>${events.length}</dd><dt>Exhibits</dt><dd>${snapshot.selectedRun.artifacts.length + snapshot.selectedRun.logs.length}</dd><dt>Findings</dt><dd>${values(snapshot.gates?.gates).length}</dd><dt>Iterations</dt><dd>${snapshot.iterations.length}</dd>`;
  $('#connection').textContent = ui.paused ? 'File paused' : `${snapshot.connection.status}${snapshot.connection.transport ? ` / ${snapshot.connection.transport}` : ''}`;
  $('#connection').className = `connection ${esc(snapshot.connection.status)}`;
  $('#toggleConnection').textContent = snapshot.connection.status === 'disconnected' ? 'Reconnect' : 'Disconnect';
  $('#alerts').innerHTML = snapshot.error ? `<div class="alert"><strong>Registry error</strong><p>${esc(snapshot.error.message)}</p></div>` : '';
}

function renderBrief(snapshot) {
  const run = snapshot.selectedRun.run || {};
  const control = snapshot.control || {};
  const pinned = values(snapshot.queue?.items).find((item) => item.id === control.pinnedQueueItemId || item.status === 'pinned');
  const decisions = values(first(run.decisions, snapshot.state?.decisions)).slice(-8).reverse();
  return `${header('Case brief', 'Objective, lifecycle, and controlling record')}
    <section class="document-section"><h3>Statement of objective</h3><p>${esc(objective(snapshot))}</p></section>
    <div class="brief-grid">${field('Case status', first(run.status, snapshot.state?.status))}${field('Workflow phase', first(run.phase, snapshot.state?.phase))}${field('Current activity', first(snapshot.state?.lastAction, snapshot.state?.currentTask, snapshot.state?.task))}${field('Pinned intake', first(pinned?.title, pinned?.id, 'None'))}${field('Run admission', control.runAdmission || 'Not reported')}${field('Elapsed / completed', first(run.duration, run.completedAt ? formatDate(run.completedAt) : 'In progress'))}</div>
    <section class="document-section"><h3>Recorded decisions</h3>${decisions.length ? `<ol>${decisions.map((item) => `<li>${esc(typeof item === 'string' ? item : first(item.message, item.decision, json(item)))}</li>`).join('')}</ol>` : empty('No decisions recorded.')}</section>
    <div class="row-actions"><button data-command="run-now">Run now</button><button data-command="pause">Pause</button><button data-command="resume">Resume</button><button data-command="hold">Hold intake</button><button data-command="unhold">Release hold</button><button class="danger" data-command="stop">Stop</button><button data-load-document="spec">Open SPEC exhibit</button><button data-load-document="devplan">Open devplan exhibit</button></div>`;
}

function renderInvestigators(snapshot) {
  const tools = toolCalls(snapshot);
  const rows = investigators(snapshot).filter(matches);
  return `${header('Investigators', `${rows.length} assigned or observed`)}<div class="investigator-list">${rows.map((agent) => {
    const agentTools = tools.filter((tool) => tool.agentId === agent.id);
    return `<details class="investigator-row"><summary><strong>${esc(agent.label)}</strong><br>${badge(agent.status)}</summary><div><b>${esc(agent.role)}</b><p>${esc(agent.task)}</p><small>Phase ${esc(agent.phase)} / last observed ${esc(formatDate(agent.updatedAt))}</small>${agentTools.length ? `<h4>Tool record (${agentTools.length})</h4>${agentTools.map((tool) => `<button data-raw-title="Tool call: ${esc(tool.name)}" data-raw-value="${esc(json(tool))}">${esc(tool.name)} / ${esc(tool.status)} / ${esc(tool.action)}</button>`).join('')}` : ''}</div><button data-raw-title="Investigator record" data-raw-value="${esc(json(agent.raw))}">Raw record</button></details>`;
  }).join('') || empty('No matching investigators.')}</div>`;
}

function renderJournal(snapshot) {
  const events = snapshot.events.filter((event) => (!snapshot.selectedRunId || !event.runId || event.runId === snapshot.selectedRunId) && matches(event)).slice().reverse();
  return `${header('Chronological case notes', `${events.length} visible journal entries`)}<ol class="case-notes">${events.map((event) => `<li class="case-note"><time datetime="${esc(event.ts)}">${esc(formatDate(event.ts))}</time><div class="note-paper"><header>${badge(event.level)}<strong>${esc(event.source)}</strong><span class="badge">${esc(event.type)}</span></header><p>${esc(event.message || 'No narrative entered.')}</p><small>Entry ${esc(event.id)}${event.agentId ? ` / investigator ${esc(event.agentId)}` : ''}</small><details><summary>Inspect original entry</summary><pre class="raw">${esc(json(event.raw || event))}</pre></details></div></li>`).join('') || empty('No matching journal entries.')}</ol>`;
}

function fileRows(files, kind) {
  return files.filter(matches).map((file) => `<tr><td><i class="ribbon ${kind}"></i>${esc(kind === 'artifact' ? 'EX' : 'LG')}</td><td><button data-exhibit-kind="${kind}" data-exhibit-name="${esc(file.name)}"><strong>${esc(file.name)}</strong></button></td><td>${esc(file.size ?? 'Unknown')} bytes</td><td>${esc(formatDate(first(file.modifiedAt, file.updatedAt, file.createdAt)))}</td><td>System record; transfer history not reported</td></tr>`).join('');
}
function renderExhibits(snapshot) {
  const selected = snapshot.selectedRun.artifact || snapshot.selectedRun.log || snapshot.selectedRun.document;
  const preview = selected ? `<section class="document-section"><h3>Open exhibit: ${esc(selected.name)}</h3><div class="evidence-ribbon ${snapshot.selectedRun.log === selected ? 'log' : ''}">Source case ${esc(selected.runId)} / retrieved ${esc(formatDate(new Date().toISOString()))} / hash not reported</div><pre class="raw">${esc(selected.text)}</pre></section>` : '';
  return `${header('Exhibit register', `${snapshot.selectedRun.artifacts.length} artifacts / ${snapshot.selectedRun.logs.length} logs`)}<table class="exhibit-register"><thead><tr><th>Class</th><th>Exhibit</th><th>Extent</th><th>Recorded</th><th>Custody note</th></tr></thead><tbody>${fileRows(snapshot.selectedRun.artifacts, 'artifact')}${fileRows(snapshot.selectedRun.logs, 'log')}</tbody></table>${!snapshot.selectedRun.artifacts.length && !snapshot.selectedRun.logs.length ? empty('No exhibits filed for this case.') : ''}${preview}`;
}

function evidenceText(gate) {
  const required = values(gate.requiredEvidence);
  const attached = values(gate.evidence).flatMap((item) => values(item.artifacts || item.evidenceArtifacts || item));
  return [...required.map((item) => `Required: ${item}`), ...attached.map((item) => `Attached: ${item}`)].join(' / ') || 'No evidence path reported';
}
function renderFindings(snapshot) {
  const gates = values(snapshot.gates?.gates).filter(matches);
  return `${header('Findings & acceptance gates', `${gates.length} controlling findings`)}
    <section class="document-section"><h3>Finding register</h3>${gates.map((gate) => `<article class="finding-row"><div><i class="ribbon finding"></i><strong>${esc(gate.id)}</strong><p>${badge(gate.status)} ${badge(gate.severity)}</p></div><div><p>${esc(first(gate.description, gate.title, 'No finding narrative'))}</p><div class="evidence-ribbon finding">${esc(evidenceText(gate))}</div><small>Phase ${esc(gate.phase || 'not reported')}</small></div><div class="row-actions"><button data-gate-decision="passed" data-gate-id="${esc(gate.id)}">Pass</button><button data-gate-decision="needs-evidence" data-gate-id="${esc(gate.id)}">Needs evidence</button><button data-gate-evidence="${esc(gate.id)}">Attach evidence</button><button data-gate-update="${esc(gate.id)}">Amend</button><button data-raw-title="Finding record" data-raw-value="${esc(json(gate))}">Raw</button></div></article>`).join('') || empty('No findings configured.')}</section>
    <section class="document-section"><h3>Create finding</h3><form id="gateForm" class="stack-form"><label>Finding ID<input name="id" required></label><label>Description<textarea name="description" required></textarea></label><label>Phase<input name="phase" value="final-audit"></label><label>Severity<select name="severity"><option>must</option><option>should</option></select></label><label>Required evidence, one path per line<textarea name="requiredEvidence"></textarea></label><div class="form-actions"><button class="ink" type="submit">File finding</button></div></form></section>`;
}

function iterationEvidence(detail) {
  const records = [];
  const add = (value) => { if (Array.isArray(value)) return value.forEach(add); if (typeof value === 'string') records.push(value); else if (value && typeof value === 'object') records.push(first(value.path, value.file, value.name, value.href, value.url, json(value))); };
  for (const source of [detail.sourceEvidence, detail.evidence, detail.artifacts, detail.logs, detail.screenshots, detail.testResults]) add(source);
  return records.slice(0, 30);
}
function gateRows(detail) {
  const direct = values(detail.gateDecisions);
  if (direct.length) return direct;
  if (detail.acceptanceGateResults && typeof detail.acceptanceGateResults === 'object') return Object.entries(detail.acceptanceGateResults).map(([id, status]) => ({ id, status }));
  return detail.gateStatus ? [{ id: 'final-gate', status: detail.gateStatus }] : [];
}
function iterationDetail(detail) {
  const variants = values(detail.variants), evaluations = values(detail.evaluations), synthesis = detail.synthesis || {};
  const accepted = values(first(synthesis.acceptedFeatures, synthesis.accepted, detail.acceptedFeatures));
  const rejected = values(first(synthesis.rejectedFeatures, synthesis.rejected, detail.rejectedFeatures, synthesis.doNotInclude));
  const sourceAttrs = `data-source-iteration="${esc(detail.id)}" data-source-run="${esc(detail.runId)}" data-repo="${esc(first(detail.repoPath, detail.run?.repoPath, ''))}" data-base="${esc(first(detail.commit, detail.run?.commit, 'HEAD'))}"`;
  return `<section class="document-section"><h3>Iteration record / ${esc(detail.id)}</h3><div class="metrics">${field('Status', detail.status)}${field('Gate', first(detail.gateStatus, detail.evidence?.gateReport?.data?.status))}${field('Variants', variants.length)}${field('Repository', first(detail.repoPath, detail.run?.repoPath))}${field('Commit', first(detail.commit, detail.run?.commit))}${field('Started', formatDate(detail.startedAt))}</div><p>${esc(first(detail.objective, 'No iteration objective recorded.'))}</p><div class="row-actions"><button data-lineage="continue" ${sourceAttrs}>Continue</button><button data-lineage="fork" ${sourceAttrs}>Fork</button><button data-lineage="use-as-next-direction" ${sourceAttrs}>Use as next direction</button><button data-raw-title="Complete iteration payload" data-raw-value="${esc(json(detail))}">Raw iteration</button></div></section>
    <section class="document-section"><h3>Evidence inventory</h3>${iterationEvidence(detail).map((item) => `<div class="evidence-ribbon">${esc(item)}</div>`).join('') || empty('No source evidence reported.')}</section>
    <section class="document-section"><h3>Variant evaluations</h3>${variants.map((variant, index) => { const key = first(variant.variantId, variant.id, variant.name, `variant-${index + 1}`); const evaluation = evaluations.find((item) => first(item.variantId, item.variant, item.id) === key) || evaluations[index] || {}; const score = first(evaluation.scores?.total, evaluation.weightedScore, evaluation.score, variant.score, 'Not scored'); return `<details class="iteration-row"><summary><strong>${esc(first(variant.title, variant.name, variant.claim, key))}</strong><br>${badge(first(evaluation.verdict, evaluation.decision, 'evaluated'))}</summary><div><p>${esc(first(variant.summary, variant.rationale, evaluation.rationale, 'No rationale filed.'))}</p><div class="metrics">${field('Total score', score)}${field('Objective fit', first(evaluation.scores?.objectiveFit, evaluation.objectiveFit))}${field('Accessibility', first(evaluation.scores?.accessibility, evaluation.accessibility))}${field('Performance', first(evaluation.scores?.performance, evaluation.performance))}</div></div><button data-raw-title="Variant and evaluation" data-raw-value="${esc(json({ variant, evaluation }))}">Raw</button></details>`; }).join('') || empty('No variant evidence filed.')}</section>
    <section class="document-section"><h3>Synthesis</h3><div class="feature-columns"><div><h4>Accepted</h4><ul>${accepted.map((item) => `<li>${esc(typeof item === 'string' ? item : first(item.title, item.feature, item.description, json(item)))}</li>`).join('') || '<li>None recorded</li>'}</ul></div><div><h4>Rejected / deferred</h4><ul>${rejected.map((item) => `<li>${esc(typeof item === 'string' ? item : first(item.title, item.feature, item.description, json(item)))}</li>`).join('') || '<li>None recorded</li>'}</ul></div></div><p>${esc(first(synthesis.rationale, synthesis.summary, synthesis.mashupStrategy, 'No synthesis rationale recorded.'))}</p></section>
    <section class="document-section"><h3>Gate decisions</h3>${gateRows(detail).map((gate) => `<div class="finding-row"><strong>${esc(first(gate.gateId, gate.id, gate.name, 'gate'))}</strong><span>${badge(first(gate.status, gate.decision))}</span><button data-raw-title="Iteration gate" data-raw-value="${esc(json(gate))}">Raw</button></div>`).join('') || empty('No iteration gate decisions filed.')}</section>`;
}

function renderIterations(snapshot) {
  const detail = currentIteration(snapshot);
  return `${header('Iteration lineage', `${snapshot.iterations.length} generations indexed`)}<section class="document-section"><h3>Generation index</h3>${snapshot.iterations.filter(matches).map((item) => `<div class="iteration-row"><button data-iteration="${esc(item.id)}"><strong>${esc(first(item.objective, item.id))}</strong><br><small>${esc(item.id)} / run ${esc(item.runId || 'unlinked')}</small></button><div>${badge(item.status)} ${badge(first(item.gateStatus, 'gate unknown'))}<br><small>${esc(formatDate(first(item.startedAt, item.createdAt)))}</small></div><button data-iteration="${esc(item.id)}">Open record</button></div>`).join('') || empty('No iterations indexed.')}</section>${detail ? iterationDetail(detail) : ''}`;
}

function renderIntake(snapshot) {
  const items = values(snapshot.queue?.items).filter(matches);
  return `${header('Intake queue', `${items.length} submissions`)}<section class="document-section"><h3>Intake register</h3>${items.map((item) => `<div class="intake-row"><div><strong>${esc(first(item.title, item.id))}</strong><br>${badge(item.status)} <span class="badge">priority ${esc(item.priority)}</span></div><div><p>${esc(item.objective || 'No objective')}</p><small>${esc(item.context || '')}</small></div><div class="row-actions"><button data-queue-pin="${esc(item.id)}">Pin</button><button data-queue-use="${esc(item.id)}">Open case</button><button class="danger" data-queue-archive="${esc(item.id)}">Archive</button></div></div>`).join('') || empty('Intake queue is empty.')}</section><section class="document-section"><h3>Register intake</h3><form id="queueForm" class="stack-form"><label>Title<input name="title" required></label><label>Objective<textarea name="objective" required></textarea></label><label>Context<textarea name="context"></textarea></label><label>Constraints, one per line<textarea name="constraints"></textarea></label><label>Priority<input name="priority" type="number" min="1" max="100" value="50"></label><label><input name="pin" type="checkbox" style="width:auto"> Pin upon filing</label><div class="form-actions"><button class="ink" type="submit">Add to intake</button><button data-command="clear-queue" class="danger" type="button">Clear queue</button></div></form></section>`;
}

function renderDeblock(snapshot) {
  const blocker = first(snapshot.state?.block, snapshot.state?.blocker, snapshot.state?.hold, snapshot.control?.pause?.requested && snapshot.control.pause);
  const advice = values(snapshot.control?.deblockAdvice).find((item) => item.status === 'pending');
  if (!blocker && !advice) return '';
  return `<section class="deblock"><h3>${blocker ? 'Case blocked or held' : 'Recovery advice pending'}</h3>${blocker ? `<p>${esc(first(blocker.reason, blocker.message, String(blocker)))}</p>` : ''}<form id="deblockForm" class="stack-form"><label>Recovery direction<textarea name="prompt" maxlength="8000" placeholder="Focused recovery instruction"></textarea></label><input name="runId" type="hidden" value="${esc(snapshot.state?.currentRunId || snapshot.selectedRunId || '')}"><div class="form-actions"><button class="ink" type="submit">Issue deblock direction</button><button id="askAdvice" type="button">Ask for advice</button></div></form>${advice ? `<div class="document-section"><h3>Advice ${esc(advice.id)}</h3><p>${esc(advice.answer)}</p><div class="row-actions"><button data-advice="approve" data-advice-id="${esc(advice.id)}">Approve</button><button data-advice="deny" data-advice-id="${esc(advice.id)}">Deny</button></div></div>` : ''}</section>`;
}

function renderControls(snapshot) {
  const control = snapshot.control || {}, auto = control.autoIteration || {}, steering = values(control.activeSteering);
  const target = Number(first(auto.targetGenerations, auto.maxIterations, 10));
  return `${header('Control orders', 'Live workflow, steering, recovery, and showcase controls')}${renderDeblock(snapshot)}<div class="control-grid">
    <section class="control-sheet"><h3>Workflow lifecycle</h3><p>Admission: <strong>${esc(control.runAdmission || 'not reported')}</strong></p><div class="row-actions"><button data-command="run-now">Run now</button><button data-command="pause">Pause</button><button data-command="resume">Resume</button><button data-command="hold">Hold</button><button data-command="unhold">Unhold</button><button class="danger" data-command="stop">Stop</button></div></section>
    <section class="control-sheet"><h3>Showcase authorization</h3><p>${esc(first(auto.completedGenerations, 0))} of ${esc(target)} generations / ${auto.enabled ? 'active' : 'manual'}</p><label>Target generations<input id="showcaseTarget" type="number" min="1" max="10" value="${esc(target)}"></label><div class="row-actions"><button id="startShowcase" class="ink">Start showcase</button><button id="setShowcaseTarget">Set target</button><button data-command="pause-showcase-loop">Pause</button><button data-command="resume-showcase-loop">Resume</button><button data-command="stop-showcase-loop" class="danger">Stop</button><button id="startNext">Next generation</button></div></section>
    <section class="control-sheet"><h3>Steering orders</h3><form id="steerForm" class="stack-form"><label>Scope<select name="scope"><option value="current_run">Current run</option><option value="next_run">Next run</option><option value="queue">Queue</option></select></label><label>Direction<textarea name="text" required></textarea></label><button class="ink" type="submit">Enter steering order</button></form>${steering.map((item) => `<div class="finding-row"><div><strong>${esc(first(item.scope, item.id))}</strong><p>${esc(first(item.text, item.directive))}</p></div><small>${esc(formatDate(first(item.createdAt, item.updatedAt)))}</small><button data-steering-remove="${esc(item.id)}">Remove</button></div>`).join('')}</section>
    <section class="control-sheet"><h3>Current objective</h3><form id="objectiveForm" class="stack-form"><label>Case brief<textarea name="text" required>${esc(objective(snapshot))}</textarea></label><button class="ink" type="submit">Replace objective</button></form></section>
  </div><section class="document-section"><h3>Control audit trail</h3><ol>${snapshot.audit.filter(matches).map((item) => `<li><strong>${esc(first(item.type, item.action, 'record'))}</strong> / ${esc(formatDate(first(item.ts, item.createdAt)))} / ${esc(first(item.actor, item.createdBy, 'system'))}<details><summary>Raw audit entry</summary><pre class="raw">${esc(json(item))}</pre></details></li>`).join('') || '<li>No audit entries.</li>'}</ol></section>`;
}

const renderers = { brief: renderBrief, investigators: renderInvestigators, journal: renderJournal, exhibits: renderExhibits, findings: renderFindings, iterations: renderIterations, intake: renderIntake, controls: renderControls };
function renderPanel(snapshot) {
  const active = document.activeElement;
  if ($('#recordPanel').contains(active) && active.matches('input, textarea, select')) return;
  const focus = active?.id ? { id: active.id } : active?.dataset && Object.keys(active.dataset).length ? { data: { ...active.dataset } } : null;
  $('#recordPanel').innerHTML = renderers[ui.tab](snapshot);
  if (!active?.isConnected && focus) {
    const selector = focus.data ? Object.entries(focus.data).map(([key, value]) => `[data-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}="${CSS.escape(value)}"]`).join('') : '';
    const target = focus.id ? document.getElementById(focus.id) : selector ? $('#recordPanel').querySelector(selector) : null;
    target?.focus({ preventScroll: true });
  }
}
function render(snapshot) { renderPhases(snapshot); renderRuns(snapshot); renderCover(snapshot); renderIndex(snapshot); renderPanel(snapshot); }

function selectTab(name, focus = false) {
  ui.tab = name; localStorage.setItem('casefiles.tab', name);
  $$('[data-tab]').forEach((tab) => { const selected = tab.dataset.tab === name; tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1; });
  renderPanel(client.getSnapshot());
  if (focus) $(`[data-tab="${CSS.escape(name)}"]`)?.focus();
}

async function command(type, payload = {}) {
  setNotice(`Filing ${type}...`);
  try { await client.command(type, payload); await client.refresh(); setNotice(`${type} filed.`); }
  catch (error) { setNotice(error.message || String(error), true); }
}
function setNotice(message, error = false) { $('#alerts').innerHTML = `<div class="alert" ${error ? 'role="alert"' : ''}>${esc(message)}</div>`; }

function openRaw(title, value) {
  $('#recordDialogTitle').textContent = title;
  $('#recordDialogBody').innerHTML = `<pre class="raw">${esc(typeof value === 'string' ? value : json(value))}</pre>`;
  openDialog($('#recordDialog'));
}
function openDialog(dialog) { ui.returnFocus = document.activeElement; dialog.showModal(); dialog.querySelector('h2')?.focus(); }
function closeDialog(dialog) { dialog.close(); if (ui.returnFocus instanceof HTMLElement) ui.returnFocus.focus(); }

function planDefaults(pipelineType) {
  return { pipelineType, title: '', problem: '', intendedUsers: '', objective: '', boundedScope: '', requirements: [], nonGoals: [], constraints: [], risks: [], repository: { path: null, baseRef: null, baseCommit: null }, acceptanceGates: [], validationPolicy: { id: 'apb.runner-selected.v1', expectations: [], clientCommandsAllowed: false }, milestones: [], limits: { maxIterations: 1, maxVariantsPerIteration: 3, maxParallelVariants: 3, maxAcceptedFeatures: 4, maxVisualMotifChanges: 1, maxNewSections: 1, stopAfterNoImprovement: 1 }, lineage: { mode: 'new', sourcePlanId: null, sourceRevision: null, sourceRunId: null, sourceIterationId: null } };
}
function planField(name, label, value, textarea = false, wide = false) { return `<label class="${wide ? 'wide' : ''}"><span>${esc(label)}</span>${textarea ? `<textarea name="${name}">${esc(value || '')}</textarea>` : `<input name="${name}" value="${esc(value || '')}">`}</label>`; }
function gatesToText(gates) { return values(gates).map((gate) => `${gate.id} | ${gate.description} | ${gate.severity} | ${values(gate.requiredEvidence).join(', ')}`).join('\n'); }
function parseGates(text) { return lineList(text).map((line, index) => { const [id, description, severity = 'must', evidence = ''] = line.split('|').map((part) => part.trim()); const requiredEvidence = evidence.split(',').map((part) => part.trim()).filter(Boolean); return { id: id || `gate-${index + 1}`, description, severity, required: requiredEvidence.length > 0, requiredEvidence }; }); }

async function loadPlan(planId) { ui.selectedPlanId = planId; ui.planDetail = planId ? await client.getProjectPlan(planId) : null; renderPlans(); }
async function refreshPlans() { await client.refreshPlans(); if (!ui.selectedPlanId && client.getSnapshot().plans[0]) ui.selectedPlanId = client.getSnapshot().plans[0].planId; if (ui.selectedPlanId) ui.planDetail = await client.getProjectPlan(ui.selectedPlanId); renderPlans(); }
function planLedger() {
  const plans = client.getSnapshot().plans, detail = ui.planDetail;
  return `<div class="plan-ledger"><aside><div class="form-actions"><button data-new-plan="classic">New classic</button><button data-new-plan="managed">New managed</button></div><div class="plan-list">${plans.map((plan) => `<button class="plan-row ${plan.planId === ui.selectedPlanId ? 'active' : ''}" data-select-plan="${esc(plan.planId)}"><strong>${esc(plan.title || 'Untitled authorization')}</strong><small>${esc(plan.pipelineType)} / ${esc(plan.state)} / revision ${esc(plan.currentRevision)}</small></button>`).join('') || empty('No authorizations filed.')}</div></aside><section class="plan-detail">${detail ? `<h3>${esc(detail.revision.content.title || 'Untitled authorization')}</h3><div class="brief-grid">${field('State', detail.ledger.state)}${field('Revision', detail.revision.revision)}${field('Digest', detail.revision.contentDigest)}${field('Version', detail.ledger.version)}</div><p>${esc(detail.revision.content.objective || 'No objective')}</p><div class="row-actions"><button data-plan-go="editor">Edit draft</button><button data-plan-go="review">Review record</button><button data-plan-action="clone">Clone</button><button data-plan-action="fork">Fork</button><button data-plan-action="archive" class="danger">Archive</button></div>` : empty('Select an authorization.')}</section></div>`;
}
function planEditor() {
  const detail = ui.planDetail;
  if (!detail) return empty('Create or select an authorization first.');
  const content = detail.revision.content, limits = content.limits || {};
  return `<form id="planForm" class="plan-form"><div class="wide"><h3>Authorization draft</h3><p>${badge(detail.ledger.state)} revision ${esc(detail.revision.revision)} / saved record only</p></div>${planField('title', 'Title', content.title)}<label>Pipeline<select name="pipelineType"><option ${content.pipelineType === 'classic' ? 'selected' : ''}>classic</option><option ${content.pipelineType === 'managed' ? 'selected' : ''}>managed</option></select></label>${planField('problem', 'Problem', content.problem, true, true)}${planField('intendedUsers', 'Intended users', content.intendedUsers, true)}${planField('objective', 'Measurable objective', content.objective, true)}${planField('boundedScope', 'Bounded scope', content.boundedScope, true, true)}${planField('requirements', 'Requirements, one per line', values(content.requirements).join('\n'), true)}${planField('nonGoals', 'Non-goals, one per line', values(content.nonGoals).join('\n'), true)}${planField('constraints', 'Constraints, one per line', values(content.constraints).join('\n'), true)}${planField('risks', 'Risks, one per line', values(content.risks).join('\n'), true)}${planField('repositoryPath', 'Repository path', content.repository?.path)}${planField('baseRef', 'Base ref', content.repository?.baseRef)}${planField('acceptanceGates', 'Gates: id | description | severity | evidence paths', gatesToText(content.acceptanceGates), true, true)}${planField('validationExpectations', 'Validation expectations', values(content.validationPolicy?.expectations).join('\n'), true)}${planField('milestones', 'Milestones', values(content.milestones).join('\n'), true)}${['maxIterations','maxVariantsPerIteration','maxParallelVariants','maxAcceptedFeatures','maxVisualMotifChanges','maxNewSections','stopAfterNoImprovement'].map((name) => planField(name, name, limits[name])).join('')}<div class="form-actions"><button class="ink" type="submit">Save revision</button><button data-plan-action="ready" type="button">Submit for review</button></div></form>`;
}
function planReview() {
  const detail = ui.planDetail;
  if (!detail) return empty('Select an authorization first.');
  const { ledger, revision } = detail;
  const launch = values(detail.launches).slice().sort((a, b) => String(a.requestedAt).localeCompare(String(b.requestedAt))).at(-1);
  return `<section class="review-sheet"><h3>Immutable saved revision</h3><dl><dt>State</dt><dd>${badge(ledger.state)}</dd><dt>Plan ID</dt><dd>${esc(ledger.planId)}</dd><dt>Revision</dt><dd>${esc(revision.revision)}</dd><dt>Digest</dt><dd>${esc(revision.contentDigest)}</dd><dt>Saved</dt><dd>${esc(formatDate(revision.createdAt))}</dd><dt>Launch</dt><dd>${esc(launch?.launchId || 'None')}</dd><dt>Run / iteration</dt><dd>${esc(launch?.runId || 'None')} / ${esc(launch?.iterationId || 'None')}</dd></dl><pre class="raw">${esc(json(revision.content))}</pre><label>Decision notes<textarea id="decisionNotes"></textarea></label><div class="row-actions"><button data-plan-action="approve">Approve exact revision</button><button data-plan-action="reject" class="danger">Reject</button></div><label><input id="launchConfirm" type="checkbox" style="width:auto"> I confirm the source/base boundary and approve execution of this exact revision.</label><div class="row-actions"><button data-plan-action="launch" class="ink">Launch authorization</button>${launch?.runId ? `<button data-monitor-run="${esc(launch.runId)}" data-monitor-iteration="${esc(launch.iterationId || '')}">Open launched case</button>` : ''}</div></section>`;
}
function assistanceView() {
  const items = client.getSnapshot().assistance, detail = ui.assistanceDetail;
  return `<div class="assist-layout"><aside><p>Suggestions are discussion only and do not save, approve, launch, or execute.</p><div class="form-actions"><button data-new-assistance="classic">Classic thread</button><button data-new-assistance="managed">Managed thread</button></div><div class="plan-list">${items.map((item) => `<button class="plan-row" data-select-assistance="${esc(item.id)}"><strong>${esc(item.pipelineType)} thread</strong><small>${esc(item.messageCount)} messages / ${esc(formatDate(item.updatedAt))}</small></button>`).join('')}</div></aside><section>${detail ? `<div class="transcript" role="log" aria-live="polite">${values(detail.messages).map((message) => `<article class="message ${esc(message.role)}"><strong>${message.role === 'user' ? 'You' : 'Planning investigator'}</strong><p>${esc(message.content)}</p><small>${esc(formatDate(message.createdAt))}</small></article>`).join('')}</div><form id="assistanceForm" class="stack-form"><label>Planning message<textarea name="message" maxlength="16000" required></textarea></label><button class="ink">Send message</button></form>${detail.proposedContent ? `<section class="document-section"><h3>Proposed authorization</h3><pre class="raw">${esc(json(detail.proposedContent))}</pre><button data-create-proposal>Create persisted proposal</button></section>` : ''}` : empty('Start or select a planning-assistance thread.')}</section></div>`;
}
const planViews = { ledger: planLedger, editor: planEditor, review: planReview, assist: assistanceView };
function renderPlans() {
  $$('[data-plan-tab]').forEach((tab) => {
    const selected = tab.dataset.planTab === ui.planTab;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  $('#planWorkspace').innerHTML = planViews[ui.planTab]();
}
async function openPlans() {
  openDialog($('#plansDialog'));
  try { await Promise.all([refreshPlans(), client.listPlanAssistance()]); renderPlans(); }
  catch (error) { planError(error); }
}
function planError(error) { const notice = $('#planNotice'); notice.hidden = false; notice.textContent = [error.message || error, ...values(error.details)].join(' / '); }
async function planAction(type, payload, options = {}) { ui.busy = true; try { const result = await client.projectPlanCommand(type, payload, options); if (["project-plan.clone", "project-plan.fork"].includes(type) && result.planId) ui.selectedPlanId = result.planId; await refreshPlans(); return result; } catch (error) { planError(error); return null; } finally { ui.busy = false; } }

function collectPlan(form) {
  const data = new FormData(form), old = ui.planDetail.revision.content, pipelineType = String(data.get('pipelineType'));
  const numeric = (name) => Number(data.get(name));
  return { ...old, pipelineType, title: String(data.get('title')), problem: String(data.get('problem')), intendedUsers: String(data.get('intendedUsers')), objective: String(data.get('objective')), boundedScope: String(data.get('boundedScope')), requirements: lineList(data.get('requirements')), nonGoals: lineList(data.get('nonGoals')), constraints: lineList(data.get('constraints')), risks: lineList(data.get('risks')), repository: pipelineType === 'managed' ? { path: String(data.get('repositoryPath')) || null, baseRef: String(data.get('baseRef')) || null, baseCommit: old.repository?.baseCommit || null } : { path: null, baseRef: null, baseCommit: null }, acceptanceGates: parseGates(data.get('acceptanceGates')), validationPolicy: { id: 'apb.runner-selected.v1', expectations: lineList(data.get('validationExpectations')), clientCommandsAllowed: false }, milestones: lineList(data.get('milestones')), limits: { maxIterations: numeric('maxIterations'), maxVariantsPerIteration: numeric('maxVariantsPerIteration'), maxParallelVariants: numeric('maxParallelVariants'), maxAcceptedFeatures: numeric('maxAcceptedFeatures'), maxVisualMotifChanges: numeric('maxVisualMotifChanges'), maxNewSections: numeric('maxNewSections'), stopAfterNoImprovement: numeric('stopAfterNoImprovement') } };
}

document.addEventListener('click', async (event) => {
  const tab = event.target.closest('[data-tab]'); if (tab) { selectTab(tab.dataset.tab); return; }
  const run = event.target.closest('[data-run]'); if (run) { await client.selectRun(run.dataset.run); $('#caseRecord').focus(); return; }
  const close = event.target.closest('[data-close-dialog]'); if (close) { closeDialog($(`#${close.dataset.closeDialog}`)); return; }
  const raw = event.target.closest('[data-raw-value]'); if (raw) { openRaw(raw.dataset.rawTitle || 'Raw record', raw.dataset.rawValue); return; }
  const exhibit = event.target.closest('[data-exhibit-kind]'); if (exhibit) { try { exhibit.dataset.exhibitKind === 'log' ? await client.loadLog(exhibit.dataset.exhibitName) : await client.loadArtifact(exhibit.dataset.exhibitName); } catch (error) { setNotice(error.message, true); } return; }
  const documentButton = event.target.closest('[data-load-document]'); if (documentButton) { try { const result = await client.loadDocument(documentButton.dataset.loadDocument); openRaw(`${documentButton.dataset.loadDocument.toUpperCase()} exhibit / ${result.name}`, result.text); } catch (error) { setNotice(error.message, true); } return; }
  const iteration = event.target.closest('[data-iteration]'); if (iteration) { await client.selectIteration(iteration.dataset.iteration); return; }
  const directCommand = event.target.closest('[data-command]'); if (directCommand) { await command(directCommand.dataset.command, { reason: 'Casefiles registry operator command' }); return; }
  const gateDecision = event.target.closest('[data-gate-decision]'); if (gateDecision) { const passed = gateDecision.dataset.gateDecision === 'passed'; await command('gate-decision', { gateId: gateDecision.dataset.gateId, status: gateDecision.dataset.gateDecision, decision: passed ? 'accepted' : 'defer', runId: client.getSnapshot().selectedRunId, evidenceArtifacts: ['artifacts/gate-report.json', 'artifacts/gate-decisions.json'] }); return; }
  const gateEvidence = event.target.closest('[data-gate-evidence]'); if (gateEvidence) { const paths = prompt('Evidence artifact paths, one per line'); if (paths !== null) await command('attach-gate-evidence', { gateId: gateEvidence.dataset.gateEvidence, runId: client.getSnapshot().selectedRunId, artifacts: lineList(paths), notes: 'Attached through Casefiles' }); return; }
  const gateUpdate = event.target.closest('[data-gate-update]'); if (gateUpdate) { const description = prompt('Amended finding description'); if (description) await command('update-gate', { gateId: gateUpdate.dataset.gateUpdate, description }); return; }
  const queuePin = event.target.closest('[data-queue-pin]'); if (queuePin) { await command('pin-queue-item', { id: queuePin.dataset.queuePin }); return; }
  const queueArchive = event.target.closest('[data-queue-archive]'); if (queueArchive) { await command('archive-queue-item', { id: queueArchive.dataset.queueArchive }); return; }
  const queueUse = event.target.closest('[data-queue-use]'); if (queueUse) { const item = values(client.getSnapshot().queue?.items).find((entry) => entry.id === queueUse.dataset.queueUse); await command('start-next-iteration', { queueItemId: item.id, repoPath: item.target?.preferredRepo, objective: item.objective, changeText: item.context || `Complete one bounded objective-linked generation for ${item.title}.`, acceptanceGateIds: item.acceptanceGateIds || [], limits: iterationLimits() }); return; }
  const remove = event.target.closest('[data-steering-remove]'); if (remove) { await command('remove-steering', { id: remove.dataset.steeringRemove }); return; }
  const advice = event.target.closest('[data-advice]'); if (advice) { await command(`${advice.dataset.advice}-deblock-advice`, { adviceId: advice.dataset.adviceId }); return; }
  const lineage = event.target.closest('[data-lineage]'); if (lineage) { await command(`${lineage.dataset.lineage}-from-iteration`.replace('use-as-next-direction-from-iteration', 'use-as-next-direction'), { sourceRunId: lineage.dataset.sourceRun, sourceIterationId: lineage.dataset.sourceIteration, repoPath: lineage.dataset.repo, baseRef: lineage.dataset.base, objective: objective(client.getSnapshot()), changeText: 'Continue one bounded objective-linked generation from the recorded evidence.', limits: iterationLimits() }); return; }
  if (event.target.closest('#askAdvice')) { const form = $('#deblockForm'); await command('deblock-advice', { prompt: form.prompt.value, runId: form.runId.value || null }); return; }
  if (event.target.closest('#startShowcase')) { const snapshot = client.getSnapshot(), target = Number($('#showcaseTarget').value); await command('start-showcase-loop', { sourceRunId: snapshot.state?.currentRunId || snapshot.selectedRunId, sourceIterationId: snapshot.selectedIterationId, repoPath: first(currentIteration(snapshot)?.repoPath, snapshot.control?.autoIteration?.repoPath, snapshot.state?.repoPath), objective: objective(snapshot), targetGenerations: target, limits: iterationLimits(target) }); return; }
  if (event.target.closest('#setShowcaseTarget')) { await command('set-showcase-target', { targetGenerations: Number($('#showcaseTarget').value) }); return; }
  if (event.target.closest('#startNext')) { const snapshot = client.getSnapshot(); await command('start-next-iteration', { runId: snapshot.state?.currentRunId || snapshot.selectedRunId, repoPath: first(snapshot.control?.autoIteration?.repoPath, snapshot.state?.repoPath), objective: objective(snapshot), changeText: 'Complete one bounded objective-linked generation without unrelated feature or stack churn.', limits: iterationLimits() }); return; }
  const planTab = event.target.closest('[data-plan-tab]'); if (planTab) { ui.planTab = planTab.dataset.planTab; renderPlans(); return; }
  const planGo = event.target.closest('[data-plan-go]'); if (planGo) { ui.planTab = planGo.dataset.planGo; renderPlans(); return; }
  const newPlan = event.target.closest('[data-new-plan]'); if (newPlan) { try { const result = await client.createProjectPlan({ content: planDefaults(newPlan.dataset.newPlan) }, { refresh: true }); ui.selectedPlanId = result.planId; await loadPlan(result.planId); ui.planTab = 'editor'; renderPlans(); } catch (error) { planError(error); } return; }
  const selectPlan = event.target.closest('[data-select-plan]'); if (selectPlan) { await loadPlan(selectPlan.dataset.selectPlan); return; }
  const action = event.target.closest('[data-plan-action]'); if (action && ui.planDetail && !ui.busy) { const detail = ui.planDetail, base = { planId: detail.ledger.planId, revision: detail.ledger.currentRevision, planDigest: detail.ledger.currentDigest }; const expectedVersion = detail.ledger.version; if (action.dataset.planAction === 'ready') await planAction('project-plan.ready-for-review', base, { expectedVersion }); if (action.dataset.planAction === 'approve') await planAction('project-plan.approve', { ...base, notes: $('#decisionNotes')?.value || '' }, { expectedVersion, idempotencyKey: uuid('approve') }); if (action.dataset.planAction === 'reject') { const notes = $('#decisionNotes')?.value.trim() || ''; if (!notes) { planError(new Error('Rejection notes are required.')); return; } await planAction('project-plan.reject', { ...base, notes }, { expectedVersion }); } if (action.dataset.planAction === 'launch') { if (!$('#launchConfirm')?.checked) { planError(new Error('Confirm the source/base safety boundary before launch.')); return; } await planAction('project-plan.launch', base, { expectedVersion, idempotencyKey: uuid('launch') }); } if (action.dataset.planAction === 'clone' || action.dataset.planAction === 'fork') await planAction(`project-plan.${action.dataset.planAction}`, { ...base, sourceRunId: null, sourceIterationId: null }, { expectedVersion, idempotencyKey: uuid(action.dataset.planAction) }); if (action.dataset.planAction === 'archive') await planAction('project-plan.archive', { planId: detail.ledger.planId }, { expectedVersion }); return; }
  const newAssistance = event.target.closest('[data-new-assistance]'); if (newAssistance) { try { ui.assistanceDetail = await client.createPlanAssistance(newAssistance.dataset.newAssistance); ui.selectedAssistanceId = ui.assistanceDetail.id; await client.listPlanAssistance(); renderPlans(); } catch (error) { planError(error); } return; }
  const selectAssistance = event.target.closest('[data-select-assistance]'); if (selectAssistance) { try { ui.selectedAssistanceId = selectAssistance.dataset.selectAssistance; ui.assistanceDetail = await client.getPlanAssistance(ui.selectedAssistanceId); renderPlans(); } catch (error) { planError(error); } return; }
  if (event.target.closest('[data-create-proposal]') && ui.assistanceDetail?.proposedContent) { try { const result = await client.createProjectPlan({ content: ui.assistanceDetail.proposedContent }, { refresh: true }); ui.selectedPlanId = result.planId; await loadPlan(result.planId); ui.planTab = 'editor'; renderPlans(); } catch (error) { planError(error); } return; }
  const monitor = event.target.closest('[data-monitor-run]'); if (monitor) { closeDialog($('#plansDialog')); await client.selectRun(monitor.dataset.monitorRun); if (monitor.dataset.monitorIteration) await client.selectIteration(monitor.dataset.monitorIteration); selectTab(monitor.dataset.monitorIteration ? 'iterations' : 'exhibits'); }
});

document.addEventListener('submit', async (event) => {
  event.preventDefault(); const form = event.target;
  if (form.id === 'queueForm') { const data = Object.fromEntries(new FormData(form)); await command('add-queue-item', { ...data, pin: form.pin.checked, source: 'casefiles' }); form.reset(); }
  if (form.id === 'gateForm') { await command('add-gate', Object.fromEntries(new FormData(form))); form.reset(); }
  if (form.id === 'deblockForm') { await command('deblock', Object.fromEntries(new FormData(form))); form.reset(); }
  if (form.id === 'steerForm') { await command('steer', Object.fromEntries(new FormData(form))); form.reset(); }
  if (form.id === 'objectiveForm') { await command('set-current-objective', { ...Object.fromEntries(new FormData(form)), source: 'casefiles', runId: client.getSnapshot().selectedRunId }); }
  if (form.id === 'planForm' && ui.planDetail) { await planAction('project-plan.update', { planId: ui.planDetail.ledger.planId, content: collectPlan(form) }, { expectedVersion: ui.planDetail.ledger.version }); }
  if (form.id === 'assistanceForm' && ui.assistanceDetail) { try { ui.assistanceDetail = await client.messagePlanAssistance(ui.assistanceDetail.id, ui.assistanceDetail.version, String(new FormData(form).get('message'))); await client.listPlanAssistance(); renderPlans(); } catch (error) { planError(error); } }
});

$('#folderTabs').addEventListener('keydown', (event) => { const tabs = $$('[data-tab]'), index = tabs.indexOf(event.target); if (index < 0) return; let target; if (event.key === 'ArrowRight') target = tabs[(index + 1) % tabs.length]; if (event.key === 'ArrowLeft') target = tabs[(index - 1 + tabs.length) % tabs.length]; if (event.key === 'Home') target = tabs[0]; if (event.key === 'End') target = tabs.at(-1); if (target) { event.preventDefault(); selectTab(target.dataset.tab, true); } });
$('#runList').addEventListener('keydown', async (event) => {
  const folders = $$('.case-folder', $('#runList'));
  const index = folders.indexOf(event.target);
  if (index < 0) return;
  let target;
  if (event.key === 'ArrowDown') target = folders[Math.min(index + 1, folders.length - 1)];
  if (event.key === 'ArrowUp') target = folders[Math.max(index - 1, 0)];
  if (event.key === 'Home') target = folders[0];
  if (event.key === 'End') target = folders.at(-1);
  if (target) {
    event.preventDefault();
    target.focus();
    await client.selectRun(target.dataset.run);
  }
});
$('.plan-tabs').addEventListener('keydown', (event) => {
  const tabs = $$('[data-plan-tab]'), index = tabs.indexOf(event.target);
  if (index < 0) return;
  let target;
  if (event.key === 'ArrowRight') target = tabs[(index + 1) % tabs.length];
  if (event.key === 'ArrowLeft') target = tabs[(index - 1 + tabs.length) % tabs.length];
  if (event.key === 'Home') target = tabs[0];
  if (event.key === 'End') target = tabs.at(-1);
  if (target) {
    event.preventDefault();
    ui.planTab = target.dataset.planTab;
    renderPlans();
    target.focus();
  }
});
$('#search').addEventListener('input', (event) => { ui.query = event.target.value; render(client.getSnapshot()); });
$('#refresh').addEventListener('click', () => client.refresh().catch((error) => setNotice(error.message, true)));
$('#pauseStream').addEventListener('click', async () => { ui.paused = !ui.paused; ui.paused ? client.pause() : await client.resume(); $('#pauseStream').textContent = ui.paused ? 'Resume live file' : 'Pause live file'; });
$('#toggleConnection').addEventListener('click', () => client.getSnapshot().connection.status === 'disconnected' ? client.connect().catch((error) => setNotice(error.message, true)) : client.disconnect());
$('#openPlans').addEventListener('click', openPlans);
document.addEventListener('keydown', (event) => { if (event.key === '/' && !event.target.matches('input,textarea,select') && !$('#plansDialog').open && !$('#recordDialog').open) { event.preventDefault(); $('#search').focus(); } if (event.key === 'Escape') { const open = $$('dialog[open]').at(-1); if (open) { event.preventDefault(); closeDialog(open); } } });
$$('dialog').forEach((dialog) => dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeDialog(dialog); }));

client.subscribe(render);
selectTab(ui.tab);
client.connect().catch((error) => setNotice(error.message, true));
