/**
 * Developer Console Alternate Dashboard (console.js)
 * Hermes Autonomous Project Builder - 2026 Next-Gen Engine
 */

// LocalStorage helpers (compatible with app.js)
const pref = (k, d = null) => {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? d;
  } catch {
    return d;
  }
};
const setPref = (k, v) => localStorage.setItem(k, JSON.stringify(v));

// Utility functions
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

function fmt(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleTimeString(); } catch { return s; }
}
function dt(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleString(); } catch { return s; }
}
function dur(start, end) {
  if (!start) return '—';
  const ms = (end ? Date.parse(end) : Date.now()) - Date.parse(start);
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const h = Math.floor(ms / 36e5), m = Math.floor(ms % 36e5 / 6e4), sec = Math.floor(ms % 6e4 / 1000);
  return h ? `${h}h ${m}m` : `${m}m ${sec}s`;
}

/**
 * 2026 Interactive JSON Tree Syntax Highlighter
 */
function highlightJson(obj) {
  if (obj === undefined || obj === null) return '<span class="json-null">null</span>';
  let jsonStr = typeof obj === 'object' ? JSON.stringify(obj, null, 2) : String(obj);
  if (!jsonStr) return '—';
  
  return jsonStr.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, match => {
    let cls = 'json-number';
    if (/^"/.test(match)) {
      if (/:$/.test(match)) {
        cls = 'json-key';
      } else {
        cls = 'json-string';
      }
    } else if (/true|false/.test(match)) {
      cls = 'json-boolean';
    } else if (/null/.test(match)) {
      cls = 'json-null';
    }
    return `<span class="${cls}">${esc(match)}</span>`;
  });
}

// State names and mappings matching app.js
const stateNames = ["idle", "inventory-scanning", "selecting", "repo-created", "spec-drafting", "spec-review", "spec-approved", "devplan-drafting", "devplan-review", "devplan-approved", "building", "blocked", "deblocking", "on-hold", "completed", "published"];

// Central Model Definition
const model = {
  state: null,
  runs: [],
  events: [],
  artifacts: [],
  logs: [],
  raw: [],
  toolCalls: new Map(),
  
  // Persisted state
  selectedRunId: pref('hermes.apb.dashboard.selectedRunId', null),
  selectedAgentId: pref('hermes.apb.dashboard.selectedAgentId', null),
  selectedArtifact: pref('hermes.apb.dashboard.selectedArtifact', null),
  selectedLog: pref('hermes.apb.dashboard.selectedLog', null),
  paused: pref('hermes.apb.dashboard.pauseRealtime', false),
  followTerminal: pref('hermes.apb.dashboard.followConsole', true),
  expandedTools: new Set(),
  expandedEvents: new Set(pref('hermes.apb.dashboard.expandedEvents', [])),
  terminalHeight: pref('hermes.apb.dashboard.terminalHeight', '52vh'),
  
  // View State
  activeFilter: 'all',
  searchQuery: '',
  sidebarTab: 'agents',
  consoleTab: pref('hermes.apb.dashboard.consoleTab', 'tools'),
  selectedToolId: null,
  
  // Doc Modal
  docModalOpen: false,
  docType: 'spec',
  docCache: new Map(),
  
  // Caches
  artifactCache: new Map(),
  logCache: new Map()
};

// API Fetching
async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
async function getText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(await r.text());
  return r.text();
}

// Event Normalization & Tool Extraction (Identical contract to app.js)
function normalizeEvent(e) {
  const typ = e.type || e.eventType || 'event';
  const dat = { ...(e.data || {}) };
  for (const k of ['runId', 'agentId', 'toolCallId', 'toolName', 'action', 'sanitizedInput', 'sanitizedOutput', 'status', 'durationMs', 'error']) {
    if (e[k] !== undefined && dat[k] === undefined) dat[k] = e[k];
  }
  return {
    id: e.id || `${e.ts}-${e.source || e.agentId}-${e.message || typ}`.slice(0, 160),
    ts: e.ts || new Date().toISOString(),
    level: e.level || (typ.includes('error') ? 'error' : typ.includes('warn') ? 'warn' : 'info'),
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

function guessTool(m = '') {
  return (m.match(/\b(terminal|read_file|write_file|patch|delegate_task|execute_code|web_search|web_extract|search_files)\b/) || [])[1];
}

function extractTool(e) {
  const d = e.data || {};
  const isTool = String(e.type).startsWith('tool-call') || d.toolName || d.toolCallId || d.tool || /\b(tool|terminal|read_file|patch|write_file|delegate_task|execute_code)\b/i.test(e.message);
  if (!isTool) return null;
  const id = d.toolCallId || d.id || e.id;
  const old = model.toolCalls.get(id) || {};
  const status = e.type?.includes('error') ? 'error' : e.type?.includes('end') ? 'done' : d.status || old.status || 'running';
  return {
    ...old,
    id,
    agentId: e.agentId || d.agentId,
    source: e.source,
    toolName: d.toolName || d.tool || d.name || guessTool(e.message) || old.toolName || 'tool',
    action: d.action || d.command || d.summary || e.message || old.action || '',
    input: d.input ?? d.args ?? d.sanitizedInput ?? old.input,
    output: d.output ?? d.result ?? d.sanitizedOutput ?? old.output,
    error: d.error ?? old.error,
    status,
    durationMs: d.durationMs ?? old.durationMs,
    startedAt: old.startedAt || e.ts,
    updatedAt: e.ts,
    events: [...(old.events || []), e]
  };
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

// Extract unique list of agents
function getAgentsList() {
  const s = model.state || {};
  const a = s.agents || {};
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
      currentPhase: x.currentPhase || s.phase || s.status
    };
  });
  const seen = new Map(arr.map(x => [x.id, x]));
  for (const e of model.events) {
    const id = e.agentId || e.data?.agentId;
    if (!id || seen.has(id) || id === 'system') continue;
    seen.set(id, { id, label: id, role: 'event-subagent', status: 'active', currentTask: e.message || e.type, currentPhase: s.phase });
  }
  if (!seen.has('main-orchestrator')) {
    seen.set('main-orchestrator', { id: 'main-orchestrator', label: 'Main Orchestrator', role: 'scheduled workflow', status: s.status || 'idle', currentTask: s.task || 'monitoring' });
  }
  return [...seen.values()];
}

// --------------------------------------------------------------------------
// UI Rendering Functions
// --------------------------------------------------------------------------

function renderTopbar() {
  const s = model.state || {};
  const runId = model.selectedRunId || s.currentRunId || 'no-active-run';
  const status = s.status || 'idle';
  const phase = s.phase || status;
  const project = s.selectedProject?.name || s.currentProject || 'no-project';

  const dotClass = status === 'running' || status === 'building' ? 'pulsing' : status === 'completed' ? 'active' : status === 'blocked' ? 'blocked' : '';
  
  $('topStatus').innerHTML = `
    <span class="status-dot ${dotClass}"></span>
    <b>${esc(status.toUpperCase())}</b>
    <span class="muted">|</span> Run: <code>${esc(runId)}</code>
    <span class="muted">|</span> Phase: <code>${esc(phase)}</code>
    <span class="muted">|</span> Project: <b>${esc(project)}</b>
  `;

  $('btnPause').textContent = model.paused ? 'Resume' : 'Pause';
  $('btnPause').classList.toggle('active', model.paused);
}

function renderCommandBar() {
  document.querySelectorAll('#filterBadges .dev-badge').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === model.activeFilter);
  });
}

function renderSidebar() {
  // 1. Run Picker Select
  const runSelect = $('runSelect');
  $('runCount').textContent = model.runs.length;
  runSelect.innerHTML = model.runs.map(r => 
    `<option value="${esc(r.id)}" ${r.id === model.selectedRunId ? 'selected' : ''}>
      ${esc(r.id)} (${esc(r.status || 'running')})
    </option>`
  ).join('') || '<option value="">No runs recorded</option>';

  // 2. Sidebar Tabs
  document.querySelectorAll('.sidebar-tabs .tab-btn').forEach(btn => {
    const tab = btn.dataset.sidebarTab;
    btn.classList.toggle('active', tab === model.sidebarTab);
  });

  $('agentsTree').classList.toggle('hidden', model.sidebarTab !== 'agents');
  $('artifactsTree').classList.toggle('hidden', model.sidebarTab !== 'artifacts');
  $('logsTree').classList.toggle('hidden', model.sidebarTab !== 'logs');

  const agentList = getAgentsList();
  $('agentCount').textContent = agentList.length;
  $('artifactCount').textContent = model.artifacts.length;
  $('logCount').textContent = model.logs.length;

  // Render Agents Tree
  if (model.sidebarTab === 'agents') {
    $('agentsTree').innerHTML = agentList.map(a => {
      const toolCount = [...model.toolCalls.values()].filter(t => (t.agentId || inferAgent(t.source)) === a.id).length;
      const isSelected = a.id === model.selectedAgentId;
      return `
        <div class="tree-item ${isSelected ? 'active' : ''}" data-agent-id="${esc(a.id)}">
          <div class="item-main">
            <span class="item-title">🤖 ${esc(a.label || a.id)}</span>
            <span class="item-badge">${esc(a.status)}</span>
          </div>
          <div class="item-sub">${esc(a.currentTask || a.role)} · ${toolCount} tool calls</div>
        </div>
      `;
    }).join('') || '<div class="empty-state">No active agents</div>';

    document.querySelectorAll('[data-agent-id]').forEach(el => {
      el.onclick = () => {
        const id = el.dataset.agentId;
        model.selectedAgentId = model.selectedAgentId === id ? null : id;
        setPref('hermes.apb.dashboard.selectedAgentId', model.selectedAgentId);
        renderSidebar();
        renderTerminal();
      };
    });
  }

  // Render Artifacts Tree
  if (model.sidebarTab === 'artifacts') {
    $('artifactsTree').innerHTML = model.artifacts.map(f => `
      <div class="tree-item ${f.name === model.selectedArtifact ? 'active' : ''}" data-artifact-name="${esc(f.name)}">
        <div class="item-main">
          <span class="item-title">📄 ${esc(f.name)}</span>
          <span class="item-badge">${f.size} B</span>
        </div>
        <div class="item-sub">Updated ${dt(f.modifiedAt)}</div>
      </div>
    `).join('') || '<div class="empty-state">No artifacts available</div>';

    document.querySelectorAll('[data-artifact-name]').forEach(el => {
      el.onclick = () => {
        model.selectedArtifact = el.dataset.artifactName;
        setPref('hermes.apb.dashboard.selectedArtifact', model.selectedArtifact);
        openDocModal(model.selectedArtifact.toLowerCase().includes('devplan') ? 'devplan' : 'spec');
      };
    });
  }

  // Render Logs Tree
  if (model.sidebarTab === 'logs') {
    $('logsTree').innerHTML = model.logs.map(f => `
      <div class="tree-item ${f.name === model.selectedLog ? 'active' : ''}" data-log-name="${esc(f.name)}">
        <div class="item-main">
          <span class="item-title">📜 ${esc(f.name)}</span>
          <span class="item-badge">${f.size} B</span>
        </div>
        <div class="item-sub">Updated ${dt(f.modifiedAt)}</div>
      </div>
    `).join('') || '<div class="empty-state">No log files recorded</div>';

    document.querySelectorAll('[data-log-name]').forEach(el => {
      el.onclick = () => {
        model.selectedLog = el.dataset.logName;
        setPref('hermes.apb.dashboard.selectedLog', model.selectedLog);
        renderSidebar();
      };
    });
  }
}

function renderTerminal() {
  const out = $('terminalOutput');
  const tagFilter = $('terminalAgentFilterTag');

  if (model.selectedAgentId) {
    tagFilter.classList.remove('hidden');
    $('selectedAgentName').textContent = model.selectedAgentId;
  } else {
    tagFilter.classList.add('hidden');
  }

  // Filter events for terminal stream
  let lines = model.events;
  const q = model.searchQuery.toLowerCase();
  if (q) {
    lines = lines.filter(e => JSON.stringify(e).toLowerCase().includes(q));
  }
  if (model.selectedAgentId) {
    lines = lines.filter(e => e.agentId === model.selectedAgentId || e.source === model.selectedAgentId);
  }

  if (model.activeFilter === 'tools') lines = lines.filter(e => extractTool(e));
  if (model.activeFilter === 'errors') lines = lines.filter(e => ['error', 'warn'].includes(e.level) || /error|failed/i.test(e.message));

  lines = lines.slice(-500);
  $('terminalLineCount').textContent = `${lines.length} lines`;

  const lineItems = lines.map((e, idx) => {
    const lineNum = String(idx + 1).padStart(4, '0');
    const tag = e.type.startsWith('tool') ? 'tool' : e.level === 'error' ? 'error' : e.level === 'warn' ? 'warn' : e.agentId ? 'agent' : 'info';
    return `
      <div class="terminal-line">
        <span class="line-num">${lineNum}</span>
        <span class="line-time">${fmt(e.ts)}</span>
        <span class="line-tag ${tag}">[${tag.toUpperCase()}]</span>
        <span class="line-content">${esc(e.message || e.type)}</span>
      </div>
    `;
  }).join('');

  const promptLine = `
    <div class="terminal-line system-line active-prompt">
      <span class="line-num">${String(lines.length + 1).padStart(4, '0')}</span>
      <span class="line-time">${fmt(new Date().toISOString())}</span>
      <span class="line-tag sys">[LIVE]</span>
      <span class="line-content" style="color:var(--accent-green)">&gt; streaming active events...<span class="terminal-cursor"></span></span>
    </div>
  `;

  out.innerHTML = (lineItems || '<div class="empty-state">No terminal log entries matching filter</div>') + promptLine;

  if (model.followTerminal) {
    requestAnimationFrame(() => { out.scrollTop = out.scrollHeight; });
  }
}

function renderToolConsole() {
  const c = $('toolConsoleContent');
  
  document.querySelectorAll('.console-tabs-bar .tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.consoleTab === model.consoleTab);
  });

  const toolsList = [...model.toolCalls.values()];
  $('toolCallCount').textContent = toolsList.length;
  $('rawCount').textContent = model.raw.length;

  if (model.consoleTab === 'tools') {
    c.innerHTML = toolsList.slice(-50).reverse().map(t => {
      const isExpanded = model.expandedTools.has(t.id);
      
      let inputHtml = '—';
      if (t.input) {
        inputHtml = `<div class="json-tree"><pre class="code-box">${highlightJson(t.input)}</pre></div>`;
      }

      let outputHtml = '—';
      if (t.output) {
        if (typeof t.output === 'object') {
          outputHtml = `<div class="json-tree"><pre class="code-box">${highlightJson(t.output)}</pre></div>`;
        } else {
          try {
            const parsed = JSON.parse(t.output);
            outputHtml = `<div class="json-tree"><pre class="code-box">${highlightJson(parsed)}</pre></div>`;
          } catch {
            outputHtml = `<pre class="code-box">${esc(t.output)}</pre>`;
          }
        }
      }

      return `
        <div class="tool-card">
          <div class="tool-card-head" data-toggle-tool-card="${esc(t.id)}">
            <div class="tool-name-group">
              <span class="tool-pill">${esc(t.toolName)}</span>
              <span class="tool-action-text">${esc(t.action || t.toolName)}</span>
            </div>
            <div class="tool-meta-group">
              <span class="status-pill-sm ${esc(t.status)}">${esc(t.status)}</span>
              <span>${t.durationMs ? `${t.durationMs}ms` : fmt(t.updatedAt)}</span>
              <span style="font-size:14px">${isExpanded ? '▾' : '▸'}</span>
            </div>
          </div>
          ${isExpanded ? `
            <div class="tool-card-body">
              <div class="tool-section-title">Agent ID: ${esc(t.agentId || 'unknown')}</div>
              <div class="tool-section-title">Input Parameters</div>
              ${inputHtml}
              <div class="tool-section-title">Output Result</div>
              ${outputHtml}
              ${t.error ? `<div class="tool-section-title" style="color:var(--accent-red)">Error Details</div><pre class="code-box" style="color:var(--accent-red)">${esc(t.error)}</pre>` : ''}
            </div>
          ` : ''}
        </div>
      `;
    }).join('') || '<div class="empty-state">No structured tool calls recorded</div>';

    document.querySelectorAll('[data-toggle-tool-card]').forEach(el => {
      el.onclick = () => {
        const id = el.dataset.toggleToolCard;
        if (model.expandedTools.has(id)) model.expandedTools.delete(id);
        else model.expandedTools.add(id);
        renderToolConsole();
      };
    });
    return;
  }

  if (model.consoleTab === 'inspector') {
    const selectedTool = model.selectedToolId ? model.toolCalls.get(model.selectedToolId) : toolsList[toolsList.length - 1];
    if (!selectedTool) {
      c.innerHTML = '<div class="empty-state">Select a tool execution to inspect full payload</div>';
      return;
    }
    c.innerHTML = `
      <div class="tool-card-body" style="border:none">
        <h3 class="tool-section-title" style="font-size:13px">Tool execution inspection: ${esc(selectedTool.toolName)}</h3>
        <div class="json-tree"><pre class="code-box">${highlightJson(selectedTool)}</pre></div>
      </div>
    `;
    return;
  }

  if (model.consoleTab === 'raw') {
    c.innerHTML = model.raw.slice(-30).reverse().map(x => `
      <details style="margin-bottom:8px;background:oklch(0.09 0.02 260);padding:8px;border-radius:6px;border:1px solid var(--border-color)">
        <summary style="cursor:pointer;font-family:var(--font-mono);color:var(--accent-cyan);font-weight:600">
          ${esc(x.type)} @ ${fmt(x.ts)}
        </summary>
        <div class="json-tree" style="margin-top:8px"><pre class="code-box">${highlightJson(x.payload)}</pre></div>
      </details>
    `).join('') || '<div class="empty-state">No SSE raw events in stream cache</div>';
    return;
  }

  if (model.consoleTab === 'state') {
    c.innerHTML = `<div class="json-tree"><pre class="code-box" style="max-height:none">${highlightJson(model.state)}</pre></div>`;
    return;
  }
}

function renderAll() {
  renderTopbar();
  renderCommandBar();
  renderSidebar();
  renderTerminal();
  renderToolConsole();
}

// --------------------------------------------------------------------------
// Quick Doc Modal & Rendering
// --------------------------------------------------------------------------

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

async function openDocModal(type = 'spec') {
  model.docType = type;
  model.docModalOpen = true;
  $('docModal').classList.remove('hidden');

  $('modalTabSpec').classList.toggle('active', type === 'spec');
  $('modalTabDevplan').classList.toggle('active', type === 'devplan');

  const contentEl = $('docModalContent');
  contentEl.innerHTML = 'Loading document content...';

  const s = model.state || {};
  const adh = type === 'spec' ? s.specAdherence : s.devplanAdherence;
  const adhLabel = typeof adh === 'string' ? adh : adh?.status || 'active';
  $('docAdherenceBadge').textContent = `Adherence: ${adhLabel}`;

  if (!model.selectedRunId) {
    contentEl.textContent = 'No run selected to load document artifacts.';
    return;
  }

  const candidates = type === 'spec' 
    ? ['spec.md', 'SPEC.approved-candidate-v2.md', 'SPEC.approved-candidate.md', 'SPEC.md']
    : ['devplan.md', 'DEVPLAN.approved-candidate-v2.md', 'DEVPLAN.reconciled.md', 'DEVPLAN.md'];

  for (const candidate of candidates) {
    try {
      const txt = await getText(`/api/runs/${encodeURIComponent(model.selectedRunId)}/artifacts/${candidate}`);
      contentEl.innerHTML = md(txt);
      return;
    } catch {
      // try next
    }
  }

  contentEl.textContent = `Could not load ${type.toUpperCase()} artifact for run ${model.selectedRunId}.`;
}

function closeDocModal() {
  model.docModalOpen = false;
  $('docModal').classList.add('hidden');
}

// --------------------------------------------------------------------------
// Data Synchronizers & Stream Handlers
// --------------------------------------------------------------------------

async function loadRunResources() {
  if (!model.selectedRunId) {
    model.artifacts = [];
    model.logs = [];
    return;
  }
  try {
    model.artifacts = await getJson(`/api/runs/${encodeURIComponent(model.selectedRunId)}/artifacts`);
  } catch { model.artifacts = []; }

  try {
    model.logs = await getJson(`/api/runs/${encodeURIComponent(model.selectedRunId)}/logs`);
  } catch { model.logs = []; }
}

async function refreshAll() {
  try {
    model.state = await getJson('/api/state');
    model.runs = await getJson('/api/runs');
    if (!model.selectedRunId && model.runs.length > 0) {
      model.selectedRunId = model.state.currentRunId || model.runs[0].id;
    }
    ingestEvents(await getJson('/api/events?limit=500'));
    await loadRunResources();
    renderAll();
    $('sseStatus').textContent = 'API Live';
    $('sseStatus').style.color = 'var(--accent-green)';
  } catch (e) {
    $('sseStatus').textContent = 'API Error';
    $('sseStatus').style.color = 'var(--accent-red)';
  }
}

function connectSSE() {
  try {
    const es = new EventSource('/api/stream');
    es.addEventListener('open', () => {
      $('sseStatus').textContent = 'SSE Live';
      $('sseStatus').style.color = 'var(--accent-green)';
    });
    es.addEventListener('state', e => {
      const p = JSON.parse(e.data);
      model.raw.push({ type: 'state', ts: new Date().toISOString(), payload: p });
      if (!model.paused) {
        model.state = p;
        if (!model.selectedRunId) model.selectedRunId = p.currentRunId;
        renderTopbar();
        renderSidebar();
      }
    });
    es.addEventListener('events', e => {
      const p = JSON.parse(e.data);
      model.raw.push({ type: 'events', ts: new Date().toISOString(), payload: p });
      if (!model.paused) {
        ingestEvents(p);
        renderTerminal();
        renderToolConsole();
      }
    });
    es.addEventListener('heartbeat', e => {
      if (!model.paused && model.selectedRunId) {
        loadRunResources().then(() => renderSidebar());
      }
    });
    es.onerror = () => {
      $('sseStatus').textContent = 'SSE Disconnected';
      $('sseStatus').style.color = 'var(--accent-amber)';
      es.close();
      setTimeout(connectSSE, 5000);
    };
  } catch {
    setTimeout(connectSSE, 5000);
  }
}

// --------------------------------------------------------------------------
// Event Listeners & Initialization
// --------------------------------------------------------------------------

function setupEventListeners() {
  // Global Search & Filtering
  $('globalSearch').oninput = (e) => {
    model.searchQuery = e.target.value;
    renderTerminal();
    renderToolConsole();
  };

  document.querySelectorAll('#filterBadges .dev-badge').forEach(btn => {
    btn.onclick = () => {
      model.activeFilter = btn.dataset.filter;
      renderCommandBar();
      renderTerminal();
    };
  });

  // Run Select Dropdown
  $('runSelect').onchange = (e) => {
    model.selectedRunId = e.target.value;
    setPref('hermes.apb.dashboard.selectedRunId', model.selectedRunId);
    loadRunResources().then(renderAll);
  };

  // Sidebar Tabs
  document.querySelectorAll('.sidebar-tabs .tab-btn').forEach(btn => {
    btn.onclick = () => {
      model.sidebarTab = btn.dataset.sidebarTab;
      renderSidebar();
    };
  });

  // Console Subtabs
  document.querySelectorAll('.console-tabs-bar .tab-btn').forEach(btn => {
    btn.onclick = () => {
      model.consoleTab = btn.dataset.consoleTab;
      setPref('hermes.apb.dashboard.consoleTab', model.consoleTab);
      renderToolConsole();
    };
  });

  // Quick Action Buttons
  $('btnOpenSpec').onclick = () => openDocModal('spec');
  $('btnOpenDevplan').onclick = () => openDocModal('devplan');
  $('btnPause').onclick = () => {
    model.paused = !model.paused;
    setPref('hermes.apb.dashboard.pauseRealtime', model.paused);
    renderTopbar();
  };
  $('btnRefresh').onclick = refreshAll;

  // Terminal Controls
  $('toggleFollow').onclick = () => {
    model.followTerminal = !model.followTerminal;
    setPref('hermes.apb.dashboard.followConsole', model.followTerminal);
    $('toggleFollow').textContent = `Follow: ${model.followTerminal ? 'ON' : 'OFF'}`;
    $('toggleFollow').classList.toggle('active', model.followTerminal);
    if (model.followTerminal) renderTerminal();
  };

  $('btnClearTerminal').onclick = () => {
    model.events = [];
    renderTerminal();
  };

  $('clearAgentFilter').onclick = () => {
    model.selectedAgentId = null;
    setPref('hermes.apb.dashboard.selectedAgentId', null);
    renderSidebar();
    renderTerminal();
  };

  // Modal Controls
  $('modalTabSpec').onclick = () => openDocModal('spec');
  $('modalTabDevplan').onclick = () => openDocModal('devplan');
  $('btnCloseModal').onclick = closeDocModal;
  $('btnCopyDoc').onclick = () => {
    const txt = $('docModalContent').innerText;
    navigator.clipboard.writeText(txt);
    $('btnCopyDoc').textContent = 'Copied!';
    setTimeout(() => { $('btnCopyDoc').textContent = 'Copy'; }, 2000);
  };

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== $('globalSearch')) {
      e.preventDefault();
      $('globalSearch').focus();
    }
    if (e.key === 'Escape') {
      closeDocModal();
      $('detailDrawer').classList.add('hidden');
    }
    if (e.altKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      openDocModal('spec');
    }
    if (e.altKey && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      openDocModal('devplan');
    }
  });

  // Pane Resizer Dragging
  const resizer = $('paneResizer');
  let isDragging = false;

  resizer.addEventListener('pointerdown', (e) => {
    isDragging = true;
    resizer.classList.add('dragging');
    resizer.setPointerCapture(e.pointerId);
    document.body.style.cursor = 'row-resize';
  });

  resizer.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    const containerHeight = $('terminalPane').parentElement.clientHeight;
    const topOffset = $('terminalPane').getBoundingClientRect().top;
    const newHeightPx = Math.min(Math.max(e.clientY - topOffset, 100), containerHeight - 100);
    const val = `${newHeightPx}px`;
    $('terminalPane').style.height = val;
    model.terminalHeight = val;
    setPref('hermes.apb.dashboard.terminalHeight', val);
  });

  resizer.addEventListener('pointerup', () => {
    isDragging = false;
    resizer.classList.remove('dragging');
    document.body.style.cursor = '';
  });
}

// --------------------------------------------------------------------------
// Initialization
// --------------------------------------------------------------------------

function init() {
  if (model.terminalHeight) {
    $('terminalPane').style.height = model.terminalHeight;
  }
  setupEventListeners();
  refreshAll();
  connectSSE();
}

init();
