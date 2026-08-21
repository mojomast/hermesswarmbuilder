/**
 * Hermes Swarm Builder Control Plane API Client & Data Layer (Comprehensive v2)
 * Shared typed data-access, SSE streaming, cryptographic verification, diffing,
 * artifact sandboxing, and security sanitization engine for clean-slate dashboards.
 *
 * Grounded in: docs/CONTROL_PLANE_DASHBOARD_SPEC.md
 */

// ==========================================
// 1. CAPABILITY & ASSURANCE MATRIX
// ==========================================

export const CAPABILITIES = Object.freeze({
  RUN_STATE_PHASE: { status: "available", note: "Real-time from /api/state and SSE stream" },
  EVENT_TIMELINE: { status: "available", note: "Bounded JSONL tail from /api/events and SSE stream" },
  RUN_DETAIL: { status: "available", note: "Runs listing and run.json from /api/runs" },
  AGENTS_TOOL_CALLS: { status: "available", note: "Telemetry projections correlated by toolCallId" },
  LOGS_ARTIFACTS: { status: "available", note: "Bounded text reads from /api/runs/:id/logs and artifacts" },
  PROJECT_PLANS: { status: "available", note: "Immutable revisions and strict JSON schema" },
  EXACT_APPROVAL_LAUNCH: { status: "available", note: "SQLite single-active-launch authority with SHA-256 digests" },
  MANAGED_ITERATIONS: { status: "available", note: "Variants, evaluations, synthesis, gates, handoff" },
  QUEUE_STEERING: { status: "available", note: "Candidate queue and steering directives" },
  GOVERNED_PLAN_GATES: { status: "available", note: "Strict plan schema and safe evidence paths" },
  PAUSE_HOLD_STOP_RESUME: { status: "available", note: "Declarative; managed checkpoint enforcement" },
  PLAN_ASSISTANCE: { status: "available", note: "Bounded Hermes pre-draft assistance provider" },
  
  // Derivable capabilities
  ASSURANCE_LABELING: { status: "derivable", note: "Derived from pipeline type: classic is agent-attested, managed is runner-verified" },
  CANONICAL_DISPOSITIONS: { status: "derivable", note: "Normalized from run.status, control.pause/stop, launch.status, handoff.state" },
  PIPELINE_DURATIONS: { status: "derivable", note: "Calculated from stage and tool-call timestamps" },
  SOURCE_INTEGRITY: { status: "derivable", note: "Derived by comparing preflight and post-execution git status" },
  DIFF_CALCULATION: { status: "derivable", note: "Computed client-side between revisions or variant branches" },
  IDENTITY_STRIP: { status: "derivable", note: "Linked identity chain Plan -> Revision -> Approval -> Launch -> Request -> Run -> Iteration" },
  
  // Required / Backend-dependent capabilities (clearly labeled as simulated/future)
  LAUNCH_WITHDRAWAL: { status: "required", note: "Needs typed REST endpoint over SQLite launch authority rejectRequested()" },
  IMMEDIATE_CANCELLATION: { status: "required", note: "Requires runner IPC and verified process-group ownership" },
  AGENT_CONTROLS_RETRIES: { status: "required", note: "Requires first-class task/attempt resource model" },
  AUTH_AND_RBAC: { status: "required", note: "Mandatory before non-loopback / multi-user operation" },
  HEALTH_READINESS_APIS: { status: "required", note: "Needs structured /healthz, /readyz, /version endpoints" },
  DURABLE_EVENT_GAPS: { status: "required", note: "Needs monotonic sequence IDs and explicit history_gap signal" },
  RESOURCE_QUOTAS_COST: { status: "required", note: "Needs provider token usage and cgroup telemetry ingestion" },
  STORAGE_RETENTION: { status: "required", note: "Needs automated lifecycle and worktree cleanup policies" },
  CONFIGURABLE_SCHEDULES: { status: "required", note: "Needs multi-schedule cron service and concurrency locks" },
});

export const RBAC_ROLES = Object.freeze({
  VIEWER: "Viewer",
  AUTHOR: "Author",
  OPERATOR: "Operator",
  APPROVER: "Approver",
  ADMIN: "Administrator",
  AUDITOR: "Auditor",
});

export const ROLE_PERMISSIONS = Object.freeze({
  [RBAC_ROLES.VIEWER]: {
    canRead: true, canEditDraft: false, canSubmitReview: false, canApprove: false,
    canLaunch: false, canControlRuns: false, canManageQueue: false, canConfigure: false,
    canViewSecrets: false, canExportAudit: false
  },
  [RBAC_ROLES.AUTHOR]: {
    canRead: true, canEditDraft: true, canSubmitReview: true, canApprove: false,
    canLaunch: false, canControlRuns: false, canManageQueue: true, canConfigure: false,
    canViewSecrets: false, canExportAudit: false
  },
  [RBAC_ROLES.OPERATOR]: {
    canRead: true, canEditDraft: false, canSubmitReview: false, canApprove: false,
    canLaunch: true, canControlRuns: true, canManageQueue: true, canConfigure: false,
    canViewSecrets: false, canExportAudit: false
  },
  [RBAC_ROLES.APPROVER]: {
    canRead: true, canEditDraft: false, canSubmitReview: false, canApprove: true,
    canLaunch: false, canControlRuns: false, canManageQueue: false, canConfigure: false,
    canViewSecrets: false, canExportAudit: false
  },
  [RBAC_ROLES.ADMIN]: {
    canRead: true, canEditDraft: true, canSubmitReview: true, canApprove: true,
    canLaunch: true, canControlRuns: true, canManageQueue: true, canConfigure: true,
    canViewSecrets: true, canExportAudit: true
  },
  [RBAC_ROLES.AUDITOR]: {
    canRead: true, canEditDraft: false, canSubmitReview: false, canApprove: false,
    canLaunch: false, canControlRuns: false, canManageQueue: false, canConfigure: false,
    canViewSecrets: false, canExportAudit: true
  }
});

// ==========================================
// 2. CRYPTOGRAPHIC & SANITIZATION UTILITIES
// ==========================================

export function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Non-finite numbers cannot be canonicalized");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    const pairs = keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`);
    return `{${pairs.join(",")}}`;
  }
  throw new TypeError(`Unsupported value type: ${typeof value}`);
}

export async function computeDigest(domainPrefix, payload) {
  const canonicalString = `${domainPrefix}\n${canonicalJson(payload)}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(canonicalString);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}

export async function computePlanDigest(planId, revision, parentRevision, content) {
  return computeDigest("apb.project-plan.v1", {
    schemaVersion: "apb.project-plan.v1",
    planId,
    revision,
    parentRevision,
    content
  });
}

export function escapeHtml(str) {
  if (str == null) return "";
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c] || c));
}

export function sanitizeAnsiToHtml(input) {
  if (!input) return "";

  // 1. Strip OSC sequences (OSC ... ST or OSC ... BEL)
  let clean = String(input).replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "");

  // 2. Strip non-SGR CSI sequences (e.g. cursor moves, screen clears)
  clean = clean.replace(/\x1b\[[0-9;?]*[A-HJKSTf-in-z]/g, "");

  // 3. Strip DCS, APC, PM sequences
  clean = clean.replace(/\x1b[P^_][^\x1b]*\x1b\\/g, "");

  // 4. Tokenize SGR formatting sequences (\x1b[...m)
  const tokens = clean.split(/(\x1b\[[0-9;]*m)/g);
  let html = "";
  const currentClasses = new Set();
  const currentStyles = new Map();

  for (const token of tokens) {
    if (!token) continue;
    if (token.startsWith("\x1b[")) {
      const codes = token.slice(2, -1).split(";").map((x) => (x ? parseInt(x, 10) : 0));
      for (let i = 0; i < codes.length; i++) {
        const code = codes[i];
        if (code === 0) {
          currentClasses.clear();
          currentStyles.clear();
        } else if (code === 1) currentClasses.add("ansi-bold");
        else if (code === 2) currentClasses.add("ansi-dim");
        else if (code === 3) currentClasses.add("ansi-italic");
        else if (code === 4) currentClasses.add("ansi-underline");
        else if (code >= 30 && code <= 37) currentClasses.add(`ansi-fg-${code - 30}`);
        else if (code >= 90 && code <= 97) currentClasses.add(`ansi-fg-bright-${code - 90}`);
        else if (code >= 40 && code <= 47) currentClasses.add(`ansi-bg-${code - 40}`);
        else if (code >= 100 && code <= 107) currentClasses.add(`ansi-bg-bright-${code - 100}`);
        else if ((code === 38 || code === 48) && codes[i + 1] === 5 && codes[i + 2] !== undefined) {
          const isFg = code === 38;
          const colorIdx = Math.min(Math.max(codes[i + 2], 0), 255);
          currentStyles.set(isFg ? "color" : "background-color", `var(--ansi-c-${colorIdx}, #94a3b8)`);
          i += 2;
        } else if ((code === 38 || code === 48) && codes[i + 1] === 2 && codes[i + 4] !== undefined) {
          const isFg = code === 38;
          const r = Math.min(Math.max(codes[i + 2], 0), 255);
          const g = Math.min(Math.max(codes[i + 3], 0), 255);
          const b = Math.min(Math.max(codes[i + 4], 0), 255);
          currentStyles.set(isFg ? "color" : "background-color", `rgb(${r},${g},${b})`);
          i += 4;
        }
      }
    } else {
      const styleAttr = currentStyles.size
        ? ` style="${Array.from(currentStyles.entries()).map(([k, v]) => `${k}:${v}`).join(";")}"`
        : "";
      const classAttr = currentClasses.size ? ` class="${Array.from(currentClasses).join(" ")}"` : "";
      if (styleAttr || classAttr) {
        html += `<span${classAttr}${styleAttr}>${escapeHtml(token)}</span>`;
      } else {
        html += escapeHtml(token);
      }
    }
  }

  return html;
}

export function sanitizeMarkdownToHtml(md) {
  if (!md) return "";
  const lines = String(md).split(/\r?\n/);
  const out = [];
  let inCode = false;
  let codeBuffer = [];
  let inList = false;

  for (let line of lines) {
    if (line.startsWith("```")) {
      if (inCode) {
        out.push(`<pre><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`);
        codeBuffer = [];
        inCode = false;
      } else {
        if (inList) { out.push("</ul>"); inList = false; }
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuffer.push(line);
      continue;
    }

    if (/^### (.*)/.test(line)) {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<h3>${formatInline(line.slice(4))}</h3>`);
    } else if (/^## (.*)/.test(line)) {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<h2>${formatInline(line.slice(3))}</h2>`);
    } else if (/^# (.*)/.test(line)) {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<h1>${formatInline(line.slice(2))}</h1>`);
    } else if (/^[-*] (.*)/.test(line)) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${formatInline(line.slice(2))}</li>`);
    } else if (line.trim() === "") {
      if (inList) { out.push("</ul>"); inList = false; }
    } else {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<p>${formatInline(line)}</p>`);
    }
  }
  if (inCode) out.push(`<pre><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`);
  if (inList) out.push("</ul>");

  function formatInline(text) {
    let s = escapeHtml(text);
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    return s;
  }

  return out.join("");
}

/**
 * Line-by-line diff engine for comparing text or JSON objects.
 */
export function computeLineDiff(oldText, newText) {
  const oldLines = String(oldText || "").split(/\r?\n/);
  const newLines = String(newText || "").split(/\r?\n/);
  const result = [];

  let i = 0, j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      result.push({ type: "same", line: oldLines[i], oldNum: i + 1, newNum: j + 1 });
      i++; j++;
    } else if (j < newLines.length && (!oldLines.includes(newLines[j]) || i >= oldLines.length)) {
      result.push({ type: "add", line: newLines[j], oldNum: null, newNum: j + 1 });
      j++;
    } else if (i < oldLines.length) {
      result.push({ type: "del", line: oldLines[i], oldNum: i + 1, newNum: null });
      i++;
    }
  }
  return result;
}

// ==========================================
// 3. NORMALIZED DISPOSITIONS & HELPERS
// ==========================================

export function deriveCanonicalDisposition(runState, controlState, launchState, handoff) {
  if (launchState === "rejected") {
    return { id: "rejected-before-claim", label: "Rejected Before Claim", severity: "error", class: "status-rejected", description: "Launch request failed cryptographic validation or authority conflict before runner acquisition." };
  }
  if (controlState?.runAdmission === "paused" && (!runState || runState.status === "idle")) {
    return { id: "held-admission", label: "Admission Held", severity: "warning", class: "status-held", description: "New runner ticket admissions are paused; active jobs continue until checkpoint." };
  }
  if (runState?.status === "on-hold") {
    if (controlState?.pause?.requested || handoff?.state === "paused") {
      return { id: "paused", label: "Paused at Checkpoint", severity: "warning", class: "status-paused", description: "Managed loop paused at a safe checkpoint; worktrees and artifacts preserved." };
    }
    if (controlState?.stop?.requested || handoff?.state === "stopped") {
      return { id: "stopped", label: "Gracefully Stopped", severity: "neutral", class: "status-stopped", description: "Run stopped gracefully at boundary; terminal evidence written." };
    }
  }
  if (runState?.status === "blocked") {
    if (runState.blocker?.timeout || runState.block?.timeout || handoff?.blocker?.includes("timed out")) {
      return { id: "timed-out", label: "Execution Timed Out", severity: "error", class: "status-timeout", description: "Execution duration or inactivity budget exceeded limits." };
    }
    return { id: "blocked", label: "Blocked (Deblock Required)", severity: "error", class: "status-blocked", description: "Hard gate failure or tool-call exception requiring operator steering." };
  }
  if (runState?.status === "completed" || runState?.status === "published") {
    return { id: "completed", label: "Completed & Passed", severity: "success", class: "status-completed", description: "All acceptance criteria and quality gates verified successfully." };
  }
  if (runState?.status && runState.status !== "idle") {
    return { id: "running", label: `Running (${runState.phase || runState.status})`, severity: "active", class: "status-running", description: "Active subprocess execution and tool telemetry underway." };
  }
  return { id: "idle", label: "System Idle", severity: "neutral", class: "status-idle", description: "No active runner process. Ready for next scheduled tick or operator launch." };
}

export function getAssuranceLevel(pipelineType, evidenceType) {
  if (pipelineType === "managed" && evidenceType === "validation") {
    return { level: "Runner-verified", class: "assurance-runner", note: "Runner executed commands directly in isolated worktree policy" };
  }
  if (pipelineType === "classic" && evidenceType === "validation") {
    return { level: "Agent-attested", class: "assurance-agent", note: "Reported by Hermes subagent, not independently rerun" };
  }
  if (evidenceType === "decision" || evidenceType === "approval") {
    return { level: "Operator-attested", class: "assurance-operator", note: "Cryptographically signed by authorized human operator" };
  }
  if (evidenceType === "derived") {
    return { level: "Derived projection", class: "assurance-derived", note: "Computed by dashboard projection engine" };
  }
  return { level: "Unknown provenance", class: "assurance-unknown", note: "Provenance metadata unavailable" };
}

// ==========================================
// 4. MAIN CONTROL PLANE CLIENT CLASS
// ==========================================

export class ControlPlaneClient {
  constructor(baseUrl = "") {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.role = RBAC_ROLES.ADMIN;
    this.actor = "local-operator";
    this.subscribers = new Set();
    this.sseSource = null;
    this.sseConnected = false;
    this.lastEventId = null;
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;
    
    this.cachedState = null;
    this.cachedPlans = [];
    this.cachedIterations = [];
    this.cachedRuns = [];
    this.cachedQueue = { items: [] };
    this.cachedGates = { gates: [] };
    this.cachedControl = {};
    this.cachedAudit = [];
    this.cachedEvents = [];
  }

  setRole(role) {
    if (ROLE_PERMISSIONS[role]) {
      this.role = role;
      this.notifySubscribers({ type: "role-changed", role });
    }
  }

  getPermissions() {
    return ROLE_PERMISSIONS[this.role] || ROLE_PERMISSIONS[RBAC_ROLES.VIEWER];
  }

  generateIdempotencyKey() {
    return typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : `idem-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }

  async fetchJson(path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      "Accept": "application/json",
      "Content-Type": "application/json",
      ...(options.headers || {})
    };
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      let errBody;
      try { errBody = await res.json(); } catch { errBody = { error: `HTTP ${res.status} ${res.statusText}` }; }
      const err = new Error(errBody.error?.message || errBody.error || `Request failed with status ${res.status}`);
      err.status = res.status;
      err.details = errBody.details || errBody;
      throw err;
    }
    return res.json();
  }

  async fetchText(path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, options);
    if (!res.ok) {
      const err = new Error(`Request failed with status ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.text();
  }

  // --- Read Queries ---

  async getState() {
    const data = await this.fetchJson("/api/state");
    this.cachedState = data;
    return data;
  }

  async getProjectPlans() {
    const data = await this.fetchJson("/api/project-plans");
    this.cachedPlans = data.items || [];
    return data;
  }

  async getProjectPlanDetail(planId) {
    return this.fetchJson(`/api/project-plans/${encodeURIComponent(planId)}`);
  }

  async getPlanRevision(planId, revision) {
    return this.fetchJson(`/api/project-plans/${encodeURIComponent(planId)}/revisions/${revision}`);
  }

  async getIterations() {
    const data = await this.fetchJson("/api/iterations");
    this.cachedIterations = data.items || [];
    return data;
  }

  async getIterationDetail(id) {
    return this.fetchJson(`/api/iterations/${encodeURIComponent(id)}`);
  }

  async getRuns() {
    const data = await this.fetchJson("/api/runs");
    this.cachedRuns = Array.isArray(data) ? data : [];
    return this.cachedRuns;
  }

  async getRunDetail(runId) {
    return this.fetchJson(`/api/runs/${encodeURIComponent(runId)}`);
  }

  async getRunLogs(runId) {
    return this.fetchJson(`/api/runs/${encodeURIComponent(runId)}/logs`);
  }

  async getLogTail(runId, logName, tailLines = 400) {
    return this.fetchText(`/api/runs/${encodeURIComponent(runId)}/logs/${encodeURIComponent(logName)}?tail=${tailLines}`);
  }

  async getRunArtifacts(runId) {
    return this.fetchJson(`/api/runs/${encodeURIComponent(runId)}/artifacts`);
  }

  async getArtifactPreview(runId, artifactPath) {
    return this.fetchText(`/api/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(artifactPath)}`);
  }

  async getControl() {
    const data = await this.fetchJson("/api/control");
    this.cachedControl = data;
    return data;
  }

  async getQueue() {
    const data = await this.fetchJson("/api/queue");
    this.cachedQueue = data;
    return data;
  }

  async getGates() {
    const data = await this.fetchJson("/api/gates");
    this.cachedGates = data;
    return data;
  }

  async getAudit(limit = 100) {
    const data = await this.fetchJson(`/api/audit?limit=${limit}`);
    this.cachedAudit = Array.isArray(data) ? data : [];
    return this.cachedAudit;
  }

  async getEvents(limit = 200, after = null) {
    const query = after ? `?limit=${limit}&after=${encodeURIComponent(after)}` : `?limit=${limit}`;
    const data = await this.fetchJson(`/api/events${query}`);
    this.cachedEvents = Array.isArray(data) ? data : [];
    return this.cachedEvents;
  }

  async getCapabilities() {
    return this.fetchJson("/api/capabilities");
  }

  async getPlanAssistance() {
    return this.fetchJson("/api/plan-assistance");
  }

  async createPlanAssistance(pipelineType = "classic") {
    return this.fetchJson("/api/plan-assistance", {
      method: "POST",
      body: JSON.stringify({ schemaVersion: "apb.plan-assistance.v1", pipelineType })
    });
  }

  async getPlanAssistanceDetail(id) {
    return this.fetchJson(`/api/plan-assistance/${encodeURIComponent(id)}`);
  }

  async sendPlanAssistanceMessage(id, expectedVersion, message) {
    return this.fetchJson(`/api/plan-assistance/${encodeURIComponent(id)}/messages`, {
      method: "POST",
      body: JSON.stringify({
        schemaVersion: "apb.plan-assistance.v1",
        expectedVersion,
        message
      })
    });
  }

  // --- Strict Plan Authority Mutations ---

  async dispatchPlanCommand(type, payload, expectedVersion) {
    if (!this.getPermissions().canEditDraft && !this.getPermissions().canApprove && !this.getPermissions().canLaunch) {
      throw new Error(`Current role (${this.role}) is not authorized to perform plan mutations`);
    }
    const idempotencyKey = this.generateIdempotencyKey();
    return this.fetchJson("/api/project-plans/commands", {
      method: "POST",
      body: JSON.stringify({
        schemaVersion: "apb.project-plan-command.v1",
        type: `project-plan.${type}`,
        idempotencyKey,
        expectedVersion,
        actor: this.actor,
        payload
      })
    });
  }

  async createPlan(content) {
    return this.dispatchPlanCommand("create", { content }, 0);
  }

  async updatePlan(planId, content, expectedVersion) {
    return this.dispatchPlanCommand("update", { planId, content }, expectedVersion);
  }

  async submitPlanForReview(planId, revision, planDigest, expectedVersion) {
    return this.dispatchPlanCommand("ready-for-review", { planId, revision, planDigest }, expectedVersion);
  }

  async approvePlan(planId, revision, planDigest, notes = "Approved by operator", expectedVersion) {
    if (!this.getPermissions().canApprove) throw new Error("Approval requires Approver or Admin role");
    return this.dispatchPlanCommand("approve", { planId, revision, planDigest, notes }, expectedVersion);
  }

  async rejectPlan(planId, revision, planDigest, notes = "Rejected by operator", expectedVersion) {
    if (!this.getPermissions().canApprove) throw new Error("Rejection requires Approver or Admin role");
    return this.dispatchPlanCommand("reject", { planId, revision, planDigest, notes }, expectedVersion);
  }

  async launchPlan(planId, revision, planDigest, expectedVersion) {
    if (!this.getPermissions().canLaunch) throw new Error("Launch requires Operator or Admin role");
    return this.dispatchPlanCommand("launch", { planId, revision, planDigest }, expectedVersion);
  }

  async clonePlan(planId, revision, planDigest, expectedVersion, overrides = {}) {
    return this.dispatchPlanCommand("clone", { planId, revision, planDigest, ...overrides }, expectedVersion);
  }

  async forkPlan(planId, revision, planDigest, expectedVersion, overrides = {}) {
    return this.dispatchPlanCommand("fork", { planId, revision, planDigest, ...overrides }, expectedVersion);
  }

  async archivePlan(planId, expectedVersion) {
    return this.dispatchPlanCommand("archive", { planId }, expectedVersion);
  }

  // --- Runtime Control Commands ---

  async dispatchCommand(type, payload = {}) {
    if (!this.getPermissions().canControlRuns && !this.getPermissions().canManageQueue) {
      throw new Error(`Current role (${this.role}) is not authorized for runtime control`);
    }
    const idempotencyKey = this.generateIdempotencyKey();
    return this.fetchJson("/api/commands", {
      method: "POST",
      body: JSON.stringify({
        schemaVersion: "apb.command.v2",
        id: idempotencyKey,
        type,
        actor: this.actor,
        payload
      })
    });
  }

  async holdAdmission(reason = "Operator requested admission hold") {
    return this.dispatchCommand("hold", { mode: "checkpoint", reason });
  }

  async pauseCheckpoint(reason = "Operator requested checkpoint pause") {
    return this.dispatchCommand("pause", { mode: "checkpoint", reason });
  }

  async gracefulStop(reason = "Operator requested graceful stop") {
    return this.dispatchCommand("stop", { mode: "graceful", reason });
  }

  async resumeAdmission() {
    return this.dispatchCommand("resume", {});
  }

  async requestRunNow() {
    return this.dispatchCommand("run-now", {});
  }

  async steer(text, scope = "next_run", priority = "required") {
    return this.dispatchCommand("steer", { text, scope, priority });
  }

  async removeSteering(id) {
    return this.dispatchCommand("remove-steering", { id });
  }

  async setCurrentObjective(text, source = "operator", queueItemId = null, runId = null) {
    return this.dispatchCommand("set-current-objective", { text, source, queueItemId, runId });
  }

  async deblock(runId, prompt) {
    return this.dispatchCommand("deblock", { runId, prompt });
  }

  async requestDeblockAdvice(runId, prompt) {
    return this.dispatchCommand("deblock-advice", { runId, prompt });
  }

  async approveDeblockAdvice(adviceId) {
    return this.dispatchCommand("approve-deblock-advice", { adviceId });
  }

  async denyDeblockAdvice(adviceId) {
    return this.dispatchCommand("deny-deblock-advice", { adviceId });
  }

  async addQueueItem(item) {
    return this.dispatchCommand("add-queue-item", item);
  }

  async clearQueue() {
    if (!this.getPermissions().canConfigure) {
      throw new Error("Clearing candidate queue requires Administrator role");
    }
    return this.dispatchCommand("clear-queue", {});
  }

  async pinQueueItem(id) {
    return this.dispatchCommand("pin-queue-item", { id });
  }

  async archiveQueueItem(id) {
    return this.dispatchCommand("archive-queue-item", { id });
  }

  async addGate(gate) {
    return this.dispatchCommand("add-gate", gate);
  }

  async updateGate(id, updates) {
    return this.dispatchCommand("update-gate", { id, ...updates });
  }

  async recordGateDecision(id, runId, status, evidenceArtifacts = [], notes = "") {
    return this.dispatchCommand("gate-decision", { id, runId, status, evidenceArtifacts, notes });
  }

  async attachGateEvidence(id, runId, artifacts = [], notes = "") {
    return this.dispatchCommand("attach-gate-evidence", { id, runId, artifacts, notes });
  }

  async startIteration(payload) {
    return this.dispatchCommand("start-next-iteration", payload);
  }

  async continueIteration(payload) {
    return this.dispatchCommand("continue-from-iteration", payload);
  }

  async forkIteration(payload) {
    return this.dispatchCommand("fork-from-iteration", payload);
  }

  async startShowcaseLoop(payload) {
    return this.dispatchCommand("start-showcase-loop", payload);
  }

  async setShowcaseTarget(targetGenerations) {
    return this.dispatchCommand("set-showcase-target", { targetGenerations });
  }

  // --- Real-time SSE Stream & Reconnection ---

  connectStream() {
    if (this.sseSource) {
      try { this.sseSource.close(); } catch {}
    }

    const streamUrl = `${this.baseUrl}/api/stream${this.lastEventId ? `?after=${encodeURIComponent(this.lastEventId)}` : ""}`;
    const es = new EventSource(streamUrl);
    this.sseSource = es;

    es.onopen = () => {
      this.sseConnected = true;
      this.reconnectAttempt = 0;
      this.notifySubscribers({ type: "stream-status", status: "live" });
    };

    es.addEventListener("state", (e) => {
      try {
        const state = JSON.parse(e.data);
        this.cachedState = state;
        this.notifySubscribers({ type: "state-update", state });
      } catch (err) {
        console.error("[Client] Failed to parse state event:", err);
      }
    });

    es.addEventListener("events", (e) => {
      try {
        const events = JSON.parse(e.data);
        if (e.lastEventId) this.lastEventId = e.lastEventId;
        this.notifySubscribers({ type: "events-update", events });
      } catch (err) {
        console.error("[Client] Failed to parse events event:", err);
      }
    });

    es.addEventListener("heartbeat", (e) => {
      try {
        const data = JSON.parse(e.data);
        this.notifySubscribers({ type: "heartbeat", ts: data.ts });
      } catch {}
    });

    es.onerror = (err) => {
      this.sseConnected = false;
      this.notifySubscribers({ type: "stream-status", status: "reconnecting" });
      es.close();

      const delay = Math.min(30000, 1000 * Math.pow(1.5, this.reconnectAttempt)) * (0.8 + Math.random() * 0.4);
      this.reconnectAttempt++;
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => {
        this.resyncSnapshots().catch(() => {});
        this.connectStream();
      }, delay);
    };
  }

  disconnectStream() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.sseSource) {
      this.sseSource.close();
      this.sseSource = null;
    }
    this.sseConnected = false;
    this.notifySubscribers({ type: "stream-status", status: "offline" });
  }

  async resyncSnapshots() {
    try {
      const [state, plans, iterations, runs, queue, gates, control, audit, events] = await Promise.all([
        this.getState().catch(() => null),
        this.getProjectPlans().catch(() => null),
        this.getIterations().catch(() => null),
        this.getRuns().catch(() => null),
        this.getQueue().catch(() => null),
        this.getGates().catch(() => null),
        this.getControl().catch(() => null),
        this.getAudit().catch(() => null),
        this.getEvents().catch(() => null)
      ]);
      this.notifySubscribers({ type: "resynchronized", state, plans, iterations, runs, queue, gates, control, audit, events });
    } catch (err) {
      console.warn("[Client] Snapshot resync failed:", err);
    }
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  notifySubscribers(payload) {
    for (const sub of this.subscribers) {
      try { sub(payload); } catch (err) { console.error("[Subscriber] Error:", err); }
    }
  }
}
