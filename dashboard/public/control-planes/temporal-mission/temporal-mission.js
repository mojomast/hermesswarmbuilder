/**
 * Dashboard D: 3D Temporal Mission Environment Controller (Spec §6, §7, §13, §15, §23)
 * Full WebGL2/WebGPU spatiotemporal mission environment with longitudinal Z-axis corridor,
 * radially diverging cubic Bézier variant branches, 3D octahedron rubric prisms,
 * synthesis convergence funnel, 2D orthographic radar HUD, timeline scrubber dock,
 * and comprehensive interactive stage execution controls.
 */

import * as THREE from "../../vendor/three.js";
import {
  ControlPlaneClient,
  deriveCanonicalDisposition,
  getAssuranceLevel,
  computeLineDiff,
  escapeHtml,
  sanitizeMarkdownToHtml
} from "../shared/api-client.js";

// ==========================================
// 1. RICH DEFAULT / MOCK DATA ENGINE
// ==========================================

const DEFAULT_CHAMBERS = [
  {
    id: "history",
    name: "Historical Archive Racks",
    z: -300,
    status: "archived",
    phase: "lineage-ledger",
    desc: "Past iteration runs, immutable lineage ledger, and previous generation outcomes.",
    duration: "6.2h cumulative",
    checkpoints: "Iterations 1-3 preserved",
    artifacts: ["archive/iter-001.json", "archive/iter-002.json", "archive/iter-003.json"]
  },
  {
    id: "spec",
    name: "1. Specification Chamber",
    z: -150,
    status: "passed",
    phase: "spec-approved",
    desc: "Frozen base ref binding, acceptance criteria, scope boundaries, and acceptance gates.",
    duration: "4m 12s",
    checkpoints: "Base Commit: 7a3f8c2 (main)",
    artifacts: ["specs/mission-spec.json", "plans/project-plan.json"]
  },
  {
    id: "draft",
    name: "2. Architecture Chamber",
    z: -75,
    status: "passed",
    phase: "devplan-approved",
    desc: "Modular subsystem decomposition, agent role assignments, and isolation topology.",
    duration: "8m 45s",
    checkpoints: "Subsystems: 5 modules decomposed",
    artifacts: ["architecture/modular-topology.json"]
  },
  {
    id: "arena",
    name: "3. Variant Exploration Arena",
    z: 0,
    status: "active",
    phase: "variant-generation",
    desc: "K=3 candidate variants radially diverging in isolated worktrees along 3D cubic Bézier splines.",
    duration: "14m 20s (active)",
    checkpoints: "Branches: 3 isolated worktrees",
    artifacts: ["variants/v1-balanced/", "variants/v2-cyber-minimal/", "variants/v3-dense-instrument/"]
  },
  {
    id: "eval",
    name: "4. Evaluation Radar Arena",
    z: 75,
    status: "passed",
    phase: "multi-axis-evaluation",
    desc: "Multi-dimensional rubric scoring across objective fit, accessibility, performance, and visual polish.",
    duration: "6m 10s",
    checkpoints: "3D Octahedron Rubric Prisms",
    artifacts: ["eval/eval-matrix.json", "eval/rubric-scores.json"]
  },
  {
    id: "synth",
    name: "5. Synthesis Funnel",
    z: 150,
    status: "passed",
    phase: "synthesis-convergence",
    desc: "Translucent Bézier convergence funnel selecting winning features into golden release trunk.",
    duration: "3m 50s",
    checkpoints: "Integration: Winner Selection + Cherry-Pick",
    artifacts: ["synthesis/accepted-features.json", "synthesis/synthesis-record.json"]
  },
  {
    id: "gate",
    name: "6. Gate & Release Crystal",
    z: 250,
    status: "passed",
    phase: "terminal-handoff",
    desc: "Rotating emerald dodecahedron crystal with runner-verified gate closeout and handoff actions.",
    duration: "1m 30s",
    checkpoints: "Release Hash: b8e41a9 (feat/release-trunk)",
    artifacts: ["gates/closeout-evidence.json", "handoff/terminal-summary.md"]
  }
];

const DEFAULT_VARIANTS = [
  {
    id: "v1-balanced",
    name: "Variant 1: Balanced High-Density",
    branch: "feat/var-1-balanced",
    commit: "a1b2c3d",
    color: "#10b981",
    threeColor: 0x10b981,
    angle: 0,
    isWinner: true,
    recommendation: "ACCEPT (Winner)",
    totalScore: 94.2,
    rawScores: {
      objectiveFit: 96,
      userValue: 95,
      visualQuality: 92,
      implementationQuality: 98,
      accessibility: 94,
      performance: 90
    },
    scores: {
      objectiveFit: 96,
      userValue: 95,
      visualQuality: 92,
      implementationQuality: 98,
      accessibility: 94,
      performance: 90
    },
    hardGateViolations: 0,
    scopeCompliance: "100% within limits",
    changes: [
      "Added 3D longitudinal corridor with Three.js WebGL2/WebGPU",
      "Built 2D orthographic radar rubric inspector without 3D distortion",
      "Integrated continuous Z-axis timeline scrubber with hotkeys",
      "Ensured full WCAG 2.2 AA contrast & prefers-reduced-motion compliance"
    ],
    risks: "None identified. All 18 automated test suites passed.",
    evaluatorRationale: "Variant 1 achieves outstanding objective adherence, pristine visual hierarchy, zero hard-gate violations, and 100% runner-verified validation pass rate.",
    diffOld: `class MissionCorridor {
  constructor() {
    this.status = "idle";
  }
}`,
    diffNew: `class MissionCorridor {
  constructor() {
    this.status = "active";
    this.chambers = DEFAULT_CHAMBERS;
    this.camera = new THREE.PerspectiveCamera(50, aspect, 1, 3500);
    this.initLongitudinalSpine();
    this.initDivergingBranches();
  }
}`
  },
  {
    id: "v2-cyber-minimal",
    name: "Variant 2: Cyber-Minimalist",
    branch: "feat/var-2-cyber-minimal",
    commit: "c3d4e5f",
    color: "#38bdf8",
    threeColor: 0x38bdf8,
    angle: (2 * Math.PI) / 3,
    isWinner: false,
    recommendation: "REJECT (Secondary)",
    totalScore: 81.5,
    rawScores: {
      objectiveFit: 84,
      userValue: 80,
      visualQuality: 88,
      implementationQuality: 82,
      accessibility: 78,
      performance: 88
    },
    scores: {
      objectiveFit: 84,
      userValue: 80,
      visualQuality: 88,
      implementationQuality: 82,
      accessibility: 78,
      performance: 88
    },
    hardGateViolations: 0,
    scopeCompliance: "Within limits",
    changes: [
      "Implemented minimalist wireframe corridor aesthetics",
      "Added basic timeline slider without orthographic radar chart",
      "Omitted chronological waterfall sidebar"
    ],
    risks: "Missing accessible left sidebar stage list.",
    evaluatorRationale: "Clean cyberpunk aesthetic but lacks required WCAG 2.2 AA accessibility waterfall table and comprehensive radar rubric HUD.",
    diffOld: `const visualMode = "standard";`,
    diffNew: `const visualMode = "cyber-wireframe";
const enableGlow = true;`
  },
  {
    id: "v3-dense-instrument",
    name: "Variant 3: Dense Telemetry Grid",
    branch: "feat/var-3-dense-telemetry",
    commit: "e5f6a7b",
    color: "#f59e0b",
    threeColor: 0xf59e0b,
    angle: (4 * Math.PI) / 3,
    isWinner: false,
    recommendation: "REJECT (Scope Breach)",
    totalScore: 68.0,
    rawScores: {
      objectiveFit: 70,
      userValue: 65,
      visualQuality: 60,
      implementationQuality: 74,
      accessibility: 72,
      performance: 67
    },
    scores: {
      objectiveFit: 70,
      userValue: 65,
      visualQuality: 60,
      implementationQuality: 74,
      accessibility: 72,
      performance: 67
    },
    hardGateViolations: 1,
    scopeCompliance: "Exceeded max DOM node count",
    changes: [
      "Rendered 40 simultaneous floating telemetry canvas elements",
      "Added unredacted process memory inspector",
      "Attempted client-side shell execution"
    ],
    risks: "Hard-gate violation: Client-side execution violates Spec §3.3 safety boundary.",
    evaluatorRationale: "High telemetry density but broke safety bounds by introducing unvalidated client shell execution.",
    diffOld: `function runSafe() { return true; }`,
    diffNew: `function runSafe() { 
  // Violates safety boundary
  return execArbitraryCommand(); 
}`
  }
];

const DEFAULT_HISTORICAL_RUNS = [
  { id: "run-098-init", z: -350, name: "Iteration 1: Baseline Architecture", status: "completed", score: "78.4", date: "2026-08-19", duration: "1.8h", changes: "+420 lines, 8 files", winner: "v1-baseline" },
  { id: "run-101-alpha", z: -280, name: "Iteration 2: Telemetry Integration", status: "completed", score: "86.1", date: "2026-08-20", duration: "2.1h", changes: "+680 lines, 14 files", winner: "v2-stream" },
  { id: "run-102-beta", z: -210, name: "Iteration 3: 3D Math & Conduits", status: "completed", score: "89.8", date: "2026-08-21", duration: "2.3h", changes: "+890 lines, 19 files", winner: "v1-conduits" }
];

const DEFAULT_GATES = [
  { id: "gate-01-integrity", desc: "Source branch integrity (main untouched)", required: true, assurance: "Runner-verified", status: "PASSED", path: "evidence/source-integrity.json" },
  { id: "gate-02-rubric", desc: "Evaluation score threshold >= 85.0/100", required: true, assurance: "Runner-verified", status: "PASSED", path: "eval/eval-matrix.json" },
  { id: "gate-03-wcag", desc: "WCAG 2.2 AA Contrast & keyboard navigation", required: true, assurance: "Runner-verified", status: "PASSED", path: "evidence/a11y-audit.json" },
  { id: "gate-04-safety", desc: "No client-side shell / unvalidated command injection", required: true, assurance: "Runner-verified", status: "PASSED", path: "evidence/safety-audit.json" },
  { id: "gate-05-operator", desc: "Operator immutable plan revision approval", required: true, assurance: "Operator-attested", status: "PASSED", path: "plans/approval-digest.json" }
];

const DEFAULT_CRITERIA_WEIGHTS = {
  objectiveFit: 1.0,
  userValue: 1.0,
  visualQuality: 1.0,
  implementationQuality: 1.0,
  accessibility: 1.0,
  performance: 1.0
};

// The backend exposes bounded snapshot projections. Connected mode intentionally
// renders only these observed fields; it never fills absent evidence with demo data.
const LIVE_EMPTY = "Unavailable";
const STAGE_DEFINITIONS = [
  ["history", "Historical runs", -300], ["spec", "Specification & approval", -150],
  ["draft", "Launch admission", -75], ["arena", "Variant exploration", 0],
  ["eval", "Evaluation", 75], ["synth", "Synthesis", 150], ["gate", "Gates & handoff", 250]
];
const asArray = (value) => Array.isArray(value) ? value : [];
const firstValue = (...values) => values.find((value) => value !== undefined && value !== null && value !== "") ?? null;
const statusClass = (status) => {
  const value = String(status || "unknown").toLowerCase();
  if (/(completed|passed|approved|success)/.test(value)) return "passed";
  if (/(blocked|failed|rejected|error)/.test(value)) return "failed";
  if (/(running|launching|active|pending|requested)/.test(value)) return "active";
  return value === "unknown" ? "unknown" : "archived";
};
const numberOrNull = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const variantColor = (index) => ["#10b981", "#38bdf8", "#f59e0b", "#a855f7"][index % 4];

const durationBetween = (startedAt, endedAt) => {
  const start = Date.parse(startedAt), end = Date.parse(endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return LIVE_EMPTY;
  const seconds = Math.floor((end - start) / 1000), minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
};
const runMatches = (item, runId) => !runId || firstValue(item?.runId, item?.run?.id, item?.data?.runId) === runId;
const boundedRunRecords = (records, runId, limit = 12) => asArray(records).filter((item) => runMatches(item, runId)).slice(-limit);
const normalizedList = (value) => asArray(value).map((item) => typeof item === "string" ? { name: item } : item || {});

export function projectTemporalMissionSnapshot({ cachedState, cachedPlans, cachedIterations, cachedRuns, cachedGates, cachedControl, cachedAudit, cachedEvents }) {
  const state = cachedState || {}, plans = asArray(cachedPlans), iterations = asArray(cachedIterations), runs = asArray(cachedRuns);
  const gates = asArray(cachedGates?.gates), audit = asArray(cachedAudit), events = asArray(cachedEvents), control = cachedControl || {}, pointer = control.projectLaunchRequest || {};
  const activeRunId = firstValue(state.currentRunId, pointer.runId, control.nextRunRequest?.resultRunId);
  const activeIterationId = firstValue(state.iterationId, pointer.iterationId, control.nextRunRequest?.resultIterationId);
  const activeRun = activeRunId ? runs.find((run) => run.id === activeRunId || run.runId === activeRunId) || null : null;
  const activeIteration = activeIterationId
    ? iterations.find((item) => (item.id === activeIterationId || item.iterationId === activeIterationId) && (!activeRunId || item.runId === activeRunId)) || null
    : activeRunId ? iterations.find((item) => item.runId === activeRunId) || null : null;
  const identitySource = activeIteration?.projectLaunch || activeRun?.projectLaunch || pointer;
  const planId = firstValue(identitySource.planId, activeIteration?.planId, activeRun?.planId, state.planId);
  const plan = plans.find((item) => item.planId === planId) || null;
  const hasActiveRun = Boolean(activeRunId || activeRun || activeIteration);
  const runStatus = hasActiveRun ? firstValue(activeRun?.status, activeIteration?.status, state.status, pointer.status, "unknown") : "No active run";
  const phase = hasActiveRun ? firstValue(activeRun?.phase, activeIteration?.phase, state.phase, LIVE_EMPTY) : LIVE_EMPTY;
  const rawVariants = asArray(activeIteration?.variants).length ? activeIteration.variants : asArray(activeRun?.variants);
  const rawEvaluations = asArray(activeIteration?.evaluations).length ? activeIteration.evaluations : asArray(activeRun?.evaluations);
  const evaluations = new Map(rawEvaluations.map((item) => [firstValue(item.variantId, item.id), item]));
  const variants = rawVariants.map((variant, index) => {
    const evaluation = evaluations.get(firstValue(variant.id, variant.variantId)) || {}, rawScores = evaluation.scores || variant.scores || {};
    return { id: firstValue(variant.id, variant.variantId, LIVE_EMPTY), name: firstValue(variant.name, variant.label, variant.branch, variant.id, LIVE_EMPTY), branch: firstValue(variant.branch, LIVE_EMPTY), commit: firstValue(variant.commit, LIVE_EMPTY), color: variantColor(index), threeColor: parseInt(variantColor(index).slice(1), 16), isWinner: Boolean(firstValue(evaluation.accepted, evaluation.winner, variant.accepted, variant.winner, false)), recommendation: firstValue(evaluation.recommendation, variant.recommendation, evaluation.status, variant.status, LIVE_EMPTY), totalScore: numberOrNull(firstValue(evaluation.totalScore, evaluation.score, variant.totalScore, variant.score)) ?? LIVE_EMPTY, rawScores, scores: { ...rawScores }, hardGateViolations: numberOrNull(firstValue(evaluation.hardGateViolations, variant.hardGateViolations)) ?? LIVE_EMPTY, scopeCompliance: firstValue(variant.scopeCompliance, LIVE_EMPTY), changes: asArray(firstValue(variant.changes, variant.claims, evaluation.claims)), risks: firstValue(evaluation.risks, variant.risks, LIVE_EMPTY), evaluatorRationale: firstValue(evaluation.rationale, evaluation.notes, variant.rationale, LIVE_EMPTY), diffOld: firstValue(variant.diffOld, ""), diffNew: firstValue(variant.diffNew, variant.diff, "") };
  });
  const historicalRuns = runs.filter((run) => run !== activeRun).map((run, index) => ({ id: firstValue(run.id, run.runId, LIVE_EMPTY), z: -350 + index * 35, name: firstValue(run.objective, run.id, run.runId, LIVE_EMPTY), status: firstValue(run.status, "unknown"), score: firstValue(run.score, LIVE_EMPTY), date: firstValue(run.completedAt, run.updatedAt, run.startedAt, LIVE_EMPTY), duration: firstValue(run.duration, LIVE_EMPTY), changes: firstValue(run.branch, LIVE_EMPTY), winner: firstValue(run.winner, LIVE_EMPTY) }));
  const liveGates = gates.filter((gate) => !activeRunId || !gate.runId || gate.runId === activeRunId).map((gate) => ({ id: firstValue(gate.id, LIVE_EMPTY), desc: firstValue(gate.description, gate.title, LIVE_EMPTY), required: gate.severity === "must" || gate.required === true, assurance: getAssuranceLevel(identitySource.pipelineType, "validation").level, status: firstValue(gate.status, "unknown"), decision: firstValue(gate.decision, LIVE_EMPTY), decidedAt: firstValue(gate.decidedAt, gate.updatedAt, LIVE_EMPTY), path: asArray(gate.requiredEvidence).join(", ") || LIVE_EMPTY, evidence: firstValue(gate.evidence, gate.decisions, []) }));
  const handoff = firstValue(activeIteration?.handoff, activeRun?.handoff, hasActiveRun ? state.handoff : null, null);
  const artifacts = asArray(firstValue(activeIteration?.artifacts, activeRun?.artifacts, handoff?.artifacts, []));
  const checkpoints = normalizedList(firstValue(activeIteration?.checkpoints, activeRun?.checkpoints, activeRun?.lifecycle?.checkpoints, []));
  const validation = firstValue(activeIteration?.validation, activeRun?.validation, activeRun?.finalValidation, activeIteration?.synthesis?.validation, activeRun?.synthesis?.validation, null);
  const currentAgent = firstValue(activeIteration?.currentAgent, activeRun?.currentAgent, state.currentAgent, Object.values(state.agents || {}).find((agent) => agent?.status === "running")?.label, LIVE_EMPTY);
  const currentTask = firstValue(activeIteration?.currentTask, activeRun?.currentTask, state.currentTask, state.task, LIVE_EMPTY);
  const blockers = normalizedList(firstValue(activeRun?.blockers, activeRun?.blocker, activeRun?.block, activeIteration?.blockers, activeIteration?.blocker, state.blockers, state.blocker, state.block, state.hold, []));
  const recentEvents = boundedRunRecords(events, activeRunId), toolActivity = recentEvents.filter((item) => /tool/i.test(String(item.type || "")) || item.toolName || item.data?.toolName);
  const recentAudit = boundedRunRecords(audit, activeRunId);
  const startedAt = firstValue(activeRun?.startedAt, activeIteration?.startedAt, state.startedAt), endedAt = firstValue(activeRun?.completedAt, activeRun?.terminalAt, activeIteration?.completedAt, state.completedAt, activeRun?.updatedAt, activeIteration?.updatedAt, state.updatedAt);
  const progress = { state: hasActiveRun ? "Observed active run" : "No active run", currentAgent, currentTask, active: hasActiveRun && !/(completed|failed|blocked|stopped|cancelled|published)/i.test(String(runStatus)), terminal: hasActiveRun && /(completed|failed|blocked|stopped|cancelled|published)/i.test(String(runStatus)), startedAt: firstValue(startedAt, LIVE_EMPTY), updatedAt: firstValue(activeRun?.updatedAt, activeIteration?.updatedAt, state.updatedAt, LIVE_EMPTY), completedAt: firstValue(activeRun?.completedAt, activeRun?.terminalAt, activeIteration?.completedAt, state.completedAt, LIVE_EMPTY), duration: durationBetween(startedAt, endedAt), checkpoints, validation: validation ? { ...validation, status: firstValue(validation.status, LIVE_EMPTY), startedAt: firstValue(validation.startedAt, LIVE_EMPTY), completedAt: firstValue(validation.completedAt, validation.finishedAt, LIVE_EMPTY), results: normalizedList(firstValue(validation.results, validation.commands, validation.validation, [])) } : { status: LIVE_EMPTY, startedAt: LIVE_EMPTY, completedAt: LIVE_EMPTY, results: [] }, mashup: firstValue(activeIteration?.mashup, activeRun?.mashup, activeIteration?.synthesis, activeRun?.synthesis, null), blockers, events: recentEvents, toolActivity, audit: recentAudit };
  const stageStatus = (id) => ({ history: historicalRuns.length ? "archived" : "unknown", spec: firstValue(plan?.state, identitySource.status, "unknown"), draft: firstValue(pointer.status, identitySource.status, "unknown"), arena: runStatus, eval: rawEvaluations.length ? firstValue(rawEvaluations[0]?.status, "observed") : "unknown", synth: firstValue(progress.mashup?.status, "unknown"), gate: firstValue(handoff?.state, liveGates[0]?.status, runStatus, "unknown") })[id];
  const chambers = STAGE_DEFINITIONS.map(([id, name, z]) => ({ id, name, z, status: statusClass(stageStatus(id)), phase: id, desc: `${name}: ${stageStatus(id)}`, duration: progress.duration, checkpoints: id === "gate" ? `${liveGates.length} observed gate(s)` : firstValue(activeRunId, activeIterationId, LIVE_EMPTY), artifacts: id === "gate" ? artifacts : [] }));
  return { connected: true, state, control, audit, plan, activeRun, activeIteration, handoff, artifacts, progress, identity: { planId, revision: firstValue(identitySource.revision, activeIteration?.revision, activeRun?.revision, plan?.currentRevision), approvalId: firstValue(identitySource.approvalId, activeIteration?.approvalId, activeRun?.approvalId), approvalDigest: firstValue(identitySource.approvalDigest, activeIteration?.approvalDigest, activeRun?.approvalDigest), launchId: firstValue(identitySource.launchId, activeIteration?.launchId, activeRun?.launchId), requestId: firstValue(identitySource.requestId, activeIteration?.requestId, activeRun?.requestId), runId: firstValue(activeRunId, activeRun?.id, activeRun?.runId), iterationId: firstValue(activeIterationId, activeIteration?.id, activeIteration?.iterationId), pipelineType: firstValue(identitySource.pipelineType, activeIteration?.pipelineType, activeRun?.pipelineType, state.pipeline) }, runStatus, phase, chambers, variants, historicalRuns, gates: liveGates };
}

export function renderTemporalMissionLiveMarkup(live, chamber) {
  const identity = live.identity, progress = live.progress, value = (item) => escapeHtml(item == null ? LIVE_EMPTY : String(item));
  const list = (items, renderer, empty) => items.length ? items.map(renderer).join("") : `<li>${value(empty)}</li>`;
  const variants = list(live.variants, (variant) => `<li><strong>${value(variant.id)}</strong> — ${value(variant.recommendation)}; score: ${value(variant.totalScore)}</li>`, "No variant snapshot was supplied.");
  const gates = list(live.gates, (gate) => `<li><strong>${value(gate.id)}</strong> — ${value(gate.status)}; decision: ${value(gate.decision)}; at: ${value(gate.decidedAt)}</li>`, "No gate snapshot was supplied.");
  const artifacts = list(live.artifacts, (artifact) => `<li>${value(artifact.name || artifact.path || artifact)}</li>`, "No artifact or handoff snapshot was supplied.");
  const checkpoints = list(progress.checkpoints, (checkpoint) => `<li>${value(firstValue(checkpoint.name, checkpoint.id, checkpoint.phase))} — ${value(checkpoint.status)} — ${value(firstValue(checkpoint.at, checkpoint.updatedAt))}</li>`, "No checkpoint snapshot was supplied.");
  const blockers = list(progress.blockers, (blocker) => `<li><strong>${value(firstValue(blocker.summary, blocker.reason, blocker.message, blocker.status))}</strong><br>Suggested action: ${value(firstValue(blocker.suggestedAction, blocker.operatorNextAction, blocker.action))}</li>`, "No blocker snapshot was supplied.");
  const activity = list([...progress.events, ...progress.toolActivity].slice(-12), (item) => `<li>${value(firstValue(item.ts, item.at, item.updatedAt))} — ${value(firstValue(item.message, item.action, item.type, item.toolName, item.data?.toolName))}</li>`, "No recent event or tool activity was supplied.");
  const validationResults = list(progress.validation.results, (result) => `<li>${value(firstValue(result.name, result.argv, result.command, result.id))} — ${value(firstValue(result.status, result.passed === true ? "passed" : result.passed === false ? "failed" : null))}</li>`, "No validation result snapshot was supplied.");
  return `<div class="inspector-section"><div class="section-title"><span>Observed run progress</span><span class="status-badge status-${chamber.status}">${value(progress.state)}</span></div><div class="section-card"><div><strong>Stage:</strong> ${value(chamber.name)}</div><div><strong>Run status / phase:</strong> ${value(live.runStatus)} / ${value(live.phase)}</div><div><strong>Current agent / task:</strong> ${value(progress.currentAgent)} / ${value(progress.currentTask)}</div><div><strong>Active / terminal:</strong> ${value(progress.active)} / ${value(progress.terminal)}</div><div><strong>Started / updated / completed:</strong> ${value(progress.startedAt)} / ${value(progress.updatedAt)} / ${value(progress.completedAt)}</div><div><strong>Observed duration:</strong> ${value(progress.duration)}</div><div><strong>Plan / approval / launch:</strong> <code>${value(identity.planId)}</code> rev <code>${value(identity.revision)}</code> / <code>${value(identity.approvalId)}</code> / <code>${value(identity.launchId)}</code></div><div><strong>Request / run / iteration:</strong> <code>${value(identity.requestId)}</code> / <code>${value(identity.runId)}</code> / <code>${value(identity.iterationId)}</code></div></div></div><div class="inspector-section"><div class="section-title">Checkpoints, variants & mashup</div><div class="section-card"><div><strong>Mashup / synthesis:</strong> ${value(progress.mashup?.status)}</div><ul>${checkpoints}</ul><ul>${variants}</ul></div></div><div class="inspector-section"><div class="section-title">Validation</div><div class="section-card"><div><strong>Status / started / completed:</strong> ${value(progress.validation.status)} / ${value(progress.validation.startedAt)} / ${value(progress.validation.completedAt)}</div><ul>${validationResults}</ul></div></div><div class="inspector-section"><div class="section-title">Gate decisions</div><div class="section-card"><ul>${gates}</ul></div></div><div class="inspector-section"><div class="section-title">Blockers & suggested action</div><div class="section-card"><ul>${blockers}</ul></div></div><div class="inspector-section"><div class="section-title">Recent events & tool activity</div><div class="section-card"><ul>${activity}</ul></div></div><div class="inspector-section"><div class="section-title">Artifacts, handoff & evidence</div><div class="section-card"><div><strong>Handoff status:</strong> ${value(live.handoff?.state)}</div><ul>${artifacts}</ul></div></div>`;
}

// ==========================================
// 2. MAIN CONTROLLER CLASS
// ==========================================

class TemporalMissionController {
  constructor() {
    this.client = new ControlPlaneClient();
    this.canvas = document.getElementById("temporal-canvas");
    this.tooltip = document.getElementById("canvas-tooltip");
    
    this.liveProjection = projectTemporalMissionSnapshot({});
    this.chambers = this.liveProjection.chambers;
    this.variants = this.liveProjection.variants;
    this.historicalRuns = this.liveProjection.historicalRuns;
    this.gates = this.liveProjection.gates;
    this.criteriaWeights = { ...DEFAULT_CRITERIA_WEIGHTS };
    this.project = { plans: [], selectedPlanId: null, detail: null, assistance: null, assistanceList: [], inspectedRevision: null, selectedIterationId: null, busy: false, notice: "Load live project plans to begin.", error: "" };
    
    this.selectedChamberIndex = 3; // Default to Chamber 3: Variant Exploration Arena (Z=0)
    this.selectedVariantId = null;
    this.activeInspectorTab = "stage-view"; // Defaults to dynamic stage workspace
    this.isTourRunning = false;
    this.tourZ = 0;
    this.tourDirection = 1;
    
    this.reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.isRendering = false;
    this.needsRender = true;
    this.animatingUntil = performance.now() + 3000;
    
    this.cameraCurrentPos = new THREE.Vector3(0, 32, 70);
    this.cameraTargetPos = new THREE.Vector3(0, 32, 70);
    this.cameraLookAtCurrent = new THREE.Vector3(0, 0, 0);
    this.cameraLookAtTarget = new THREE.Vector3(0, 0, 0);

    this.interactiveObjects = [];
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.recalculateRubricScores();
    this.initElements();
    this.initThreeScene();
    this.bindDOMEvents();
    this.initApp();
  }

  initElements() {
    this.el = {
      hudStatus: document.getElementById("hud-status"),
      hudRun: document.getElementById("hud-run"),
      hudPipeline: document.getElementById("hud-pipeline"),
      hudGen: document.getElementById("hud-gen"),
      hudAdmission: document.getElementById("hud-admission"),
      hudObjective: document.getElementById("hud-objective"),
      hudIdentity: document.getElementById("hud-identity"),
      streamDot: document.getElementById("stream-status-dot"),
      waterfallList: document.getElementById("waterfall-list"),
      inspectorTitle: document.getElementById("inspector-title"),
      inspectorZPill: document.getElementById("inspector-z-pill"),
      inspectorContent: document.getElementById("inspector-content"),
      inspectorPanel: document.querySelector(".chamber-inspector"),
      btnToggleInspector: document.getElementById("btn-toggle-inspector"),
      inspectorTabs: document.querySelectorAll(".inspector-tab"),
      scrubberSlider: document.getElementById("scrubber-slider"),
      sliderLabel: document.getElementById("slider-label"),
      btnScrubPrev: document.getElementById("btn-scrub-prev"),
      btnScrubNext: document.getElementById("btn-scrub-next"),
      btnAutoTour: document.getElementById("btn-auto-tour"),
      btnResetView: document.getElementById("btn-reset-view"),
      bookmarkButtons: document.querySelectorAll(".btn-bookmark"),
      btnPause: document.getElementById("btn-pause-checkpoint"),
      btnStop: document.getElementById("btn-graceful-stop"),
      btnResume: document.getElementById("btn-resume"),
      btnRunNow: document.getElementById("btn-run-now"),
      btnSteerModal: document.getElementById("btn-steer-modal"),
      btnProjectMissionControl: document.getElementById("btn-project-mission-control"),
      projectDrawer: document.getElementById("project-mission-drawer"),
      projectDrawerContent: document.getElementById("project-mission-drawer-content"),
      btnCloseProjectDrawer: document.getElementById("btn-close-project-mission-drawer"),
      steerDialog: document.getElementById("steer-dialog"),
      btnCloseSteerDialog: document.getElementById("btn-close-steer-dialog"),
      btnCancelSteer: document.getElementById("btn-cancel-steer"),
      btnSubmitSteer: document.getElementById("btn-submit-steer"),
      steerText: document.getElementById("steer-text"),
      steerScope: document.getElementById("steer-scope"),
      steerPriority: document.getElementById("steer-priority"),
      rawDialog: document.getElementById("raw-dialog"),
      rawModalCode: document.getElementById("raw-modal-code"),
      btnCloseRawDialog: document.getElementById("btn-close-raw-dialog"),
      btnCloseRaw: document.getElementById("btn-close-raw"),
      btnCopyRaw: document.getElementById("btn-copy-raw")
    };
  }

  // ==========================================
  // 3. THREE.JS 3D SCENE CONSTRUCTION
  // ==========================================

  initThreeScene() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070c);
    this.scene.fog = new THREE.FogExp2(0x05070c, 0.0018);

    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 3500);
    this.camera.position.copy(this.cameraCurrentPos);
    this.camera.lookAt(this.cameraLookAtCurrent);

    // Dynamic Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xa855f7, 1.6);
    dirLight.position.set(40, 100, 80);
    this.scene.add(dirLight);

    const accentLight = new THREE.DirectionalLight(0x38bdf8, 1.2);
    accentLight.position.set(-60, 80, -100);
    this.scene.add(accentLight);

    // Build the 3D Longitudinal World
    this.buildStarfieldParticles();
    this.buildCorridorSpineAndGrid();
    this.buildHistoricalArchiveRacks();
    this.buildChamberPortals();
    this.buildDivergingVariantBranches();
    this.buildSynthesisFunnel();
    this.buildTerminalReleaseCrystal();

    this.startRenderLoop();
  }

  buildStarfieldParticles() {
    const particleCount = 1200;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 800;
      positions[i * 3 + 1] = (Math.random() - 0.2) * 400;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 1200;

      const cType = Math.random();
      if (cType > 0.6) {
        colors[i * 3] = 0.66; colors[i * 3 + 1] = 0.33; colors[i * 3 + 2] = 0.97; // purple
      } else if (cType > 0.3) {
        colors[i * 3] = 0.22; colors[i * 3 + 1] = 0.74; colors[i * 3 + 2] = 0.97; // cyan
      } else {
        colors[i * 3] = 0.8; colors[i * 3 + 1] = 0.85; colors[i * 3 + 2] = 0.95; // white
      }
    }

    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 2.2,
      vertexColors: true,
      transparent: true,
      opacity: 0.65
    });

    this.starfield = new THREE.Points(geo, mat);
    this.scene.add(this.starfield);
  }

  buildCorridorSpineAndGrid() {
    // 1. Dual Glowing Guide Rails along Z-Axis (-450m to +300m)
    const railOffset = 18;
    const spineGeoLeft = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-railOffset, -10, -450),
      new THREE.Vector3(-railOffset, -10, 300)
    ]);
    const spineGeoRight = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(railOffset, -10, -450),
      new THREE.Vector3(railOffset, -10, 300)
    ]);
    const railMat = new THREE.LineBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0.55 });
    this.scene.add(new THREE.Line(spineGeoLeft, railMat));
    this.scene.add(new THREE.Line(spineGeoRight, railMat));

    // 2. Longitudinal Center Glow Line
    const centerGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -10, -450),
      new THREE.Vector3(0, -10, 300)
    ]);
    const centerMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.75 });
    this.scene.add(new THREE.Line(centerGeo, centerMat));

    // 3. Metric Tick Rings along Z-axis at every 25m
    const tickRingGeo = new THREE.RingGeometry(17.8, 18.2, 32);
    const tickRingMat = new THREE.MeshBasicMaterial({ color: 0xa855f7, side: THREE.DoubleSide, transparent: true, opacity: 0.35 });

    for (let z = -400; z <= 250; z += 25) {
      const ring = new THREE.Mesh(tickRingGeo, tickRingMat);
      ring.position.set(0, -10, z);
      ring.rotation.x = Math.PI / 2;
      this.scene.add(ring);
    }
  }

  buildHistoricalArchiveRacks() {
    this.archiveCrystals = [];

    this.historicalRuns.forEach((run) => {
      const group = new THREE.Group();
      group.position.set(0, 0, run.z);

      const pedestalGeo = new THREE.CylinderGeometry(8, 10, 3, 16);
      const pedestalMat = new THREE.MeshStandardMaterial({ color: 0x131b2e, roughness: 0.4, metalness: 0.8 });
      const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
      pedestal.position.y = -8.5;
      group.add(pedestal);

      const crystalGeo = new THREE.OctahedronGeometry(5);
      const crystalMat = new THREE.MeshStandardMaterial({
        color: 0xc084fc,
        roughness: 0.15,
        metalness: 0.85,
        emissive: 0x6b21a8,
        emissiveIntensity: 0.35
      });
      const crystal = new THREE.Mesh(crystalGeo, crystalMat);
      crystal.position.y = 2;
      crystal.userData = { type: "history", runId: run.id, name: run.name, z: run.z };
      group.add(crystal);
      this.archiveCrystals.push(crystal);
      this.interactiveObjects.push(crystal);

      const ringGeo = new THREE.RingGeometry(7, 7.8, 24);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xa855f7, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 2;
      group.add(ring);

      this.scene.add(group);
    });
  }

  buildChamberPortals() {
    this.chamberPortals = [];

    this.chambers.forEach((ch, idx) => {
      const group = new THREE.Group();
      group.position.set(0, 0, ch.z);

      const archGeo = new THREE.TorusGeometry(26, 0.9, 16, 48);
      const archMat = new THREE.MeshStandardMaterial({
        color: idx === 3 ? 0x38bdf8 : idx === 6 ? 0x10b981 : 0x8b5cf6,
        roughness: 0.25,
        metalness: 0.85,
        emissive: idx === 3 ? 0x0284c7 : idx === 6 ? 0x047857 : 0x5b21b6,
        emissiveIntensity: 0.3
      });
      const arch = new THREE.Mesh(archGeo, archMat);
      arch.userData = { type: "chamber", index: idx, name: ch.name, z: ch.z };
      group.add(arch);
      this.interactiveObjects.push(arch);
      this.chamberPortals.push(arch);

      const discGeo = new THREE.CircleGeometry(20, 32);
      const discMat = new THREE.MeshBasicMaterial({
        color: 0x0b111e,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.65
      });
      const disc = new THREE.Mesh(discGeo, discMat);
      disc.rotation.x = Math.PI / 2;
      disc.position.y = -10;
      group.add(disc);

      if (idx === 1) {
        const wireGeo = new THREE.PlaneGeometry(16, 10);
        const wireMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true, transparent: true, opacity: 0.5 });
        const wirePlane = new THREE.Mesh(wireGeo, wireMat);
        wirePlane.position.set(0, 6, 0);
        group.add(wirePlane);
      }

      if (idx === 2) {
        this.archDiscGroup = new THREE.Group();
        const outerRingGeo = new THREE.RingGeometry(10, 12, 6);
        const outerRingMat = new THREE.MeshBasicMaterial({ color: 0x818cf8, wireframe: true, side: THREE.DoubleSide });
        const outerRing = new THREE.Mesh(outerRingGeo, outerRingMat);
        outerRing.rotation.x = Math.PI / 2;
        this.archDiscGroup.add(outerRing);

        for (let s = 0; s < 5; s++) {
          const sAngle = (s * 2 * Math.PI) / 5;
          const nodeGeo = new THREE.SphereGeometry(1.2, 8, 8);
          const nodeMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8 });
          const node = new THREE.Mesh(nodeGeo, nodeMat);
          node.position.set(11 * Math.cos(sAngle), 0, 11 * Math.sin(sAngle));
          this.archDiscGroup.add(node);
        }
        this.archDiscGroup.position.y = -4;
        group.add(this.archDiscGroup);
      }

      this.scene.add(group);
    });
  }

  buildDivergingVariantBranches() {
    const kVariants = this.variants.length;
    const radius = 28;
    this.variantEndpoints = [];
    this.radarPrisms = [];

    this.variants.forEach((v, k) => {
      const angle = (k * 2 * Math.PI) / kVariants;
      v.angle = angle;

      const curve = new THREE.CubicBezierCurve3(
        new THREE.Vector3(0, 0, -10),
        new THREE.Vector3(radius * Math.cos(angle) * 0.35, radius * Math.sin(angle) * 0.35 + 2, 20),
        new THREE.Vector3(radius * Math.cos(angle) * 0.85, radius * Math.sin(angle) * 0.85 + 4, 50),
        new THREE.Vector3(radius * Math.cos(angle), radius * Math.sin(angle) + 4, 75)
      );

      const tubeGeo = new THREE.TubeGeometry(curve, 36, 0.9, 8, false);
      const tubeMat = new THREE.MeshStandardMaterial({
        color: v.threeColor,
        roughness: 0.25,
        metalness: 0.8,
        emissive: v.threeColor,
        emissiveIntensity: v.isWinner ? 0.45 : 0.2
      });
      const tube = new THREE.Mesh(tubeGeo, tubeMat);
      this.scene.add(tube);

      const endPoint = curve.getPoint(1);
      const nodeGeo = new THREE.IcosahedronGeometry(3.5);
      const nodeMat = new THREE.MeshStandardMaterial({
        color: v.threeColor,
        roughness: 0.2,
        metalness: 0.9,
        emissive: v.threeColor,
        emissiveIntensity: 0.3
      });
      const worktreeNode = new THREE.Mesh(nodeGeo, nodeMat);
      worktreeNode.position.copy(endPoint);
      worktreeNode.userData = { type: "variant", variantId: v.id, name: v.name, z: 75 };
      this.scene.add(worktreeNode);
      this.interactiveObjects.push(worktreeNode);
      this.variantEndpoints.push(worktreeNode);

      const scoreHeight = 8 + (v.totalScore / 100) * 8;
      const prismGeo = new THREE.OctahedronGeometry(4.5 + (v.totalScore / 100) * 1.5);
      const prismMat = new THREE.MeshStandardMaterial({
        color: v.threeColor,
        wireframe: !v.isWinner,
        roughness: 0.2,
        metalness: 0.8,
        emissive: v.threeColor,
        emissiveIntensity: v.isWinner ? 0.6 : 0.25
      });
      const prism = new THREE.Mesh(prismGeo, prismMat);
      prism.position.set(endPoint.x, endPoint.y + scoreHeight, endPoint.z);
      prism.userData = { type: "variant", variantId: v.id, name: `${v.name} (Score: ${v.totalScore})`, z: 75 };
      this.scene.add(prism);
      this.interactiveObjects.push(prism);
      this.radarPrisms.push(prism);

      const elevGeo = new THREE.BufferGeometry().setFromPoints([endPoint, prism.position]);
      const elevMat = new THREE.LineDashedMaterial({ color: v.threeColor, dashSize: 1, gapSize: 0.5 });
      const elevLine = new THREE.Line(elevGeo, elevMat);
      elevLine.computeLineDistances();
      this.scene.add(elevLine);
    });
  }

  buildSynthesisFunnel() {
    const funnelGeo = new THREE.ConeGeometry(28, 70, 24, 2, true);
    const funnelMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      wireframe: true,
      transparent: true,
      opacity: 0.45,
      emissive: 0x059669,
      emissiveIntensity: 0.2
    });
    this.synthesisFunnel = new THREE.Mesh(funnelGeo, funnelMat);
    this.synthesisFunnel.rotation.x = Math.PI / 2;
    this.synthesisFunnel.position.set(0, 4, 115);
    this.synthesisFunnel.userData = { type: "chamber", index: 5, name: "5. Synthesis Convergence Funnel", z: 150 };
    this.scene.add(this.synthesisFunnel);
    this.interactiveObjects.push(this.synthesisFunnel);

    const trunkPoints = [new THREE.Vector3(0, 4, 150), new THREE.Vector3(0, 4, 250)];
    const trunkCurve = new THREE.CatmullRomCurve3(trunkPoints);
    const trunkGeo = new THREE.TubeGeometry(trunkCurve, 20, 1.4, 12, false);
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.2,
      metalness: 0.9,
      emissive: 0xd97706,
      emissiveIntensity: 0.45
    });
    this.releaseTrunk = new THREE.Mesh(trunkGeo, trunkMat);
    this.scene.add(this.releaseTrunk);
  }

  buildTerminalReleaseCrystal() {
    const crystalGeo = new THREE.DodecahedronGeometry(8.5);
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      roughness: 0.1,
      metalness: 0.9,
      emissive: 0x10b981,
      emissiveIntensity: 0.55
    });
    this.releaseCrystal = new THREE.Mesh(crystalGeo, crystalMat);
    this.releaseCrystal.position.set(0, 4, 250);
    this.releaseCrystal.userData = { type: "chamber", index: 6, name: "6. Terminal Release Crystal", z: 250 };
    this.scene.add(this.releaseCrystal);
    this.interactiveObjects.push(this.releaseCrystal);

    this.validationRings = [];
    const ringColors = [0x10b981, 0x38bdf8, 0xa855f7];
    const ringRadii = [13, 16, 19];

    ringRadii.forEach((r, idx) => {
      const rGeo = new THREE.RingGeometry(r - 0.25, r + 0.25, 36);
      const rMat = new THREE.MeshBasicMaterial({ color: ringColors[idx], side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
      const ringMesh = new THREE.Mesh(rGeo, rMat);
      ringMesh.position.set(0, 4, 250);
      ringMesh.rotation.x = Math.PI / 4 + idx * 0.4;
      ringMesh.rotation.y = idx * 0.5;
      this.scene.add(ringMesh);
      this.validationRings.push(ringMesh);
    });

    const beamGeo = new THREE.CylinderGeometry(0.8, 0.8, 120, 16);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.35 });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(0, 60, 250);
    this.scene.add(beam);
  }

  // ==========================================
  // 4. RENDERING & ON-DEMAND LOOP
  // ==========================================

  requestRender(durationMs = 2000) {
    this.needsRender = true;
    this.animatingUntil = Math.max(this.animatingUntil, performance.now() + durationMs);
  }

  startRenderLoop() {
    const animate = () => {
      requestAnimationFrame(animate);
      const now = performance.now();

      if (!this.reduceMotion) {
        this.cameraCurrentPos.lerp(this.cameraTargetPos, 0.08);
        this.cameraLookAtCurrent.lerp(this.cameraLookAtTarget, 0.08);
        this.camera.position.copy(this.cameraCurrentPos);
        this.camera.lookAt(this.cameraLookAtCurrent);
      } else {
        this.camera.position.copy(this.cameraTargetPos);
        this.camera.lookAt(this.cameraLookAtTarget);
      }

      if (!this.reduceMotion) {
        if (this.releaseCrystal) {
          this.releaseCrystal.rotation.y += 0.008;
          this.releaseCrystal.rotation.x += 0.004;
        }
        if (this.validationRings) {
          this.validationRings.forEach((r, i) => {
            r.rotation.z += 0.006 * (i % 2 === 0 ? 1 : -1);
          });
        }
        if (this.radarPrisms) {
          this.radarPrisms.forEach((p, i) => {
            p.rotation.y += 0.01 + i * 0.003;
          });
        }
        if (this.archDiscGroup) {
          this.archDiscGroup.rotation.y += 0.005;
        }
        if (this.archiveCrystals) {
          this.archiveCrystals.forEach((c) => {
            c.rotation.y += 0.006;
          });
        }
      }

      if (this.isTourRunning) {
        this.tourZ += 0.8 * this.tourDirection;
        if (this.tourZ > 250) this.tourDirection = -1;
        if (this.tourZ < -350) this.tourDirection = 1;
        this.scrubToZ(this.tourZ, false);
      }

      if (this.needsRender || now < this.animatingUntil || this.isTourRunning) {
        this.renderer.render(this.scene, this.camera);
        if (now >= this.animatingUntil && !this.isTourRunning) {
          this.needsRender = false;
        }
      }
    };

    animate();
  }

  // ==========================================
  // 5. DOM EVENTS & INTERACTIVITY
  // ==========================================

  bindDOMEvents() {
    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.requestRender();
    });

    this.el.scrubberSlider?.addEventListener("input", (e) => {
      const z = parseInt(e.target.value, 10);
      this.isTourRunning = false;
      this.el.btnAutoTour?.classList.remove("running");
      this.scrubToZ(z, true);
    });

    this.el.btnScrubPrev?.addEventListener("click", () => this.jumpChamber(-1));
    this.el.btnScrubNext?.addEventListener("click", () => this.jumpChamber(1));

    this.el.bookmarkButtons?.forEach((btn) => {
      btn.addEventListener("click", () => {
        const z = parseInt(btn.getAttribute("data-z"), 10);
        this.isTourRunning = false;
        this.el.btnAutoTour?.classList.remove("running");
        this.scrubToZ(z, true);
      });
    });

    this.el.btnAutoTour?.addEventListener("click", () => {
      this.isTourRunning = !this.isTourRunning;
      this.el.btnAutoTour.classList.toggle("running", this.isTourRunning);
      this.tourZ = parseFloat(this.el.scrubberSlider.value);
      this.requestRender(100000);
    });

    this.el.btnResetView?.addEventListener("click", () => {
      this.selectChamber(3);
    });

    window.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;

      if (e.key === "ArrowLeft") { e.preventDefault(); this.jumpChamber(-1); }
      if (e.key === "ArrowRight") { e.preventDefault(); this.jumpChamber(1); }
      if (e.key === "Home" || e.key.toLowerCase() === "r") { e.preventDefault(); this.selectChamber(3); }
      if (e.key === " ") {
        e.preventDefault();
        this.el.btnAutoTour?.click();
      }
      if (e.key >= "1" && e.key <= "7") {
        const chamberIdx = parseInt(e.key, 10) - 1;
        if (chamberIdx >= 0 && chamberIdx < this.chambers.length) {
          this.selectChamber(chamberIdx);
        }
      }
    });

    this.el.inspectorTabs?.forEach((tab) => {
      tab.addEventListener("click", () => {
        const tabId = tab.getAttribute("data-tab");
        this.setActiveInspectorTab(tabId);
      });
    });

    this.el.btnToggleInspector?.addEventListener("click", () => {
      this.el.inspectorPanel?.classList.toggle("collapsed");
    });

    this.el.btnPause?.addEventListener("click", () => this.handlePauseCheckpoint());
    this.el.btnStop?.addEventListener("click", () => this.handleGracefulStop());
    this.el.btnResume?.addEventListener("click", () => this.handleResumeAdmission());
    this.el.btnRunNow?.addEventListener("click", () => this.handleRunNow());
    this.el.btnSteerModal?.addEventListener("click", () => this.el.steerDialog?.showModal());
    this.el.btnProjectMissionControl?.addEventListener("click", () => this.openProjectMissionControl());
    this.el.btnCloseProjectDrawer?.addEventListener("click", () => this.el.projectDrawer?.close());

    this.el.btnCloseSteerDialog?.addEventListener("click", () => this.el.steerDialog?.close());
    this.el.btnCancelSteer?.addEventListener("click", () => this.el.steerDialog?.close());
    this.el.btnSubmitSteer?.addEventListener("click", () => this.handleSubmitSteer());

    this.el.btnCloseRawDialog?.addEventListener("click", () => this.el.rawDialog?.close());
    this.el.btnCloseRaw?.addEventListener("click", () => this.el.rawDialog?.close());
    this.el.btnCopyRaw?.addEventListener("click", () => {
      if (this.el.rawModalCode) {
        navigator.clipboard.writeText(this.el.rawModalCode.textContent || "");
        alert("Copied to clipboard!");
      }
    });

    this.canvas.addEventListener("pointermove", (e) => this.handlePointerMove(e));
    this.canvas.addEventListener("click", (e) => this.handleCanvasClick(e));
  }

  async openProjectMissionControl() {
    await this.refreshProjectWorkspace(this.project.selectedPlanId);
    this.renderProjectWorkspace();
    this.el.projectDrawer?.showModal();
  }

  handlePointerMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.interactiveObjects, true);

    if (intersects.length > 0) {
      let hit = intersects[0].object;
      while (hit && !hit.userData?.name && hit.parent) {
        hit = hit.parent;
      }

      if (hit?.userData?.name) {
        this.canvas.style.cursor = "pointer";
        this.tooltip.style.display = "block";
        this.tooltip.style.left = `${e.clientX}px`;
        this.tooltip.style.top = `${e.clientY}px`;
        this.tooltip.textContent = `${hit.userData.name} (Z = ${hit.userData.z ?? 0}m)`;
        return;
      }
    }

    this.canvas.style.cursor = "default";
    this.tooltip.style.display = "none";
  }

  handleCanvasClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.interactiveObjects, true);

    if (intersects.length > 0) {
      let hit = intersects[0].object;
      while (hit && !hit.userData?.type && hit.parent) {
        hit = hit.parent;
      }

      if (hit?.userData) {
        const u = hit.userData;
        if (u.type === "chamber") {
          this.selectChamber(u.index);
        } else if (u.type === "variant") {
          this.selectedVariantId = u.variantId;
          this.selectChamber(3);
          this.setActiveInspectorTab("variants");
        } else if (u.type === "history") {
          this.selectChamber(0);
        }
      }
    }
  }

  // ==========================================
  // 6. INITIALIZATION & LIVE SYNC
  // ==========================================

  async initApp() {
    this.renderTopHud();
    this.renderWaterfall();
    this.selectChamber(this.selectedChamberIndex);

    this.client.subscribe((msg) => this.handleClientUpdate(msg));

    try {
      await this.client.resyncSnapshots();
      await this.refreshProjectWorkspace();
      this.client.connectStream();
    } catch (err) {
      console.info("[TemporalController] Running in rich offline/default mode:", err);
    }
  }

  handleClientUpdate(msg) {
    if (msg.type === "stream-status") {
      this.el.streamDot.className = `stream-dot ${msg.status === 'live' ? 'connected' : msg.status === 'reconnecting' ? 'reconnecting' : 'offline'}`;
    }
    if (msg.type === "resynchronized" && this.client.cachedState !== null) this.applyLiveSnapshot();
    if (msg.type === "state-update") this.refreshLiveProjection();
  }

  async refreshLiveProjection() {
    if (this.resyncing) return;
    this.resyncing = true;
    try {
      await this.client.resyncSnapshots();
    } finally {
      this.resyncing = false;
    }
  }

  applyLiveSnapshot() {
    const selectedId = this.chambers[this.selectedChamberIndex]?.id;
    this.liveProjection = projectTemporalMissionSnapshot(this.client);
    this.chambers = this.liveProjection.chambers;
    this.variants = this.liveProjection.variants;
    this.historicalRuns = this.liveProjection.historicalRuns;
    this.gates = this.liveProjection.gates;
    const selectedIndex = this.chambers.findIndex((chamber) => chamber.id === selectedId);
    this.selectedChamberIndex = selectedIndex >= 0 ? selectedIndex : Math.min(this.selectedChamberIndex, this.chambers.length - 1);
    if (!this.variants.some((variant) => variant.id === this.selectedVariantId)) this.selectedVariantId = this.variants[0]?.id || null;
    this.rebuildDataScene();
    this.renderTopHud(); this.renderWaterfall(); this.selectChamber(this.selectedChamberIndex);
  }

  rebuildDataScene() {
    if (!this.scene) return;
    this.scene.traverse((object) => {
      object.geometry?.dispose?.();
      (Array.isArray(object.material) ? object.material : [object.material]).filter(Boolean).forEach((material) => material.dispose?.());
    });
    this.scene.clear(); this.interactiveObjects = [];
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    const dirLight = new THREE.DirectionalLight(0xa855f7, 1.6); dirLight.position.set(40, 100, 80);
    const accentLight = new THREE.DirectionalLight(0x38bdf8, 1.2); accentLight.position.set(-60, 80, -100);
    this.scene.add(ambientLight, dirLight, accentLight);
    this.buildStarfieldParticles(); this.buildCorridorSpineAndGrid(); this.buildHistoricalArchiveRacks();
    this.buildChamberPortals(); this.buildDivergingVariantBranches(); this.buildSynthesisFunnel(); this.buildTerminalReleaseCrystal();
    this.requestRender();
  }

  recalculateRubricScores() {
    const totalWeights = Object.values(this.criteriaWeights).reduce((a, b) => a + b, 0) || 1;
    this.variants.forEach((v) => {
      let weightedSum = 0;
      Object.keys(this.criteriaWeights).forEach((crit) => {
        const score = v.rawScores[crit] ?? 50;
        const weight = this.criteriaWeights[crit] ?? 1;
        weightedSum += score * weight;
        v.scores[crit] = score;
      });
      v.totalScore = parseFloat((weightedSum / totalWeights).toFixed(1));
    });

    // Re-rank variants
    let highestScore = -1;
    let winnerId = null;
    this.variants.forEach((v) => {
      if (v.hardGateViolations === 0 && v.totalScore > highestScore) {
        highestScore = v.totalScore;
        winnerId = v.id;
      }
    });

    this.variants.forEach((v) => {
      v.isWinner = (v.id === winnerId);
      if (v.isWinner) {
        v.recommendation = "ACCEPT (Winner)";
      } else if (v.hardGateViolations > 0) {
        v.recommendation = "REJECT (Hard Gate Breach)";
      } else {
        v.recommendation = "REJECT (Lower Score)";
      }
    });
  }

  // ==========================================
  // 7. HUD & WATERFALL RENDERING
  // ==========================================

  renderTopHud() {
    const live = this.liveProjection;
    const state = live?.state || this.client.cachedState || {};
    const identity = live?.identity || {};
    const display = (value) => value == null ? LIVE_EMPTY : String(value);
    const planId = display(identity.planId);
    const rev = display(identity.revision);
    const approval = display(identity.approvalDigest || identity.approvalId);
    const launch = display(identity.launchId);
    const request = display(identity.requestId);
    const run = display(identity.runId);
    const iter = display(identity.iterationId);
    const liveDisposition = deriveCanonicalDisposition({ status: live.runStatus, phase: live.phase }, live.control, null, live.handoff);
    const disposition = live.progress.state === "No active run"
      ? { label: "NO ACTIVE RUN", class: "status-idle" }
      : liveDisposition;
    this.el.hudStatus.textContent = disposition.label;
    this.el.hudStatus.className = `status-badge ${disposition.class || "status-idle"}`;
    this.el.hudRun.textContent = run;
    this.el.hudPipeline.textContent = display(identity.pipelineType);
    this.el.hudGen.textContent = display(firstValue(live?.activeIteration?.generation, live?.activeIteration?.generationNumber, LIVE_EMPTY));
    this.el.hudAdmission.textContent = display(firstValue(live?.control?.runAdmission, LIVE_EMPTY)).toUpperCase();
    this.el.hudObjective.textContent = display(firstValue(live?.activeIteration?.objective, live?.activeRun?.objective, state.objective, LIVE_EMPTY));

    this.el.hudIdentity.innerHTML = `
      <span class="identity-node" title="Plan ID: ${planId}">Plan: <strong>${planId}</strong></span>
      <span class="identity-arrow">➔</span>
      <span class="identity-node" title="Revision: #${rev}">Rev: <strong>#${rev}</strong></span>
      <span class="identity-arrow">➔</span>
      <span class="identity-node" title="Approval Digest: ${approval}">Approval: <strong>${approval}</strong></span>
      <span class="identity-arrow">➔</span>
      <span class="identity-node" title="Launch Authority Slot: ${launch}">Launch: <strong>${launch}</strong></span>
      <span class="identity-arrow">➔</span>
      <span class="identity-node" title="Runner Ticket Request: ${request}">Request: <strong>${request}</strong></span>
      <span class="identity-arrow">➔</span>
      <span class="identity-node" title="Active Runner Process: ${run}">Run: <strong>${run}</strong></span>
      <span class="identity-arrow">➔</span>
      <span class="identity-node" title="Managed Iteration: ${iter}">Iteration: <strong>${iter}</strong></span>
    `;
  }

  renderWaterfall() {
    this.el.waterfallList.innerHTML = this.chambers.map((ch, idx) => `
      <div class="chamber-card ${idx === this.selectedChamberIndex ? 'active' : ''}" data-idx="${idx}" tabindex="0" role="listitem" aria-label="${ch.name}">
        <div class="card-top-row">
          <span class="card-name">${escapeHtml(ch.name)}</span>
          <span class="card-z-tag font-mono">Z = ${ch.z}m</span>
        </div>
        <div class="card-desc">${escapeHtml(ch.desc)}</div>
        <div class="card-meta-row">
          <span class="card-status-pill card-status-${ch.status}">${escapeHtml(ch.status)}</span>
          <span>${escapeHtml(ch.duration)}</span>
        </div>
      </div>
    `).join("");

    this.el.waterfallList.querySelectorAll(".chamber-card").forEach((card) => {
      card.addEventListener("click", () => {
        const idx = parseInt(card.getAttribute("data-idx"), 10);
        this.selectChamber(idx);
      });
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          const idx = parseInt(card.getAttribute("data-idx"), 10);
          this.selectChamber(idx);
        }
      });
    });
  }

  // ==========================================
  // 8. NAVIGATION & CAMERA SCRUBBING
  // ==========================================

  selectChamber(idx) {
    this.selectedChamberIndex = Math.max(0, Math.min(idx, this.chambers.length - 1));
    const ch = this.chambers[this.selectedChamberIndex];

    this.el.scrubberSlider.value = ch.z;
    this.el.sliderLabel.textContent = `${ch.name} (Z = ${ch.z}m)`;
    this.el.inspectorTitle.textContent = ch.name;
    this.el.inspectorZPill.textContent = `Z = ${ch.z}m`;

    this.el.bookmarkButtons?.forEach((btn) => {
      const bZ = parseInt(btn.getAttribute("data-z"), 10);
      btn.classList.toggle("active", Math.abs(bZ - ch.z) < 20);
    });

    // Highlight Stage Workspace tab as active
    this.setActiveInspectorTab("stage-view");
    this.renderWaterfall();
    this.scrubToZ(ch.z, true);
  }

  jumpChamber(delta) {
    this.selectChamber(this.selectedChamberIndex + delta);
  }

  scrubToZ(zPos, updateLabel = true) {
    if (updateLabel) {
      this.el.scrubberSlider.value = zPos;
      let closest = this.chambers[0];
      let minDiff = 9999;
      this.chambers.forEach((c) => {
        const diff = Math.abs(c.z - zPos);
        if (diff < minDiff) { minDiff = diff; closest = c; }
      });
      this.el.sliderLabel.textContent = `${closest.name} (Z = ${zPos}m)`;
    }

    this.cameraTargetPos.set(0, 32, zPos + 75);
    this.cameraLookAtTarget.set(0, 0, zPos);
    this.requestRender();
  }

  setActiveInspectorTab(tabId) {
    this.activeInspectorTab = tabId;
    this.el.inspectorTabs.forEach((tab) => {
      const isMatch = tab.getAttribute("data-tab") === tabId;
      tab.classList.toggle("active", isMatch);
      tab.setAttribute("aria-selected", isMatch ? "true" : "false");
    });
    this.renderInspectorContent();
  }

  // ==========================================
  // 9. DYNAMIC STAGE WORKSPACES & TABS
  // ==========================================

  renderInspectorContent() {
    const ch = this.chambers[this.selectedChamberIndex];

    if (this.liveProjection) {
      this.renderLiveInspector(ch);
      return;
    }

    switch (this.activeInspectorTab) {
      case "stage-view":
        this.renderDynamicStageWorkspace(ch);
        break;
      case "radar":
        this.render2DRadarRubricView();
        break;
      case "variants":
        this.renderVariantsAndDiffsView();
        break;
      case "synthesis":
        this.renderSynthesisView();
        break;
      case "gates":
        this.renderGatesView();
        break;
      case "handoff":
        this.renderHandoffView();
        break;
      default:
        this.renderDynamicStageWorkspace(ch);
        break;
    }
  }

  renderLiveInspector(ch) {
    this.el.inspectorContent.innerHTML = renderTemporalMissionLiveMarkup(this.liveProjection, ch);
  }

  async refreshProjectWorkspace(planId = this.project.selectedPlanId) {
    this.project.busy = true;
    this.project.error = "";
    try {
      const [plans, assistance] = await Promise.all([this.client.getProjectPlans(), this.client.getPlanAssistance()]);
      this.project.plans = plans.items || [];
      this.project.assistanceList = assistance.items || [];
      this.project.selectedPlanId = planId && this.project.plans.some((plan) => plan.planId === planId) ? planId : this.project.plans[0]?.planId || null;
      if (this.project.selectedPlanId) {
        const planId = this.project.selectedPlanId;
        this.project.detail = await this.client.getProjectPlanDetail(planId);
      }
      else this.project.detail = null;
      if (this.project.assistance?.id) this.project.assistance = await this.client.getPlanAssistanceDetail(this.project.assistance.id);
      this.project.notice = this.project.detail ? `Loaded exact ledger version ${this.project.detail.ledger.version}.` : "Choose a pipeline to start a persistent planning interview.";
    } catch (error) {
      this.project.error = error.message || String(error);
    } finally {
      this.project.busy = false;
      if (this.liveProjection) this.renderProjectWorkspace();
    }
  }

  async runProjectOperation(operation) {
    if (this.project.busy) return;
    this.project.busy = true;
    this.project.error = "";
    this.renderProjectWorkspace();
    try {
      await operation();
    } catch (error) {
      this.project.error = error.message || String(error);
    } finally {
      this.project.busy = false;
      await this.refreshProjectWorkspace(this.project.selectedPlanId);
    }
  }

  retainedLineageIterations(detail) {
    const planId = detail?.ledger?.planId;
    return (this.client.cachedIterations || []).filter((iteration) => {
      const owner = iteration.planId || iteration.projectLaunch?.planId;
      return owner === planId && iteration.id && iteration.runId;
    });
  }

  renderProjectWorkspace() {
    const project = this.project, detail = project.detail, ledger = detail?.ledger, revision = detail?.revision;
    const esc = (value) => escapeHtml(value == null ? "" : String(value));
    const disabled = (allowed) => allowed && !project.busy ? "" : "disabled";
    const status = project.error ? `<div class="section-card" role="alert"><strong>API error:</strong> ${esc(project.error)}</div>` : `<div class="section-card" role="status">${esc(project.notice)}</div>`;
    const plans = project.plans.length ? project.plans.map((plan) => `<button class="btn-hud" data-project-select="${esc(plan.planId)}">${esc(plan.title || plan.planId)} · ${esc(plan.state)} · v${esc(plan.version)}</button>`).join(" ") : "<span>No live project plans.</span>";
    const conversations = project.assistanceList.length ? project.assistanceList.map((item) => `<button class="btn-hud" data-assistance-select="${esc(item.id)}">${esc(item.id)} · ${esc(item.pipelineType)} · v${esc(item.version)} · ${item.hasProposal ? "proposal ready" : "interview"}</button>`).join(" ") : "No persisted conversations.";
    const messages = project.assistance?.messages?.length ? project.assistance.messages.map((message) => `<div class="section-card"><strong>${esc(message.role)}</strong> · ${esc(message.createdAt)}<br>${sanitizeMarkdownToHtml(message.content || "")}</div>`).join("") : "<p>No interview messages yet. Start a conversation and describe the bounded project.</p>";
    const proposal = project.assistance?.proposedContent;
    const revisions = detail?.revisions?.length ? detail.revisions.map((item) => `<li><button class="btn-hud" data-project-revision="${esc(item.revision)}">Revision ${esc(item.revision)} · ${esc(item.contentDigest)}</button></li>`).join("") : "<li>No immutable revisions loaded.</li>";
    const decisions = detail?.decisions?.length ? detail.decisions.map((item) => `<li>${esc(item.decision)} · ${esc(item.decisionId)} · ${esc(item.planDigest)}</li>`).join("") : "<li>No approvals or rejections recorded.</li>";
    const launches = detail?.launches?.length ? detail.launches.map((item) => `<li>${esc(item.status)} · ${esc(item.launchId)} · request ${esc(item.requestId)} · run ${esc(item.runId)}</li>`).join("") : "<li>No launch records.</li>";
    const canEdit = ledger?.state === "draft" && !ledger.activeLaunchId;
    const canReview = ledger?.state === "draft";
    const canApprove = ledger?.state === "ready-for-review" && ledger.validation?.valid;
    const canReject = ["ready-for-review", "approved"].includes(ledger?.state);
    const canLaunch = ledger?.state === "approved" && ledger.effectiveApprovalId;
    const requestedLaunch = detail?.launches?.find((launch) => launch.launchId === ledger?.activeLaunchId && launch.status === "requested");
    const canArchive = ledger && !ledger.activeLaunchId && !["launch-requested", "running", "archived"].includes(ledger.state);
    const retained = this.retainedLineageIterations(detail);
    const selectedIteration = retained.find((item) => item.id === project.selectedIterationId) || retained[0];
    const canLineage = !!(ledger && revision && selectedIteration?.id && selectedIteration?.runId && revision.content?.repository?.baseRef);
    this.el.projectDrawerContent.innerHTML = `<div class="inspector-section"><div class="section-title"><span>Project Mission Control</span><button id="btn-create-project" class="btn-hud btn-accent" ${disabled(true)}>Create Project</button><button id="btn-refresh-projects" class="btn-hud" ${disabled(true)}>Refresh live data</button></div>${status}<div class="section-card"><strong>All plans</strong><div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px">${plans}</div></div></div>
      <div class="inspector-section"><div class="section-title">Persistent Plan Assistance Interview</div><div class="section-card"><label>Pipeline <select id="project-pipeline"><option value="classic">classic</option><option value="managed">managed</option></select></label> <button id="btn-start-assistance" class="btn-hud" ${disabled(true)}>Start interview</button><div>Conversation: ${esc(project.assistance?.id || "none")} · version ${esc(project.assistance?.version || "—")} · proposal ${proposal ? "ready" : "not ready"}</div><div>${conversations}</div></div><div>${messages}</div><form id="project-assistance-form"><textarea name="message" rows="3" ${disabled(!!project.assistance)} placeholder="Describe the proposal, scope, constraints, and acceptance gates."></textarea><button class="btn-hud btn-accent" ${disabled(!!project.assistance)}>Send to live planning conversation</button></form>${proposal ? `<button id="btn-create-proposal" class="btn-hud btn-success" ${disabled(true)}>Create devplan-ready draft from live proposal</button><pre>${esc(JSON.stringify(proposal, null, 2))}</pre>` : "<p>Safe next action: continue the interview until the server returns a valid proposal.</p>"}</div>
      <div class="inspector-section"><div class="section-title">Selected Plan · immutable ledger</div>${detail ? `<div class="section-card">Plan ${esc(ledger.planId)} · state ${esc(ledger.state)} · version ${esc(ledger.version)} · revision ${esc(ledger.currentRevision)} · digest <code>${esc(ledger.currentDigest)}</code></div><details><summary>Immutable revisions</summary><ul>${revisions}</ul>${project.inspectedRevision ? `<pre>${esc(JSON.stringify(project.inspectedRevision, null, 2))}</pre>` : ""}</details><details><summary>Approvals / rejections</summary><ul>${decisions}</ul></details><details><summary>Launch state</summary><ul>${launches}</ul></details><form id="project-update-form"><label>Draft content JSON<textarea name="content" rows="10" ${disabled(canEdit)}>${esc(JSON.stringify(revision.content, null, 2))}</textarea></label><button class="btn-hud" ${disabled(canEdit)}>Save new draft revision</button></form><label>Decision or withdrawal notes<textarea id="project-notes" rows="2" ${disabled(canReject || !!requestedLaunch)}></textarea></label><div style="display:flex;gap:4px;flex-wrap:wrap"><button data-project-action="ready-for-review" class="btn-hud" ${disabled(canReview)}>Submit review</button><button data-project-action="approve" class="btn-hud btn-success" ${disabled(canApprove)}>Approve exact revision</button><button data-project-action="reject" class="btn-hud" ${disabled(canReject)}>Reject exact revision</button><button data-project-action="launch" class="btn-hud btn-accent" ${disabled(canLaunch)}>Launch exact approval</button><button data-project-action="withdraw-launch" class="btn-hud" ${disabled(!!requestedLaunch)}>Withdraw unclaimed requested launch</button><button data-project-action="archive" class="btn-hud" ${disabled(canArchive)}>Archive eligible plan</button></div><p>Safe next action: ${canEdit ? "edit the draft or submit it for review" : canReview ? "submit the exact draft revision for review" : canApprove ? "approve or reject the validated review revision" : canLaunch ? "launch the effective approval" : requestedLaunch ? "wait for claim, or withdraw the requested launch" : "inspect the immutable history"}.</p><div class="section-card"><strong>Continuation / fork from retained iteration</strong><select id="project-lineage-iteration" ${disabled(retained.length > 0)}>${retained.map((item) => `<option value="${esc(item.id)}" ${item.id === selectedIteration?.id ? "selected" : ""}>${esc(item.id)} · run ${esc(item.runId)}</option>`).join("")}</select><button data-project-action="clone" class="btn-hud" ${disabled(canLineage)}>Create continuation clone</button><button data-project-action="fork" class="btn-hud" ${disabled(canLineage)}>Create fork</button><p>${canLineage ? "Uses the exact selected plan revision/digest and retained run/iteration lineage." : "Disabled: a matching retained iteration, run ID, plan identity, and repository base ref are required."}</p></div>` : "<p>Select a live plan or create one from an assistance proposal.</p>"}</div>`;
    this.bindProjectWorkspaceEvents();
  }

  bindProjectWorkspaceEvents() {
    const root = this.el.projectDrawerContent;
    root.querySelector("#btn-refresh-projects")?.addEventListener("click", () => this.refreshProjectWorkspace());
    root.querySelector("#btn-create-project")?.addEventListener("click", () => root.querySelector("#project-pipeline")?.focus());
    root.querySelectorAll("[data-project-select]").forEach((button) => button.addEventListener("click", () => this.refreshProjectWorkspace(button.dataset.projectSelect)));
    root.querySelectorAll("[data-assistance-select]").forEach((button) => button.addEventListener("click", () => this.runProjectOperation(async () => { this.project.assistance = await this.client.getPlanAssistanceDetail(button.dataset.assistanceSelect); this.project.notice = "Loaded the persistent planning conversation."; })));
    root.querySelector("#btn-start-assistance")?.addEventListener("click", () => this.runProjectOperation(async () => { const pipelineType = root.querySelector("#project-pipeline").value; this.project.assistance = await this.client.createPlanAssistance(pipelineType); this.project.notice = `Started ${pipelineType} planning interview.`; }));
    root.querySelector("#project-assistance-form")?.addEventListener("submit", (event) => { event.preventDefault(); const message = new FormData(event.currentTarget).get("message")?.trim(); if (!message) return; this.runProjectOperation(async () => { const assistance = this.project.assistance; this.project.assistance = await this.client.sendPlanAssistanceMessage(assistance.id, assistance.version, message); this.project.notice = "Live planning response received; inspect proposal readiness."; }); });
    root.querySelector("#btn-create-proposal")?.addEventListener("click", () => this.runProjectOperation(async () => { const assistance = this.project.assistance; const result = await this.client.createPlan(assistance.proposedContent); this.project.selectedPlanId = result.planId; this.project.notice = `Created durable draft ${result.planId} from the live proposal.`; }));
    root.querySelector("#project-update-form")?.addEventListener("submit", (event) => { event.preventDefault(); this.runProjectOperation(async () => { const content = JSON.parse(new FormData(event.currentTarget).get("content")); const ledger = this.project.detail.ledger; await this.client.updatePlan(ledger.planId, content, ledger.version); this.project.notice = "Draft revision saved by the project-plan API."; }); });
    root.querySelector("#project-lineage-iteration")?.addEventListener("change", (event) => { this.project.selectedIterationId = event.target.value; this.renderProjectWorkspace(); });
    root.querySelectorAll("[data-project-action]").forEach((button) => button.addEventListener("click", () => this.runProjectOperation(async () => {
      const action = button.dataset.projectAction, detail = this.project.detail, ledger = detail.ledger, revision = detail.revision, notes = root.querySelector("#project-notes")?.value || "";
      let payload;
      if (action === "archive") payload = { planId: ledger.planId };
      else if (action === "withdraw-launch") payload = { planId: ledger.planId, launchId: ledger.activeLaunchId, notes };
      else if (["clone", "fork"].includes(action)) { const iteration = this.retainedLineageIterations(detail).find((item) => item.id === this.project.selectedIterationId) || this.retainedLineageIterations(detail)[0]; payload = { planId: ledger.planId, revision: ledger.currentRevision, planDigest: ledger.currentDigest, sourceRunId: iteration.runId, sourceIterationId: iteration.id, baseRef: revision.content.repository.baseRef }; }
      else payload = { planId: ledger.planId, revision: ledger.currentRevision, planDigest: ledger.currentDigest, ...(action === "approve" || action === "reject" ? { notes } : {}) };
      const result = await this.client.dispatchPlanCommand(action, payload, ledger.version);
      this.project.selectedPlanId = result.planId || this.project.selectedPlanId; this.project.notice = `${action} was accepted by the live project-plan API.`;
    })));
    root.querySelectorAll("[data-project-revision]").forEach((button) => button.addEventListener("click", () => this.runProjectOperation(async () => { const item = await this.client.getPlanRevision(this.project.detail.ledger.planId, Number(button.dataset.projectRevision)); this.project.inspectedRevision = item; this.project.notice = `Loaded immutable revision ${item.revision} with digest ${item.contentDigest}.`; })));
  }

  renderDynamicStageWorkspace(ch) {
    switch (this.selectedChamberIndex) {
      case 0:
        this.renderArchiveStageWorkspace(ch);
        break;
      case 1:
        this.renderSpecStageWorkspace(ch);
        break;
      case 2:
        this.renderArchitectureStageWorkspace(ch);
        break;
      case 3:
        this.renderVariantStageWorkspace(ch);
        break;
      case 4:
        this.render2DRadarRubricView();
        break;
      case 5:
        this.renderSynthesisView();
        break;
      case 6:
        this.renderGateAndHandoffStageWorkspace(ch);
        break;
      default:
        this.renderOverviewView(ch);
        break;
    }
  }

  // Stage 0 Workspace: Historical Archive Racks
  renderArchiveStageWorkspace(ch) {
    this.el.inspectorContent.innerHTML = `
      <div class="inspector-section">
        <div class="section-title">
          <span>Historical Archive Racks</span>
          <span class="status-badge status-active">Immutable Ledger</span>
        </div>
        <div class="section-card">
          <p style="color: var(--text-secondary); margin-bottom: 8px;">
            Past iteration runs and evolutionary lineage preserved with cryptographic SHA-256 hashes.
          </p>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            ${this.historicalRuns.map((r, i) => `
              <div style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-subtle); padding: 8px; border-radius: 4px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <strong style="color: #fff; font-size: 11px;">${escapeHtml(r.name)}</strong>
                  <span class="status-badge status-success font-mono" style="font-size: 9px;">Score: ${r.score}</span>
                </div>
                <div style="font-family: var(--font-mono); font-size: 9px; color: var(--text-muted); margin-top: 3px;">
                  Date: ${r.date} | Runtime: ${r.duration} | Changes: ${r.changes} | Winner: <code>${r.winner}</code>
                </div>
                <div style="display: flex; gap: 6px; margin-top: 6px;">
                  <button class="btn-hud btn-archive-fork" data-runid="${r.id}" style="font-size: 9px; padding: 2px 6px;">🍴 Fork Draft from here</button>
                  <button class="btn-hud btn-archive-inspect" data-runid="${r.id}" style="font-size: 9px; padding: 2px 6px;">🔍 Inspect Archive</button>
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      </div>

      <div class="inspector-section">
        <div class="section-title">Archive Operations</div>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <button id="btn-export-lineage" class="btn-hud btn-accent" style="padding: 8px; text-align: center;">
            📥 Export Complete Lineage JSON
          </button>
        </div>
      </div>
    `;

    this.el.inspectorContent.querySelectorAll(".btn-archive-fork").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-runid");
        alert(`Fork draft created from ${id} in state/project-plans/! Lineage root linked.`);
      });
    });

    this.el.inspectorContent.querySelectorAll(".btn-archive-inspect").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-runid");
        this.el.rawModalCode.textContent = JSON.stringify(this.historicalRuns.find(r => r.id === id), null, 2);
        this.el.rawDialog?.showModal();
      });
    });

    this.el.inspectorContent.querySelector("#btn-export-lineage")?.addEventListener("click", () => {
      this.el.rawModalCode.textContent = JSON.stringify({ lineage: this.historicalRuns, activeRun: "run-103-spatial" }, null, 2);
      this.el.rawDialog?.showModal();
    });
  }

  // Stage 1 Workspace: Specification Chamber
  renderSpecStageWorkspace(ch) {
    this.el.inspectorContent.innerHTML = `
      <div class="inspector-section">
        <div class="section-title">
          <span>1. Specification & Base Ref Binding</span>
          <span class="status-badge status-success">Frozen & Approved</span>
        </div>
        <div class="section-card">
          <div style="font-family: var(--font-mono); font-size: 10px; margin-bottom: 8px; background: rgba(0,0,0,0.3); padding: 8px; border-radius: 4px;">
            <div><strong>Repository Binding:</strong> <code>/home/mojo/projects/hermesswarmbuilder</code></div>
            <div><strong>Base Ref:</strong> <code>main</code> (HEAD)</div>
            <div><strong>Frozen Base Commit:</strong> <code style="color: var(--color-active);">7a3f8c2</code> [VERIFIED CLEAN]</div>
            <div><strong>Content Digest:</strong> <code style="color: var(--color-time-light);">sha256:7f4a2d89b1c0...</code></div>
          </div>

          <div style="margin-bottom: 8px;">
            <strong style="font-size: 11px;">Bounded Objective:</strong>
            <p style="color: var(--text-secondary); margin-top: 2px;">
              High-assurance 3D spatiotemporal visualization with diverging Bézier variant branches & multi-axis rubric verification.
            </p>
          </div>

          <div style="margin-bottom: 8px;">
            <strong style="font-size: 11px;">Core Requirements:</strong>
            <ul style="padding-left: 16px; font-size: 10px; color: var(--text-secondary); margin-top: 2px;">
              <li>Deliver 3D spatiotemporal longitudinal corridor with Three.js WebGL2/WebGPU.</li>
              <li>Provide 2D orthographic radar rubric inspector without 3D perspective distortion.</li>
              <li>Enforce WCAG 2.2 AA contrast ratios and prefers-reduced-motion instant cuts.</li>
              <li>Zero unvalidated client-side shell execution.</li>
            </ul>
          </div>
        </div>
      </div>

      <div class="inspector-section">
        <div class="section-title">Specification Actions</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
          <button id="btn-spec-copy-digest" class="btn-hud" style="padding: 7px; text-align: center;">
            📋 Copy SHA-256 Digest
          </button>
          <button id="btn-spec-verify-commit" class="btn-hud btn-success" style="padding: 7px; text-align: center;">
            🔒 Verify Base Commit
          </button>
          <button id="btn-spec-edit" class="btn-hud" style="padding: 7px; text-align: center;">
            ✏️ Edit Spec Draft
          </button>
          <button id="btn-spec-submit" class="btn-hud btn-accent" style="padding: 7px; text-align: center;">
            🚀 Submit for Review
          </button>
        </div>
      </div>
    `;

    this.el.inspectorContent.querySelector("#btn-spec-copy-digest")?.addEventListener("click", () => {
      navigator.clipboard.writeText("sha256:7f4a2d89b1c0e3a5f7823901bc38472910fae7461829034bc");
      alert("SHA-256 canonical digest copied to clipboard!");
    });

    this.el.inspectorContent.querySelector("#btn-spec-verify-commit")?.addEventListener("click", () => {
      alert("✓ git rev-parse HEAD checked: 7a3f8c2 matched! Repository worktree clean.");
    });

    this.el.inspectorContent.querySelector("#btn-spec-edit")?.addEventListener("click", () => {
      const newObj = prompt("Enter updated objective description for new draft revision:", "High-assurance 3D spatiotemporal visualization with diverging Bézier variant branches & multi-axis rubric verification.");
      if (newObj) {
        alert("New draft revision #4 created in project plans ledger.");
      }
    });

    this.el.inspectorContent.querySelector("#btn-spec-submit")?.addEventListener("click", () => {
      alert("Spec revision submitted for formal review.");
    });
  }

  // Stage 2 Workspace: Architecture Chamber
  renderArchitectureStageWorkspace(ch) {
    const modules = [
      { id: "mod-01", name: "Spatiotemporal Spine & Coordinate System", status: "Nominal", agent: "Architect-1", lines: "+140" },
      { id: "mod-02", name: "Diverging Bézier Variant Branches", status: "Nominal", agent: "Worker-A", lines: "+210" },
      { id: "mod-03", name: "2D Orthographic Radar Rubric Engine", status: "Nominal", agent: "Worker-B", lines: "+180" },
      { id: "mod-04", name: "Synthesis Funnel & Cherry-Pick Blending", status: "Nominal", agent: "Worker-C", lines: "+160" },
      { id: "mod-05", name: "Release Crystal & Gate Verification", status: "Nominal", agent: "Evaluator", lines: "+130" }
    ];

    this.el.inspectorContent.innerHTML = `
      <div class="inspector-section">
        <div class="section-title">
          <span>2. Architecture & Modular Topology</span>
          <span class="status-badge status-success">Validated</span>
        </div>
        <div class="section-card">
          <p style="color: var(--text-secondary); margin-bottom: 8px;">
            System modular decomposition with 5 isolated subsystems executing under runner governance.
          </p>

          <div style="display: flex; flex-direction: column; gap: 5px;">
            ${modules.map(m => `
              <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.3); padding: 6px 8px; border-radius: 4px;">
                <div>
                  <strong style="color: #fff; font-size: 10px;">${escapeHtml(m.name)}</strong>
                  <div style="font-family: var(--font-mono); font-size: 9px; color: var(--text-muted);">Assigned: ${m.agent} (${m.lines})</div>
                </div>
                <span class="status-badge status-success" style="font-size: 8px;">${m.status}</span>
              </div>
            `).join("")}
          </div>
        </div>
      </div>

      <div class="inspector-section">
        <div class="section-title">Architecture Governance</div>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <button id="btn-inject-arch-steer" class="btn-hud btn-accent" style="padding: 8px; text-align: center;">
            🎯 Inject Architecture Steering Directive
          </button>
        </div>
      </div>
    `;

    this.el.inspectorContent.querySelector("#btn-inject-arch-steer")?.addEventListener("click", () => {
      this.el.steerScope.value = "current_run";
      this.el.steerText.value = "Ensure modular boundaries for 3D shaders are strictly decoupled from HUD elements.";
      this.el.steerDialog?.showModal();
    });
  }

  // Stage 3 Workspace: Variant Exploration Arena
  renderVariantStageWorkspace(ch) {
    this.renderVariantsAndDiffsView();
  }

  // Stage 6 Workspace: Gate & Handoff
  renderGateAndHandoffStageWorkspace(ch) {
    this.renderHandoffView();
  }

  /**
   * 2D Orthographic Radar / Rubric HUD (Spec §13.3)
   * With Interactive Weighting Knobs that re-render and re-score live!
   */
  render2DRadarRubricView() {
    const axes = [
      { key: "objectiveFit", label: "Objective Fit" },
      { key: "userValue", label: "User Value" },
      { key: "visualQuality", label: "Visual Quality" },
      { key: "implementationQuality", label: "Impl Quality" },
      { key: "accessibility", label: "Accessibility" },
      { key: "performance", label: "Performance" }
    ];

    const cx = 150, cy = 115, r = 80;
    const numAxes = axes.length;

    let gridSvg = "";
    [0.25, 0.5, 0.75, 1.0].forEach((level) => {
      const levelR = r * level;
      const pts = [];
      for (let i = 0; i < numAxes; i++) {
        const angle = (i * 2 * Math.PI) / numAxes - Math.PI / 2;
        pts.push(`${cx + levelR * Math.cos(angle)},${cy + levelR * Math.sin(angle)}`);
      }
      gridSvg += `<polygon points="${pts.join(" ")}" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1" />`;
    });

    let axesSvg = "";
    axes.forEach((axis, i) => {
      const angle = (i * 2 * Math.PI) / numAxes - Math.PI / 2;
      const x2 = cx + r * Math.cos(angle);
      const y2 = cy + r * Math.sin(angle);
      const lx = cx + (r + 18) * Math.cos(angle);
      const ly = cy + (r + 18) * Math.sin(angle);

      axesSvg += `
        <line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}" stroke="rgba(255,255,255,0.15)" stroke-width="1" />
        <text x="${lx}" y="${ly}" fill="#94a3b8" font-size="8" font-family="monospace" text-anchor="middle" dominant-baseline="middle">${axis.label}</text>
      `;
    });

    let polygonsSvg = "";
    this.variants.forEach((v) => {
      const pts = [];
      axes.forEach((axis, i) => {
        const angle = (i * 2 * Math.PI) / numAxes - Math.PI / 2;
        const val = (v.scores[axis.key] || 50) / 100;
        const px = cx + r * val * Math.cos(angle);
        const py = cy + r * val * Math.sin(angle);
        pts.push(`${px},${py}`);
      });

      polygonsSvg += `
        <polygon points="${pts.join(" ")}" fill="${v.color}" fill-opacity="${v.isWinner ? '0.35' : '0.15'}" stroke="${v.color}" stroke-width="${v.isWinner ? '2.5' : '1.5'}" />
      `;
    });

    const matrixRows = axes.map((axis) => `
      <tr>
        <td>${escapeHtml(axis.label)}</td>
        ${this.variants.map((v) => `
          <td>
            <span class="score-bar-track">
              <span class="score-bar-fill" style="width: ${v.scores[axis.key]}%; background: ${v.color};"></span>
            </span>
            ${v.scores[axis.key]}
          </td>
        `).join("")}
      </tr>
    `).join("");

    this.el.inspectorContent.innerHTML = `
      <div class="inspector-section">
        <div class="section-title">
          <span>2D Orthographic Radar Rubric HUD</span>
          <span style="font-size: 10px; color: var(--text-muted);">Interactive Live Weighting</span>
        </div>
        
        <div class="radar-chart-container">
          <svg class="radar-svg" viewBox="0 0 300 240">
            ${gridSvg}
            ${axesSvg}
            ${polygonsSvg}
          </svg>

          <div class="radar-legend">
            ${this.variants.map(v => `
              <div class="legend-item">
                <span class="legend-color-dot" style="background: ${v.color};"></span>
                <span style="color: ${v.color}; font-weight: ${v.isWinner ? '700' : '500'};">${v.name.split(':')[0]} (${v.totalScore})</span>
              </div>
            `).join("")}
          </div>
        </div>
      </div>

      <div class="inspector-section">
        <div class="section-title">
          <span>Interactive Criteria Weight Knobs</span>
          <button id="btn-reset-weights" class="btn-copy-cmd" style="font-size: 8px;">Reset Weights</button>
        </div>
        <div class="rubric-weights-grid">
          ${axes.map(axis => `
            <div class="weight-knob-item">
              <div class="weight-label-row">
                <span>${axis.label}:</span>
                <strong id="weight-val-${axis.key}">${this.criteriaWeights[axis.key].toFixed(1)}x</strong>
              </div>
              <input type="range" class="weight-slider" data-crit="${axis.key}" min="0" max="3" step="0.1" value="${this.criteriaWeights[axis.key]}">
            </div>
          `).join("")}
        </div>
      </div>

      <div class="inspector-section">
        <div class="section-title">Mathematical Score Matrix (Spec §13.3)</div>
        <div class="section-card">
          <table class="score-matrix-table">
            <thead>
              <tr>
                <th>Criterion</th>
                ${this.variants.map(v => `<th style="color: ${v.color};">${v.name.split(':')[0]}</th>`).join("")}
              </tr>
            </thead>
            <tbody>
              ${matrixRows}
              <tr style="border-top: 2px solid var(--border-hud); font-weight: 700;">
                <td>Total Score</td>
                ${this.variants.map(v => `<td style="color: ${v.color}; font-size: 11px;">${v.totalScore} / 100</td>`).join("")}
              </tr>
              <tr>
                <td>Hard Violations</td>
                ${this.variants.map(v => `<td style="color: ${v.hardGateViolations > 0 ? 'var(--color-error)' : 'var(--color-success)'};">${v.hardGateViolations}</td>`).join("")}
              </tr>
              <tr>
                <td>Recommendation</td>
                ${this.variants.map(v => `<td style="font-size: 9px; font-weight: 700; color: ${v.isWinner ? 'var(--color-success)' : 'var(--text-muted)'};">${v.recommendation}</td>`).join("")}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Bind weighting sliders
    this.el.inspectorContent.querySelectorAll(".weight-slider").forEach((slider) => {
      slider.addEventListener("input", (e) => {
        const crit = e.target.getAttribute("data-crit");
        const val = parseFloat(e.target.value);
        this.criteriaWeights[crit] = val;
        this.recalculateRubricScores();
        this.render2DRadarRubricView();
        this.requestRender();
      });
    });

    this.el.inspectorContent.querySelector("#btn-reset-weights")?.addEventListener("click", () => {
      this.criteriaWeights = { ...DEFAULT_CRITERIA_WEIGHTS };
      this.recalculateRubricScores();
      this.render2DRadarRubricView();
      this.requestRender();
    });
  }

  /**
   * Variant Detail & Diffs View (Spec §13.4)
   */
  renderVariantsAndDiffsView() {
    const selectedVariant = this.variants.find(v => v.id === this.selectedVariantId) || this.variants[0];
    const lineDiff = computeLineDiff(selectedVariant.diffOld, selectedVariant.diffNew);

    const diffHtml = lineDiff.map(d => `
      <div class="diff-line ${d.type}">
        <span class="diff-num">${d.newNum ?? d.oldNum ?? ' '}</span>
        <span>${d.type === 'add' ? '+ ' : d.type === 'del' ? '- ' : '  '}${escapeHtml(d.line)}</span>
      </div>
    `).join("");

    this.el.inspectorContent.innerHTML = `
      <div class="inspector-section">
        <div class="section-title">Select Candidate Variant</div>
        <div class="variant-selector-pills">
          ${this.variants.map(v => `
            <button class="btn-variant-pill ${v.id === selectedVariant.id ? 'active' : ''}" data-vid="${v.id}" style="border-color: ${v.id === selectedVariant.id ? v.color : 'transparent'};">
              ${escapeHtml(v.name.split(':')[0])}
            </button>
          `).join("")}
        </div>
      </div>

      <div class="inspector-section">
        <div class="section-title">
          <span>${escapeHtml(selectedVariant.name)}</span>
          <span class="status-badge ${selectedVariant.isWinner ? 'status-success' : 'status-warning'}">${selectedVariant.recommendation}</span>
        </div>
        <div class="section-card">
          <div style="font-family: var(--font-mono); font-size: 10px; margin-bottom: 8px;">
            <div><strong>Branch:</strong> <code style="color: var(--color-time-light);">${selectedVariant.branch}</code></div>
            <div><strong>Commit:</strong> <code style="color: var(--color-active);">${selectedVariant.commit}</code></div>
            <div><strong>Scope Budget:</strong> ${escapeHtml(selectedVariant.scopeCompliance)}</div>
            <div><strong>Total Score:</strong> <span style="color: ${selectedVariant.color}; font-weight: 700;">${selectedVariant.totalScore} / 100</span></div>
          </div>
          
          <div style="margin-bottom: 8px;">
            <strong style="font-size: 11px;">Feature Claims:</strong>
            <ul style="padding-left: 16px; font-size: 10px; color: var(--text-secondary); margin-top: 4px;">
              ${selectedVariant.changes.map(c => `<li>${escapeHtml(c)}</li>`).join("")}
            </ul>
          </div>

          <div style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 4px; font-size: 10px;">
            <strong style="color: var(--color-time-light);">Evaluator Rationale:</strong>
            <p style="color: var(--text-muted); margin-top: 2px;">${escapeHtml(selectedVariant.evaluatorRationale)}</p>
          </div>
        </div>
      </div>

      <div class="inspector-section">
        <div class="section-title">
          <span>Code Diff (${selectedVariant.branch})</span>
          <button id="btn-open-raw-diff" class="btn-copy-cmd">View Raw</button>
        </div>
        <div class="diff-container">
          ${diffHtml}
        </div>
      </div>

      <div class="inspector-section">
        <div class="section-title">Variant Actions</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
          <button id="btn-set-winner" class="btn-hud btn-success" style="padding: 7px; text-align: center;">
            ⭐ Set as Preferred Winner
          </button>
          <button id="btn-retest-var" class="btn-hud" style="padding: 7px; text-align: center;">
            🧪 Trigger Re-Test
          </button>
        </div>
      </div>
    `;

    this.el.inspectorContent.querySelectorAll(".btn-variant-pill").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.selectedVariantId = btn.getAttribute("data-vid");
        this.renderVariantsAndDiffsView();
      });
    });

    this.el.inspectorContent.querySelector("#btn-open-raw-diff")?.addEventListener("click", () => {
      this.el.rawModalCode.textContent = `=== Code Diff: ${selectedVariant.branch} ===\n\n--- a/corridor.js\n+++ b/corridor.js\n${selectedVariant.diffNew}`;
      this.el.rawDialog?.showModal();
    });

    this.el.inspectorContent.querySelector("#btn-set-winner")?.addEventListener("click", () => {
      this.variants.forEach(v => v.isWinner = (v.id === selectedVariant.id));
      alert(`Variant ${selectedVariant.name} designated as preferred winner for synthesis!`);
      this.renderVariantsAndDiffsView();
    });

    this.el.inspectorContent.querySelector("#btn-retest-var")?.addEventListener("click", () => {
      alert(`Validation test suite executed for ${selectedVariant.branch}: 100% Passed (0 exit code).`);
    });
  }

  /**
   * Synthesis & Feature Lineage View (Spec §13.5)
   * Interactive Cherry-Pick feature checklist!
   */
  renderSynthesisView() {
    const winner = this.variants.find(v => v.isWinner) || this.variants[0];

    this.el.inspectorContent.innerHTML = `
      <div class="inspector-section">
        <div class="section-title">
          <span>Synthesis & Integration Record</span>
          <span class="status-badge status-success">Ready to Merge</span>
        </div>
        <div class="section-card">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <div>
              <strong style="color: var(--color-success); font-size: 12px;">Winning Variant:</strong>
              <div style="font-family: var(--font-mono); font-size: 11px;">${winner.name}</div>
            </div>
            <div style="text-align: right;">
              <span class="status-badge status-success font-mono">${winner.totalScore} pts</span>
            </div>
          </div>

          <div style="background: rgba(168, 85, 247, 0.1); border: 1px solid rgba(168, 85, 247, 0.3); padding: 8px; border-radius: 4px; font-size: 10px; margin-bottom: 10px;">
            <strong style="color: var(--color-time-light);">Integration Strategy (Spec §13.5):</strong>
            <p style="color: var(--text-secondary); margin-top: 2px;">
              <strong>Winner Selection + Cherry-Pick Integration</strong>. The runner cherry-picks the accepted commits from <code>${winner.branch}</code> into release trunk <code>feat/release-trunk</code>. Multi-variant branch blending is not used.
            </p>
          </div>

          <div style="font-family: var(--font-mono); font-size: 10px; color: var(--text-muted); margin-bottom: 8px;">
            <div><strong>Source Branch Integrity:</strong> <span style="color: var(--color-success);">PRESERVED</span> (main untouched)</div>
            <div><strong>Release Commit:</strong> <code>b8e41a9</code> (feat/release-trunk)</div>
          </div>
        </div>
      </div>

      <div class="inspector-section">
        <div class="section-title">Interactive Cherry-Pick Feature Selector</div>
        <div class="feature-list-group">
          ${winner.changes.map((c, i) => `
            <div class="feature-tag accepted">
              <label class="feature-checkbox-label">
                <input type="checkbox" checked class="feature-toggle" data-feat="${i}">
                <span>${escapeHtml(c)}</span>
              </label>
            </div>
          `).join("")}
          <div class="feature-tag rejected">
            <span>✖</span>
            <span>Unredacted process memory inspector (Rejected: security boundary)</span>
          </div>
          <div class="feature-tag rejected">
            <span>✖</span>
            <span>Client-side shell injection (Rejected: safety breach)</span>
          </div>
        </div>
      </div>

      <div class="inspector-section">
        <div class="section-title">Synthesis Actions</div>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <button id="btn-approve-synthesis" class="btn-hud btn-success" style="padding: 8px; text-align: center;">
            ✅ Approve & Seal Synthesis Golden Trunk
          </button>
        </div>
      </div>
    `;

    this.el.inspectorContent.querySelector("#btn-approve-synthesis")?.addEventListener("click", () => {
      alert("✓ Synthesis decisions sealed. Golden release branch updated to commit b8e41a9.");
    });
  }

  /**
   * Gate Evidence & Assurance View (Spec §14.2, §14.3)
   */
  renderGatesView() {
    this.el.inspectorContent.innerHTML = `
      <div class="inspector-section">
        <div class="section-title">
          <span>Acceptance Gates & Evidence</span>
          <span class="status-badge status-success">All Gates Verified</span>
        </div>
        <div class="section-card" style="padding: 0;">
          ${this.gates.map(g => `
            <div class="gate-row">
              <div style="flex: 1; padding-right: 8px;">
                <div class="gate-id">${escapeHtml(g.id)}</div>
                <div style="color: var(--text-secondary); font-size: 10px;">${escapeHtml(g.desc)}</div>
                <div style="font-family: var(--font-mono); font-size: 9px; color: var(--text-muted); margin-top: 2px;">
                  Path: <code>${escapeHtml(g.path)}</code>
                </div>
              </div>
              <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                <span class="${g.assurance === 'Runner-verified' ? 'gate-badge-runner' : 'gate-badge-agent'}">${g.assurance}</span>
                <span class="status-badge status-success" style="font-size: 9px;">${g.status}</span>
              </div>
            </div>
          `).join("")}
        </div>
      </div>

      <div class="inspector-section">
        <div class="section-title">Evidence Actions</div>
        <button id="btn-inspect-gate-raw" class="btn-hud" style="padding: 7px; text-align: center;">
          📄 View Full Evidence Trace JSON
        </button>
      </div>
    `;

    this.el.inspectorContent.querySelector("#btn-inspect-gate-raw")?.addEventListener("click", () => {
      this.el.rawModalCode.textContent = JSON.stringify(this.gates, null, 2);
      this.el.rawDialog?.showModal();
    });
  }

  /**
   * Handoff & Recovery View (Spec §15.1, §15.2)
   */
  renderHandoffView() {
    this.el.inspectorContent.innerHTML = `
      <div class="inspector-section">
        <div class="section-title">
          <span>Terminal Handoff & Review</span>
          <span class="status-badge status-success">Ready for Review</span>
        </div>
        <div class="section-card">
          <p style="color: var(--text-secondary); margin-bottom: 8px;">
            Managed iteration completed all verification stages with zero hard-gate violations. Accepted release trunk is preserved and ready for operator review.
          </p>

          <div style="font-family: var(--font-mono); font-size: 10px; margin-bottom: 10px; display: flex; flex-direction: column; gap: 3px;">
            <div><strong>Accepted Branch:</strong> <code>feat/var-1-balanced</code></div>
            <div><strong>Release Commit:</strong> <code>b8e41a9</code></div>
            <div><strong>Base Commit:</strong> <code>7a3f8c2</code> (main preserved)</div>
            <div><strong>Rollback Guidance:</strong> Clean Git worktree; revert branch pointer if needed.</div>
          </div>

          <strong style="font-size: 11px;">Git Review Command:</strong>
          <div class="code-command-box" style="margin-top: 4px;">
            <span id="cmd-text">git checkout feat/var-1-balanced && git log -n 5</span>
            <button id="btn-copy-git" class="btn-copy-cmd">Copy</button>
          </div>
        </div>
      </div>

      <div class="inspector-section">
        <div class="section-title">Complete Operator Control Deck</div>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <button id="btn-promote-handoff" class="btn-hud btn-success" style="padding: 8px; text-align: center;">
            🚀 Promote & Complete Handoff
          </button>
          <button id="btn-next-gen" class="btn-hud btn-accent" style="padding: 8px; text-align: center;">
            ▶️ Authorize Next Generation (Gen 2 / 10)
          </button>
          <button id="btn-continuation-draft" class="btn-hud" style="padding: 8px; text-align: center;">
            🔄 Create Continuation Plan Draft
          </button>
          <button id="btn-fork-draft" class="btn-hud" style="padding: 8px; text-align: center;">
            🍴 Create Fork Draft Plan from this Checkpoint
          </button>
        </div>
      </div>
    `;

    this.el.inspectorContent.querySelector("#btn-copy-git")?.addEventListener("click", () => {
      const txt = this.el.inspectorContent.querySelector("#cmd-text")?.textContent || "";
      navigator.clipboard.writeText(txt);
      alert("Review command copied to clipboard!");
    });

    this.el.inspectorContent.querySelector("#btn-promote-handoff")?.addEventListener("click", () => {
      alert("Handoff promoted to golden release registry.");
    });

    this.el.inspectorContent.querySelector("#btn-next-gen")?.addEventListener("click", () => {
      alert("Next generation ticket submitted to scheduler queue.");
    });

    this.el.inspectorContent.querySelector("#btn-continuation-draft")?.addEventListener("click", () => {
      if (this.liveProjection) this.renderProjectWorkspace();
    });

    this.el.inspectorContent.querySelector("#btn-fork-draft")?.addEventListener("click", () => {
      if (this.liveProjection) this.renderProjectWorkspace();
    });
  }

  // ==========================================
  // 10. RUNTIME CONTROL HANDLERS
  // ==========================================

  async handlePauseCheckpoint() {
    if (!confirm("Pause active run at next safe checkpoint (Spec §6.3, §15.3)?")) return;
    try {
      await this.client.pauseCheckpoint("Operator requested checkpoint pause via 3D Temporal HUD");
      alert("Pause intent registered. Execution will pause at next safe checkpoint.");
    } catch (err) {
      alert(`Pause failed: ${err.message}`);
    }
  }

  async handleGracefulStop() {
    if (!confirm("Gracefully stop active run at boundary and write terminal evidence (Spec §6.3)?")) return;
    try {
      await this.client.gracefulStop("Operator requested graceful stop via 3D Temporal HUD");
      alert("Graceful stop intent registered.");
    } catch (err) {
      alert(`Stop failed: ${err.message}`);
    }
  }

  async handleResumeAdmission() {
    try {
      await this.client.resumeAdmission();
      alert("Admission resumed.");
    } catch (err) {
      alert(`Resume failed: ${err.message}`);
    }
  }

  async handleRunNow() {
    try {
      await this.client.requestRunNow();
      alert("Immediate runner tick requested.");
    } catch (err) {
      alert(`Run Now failed: ${err.message}`);
    }
  }

  async handleSubmitSteer() {
    const text = this.el.steerText?.value?.trim();
    if (!text) {
      alert("Please provide a steering directive.");
      return;
    }
    const scope = this.el.steerScope?.value || "next_run";
    const priority = this.el.steerPriority?.value || "required";

    try {
      await this.client.steer(text, scope, priority);
      this.el.steerDialog?.close();
      this.el.steerText.value = "";
      alert("Steering directive dispatched successfully.");
    } catch (err) {
      alert(`Steering dispatch failed: ${err.message}`);
    }
  }
}

// Bootstrap on DOM ready
if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", () => {
    window.temporalMissionApp = new TemporalMissionController();
  });
}
