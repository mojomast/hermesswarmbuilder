export const WORKFLOW_PHASES = Object.freeze([
  "idle", "inventory-scanning", "selecting", "repo-created", "spec-drafting",
  "spec-review", "spec-approved", "devplan-drafting", "devplan-review",
  "devplan-approved", "building", "blocked", "deblocking", "on-hold",
  "completed", "published"
]);

export const OPERATION_COMMANDS = Object.freeze([
  "pause", "hold", "resume", "unhold", "stop", "run-now", "steer",
  "deblock", "deblock-advice", "approve-deblock-advice", "deny-deblock-advice",
  "remove-steering", "set-current-objective", "start-next-iteration",
  "continue-from-iteration", "fork-from-iteration", "use-as-next-direction",
  "start-showcase-loop", "pause-showcase-loop", "resume-showcase-loop",
  "stop-showcase-loop", "set-showcase-target", "gate-decision",
  "attach-gate-evidence", "add-queue-item", "clear-queue", "pin-queue-item",
  "archive-queue-item", "add-gate", "update-gate"
]);

export const PROJECT_PLAN_ACTIONS = Object.freeze([
  "project-plan.create", "project-plan.update", "project-plan.ready-for-review",
  "project-plan.approve", "project-plan.reject", "project-plan.launch",
  "project-plan.clone", "project-plan.fork", "project-plan.archive"
]);

export const PLAN_ASSISTANCE_SCHEMA = "apb.plan-assistance.v1";
export const PROJECT_PLAN_COMMAND_SCHEMA = "apb.project-plan-command.v1";

const DOCUMENT_CANDIDATES = Object.freeze({
  spec: Object.freeze(["spec.md", "SPEC.approved-candidate-v2.md", "SPEC.approved-candidate.md", "SPEC.md"]),
  devplan: Object.freeze(["devplan.md", "DEVPLAN.approved-candidate-v2.md", "DEVPLAN.reconciled.md", "DEVPLAN.md"])
});

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function positiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? Math.min(number, maximum) : fallback;
}

function errorRecord(error, context) {
  return deepFreeze({
    context,
    message: error?.message || String(error),
    status: error?.status ?? null,
    code: error?.code ?? null,
    details: Array.isArray(error?.details) ? error.details.slice() : [],
    at: new Date().toISOString()
  });
}

function generatedId(prefix) {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `${prefix}-${uuid || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function cloneExternal(value) {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") {
    try { return globalThis.structuredClone(value); } catch {}
  }
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(cloneExternal);
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneExternal(child)]));
}

function plainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}

function normalizeBaseUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

function normalizeEvent(raw, fallbackRunId) {
  const source = cloneExternal(raw && typeof raw === "object" ? raw : { message: String(raw) });
  const type = source.type || source.eventType || "event";
  const data = { ...(source.data || {}) };
  for (const key of ["runId", "agentId", "toolCallId", "toolName", "action", "sanitizedInput", "sanitizedOutput", "status", "durationMs", "error"]) {
    if (source[key] !== undefined && data[key] === undefined) data[key] = source[key];
  }
  const ts = source.ts || new Date().toISOString();
  const eventSource = source.source || source.agentId || "unknown";
  const message = source.message || source.action || source.toolName || "";
  return {
    id: source.id || `${ts}-${eventSource}-${message || type}`.slice(0, 160),
    ts,
    level: source.level || (String(type).includes("error") ? "error" : "info"),
    source: eventSource,
    type,
    message,
    agentId: source.agentId || data.agentId || null,
    runId: source.runId || data.runId || fallbackRunId || null,
    data,
    raw: source
  };
}

export function createDashboardClient(options = {}) {
  const fetchImpl = options.fetch || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new TypeError("createDashboardClient requires fetch");
  const EventSourceImpl = options.EventSource === undefined ? globalThis.EventSource : options.EventSource;
  const setIntervalImpl = options.setInterval || globalThis.setInterval;
  const clearIntervalImpl = options.clearInterval || globalThis.clearInterval;
  const setTimeoutImpl = options.setTimeout || globalThis.setTimeout;
  const clearTimeoutImpl = options.clearTimeout || globalThis.clearTimeout;
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const maxEvents = positiveInteger(options.maxEvents, 1000, 10_000);
  const maxRawMessages = positiveInteger(options.maxRawMessages, 80, 1000);
  const pollIntervalMs = positiveInteger(options.pollIntervalMs, 4000);
  const eventLimit = positiveInteger(options.eventLimit, 250, 1000);
  const auditLimit = positiveInteger(options.auditLimit, 50, 1000);
  const sseRefreshIntervalMs = positiveInteger(options.sseRefreshIntervalMs, 15_000);
  const reconnectBaseMs = positiveInteger(options.reconnectBaseMs, 1000, 30_000);
  const reconnectMaxMs = positiveInteger(options.reconnectMaxMs, 30_000, 120_000);
  const pauseBufferLimit = positiveInteger(options.pauseBufferLimit, Math.max(maxEvents, eventLimit), 50_000);
  const listeners = new Set();
  let eventSource = null;
  let pollTimer = null;
  let maintenanceTimer = null;
  let reconnectTimer = null;
  let reconnectAttempts = 0;
  let fullRefresh = null;
  let maintenanceRefresh = null;
  let aggregateRevision = 0;
  let eventRevision = 0;
  let lifecycleRevision = 0;
  let runLoadRevision = 0;
  let iterationRequestRevision = 0;
  let planRequestRevision = 0;
  let planListRevision = 0;
  let assistanceListRevision = 0;
  let assistanceRequestRevision = 0;
  let artifactRequestRevision = 0;
  let logRequestRevision = 0;
  let documentRequestRevision = 0;
  let pausedEvents = [];
  let pausedState = null;
  let pausedOverflow = false;
  let pausedStreamError = null;
  const seenEventIds = new Set();
  const seenEventOrder = [];
  const seenEventPositions = new Map();
  let eventPosition = 0;
  const pendingPlanKeys = new Map();
  let disconnected = true;
  let model = {
    state: null,
    runs: [],
    events: [],
    eventCursor: null,
    control: null,
    queue: null,
    gates: null,
    audit: [],
    iterations: [],
    plans: [],
    planDetail: null,
    assistance: [],
    assistanceDetail: null,
    selectedRunId: options.selectedRunId || null,
    selectedRun: { run: null, artifacts: [], logs: [], artifact: null, log: null, document: null },
    selectedIterationId: options.selectedIterationId || null,
    iterationDetail: null,
    rawMessages: [],
    connection: {
      status: "disconnected", transport: null, paused: false,
      connectedAt: null, lastMessageAt: null, lastRefreshAt: null
    },
    error: null
  };
  let snapshot = deepFreeze({ ...model });

  function endpoint(path) {
    return `${baseUrl}${path}`;
  }

  function publish(patch = {}) {
    model = { ...model, ...patch };
    snapshot = deepFreeze({ ...model });
    for (const listener of [...listeners]) {
      try { listener(snapshot); } catch (error) { options.onListenerError?.(error); }
    }
    return snapshot;
  }

  function emptySelectedRun() {
    return { run: null, artifacts: [], logs: [], artifact: null, log: null, document: null };
  }

  function rememberEventId(id) {
    if (seenEventIds.has(id)) return false;
    seenEventIds.add(id);
    seenEventOrder.push(id);
    seenEventPositions.set(id, ++eventPosition);
    const maximum = Math.max(maxEvents * 2, eventLimit * 2);
    while (seenEventOrder.length > maximum) {
      const removed = seenEventOrder.shift();
      seenEventIds.delete(removed);
      seenEventPositions.delete(removed);
    }
    return true;
  }

  function updateConnection(patch) {
    return publish({ connection: { ...model.connection, ...patch } });
  }

  function recordError(error, context) {
    const record = errorRecord(error, context);
    publish({ error: record });
    return record;
  }

  async function request(path, init = {}, responseType = "json") {
    let response;
    try {
      response = await fetchImpl(endpoint(path), init);
    } catch (error) {
      const wrapped = Object.assign(new Error(error?.message || String(error)), { cause: error });
      if (!model.connection.paused) recordError(wrapped, `request:${path}`);
      throw wrapped;
    }
    if (!response.ok) {
      let body;
      try { body = await response.json(); } catch { body = await response.text().catch(() => ""); }
      const message = body?.error?.message || body?.error || body?.message || body || `HTTP ${response.status}`;
      const error = new Error(String(message));
      error.status = response.status;
      error.code = body?.error?.code || body?.code;
      error.details = body?.error?.details || body?.details || [];
      if (!model.connection.paused) recordError(error, `request:${path}`);
      throw error;
    }
    try {
      return responseType === "text" ? await response.text() : await response.json();
    } catch (error) {
      if (!model.connection.paused) recordError(error, `response:${path}`);
      throw error;
    }
  }

  function ingestEvents(items, ingestOptions = {}) {
    const events = model.events.slice();
    let cursor = model.eventCursor;
    let changed = false;
    let cursorChanged = false;
    for (const item of Array.isArray(items) ? items : []) {
      const event = normalizeEvent(item, model.state?.currentRunId);
      const knownPosition = seenEventPositions.get(event.id);
      const cursorPosition = seenEventPositions.get(cursor);
      const canAdvanceThrough = knownPosition === undefined || cursorPosition === undefined || knownPosition >= cursorPosition;
      if (ingestOptions.advanceCursor !== false && ingestOptions.advanceThroughDuplicates && canAdvanceThrough && cursor !== event.id) {
        cursor = event.id;
        cursorChanged = true;
      }
      if (!rememberEventId(event.id)) continue;
      events.push(event);
      changed = true;
      if (ingestOptions.advanceCursor !== false && !ingestOptions.advanceThroughDuplicates) {
        cursorChanged = cursor !== event.id;
        cursor = event.id;
      }
    }
    if (!changed && !cursorChanged) return snapshot;
    eventRevision += 1;
    return publish({ events: events.slice(-maxEvents), eventCursor: cursor });
  }

  function pushRaw(type, payload) {
    return publish({
      rawMessages: [...model.rawMessages, { type, ts: new Date().toISOString(), payload }].slice(-maxRawMessages),
      connection: { ...model.connection, lastMessageAt: new Date().toISOString() }
    });
  }

  async function refreshState() {
    const state = await request("/api/state");
    const selectedRunId = model.selectedRunId || state?.currentRunId || null;
    return publish({ state, selectedRunId, error: null });
  }

  async function refreshRuns() {
    const result = await request("/api/runs");
    const runs = Array.isArray(result) ? result : [];
    const ids = new Set(runs.map((run) => run?.id).filter(Boolean));
    const selectedRunId = ids.has(model.selectedRunId) ? model.selectedRunId : ids.has(model.state?.currentRunId) ? model.state.currentRunId : runs[0]?.id || null;
    const changed = selectedRunId !== model.selectedRunId;
    if (changed) runLoadRevision += 1;
    return publish({ runs, selectedRunId, ...(changed ? { selectedRun: emptySelectedRun() } : {}), error: null });
  }

  async function refreshEvents() {
    const startedAtRevision = eventRevision;
    const cursor = model.eventCursor;
    const after = cursor ? `&after=${encodeURIComponent(cursor)}` : "";
    const events = await request(`/api/events?limit=${eventLimit}${after}`);
    if (startedAtRevision === eventRevision && cursor === model.eventCursor) ingestEvents(events, { advanceThroughDuplicates: true });
    else ingestEvents(events, { advanceCursor: false });
    return snapshot;
  }

  async function refreshControl() { return publish({ control: await request("/api/control"), error: null }); }
  async function refreshQueue() { return publish({ queue: await request("/api/queue"), error: null }); }
  async function refreshGates() { return publish({ gates: await request("/api/gates"), error: null }); }
  async function refreshAudit() { return publish({ audit: await request(`/api/audit?limit=${auditLimit}`), error: null }); }
  async function refreshIterations() {
    const result = await request("/api/iterations");
    const iterations = Array.isArray(result?.items) ? result.items : [];
    const selectedIterationId = iterations.some((item) => item?.id === model.selectedIterationId || item?.runId === model.selectedIterationId) ? model.selectedIterationId : null;
    if (selectedIterationId !== model.selectedIterationId) iterationRequestRevision += 1;
    return publish({ iterations, selectedIterationId, ...(selectedIterationId ? {} : { iterationDetail: null }), error: null });
  }
  async function refreshPlans() {
    const revision = ++planListRevision;
    const result = await request("/api/project-plans");
    const plans = Array.isArray(result?.items) ? result.items : [];
    if (revision !== planListRevision) return snapshot;
    const activePlanId = model.planDetail?.ledger?.planId || null;
    if (activePlanId && !plans.some((item) => item?.planId === activePlanId)) {
      planRequestRevision += 1;
      return publish({ plans, planDetail: null, error: null });
    }
    return publish({ plans, error: null });
  }

  async function loadRunResources(runId = model.selectedRunId) {
    const revision = ++runLoadRevision;
    if (!runId) return publish({ selectedRun: emptySelectedRun() });
    const encoded = encodeURIComponent(runId);
    const [run, artifacts, logs] = await Promise.all([
      request(`/api/runs/${encoded}`), request(`/api/runs/${encoded}/artifacts`), request(`/api/runs/${encoded}/logs`)
    ]);
    if (revision === runLoadRevision && model.selectedRunId === runId) {
      const sameRun = model.selectedRun.run?.id === runId;
      publish({ selectedRun: { run, artifacts: Array.isArray(artifacts) ? artifacts : [], logs: Array.isArray(logs) ? logs : [], artifact: sameRun ? model.selectedRun.artifact : null, log: sameRun ? model.selectedRun.log : null, document: sameRun ? model.selectedRun.document : null }, error: null });
    }
    return { run, artifacts, logs };
  }

  function reconcileLists(state, runsResult, iterationsResult, plansResult, reconcileOptions = {}) {
    const runs = Array.isArray(runsResult) ? runsResult : [];
    const runIds = new Set(runs.map((run) => run?.id).filter(Boolean));
    const selectedRunId = reconcileOptions.preserveRunSelection ? model.selectedRunId : runIds.has(model.selectedRunId) ? model.selectedRunId : runIds.has(state?.currentRunId) ? state.currentRunId : runs[0]?.id || null;
    const runChanged = selectedRunId !== model.selectedRunId;
    if (runChanged) runLoadRevision += 1;
    const iterations = Array.isArray(iterationsResult?.items) ? iterationsResult.items : [];
    const selectedIterationId = reconcileOptions.preserveIterationSelection ? model.selectedIterationId : iterations.some((item) => item?.id === model.selectedIterationId || item?.runId === model.selectedIterationId) ? model.selectedIterationId : null;
    if (selectedIterationId !== model.selectedIterationId) iterationRequestRevision += 1;
    const plans = Array.isArray(plansResult?.items) ? plansResult.items : [];
    const activePlanId = model.planDetail?.ledger?.planId || null;
    const keepPlanDetail = !activePlanId || plans.some((item) => item?.planId === activePlanId);
    return { runs, selectedRunId, runChanged, iterations, selectedIterationId, plans, keepPlanDetail };
  }

  function refresh() {
    const lifecycle = lifecycleRevision;
    if (fullRefresh?.lifecycle === lifecycle) return fullRefresh.promise;
    const aggregate = ++aggregateRevision;
    const planListRequest = ++planListRevision;
    const runSelectionRequest = runLoadRevision;
    const iterationSelectionRequest = iterationRequestRevision;
    const planDetailRequest = planRequestRevision;
    const promise = (async () => {
      try {
        const cursor = model.eventCursor;
        const startedAtEventRevision = eventRevision;
        const after = cursor ? `&after=${encodeURIComponent(cursor)}` : "";
        const [state, runsResult, events, control, queue, gates, audit, iterationsResult, plansResult] = await Promise.all([
          request("/api/state"), request("/api/runs"), request(`/api/events?limit=${eventLimit}${after}`),
          request("/api/control"), request("/api/queue"), request("/api/gates"),
          request(`/api/audit?limit=${auditLimit}`), request("/api/iterations"), request("/api/project-plans")
        ]);
        if (lifecycle !== lifecycleRevision || aggregate !== aggregateRevision) return snapshot;
        const preserveRunSelection = runSelectionRequest !== runLoadRevision;
        const preserveIterationSelection = iterationSelectionRequest !== iterationRequestRevision;
        const reconciled = reconcileLists(state, runsResult, iterationsResult, plansResult, { preserveRunSelection, preserveIterationSelection });
        const plansCurrent = planListRequest === planListRevision;
        const clearPlanDetail = plansCurrent && planDetailRequest === planRequestRevision && !reconciled.keepPlanDetail;
        if (clearPlanDetail) planRequestRevision += 1;
        publish({ state, runs: reconciled.runs, control, queue, gates, audit: Array.isArray(audit) ? audit : [], iterations: reconciled.iterations, ...(plansCurrent ? { plans: reconciled.plans } : {}), selectedRunId: reconciled.selectedRunId, selectedIterationId: reconciled.selectedIterationId, ...(reconciled.runChanged ? { selectedRun: emptySelectedRun() } : {}), ...(reconciled.selectedIterationId ? {} : { iterationDetail: null }), ...(clearPlanDetail ? { planDetail: null } : {}), error: null });
        if (startedAtEventRevision === eventRevision && cursor === model.eventCursor) ingestEvents(events, { advanceThroughDuplicates: true });
        else ingestEvents(events, { advanceCursor: false });
        if (reconciled.selectedRunId && !preserveRunSelection) await loadRunResources(reconciled.selectedRunId);
        if (lifecycle === lifecycleRevision) updateConnection({ lastRefreshAt: new Date().toISOString() });
        return snapshot;
      } catch (error) {
        if (lifecycle === lifecycleRevision) {
          recordError(error, "refresh");
          updateConnection({ status: disconnected ? "disconnected" : model.connection.paused ? "paused" : "degraded" });
        }
        throw error;
      }
    })();
    fullRefresh = { lifecycle, promise };
    promise.finally(() => { if (fullRefresh?.promise === promise) fullRefresh = null; }).catch(() => {});
    return promise;
  }

  function refreshNonStreamed() {
    if (fullRefresh?.lifecycle === lifecycleRevision) return fullRefresh.promise;
    if (maintenanceRefresh) return maintenanceRefresh;
    const lifecycle = lifecycleRevision;
    const aggregate = ++aggregateRevision;
    const planListRequest = ++planListRevision;
    const runSelectionRequest = runLoadRevision;
    const iterationSelectionRequest = iterationRequestRevision;
    const planDetailRequest = planRequestRevision;
    maintenanceRefresh = (async () => {
      try {
        const [runsResult, control, queue, gates, audit, iterationsResult, plansResult] = await Promise.all([
          request("/api/runs"), request("/api/control"), request("/api/queue"), request("/api/gates"),
          request(`/api/audit?limit=${auditLimit}`), request("/api/iterations"), request("/api/project-plans")
        ]);
        if (lifecycle !== lifecycleRevision || aggregate !== aggregateRevision || disconnected || model.connection.paused) return snapshot;
        const preserveRunSelection = runSelectionRequest !== runLoadRevision;
        const preserveIterationSelection = iterationSelectionRequest !== iterationRequestRevision;
        const reconciled = reconcileLists(model.state, runsResult, iterationsResult, plansResult, { preserveRunSelection, preserveIterationSelection });
        const plansCurrent = planListRequest === planListRevision;
        const clearPlanDetail = plansCurrent && planDetailRequest === planRequestRevision && !reconciled.keepPlanDetail;
        if (clearPlanDetail) planRequestRevision += 1;
        publish({ runs: reconciled.runs, control, queue, gates, audit: Array.isArray(audit) ? audit : [], iterations: reconciled.iterations, ...(plansCurrent ? { plans: reconciled.plans } : {}), selectedRunId: reconciled.selectedRunId, selectedIterationId: reconciled.selectedIterationId, ...(reconciled.runChanged ? { selectedRun: emptySelectedRun() } : {}), ...(reconciled.selectedIterationId ? {} : { iterationDetail: null }), ...(clearPlanDetail ? { planDetail: null } : {}), error: null });
        if (reconciled.selectedRunId && !preserveRunSelection) await loadRunResources(reconciled.selectedRunId);
        const activePlanId = model.planDetail?.ledger?.planId;
        const row = model.plans.find((item) => item?.planId === activePlanId);
        if (row && row.version !== model.planDetail?.ledger?.version) await getProjectPlan(activePlanId);
        if (lifecycle === lifecycleRevision) updateConnection({ lastRefreshAt: new Date().toISOString() });
        return snapshot;
      } catch (error) {
        if (lifecycle === lifecycleRevision && !model.connection.paused) recordError(error, "sse-refresh");
        throw error;
      } finally { maintenanceRefresh = null; }
    })();
    return maintenanceRefresh;
  }

  function stopPolling() {
    if (pollTimer !== null) clearIntervalImpl(pollTimer);
    pollTimer = null;
  }

  function stopMaintenance() {
    if (maintenanceTimer !== null) clearIntervalImpl(maintenanceTimer);
    maintenanceTimer = null;
  }

  function stopReconnect() {
    if (reconnectTimer !== null) clearTimeoutImpl(reconnectTimer);
    reconnectTimer = null;
  }

  function startMaintenance() {
    stopMaintenance();
    if (disconnected || model.connection.paused) return;
    maintenanceTimer = setIntervalImpl(() => {
      if (!disconnected && !model.connection.paused && eventSource) refreshNonStreamed().catch(() => {});
    }, sseRefreshIntervalMs);
  }

  function startPolling(reason = null) {
    if (pollTimer !== null) return;
    stopMaintenance();
    if (disconnected || model.connection.paused) return;
    updateConnection({ status: "polling", transport: "polling", error: reason });
    pollTimer = setIntervalImpl(() => {
      if (!model.connection.paused) refresh().catch(() => {});
    }, pollIntervalMs);
  }

  function scheduleReconnect() {
    if (disconnected || model.connection.paused || typeof EventSourceImpl !== "function" || reconnectTimer !== null) return;
    const delay = Math.min(reconnectMaxMs, reconnectBaseMs * (2 ** Math.min(reconnectAttempts, 8)));
    reconnectAttempts += 1;
    reconnectTimer = setTimeoutImpl(() => {
      reconnectTimer = null;
      openEventStream();
    }, delay);
  }

  function bufferPausedEvents(items) {
    for (const item of Array.isArray(items) ? items : []) {
      if (pausedEvents.length >= pauseBufferLimit) { pausedOverflow = true; continue; }
      pausedEvents.push(cloneExternal(item));
    }
  }

  function failEventStream(source, error) {
    if (source !== eventSource || disconnected) return;
    source.close();
    eventSource = null;
    stopMaintenance();
    if (model.connection.paused) { pausedStreamError = error; return; }
    recordError(error, "sse");
    startPolling(error?.message || "SSE disconnected");
    scheduleReconnect();
  }

  function openEventStream() {
    if (disconnected || model.connection.paused) return;
    if (typeof EventSourceImpl !== "function") {
      startPolling("EventSource is unavailable");
      return;
    }
    stopReconnect();
    const previous = eventSource;
    eventSource = null;
    previous?.close();
    const after = model.eventCursor ? `?after=${encodeURIComponent(model.eventCursor)}` : "";
    try {
      const source = new EventSourceImpl(endpoint(`/api/stream${after}`));
      eventSource = source;
      updateConnection({ status: "connecting", transport: "sse", error: null });
      source.addEventListener("open", () => {
        if (source !== eventSource || disconnected || model.connection.paused) return;
        reconnectAttempts = 0;
        stopPolling();
        startMaintenance();
        updateConnection({ status: "connected", transport: "sse", connectedAt: new Date().toISOString(), error: null });
      });
      source.addEventListener("state", (event) => {
        if (source !== eventSource || disconnected) return;
        try {
          const payload = JSON.parse(event.data);
          if (model.connection.paused) { pausedState = cloneExternal(payload); return; }
          pushRaw("state", payload);
          publish({ state: payload, selectedRunId: model.selectedRunId || payload.currentRunId || null });
        } catch (error) { failEventStream(source, error); }
      });
      source.addEventListener("events", (event) => {
        if (source !== eventSource || disconnected) return;
        try {
          const payload = JSON.parse(event.data);
          if (!Array.isArray(payload)) throw new TypeError("SSE events payload must be an array");
          if (model.connection.paused) { bufferPausedEvents(payload); return; }
          pushRaw("events", payload);
          ingestEvents(payload, { advanceThroughDuplicates: true });
        } catch (error) { failEventStream(source, error); }
      });
      source.addEventListener("heartbeat", (event) => {
        if (source !== eventSource || disconnected || model.connection.paused) return;
        try { pushRaw("heartbeat", JSON.parse(event.data)); }
        catch (error) { failEventStream(source, error); }
      });
      source.onerror = () => {
        failEventStream(source, new Error("SSE disconnected"));
      };
    } catch (error) {
      recordError(error, "connect");
      startPolling(error?.message || String(error));
      scheduleReconnect();
    }
  }

  async function connect(connectOptions = {}) {
    if (!disconnected) {
      stopPolling();
      stopMaintenance();
      stopReconnect();
      const previous = eventSource;
      eventSource = null;
      previous?.close();
    }
    disconnected = false;
    lifecycleRevision += 1;
    if (connectOptions.refresh !== false) {
      try { await refresh(); }
      catch (error) {
        startPolling(error?.message || String(error));
        scheduleReconnect();
        throw error;
      }
    }
    openEventStream();
    return snapshot;
  }

  function pause() {
    if (model.connection.paused) return snapshot;
    stopPolling();
    stopMaintenance();
    stopReconnect();
    lifecycleRevision += 1;
    pausedEvents = [];
    pausedState = null;
    pausedOverflow = false;
    pausedStreamError = null;
    return updateConnection({ paused: true, status: "paused" });
  }

  async function resume() {
    if (disconnected || !model.connection.paused) return snapshot;
    updateConnection({ status: "resuming" });
    if (pausedOverflow) {
      const error = new Error(`paused event buffer exceeded ${pauseBufferLimit} events`);
      recordError(error, "resume");
      throw error;
    }
    const bufferedEvents = pausedEvents;
    const bufferedState = pausedState;
    pausedEvents = [];
    pausedState = null;
    if (bufferedState) publish({ state: bufferedState });
    if (bufferedEvents.length) ingestEvents(bufferedEvents);
    await refresh();
    if (pausedEvents.length) ingestEvents(pausedEvents.splice(0));
    if (pausedState) { publish({ state: pausedState }); pausedState = null; }
    pausedStreamError = null;
    publish({ connection: { ...model.connection, paused: false, status: eventSource ? "connected" : "connecting", transport: eventSource ? "sse" : null } });
    if (eventSource) startMaintenance(); else openEventStream();
    return snapshot;
  }

  function disconnect() {
    disconnected = true;
    lifecycleRevision += 1;
    stopPolling();
    stopMaintenance();
    stopReconnect();
    eventSource?.close();
    eventSource = null;
    pausedEvents = [];
    pausedState = null;
    return updateConnection({ status: "disconnected", transport: null, paused: false });
  }

  async function selectRun(runId, selectOptions = {}) {
    runLoadRevision += 1;
    artifactRequestRevision += 1;
    logRequestRevision += 1;
    documentRequestRevision += 1;
    publish({ selectedRunId: runId || null, selectedRun: emptySelectedRun() });
    if (runId && selectOptions.load !== false) await loadRunResources(runId);
    return snapshot;
  }

  async function loadIterationDetail(iterationId = model.selectedIterationId) {
    if (!iterationId) return null;
    const revision = ++iterationRequestRevision;
    const detail = await request(`/api/iterations/${encodeURIComponent(iterationId)}`);
    if (revision === iterationRequestRevision && model.selectedIterationId === iterationId) publish({ iterationDetail: detail, error: null });
    return detail;
  }

  async function selectIteration(iterationId, selectOptions = {}) {
    iterationRequestRevision += 1;
    publish({ selectedIterationId: iterationId || null, iterationDetail: null });
    if (iterationId && selectOptions.load !== false) await loadIterationDetail(iterationId);
    return snapshot;
  }

  async function loadArtifact(name, runId = model.selectedRunId) {
    if (!runId || !name) throw new TypeError("runId and artifact name are required");
    const revision = ++artifactRequestRevision;
    const path = String(name).split("/").filter(Boolean).map(encodeURIComponent).join("/");
    const text = await request(`/api/runs/${encodeURIComponent(runId)}/artifacts/${path}`, {}, "text");
    const result = { runId, name, text };
    if (revision === artifactRequestRevision && runId === model.selectedRunId) publish({ selectedRun: { ...model.selectedRun, artifact: result }, error: null });
    return result;
  }

  async function loadLog(name, runId = model.selectedRunId, loadOptions = {}) {
    if (!runId || !name) throw new TypeError("runId and log name are required");
    const revision = ++logRequestRevision;
    const tail = positiveInteger(loadOptions.tail, 400, 100_000);
    const text = await request(`/api/runs/${encodeURIComponent(runId)}/logs/${encodeURIComponent(name)}?tail=${tail}`, {}, "text");
    const result = { runId, name, text, tail };
    if (revision === logRequestRevision && runId === model.selectedRunId) publish({ selectedRun: { ...model.selectedRun, log: result }, error: null });
    return result;
  }

  async function loadDocument(kindOrCandidates, runId = model.selectedRunId) {
    if (!runId) throw new TypeError("runId is required");
    const revision = ++documentRequestRevision;
    const candidates = Array.isArray(kindOrCandidates) ? kindOrCandidates : DOCUMENT_CANDIDATES[kindOrCandidates] || [kindOrCandidates];
    let lastError;
    for (const name of candidates.filter(Boolean)) {
      try {
        const path = String(name).split("/").filter(Boolean).map(encodeURIComponent).join("/");
        const text = await request(`/api/runs/${encodeURIComponent(runId)}/artifacts/${path}`, {}, "text");
        const result = { runId, name, text };
        const document = { ...result, kind: typeof kindOrCandidates === "string" ? kindOrCandidates : null };
        if (revision === documentRequestRevision && runId === model.selectedRunId) publish({ selectedRun: { ...model.selectedRun, document }, error: null });
        return document;
      } catch (error) {
        lastError = error;
        if (error.status !== 404) throw error;
      }
    }
    throw lastError || new Error("document not found");
  }

  async function command(type, payload = {}, commandOptions = {}) {
    if (!OPERATION_COMMANDS.includes(type)) throw new TypeError(`unknown operation command ${type}`);
    if (!plainObject(payload)) throw new TypeError("command payload must be a plain object");
    const envelope = { type, payload };
    for (const key of ["actor", "target", "correlationId", "idempotencyKey"]) {
      if (commandOptions[key] !== undefined) envelope[key] = commandOptions[key];
    }
    try {
      const result = await request("/api/commands", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(envelope) });
      if (commandOptions.refresh) await refresh();
      return result;
    } catch (error) {
      recordError(error, `command:${type}`);
      throw error;
    }
  }

  async function projectPlanCommand(type, payload, commandOptions = {}) {
    if (!PROJECT_PLAN_ACTIONS.includes(type)) throw new TypeError(`unknown project plan action ${type}`);
    if (!plainObject(payload)) throw new TypeError("project plan payload must be a plain object");
    const envelope = { schemaVersion: PROJECT_PLAN_COMMAND_SCHEMA, type, payload };
    if (commandOptions.expectedVersion !== undefined) envelope.expectedVersion = commandOptions.expectedVersion;
    if (commandOptions.actor !== undefined) envelope.actor = commandOptions.actor;
    const needsIdempotency = ["project-plan.create", "project-plan.approve", "project-plan.launch", "project-plan.clone", "project-plan.fork"].includes(type);
    const fingerprint = needsIdempotency ? stableJson({ type, expectedVersion: commandOptions.expectedVersion ?? null, payload }) : null;
    if (commandOptions.idempotencyKey !== undefined) envelope.idempotencyKey = commandOptions.idempotencyKey;
    else if (needsIdempotency) {
      envelope.idempotencyKey = pendingPlanKeys.get(fingerprint) || generatedId(type.slice(13));
      pendingPlanKeys.set(fingerprint, envelope.idempotencyKey);
      if (pendingPlanKeys.size > 100) pendingPlanKeys.delete(pendingPlanKeys.keys().next().value);
    }
    try {
      const result = await request("/api/project-plans/commands", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(envelope) });
      if (fingerprint) pendingPlanKeys.delete(fingerprint);
      if (commandOptions.refresh) {
        await refreshPlans();
        const activePlanId = model.planDetail?.ledger?.planId;
        const affectedPlanId = result?.planId || payload.planId;
        if (activePlanId && activePlanId === affectedPlanId) await getProjectPlan(activePlanId);
      }
      return result;
    } catch (error) {
      if (fingerprint && error?.status != null) pendingPlanKeys.delete(fingerprint);
      recordError(error, `project-plan:${type}`);
      throw error;
    }
  }

  async function getProjectPlan(planId) {
    if (!planId) throw new TypeError("planId is required");
    const revision = ++planRequestRevision;
    const detail = await request(`/api/project-plans/${encodeURIComponent(planId)}`);
    if (revision === planRequestRevision) publish({ planDetail: detail, error: null });
    return detail;
  }

  function getProjectPlanRevision(planId, revision) {
    return request(`/api/project-plans/${encodeURIComponent(planId)}/revisions/${encodeURIComponent(revision)}`);
  }

  async function listPlanAssistance() {
    const revision = ++assistanceListRevision;
    const result = await request("/api/plan-assistance");
    if (revision === assistanceListRevision) publish({ assistance: Array.isArray(result?.items) ? result.items : [], error: null });
    return result;
  }

  async function createPlanAssistance(pipelineType) {
    if (!["classic", "managed"].includes(pipelineType)) throw new TypeError("pipelineType must be classic or managed");
    const revision = ++assistanceRequestRevision;
    assistanceListRevision += 1;
    const detail = await request("/api/plan-assistance", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ schemaVersion: PLAN_ASSISTANCE_SCHEMA, pipelineType }) });
    if (revision === assistanceRequestRevision) publish({ assistanceDetail: detail, assistance: [{ id: detail.id, version: detail.version, pipelineType: detail.pipelineType, messageCount: detail.messages?.length || 0, hasProposal: !!detail.proposedContent, createdAt: detail.createdAt, updatedAt: detail.updatedAt }, ...model.assistance.filter((item) => item.id !== detail.id)], error: null });
    return detail;
  }

  async function getPlanAssistance(id) {
    if (!id) throw new TypeError("assistance id is required");
    const revision = ++assistanceRequestRevision;
    const detail = await request(`/api/plan-assistance/${encodeURIComponent(id)}`);
    if (revision === assistanceRequestRevision) publish({ assistanceDetail: detail, error: null });
    return detail;
  }

  async function messagePlanAssistance(id, expectedVersion, message) {
    if (!id) throw new TypeError("assistance id is required");
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new TypeError("expectedVersion must be a positive integer");
    if (typeof message !== "string" || !message.trim()) throw new TypeError("message must be a non-empty string");
    if (new TextEncoder().encode(message).byteLength > 16_000) throw new TypeError("message exceeds 16000 bytes");
    const revision = ++assistanceRequestRevision;
    assistanceListRevision += 1;
    try {
      const detail = await request(`/api/plan-assistance/${encodeURIComponent(id)}/messages`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ schemaVersion: PLAN_ASSISTANCE_SCHEMA, expectedVersion, message })
      });
      if (revision === assistanceRequestRevision) publish({ assistanceDetail: detail, assistance: [{ id: detail.id, version: detail.version, pipelineType: detail.pipelineType, messageCount: detail.messages?.length || 0, hasProposal: !!detail.proposedContent, createdAt: detail.createdAt, updatedAt: detail.updatedAt }, ...model.assistance.filter((item) => item.id !== detail.id)], error: null });
      return detail;
    } catch (error) {
      if (error?.status === 409 && revision === assistanceRequestRevision) await getPlanAssistance(id).catch(() => {});
      throw error;
    }
  }

  const planAction = (type) => (payload, actionOptions = {}) => projectPlanCommand(type, payload, actionOptions);
  const api = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("subscriber must be a function");
      listeners.add(listener);
      listener(snapshot);
      return () => listeners.delete(listener);
    },
    unsubscribe: (listener) => listeners.delete(listener),
    refresh, refreshState, refreshRuns, refreshEvents, refreshControl, refreshQueue,
    refreshGates, refreshAudit, refreshIterations, refreshPlans,
    connect, pause, resume, disconnect, ingestEvents,
    selectRun, loadRunResources, selectIteration, loadIterationDetail,
    loadArtifact, loadLog, loadDocument,
    command,
    projectPlanCommand,
    getProjectPlan,
    getProjectPlanRevision,
    createProjectPlan: planAction("project-plan.create"),
    updateProjectPlan: planAction("project-plan.update"),
    submitProjectPlanForReview: planAction("project-plan.ready-for-review"),
    approveProjectPlan: planAction("project-plan.approve"),
    rejectProjectPlan: planAction("project-plan.reject"),
    launchProjectPlan: planAction("project-plan.launch"),
    cloneProjectPlan: planAction("project-plan.clone"),
    forkProjectPlan: planAction("project-plan.fork"),
    archiveProjectPlan: planAction("project-plan.archive"),
    listPlanAssistance, createPlanAssistance, getPlanAssistance, messagePlanAssistance
  };
  return Object.freeze(api);
}
