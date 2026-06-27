/**
 * Timeline Stream Dashboard JS (2026 Edition)
 * Hermes Autonomous Project Builder (HAPB)
 */

const stateNames = [
  "idle", "inventory-scanning", "selecting", "repo-created",
  "spec-drafting", "spec-review", "spec-approved",
  "devplan-drafting", "devplan-review", "devplan-approved",
  "building", "blocked", "deblocking", "on-hold", "completed", "published"
];

const shortState = {
  "inventory-scanning": "scan", "repo-created": "repo", "spec-drafting": "spec",
  "spec-review": "spec rev", "spec-approved": "spec ok", "devplan-drafting": "devplan",
  "devplan-review": "plan rev", "devplan-approved": "plan ok", building: "build",
  deblocking: "deblock", "on-hold": "hold", completed: "done"
};

const theme = {
  idle: "", selecting: "info", "inventory-scanning": "info", "repo-created": "info",
  "spec-drafting": "active", "spec-review": "review", "spec-approved": "success",
  "devplan-drafting": "active", "devplan-review": "review", "devplan-approved": "success",
  building: "active", blocked: "danger", deblocking: "warning", "on-hold": "warning",
  completed: "success", published: "success"
};

const terminalStates = new Set(["idle", "done", "error", "blocked", "complete", "completed", "published"]);

// Helper utilities
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const pref = (k, d = null) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const setPref = (k, v) => localStorage.setItem(k, JSON.stringify(v));

// Global Application Model
let model = {
  state: null,
  events: [],
  runs: [],
  artifacts: [],
  logs: [],
  raw: [],
  toolCalls: new Map(),
  
  // LocalStorage Persisted Preferences
  selectedRunId: pref('hermes.apb.dashboard.selectedRunId'),
  selectedAgentId: pref('hermes.apb.dashboard.selectedAgentId', 'orchestrator'),
  drawerTab: pref('hermes.apb.dashboard.timelineDrawerTab', 'agent'),
  paused: pref('hermes.apb.dashboard.pauseRealtime', false),
  followWaterfall: pref('hermes.apb.dashboard.followWaterfall', true),
  typeFilter: pref('hermes.apb.dashboard.timelineTypeFilter', 'all'),
  agentFilter: pref('hermes.apb.dashboard.timelineAgentFilter', 'all'),
  sortOrder: pref('hermes.apb.dashboard.timelineSortOrder', 'asc'), // 'asc' = oldest first, 'desc' = newest first
  query: '',
  
  // Active Inspection context
  drawerOpen: false,
  drawerPayload: null,
  selectedArtifact: pref('hermes.apb.dashboard.selectedArtifact'),
  selectedLog: pref('hermes.apb.dashboard.selectedLog'),
  artifactCache: new Map(),
  logCache: new Map()
};

function fmt(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleTimeString(); } catch { return s; }
}

function calcDeltaMs(currentTs, prevTs) {
  if (!currentTs || !prevTs) return null;
  const c = Date.parse(currentTs);
  const p = Date.parse(prevTs);
  if (isNaN(c) || isNaN(p)) return null;
  return c - p;
}

function formatDelta(ms) {
  if (ms === null || ms === undefined || ms < 0) return 'Δt +0ms';
  if (ms < 1000) return `Δt +${ms}ms`;
  return `Δt +${(ms / 1000).toFixed(2)}s`;
}

function dot(status) {
  return `<span class="dot ${theme[status] || status || ''}" title="${esc(status)}"></span>`;
}

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

function inferAgent(src = '') {
  const s = String(src).toLowerCase();
  if (s.includes('spec')) return 'spec-author';
  if (s.includes('devplan')) return 'devplan-writer';
  if (s.includes('test')) return 'testing-subagent';
  if (s.includes('doc')) return 'docs-subagent';
  if (s.includes('builder') || s.includes('worker')) return 'worker-core';
  if (s.includes('deblock')) return 'deblocker';
  if (s.includes('select')) return 'selector';
  if (s.includes('invent')) return 'inventory-scanner';
  return src || 'main-orchestrator';
}

function normalizeEvent(e) {
  const typ = e.type || e.eventType || 'event';
  const dat = { ...(e.data || {}) };
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
    agentId: e.agentId || d.agentId || inferAgent(e.source),
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
      id,
      label: id,
      role: 'event-derived subagent',
      status: 'seen',
      currentTask: e.message || e.type,
      currentPhase: e.data?.phase || s.phase || s.status,
      lastMessage: e.message || ''
    });
  }
  const main = {
    id: 'main-orchestrator',
    label: 'Main Orchestrator',
    role: 'scheduled workflow',
    status: s.status || 'idle',
    currentTask: s.task || s.currentTask || s.lastAction || 'monitor scheduled run',
    currentPhase: s.phase || s.status,
    lastMessage: s.lastAction || ''
  };
  if (!seen.has('main-orchestrator')) seen.set('main-orchestrator', main);
  return [...seen.values()];
}

// ==========================================================================
// RENDERERS & VIEW LOGIC
// ==========================================================================

function renderTop() {
  const s = model.state || {}, ws = workflowStatus(s);
  const project = s.selectedProject?.name || s.currentProject || 'no project';
  $('topStatus').innerHTML = `${dot(ws)} <b>${esc(s.status || ws)}</b> · phase: <code>${esc(s.phase || ws)}</code> · project: <b>${esc(project)}</b>`;
  $('pauseEvents').textContent = model.paused ? 'Resume Stream' : 'Pause Stream';
  
  const runSelect = $('runSelect');
  const activeRun = model.selectedRunId || model.state?.currentRunId;
  runSelect.innerHTML = (model.runs || []).map(r => 
    `<option value="${esc(r.id)}" ${r.id === activeRun ? 'selected' : ''}>Run ${esc(r.id.slice(0, 8))} (${esc(r.selectedProject || 'project')})</option>`
  ).join('') || '<option value="">No runs recorded</option>';
}

function renderMilestoneGraph() {
  const s = model.state || {}, ws = workflowStatus(s);
  const activeIdx = stateNames.indexOf(ws);
  
  $('activePhaseBadge').className = `chip status-pill ${theme[ws] || ''}`;
  $('activePhaseBadge').innerHTML = `${dot(ws)} Active Phase: <b>${esc(ws)}</b>`;
  
  const html = stateNames.map((phase, i) => {
    const isCurrent = ws === phase;
    const isDone = activeIdx >= 0 && i < activeIdx && !['blocked', 'deblocking', 'on-hold'].includes(phase);
    const isInterrupt = ['blocked', 'on-hold', 'deblocking'].includes(phase);
    
    const nodeClass = `milestone-node ${isCurrent ? 'current' : ''} ${isDone ? 'done' : ''} ${isInterrupt ? 'interrupt' : ''}`;
    
    return `
      <div class="${nodeClass}">
        <div class="milestone-pill" title="Phase: ${esc(phase)}">
          <span class="milestone-step-num">${i + 1}</span>
          <span>${esc(shortState[phase] || phase)}</span>
        </div>
      </div>
      ${i < stateNames.length - 1 ? '<div class="milestone-connector"></div>' : ''}
    `;
  }).join('');
  
  $('milestoneGraph').innerHTML = html;
}

function renderAgentFilterOptions() {
  const select = $('agentFilterSelect');
  const list = agents();
  const currentVal = model.agentFilter;
  select.innerHTML = `<option value="all">All Subagents (${list.length})</option>` + 
    list.map(a => `<option value="${esc(a.id)}" ${a.id === currentVal ? 'selected' : ''}>${esc(a.label || a.id)}</option>`).join('');
}

function updateFilterCounts() {
  const evs = model.events;
  $('countAll').textContent = evs.length;
  $('countTools').textContent = evs.filter(e => extractTool(e)).length;
  $('countSpawns').textContent = evs.filter(e => e.type?.includes('spawn') || e.message?.toLowerCase().includes('spawn') || e.type?.includes('agent-created')).length;
  $('countDecisions').textContent = evs.filter(e => e.type?.includes('decision') || e.type?.includes('state') || e.message?.toLowerCase().includes('decision')).length;
  $('countErrors').textContent = evs.filter(e => e.level === 'error' || e.level === 'warn' || e.message?.toLowerCase().includes('error')).length;
}

function renderWaterfallStream() {
  updateFilterCounts();
  const container = $('waterfallStream');
  let filtered = [...model.events];
  
  // Filter by Type
  if (model.typeFilter === 'tools') {
    filtered = filtered.filter(e => extractTool(e));
  } else if (model.typeFilter === 'spawns') {
    filtered = filtered.filter(e => e.type?.includes('spawn') || e.message?.toLowerCase().includes('spawn') || e.type?.includes('agent-created'));
  } else if (model.typeFilter === 'decisions') {
    filtered = filtered.filter(e => e.type?.includes('decision') || e.type?.includes('state') || e.message?.toLowerCase().includes('decision'));
  } else if (model.typeFilter === 'errors') {
    filtered = filtered.filter(e => e.level === 'error' || e.level === 'warn' || e.message?.toLowerCase().includes('error'));
  }
  
  // Filter by Agent
  if (model.agentFilter !== 'all') {
    filtered = filtered.filter(e => e.agentId === model.agentFilter);
  }
  
  // Search query filter
  if (model.query) {
    const q = model.query.toLowerCase();
    filtered = filtered.filter(e => JSON.stringify(e).toLowerCase().includes(q));
  }

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-stream-state"><span>No stream events matching current filter criteria.</span></div>';
    return;
  }
  
  // Sort events chronologically to compute delta times
  filtered.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  
  const cardsHtml = [];
  let prevTs = null;
  
  for (let i = 0; i < filtered.length; i++) {
    const e = filtered[i];
    const deltaMs = calcDeltaMs(e.ts, prevTs);
    prevTs = e.ts;
    
    const tool = extractTool(e);
    let cardTypeClass = 'type-info';
    if (e.level === 'error' || e.type?.includes('error')) cardTypeClass = 'type-error';
    else if (tool) cardTypeClass = 'type-tool';
    else if (e.type?.includes('spawn') || e.message?.toLowerCase().includes('spawn')) cardTypeClass = 'type-spawn';
    else if (e.type?.includes('decision')) cardTypeClass = 'type-decision';
    else if (e.level === 'success' || e.type?.includes('approved') || e.type?.includes('completed')) cardTypeClass = 'type-success';
    
    // Latency Indicators: green <100ms, yellow <500ms, red >=500ms
    let latencyBadge = '';
    if (tool && tool.durationMs !== undefined) {
      const durMs = tool.durationMs;
      let speedClass = 'latency-fast'; // green <100ms
      if (durMs >= 500) speedClass = 'latency-slow'; // red >=500ms
      else if (durMs >= 100) speedClass = 'latency-medium'; // yellow <500ms (100-499ms)
      latencyBadge = `<span class="latency-badge ${speedClass}">${durMs}ms</span>`;
    }
    
    // SVG Branch connector graphics for subagents
    const branchSvg = `<svg class="branch-connector-svg" viewBox="0 0 28 16"><path d="M 0 8 Q 14 8 28 8" /></svg>`;

    cardsHtml.push(`
      <article class="timeline-card ${cardTypeClass}" data-event-id="${esc(e.id)}">
        ${branchSvg}
        <header class="card-header">
          <div class="card-title-group">
            ${dot(e.level)}
            <span class="card-title">${esc(tool ? `Tool: ${tool.toolName}` : e.type)}</span>
            <span class="agent-tag">${esc(e.agentId)}</span>
          </div>
          <div class="card-time-group">
            ${latencyBadge}
            <span class="delta-badge">${formatDelta(deltaMs)}</span>
            <span class="time-stamp">${fmt(e.ts)}</span>
          </div>
        </header>
        <div class="card-message">${esc(e.message || tool?.action || 'Stream telemetry entry.')}</div>
        <footer class="card-meta-bar">
          <span>Source: <code>${esc(e.source)}</code></span>
          <button class="inspect-btn" data-inspect-event="${esc(e.id)}">Inspect Details</button>
        </footer>
      </article>
    `);
  }
  
  if (model.sortOrder === 'desc') {
    cardsHtml.reverse();
  }
  
  container.innerHTML = cardsHtml.join('');
  
  // Attach inspect button listeners
  container.querySelectorAll('[data-inspect-event]').forEach(btn => {
    btn.onclick = (ev) => {
      ev.stopPropagation();
      const id = btn.dataset.inspectEvent;
      const targetEvent = model.events.find(x => x.id === id);
      openDrawerTab('raw', targetEvent);
    };
  });
  
  // Auto scroll if follow mode is active
  if (model.followWaterfall && model.sortOrder === 'asc') {
    const pane = document.querySelector('.waterfall-section');
    if (pane) pane.scrollTop = pane.scrollHeight;
  }
}

function renderPerformanceInspector() {
  // Metrics Overview
  $('metricTotalEvents').textContent = model.events.length;
  
  const tools = [...model.toolCalls.values()];
  $('metricTotalTools').textContent = tools.length;
  
  let totalDur = 0, durCount = 0;
  tools.forEach(t => {
    if (t.durationMs !== undefined) { totalDur += t.durationMs; durCount++; }
  });
  const avgLat = durCount > 0 ? Math.round(totalDur / durCount) : 0;
  $('metricAvgLatency').textContent = `${avgLat}ms`;
  
  const activeAgentsList = agents().filter(a => !terminalStates.has(a.status));
  $('metricActiveAgents').textContent = activeAgentsList.length;
  
  // Subagent Runtime Sparkbars
  const agentList = agents();
  const runtimeMap = new Map();
  let maxRuntimeMs = 1000;
  
  agentList.forEach(a => {
    const evs = model.events.filter(e => e.agentId === a.id);
    if (evs.length > 0) {
      evs.sort((x, y) => Date.parse(x.ts) - Date.parse(y.ts));
      const start = Date.parse(evs[0].ts);
      const end = evs.length > 1 ? Date.parse(evs[evs.length - 1].ts) : Date.now();
      const diff = Math.max(0, end - start);
      runtimeMap.set(a.id, { agent: a, ms: diff, count: evs.length });
      if (diff > maxRuntimeMs) maxRuntimeMs = diff;
    } else {
      runtimeMap.set(a.id, { agent: a, ms: 0, count: 0 });
    }
  });
  
  const runtimesHtml = [...runtimeMap.values()]
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 6)
    .map(item => {
      const pct = Math.round((item.ms / maxRuntimeMs) * 100);
      const sec = (item.ms / 1000).toFixed(1);
      return `
        <div class="runtime-row" data-agent-runtime="${esc(item.agent.id)}">
          <div class="runtime-info">
            <b>${esc(item.agent.label || item.agent.id)}</b>
            <span class="muted">${sec}s (${pct}% · ${item.count} evts)</span>
          </div>
          <div class="runtime-bar-bg">
            <div class="runtime-bar-fill" style="width: ${pct}%;"></div>
          </div>
        </div>
      `;
    }).join('') || '<div class="empty">No agent runtime telemetry.</div>';
    
  $('agentRuntimesList').innerHTML = runtimesHtml;
  
  document.querySelectorAll('[data-agent-runtime]').forEach(el => {
    el.onclick = () => {
      const id = el.dataset.agentRuntime;
      const targetAgent = agents().find(a => a.id === id);
      openDrawerTab('agent', targetAgent);
    };
  });
  
  // Tool Call Speeds Leaderboard Sparkbars
  const toolStats = new Map();
  tools.forEach(t => {
    const name = t.toolName || 'unknown';
    const old = toolStats.get(name) || { count: 0, totalMs: 0, maxMs: 0 };
    const durMs = t.durationMs || 0;
    toolStats.set(name, {
      count: old.count + 1,
      totalMs: old.totalMs + durMs,
      maxMs: Math.max(old.maxMs, durMs)
    });
  });
  
  const toolEntries = [...toolStats.entries()].sort((a, b) => (b[1].totalMs / b[1].count) - (a[1].totalMs / a[1].count));
  const maxAvgMs = toolEntries.length > 0 ? Math.max(...toolEntries.map(e => e[1].totalMs / e[1].count), 500) : 1000;

  const toolSpeedHtml = toolEntries
    .slice(0, 6)
    .map(([name, stat]) => {
      const avg = Math.round(stat.totalMs / stat.count);
      const barPct = Math.min(100, Math.round((avg / maxAvgMs) * 100));
      
      let speedClass = 'latency-fast';
      if (avg >= 500) speedClass = 'latency-slow';
      else if (avg >= 100) speedClass = 'latency-medium';
      
      return `
        <div class="tool-speed-row">
          <div class="tool-speed-info">
            <div>
              <b>${esc(name)}</b>
              <span class="muted">×${stat.count} calls</span>
            </div>
            <span class="latency-badge ${speedClass}">avg ${avg}ms (max ${stat.maxMs}ms)</span>
          </div>
          <div class="tool-bar-bg">
            <div class="tool-bar-fill" style="width: ${barPct}%;"></div>
          </div>
        </div>
      `;
    }).join('') || '<div class="empty">No tool telemetry recorded yet.</div>';
    
  $('toolSpeedList').innerHTML = toolSpeedHtml;
}

// ==========================================================================
// INSPECTOR DRAWER CONTROLLER
// ==========================================================================

function openDrawerTab(tabName, payload = null) {
  model.drawerTab = tabName;
  setPref('hermes.apb.dashboard.timelineDrawerTab', tabName);
  if (payload) model.drawerPayload = payload;
  
  const drawer = $('inspectorDrawer');
  const backdrop = $('drawerBackdrop');
  drawer.hidden = false;
  if (backdrop) backdrop.hidden = false;
  
  document.querySelectorAll('[data-drawer-tab]').forEach(b => {
    b.classList.toggle('active', b.dataset.drawerTab === tabName);
  });
  
  renderDrawerContent();
}

function closeDrawer() {
  $('inspectorDrawer').hidden = true;
  const backdrop = $('drawerBackdrop');
  if (backdrop) backdrop.hidden = true;
}

async function renderDrawerContent() {
  const content = $('drawerContent');
  const tab = model.drawerTab;
  $('drawerTitle').textContent = `Inspector · ${tab.toUpperCase()}`;
  
  if (tab === 'agent') {
    const a = model.drawerPayload || agents().find(x => x.id === model.selectedAgentId) || agents()[0];
    if (!a) { content.innerHTML = '<div class="empty">No subagent selected.</div>'; return; }
    const ev = model.events.filter(e => e.agentId === a.id).slice(-30);
    content.innerHTML = `
      <div class="inspector-section">
        <div class="mini-toolbar"><b>${esc(a.label || a.id)}</b><span class="badged">${esc(a.status)}</span></div>
        <div class="deck-grid" style="grid-template-columns: repeat(2, 1fr); display:grid; gap:8px; margin: 10px 0;">
          <div class="kv"><span>role</span><strong>${esc(a.role)}</strong></div>
          <div class="kv"><span>phase</span><strong>${esc(a.currentPhase || '—')}</strong></div>
        </div>
        <h4>Last Agent Telemetry Log</h4>
        <pre class="raw-box">${esc(a.lastMessage || 'No recent log recorded.')}</pre>
        <h4 style="margin-top:12px;">Recent Events (${ev.length})</h4>
        <div style="display:grid; gap:6px;">
          ${ev.map(e => `<div class="event-row"><div class="event-summary"><span>${fmt(e.ts)}</span> <b>${esc(e.type)}</b>: ${esc(e.message)}</div></div>`).join('')}
        </div>
      </div>
    `;
  } else if (tab === 'spec' || tab === 'devplan') {
    const file = tab === 'spec' ? 'spec.md' : 'devplan.md';
    const candidates = tab === 'spec' 
      ? ['spec.md', 'SPEC.approved-candidate-v2.md', 'SPEC.approved-candidate.md', 'SPEC.md']
      : ['devplan.md', 'DEVPLAN.approved-candidate-v2.md', 'DEVPLAN.reconciled.md', 'DEVPLAN.md'];
    
    content.innerHTML = `<div class="inspector-section"><h4>${tab.toUpperCase()} Artifact</h4><article class="markdown raw-box">Loading ${file}…</article></div>`;
    
    if (!model.selectedRunId) {
      content.querySelector('article').textContent = `No active execution run selected.`;
      return;
    }
    for (const candidate of candidates) {
      try {
        const txt = await getText(`/api/runs/${encodeURIComponent(model.selectedRunId)}/artifacts/${candidate}`);
        content.querySelector('article').innerHTML = `<p class="muted" style="margin-bottom:8px;">Artifact: <code>${esc(candidate)}</code></p>` + md(txt);
        return;
      } catch {}
    }
    content.querySelector('article').textContent = `No ${tab.toUpperCase()} artifact found for run ${model.selectedRunId}.`;
  } else if (tab === 'artifacts') {
    const list = model.artifacts || [];
    const key = `${model.selectedRunId}:artifact:${model.selectedArtifact || ''}`;
    const cached = model.artifactCache.get(key);
    
    content.innerHTML = `
      <div class="inspector-section">
        <div class="file-list" style="margin-bottom: 12px;">
          ${list.map(f => `<div class="file-row ${f.name === model.selectedArtifact ? 'active' : ''}" data-drawer-artifact="${esc(f.name)}"><b>${esc(f.name)}</b><span class="muted">${f.size} bytes</span></div>`).join('') || '<div class="empty">No artifacts available.</div>'}
        </div>
        <h4>Preview</h4>
        <pre id="drawerArtifactPreview" class="preview">${esc(cached || (model.selectedArtifact ? 'Loading preview…' : 'Select an artifact file above.'))}</pre>
      </div>
    `;
    
    content.querySelectorAll('[data-drawer-artifact]').forEach(el => {
      el.onclick = async () => {
        model.selectedArtifact = el.dataset.drawerArtifact;
        setPref('hermes.apb.dashboard.selectedArtifact', model.selectedArtifact);
        renderDrawerContent();
        try {
          const txt = await getText(`/api/runs/${encodeURIComponent(model.selectedRunId)}/artifacts/${encodeURIComponent(model.selectedArtifact)}`);
          model.artifactCache.set(`${model.selectedRunId}:artifact:${model.selectedArtifact}`, txt);
          const prev = $('drawerArtifactPreview');
          if (prev) prev.textContent = txt;
        } catch {}
      };
    });
  } else if (tab === 'logs') {
    const list = model.logs || [];
    const key = `${model.selectedRunId}:log:${model.selectedLog || ''}`;
    const cached = model.logCache.get(key);
    
    content.innerHTML = `
      <div class="inspector-section">
        <div class="file-list" style="margin-bottom: 12px;">
          ${list.map(f => `<div class="file-row ${f.name === model.selectedLog ? 'active' : ''}" data-drawer-log="${esc(f.name)}"><b>${esc(f.name)}</b><span class="muted">${f.size} bytes</span></div>`).join('') || '<div class="empty">No agent logs available.</div>'}
        </div>
        <h4>Log Tail</h4>
        <pre id="drawerLogPreview" class="preview">${esc(cached || (model.selectedLog ? 'Loading log tail…' : 'Select a log file above.'))}</pre>
      </div>
    `;
    
    content.querySelectorAll('[data-drawer-log]').forEach(el => {
      el.onclick = async () => {
        model.selectedLog = el.dataset.drawerLog;
        setPref('hermes.apb.dashboard.selectedLog', model.selectedLog);
        renderDrawerContent();
        try {
          const txt = await getText(`/api/runs/${encodeURIComponent(model.selectedRunId)}/logs/${encodeURIComponent(model.selectedLog)}?tail=1000`);
          model.logCache.set(`${model.selectedRunId}:log:${model.selectedLog}`, txt);
          const prev = $('drawerLogPreview');
          if (prev) prev.textContent = txt;
        } catch {}
      };
    });
  } else if (tab === 'raw') {
    const payload = model.drawerPayload || model.state || {};
    content.innerHTML = `<pre class="raw-box">${esc(JSON.stringify(payload, null, 2))}</pre>`;
  }
}

function md(src) {
  return esc(src)
    .replace(/^### (.*)$/gm, '<h3 style="color:var(--tl-cyan); margin-top:12px;">$1</h3>')
    .replace(/^## (.*)$/gm, '<h2 style="color:var(--tl-text-main); border-bottom:1px solid var(--tl-border); padding-bottom:4px; margin-top:16px;">$1</h2>')
    .replace(/^# (.*)$/gm, '<h1 style="color:var(--tl-cyan); margin-top:20px;">$1</h1>')
    .replace(/^- \[x\] (.*)$/gim, '<p style="margin:4px 0;">✅ $1</p>')
    .replace(/^- \[ \] (.*)$/gim, '<p style="margin:4px 0; color:var(--tl-text-muted);">⬜ $1</p>')
    .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.08); padding:2px 5px; border-radius:4px; color:var(--tl-cyan);">$1</code>')
    .replace(/\n\n/g, '<br><br>');
}

function renderAll() {
  renderTop();
  renderMilestoneGraph();
  renderAgentFilterOptions();
  renderWaterfallStream();
  renderPerformanceInspector();
  if (!($('inspectorDrawer').hidden)) renderDrawerContent();
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
  } catch {
    $('streamState').textContent = 'API error';
    $('streamState').className = 'chip status-pill danger';
  }
}

function connect() {
  try {
    const es = new EventSource('/api/stream');
    es.addEventListener('open', () => {
      $('streamState').textContent = 'SSE live';
      $('streamState').className = 'chip sse-status-chip';
    });
    es.addEventListener('state', e => {
      const p = JSON.parse(e.data);
      model.raw.push({ type: 'state', ts: new Date().toISOString(), payload: p });
      if (!model.paused) {
        model.state = p;
        if (!model.selectedRunId) model.selectedRunId = p.currentRunId;
        renderAll();
      }
    });
    es.addEventListener('events', e => {
      const p = JSON.parse(e.data);
      model.raw.push({ type: 'events', ts: new Date().toISOString(), payload: p });
      if (!model.paused) {
        ingestEvents(p);
        renderAll();
      }
    });
    es.addEventListener('heartbeat', e => {
      model.raw.push({ type: 'heartbeat', ts: new Date().toISOString(), payload: JSON.parse(e.data) });
      if (!model.paused && model.selectedRunId) loadRunResources().then(renderAll);
    });
    es.onerror = () => {
      $('streamState').textContent = 'SSE reconnecting…';
      $('streamState').className = 'chip status-pill warning';
      es.close();
      setTimeout(connect, 4000);
    };
  } catch {
    setInterval(refresh, 4000);
  }
}

// ==========================================================================
// EVENT LISTENERS & INITIALIZATION
// ==========================================================================

$('runSelect').onchange = (e) => {
  model.selectedRunId = e.target.value;
  setPref('hermes.apb.dashboard.selectedRunId', model.selectedRunId);
  loadRunResources().then(renderAll);
};

$('timelineFilter').oninput = (e) => {
  model.query = e.target.value;
  renderWaterfallStream();
};

$('refreshNow').onclick = refresh;
$('pauseEvents').onclick = () => {
  model.paused = !model.paused;
  setPref('hermes.apb.dashboard.pauseRealtime', model.paused);
  renderTop();
};

document.querySelectorAll('[data-type-filter]').forEach(btn => {
  btn.onclick = () => {
    model.typeFilter = btn.dataset.typeFilter;
    setPref('hermes.apb.dashboard.timelineTypeFilter', model.typeFilter);
    document.querySelectorAll('[data-type-filter]').forEach(x => x.classList.toggle('active', x === btn));
    renderWaterfallStream();
  };
});

$('agentFilterSelect').onchange = (e) => {
  model.agentFilter = e.target.value;
  setPref('hermes.apb.dashboard.timelineAgentFilter', model.agentFilter);
  renderWaterfallStream();
};

$('sortOrderBtn').onclick = () => {
  model.sortOrder = model.sortOrder === 'asc' ? 'desc' : 'asc';
  setPref('hermes.apb.dashboard.timelineSortOrder', model.sortOrder);
  $('sortOrderBtn').textContent = model.sortOrder === 'asc' ? 'Order: Oldest First' : 'Order: Newest First';
  renderWaterfallStream();
};

$('followWaterfall').onclick = () => {
  model.followWaterfall = !model.followWaterfall;
  setPref('hermes.apb.dashboard.followWaterfall', model.followWaterfall);
  $('followWaterfall').classList.toggle('active', model.followWaterfall);
  $('followWaterfall').textContent = model.followWaterfall ? 'Follow: ON' : 'Follow: OFF';
};

document.querySelectorAll('[data-open-drawer]').forEach(btn => {
  btn.onclick = () => openDrawerTab(btn.dataset.openDrawer);
});

document.querySelectorAll('[data-drawer-tab]').forEach(btn => {
  btn.onclick = () => openDrawerTab(btn.dataset.drawerTab);
});

$('closeDrawerBtn').onclick = closeDrawer;
const backdropEl = $('drawerBackdrop');
if (backdropEl) backdropEl.onclick = closeDrawer;

window.addEventListener('keydown', e => {
  if (e.key === '/' && document.activeElement !== $('timelineFilter')) {
    e.preventDefault();
    $('timelineFilter').focus();
  }
  if (e.key === 'Escape') {
    closeDrawer();
  }
});

// Start application stream & polling fallback
refresh();
connect();
