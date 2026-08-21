import {
  createDashboardClient,
  OPERATION_COMMANDS,
  PROJECT_PLAN_ACTIONS
} from "../../headless-dashboard-client.js";

const $ = (id) => document.getElementById(id);
const arr = (value) => Array.isArray(value) ? value : [];
const obj = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const first = (...values) => values.find((value) => value !== undefined && value !== null && value !== "") ?? "";
const idOf = (value, fallback = "unknown") => String(first(value?.id, value?.runId, value?.planId, value?.name, fallback));
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const json = (value) => JSON.stringify(value, null, 2);
const lines = (value) => String(value || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
const clone = (value) => globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
const client = createDashboardClient({ maxEvents: 900, eventLimit: 350, auditLimit: 150, pollIntervalMs: 4000 });
let renderer = null;

let snapshot = client.getSnapshot();
let page = "overview";
let semanticPage = "overview";
let selectedCommand = OPERATION_COMMANDS[0];
let commandOffset = 0;
let selectedPlanId = null;
let selectedRunId = null;
let evidenceKind = "runs";
let selectedRecord = null;
let sceneEditor = null;
let pending = null;
let listPage = 0;
let planPage = 0;
let assistancePage = 0;
let artifactPage = 0;
let logPage = 0;
let planHistoryPage = 0;
let planHistoryKind = "decisions";
let editorOffset = 0;
let reviewOffset = 0;
let searchQuery = "";
let notice = "Synchronizing the cavern with the control plane";
// Start static. Live data still redraws the scene; optional decorative motion is opt-in with F.
let visualFrozen = true;
const receipts = [];
const hits = [];

const COMMAND_DEFAULTS = Object.freeze({
  pause: { mode: "checkpoint", reason: "" }, hold: { reason: "" }, resume: {}, unhold: {}, stop: { mode: "graceful", reason: "" }, "run-now": {},
  steer: { scope: "current_run", priority: "required", text: "", expires: { type: "until_removed" } }, deblock: { runId: "", prompt: "" }, "deblock-advice": { runId: "", prompt: "Assess the current blocker and propose the safest bounded mitigation." },
  "approve-deblock-advice": { adviceId: "" }, "deny-deblock-advice": { adviceId: "" }, "remove-steering": { id: "" }, "set-current-objective": { text: "", source: "command-cavern" },
  "start-next-iteration": { sourceRunId: null, sourceIterationId: null, repoPath: "", baseRef: "HEAD", objective: "", changeText: "", acceptanceGateIds: [], snapshottedAcceptanceGates: [], limits: {} },
  "continue-from-iteration": { sourceRunId: "", sourceIterationId: "", repoPath: "", baseRef: "HEAD", objective: "", changeText: "", acceptanceGateIds: [], snapshottedAcceptanceGates: [], limits: {} },
  "fork-from-iteration": { sourceRunId: "", sourceIterationId: "", repoPath: "", baseRef: "HEAD", objective: "", changeText: "", acceptanceGateIds: [], snapshottedAcceptanceGates: [], limits: {} },
  "use-as-next-direction": { sourceRunId: "", sourceIterationId: "", repoPath: "", baseRef: "HEAD", objective: "", changeText: "", acceptanceGateIds: [], snapshottedAcceptanceGates: [], limits: {} },
  "start-showcase-loop": { sourceRunId: null, sourceIterationId: null, repoPath: "", baseRef: "HEAD", objective: "", changeText: "Complete one bounded showcase generation.", targetGenerations: 3, acceptanceGateIds: [], snapshottedAcceptanceGates: [], limits: {} },
  "pause-showcase-loop": { reason: "" }, "resume-showcase-loop": {}, "stop-showcase-loop": { reason: "" }, "set-showcase-target": { targetGenerations: 3 },
  "gate-decision": { gateId: "", runId: "", status: "needs-evidence", decision: "defer", evidenceArtifacts: [], notes: "" }, "attach-gate-evidence": { gateId: "", runId: "", artifacts: [], notes: "" },
  "add-queue-item": { title: "", objective: "", context: "", constraints: "", priority: 50, pin: false, acceptanceGateIds: [], target: {} }, "clear-queue": {}, "pin-queue-item": { itemId: "" }, "archive-queue-item": { itemId: "" },
  "add-gate": { id: "", phase: "building", severity: "must", description: "", requiredEvidence: "" }, "update-gate": { gateId: "", phase: "building", severity: "must", description: "", requiredEvidence: [], status: "pending" }
});
const OPERATION_KEYS = Object.freeze({
  pause: ["mode", "reason"], hold: ["reason"], resume: [], unhold: [], stop: ["mode", "reason"], "run-now": [],
  steer: ["scope", "priority", "text", "expires"], deblock: ["runId", "prompt"], "deblock-advice": ["runId", "prompt"], "approve-deblock-advice": ["adviceId"], "deny-deblock-advice": ["adviceId"], "remove-steering": ["id"], "set-current-objective": ["text", "source", "queueItemId", "runId"],
  "start-next-iteration": ["sourceRunId", "sourceIterationId", "repoPath", "baseRef", "objective", "changeText", "acceptanceGateIds", "snapshottedAcceptanceGates", "limits", "sourceEvidencePolicy", "queueItemId"],
  "continue-from-iteration": ["sourceRunId", "sourceIterationId", "repoPath", "baseRef", "objective", "changeText", "acceptanceGateIds", "snapshottedAcceptanceGates", "limits", "sourceEvidencePolicy", "queueItemId"],
  "fork-from-iteration": ["sourceRunId", "sourceIterationId", "repoPath", "baseRef", "objective", "changeText", "acceptanceGateIds", "snapshottedAcceptanceGates", "limits", "sourceEvidencePolicy", "queueItemId"],
  "use-as-next-direction": ["sourceRunId", "sourceIterationId", "repoPath", "baseRef", "objective", "changeText", "acceptanceGateIds", "snapshottedAcceptanceGates", "limits", "sourceEvidencePolicy", "queueItemId"],
  "start-showcase-loop": ["sourceRunId", "sourceIterationId", "repoPath", "baseRef", "objective", "changeText", "targetGenerations", "acceptanceGateIds", "snapshottedAcceptanceGates", "limits", "sourceEvidencePolicy", "queueItemId", "catalogueScope"],
  "pause-showcase-loop": ["reason"], "resume-showcase-loop": [], "stop-showcase-loop": ["reason"], "set-showcase-target": ["targetGenerations"],
  "gate-decision": ["gateId", "runId", "status", "decision", "evidenceArtifacts", "notes"], "attach-gate-evidence": ["gateId", "runId", "artifacts", "notes"],
  "add-queue-item": ["title", "objective", "context", "constraints", "priority", "pin", "acceptanceGateIds", "target", "source"], "clear-queue": [], "pin-queue-item": ["itemId"], "archive-queue-item": ["itemId"],
  "add-gate": ["id", "phase", "severity", "description", "requiredEvidence"], "update-gate": ["gateId", "phase", "severity", "description", "requiredEvidence", "status"]
});

function announce(message, error = false) {
  notice = String(message);
  $("liveRegion").textContent = notice;
  $("semanticStatus").className = error ? "error" : "";
  $("semanticStatus").textContent = notice;
  renderer?.requestFrame();
}

function currentRunId() { return snapshot.state?.currentRunId || null; }
function currentRun() { return snapshot.runs.find((run) => idOf(run) === currentRunId()) || snapshot.selectedRun?.run || null; }
function currentBlocker() { return snapshot.state?.blocker || snapshot.state?.block || snapshot.state?.hold || arr(snapshot.state?.blockers)[0] || (["blocked", "on-hold"].includes(snapshot.state?.status) ? { status: snapshot.state.status, phase: snapshot.state.phase } : null); }
function gates() { return arr(snapshot.gates?.gates || snapshot.gates?.items || snapshot.gates); }
function queueItems() { return arr(snapshot.queue?.items || snapshot.queue); }
function adviceItems() { const value = snapshot.control?.deblockAdvice || snapshot.control?.advice; return Array.isArray(value) ? value : Object.values(obj(value)); }
function resources() { return snapshot.selectedRun || { run: null, artifacts: [], logs: [] }; }
function itemName(item) { return typeof item === "string" ? item : first(item?.name, item?.path, item?.id, "unnamed"); }
function agents() {
  const map = new Map();
  const sources = [snapshot.state?.agents, snapshot.state?.swarm?.agents, snapshot.state?.agentStates];
  for (const source of sources) for (const item of Array.isArray(source) ? source : Object.values(obj(source))) map.set(idOf(item), item);
  for (const event of snapshot.events) if (event.agentId) map.set(String(event.agentId), { ...obj(map.get(String(event.agentId))), id: event.agentId, lastEvent: event, status: first(map.get(String(event.agentId))?.status, "observed") });
  return [...map.values()];
}
function tools() {
  const map = new Map();
  for (const event of snapshot.events) {
    const name = first(event.data?.toolName, event.raw?.toolName, event.type?.includes("tool") ? event.message : "");
    if (name) map.set(String(name), { name, runId: event.runId, agentId: event.agentId, status: first(event.data?.status, event.level), event });
  }
  return [...map.values()];
}
function gateSnapshot(gate) {
  const requiredEvidence = Array.isArray(gate?.requiredEvidence) ? gate.requiredEvidence.map(String) : lines(gate?.requiredEvidence);
  return { id: String(gate?.id || ""), description: String(first(gate?.description, gate?.title)), severity: gate?.severity === "should" ? "should" : "must", required: typeof gate?.required === "boolean" ? gate.required : requiredEvidence.length > 0, requiredEvidence };
}
function boundedLimits(source = {}, maxIterations = 1, includeScore = true) {
  const integer = (key, fallback, min, max) => Math.min(max, Math.max(min, Number.isInteger(Number(source[key])) ? Number(source[key]) : fallback));
  const variants = integer("maxVariantsPerIteration", 3, 1, 5);
  const result = {
    maxIterations: integer("maxIterations", maxIterations, 1, 10), maxVariantsPerIteration: variants,
    maxParallelVariants: Math.min(variants, integer("maxParallelVariants", 3, 1, 5)), maxAcceptedFeatures: integer("maxAcceptedFeatures", 4, 1, 4),
    maxVisualMotifChanges: integer("maxVisualMotifChanges", 1, 0, 1), maxNewSections: integer("maxNewSections", 1, 0, 1), stopAfterNoImprovement: integer("stopAfterNoImprovement", 1, 1, 3)
  };
  if (includeScore) result.minImprovementScore = Math.min(1, Math.max(0, Number(source.minImprovementScore) || 0.05));
  return result;
}
function planLimits(source = {}) { return boundedLimits(source, 1, false); }
function canonical(value) { if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`; }
function cavernRenderSignature(value) {
  return canonical({
    state: value.state,
    control: value.control,
    connection: { status: value.connection?.status, transport: value.connection?.transport, paused: value.connection?.paused },
    runs: value.runs,
    events: value.events.slice(-80),
    queue: value.queue,
    gates: value.gates,
    audit: value.audit.slice(-50),
    iterations: value.iterations,
    plans: value.plans,
    planDetail: value.planDetail,
    assistance: value.assistance,
    assistanceDetail: value.assistanceDetail,
    selectedRunId: value.selectedRunId,
    selectedRun: value.selectedRun,
    selectedIterationId: value.selectedIterationId,
    iterationDetail: value.iterationDetail,
    error: value.error
  });
}
function deepFreeze(value) { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(deepFreeze); return Object.freeze(value); }
function intentKey(type) { return `command-cavern-${type}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`; }
function normalizeGateIds(ids) { return [...new Set(arr(ids).map(String).map((id) => id.trim()).filter(Boolean))]; }
function gateSnapshotsFor(ids, source = []) {
  const wanted = normalizeGateIds(ids);
  const available = new Map([...gates(), ...arr(source)].map((gate) => [String(gate?.id || ""), gateSnapshot(gate)]));
  const missing = wanted.filter((id) => !available.has(id));
  if (missing.length) throw new Error(`Acceptance gates are unavailable: ${missing.join(", ")}.`);
  return wanted.map((id) => available.get(id));
}
function clearQueueCollateral() {
  const ids = new Set(queueItems().map((item) => item.id));
  const steering = arr(snapshot.control?.activeSteering).filter((item) => item.scope === "queue" || item.scope === "queue_item" || ids.has(item.queueItemId) || ids.has(item.target?.queueItemId));
  return { queueItemsRemoved: queueItems().length, pinnedObjectiveCleared: Boolean(snapshot.control?.pinnedQueueItemId || snapshot.control?.currentObjective), nextRunRequestCleared: Boolean(snapshot.control?.nextRunRequest), runNowRequestCleared: Boolean(snapshot.control?.requestedRunNow), queueSteeringRetired: steering.length };
}

function commandSeed(type) {
  const seed = clone(COMMAND_DEFAULTS[type]);
  const run = currentRun();
  const iteration = snapshot.iterations.find((item) => idOf(item) === snapshot.selectedIterationId) || snapshot.iterations.find((item) => item.runId === selectedRunId) || {};
  if ("runId" in seed && !seed.runId) seed.runId = selectedRunId || currentRunId() || "";
  if ("sourceRunId" in seed && !seed.sourceRunId) seed.sourceRunId = first(iteration.runId, iteration.sourceRunId, currentRunId(), null);
  if ("sourceIterationId" in seed && !seed.sourceIterationId) seed.sourceIterationId = first(iteration.id, iteration.iterationId, null);
  if ("repoPath" in seed) seed.repoPath = first(iteration.repoPath, run?.repoPath, run?.repository?.path, snapshot.control?.autoIteration?.repoPath, snapshot.state?.repoPath);
  if ("objective" in seed) seed.objective = first(iteration.objective, run?.objective, snapshot.control?.currentObjective?.text, snapshot.state?.objective);
  if ("changeText" in seed) seed.changeText = first(iteration.nextRecommendedDirection, iteration.steeringText, seed.changeText, "Complete one bounded objective-linked change without unrelated changes.");
  if ("baseRef" in seed) seed.baseRef = first(iteration.baseRef, iteration.commit, "HEAD");
  if ("limits" in seed) seed.limits = boundedLimits(iteration.limits || snapshot.control?.autoIteration || {}, type === "start-showcase-loop" ? seed.targetGenerations : 1);
  return seed;
}

async function completeLineage(type, submitted) {
  const lineageTypes = ["continue-from-iteration", "fork-from-iteration", "use-as-next-direction"];
  const sourceId = String(first(submitted.sourceIterationId, snapshot.selectedIterationId) || "").trim();
  let detail = {};
  if (sourceId) {
    await client.selectIteration(sourceId, { load: false });
    detail = await client.loadIterationDetail(sourceId);
    snapshot = client.getSnapshot();
  }
  const row = snapshot.iterations.find((item) => String(first(item.id, item.iterationId)) === sourceId) || {};
  const state = detail.iterationState || {};
  const sourceRunId = String(first(detail.runId, state.runId, row.runId, row.sourceRunId, submitted.sourceRunId) || "").trim();
  const sourceIterationId = String(first(detail.id, state.id, row.id, row.iterationId, submitted.sourceIterationId) || "").trim();
  if (lineageTypes.includes(type) && (!sourceRunId || !sourceIterationId)) throw new Error(`${type} requires an authoritative source run and iteration.`);
  if (sourceId && sourceIterationId !== sourceId) throw new Error(`Loaded iteration ${sourceIterationId || "none"} does not match requested identity ${sourceId}.`);
  if (submitted.sourceRunId && sourceRunId && String(submitted.sourceRunId) !== sourceRunId) throw new Error(`Source run ${submitted.sourceRunId} no longer owns iteration ${sourceIterationId}.`);
  const sourceGates = arr(state.acceptanceGates).length ? state.acceptanceGates : arr(row.acceptanceGates);
  const gateIds = normalizeGateIds(arr(state.acceptanceGateIds).length ? state.acceptanceGateIds : arr(row.acceptanceGateIds).length ? row.acceptanceGateIds : sourceGates.length ? sourceGates.map((gate) => gate.id) : submitted.acceptanceGateIds);
  const snapshots = gateSnapshotsFor(gateIds, sourceGates);
  const limits = boundedLimits(first(state.limits, row.limits, submitted.limits, {}), type === "start-showcase-loop" ? Number(submitted.targetGenerations) || 3 : 1);
  const payload = {
    ...submitted, sourceRunId: lineageTypes.includes(type) ? sourceRunId : sourceRunId || null, sourceIterationId: lineageTypes.includes(type) ? sourceIterationId : sourceIterationId || null,
    repoPath: String(first(submitted.repoPath, state.repoPath, row.repoPath, snapshot.control?.autoIteration?.repoPath)).trim(),
    baseRef: String(first(submitted.baseRef, state.baseRef, row.baseRef, row.commit, "HEAD")).trim(),
    objective: String(first(submitted.objective, state.objective, row.objective, snapshot.control?.currentObjective?.text)).trim(),
    changeText: String(first(submitted.changeText, state.changeText, row.nextRecommendedDirection, row.steeringText)).trim(),
    acceptanceGateIds: gateIds, snapshottedAcceptanceGates: snapshots, limits, sourceEvidencePolicy: "load-from-source-run"
  };
  if (!payload.repoPath.startsWith("/") || !payload.baseRef || !payload.objective || !payload.changeText) throw new Error("A complete lineage request requires absolute repoPath, baseRef, objective, and bounded changeText.");
  return payload;
}
function lineageFingerprint(payload) {
  return canonical({ sourceRunId: payload.sourceRunId, sourceIterationId: payload.sourceIterationId, repoPath: payload.repoPath, baseRef: payload.baseRef, objective: payload.objective, changeText: payload.changeText, acceptanceGateIds: payload.acceptanceGateIds, snapshottedAcceptanceGates: payload.snapshottedAcceptanceGates, limits: payload.limits, sourceEvidencePolicy: payload.sourceEvidencePolicy });
}

async function revalidateRecovery(type, payload) {
  if (!["deblock", "deblock-advice", "approve-deblock-advice", "deny-deblock-advice"].includes(type)) return;
  if (type === "deny-deblock-advice") await client.refreshControl();
  else await Promise.all([client.refreshState(), client.refreshControl()]);
  snapshot = client.getSnapshot();
  if (type === "deny-deblock-advice") {
    const advice = adviceItems().find((item) => String(item.id) === String(payload.adviceId) && item.status === "pending");
    if (!advice) throw new Error("The pending advice is no longer available to deny.");
    return;
  }
  const runId = currentRunId();
  if (!runId) throw new Error(`${type} requires a refreshed current run.`);
  if (["deblock", "deblock-advice", "approve-deblock-advice"].includes(type) && !currentBlocker()) throw new Error(`${type} requires a refreshed current blocked run.`);
  if (["deblock", "deblock-advice"].includes(type) && payload.runId !== runId) throw new Error(`Recovery target changed to ${runId}; review again.`);
  if (type === "approve-deblock-advice") {
    const advice = adviceItems().find((item) => String(item.id) === String(payload.adviceId) && item.status === "pending");
    if (!advice || advice.runId !== runId) throw new Error("The pending advice no longer belongs to the current blocked run.");
  }
}

function validateOperation(type, payload) {
  if (!OPERATION_COMMANDS.includes(type) || !payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Operation and payload object are required.");
  const unknown = Object.keys(payload).filter((key) => !OPERATION_KEYS[type].includes(key));
  if (unknown.length) throw new Error(`${type} payload has unsupported fields: ${unknown.join(", ")}.`);
  const requiredText = (...keys) => { const missing = keys.filter((key) => typeof payload[key] !== "string" || !payload[key].trim()); if (missing.length) throw new Error(`${type} requires non-empty ${missing.join(", ")}.`); };
  const requireArray = (key) => { if (!Array.isArray(payload[key])) throw new Error(`${type} ${key} must be an array.`); };
  if (payload.reason !== undefined && typeof payload.reason !== "string") throw new Error(`${type} reason must be a string.`);
  if (type === "pause" && payload.mode !== "checkpoint") throw new Error("pause mode must be checkpoint.");
  if (type === "stop" && payload.mode !== "graceful") throw new Error("stop mode must be graceful.");
  if (["resume", "unhold", "run-now", "resume-showcase-loop", "clear-queue"].includes(type) && Object.keys(payload).length) throw new Error(`${type} payload must be empty.`);
  if (type === "steer") { requiredText("text", "scope", "priority"); if (!["current_run", "next_run", "queue"].includes(payload.scope)) throw new Error("steer scope is invalid."); if (!["required", "advisory", "preferred"].includes(payload.priority)) throw new Error("steer priority is invalid."); }
  if (["deblock", "deblock-advice"].includes(type)) requiredText("runId", "prompt");
  if (["approve-deblock-advice", "deny-deblock-advice"].includes(type)) requiredText("adviceId");
  if (type === "remove-steering") { requiredText("id"); if (!arr(snapshot.control?.activeSteering).some((item) => String(item.id) === String(payload.id))) throw new Error(`Active steering ${payload.id} is unavailable.`); }
  if (type === "set-current-objective") requiredText("text");
  if (["start-next-iteration", "continue-from-iteration", "fork-from-iteration", "use-as-next-direction", "start-showcase-loop"].includes(type)) { requiredText("repoPath", "baseRef", "objective", "changeText"); requireArray("acceptanceGateIds"); requireArray("snapshottedAcceptanceGates"); if (!obj(payload.limits).maxIterations) throw new Error(`${type} requires bounded limits.`); }
  if (["start-showcase-loop", "set-showcase-target"].includes(type) && (!Number.isInteger(Number(payload.targetGenerations)) || Number(payload.targetGenerations) < 1 || Number(payload.targetGenerations) > 10)) throw new Error(`${type} targetGenerations must be an integer from 1 through 10.`);
  if (type === "gate-decision") { requiredText("gateId", "runId", "status", "decision"); requireArray("evidenceArtifacts"); if (!gates().some((gate) => String(gate.id) === String(payload.gateId))) throw new Error(`Gate ${payload.gateId} is unavailable.`); if (!["passed", "failed", "needs-evidence"].includes(payload.status) || !["accepted", "rejected", "defer"].includes(payload.decision)) throw new Error("gate-decision status or decision is invalid."); }
  if (type === "attach-gate-evidence") { requiredText("gateId", "runId"); requireArray("artifacts"); if (!gates().some((gate) => String(gate.id) === String(payload.gateId))) throw new Error(`Gate ${payload.gateId} is unavailable.`); if (!payload.artifacts.length) throw new Error("attach-gate-evidence requires existing artifact paths."); }
  if (type === "add-queue-item") { requiredText("title", "objective"); if (typeof payload.constraints !== "string") throw new Error("Queue constraints must be newline-delimited text."); if (lines(payload.constraints).length > 50) throw new Error("Queue constraints are limited to 50 entries."); requireArray("acceptanceGateIds"); if (!Number.isInteger(Number(payload.priority)) || Number(payload.priority) < 0 || Number(payload.priority) > 100) throw new Error("Queue priority must be an integer from 0 through 100."); if (!payload.target || typeof payload.target !== "object" || Array.isArray(payload.target)) throw new Error("Queue target must be an object."); gateSnapshotsFor(payload.acceptanceGateIds); }
  if (["pin-queue-item", "archive-queue-item"].includes(type)) { requiredText("itemId"); const item = queueItems().find((item) => String(item.id) === String(payload.itemId)); if (!item) throw new Error(`Queue item ${payload.itemId} is no longer available.`); if (item.status === "archived") throw new Error(`Queue item ${payload.itemId} is archived.`); }
  if (type === "add-gate") { requiredText("id", "phase", "severity", "description"); if (!['must', 'should'].includes(payload.severity)) throw new Error("Gate severity must be must or should."); if (typeof payload.requiredEvidence !== "string") throw new Error("add-gate requiredEvidence must be newline-delimited text."); }
  if (type === "update-gate") { requiredText("gateId"); if (!gates().some((gate) => String(gate.id) === String(payload.gateId))) throw new Error(`Gate ${payload.gateId} is unavailable.`); if (Object.keys(payload).every((key) => key === "gateId")) throw new Error("update-gate requires at least one changed field."); if (payload.requiredEvidence !== undefined) requireArray("requiredEvidence"); }
}

async function reviewOperation(type, payload) {
  const lineage = ["start-next-iteration", "continue-from-iteration", "fork-from-iteration", "use-as-next-direction", "start-showcase-loop"].includes(type);
  const completed = lineage ? await completeLineage(type, clone(payload)) : clone(payload);
  validateOperation(type, completed);
  const collateralImpact = type === "clear-queue" ? clearQueueCollateral() : null;
  pending = deepFreeze({ kind: "operation", type, payload: completed, idempotencyKey: intentKey(type), sourceFingerprint: lineage ? lineageFingerprint(completed) : null, collateralImpact, collateralFingerprint: collateralImpact ? canonical(collateralImpact) : null, reviewedAt: new Date().toISOString() });
  page = "confirm";
  reviewOffset = 0;
  renderer?.requestFrame();
}

async function dispatchPending() {
  if (!pending) return;
  const request = pending;
  const receipt = { id: `receipt-${Date.now()}-${receipts.length}`, type: request.type, status: "validating", requestedAt: new Date().toISOString(), payload: clone(request.payload), acceptedIntent: null, observedState: null };
  receipts.push(receipt);
  pending = null;
  page = request.kind === "plan" ? "plans" : "operations";
  try {
    let result;
    if (request.kind === "operation") {
      const payload = request.payload;
      await revalidateRecovery(request.type, payload);
      if (request.sourceFingerprint) {
        const refreshed = await completeLineage(request.type, clone(payload));
        if (lineageFingerprint(refreshed) !== request.sourceFingerprint) throw new Error("Lineage source changed after review; dispatch rejected. Review a new exact envelope.");
      }
      if (request.collateralFingerprint && canonical(clearQueueCollateral()) !== request.collateralFingerprint) throw new Error("Clear-queue collateral changed after review; dispatch rejected. Review the current impact again.");
      validateOperation(request.type, payload);
      receipt.payload = payload;
      receipt.status = "sending";
      result = await client.command(request.type, payload, { refresh: true, idempotencyKey: request.idempotencyKey });
    } else {
      if (request.type !== "project-plan.create") {
        const latest = await client.getProjectPlan(request.payload.planId);
        if (Number(latest.ledger?.version) !== Number(request.expectedVersion)) throw new Error("Plan ledger version changed after review; dispatch rejected.");
        if (!["project-plan.update", "project-plan.archive"].includes(request.type) && (Number(latest.ledger?.currentRevision) !== Number(request.payload.revision) || latest.ledger?.currentDigest !== request.payload.planDigest)) throw new Error("Plan revision or digest changed after review; dispatch rejected.");
      }
      validatePlanRequest(request.type, request.payload, request.expectedVersion);
      receipt.status = "sending";
      result = await client.projectPlanCommand(request.type, request.payload, { expectedVersion: request.expectedVersion, idempotencyKey: request.idempotencyKey, refresh: true });
    }
    receipt.status = "accepted intent / awaiting observation";
    receipt.acceptedIntent = new Date().toISOString();
    receipt.commandId = result?.commandId || result?.planId || null;
    receipt.result = result;
    if (request.kind === "plan") {
      if (request.type === "project-plan.archive") selectedPlanId = null;
      else if (result?.planId || request.payload.planId) { selectedPlanId = result?.planId || request.payload.planId; await client.getProjectPlan(selectedPlanId).catch(() => {}); }
    }
    reconcileReceipts();
    announce(`${request.type} accepted as intent${receipt.commandId ? ` / ${receipt.commandId}` : ""}. Verify observed state.`);
  } catch (error) {
    receipt.status = error?.status == null && receipt.status === "sending" ? "outcome unknown / reconcile audit" : "rejected";
    receipt.error = error.message;
    announce(`${request.type}: ${error.message}`, true);
  }
  renderSemantic();
}

function reconcileReceipts() {
  for (const receipt of receipts) {
    if (!receipt.status.startsWith("accepted intent")) continue;
    const type = receipt.type;
    let projection = null;
    if (["pause", "hold", "resume", "unhold", "stop"].includes(type)) projection = { pause: snapshot.control?.pause, stop: snapshot.control?.stop, runAdmission: snapshot.control?.runAdmission };
    else if (type === "set-current-objective") projection = snapshot.control?.currentObjective || null;
    else if (["pin-queue-item", "archive-queue-item", "clear-queue"].includes(type)) projection = { pinnedQueueItemId: snapshot.control?.pinnedQueueItemId, queueCount: queueItems().length, nextRunRequest: snapshot.control?.nextRunRequest || null };
    else if (type.includes("iteration") || type.includes("showcase")) projection = { nextRunRequest: snapshot.control?.nextRunRequest || null, autoIteration: snapshot.control?.autoIteration || null };
    receipt.projectedState = projection ? { capturedAt: new Date().toISOString(), value: clone(projection), authority: "requested control projection; not observed completion" } : null;
    receipt.observedState = null;
  }
}

function exactPlanRequest(action) {
  const detail = snapshot.planDetail;
  if (!detail?.ledger || !detail?.revision) throw new Error("Load an exact plan revision first.");
  const ledger = detail.ledger, revision = detail.revision;
  let payload = { planId: ledger.planId, revision: first(revision.revision, ledger.currentRevision), planDigest: first(revision.contentDigest, ledger.currentDigest) };
  if (!payload.revision || !payload.planDigest || !Number.isInteger(Number(ledger.version))) throw new Error("Plan revision, digest, and expected version are required.");
  if (action === "project-plan.archive") payload = { planId: ledger.planId };
  if (["project-plan.clone", "project-plan.fork"].includes(action)) payload = { ...payload, sourceRunId: selectedRunId || snapshot.selectedRunId || null, sourceIterationId: snapshot.selectedIterationId || null, baseRef: revision.content?.pipelineType === "managed" ? first(revision.content?.repository?.baseRef, "HEAD") : null };
  if (action === "project-plan.reject") payload.notes = "Rejected through Command Cavern after exact-revision review.";
  if (action === "project-plan.approve") payload.notes = "Approved through Command Cavern after exact-revision review.";
  return { payload, expectedVersion: Number(ledger.version) };
}

function normalizePlanContent(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Plan content must be an object.");
  const allowed = new Set(["pipelineType", "title", "problem", "intendedUsers", "objective", "boundedScope", "requirements", "nonGoals", "constraints", "risks", "repository", "acceptanceGates", "validationPolicy", "milestones", "limits", "lineage"]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`Plan content has unknown fields: ${unknown.join(", ")}.`);
  const pipelineType = value.pipelineType === "managed" ? "managed" : value.pipelineType === "classic" ? "classic" : "";
  if (!pipelineType) throw new Error("Plan pipelineType must be classic or managed.");
  for (const key of ["title", "problem", "intendedUsers", "objective", "boundedScope"]) if (typeof value[key] !== "string") throw new Error(`Plan ${key} must be a string.`);
  const listKeys = ["requirements", "nonGoals", "constraints", "risks", "acceptanceGates", "milestones"];
  for (const key of listKeys) if (!Array.isArray(value[key])) throw new Error(`Plan ${key} must be an array.`);
  const acceptanceGates = value.acceptanceGates.map((gate, index) => {
    if (!gate || typeof gate !== "object" || Array.isArray(gate)) throw new Error(`Plan acceptance gate ${index + 1} must be an object.`);
    const normalized = gateSnapshot(gate);
    if (!normalized.id || !normalized.description) throw new Error(`Plan acceptance gate ${index + 1} requires id and description.`);
    return normalized;
  });
  const validationPolicy = { ...obj(value.validationPolicy), id: first(value.validationPolicy?.id, "apb.runner-selected.v1"), expectations: arr(value.validationPolicy?.expectations).map(String), clientCommandsAllowed: false };
  const repository = pipelineType === "managed" ? { path: String(value.repository?.path || "").trim(), baseRef: String(value.repository?.baseRef || "HEAD").trim(), baseCommit: value.repository?.baseCommit || null } : { path: null, baseRef: null, baseCommit: null };
  if (pipelineType === "managed" && repository.path && !repository.path.startsWith("/")) throw new Error("A managed draft repository path must be absolute when supplied.");
  const lineage = { mode: "new", sourcePlanId: null, sourceRevision: null, sourceRunId: null, sourceIterationId: null, ...obj(value.lineage) };
  if (!["new", "clone", "fork"].includes(lineage.mode)) throw new Error("Plan lineage mode must be new, clone, or fork.");
  return { ...value, pipelineType, repository, requirements: value.requirements.map(String), nonGoals: value.nonGoals.map(String), constraints: value.constraints.map(String), risks: value.risks.map(String), acceptanceGates, validationPolicy, milestones: value.milestones.map(String), limits: planLimits(value.limits), lineage };
}

function validatePlanRequest(type, payload, expectedVersion) {
  if (!PROJECT_PLAN_ACTIONS.includes(type) || !payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("A valid project-plan request is required.");
  const keys = {
    "project-plan.create": ["content"], "project-plan.update": ["planId", "content"], "project-plan.ready-for-review": ["planId", "revision", "planDigest"],
    "project-plan.approve": ["planId", "revision", "planDigest", "notes"], "project-plan.reject": ["planId", "revision", "planDigest", "notes"], "project-plan.launch": ["planId", "revision", "planDigest"],
    "project-plan.clone": ["planId", "revision", "planDigest", "sourceRunId", "sourceIterationId", "baseRef"], "project-plan.fork": ["planId", "revision", "planDigest", "sourceRunId", "sourceIterationId", "baseRef"], "project-plan.archive": ["planId"]
  };
  const unknown = Object.keys(payload).filter((key) => !keys[type].includes(key));
  const missing = keys[type].filter((key) => !(key in payload));
  if (unknown.length || missing.length) throw new Error(`${type} payload fields mismatch; missing ${missing.join(", ") || "none"}; unknown ${unknown.join(", ") || "none"}.`);
  if (["project-plan.create", "project-plan.update"].includes(type)) {
    normalizePlanContent(payload.content);
    if (type === "project-plan.update" && (!payload.planId || !Number.isInteger(Number(expectedVersion)))) throw new Error("Plan update requires planId and exact expectedVersion.");
    return;
  }
  if (!payload.planId || !Number.isInteger(Number(expectedVersion))) throw new Error(`${type} requires planId and expectedVersion.`);
  if (type !== "project-plan.archive" && (!Number.isInteger(Number(payload.revision)) || !payload.planDigest)) throw new Error(`${type} requires exact revision and digest.`);
  if (type === "project-plan.reject" && !String(payload.notes || "").trim()) throw new Error("Plan rejection requires notes.");
  if (["project-plan.clone", "project-plan.fork"].includes(type) && payload.sourceRunId && typeof payload.sourceRunId !== "string") throw new Error(`${type} sourceRunId must be a string or null.`);
}

function reviewPlanAction(action) {
  if (!PROJECT_PLAN_ACTIONS.includes(action)) throw new Error(`Unknown plan action ${action}`);
  if (action === "project-plan.create") return editPlan(null);
  if (action === "project-plan.update") return editPlan(snapshot.planDetail);
  const exact = exactPlanRequest(action);
  const editableKeys = action === "project-plan.approve" || action === "project-plan.reject" ? ["notes"] : ["project-plan.clone", "project-plan.fork"].includes(action) ? ["sourceRunId", "sourceIterationId", "baseRef"] : [];
  const subject = Object.fromEntries(Object.entries(exact.payload).filter(([key]) => !editableKeys.includes(key)));
  const finish = (editable = {}) => {
    const payload = { ...subject, ...editable };
    validatePlanRequest(action, payload, exact.expectedVersion);
    pending = deepFreeze({ kind: "plan", type: action, payload: clone(payload), expectedVersion: exact.expectedVersion, idempotencyKey: intentKey(action), reviewedAt: new Date().toISOString() });
    reviewOffset = 0;
    page = "confirm";
  };
  if (editableKeys.length) openEditor(`Editable action fields / ${action}`, json(Object.fromEntries(editableKeys.map((key) => [key, exact.payload[key]]))), (value) => { const editable = JSON.parse(value); const unknown = Object.keys(editable).filter((key) => !editableKeys.includes(key)); if (unknown.length) throw new Error(`Only ${editableKeys.join(", ")} may be edited.`); finish(editable); });
  else finish();
}

function planDefaults(pipelineType = "classic") {
  return { pipelineType, title: "", problem: "", intendedUsers: "", objective: "", boundedScope: "", requirements: [], nonGoals: [], constraints: [], risks: [], repository: { path: pipelineType === "managed" ? "" : null, baseRef: pipelineType === "managed" ? "HEAD" : null, baseCommit: null }, acceptanceGates: [], validationPolicy: { id: "apb.runner-selected.v1", expectations: [], clientCommandsAllowed: false }, milestones: [], limits: planLimits(), lineage: { mode: "new", sourcePlanId: null, sourceRevision: null, sourceRunId: null, sourceIterationId: null } };
}

function editPlan(detail) {
  const content = detail?.revision?.content || planDefaults();
  openEditor(detail ? "Update engraved tectonic tablet" : "Create engraved tectonic tablet", json(content), (text) => {
    const parsed = normalizePlanContent(JSON.parse(text));
    const payload = detail ? { planId: detail.ledger.planId, content: parsed } : { content: parsed };
    const type = detail ? "project-plan.update" : "project-plan.create";
    pending = deepFreeze({ kind: "plan", type, payload: clone(payload), expectedVersion: detail?.ledger?.version, idempotencyKey: intentKey(type), reviewedAt: new Date().toISOString() });
    page = "confirm";
  });
}

function openEditor(title, value, save) {
  sceneEditor = { title, value, save, openedFrom: page };
  page = "editor";
  editorOffset = 0;
  const keyboard = $("canvasKeyboard");
  keyboard.value = value;
  if ($("semanticApp").hidden) {
    keyboard.focus({ preventScroll: true });
    keyboard.setSelectionRange(value.length, value.length);
  }
  renderer?.requestFrame();
}
function openViewer(title, value, openedFrom = page) {
  sceneEditor = { title, value, save: null, openedFrom, readOnly: true };
  editorOffset = 0;
  page = "editor";
  renderer?.requestFrame();
}

async function saveEditor() {
  if (!sceneEditor) return;
  try {
    const editor = sceneEditor;
    await editor.save(editor.value);
    sceneEditor = null;
    if (!pending) page = editor.openedFrom || "plans";
    renderSemantic();
  } catch (error) { announce(`Editor: ${error.message}`, true); }
}

function setMode(semantic, reason = "") {
  if (!semantic && (!renderer?.program || !renderer.ready || renderer.lost)) {
    semantic = true;
    reason = reason || "The 3D renderer is unavailable. Semantic control remains active.";
  }
  document.body.classList.toggle("semantic-mode", semantic);
  $("cavernMode").hidden = semantic;
  $("semanticApp").hidden = !semantic;
  $("cavernMode").inert = semantic;
  $("semanticApp").inert = !semantic;
  $("cavern").setAttribute("aria-hidden", String(semantic));
  if (semantic) {
    renderSemantic();
    $("semanticContent").focus();
    if (reason) announce(reason);
  } else {
    $("cavern").focus();
    renderer.requestFrame();
  }
}

function attempt3D() {
  if (!renderer) return announce("The 3D renderer has not initialized yet.", true);
  if (!renderer.ready && !renderer.retry()) return announce(renderer.failureReason || "The 3D renderer retry failed. Semantic control remains active.", true);
  setMode(false);
  announce("Command Cavern 3D restored in bounded performance mode. Press F to enable optional motion.");
}

function records(kind) {
  if (kind === "runs") return snapshot.runs;
  if (kind === "agents") return agents();
  if (kind === "events") return snapshot.events.slice().reverse();
  if (kind === "tools") return tools();
  if (kind === "queue") return queueItems();
  if (kind === "gates") return gates();
  if (kind === "iterations") return snapshot.iterations;
  if (kind === "audit") return arr(snapshot.audit).slice().reverse();
  return [];
}
function filteredRecords(kind) {
  const query = searchQuery.trim().toLowerCase();
  return query ? records(kind).filter((record) => json(record).toLowerCase().includes(query)) : records(kind);
}

async function selectRun(runId) {
  selectedRunId = runId;
  selectedRecord = null;
  artifactPage = 0;
  logPage = 0;
  await client.selectRun(runId);
  renderer?.requestFrame();
}

async function loadPlan(planId) {
  selectedPlanId = planId;
  try { await client.getProjectPlan(planId); } catch (error) { announce(error.message, true); }
}

async function loadResource(kind, name, runId) {
  if (!runId) return announce("Select an explicit run before loading resources.", true);
  try {
    let result;
    if (kind === "artifact") result = await client.loadArtifact(name, runId);
    else if (kind === "log") result = await client.loadLog(name, runId, { tail: 600 });
    else result = await client.loadDocument(kind, runId);
    selectedRecord = { kind, id: result.name, text: result.text, runId };
    evidenceKind = "resource";
    page = "evidence";
    announce(`${result.name} loaded from explicitly bound run ${runId}.`);
  } catch (error) { announce(`${kind}: ${error.message}`, true); }
}

function activate(action) {
  Promise.resolve().then(action).catch((error) => announce(error.message, true));
}
async function toggleClientPause() {
  if (snapshot.connection?.paused) { await client.resume(); announce("Client data resumed and reconciled. Workflow execution was not changed."); }
  else { client.pause(); announce("Client data presentation paused. Workflow execution continues."); }
}
async function toggleClientConnection() {
  if (snapshot.connection?.status === "disconnected") { await client.connect(); announce("Client transport reconnected and reconciled."); }
  else { client.disconnect(); announce("Client transport disconnected. Workflow execution continues."); }
}

// The high-resolution offscreen inscription is sampled only at SDF tablet hits.
const TABLET_TEXTURE_WIDTH = 1600;
const TABLET_TEXTURE_HEIGHT = 900;
const uiCanvas = document.createElement("canvas");
uiCanvas.width = TABLET_TEXTURE_WIDTH;
uiCanvas.height = TABLET_TEXTURE_HEIGHT;
const ui = uiCanvas.getContext("2d", { alpha: true });
const uploadCanvas = document.createElement("canvas");
const upload = uploadCanvas.getContext("2d", { alpha: true });
function prepareUploadCanvas(portrait, maximum) {
  const desired = portrait ? [900, 1600] : [TABLET_TEXTURE_WIDTH, TABLET_TEXTURE_HEIGHT];
  const scale = Math.min(1, maximum / desired[0], maximum / desired[1]);
  const width = Math.max(1, Math.floor(desired[0] * scale)), height = Math.max(1, Math.floor(desired[1] * scale));
  if (uploadCanvas.width !== width || uploadCanvas.height !== height) { uploadCanvas.width = width; uploadCanvas.height = height; }
  upload.clearRect(0, 0, width, height);
  if (portrait) {
    upload.drawImage(uiCanvas, 0, 0, 800, 900, 0, 0, width, height / 2);
    upload.drawImage(uiCanvas, 800, 0, 800, 900, 0, height / 2, width, height / 2);
  } else upload.drawImage(uiCanvas, 0, 0, width, height);
  return uploadCanvas;
}
const C = { bone: "#eee4bf", dim: "#a5ac8e", lime: "#c8f59a", amber: "#f0b65d", red: "#f08c70", ink: "#0b0e09", slab: "rgba(20,25,16,.88)", edge: "#647054", blue: "#78d9c0" };

function text(value, x, y, size = 22, color = C.bone, maxWidth = 1000, weight = "500") {
  ui.font = `${weight} ${size}px ui-monospace, monospace`;
  ui.fillStyle = color;
  ui.textBaseline = "top";
  ui.fillText(String(value), x, y, maxWidth);
}
function wrap(value, x, y, width, size = 20, color = C.bone, maxLines = 8) {
  ui.font = `500 ${size}px ui-monospace, monospace`;
  const words = String(value ?? "").replace(/\s+/g, " ").split(" ");
  let line = "", row = 0;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ui.measureText(next).width > width && line) { text(line, x, y + row * (size + 7), size, color, width); line = word; row++; if (row >= maxLines) break; }
    else line = next;
  }
  if (row < maxLines && line) text(line, x, y + row * (size + 7), size, color, width);
  return Math.min(maxLines, row + 1) * (size + 7);
}
function slab(x, y, w, h, title = "") {
  ui.fillStyle = C.slab; ui.fillRect(x, y, w, h); ui.strokeStyle = C.edge; ui.lineWidth = 2; ui.strokeRect(x, y, w, h);
  ui.strokeStyle = "rgba(200,245,154,.18)"; ui.beginPath(); ui.moveTo(x + 8, y + 2); ui.lineTo(x + w - 18, y + h - 5); ui.stroke();
  if (title) text(title.toUpperCase(), x + 18, y + 14, 16, C.lime, w - 36, "700");
}
function button(label, x, y, w, h, action, options = {}) {
  ui.fillStyle = options.active ? "rgba(160,210,115,.23)" : options.danger ? "rgba(190,90,60,.2)" : "rgba(70,82,56,.72)";
  ui.fillRect(x, y, w, h); ui.strokeStyle = options.active ? C.lime : options.danger ? C.red : C.edge; ui.strokeRect(x, y, w, h);
  text(label.toUpperCase(), x + 12, y + Math.max(7, (h - 18) / 2), options.small ? 14 : 17, options.danger ? C.red : C.bone, w - 24, "700");
  hits.push({ x, y, w, h, label, action, key: options.key || `${page}:${label}:${x}:${y}` });
}
function clipped(value, length = 34) { const string = String(value ?? "not reported"); return string.length > length ? `${string.slice(0, length - 3)}...` : string; }

function drawChrome() {
  text("COMMAND CAVERN", 48, 25, 32, C.lime, 500, "800");
  text("HERMES SUBTERRANEAN SWARM CONTROL", 49, 62, 14, C.dim, 500, "700");
  const connection = snapshot.connection?.status || "disconnected";
  text(`${connection.toUpperCase()} / ${first(snapshot.connection?.transport, "NO TRANSPORT")}`, 1050, 34, 17, connection === "connected" ? C.lime : C.amber, 500, "700");
  text(`OBSERVED ${first(snapshot.state?.phase, snapshot.state?.status, "idle").toUpperCase()} / RUN ${clipped(currentRunId() || "NONE", 22)}`, 1050, 61, 15, C.bone, 500);
  const nav = [["overview", "CORE SAMPLES"], ["operations", "MONOLITHS"], ["plans", "TABLETS"], ["evidence", "EXCAVATIONS"], ["help", "CAVE MAP"]];
  nav.forEach(([key, label], index) => button(label, 48 + index * 230, 102, 208, 47, () => { page = key; renderer.requestFrame(); }, { active: page === key, small: true }));
  button("A / SEMANTIC", 1250, 102, 302, 47, () => setMode(true), { small: true });
  text(clipped(notice, 88), 55, 858, 15, notice.includes("failed") || notice.includes("requires") ? C.red : C.dim, 850);
  button(snapshot.connection?.paused ? "RESUME DATA" : "PAUSE DATA", 930, 850, 180, 34, toggleClientPause, { small: true, key: "client:data" });
  button(snapshot.connection?.status === "disconnected" ? "RECONNECT" : "DISCONNECT", 1125, 850, 180, 34, toggleClientConnection, { small: true, key: "client:connection" });
  button("DIRECTORY", 1320, 850, 180, 34, () => location.assign("/"), { small: true, key: "route:directory" });
}

function drawOverview() {
  slab(48, 172, 430, 275, "Observed strata");
  const observed = [["workflow", first(snapshot.state?.status, "unknown")], ["phase", first(snapshot.state?.phase, "idle")], ["current run", currentRunId() || "none"], ["blocker", currentBlocker() ? clipped(first(currentBlocker().reason, currentBlocker().message, "active")) : "clear"], ["freshness", first(snapshot.connection?.lastMessageAt, snapshot.connection?.lastRefreshAt, "no sample")]];
  observed.forEach(([key, value], index) => { text(key.toUpperCase(), 70, 212 + index * 43, 14, C.dim); text(clipped(value, 35), 205, 209 + index * 43, 18, C.bone, 240); });
  slab(498, 172, 500, 275, "Requested intent / not observed completion");
  const control = snapshot.control || {};
  const requested = [["pause", control.pause?.requested ? first(control.pause.mode, "requested") : "none"], ["stop", control.stop?.requested ? first(control.stop.mode, "requested") : "none"], ["admission", first(control.runAdmission, control.desiredMode, "not reported")], ["next", control.nextRunRequest ? clipped(first(control.nextRunRequest.id, control.nextRunRequest.status)) : "none"], ["objective", clipped(first(control.currentObjective?.text, "none"), 40)]];
  requested.forEach(([key, value], index) => { text(key.toUpperCase(), 522, 212 + index * 43, 14, C.amber); text(value, 666, 209 + index * 43, 18, C.bone, 300); });
  slab(1018, 172, 534, 275, "Cavern inventory");
  const counts = [["ROCK CORES / RUNS", snapshot.runs.length, "runs"], ["SURVEY DRONES / AGENTS", agents().length, "agents"], ["MINERAL INCLUSIONS / EVENTS", snapshot.events.length, "events"], ["SEED CRYSTALS / QUEUE", queueItems().length, "queue"], ["PRESSURE LOCKS / GATES", gates().length, "gates"], ["BRANCHES / ITERATIONS", snapshot.iterations.length, "iterations"]];
  counts.forEach(([label, count, kind], index) => button(`${label}  ${count}`, 1040, 207 + index * 35, 490, 29, () => { evidenceKind = kind; page = "evidence"; renderer.requestFrame(); }, { small: true }));
  slab(48, 470, 950, 360, "Recent mineral inclusions");
  snapshot.events.slice(-8).reverse().forEach((event, index) => { text(clipped(first(event.ts, "--"), 12), 68, 510 + index * 36, 13, C.dim); text(clipped(first(event.type, event.level), 22), 192, 507 + index * 36, 16, event.level === "error" ? C.red : C.blue); text(clipped(first(event.message, event.data?.toolName, event.source), 65), 430, 507 + index * 36, 16, C.bone, 535); });
  slab(1018, 470, 534, 360, "Command receipts");
  if (!receipts.length) wrap("No commands issued in this cavern session. Server audit records remain available under Excavations.", 1042, 515, 470, 18, C.dim, 5);
  receipts.slice(-6).reverse().forEach((receipt, index) => { text(clipped(receipt.type, 28), 1040, 510 + index * 48, 16, C.bone); text(clipped(receipt.status, 20), 1320, 510 + index * 48, 15, receipt.status === "accepted intent" ? C.amber : receipt.status === "failed" ? C.red : C.dim); text(clipped(receipt.commandId || receipt.error || "no receipt", 48), 1040, 531 + index * 48, 12, C.dim); });
}

function drawOperations() {
  slab(48, 172, 500, 658, `Resonant monoliths / all ${OPERATION_COMMANDS.length}`);
  const visible = OPERATION_COMMANDS.slice(commandOffset, commandOffset + 10);
  visible.forEach((command, index) => button(`${String(commandOffset + index + 1).padStart(2, "0")}  ${command}`, 70, 215 + index * 49, 455, 39, () => { selectedCommand = command; renderer.requestFrame(); }, { active: command === selectedCommand, small: true }));
  button("PREVIOUS VEIN", 70, 728, 215, 42, () => { commandOffset = Math.max(0, commandOffset - 10); renderer.requestFrame(); });
  button("NEXT VEIN", 310, 728, 215, 42, () => { commandOffset = Math.min(20, commandOffset + 10); renderer.requestFrame(); });
  slab(570, 172, 982, 425, `Physical monolith / ${selectedCommand}`);
  text("CURRENT-RUN RECOVERY IS REVALIDATED. LINEAGE IS REBUILT FROM SOURCE.", 596, 213, 14, C.amber, 920, "700");
  const payload = commandSeed(selectedCommand);
  const preview = json(payload).split("\n").slice(0, 13);
  preview.forEach((line, index) => text(clipped(line, 100), 600, 252 + index * 22, 15, C.bone, 900));
  button("ENGRAVE PAYLOAD", 600, 548, 280, 38, () => openEditor(`Payload / ${selectedCommand}`, json(commandSeed(selectedCommand)), (value) => reviewOperation(selectedCommand, JSON.parse(value))));
  button("REVIEW DEFAULT", 900, 548, 280, 38, () => reviewOperation(selectedCommand, commandSeed(selectedCommand)));
  slab(570, 620, 982, 210, "Accepted intent versus observed state");
  const latestReceipt = receipts.at(-1);
  text("ACCEPTED INTENT", 596, 661, 14, C.amber, 200, "700"); text(clipped(latestReceipt?.status || "none", 25), 596, 690, 16, C.bone, 260);
  text("REQUESTED PROJECTION", 895, 661, 14, C.blue, 230, "700"); text(clipped(latestReceipt?.projectedState ? "available / not observed" : "none", 28), 895, 690, 16, C.bone, 270);
  text("AUTHORITATIVE OBSERVED", 1190, 661, 14, C.lime, 300, "700"); text(`${first(snapshot.state?.status, "unknown")} / ${first(snapshot.state?.phase, "idle")}`, 1190, 690, 16, C.bone, 320);
  wrap("Acceptance, requested control projection, and observed process telemetry are separate. Operator-command events and audit acceptance never promote intent to observed completion.", 596, 735, 900, 15, C.dim, 3);
}

function drawPlans() {
  slab(48, 172, 490, 658, `Engraved tectonic tablets / ${snapshot.plans.length}`);
  button("NEW TABLET", 70, 210, 210, 38, () => reviewPlanAction("project-plan.create"));
  button("ASSISTANCE", 300, 210, 215, 38, async () => { const result = await client.listPlanAssistance(); const firstThread = snapshot.assistanceDetail?.id || arr(result?.items)[0]?.id; if (firstThread && !snapshot.assistanceDetail) await client.getPlanAssistance(firstThread); page = "assistance"; renderer.requestFrame(); });
  const planRows = snapshot.plans.slice(planPage * 9, planPage * 9 + 9);
  planRows.forEach((plan, index) => button(`${clipped(first(plan.title, plan.planId), 29)} / ${first(plan.state, "draft")}`, 70, 265 + index * 48, 445, 38, () => loadPlan(plan.planId), { active: plan.planId === selectedPlanId, small: true }));
  button("< TABLETS", 70, 705, 205, 34, () => { planPage = Math.max(0, planPage - 1); renderer.requestFrame(); }, { small: true });
  button("TABLETS >", 300, 705, 215, 34, () => { planPage = Math.min(Math.max(0, Math.ceil(snapshot.plans.length / 9) - 1), planPage + 1); renderer.requestFrame(); }, { small: true });
  slab(560, 172, 992, 315, "Exact revision ledger");
  const detail = snapshot.planDetail;
  if (!detail) wrap("Select a persisted tablet. Every consequential action binds exact plan ID, revision, digest, and expected ledger version.", 590, 220, 900, 20, C.dim, 5);
  else {
    const ledger = detail.ledger, revision = detail.revision;
    [["PLAN", ledger.planId], ["STATE", ledger.state], ["REVISION", first(revision.revision, ledger.currentRevision)], ["DIGEST", first(revision.contentDigest, ledger.currentDigest)], ["EXPECTED VERSION", ledger.version]].forEach(([key, value], index) => { text(key, 590, 215 + index * 46, 14, C.dim); text(clipped(value, 68), 790, 211 + index * 46, 18, C.bone, 720); });
    button("VIEW COMPLETE CONTENT", 970, 438, 270, 36, () => openViewer(`Exact plan revision ${first(revision.revision, ledger.currentRevision)}`, json(revision.content), "plans"), { small: true });
    button("DECISIONS / LAUNCHES", 1250, 438, 270, 36, () => { page = "plan-history"; planHistoryPage = 0; renderer.requestFrame(); }, { small: true });
  }
  slab(560, 510, 992, 320, `All ${PROJECT_PLAN_ACTIONS.length} project-plan actions`);
  PROJECT_PLAN_ACTIONS.forEach((action, index) => {
    const column = index % 3, row = Math.floor(index / 3);
    button(action.replace("project-plan.", ""), 590 + column * 305, 555 + row * 65, 280, 48, () => reviewPlanAction(action), { danger: ["project-plan.reject", "project-plan.launch", "project-plan.archive"].includes(action), small: true });
  });
}

function drawPlanHistory() {
  slab(48, 172, 1504, 658, `Exact plan history / ${selectedPlanId || "no plan"}`);
  button("BACK TO TABLET", 72, 212, 220, 38, () => { page = "plans"; renderer.requestFrame(); });
  button("DECISIONS", 315, 212, 200, 38, () => { planHistoryKind = "decisions"; planHistoryPage = 0; renderer.requestFrame(); }, { active: planHistoryKind === "decisions" });
  button("LAUNCHES", 535, 212, 200, 38, () => { planHistoryKind = "launches"; planHistoryPage = 0; renderer.requestFrame(); }, { active: planHistoryKind === "launches" });
  button(`SEARCH: ${clipped(searchQuery || "ALL", 30)}`, 760, 212, 450, 38, () => openEditor("Search plan decisions and launches", searchQuery, (value) => { searchQuery = value.trim(); planHistoryPage = 0; page = "plan-history"; }), { small: true });
  const source = arr(snapshot.planDetail?.[planHistoryKind]);
  const query = searchQuery.toLowerCase();
  const filtered = query ? source.filter((item) => json(item).toLowerCase().includes(query)) : source;
  filtered.slice(planHistoryPage * 10, planHistoryPage * 10 + 10).forEach((item, index) => button(`${clipped(first(item.decisionId, item.launchId, item.id, `record-${index + 1}`), 34)} / ${clipped(first(item.decision, item.status, item.state, "recorded"), 24)}`, 72, 280 + index * 44, 720, 34, () => openViewer(`${planHistoryKind} complete record`, json(item), "plan-history"), { small: true }));
  const selectedPage = filtered.slice(planHistoryPage * 10, planHistoryPage * 10 + 10);
  selectedPage.forEach((item, index) => { text(clipped(first(item.planDigest, item.recordDigest, item.requestId, item.approvalId, "no digest"), 58), 830, 285 + index * 44, 14, C.dim, 650); });
  button("< HISTORY", 72, 750, 220, 38, () => { planHistoryPage = Math.max(0, planHistoryPage - 1); renderer.requestFrame(); });
  button("HISTORY >", 315, 750, 220, 38, () => { planHistoryPage = Math.min(Math.max(0, Math.ceil(filtered.length / 10) - 1), planHistoryPage + 1); renderer.requestFrame(); });
  text(`${filtered.length} ${planHistoryKind} / page ${planHistoryPage + 1}`, 570, 760, 15, C.dim);
}

function drawAssistance() {
  slab(48, 172, 500, 658, `Planning assistance / ${snapshot.assistance.length} threads`);
  button("BACK TO TABLETS", 70, 210, 210, 38, () => { page = "plans"; renderer.requestFrame(); });
  button("NEW CLASSIC", 300, 210, 105, 38, () => client.createPlanAssistance("classic"), { small: true });
  button("NEW MANAGED", 410, 210, 115, 38, () => client.createPlanAssistance("managed"), { small: true });
  snapshot.assistance.slice(assistancePage * 9, assistancePage * 9 + 9).forEach((thread, index) => button(`${thread.pipelineType} / ${thread.messageCount} turns${thread.hasProposal ? " / proposal" : ""}`, 70, 270 + index * 43, 455, 33, () => client.getPlanAssistance(thread.id), { active: snapshot.assistanceDetail?.id === thread.id, small: true }));
  button("< THREADS", 70, 680, 210, 34, () => { assistancePage = Math.max(0, assistancePage - 1); renderer.requestFrame(); }, { small: true });
  button("THREADS >", 305, 680, 220, 34, () => { assistancePage = Math.min(Math.max(0, Math.ceil(snapshot.assistance.length / 9) - 1), assistancePage + 1); renderer.requestFrame(); }, { small: true });
  slab(570, 172, 982, 658, "Versioned conversation / inert proposal");
  const detail = snapshot.assistanceDetail;
  if (!detail) return wrap("Select or create a planning-assistance thread. Assistance can propose content but cannot save, approve, launch, or execute it.", 600, 225, 900, 20, C.dim, 6);
  text(`THREAD ${clipped(detail.id, 44)} / VERSION ${detail.version} / ${detail.pipelineType}`, 600, 215, 16, C.amber, 900, "700");
  const messages = arr(detail.messages), messageOffset = listPage * 5;
  messages.slice(messageOffset, messageOffset + 5).forEach((message, index) => { text(String(first(message.role, message.author, "message")).toUpperCase(), 600, 260 + index * 82, 13, C.lime, 150, "700"); wrap(first(message.content, message.text, json(message)), 755, 257 + index * 82, 745, 15, C.bone, 3); });
  button("< MESSAGES", 600, 680, 200, 34, () => { listPage = Math.max(0, listPage - 1); renderer.requestFrame(); }, { small: true });
  button("MESSAGES >", 820, 680, 210, 34, () => { listPage = Math.min(Math.max(0, Math.ceil(messages.length / 5) - 1), listPage + 1); renderer.requestFrame(); }, { small: true });
  button("MESSAGE ACTIVE", 600, 745, 260, 42, () => openEditor(`Planning message / v${detail.version}`, "", async (value) => { if (!value.trim()) throw new Error("A planning message is required."); await client.messagePlanAssistance(detail.id, detail.version, value); announce("Versioned planning message sent; proposal remains inert."); }), { small: true });
  button("VIEW PROPOSAL", 880, 745, 260, 42, () => { if (!detail.proposedContent) throw new Error("This thread has no proposal."); openViewer("Complete inert planning proposal", json(detail.proposedContent), "assistance"); }, { small: true });
  button("PROPOSAL TO DRAFT", 1160, 745, 360, 42, () => { if (!detail.proposedContent) throw new Error("This thread has no proposal."); openEditor("Proposal to persisted draft", json(detail.proposedContent), (value) => { pending = deepFreeze({ kind: "plan", type: "project-plan.create", payload: { content: normalizePlanContent(JSON.parse(value)) }, idempotencyKey: intentKey("project-plan.create"), reviewedAt: new Date().toISOString() }); page = "confirm"; }); }, { small: true });
}

function drawEvidence() {
  const kinds = [["runs", "ROCK CORES"], ["agents", "DRONES"], ["events", "INCLUSIONS"], ["tools", "TOOLS"], ["queue", "SEEDS"], ["gates", "LOCKS"], ["iterations", "BRANCHES"], ["audit", "AUDIT"]];
  kinds.forEach(([kind, label], index) => button(label, 48 + index * 188, 174, 172, 39, () => { evidenceKind = kind; selectedRecord = null; listPage = 0; renderer.requestFrame(); }, { active: evidenceKind === kind, small: true }));
  slab(48, 232, 665, 598, evidenceKind === "resource" ? "Bound resource inscription" : `${evidenceKind} / authoritative records`);
  button(`SEARCH: ${clipped(searchQuery || "ALL", 24)}`, 48, 217, 310, 30, () => openEditor("Search all visible evidence", searchQuery, (value) => { searchQuery = value.trim(); listPage = 0; page = "evidence"; }), { small: true });
  if (evidenceKind === "resource") {
    text(`${selectedRecord?.kind?.toUpperCase()} / RUN ${clipped(selectedRecord?.runId, 30)}`, 72, 275, 16, C.amber, 600, "700");
    const resourceLines = String(selectedRecord?.text || "").split("\n");
    resourceLines.slice(listPage * 20, listPage * 20 + 20).forEach((line, index) => text(`${String(listPage * 20 + index + 1).padStart(4, "0")} ${clipped(line, 68)}`, 72, 310 + index * 21, 14, C.bone, 610));
    button("< CONTENT", 72, 750, 190, 32, () => { listPage = Math.max(0, listPage - 1); renderer.requestFrame(); }, { small: true });
    button("CONTENT >", 282, 750, 190, 32, () => { listPage = Math.min(Math.max(0, Math.ceil(resourceLines.length / 20) - 1), listPage + 1); renderer.requestFrame(); }, { small: true });
    button("FULL CONTENT", 492, 750, 195, 32, () => openViewer(`${selectedRecord.kind} / ${selectedRecord.id}`, selectedRecord.text, "evidence"), { small: true });
  } else {
    const visible = filteredRecords(evidenceKind).slice(listPage * 10, listPage * 10 + 10);
    visible.forEach((record, index) => button(`${clipped(idOf(record), 24)}  ${clipped(first(record.status, record.state, record.type, record.level, record.objective), 30)}`, 70, 275 + index * 42, 620, 32, async () => { selectedRecord = { kind: evidenceKind, data: record }; if (evidenceKind === "runs") await selectRun(idOf(record)); if (evidenceKind === "iterations") await client.selectIteration(idOf(record)); renderer.requestFrame(); }, { small: true }));
    button("< RECORDS", 70, 708, 220, 32, () => { listPage = Math.max(0, listPage - 1); renderer.requestFrame(); }, { small: true });
    button("RECORDS >", 310, 708, 220, 32, () => { listPage = Math.min(Math.max(0, Math.ceil(filteredRecords(evidenceKind).length / 10) - 1), listPage + 1); renderer.requestFrame(); }, { small: true });
    if (selectedRecord?.data) {
      text("SELECTED DETAIL", 70, 760, 13, C.lime, 180, "700");
      text(clipped(json(selectedRecord.data).replace(/\s+/g, " "), 72), 230, 757, 14, C.bone, 450);
      button("FULL DETAIL", 520, 752, 170, 30, () => openViewer(`${evidenceKind} complete detail`, json(selectedRecord.data), "evidence"), { small: true });
    }
  }
  slab(735, 232, 817, 598, "Bound run resources / SPEC / DEVPLAN / logs");
  text(`RESOURCE RUN: ${clipped(selectedRunId || snapshot.selectedRunId || "none", 50)}`, 760, 275, 17, C.amber, 745, "700");
  const runId = selectedRunId || snapshot.selectedRunId;
  button("LOAD RUN BINDING", 760, 310, 235, 38, () => { if (!runId) throw new Error("Select a run."); return client.selectRun(runId); });
  button("SPEC", 1015, 310, 150, 38, () => loadResource("spec", "SPEC", runId));
  button("DEVPLAN", 1185, 310, 150, 38, () => loadResource("devplan", "DEVPLAN", runId));
  const query = searchQuery.toLowerCase();
  const allArtifacts = arr(resources().artifacts).filter((item) => !query || itemName(item).toLowerCase().includes(query));
  const allLogs = arr(resources().logs).filter((item) => !query || itemName(item).toLowerCase().includes(query));
  const artifacts = allArtifacts.slice(artifactPage * 7, artifactPage * 7 + 7), logs = allLogs.slice(logPage * 7, logPage * 7 + 7);
  text("ARTIFACT VEINS", 760, 375, 15, C.lime, 300, "700");
  artifacts.forEach((item, index) => button(clipped(itemName(item), 44), 760, 405 + index * 42, 350, 32, () => loadResource("artifact", itemName(item), runId), { small: true }));
  text("LOG ECHOES", 1150, 375, 15, C.lime, 300, "700");
  logs.forEach((item, index) => button(clipped(itemName(item), 38), 1150, 405 + index * 42, 350, 32, () => loadResource("log", itemName(item), runId), { small: true }));
  button("< ARTIFACTS", 760, 710, 165, 30, () => { artifactPage = Math.max(0, artifactPage - 1); renderer.requestFrame(); }, { small: true });
  button("ARTIFACTS >", 940, 710, 170, 30, () => { artifactPage = Math.min(Math.max(0, Math.ceil(allArtifacts.length / 7) - 1), artifactPage + 1); renderer.requestFrame(); }, { small: true });
  button("< LOGS", 1150, 710, 165, 30, () => { logPage = Math.max(0, logPage - 1); renderer.requestFrame(); }, { small: true });
  button("LOGS >", 1330, 710, 170, 30, () => { logPage = Math.min(Math.max(0, Math.ceil(allLogs.length / 7) - 1), logPage + 1); renderer.requestFrame(); }, { small: true });
  wrap("Every resource request is explicitly bound to the displayed run. Search and pages include all artifact and log names.", 760, 760, 730, 14, C.dim, 2);
}

function drawHelp() {
  slab(48, 172, 720, 658, "Cave map / keyboard and picking");
  const help = ["Arrow keys: move among engraved hit regions", "Enter or Space: activate focused engraving", "1-5: Core Samples, Monoliths, Tablets, Excavations, Cave Map", "A: switch to synchronized semantic application", "?: open this cave map", "F: freeze or resume nonessential drone/mineral motion", "R: refresh all authoritative telemetry", "Escape: cancel editor or command review", "Pointer/touch: ray-region pick engraved surfaces", "Editor: type normally; Ctrl+Enter saves; Escape cancels"];
  help.forEach((line, index) => text(line, 76, 220 + index * 47, 18, index < 5 ? C.bone : C.dim, 650));
  slab(790, 172, 762, 658, "Geology and authority");
  wrap("Runs are stratified rock cores. Agents are bioluminescent survey drones. Events and tool calls are mineral inclusions. Queue items are seed crystals. Gates are pressure locks. Iterations are branching excavations. Plans are engraved tectonic tablets. Commands are physical resonant monoliths.", 820, 220, 700, 19, C.bone, 8);
  wrap("Scene positions, colors, depth, and pulse are presentation only. Text is generated from the shared client snapshot. Accepted intent is always separated from observed state. Recovery is current-run only after refresh. Historical work continues through complete lineage.", 820, 440, 700, 18, C.amber, 8);
  wrap(`Coverage assertion: ${OPERATION_COMMANDS.length} of 30 operation commands; ${PROJECT_PLAN_ACTIONS.length} of 9 project-plan actions; assistance and proposal-to-draft; runs, agents, events, tools, resources, logs, SPEC, DEVPLAN, audit, iterations, queue, and gates.`, 820, 655, 700, 17, C.lime, 6);
}

function drawEditor() {
  slab(48, 172, 1504, 658, sceneEditor?.title || "Engraving editor");
  text(sceneEditor?.readOnly ? "COMPLETE READ-ONLY INSCRIPTION / ESC TO CLOSE" : "CANVAS EDITOR / CTRL+ENTER TO SAVE / ESC TO CANCEL", 76, 212, 15, C.amber, 900, "700");
  const rows = String(sceneEditor?.value || "").split("\n");
  rows.slice(editorOffset, editorOffset + 23).forEach((line, index) => text(`${String(editorOffset + index + 1).padStart(3, "0")} ${clipped(line, 140)}`, 78, 250 + index * 22, 15, C.bone, 1400));
  text(`LINES ${editorOffset + 1}-${Math.min(rows.length, editorOffset + 23)} OF ${rows.length}`, 76, 770, 14, C.dim);
  button("< LINES", 600, 770, 180, 42, () => { editorOffset = Math.max(0, editorOffset - 20); renderer.requestFrame(); });
  button("LINES >", 800, 770, 180, 42, () => { editorOffset = Math.min(Math.max(0, rows.length - 1), editorOffset + 20); renderer.requestFrame(); });
  if (!sceneEditor?.readOnly) button("SAVE ENGRAVING", 1080, 770, 220, 42, saveEditor);
  button(sceneEditor?.readOnly ? "CLOSE" : "CANCEL", 1320, 770, 200, 42, () => { page = sceneEditor?.openedFrom || "operations"; sceneEditor = null; $("cavern").focus(); renderer.requestFrame(); }, { danger: !sceneEditor?.readOnly });
}

function drawConfirm() {
  slab(185, 172, 1230, 658, "Resonance chamber / consequential review");
  text(`${pending?.type || "NO REQUEST"}`, 225, 220, 27, C.amber, 1100, "800");
  wrap("This exact payload requests control-plane intent. Acceptance does not prove observed completion. Recheck the displayed workflow, run, event, audit, gate, queue, or plan ledger afterward.", 225, 270, 1120, 19, C.bone, 5);
  if (pending?.collateralImpact) text(`CLEAR QUEUE COLLATERAL: ${clipped(json(pending.collateralImpact).replace(/\s+/g, " "), 105)}`, 225, 355, 14, C.red, 1120, "700");
  const allLines = json({ type: pending?.type, payload: pending?.payload, expectedVersion: pending?.expectedVersion, idempotencyKey: pending?.idempotencyKey }).split("\n");
  const preview = allLines.slice(reviewOffset, reviewOffset + 17);
  preview.forEach((line, index) => text(`${String(reviewOffset + index + 1).padStart(3, "0")} ${clipped(line, 115)}`, 230, 395 + index * 20, 14, C.dim, 1080));
  button("< PAYLOAD", 225, 750, 210, 42, () => { reviewOffset = Math.max(0, reviewOffset - 15); renderer.requestFrame(); });
  button("PAYLOAD >", 455, 750, 210, 42, () => { reviewOffset = Math.min(Math.max(0, allLines.length - 1), reviewOffset + 15); renderer.requestFrame(); });
  button("CANCEL / NO MUTATION", 730, 760, 300, 48, () => { pending = null; page = "operations"; renderer.requestFrame(); });
  button("CONFIRM INTENT", 1050, 760, 320, 48, dispatchPending, { danger: true });
}

function drawUi() {
  const previousFocusKey = renderer?.focusedKey;
  hits.length = 0;
  ui.save();
  ui.setTransform(1, 0, 0, 1, 0, 0);
  ui.clearRect(0, 0, 1600, 900);
  ui.fillStyle = "rgba(7,10,6,.16)"; ui.fillRect(0, 0, 1600, 900);
  drawChrome();
  if (page === "overview") drawOverview();
  else if (page === "operations") drawOperations();
  else if (page === "plans") drawPlans();
  else if (page === "plan-history") drawPlanHistory();
  else if (page === "assistance") drawAssistance();
  else if (page === "evidence") drawEvidence();
  else if (page === "help") drawHelp();
  else if (page === "editor") drawEditor();
  else if (page === "confirm") drawConfirm();
  const keyedIndex = previousFocusKey ? hits.findIndex((hit) => hit.key === previousFocusKey) : -1;
  if (keyedIndex >= 0) renderer.focusedHit = keyedIndex;
  if (renderer?.focusedHit >= hits.length) renderer.focusedHit = Math.max(0, hits.length - 1);
  const focus = hits[renderer?.focusedHit || 0];
  if (renderer && focus) renderer.focusedKey = focus.key;
  if (focus) { ui.strokeStyle = C.lime; ui.lineWidth = 3; ui.strokeRect(focus.x - 3, focus.y - 3, focus.w + 6, focus.h + 6); }
  ui.restore();
}

class CavernRenderer {
  constructor(canvas) {
    this.canvas = canvas; this.gl = null; this.program = null; this.texture = null; this.vao = null; this.frame = 0; this.animationTimer = 0; this.hidden = document.hidden; this.lost = false; this.ready = false; this.failureReason = ""; this.focusedHit = 0; this.focusedKey = null; this.uiDirty = true;
    this.textureWidth = 0; this.textureHeight = 0; this.quality = innerWidth < 700 ? 0.38 : 0.45; this.steps = innerWidth < 700 ? 18 : 22; this.start = performance.now();
    this.bind(); this.initialize();
  }
  shader(type, source, label) {
    const gl = this.gl, shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { const message = gl.getShaderInfoLog(shader) || `${label} shader compilation failed`; gl.deleteShader(shader); throw new Error(message); }
    return shader;
  }
  fail(message) { this.ready = false; this.failureReason = message; clearTimeout(this.animationTimer); this.animationTimer = 0; setMode(true, message); return false; }
  retry() {
    if (this.lost || this.gl?.isContextLost?.()) { this.failureReason = "The WebGL context is still lost; wait for browser restoration or reload the page."; return false; }
    this.quality = Math.min(this.quality, 0.38); this.steps = 18; this.uiDirty = true;
    try { return this.initialize(); } catch (error) { return this.fail(`WebGL retry failed: ${error.message}`); }
  }
  initialize() {
    const gl = this.canvas.getContext("webgl2", { antialias: false, alpha: true, depth: false, powerPreference: "high-performance" });
    if (!gl) return this.fail("WebGL2 is unavailable. The synchronized semantic application is active.");
    this.gl = gl;
    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    if (!Number.isInteger(this.maxTextureSize) || this.maxTextureSize < 1024) return this.fail(`WebGL MAX_TEXTURE_SIZE ${this.maxTextureSize || "unknown"} is insufficient for the command tablet.`);
    const vs = `#version 300 es
      precision highp float; const vec2 P[3]=vec2[3](vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.));
      void main(){gl_Position=vec4(P[gl_VertexID],0.,1.);}`;
    const fs = `#version 300 es
      precision highp float; out vec4 outColor; uniform vec2 uRes; uniform vec2 uTabletHalf; uniform float uCameraZ; uniform float uTime; uniform float uMotion; uniform int uSteps; uniform sampler2D uUi; uniform vec4 uCounts; uniform vec4 uMore; uniform vec4 uState;
      float hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
      float box(vec3 p,vec3 b){vec3 q=abs(p)-b;return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.);}
      float sphere(vec3 p,float r){return length(p)-r;} float torus(vec3 p,vec2 t){vec2 q=vec2(length(p.xz)-t.x,p.y);return length(q)-t.y;}
      float octa(vec3 p,float s){p=abs(p);return (p.x+p.y+p.z-s)*.57735027;}
      float capsule(vec3 p,vec3 a,vec3 b,float r){vec3 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.);return length(pa-ba*h)-r;}
      vec2 take(vec2 current,float distance,float material){return distance<current.x?vec2(distance,material):current;}
      vec2 scene(vec3 p){float rock=7.2-length(p-vec3(0.,.15,1.2))+.08*sin(p.x*2.7)*sin(p.y*3.1)*sin(p.z*2.3);vec2 r=vec2(rock,1.);
        r=take(r,p.y+2.3+.08*sin(p.x*1.7)*sin(p.z*1.2),1.);
        for(int i=0;i<2;i++){float fi=float(i);if(fi>=min(uCounts.x,2.))break;float side=mod(fi,2.)<.5?-1.:1.;vec3 q=p-vec3(side*3.9,-1.2+fi*.5,1.35);float core=max(length(q.xz)-(.2+.03*fi),abs(q.y)-.58);r=take(r,core,2.);}
        for(int i=0;i<2;i++){float fi=float(i);if(fi>=min(uCounts.y,2.))break;float a=fi*3.14+uTime*.12*uMotion;vec3 center=vec3(cos(a)*3.7,.9+sin(a*1.7)*.28,1.35+sin(a)*.25);r=take(r,sphere(p-center,.09),3.);}
        for(int i=0;i<2;i++){float fi=float(i);if(fi>=min(uCounts.z,2.))break;vec3 q=p-vec3(-2.1+fi*4.2,1.9,1.6);r=take(r,sphere(q,.065),8.);}
        for(int i=0;i<2;i++){float fi=float(i);if(fi>=min(uCounts.w,2.))break;vec3 q=p-vec3(3.75,-1.7+fi*.5,.45);r=take(r,octa(q,.18),4.);}
        for(int i=0;i<2;i++){float fi=float(i);if(fi>=min(uMore.x,2.))break;vec3 q=p-vec3(-1.3+fi*2.6,2.05,1.55);r=take(r,abs(torus(q.xzy,vec2(.32,.045)))-.008,5.);}
        for(int i=0;i<2;i++){float fi=float(i);if(fi>=min(uMore.y,2.))break;vec3 a=vec3(-1.3+fi*2.6,-2.05,1.5),b=a+vec3((fi-.5)*.55,.65,.3);r=take(r,capsule(p,a,b,.045),9.);}
        for(int i=0;i<2;i++){float fi=float(i);if(fi>=min(uMore.z,2.))break;vec3 q=p-vec3(3.8,.35+fi*.65,1.3);r=take(r,box(q,vec3(.2,.13,.045)),10.);}
        vec3 tablet=p-vec3(0.,.05,.55);r=take(r,box(tablet,vec3(uTabletHalf,.10)),6.);
        for(int i=0;i<2;i++){float fi=float(i);vec3 q=p-vec3(-1.2+fi*2.4,-2.02,1.2);r=take(r,box(q,vec3(.11,.42+.05*fi,.11)),7.);}return r;}
      vec3 normal(vec3 p){vec2 e=vec2(.002,0.);float d=scene(p).x;return normalize(vec3(scene(p+e.xyy).x-d,scene(p+e.yxy).x-d,scene(p+e.yyx).x-d));}
      void main(){vec2 uv=(gl_FragCoord.xy-.5*uRes)/uRes.y;vec3 ro=vec3(0.,.05,uCameraZ),rd=normalize(vec3(uv,1.42));float travel=0.,mat=0.;bool hit=false;vec3 p=ro;
        for(int i=0;i<144;i++){if(i>=uSteps)break;p=ro+rd*travel;vec2 h=scene(p);if(h.x<.0018){mat=h.y;hit=true;break;}travel+=max(.006,h.x*.68);if(travel>18.)break;}
        vec3 col=vec3(.008,.012,.007);if(hit){vec3 n=normal(p),light=normalize(vec3(-.5,.8,-.45));float dif=max(.06,dot(n,light));float strata=.7+.3*sin(p.y*24.+sin(p.x*3.)*2.);vec3 base=vec3(.13,.14,.10)*strata;
          if(mat==2.)base=mix(vec3(.32,.24,.14),vec3(.55,.25,.15),uState.x)*strata;if(mat==3.)base=mix(vec3(.25,1.,.58),vec3(1.,.22,.12),uState.y)*(1.1+.25*sin(uTime*3.*uMotion));if(mat==4.)base=mix(vec3(.8,.45,.12),vec3(.55,1.,.3),uState.z);if(mat==5.)base=mix(vec3(.75,.52,.2),vec3(.9,.25,.1),max(uState.x,uState.w));if(mat==6.)base=vec3(.20,.22,.15);if(mat==7.)base=vec3(.28,.18,.09);if(mat==8.)base=mix(vec3(.28,.75,.62),vec3(1.,.24,.12),uState.y);if(mat==9.)base=vec3(.42,.32,.2);if(mat==10.)base=vec3(.38,.3,.18);col=base*dif+base*.16/(.2+travel*travel*.03);col*=1.-.18*hash(floor(p*18.));
          if(mat==6.){vec3 lp=p-vec3(0.,.05,.55);vec2 panel=vec2(lp.x/(2.*uTabletHalf.x)+.5,.5-lp.y/(2.*uTabletHalf.y));bool front=abs(lp.z+.10)<.025;bool inside=all(greaterThanEqual(panel,vec2(0.)))&&all(lessThanEqual(panel,vec2(1.)));if(front&&inside){vec4 ink=texture(uUi,panel);float chipped=smoothstep(.01,.035,min(min(panel.x,panel.y),min(1.-panel.x,1.-panel.y)));col=mix(col,ink.rgb,ink.a*chipped*.97);}}}
        col+=vec3(.035,.05,.025)*pow(max(0.,1.-length(uv)),4.);outColor=vec4(pow(max(col,0.),vec3(.84)),1.);}`;
    let vertex, fragment, program;
    try {
      vertex = this.shader(gl.VERTEX_SHADER, vs, "vertex"); fragment = this.shader(gl.FRAGMENT_SHADER, fs, "fragment"); program = gl.createProgram();
      gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "WebGL program link failed");
    } catch (error) { if (vertex) gl.deleteShader(vertex); if (fragment) gl.deleteShader(fragment); if (program) gl.deleteProgram(program); return this.fail(`WebGL compiler failure: ${error.message}`); }
    gl.deleteShader(vertex); gl.deleteShader(fragment);
    if (this.program) gl.deleteProgram(this.program); if (this.texture) gl.deleteTexture(this.texture); if (this.vao) gl.deleteVertexArray(this.vao);
    this.program = program; this.vao = gl.createVertexArray(); this.texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.texture); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.locations = Object.fromEntries(["uRes", "uTabletHalf", "uCameraZ", "uTime", "uMotion", "uSteps", "uUi", "uCounts", "uMore", "uState"].map((name) => [name, gl.getUniformLocation(program, name)]));
    drawUi();
    const initialSource = prepareUploadCanvas(this.isPortrait(this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight)), this.maxTextureSize);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, initialSource);
    const allocationError = gl.getError();
    if (allocationError !== gl.NO_ERROR) return this.fail(`Command tablet texture allocation failed with WebGL error 0x${allocationError.toString(16)}.`);
    this.textureWidth = initialSource.width; this.textureHeight = initialSource.height; this.ready = !gl.isContextLost(); this.failureReason = ""; this.uiDirty = false; this.requestFrame(); return this.ready;
  }
  bind() {
    this.canvas.addEventListener("pointerdown", (event) => this.pick(event));
    this.canvas.addEventListener("webglcontextlost", (event) => { event.preventDefault(); this.lost = true; this.ready = false; cancelAnimationFrame(this.frame); clearTimeout(this.animationTimer); this.frame = 0; this.animationTimer = 0; setMode(true, "WebGL context lost. Semantic control remains live while recovery recompiles all resources."); });
    this.canvas.addEventListener("webglcontextrestored", () => { this.lost = false; if (this.initialize() && this.ready) announce("WebGL context recovered; shaders, texture, VAO, and tablet projection are ready."); else announce("WebGL recovery did not become ready. Semantic mode remains authoritative.", true); });
    document.addEventListener("visibilitychange", () => { this.hidden = document.hidden; if (this.hidden) { cancelAnimationFrame(this.frame); clearTimeout(this.animationTimer); this.frame = 0; this.animationTimer = 0; } else this.requestFrame(); });
    new ResizeObserver(() => this.requestFrame()).observe(this.canvas);
  }
  pick(event) {
    const rect = this.canvas.getBoundingClientRect(), aspect = rect.width / Math.max(1, rect.height), portrait = this.isPortrait(aspect), tablet = this.tabletHalf(aspect), cameraZ = this.cameraZ(aspect);
    const screen = [(event.clientX - rect.left - rect.width * .5) / rect.height, (rect.height * .5 - (event.clientY - rect.top)) / rect.height];
    const length = Math.hypot(screen[0], screen[1], 1.42), rd = [screen[0] / length, screen[1] / length, 1.42 / length];
    const distance = (.45 - cameraZ) / rd[2], point = [rd[0] * distance, .05 + rd[1] * distance];
    const panel = [point[0] / (2 * tablet[0]) + .5, .5 - (point[1] - .05) / (2 * tablet[1])];
    if (distance <= 0 || panel.some((value) => value < 0 || value > 1)) return announce("That ray missed the tectonic command surface.");
    const x = portrait ? (panel[1] < .5 ? panel[0] * 800 : 800 + panel[0] * 800) : panel[0] * 1600;
    const y = portrait ? (panel[1] < .5 ? panel[1] * 1800 : (panel[1] - .5) * 1800) : panel[1] * 900;
    const index = hits.findIndex((hit) => x >= hit.x && x <= hit.x + hit.w && y >= hit.y && y <= hit.y + hit.h);
    if (index >= 0) { this.focusedHit = index; this.focusedKey = hits[index].key; activate(hits[index].action); } else announce("No engraving at that ray. Use arrow keys to move among active surfaces.");
  }
  isPortrait(aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight)) { return aspect < 1; }
  tabletHalf(aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight)) {
    if (!this.isPortrait(aspect)) return [3.25, 1.83];
    const distance = .45 - this.cameraZ(aspect), halfWidth = Math.min(1.5, distance * aspect / 1.42 * .9);
    return [halfWidth, halfWidth * (1600 / 900)];
  }
  cameraZ(aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight)) { return this.isPortrait(aspect) ? -5.6 : -5.2; }
  resize() {
    const clientWidth = Math.max(1, this.canvas.clientWidth), clientHeight = Math.max(1, this.canvas.clientHeight), dpr = Math.min(1.25, Math.max(1, devicePixelRatio || 1)), requested = Math.min(.65, Math.max(.4, this.quality)) * dpr;
    const pixelScale = Math.sqrt(500_000 / (clientWidth * clientHeight));
    const uniformScale = Math.min(requested, pixelScale, 1600 / clientWidth, 1200 / clientHeight);
    const width = Math.max(1, Math.round(clientWidth * uniformScale)), height = Math.max(1, Math.round(clientHeight * uniformScale));
    if (width !== this.canvas.width || height !== this.canvas.height) { this.canvas.width = width; this.canvas.height = height; }
  }
  requestFrame(redrawUi = true) { if (redrawUi) { this.uiDirty = true; clearTimeout(this.animationTimer); this.animationTimer = 0; } if (!this.frame && !this.hidden && !this.lost && this.ready && this.program && !$("cavernMode").hidden) this.frame = requestAnimationFrame((time) => this.render(time)); }
  render(time) {
    this.frame = 0; if (this.hidden || this.lost || !this.ready || !this.program) return; const gl = this.gl; this.resize();
    gl.viewport(0, 0, this.canvas.width, this.canvas.height); gl.useProgram(this.program); gl.bindVertexArray(this.vao); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.texture);
    const aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight), tablet = this.tabletHalf(aspect);
    if (this.uiDirty) {
      drawUi(); const textureSource = prepareUploadCanvas(this.isPortrait(aspect), this.maxTextureSize); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); if (textureSource.width === this.textureWidth && textureSource.height === this.textureHeight) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, textureSource); else { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textureSource); this.textureWidth = textureSource.width; this.textureHeight = textureSource.height; }
      const allocationError = gl.getError();
      if (allocationError !== gl.NO_ERROR) { this.fail(`Command tablet texture allocation failed with WebGL error 0x${allocationError.toString(16)}.`); return; }
      this.uiDirty = false;
    }
    const agentRows = agents(), queueRows = queueItems(), gateRows = gates();
    const unhealthy = agentRows.filter((item) => /error|fail|block|stopp/i.test(String(item.status))).length + snapshot.events.slice(-30).filter((event) => event.level === "error").length;
    const pinned = queueRows.filter((item) => item.status === "pinned" || item.id === snapshot.control?.pinnedQueueItemId).length;
    const failedGates = gateRows.filter((gate) => /fail|reject|needs-evidence/i.test(String(gate.status))).length;
    gl.uniform2f(this.locations.uRes, this.canvas.width, this.canvas.height); gl.uniform2f(this.locations.uTabletHalf, tablet[0], tablet[1]); gl.uniform1f(this.locations.uCameraZ, this.cameraZ(aspect)); gl.uniform1f(this.locations.uTime, (time - this.start) / 1000); gl.uniform1f(this.locations.uMotion, visualFrozen ? 0 : 1); gl.uniform1i(this.locations.uSteps, this.steps); gl.uniform1i(this.locations.uUi, 0); gl.uniform4f(this.locations.uCounts, snapshot.runs.length, agentRows.length, snapshot.events.length, queueRows.length); gl.uniform4f(this.locations.uMore, gateRows.length, snapshot.iterations.length, snapshot.plans.length, tools().length); gl.uniform4f(this.locations.uState, currentBlocker() ? 1 : 0, Math.min(1, unhealthy / Math.max(1, agentRows.length)), Math.min(1, pinned / Math.max(1, queueRows.length)), Math.min(1, failedGates / Math.max(1, gateRows.length))); gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!visualFrozen && !this.animationTimer) this.animationTimer = setTimeout(() => { this.animationTimer = 0; this.requestFrame(false); }, 100);
  }
}

renderer = new CavernRenderer($("cavern"));

function facts(value) { return `<dl class="facts">${Object.entries(obj(value)).slice(0, 30).map(([key, child]) => `<dt>${esc(key)}</dt><dd>${esc(typeof child === "object" ? json(child) : child)}</dd>`).join("")}</dl>`; }
function semanticOverview() {
  return `<h2>Observed state and requested intent</h2><div class="grid"><article class="slab"><h3>Observed</h3>${facts({ status: snapshot.state?.status, phase: snapshot.state?.phase, currentRunId: currentRunId(), blocker: currentBlocker(), connection: snapshot.connection })}</article><article class="slab"><h3>Requested intent</h3>${facts(snapshot.control)}</article></div><h2>Inventory</h2><div class="grid">${["runs", "agents", "events", "tools", "queue", "gates", "iterations", "audit"].map((kind) => `<article class="slab"><h3>${esc(kind)}</h3><p>${records(kind).length} authoritative or telemetry-derived records</p><button data-semantic-page="evidence" data-kind="${kind}">Inspect</button></article>`).join("")}</div><h2>Session receipts</h2>${receipts.map((receipt) => `<article class="slab receipt"><b>${esc(receipt.type)} / ${esc(receipt.status)}</b><pre>${esc(json(receipt))}</pre></article>`).join("") || '<p class="muted">No commands issued in this session.</p>'}`;
}
function semanticOperations() {
  return `<h2>All ${OPERATION_COMMANDS.length} operation commands</h2><p>JSON is reviewed before dispatch. Recovery and lineage are revalidated immediately before sending.</p><form id="semanticOperation"><label>Operation<select name="type">${OPERATION_COMMANDS.map((type) => `<option ${type === selectedCommand ? "selected" : ""}>${esc(type)}</option>`).join("")}</select></label><label>Payload JSON<textarea name="payload" data-command="${esc(selectedCommand)}" spellcheck="false">${esc(json(commandSeed(selectedCommand)))}</textarea></label><button type="submit">Review exact intent</button></form><div class="grid">${OPERATION_COMMANDS.map((type) => `<button data-operation="${esc(type)}">${esc(type)}</button>`).join("")}</div>`;
}
function semanticPlans() {
  const detail = snapshot.planDetail;
  return `<h2>Project plans and assistance</h2><div class="button-row"><button data-plan-action="project-plan.create">Create draft</button><button data-new-assistance="classic">New classic assistance</button><button data-new-assistance="managed">New managed assistance</button></div><div class="grid"><section class="slab"><h3>Persisted tablets</h3><div class="list">${snapshot.plans.map((plan) => `<button data-plan-id="${esc(plan.planId)}">${esc(first(plan.title, plan.planId))} / ${esc(first(plan.state, "unknown"))}</button>`).join("") || '<p class="muted">No plans reported.</p>'}</div></section><section class="slab"><h3>Exact ledger</h3>${detail ? facts({ ...detail.ledger, revision: detail.revision?.revision, digest: detail.revision?.contentDigest }) + `<h3>Complete exact revision content</h3><pre>${esc(json(detail.revision?.content))}</pre><h3>Decisions</h3><pre>${esc(json(detail.decisions))}</pre><h3>Launches</h3><pre>${esc(json(detail.launches))}</pre>` : '<p>Select a plan.</p>'}<div class="button-row">${PROJECT_PLAN_ACTIONS.map((action) => `<button data-plan-action="${action}" ${!detail && action !== "project-plan.create" ? "disabled" : ""}>${esc(action)}</button>`).join("")}</div></section></div><section class="slab"><h3>Planning assistance</h3><p>Assistance is discussion only. Proposals do not save, approve, launch, or execute.</p><div class="list">${snapshot.assistance.map((thread) => `<button data-assistance-id="${esc(thread.id)}">${esc(thread.pipelineType)} / ${thread.messageCount} messages${thread.hasProposal ? " / proposal" : ""}</button>`).join("")}</div>${snapshot.assistanceDetail ? `<pre>${esc(json(snapshot.assistanceDetail.messages))}</pre><form id="semanticAssistance"><label>Versioned message<textarea name="message" maxlength="16000" required></textarea></label><button>Send message</button></form>${snapshot.assistanceDetail.proposedContent ? `<h3>Complete inert proposal</h3><pre>${esc(json(snapshot.assistanceDetail.proposedContent))}</pre><button data-proposal-draft>Open proposal as editable draft</button>` : ""}` : ""}</section>`;
}
function semanticEvidence() {
  const runId = selectedRunId || snapshot.selectedRunId;
  const list = records(evidenceKind);
  return `<h2>Evidence, resources, logs, documents, and lineage</h2><div class="button-row">${["runs", "agents", "events", "tools", "queue", "gates", "iterations", "audit"].map((kind) => `<button data-kind="${kind}">${kind} (${records(kind).length})</button>`).join("")}</div><label>Search current evidence<input id="semanticEvidenceSearch" value="${esc(searchQuery)}"></label><p>Explicit resource run binding: <b>${esc(runId || "none")}</b>. Accepted intent is not evidence of completion.</p><div class="grid"><section class="slab"><h3>${esc(evidenceKind)}</h3><div class="list">${filteredRecords(evidenceKind).map((record) => `<button data-record-kind="${esc(evidenceKind)}" data-record-id="${esc(idOf(record))}">${esc(idOf(record))} / ${esc(first(record.status, record.state, record.type, record.level, "recorded"))}</button>`).join("")}</div></section><section class="slab"><h3>Run-bound resources</h3><div class="button-row"><button data-document="spec" data-run="${esc(runId || "")}">SPEC</button><button data-document="devplan" data-run="${esc(runId || "")}">DEVPLAN</button></div><h3>Artifacts</h3><div class="list">${arr(resources().artifacts).map((item) => `<button data-resource="artifact" data-name="${esc(itemName(item))}" data-run="${esc(runId || "")}">${esc(itemName(item))}</button>`).join("")}</div><h3>Logs</h3><div class="list">${arr(resources().logs).map((item) => `<button data-resource="log" data-name="${esc(itemName(item))}" data-run="${esc(runId || "")}">${esc(itemName(item))}</button>`).join("")}</div></section></div>${selectedRecord ? `<section class="slab"><h3>Selected record or loaded resource</h3><pre>${esc(selectedRecord.text || json(selectedRecord.data || selectedRecord))}</pre></section>` : ""}`;
}
function semanticHelp() {
  return `<h2>Command Cavern help</h2><div class="grid"><article class="slab"><h3>Scene language</h3><p>Runs are rock cores; agents are survey drones; events and tools are mineral inclusions; queue items are seed crystals; gates are pressure locks; iterations are branching excavations; plans are tectonic tablets; commands are resonant monoliths.</p></article><article class="slab"><h3>Safety</h3><p>Requested intent and observed process state are separate. Recovery refreshes current-run ownership. Historical work uses immutable lineage. Plan lifecycle actions carry exact revision, digest, and expectedVersion.</p></article><article class="slab"><h3>Keyboard</h3><p>A switches presentations. Question mark opens help. Keys 1 through 5 select sections. R refreshes. F freezes nonessential scene motion. Canvas arrows navigate hit regions and Enter activates.</p></article><article class="slab"><h3>Coverage</h3><p>All ${OPERATION_COMMANDS.length} operations, all ${PROJECT_PLAN_ACTIONS.length} plan actions, assistance/proposal-to-draft, and every requested data domain are available in both presentations.</p></article></div>`;
}
function renderSemantic() {
  if ($("semanticApp").hidden) return;
  const active = document.activeElement;
  const focusState = active && $("semanticApp").contains(active) ? { id: active.id, name: active.name, form: active.form?.id, text: active.textContent, data: canonical({ ...active.dataset }), start: active.selectionStart, end: active.selectionEnd } : null;
  const drafts = new Map([...$("semanticContent").querySelectorAll("input,textarea,select")].map((control) => [`${control.form?.id || "root"}:${control.name || control.id}`, { value: control.value, checked: control.checked }]));
  const scroll = $("semanticContent").scrollTop;
  $("semanticStatus").textContent = notice;
  const content = semanticPage === "overview" ? semanticOverview() : semanticPage === "operations" ? semanticOperations() : semanticPage === "plans" ? semanticPlans() : semanticPage === "evidence" ? semanticEvidence() : semanticHelp();
  const confirmation = pending ? `<section class="slab receipt" role="alert"><h2>Confirm requested intent</h2><p>Acceptance is not an observation. Requested control projections and authoritative observed state remain separate.</p>${pending.collateralImpact ? `<h3>Clear-queue collateral impact</h3><pre>${esc(json(pending.collateralImpact))}</pre>` : ""}<pre>${esc(json({ type: pending.type, payload: pending.payload, expectedVersion: pending.expectedVersion, idempotencyKey: pending.idempotencyKey }))}</pre><div class="button-row"><button data-confirm="cancel">Cancel</button><button class="danger" data-confirm="send">Confirm intent</button></div></section>` : "";
  const editor = sceneEditor ? `<section class="slab"><h2>${esc(sceneEditor.title)}</h2><label>${sceneEditor.readOnly ? "Complete read-only content" : "JSON or message editor"}<textarea id="semanticEditorValue" spellcheck="false" ${sceneEditor.readOnly ? "readonly" : ""}>${esc(sceneEditor.value)}</textarea></label><div class="button-row"><button data-editor="cancel">${sceneEditor.readOnly ? "Close" : "Cancel"}</button>${sceneEditor.readOnly ? "" : '<button data-editor="save">Review or save</button>'}</div></section>` : "";
  $("semanticContent").innerHTML = editor + confirmation + content;
  for (const control of $("semanticContent").querySelectorAll("input,textarea,select")) { const draft = drafts.get(`${control.form?.id || "root"}:${control.name || control.id}`); if (draft) { control.value = draft.value; if ("checked" in control) control.checked = draft.checked; } }
  $("semanticContent").scrollTop = scroll;
  if (focusState) { const candidate = (focusState.id && document.getElementById(focusState.id)) || (focusState.form && focusState.name ? document.querySelector(`#${CSS.escape(focusState.form)} [name="${CSS.escape(focusState.name)}"]`) : null) || [...$("semanticContent").querySelectorAll("button,a")].find((item) => item.textContent === focusState.text && canonical({ ...item.dataset }) === focusState.data); if (candidate) { candidate.focus({ preventScroll: true }); if (typeof candidate.setSelectionRange === "function" && focusState.start != null) candidate.setSelectionRange(focusState.start, focusState.end); } }
}

$("semanticApp").addEventListener("click", (event) => {
  const target = event.target.closest("button,a"); if (!target) return;
  activate(async () => {
    if (target.dataset.semanticPage) { semanticPage = target.dataset.semanticPage; if (target.dataset.kind) evidenceKind = target.dataset.kind; renderSemantic(); return; }
    if (target.dataset.operation) { selectedCommand = target.dataset.operation; const payload = $("semanticApp").querySelector('#semanticOperation [name="payload"]'); if (payload) { payload.value = json(commandSeed(selectedCommand)); payload.dataset.command = selectedCommand; } renderSemantic(); return; }
    if (target.dataset.kind) { evidenceKind = target.dataset.kind; renderSemantic(); return; }
    if (target.dataset.recordKind) { const record = records(target.dataset.recordKind).find((item) => idOf(item) === target.dataset.recordId); selectedRecord = { kind: target.dataset.recordKind, data: record }; if (target.dataset.recordKind === "runs") await selectRun(target.dataset.recordId); if (target.dataset.recordKind === "iterations") await client.selectIteration(target.dataset.recordId); renderSemantic(); return; }
    if (target.dataset.planId) { await loadPlan(target.dataset.planId); renderSemantic(); return; }
    if (target.dataset.planAction) { reviewPlanAction(target.dataset.planAction); renderSemantic(); return; }
    if (target.dataset.confirm === "cancel") { pending = null; renderSemantic(); return; }
    if (target.dataset.confirm === "send") { await dispatchPending(); renderSemantic(); return; }
    if (target.dataset.editor === "cancel") { sceneEditor = null; page = "plans"; renderSemantic(); return; }
    if (target.dataset.editor === "save") { sceneEditor.value = $("semanticEditorValue").value; await saveEditor(); renderSemantic(); return; }
    if (target.dataset.newAssistance) { await client.createPlanAssistance(target.dataset.newAssistance); renderSemantic(); return; }
    if (target.dataset.assistanceId) { await client.getPlanAssistance(target.dataset.assistanceId); renderSemantic(); return; }
    if (target.hasAttribute("data-proposal-draft")) { const proposal = snapshot.assistanceDetail?.proposedContent; if (!proposal) throw new Error("No proposal."); openEditor("Proposal to draft", json(proposal), (value) => { pending = deepFreeze({ kind: "plan", type: "project-plan.create", payload: { content: normalizePlanContent(JSON.parse(value)) }, idempotencyKey: intentKey("project-plan.create"), reviewedAt: new Date().toISOString() }); page = "confirm"; }); renderSemantic(); return; }
    if (target.dataset.resource) { await loadResource(target.dataset.resource, target.dataset.name, target.dataset.run); renderSemantic(); return; }
    if (target.dataset.document) { await loadResource(target.dataset.document, target.dataset.document.toUpperCase(), target.dataset.run); renderSemantic(); }
  });
});

$("semanticApp").addEventListener("submit", (event) => {
  event.preventDefault();
  activate(async () => {
    const data = new FormData(event.target);
    if (event.target.id === "semanticOperation") { const type = String(data.get("type")), payloadControl = event.target.elements.payload; if (payloadControl.dataset.command !== type) throw new Error("Selected command and payload draft do not match; select the command again."); selectedCommand = type; await reviewOperation(type, JSON.parse(String(data.get("payload")))); renderSemantic(); }
    if (event.target.id === "semanticAssistance") { const detail = snapshot.assistanceDetail; await client.messagePlanAssistance(detail.id, detail.version, String(data.get("message"))); renderSemantic(); }
  });
});
$("semanticApp").addEventListener("input", (event) => {
  if (event.target.id === "semanticEvidenceSearch") { searchQuery = event.target.value; renderSemantic(); }
  if (event.target.id === "semanticEditorValue" && sceneEditor) sceneEditor.value = event.target.value;
});
$("semanticApp").addEventListener("change", (event) => {
  if (event.target.matches('#semanticOperation [name="type"]')) {
    selectedCommand = event.target.value;
    const payload = $("semanticApp").querySelector('#semanticOperation [name="payload"]');
    if (payload) { payload.value = json(commandSeed(selectedCommand)); payload.dataset.command = selectedCommand; }
  }
});

$("returnToCavern").addEventListener("click", attempt3D);
$("canvasKeyboard").addEventListener("input", (event) => { if (sceneEditor) { sceneEditor.value = event.target.value; renderer.requestFrame(); } });
$("canvasKeyboard").addEventListener("keydown", (event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); saveEditor(); } });

document.addEventListener("keydown", (event) => {
  if (!$("semanticApp").hidden && event.key.toLowerCase() === "a" && !event.target.matches("input,textarea,select")) return attempt3D();
  if ($("cavernMode").hidden) return;
  if (page === "editor") {
    if (event.key === "Escape") { page = sceneEditor?.openedFrom || "operations"; sceneEditor = null; $("cavern").focus(); renderer.requestFrame(); }
    return;
  }
  if (page === "confirm" && event.key === "Escape") { pending = null; page = "operations"; renderer.requestFrame(); return; }
  if (event.key.toLowerCase() === "a") return setMode(true);
  if (event.key === "?") { page = "help"; renderer.requestFrame(); return; }
  if (event.key.toLowerCase() === "f") { visualFrozen = !visualFrozen; announce(visualFrozen ? "Nonessential cavern motion frozen." : "Cavern motion resumed."); renderer.requestFrame(); return; }
  if (event.key.toLowerCase() === "r") { client.refresh().then(() => announce("Authoritative telemetry refreshed.")).catch((error) => announce(error.message, true)); return; }
  if (["1", "2", "3", "4", "5"].includes(event.key)) { page = ["overview", "operations", "plans", "evidence", "help"][Number(event.key) - 1]; renderer.requestFrame(); return; }
  if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    if (event.key === "Home") renderer.focusedHit = 0; else if (event.key === "End") renderer.focusedHit = Math.max(0, hits.length - 1); else renderer.focusedHit = (renderer.focusedHit + (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1) + hits.length) % Math.max(1, hits.length);
    renderer.focusedKey = hits[renderer.focusedHit]?.key || null; announce(hits[renderer.focusedHit]?.label || "No active engraving"); renderer.requestFrame(); return;
  }
  if (["Enter", " "].includes(event.key) && document.activeElement === $("cavern")) { event.preventDefault(); const hit = hits[renderer.focusedHit]; if (hit) activate(hit.action); }
});

const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
const motionChanged = (event) => { if (event.matches) visualFrozen = true; renderer.requestFrame(); };
motionPreference.addEventListener?.("change", motionChanged);

function assertCoverage() {
  if (OPERATION_COMMANDS.length !== 30 || Object.keys(COMMAND_DEFAULTS).length !== 30 || OPERATION_COMMANDS.some((command) => !Object.hasOwn(COMMAND_DEFAULTS, command))) throw new Error("Command Cavern operation parity failed.");
  if (Object.keys(OPERATION_KEYS).length !== OPERATION_COMMANDS.length || OPERATION_COMMANDS.some((command) => !Array.isArray(OPERATION_KEYS[command]))) throw new Error("Command Cavern operation-key parity failed.");
  if (PROJECT_PLAN_ACTIONS.length !== 9 || new Set(PROJECT_PLAN_ACTIONS).size !== 9) throw new Error("Command Cavern project-plan parity failed.");
}

assertCoverage();
let lastCavernRenderSignature = "";
client.subscribe((next) => {
  snapshot = next;
  reconcileReceipts();
  if (!selectedRunId) selectedRunId = snapshot.selectedRunId || currentRunId();
  if (selectedPlanId && snapshot.planDetail?.ledger?.planId !== selectedPlanId) selectedPlanId = snapshot.planDetail?.ledger?.planId || selectedPlanId;
  const signature = cavernRenderSignature(snapshot), changed = signature !== lastCavernRenderSignature;
  lastCavernRenderSignature = signature;
  renderSemantic();
  if (changed) renderer.requestFrame();
});
client.connect().then(() => Promise.all([client.listPlanAssistance(), selectedRunId ? client.selectRun(selectedRunId) : Promise.resolve()])).then(() => announce("Cavern synchronized. Accepted intent remains distinct from observed state.")).catch((error) => announce(`Initial synchronization degraded: ${error.message}`, true));
const forceSemantic = matchMedia("(forced-colors: active)").matches || new URLSearchParams(location.search).get("semantic") === "1";
if (forceSemantic || !renderer?.ready) setMode(true, forceSemantic ? "Semantic mode selected for forced-color or explicit accessibility preference." : "Graphics are not ready; semantic mode is active.");
else $("cavern").focus();
