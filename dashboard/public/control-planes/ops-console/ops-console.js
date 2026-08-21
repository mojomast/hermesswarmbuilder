/**
 * Dashboard A: 2D Operations Console Controller
 * High-density, keyboard-driven expert operations cockpit.
 */

import { ControlPlaneClient, deriveCanonicalDisposition, getAssuranceLevel, sanitizeAnsiToHtml, escapeHtml, RBAC_ROLES } from "../shared/api-client.js";

class OpsConsoleController {
  constructor() {
    this.client = new ControlPlaneClient();
    this.logs = [];
    this.toolCalls = new Map();
    this.activeRunId = null;
    this.followLogs = true;
    this.logFilter = "";
    this.logLevelFilter = "all";
    this.selectedToolCallId = null;
    this.paletteOpen = false;
    this.paletteIndex = 0;
    this.commands = [
      { cmd: ":hold", desc: "Hold admission and pause managed work", action: () => this.client.holdAdmission() },
      { cmd: ":pause", desc: "Request checkpoint pause for active managed run", action: () => this.client.pauseCheckpoint() },
      { cmd: ":stop", desc: "Request graceful stop at next checkpoint", action: () => this.client.gracefulStop() },
      { cmd: ":resume", desc: "Resume admission and clear hold/stop intents", action: () => this.client.resumeAdmission() },
      { cmd: ":run-now", desc: "Request runner tick admission immediately", action: () => this.client.requestRunNow() },
      { cmd: ":clear-queue", desc: "Clear candidate queue with blast-radius confirmation", action: () => this.confirmClearQueue() },
      { cmd: ":role <role>", desc: "Switch simulated RBAC role (Admin, Operator, Approver, Author, Viewer, Auditor)", action: (arg) => this.switchRole(arg) },
      { cmd: ":refresh", desc: "Force full snapshot resynchronization", action: () => this.client.resyncSnapshots() }
    ];

    this.initElements();
    this.bindEvents();
    this.init();
  }

  initElements() {
    this.el = {
      headerStatus: document.getElementById("header-status"),
      headerRun: document.getElementById("header-run"),
      headerAdmission: document.getElementById("header-admission"),
      headerSse: document.getElementById("header-sse"),
      headerAttention: document.getElementById("header-attention"),
      headerRole: document.getElementById("header-role"),
      attentionQueue: document.getElementById("attention-queue"),
      agentManifest: document.getElementById("agent-manifest"),
      logTerminal: document.getElementById("log-terminal"),
      logCount: document.getElementById("log-count"),
      btnFollowLogs: document.getElementById("btn-follow-logs"),
      logSearch: document.getElementById("log-search"),
      logLevel: document.getElementById("log-level"),
      toolTableBody: document.getElementById("tool-table-body"),
      evidenceViewer: document.getElementById("evidence-viewer"),
      diffViewer: document.getElementById("diff-viewer"),
      btnHold: document.getElementById("btn-hold"),
      btnPause: document.getElementById("btn-pause"),
      btnStop: document.getElementById("btn-stop"),
      btnResume: document.getElementById("btn-resume"),
      btnRunNow: document.getElementById("btn-run-now"),
      paletteModal: document.getElementById("palette-modal"),
      paletteInput: document.getElementById("palette-input"),
      paletteResults: document.getElementById("palette-results"),
      liveAnnouncer: document.getElementById("live-announcer")
    };
  }

  bindEvents() {
    // Keyboard navigation
    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        this.openPalette();
      } else if (e.key === ":" && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
        e.preventDefault();
        this.openPalette(":");
      } else if (e.key === "Escape") {
        if (this.paletteOpen) this.closePalette();
      }
    });

    this.el.paletteInput.addEventListener("input", () => this.filterPalette());
    this.el.paletteInput.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        this.paletteIndex = Math.min(this.paletteIndex + 1, this.filteredCommands.length - 1);
        this.renderPaletteResults();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        this.paletteIndex = Math.max(this.paletteIndex - 1, 0);
        this.renderPaletteResults();
      } else if (e.key === "Enter") {
        e.preventDefault();
        this.executePaletteIndex();
      }
    });

    this.el.btnFollowLogs.addEventListener("click", () => {
      this.followLogs = !this.followLogs;
      this.el.btnFollowLogs.textContent = this.followLogs ? "Follow: ON" : "Follow: OFF";
      this.el.btnFollowLogs.style.color = this.followLogs ? "var(--color-active)" : "var(--text-muted)";
      if (this.followLogs) this.scrollLogsToBottom();
    });

    this.el.logSearch.addEventListener("input", (e) => {
      this.logFilter = e.target.value.toLowerCase();
      this.renderLogs();
    });

    this.el.logLevel.addEventListener("change", (e) => {
      this.logLevelFilter = e.target.value;
      this.renderLogs();
    });

    // Control Deck
    this.el.btnHold.addEventListener("click", () => this.client.holdAdmission().then(() => this.announce("Hold requested")));
    this.el.btnPause.addEventListener("click", () => this.client.pauseCheckpoint().then(() => this.announce("Pause requested")));
    this.el.btnStop.addEventListener("click", () => this.client.gracefulStop().then(() => this.announce("Graceful stop requested")));
    this.el.btnResume.addEventListener("click", () => this.client.resumeAdmission().then(() => this.announce("Admission resumed")));
    this.el.btnRunNow.addEventListener("click", () => this.client.requestRunNow().then(() => this.announce("Run now requested")));

    document.getElementById("btn-cmd-palette").addEventListener("click", () => this.openPalette());
  }

  async init() {
    this.client.subscribe((msg) => this.handleClientUpdate(msg));
    await this.client.resyncSnapshots();
    this.client.connectStream();
    this.renderHeader();
  }

  handleClientUpdate(msg) {
    if (msg.type === "state-update" || msg.type === "resynchronized") {
      this.renderHeader();
      this.renderAttentionQueue();
      this.renderAgentManifest();
    } else if (msg.type === "events-update") {
      this.processEvents(msg.events);
    } else if (msg.type === "stream-status") {
      this.renderHeader();
    }
  }

  processEvents(events) {
    for (const evt of events) {
      this.logs.push(evt);
      if (this.logs.length > 2000) this.logs.shift();

      // Tool call correlation
      if (evt.data?.toolCallId) {
        const id = evt.data.toolCallId;
        const current = this.toolCalls.get(id) || { id, agent: evt.source || evt.agentId, startedAt: evt.ts, status: "in-progress" };
        if (evt.type === "tool-call-start") {
          current.tool = evt.data.toolName || evt.data.action;
          current.input = evt.data.input;
          current.status = "Started";
        } else if (evt.type === "tool-call-output") {
          current.output = evt.data.output;
          current.status = "Output";
        } else if (evt.type === "tool-call-end") {
          current.status = "Ended";
          current.endedAt = evt.ts;
          current.durationMs = evt.data.durationMs;
        } else if (evt.type === "tool-call-error") {
          current.status = "Errored";
          current.error = evt.data.error;
          current.endedAt = evt.ts;
        }
        this.toolCalls.set(id, current);
      }
    }
    this.renderLogs();
    this.renderToolTable();
  }

  renderHeader() {
    const state = this.client.cachedState || {};
    const disposition = deriveCanonicalDisposition(state, {}, null, null);
    
    this.el.headerStatus.textContent = disposition.label;
    this.el.headerStatus.className = `system-badge ${disposition.class}`;

    this.el.headerRun.textContent = state.currentRunId ? `Run: ${state.currentRunId} (${state.phase || state.status})` : "Run: (Idle)";
    this.el.headerAdmission.textContent = state.capabilities?.steeringCockpit ? "Admission: ENABLED" : "Admission: PAUSED";
    this.el.headerSse.textContent = this.client.sseConnected ? "SSE: LIVE" : "SSE: RECONNECTING";
    this.el.headerSse.className = this.client.sseConnected ? "system-badge badge-success" : "system-badge badge-warning";
    this.el.headerRole.textContent = `Role: ${this.client.role}`;
  }

  renderAttentionQueue() {
    const state = this.client.cachedState || {};
    const items = [];

    // 1. Blocker
    if (state.status === "blocked" || state.blocker || state.block) {
      const b = state.blocker || state.block || {};
      items.push({
        level: "error",
        title: `[CRITICAL BLOCKER] ${b.reason || state.phase || "Run Blocked"}`,
        meta: `Agent: ${b.agentId || "orchestrator"} | Run: ${state.currentRunId}`,
        action: () => this.handleDeblockPrompt(state.currentRunId)
      });
    }

    // 2. Unclaimed Launch
    if (this.client.cachedPlans) {
      for (const p of this.client.cachedPlans) {
        if (p.state === "launch-requested") {
          items.push({
            level: "warning",
            title: `[PENDING LAUNCH] Plan ${p.planId.slice(0, 8)} awaiting claim`,
            meta: `Revision ${p.currentRevision} | Digest: ${p.currentDigest.slice(0, 12)}...`,
            action: () => alert(`Launch pending runner acquisition for plan: ${p.title}`)
          });
        }
      }
    }

    this.el.headerAttention.textContent = `Attention: ${items.length}`;
    if (items.length === 0) {
      this.el.attentionQueue.innerHTML = `<div class="attention-card info"><div class="attention-title">No Active Blockers</div><div class="attention-meta">All monitored agents operating nominally.</div></div>`;
      return;
    }

    this.el.attentionQueue.innerHTML = items.map((item, i) => `
      <div class="attention-card ${item.level}" tabindex="0" role="button" data-idx="${i}">
        <div class="attention-title">${escapeHtml(item.title)}</div>
        <div class="attention-meta">${escapeHtml(item.meta)}</div>
      </div>
    `).join("");

    this.el.attentionQueue.querySelectorAll(".attention-card").forEach((card, idx) => {
      card.addEventListener("click", () => items[idx].action());
      card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") items[idx].action(); });
    });
  }

  renderAgentManifest() {
    const state = this.client.cachedState || {};
    const agents = Object.values(state.agents || {});
    if (agents.length === 0) {
      this.el.agentManifest.innerHTML = `<div style="color: var(--text-muted); padding: 8px;">No active agents reported.</div>`;
      return;
    }

    this.el.agentManifest.innerHTML = agents.map((a) => `
      <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 4px; padding: 6px 8px; margin-bottom: 6px;">
        <div style="display: flex; justify-content: space-between; font-weight: 600; font-size: 11px;">
          <span>${escapeHtml(a.label || a.id)}</span>
          <span class="system-badge ${a.status === 'running' ? 'badge-active' : 'badge-neutral'}">${a.status}</span>
        </div>
        <div style="color: var(--text-muted); font-size: 11px; margin-top: 2px;">Role: ${escapeHtml(a.role || 'worker')}</div>
        <div style="color: var(--text-secondary); font-size: 11px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(a.currentTask || a.lastMessage || '')}</div>
      </div>
    `).join("");
  }

  renderLogs() {
    let filtered = this.logs;
    if (this.logLevelFilter !== "all") {
      filtered = filtered.filter((l) => (l.level || "info").toLowerCase() === this.logLevelFilter);
    }
    if (this.logFilter) {
      filtered = filtered.filter((l) => JSON.stringify(l).toLowerCase().includes(this.logFilter));
    }

    this.el.logCount.textContent = `[${filtered.length} / ${this.logs.length}]`;
    this.el.logTerminal.innerHTML = filtered.map((l) => {
      const ts = l.ts ? l.ts.slice(11, 19) : "--:--:--";
      const src = l.source || l.agentId || "sys";
      const msg = l.message || JSON.stringify(l.data || {});
      const lvlClass = l.level === "error" ? "log-err" : l.level === "warn" ? "log-warn" : l.level === "success" ? "log-succ" : "";
      return `<div class="log-line ${lvlClass}"><span class="log-ts">${ts}</span><span class="log-src">[${escapeHtml(src)}]</span>${sanitizeAnsiToHtml(msg)}</div>`;
    }).join("");

    if (this.followLogs) this.scrollLogsToBottom();
  }

  scrollLogsToBottom() {
    this.el.logTerminal.scrollTop = this.el.logTerminal.scrollHeight;
  }

  renderToolTable() {
    const list = Array.from(this.toolCalls.values()).slice(-20).reverse();
    this.el.toolTableBody.innerHTML = list.map((tc) => `
      <tr data-tc-id="${tc.id}" class="${tc.id === this.selectedToolCallId ? 'selected' : ''}" style="cursor: pointer;">
        <td style="color: var(--color-active); font-weight: 600;">${escapeHtml(tc.id.slice(0, 10))}</td>
        <td>${escapeHtml(tc.tool || 'generic')}</td>
        <td><span class="system-badge ${tc.status === 'Ended' ? 'badge-success' : tc.status === 'Errored' ? 'badge-error' : 'badge-active'}">${tc.status}</span></td>
        <td>${tc.durationMs ? `${tc.durationMs}ms` : '--'}</td>
        <td>${escapeHtml(tc.agent || 'worker')}</td>
      </tr>
    `).join("");

    this.el.toolTableBody.querySelectorAll("tr").forEach((row) => {
      row.addEventListener("click", () => {
        const id = row.getAttribute("data-tc-id");
        this.selectToolCall(id);
      });
    });
  }

  selectToolCall(id) {
    this.selectedToolCallId = id;
    this.renderToolTable();
    const tc = this.toolCalls.get(id);
    if (!tc) return;

    this.el.evidenceViewer.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 6px; color: var(--color-active);">Tool Call: ${escapeHtml(tc.id)}</div>
      <div style="margin-bottom: 4px;"><strong>Status:</strong> ${tc.status} (${tc.durationMs || 0}ms)</div>
      <div style="margin-bottom: 4px;"><strong>Input:</strong> <pre style="background: #07090e; padding: 4px; border-radius: 3px;">${escapeHtml(JSON.stringify(tc.input || {}, null, 2))}</pre></div>
      <div style="margin-bottom: 4px;"><strong>Output:</strong> <pre style="background: #07090e; padding: 4px; border-radius: 3px;">${escapeHtml(JSON.stringify(tc.output || tc.error || {}, null, 2))}</pre></div>
    `;
  }

  handleDeblockPrompt(runId) {
    const prompt = window.prompt(`Enter Deblock Directive for Run ${runId}:`, "Analyze failed gate and apply minimal non-destructive fix");
    if (prompt && prompt.trim()) {
      this.client.deblock(runId, prompt.trim())
        .then(() => alert("Deblock steering accepted into run queue."))
        .catch((err) => alert(`Deblock failed: ${err.message}`));
    }
  }

  confirmClearQueue() {
    const msg = "⚠️ BLAST RADIUS WARNING: Clearing candidate queue will wipe all pending items, unpin current objective, revoke active queue steering, and reset pending runner tickets. Proceed?";
    if (window.confirm(msg)) {
      this.client.clearQueue()
        .then((res) => alert(`Queue cleared successfully (${res.clearedQueueItemCount} items, ${res.clearedSteeringCount} steering removed).`))
        .catch((err) => alert(`Failed: ${err.message}`));
    }
  }

  switchRole(arg) {
    const target = Object.values(RBAC_ROLES).find((r) => r.toLowerCase() === (arg || "").toLowerCase());
    if (target) {
      this.client.setRole(target);
      this.announce(`Switched to role ${target}`);
    } else {
      alert(`Unknown role. Choose from: ${Object.values(RBAC_ROLES).join(", ")}`);
    }
  }

  openPalette(initial = "") {
    this.paletteOpen = true;
    this.el.paletteModal.style.display = "flex";
    this.el.paletteInput.value = initial;
    this.el.paletteInput.focus();
    this.filterPalette();
  }

  closePalette() {
    this.paletteOpen = false;
    this.el.paletteModal.style.display = "none";
  }

  filterPalette() {
    const query = this.el.paletteInput.value.toLowerCase().trim();
    this.filteredCommands = this.commands.filter((c) => c.cmd.toLowerCase().includes(query) || c.desc.toLowerCase().includes(query));
    this.paletteIndex = 0;
    this.renderPaletteResults();
  }

  renderPaletteResults() {
    this.el.paletteResults.innerHTML = this.filteredCommands.map((c, i) => `
      <div class="palette-item ${i === this.paletteIndex ? 'active' : ''}" data-idx="${i}">
        <span style="font-weight: 600;">${escapeHtml(c.cmd)}</span>
        <span style="color: var(--text-muted);">${escapeHtml(c.desc)}</span>
      </div>
    `).join("");

    this.el.paletteResults.querySelectorAll(".palette-item").forEach((item) => {
      item.addEventListener("click", () => {
        this.paletteIndex = parseInt(item.getAttribute("data-idx"), 10);
        this.executePaletteIndex();
      });
    });
  }

  executePaletteIndex() {
    const selected = this.filteredCommands[this.paletteIndex];
    if (selected) {
      const input = this.el.paletteInput.value.trim();
      const parts = input.split(" ");
      const arg = parts.slice(1).join(" ");
      this.closePalette();
      try {
        selected.action(arg);
      } catch (err) {
        alert(`Command execution failed: ${err.message}`);
      }
    }
  }

  announce(text) {
    if (this.el.liveAnnouncer) {
      this.el.liveAnnouncer.textContent = text;
    }
  }
}

window.addEventListener("DOMContentLoaded", () => {
  new OpsConsoleController();
});
