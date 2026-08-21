import { createDashboardClient, OPERATION_COMMANDS, PROJECT_PLAN_ACTIONS } from "../../headless-dashboard-client.js";

// Static audit markers: SCENE_NATIVE_CONTROL_PLANE, EXACT_COMMAND_SET_PARITY,
// PROTECTED_PAYLOAD_FIELDS, EXACT_LINEAGE_SOURCE, SCENE_CONFIRMATION,
// RUN_BOUND_RESOURCE, SEMANTIC_INERT_WHILE_WEBGL, INVALIDATION_DRIVEN_RENDER,
// WORLD_SPACE_CONTROL_FOLIO, WORLD_SPACE_PANEL, world-space-panel,
// RAY_PLANE_PICKING, ray-plane-picking, FROZEN_CONFIRMATION_ENVELOPE,
// FOLIO_CLEARANCE_PORTAL, WORLD_LABEL_ATLAS, BATCHED_LABEL_QUADS,
// FRONT_CAMERA_ENVELOPE, RESPONSIVE_FOLIO_GUARD, READABLE_PROJECTED_TYPE,
// CPU_RAY_AABB_LOCUS_PICKING, PHYSICAL_FOLIO_TOGGLE, ARCHITECTURE_CAMERA_ENVELOPE.
const $ = (id) => document.getElementById(id);
const arr = (value) => Array.isArray(value) ? value : [];
const record = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const first = (...values) => values.find((value) => value !== undefined && value !== null && value !== "") ?? "";
const idOf = (value) => String(first(value?.id, value?.runId, value?.planId, value?.iterationId, value?.name, "unknown"));
const lines = (value) => String(value || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
const json = (value) => { try { return JSON.stringify(value, null, 2); } catch { return String(value); } };
const clip = (value, maximum = 1000) => { const text = typeof value === "string" ? value : json(value); return text.length > maximum ? `${text.slice(0, maximum)}\n...` : text; };
function wrappedLines(value, width = 110) { const output=[];for(const source of String(typeof value==="string"?value:json(value)).split("\n")){if(!source){output.push("");continue;}for(let start=0;start<source.length;start+=width)output.push(source.slice(start,start+width));}return output; }
const client = createDashboardClient({ maxEvents: 700, eventLimit: 300, auditLimit: 100, pollIntervalMs: 4000 });

const EXPECTED_OPERATION_COMMANDS = Object.freeze([
  "pause", "hold", "resume", "unhold", "stop", "run-now", "steer", "deblock", "deblock-advice", "approve-deblock-advice", "deny-deblock-advice", "remove-steering", "set-current-objective", "start-next-iteration", "continue-from-iteration", "fork-from-iteration", "use-as-next-direction", "start-showcase-loop", "pause-showcase-loop", "resume-showcase-loop", "stop-showcase-loop", "set-showcase-target", "gate-decision", "attach-gate-evidence", "add-queue-item", "clear-queue", "pin-queue-item", "archive-queue-item", "add-gate", "update-gate"
]);
const EXPECTED_PLAN_ACTIONS = Object.freeze(["project-plan.create", "project-plan.update", "project-plan.ready-for-review", "project-plan.approve", "project-plan.reject", "project-plan.launch", "project-plan.clone", "project-plan.fork", "project-plan.archive"]);
function assertExactSet(actual, expected, label) {
  if (actual.length !== expected.length || new Set(actual).size !== expected.length || expected.some((item) => !actual.includes(item)) || actual.some((item) => !expected.includes(item))) throw new Error(`${label} exact-set parity failed.`);
}
assertExactSet(OPERATION_COMMANDS, EXPECTED_OPERATION_COMMANDS, "Operation command");
assertExactSet(PROJECT_PLAN_ACTIONS, EXPECTED_PLAN_ACTIONS, "Project-plan action");

const PLAN_LIMIT_KEYS = Object.freeze(["maxIterations", "maxVariantsPerIteration", "maxParallelVariants", "maxAcceptedFeatures", "maxVisualMotifChanges", "maxNewSections", "stopAfterNoImprovement"]);
const UPDATE_GATE_KEYS = Object.freeze(["gateId", "phase", "description", "severity", "requiredEvidence"]);
const PAGE_SIZE = 8;
const FOLIO = Object.freeze({
  center: Object.freeze([0, 4.1, 11.4]), width: 15.6, height: 8.775,
  backingDepth: .22, backingMargin: .28,
  camera: Object.freeze({ yawDefault: -.18, pitchDefault: .18, distanceDefault: 19, yawMin: -.3, yawMax: .3, pitchMin: .08, pitchMax: .34, distanceMin: 17, distanceMax: 22, fov: .92 })
});
const ARCHITECTURE_CAMERA = Object.freeze({ yawDefault: 0, pitchDefault: .24, distanceDefault: 25, yawMin: -1.05, yawMax: 1.05, pitchMin: .04, pitchMax: .58, distanceMin: 16, distanceMax: 32, fov: 1.05, target: Object.freeze([0, 3.25, 1.2]) });
const NARROW_PORTRAIT = Object.freeze({ minimumHeightToWidth: 1.15 });
const WORLD_LABELS = Object.freeze([
  Object.freeze({ id: "runs", title: "RUNS / RUN VAULT", detail: "resources + monitoring", position: [-9.6, 7.25], center: [-8.1, 6.7, 5.2], size: [2.7, 1.5, 2.7], action: "evidence-kind:runs" }),
  Object.freeze({ id: "agents", title: "AGENTS / SCRIBE DESKS", detail: "agent monitoring", position: [-9.6, 5.55], center: [-6.7, 4.75, 4.8], size: [2.7, 1.5, 2.7], action: "evidence-kind:agents" }),
  Object.freeze({ id: "events", title: "EVENTS / CHRONICLE WALL", detail: "events + audit", position: [-9.6, 3.85], center: [-8.15, 2.8, 4.8], size: [2.7, 1.6, 2.7], action: "evidence-kind:events" }),
  Object.freeze({ id: "tools", title: "TOOLS / IMPLEMENT RACK", detail: "tool monitoring", position: [-9.6, 2.15], center: [-6.7, .85, 4.8], size: [2.7, 1.5, 2.7], action: "evidence-kind:tools" }),
  Object.freeze({ id: "gates", title: "GATES / JUDGMENT PORTAL", detail: "gates + queue controls", position: [9.6, 7.25], center: [8.1, 6.7, 5.2], size: [2.7, 1.5, 2.7], action: "evidence-kind:gates" }),
  Object.freeze({ id: "plans", title: "PLANS / CARTOGRAPHY TABLE", detail: "9 plan actions", position: [9.6, 5.55], center: [6.7, 4.75, 4.8], size: [2.7, 1.5, 2.7], action: "workspace:plans" }),
  Object.freeze({ id: "iterations", title: "ITERATIONS / TURNING STAIR", detail: "lineage monitoring", position: [9.6, 3.85], center: [8.15, 2.8, 4.8], size: [2.7, 1.6, 2.7], action: "evidence-kind:iterations" }),
  Object.freeze({ id: "transport", title: "TRANSPORT / COURIER DOCK", detail: "transport + receipts", position: [9.6, 2.15], center: [6.7, .85, 4.8], size: [2.7, 1.5, 2.7], action: "workspace:transport" }),
  Object.freeze({ id: "folio", title: "CONTROL / COMMAND FOLIO", detail: "30 operations + full controls", position: [0, 9.2], center: [0, 8.6, 10.6], size: [4.35, 1.8, 1.4], action: "folio-toggle", folio: true }),
  Object.freeze({ id: "context", title: "SELECTED / ACTIVE CONTEXT", detail: "none", position: [0, -1.15], context: true })
]);
let snapshot = client.getSnapshot();
let selectedPlanId = null;
let selectedAssistanceId = null;
let selectedRunId = null;
let renderer = null;
let pendingSemanticConfirmation = null;
let commandSerial = 0;
const receipts = [];
const scopedPlanNotes = new Map();
let semanticDirty = true;
let responsiveSemanticActive = false;
const scene = {
  workspace: "home", page: 0, cursor: 0, search: "", command: "pause", operationDraft: "{}", planDraft: "", planAction: "project-plan.create",
  evidenceKind: "runs", assistanceView: "list", resourceTitle: "No run-bound resource loaded", resourceText: "", notice: "Canvas controls are authoritative entry points.",
  confirm: null, bridge: null, folioMinimized: false, selectedLocus: null, reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches
};

function announce(message) { $("live").textContent = message; scene.notice = message; renderer?.invalidate(); }
function currentRunId() { return snapshot.state?.currentRunId || null; }
function currentBlocker() { return snapshot.state?.blocker || snapshot.state?.block || snapshot.state?.hold || null; }
function values(value) { return Array.isArray(value) ? value : value && typeof value === "object" ? Object.values(value) : []; }
function agents() { return arr(snapshot.state?.agents).length ? snapshot.state.agents : values(snapshot.state?.agentStates || snapshot.state?.agents); }
function tools() {
  const result = new Map();
  for (const event of snapshot.events) {
    const name = first(event.data?.toolName, event.raw?.toolName, event.type?.includes("tool") ? event.message : null);
    if (name) result.set(String(name), { name, status: first(event.data?.status, event.level, "observed"), at: event.ts });
  }
  return [...result.values()];
}
function planLimits(source = {}) {
  const number = (key, fallback, minimum, maximum) => Math.min(maximum, Math.max(minimum, Number.isInteger(Number(source[key])) ? Number(source[key]) : fallback));
  const variants = number("maxVariantsPerIteration", 3, 1, 5);
  const bounded = {
    maxIterations: number("maxIterations", 1, 1, 10), maxVariantsPerIteration: variants,
    maxParallelVariants: Math.min(variants, number("maxParallelVariants", 3, 1, 5)), maxAcceptedFeatures: number("maxAcceptedFeatures", 4, 1, 4),
    maxVisualMotifChanges: number("maxVisualMotifChanges", 1, 0, 1), maxNewSections: number("maxNewSections", 1, 0, 1), stopAfterNoImprovement: number("stopAfterNoImprovement", 1, 1, 3)
  };
  return Object.fromEntries(PLAN_LIMIT_KEYS.map((key) => [key, bounded[key]]));
}
function iterationLimits(source = {}) {
  const score = Number(source.minImprovementScore);
  return { ...planLimits(source), minImprovementScore: Number.isFinite(score) ? Math.min(1, Math.max(0, score)) : 0.05 };
}
function boundedInteger(value, fallback, minimum, maximum, label) {
  const number = value === undefined || value === null || value === "" ? fallback : Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) throw new Error(`${label} must be an integer from ${minimum} through ${maximum}.`);
  return number;
}
function gateSnapshot(gate) {
  const requiredEvidence = arr(gate?.requiredEvidence).map(String).filter(Boolean);
  return { id: String(gate?.id || ""), description: String(gate?.description || gate?.title || ""), severity: gate?.severity === "should" ? "should" : "must", required: typeof gate?.required === "boolean" ? gate.required : requiredEvidence.length > 0, requiredEvidence };
}
function defaultPlanContent(pipelineType = "classic") {
  return { pipelineType, title: "", problem: "", intendedUsers: "", objective: "", boundedScope: "", requirements: [], nonGoals: [], constraints: [], risks: [], repository: pipelineType === "managed" ? { path: null, baseRef: "HEAD", baseCommit: null } : { path: null, baseRef: null, baseCommit: null }, acceptanceGates: [], validationPolicy: { id: "apb.runner-selected.v1", expectations: [], clientCommandsAllowed: false }, milestones: [], limits: planLimits(), lineage: { mode: "new", sourcePlanId: null, sourceRevision: null, sourceRunId: null, sourceIterationId: null } };
}
function sanitizePlanContent(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Plan content must be a JSON object.");
  const pipelineType = value.pipelineType === "managed" ? "managed" : "classic";
  return { ...defaultPlanContent(pipelineType), ...value, pipelineType, requirements: arr(value.requirements), nonGoals: arr(value.nonGoals), constraints: arr(value.constraints), risks: arr(value.risks), acceptanceGates: arr(value.acceptanceGates).map((gate) => ({ ...record(gate), requiredEvidence: arr(gate?.requiredEvidence).map(String) })), milestones: arr(value.milestones), repository: pipelineType === "managed" ? { ...defaultPlanContent("managed").repository, ...record(value.repository) } : { path: null, baseRef: null, baseCommit: null }, validationPolicy: { id: value.validationPolicy?.id || "apb.runner-selected.v1", expectations: arr(value.validationPolicy?.expectations), clientCommandsAllowed: false }, limits: planLimits(value.limits), lineage: { ...defaultPlanContent(pipelineType).lineage, ...record(value.lineage) } };
}
function exactPlanSubject(detail = snapshot.planDetail) {
  const ledger = detail?.ledger, revision = detail?.revision;
  if (!ledger || !revision || ledger.planId !== selectedPlanId) throw new Error("Load the selected plan's current ledger detail first.");
  if (ledger.currentRevision !== revision.revision || ledger.currentDigest !== revision.contentDigest) throw new Error("Loaded revision and digest are not the ledger's exact current subject. Reload before acting.");
  if (!Number.isInteger(ledger.version)) throw new Error("Exact plan ledger version is unavailable.");
  return { payload: { planId: ledger.planId, revision: revision.revision, planDigest: revision.contentDigest }, expectedVersion: ledger.version };
}

function exactLineageSource(candidate) {
  const wanted = String(candidate.sourceIterationId || "").trim();
  const detail = snapshot.iterationDetail, detailId = String(first(detail?.id, detail?.iterationId, detail?.iterationState?.id));
  if (!wanted || snapshot.selectedIterationId !== wanted || detailId !== wanted) throw new Error("EXACT_LINEAGE_SOURCE: load and select the exact source iteration detail before historical lineage dispatch.");
  const state = record(detail.iterationState), sourceRunId = String(first(state.runId, detail.runId));
  if (!sourceRunId || String(candidate.sourceRunId || "") !== sourceRunId) throw new Error("Source run must exactly match the loaded source iteration detail.");
  const sourceGates = arr(state.acceptanceGates).length ? state.acceptanceGates : arr(detail.acceptanceGates);
  const gateIds = arr(state.acceptanceGateIds).length ? state.acceptanceGateIds.map(String) : arr(detail.acceptanceGateIds).map(String);
  const snapshots = sourceGates.map(gateSnapshot).filter((gate) => gate.id && gateIds.includes(gate.id));
  return { detail, state, sourceRunId, gateIds, snapshots };
}
function frozenClone(value) {
  const clone = typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
  const freeze = (item) => { if (!item || typeof item !== "object" || Object.isFrozen(item)) return item; Object.freeze(item); for (const child of Object.values(item)) freeze(child); return item; };
  return freeze(clone);
}
function validateFrozenSource(type, payload) {
  if (["gate-decision", "attach-gate-evidence"].includes(type)) { const names = type === "gate-decision" ? payload.evidenceArtifacts : payload.artifacts; if (arr(names).length) retainedArtifactNames(payload.runId, names); return; }
  if (["start-next-iteration", "start-showcase-loop"].includes(type)) { const map = new Map(arr(snapshot.gates?.gates).map((gate) => [String(gate.id), gateSnapshot(gate)])), exact = arr(payload.acceptanceGateIds).map((id) => map.get(String(id))).filter(Boolean); if (json(exact) !== json(payload.snapshottedAcceptanceGates)) throw new Error("STALE_SOURCE_IDENTITY: current gate definitions changed after confirmation."); return; }
  if (!["continue-from-iteration", "fork-from-iteration", "use-as-next-direction"].includes(type)) return;
  const detail = snapshot.iterationDetail, detailId = String(first(detail?.id, detail?.iterationId, detail?.iterationState?.id)), runId = String(first(detail?.iterationState?.runId, detail?.runId));
  if (snapshot.selectedIterationId !== payload.sourceIterationId || detailId !== payload.sourceIterationId || runId !== payload.sourceRunId) throw new Error("STALE_SOURCE_IDENTITY: confirmed lineage source is no longer the exact loaded source.");
  const state = record(detail.iterationState), gates = (arr(state.acceptanceGates).length ? state.acceptanceGates : arr(detail.acceptanceGates)).map(gateSnapshot), ids = arr(state.acceptanceGateIds).length ? state.acceptanceGateIds.map(String) : arr(detail.acceptanceGateIds).map(String);
  const exact = gates.filter((gate) => ids.includes(gate.id));
  if (json(exact) !== json(payload.snapshottedAcceptanceGates) || json(ids) !== json(payload.acceptanceGateIds)) throw new Error("STALE_SOURCE_IDENTITY: historical gate evidence changed after confirmation.");
}
function protectedIterationPayload(candidate, historical) {
  const source = historical ? exactLineageSource(candidate) : null, detail = source?.detail || {}, state = source?.state || {};
  const target = boundedInteger(first(candidate.targetGenerations, candidate.limits?.maxIterations), 1, 1, 10, "Target generations");
  const gateIds = historical ? source.gateIds : arr(candidate.acceptanceGateIds).map(String);
  const currentGateMap = new Map(arr(snapshot.gates?.gates).map((gate) => [String(gate.id), gateSnapshot(gate)]));
  const snapshots = historical ? source.snapshots : gateIds.map((id) => currentGateMap.get(id)).filter(Boolean);
  if (!historical && snapshots.length !== gateIds.length) throw new Error("Every requested gate ID must resolve to a current immutable gate snapshot.");
  const payload = {
    sourceRunId: historical ? source.sourceRunId : candidate.sourceRunId || null, sourceIterationId: historical ? String(first(detail.id, detail.iterationId, state.id)) : candidate.sourceIterationId || null,
    repoPath: String(first(candidate.repoPath, detail.repoPath, state.repoPath, snapshot.control?.autoIteration?.repoPath, snapshot.state?.repoPath)).trim(),
    baseRef: String(first(candidate.baseRef, detail.baseRef, state.baseRef, "HEAD")).trim(), objective: String(first(candidate.objective, detail.objective, state.objective)).trim(),
    changeText: String(first(candidate.changeText, detail.nextRecommendedDirection, state.changeText)).trim(), acceptanceGateIds: gateIds,
    snapshottedAcceptanceGates: snapshots, limits: { ...iterationLimits(candidate.limits), maxIterations: target }, sourceEvidencePolicy: "load-from-source-run"
  };
  if (candidate.queueItemId) payload.queueItemId = String(candidate.queueItemId);
  if (!payload.repoPath.startsWith("/") || !payload.baseRef || !payload.objective || !payload.changeText) throw new Error("Iteration requires an absolute repository path, base ref, objective, and bounded change.");
  return payload;
}
function allow(source, keys) { return Object.fromEntries(keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]])); }
function retainedArtifactNames(runId, requested) {
  const names = arr(requested).map(String).filter(Boolean);
  if (!names.length) return names;
  if (!snapshot.runs.some((run) => idOf(run) === String(runId)) || snapshot.selectedRunId !== String(runId)) throw new Error("Gate evidence choices require the retained run to be explicitly selected and loaded.");
  const retained = new Set(arr(snapshot.selectedRun?.artifacts).map((item) => String(first(item?.name, item?.path, typeof item === "string" ? item : idOf(item)))));
  const missing = names.filter((name) => !retained.has(name));
  if (missing.length) throw new Error(`Gate evidence is not retained on run ${runId}: ${missing.join(", ")}.`);
  return names;
}
function normalizeOperationPayload(type, input) {
  const value = record(input), text = String(first(value.text, value.prompt, value.reason, "")).trim();
  if (type === "pause") return { mode: value.mode === "immediate" ? "immediate" : "checkpoint", ...(text ? { reason: text } : {}) };
  if (type === "stop") return { mode: value.mode === "immediate" ? "immediate" : "graceful", ...(text ? { reason: text } : {}) };
  if (["hold", "pause-showcase-loop", "stop-showcase-loop"].includes(type)) return text ? { reason: text } : {};
  if (["resume", "unhold", "resume-showcase-loop", "clear-queue"].includes(type)) return {};
  if (type === "run-now") return value.runId ? { runId: String(value.runId) } : {};
  if (type === "steer") { if (!text) throw new Error("Steering text is required."); return { text, scope: ["current_run", "next_run", "queue"].includes(value.scope) ? value.scope : "current_run", priority: value.priority === "advisory" ? "advisory" : "required", expires: record(value.expires).type ? record(value.expires) : { type: "until_removed" } }; }
  if (type === "set-current-objective") { const objective = String(first(value.text, value.objective)).trim(); if (!objective) throw new Error("Objective text is required."); return { text: objective, runId: value.runId || null, source: "memory-palace" }; }
  if (type === "remove-steering") { if (!value.id) throw new Error("Steering ID is required."); return { id: String(value.id) }; }
  if (["deblock", "deblock-advice"].includes(type)) { if (!currentRunId() || String(value.runId || "") !== currentRunId()) throw new Error("Current-run recovery must target the exact current run."); return { runId: currentRunId(), prompt: text || "Review the current blocker and propose one safe bounded recovery." }; }
  if (["approve-deblock-advice", "deny-deblock-advice"].includes(type)) { if (!value.adviceId) throw new Error("Advice ID is required."); return { adviceId: String(value.adviceId) }; }
  if (["start-next-iteration", "continue-from-iteration", "fork-from-iteration", "use-as-next-direction"].includes(type)) return protectedIterationPayload(value, type !== "start-next-iteration");
  if (type === "start-showcase-loop") { const result = protectedIterationPayload(value, false); return { ...result, targetGenerations: result.limits.maxIterations }; }
  if (type === "set-showcase-target") return { targetGenerations: boundedInteger(value.targetGenerations, 1, 1, 10, "Target generations") };
  if (type === "gate-decision") { if (!value.gateId || !value.runId) throw new Error("Gate decision requires gate and run IDs."); const evidenceArtifacts = retainedArtifactNames(value.runId, value.evidenceArtifacts); return { gateId: String(value.gateId), runId: String(value.runId), status: ["passed", "failed", "needs-evidence"].includes(value.status) ? value.status : "needs-evidence", decision: ["accepted", "rejected", "defer"].includes(value.decision) ? value.decision : "defer", evidenceArtifacts, notes: String(value.notes || "") }; }
  if (type === "attach-gate-evidence") { const artifacts = retainedArtifactNames(value.runId, value.artifacts || value.evidenceArtifacts); if (!value.gateId || !value.runId || !artifacts.length) throw new Error("Gate evidence requires gate ID, explicit run ID, and existing artifact paths."); return { gateId: String(value.gateId), runId: String(value.runId), artifacts, notes: String(value.notes || "") }; }
  if (type === "add-queue-item") { if (!String(value.objective || "").trim()) throw new Error("Queue objective is required."); const constraints = Array.isArray(value.constraints) ? value.constraints.map(String).join("\n") : String(value.constraints || ""); return { title: String(value.title || "Bounded queue direction"), objective: String(value.objective).trim(), context: String(value.context || ""), constraints, priority: boundedInteger(value.priority, 50, 0, 100, "Queue priority"), pin: Boolean(value.pin), acceptanceGateIds: arr(value.acceptanceGateIds).map(String), target: record(value.target), source: String(value.source || "memory-palace") }; }
  if (["pin-queue-item", "archive-queue-item"].includes(type)) { if (!value.itemId) throw new Error("Queue item ID is required."); return { itemId: String(value.itemId) }; }
  if (type === "add-gate") { if (!value.id || !value.description) throw new Error("Gate ID and description are required."); return { id: String(value.id), phase: String(value.phase || "final-audit"), description: String(value.description), severity: value.severity === "should" ? "should" : "must", requiredEvidence: Array.isArray(value.requiredEvidence) ? value.requiredEvidence.join("\n") : String(value.requiredEvidence || "") }; }
  if (type === "update-gate") { const result = allow(value, UPDATE_GATE_KEYS); if (!result.gateId) throw new Error("Gate ID is required."); if (result.requiredEvidence !== undefined) result.requiredEvidence = Array.isArray(result.requiredEvidence) ? result.requiredEvidence.map(String) : lines(result.requiredEvidence); return result; }
  throw new Error(`No tailored payload contract for ${type}.`);
}
function defaultOperationPayload(type) {
  const runId = currentRunId(), iteration = snapshot.iterationDetail || {};
  const base = { runId, sourceRunId: first(iteration.runId, iteration.iterationState?.runId), sourceIterationId: first(iteration.id, iteration.iterationId), repoPath: first(iteration.repoPath, snapshot.control?.autoIteration?.repoPath, snapshot.state?.repoPath), baseRef: first(iteration.baseRef, "HEAD"), objective: first(iteration.objective, snapshot.control?.currentObjective?.text, snapshot.state?.objective), changeText: "Complete one bounded objective-linked change without unrelated feature or stack churn.", acceptanceGateIds: [], snapshottedAcceptanceGates: [], limits: iterationLimits(), targetGenerations: 1 };
  if (type === "pause") return { mode: "checkpoint", reason: "" };
  if (type === "stop") return { mode: "graceful", reason: "" };
  if (["hold", "pause-showcase-loop", "stop-showcase-loop"].includes(type)) return { reason: "" };
  if (["resume", "unhold", "resume-showcase-loop", "clear-queue"].includes(type)) return {};
  if (type === "run-now") return { runId: selectedRunId || runId || null };
  if (type === "steer") return { text: "", scope: "current_run", priority: "required", expires: { type: "until_removed" } };
  if (type === "set-current-objective") return { text: base.objective, runId: selectedRunId || null };
  if (["deblock", "deblock-advice"].includes(type)) return { runId, prompt: "Review the current blocker and propose one safe bounded recovery." };
  if (["approve-deblock-advice", "deny-deblock-advice"].includes(type)) return { adviceId: "" };
  if (type === "remove-steering") return { id: "" };
  if (["start-next-iteration", "continue-from-iteration", "fork-from-iteration", "use-as-next-direction", "start-showcase-loop"].includes(type)) return base;
  if (type === "set-showcase-target") return { targetGenerations: 1 };
  if (type === "gate-decision") return { gateId: "", runId: selectedRunId || runId, status: "needs-evidence", decision: "defer", evidenceArtifacts: [], notes: "" };
  if (type === "attach-gate-evidence") return { gateId: "", runId: selectedRunId || runId, artifacts: [], notes: "" };
  if (type === "add-queue-item") return { title: "", objective: "", context: "", constraints: "", priority: 50, pin: false, acceptanceGateIds: [], target: {}, source: "memory-palace" };
  if (["pin-queue-item", "archive-queue-item"].includes(type)) return { itemId: "" };
  if (type === "add-gate") return { id: "", phase: "final-audit", description: "", severity: "must", requiredEvidence: "" };
  if (type === "update-gate") return { gateId: "", description: "" };
  return {};
}

async function revalidateRecovery(type, payload) {
  if (type === "deny-deblock-advice") {
    await client.refreshControl(); snapshot = client.getSnapshot();
    const advice = arr(snapshot.control?.deblockAdvice || snapshot.control?.advice).find((item) => item.id === payload.adviceId && (!item.status || item.status === "pending"));
    if (!advice) throw new Error("Advice denial stopped: the pending advice identity was not found after refresh.");
    return;
  }
  if (!["deblock", "deblock-advice", "approve-deblock-advice"].includes(type)) return;
  await Promise.all([client.refreshState(), client.refreshControl()]); snapshot = client.getSnapshot();
  const activeRun = currentRunId(), blocker = currentBlocker();
  if (!activeRun || !blocker) throw new Error("Recovery stopped: refreshed current run has no active blocker.");
  if (["deblock", "deblock-advice"].includes(type) && payload.runId !== activeRun) throw new Error("Recovery ownership changed. Review again.");
  if (type === "approve-deblock-advice") {
    const advice = arr(snapshot.control?.deblockAdvice || snapshot.control?.advice).find((item) => item.id === payload.adviceId && (!item.status || item.status === "pending"));
    if (!advice || advice.runId !== activeRun) throw new Error("Advice is not pending for the refreshed current blocked run.");
  }
}
function addReceipt(type, state, result = null, error = null) {
  const item = { id: ++commandSerial, type, state, receipt: result?.commandId || result?.id || result?.planId || null, error: error?.message || null, at: new Date().toISOString() };
  receipts.unshift(item); renderSemanticReceipts(); renderer?.invalidate(); return item;
}
async function executeOperation(type, payload) {
  validateFrozenSource(type, payload); await revalidateRecovery(type, payload); const receipt = addReceipt(type, "pending");
  receipt.request = frozenClone({ type, payload });
  try { const result = await client.command(type, payload, { refresh: true }); receipt.state = "accepted intent"; receipt.receipt = result?.commandId || result?.id || null; announce(`${type} accepted intent; verify observed state.`); }
  catch (error) { receipt.state = error?.status == null ? "outcome unknown" : "rejected"; receipt.error = error.message; announce(`${type}: ${receipt.state}. ${error.message}`); }
  renderSemanticReceipts();
}
async function executePlan(type, payload, expectedVersion) {
  const receipt = addReceipt(type, "pending");
  receipt.request = frozenClone({ type, payload, expectedVersion });
  try { const result = await client.projectPlanCommand(type, payload, { expectedVersion, refresh: true }); receipt.state = "accepted intent"; receipt.receipt = result?.planId || null; selectedPlanId = result?.planId || (type === "project-plan.archive" ? null : selectedPlanId); if (selectedPlanId) await client.getProjectPlan(selectedPlanId); announce(`${type} accepted ledger intent; verify observed state.`); }
  catch (error) { receipt.state = error?.status == null ? "outcome unknown" : "rejected"; receipt.error = error.message; announce(`${type}: ${receipt.state}. ${error.message}`); }
  renderSemanticReceipts();
}
function planRequest(type, contentText = null, notes = "") {
  if (type === "project-plan.create") return { type, payload: { content: sanitizePlanContent(JSON.parse(contentText)) }, expectedVersion: undefined };
  if (type === "project-plan.update") { const exact = exactPlanSubject(); return { type, payload: { planId: exact.payload.planId, content: sanitizePlanContent(JSON.parse(contentText)) }, expectedVersion: exact.expectedVersion }; }
  const exact = exactPlanSubject(); let payload = type === "project-plan.archive" ? { planId: exact.payload.planId } : { ...exact.payload };
  if (type === "project-plan.reject" && !notes.trim()) throw new Error("Rejection notes are required.");
  if (["project-plan.approve", "project-plan.reject"].includes(type)) payload.notes = notes.trim();
  if (["project-plan.clone", "project-plan.fork"].includes(type)) { const source = exactLineageSource({ sourceIterationId: snapshot.selectedIterationId, sourceRunId: first(snapshot.iterationDetail?.iterationState?.runId, snapshot.iterationDetail?.runId) }); payload = { ...payload, sourceRunId: source.sourceRunId, sourceIterationId: String(first(source.detail.id, source.detail.iterationId, source.state.id)), baseRef: snapshot.planDetail.revision.content.pipelineType === "managed" ? snapshot.planDetail.revision.content.repository?.baseRef || "HEAD" : null }; }
  return { type, payload, expectedVersion: exact.expectedVersion };
}
function setPlanDraft(value) { scene.planDraft = String(value); const field = $("planForm")?.elements?.content; if (field && field.value !== scene.planDraft) field.value = scene.planDraft; }
function planNoteKey(type) { const exact = exactPlanSubject(); return `${exact.payload.planId}:${exact.payload.revision}:${exact.payload.planDigest}:${type}`; }
function displayPlanNotes() { if (!scene.pendingPlanAction) return ""; try { return scopedPlanNotes.get(planNoteKey(scene.pendingPlanAction)) || ""; } catch { return ""; } }

function setSemanticEnabled(enabled) {
  const surface = $("semanticSurface"); surface.classList.toggle("visible", enabled); surface.setAttribute("aria-hidden", String(!enabled)); surface.inert = !enabled; document.body.classList.toggle("semantic-mode", enabled);
}
function enterSemantic(target = "status") { setSemanticEnabled(true); if (semanticDirty) renderSemantic(true); requestAnimationFrame(() => ($(target) || $("semanticSurface")).focus?.()); announce("Semantic control and evidence mode enabled."); }
function narrowPortraitRequiresSemantic() { return innerHeight / Math.max(1, innerWidth) >= NARROW_PORTRAIT.minimumHeightToWidth; }
function leaveSemantic() { if (narrowPortraitRequiresSemantic()) return announce(`The physical folio requires a height-to-width ratio below ${NARROW_PORTRAIT.minimumHeightToWidth}; complete semantic mode remains active.`); if (!renderer?.available) return announce("WebGL2 is unavailable; semantic fallback remains active."); responsiveSemanticActive=false;setSemanticEnabled(false);$("return3d").disabled=false;$("palace").focus();announce("Scene-native control plane enabled."); }
function applyResponsiveFolioGuard() {
  const required=narrowPortraitRequiresSemantic(),button=$("return3d");
  button.disabled=required;button.title=required?`Rotate toward landscape so height divided by width is below ${NARROW_PORTRAIT.minimumHeightToWidth}.`:"";
  if(required&&!document.body.classList.contains("semantic-mode")){responsiveSemanticActive=true;setSemanticEnabled(true);renderSemantic(true);requestAnimationFrame(()=>$("status").focus());announce("Narrow portrait viewport: complete semantic mode enabled because the fixed physical folio cannot remain readable.");}
  else if(!required&&responsiveSemanticActive&&renderer?.available){responsiveSemanticActive=false;setSemanticEnabled(false);renderer.invalidate();announce("Landscape viewport restored the scene-native control plane.");}
}
function activateFallback(message) { setSemanticEnabled(true); renderSemantic(true); requestAnimationFrame(() => $("status").focus()); announce(message); }

function startBridge(kind, value) {
  scene.bridge = { kind, focusLost: false }; const bridge = $("sceneTextBridge"); bridge.value = value; bridge.focus({ preventScroll: true }); renderer?.invalidate();
}
function finishBridge(save) {
  if (!scene.bridge) return; const { kind } = scene.bridge, value = $("sceneTextBridge").value; scene.bridge = null;
  if (save) {
    if (kind === "operation") scene.operationDraft = value;
    if (kind === "plan") setPlanDraft(value);
    if (kind === "search") { scene.search = value.trim().toLowerCase(); scene.page = 0; }
    if (kind === "assistance-message") scene.assistanceMessage = value;
    if (kind.startsWith("plan-notes:")) scopedPlanNotes.set(kind.slice(11), value);
  }
  $("palace").focus(); renderer?.invalidate();
}
function sceneConfirm(title, envelope, execute) { const frozen = frozenClone(envelope); scene.confirm = { title, envelope: frozen, execute, warning: frozen.type === "clear-queue" ? "COLLATERAL IMPACT: clears all queued items, pinned objective, next request, and queue-scoped steering." : "" }; scene.workspace = "confirm"; scene.textPage = 0; scene.cursor = 0; renderer?.invalidate(); }
function sceneError(error) { announce(error?.message || String(error)); }
async function safeScene(task) { try { await task(); } catch (error) { sceneError(error); } }

function evidenceRows(kind) {
  if (kind === "runs") return snapshot.runs.map((item) => ({ label: `${idOf(item)} / ${first(item.status, item.phase, "unknown")}`, action: `run:${idOf(item)}` }));
  if (kind === "agents") return agents().map((item) => evidenceRow(kind, `${idOf(item)} / ${first(item.status, "unknown")}`, item));
  if (kind === "events") return snapshot.events.slice().reverse().map((item) => evidenceRow(kind, `${first(item.agentId, item.source, "system")} / ${first(item.message, item.type, "event")}`, item));
  if (kind === "tools") return tools().map((item) => evidenceRow(kind, `${item.name} / ${item.status}`, item));
  if (kind === "gates") return arr(snapshot.gates?.gates).map((item) => evidenceRow(kind, `${idOf(item)} / ${first(item.status, "pending")}`, item));
  if (kind === "queue") return arr(snapshot.queue?.items).map((item) => evidenceRow(kind, `${first(item.title, idOf(item))} / ${first(item.status, "queued")}`, item));
  if (kind === "iterations") return snapshot.iterations.map((item) => ({ label: `${idOf(item)} / ${first(item.status, "unknown")}`, action: `iteration:${idOf(item)}`, detail: item }));
  return arr(snapshot.audit).map((item) => evidenceRow(kind, `${first(item.action, item.type, item.command, "record")} / ${first(item.status, "recorded")}`, item));
}
function stableEntityId(kind, item) { return String(first(item?.id, item?.runId, item?.planId, item?.name, item?.ts && `${item.ts}:${first(item.type,item.action,item.command,"record")}`, `${kind}:${json(item)}`)); }
function evidenceRow(kind, label, detail) { const stableId = stableEntityId(kind, detail); return { label, detail, stableId, action: `evidence-record:${kind}:${encodeURIComponent(stableId)}` }; }
function directoryRows() { return [...document.querySelectorAll(".global-dashboard-directory a")].map((link) => ({ label: `${link.querySelector("b")?.textContent || link.textContent} / ${link.querySelector("small")?.textContent || "dashboard"}`, action: `directory:${encodeURIComponent(link.getAttribute("href") || link.href)}` })); }
function filtered(items) { return scene.search ? items.filter((item) => `${item.label} ${json(item.detail || "")}`.toLowerCase().includes(scene.search)) : items; }
function paged(items) { const list = filtered(items), pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE)); scene.page = Math.min(scene.page, pages - 1); return { list: list.slice(scene.page * PAGE_SIZE, scene.page * PAGE_SIZE + PAGE_SIZE), pages, total: list.length }; }

async function handleSceneAction(action) {
  if (!action) return;
  if (action === "folio-toggle") { renderer?.toggleFolio(); return; }
  if (action.startsWith("locus:")) { renderer?.activateLocus(action.slice(6)); return; }
  if (action.startsWith("workspace:")) { scene.workspace = action.slice(10); scene.page = 0; scene.textPage = 0; scene.cursor = 0; scene.search = ""; renderer.invalidate(); return; }
  if (action === "semantic") return enterSemantic("status");
  if (action === "transport-refresh") return safeScene(async () => { await client.refresh(); announce("Client aggregate refreshed."); });
  if (action === "transport-freeze") { client.pause(); announce("Client presentation stream frozen; workflow state was not paused."); return; }
  if (action === "transport-resume") return safeScene(async () => { await client.resume(); announce("Client presentation stream resumed and reconciled."); });
  if (action === "transport-disconnect") { client.disconnect(); announce("Browser transport disconnected; workflow was not stopped."); return; }
  if (action === "transport-reconnect") return safeScene(async () => { await client.connect(); announce("Browser transport reconnect requested."); });
  if (action.startsWith("directory:")) { location.href = decodeURIComponent(action.slice(10)); return; }
  if (action.startsWith("receipt:")) { const id = Number(action.slice(8)), item = receipts.find((receipt) => receipt.id === id); if (!item) throw new Error("Receipt is no longer retained."); scene.receiptDetail = item; scene.workspace = "receipt-detail"; scene.textPage = 0; renderer.invalidate(); return; }
  if (action === "back") { scene.workspace = "home"; scene.confirm = null; scene.cursor = 0; renderer.invalidate(); return; }
  if (action === "page-next") { scene.page += 1; scene.cursor = 0; renderer.invalidate(); return; }
  if (action === "page-prev") { scene.page = Math.max(0, scene.page - 1); scene.cursor = 0; renderer.invalidate(); return; }
  if (action === "search") return startBridge("search", scene.search);
  if (action === "bridge-save") return finishBridge(true);
  if (action === "bridge-cancel") return finishBridge(false);
  if (action === "text-next") { scene.textPage = (scene.textPage || 0) + 1; renderer.invalidate(); return; }
  if (action === "text-prev") { scene.textPage = Math.max(0, (scene.textPage || 0) - 1); renderer.invalidate(); return; }
  if (action.startsWith("command:")) { scene.command = action.slice(8); scene.operationDraft = json(defaultOperationPayload(scene.command)); scene.workspace = "operation-detail"; scene.textPage = 0; scene.cursor = 0; renderer.invalidate(); return; }
  if (action === "edit-operation") return startBridge("operation", scene.operationDraft);
  if (action === "review-operation") return safeScene(async () => { const type = scene.command, payload = normalizeOperationPayload(type, JSON.parse(scene.operationDraft)); sceneConfirm(`CONFIRM ${type}`, { type, payload }, async (confirmed) => executeOperation(confirmed.type, confirmed.payload)); });
  if (action === "confirm-cancel") { scene.confirm = null; scene.workspace = "home"; renderer.invalidate(); return; }
  if (action === "confirm-send") { const pending = scene.confirm; scene.confirm = null; scene.workspace = "receipts"; renderer.invalidate(); return safeScene(() => pending.execute(pending.envelope)); }
  if (action === "plan-create") { scene.planAction = "project-plan.create"; setPlanDraft(json(defaultPlanContent())); scene.workspace = "plan-editor"; renderer.invalidate(); return; }
  if (action.startsWith("plan:")) return safeScene(async () => { selectedPlanId = action.slice(5); await loadPlan(selectedPlanId); scene.workspace = "plan-detail"; renderer.invalidate(); });
  if (action === "edit-plan") return startBridge("plan", scene.planDraft);
  if (action === "review-plan-editor") return safeScene(async () => { const request = planRequest(scene.planAction, scene.planDraft); sceneConfirm(`CONFIRM ${request.type}`, request, async (confirmed) => executePlan(confirmed.type, confirmed.payload, confirmed.expectedVersion)); });
  if (action.startsWith("plan-action:")) return safeScene(async () => { const type = action.slice(12); if (type === "project-plan.update") { exactPlanSubject(); scene.planAction = type; setPlanDraft(json(snapshot.planDetail.revision.content)); scene.workspace = "plan-editor"; renderer.invalidate(); return; } const noteKey = planNoteKey(type); const notes = scopedPlanNotes.get(noteKey) || ""; if (["project-plan.approve", "project-plan.reject"].includes(type) && !notes) { scene.pendingPlanAction = type; startBridge(`plan-notes:${noteKey}`, notes); announce(`Enter scoped ${type.endsWith("reject") ? "rejection" : "approval"} notes, Save, then activate the action again.`); return; } const request = planRequest(type, null, notes); sceneConfirm(`CONFIRM ${type}`, request, async (confirmed) => { await executePlan(confirmed.type, confirmed.payload, confirmed.expectedVersion); scopedPlanNotes.delete(noteKey); }); });
  if (action === "assist-classic" || action === "assist-managed") return safeScene(async () => { const detail = await client.createPlanAssistance(action.slice(7)); selectedAssistanceId = detail.id; scene.assistanceView = "thread"; renderer.invalidate(); });
  if (action.startsWith("assist:")) return safeScene(async () => { selectedAssistanceId = action.slice(7); await client.getPlanAssistance(selectedAssistanceId); scene.assistanceView = "thread"; renderer.invalidate(); });
  if (action === "assist-message") return startBridge("assistance-message", scene.assistanceMessage || "");
  if (action === "assist-send") return safeScene(async () => { const detail = snapshot.assistanceDetail; if (!detail || detail.id !== selectedAssistanceId || !String(scene.assistanceMessage || "").trim()) throw new Error("Select a current thread and enter a message."); const message = scene.assistanceMessage; sceneConfirm("CONFIRM VERSIONED ASSISTANCE MESSAGE", { type: "assistance.message", id: detail.id, expectedVersion: detail.version, message }, async (confirmed) => { await client.messagePlanAssistance(confirmed.id, confirmed.expectedVersion, confirmed.message); scene.assistanceMessage = ""; announce("Assistance message accepted; proposal remains inert."); }); });
  if (action === "assist-proposal") { const proposal = snapshot.assistanceDetail?.proposedContent; if (!proposal) throw new Error("No proposal is loaded."); scene.planAction = "project-plan.create"; setPlanDraft(json(proposal)); scene.workspace = "plan-editor"; renderer.invalidate(); return; }
  if (action.startsWith("evidence-kind:")) { scene.evidenceKind = action.slice(14); scene.page = 0; scene.workspace = "evidence-list"; renderer.invalidate(); return; }
  if (action.startsWith("evidence-record:")) { const parts = action.split(":"), kind = parts[1], stableId = decodeURIComponent(parts.slice(2).join(":")), item = evidenceRows(kind).find((row) => row.stableId === stableId); if (!item) throw new Error("Evidence record identity changed; refresh the list."); scene.evidenceDetail = item.detail; scene.workspace = "evidence-detail"; renderer.invalidate(); return; }
  if (action.startsWith("run:")) return safeScene(async () => { selectedRunId = action.slice(4); await client.selectRun(selectedRunId); scene.workspace = "resources"; renderer.invalidate(); });
  if (action.startsWith("iteration:")) return safeScene(async () => { const id = action.slice(10); await client.selectIteration(id); scene.evidenceDetail = snapshot.iterationDetail || client.getSnapshot().iterationDetail; scene.workspace = "evidence-detail"; announce(`Exact iteration detail ${id} loaded for lineage review.`); });
  if (action.startsWith("resource:")) return safeScene(async () => { const [kind, ...rest] = action.slice(9).split(":"); const name = rest.join(":"); await loadResource(kind, name || null); renderer.invalidate(); });
}

function semanticTextNode(value) { const node = document.createElement("p"); node.textContent = value; return node; }
function semanticButton(label, handler) { const node = document.createElement("button"); node.type = "button"; node.textContent = label; node.addEventListener("click", () => safeScene(handler)); return node; }
function replaceText(id, value) { $(id).replaceChildren(semanticTextNode(value)); }
function renderSemanticReceipts() {
  if (!document.body.classList.contains("semantic-mode")) { semanticDirty = true; return; }
  $("commandHistory").replaceChildren(...receipts.map((receipt) => { const item = document.createElement("li"); item.textContent = `#${receipt.id} ${receipt.type}: ${receipt.state}${receipt.receipt ? ` / receipt ${receipt.receipt}` : ""}${receipt.error ? ` / ${receipt.error}` : ""}`; return item; }));
}
function reconcileSelectedRun() {
  if (selectedRunId && snapshot.runs.some((run) => idOf(run) === selectedRunId)) return selectedRunId;
  const active = currentRunId(); if (active && snapshot.runs.some((run) => idOf(run) === active)) return active;
  return snapshot.runs.length ? idOf(snapshot.runs[0]) : null;
}
function renderSemantic(force = false) {
  if (!force && !document.body.classList.contains("semantic-mode")) { semanticDirty = true; renderer?.setSnapshot(snapshot); return; }
  semanticDirty = false;
  replaceText("semanticStatus", json({ connection: snapshot.connection, observed: snapshot.state, requestedIntent: snapshot.control, error: snapshot.error }));
  selectedRunId = reconcileSelectedRun();
  const runSelect = $("resourceRun"); runSelect.replaceChildren(new Option("Select an explicit run", ""), ...snapshot.runs.map((run) => new Option(`${idOf(run)} / ${first(run.status, "unknown")}`, idOf(run)))); runSelect.value = selectedRunId || "";
  const runNodes = snapshot.runs.map((run) => semanticButton(`${idOf(run)} / ${first(run.status, run.phase, "unknown")}`, () => selectRun(idOf(run))));
  const resources = selectedRunId === snapshot.selectedRunId ? snapshot.selectedRun : null;
  if (resources) { for (const artifact of arr(resources.artifacts)) { const name = String(first(artifact?.name, artifact?.path, typeof artifact === "string" ? artifact : idOf(artifact))); runNodes.push(semanticButton(`Artifact: ${name}`, () => loadResource("artifact", name))); } for (const log of arr(resources.logs)) { const name = String(first(log?.name, log?.path, typeof log === "string" ? log : idOf(log))); runNodes.push(semanticButton(`Log: ${name}`, () => loadResource("log", name))); } }
  $("runs").replaceChildren(...runNodes); replaceText("agents", agents().length ? json(agents()) : "No agents reported."); replaceText("tools", tools().length ? json(tools()) : "No tools observed.");
  $("events").replaceChildren(...snapshot.events.slice(-100).reverse().map((event) => { const item = document.createElement("li"); item.textContent = `${first(event.ts, "no time")} / ${first(event.agentId, event.source, "system")} / ${first(event.message, event.type, "event")}`; return item; }));
  replaceText("gates", json(snapshot.gates || { gates: [] })); replaceText("queue", json(snapshot.queue || { items: [] }));
  $("iterations").replaceChildren(...snapshot.iterations.map((item) => semanticButton(`${idOf(item)} / ${first(item.status, "unknown")}`, async () => { await client.selectIteration(idOf(item)); announce(`Iteration ${idOf(item)} loaded.`); })));
  $("audit").replaceChildren(...arr(snapshot.audit).slice(0,100).map((entry) => { const item=document.createElement("li"); item.textContent=`${first(entry.ts,entry.at,"no time")} / ${first(entry.action,entry.type,entry.command,"record")}`; return item; }));
  $("planList").replaceChildren(...snapshot.plans.map((plan) => semanticButton(`${first(plan.title, plan.planId)} / ${first(plan.state, "unknown")}`, () => loadPlan(plan.planId)))); $("planDetail").textContent = snapshot.planDetail ? json(snapshot.planDetail) : "No plan selected.";
  $("assistanceList").replaceChildren(...snapshot.assistance.map((thread) => semanticButton(`${thread.pipelineType} / ${thread.messageCount} messages`, () => loadAssistance(thread.id))));
  $("assistanceThread").replaceChildren(...arr(snapshot.assistanceDetail?.messages).map((message) => semanticTextNode(`${first(message.role,"message")}: ${first(message.content,message.text)}`))); $("proposalToDraft").disabled = !snapshot.assistanceDetail?.proposedContent;
  renderSemanticReceipts(); renderer?.setSnapshot(snapshot);
}
async function selectRun(runId) { selectedRunId = runId; await client.selectRun(runId); announce(`RUN_BOUND_RESOURCE: ${runId} selected.`); }
async function loadPlan(planId) { selectedPlanId = planId; const detail = await client.getProjectPlan(planId); setPlanDraft(json(detail.revision?.content || {})); }
async function loadAssistance(id) { selectedAssistanceId = id; await client.getPlanAssistance(id); }
async function loadResource(kind, name) {
  const runId = selectedRunId;
  if (!runId || snapshot.selectedRunId !== runId) throw new Error("Select and load an explicit resource run first.");
  const result = kind === "document" ? await client.loadDocument(name, runId) : kind === "artifact" ? await client.loadArtifact(name, runId) : await client.loadLog(name, runId, { tail: 400 });
  if (selectedRunId !== runId) return; scene.resourceTitle = `${String(name || kind).toUpperCase()} / RUN ${runId}`; scene.resourceText = result.text; $("resourceTitle").textContent = scene.resourceTitle; $("resourceText").textContent = result.text;
}

function perspective(fovy, aspect, near, far) { const f=1/Math.tan(fovy/2),nf=1/(near-far);return [f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0]; }
function lookAt(eye,target,up){let zx=eye[0]-target[0],zy=eye[1]-target[1],zz=eye[2]-target[2],n=1/Math.hypot(zx,zy,zz);zx*=n;zy*=n;zz*=n;let xx=up[1]*zz-up[2]*zy,xy=up[2]*zx-up[0]*zz,xz=up[0]*zy-up[1]*zx;n=1/Math.hypot(xx,xy,xz);xx*=n;xy*=n;xz*=n;const yx=zy*xz-zz*xy,yy=zz*xx-zx*xz,yz=zx*xy-zy*xx;return [xx,yx,zx,0,xy,yy,zy,0,xz,yz,zz,0,-(xx*eye[0]+xy*eye[1]+xz*eye[2]),-(yx*eye[0]+yy*eye[1]+yz*eye[2]),-(zx*eye[0]+zy*eye[1]+zz*eye[2]),1];}
function multiply(a,b){const out=new Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)out[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return out;}
function compile(gl,type,source){const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(shader)||"Shader compilation failed";gl.deleteShader(shader);throw new Error(message);}return shader;}
function makeProgram(gl,vs,fs){const vertex=compile(gl,gl.VERTEX_SHADER,vs),fragment=compile(gl,gl.FRAGMENT_SHADER,fs),value=gl.createProgram();gl.attachShader(value,vertex);gl.attachShader(value,fragment);gl.linkProgram(value);gl.deleteShader(vertex);gl.deleteShader(fragment);if(!gl.getProgramParameter(value,gl.LINK_STATUS)){const message=gl.getProgramInfoLog(value)||"Program link failed";gl.deleteProgram(value);throw new Error(message);}return value;}

class PalaceRenderer {
  constructor(canvas){const camera=FOLIO.camera;this.canvas=canvas;this.gl=null;this.available=false;this.lost=false;this.yaw=camera.yawDefault;this.pitch=camera.pitchDefault;this.distance=camera.distanceDefault;this.drag=null;this.pinch=null;this.activePointers=new Set();this.instances=[];this.hotspots=[];this.controls=[];this.focus=0;this.worldFocus=0;this.snapshot=snapshot;this.overlay=document.createElement("canvas");this.ctx=this.overlay.getContext("2d");this.raf=0;this.dirty=true;this.overlayDirty=true;this.textureAllocated=false;this.labelAtlasDirty=true;this.bind();}
  start(){try{this.initialize();if(this.available)this.initializeWorldFolio();}catch(error){this.available=false;activateFallback(`WebGL initialization failed: ${error.message}`);}}
  bind(){
    this.canvas.addEventListener("webglcontextlost",(event)=>{event.preventDefault();this.lost=true;this.available=false;cancelAnimationFrame(this.raf);this.raf=0;activateFallback("WebGL context lost. Semantic fallback is active.");});
    this.canvas.addEventListener("webglcontextrestored",()=>{this.lost=false;this.start();announce("WebGL context restored. Return to 3D when ready.");});
    this.canvas.addEventListener("pointerdown",(event)=>{this.canvas.setPointerCapture(event.pointerId);this.activePointers.add(event.pointerId);if(this.activePointers.size===1)this.drag={x:event.clientX,y:event.clientY,moved:false,id:event.pointerId};else{if(this.drag)this.drag.moved=true;this.drag=null;}});
    this.canvas.addEventListener("pointermove",(event)=>{if(!this.drag||this.drag.id!==event.pointerId)return;const dx=event.clientX-this.drag.x,dy=event.clientY-this.drag.y;if(Math.abs(dx)+Math.abs(dy)>3)this.drag.moved=true;this.yaw+=dx*.006;this.pitch+=dy*.005;this.constrainCamera();this.drag.x=event.clientX;this.drag.y=event.clientY;this.invalidate(false);});
    const endPointer=(event,canceled=false)=>{const click=!canceled&&this.activePointers.size===1&&this.drag?.id===event.pointerId&&!this.drag.moved&&!this.pinch;this.activePointers.delete(event.pointerId);if(click)this.pick(event.clientX,event.clientY);if(this.drag?.id===event.pointerId)this.drag=null;if(!this.activePointers.size)this.pinch=null;};
    this.canvas.addEventListener("pointerup",(event)=>endPointer(event));this.canvas.addEventListener("pointercancel",(event)=>endPointer(event,true));this.canvas.addEventListener("lostpointercapture",(event)=>endPointer(event,true));
    this.canvas.addEventListener("wheel",(event)=>{event.preventDefault();this.distance+=event.deltaY*.025;this.constrainCamera();this.invalidate(false);},{passive:false});
    this.canvas.addEventListener("touchstart",(event)=>{if(event.touches.length===2)this.pinch=Math.hypot(event.touches[0].clientX-event.touches[1].clientX,event.touches[0].clientY-event.touches[1].clientY);},{passive:true});
    this.canvas.addEventListener("touchmove",(event)=>{if(event.touches.length!==2||!this.pinch)return;const distance=Math.hypot(event.touches[0].clientX-event.touches[1].clientX,event.touches[0].clientY-event.touches[1].clientY);this.distance+=(this.pinch-distance)*.04;this.constrainCamera();this.pinch=distance;this.invalidate(false);},{passive:true});
    this.canvas.addEventListener("touchend",()=>{this.pinch=null;},{passive:true});
    document.addEventListener("visibilitychange",()=>{if(!document.hidden)this.invalidate();});window.addEventListener("resize",()=>this.invalidate());
  }
  initialize(){const gl=this.canvas.getContext("webgl2",{alpha:false,antialias:true,depth:true,powerPreference:"high-performance"});if(!gl){this.available=false;activateFallback("WebGL2 unavailable. Semantic fallback is active.");return;}this.gl=gl;this.maxTextureSize=gl.getParameter(gl.MAX_TEXTURE_SIZE);this.maxViewport=gl.getParameter(gl.MAX_VIEWPORT_DIMS);this.maxRenderbuffer=gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);const vs=`#version 300 es\nlayout(location=0)in vec3 p;layout(location=1)in vec3 ip;layout(location=2)in vec3 is;layout(location=3)in vec3 ic;uniform mat4 vp;out vec3 c;out float s;void main(){gl_Position=vp*vec4(ip+p*is,1.);c=ic;s=.62+.38*(p.y+.5);}`,fs=`#version 300 es\nprecision mediump float;in vec3 c;in float s;out vec4 o;void main(){o=vec4(c*s,1.);}`;this.archProgram=makeProgram(gl,vs,fs);this.vpLocation=gl.getUniformLocation(this.archProgram,"vp");this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);const verts=new Float32Array([-.5,-.5,-.5,.5,-.5,-.5,.5,.5,-.5,-.5,.5,-.5,-.5,-.5,.5,.5,-.5,.5,.5,.5,.5,-.5,.5,.5]),inds=new Uint16Array([0,1,2,0,2,3,4,6,5,4,7,6,0,4,5,0,5,1,3,2,6,3,6,7,1,5,6,1,6,2,0,3,7,0,7,4]);const vb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.bufferData(gl.ARRAY_BUFFER,verts,gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,0,0);const ib=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,inds,gl.STATIC_DRAW);this.instanceBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.instanceBuffer);gl.bufferData(gl.ARRAY_BUFFER,512*9*4,gl.STATIC_DRAW);for(let i=0;i<3;i++){gl.enableVertexAttribArray(1+i);gl.vertexAttribPointer(1+i,3,gl.FLOAT,false,36,i*12);gl.vertexAttribDivisor(1+i,1);}const ovs=`#version 300 es\nconst vec2 P[6]=vec2[6](vec2(-1.,-1.),vec2(1.,-1.),vec2(-1.,1.),vec2(-1.,1.),vec2(1.,-1.),vec2(1.,1.));out vec2 uv;void main(){vec2 q=P[gl_VertexID];uv=q*.5+.5;gl_Position=vec4(q,0.,1.);}`,ofs=`#version 300 es\nprecision mediump float;uniform sampler2D tex;in vec2 uv;out vec4 o;void main(){o=texture(tex,vec2(uv.x,1.-uv.y));}`;this.overlayProgram=makeProgram(gl,ovs,ofs);this.overlayTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.overlayTexture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);this.buildScene();gl.bindBuffer(gl.ARRAY_BUFFER,this.instanceBuffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,new Float32Array(this.instances));this.available=true;this.textureAllocated=false;this.invalidate();}
  initializeWorldFolio(){const gl=this.gl,vs=`#version 300 es\nconst vec2 P[6]=vec2[6](vec2(-.5,-.5),vec2(.5,-.5),vec2(-.5,.5),vec2(-.5,.5),vec2(.5,-.5),vec2(.5,.5));const vec2 U[6]=vec2[6](vec2(0.,1.),vec2(1.,1.),vec2(0.,0.),vec2(0.,0.),vec2(1.,1.),vec2(1.,0.));uniform mat4 vp;uniform vec3 center;uniform vec2 size;out vec2 uv;void main(){uv=U[gl_VertexID];gl_Position=vp*vec4(center+vec3(P[gl_VertexID]*size,0.),1.);}`,fs=`#version 300 es\nprecision mediump float;uniform sampler2D tex;in vec2 uv;out vec4 o;void main(){o=texture(tex,uv);}`;gl.deleteProgram(this.overlayProgram);this.overlayProgram=makeProgram(gl,vs,fs);this.folioVpLocation=gl.getUniformLocation(this.overlayProgram,"vp");this.folioCenterLocation=gl.getUniformLocation(this.overlayProgram,"center");this.folioSizeLocation=gl.getUniformLocation(this.overlayProgram,"size");this.initializeWorldLabels();this.textureAllocated=false;this.invalidate();}
  initializeWorldLabels(){const gl=this.gl,vs=`#version 300 es\nlayout(location=0)in vec3 p;layout(location=1)in vec2 aUv;uniform mat4 vp;out vec2 uv;void main(){uv=aUv;gl_Position=vp*vec4(p,1.);}`,fs=`#version 300 es\nprecision mediump float;uniform sampler2D atlas;in vec2 uv;out vec4 o;void main(){o=texture(atlas,uv);}`;this.labelProgram=makeProgram(gl,vs,fs);this.labelVpLocation=gl.getUniformLocation(this.labelProgram,"vp");this.labelAtlas=document.createElement("canvas");this.labelAtlas.width=1024;this.labelAtlas.height=512;this.labelTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.labelTexture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);this.labelVao=gl.createVertexArray();this.labelBuffer=gl.createBuffer();gl.bindVertexArray(this.labelVao);gl.bindBuffer(gl.ARRAY_BUFFER,this.labelBuffer);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,20,0);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,2,gl.FLOAT,false,20,12);this.labelAtlasDirty=true;this.buildLabelQuads();}
  buildLabelQuads(){const vertices=[],columns=2,rows=5,plaqueWidth=4.35,plaqueHeight=1.08,z=FOLIO.center[2]-.04;for(let i=0;i<WORLD_LABELS.length;i++){const label=WORLD_LABELS[i],[x,y]=label.position,u0=(i%columns)/columns,v0=Math.floor(i/columns)/rows,u1=u0+1/columns,v1=v0+1/rows,x0=x-plaqueWidth/2,x1=x+plaqueWidth/2,y0=y-plaqueHeight/2,y1=y+plaqueHeight/2;vertices.push(x0,y0,z,u0,v1,x1,y0,z,u1,v1,x0,y1,z,u0,v0,x0,y1,z,u0,v0,x1,y0,z,u1,v1,x1,y1,z,u1,v0);}this.labelVertexCount=vertices.length/5;this.gl.bindBuffer(this.gl.ARRAY_BUFFER,this.labelBuffer);this.gl.bufferData(this.gl.ARRAY_BUFFER,new Float32Array(vertices),this.gl.STATIC_DRAW);}
  updateLabelAtlas(){const canvas=this.labelAtlas,c=canvas.getContext("2d"),cellW=canvas.width/2,cellH=canvas.height/5,selected=WORLD_LABELS.find((item)=>item.id===scene.selectedLocus);c.clearRect(0,0,canvas.width,canvas.height);WORLD_LABELS.forEach((label,index)=>{const x=(index%2)*cellW,y=Math.floor(index/2)*cellH,isSelected=label.id===scene.selectedLocus,title=label.folio&&scene.folioMinimized?"RESTORE / COMMAND FOLIO":label.title,detail=label.context?(selected?`${selected.title} / activate again to open`:"select a labelled architecture locus"):label.folio?(scene.folioMinimized?"OPEN CONTROLS [T]":"MINIMIZE FOLIO [T]"):label.detail;c.fillStyle="#10130fee";c.fillRect(x+5,y+7,cellW-10,cellH-14);c.strokeStyle=isSelected||label.context?"#69c7bd":"#d9af59";c.lineWidth=isSelected?6:3;c.strokeRect(x+7,y+9,cellW-14,cellH-18);c.fillStyle="#f2e6c8";c.font="700 23px monospace";c.textAlign="center";c.textBaseline="middle";c.fillText(title,x+cellW/2,y+36,cellW-30);c.fillStyle="#b9dcd4";c.font="18px monospace";c.fillText(detail,x+cellW/2,y+70,cellW-30);});const gl=this.gl;gl.bindTexture(gl.TEXTURE_2D,this.labelTexture);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvas);this.labelAtlasDirty=false;}
  drawWorldLabels(vp){const gl=this.gl;if(this.labelAtlasDirty)this.updateLabelAtlas();gl.enable(gl.DEPTH_TEST);gl.depthMask(false);gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.useProgram(this.labelProgram);gl.uniformMatrix4fv(this.labelVpLocation,false,vp);gl.bindTexture(gl.TEXTURE_2D,this.labelTexture);gl.bindVertexArray(this.labelVao);gl.drawArrays(gl.TRIANGLES,0,this.labelVertexCount);gl.depthMask(true);gl.disable(gl.BLEND);}
  box(x,y,z,sx,sy,sz,color){this.instances.push(x,y,z,sx,sy,sz,...color);}
  buildScene(){this.instances=[];const stone=[.24,.23,.18],edge=[.48,.39,.22],floor=[.12,.15,.12],[fx,fy,fz]=FOLIO.center,restore=WORLD_LABELS.find((item)=>item.folio);this.box(0,-.7,0,22,.55,22,floor);this.box(0,7.7,0,5,.4,5,edge);for(let level=0;level<4;level++)for(let i=0;i<42;i++){const a=-2.72+i*(5.44/41),r=9.2,y=.45+level*2.05,x=Math.sin(a)*r,z=Math.cos(a)*r;this.box(x,y,z,.42,1.55,.42,stone);if(i%3===0)this.box(x,y+.86,z,1.25,.18,.72,edge);}for(let i=0;i<28;i++){const a=-2.72+i*(5.44/27),r=6.3;this.box(Math.sin(a)*r,-.1,Math.cos(a)*r,.22,.45,5.6,stone);}for(let i=0;i<12;i++){const a=-2.5+i*.45;this.box(Math.sin(a)*4.2,.1,Math.cos(a)*4.2,1.25,.5,1.1,[.28,.24,.14]);}for(const locus of WORLD_LABELS){if(!locus.center||locus.folio)continue;const selected=locus.id===scene.selectedLocus;this.box(...locus.center,...locus.size,selected?[.18,.58,.54]:[.43,.31,.13]);this.box(locus.center[0],locus.center[1]+locus.size[1]/2+.18,locus.center[2],locus.size[0]+.3,.16,locus.size[2]+.3,selected?[.42,.82,.74]:edge);}if(scene.folioMinimized){this.box(...restore.center,...restore.size,[.14,.12,.08]);this.box(restore.center[0],restore.center[1]+restore.size[1]/2+.12,restore.center[2],restore.size[0]+.3,.16,restore.size[2]+.3,[.55,.42,.18]);}else this.box(fx,fy,fz-FOLIO.backingDepth,FOLIO.width+FOLIO.backingMargin*2,FOLIO.height+FOLIO.backingMargin*2,FOLIO.backingDepth,[.14,.12,.08]);}
  uploadScene(){const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,this.instanceBuffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,new Float32Array(this.instances));}
  toggleFolio(force,preserveSelection=false){scene.folioMinimized=force===undefined?!scene.folioMinimized:Boolean(force);if(!preserveSelection){this.worldFocus=0;scene.selectedLocus=scene.folioMinimized?WORLD_LABELS.find((item)=>item.action&&!item.folio)?.id:null;}this.buildScene();this.uploadScene();this.labelAtlasDirty=true;this.resetCamera();this.overlayDirty=true;this.invalidate();announce(scene.folioMinimized?"Command folio minimized. Architecture loci exposed; arrows change the selected locus and Enter opens it.":"Command folio restored with complete normal-mode controls.");}
  activateLocus(id){const loci=WORLD_LABELS.filter((item)=>item.action),locus=loci.find((item)=>item.id===id);if(!locus)return;if(scene.selectedLocus!==id){scene.selectedLocus=id;this.worldFocus=Math.max(0,loci.indexOf(locus));this.buildScene();this.uploadScene();this.labelAtlasDirty=true;this.invalidate(false);announce(`${locus.title} selected. Activate again to open ${locus.detail}.`);return;}if(locus.folio)return this.toggleFolio(false);if(scene.folioMinimized)this.toggleFolio(false,true);safeScene(()=>handleSceneAction(locus.action));}
  setSnapshot(value){this.snapshot=value;this.labelAtlasDirty=true;this.invalidate();}
  invalidate(overlay=true){this.dirty=true;if(overlay)this.overlayDirty=true;if(!this.raf&&!document.hidden&&!document.body.classList.contains("semantic-mode")&&this.available&&!this.lost)this.raf=requestAnimationFrame(()=>{this.raf=0;if(this.dirty)this.render();});}
  resize(){const cores=navigator.hardwareConcurrency||4,memory=navigator.deviceMemory||4,cap=cores<=4||memory<=4?1.15:1.6,limit=Math.min(this.maxTextureSize,this.maxRenderbuffer,this.maxViewport[0],this.maxViewport[1],memory<=4?1536:2560),dpr=Math.min(devicePixelRatio||1,cap),w=Math.min(limit,Math.max(1,Math.floor(innerWidth*dpr))),h=Math.min(limit,Math.max(1,Math.floor(innerHeight*dpr))),ow=Math.min(limit,memory<=4?1280:1920),oh=Math.floor(ow*9/16);let changed=false;if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;changed=true;}if(this.overlay.width!==ow||this.overlay.height!==oh){this.overlay.width=ow;this.overlay.height=oh;this.textureAllocated=false;this.overlayDirty=true;changed=true;}return changed;}
  constrainCamera(){const envelope=scene.folioMinimized?ARCHITECTURE_CAMERA:FOLIO.camera;this.yaw=Math.max(envelope.yawMin,Math.min(envelope.yawMax,this.yaw));this.pitch=Math.max(envelope.pitchMin,Math.min(envelope.pitchMax,this.pitch));this.distance=Math.max(envelope.distanceMin,Math.min(envelope.distanceMax,this.distance));}
  resetCamera(){const camera=scene.folioMinimized?ARCHITECTURE_CAMERA:FOLIO.camera;this.yaw=camera.yawDefault;this.pitch=camera.pitchDefault;this.distance=camera.distanceDefault;}
  cameraState(){const envelope=scene.folioMinimized?ARCHITECTURE_CAMERA:FOLIO.camera;this.constrainCamera();const cp=Math.cos(this.pitch),target=envelope.target||FOLIO.center,eye=[target[0]+Math.sin(this.yaw)*cp*this.distance,target[1]+Math.sin(this.pitch)*this.distance,target[2]+Math.cos(this.yaw)*cp*this.distance];return {eye,target,fov:envelope.fov,vp:multiply(perspective(envelope.fov,this.canvas.width/this.canvas.height,.1,100),lookAt(eye,target,[0,1,0]))};}
  camera(){return this.cameraState().vp;}
  button(x,y,w,h,label,action,style="normal"){const ctx=this.ctx,index=this.controls.length,focused=index===this.focus,fontSize=Math.max(18,Math.floor(h*.56));ctx.fillStyle=focused?"#d9af59":style==="danger"?"#4b211c":"#202219";ctx.fillRect(x,y,w,h);ctx.strokeStyle=focused?"#fff1b7":style==="danger"?"#e46d5d":"#706546";ctx.strokeRect(x,y,w,h);ctx.fillStyle=focused?"#11130f":"#e9e0c7";ctx.font=`700 ${fontSize}px monospace`;ctx.textBaseline="middle";ctx.fillText(String(label).slice(0,Math.max(4,Math.floor((w-24)/(fontSize*.62)))),x+12,y+h/2);this.hotspots.push({x,y,w,h,action,index});this.controls.push({label,action});}
  header(title,subtitle){const c=this.ctx,w=this.overlay.width,scale=Math.max(.7,Math.min(1.35,w/1500));c.fillStyle="#090b08ee";c.fillRect(18*scale,18*scale,w-36*scale,96*scale);c.strokeStyle="#d9af59";c.strokeRect(18*scale,18*scale,w-36*scale,96*scale);c.fillStyle="#eadfbe";c.font=`700 ${31*scale}px monospace`;c.fillText(title,38*scale,55*scale,w-76*scale);c.fillStyle="#afa58e";c.font=`${18*scale}px monospace`;c.fillText(subtitle,38*scale,86*scale,w*.47);c.textAlign="right";c.fillStyle="#69c7bd";c.fillText(`${String(this.snapshot.connection?.status||"disconnected").toUpperCase()} / OBSERVED ${String(this.snapshot.state?.phase||"idle").toUpperCase()} / RUN ${currentRunId()||"none"}`,w-38*scale,86*scale,w*.47);c.textAlign="left";return scale;}
  textBlock(value,x,y,lineCount=24,width=110){const c=this.ctx,s=Math.max(.7,Math.min(1.35,this.overlay.width/1500)),lineHeight=34*s,availableBottom=this.overlay.height-118*s,visibleLines=Math.max(4,Math.min(lineCount,Math.floor((availableBottom-y)/lineHeight)-1)),maximumCharacters=Math.max(12,Math.floor((this.overlay.width-x-45*s)/(14.5*s))),all=wrappedLines(value,Math.min(width,maximumCharacters)),pages=Math.max(1,Math.ceil(all.length/visibleLines));scene.textPage=Math.min(scene.textPage||0,pages-1);c.fillStyle="#e9e0c7";c.font=`${24*s}px monospace`;all.slice(scene.textPage*visibleLines,scene.textPage*visibleLines+visibleLines).forEach((line,index)=>c.fillText(line,x,y+index*lineHeight));c.fillStyle="#afa58e";c.font=`${18*s}px monospace`;c.fillText(`TEXT PAGE ${scene.textPage+1}/${pages} / ${all.length} LINES`,x,y+visibleLines*lineHeight);this.button(this.overlay.width-380*s,this.overlay.height-88*s,165*s,48*s,"TEXT <","text-prev");this.button(this.overlay.width-200*s,this.overlay.height-88*s,165*s,48*s,"TEXT >","text-next");}
  drawRows(title,items,actions={}){const editing=scene.bridge?.kind==="search",c=this.ctx,w=this.overlay.width,h=this.overlay.height,s=this.header(`MEMORY PALACE / ${title}`,editing?`EDITING SEARCH${scene.bridge.focusLost?" / FOCUS LOST - DRAFT RETAINED":""}`:scene.notice),left=50*s,top=145*s,rowH=58*s,panelW=Math.min(w-100*s,1120*s);this.controls=[];this.hotspots=[];items.forEach((item,index)=>this.button(left,top+index*(rowH+8*s),panelW,rowH,item.label||item,item.action||actions[index]));this.button(left,h-84*s,170*s,48*s,"BACK","back");if(editing){this.button(left+185*s,h-84*s,175*s,48*s,"SAVE SEARCH","bridge-save");this.button(left+375*s,h-84*s,155*s,48*s,"CANCEL","bridge-cancel");}else{this.button(left+185*s,h-84*s,175*s,48*s,"SEARCH [/]","search");this.button(left+375*s,h-84*s,150*s,48*s,"< PAGE","page-prev");this.button(left+540*s,h-84*s,150*s,48*s,"PAGE >","page-next");}c.fillStyle="#afa58e";c.font=`${18*s}px monospace`;c.fillText(`PAGE ${scene.page+1} / SEARCH ${editing?$("sceneTextBridge").value:scene.search||"none"} / ARROWS MOVE / ENTER ACTIVATE / TAB EXITS`,left,h-103*s);}
  drawHome(){const s=this.header("HERMES / MEMORY PALACE","WORLD_SPACE_CONTROL_FOLIO / accepted intent is not observed completion"),w=this.overlay.width,h=this.overlay.height;this.controls=[];this.hotspots=[];const items=[["OPERATIONS / 30 COMMANDS","workspace:operations"],["PROJECT PLANS / 9 ACTIONS","workspace:plans"],["PLANNING ASSISTANCE","workspace:assistance"],["RESOURCES AND EVIDENCE","workspace:evidence"],["TRANSPORT / DATA VIEW","workspace:transport"],["DASHBOARD DIRECTORY","workspace:directory"],["COMMAND RECEIPTS","workspace:receipts"],["MINIMIZE FOLIO [T]","folio-toggle"],["HELP / SEMANTIC MODE","workspace:help"]],bw=Math.min(520*s,w*.46),bh=52*s,x=(w-bw)/2,y=125*s;items.forEach(([label,action],i)=>this.button(x,y+i*(bh+6*s),bw,bh,label,action));const c=this.ctx;c.fillStyle="#afa58e";c.font=`${18*s}px monospace`;c.fillText("T TOGGLES FOLIO / WASD ORBIT / +/- ZOOM / ARROWS SELECT / ENTER ACTIVATE",35*s,h-25*s);}
  drawTransport(){const paused=Boolean(snapshot.connection?.paused),connected=snapshot.connection?.status!=="disconnected",rows=[{label:"REFRESH ALL AGGREGATES",action:"transport-refresh"},{label:paused?"RESUME CLIENT DATA":"FREEZE CLIENT DATA",action:paused?"transport-resume":"transport-freeze"},{label:connected?"DISCONNECT BROWSER TRANSPORT":"RECONNECT BROWSER TRANSPORT",action:connected?"transport-disconnect":"transport-reconnect"},{label:"OPEN DASHBOARD DIRECTORY",action:"workspace:directory"}];this.drawRows("TRANSPORT / DISPLAY CONTROLS",rows);}
  drawDirectory(){const page=paged(directoryRows());this.drawRows(`DASHBOARD DIRECTORY ${page.total}`,page.list);}
  drawOperations(){const page=paged(OPERATION_COMMANDS.map((name)=>({label:name,action:`command:${name}`})));this.drawRows(`OPERATIONS ${page.total}`,page.list);}
  drawOperationDetail(){const editing=scene.bridge?.kind==="operation",s=this.header(`OPERATION / ${scene.command}`,editing?`EDITING${scene.bridge.focusLost?" / FOCUS LOST - DRAFT RETAINED":""}`:"PROTECTED_PAYLOAD_FIELDS / exact full payload"),w=this.overlay.width,h=this.overlay.height,c=this.ctx;this.controls=[];this.hotspots=[];c.fillStyle="#0b0d0aee";c.fillRect(45*s,130*s,w-90*s,h-255*s);c.strokeStyle="#5e5948";c.strokeRect(45*s,130*s,w-90*s,h-255*s);this.textBlock(editing?$("sceneTextBridge").value:scene.operationDraft,65*s,160*s,22,120);if(editing){this.button(45*s,h-98*s,150*s,45*s,"SAVE EDIT","bridge-save");this.button(210*s,h-98*s,150*s,45*s,"CANCEL EDIT","bridge-cancel");}else{this.button(45*s,h-98*s,180*s,45*s,"EDIT PAYLOAD","edit-operation");this.button(240*s,h-98*s,210*s,45*s,"REVIEW EXACT","review-operation");}this.button(465*s,h-98*s,130*s,45*s,"BACK","workspace:operations");}
  drawPlans(){const page=paged(snapshot.plans.map((item)=>({label:`${first(item.title,item.planId)} / ${first(item.state,"unknown")} / v${first(item.version,item.currentRevision,"?")}`,action:`plan:${item.planId}`})));page.list.unshift({label:"CREATE NEW PLAN",action:"plan-create"});this.drawRows(`PLAN LEDGER ${page.total}`,page.list);}
  drawPlanDetail(){const detail=snapshot.planDetail,ledger=detail?.ledger||{},revision=detail?.revision||{},editing=scene.bridge?.kind?.startsWith("plan-notes:"),note=editing?$("sceneTextBridge").value:displayPlanNotes(),s=this.header(`PLAN / ${ledger.planId||"none"}`,editing?`EDITING SCOPED NOTES${scene.bridge.focusLost?" / FOCUS LOST - DRAFT RETAINED":""}`:`state ${ledger.state||"unknown"} / exact revision ${revision.revision||"?"} / version ${ledger.version||"?"}`),w=this.overlay.width,h=this.overlay.height,c=this.ctx;this.controls=[];this.hotspots=[];c.fillStyle="#afa58e";c.font=`${18*s}px monospace`;c.fillText(`DIGEST ${revision.contentDigest||"not loaded"}`,45*s,135*s);c.fillText(`DECISION NOTES ${String(note||"none").slice(0,70)}`,45*s,160*s);const actions=PROJECT_PLAN_ACTIONS.filter((item)=>item!=="project-plan.create");actions.forEach((action,index)=>this.button(45*s+(index%2)*310*s,(185+Math.floor(index/2)*55)*s,290*s,43*s,action.replace("project-plan.",""),`plan-action:${action}`));this.textBlock(revision.content||{},680*s,185*s,16,65);if(editing){this.button(45*s,h-75*s,150*s,40*s,"SAVE NOTES","bridge-save");this.button(210*s,h-75*s,150*s,40*s,"CANCEL","bridge-cancel");}else this.button(45*s,h-75*s,130*s,40*s,"BACK","workspace:plans");}
  drawPlanEditor(){const editing=scene.bridge?.kind==="plan",s=this.header(`PLAN EDITOR / ${scene.planAction}`,editing?`EDITING${scene.bridge.focusLost?" / FOCUS LOST - DRAFT RETAINED":""}`:"Seven allowed plan limits; full draft review"),w=this.overlay.width,h=this.overlay.height,c=this.ctx;this.controls=[];this.hotspots=[];c.fillStyle="#0b0d0aee";c.fillRect(45*s,125*s,w-90*s,h-240*s);this.textBlock(editing?$("sceneTextBridge").value:scene.planDraft,65*s,150*s,24,120);if(editing){this.button(45*s,h-92*s,150*s,43*s,"SAVE EDIT","bridge-save");this.button(210*s,h-92*s,150*s,43*s,"CANCEL EDIT","bridge-cancel");}else{this.button(45*s,h-92*s,180*s,43*s,"EDIT CONTENT","edit-plan");this.button(240*s,h-92*s,190*s,43*s,"REVIEW EXACT","review-plan-editor");}this.button(445*s,h-92*s,130*s,43*s,"BACK","workspace:plans");}
  drawAssistance(){if(scene.assistanceView==="thread"&&snapshot.assistanceDetail){const detail=snapshot.assistanceDetail,editing=scene.bridge?.kind==="assistance-message",s=this.header(`ASSISTANCE / ${detail.pipelineType} / v${detail.version}`,editing?`EDITING MESSAGE${scene.bridge.focusLost?" / FOCUS LOST - DRAFT RETAINED":""}`:"Complete versioned transcript / proposal inert"),w=this.overlay.width,h=this.overlay.height,c=this.ctx;this.controls=[];this.hotspots=[];const transcript=arr(detail.messages).map((message)=>`${first(message.role,"message")}: ${first(message.content,message.text)}`).join("\n\n");this.textBlock(transcript,45*s,145*s,20,115);c.fillStyle="#afa58e";c.font=`${18*s}px monospace`;c.fillText(`DRAFT: ${String(editing?$("sceneTextBridge").value:scene.assistanceMessage||"").slice(0,75)}`,45*s,h-135*s);if(editing){this.button(45*s,h-100*s,150*s,43*s,"SAVE EDIT","bridge-save");this.button(210*s,h-100*s,150*s,43*s,"CANCEL EDIT","bridge-cancel");}else{this.button(45*s,h-100*s,170*s,43*s,"EDIT MESSAGE","assist-message");this.button(230*s,h-100*s,140*s,43*s,"SEND","assist-send");}if(detail.proposedContent)this.button(385*s,h-100*s,220*s,43*s,"PROPOSAL TO DRAFT","assist-proposal");this.button(620*s,h-100*s,130*s,43*s,"BACK","workspace:assistance");return;}const page=paged(snapshot.assistance.map((item)=>({label:`${item.pipelineType} / ${item.messageCount} messages${item.hasProposal?" / proposal":""}`,action:`assist:${item.id}`})));page.list.unshift({label:"NEW CLASSIC",action:"assist-classic"},{label:"NEW MANAGED",action:"assist-managed"});this.drawRows(`ASSISTANCE ${page.total}`,page.list);}
  drawEvidenceHome(){const kinds=["runs","agents","events","tools","gates","queue","iterations","audit"].map((kind)=>({label:`${kind.toUpperCase()} / ${evidenceRows(kind).length}`,action:`evidence-kind:${kind}`}));this.drawRows("EVIDENCE DIRECTORY",kinds);}
  drawEvidenceList(){const page=paged(evidenceRows(scene.evidenceKind));this.drawRows(`${scene.evidenceKind.toUpperCase()} ${page.total}`,page.list);}
  drawEvidenceDetail(){const s=this.header(`EVIDENCE DETAIL / ${scene.evidenceKind.toUpperCase()}`,"Observed complete server record; no command outcome inferred"),w=this.overlay.width,h=this.overlay.height,c=this.ctx;this.controls=[];this.hotspots=[];c.fillStyle="#0b0d0aee";c.fillRect(45*s,125*s,w-90*s,h-225*s);this.textBlock(scene.evidenceDetail||{},65*s,150*s,27,120);this.button(45*s,h-75*s,150*s,40*s,"BACK","workspace:evidence-list");}
  drawResources(){const resources=selectedRunId===snapshot.selectedRunId?snapshot.selectedRun:null,items=[];if(resources){items.push({label:"LOAD SPEC",action:"resource:document:spec"},{label:"LOAD DEVPLAN",action:"resource:document:devplan"});for(const item of arr(resources.artifacts)){const name=String(first(item?.name,item?.path,typeof item==="string"?item:idOf(item)));items.push({label:`ARTIFACT ${name}`,action:`resource:artifact:${name}`});}for(const item of arr(resources.logs)){const name=String(first(item?.name,item?.path,typeof item==="string"?item:idOf(item)));items.push({label:`LOG ${name}`,action:`resource:log:${name}`});}}const page=paged(items);this.drawRows(`RUN_BOUND_RESOURCE / ${selectedRunId||"none"}`,page.list);const c=this.ctx,s=Math.max(.7,Math.min(1.35,this.overlay.width/1500));c.fillStyle="#090b08ee";c.fillRect(this.overlay.width*.65,135*s,this.overlay.width*.33,this.overlay.height-230*s);c.fillStyle="#d9af59";c.font=`${18*s}px monospace`;c.fillText(scene.resourceTitle,this.overlay.width*.66,165*s,this.overlay.width*.31);this.textBlock(scene.resourceText,this.overlay.width*.66,195*s,18,48);}
  drawReceipts(){const page=paged(receipts.map((item)=>({label:`#${item.id} ${item.type} / ${item.state}${item.receipt?` / ${item.receipt}`:""}${item.error?` / ${item.error}`:""}`,action:`receipt:${item.id}`})));this.drawRows(`RECEIPTS ${page.total}`,page.list);}
  drawReceiptDetail(){const s=this.header(`RECEIPT #${scene.receiptDetail?.id||"?"}`,"Concurrent lifecycle identity is stable per request"),w=this.overlay.width,h=this.overlay.height,c=this.ctx;this.controls=[];this.hotspots=[];c.fillStyle="#0b0d0aee";c.fillRect(45*s,125*s,w-90*s,h-220*s);this.textBlock(scene.receiptDetail||{},65*s,150*s,27,120);this.button(45*s,h-75*s,150*s,40*s,"BACK","workspace:receipts");}
  drawHelp(){const rows=["T: physically minimize or restore the command folio","MINIMIZED: arrows select labelled loci; Enter selects/opens","POINTER/TOUCH: select a locus once; activate again for detail","W/A/S/D: orbit; minimized mode has a wider envelope","+/-: zoom; 0: reset view","/: search; E: edit payload/content","Tab leaves canvas; M opens complete semantic mode","Accepted intent is not observed completion",{label:"OPEN SEMANTIC MODE [M]",action:"semantic"}].map((item)=>typeof item==="string"?{label:item}:item);this.drawRows("SPATIAL HELP",rows);}
  drawConfirm(){const pending=scene.confirm,s=this.header(pending?.title||"SCENE_CONFIRMATION",pending?.warning||"FROZEN_CONFIRMATION_ENVELOPE / exact immutable full preview"),w=this.overlay.width,h=this.overlay.height,c=this.ctx;this.controls=[];this.hotspots=[];c.fillStyle="#0b0d0af2";c.fillRect(45*s,125*s,w-90*s,h-240*s);c.strokeStyle="#e46d5d";c.strokeRect(45*s,125*s,w-90*s,h-240*s);this.textBlock(pending?.envelope||{},65*s,150*s,26,120);this.button(45*s,h-92*s,190*s,45*s,"CONFIRM SEND","confirm-send","danger");this.button(250*s,h-92*s,150*s,45*s,"CANCEL","confirm-cancel");}
  drawOverlay(){const c=this.ctx;c.clearRect(0,0,this.overlay.width,this.overlay.height);if(scene.workspace==="home")this.drawHome();else if(scene.workspace==="operations")this.drawOperations();else if(scene.workspace==="operation-detail")this.drawOperationDetail();else if(scene.workspace==="plans")this.drawPlans();else if(scene.workspace==="plan-detail")this.drawPlanDetail();else if(scene.workspace==="plan-editor")this.drawPlanEditor();else if(scene.workspace==="assistance")this.drawAssistance();else if(scene.workspace==="evidence")this.drawEvidenceHome();else if(scene.workspace==="evidence-list")this.drawEvidenceList();else if(scene.workspace==="evidence-detail")this.drawEvidenceDetail();else if(scene.workspace==="resources")this.drawResources();else if(scene.workspace==="transport")this.drawTransport();else if(scene.workspace==="directory")this.drawDirectory();else if(scene.workspace==="receipts")this.drawReceipts();else if(scene.workspace==="receipt-detail")this.drawReceiptDetail();else if(scene.workspace==="help")this.drawHelp();else if(scene.workspace==="confirm")this.drawConfirm();this.focus=Math.min(this.focus,Math.max(0,this.controls.length-1));this.overlayDirty=false;}
  render(){this.dirty=false;this.resize();const needsUpload=this.overlayDirty,gl=this.gl,vp=this.camera();gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(.025,.034,.026,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.enable(gl.CULL_FACE);gl.useProgram(this.archProgram);gl.uniformMatrix4fv(this.vpLocation,false,vp);gl.bindVertexArray(this.vao);gl.drawElementsInstanced(gl.TRIANGLES,36,gl.UNSIGNED_SHORT,0,this.instances.length/9);this.drawWorldLabels(vp);if(scene.folioMinimized)return;if(needsUpload)this.drawOverlay();gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.useProgram(this.overlayProgram);gl.uniformMatrix4fv(this.folioVpLocation,false,vp);gl.uniform3fv(this.folioCenterLocation,FOLIO.center);gl.uniform2f(this.folioSizeLocation,FOLIO.width,FOLIO.height);gl.bindTexture(gl.TEXTURE_2D,this.overlayTexture);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);if(!this.textureAllocated){gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.overlay);this.textureAllocated=true;}else if(needsUpload){gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,this.overlay);}gl.drawArrays(gl.TRIANGLES,0,6);gl.disable(gl.BLEND);}
  pointerRay(clientX,clientY){const rect=this.canvas.getBoundingClientRect(),ndcX=(clientX-rect.left)/rect.width*2-1,ndcY=1-(clientY-rect.top)/rect.height*2,{eye,target,fov}=this.cameraState(),forward=[target[0]-eye[0],target[1]-eye[1],target[2]-eye[2]],fl=Math.hypot(...forward);forward[0]/=fl;forward[1]/=fl;forward[2]/=fl;let right=[-forward[2],0,forward[0]],rl=Math.hypot(...right);if(rl<1e-6)return null;right=right.map((value)=>value/rl);const up=[right[1]*forward[2]-right[2]*forward[1],right[2]*forward[0]-right[0]*forward[2],right[0]*forward[1]-right[1]*forward[0]],tan=Math.tan(fov/2),aspect=this.canvas.width/this.canvas.height,dir=[forward[0]+right[0]*ndcX*tan*aspect+up[0]*ndcY*tan,forward[1]+right[1]*ndcX*tan*aspect+up[1]*ndcY*tan,forward[2]+right[2]*ndcX*tan*aspect+up[2]*ndcY*tan],length=Math.hypot(...dir);return {origin:eye,dir:dir.map((value)=>value/length)};}
  folioPoint(clientX,clientY){if(scene.folioMinimized)return null;const ray=this.pointerRay(clientX,clientY);if(!ray)return null;const {origin:eye,dir}=ray,[fx,fy,fz]=FOLIO.center;if(Math.abs(dir[2])<1e-6)return null;const t=(fz-eye[2])/dir[2];if(t<=0)return null;const wx=eye[0]+dir[0]*t,wy=eye[1]+dir[1]*t,x0=fx-FOLIO.width/2,y0=fy-FOLIO.height/2;if(wx<x0||wx>x0+FOLIO.width||wy<y0||wy>y0+FOLIO.height)return null;return {x:(wx-x0)/FOLIO.width*this.overlay.width,y:(y0+FOLIO.height-wy)/FOLIO.height*this.overlay.height};}
  rayBox(ray,center,size){let near=0,far=Infinity;for(let axis=0;axis<3;axis++){const minimum=center[axis]-size[axis]/2,maximum=center[axis]+size[axis]/2,origin=ray.origin[axis],direction=ray.dir[axis];if(Math.abs(direction)<1e-7){if(origin<minimum||origin>maximum)return null;continue;}let a=(minimum-origin)/direction,b=(maximum-origin)/direction;if(a>b)[a,b]=[b,a];near=Math.max(near,a);far=Math.min(far,b);if(near>far)return null;}return far>=0?near:null;}
  pick(clientX,clientY){const point=this.folioPoint(clientX,clientY);if(point){const hit=[...this.hotspots].reverse().find((item)=>point.x>=item.x&&point.x<=item.x+item.w&&point.y>=item.y&&point.y<=item.y+item.h);if(hit){this.focus=hit.index;this.invalidate();safeScene(()=>handleSceneAction(hit.action));}return;}if(!scene.folioMinimized)return;const ray=this.pointerRay(clientX,clientY);if(!ray)return;const hit=WORLD_LABELS.filter((item)=>item.center&&item.action).map((item)=>({item,distance:this.rayBox(ray,item.center,item.size)})).filter((entry)=>entry.distance!==null).sort((a,b)=>a.distance-b.distance)[0];if(hit)this.activateLocus(hit.item.id);}
  keyboard(event){
    if(event.key==="Tab")return false;if(scene.bridge)return false;
    const loci=WORLD_LABELS.filter((item)=>item.action);
    if(scene.folioMinimized&&(event.key==="ArrowDown"||event.key==="ArrowRight")){this.worldFocus=Math.min(loci.length-1,this.worldFocus+1);scene.selectedLocus=loci[this.worldFocus].id;this.buildScene();this.uploadScene();this.labelAtlasDirty=true;announce(`${loci[this.worldFocus].title} selected. Press Enter to open.`);}
    else if(scene.folioMinimized&&(event.key==="ArrowUp"||event.key==="ArrowLeft")){this.worldFocus=Math.max(0,this.worldFocus-1);scene.selectedLocus=loci[this.worldFocus].id;this.buildScene();this.uploadScene();this.labelAtlasDirty=true;announce(`${loci[this.worldFocus].title} selected. Press Enter to open.`);}
    else if(scene.folioMinimized&&event.key==="Enter")return void this.activateLocus(scene.selectedLocus||loci[this.worldFocus].id);
    else if(event.key==="ArrowDown"||event.key==="ArrowRight")this.focus=Math.min(this.controls.length-1,this.focus+1);
    else if(event.key==="ArrowUp"||event.key==="ArrowLeft")this.focus=Math.max(0,this.focus-1);
    else if(event.key==="Enter")return void safeScene(()=>handleSceneAction(this.controls[this.focus]?.action));
    else if(event.key==="PageDown")scene.page+=1;
    else if(event.key==="PageUp")scene.page=Math.max(0,scene.page-1);
    else if(event.key==="/"){startBridge("search",scene.search);return true;}
    else if(event.key.toLowerCase()==="e"){if(scene.workspace==="operation-detail")startBridge("operation",scene.operationDraft);else if(scene.workspace==="plan-editor")startBridge("plan",scene.planDraft);else return false;return true;}
    else if(event.key.toLowerCase()==="a")this.yaw-=.12;
    else if(event.key.toLowerCase()==="d")this.yaw+=.12;
    else if(event.key.toLowerCase()==="w")this.pitch-=.1;
    else if(event.key.toLowerCase()==="s")this.pitch+=.1;
    else if(event.key==="+"||event.key==="=")this.distance-=2;
    else if(event.key==="-")this.distance+=2;
    else if(event.key==="0")this.resetCamera();
    else if(event.key.toLowerCase()==="t"){if(!event.repeat)this.toggleFolio();}
    else if(event.key==="Escape"){scene.workspace="home";scene.confirm=null;}
    else return false;
    this.constrainCamera();event.preventDefault();this.invalidate();return true;
  }
}

for(const type of OPERATION_COMMANDS)$("operationType").append(new Option(type,type));for(const action of PROJECT_PLAN_ACTIONS)$("planAction").append(new Option(action,action));
$("sceneTextBridge").addEventListener("input",()=>renderer?.invalidate());
$("sceneTextBridge").addEventListener("keydown",(event)=>{if(event.key==="Escape"){event.preventDefault();finishBridge(false);}else if(event.key==="Enter"&&(event.ctrlKey||event.metaKey)){event.preventDefault();finishBridge(true);}});
$("sceneTextBridge").addEventListener("blur",()=>{if(scene.bridge){scene.bridge.focusLost=true;announce("Text editor focus left the bridge; draft retained. Use scene Save or Cancel.");}});
$("return3d").addEventListener("click",leaveSemantic);
$("operationForm").addEventListener("submit",(event)=>{event.preventDefault();safeScene(async()=>{const type=$("operationType").value,form=new FormData(event.currentTarget),extra=JSON.parse(String(form.get("extra")||"{}")),artifactNames=lines(form.get("artifacts")),candidate={...record(extra),runId:form.get("runId"),text:form.get("text"),objective:form.get("objective"),repoPath:form.get("repoPath"),baseRef:form.get("baseRef"),sourceIterationId:form.get("sourceIterationId"),sourceRunId:form.get("sourceRunId"),acceptanceGateIds:lines(form.get("gateIds")),artifacts:artifactNames,evidenceArtifacts:artifactNames,targetGenerations:Number(form.get("targetGenerations")),id:form.get("recordId"),itemId:form.get("recordId"),adviceId:form.get("recordId"),gateId:form.get("recordId")};const payload=normalizeOperationPayload(type,candidate),confirmed=await semanticConfirm(type,{type,payload});if(!confirmed)return;await executeOperation(confirmed.type,confirmed.payload);});});
$("planForm").addEventListener("submit",(event)=>{event.preventDefault();safeScene(async()=>{const form=event.currentTarget,request=planRequest(form.elements.action.value,form.elements.content.value,form.elements.notes.value),confirmed=await semanticConfirm(request.type,request);if(!confirmed)return;await executePlan(confirmed.type,confirmed.payload,confirmed.expectedVersion);});});
function semanticConfirm(title,envelope){return new Promise((resolve)=>{const frozen=frozenClone(envelope);pendingSemanticConfirmation={resolve,envelope:frozen};$("confirmTitle").textContent=`Confirm ${title}`;$("confirmPayload").textContent=json(frozen);$("confirmCheck").checked=false;$("confirmDialog").showModal();});}
$("confirmDialog").addEventListener("close",()=>{if(!pendingSemanticConfirmation)return;const pending=pendingSemanticConfirmation,accepted=$("confirmDialog").returnValue==="send"&&$("confirmCheck").checked;pendingSemanticConfirmation=null;pending.resolve(accepted?pending.envelope:null);});
$("confirmSend").addEventListener("click",(event)=>{if(!$("confirmCheck").checked){event.preventDefault();announce("Exact payload review confirmation is required.");}});
$("resourceRun").addEventListener("change",(event)=>safeScene(async()=>{selectedRunId=event.target.value||null;if(selectedRunId)await client.selectRun(selectedRunId);}));
document.addEventListener("click",(event)=>{const documentButton=event.target.closest("[data-document]"),newAssistance=event.target.closest("[data-new-assistance]");if(documentButton)safeScene(()=>loadResource("document",documentButton.dataset.document));if(newAssistance)safeScene(async()=>{const detail=await client.createPlanAssistance(newAssistance.dataset.newAssistance);selectedAssistanceId=detail.id;});});
$("refreshPlans").addEventListener("click",()=>safeScene(()=>client.refreshPlans()));$("refreshAssistance").addEventListener("click",()=>safeScene(()=>client.listPlanAssistance()));
$("assistanceForm").addEventListener("submit",(event)=>{event.preventDefault();safeScene(async()=>{const detail=snapshot.assistanceDetail,message=String(new FormData(event.currentTarget).get("message"));if(!detail||detail.id!==selectedAssistanceId)throw new Error("Select a current assistance thread.");await client.messagePlanAssistance(detail.id,detail.version,message);event.currentTarget.reset();});});
$("proposalToDraft").addEventListener("click",()=>{const proposal=snapshot.assistanceDetail?.proposedContent;if(!proposal)return;setPlanDraft(json(proposal));$("planAction").value="project-plan.create";announce("Proposal copied to a shared editable unpersisted draft.");});
$("planForm").elements.content.addEventListener("input",(event)=>setPlanDraft(event.target.value));
window.addEventListener("keydown",(event)=>{if(event.key.toLowerCase()==="m"&&!event.target.matches("input,textarea,select")){document.body.classList.contains("semantic-mode")?leaveSemantic():enterSemantic("status");event.preventDefault();return;}if(event.key==="?"&&!event.target.matches("input,textarea,select")){scene.workspace="help";renderer?.invalidate();event.preventDefault();return;}if(!document.body.classList.contains("semantic-mode"))renderer?.keyboard(event);});
window.addEventListener("resize",applyResponsiveFolioGuard);
const motionQuery=matchMedia("(prefers-reduced-motion: reduce)");motionQuery.addEventListener("change",(event)=>{scene.reducedMotion=event.matches;renderer?.invalidate();announce(`Runtime reduced motion ${event.matches?"enabled":"disabled"}.`);});
window.addEventListener("beforeunload",()=>client.disconnect());
client.subscribe((next)=>{snapshot=next;renderSemantic();});
setPlanDraft(json(defaultPlanContent()));setSemanticEnabled(false);
renderer=new PalaceRenderer($("palace"));renderer.start();applyResponsiveFolioGuard();
client.connect().catch((error)=>announce(`Initial connection failed; polling fallback remains available: ${error.message}`));
