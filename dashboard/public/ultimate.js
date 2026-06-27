/**
 * HAPB - Ultimate Swarm Control Deck Engine
 * Standalone ES Module handling SSE streaming, REST fallbacks, key-based DOM reconciliation,
 * topology SVG rendering, live active tool timers, and unified slide-over inspector drawer.
 */

const stateNames = [
  "idle", "inventory-scanning", "selecting", "repo-created", "spec-drafting", 
  "spec-review", "spec-approved", "devplan-drafting", "devplan-review", 
  "devplan-approved", "building", "blocked", "deblocking", "on-hold", "completed", "published"
];

const shortState = {
  "inventory-scanning": "scan", "repo-created": "repo", "spec-drafting": "spec",
  "spec-review": "spec review", "spec-approved": "spec ok", "devplan-drafting": "devplan",
  "devplan-review": "plan review", "devplan-approved": "plan ok", building: "build",
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

// Utilities & Preferences
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const pref = (k, d = null) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const setPref = (k, v) => localStorage.setItem(k, JSON.stringify(v));

// Application State Model
let model = {
  state: null,
  events: [],
  runs: [],
  artifacts: [],
  logs: [],
  raw: [],
  toolCalls: new Map(),
  selectedRunId: pref('hermes.apb.dashboard.selectedRunId'),
  selectedAgentId: pref('hermes.apb.dashboard.selectedAgentId', 'main-orchestrator'),
  inspectorTab: pref('hermes.apb.dashboard.inspectorTab', 'agent'),
  expandedAgents: new Set(pref('hermes.apb.dashboard.expandedAgents', ['main-orchestrator', 'builder'])),
  expandedToolBoxes: new Set(pref('hermes.apb.dashboard.expandedToolBoxes', [])),
  expandedToolItems: new Set(pref('hermes.apb.dashboard.expandedToolItems', [])),
  paused: pref('hermes.apb.dashboard.pauseRealtime', false),
  filter: 'all',
  query: '',
  selectedArtifact: pref('hermes.apb.dashboard.selectedArtifact'),
  selectedLog: pref('hermes.apb.dashboard.selectedLog'),
  artifactCache: new Map(),
  logCache: new Map(),
  drawerOpen: false
};

// Formatting & Duration Functions
function fmtTime(s) { if (!s) return '—'; try { return new Date(s).toLocaleTimeString(); } catch { return s; } }
function fmtDateTime(s) { if (!s) return '—'; try { return new Date(s).toLocaleString(); } catch { return s; } }
function calcDuration(start, end) {
  if (!start) return '0s';
  const ms = (end ? Date.parse(end) : Date.now()) - Date.parse(start);
  if (!Number.isFinite(ms) || ms < 0) return '0s';
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

async function getJson(url) { const r = await fetch(url); if (!r.ok) throw new Error(await r.text()); return r.json(); }
async function getText(url) { const r = await fetch(url); if (!r.ok) throw new Error(await r.text()); return r.text(); }

// Event & Tool Extraction Engine
function inferAgent(src = '') {
  const s = String(src).toLowerCase();
  if (s.includes('spec')) return 'spec-author';
  if (s.includes('devplan')) return 'devplan-writer';
  if (s.includes('test')) return 'testing-subagent';
  if (s.includes('doc')) return 'docs-subagent';
  if (s.includes('builder') || s.includes('core')) return 'worker-core';
  if (s.includes('deblock')) return 'deblocker';
  if (s.includes('select')) return 'selector';
  if (s.includes('invent')) return 'inventory-scanner';
  return s || 'main-orchestrator';
}

function guessTool(m = '') {
  return (m.match(/\b(terminal|read_file|write_file|patch|delegate_task|execute_code|web_search|web_extract|search_files)\b/i) || [])[1];
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

function extractTool(e) {
  const d = e.data || {};
  const isTool = String(e.type).startsWith('tool-call') || d.toolName || d.toolCallId || d.tool || /\b(tool|terminal|read_file|patch|write_file|delegate_task|execute_code)\b/i.test(e.message);
  if (!isTool) return null;
  const id = d.toolCallId || d.id || e.id;
  const old = model.toolCalls.get(id) || {};
  const status = e.type?.includes('error') ? 'error' : e.type?.includes('end') ? 'done' : (d.status || old.status || 'running');
  return {
    ...old,
    id,
    agentId: e.agentId || d.agentId || old.agentId,
    source: e.source || old.source,
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
  const s = model.state || {};
  const a = s.agents || {};
  const raw = Array.isArray(a) ? a : Object.values(a);
  
  const arr = raw.map(x => {
    const id = x.id || x.label || x.role;
    const role = x.role || 'subagent';
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
      role: 'active subagent',
      status: 'building',
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

  const rank = {
    'main-orchestrator': 0, orchestrator: 0, 'build-orchestrator': 1,
    'inventory-scanner': 5, selector: 6, 'spec-author': 10, 'research-reviewer': 11,
    'safety-reviewer': 12, 'spec-auditor': 13, 'devplan-writer-a': 20, 'devplan-writer-b': 21,
    'devplan-reconciler': 22, 'devplan-auditor': 23, 'worker-core': 30, 'worker-risk': 31,
    'worker-cli': 32, 'docs-subagent': 40, 'testing-subagent': 41, deblocker: 50, 'final-auditor': 60
  };

  return [...seen.values()].sort((x, y) => (rank[x.id] ?? 80) - (rank[y.id] ?? 80) || String(x.id).localeCompare(String(y.id)));
}

// --- DOM Reconciliation Engine ---
function parseHTML(html) {
  const t = document.createElement('template');
  t.innerHTML = String(html).trim();
  return t.content.firstElementChild;
}

function reconcileList(container, items, options) {
  if (!container) return;
  const { keyAttr, emptyHTML, renderItem, updateItem, getItemKey } = options;
  
  if (!items || items.length === 0) {
    if (emptyHTML) {
      if (container.firstElementChild?.classList.contains('empty-state')) {
        container.firstElementChild.outerHTML = emptyHTML;
      } else {
        container.innerHTML = emptyHTML;
      }
    } else {
      container.innerHTML = '';
    }
    return;
  }

  const emptyEl = container.querySelector('.empty-state');
  if (emptyEl) emptyEl.remove();

  const existingMap = new Map();
  for (const child of Array.from(container.children)) {
    const key = child.getAttribute(keyAttr);
    if (key != null) existingMap.set(key, child);
  }

  items.forEach((item, index) => {
    const key = String(getItemKey(item));
    let el = existingMap.get(key);

    if (el) {
      existingMap.delete(key);
      if (updateItem) updateItem(el, item);
    } else {
      const html = renderItem(item);
      el = parseHTML(html);
    }

    const targetChild = container.children[index];
    if (targetChild !== el) {
      container.insertBefore(el, targetChild || null);
    }
  });

  for (const [key, oldEl] of existingMap) {
    oldEl.remove();
  }
}

function focusKey(el = document.activeElement) {
  if (!el || el === document.body) return null;
  return { id: el.id, name: el.getAttribute('name'), tag: el.tagName, start: el.selectionStart, end: el.selectionEnd };
}

function restoreFocus(k) {
  if (!k) return;
  let el = k.id ? $(k.id) : null;
  if (el && document.activeElement !== el) {
    el.focus({ preventScroll: true });
    if (k.start != null && el.setSelectionRange) try { el.setSelectionRange(k.start, k.end); } catch {}
  }
}

function stableRender(fn) {
  const scroll = [...document.querySelectorAll('.panel-scroll')].map(el => [el, el.scrollTop]);
  const fk = focusKey();
  fn();
  requestAnimationFrame(() => {
    for (const [el, top] of scroll) el.scrollTop = top;
    restoreFocus(fk);
  });
}

// --- Renderers ---

function renderTopBar() {
  const s = model.state || {};
  const ws = workflowStatus(s);
  const banner = $('topStatus');
  if (banner) {
    banner.innerHTML = `<span class="status-pulse-dot"></span> <b>RUN: ${esc(s.currentRunId || 'no-run')}</b> | Phase: <b>${esc(ws)}</b> | Project: <b>${esc(s.selectedProject?.name || s.currentProject || 'hermesswarmbuilder')}</b>`;
  }
  if ($('pauseEvents')) $('pauseEvents').textContent = model.paused ? 'Resume' : 'Pause';
}

function renderWorkflowStrip() {
  const strip = $('workflowStrip');
  if (!strip) return;
  const s = model.state || {};
  const ws = workflowStatus(s);
  const idx = stateNames.indexOf(ws);

  reconcileList(strip, stateNames, {
    keyAttr: 'data-phase',
    getItemKey: x => x,
    renderItem: x => {
      const i = stateNames.indexOf(x);
      const cur = ws === x;
      const done = idx >= 0 && i < idx && !['blocked', 'deblocking', 'on-hold'].includes(x);
      return `<button class="phase-chip ${cur ? 'current' : ''} ${done ? 'done' : ''} ${['blocked', 'on-hold', 'deblocking'].includes(x) ? 'interrupt' : ''}" data-phase="${esc(x)}">${esc(shortState[x] || x)}</button>`;
    },
    updateItem: (el, x) => {
      const i = stateNames.indexOf(x);
      const cur = ws === x;
      const done = idx >= 0 && i < idx && !['blocked', 'deblocking', 'on-hold'].includes(x);
      el.className = `phase-chip ${cur ? 'current' : ''} ${done ? 'done' : ''} ${['blocked', 'on-hold', 'deblocking'].includes(x) ? 'interrupt' : ''}`;
    }
  });
}

function renderTopology() {
  const container = $('topologyNodes');
  const svg = $('topologySvgLines');
  if (!container) return;

  const list = agents();
  const activeCount = list.filter(a => !terminalStates.has(a.status) || a.status === 'blocked').length;
  const runningToolsCount = [...model.toolCalls.values()].filter(t => t.status === 'running').length;

  if ($('statActiveAgents')) $('statActiveAgents').textContent = activeCount;
  if ($('statRunningTools')) $('statRunningTools').textContent = runningToolsCount;
  if ($('statTotalEvents')) $('statTotalEvents').textContent = model.events.length;

  reconcileList(container, list, {
    keyAttr: 'data-topo-agent',
    getItemKey: a => a.id,
    renderItem: a => {
      const isMain = a.id === 'main-orchestrator';
      const tools = [...model.toolCalls.values()].filter(t => t.agentId === a.id);
      const activeTool = tools.find(t => t.status === 'running');
      return `
        <div class="topo-node ${isMain ? 'main-node' : ''} ${a.id === model.selectedAgentId ? 'selected' : ''}" data-topo-agent="${esc(a.id)}">
          <div class="node-header">
            <span class="node-title">${esc(a.label || a.id)}</span>
            <span class="node-dot ${esc(a.status)}"></span>
          </div>
          <div class="node-sub">${esc(activeTool ? '⚡ Tool: ' + activeTool.toolName : (a.currentTask || a.role))}</div>
        </div>
      `;
    },
    updateItem: (el, a) => {
      const isMain = a.id === 'main-orchestrator';
      el.className = `topo-node ${isMain ? 'main-node' : ''} ${a.id === model.selectedAgentId ? 'selected' : ''}`;
      const titleSpan = el.querySelector('.node-title');
      if (titleSpan) titleSpan.textContent = a.label || a.id;
      const dotSpan = el.querySelector('.node-dot');
      if (dotSpan) dotSpan.className = `node-dot ${esc(a.status)}`;
      const subDiv = el.querySelector('.node-sub');
      const tools = [...model.toolCalls.values()].filter(t => t.agentId === a.id);
      const activeTool = tools.find(t => t.status === 'running');
      if (subDiv) subDiv.textContent = activeTool ? '⚡ Tool: ' + activeTool.toolName : (a.currentTask || a.role);
    }
  });

  // Draw topology connection lines
  requestAnimationFrame(() => {
    if (!svg) return;
    const mainEl = container.querySelector('[data-topo-agent="main-orchestrator"]');
    if (!mainEl) return;
    const containerRect = container.getBoundingClientRect();
    const mainRect = mainEl.getBoundingClientRect();
    const mainX = mainRect.left + mainRect.width / 2 - containerRect.left;
    const mainY = mainRect.top + mainRect.height / 2 - containerRect.top;

    let svgPaths = '';
    const otherNodes = container.querySelectorAll('[data-topo-agent]:not([data-topo-agent="main-orchestrator"])');
    otherNodes.forEach(node => {
      const rect = node.getBoundingClientRect();
      const nx = rect.left + rect.width / 2 - containerRect.left;
      const ny = rect.top + rect.height / 2 - containerRect.top;
      const agentId = node.getAttribute('data-topo-agent');
      const agentObj = list.find(x => x.id === agentId);
      const isActive = agentObj && (!terminalStates.has(agentObj.status) || agentObj.status === 'blocked');
      
      svgPaths += `<path d="M ${mainX} ${mainY} Q ${(mainX + nx) / 2} ${(mainY + ny) / 2 - 20} ${nx} ${ny}" class="topology-wire ${isActive ? 'active-wire' : ''}" />`;
    });
    svg.innerHTML = svgPaths;
  });
}

function renderSubagentDeck() {
  const deck = $('subagentDeck');
  if (!deck) return;

  let list = agents();
  
  // Filtering logic
  if (model.filter === 'active') list = list.filter(a => !terminalStates.has(a.status) || a.status === 'blocked');
  else if (model.filter === 'tools') list = list.filter(a => [...model.toolCalls.values()].some(t => t.agentId === a.id && t.status === 'running'));
  else if (model.filter === 'blocked') list = list.filter(a => a.status === 'blocked');
  else if (model.filter === 'completed') list = list.filter(a => a.status === 'completed' || a.status === 'done');

  if (model.query) {
    const q = model.query.toLowerCase();
    list = list.filter(a => a.id.toLowerCase().includes(q) || a.label.toLowerCase().includes(q) || a.currentTask.toLowerCase().includes(q));
  }

  reconcileList(deck, list, {
    keyAttr: 'data-card-agent',
    emptyHTML: '<div class="empty-state">No subagents match the selected filter.</div>',
    getItemKey: a => a.id,
    renderItem: a => buildAgentCardHTML(a),
    updateItem: (el, a) => updateAgentCardDOM(el, a)
  });
}

function buildAgentCardHTML(a) {
  const expanded = model.expandedAgents.has(a.id);
  const isSelected = a.id === model.selectedAgentId;
  const isBlocked = a.status === 'blocked';
  const tools = [...model.toolCalls.values()].filter(t => t.agentId === a.id);
  const activeTool = tools.find(t => t.status === 'running') || tools[tools.length - 1];

  let liveToolHTML = '';
  if (activeTool) {
    const isBoxExp = model.expandedToolBoxes.has(a.id);
    const inputPreview = activeTool.input ? (typeof activeTool.input === 'string' ? activeTool.input : JSON.stringify(activeTool.input, null, 2)) : 'No input payload';
    const outputPreview = activeTool.output ? (typeof activeTool.output === 'string' ? activeTool.output : JSON.stringify(activeTool.output, null, 2)) : '';
    liveToolHTML = `
      <div class="live-tool-box ${isBoxExp ? 'expanded open active' : ''}" data-toggle-toolbox="${esc(a.id)}" style="cursor:pointer;">
        <div class="tool-box-header">
          <div class="tool-name-tag">
            <span class="tool-pulse-ring"></span>
            <span>${esc(activeTool.toolName)}</span>
          </div>
          <span class="tool-timer" data-timer-start="${activeTool.startedAt}">${calcDuration(activeTool.startedAt)}</span>
          <span style="font-size:10px; margin-left: auto; color:var(--text-muted);">${isBoxExp ? '▲ Hide' : '▼ Details'}</span>
        </div>
        <div class="tool-action-summary">${esc(activeTool.action || 'Executing tool action…')}</div>
        ${isBoxExp ? `
          <div class="tool-code-preview" style="max-height:200px; overflow:auto;"><b>Input:</b>\n${esc(inputPreview)}\n\n<b>Output/Error:</b>\n${esc(outputPreview || activeTool.error || 'Running…')}</div>
        ` : `
          <div class="tool-code-preview" style="max-height:60px; overflow:hidden; text-overflow:ellipsis;">${esc(inputPreview.slice(0, 120))}</div>
        `}
      </div>
    `;
  } else {
    liveToolHTML = `<div class="task-description-box"><span class="box-label">Active Execution</span><span class="task-text muted">No tool actively executing</span></div>`;
  }

  const recentEvents = model.events.filter(e => e.agentId === a.id).slice(-4);
  const logTailText = a.lastMessage || (recentEvents.length ? recentEvents.map(e => `[${fmtTime(e.ts)}] ${e.message}`).join('\n') : 'No recent telemetry entries.');

  return `
    <article class="subagent-card ${isSelected ? 'selected active' : ''} ${isBlocked ? 'blocked-card' : ''} ${expanded ? 'expanded open' : ''}" data-card-agent="${esc(a.id)}">
      <div class="card-topbar">
        <div class="card-title-group">
          <span class="agent-name">${esc(a.label || a.id)}</span>
          <span class="role-badge">${esc(a.role || 'subagent')}</span>
        </div>
        <div class="card-badges">
          <span class="status-tag ${esc(a.status)}">${esc(a.status)}</span>
        </div>
      </div>

      <div class="card-body">
        <div class="task-description-box">
          <span class="box-label">Current Task Goal</span>
          <span class="task-text">${esc(a.currentTask || 'Idle / Monitoring workflow')}</span>
        </div>

        ${liveToolHTML}

        <div class="card-expandable-section">
          <button class="toggle-details-btn" data-toggle-card="${esc(a.id)}">
            <span>Subagent Timeline & Log Tail (${tools.length} tools)</span>
            <span>${expanded ? '▲ Hide' : '▼ Expand'}</span>
          </button>
          
          ${expanded ? `
            <div class="details-drawer-body">
              <div class="sub-timeline-list">
                ${tools.slice(-5).reverse().map(t => {
                  const isToolExp = model.expandedToolItems.has(t.id);
                  return `
                    <div class="sub-tool-item ${isToolExp ? 'expanded open active' : ''}" data-toggle-toolitem="${esc(t.id)}" style="cursor:pointer; flex-direction:column; align-items:flex-start;">
                      <div style="display:flex; justify-content:space-between; width:100%;">
                        <span>⚡ <b>${esc(t.toolName)}</b> - ${esc(t.action || 'action')}</span>
                        <span class="muted">${calcDuration(t.startedAt, t.updatedAt)} ${isToolExp ? '▲' : '▼'}</span>
                      </div>
                      ${isToolExp ? `
                        <div class="sub-tool-details" style="margin-top:6px; width:100%; font-size:11px;">
                          ${t.input !== undefined ? `<div><b>Input:</b> <pre class="raw-box" style="max-height:100px; overflow:auto;">${esc(typeof t.input === 'string' ? t.input : JSON.stringify(t.input, null, 2))}</pre></div>` : ''}
                          ${t.output !== undefined ? `<div><b>Output:</b> <pre class="raw-box" style="max-height:100px; overflow:auto;">${esc(typeof t.output === 'string' ? t.output : JSON.stringify(t.output, null, 2))}</pre></div>` : ''}
                          ${t.error !== undefined ? `<div><b>Error:</b> <pre class="raw-box danger" style="max-height:100px; overflow:auto;">${esc(typeof t.error === 'string' ? t.error : JSON.stringify(t.error, null, 2))}</pre></div>` : ''}
                        </div>
                      ` : ''}
                    </div>
                  `;
                }).join('') || '<div class="empty-state" style="padding:10px;">No tools recorded</div>'}
              </div>
              <div class="log-tail-box">${esc(logTailText)}</div>
            </div>
          ` : ''}
        </div>
      </div>

      <div class="card-footer">
        <button class="inspect-agent-btn" data-inspect-agent="${esc(a.id)}">Inspect Node in Drawer &rarr;</button>
      </div>
    </article>
  `;
}

function updateAgentCardDOM(el, a) {
  const expanded = model.expandedAgents.has(a.id);
  const isSelected = a.id === model.selectedAgentId;
  const isBlocked = a.status === 'blocked';
  el.className = `subagent-card ${isSelected ? 'selected active' : ''} ${isBlocked ? 'blocked-card' : ''} ${expanded ? 'expanded open' : ''}`;
  
  const newHTML = buildAgentCardHTML(a);
  const newEl = parseHTML(newHTML);
  
  const oldScrolls = [...el.querySelectorAll('div, pre')].map(x => x.scrollTop);
  el.innerHTML = newEl.innerHTML;
  const newScrollables = el.querySelectorAll('div, pre');
  oldScrollables.forEach((st, idx) => { if (newScrollables[idx] && st) newScrollables[idx].scrollTop = st; });
}

// Tick timers every second
setInterval(() => {
  document.querySelectorAll('[data-timer-start]').forEach(el => {
    const start = el.getAttribute('data-timer-start');
    if (start) el.textContent = calcDuration(start);
  });
}, 1000);

// --- Unified Inspector Drawer Engine ---

function openDrawer(tab = 'agent', agentId = null) {
  if (agentId) model.selectedAgentId = agentId;
  model.inspectorTab = tab;
  setPref('hermes.apb.dashboard.selectedAgentId', model.selectedAgentId);
  setPref('hermes.apb.dashboard.inspectorTab', model.inspectorTab);
  model.drawerOpen = true;

  const drawer = $('inspectorDrawer');
  const overlay = $('drawerOverlay');
  if (drawer) drawer.classList.add('open', 'active');
  if (overlay) overlay.hidden = false;

  renderInspectorDrawer();
}

function closeDrawer() {
  model.drawerOpen = false;
  const drawer = $('inspectorDrawer');
  const overlay = $('drawerOverlay');
  if (drawer) drawer.classList.remove('open', 'active');
  if (overlay) overlay.hidden = true;
}

function renderInspectorDrawer() {
  if (!model.drawerOpen) return;
  const content = $('inspectorContent');
  if (!content) return;

  document.querySelectorAll('.drawer-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.inspector === model.inspectorTab);
  });

  const a = agents().find(x => x.id === model.selectedAgentId) || { id: model.selectedAgentId, role: 'subagent', status: 'unknown' };
  if ($('drawerTitle')) $('drawerTitle').textContent = `Inspect: ${a.label || a.id}`;

  const savedScroll = content ? content.scrollTop : 0;

  if (model.inspectorTab === 'agent') renderAgentTab(content, a);
  else if (model.inspectorTab === 'spec') renderDocTab(content, 'spec.md', 'SPEC Document', model.state?.specAdherence);
  else if (model.inspectorTab === 'devplan') renderDocTab(content, 'devplan.md', 'DEVPLAN Document', model.state?.devplanAdherence);
  else if (model.inspectorTab === 'artifacts') renderArtifactsTab(content);
  else if (model.inspectorTab === 'logs') renderLogsTab(content);
  else if (model.inspectorTab === 'run') renderRunJsonTab(content);

  if (content) content.scrollTop = savedScroll;
}

function renderAgentTab(content, a) {
  const tools = [...model.toolCalls.values()].filter(t => t.agentId === a.id);
  const ev = model.events.filter(e => e.agentId === a.id);

  content.innerHTML = `
    <div class="task-description-box">
      <span class="box-label">Agent Role & Phase</span>
      <span class="task-text">${esc(a.role)} &bull; Phase: ${esc(a.currentPhase || 'N/A')}</span>
    </div>
    <h4>Active Tool Calls (${tools.length})</h4>
    <div class="sub-timeline-list">
      ${tools.map(t => {
        const isToolExp = model.expandedToolItems.has(t.id);
        return `
          <div class="sub-tool-item ${isToolExp ? 'expanded open active' : ''}" data-toggle-toolitem="${esc(t.id)}" style="cursor:pointer; flex-direction:column; align-items:flex-start;">
            <div style="display:flex; justify-content:space-between; width:100%;">
              <span>⚡ <b>${esc(t.toolName)}</b>: ${esc(t.action)}</span>
              <span class="status-tag ${esc(t.status)}">${esc(t.status)} ${isToolExp ? '▲' : '▼'}</span>
            </div>
            ${isToolExp ? `
              <div class="sub-tool-details" style="margin-top:6px; width:100%; font-size:11px;">
                ${t.input !== undefined ? `<div><b>Input:</b> <pre class="raw-box" style="max-height:120px; overflow:auto;">${esc(typeof t.input === 'string' ? t.input : JSON.stringify(t.input, null, 2))}</pre></div>` : ''}
                ${t.output !== undefined ? `<div><b>Output:</b> <pre class="raw-box" style="max-height:120px; overflow:auto;">${esc(typeof t.output === 'string' ? t.output : JSON.stringify(t.output, null, 2))}</pre></div>` : ''}
              </div>
            ` : ''}
          </div>
        `;
      }).join('') || '<div class="empty-state">No tool calls observed.</div>'}
    </div>
    <h4>Recent Telemetry Events (${ev.length})</h4>
    <pre class="raw-box">${esc(ev.slice(-8).map(e => `[${fmtTime(e.ts)}] ${e.type}: ${e.message}`).join('\n') || 'No events recorded.')}</pre>
    <h4>Raw JSON Payload</h4>
    <pre class="raw-box">${esc(JSON.stringify(a, null, 2))}</pre>
  `;
}

async function renderDocTab(content, file, label, adh) {
  content.innerHTML = `<div class="empty-state">Loading ${label} candidate…</div>`;
  const runId = model.selectedRunId || model.state?.currentRunId;
  if (!runId) { content.innerHTML = `<div class="empty-state">No active run selected.</div>`; return; }

  const candidates = file === 'spec.md' 
    ? ['spec.md', 'SPEC.approved-candidate-v2.md', 'SPEC.approved-candidate.md', 'SPEC.md']
    : ['devplan.md', 'DEVPLAN.approved-candidate-v2.md', 'DEVPLAN.reconciled.md', 'DEVPLAN.md'];

  for (const name of candidates) {
    try {
      const txt = await getText(`/api/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(name)}`);
      content.innerHTML = `
        <div class="task-description-box">
          <span class="box-label">${label} Adherence Status</span>
          <span class="task-text">${esc(adh?.status || 'Active')} (${adh?.completed || 0}/${adh?.total || 0} tasks verified)</span>
        </div>
        <pre class="raw-box">${esc(txt)}</pre>
      `;
      return;
    } catch {}
  }
  content.innerHTML = `<div class="empty-state">Document ${label} not found for run ${esc(runId)}.</div>`;
}

function renderArtifactsTab(content) {
  content.innerHTML = `
    <div class="sub-timeline-list">
      ${model.artifacts.map(f => `
        <div class="sub-tool-item" data-artifact-item="${esc(f.name)}" style="cursor:pointer;">
          <span>📄 <b>${esc(f.name)}</b></span>
          <span class="muted">${f.size} bytes</span>
        </div>
      `).join('') || '<div class="empty-state">No artifacts recorded for run.</div>'}
    </div>
    <div id="artifactPreviewBox" class="raw-box">Select an artifact to preview contents.</div>
  `;
}

function renderLogsTab(content) {
  content.innerHTML = `
    <div class="sub-timeline-list">
      ${model.logs.map(f => `
        <div class="sub-tool-item" data-log-item="${esc(f.name)}" style="cursor:pointer;">
          <span>📋 <b>${esc(f.name)}</b></span>
          <span class="muted">${f.size} bytes</span>
        </div>
      `).join('') || '<div class="empty-state">No logs recorded for run.</div>'}
    </div>
    <div id="logPreviewBox" class="raw-box">Select a log file to view tail.</div>
  `;
}

function renderRunJsonTab(content) {
  content.innerHTML = `<pre class="raw-box">${esc(JSON.stringify(model.state, null, 2))}</pre>`;
}

// Data Fetching & Stream Integration
async function loadRunResources() {
  if (!model.selectedRunId) { model.artifacts = []; model.logs = []; return; }
  try { model.artifacts = await getJson(`/api/runs/${encodeURIComponent(model.selectedRunId)}/artifacts`); } catch { model.artifacts = []; }
  try { model.logs = await getJson(`/api/runs/${encodeURIComponent(model.selectedRunId)}/logs`); } catch { model.logs = []; }
}

function renderAll() {
  stableRender(() => {
    renderTopBar();
    renderWorkflowStrip();
    renderTopology();
    renderSubagentDeck();
    renderInspectorDrawer();
  });
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
    if ($('streamState')) $('streamState').textContent = 'API Error';
  }
}

function connect() {
  try {
    const es = new EventSource('/api/stream');
    es.addEventListener('open', () => { if ($('streamState')) $('streamState').textContent = 'SSE Live'; });
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
      if (!model.paused) { ingestEvents(p); renderAll(); }
    });
    es.addEventListener('heartbeat', e => {
      if (!model.paused && model.selectedRunId) loadRunResources().then(renderAll);
    });
    es.onerror = () => {
      if ($('streamState')) $('streamState').textContent = 'SSE Disconnected';
      es.close();
      setInterval(refresh, 4000);
    };
  } catch {
    setInterval(refresh, 4000);
  }
}

// Global Delegated Event Handlers
function initGlobalEvents() {
  document.addEventListener('click', async (e) => {
    // Topo Node Click
    const topoNode = e.target.closest('[data-topo-agent]');
    if (topoNode) {
      openDrawer('agent', topoNode.dataset.topoAgent);
      return;
    }

    // Inspect Agent Button
    const inspectBtn = e.target.closest('[data-inspect-agent]');
    if (inspectBtn) {
      openDrawer('agent', inspectBtn.dataset.inspectAgent);
      return;
    }

    // Card Details Toggle
    const toggleCard = e.target.closest('[data-toggle-card]');
    if (toggleCard) {
      const id = toggleCard.dataset.toggleCard;
      if (model.expandedAgents.has(id)) model.expandedAgents.delete(id);
      else model.expandedAgents.add(id);
      setPref('hermes.apb.dashboard.expandedAgents', [...model.expandedAgents]);
      renderSubagentDeck();
      return;
    }

    // Toolbox Details Toggle
    const toggleToolbox = e.target.closest('[data-toggle-toolbox]');
    if (toggleToolbox) {
      const id = toggleToolbox.dataset.toggleToolbox;
      if (model.expandedToolBoxes.has(id)) model.expandedToolBoxes.delete(id);
      else model.expandedToolBoxes.add(id);
      setPref('hermes.apb.dashboard.expandedToolBoxes', [...model.expandedToolBoxes]);
      renderSubagentDeck();
      return;
    }

    // Tool Item Details Toggle
    const toggleToolitem = e.target.closest('[data-toggle-toolitem]');
    if (toggleToolitem) {
      const id = toggleToolitem.dataset.toggleToolitem;
      if (model.expandedToolItems.has(id)) model.expandedToolItems.delete(id);
      else model.expandedToolItems.add(id);
      setPref('hermes.apb.dashboard.expandedToolItems', [...model.expandedToolItems]);
      renderSubagentDeck();
      if (model.drawerOpen) renderInspectorDrawer();
      return;
    }

    // Drawer Tabs
    const drawerTab = e.target.closest('[data-inspector]');
    if (drawerTab && $('inspectorDrawer')?.contains(drawerTab)) {
      model.inspectorTab = drawerTab.dataset.inspector;
      setPref('hermes.apb.dashboard.inspectorTab', model.inspectorTab);
      renderInspectorDrawer();
      return;
    }

    // Artifact item click inside drawer
    const artItem = e.target.closest('[data-artifact-item]');
    if (artItem) {
      const name = artItem.dataset.artifactItem;
      const runId = model.selectedRunId || model.state?.currentRunId;
      try {
        const txt = await getText(`/api/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(name)}`);
        if ($('artifactPreviewBox')) $('artifactPreviewBox').textContent = txt;
      } catch {
        if ($('artifactPreviewBox')) $('artifactPreviewBox').textContent = 'Failed to load artifact content.';
      }
      return;
    }

    // Log item click inside drawer
    const logItem = e.target.closest('[data-log-item]');
    if (logItem) {
      const name = logItem.dataset.logItem;
      const runId = model.selectedRunId || model.state?.currentRunId;
      try {
        const txt = await getText(`/api/runs/${encodeURIComponent(runId)}/logs/${encodeURIComponent(name)}`);
        if ($('logPreviewBox')) $('logPreviewBox').textContent = txt;
      } catch {
        if ($('logPreviewBox')) $('logPreviewBox').textContent = 'Failed to load log tail.';
      }
      return;
    }
  });

  // Filter Chips
  document.querySelectorAll('[data-filter]').forEach(b => {
    b.onclick = () => {
      model.filter = b.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach(x => x.classList.toggle('active', x === b));
      renderSubagentDeck();
    };
  });

  // Controls
  if ($('refreshNow')) $('refreshNow').onclick = refresh;
  if ($('pauseEvents')) $('pauseEvents').onclick = () => {
    model.paused = !model.paused;
    setPref('hermes.apb.dashboard.pauseRealtime', model.paused);
    renderTopBar();
  };
  if ($('globalFilter')) $('globalFilter').oninput = e => {
    model.query = e.target.value;
    renderSubagentDeck();
  };
  if ($('closeDrawer')) $('closeDrawer').onclick = closeDrawer;
  if ($('drawerOverlay')) $('drawerOverlay').onclick = closeDrawer;

  if ($('collapseAllAgents')) $('collapseAllAgents').onclick = () => {
    model.expandedAgents.clear();
    setPref('hermes.apb.dashboard.expandedAgents', []);
    renderSubagentDeck();
  };
  if ($('expandActiveAgents')) $('expandActiveAgents').onclick = () => {
    for (const a of agents()) {
      if (!terminalStates.has(a.status) || a.status === 'blocked') model.expandedAgents.add(a.id);
    }
    setPref('hermes.apb.dashboard.expandedAgents', [...model.expandedAgents]);
    renderSubagentDeck();
  };

  window.addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement !== $('globalFilter')) {
      e.preventDefault();
      $('globalFilter')?.focus();
    }
    if (e.key === 'Escape') closeDrawer();
  });
}

// Initialize Application Engine
initGlobalEvents();
refresh();
connect();
