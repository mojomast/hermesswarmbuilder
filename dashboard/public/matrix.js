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

function renderSwarmGrid() {
  const container = $('swarmGrid');
  let nodes = agents();
  if (model.onlyActiveNodes) {
    nodes = nodes.filter(a => !terminalStates.has(a.status) || a.status === 'blocked');
  }

  if (nodes.length === 0) {
    container.innerHTML = '<div class="empty-state">No matching nodes in current matrix state.</div>';
    return;
  }

  container.innerHTML = nodes.map(node => {
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
  }).join('');

  container.querySelectorAll('[data-node-id]').forEach(el => {
    el.onclick = (e) => {
      if (e.target.closest('.interactive-tool-tag')) return;
      selectAgent(el.dataset.nodeId);
      openInspectorDrawer();
    };
  });

  container.querySelectorAll('.interactive-tool-tag').forEach(el => {
    el.onmouseenter = (e) => {
      e.stopPropagation();
      showToolPopover(el.dataset.toolId, el);
    };
    el.onmouseleave = () => {
      hideToolPopover();
    };
  });
}

function selectAgent(id) {
  model.selectedAgentId = id;
  setPref('hermes.apb.dashboard.selectedAgentId', id);
  renderSwarmGrid();
  renderInspector();
}

function renderTelemetry() {
  const container = $('telemetryRows');
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

  if (slice.length === 0) {
    container.innerHTML = '<div class="empty-state">No telemetry records matching filter criteria.</div>';
    return;
  }

  container.innerHTML = slice.map(e => {
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
  }).join('');

  container.querySelectorAll('[data-event-id]').forEach(el => {
    el.onclick = () => {
      const e = model.events.find(x => x.id === el.dataset.eventId);
      if (e) {
        selectAgent(e.agentId || inferAgent(e.source));
        openInspectorDrawer();
      }
    };
    if (el.dataset.toolId) {
      el.onmouseenter = (evt) => {
        showToolPopover(el.dataset.toolId, el);
      };
      el.onmouseleave = () => {
        hideToolPopover();
      };
    }
  });
}

// Quick Inspector Drawer Logic
function openInspectorDrawer() {
  $('inspectorDrawer').hidden = false;
  renderInspector();
}

function renderInspector() {
  document.querySelectorAll('#inspectorTabs .drawer-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.inspector === model.inspector);
  });
  const c = $('inspectorContent');
  if (!c) return;

  if (model.inspector === 'agent') return renderAgentInspector(c);
  if (model.inspector === 'spec') return renderDoc(c, 'spec.md', 'SPEC', model.state?.specAdherence);
  if (model.inspector === 'devplan') return renderDoc(c, 'devplan.md', 'DEVPLAN', model.state?.devplanAdherence);
  if (model.inspector === 'artifacts') return renderArtifacts(c);
  if (model.inspector === 'logs') return renderLogs(c);
  if (model.inspector === 'run') return renderRunJson(c);
}

function renderAgentInspector(c) {
  const a = agents().find(x => x.id === model.selectedAgentId) || agents()[0];
  if (!a) { c.innerHTML = '<div class="empty-state">No agent node selected.</div>'; return; }
  
  $('drawerTitle').textContent = `INSPECTOR // NODE: ${a.label || a.id}`;
  const ev = model.events.filter(e => e.agentId === a.id).slice(-30);
  const tools = [...model.toolCalls.values()].filter(t => (t.agentId || inferAgent(t.source)) === a.id);

  c.innerHTML = `
    <div style="display:grid; gap:12px;">
      <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:8px; background:color-mix(in oklch, var(--bg-dark) 80%, transparent); padding:10px; border-radius:8px; border:1px solid var(--panel-border);">
        <div><span style="color:var(--text-muted); font-size:10px; font-family:var(--font-mono);">ROLE:</span> <b>${esc(a.role)}</b></div>
        <div><span style="color:var(--text-muted); font-size:10px; font-family:var(--font-mono);">STATUS:</span> <b>${esc(a.status)}</b></div>
        <div><span style="color:var(--text-muted); font-size:10px; font-family:var(--font-mono);">PHASE:</span> <b>${esc(a.currentPhase || '—')}</b></div>
        <div><span style="color:var(--text-muted); font-size:10px; font-family:var(--font-mono);">TOOLS EXECUTED:</span> <b>${tools.length}</b></div>
      </div>
      
      <div>
        <h4 style="font-family:var(--font-mono); font-size:11px; color:var(--matrix-cyan); margin:0 0 6px 0;">RECENT ACTIVITY TAIL</h4>
        <pre class="raw-box">${esc(a.lastMessage || 'No recorded output messages.')}</pre>
      </div>

      <div>
        <h4 style="font-family:var(--font-mono); font-size:11px; color:var(--matrix-cyan); margin:0 0 6px 0;">TOOL TELEMETRY (${tools.length})</h4>
        ${tools.length > 0 ? tools.map(t => `
          <div style="background:color-mix(in oklch, var(--panel-bg) 80%, transparent); border:1px solid var(--panel-border); border-radius:6px; padding:10px; margin-bottom:8px;">
            <div style="display:flex; justify-content:space-between; font-weight:700; color:var(--matrix-cyan); font-size:11px; margin-bottom:4px; font-family:var(--font-mono);">
              <span>⚙ ${esc(t.toolName)}</span>
              <span>${esc(t.status)} ${t.durationMs ? `(${t.durationMs}ms)` : ''}</span>
            </div>
            <div style="font-size:11px; color:var(--text-muted);">${esc(t.action)}</div>
          </div>
        `).join('') : '<div class="empty-state">No tool calls for this node.</div>'}
      </div>
    </div>
  `;
}

async function renderDoc(c, file, label, adh) {
  $('drawerTitle').textContent = `INSPECTOR // ${label}`;
  const candidates = file === 'spec.md' ? ['spec.md', 'SPEC.approved-candidate-v2.md', 'SPEC.approved-candidate.md', 'SPEC.md'] : ['devplan.md', 'DEVPLAN.approved-candidate-v2.md', 'DEVPLAN.reconciled.md', 'DEVPLAN.md'];
  c.innerHTML = `<div class="empty-state">Loading ${label}...</div>`;
  if (!model.selectedRunId) { c.innerHTML = `<div class="empty-state">${label} requires an active run ID.</div>`; return; }
  for (const candidate of candidates) {
    try {
      const txt = await getText(`/api/runs/${encodeURIComponent(model.selectedRunId)}/artifacts/${candidate}`);
      c.innerHTML = `<div class="markdown-body"><p style="color:var(--text-muted); font-size:11px;">Viewing <code>${esc(candidate)}</code></p>${md(txt)}</div>`;
      return;
    } catch { }
  }
  c.innerHTML = `<div class="empty-state">No ${label} document found for current run.</div>`;
}

function md(src) {
  return esc(src)
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*)$/gm, '<h1>$1</h1>')
    .replace(/^- \[x\] (.*)$/gim, '<p>✅ $1</p>')
    .replace(/^- \[ \] (.*)$/gim, '<p>⬜ $1</p>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n\n/g, '<br><br>');
}

function renderArtifacts(c) {
  $('drawerTitle').textContent = `INSPECTOR // ARTIFACTS`;
  c.innerHTML = `
    <div style="display:grid; gap:10px;">
      <div class="file-list">
        ${model.artifacts.map(f => `
          <div class="file-row ${f.name === model.selectedArtifact ? 'active' : ''}" data-artifact="${esc(f.name)}">
            <b>${esc(f.name)}</b>
            <div style="font-size:10px; color:var(--text-muted); margin-top:2px;">${f.size} bytes · ${dt(f.modifiedAt)}</div>
          </div>
        `).join('') || '<div class="empty-state">No artifacts for this run.</div>'}
      </div>
      <pre id="artifactPreview" class="raw-box">Select an artifact to preview content.</pre>
    </div>
  `;
  c.querySelectorAll('[data-artifact]').forEach(el => {
    el.onclick = () => loadPreview('artifact', el.dataset.artifact);
  });
  if (model.selectedArtifact) loadPreview('artifact', model.selectedArtifact);
}

function renderLogs(c) {
  $('drawerTitle').textContent = `INSPECTOR // LOGS`;
  c.innerHTML = `
    <div style="display:grid; gap:10px;">
      <div class="file-list">
        ${model.logs.map(f => `
          <div class="file-row ${f.name === model.selectedLog ? 'active' : ''}" data-log="${esc(f.name)}">
            <b>${esc(f.name)}</b>
            <div style="font-size:10px; color:var(--text-muted); margin-top:2px;">${f.size} bytes · ${dt(f.modifiedAt)}</div>
          </div>
        `).join('') || '<div class="empty-state">No log files found.</div>'}
      </div>
      <pre id="logPreview" class="raw-box">Select a log file to view.</pre>
    </div>
  `;
  c.querySelectorAll('[data-log]').forEach(el => {
    el.onclick = () => loadPreview('log', el.dataset.log);
  });
  if (model.selectedLog) loadPreview('log', model.selectedLog);
}

async function loadPreview(kind, name) {
  if (!name || !model.selectedRunId) return;
  if (kind === 'artifact') {
    model.selectedArtifact = name;
    setPref('hermes.apb.dashboard.selectedArtifact', name);
  } else {
    model.selectedLog = name;
    setPref('hermes.apb.dashboard.selectedLog', name);
  }
  const prevEl = $(kind === 'artifact' ? 'artifactPreview' : 'logPreview');
  if (prevEl) prevEl.textContent = `Loading ${name}...`;
  try {
    const url = kind === 'artifact' 
      ? `/api/runs/${encodeURIComponent(model.selectedRunId)}/artifacts/${encodeURIComponent(name)}` 
      : `/api/runs/${encodeURIComponent(model.selectedRunId)}/logs/${encodeURIComponent(name)}?tail=1000`;
    const txt = await getText(url);
    if (prevEl) prevEl.textContent = txt;
  } catch (err) {
    if (prevEl) prevEl.textContent = `Error loading ${name}: ${err.message}`;
  }
}

async function renderRunJson(c) {
  $('drawerTitle').textContent = `INSPECTOR // RUN JSON`;
  if (!model.selectedRunId) { c.innerHTML = '<div class="empty-state">No active run selected.</div>'; return; }
  try {
    c.innerHTML = `<pre class="raw-box">${esc(JSON.stringify(await getJson(`/api/runs/${encodeURIComponent(model.selectedRunId)}`), null, 2))}</pre>`;
  } catch {
    c.innerHTML = '<div class="empty-state">Run JSON data unavailable.</div>';
  }
}

function renderAll() {
  renderWorkflowStrip();
  renderPulseStats();
  renderSwarmGrid();
  renderTelemetry();
  if (!$('inspectorDrawer').hidden) renderInspector();
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
      renderInspector();
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
