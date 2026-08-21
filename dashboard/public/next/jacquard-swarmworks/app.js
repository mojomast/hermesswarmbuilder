import * as THREE from "../../vendor/three.js";
import {
  createDashboardClient,
  WORKFLOW_PHASES,
  OPERATION_COMMANDS,
  PROJECT_PLAN_ACTIONS
} from "../../headless-dashboard-client.js";

const $ = (id) => document.getElementById(id);
const arr = (value) => Array.isArray(value) ? value : value && typeof value === "object" ? Object.values(value) : [];
const records = (value) => Array.isArray(value) ? value : value && typeof value === "object" && (value.id || value.runId) ? [value] : arr(value);
const first = (...values) => values.find((value) => value !== undefined && value !== null && value !== "") ?? "";
const idOf = (value, fallback = "unknown") => String(first(value?.id, value?.runId, value?.planId, value?.gateId, value?.name, fallback));
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const textOf = (value, limit = 50000) => {
  let text;
  try { text = typeof value === "string" ? value : JSON.stringify(value, null, 2); } catch { text = String(value); }
  return text.length > limit ? `${text.slice(0, limit)}\n... ${text.length - limit} characters omitted` : text;
};
const lines = (value) => String(value || "").split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
const plain = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const client = createDashboardClient({ maxEvents: 1200, eventLimit: 400, auditLimit: 200, pauseBufferLimit: 3000 });

if (OPERATION_COMMANDS.length !== 30 || PROJECT_PLAN_ACTIONS.length !== 9) throw new Error("Jacquard command catalog is out of sync");

let snapshot = client.getSnapshot();
let semanticTab = "overview";
let objects = [];
let selectedKey = "system:loom";
let resource = null;
let selectedPlanId = null;
let selectedAssistanceId = null;
let proposalDraft = null;
let planEditDraft = null;
let receiptSerial = 0;
let renderQueued = false;
let resourceRevision = 0;
let observationRevision = 0;
let semanticDirty = false;
const receipts = [];
const ui = { workspace: "STATUS", commandIndex: 0, planActionIndex: 0, assistActionIndex: 0, resourceIndex: 0, transportIndex: 0, editMode: null, confirm: null, payloads: new Map(), editedPayloads: new Set(), search: "", notesBySubject: new Map(), assistanceMessage: "" };
const TRANSPORT_ACTIONS = ["refresh", "freeze/resume", "disconnect/reconnect", "search"];
const ASSIST_ACTIONS = ["new-classic", "new-managed", "refresh-threads", "previous-thread", "next-thread", "message", "stage-proposal", "edit-proposal", "create-draft"];
const CONFIRM_PAGE_SIZE = 520;

function announce(message) { $("canvasStatus").textContent = message; }
function currentRunId() { return snapshot.state?.currentRunId || null; }
function currentBlocker() {
  const candidates = [snapshot.state?.blocker, snapshot.state?.block, ...arr(snapshot.state?.blockers)];
  const value = candidates.find((item) => item && !(typeof item === "object" && ["resolved", "cleared", "closed"].includes(String(item.status || "").toLowerCase())));
  if (!value && /block|error|fail/i.test(String(snapshot.state?.status || snapshot.state?.phase || ""))) return { reason: first(snapshot.state?.lastAction, snapshot.state?.message, snapshot.state?.status, "Blocked state reported"), runId: currentRunId(), status: first(snapshot.state?.status, snapshot.state?.phase, "blocked") };
  if (!value) return null;
  return typeof value === "string" ? { reason: value, runId: currentRunId() } : value;
}
function sampleAge() {
  const stamp = first(snapshot.connection?.lastMessageAt, snapshot.connection?.lastRefreshAt);
  const seconds = Math.floor((Date.now() - Date.parse(stamp)) / 1000);
  return Number.isFinite(seconds) ? `${Math.max(0, seconds)}s` : "NO SAMPLE";
}
function agents() {
  const map = new Map();
  for (const agent of arr(snapshot.state?.agents)) map.set(idOf(agent), agent);
  for (const event of snapshot.events.slice(-400)) {
    const id = first(event.agentId, event.data?.agentId);
    if (id && !map.has(id)) map.set(String(id), { id, status: "event-observed", runId: event.runId, lastEvent: event });
  }
  return [...map.values()];
}
function runEvents(runId) { return snapshot.events.filter((event) => event.runId === runId || event.data?.runId === runId); }
function selectedObject() { return objects.find((item) => item.key === selectedKey) || objects[0]; }
function objectRunId(item = selectedObject()) { return item?.type === "run" ? item.id : first(item?.runId, item?.data?.runId, item?.data?.sourceRunId) || null; }
function receipt(type, status, detail = {}) {
  const item = { id: ++receiptSerial, type, status, at: new Date().toISOString(), ...detail };
  receipts.unshift(item); receipts.splice(80); renderSemantic(); scene?.updateConsole();
  announce(`${type}: ${status}${item.commandId ? `, receipt ${item.commandId}` : ""}`);
  return item;
}
function confirmationText(){if(!ui.confirm)return "";const text=String(ui.confirm.preview||""),pages=Math.max(1,Math.ceil(text.length/CONFIRM_PAGE_SIZE)),page=clamp(ui.confirm.page||0,0,pages-1);ui.confirm.page=page;return `CONFIRM PAGE ${page+1}/${pages}\n${text.slice(page*CONFIRM_PAGE_SIZE,(page+1)*CONFIRM_PAGE_SIZE)}`;}

function deriveObjects() {
  const next = [{ key: "system:loom", type: "system", id: "loom", label: "Control loom", status: first(snapshot.state?.phase, "idle"), runId: currentRunId(), data: snapshot.state || {} }];
  snapshot.runs.slice(0, 24).forEach((item) => next.push({ key: `run:${idOf(item)}`, type: "run", id: idOf(item), label: first(item.objective, item.name, item.id), status: first(item.status, item.phase, "unknown"), runId: idOf(item), data: item }));
  agents().slice(0, 24).forEach((item) => next.push({ key: `agent:${idOf(item)}`, type: "agent", id: idOf(item), label: first(item.label, item.role, item.name, item.id), status: first(item.status, "unknown"), runId: first(item.runId, item.currentRunId), data: item }));
  arr(snapshot.queue?.items).slice(0, 20).forEach((item) => next.push({ key: `queue:${idOf(item)}`, type: "queue", id: idOf(item), label: first(item.title, item.objective, item.id), status: first(item.status, "queued"), runId: item.runId, data: item }));
  arr(snapshot.gates?.gates).slice(0, 20).forEach((item) => next.push({ key: `gate:${idOf(item)}`, type: "gate", id: idOf(item), label: first(item.title, item.description, item.id), status: first(item.status, "pending"), runId: item.runId, data: item }));
  snapshot.iterations.slice(0, 30).forEach((item) => next.push({ key: `iteration:${idOf(item)}`, type: "iteration", id: idOf(item), label: first(item.objective, item.id), status: first(item.status, "lineage"), runId: first(item.runId, item.sourceRunId), data: item }));
  snapshot.plans.slice(0, 24).forEach((item) => next.push({ key: `plan:${idOf(item)}`, type: "plan", id: idOf(item), label: first(item.title, item.planId), status: first(item.state, "draft"), runId: item.runId, data: item }));
  snapshot.events.slice(-160).forEach((event) => {
    const type = event.data?.toolCallId || event.data?.toolName || String(event.type).includes("tool") ? "tool" : "event";
    next.push({ key: `${type}:${event.id}`, type, id: event.id, label: first(event.data?.toolName, event.message, event.type), status: first(event.data?.status, event.level, "observed"), runId: event.runId, data: event });
  });
  objects = next;
  if (!objects.some((item) => item.key === selectedKey)) selectedKey = "system:loom";
}

function planLimits(source = {}, maxIterations = 1) {
  const integer = (key, fallback, low, high) => clamp(Number.isInteger(Number(source[key])) ? Number(source[key]) : fallback, low, high);
  const variants = integer("maxVariantsPerIteration", 3, 1, 5);
  return {
    maxIterations: integer("maxIterations", maxIterations, 1, 10),
    maxVariantsPerIteration: variants,
    maxParallelVariants: Math.min(variants, integer("maxParallelVariants", 3, 1, 5)),
    maxAcceptedFeatures: integer("maxAcceptedFeatures", 4, 1, 4),
    maxVisualMotifChanges: integer("maxVisualMotifChanges", 1, 0, 1),
    maxNewSections: integer("maxNewSections", 1, 0, 1),
    stopAfterNoImprovement: integer("stopAfterNoImprovement", 1, 1, 3)
  };
}
function iterationLimits(source = {}, maxIterations = 1) { return { ...planLimits(source, maxIterations), minImprovementScore: clamp(Number(source.minImprovementScore) || 0.05, 0, 1) }; }
function gateSnapshot(gate) {
  return { id: String(gate.id || ""), description: String(first(gate.description, gate.title)), severity: gate.severity === "should" ? "should" : "must", required: gate.required !== false, requiredEvidence: arr(gate.requiredEvidence).map(String) };
}
function iterationPayload(type, source = {}, overrides = {}, exactDetail = null) {
  const historical = ["continue-from-iteration", "fork-from-iteration", "use-as-next-direction"].includes(type);
  const state = exactDetail?.iterationState || {};
  const sourceGates = historical ? arr(state.acceptanceGates) : arr(snapshot.gates?.gates);
  const authoritativeGateIds = arr(state.acceptanceGateIds).length ? arr(state.acceptanceGateIds) : sourceGates.map((gate) => gate.id);
  const requestedGateIds = (historical ? authoritativeGateIds : arr(overrides.acceptanceGateIds)).map(String);
  const gateMap = new Map(sourceGates.filter((gate) => !requestedGateIds.length || requestedGateIds.includes(String(gate.id))).map((gate) => [String(gate.id), gateSnapshot(gate)]));
  const sourceRunId = historical ? exactDetail?.runId : first(overrides.sourceRunId, source.runId, source.sourceRunId, state.runId) || null;
  const sourceIterationId = historical ? exactDetail?.id : first(overrides.sourceIterationId, source.id, source.iterationId, state.id) || null;
  const payload = {
    sourceRunId,
    sourceIterationId,
    repoPath: String(historical ? first(state.repoPath, source.repoPath) : first(overrides.repoPath, source.repoPath, state.repoPath, snapshot.control?.autoIteration?.repoPath, snapshot.state?.repoPath)).trim(),
    baseRef: String(historical ? first(state.baseRef, source.baseRef, source.commit, "HEAD") : first(overrides.baseRef, source.baseRef, source.commit, state.baseRef, "HEAD")).trim(),
    objective: String(first(overrides.objective, source.objective, state.objective, snapshot.control?.currentObjective?.text, snapshot.state?.objective)).trim(),
    changeText: String(first(overrides.changeText, source.nextRecommendedDirection, source.steeringText, state.changeText, "Complete one bounded objective-linked change without unrelated stack churn.")).trim(),
    acceptanceGateIds: requestedGateIds.length ? requestedGateIds : [...gateMap.keys()].filter(Boolean),
    snapshottedAcceptanceGates: [...gateMap.values()].filter((gate) => gate.id),
    limits: historical ? iterationLimits(state.limits || source.limits || {}) : iterationLimits(overrides.limits || {}, Number(overrides.targetGenerations) || 1),
    sourceEvidencePolicy: "load-from-source-run"
  };
  if (!payload.repoPath.startsWith("/")) throw localError("Iteration repository path must be absolute");
  if (!payload.objective || !payload.changeText || !payload.baseRef) throw localError("Base ref, objective, and bounded change are required");
  if (historical && (!exactDetail || String(overrides.sourceIterationId || "") !== exactDetail.id || String(overrides.sourceRunId || "") !== exactDetail.runId)) throw localError("Historical lineage requires input identities matching the loaded source detail");
  if (historical && gateMap.size !== requestedGateIds.length) throw localError("Loaded source detail is missing an authoritative acceptance gate snapshot");
  if (historical && (!plain(state.limits) || !arr(state.acceptanceGates).length && requestedGateIds.length)) throw localError("Loaded source detail lacks authoritative limits or gate snapshots");
  if (overrides.queueItemId) payload.queueItemId = String(overrides.queueItemId);
  if (type === "start-showcase-loop") payload.targetGenerations = Number(overrides.targetGenerations);
  return payload;
}

function defaultPayload(type) {
  const runId = currentRunId();
  const selected = selectedObject();
  const source = selected?.type === "iteration" ? selected.data : snapshot.iterations.find((item) => item.runId === objectRunId(selected)) || {};
  const adviceItems = records(snapshot.control?.deblockAdvice).length ? records(snapshot.control.deblockAdvice) : records(snapshot.control?.advice);
  const steeringItems = records(snapshot.control?.activeSteering).length ? records(snapshot.control.activeSteering) : records(snapshot.control?.steering).length ? records(snapshot.control.steering) : records(snapshot.control?.steeringDirectives);
  if (["start-next-iteration", "continue-from-iteration", "fork-from-iteration", "use-as-next-direction"].includes(type)) return { sourceRunId: first(source.runId, source.sourceRunId) || null, sourceIterationId: first(source.id, source.iterationId) || null, repoPath: first(source.repoPath, snapshot.control?.autoIteration?.repoPath, snapshot.state?.repoPath), baseRef: first(source.baseRef, source.commit, "HEAD"), objective: first(source.objective, snapshot.control?.currentObjective?.text, snapshot.state?.objective), changeText: first(source.nextRecommendedDirection, source.steeringText, "Complete one bounded objective-linked change."), acceptanceGateIds: arr(source.acceptanceGateIds), limits: iterationLimits(source.limits) };
  const map = {
    pause: {}, hold: {}, resume: {}, unhold: {}, stop: {}, "run-now": { runId }, steer: { text: "", scope: "current_run", priority: "required" },
    deblock: { runId, prompt: "" }, "deblock-advice": { runId, prompt: "Recommend the smallest safe recovery." },
    "approve-deblock-advice": { adviceId: adviceItems[0]?.id || "" }, "deny-deblock-advice": { adviceId: adviceItems[0]?.id || "" }, "remove-steering": { steeringId: steeringItems[0]?.id || "" },
    "set-current-objective": { text: first(snapshot.control?.currentObjective?.text, snapshot.state?.objective) }, "start-showcase-loop": { sourceRunId: runId, sourceIterationId: source.id || null, repoPath: first(source.repoPath, snapshot.control?.autoIteration?.repoPath, snapshot.state?.repoPath), baseRef: first(source.baseRef, source.commit, "HEAD"), objective: first(source.objective, snapshot.control?.currentObjective?.text, snapshot.state?.objective), changeText: "Complete one bounded showcase generation.", targetGenerations: 3, acceptanceGateIds: arr(snapshot.gates?.gates).map((gate) => gate.id), limits: iterationLimits({}, 3) }, "pause-showcase-loop": {}, "resume-showcase-loop": {}, "stop-showcase-loop": {}, "set-showcase-target": { targetGenerations: 3 },
    "gate-decision": { gateId: selected?.type === "gate" ? selected.id : "", runId: objectRunId(), status: "needs-evidence", decision: "defer", evidenceArtifacts: [], notes: "" },
    "attach-gate-evidence": { gateId: selected?.type === "gate" ? selected.id : "", runId: objectRunId(), artifacts: [], notes: "" },
    "add-queue-item": { title: "", objective: "", context: "", constraints: [], priority: 50, acceptanceGateIds: [], target: {} }, "clear-queue": {},
    "pin-queue-item": { itemId: selected?.type === "queue" ? selected.id : "" }, "archive-queue-item": { itemId: selected?.type === "queue" ? selected.id : "" },
    "add-gate": { id: "", phase: "final-audit", description: "", severity: "must", requiredEvidence: [] }, "update-gate": { gateId: selected?.type === "gate" ? selected.id : "", description: "" }
  };
  return map[type] || {};
}
function payloadFor(type) {
  if (!ui.payloads.has(type) || !ui.editedPayloads.has(type)) {
    try { ui.payloads.set(type, textOf(defaultPayload(type))); } catch (error) { ui.payloads.set(type, textOf({ error: error.message, repoPath: "", objective: "", changeText: "" })); }
  }
  return ui.payloads.get(type);
}
function parsePayload(type, value = payloadFor(type)) {
  let parsed;
  try { parsed = JSON.parse(value); } catch { throw localError("Payload must be valid JSON"); }
  if (!plain(parsed)) throw new Error("Payload must be a JSON object");
  validateCommandShape(type, parsed);
  return parsed;
}
function localError(message) { return Object.assign(new Error(message), { localValidation: true }); }
function requireText(value, message) { if (typeof value !== "string" || !value.trim()) throw localError(message); }
const ITERATION_INPUT_KEYS = ["sourceRunId","sourceIterationId","repoPath","baseRef","objective","changeText","acceptanceGateIds","limits","queueItemId","targetGenerations"];
const OPERATION_KEYS = Object.freeze({
  pause:[],hold:[],resume:[],unhold:[],stop:[],"run-now":["runId"],steer:["text","scope","priority"],deblock:["runId","prompt"],"deblock-advice":["runId","prompt"],"approve-deblock-advice":["adviceId"],"deny-deblock-advice":["adviceId"],"remove-steering":["steeringId"],"set-current-objective":["text"],"start-next-iteration":ITERATION_INPUT_KEYS,"continue-from-iteration":ITERATION_INPUT_KEYS,"fork-from-iteration":ITERATION_INPUT_KEYS,"use-as-next-direction":ITERATION_INPUT_KEYS,"start-showcase-loop":ITERATION_INPUT_KEYS,"pause-showcase-loop":[],"resume-showcase-loop":[],"stop-showcase-loop":[],"set-showcase-target":["targetGenerations"],"gate-decision":["gateId","runId","status","decision","evidenceArtifacts","notes"],"attach-gate-evidence":["gateId","runId","artifacts","notes"],"add-queue-item":["title","objective","context","constraints","priority","acceptanceGateIds","target"],"clear-queue":[],"pin-queue-item":["itemId"],"archive-queue-item":["itemId"],"add-gate":["id","phase","description","severity","requiredEvidence"],"update-gate":["gateId","description"]
});
function sanitizeCommandInput(type,input){if(!OPERATION_COMMANDS.includes(type)||!Object.hasOwn(OPERATION_KEYS,type))throw localError(`Unsupported operation ${type}`);if(!plain(input))throw localError("Payload must be a JSON object");const allowed=OPERATION_KEYS[type],unknown=Object.keys(input).filter((key)=>!allowed.includes(key));if(unknown.length)throw localError(`${type} does not allow payload field(s): ${unknown.join(", ")}`);return Object.fromEntries(allowed.filter((key)=>input[key]!==undefined).map((key)=>[key,structuredClone(input[key])]));}
function validateCommandShape(type, payload) {
  if (!plain(payload)) throw localError("Payload must be a JSON object");
  if (type === "steer") { requireText(payload.text, "Steering text is required"); if (!["current_run", "next_run", "queue"].includes(payload.scope)) throw localError("Steering scope must be current_run, next_run, or queue"); }
  if (["deblock", "deblock-advice"].includes(type)) { requireText(payload.runId, "Current run ID is required"); requireText(payload.prompt, "Recovery prompt is required"); }
  if (["approve-deblock-advice", "deny-deblock-advice"].includes(type)) requireText(payload.adviceId, "Advice ID is required");
  if (type === "remove-steering") requireText(first(payload.steeringId, payload.id), "Steering ID is required");
  if (type === "set-current-objective") requireText(payload.text, "Objective text is required");
  if (["set-showcase-target", "start-showcase-loop"].includes(type) && (!Number.isInteger(Number(payload.targetGenerations)) || Number(payload.targetGenerations) < 1 || Number(payload.targetGenerations) > 10)) throw localError("Showcase target must be an integer from 1 through 10");
  if (["pin-queue-item", "archive-queue-item"].includes(type)) requireText(first(payload.itemId, payload.id), "Queue item ID is required");
  if (type === "add-queue-item") { requireText(payload.title, "Queue title is required"); requireText(payload.objective, "Queue objective is required"); }
  if (type === "add-queue-item" && (!Number.isFinite(Number(payload.priority)) || Number(payload.priority) < 0 || Number(payload.priority) > 100)) throw localError("Queue priority must be from 0 through 100");
  if (type === "add-gate") requireText(payload.description, "Gate description is required");
  if (["update-gate", "gate-decision", "attach-gate-evidence"].includes(type)) requireText(payload.gateId, "Gate ID is required");
  if (["gate-decision", "attach-gate-evidence"].includes(type)) requireText(payload.runId, "An explicit evidence-owning run ID is required");
  if (type === "gate-decision" && (!["passed","failed","needs-evidence"].includes(payload.status) || !["accepted","rejected","defer"].includes(payload.decision))) throw localError("Gate decision status or decision value is invalid");
  if (type === "attach-gate-evidence" && !arr(first(payload.artifacts, payload.evidenceArtifacts)).length) throw localError("At least one evidence artifact path is required");
}
function buildPreparedCommand(type,input,exactDetail=null){
  const sanitized=sanitizeCommandInput(type,input);validateCommandShape(type,sanitized);
  const historical = ["continue-from-iteration", "fork-from-iteration", "use-as-next-direction"].includes(type);
  if (historical) {
    const iterationId = String(sanitized.sourceIterationId || ""); requireText(iterationId, "Source iteration ID is required");
    if(exactDetail?.id!==iterationId)throw localError("Loaded lineage detail identity changed");
    const source = snapshot.iterations.find((item) => item.id === iterationId) || {};
    return iterationPayload(type, source, sanitized, exactDetail);
  }
  if (type === "start-next-iteration") return iterationPayload(type, {}, sanitized);
  if (type === "start-showcase-loop") {
    return iterationPayload(type, {}, sanitized);
  }
  if(["gate-decision","attach-gate-evidence"].includes(type)){
    if(!snapshot.runs.some((run)=>run.id===sanitized.runId))throw localError(`Owning run ${sanitized.runId} is not in the authoritative run register`);
    if(!arr(snapshot.gates?.gates).some((gate)=>gate.id===sanitized.gateId))throw localError(`Gate ${sanitized.gateId} is not in the authoritative gate register`);
  }
  return sanitized;
}
async function prepareCommand(type, input) {
  const sanitized=sanitizeCommandInput(type,input),historical=["continue-from-iteration","fork-from-iteration","use-as-next-direction"].includes(type);
  if(!historical)return buildPreparedCommand(type,sanitized);
  const iterationId=String(sanitized.sourceIterationId||"");requireText(iterationId,"Source iteration ID is required");
  const detail=await client.loadIterationDetail(iterationId);
  return buildPreparedCommand(type,sanitized,detail);
}
async function verifyRecovery(type, payload) {
  if (!["deblock", "deblock-advice", "approve-deblock-advice", "deny-deblock-advice"].includes(type)) return;
  await Promise.all([client.refreshState(), client.refreshControl()]); snapshot = client.getSnapshot();
  const adviceItems = records(snapshot.control?.deblockAdvice).length ? records(snapshot.control.deblockAdvice) : records(snapshot.control?.advice);
  const advice = ["approve-deblock-advice", "deny-deblock-advice"].includes(type) ? adviceItems.find((item) => item.id === payload.adviceId && !["approved","denied","resolved","expired"].includes(String(item.status||"pending").toLowerCase())) : null;
  if (["approve-deblock-advice", "deny-deblock-advice"].includes(type) && !advice) throw localError("The pending advice no longer exists; no request was sent");
  if (type === "deny-deblock-advice") return;
  const blocker = currentBlocker(), runId = currentRunId(), targetRunId = first(advice?.runId, payload.runId);
  if (!runId || targetRunId !== runId || !blocker || blocker.runId && blocker.runId !== runId) throw localError("Recovery is current-run only and the matching blocker is not currently observed");
}
function stableJson(value){if(value===null||typeof value!=="object")return JSON.stringify(value);if(Array.isArray(value))return `[${value.map(stableJson).join(",")}]`;return `{${Object.keys(value).sort().map((key)=>`${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;}
function deepFreeze(value){if(!value||typeof value!=="object"||Object.isFrozen(value))return value;Object.freeze(value);for(const child of Object.values(value))deepFreeze(child);return value;}
function recoveryAuthority(){const advice=records(snapshot.control?.deblockAdvice).length?records(snapshot.control.deblockAdvice):records(snapshot.control?.advice);return stableJson({runId:currentRunId(),blocker:currentBlocker(),advice});}
function queueAuthority(){return {queue:snapshot.queue,control:{pinnedQueueItemId:snapshot.control?.pinnedQueueItemId||null,pendingIterationRequest:first(snapshot.control?.nextIterationRequest,snapshot.control?.pendingIterationRequest,snapshot.control?.autoIteration?.pendingRequest,null),steering:records(snapshot.control?.activeSteering).concat(records(snapshot.control?.steering))}};}
function queueImpact(){const items=arr(snapshot.queue?.items);return {itemCount:items.length,itemIds:items.map((item)=>item.id),pinnedQueueItemId:snapshot.control?.pinnedQueueItemId||null,pendingIterationRequest:first(snapshot.control?.nextIterationRequest,snapshot.control?.pendingIterationRequest,snapshot.control?.autoIteration?.pendingRequest,null),queueLinkedSteering:records(snapshot.control?.activeSteering).concat(records(snapshot.control?.steering)).filter((item)=>item.scope==="queue"||item.queueItemId)};}
async function prepareCommandReview(type,input){const payload=deepFreeze(await prepareCommand(type,input));let authority=null;if(["continue-from-iteration","fork-from-iteration","use-as-next-direction"].includes(type)){const detail=await client.loadIterationDetail(payload.sourceIterationId);authority=stableJson({id:detail.id,runId:detail.runId,state:detail.iterationState});}else if(["start-next-iteration","start-showcase-loop"].includes(type))authority=stableJson(snapshot.gates);else if(["deblock","deblock-advice","approve-deblock-advice","deny-deblock-advice"].includes(type)){await Promise.all([client.refreshState(),client.refreshControl()]);snapshot=client.getSnapshot();await verifyRecovery(type,payload);authority=recoveryAuthority();}else if(["gate-decision","attach-gate-evidence"].includes(type))authority=stableJson({run:snapshot.runs.find((run)=>run.id===payload.runId),gate:arr(snapshot.gates?.gates).find((gate)=>gate.id===payload.gateId)});else if(type==="clear-queue")authority=stableJson(queueAuthority());const impact=type==="clear-queue"?deepFreeze(queueImpact()):null;const review={kind:"command",key:`command:${type}`,type,payload,authority,impact,page:0};review.preview=textOf({type,payload,...(impact?{completeImpactPreview:impact}:{})});return review;}
async function revalidateCommandReview(review){if(!review||review.kind!=="command")throw localError("No frozen command review is available");const {type,payload}=review;let current=null;if(["continue-from-iteration","fork-from-iteration","use-as-next-direction"].includes(type)){const detail=await client.loadIterationDetail(payload.sourceIterationId);current=stableJson({id:detail.id,runId:detail.runId,state:detail.iterationState});}else if(["start-next-iteration","start-showcase-loop"].includes(type)){await client.refreshGates();snapshot=client.getSnapshot();current=stableJson(snapshot.gates);}else if(["deblock","deblock-advice","approve-deblock-advice","deny-deblock-advice"].includes(type)){await Promise.all([client.refreshState(),client.refreshControl()]);snapshot=client.getSnapshot();await verifyRecovery(type,payload);current=recoveryAuthority();}else if(["gate-decision","attach-gate-evidence"].includes(type)){await Promise.all([client.refreshRuns(),client.refreshGates()]);snapshot=client.getSnapshot();current=stableJson({run:snapshot.runs.find((run)=>run.id===payload.runId),gate:arr(snapshot.gates?.gates).find((gate)=>gate.id===payload.gateId)});}else if(type==="clear-queue"){await Promise.all([client.refreshQueue(),client.refreshControl()]);snapshot=client.getSnapshot();current=stableJson(queueAuthority());}if(review.authority!==null&&current!==review.authority)throw localError("Authoritative state changed after review; nothing was sent. Review the updated exact request again");}
async function sendCommandReview(review) {
  await revalidateCommandReview(review);
  const {type,payload}=review;
  const record = receipt(type, "pending", { payload, review:review.preview });
  try {
    const correlationId = crypto.randomUUID?.() || `jacquard-${Date.now()}`;
    const result = await client.command(type, payload, { correlationId, idempotencyKey: `${type}-${correlationId}`, refresh: false });
    Object.assign(record, { status: "accepted intent", result, commandId: result?.commandId || null });
    announce(`${type} accepted intent; inspect observed telemetry for outcome.`);
    const request = ++observationRevision;
    client.refresh().then(() => { if (request === observationRevision) { record.observation = "refresh completed; inspect observed state"; renderAll(); } }).catch((error) => { record.observation = `accepted POST; observation refresh unavailable: ${error.message}`; renderSemantic(); scene?.updateConsole(); });
    return result;
  } catch (error) {
    Object.assign(record, { status: error.status == null ? "outcome unknown" : "rejected", error: error.message });
    error.recorded = true;
    announce(`${type} ${record.status}: ${error.message}`); throw error;
  } finally { renderSemantic(); scene?.updateConsole(); }
}
async function dispatchCommand(type,payload){const review=await prepareCommandReview(type,payload);await sendCommandReview(review);}
function exactPlanSubject(detail = snapshot.planDetail) {
  const ledger = detail?.ledger, revision = detail?.revision;
  if (!ledger || !revision || ledger.currentRevision !== revision.revision || ledger.currentDigest !== revision.contentDigest) throw localError("Loaded revision and digest do not exactly match the current plan ledger");
  return { planId: ledger.planId, revision: revision.revision, planDigest: revision.contentDigest };
}
const PLAN_LIMIT_KEYS=["maxIterations","maxVariantsPerIteration","maxParallelVariants","maxAcceptedFeatures","maxVisualMotifChanges","maxNewSections","stopAfterNoImprovement"];
function validatePlanContent(content){if(!plain(content))throw localError("Plan content must be an object");if(!["classic","managed"].includes(content.pipelineType))throw localError("Plan pipelineType must be classic or managed");for(const key of ["title","problem","intendedUsers","objective","boundedScope"])requireText(content[key],`Plan ${key} is required`);const limits=content.limits;if(!plain(limits)||Object.keys(limits).length!==7||PLAN_LIMIT_KEYS.some((key)=>!Object.hasOwn(limits,key)))throw localError("Plan limits must contain exactly the seven canonical keys");const normalized=planLimits(limits,limits.maxIterations);if(PLAN_LIMIT_KEYS.some((key)=>Number(limits[key])!==normalized[key]))throw localError("Plan limits contain an out-of-range or non-integer value");if(content.pipelineType==="managed"&&content.repository?.path&&!String(content.repository.path).startsWith("/"))throw localError("Managed repository path must be absolute");}
function planNoteKey(action,detail=snapshot.planDetail){return `${detail?.ledger?.planId||"new"}:${detail?.revision?.revision||"draft"}:${action}`;}
function currentPlanNote(action){return ui.notesBySubject.get(planNoteKey(action))||"";}
function preparePlanRequest(action, extra = {}) {
  if (!PROJECT_PLAN_ACTIONS.includes(action)) throw localError("Unsupported plan action");
  const detail = snapshot.planDetail;
  let payload;
  let expectedVersion;
  if (action === "project-plan.create") { payload = { content: extra.content || proposalDraft }; if(!plain(payload.content))throw localError("Create requires a plan draft object"); }
  else if (action === "project-plan.update") {
    if (!detail) throw localError("Load a plan before updating");
    payload = { planId: detail.ledger.planId, content: extra.content || planEditDraft || detail.revision.content }; if(!plain(payload.content))throw localError("Update requires a plan draft object");expectedVersion = detail.ledger.version;
  } else {
    const subject = exactPlanSubject(detail); expectedVersion = detail.ledger.version;
    payload = action === "project-plan.archive" ? { planId: subject.planId } : { ...subject };
    if (["project-plan.approve", "project-plan.reject"].includes(action)) payload.notes = String(extra.notes ?? currentPlanNote(action)).trim();
    if (action === "project-plan.reject" && !payload.notes) throw localError("Rejection notes are required");
    if (["project-plan.clone", "project-plan.fork"].includes(action)){const iteration=snapshot.iterationDetail,iterationId=snapshot.selectedIterationId;if(!iterationId||iteration?.id!==iterationId||!iteration.runId)throw localError("Clone/fork requires a loaded authoritative source iteration");if(!snapshot.iterations.some((item)=>item.id===iterationId&&item.runId===iteration.runId)||!snapshot.runs.some((run)=>run.id===iteration.runId))throw localError("Clone/fork source run and iteration no longer match the authoritative registers");Object.assign(payload,{sourceRunId:iteration.runId,sourceIterationId:iteration.id,baseRef:detail.revision.content?.pipelineType==="managed"?first(iteration.iterationState?.baseRef,iteration.baseRef,detail.revision.content.repository?.baseRef,"HEAD"):null});}
  }
  return { action, payload, expectedVersion, revision: detail?.revision?.revision ?? null, digest: detail?.revision?.contentDigest ?? null };
}
function preparePlanReview(action,extra={}){const request=deepFreeze(preparePlanRequest(action,extra)),authority=action==="project-plan.create"?null:stableJson({ledger:snapshot.planDetail?.ledger,revision:snapshot.planDetail?.revision});const review={kind:"plan",key:`plan:${action}`,request,authority,page:0};review.preview=textOf(request);return review;}
async function revalidatePlanReview(review){if(!review||review.kind!=="plan")throw localError("No frozen plan review is available");if(review.authority===null)return;const detail=await client.getProjectPlan(review.request.payload.planId);const current=stableJson({ledger:detail.ledger,revision:detail.revision});if(current!==review.authority)throw localError("Plan authority changed after review; nothing was sent. Review the new version, revision, and digest");}
async function sendPlanReview(review) {
  await revalidatePlanReview(review);
  const {action,payload,expectedVersion}=review.request;
  const record = receipt(action, "pending", { payload, expectedVersion });
  try {
    const result = await client.projectPlanCommand(action, payload, { expectedVersion, refresh: false });
    Object.assign(record, { status: "accepted intent", result });
    if(action==="project-plan.create"){proposalDraft=null;planEditDraft=null;}
    if(["project-plan.approve","project-plan.reject"].includes(action))ui.notesBySubject.delete(planNoteKey(action));
    client.refreshPlans().then(() => {record.observation="plan register refresh completed; inspect observed ledger";scene?.updateConsole();renderSemantic();return result?.planId&&loadPlan(result.planId);}).catch((error) => { record.observation = `accepted POST; plan observation refresh unavailable: ${error.message}`;scene?.updateConsole();renderSemantic(); });
    announce(`${action} accepted intent; verify the observed plan ledger.`); return result;
  } catch (error) {
    Object.assign(record, { status: error.status == null ? "outcome unknown" : "rejected", error: error.message });
    error.recorded = true;
    announce(`${action} ${record.status}: ${error.message}`); throw error;
  } finally { renderSemantic(); scene?.updateConsole(); }
}
async function dispatchPlan(action,extra={}){const review=preparePlanReview(action,extra);await sendPlanReview(review);}
function planDefaults(pipelineType) {
  return { pipelineType, title: "", problem: "", intendedUsers: "", objective: "", boundedScope: "", requirements: [], nonGoals: [], constraints: [], risks: [], repository: { path: null, baseRef: null, baseCommit: null }, acceptanceGates: [], validationPolicy: { id: "apb.runner-selected.v1", expectations: [], clientCommandsAllowed: false }, milestones: [], limits: planLimits(), lineage: { mode: "new", sourcePlanId: null, sourceRevision: null, sourceRunId: null, sourceIterationId: null } };
}
async function loadPlan(planId) { selectedPlanId = planId; await client.getProjectPlan(planId); snapshot = client.getSnapshot(); renderAll(); }
async function assistanceMutation(type,payload,execute){const record=receipt(type,"pending",{payload});try{const result=await execute();Object.assign(record,{status:"accepted intent",result});announce(`${type} accepted; returned thread state is observed.`);return result;}catch(error){Object.assign(record,{status:error.status==null?"outcome unknown":"rejected",error:error.message});error.recorded=true;throw error;}finally{renderSemantic();scene?.updateConsole();}}
async function loadResource(kind, name, runId) {
  if (!runId) throw localError("Resource has no explicit owning run");
  const request = ++resourceRevision, guard = { key: selectedKey, runId };
  if (snapshot.selectedRunId !== runId) await client.selectRun(runId);
  let result;
  if (kind === "run") result = client.getSnapshot().selectedRun.run;
  if (kind === "artifact") result = await client.loadArtifact(name, runId);
  if (kind === "log") result = await client.loadLog(name, runId, { tail: 400 });
  if (kind === "document") result = await client.loadDocument(name, runId);
  const current=client.getSnapshot();
  if (request !== resourceRevision || selectedKey !== guard.key || objectRunId() !== guard.runId || current.selectedRunId !== runId || current.selectedRun?.run?.id !== runId) return;
  resource = { kind, name: name || "run record", runId, text: result?.text || textOf(result) };
  renderSemantic(); scene?.updateConsole();
}

// Scene construction: a mechanical loom plus canvas-textured operator cards.
class LoomScene {
  constructor(canvas) {
    this.canvas = canvas; this.renderer = null; this.scene = null; this.camera = null; this.root = null; this.dynamic = null;
    this.targets = []; this.ray = new THREE.Raycaster(); this.pointer = new THREE.Vector2(); this.pointers = new Map(); this.drag = null; this.pinch = null; this.yaw = -0.48; this.pitch = 0.32; this.distance = innerWidth < 700 ? 43 : 25;
    this.motionMedia = matchMedia("(prefers-reduced-motion: reduce)"); this.reduced = this.motionMedia.matches; this.dpr = Math.min(devicePixelRatio || 1, innerWidth < 700 ? 1.15 : 1.5); this.frameAverage = 16; this.last = 0; this.raf = 0; this.ready = false;
    this.loop = this.loop.bind(this); this.bind(); this.init();
  }
  bind() {
    this.canvas.addEventListener("pointerdown", (event) => { this.canvas.setPointerCapture(event.pointerId); this.pointers.set(event.pointerId, { x:event.clientX,y:event.clientY }); if(this.pointers.size===1)this.drag={id:event.pointerId,x:event.clientX,y:event.clientY,moved:false};if(this.pointers.size===2){const [a,b]=[...this.pointers.values()];this.pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),camera:this.distance};this.drag.moved=true;} });
    this.canvas.addEventListener("pointermove", (event) => { if(!this.pointers.has(event.pointerId))return;this.pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});if(this.pointers.size===2&&this.pinch){const[a,b]=[...this.pointers.values()],distance=Math.hypot(a.x-b.x,a.y-b.y)||1;this.distance=clamp(this.pinch.camera*this.pinch.distance/distance,15,56);this.invalidate();return;}if (!this.drag||this.drag.id!==event.pointerId) return; const dx = event.clientX - this.drag.x, dy = event.clientY - this.drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) this.drag.moved = true; this.yaw -= dx * .006; this.pitch = clamp(this.pitch + dy * .004, -.05, .9); this.drag.x = event.clientX; this.drag.y = event.clientY;this.invalidate(); });
    const endPointer=(event,canceled=false)=>{const click=this.drag&&this.drag.id===event.pointerId&&!this.drag.moved&&!canceled;this.pointers.delete(event.pointerId);if(click)this.pick(event.clientX,event.clientY);if(this.drag?.id===event.pointerId)this.drag=null;if(this.pointers.size<2)this.pinch=null;this.invalidate();};
    this.canvas.addEventListener("pointerup",(event)=>endPointer(event));this.canvas.addEventListener("pointercancel",(event)=>endPointer(event,true));
    this.canvas.addEventListener("wheel", (event) => { event.preventDefault(); this.distance = clamp(this.distance + event.deltaY * .015, 15, 56);this.invalidate(); }, { passive: false });
    this.canvas.addEventListener("webglcontextlost", (event) => { event.preventDefault(); this.ready=false;cancelAnimationFrame(this.raf); this.raf = 0; openSemantic(true); announce("Graphics context lost. Semantic application opened."); });
    this.canvas.addEventListener("webglcontextrestored", () => { this.init(true); announce(this.isReady()?"Graphics restored and verified ready. The loom has been rebuilt.":"Graphics restoration is not ready; semantic mode remains active."); });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) this.invalidate(); });
    window.addEventListener("resize",()=>this.invalidate());
    this.motionMedia.addEventListener?.("change",(event)=>{this.reduced=event.matches;announce(this.reduced?"System reduced motion applied.":"System motion preference allows movement.");this.invalidate();});
  }
  disposeObject(object){object.traverse?.((child)=>{child.geometry?.dispose?.();const materials=Array.isArray(child.material)?child.material:[child.material];for(const material of materials.filter(Boolean)){for(const value of Object.values(material))if(value?.isTexture)value.dispose();material.dispose?.();}});}
  init(restored=false) {
    this.ready=false;if(this.scene)this.disposeObject(this.scene);this.targets=[];
    try { if(!restored||!this.renderer)this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: "high-performance" }); }
    catch { $("graphicsFailure").hidden = false; openSemantic(true); return; }
    this.renderer.setPixelRatio(this.dpr); this.renderer.setSize(innerWidth, innerHeight, false); this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x080907); this.scene.fog = new THREE.FogExp2(0x080907, .026);
    this.camera = new THREE.PerspectiveCamera(innerWidth<700?52:39, innerWidth / innerHeight, .1, 120);
    this.scene.add(new THREE.HemisphereLight(0xffe0a0, 0x15241e, 1.55)); const lamp = new THREE.DirectionalLight(0xffbe68, 2.2); lamp.position.set(-8, 14, 9); this.scene.add(lamp);
    this.root = new THREE.Group(); this.dynamic = new THREE.Group(); this.scene.add(this.root, this.dynamic); this.buildFrame(); this.rebuildData(); this.updateConsole();
    try{this.camera.position.set(0,8,30);this.camera.lookAt(0,.5,1);this.renderer.compile(this.scene,this.camera);this.renderer.render(this.scene,this.camera);if(this.renderer.getContext().isContextLost())throw new Error("WebGL context remains lost");}catch(error){announce(`Graphics restoration is not ready: ${error.message}`);openSemantic(true);return;}this.ready=true;$("graphicsFailure").hidden=true;cancelAnimationFrame(this.raf);this.raf=0;this.invalidate();if(restored&&document.body.classList.contains("semantic-mode"))announce("Graphics restored. Press A to return to the ready loom.");
  }
  material(color, roughness = .72, metalness = .35) { return new THREE.MeshStandardMaterial({ color, roughness, metalness }); }
  box(size, position, color, parent = this.root) { const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), this.material(color)); mesh.position.set(...position); parent.add(mesh); return mesh; }
  cylinder(radius, length, position, color, rotation = [0, 0, Math.PI / 2], parent = this.root) { const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 20), this.material(color)); mesh.position.set(...position); mesh.rotation.set(...rotation); parent.add(mesh); return mesh; }
  buildFrame() {
    const wood = 0x4a2f1c, iron = 0x262824, brass = 0xb0782d;
    [[-8,0], [8,0]].forEach(([x]) => { this.box([.7, 12, .8], [x, 1, 0], wood); this.box([1.6, .5, 3], [x, -5, .2], iron); });
    this.box([17, .7, .8], [0, 7, 0], wood); this.box([17, .5, 1], [0, -1.5, 0], wood); this.box([19, .4, 3], [0, -5.1, .5], iron);
    this.cylinder(1.05, 15, [0, -3.7, 1.8], brass); this.cylinder(.72, 15, [0, 4.9, -1.4], iron);
    const threadGeo = new THREE.CylinderGeometry(.025, .025, 10, 5), threadMat = this.material(0xcbbf92, .9, .05), warp = new THREE.InstancedMesh(threadGeo, threadMat, 96), matrix = new THREE.Matrix4();
    for (let i = 0; i < 96; i++) { matrix.makeTranslation(-6.8 + i * .143, .4, -.25 + (i % 2) * .05); warp.setMatrixAt(i, matrix); } this.root.add(warp);
    const heddleGeo = new THREE.BoxGeometry(.07, 2.8, .16), heddles = new THREE.InstancedMesh(heddleGeo, this.material(0x8a8067), 64); for (let i = 0; i < 64; i++) { matrix.makeTranslation(-6.6 + i * .21, 1.4 + (i % 2) * .3, -.1); heddles.setMatrixAt(i, matrix); } this.root.add(heddles); this.heddles = heddles;
    this.shuttle = this.box([2.4, .42, .7], [-5, -1.05, .4], 0xc78731); this.box([.3, 2.7, 2.3], [-6.9, 3.1, 2.2], iron); this.box([.3, 2.7, 2.3], [6.9, 3.1, 2.2], iron);
    this.drum = this.cylinder(1.35, 4.8, [6.6, 4.1, 3.3], brass, [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 12; i++) { const card = this.box([1.25, .06, 1.7], [9.1, 5.8 - i * .48, 2.8 + Math.sin(i * .45)], 0xb9a36f); card.rotation.z = .08 * Math.sin(i); }
    this.console = this.makePanel(1024, 1024, [10.2, 1.8, 0], [7.5, 7.5], "console"); this.console.rotation.y = -.5; this.root.add(this.console);
    const nav = ["STATUS", "INSPECT", "COMMANDS", "PLANS", "ASSIST", "RESOURCES", "HELP", "ACCESS"];
    nav.forEach((name, index) => { const plate = this.makeLabel(name, [2.75, .64], 44); plate.position.set(-9.25 + index * 2.65, -5.75, 2.7); plate.rotation.x = -.55; plate.userData.action = () => name === "ACCESS" ? openSemantic() : setWorkspace(name); this.targets.push(plate); this.root.add(plate); });
    ["PREV", "EDIT", "APPLY", "CANCEL", "NEXT"].forEach((name, index) => { const lever = this.makeLabel(name, [2.15, .72], 38); lever.position.set(7.45 + index * 1.02, -2.75 + index * .12, 4.2); lever.rotation.y = -.5; lever.userData.action = () => sceneAction(name); this.targets.push(lever); this.root.add(lever); });
    [["CAM+",-1],["CAM-",1]].forEach(([name,direction],index)=>{const control=this.makeLabel(name,[1.7,.62],34);control.position.set(-10+index*1.8,-3.8,3);control.userData.action=()=>{this.distance=clamp(this.distance+direction*3,15,56);this.invalidate();};this.targets.push(control);this.root.add(control);});
  }
  makePanel(width, height, position, worldSize, name) { const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height; const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; const mesh = new THREE.Mesh(new THREE.PlaneGeometry(...worldSize), new THREE.MeshBasicMaterial({ map: texture, transparent: false })); mesh.position.set(...position); mesh.userData = { canvas, texture, name }; return mesh; }
  makeLabel(text, size, fontSize) { const mesh = this.makePanel(512, 128, [0,0,0], size, text); const context = mesh.userData.canvas.getContext("2d"); context.fillStyle = "#201d16"; context.fillRect(0,0,512,128); context.strokeStyle = "#b07d37"; context.lineWidth = 8; context.strokeRect(4,4,504,120); context.fillStyle = "#f0d48e"; context.font = `700 ${fontSize}px monospace`; context.textAlign = "center"; context.textBaseline = "middle"; context.fillText(text,256,64); mesh.userData.texture.needsUpdate = true; return mesh; }
  rebuildData() {
    if (!this.dynamic) return; for(const child of [...this.dynamic.children]){this.dynamic.remove(child);this.disposeObject(child);}this.targets=this.targets.filter((item)=>item.parent);
    const runItems = objects.filter((item) => item.type === "run").slice(0, 24), cellGeo = new THREE.BoxGeometry(.33,.12,.33), cellMat = this.material(0x4a8c78), cloth = new THREE.InstancedMesh(cellGeo, cellMat, Math.max(1, Math.min(512, runItems.length * 16))), matrix = new THREE.Matrix4(); let count = 0;
    runItems.forEach((run, row) => { for (let col = 0; col < 16; col++) { matrix.makeTranslation(-5.5 + col * .7, -2.35 - row * .12, 1.45 + ((hash(run.id) >> (col % 24)) & 1) * .22); cloth.setMatrixAt(count++, matrix); } }); cloth.count = count; this.dynamic.add(cloth);
    agents().slice(0, 12).forEach((agent, i) => { const shuttle = this.box([1.15,.28,.45],[-5.7 + (i%6)*2.25,-.8,1.2+Math.floor(i/6)*.65],0xd39135,this.dynamic); shuttle.userData.action=()=>selectKey(`agent:${idOf(agent)}`); this.targets.push(shuttle); });
    arr(snapshot.queue?.items).slice(0, 12).forEach((item,i)=>{ const spool=this.cylinder(.48,.7,[-7.1+i*1.3,5.8,2.2],0x825128,[0,0,Math.PI/2],this.dynamic); spool.userData.action=()=>selectKey(`queue:${idOf(item)}`); this.targets.push(spool); });
    arr(snapshot.gates?.gates).slice(0, 12).forEach((gate,i)=>{ const tooth=this.box([.12,1.8,.4],[-6+i*1.08,3.05,1.5],String(gate.status).includes("fail")?0xc33d30:0xa88b46,this.dynamic); tooth.userData.action=()=>selectKey(`gate:${idOf(gate)}`); this.targets.push(tooth); });
    snapshot.plans.slice(0, 8).forEach((plan,i)=>{ const peg=this.box([.15,.5,.15],[5.2+(i%4)*.65,4.1+Math.floor(i/4)*.6,4.35],0xe5c278,this.dynamic); peg.userData.action=()=>{selectKey(`plan:${idOf(plan)}`);loadPlan(idOf(plan)).catch(reportError);}; this.targets.push(peg); });this.invalidate();
  }
  updateConsole() {
    if (!this.console) return; const c=this.console.userData.canvas, x=c.getContext("2d"); x.fillStyle="#12130f";x.fillRect(0,0,c.width,c.height);x.strokeStyle="#8b713e";x.lineWidth=7;x.strokeRect(10,10,c.width-20,c.height-20);x.fillStyle="#d9bf7d";x.font="700 30px monospace";x.fillText("JACQUARD SWARMWORKS / "+ui.workspace,42,58);x.fillStyle="#7fb89d";x.font="22px monospace";x.fillText(`${String(snapshot.connection?.status||"disconnected").toUpperCase()} / ${sampleAge()} / ${first(snapshot.state?.phase,"idle")}`,42,96);
    const command=OPERATION_COMMANDS[ui.commandIndex], planAction=PROJECT_PLAN_ACTIONS[ui.planActionIndex], selected=selectedObject(); let title="", body=[];
    if(ui.workspace==="STATUS"){const action=TRANSPORT_ACTIONS[ui.transportIndex],phase=first(snapshot.state?.phase,snapshot.state?.status,"not reported");title=`TRANSPORT / ${action}`;body=[`Current run: ${currentRunId()||"none observed"}`,`Connection ${snapshot.connection?.status} / ${snapshot.connection?.transport||"none"} / ${sampleAge()}`,`Requested: ${textOf(snapshot.control||{},220)}`,`Observed heddle phase: ${phase} (${Math.max(0,WORKFLOW_PHASES.indexOf(phase))+1}/${WORKFLOW_PHASES.length})`,`Search: ${ui.search||"none"}`,"PREV/NEXT choose. EDIT search. APPLY executes. CANCEL clears review."];}
    if(ui.workspace==="INSPECT"){title=`${String(selected?.type||"none").toUpperCase()} / ${selected?.label||"No selection"}`;body=[`ID ${selected?.id||"-"}`,`Status ${selected?.status||"not reported"}`,`Owning run ${objectRunId(selected)||"not reported"}`,textOf(selected?.data||{},1500)];}
    if(ui.workspace==="COMMANDS"){title=`PUNCHED CARD ${ui.commandIndex+1}/30 / ${command}`;body=[ui.confirm?"EXACT CONFIRMATION / PREV-NEXT PAGES / APPLY AGAIN":"PREV/NEXT select. EDIT changes JSON. APPLY reviews.",ui.confirm?confirmationText():payloadFor(command),receipts[0]?`Last: ${receipts[0].type} / ${receipts[0].status} / observation: ${receipts[0].observation||"not yet refreshed"}`:"No command receipt"]}
    if(ui.workspace==="PLANS"){const d=snapshot.planDetail;title=`PATTERN DRUM / ${planAction}`;body=[`Selected ${selectedPlanId||"none"}`,`Version ${d?.ledger?.version??"-"} / revision ${d?.revision?.revision??"-"}`,`Digest ${d?.revision?.contentDigest||"not loaded"}`,ui.confirm?"EXACT CONFIRMATION / PREV-NEXT PAGES / APPLY AGAIN":"PREV/NEXT action. EDIT JSON or notes. APPLY reviews.",ui.confirm?confirmationText():planEditDraft?textOf(planEditDraft,900):proposalDraft?textOf(proposalDraft,900):"No staged proposal."];}
    if(ui.workspace==="ASSIST"){const action=ASSIST_ACTIONS[ui.assistActionIndex],d=snapshot.assistanceDetail;title=`PLANNING ASSISTANCE / ${action}`;body=[`Thread ${d?.id||"none"} / version ${d?.version||"-"}`,`Threads ${snapshot.assistance.length} / messages ${arr(d?.messages).length}`,d?.proposedContent?"Proposal available and inert until staged.":"No proposal reported.",ui.assistanceMessage?`Draft message: ${ui.assistanceMessage}`:"EDIT enters a message/proposal JSON where applicable.",ui.confirm?confirmationText():textOf(d?.messages||[],700)];}
    if(ui.workspace==="RESOURCES"){const actions=resourceActions(),action=actions[ui.resourceIndex]||{label:"none"};title=`RUN-OWNED EVIDENCE / ${action.label}`;body=[`Selection ${selected?.label||"none"}`,`Owning run ${objectRunId()||"not reported"}`,`Items ${actions.length}; PREV/NEXT choose, APPLY load.`,resource?`${resource.kind} / ${resource.name} / owner ${resource.runId}`:"No resource loaded.",resource?.text||action.preview||""];}
    if(ui.workspace==="HELP"){title="LOOM LEGEND / KEYBOARD";body=["Runs=cloth; agents=shuttles; phases=heddles; queue=spools","Gates=inspection combs; iterations=woven lineage; plans=drums","Commands=punched cards and levers","Left/Right select; Up/Down inspect; Enter actuates; E edits","1-6 workspaces; A semantic application; ? help; 0 reset; M motion","Accepted intent is not observed completion."];}
    x.fillStyle="#eadfbf";x.font="700 32px monospace";wrap(x,title,42,155,940,40,2);x.font="22px monospace";let y=235;for(const paragraph of body){const value=String(paragraph);x.fillStyle=value.includes("CONFIRM")?"#ef805f":"#c7bea4";y=wrap(x,value,42,y,940,30,value.startsWith("CONFIRM PAGE")?13:paragraph===body.at(-1)?13:5)+20;if(y>965)break;}this.console.userData.texture.needsUpdate=true;this.invalidate();
  }
  pick(clientX,clientY) { if(!this.ready)return;const rect=this.canvas.getBoundingClientRect();this.pointer.set((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);this.ray.setFromCamera(this.pointer,this.camera);const hit=this.ray.intersectObjects(this.targets.filter((item)=>item.parent),false)[0];hit?.object.userData.action?.(); }
  isReady(){return Boolean(this.ready&&this.renderer&&this.scene&&this.camera&&!this.renderer.getContext().isContextLost());}
  invalidate(){if(!this.ready||this.raf||document.hidden||document.body.classList.contains("semantic-mode"))return;this.raf=requestAnimationFrame(this.loop);}
  loop(time) { this.raf=0;if(!this.ready||document.hidden||document.body.classList.contains("semantic-mode"))return;const start=performance.now(), width=Math.max(1,innerWidth),height=Math.max(1,innerHeight);this.camera.fov=width<700?52:39;this.camera.aspect=width/height;this.camera.updateProjectionMatrix();const target=new THREE.Vector3(width<700?1.5:0,.5,1);this.camera.position.set(target.x+Math.sin(this.yaw)*Math.cos(this.pitch)*this.distance,target.y+Math.sin(this.pitch)*this.distance,target.z+Math.cos(this.yaw)*Math.cos(this.pitch)*this.distance);this.camera.lookAt(target);if(!this.reduced){this.shuttle.position.x=Math.sin(time*.0011)*5.2;this.heddles.position.y=Math.sin(time*.002)*.16;this.drum.rotation.y=time*.00035;}const maxW=3840,maxH=2160,nextDpr=Math.min(this.dpr,maxW/width,maxH/height);this.renderer.setPixelRatio(nextDpr);this.renderer.setSize(width,height,false);this.renderer.render(this.scene,this.camera);const cost=performance.now()-start;this.frameAverage=this.frameAverage*.95+cost*.05;if(this.frameAverage>24&&this.dpr>.7)this.dpr=Math.max(.7,this.dpr-.05);this.last=time;if(!this.reduced)this.raf=requestAnimationFrame(this.loop); }
}
function hash(value){let h=2166136261;for(const char of String(value)){h=Math.imul(h^char.charCodeAt(0),16777619);}return h>>>0;}
function wrap(context,text,x,y,width,lineHeight,maxLines){const words=String(text).replace(/\s+/g," ").split(" ");let line="",linesUsed=0;for(let i=0;i<words.length;i++){const next=line?`${line} ${words[i]}`:words[i];if(context.measureText(next).width>width&&line){context.fillText(line,x,y);y+=lineHeight;linesUsed++;line=words[i];if(linesUsed>=maxLines){context.fillText("...",x,y);return y+lineHeight;}}else line=next;}if(line){context.fillText(line,x,y);y+=lineHeight;}return y;}

let scene;
function visibleObjects(){const query=ui.search.trim().toLowerCase();return query?objects.filter((item)=>`${item.type} ${item.id} ${item.label} ${item.status} ${item.runId}`.toLowerCase().includes(query)):objects;}
function resourceActions(){
  const runId=objectRunId(),loaded=runId&&snapshot.selectedRunId===runId&&snapshot.selectedRun?.run?.id===runId?snapshot.selectedRun:null,actions=[],owner={revision:resourceRevision,key:selectedKey,runId};
  const assertOwner=()=>{if(owner.revision!==resourceRevision||owner.key!==selectedKey||owner.runId!==objectRunId())throw localError("Resource ownership changed; select the resource again")};
  if(runId){actions.push({label:"run record",run:runId,kind:"run"},{label:"SPEC",run:runId,kind:"document",name:"spec"},{label:"DEVPLAN",run:runId,kind:"document",name:"devplan"});for(const item of arr(loaded?.artifacts))actions.push({label:`artifact ${first(item.name,item.path)}`,run:runId,kind:"artifact",name:first(item.name,item.path)});for(const item of arr(loaded?.logs))actions.push({label:`log ${first(item.name,item.path)}`,run:runId,kind:"log",name:first(item.name,item.path)});}
  const linked=snapshot.iterations.filter((item)=>runId&&(item.runId===runId||item.sourceRunId===runId));for(const item of linked)actions.push({label:`lineage ${idOf(item)}`,preview:textOf(item),execute:async()=>{assertOwner();await client.selectIteration(idOf(item));snapshot=client.getSnapshot();assertOwner();if(snapshot.iterationDetail?.id!==idOf(item))throw localError("Loaded lineage ownership does not match the selected iteration");resource={kind:"lineage",name:idOf(item),runId, text:textOf(snapshot.iterationDetail)};}});
  if(runId){const ownedGates=arr(snapshot.gates?.gates).map((gate)=>({...gate,decisions:arr(gate.decisions).filter((item)=>item.runId===runId),evidence:arr(gate.evidence).filter((item)=>item.runId===runId)})).filter((gate)=>gate.decisions.length||gate.evidence.length);actions.push({label:"gate evidence",preview:textOf(ownedGates),execute:()=>{assertOwner();resource={kind:"evidence",name:"gate evidence",runId,text:textOf(ownedGates)};}});}
  actions.push({label:"agent telemetry",preview:textOf(agents()),execute:()=>{assertOwner();resource={kind:"telemetry",name:"agents",runId:runId||"per-record ownership",text:textOf(agents())};}},{label:"event/tool telemetry",preview:textOf(runId?runEvents(runId):snapshot.events),execute:()=>{assertOwner();resource={kind:"telemetry",name:"events and tools",runId:runId||"per-event ownership",text:textOf(runId?runEvents(runId):snapshot.events)};}},{label:"audit",preview:textOf(snapshot.audit),execute:()=>{assertOwner();resource={kind:"audit",name:"audit",runId:"audit records retain own scope",text:textOf(snapshot.audit)};}},{label:"raw stream",preview:textOf(snapshot.rawMessages),execute:()=>{assertOwner();resource={kind:"raw",name:"raw stream",runId:"messages retain own scope",text:textOf(snapshot.rawMessages)};}},{label:"receipts",preview:textOf(receipts),execute:()=>{assertOwner();resource={kind:"receipts",name:"request lifecycle",runId:"per-receipt payload",text:textOf(receipts)};}});
  return actions;
}
async function transportAction(){const action=TRANSPORT_ACTIONS[ui.transportIndex];if(action==="refresh"){await client.refresh();announce("Authoritative refresh observed.");}if(action==="freeze/resume"){if(snapshot.connection.paused)await client.resume();else client.pause();}if(action==="disconnect/reconnect"){if(snapshot.connection.status==="disconnected")await client.connect();else client.disconnect();}if(action==="search")startCanvasEdit("search",ui.search);}
function assistanceError(message,operation="plan-assistance"){const error=localError(message);error.operation=operation;return error;}
function prepareAssistanceMessageReview(detail,message){if(!detail?.id)throw assistanceError("Open an assistance thread first","plan-assistance.message");requireText(message,"Planning message is required");const request=deepFreeze({threadId:detail.id,expectedVersion:detail.version,message:String(message)});return {kind:"assistance",key:`assist:message:${detail.id}:${detail.version}`,request,preview:textOf({schemaVersion:"apb.plan-assistance.v1",...request}),page:0};}
async function sendAssistanceMessageReview(review){const detail=await client.getPlanAssistance(review.request.threadId);if(detail.version!==review.request.expectedVersion)throw assistanceError("Assistance thread changed after review; nothing was sent. Review the current version again","plan-assistance.message");return assistanceMutation("plan-assistance.message",review.request,()=>client.messagePlanAssistance(review.request.threadId,review.request.expectedVersion,review.request.message));}
async function assistanceAction(){const action=ASSIST_ACTIONS[ui.assistActionIndex],items=snapshot.assistance,detail=snapshot.assistanceDetail;if(action==="new-classic"||action==="new-managed"){const pipeline=action.slice(4),next=await assistanceMutation("plan-assistance.create",{pipelineType:pipeline},()=>client.createPlanAssistance(pipeline));selectedAssistanceId=next.id;}if(action==="refresh-threads")await client.listPlanAssistance();if(action==="previous-thread"||action==="next-thread"){if(!items.length)throw localError("No assistance threads are reported");const current=Math.max(0,items.findIndex((item)=>item.id===selectedAssistanceId)),step=action==="next-thread"?1:-1,item=items[(current+step+items.length)%items.length];selectedAssistanceId=item.id;await client.getPlanAssistance(item.id);}if(action==="message"){if(!detail)throw localError("Open an assistance thread first");if(!ui.assistanceMessage.trim()){startCanvasEdit("assist-message","");return;}const preview={schemaVersion:"apb.plan-assistance.v1",threadId:detail.id,expectedVersion:detail.version,message:ui.assistanceMessage};if(ui.confirm?.key!==`assist:message:${detail.id}:${detail.version}`){ui.confirm={key:`assist:message:${detail.id}:${detail.version}`,preview:textOf(preview)};announce("Exact versioned assistance message shown. Apply again to send.");scene.updateConsole();return;}ui.confirm=null;await assistanceMutation("plan-assistance.message",preview,()=>client.messagePlanAssistance(detail.id,detail.version,ui.assistanceMessage));ui.assistanceMessage="";}if(action==="stage-proposal"){if(!detail?.proposedContent)throw localError("The current thread has no proposal");proposalDraft=structuredClone(detail.proposedContent);announce("Proposal staged as an editable, unpersisted draft.");}if(action==="edit-proposal"){if(!proposalDraft&&!detail?.proposedContent)throw localError("No proposal is available to edit");startCanvasEdit("proposal",textOf(proposalDraft||detail.proposedContent));}if(action==="create-draft"){if(!proposalDraft)throw localError("Stage and review a proposal before creating a draft");const request=preparePlanRequest("project-plan.create",{content:proposalDraft});if(ui.confirm?.key!==`assist:${action}`){ui.confirm={key:`assist:${action}`,preview:textOf(request)};announce("Exact proposal-to-draft request shown. Apply again to persist only a draft.");scene.updateConsole();return;}ui.confirm=null;await dispatchPlan("project-plan.create",{content:proposalDraft});}}
async function assistanceActionV2(){const action=ASSIST_ACTIONS[ui.assistActionIndex],items=snapshot.assistance,detail=snapshot.assistanceDetail;if(action==="new-classic"||action==="new-managed"){const pipeline=action.slice(4),next=await assistanceMutation("plan-assistance.create",{pipelineType:pipeline},()=>client.createPlanAssistance(pipeline));selectedAssistanceId=next.id;return;}if(action==="refresh-threads"){await client.listPlanAssistance();return;}if(action==="previous-thread"||action==="next-thread"){if(!items.length)throw assistanceError("No assistance threads are reported");const current=Math.max(0,items.findIndex((item)=>item.id===selectedAssistanceId)),step=action==="next-thread"?1:-1,item=items[(current+step+items.length)%items.length];selectedAssistanceId=item.id;await client.getPlanAssistance(item.id);return;}if(action==="message"){if(!ui.assistanceMessage.trim()){startCanvasEdit("assist-message","");return;}if(ui.confirm?.kind==="assistance"){const review=ui.confirm;ui.confirm=null;await sendAssistanceMessageReview(review);ui.assistanceMessage="";return;}ui.confirm=prepareAssistanceMessageReview(detail,ui.assistanceMessage);announce("Exact versioned assistance message shown. Apply again to send.");scene.updateConsole();return;}if(action==="stage-proposal"){if(!detail?.proposedContent)throw assistanceError("The current thread has no proposal","plan-assistance.proposal");proposalDraft=structuredClone(detail.proposedContent);announce("Proposal staged as an editable, unpersisted draft.");return;}if(action==="edit-proposal"){if(!proposalDraft&&!detail?.proposedContent)throw assistanceError("No proposal is available to edit","plan-assistance.proposal");startCanvasEdit("proposal",textOf(proposalDraft||detail.proposedContent));return;}if(action==="create-draft"){if(!proposalDraft)throw assistanceError("Stage and review a proposal before creating a draft","project-plan.create");if(ui.confirm?.kind==="plan"){const review=ui.confirm;ui.confirm=null;await sendPlanReview(review);return;}ui.confirm=preparePlanReview("project-plan.create",{content:proposalDraft});announce("Exact proposal-to-draft request shown. Apply again to persist only a draft.");scene.updateConsole();}}
function setWorkspace(name){ui.workspace=name;ui.confirm=null;scene?.updateConsole();announce(`${name.toLowerCase()} loom station selected.`);}
function selectKey(key){if(!objects.some((item)=>item.key===key))return;resourceRevision++;resource=null;selectedKey=key;setWorkspace("INSPECT");const item=selectedObject();if(item.type==="run")client.selectRun(item.id).catch(reportError);if(item.type==="iteration")client.selectIteration(item.id).catch(reportError);renderSemantic();}
function sceneAction(action){
  if(ui.editMode&&action==="APPLY"){try{finishCanvasEdit(true);}catch(error){announce(error.message);}return;}
  if(ui.editMode&&action!=="CANCEL"){announce("Finish or cancel the active canvas editor first.");return;}
  if(ui.confirm&&(action==="PREV"||action==="NEXT")){const pages=Math.max(1,Math.ceil(String(ui.confirm.preview||"").length/CONFIRM_PAGE_SIZE));ui.confirm.page=(ui.confirm.page||0)+(action==="NEXT"?1:-1);ui.confirm.page=(ui.confirm.page+pages)%pages;scene.updateConsole();return;}
  if(action==="PREV"||action==="NEXT"){const step=action==="NEXT"?1:-1;if(ui.workspace==="STATUS")ui.transportIndex=(ui.transportIndex+step+TRANSPORT_ACTIONS.length)%TRANSPORT_ACTIONS.length;else if(ui.workspace==="COMMANDS")ui.commandIndex=(ui.commandIndex+step+30)%30;else if(ui.workspace==="PLANS")ui.planActionIndex=(ui.planActionIndex+step+9)%9;else if(ui.workspace==="ASSIST")ui.assistActionIndex=(ui.assistActionIndex+step+ASSIST_ACTIONS.length)%ASSIST_ACTIONS.length;else if(ui.workspace==="RESOURCES"){const count=Math.max(1,resourceActions().length);ui.resourceIndex=(ui.resourceIndex+step+count)%count;}else{const list=visibleObjects();if(list.length){const index=Math.max(0,list.findIndex((item)=>item.key===selectedKey));resourceRevision++;resource=null;selectedKey=list[(index+step+list.length)%list.length].key;}}ui.confirm=null;scene.updateConsole();return;}
  if(action==="EDIT"){if(ui.workspace==="STATUS")startCanvasEdit("search",ui.search);else if(ui.workspace==="COMMANDS")startCanvasEdit("command",payloadFor(OPERATION_COMMANDS[ui.commandIndex]));else if(ui.workspace==="PLANS"){const planAction=PROJECT_PLAN_ACTIONS[ui.planActionIndex];if(planAction==="project-plan.create")startCanvasEdit("plan-create",textOf(proposalDraft||planDefaults("classic")));else if(planAction==="project-plan.update"&&snapshot.planDetail)startCanvasEdit("plan-update",textOf(planEditDraft||snapshot.planDetail.revision.content));else if(["project-plan.approve","project-plan.reject"].includes(planAction)){ui.editNoteKey=planNoteKey(planAction);startCanvasEdit("plan-notes",currentPlanNote(planAction));}else announce("This action has no editable fields; review its exact payload with Apply.");}else if(ui.workspace==="ASSIST"){const actionName=ASSIST_ACTIONS[ui.assistActionIndex];if(actionName==="message")startCanvasEdit("assist-message",ui.assistanceMessage);else if(actionName==="edit-proposal")assistanceAction().catch(reportError);else announce("Choose message or edit-proposal to enter text.");}else if(ui.workspace==="INSPECT")startCanvasEdit("search",ui.search);else announce("This station has no text field for the selected action.");return;}
  if(action==="CANCEL"){if(ui.editMode)finishCanvasEdit(false);else{ui.confirm=null;announce("Pending review canceled; nothing was sent.");scene.updateConsole();}return;}
  if(action==="APPLY")activateCanvas().catch(reportError);
}
async function activateCanvas(){if(ui.workspace==="STATUS"){await transportAction();return;}if(ui.workspace==="COMMANDS"){const type=OPERATION_COMMANDS[ui.commandIndex];if(ui.confirm?.key===`command:${type}`){const review=ui.confirm;ui.confirm=null;await sendCommandReview(review);return;}const review=await prepareCommandReview(type,parsePayload(type));ui.confirm=review;scene.updateConsole();announce(`Exact ${type} payload shown; Apply again to dispatch requested intent.`);}else if(ui.workspace==="PLANS"){const action=PROJECT_PLAN_ACTIONS[ui.planActionIndex];if(ui.confirm?.key===`plan:${action}`){const review=ui.confirm;ui.confirm=null;await sendPlanReview(review);return;}const review=preparePlanReview(action,{notes:currentPlanNote(action)});ui.confirm=review;scene.updateConsole();announce(`Exact ${action} payload, version, revision, and digest shown; Apply again to dispatch.`);}else if(ui.workspace==="ASSIST")await assistanceActionV2();else if(ui.workspace==="INSPECT"){const item=selectedObject();if(item?.type==="plan")await loadPlan(item.id);else if(item?.type==="iteration")await client.selectIteration(item.id);else if(objectRunId(item))await loadResource("run","",objectRunId(item));}else if(ui.workspace==="RESOURCES"){const action=resourceActions()[ui.resourceIndex];if(!action)throw localError("No resource action available");if(action.execute)await action.execute();else await loadResource(action.kind,action.name||"",action.run);scene.updateConsole();}else if(ui.workspace==="HELP")announce("Help is visible on the scene console. Use Access only when the semantic equivalent is preferred.");}
function startCanvasEdit(mode,value){ui.editMode=mode;ui.editOriginal=value;ui.editWasEdited=mode==="command"&&ui.editedPayloads.has(OPERATION_COMMANDS[ui.commandIndex]);const editor=$("canvasEditor");editor.value=value;editor.focus();editor.setSelectionRange(value.length,value.length);announce("Canvas editor active. Type JSON, Control Enter to apply, Escape to cancel.");}
function finishCanvasEdit(apply){const editor=$("canvasEditor"),mode=ui.editMode;if(apply){if(["command","plan-create","plan-update","proposal"].includes(mode)){const parsed=JSON.parse(editor.value);if(!plain(parsed))throw localError("Editor content must be a JSON object");if(mode==="command"){const type=OPERATION_COMMANDS[ui.commandIndex];parsePayload(type,editor.value);ui.payloads.set(type,editor.value);ui.editedPayloads.add(type);}if(mode==="plan-create"){proposalDraft=parsed;planEditDraft=null;}if(mode==="plan-update")planEditDraft=parsed;if(mode==="proposal")proposalDraft=parsed;}if(mode==="search")ui.search=editor.value.trim();if(mode==="plan-notes")ui.notesBySubject.set(ui.editNoteKey,editor.value.trim());if(mode==="assist-message")ui.assistanceMessage=editor.value.trim();}else{if(mode==="command"){const type=OPERATION_COMMANDS[ui.commandIndex];ui.payloads.set(type,ui.editOriginal);if(!ui.editWasEdited)ui.editedPayloads.delete(type);}if(mode==="plan-notes"&&ui.editNoteKey){if(ui.editOriginal)ui.notesBySubject.set(ui.editNoteKey,ui.editOriginal);else ui.notesBySubject.delete(ui.editNoteKey);}if(mode==="plan-create")planEditDraft=null;if(mode==="plan-update"){try{planEditDraft=JSON.parse(ui.editOriginal);}catch{planEditDraft=null;}}}ui.editMode=null;ui.editOriginal=null;ui.editWasEdited=false;ui.editNoteKey=null;$("loom").focus();scene.updateConsole();announce(apply?"Canvas editor applied.":"Canvas edit canceled.");}
function openSemantic(force=false){document.body.classList.add("semantic-mode");const app=$("semanticApp");app.inert=false;app.setAttribute("aria-hidden","false");renderSemantic();$("semanticTitle").focus?.();if(force)$("graphicsFailure").hidden=false;}
function closeSemantic(){if(!scene?.isReady()){announce("Graphics are not ready; semantic mode remains active.");return;}document.body.classList.remove("semantic-mode");const app=$("semanticApp");app.inert=true;app.setAttribute("aria-hidden","true");$("loom").focus();scene.invalidate();}
function reportError(error){announce(error.message);if(error.recorded)return;if(error.localValidation){receipt(error.operation||"local validation","not sent",{error:error.message});return;}receipt("client",error.status==null?"outcome unknown":"rejected",{error:error.message});}

const tabs=["overview","inspect","commands","queue-gates","lineage","plans","assistance","resources","telemetry","receipts","help"];
function facts(entries){return `<dl class="facts">${entries.filter(([,v])=>v!==undefined&&v!==null&&v!=="").map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(typeof v==="object"?textOf(v,1200):v)}</dd>`).join("")}</dl>`;}
function field(name,label,value,textarea=false,id=`field-${name}`){return `<label class="field" for="${esc(id)}">${esc(label)}${textarea?`<textarea id="${esc(id)}" name="${esc(name)}">${esc(value)}</textarea>`:`<input id="${esc(id)}" name="${esc(name)}" value="${esc(value)}">`}</label>`;}
function cards(items){return `<div class="grid">${items.join("")}</div>`;}
function semanticOverview(){return cards([`<article class="card"><h2>Observed loom</h2>${facts([["Connection",snapshot.connection?.status],["Transport",snapshot.connection?.transport],["Freshness",sampleAge()],["Observed phase",first(snapshot.state?.phase,"not reported")],["Current run",currentRunId()||"none"],["Observed blocker",currentBlocker()?textOf(currentBlocker(),800):"clear"]])}</article>`,`<article class="card"><h2>Requested control</h2><pre>${esc(textOf(snapshot.control||{}))}</pre></article>`,`<article class="card"><h2>Inventory</h2>${facts([["Runs",snapshot.runs.length],["Agent shuttles",agents().length],["Queue spools",arr(snapshot.queue?.items).length],["Inspection gates",arr(snapshot.gates?.gates).length],["Lineage iterations",snapshot.iterations.length],["Plans",snapshot.plans.length],["Retained events",snapshot.events.length]])}</article>`]);}
function semanticInspect(){return cards(objects.slice(0,500).map((item)=>`<article class="card ${item.key===selectedKey?"selected":""}"><h3>${esc(item.label)}</h3>${facts([["Type",item.type],["ID",item.id],["Status",item.status],["Owning run",item.runId||"not reported"]])}<div class="actions"><button data-select="${esc(item.key)}">Inspect</button></div>${item.key===selectedKey?`<details><summary>Raw authoritative record</summary><pre>${esc(textOf(item.data))}</pre></details>`:""}</article>`));}
function semanticCommands(){return `<p>All ${OPERATION_COMMANDS.length} commands are represented. Payloads must be JSON objects. Submission always requires the browser confirmation below; accepted intent is not observed completion.</p>${cards(OPERATION_COMMANDS.map((type)=>`<form id="command-${esc(type)}" class="card command-form" data-command="${esc(type)}"><h3>${esc(type)}</h3><label class="field" for="command-payload-${esc(type)}">Safe payload JSON<textarea id="command-payload-${esc(type)}" name="payload">${esc(payloadFor(type))}</textarea></label><button id="command-submit-${esc(type)}" type="submit">Review and dispatch</button></form>`))}`;}
function semanticQueueGates(){const queue=arr(snapshot.queue?.items),gates=arr(snapshot.gates?.gates);return `<h2>Queue spools</h2>${cards(queue.map((item)=>`<article class="card"><h3>${esc(first(item.title,item.id))}</h3>${facts([["ID",item.id],["Status",item.status],["Priority",item.priority],["Objective",item.objective],["Context",item.context],["Repository",item.target?.preferredRepo],["Acceptance gates",arr(item.acceptanceGateIds).join(", ")||"none"]])}<div class="actions"><button data-quick="pin-queue-item" data-id="${esc(item.id)}">Pin</button><button data-quick="archive-queue-item" data-id="${esc(item.id)}" class="danger">Archive</button></div></article>`))||'<p>No queue items reported.</p>'}<h2>Inspection comb gates</h2>${cards(gates.map((gate)=>`<article class="card"><h3>${esc(first(gate.title,gate.id))}</h3>${facts([["ID",gate.id],["Status",gate.status],["Severity",gate.severity],["Description",gate.description],["Required evidence",arr(gate.requiredEvidence).join(", ")||"none"],["Decisions",gate.decisions],["Evidence",gate.evidence]])}<div class="actions"><button data-select="gate:${esc(gate.id)}">Select for command</button></div></article>`))||'<p>No gates reported.</p>'}`;}
function semanticLineage(){return `<p>Historical work is immutable evidence. Direct recovery is never offered here. Continue, fork, and use-as-next-direction requests copy exact source ownership, gates, evidence policy, and bounded limits.</p>${cards(snapshot.iterations.map((item)=>`<article class="card"><h3>${esc(idOf(item))}</h3>${facts([["Run",item.runId],["Source run",item.sourceRunId],["Parent",first(item.parentIterationId,item.forkedFromIterationId,"none")],["Status",item.status],["Objective",item.objective],["Repository",item.repoPath],["Base ref",first(item.baseRef,item.commit)],["Limits",item.limits],["Gate IDs",arr(item.acceptanceGateIds).join(", ")]])}<div class="actions"><button data-iteration="${esc(idOf(item))}">Load exact detail</button><button data-lineage="continue-from-iteration" data-id="${esc(idOf(item))}">Continue</button><button data-lineage="fork-from-iteration" data-id="${esc(idOf(item))}">Fork</button><button data-lineage="use-as-next-direction" data-id="${esc(idOf(item))}">Use direction</button></div></article>`))||'<p>No iteration lineage reported.</p>'}${snapshot.iterationDetail?`<h2>Loaded iteration detail</h2><pre>${esc(textOf(snapshot.iterationDetail))}</pre>`:""}`;}
function semanticPlans(){const detail=snapshot.planDetail;return `<div class="actions"><button id="plan-create-classic" data-plan-create="classic">Create classic draft</button><button id="plan-create-managed" data-plan-create="managed">Create managed draft</button><button id="plan-refresh" data-refresh-plans>Refresh register</button></div>${proposalDraft?`<form id="proposalDraft" class="card"><h2>Editable unpersisted draft</h2>${field("content","Plan draft JSON (incomplete drafts allowed)",textOf(proposalDraft),true,"proposal-draft-content")}<button id="proposal-draft-submit">Create persisted draft only</button></form>`:""}${cards(snapshot.plans.map((plan)=>`<article class="card ${idOf(plan)===selectedPlanId?"selected":""}"><h3>${esc(first(plan.title,plan.planId))}</h3>${facts([["Plan",plan.planId],["State",plan.state],["Revision",plan.currentRevision],["Version",plan.version],["Digest",plan.currentDigest]])}<button id="plan-open-${esc(plan.planId)}" data-plan="${esc(plan.planId)}">Load exact ledger</button></article>`))}${detail?`<article class="card"><h2>Loaded pattern drum</h2>${facts([["Plan",detail.ledger?.planId],["State",detail.ledger?.state],["Version",detail.ledger?.version],["Exact revision",detail.revision?.revision],["Digest",detail.revision?.contentDigest],["Active launch",detail.ledger?.activeLaunchId]])}<pre>${esc(textOf(detail.revision?.content))}</pre><form id="planUpdate">${field("content","New plan draft revision JSON (incomplete allowed)",textOf(detail.revision?.content),true,"plan-update-content")}<button id="plan-update-submit">Save immutable revision</button></form>${field("approveNotes","Approval notes",currentPlanNote("project-plan.approve"),true,"plan-approve-notes")}${field("rejectNotes","Required rejection notes",currentPlanNote("project-plan.reject"),true,"plan-reject-notes")}<div class="actions">${PROJECT_PLAN_ACTIONS.filter((action)=>!["project-plan.create","project-plan.update"].includes(action)).map((action)=>`<button id="plan-action-${esc(action)}" data-plan-action="${esc(action)}" class="${action.includes("reject")||action.includes("archive")?"danger":""}">${esc(action)}</button>`).join("")}</div></article>`:"<p>Load a plan to inspect exact revision, digest, version, decisions, launches, and lifecycle actions.</p>"}`;}
function semanticAssistance(){const detail=snapshot.assistanceDetail;return `<p>Planning assistance suggestions are inert. A proposal can become an editable draft, but is not persisted, approved, launched, or executed automatically.</p><div class="actions"><button data-new-assist="classic">New classic assistance</button><button data-new-assist="managed">New managed assistance</button><button data-refresh-assist>Refresh threads</button></div>${cards(snapshot.assistance.map((item)=>`<article class="card"><h3>${esc(item.id)}</h3>${facts([["Pipeline",item.pipelineType],["Version",item.version],["Messages",item.messageCount],["Proposal",item.hasProposal?"available":"none"]])}<button data-assist="${esc(item.id)}">Open versioned thread</button></article>`))}${detail?`<article class="card"><h2>Thread ${esc(detail.id)}</h2>${facts([["Version",detail.version],["Pipeline",detail.pipelineType]])}<pre>${esc(textOf(detail.messages))}</pre><form id="assistMessage">${field("message","Planning message","",true)}<button>Send with expected version ${esc(detail.version)}</button></form>${detail.proposedContent?`<button data-stage-proposal>Stage proposal as editable draft</button><pre>${esc(textOf(detail.proposedContent))}</pre>`:"<p>No proposal reported.</p>"}</article>`:""}${proposalDraft?`<form id="proposalDraft" class="card"><h2>Editable proposal draft</h2>${field("content","Plan content JSON",textOf(proposalDraft),true)}<button>Create persisted draft only</button></form>`:""}`;}
function semanticResources(){const runId=objectRunId(),loaded=runId&&snapshot.selectedRunId===runId?snapshot.selectedRun:null;return `<p>Every request below carries explicit run ownership. Current selection owner: <b>${esc(runId||"not reported")}</b>.</p><div class="actions"><button data-resource="run" data-run="${esc(runId||"")}">Run record</button><button data-resource="document" data-name="spec" data-run="${esc(runId||"")}">SPEC</button><button data-resource="document" data-name="devplan" data-run="${esc(runId||"")}">DEVPLAN</button></div><h2>Artifacts</h2><div class="actions">${arr(loaded?.artifacts).map((item)=>`<button data-resource="artifact" data-name="${esc(first(item.name,item.path))}" data-run="${esc(runId)}">${esc(first(item.name,item.path))}</button>`).join("")||"Select a run and load its resources."}</div><h2>Bounded log tails</h2><div class="actions">${arr(loaded?.logs).map((item)=>`<button data-resource="log" data-name="${esc(first(item.name,item.path))}" data-run="${esc(runId)}">${esc(first(item.name,item.path))}</button>`).join("")||"No owned logs loaded."}</div>${resource?`<article class="card"><h2>${esc(resource.name)}</h2>${facts([["Kind",resource.kind],["Owning run",resource.runId]])}<pre>${esc(resource.text)}</pre></article>`:""}`;}
function semanticTelemetry(){return `<h2>Agent shuttles</h2>${cards(agents().map((agent)=>`<article class="card"><h3>${esc(idOf(agent))}</h3><pre>${esc(textOf(agent))}</pre></article>`))}<h2>Events and tool calls</h2><table><thead><tr><th>Time</th><th>Source</th><th>Type</th><th>Owning run</th><th>Message / sanitized IO</th></tr></thead><tbody>${snapshot.events.slice(-300).reverse().map((event)=>`<tr><td>${esc(event.ts)}</td><td>${esc(first(event.agentId,event.source))}</td><td>${esc(event.data?.toolName?`tool: ${event.data.toolName}`:event.type)}</td><td>${esc(event.runId||"none")}</td><td>${esc(first(event.message,textOf({input:event.data?.sanitizedInput,output:event.data?.sanitizedOutput},500)))}</td></tr>`).join("")}</tbody></table><h2>Audit</h2><pre>${esc(textOf(snapshot.audit))}</pre><h2>Raw stream messages</h2><pre>${esc(textOf(snapshot.rawMessages))}</pre>`;}
function semanticReceipts(){return cards(receipts.map((item)=>`<article class="card receipt"><h3>#${item.id} ${esc(item.type)}</h3>${facts([["Lifecycle",item.status],["Observation refresh",item.observation||"not requested or not completed"],["Time",item.at],["Command receipt",item.commandId],["Error",item.error]])}<details><summary>Request and result</summary><pre>${esc(textOf({payload:item.payload,expectedVersion:item.expectedVersion,result:item.result,observation:item.observation}))}</pre></details></article>`))||"<p>No local request receipts this session.</p>";}
function semanticHelp(){return `<div class="help-grid"><h2>Mechanical legend</h2><p>Runs are cloth; agents are shuttles; workflow phases are heddles; queue items are spools; gates are inspection combs; iterations are woven lineage; project plans are pattern drums; commands are punched cards and physical levers.</p><h2>3D keyboard and touch</h2><p><kbd>1</kbd>-<kbd>7</kbd> stations; arrows move spatial selection; <kbd>Enter</kbd> or <kbd>Space</kbd> applies; <kbd>E</kbd> edits; <kbd>Ctrl+Enter</kbd> applies edits; <kbd>Esc</kbd> or the scene CANCEL plate cancels; <kbd>A</kbd> toggles this application; <kbd>?</kbd> help; <kbd>0</kbd> resets camera; <kbd>M</kbd> toggles nonessential movement. Drag orbits, pinch and CAM controls zoom, and scene APPLY, CANCEL, and ACCESS plates work on touch.</p><h2>Language</h2><p>Pending means not yet answered. Accepted intent means the API accepted a request, not that work completed. Rejected means an authoritative response refused it. Outcome unknown means transport failed without an authoritative answer. Observed is reserved for telemetry received after submission.</p><h2>Safety</h2><p>Direct recovery is current-run only and revalidated. Historical work uses lineage. Resources retain explicit owning-run identity. Plan lifecycle uses the exact loaded version, revision, and digest. Limits and gate snapshots accompany iteration requests.</p><h2>Graphics failure</h2><p>This application opens automatically on WebGL context loss or initialization failure. It contains all inspection, controls, planning, evidence, receipts, help, and dashboard-directory access.</p></div>`;}
function renderSemantic(force=false){if(!document.body.classList.contains("semantic-mode"))return;const active=document.activeElement,owns=active&&$("semanticApp").contains(active),editing=owns&&active.matches?.("input,textarea,select"),command=active?.closest?.("[data-command]")?.dataset.command,token=owns?{id:active.id,name:active.name,command,tab:active.dataset.tab,start:active.selectionStart,end:active.selectionEnd,value:"value" in active?active.value:null}:null;$("semanticStatus").innerHTML=`<b>${esc(snapshot.connection?.status||"disconnected")}</b> / ${esc(snapshot.connection?.transport||"no transport")} / sample ${esc(sampleAge())} / observed ${esc(first(snapshot.state?.phase,"idle"))} / requested intent and observed state are separate`;if(!force&&(semanticDirty||editing))return;$("semanticTabs").innerHTML=tabs.map((tab)=>`<button id="semantic-tab-${tab}" data-tab="${tab}" aria-current="${tab===semanticTab}">${tab}</button>`).join("");const renderers={overview:semanticOverview,inspect:semanticInspect,commands:semanticCommands,"queue-gates":semanticQueueGates,lineage:semanticLineage,plans:semanticPlans,assistance:semanticAssistance,resources:semanticResources,telemetry:semanticTelemetry,receipts:semanticReceipts,help:semanticHelp};$("semanticContent").innerHTML=renderers[semanticTab]();if(token){const selector=token.id?`#${CSS.escape(token.id)}`:token.command&&token.name?`[data-command="${CSS.escape(token.command)}"] [name="${CSS.escape(token.name)}"]`:token.name?`[name="${CSS.escape(token.name)}"]`:token.tab?`[data-tab="${CSS.escape(token.tab)}"]`:null,target=selector?$("semanticApp").querySelector(selector):null;if(target){if(token.value!==null)target.value=token.value;target.focus({preventScroll:true});if(typeof target.setSelectionRange==="function"&&token.start!=null)target.setSelectionRange(token.start,token.end);}}}
function renderAll(){deriveObjects();scene?.rebuildData();scene?.updateConsole();renderSemantic();}
function confirmRequest(message){return globalThis.confirm(`${message}\n\nThis sends requested intent. Accepted intent is not observed completion.`);}
function parseObjectJson(value,label){let parsed;try{parsed=JSON.parse(value);}catch{throw localError(`${label} must be valid JSON`);}if(!plain(parsed))throw localError(`${label} must be a JSON object`);return parsed;}

document.addEventListener("click",async(event)=>{try{const target=event.target.closest("button");if(!target)return;if(target.id==="closeSemantic"){closeSemantic();return;}if(target.dataset.tab){semanticDirty=false;semanticTab=target.dataset.tab;renderSemantic(true);return;}if(target.dataset.select){selectKey(target.dataset.select);renderSemantic(true);return;}if(target.dataset.quick){const payload={itemId:target.dataset.id},review=await prepareCommandReview(target.dataset.quick,payload);if(confirmRequest(review.preview))await sendCommandReview(review);return;}if(target.dataset.iteration){await client.selectIteration(target.dataset.iteration);snapshot=client.getSnapshot();renderAll();return;}if(target.dataset.lineage){const item=snapshot.iterations.find((entry)=>idOf(entry)===target.dataset.id);if(!item)throw localError("Source iteration is no longer retained");const input={...defaultPayload(target.dataset.lineage),sourceIterationId:idOf(item),sourceRunId:first(item.runId,item.sourceRunId),repoPath:item.repoPath,baseRef:first(item.baseRef,item.commit,"HEAD"),objective:item.objective,changeText:first(item.nextRecommendedDirection,item.steeringText,"Complete one bounded continuation.")},review=await prepareCommandReview(target.dataset.lineage,input);if(confirmRequest(review.preview))await sendCommandReview(review);return;}if(target.dataset.plan){await loadPlan(target.dataset.plan);return;}if(target.dataset.planCreate){proposalDraft=planDefaults(target.dataset.planCreate);semanticDirty=false;semanticTab="plans";renderSemantic(true);return;}if(target.hasAttribute("data-refresh-plans")){await client.refreshPlans();return;}if(target.dataset.planAction){const action=target.dataset.planAction,noteField=action==="project-plan.reject"?$("plan-reject-notes"):$("plan-approve-notes"),notes=noteField?.value.trim()||"";ui.notesBySubject.set(planNoteKey(action),notes);const review=preparePlanReview(action,{notes});if(confirmRequest(review.preview))await sendPlanReview(review);return;}if(target.dataset.newAssist){const pipeline=target.dataset.newAssist,detail=await assistanceMutation("plan-assistance.create",{pipelineType:pipeline},()=>client.createPlanAssistance(pipeline));selectedAssistanceId=detail.id;return;}if(target.hasAttribute("data-refresh-assist")){await client.listPlanAssistance();return;}if(target.dataset.assist){selectedAssistanceId=target.dataset.assist;await client.getPlanAssistance(selectedAssistanceId);return;}if(target.hasAttribute("data-stage-proposal")){proposalDraft=structuredClone(snapshot.assistanceDetail.proposedContent);renderSemantic(true);return;}if(target.dataset.resource){await loadResource(target.dataset.resource,target.dataset.name||"",target.dataset.run);return;}}catch(error){reportError(error);}});
document.addEventListener("submit",async(event)=>{const form=event.target;if(!(form instanceof HTMLFormElement))return;event.preventDefault();try{if(form.matches(".command-form")){const type=form.dataset.command,review=await prepareCommandReview(type,parsePayload(type,form.elements.payload.value));ui.payloads.set(type,form.elements.payload.value);if(confirmRequest(review.preview))await sendCommandReview(review);}if(form.id==="planUpdate"){const content=parseObjectJson(form.elements.content.value,"Plan content"),review=preparePlanReview("project-plan.update",{content});if(confirmRequest(review.preview))await sendPlanReview(review);}if(form.id==="assistMessage"){const review=prepareAssistanceMessageReview(snapshot.assistanceDetail,form.elements.message.value);if(confirmRequest(review.preview))await sendAssistanceMessageReview(review);}if(form.id==="proposalDraft"){proposalDraft=parseObjectJson(form.elements.content.value,"Proposal draft");const review=preparePlanReview("project-plan.create",{content:proposalDraft});if(confirmRequest(review.preview))await sendPlanReview(review);}semanticDirty=false;renderSemantic(true);}catch(error){reportError(error);}});
$("semanticContent").addEventListener("input",()=>{semanticDirty=true;});
$("canvasEditor").addEventListener("keydown",(event)=>{if(event.key==="Escape"){event.preventDefault();finishCanvasEdit(false);}if(event.key==="Enter"&&(event.ctrlKey||event.metaKey)){event.preventDefault();try{finishCanvasEdit(true);}catch(error){announce(error.message);}}});
$("canvasEditor").addEventListener("input",(event)=>{if(ui.editMode==="command"){const type=OPERATION_COMMANDS[ui.commandIndex];ui.editedPayloads.add(type);ui.payloads.set(type,event.target.value);}if(["plan-create","plan-update","proposal"].includes(ui.editMode)){try{planEditDraft=JSON.parse(event.target.value);}catch{planEditDraft={editor:"JSON incomplete",text:event.target.value};}}if(ui.editMode==="search")ui.search=event.target.value;if(ui.editMode==="plan-notes"&&ui.editNoteKey)ui.notesBySubject.set(ui.editNoteKey,event.target.value);if(ui.editMode==="assist-message")ui.assistanceMessage=event.target.value;scene.updateConsole();});
window.addEventListener("keydown",(event)=>{if(document.body.classList.contains("semantic-mode")){if(event.key.toLowerCase()==="a"&&!event.target.matches("input,textarea,select")){closeSemantic();event.preventDefault();}return;}if(ui.editMode)return;const key=event.key.toLowerCase();if(key==="a"){openSemantic();event.preventDefault();return;}if(event.key==="?"){setWorkspace("HELP");event.preventDefault();return;}if(key==="m"){scene.reduced=!scene.reduced;announce(scene.reduced?"Nonessential loom motion stopped.":"Nonessential loom motion enabled.");scene.invalidate();return;}if(event.key==="0"){scene.yaw=-.48;scene.pitch=.32;scene.distance=innerWidth<700?43:25;scene.invalidate();return;}if(/^[1-7]$/.test(event.key)){setWorkspace(["STATUS","INSPECT","COMMANDS","PLANS","ASSIST","RESOURCES","HELP"][Number(event.key)-1]);return;}if(["ArrowLeft","ArrowUp"].includes(event.key)){sceneAction("PREV");event.preventDefault();}if(["ArrowRight","ArrowDown"].includes(event.key)){sceneAction("NEXT");event.preventDefault();}if(key==="e"){sceneAction("EDIT");event.preventDefault();}if(event.key==="Enter"||event.key===" "){sceneAction("APPLY");event.preventDefault();}if(event.key==="Escape"){sceneAction("CANCEL");event.preventDefault();}});

scene=new LoomScene($("loom"));
client.subscribe((next)=>{snapshot=next;if(!renderQueued){renderQueued=true;requestAnimationFrame(()=>{renderQueued=false;renderAll();});}});
client.connect().then(()=>Promise.allSettled([client.refreshPlans(),client.listPlanAssistance()])).catch((error)=>{reportError(error);renderAll();});
function freshnessTick(){scene?.updateConsole();const status=$("semanticStatus");if(document.body.classList.contains("semantic-mode")&&status)status.innerHTML=`<b>${esc(snapshot.connection?.status||"disconnected")}</b> / ${esc(snapshot.connection?.transport||"no transport")} / sample ${esc(sampleAge())} / observed ${esc(first(snapshot.state?.phase,"idle"))} / requested intent and observed state are separate`;setTimeout(freshnessTick,scene?.reduced?30000:5000);}
setTimeout(freshnessTick,5000);
$("loom").focus();
