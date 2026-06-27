// Command Matrix Dashboard - ES Module JS
const stateNames = ["idle", "inventory-scanning", "selecting", "repo-created", "spec-drafting", "spec-review", "spec-approved", "devplan-drafting", "devplan-review", "devplan-approved", "building", "blocked", "deblocking", "on-hold", "completed", "published"];
const shortState = { "inventory-scanning": "scan", "repo-created": "repo", "spec-drafting": "spec", "spec-review": "spec rev", "spec-approved": "spec ok", "devplan-drafting": "devplan", "devplan-review": "plan rev", "devplan-approved": "plan ok", building: "build", deblocking: "deblock", "on-hold": "hold", completed: "done" };
const theme = { idle: "idle", selecting: "active", "inventory-scanning": "active", "repo-created": "active", "spec-drafting": "active", "spec-review": "warning", "spec-approved": "success", "devplan-drafting": "active", "devplan-review": "warning", "devplan-approved": "success", building: "active", blocked: "blocked", deblocking: "warning", "on-hold": "warning", completed: "completed", published: "completed" };
const terminalStates = new Set(["idle", "done", "error", "blocked", "complete", "completed", "published"]);

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const pref = (k, d = null) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const setPref = (k, v) => localStorage.setItem(k, JSON.stringify(v));

let model = {
  state: null,
  events: [],
  runs: [],
  artifacts: [],
  logs: [],
  toolCalls: new Map(),
  selectedRunId: pref('hermes.apb.dashboard.selectedRunId'),
  selectedAgentId: pref('hermes.apb.dashboard.selectedAgentId', 'main-orchestrator'),
  inspector: pref('hermes.apb.dashboard.inspectorTab', 'agent'),
  paused: pref('hermes.apb.dashboard.pauseRealtime', false),
  filter: 'all',
  query: '',
  onlyActiveNodes: false,
  selectedArtifact: pref('hermes.apb.dashboard.selectedArtifact'),
  selectedLog: pref('hermes.apb.dashboard.selectedLog'),
  artifactCache: new Map(),
  logCache: new Map()
};

async function getJson(url) { const r = await fetch(url); if (!r.ok) throw new Error(await r.text()); return r.json(); }
async function getText(url) { const r = await fetch(url); if (!r.ok) throw new Error(await r.text()); return r.text(); }

function fmt(s) { if (!s) return '—'; try { return new Date(s).toLocaleTimeString(); } catch { return s; } }
function dt(s) { if (!s) return '—'; try { return new Date(s).toLocaleString(); } catch { return s; } }

function normalizeEvent(e) {
  const typ = e.type || e.eventType || 'event', dat = { ...(e.data || {}) };
  for (const k of ['runId', 'agentId', 'toolCallId', 'toolName', 'action', 'sanitizedInput', 'sanitizedOutput', 'status', 'durationMs', 'error']) {
    if (e[k] !== undefined && dat[k] === undefined) dat[k] = e[k];
  }
  return {
    id: e.id || `${e.ts}-${e.source || e.agentId}-${e.message || typ}`.slice(0, 160),
    ts: e.ts || new Date().toISOString(),
    level: e.level || (typ.includes('error') ? 'error' : 'info'),
    source: e.source || e.agentId || 'unknown',
    type: typ,
    message: e.message || e.action || e.toolName || '',
    agentId: e.agentId || dat.agentId || inferAgent(e.source),
    runId: e.runId || dat.runId || model.state?.currentRunId,
    data: dat,
    raw: e
  };
}

function inferAgent(src = '') {
  const s = String(src);
  if (s.includes('spec')) return 'spec';
  if (s.includes('devplan')) return 'devplan';
  if (s.includes('test')) return 'tester';
  if (s.includes('doc')) return 'docs';
  if (s.includes('builder')) return 'builder';
  if (s.includes('deblock')) return 'deblocker';
  if (s.includes('select')) return 'selector';
  if (s.includes('invent')) return 'inventory';
  return s || 'system';
}

function extractTool(e) {
  const d = e.data || {};
  const isTool = String(e.type).startsWith('tool-call') || d.toolName || d.toolCallId || d.tool || /\b(tool|terminal|read_file|patch|write_file|delegate_task|execute_code)\b/i.test(e.message);
  if (!isTool) return null;
  const id = d.toolCallId || d.id || e.id;
  const old = model.toolCalls.get(id) || {};
  const status = e.type?.includes('error') ? 'error' : e.type?.includes('end') ? 'done' : d.status || old.status || 'running';
  return {
    ...old, id, agentId: e.agentId || d.agentId, source: e.source,
    toolName: d.toolName || d.tool || d.name || guessTool(e.message) || old.toolName || 'tool',
    action: d.action || d.command || d.summary || e.message || old.action || '',
    input: d.input ?? d.args ?? d.sanitizedInput ?? old.input,
    output: d.output ?? d.result ?? d.sanitizedOutput ?? old.output,
    error: d.error ?? old.error, status, durationMs: d.durationMs ?? old.durationMs,
    startedAt: old.startedAt || e.ts, updatedAt: e.ts
  };
}

function guessTool(m = '') {
  return (m.match(/\b(terminal|read_file|write_file|patch|delegate_task|execute_code|web_search|web_extract|search_files)\b/) || [])[1];
}

function ingestEvents(list) {
  for (const raw of list) {
    const e = normalizeEvent(raw);
    if (model.events.some(x => x.id === e.id)) continue;
    model.events.push(e);
    const t = extractTool(e);
    if (t) model.toolCalls.set(t.id, t);
  }
  model.events = model.events.slice(-1000);
}

function workflowStatus(s = model.state || {}) {
  if (s.status === 'complete') return 'completed';
  if (stateNames.includes(s.status)) return s.status;
  const p = String(s.phase || '');
  if (p === 'complete') return 'completed';
  if (stateNames.includes(p)) return p;
  if (p === 'implementation' || p === 'build' || p === 'building') return 'building';
  if (p.includes('devplan-approved')) return 'devplan-approved';
  if (p.includes('devplan')) return 'devplan-drafting';
  if (p.includes('spec-approved')) return 'spec-approved';
  if (p.includes('spec')) return 'spec-drafting';
  if (s.status === 'running') return 'building';
  return s.status || 'idle';
}

function agents() {
  const s = model.state || {}, a = s.agents || {};
  const raw = Array.isArray(a) ? a : Object.values(a);
  const arr = raw.map(x => {
    const id = x.id || x.label || x.role;
    const role = x.role || 'agent';
    const isBuild = String(role).toLowerCase().includes('build orchestrator') || id === 'build-orchestrator';
    return {
      id: isBuild ? 'build-orchestrator' : id,
      label: x.label || role || id,
      role: role,
      status: x.status || 'idle',
      currentTask: x.currentTask || x.task || '',
      currentPhase: x.currentPhase || s.phase || s.status,
      lastMessage: x.lastMessage || x.message || ''
    };
  });
  const seen = new Map(arr.map(x => [x.id, x]));
  for (const e of model.events) {
    const id = e.agentId || e.data?.agentId;
    if (!id || seen.has(id) || id === 'system') continue;
    seen.set(id, {
      id, label: id, role: 'subagent', status: 'seen',
      currentTask: e.message || e.type, currentPhase: e.data?.phase || s.phase || s.status,
      lastMessage: e.message || ''
    });
  }
  const main = {
    id: 'main-orchestrator', label: 'Main Orchestrator', role: 'scheduled workflow',
    status: s.status || 'idle', currentTask: s.task || s.currentTask || s.lastAction || 'monitor scheduled run',
    currentPhase: s.phase || s.status, lastMessage: s.lastAction || ''
  };
  if (!seen.has('main-orchestrator')) seen.set('main-orchestrator', main);
  const rank = { 'main-orchestrator': 0, orchestrator: 0, 'build-orchestrator': 1, 'inventory-scanner': 5, selector: 6, 'spec-author': 10, 'research-reviewer': 11, 'safety-reviewer': 12, 'spec-auditor': 13, 'devplan-writer-a': 20, 'devplan-writer-b': 21, 'devplan-reconciler': 22, 'devplan-auditor': 23, 'worker-core': 30, 'worker-risk': 31, 'worker-cli': 32, 'docs-subagent': 40, 'testing-subagent': 41, deblocker: 50, 'final-auditor': 60, auditor: 61 };
  return [...seen.values()].sort((x, y) => (rank[x.id] ?? 80) - (rank[y.id] ?? 80) || String(x.id).localeCompare(String(y.id)));
}

// Interactive Tool Popover Logic
function showToolPopover(toolId, targetEl) {
  const t = model.toolCalls.get(toolId);
  const pop = $('toolPopover');
  if (!t || !pop) return;

  const rect = targetEl.getBoundingClientRect();
  pop.style.left = `${Math.min(window.innerWidth - 400, Math.max(10, rect.left))}px`;
  pop.style.top = `${Math.min(window.innerHeight - 300, rect.bottom + 8)}px`;

  pop.innerHTML = `
    <div class="tool-popover-header">
      <span>⚙ TOOL: ${esc(t.toolName)}</span>
      <span style="color:var(--text-muted); font-size:10px;">${esc(t.status)} (${t.durationMs ? t.durationMs + 'ms' : 'active'})</span>
    </div>
    <div class="tool-popover-body">
      <div><span style="color:var(--text-muted);">Action:</span> ${esc(t.action || '—')}</div>
      ${t.input !== undefined ? `<div><span style="color:var(--text-muted);">Input:</span><pre class="tool-popover-code">${esc(typeof t.input === 'object' ? JSON.stringify(t.input, null, 2) : String(t.input))}</pre></div>` : ''}
      ${t.output !== undefined ? `<div><span style="color:var(--text-muted);">Output:</span><pre class="tool-popover-code">${esc(typeof t.output === 'object' ? JSON.stringify(t.output, null, 2) : String(t.output))}</pre></div>` : ''}
    </div>
  `;
  pop.hidden = false;
}

function hideToolPopover() {
  const pop = $('toolPopover');
  if (pop) pop.hidden = true;
}

// Rendering Functions
function renderWorkflowStrip() {
  const ws = workflowStatus(model.state || {});
  $('workflowStrip').innerHTML = stateNames.map((x, i) => {
    const cur = ws === x, idx = stateNames.indexOf(ws), done = idx >= 0 && i < idx && !['blocked', 'deblocking', 'on-hold'].includes(x);
    return `<span class="phase-chip ${cur ? 'current' : ''} ${done ? 'done' : ''} ${['blocked', 'on-hold', 'deblocking'].includes(x) ? 'interrupt' : ''}">${shortState[x] || x}</span>`;
  }).join('');
}

function renderPulseStats() {
  const s = model.state || {};
  const ws = workflowStatus(s);
  
  // Runs selector
  const sel = $('runSelector');
  if (model.runs && model.runs.length > 0) {
    sel.innerHTML = model.runs.map(r => `<option value="${esc(r.id)}" ${r.id === model.selectedRunId ? 'selected' : ''}>${esc(r.id)}</option>`).join('');
  } else {
    sel.innerHTML = `<option value="${esc(model.selectedRunId || 'no-run')}">${esc(model.selectedRunId || 'no-run')}</option>`;
  }

  $('statStatus').innerHTML = `<span class="dot ${theme[ws] || ws}"></span> ${esc(s.status || ws).toUpperCase()}`;
  
  const allNodes = agents();
  const activeNodes = allNodes.filter(a => !terminalStates.has(a.status) || a.status === 'blocked').length;
  $('statActiveAgents').textContent = activeNodes;

  $('statTotalTools').textContent = model.toolCalls.size;

  const errCount = model.events.filter(e => e.level === 'error' || /error|failed|blocked/i.test(e.message)).length;
  $('statErrorCount').textContent = errCount;

  $('statPhase').textContent = (s.phase || ws).toUpperCase();
}

// DOM Reconciliation & Helper Functions
function reconcileContainer(container, items, getKey, keyAttr, renderHTML, updateDOM, setupListeners, emptyMessage) {
  if (!container) return;

  if (items.length === 0) {
    const emptyEl = container.querySelector('.empty-state');
    if (!emptyEl || container.children.length > 1) {
      container.innerHTML = `<div class="empty-state">${emptyMessage}</div>`;
    }
    return;
  }

  const emptyEl = container.querySelector('.empty-state');
  if (emptyEl) {
    emptyEl.remove();
  }

  const existingMap = new Map();
  for (const child of Array.from(container.children)) {
    const key = child.getAttribute(keyAttr);
    if (key) {
      existingMap.set(key, child);
    }
  }

  const targetKeys = new Set(items.map(getKey));

  for (const [key, child] of existingMap.entries()) {
    if (!targetKeys.has(key)) {
      child.remove();
      existingMap.delete(key);
    }
  }

  items.forEach((item, index) => {
    const key = getKey(item);
    let el = existingMap.get(key);

    if (el) {
      updateDOM(el, item);
    } else {
      const temp = document.createElement('div');
      temp.innerHTML = renderHTML(item);
      el = temp.firstElementChild;
      setupListeners(el, item);
      existingMap.set(key, el);
    }

    const childAtIndex = container.children[index];
    if (childAtIndex !== el) {
      container.insertBefore(el, childAtIndex || null);
    }
  });

  while (container.children.length > items.length) {
    container.lastElementChild.remove();
  }
}

function createNodeCardHTML(node) {
  const isSelected = node.id === model.selectedAgentId;
  const tools = [...model.toolCalls.values()].filter(t => (t.agentId || inferAgent(t.source)) === node.id);
  const activeTool = tools.find(t => t.status === 'running') || tools[tools.length - 1];

  return `
    <div class="node-card ${isSelected ? 'active-selected' : ''} ${node.status === 'blocked' ? 'status-blocked' : ''}" data-node-id="${esc(node.id)}">
      <div class="node-header">
        <div class="node-title-group">
          <span class="dot ${theme[node.status] || node.status}"></span>
          <span class="node-name" title="${esc(node.label || node.id)}">${esc(node.label || node.id)}</span>
        </div>
        <span class="node-role-badge">${esc(node.role)}</span>
      </div>
      <div class="node-task" title="${esc(node.currentTask || 'Idle')}">${esc(node.currentTask || 'Idle / Monitoring')}</div>
      <div class="node-footer">
        <span class="node-phase">PHASE: ${esc(node.currentPhase || '—')}</span>
        ${activeTool ? `<span class="node-tool-tag interactive-tool-tag" data-tool-id="${esc(activeTool.id)}" title="Hover to preview tool execution">⚙ ${esc(activeTool.toolName)}</span>` : '<span class="node-tool-tag">ready</span>'}
      </div>
    </div>
  `;
}

function updateNodeCardDOM(el, node) {
  const isSelected = node.id === model.selectedAgentId;
  const tools = [...model.toolCalls.values()].filter(t => (t.agentId || inferAgent(t.source)) === node.id);
  const activeTool = tools.find(t => t.status === 'running') || tools[tools.length - 1];

  el.classList.toggle('active-selected', isSelected);
  el.classList.toggle('status-blocked', node.status === 'blocked');

  const dot = el.querySelector('.dot');
  if (dot) {
    const dotClass = `dot ${theme[node.status] || node.status}`;
    if (dot.className !== dotClass) dot.className = dotClass;
  }

  const nameEl = el.querySelector('.node-name');
  if (nameEl) {
    const label = node.label || node.id;
    if (nameEl.textContent !== label) nameEl.textContent = label;
    if (nameEl.title !== label) nameEl.title = label;
  }

  const roleEl = el.querySelector('.node-role-badge');
  if (roleEl && roleEl.textContent !== node.role) {
    roleEl.textContent = node.role;
  }

  const taskEl = el.querySelector('.node-task');
  if (taskEl) {
    const taskText = node.currentTask || 'Idle / Monitoring';
    const taskTitle = node.currentTask || 'Idle';
    if (taskEl.textContent !== taskText) taskEl.textContent = taskText;
    if (taskEl.title !== taskTitle) taskEl.title = taskTitle;
  }

  const phaseEl = el.querySelector('.node-phase');
  if (phaseEl) {
    const phaseText = `PHASE: ${node.currentPhase || '—'}`;
    if (phaseEl.textContent !== phaseText) phaseEl.textContent = phaseText;
  }

  const footerEl = el.querySelector('.node-footer');
  if (footerEl) {
    let toolTag = footerEl.querySelector('.node-tool-tag');
    if (activeTool) {
      if (!toolTag || !toolTag.classList.contains('interactive-tool-tag') || toolTag.dataset.toolId !== activeTool.id) {
        const temp = document.createElement('div');
        temp.innerHTML = `<span class="node-tool-tag interactive-tool-tag" data-tool-id="${esc(activeTool.id)}" title="Hover to preview tool execution">⚙ ${esc(activeTool.toolName)}</span>`;
        const newTag = temp.firstElementChild;
        newTag.onmouseenter = (e) => { e.stopPropagation(); showToolPopover(activeTool.id, newTag); };
        newTag.onmouseleave = () => hideToolPopover();
        if (toolTag) toolTag.replaceWith(newTag);
        else footerEl.appendChild(newTag);
      } else {
        const text = `⚙ ${activeTool.toolName}`;
        if (toolTag.textContent !== text) toolTag.textContent = text;
      }
    } else {
      if (!toolTag || toolTag.classList.contains('interactive-tool-tag')) {
        const temp = document.createElement('div');
        temp.innerHTML = `<span class="node-tool-tag">ready</span>`;
        const newTag = temp.firstElementChild;
        if (toolTag) toolTag.replaceWith(newTag);
        else footerEl.appendChild(newTag);
      }
    }
  }

  setupNodeCardListeners(el, node);
}

function setupNodeCardListeners(el, node) {
  el.onclick = (e) => {
    if (e.target.closest('.interactive-tool-tag')) return;
    selectAgent(node.id);
    openInspectorDrawer();
  };
  const toolTag = el.querySelector('.interactive-tool-tag');
  if (toolTag) {
    toolTag.onmouseenter = (e) => {
      e.stopPropagation();
      showToolPopover(toolTag.dataset.toolId, toolTag);
    };
    toolTag.onmouseleave = () => hideToolPopover();
  }
}

function renderSwarmGrid() {
  const container = $('swarmGrid');
  if (!container) return;
  let nodes = agents();
  if (model.onlyActiveNodes) {
    nodes = nodes.filter(a => !terminalStates.has(a.status) || a.status === 'blocked');
  }

  reconcileContainer(
    container,
    nodes,
    node => node.id,
    'data-node-id',
    createNodeCardHTML,
    updateNodeCardDOM,
    setupNodeCardListeners,
    'No matching nodes in current matrix state.'
  );
}

function selectAgent(id) {
  model.selectedAgentId = id;
  setPref('hermes.apb.dashboard.selectedAgentId', id);
  renderSwarmGrid();
  renderInspector(true);
}

function createTelemetryRowHTML(e) {
  const tool = extractTool(e);
  const lvlClass = tool ? 'tool' : e.level;
  const lvlText = tool ? 'TOOL' : e.level.toUpperCase();

  return `
    <div class="t-row" data-event-id="${esc(e.id)}" ${tool ? `data-tool-id="${esc(tool.id)}"` : ''}>
      <div class="t-cell t-time">${fmt(e.ts)}</div>
      <div class="t-cell t-level ${lvlClass}">${lvlText}</div>
      <div class="t-cell t-source" title="${esc(e.source)}">${esc(e.source)}</div>
      <div class="t-cell t-type" title="${esc(tool ? tool.toolName : e.type)}">${esc(tool ? tool.toolName : e.type)}</div>
      <div class="t-cell t-msg" title="${esc(e.message)}">${esc(e.message)}</div>
    </div>
  `;
}

function updateTelemetryRowDOM(el, e) {
  const tool = extractTool(e);
  const lvlClass = tool ? 'tool' : e.level;
  const lvlText = tool ? 'TOOL' : e.level.toUpperCase();

  if (tool) {
    el.dataset.toolId = tool.id;
  } else {
    delete el.dataset.toolId;
  }

  const timeEl = el.querySelector('.t-time');
  if (timeEl) {
    const timeStr = fmt(e.ts);
    if (timeEl.textContent !== timeStr) timeEl.textContent = timeStr;
  }

  const lvlEl = el.querySelector('.t-level');
  if (lvlEl) {
    const className = `t-cell t-level ${lvlClass}`;
    if (lvlEl.className !== className) lvlEl.className = className;
    if (lvlEl.textContent !== lvlText) lvlEl.textContent = lvlText;
  }

  const sourceEl = el.querySelector('.t-source');
  if (sourceEl) {
    if (sourceEl.textContent !== e.source) sourceEl.textContent = e.source;
    if (sourceEl.title !== e.source) sourceEl.title = e.source;
  }

  const typeEl = el.querySelector('.t-type');
  if (typeEl) {
    const typeStr = tool ? tool.toolName : e.type;
    if (typeEl.textContent !== typeStr) typeEl.textContent = typeStr;
    if (typeEl.title !== typeStr) typeEl.title = typeStr;
  }

  const msgEl = el.querySelector('.t-msg');
  if (msgEl) {
    if (msgEl.textContent !== e.message) msgEl.textContent = e.message;
    if (msgEl.title !== e.message) msgEl.title = e.message;
  }

  setupTelemetryRowListeners(el, e);
}

function setupTelemetryRowListeners(el, e) {
  const tool = extractTool(e);
  el.onclick = () => {
    selectAgent(e.agentId || inferAgent(e.source));
    openInspectorDrawer();
  };
  if (tool) {
    el.onmouseenter = () => showToolPopover(tool.id, el);
    el.onmouseleave = () => hideToolPopover();
  } else {
    el.onmouseenter = null;
    el.onmouseleave = null;
  }
}

function renderTelemetry() {
  const container = $('telemetryRows') || $('telemetryStream');
  if (!container) return;
  let list = model.events;

  // Filter query
  if (model.query) {
    const q = model.query.toLowerCase();
    list = list.filter(e => JSON.stringify(e).toLowerCase().includes(q));
  }

  // Type filter
  if (model.filter === 'tools') {
    list = list.filter(e => extractTool(e));
  } else if (model.filter === 'errors') {
    list = list.filter(e => e.level === 'error' || /error|failed|blocked/i.test(e.message));
  } else if (model.filter === 'artifacts') {
    list = list.filter(e => e.type?.includes('artifact'));
  }

  const slice = list.slice(-150).reverse();

  reconcileContainer(
    container,
    slice,
    e => e.id,
    'data-event-id',
    createTelemetryRowHTML,
    updateTelemetryRowDOM,
    setupTelemetryRowListeners,
    'No telemetry records matching filter criteria.'
  );
}

// Quick Inspector Drawer Logic
function openInspectorDrawer() {
  $('inspectorDrawer').hidden = false;
  renderInspector(true);
}

let lastInspectorKey = null;

function renderInspector(force = false) {
  document.querySelectorAll('#inspectorTabs .drawer-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.inspector === model.inspector);
  });
  const c = $('inspectorContent');
  if (!c) return;

  const currentKey = `${model.inspector}:${model.selectedRunId}:${model.selectedAgentId}`;
  if (!force && model.inspector !== 'agent' && lastInspectorKey === currentKey) {
    return;
  }
  lastInspectorKey = currentKey;

  if (model.inspector === 'agent') return renderAgentInspector(c);
  if (model.inspector === 'spec') return renderDoc(c, 'spec.md', 'SPEC', model.state?.specAdherence);
  if (model.inspector === 'devplan') return renderDoc(c, 'devplan.md', 'DEVPLAN', model.state?.devplanAdherence);
  if (model.inspector === 'artifacts') return renderArtifacts(c);
  if (model.inspector === 'logs') return renderLogs(c);
  if (model.inspector === 'run') return renderRunJson(c);
}

function preserveScroll(fn) {
  const scrollables = [
    document.documentElement,
    document.body,
    $('swarmGrid'),
    $('telemetryContent'),
    $('telemetryRows'),
    $('telemetryStream'),
    $('inspectorContent')
  ].filter(Boolean);

  const positions = scrollables.map(el => ({
    el,
    top: el === document.documentElement || el === document.body ? window.scrollY : el.scrollTop,
    left: el === document.documentElement || el === document.body ? window.scrollX : el.scrollLeft
  }));

  fn();

  positions.forEach(({ el, top, left }) => {
    if (el === document.documentElement || el === document.body) {
      window.scrollTo(left, top);
    } else {
      el.scrollTop = top;
      el.scrollLeft = left;
    }
  });
}

function renderAll() {
  preserveScroll(() => {
    renderWorkflowStrip();
    renderPulseStats();
    renderSwarmGrid();
    renderTelemetry();
    if (!$('inspectorDrawer').hidden) renderInspector(false);
  });
}

async function loadRunResources() {
  if (!model.selectedRunId) { model.artifacts = []; model.logs = []; return; }
  try { model.artifacts = await getJson(`/api/runs/${encodeURIComponent(model.selectedRunId)}/artifacts`); } catch { model.artifacts = []; }
  try { model.logs = await getJson(`/api/runs/${encodeURIComponent(model.selectedRunId)}/logs`); } catch { model.logs = []; }
}

async function refresh() {
  try {
    model.state = await getJson('/api/state');
    model.runs = await getJson('/api/runs');
    if (!model.selectedRunId) model.selectedRunId = model.state.currentRunId || (model.runs[0]?.id ?? null);
    ingestEvents(await getJson('/api/events?limit=500'));
    await loadRunResources();
    renderAll();
  } catch (e) {
    $('streamState').innerHTML = '<span class="pulse-dot"></span> API Error';
  }
}

function connect() {
  try {
    const es = new EventSource('/api/stream');
    es.addEventListener('open', () => {
      $('streamState').className = 'matrix-badge status-live';
      $('streamState').innerHTML = '<span class="pulse-dot"></span> SSE LIVE';
    });
    es.addEventListener('state', e => {
      const p = JSON.parse(e.data);
      if (!model.paused) {
        model.state = p;
        if (!model.selectedRunId) model.selectedRunId = p.currentRunId;
        renderAll();
      }
    });
    es.addEventListener('events', e => {
      const p = JSON.parse(e.data);
      if (!model.paused) {
        ingestEvents(p);
        renderAll();
      }
    });
    es.addEventListener('heartbeat', () => {
      if (!model.paused && model.selectedRunId) {
        loadRunResources().then(renderAll);
      }
    });
    es.onerror = () => {
      $('streamState').className = 'matrix-badge status-connecting';
      $('streamState').innerHTML = '<span class="pulse-dot"></span> SSE RECONNECTING';
      es.close();
      setTimeout(connect, 4000);
    };
  } catch {
    setTimeout(connect, 4000);
  }
}

// Event Setup
function setupListeners() {
  $('refreshNow').onclick = refresh;
  
  $('pauseEvents').onclick = () => {
    model.paused = !model.paused;
    setPref('hermes.apb.dashboard.pauseRealtime', model.paused);
    $('pauseEvents').textContent = model.paused ? 'Resume Stream' : 'Pause Stream';
    $('pauseEvents').classList.toggle('primary', model.paused);
  };

  $('runSelector').onchange = (e) => {
    model.selectedRunId = e.target.value;
    setPref('hermes.apb.dashboard.selectedRunId', model.selectedRunId);
    loadRunResources().then(renderAll);
  };

  $('globalFilter').oninput = (e) => {
    model.query = e.target.value;
    renderTelemetry();
  };

  document.querySelectorAll('.telemetry-filters [data-filter]').forEach(b => {
    b.onclick = () => {
      model.filter = b.dataset.filter;
      document.querySelectorAll('.telemetry-filters [data-filter]').forEach(x => x.classList.toggle('active', x === b));
      renderTelemetry();
    };
  });

  $('filterActiveNodes').onclick = () => {
    model.onlyActiveNodes = false;
    $('filterActiveNodes').classList.add('active');
    $('filterOnlyActive').classList.remove('active');
    renderSwarmGrid();
  };

  $('filterOnlyActive').onclick = () => {
    model.onlyActiveNodes = true;
    $('filterOnlyActive').classList.add('active');
    $('filterActiveNodes').classList.remove('active');
    renderSwarmGrid();
  };

  $('closeDrawer').onclick = () => {
    $('inspectorDrawer').hidden = true;
  };

  document.querySelectorAll('#inspectorTabs .drawer-tab').forEach(b => {
    b.onclick = () => {
      model.inspector = b.dataset.inspector;
      setPref('hermes.apb.dashboard.inspectorTab', model.inspector);
      renderInspector(true);
    };
  });

  window.addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement !== $('globalFilter')) {
      e.preventDefault();
      $('globalFilter').focus();
    }
    if (e.key === 'Escape') {
      $('inspectorDrawer').hidden = true;
      hideToolPopover();
    }
  });

  window.addEventListener('scroll', hideToolPopover, true);
  document.addEventListener('click', e => {
    if (!e.target.closest('.interactive-tool-tag') && !e.target.closest('.tool-popover')) {
      hideToolPopover();
    }
  });
}

// Initialize
setupListeners();
refresh();
connect();
