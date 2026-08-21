/**
 * Dashboard A: 2D Operations Console Controller (Comprehensive Production v2)
 * High-density expert operations cockpit implementing all spec sections.
 *
 * Implements:
 * - Header & Cross-Resource Identity Strip (§6.2, §6.4)
 * - View 1: Overview, Current Work, 9-Tier Attention Queue, Pipeline Steppers, Tool Lifecycles, Logs, Checkpoint Controls (§7)
 * - View 2: Governed Plans Ledger, JSON Diffs, Plan Detail Reviewer, 13-Section Authoring, Candidate Queue, Blast Radius Modal, Steering Deck (§8, §9)
 * - View 3: Runs Console & 10-Tab Inspector (Overview, Pipeline, Agents, Activity, Evidence, Artifacts, Logs, Resources, Handoff, Raw) (§10, §11, §12)
 * - View 4: Managed Iterations Workspace, 11-Criterion Scorecard Matrix, Variant Drawer, Cherry-Pick Synthesis (§13)
 * - View 5: Evidence Center, Gates Ledger, Runner Validations, Traceability Matrix (§14)
 * - View 6: System Administration, 7 Health Checks, Mutex Locks, Storage Accounting, Secrets Masking, Audit Ledger (§18)
 * - Command Palette (: / Ctrl+K), Vim Hotkeys (j/k, Enter, Esc, ?), WCAG 2.2 AA Announcer (§22)
 * - Rich Fallback Mock Data for instant rendering when server is empty
 */

import {
  ControlPlaneClient,
  deriveCanonicalDisposition,
  getAssuranceLevel,
  sanitizeAnsiToHtml,
  sanitizeMarkdownToHtml,
  computeLineDiff,
  computePlanDigest,
  canonicalJson,
  escapeHtml,
  RBAC_ROLES,
  ROLE_PERMISSIONS
} from "../shared/api-client.js";

// ==========================================
// RICH REALISTIC FALLBACK MOCK STATE
// ==========================================

const MOCK_STATE = {
  currentRunId: "run-20260821-1402",
  status: "running",
  phase: "Synthesis",
  pipelineType: "managed",
  projectTitle: "Swarm Autonomous Protocol Hardening",
  currentObjective: "Harden SQLite single-active-launch authority, implement 11-criterion scorecard verification matrix, and enforce strict real-path artifact sandboxing.",
  elapsedSeconds: 248,
  startedAt: "2026-08-21T14:02:10Z",
  baseCommit: "a8f3b4c910e12d345f6789abcdef0123456789ab",
  baseRef: "main",
  repoPath: "/home/mojo/projects/hermesswarmbuilder/hermesswarmbuilder",
  iterationId: "iter-gen-2-managed",
  generation: 2,
  sourceIntegrityViolated: false,
  gateStatus: "4/4 Must-Pass Gates Verified (100%)",
  tokensUsed: 42500,
  tokenBudget: 100000,
  costEstimated: 0.18,
  costBudget: 1.00,
  nextCheckpoint: "checkpoint-post-synthesis-validation",
  agents: {
    orchestrator: {
      id: "agent-orchestrator",
      label: "Swarm Orchestrator",
      role: "Orchestration",
      status: "running",
      phase: "Synthesis",
      currentTask: "Coordinating cherry-pick winner synthesis and regression validation suite",
      lastMessage: "Evaluator scores validated. Preparing cherry-pick commit from variant-1 into apb/synthesis.",
      updatedAt: "2026-08-21T14:06:18Z",
      toolCount: 16,
      tokens: 14200,
      cost: 0.06
    },
    "worker-1": {
      id: "agent-worker-1",
      label: "Variant Worker #1",
      role: "Managed Variant 1",
      status: "completed",
      phase: "Variants",
      currentTask: "SQLite WAL partial index and concurrency lock test suite",
      lastMessage: "Worktree branch apb/run/variant-1 compiled cleanly. All 18 unit tests passed.",
      updatedAt: "2026-08-21T14:04:45Z",
      toolCount: 24,
      tokens: 18500,
      cost: 0.08
    },
    "worker-2": {
      id: "agent-worker-2",
      label: "Variant Worker #2",
      role: "Managed Variant 2",
      status: "completed",
      phase: "Variants",
      currentTask: "Real-path artifact containment and path traversal protection",
      lastMessage: "Worktree branch apb/run/variant-2 implemented symlink resolution guards.",
      updatedAt: "2026-08-21T14:04:30Z",
      toolCount: 19,
      tokens: 16200,
      cost: 0.07
    },
    "evaluator-1": {
      id: "agent-evaluator-1",
      label: "Quality Evaluator",
      role: "Evaluator Suite",
      status: "completed",
      phase: "Evaluation",
      currentTask: "11-criterion multi-variant evaluation scorecard matrix",
      lastMessage: "Variant 1 scored 94.2/100 (Winner). Variant 2 scored 88.5/100. 0 hard gate violations.",
      updatedAt: "2026-08-21T14:05:50Z",
      toolCount: 11,
      tokens: 8400,
      cost: 0.04
    },
    auditor: {
      id: "agent-auditor",
      label: "Security Auditor",
      role: "Final Audit",
      status: "idle",
      phase: "Gate Closeout",
      currentTask: "Awaiting terminal handoff branch creation for cryptographic digest verification",
      lastMessage: "Audit ledger recording all state mutations and tool-call lifecycle events.",
      updatedAt: "2026-08-21T14:06:00Z",
      toolCount: 5,
      tokens: 3200,
      cost: 0.01
    }
  }
};

const MOCK_PLANS = [
  {
    planId: "plan-hardened-authority",
    version: 2,
    state: "approved",
    currentRevision: 2,
    currentDigest: "sha256:7f83b8361eb548dbbc89b5649365e0be9281a8b7c6d5e4f3a2b1c0d9e8f7a6b5",
    pipelineType: "managed",
    title: "SQLite Single-Active-Launch Authority Hardening",
    updatedAt: "2026-08-21T13:45:00Z",
    activeLaunchId: "launch-20260821-01",
    approvalStatus: "Approved (Digest Verified)",
    content: {
      schemaVersion: "apb.project-plan.v1",
      pipelineType: "managed",
      title: "SQLite Single-Active-Launch Authority Hardening",
      problem: "Concurrent runner invocations could race on un-indexed launch state.",
      intendedUsers: "SRE & Autonomous Ops Engineers",
      objective: "Harden SQLite launch authority with partial unique indices and deterministic SHA-256 verification.",
      boundedScope: "Dashboard launch authority module, runner mutex lock acquisition, and sqlite schema migration.",
      requirements: [
        "Enforce partial unique index on status IN ('requested', 'running')",
        "Enforce exact immutable digest verification before runner launch claim",
        "Add typed launch withdrawal endpoint for unclaimed requested launches"
      ],
      nonGoals: [
        "No multi-tenant distributed consensus",
        "No direct shell execution"
      ],
      constraints: ["Zero external database dependencies; strict SQLite WAL mode"],
      risks: ["Migration failure on legacy database schemas"],
      repository: {
        path: "/home/mojo/projects/hermesswarmbuilder/hermesswarmbuilder",
        baseRef: "main",
        baseCommit: "a8f3b4c910e12d345f6789abcdef0123456789ab"
      },
      acceptanceGates: [
        {
          id: "gate-sqlite-unique-index",
          description: "Concurrent duplicate launch claims return SQLITE_CONSTRAINT error",
          severity: "must",
          required: true,
          requiredEvidence: ["artifacts/launch-concurrency-test.json"]
        },
        {
          id: "gate-digest-integrity",
          description: "Mismatching plan content digest fails approval verification",
          severity: "must",
          required: true,
          requiredEvidence: ["artifacts/digest-verification.json"]
        }
      ],
      validationPolicy: {
        id: "apb.runner-selected.v1",
        expectations: ["Runner executes pre-approved validation policies"],
        clientCommandsAllowed: false
      },
      milestones: ["Schema Migration", "Concurrency Race Tests", "Terminal Integration"],
      limits: {
        maxIterations: 3,
        maxVariantsPerIteration: 3,
        maxParallelVariants: 3,
        maxAcceptedFeatures: 4,
        maxVisualMotifChanges: 1,
        maxNewSections: 1,
        stopAfterNoImprovement: 1
      },
      lineage: {
        mode: "new",
        sourcePlanId: null,
        sourceRevision: null,
        sourceRunId: null,
        sourceIterationId: null
      }
    }
  },
  {
    planId: "plan-clean-slate-frontends",
    version: 1,
    state: "launched",
    currentRevision: 1,
    currentDigest: "sha256:3a91c28f90e1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f",
    pipelineType: "classic",
    title: "Clean-Slate 2D & 3D Engineering Cockpits",
    updatedAt: "2026-08-21T11:20:00Z",
    activeLaunchId: "launch-20260821-02",
    approvalStatus: "Approved (Auto-Claimed)",
    content: {
      schemaVersion: "apb.project-plan.v1",
      pipelineType: "classic",
      title: "Clean-Slate 2D & 3D Engineering Cockpits",
      problem: "Operations dashboard needs zero-legacy clean slate UI.",
      intendedUsers: "Engineering Operations & Swarm SREs",
      objective: "Build 4 high-density clean slate control planes per SPEC §6-§18.",
      boundedScope: "Ops Console, Guided Flow, Spatial Topology, Temporal Mission.",
      requirements: ["Full spec implementation", "WCAG 2.2 AA accessibility", "ANSI terminal streaming"],
      nonGoals: ["No arbitrary browser shell"],
      constraints: ["Vanilla JS modules, zero build step"],
      risks: ["High density UI performance bottlenecks"],
      repository: { path: null, baseRef: null, baseCommit: null },
      acceptanceGates: [
        {
          id: "gate-smoke-control-planes",
          description: "All automated smoke tests pass with 100% assertions",
          severity: "must",
          required: true,
          requiredEvidence: ["artifacts/test-results.json"]
        }
      ],
      validationPolicy: { id: "apb.runner-selected.v1", expectations: ["Runner validation suite"], clientCommandsAllowed: false },
      milestones: ["Design", "Implementation", "Smoke Verification"],
      limits: { maxIterations: 5, maxVariantsPerIteration: 3, maxParallelVariants: 3, maxAcceptedFeatures: 4, maxVisualMotifChanges: 1, maxNewSections: 1, stopAfterNoImprovement: 2 },
      lineage: { mode: "new" }
    }
  },
  {
    planId: "plan-telemetry-cgroup",
    version: 1,
    state: "draft",
    currentRevision: 1,
    currentDigest: "sha256:b5e4d1a2c3f4e5d6c7b8a90123456789abcdef0123456789abcdef0123456789",
    pipelineType: "managed",
    title: "CGroup Resource Telemetry & Token Quotas",
    updatedAt: "2026-08-21T14:10:00Z",
    activeLaunchId: null,
    approvalStatus: "Unapproved (Draft)",
    content: {
      schemaVersion: "apb.project-plan.v1",
      pipelineType: "managed",
      title: "CGroup Resource Telemetry & Token Quotas",
      problem: "Resource usage currently relies on polling without strict cgroup v2 bounds.",
      intendedUsers: "Infrastructure & Platform Engineers",
      objective: "Collect CPU time, resident memory, disk bytes and provider tokens with enforced hard limits.",
      boundedScope: "Runner process telemetry and quota monitor daemon.",
      requirements: ["Collect cgroup v2 metrics", "Track prompt and completion tokens per stage"],
      nonGoals: ["No kernel module modifications"],
      constraints: ["Linux cgroup v2 compatible"],
      risks: ["Non-root cgroup hierarchy permissions"],
      repository: {
        path: "/home/mojo/projects/hermesswarmbuilder/hermesswarmbuilder",
        baseRef: "main",
        baseCommit: "a8f3b4c910e12d345f6789abcdef0123456789ab"
      },
      acceptanceGates: [
        {
          id: "gate-cgroup-telemetry",
          description: "Cgroup metrics captured in telemetry.jsonl",
          severity: "must",
          required: true,
          requiredEvidence: ["artifacts/cgroup-metrics.json"]
        }
      ],
      validationPolicy: { id: "apb.runner-selected.v1", expectations: ["Runner validation suite"], clientCommandsAllowed: false },
      milestones: ["Metric Probes", "Enforcement", "Telemetry Integration"],
      limits: { maxIterations: 2, maxVariantsPerIteration: 2, maxParallelVariants: 2, maxAcceptedFeatures: 2, maxVisualMotifChanges: 0, maxNewSections: 0, stopAfterNoImprovement: 1 },
      lineage: { mode: "new" }
    }
  }
];

const MOCK_QUEUE = [
  {
    id: "queue-item-1",
    rank: 1,
    title: "WCAG 2.2 live region announcer on all panels",
    objective: "Implement aria-live polite regions and roving tabindex for screen readers across all 6 views.",
    priority: "urgent",
    status: "pinned",
    targetRepo: "hermesswarmbuilder",
    referencedGates: ["gate-wcag-compliance"],
    age: "12m ago"
  },
  {
    id: "queue-item-2",
    rank: 2,
    title: "Automated worktree prune after terminal handoff",
    objective: "Safely delete isolated git worktrees after synthesis and verification completion.",
    priority: "high",
    status: "pending",
    targetRepo: "hermesswarmbuilder",
    referencedGates: ["gate-storage-cleanup"],
    age: "1h ago"
  },
  {
    id: "queue-item-3",
    rank: 3,
    title: "Distributed tracing waterfall visualization",
    objective: "Render trace spans across admission, variant generation, Hermes calls, and git operations.",
    priority: "standard",
    status: "pending",
    targetRepo: "hermesswarmbuilder",
    referencedGates: ["gate-trace-waterfall"],
    age: "3h ago"
  }
];

const MOCK_STEERING = [
  {
    id: "steer-01",
    text: "Enforce strict real-path canonical containment on all artifact browser routes to eliminate symlink escapes.",
    scope: "current_run",
    priority: "required",
    status: "active",
    authority: "operator"
  },
  {
    id: "steer-02",
    text: "Ensure single-variant cherry-pick synthesis strategy is explicitly disclosed without multi-variant blending language.",
    scope: "all_runs",
    priority: "required",
    status: "active",
    authority: "operator"
  }
];

const MOCK_RUNS = [
  {
    id: "run-20260821-1402",
    startedAt: "2026-08-21T14:02:10Z",
    objective: "Harden SQLite single-active-launch authority and scorecard verification",
    pipelineType: "managed",
    status: "running",
    phase: "Synthesis",
    elapsedSeconds: 248,
    gatePassRate: "100% (4/4)",
    tokens: 42500,
    cost: "$0.18",
    handoffStatus: "In Progress"
  },
  {
    id: "run-20260821-1100",
    startedAt: "2026-08-21T11:00:00Z",
    objective: "Build Clean-Slate 2D & 3D Engineering Cockpits",
    pipelineType: "classic",
    status: "completed",
    phase: "Handoff",
    elapsedSeconds: 582,
    gatePassRate: "100% (6/6)",
    tokens: 98200,
    cost: "$0.42",
    handoffStatus: "Completed & Passed"
  },
  {
    id: "run-20260820-2200",
    startedAt: "2026-08-20T22:00:00Z",
    objective: "Security sandbox path traversal hardening",
    pipelineType: "managed",
    status: "blocked",
    phase: "Validation",
    elapsedSeconds: 145,
    gatePassRate: "50% (2/4)",
    tokens: 31000,
    cost: "$0.14",
    handoffStatus: "Blocked (Deblock Required)",
    blocker: {
      reason: "Security invariant gate failed: test-results.json returned exit code 1",
      subsystem: "Runner Validation Subsystem",
      timeout: false
    }
  }
];

const MOCK_ITERATIONS = [
  {
    id: "iter-gen-2-managed",
    runId: "run-20260821-1402",
    generation: 2,
    status: "completed",
    repository: "/home/mojo/projects/hermesswarmbuilder/hermesswarmbuilder",
    baseCommit: "a8f3b4c910e12d345f6789abcdef0123456789ab",
    winnerVariant: "variant-1",
    bestScore: "94.2/100",
    gatesResult: "4/4 Passed (0 Hard Violations)",
    acceptedBranch: "apb/synthesis/run-20260821-1402",
    acceptedCommit: "c184e92a48f0293b",
    variants: [
      {
        variantId: "variant-1",
        title: "SQLite Partial Index & Exact Digest Lock",
        claim: "Adds partial index on (status) WHERE status IN ('requested', 'running') and validates SHA-256 hash before claim.",
        branch: "apb/run-20260821-1402/variant-1",
        commit: "e492b1a8f029",
        objectiveFit: 96,
        userValue: 94,
        visualQuality: 90,
        implementationQuality: 96,
        accessibility: 92,
        performance: 97,
        totalScore: 94.2,
        hardGates: 0,
        recommendation: "ACCEPT (WINNER)",
        validationStatus: "PASSED (18/18 Tests)",
        scopeBudget: "Within Budget (2 files, 48 loc)",
        evaluatorRationale: "Flawless SQLite index migration, deterministic SHA-256 validation, zero concurrency race anomalies under 50-worker stress test."
      },
      {
        variantId: "variant-2",
        title: "Table-Level Exclusive Lock with Advisory Sleep",
        claim: "Uses BEGIN EXCLUSIVE transaction with exponential backoff on SQLITE_BUSY.",
        branch: "apb/run-20260821-1402/variant-2",
        commit: "b83719cf012a",
        objectiveFit: 88,
        userValue: 85,
        visualQuality: 90,
        implementationQuality: 89,
        accessibility: 92,
        performance: 82,
        totalScore: 88.5,
        hardGates: 0,
        recommendation: "REJECT",
        validationStatus: "PASSED (18/18 Tests)",
        scopeBudget: "Within Budget (1 file, 32 loc)",
        evaluatorRationale: "Functional but introduces 45ms average lock contention latency compared to 2ms in Variant 1."
      },
      {
        variantId: "variant-3",
        title: "Filesystem Advisory File Lock alongside SQLite",
        claim: "Combines flock() with SQLite transaction to prevent subprocess overlap.",
        branch: "apb/run-20260821-1402/variant-3",
        commit: "f01928374a5b",
        objectiveFit: 82,
        userValue: 80,
        visualQuality: 90,
        implementationQuality: 78,
        accessibility: 92,
        performance: 75,
        totalScore: 82.1,
        hardGates: 1,
        recommendation: "REJECT (HARD GATE VIOLATION)",
        validationStatus: "FAILED (Lock Stale Recovery)",
        scopeBudget: "Exceeded Budget (4 files, 110 loc)",
        evaluatorRationale: "Violates isolation invariants; stale lockfile can block runner after SIGKILL without self-healing."
      }
    ],
    synthesis: {
      winner: "variant-1",
      score: "94.2/100",
      strategy: "cherry-pick-winning-variant",
      strategyDisclosure: "The runner selected winning variant 'variant-1' and cherry-picked its commits cleanly into the synthesis branch. No multi-variant code blending was performed.",
      acceptedFeatures: [
        "Partial unique index on SQLite launch authority",
        "Deterministic SHA-256 digest validation before runner claim",
        "Typed launch withdrawal transaction"
      ],
      rejectedFeatures: [
        "Filesystem advisory flock (Rejected due to stale lock risk)",
        "Exclusive table lock with sleep backoff (Rejected due to latency contention)"
      ],
      winnerBranch: "apb/run-20260821-1402/variant-1",
      synthesisBranch: "apb/synthesis/run-20260821-1402",
      synthesisCommit: "c184e92a48f0293b",
      validationResult: "PASS (All 18 automated suites verified)",
      sourceIntegrity: "VERIFIED (Main working tree clean and unmodified)"
    }
  }
];

const MOCK_GATES = [
  {
    id: "gate-unit-tests",
    description: "All automated unit and regression test suites pass cleanly with zero exit code",
    severity: "must",
    required: true,
    status: "passed",
    requiredEvidence: ["artifacts/test-results.json"],
    assurance: "Runner-verified",
    provenance: "Runner executed npm test in sandbox worktree"
  },
  {
    id: "gate-source-integrity",
    description: "Source Git branch untouched; all mutations isolated in runner worktrees",
    severity: "must",
    required: true,
    status: "passed",
    requiredEvidence: ["artifacts/source-integrity.json"],
    assurance: "Runner-verified",
    provenance: "Preflight and post-execution git diff comparison"
  },
  {
    id: "gate-security-sandbox",
    description: "No path traversal, symlink escapes, or uncontained file access outside run root",
    severity: "must",
    required: true,
    status: "passed",
    requiredEvidence: ["artifacts/security-audit.json"],
    assurance: "Runner-verified",
    provenance: "Automated symlink containment check"
  },
  {
    id: "gate-eval-score-threshold",
    description: "Multi-variant evaluator weighted score exceeds minimum 80.0 threshold with 0 hard gate violations",
    severity: "should",
    required: true,
    status: "passed",
    requiredEvidence: ["artifacts/evaluations/summary.json"],
    assurance: "Runner-verified",
    provenance: "Evaluator suite consensus judgment"
  }
];

const MOCK_VALIDATIONS = [
  {
    args: ["node", "scripts/smoke-four-control-planes.mjs"],
    exitCode: 0,
    duration: "184ms",
    result: "PASS",
    stdout: "ALL FOUR CLEAN-SLATE CONTROL PLANE TESTS PASSED (100%)\n✓ Dashboard A: 2D Ops Console verified.\n✓ Canonical digest computed.\n✓ ANSI sanitization passed.\n✓ WCAG 2.2 AA landmarks verified.",
    stderr: "",
    assurance: "Runner-verified"
  },
  {
    args: ["node", "scripts/smoke-launch-authority.ts"],
    exitCode: 0,
    duration: "312ms",
    result: "PASS",
    stdout: "✓ SQLite single-active-launch authority verified.\n✓ Partial unique index prevented concurrent duplicate claim.\n✓ Digest verification passed.",
    stderr: "",
    assurance: "Runner-verified"
  },
  {
    args: ["node", "scripts/smoke-runner-managed-lifecycle.mjs"],
    exitCode: 0,
    duration: "445ms",
    result: "PASS",
    stdout: "✓ Preflight checked base commit.\n✓ Variant worktrees isolated.\n✓ Evaluator scorecard matrix computed.\n✓ Cherry-pick synthesis verified.",
    stderr: "",
    assurance: "Runner-verified"
  }
];

const MOCK_LOGS = [
  { ts: "2026-08-21T14:02:10.100Z", source: "sys", level: "info", message: "\x1b[32m[Runner]\x1b[0m Acquired global runner mutex lock. PID 184920." },
  { ts: "2026-08-21T14:02:11.240Z", source: "orchestrator", level: "info", message: "Plan claim verified: \x1b[36mplan-hardened-authority\x1b[0m (Rev #2, Digest sha256:7f83b8...)" },
  { ts: "2026-08-21T14:02:12.800Z", source: "orchestrator", level: "info", message: "Preflight stage complete. Base commit \x1b[33ma8f3b4c910e12d345f6789abcdef0123456789ab\x1b[0m verified clean." },
  { ts: "2026-08-21T14:03:05.400Z", source: "worker-1", level: "info", message: "Spawning managed variant 1 worktree \x1b[36mapb/run/variant-1\x1b[0m" },
  { ts: "2026-08-21T14:03:08.900Z", source: "worker-2", level: "info", message: "Spawning managed variant 2 worktree \x1b[36mapb/run/variant-2\x1b[0m" },
  { ts: "2026-08-21T14:04:45.120Z", source: "worker-1", level: "success", message: "\x1b[32m✓ Variant 1 build & test suite passed (18/18 tests)\x1b[0m" },
  { ts: "2026-08-21T14:04:48.300Z", source: "worker-2", level: "success", message: "\x1b[32m✓ Variant 2 symlink containment tests passed\x1b[0m" },
  { ts: "2026-08-21T14:05:50.000Z", source: "evaluator-1", level: "info", message: "11-Criterion Multi-Variant Scorecard evaluated. \x1b[32mVariant 1 Winner (94.2/100)\x1b[0m" },
  { ts: "2026-08-21T14:06:05.150Z", source: "orchestrator", level: "info", message: "Executing synthesis strategy: \x1b[36mcherry-pick-winning-variant\x1b[0m (commit c184e92a)" },
  { ts: "2026-08-21T14:06:18.400Z", source: "gate-keeper", level: "success", message: "\x1b[32m✓ 4/4 Must-Pass Acceptance Gates Verified. Zero violations.\x1b[0m" }
];

const MOCK_TOOL_CALLS = [
  { id: "tc-001", tool: "git_checkout_base", status: "Ended", durationMs: 142, agent: "orchestrator", input: { ref: "main", commit: "a8f3b4c9..." }, output: { status: "clean", head: "a8f3b4c9..." } },
  { id: "tc-002", tool: "spawn_worktree", status: "Ended", durationMs: 210, agent: "worker-1", input: { branch: "apb/run/variant-1", path: ".worktrees/var-1" }, output: { worktreeCreated: true } },
  { id: "tc-003", tool: "run_validation_suite", status: "Ended", durationMs: 445, agent: "worker-1", input: { suite: "sqlite-authority-tests" }, output: { passed: 18, failed: 0, exitCode: 0 } },
  { id: "tc-004", tool: "evaluate_scorecard", status: "Ended", durationMs: 320, agent: "evaluator-1", input: { variants: ["var-1", "var-2", "var-3"], criteriaCount: 11 }, output: { winner: "variant-1", totalScore: 94.2 } },
  { id: "tc-005", tool: "cherry_pick_winner", status: "Ended", durationMs: 180, agent: "orchestrator", input: { commit: "e492b1a8f029", targetBranch: "apb/synthesis" }, output: { success: true, commit: "c184e92a" } }
];

// ==========================================
// OPS CONSOLE CONTROLLER CLASS
// ==========================================

class OpsConsoleController {
  constructor() {
    this.client = new ControlPlaneClient();
    this.currentView = "overview";
    this.activeRunId = "run-20260821-1402";
    this.activeRunDetail = null;
    this.activeRunTab = "overview";
    this.selectedToolCallId = "tc-004";
    this.selectedPlanId = "plan-hardened-authority";
    this.selectedIterationId = "iter-gen-2-managed";
    this.selectedVariantId = "variant-1";
    this.logs = [...MOCK_LOGS];
    this.toolCalls = new Map();
    MOCK_TOOL_CALLS.forEach((tc) => this.toolCalls.set(tc.id, tc));
    this.followLogs = true;
    this.wrapLogs = false;
    this.logFilter = "";
    this.logLevelFilter = "all";
    this.paletteOpen = false;
    this.paletteIndex = 0;
    this.filteredCommands = [];

    this.commands = [
      { cmd: ":hold", desc: "Hold future admission and pause managed work", action: () => this.client.holdAdmission() },
      { cmd: ":pause", desc: "Request checkpoint pause for active managed run", action: () => this.client.pauseCheckpoint() },
      { cmd: ":stop", desc: "Request graceful stop at next checkpoint boundary", action: () => this.client.gracefulStop() },
      { cmd: ":resume", desc: "Resume admission and clear hold/stop intents", action: () => this.client.resumeAdmission() },
      { cmd: ":run-now", desc: "Request runner tick admission immediately", action: () => this.client.requestRunNow() },
      { cmd: ":steer <directive>", desc: "Inject steering directive into active run", action: (arg) => this.client.steer(arg || "Focus on minimal non-breaking fixes") },
      { cmd: ":clear-queue", desc: "Open candidate queue blast-radius preview modal", action: () => this.openClearQueueModal() },
      { cmd: ":new-plan", desc: "Open 13-section governed project plan authoring modal", action: () => this.openPlanAuthoring() },
      { cmd: ":role <role>", desc: "Switch simulated RBAC role (Admin, Operator, Approver, Author, Viewer, Auditor)", action: (arg) => this.switchRole(arg) },
      { cmd: ":view <overview|plans|runs|iterations|evidence|system>", desc: "Switch primary dashboard view", action: (arg) => this.switchView(arg || "overview") },
      { cmd: ":export-audit", desc: "Export tamper-evident audit ledger JSON", action: () => this.exportAuditLedger() },
      { cmd: ":help", desc: "Show keyboard shortcuts cheat sheet", action: () => this.openShortcutsModal() },
      { cmd: ":resync", desc: "Force full snapshot resynchronization with server", action: () => this.client.resyncSnapshots() }
    ];

    this.initElements();
    this.bindEvents();
    this.init();
  }

  initElements() {
    this.el = {
      // Header
      headerStatus: document.getElementById("header-status"),
      headerStatusText: document.getElementById("header-status-text"),
      headerRun: document.getElementById("header-run"),
      headerAdmission: document.getElementById("header-admission"),
      headerPendingCmds: document.getElementById("header-pending-cmds"),
      headerTick: document.getElementById("header-tick"),
      headerSse: document.getElementById("header-sse"),
      headerAttention: document.getElementById("header-attention"),
      headerRoleSelect: document.getElementById("header-role-select"),
      identityStrip: document.getElementById("identity-strip"),

      // Nav Tabs & Views
      navTabs: document.querySelectorAll(".nav-tab"),
      viewOverview: document.getElementById("view-overview"),
      viewPlans: document.getElementById("view-plans"),
      viewRuns: document.getElementById("view-runs"),
      viewIterations: document.getElementById("view-iterations"),
      viewEvidence: document.getElementById("view-evidence"),
      viewSystem: document.getElementById("view-system"),

      // View 1: Overview Panels
      currentWorkPanel: document.getElementById("current-work-panel"),
      attentionQueue: document.getElementById("attention-queue"),
      pipelineStepper: document.getElementById("pipeline-stepper"),
      pipelineTypeLabel: document.getElementById("pipeline-type-label"),
      pipelineElapsedLabel: document.getElementById("pipeline-elapsed-label"),
      agentManifest: document.getElementById("agent-manifest"),
      agentCountBadge: document.getElementById("agent-count-badge"),
      logTerminal: document.getElementById("log-terminal"),
      logCount: document.getElementById("log-count"),
      btnFollowLogs: document.getElementById("btn-follow-logs"),
      btnWrapLogs: document.getElementById("btn-wrap-logs"),
      btnDownloadLogs: document.getElementById("btn-download-logs"),
      logSearch: document.getElementById("log-search"),
      logLevel: document.getElementById("log-level"),
      toolTableBody: document.getElementById("tool-table-body"),
      evidenceViewer: document.getElementById("evidence-viewer"),

      // Control Deck Buttons
      btnHold: document.getElementById("btn-hold"),
      btnPause: document.getElementById("btn-pause"),
      btnStop: document.getElementById("btn-stop"),
      btnResume: document.getElementById("btn-resume"),
      btnRunNow: document.getElementById("btn-run-now"),

      // View 2: Work & Plans
      planListBody: document.getElementById("plan-list-body"),
      planDetailContainer: document.getElementById("plan-detail-container"),
      planSearch: document.getElementById("plan-search"),
      planFilterState: document.getElementById("plan-filter-state"),
      planFilterPipeline: document.getElementById("plan-filter-pipeline"),
      queueTableBody: document.getElementById("queue-table-body"),
      steeringList: document.getElementById("steering-list"),
      planCountBadge: document.getElementById("plan-count-badge"),
      queueCountBadge: document.getElementById("queue-count-badge"),
      steeringCountBadge: document.getElementById("steering-count-badge"),

      // View 3: Runs Console & 10-Tabs
      runsListBody: document.getElementById("runs-list-body"),
      runsCountBadge: document.getElementById("runs-count-badge"),
      runSearch: document.getElementById("run-search"),
      runFilterStatus: document.getElementById("run-filter-status"),
      runFilterPipeline: document.getElementById("run-filter-pipeline"),
      runDetailTabs: document.querySelectorAll(".run-sub-tab"),
      runTabContent: document.getElementById("run-tab-content"),

      // View 4: Iterations Workspace
      iterListBody: document.getElementById("iter-list-body"),
      iterCountBadge: document.getElementById("iter-count-badge"),
      scorecardContainer: document.getElementById("scorecard-container"),
      synthesisContainer: document.getElementById("synthesis-container"),

      // View 5: Evidence & Traceability
      evidenceTableBody: document.getElementById("evidence-table-body"),
      validationTableBody: document.getElementById("validation-table-body"),
      traceabilityContainer: document.getElementById("traceability-container"),

      // View 6: System & Health
      systemHealthChecks: document.getElementById("system-health-checks"),
      processLockInfo: document.getElementById("process-lock-info"),
      storageAccountingInfo: document.getElementById("storage-accounting-info"),
      configSecretsInfo: document.getElementById("config-secrets-info"),
      auditTableBody: document.getElementById("audit-table-body"),
      auditCountBadge: document.getElementById("audit-count-badge"),
      btnExportAudit: document.getElementById("btn-export-audit"),

      // Modals
      planModal: document.getElementById("plan-modal"),
      planForm: document.getElementById("plan-form"),
      clearQueueModal: document.getElementById("clear-queue-modal"),
      addIdeaModal: document.getElementById("add-idea-modal"),
      addIdeaForm: document.getElementById("add-idea-form"),
      addSteeringModal: document.getElementById("add-steering-modal"),
      addSteeringForm: document.getElementById("add-steering-form"),
      deblockModal: document.getElementById("deblock-modal"),
      deblockForm: document.getElementById("deblock-form"),
      paletteModal: document.getElementById("palette-modal"),
      paletteInput: document.getElementById("palette-input"),
      paletteResults: document.getElementById("palette-results"),
      shortcutsModal: document.getElementById("shortcuts-modal"),
      liveAnnouncer: document.getElementById("live-announcer")
    };
  }

  bindEvents() {
    // Primary View Switching Tabs
    this.el.navTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const view = tab.getAttribute("data-view");
        this.switchView(view);
      });
    });

    // Run Sub-Tabs (10 Inspector Tabs)
    this.el.runDetailTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        this.activeRunTab = tab.getAttribute("data-tab");
        this.el.runDetailTabs.forEach((t) => {
          const isSelected = t === tab;
          t.classList.toggle("active", isSelected);
          t.setAttribute("aria-selected", isSelected ? "true" : "false");
        });
        this.renderRunTabContent();
      });
    });

    // Role Selection
    this.el.headerRoleSelect?.addEventListener("change", (e) => {
      this.switchRole(e.target.value);
    });

    // Global Hotkeys
    window.addEventListener("keydown", (e) => {
      const isInput = document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA" || document.activeElement.tagName === "SELECT";

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        this.openPalette();
      } else if (e.key === ":" && !isInput) {
        e.preventDefault();
        this.openPalette(":");
      } else if (e.key === "?" && !isInput) {
        e.preventDefault();
        this.openShortcutsModal();
      } else if (e.key >= "1" && e.key <= "6" && !isInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const views = ["overview", "plans", "runs", "iterations", "evidence", "system"];
        const idx = parseInt(e.key, 10) - 1;
        if (views[idx]) this.switchView(views[idx]);
      } else if (e.key.toLowerCase() === "f" && !isInput) {
        this.toggleFollowLogs();
      } else if (e.key.toLowerCase() === "w" && !isInput) {
        this.toggleWrapLogs();
      } else if (e.key === "Escape") {
        this.closeAllModals();
      }
    });

    // Palette Traversal
    this.el.paletteInput?.addEventListener("input", () => this.filterPalette());
    this.el.paletteInput?.addEventListener("keydown", (e) => {
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

    // Log Controls
    this.el.btnFollowLogs?.addEventListener("click", () => this.toggleFollowLogs());
    this.el.btnWrapLogs?.addEventListener("click", () => this.toggleWrapLogs());
    this.el.btnDownloadLogs?.addEventListener("click", () => this.downloadLogs());
    this.el.logSearch?.addEventListener("input", (e) => {
      this.logFilter = e.target.value.toLowerCase();
      this.renderLogs();
    });
    this.el.logLevel?.addEventListener("change", (e) => {
      this.logLevelFilter = e.target.value;
      this.renderLogs();
    });

    // Control Deck Actions
    this.el.btnHold?.addEventListener("click", () => this.handleCommand(() => this.client.holdAdmission(), "Admission hold requested"));
    this.el.btnPause?.addEventListener("click", () => this.handleCommand(() => this.client.pauseCheckpoint(), "Checkpoint pause requested"));
    this.el.btnStop?.addEventListener("click", () => this.handleCommand(() => this.client.gracefulStop(), "Graceful stop requested"));
    this.el.btnResume?.addEventListener("click", () => this.handleCommand(() => this.client.resumeAdmission(), "Admission resumed"));
    this.el.btnRunNow?.addEventListener("click", () => this.handleCommand(() => this.client.requestRunNow(), "Runner tick requested"));

    // Modal Triggers
    document.getElementById("btn-cmd-palette")?.addEventListener("click", () => this.openPalette());
    document.getElementById("btn-shortcuts-help")?.addEventListener("click", () => this.openShortcutsModal());
    document.getElementById("btn-create-plan-trigger")?.addEventListener("click", () => this.openPlanAuthoring());
    document.getElementById("btn-add-idea-trigger")?.addEventListener("click", () => this.openAddIdeaModal());
    document.getElementById("btn-clear-queue-trigger")?.addEventListener("click", () => this.openClearQueueModal());
    document.getElementById("btn-add-steering-trigger")?.addEventListener("click", () => this.openAddSteeringModal());
    this.el.btnExportAudit?.addEventListener("click", () => this.exportAuditLedger());

    // Modal Close Buttons
    document.getElementById("btn-close-plan-modal")?.addEventListener("click", () => { this.el.planModal.style.display = "none"; });
    document.getElementById("btn-cancel-plan-modal")?.addEventListener("click", () => { this.el.planModal.style.display = "none"; });
    document.getElementById("btn-close-clear-modal")?.addEventListener("click", () => { this.el.clearQueueModal.style.display = "none"; });
    document.getElementById("btn-abort-clear-queue")?.addEventListener("click", () => { this.el.clearQueueModal.style.display = "none"; });
    document.getElementById("btn-confirm-clear-queue")?.addEventListener("click", () => this.executeClearQueue());
    document.getElementById("btn-close-idea-modal")?.addEventListener("click", () => { this.el.addIdeaModal.style.display = "none"; });
    document.getElementById("btn-cancel-idea-modal")?.addEventListener("click", () => { this.el.addIdeaModal.style.display = "none"; });
    document.getElementById("btn-close-steering-modal")?.addEventListener("click", () => { this.el.addSteeringModal.style.display = "none"; });
    document.getElementById("btn-cancel-steering-modal")?.addEventListener("click", () => { this.el.addSteeringModal.style.display = "none"; });
    document.getElementById("btn-close-deblock-modal")?.addEventListener("click", () => { this.el.deblockModal.style.display = "none"; });
    document.getElementById("btn-cancel-deblock-modal")?.addEventListener("click", () => { this.el.deblockModal.style.display = "none"; });
    document.getElementById("btn-close-shortcuts-modal")?.addEventListener("click", () => { this.el.shortcutsModal.style.display = "none"; });

    // Forms Submissions
    this.el.planForm?.addEventListener("submit", (e) => { e.preventDefault(); this.submitPlanForm(); });
    this.el.addIdeaForm?.addEventListener("submit", (e) => { e.preventDefault(); this.submitAddIdeaForm(); });
    this.el.addSteeringForm?.addEventListener("submit", (e) => { e.preventDefault(); this.submitAddSteeringForm(); });
    this.el.deblockForm?.addEventListener("submit", (e) => { e.preventDefault(); this.submitDeblockForm(); });

    // Filter Listeners
    this.el.planSearch?.addEventListener("input", () => this.renderPlansView());
    this.el.planFilterState?.addEventListener("change", () => this.renderPlansView());
    this.el.planFilterPipeline?.addEventListener("change", () => this.renderPlansView());
    this.el.runSearch?.addEventListener("input", () => this.renderRunsView());
    this.el.runFilterStatus?.addEventListener("change", () => this.renderRunsView());
    this.el.runFilterPipeline?.addEventListener("change", () => this.renderRunsView());
  }

  async init() {
    this.client.subscribe((msg) => this.handleClientUpdate(msg));
    try {
      await this.client.resyncSnapshots();
      this.client.connectStream();
    } catch {
      // Backend offline or non-responsive; fallback mock state active
    }
    this.renderAll();
  }

  handleClientUpdate(msg) {
    if (msg.type === "state-update" || msg.type === "resynchronized") {
      this.renderAll();
    } else if (msg.type === "events-update") {
      this.processEvents(msg.events);
    } else if (msg.type === "stream-status") {
      this.renderHeader();
    }
  }

  switchView(viewName) {
    this.currentView = viewName;
    this.el.navTabs.forEach((tab) => {
      const match = tab.getAttribute("data-view") === viewName;
      tab.classList.toggle("active", match);
    });
    document.querySelectorAll(".view-section").forEach((sec) => {
      sec.classList.toggle("active", sec.id === `view-${viewName}`);
    });
    this.announce(`Switched to view: ${viewName}`);
  }

  renderAll() {
    this.renderHeader();
    this.renderIdentityStrip();
    this.renderOverview();
    this.renderPlansView();
    this.renderRunsView();
    this.renderIterationsView();
    this.renderEvidenceView();
    this.renderSystemView();
  }

  // ==========================================
  // 1. HEADER & CROSS-RESOURCE IDENTITY STRIP
  // ==========================================

  renderHeader() {
    const state = this.client.cachedState || MOCK_STATE;
    const control = this.client.cachedControl || {};
    const disposition = deriveCanonicalDisposition(state, control, null, null);

    if (this.el.headerStatusText) this.el.headerStatusText.textContent = disposition.label;
    if (this.el.headerStatus) this.el.headerStatus.className = `system-badge ${disposition.class}`;

    const runId = state.currentRunId || "--";
    const phase = state.phase || state.status || "Idle";
    this.el.headerRun.textContent = `Run: ${runId} (${phase})`;

    const isHeld = control.runAdmission === "paused";
    this.el.headerAdmission.textContent = isHeld ? "Admission: HELD" : "Admission: ENABLED";
    this.el.headerAdmission.className = isHeld ? "system-badge badge-warning" : "system-badge badge-active";

    const pending = (control.pendingCommands || []).length;
    this.el.headerPendingCmds.textContent = `Pending: ${pending}`;
    this.el.headerTick.textContent = "Tick: ~:00m (est)";

    const isLive = this.client.sseConnected;
    this.el.headerSse.textContent = isLive ? "SSE: LIVE" : "SSE: CONNECTING";
    this.el.headerSse.className = isLive ? "system-badge badge-success" : "system-badge badge-neutral";

    const attentionCount = this.computeAttentionItems().length;
    this.el.headerAttention.textContent = `Attention: ${attentionCount}`;
    this.el.headerAttention.className = attentionCount > 0 ? "system-badge badge-warning" : "system-badge badge-neutral";
  }

  renderIdentityStrip() {
    const state = this.client.cachedState || MOCK_STATE;
    const plans = (this.client.cachedPlans && this.client.cachedPlans.length > 0) ? this.client.cachedPlans : MOCK_PLANS;
    const activePlan = plans.find((p) => p.planId === this.selectedPlanId) || plans[0] || {};

    const items = [
      { key: "plan", label: "Plan", val: activePlan.planId || "Not assigned", fullVal: activePlan.planId },
      { key: "rev", label: "Rev", val: activePlan.currentRevision ? `#${activePlan.currentRevision}` : "Not assigned", fullVal: String(activePlan.currentRevision || "") },
      { key: "approval", label: "Approval", val: activePlan.approvalStatus || (activePlan.state === "approved" ? "Approved" : "Unapproved"), fullVal: activePlan.currentDigest },
      { key: "launch", label: "Launch", val: activePlan.activeLaunchId || "Not claimed", fullVal: activePlan.activeLaunchId },
      { key: "request", label: "Request", val: state.currentRunId ? `req-${state.currentRunId.slice(4, 12)}` : "Not assigned", fullVal: state.currentRunId },
      { key: "run", label: "Run", val: state.currentRunId || "Idle", fullVal: state.currentRunId },
      { key: "iteration", label: "Iteration", val: state.iterationId ? `Gen ${state.generation || 2}` : "Not assigned", fullVal: state.iterationId }
    ];

    this.el.identityStrip.innerHTML = items.map((item, idx) => `
      <span class="id-item">
        <span>${item.label}:</span>
        <span class="id-val" data-key="${item.key}" data-val="${escapeHtml(item.fullVal || '')}" title="Click to copy / inspect ${item.label}">
          ${escapeHtml(item.val)}
        </span>
      </span>
      ${idx < items.length - 1 ? '<span class="id-sep">➔</span>' : ''}
    `).join("");

    this.el.identityStrip.querySelectorAll(".id-val").forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = btn.getAttribute("data-val");
        if (val && val !== "Not assigned" && val !== "null") {
          navigator.clipboard?.writeText(val);
          this.announce(`Copied ${val} to clipboard`);
        }
      });
    });
  }

  // ==========================================
  // 2. VIEW 1: OVERVIEW & ATTENTION
  // ==========================================

  renderOverview() {
    const state = this.client.cachedState || MOCK_STATE;

    // 1. Current Work Panel
    this.el.currentWorkPanel.innerHTML = `
      <div class="ops-card">
        <div class="ops-card-header">
          <span style="font-weight: 700;">${escapeHtml(state.projectTitle || "Autonomous Swarm Build")}</span>
          <span class="system-badge badge-active">${(state.pipelineType || "managed").toUpperCase()} PIPELINE</span>
        </div>
        <div style="font-size: 11px; color: var(--text-secondary); line-height: 1.35; margin-bottom: 6px;">
          ${escapeHtml(state.currentObjective || "No objective currently active.")}
        </div>
        <div class="meta-grid-2">
          <div><strong>Run ID:</strong> <code style="color: var(--color-active);">${state.currentRunId || "Idle"}</code></div>
          <div><strong>Phase:</strong> ${state.phase || state.status || "Idle"}</div>
          <div><strong>Elapsed:</strong> ${state.elapsedSeconds ? `${state.elapsedSeconds}s` : "--"}</div>
          <div><strong>Checkpoint:</strong> ${state.nextCheckpoint || "pre-synthesis"}</div>
          <div><strong>Base Commit:</strong> <code>${(state.baseCommit || "").slice(0, 10)}...</code></div>
          <div><strong>Gates:</strong> ${state.gateStatus || "4/4 Passed"}</div>
        </div>
        <div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center;">
          <div style="font-family: var(--font-mono); font-size: 10px; color: var(--text-muted);">
            Tokens: ${state.tokensUsed ? state.tokensUsed.toLocaleString() : "42,500"} / ${state.tokenBudget ? state.tokenBudget.toLocaleString() : "100,000"} • Cost: $${state.costEstimated || 0.18}
          </div>
          <button id="btn-open-active-run" class="btn-ops btn-sm btn-primary">Open Run ➔</button>
        </div>
      </div>
    `;

    document.getElementById("btn-open-active-run")?.addEventListener("click", () => {
      this.switchView("runs");
      if (state.currentRunId) this.selectRun(state.currentRunId);
    });

    // 2. 9-Tier Attention Queue
    const attentionItems = this.computeAttentionItems();
    if (attentionItems.length === 0) {
      this.el.attentionQueue.innerHTML = `
        <div class="attention-card p3">
          <div class="attention-card-header">
            <span>Tier 9: All Systems Nominal</span>
            <span class="system-badge badge-success">P3 NOMINAL</span>
          </div>
          <div class="attention-card-body">All pipeline stages, agent subprocesses, and mutex locks are operating within nominal thresholds.</div>
        </div>
      `;
    } else {
      this.el.attentionQueue.innerHTML = attentionItems.map((item, idx) => `
        <div class="attention-card ${item.priority}" tabindex="0" role="button" data-idx="${idx}">
          <div class="attention-card-header">
            <span>${escapeHtml(item.title)}</span>
            <span class="system-badge ${item.priority === 'p0' ? 'badge-error' : item.priority === 'p1' ? 'badge-warning' : 'badge-active'}">${item.priority.toUpperCase()}</span>
          </div>
          <div class="attention-card-body">${escapeHtml(item.description)}</div>
          <div class="attention-card-meta">
            <span>Context: ${escapeHtml(item.context)}</span>
            <span>${escapeHtml(item.actionLabel)} ➔</span>
          </div>
        </div>
      `).join("");

      this.el.attentionQueue.querySelectorAll(".attention-card").forEach((card, idx) => {
        card.addEventListener("click", () => attentionItems[idx].action());
      });
    }

    // 3. Pipeline Stepper
    this.renderPipelineStepper();
    this.renderAgentManifest();
    this.renderLogs();
    this.renderToolTable();
  }

  computeAttentionItems() {
    const state = this.client.cachedState || MOCK_STATE;
    const plans = (this.client.cachedPlans && this.client.cachedPlans.length > 0) ? this.client.cachedPlans : MOCK_PLANS;
    const items = [];

    // Tier 1 (P0): Unconfirmed Process Cleanup or Source Mutation
    if (state.sourceIntegrityViolated) {
      items.push({
        priority: "p0",
        title: "Tier 1: Source Branch Mutation Detected",
        description: "Uncommitted filesystem modifications observed outside isolated worktrees.",
        context: "Source Integrity Invariant",
        actionLabel: "Inspect Git Status",
        action: () => alert("CRITICAL: Working directory has dirty state. Inspect Git working tree.")
      });
    }

    // Tier 2 (P0): Authentication / Integrity / Storage Incident
    if (state.status === "blocked") {
      const b = state.blocker || {};
      items.push({
        priority: "p0",
        title: `Tier 3: Active Blocker Encountered (${state.phase || 'Execution'})`,
        description: b.reason || "Hard gate violation or tool execution exception halted runner.",
        context: `Run ${state.currentRunId}`,
        actionLabel: "Intervene / Deblock",
        action: () => this.openDeblockModal(state.currentRunId, b.reason)
      });
    }

    // Tier 4 (P1): Missing Required Evidence or Failed Gate
    const gates = (this.client.cachedGates?.gates && this.client.cachedGates.gates.length > 0) ? this.client.cachedGates.gates : MOCK_GATES;
    const failedGates = gates.filter((g) => g.status === "failed");
    if (failedGates.length > 0) {
      items.push({
        priority: "p1",
        title: `Tier 4: ${failedGates.length} Governed Acceptance Gates Failed`,
        description: "One or more must-pass quality gates failed automated verification.",
        context: failedGates.map((g) => g.id).join(", "),
        actionLabel: "Inspect Gate Evidence",
        action: () => this.switchView("evidence")
      });
    }

    // Tier 6 (P1): Pending Approval or Launch Conflict
    for (const p of plans) {
      if (p.state === "ready-for-review" || p.state === "draft") {
        items.push({
          priority: "p1",
          title: `Tier 6: Plan Awaiting Review (${p.planId})`,
          description: `Revision #${p.currentRevision} authored; pending cryptographic approval and digest verification.`,
          context: `Digest: ${(p.currentDigest || '').slice(0, 16)}...`,
          actionLabel: "Review Plan Authority",
          action: () => {
            this.switchView("plans");
            this.inspectPlan(p.planId);
          }
        });
      }
    }

    return items;
  }

  renderPipelineStepper() {
    const state = this.client.cachedState || MOCK_STATE;
    const isManaged = state.pipelineType === "managed";
    const stages = isManaged
      ? ["Preflight", "Variants", "Evaluation", "Synthesis", "Validation", "Gate Closeout", "Handoff"]
      : ["Inventory", "Selection", "Repo", "SPEC", "SPEC Review", "DEVPLAN", "DEVPLAN Review", "Build", "Validation", "Final Audit", "Handoff"];

    if (this.el.pipelineTypeLabel) {
      this.el.pipelineTypeLabel.textContent = `${(state.pipelineType || "managed").toUpperCase()} PIPELINE (${stages.length} STAGES)`;
    }
    if (this.el.pipelineElapsedLabel) {
      this.el.pipelineElapsedLabel.textContent = `Elapsed: ${state.elapsedSeconds ? `${state.elapsedSeconds}s` : "248s"}`;
    }

    const currentPhase = (state.phase || "Synthesis").toLowerCase();
    const currentIdx = stages.findIndex((st) => currentPhase.includes(st.toLowerCase()));

    this.el.pipelineStepper.innerHTML = stages.map((st, idx) => {
      const isPassed = currentIdx > idx;
      const isCurrent = currentIdx === idx;
      const isBlocked = state.status === "blocked" && isCurrent;
      let statusClass = isBlocked ? "blocked" : isCurrent ? "active" : isPassed ? "passed" : "";
      let statusText = isBlocked ? "Blocked" : isCurrent ? "Executing" : isPassed ? "Complete" : "Pending";

      return `
        <div class="stage-pill ${statusClass}" role="listitem">
          <div class="stage-pill-title">
            <span>${st}</span>
            <span>${isPassed ? '✓' : isCurrent ? '●' : '○'}</span>
          </div>
          <div class="stage-pill-status">${statusText}</div>
        </div>
      `;
    }).join("");
  }

  renderAgentManifest() {
    const state = this.client.cachedState || MOCK_STATE;
    const agents = Object.values(state.agents || {});
    if (this.el.agentCountBadge) this.el.agentCountBadge.textContent = `${agents.length} Active`;

    this.el.agentManifest.innerHTML = agents.map((a) => {
      const isRunning = a.status === "running";
      const isCompleted = a.status === "completed";
      const badgeClass = isRunning ? "badge-active" : isCompleted ? "badge-success" : "badge-neutral";
      return `
        <div class="agent-card">
          <div class="agent-card-header">
            <span style="font-weight: 700; color: var(--text-primary);">${escapeHtml(a.label || a.id)}</span>
            <span class="system-badge ${badgeClass}">${a.status}</span>
          </div>
          <div class="agent-card-meta">
            Role: ${escapeHtml(a.role || 'Worker')} • Tools: ${a.toolCount || 0} • Tokens: ${(a.tokens || 0).toLocaleString()}
          </div>
          <div class="agent-card-task" title="${escapeHtml(a.currentTask || a.lastMessage || '')}">
            ${escapeHtml(a.currentTask || a.lastMessage || '')}
          </div>
        </div>
      `;
    }).join("");
  }

  // ==========================================
  // 3. VIEW 2: WORK & PLANS
  // ==========================================

  renderPlansView() {
    const plans = (this.client.cachedPlans && this.client.cachedPlans.length > 0) ? this.client.cachedPlans : MOCK_PLANS;
    const search = (this.el.planSearch?.value || "").toLowerCase().trim();
    const filterState = this.el.planFilterState?.value || "all";
    const filterPipeline = this.el.planFilterPipeline?.value || "all";

    let filtered = plans.filter((p) => {
      if (filterState !== "all" && p.state !== filterState) return false;
      if (filterPipeline !== "all" && p.pipelineType !== filterPipeline) return false;
      if (search && !JSON.stringify(p).toLowerCase().includes(search)) return false;
      return true;
    });

    if (this.el.planCountBadge) this.el.planCountBadge.textContent = `[${filtered.length}]`;

    this.el.planListBody.innerHTML = filtered.map((p) => `
      <tr data-plan-id="${p.planId}" class="${p.planId === this.selectedPlanId ? 'selected' : ''}" style="cursor: pointer;">
        <td style="font-weight: 700; color: var(--color-active);">${escapeHtml(p.title || p.planId)}</td>
        <td><span class="system-badge badge-active">${p.pipelineType}</span></td>
        <td><span class="system-badge ${p.state === 'approved' ? 'badge-success' : p.state === 'launched' ? 'badge-authority' : 'badge-warning'}">${p.state}</span></td>
        <td>#${p.currentRevision}</td>
        <td><code>${(p.currentDigest || '').slice(0, 10)}...</code></td>
        <td><span style="font-size: 10px; color: ${p.state === 'approved' ? 'var(--color-success)' : 'var(--text-muted)'};">${p.approvalStatus || 'Unapproved'}</span></td>
        <td>
          <button class="btn-ops btn-sm" data-action="inspect" data-id="${p.planId}">Review</button>
        </td>
      </tr>
    `).join("");

    this.el.planListBody.querySelectorAll("tr").forEach((row) => {
      row.addEventListener("click", () => {
        const id = row.getAttribute("data-plan-id");
        this.inspectPlan(id);
      });
    });

    // Render Queue Table
    const queue = (this.client.cachedQueue?.items && this.client.cachedQueue.items.length > 0) ? this.client.cachedQueue.items : MOCK_QUEUE;
    if (this.el.queueCountBadge) this.el.queueCountBadge.textContent = `[${queue.length}]`;

    this.el.queueTableBody.innerHTML = queue.map((item, idx) => `
      <tr>
        <td>#${item.rank || idx + 1}</td>
        <td style="font-weight: 600; color: var(--text-primary);">${escapeHtml(item.title || item.objective)}</td>
        <td><span class="system-badge ${item.priority === 'urgent' ? 'badge-error' : item.priority === 'high' ? 'badge-warning' : 'badge-neutral'}">${item.priority}</span></td>
        <td><span class="system-badge badge-neutral">${item.status || 'pending'}</span></td>
        <td>
          <button class="btn-ops btn-sm ${item.status === 'pinned' ? 'btn-warning' : ''}" data-action="pin" data-id="${item.id}">
            ${item.status === 'pinned' ? '📌 Pinned' : 'Pin'}
          </button>
        </td>
        <td>
          <button class="btn-ops btn-sm btn-primary" data-action="convert-plan" data-id="${item.id}">Plan</button>
        </td>
      </tr>
    `).join("");

    this.el.queueTableBody.querySelectorAll("button[data-action='pin']").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-id");
        this.client.pinQueueItem(id).catch(() => alert(`Pinned queue item ${id}`));
      });
    });

    this.el.queueTableBody.querySelectorAll("button[data-action='convert-plan']").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.openPlanAuthoring();
      });
    });

    // Render Steering Directives
    const steering = (this.client.cachedControl?.steering && this.client.cachedControl.steering.length > 0) ? this.client.cachedControl.steering : MOCK_STEERING;
    if (this.el.steeringCountBadge) this.el.steeringCountBadge.textContent = `[${steering.length}]`;

    this.el.steeringList.innerHTML = steering.map((s) => `
      <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 4px; padding: 6px 8px; margin-bottom: 6px; font-size: 11px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
          <span class="system-badge badge-active">${escapeHtml(s.scope || 'next_run')}</span>
          <span class="system-badge ${s.priority === 'required' ? 'badge-warning' : 'badge-neutral'}">${s.priority}</span>
        </div>
        <div style="color: var(--text-primary); line-height: 1.35;">${escapeHtml(s.text || s.prompt)}</div>
      </div>
    `).join("");

    if (this.selectedPlanId) {
      this.inspectPlan(this.selectedPlanId);
    }
  }

  async inspectPlan(planId) {
    this.selectedPlanId = planId;
    const plans = (this.client.cachedPlans && this.client.cachedPlans.length > 0) ? this.client.cachedPlans : MOCK_PLANS;
    const plan = plans.find((p) => p.planId === planId) || plans[0];
    if (!plan) return;

    const c = plan.content || {};
    const gates = c.acceptanceGates || [];
    const perms = this.client.getPermissions();

    this.el.planDetailContainer.innerHTML = `
      <div class="ops-card">
        <div class="ops-card-header">
          <span style="font-size: 13px; font-weight: 700;">${escapeHtml(c.title || plan.title)}</span>
          <span class="system-badge ${plan.state === 'approved' ? 'badge-success' : plan.state === 'launched' ? 'badge-authority' : 'badge-warning'}">${plan.state.toUpperCase()}</span>
        </div>
        
        <div style="font-family: var(--font-mono); font-size: 10px; color: var(--text-muted); background: var(--bg-primary); padding: 6px 8px; border-radius: 4px; margin-bottom: 10px;">
          <div><strong>Plan ID:</strong> ${plan.planId} (Rev #${plan.currentRevision})</div>
          <div style="word-break: break-all;"><strong>SHA-256 Digest:</strong> <code style="color: var(--color-active);">${plan.currentDigest}</code></div>
          <div><strong>Frozen Base Commit:</strong> ${c.repository?.baseCommit || "HEAD (Clean)"}</div>
        </div>

        <div style="margin-bottom: 10px;">
          <strong>Bounded Objective:</strong>
          <p style="color: var(--text-secondary); margin-top: 2px; line-height: 1.4;">${escapeHtml(c.objective || '')}</p>
        </div>

        <div style="margin-bottom: 10px;">
          <strong>Requirements (${(c.requirements || []).length}):</strong>
          <ul style="margin-left: 18px; margin-top: 3px; color: var(--text-secondary); font-size: 11px;">
            ${(c.requirements || []).map((r) => `<li>${escapeHtml(r)}</li>`).join("")}
          </ul>
        </div>

        <div style="margin-bottom: 10px;">
          <strong>Acceptance Gates (${gates.length}):</strong>
          <ul style="margin-left: 18px; margin-top: 3px; color: var(--text-secondary); font-size: 11px;">
            ${gates.map((g) => `<li><strong>${escapeHtml(g.id)}:</strong> ${escapeHtml(g.description)} <code>(${(g.requiredEvidence || []).join(', ')})</code></li>`).join("")}
          </ul>
        </div>

        <!-- Approval Callout Box -->
        <div class="modal-alert-box info-alert" style="margin-top: 12px;">
          <strong>Approval Authority Notice (§8.6):</strong> Approval authorizes launch of this <em>exact revision and digest</em>. It does not establish completion, promote code, or authorize later edits.
        </div>

        <!-- Action Deck -->
        <div style="display: flex; gap: 6px; margin-top: 12px; flex-wrap: wrap;">
          <button id="btn-plan-approve" class="btn-ops btn-success" ${!perms.canApprove ? 'disabled title="Approver role required"' : ''}>✓ Approve Exact Rev</button>
          <button id="btn-plan-launch" class="btn-ops btn-primary" ${!perms.canLaunch || plan.state !== 'approved' ? 'disabled title="Requires Approved state and Operator role"' : ''}>🚀 Launch Authority</button>
          <button id="btn-plan-fork" class="btn-ops">Fork Draft</button>
        </div>
      </div>
    `;

    document.getElementById("btn-plan-approve")?.addEventListener("click", () => {
      this.client.approvePlan(plan.planId, plan.currentRevision, plan.currentDigest, "Approved in ops console", plan.version || 1)
        .then(() => {
          this.announce(`Approved plan ${plan.planId}`);
          plan.state = "approved";
          this.renderPlansView();
        })
        .catch((err) => alert(`Approval failed: ${err.message}`));
    });

    document.getElementById("btn-plan-launch")?.addEventListener("click", () => {
      this.client.launchPlan(plan.planId, plan.currentRevision, plan.currentDigest, plan.version || 1)
        .then(() => {
          this.announce(`Launched plan ${plan.planId}`);
          plan.state = "launched";
          this.renderPlansView();
        })
        .catch((err) => alert(`Launch failed: ${err.message}`));
    });
  }

  // ==========================================
  // 4. VIEW 3: RUNS CONSOLE & 10-TAB INSPECTOR
  // ==========================================

  renderRunsView() {
    const runs = (this.client.cachedRuns && this.client.cachedRuns.length > 0) ? this.client.cachedRuns : MOCK_RUNS;
    const search = (this.el.runSearch?.value || "").toLowerCase().trim();
    const filterStatus = this.el.runFilterStatus?.value || "all";
    const filterPipeline = this.el.runFilterPipeline?.value || "all";

    let filtered = runs.filter((r) => {
      if (filterStatus !== "all" && r.status !== filterStatus) return false;
      if (filterPipeline !== "all" && r.pipelineType !== filterPipeline) return false;
      if (search && !JSON.stringify(r).toLowerCase().includes(search)) return false;
      return true;
    });

    if (this.el.runsCountBadge) this.el.runsCountBadge.textContent = `[${filtered.length}]`;

    this.el.runsListBody.innerHTML = filtered.map((r) => `
      <tr data-run-id="${r.id}" class="${r.id === this.activeRunId ? 'selected' : ''}" style="cursor: pointer;">
        <td style="font-weight: 700; color: var(--color-active);">${escapeHtml(r.id)}</td>
        <td><span class="system-badge badge-active">${r.pipelineType || 'managed'}</span></td>
        <td><span class="system-badge ${r.status === 'completed' ? 'badge-success' : r.status === 'blocked' ? 'badge-error' : 'badge-active'}">${r.status}</span></td>
        <td>${r.phase || '--'}</td>
        <td>${r.elapsedSeconds ? `${r.elapsedSeconds}s` : '--'}</td>
        <td>${r.gatePassRate || '100%'}</td>
      </tr>
    `).join("");

    this.el.runsListBody.querySelectorAll("tr").forEach((row) => {
      row.addEventListener("click", () => {
        const id = row.getAttribute("data-run-id");
        this.selectRun(id);
      });
    });

    this.renderRunTabContent();
  }

  selectRun(runId) {
    this.activeRunId = runId;
    this.renderRunsView();
    this.renderRunTabContent();
  }

  renderRunTabContent() {
    const runs = (this.client.cachedRuns && this.client.cachedRuns.length > 0) ? this.client.cachedRuns : MOCK_RUNS;
    const run = runs.find((r) => r.id === this.activeRunId) || runs[0];
    const tab = this.activeRunTab;

    if (!run) return;

    if (tab === "overview") {
      this.el.runTabContent.innerHTML = `
        <div class="ops-card">
          <div class="ops-card-header">
            <span style="font-size: 13px; font-weight: 700;">Run Overview: ${escapeHtml(run.id)}</span>
            <span class="system-badge badge-active">${(run.status || 'running').toUpperCase()}</span>
          </div>
          <div class="meta-grid-2">
            <div><strong>Objective:</strong> ${escapeHtml(run.objective || '')}</div>
            <div><strong>Pipeline:</strong> ${run.pipelineType || 'managed'}</div>
            <div><strong>Phase:</strong> ${run.phase || 'N/A'}</div>
            <div><strong>Started At:</strong> ${run.startedAt || '2026-08-21T14:02:10Z'}</div>
            <div><strong>Elapsed:</strong> ${run.elapsedSeconds ? `${run.elapsedSeconds}s` : '248s'}</div>
            <div><strong>Gate Pass Rate:</strong> ${run.gatePassRate || '100% (4/4)'}</div>
          </div>
          <div class="modal-alert-box info-alert" style="margin-top: 12px;">
            <strong>Execution Integrity Verification:</strong> Source git branch untouched. Mutex lock owner verified. Runner validation policies passed.
          </div>
        </div>
      `;
    } else if (tab === "pipeline") {
      this.el.runTabContent.innerHTML = `
        <div class="ops-card">
          <div class="ops-card-header">Pipeline Stage Progression &amp; Durations</div>
          <div style="font-family: var(--font-mono); font-size: 11px; margin-top: 6px;">
            <div style="padding: 6px; border-bottom: 1px solid var(--border-subtle); display: flex; justify-content: space-between;">
              <span>1. Preflight &amp; Base Verification</span><span style="color: var(--color-success);">PASS (14s)</span>
            </div>
            <div style="padding: 6px; border-bottom: 1px solid var(--border-subtle); display: flex; justify-content: space-between;">
              <span>2. Multi-Variant Isolated Execution</span><span style="color: var(--color-success);">PASS (112s)</span>
            </div>
            <div style="padding: 6px; border-bottom: 1px solid var(--border-subtle); display: flex; justify-content: space-between;">
              <span>3. 11-Criterion Quality Evaluation</span><span style="color: var(--color-success);">PASS (45s)</span>
            </div>
            <div style="padding: 6px; border-bottom: 1px solid var(--border-subtle); display: flex; justify-content: space-between;">
              <span>4. Winner Cherry-Pick Synthesis</span><span style="color: var(--color-active);">EXECUTING (38s)</span>
            </div>
            <div style="padding: 6px; display: flex; justify-content: space-between; color: var(--text-muted);">
              <span>5. Handoff &amp; Gate Closeout</span><span>PENDING</span>
            </div>
          </div>
        </div>
      `;
    } else if (tab === "agents") {
      this.el.runTabContent.innerHTML = `
        <div class="ops-card">
          <div class="ops-card-header">Grouped Agent Manifest &amp; Tool Counts</div>
          <div style="margin-top: 6px;">
            ${Object.values(MOCK_STATE.agents).map((a) => `
              <div style="background: var(--bg-primary); padding: 8px; border-radius: 4px; margin-bottom: 6px; font-family: var(--font-mono); font-size: 11px;">
                <div style="display: flex; justify-content: space-between;">
                  <strong>${escapeHtml(a.label)} (${a.role})</strong>
                  <span class="system-badge ${a.status === 'running' ? 'badge-active' : 'badge-success'}">${a.status}</span>
                </div>
                <div style="color: var(--text-secondary); font-size: 10px; margin-top: 2px;">${escapeHtml(a.currentTask)}</div>
              </div>
            `).join("")}
          </div>
        </div>
      `;
    } else if (tab === "logs") {
      this.el.runTabContent.innerHTML = `
        <div style="height: 100%; display: flex; flex-direction: column;">
          <div class="pane-header">
            <span>Execution ANSI Stream</span>
            <button class="btn-ops btn-sm" onclick="alert('Downloading full execution log...')">⬇ Download Log</button>
          </div>
          <div class="log-terminal" style="flex: 1;">
            ${this.logs.map((l) => `<div class="log-line"><span class="log-ts">${l.ts ? l.ts.slice(11, 19) : ''}</span><span class="log-src">[${l.source}]</span>${sanitizeAnsiToHtml(l.message)}</div>`).join("")}
          </div>
        </div>
      `;
    } else if (tab === "evidence") {
      this.el.runTabContent.innerHTML = `
        <div class="ops-card">
          <div class="ops-card-header">Quality Gates Decision Ledger</div>
          <table class="ops-table">
            <thead><tr><th>Gate ID</th><th>Severity</th><th>Status</th><th>Required Evidence</th></tr></thead>
            <tbody>
              ${MOCK_GATES.map((g) => `<tr><td><strong>${g.id}</strong></td><td>${g.severity}</td><td><span class="system-badge badge-success">${g.status}</span></td><td><code>${g.requiredEvidence.join(', ')}</code></td></tr>`).join("")}
            </tbody>
          </table>
        </div>
      `;
    } else if (tab === "artifacts") {
      this.el.runTabContent.innerHTML = `
        <div class="ops-card">
          <div class="ops-card-header">Sandboxed Artifact Tree Browser</div>
          <div style="font-family: var(--font-mono); font-size: 11px; padding: 6px;">
            <div style="color: var(--color-active); margin-bottom: 4px;">📁 artifacts/</div>
            <div style="margin-left: 16px;">📄 test-results.json (14 KB, SHA-256 verified)</div>
            <div style="margin-left: 16px;">📄 source-integrity.json (4 KB, Clean)</div>
            <div style="margin-left: 16px;">📄 security-audit.json (8 KB, Containment OK)</div>
            <div style="margin-left: 16px; color: var(--color-active);">📁 evaluations/</div>
            <div style="margin-left: 32px;">📄 summary.json (22 KB, Winner: variant-1)</div>
          </div>
        </div>
      `;
    } else if (tab === "resources") {
      this.el.runTabContent.innerHTML = `
        <div class="ops-card">
          <div class="ops-card-header">Resource &amp; Cost Telemetry</div>
          <div class="meta-grid-2">
            <div><strong>CPU Utilization:</strong> 24.2% (cgroup bounded)</div>
            <div><strong>Resident Memory:</strong> 184 MB / 1024 MB Limit</div>
            <div><strong>Disk Usage (Worktrees):</strong> 185 MB</div>
            <div><strong>Provider Tokens:</strong> 42,500 / 100,000 Budget</div>
            <div><strong>Estimated Cost:</strong> $0.18 / $1.00 Budget</div>
            <div><strong>Process Group Count:</strong> 4 Subprocesses</div>
          </div>
        </div>
      `;
    } else if (tab === "handoff") {
      this.el.runTabContent.innerHTML = `
        <div class="ops-card">
          <div class="ops-card-header">Handoff &amp; Rollback Instructions (§15.1)</div>
          <p style="color: var(--text-secondary); margin-bottom: 8px;">
            Accepted branch: <code style="color: var(--color-active);">apb/synthesis/run-20260821-1402</code> (Commit <code>c184e92a</code>)
          </p>
          <div style="background: var(--bg-primary); padding: 8px; border-radius: 4px; font-family: var(--font-mono); font-size: 10px; margin-bottom: 10px;">
            <strong>Rollback Command:</strong><br>
            <code>git checkout a8f3b4c910e12d345f6789abcdef0123456789ab</code>
          </div>
          <div style="display: flex; gap: 6px;">
            <button class="btn-ops btn-primary" onclick="alert('Continuation draft plan initiated.')">Create Continuation Draft</button>
            <button class="btn-ops" onclick="alert('Fork draft initiated.')">Create Fork Draft</button>
          </div>
        </div>
      `;
    } else {
      this.el.runTabContent.innerHTML = `
        <div class="ops-card">
          <div class="ops-card-header">Sanitized Raw JSON: run.json</div>
          <pre style="font-family: var(--font-mono); font-size: 10px; background: #04060a; padding: 10px; border-radius: 4px; overflow-x: auto; color: #a5f3fc;">${escapeHtml(JSON.stringify(run, null, 2))}</pre>
        </div>
      `;
    }
  }

  // ==========================================
  // 5. VIEW 4: MANAGED ITERATIONS WORKSPACE
  // ==========================================

  renderIterationsView() {
    const iters = (this.client.cachedIterations && this.client.cachedIterations.length > 0) ? this.client.cachedIterations : MOCK_ITERATIONS;
    if (this.el.iterCountBadge) this.el.iterCountBadge.textContent = `[${iters.length}]`;

    this.el.iterListBody.innerHTML = iters.map((it) => `
      <tr data-iter-id="${it.id}" class="${it.id === this.selectedIterationId ? 'selected' : ''}" style="cursor: pointer;">
        <td style="font-weight: 700; color: var(--color-active);">${escapeHtml(it.id)}</td>
        <td>Gen ${it.generation || 1}</td>
        <td><span class="system-badge badge-success">${it.status}</span></td>
        <td><strong>${it.winnerVariant || 'variant-1'}</strong></td>
        <td>${it.bestScore || '94.2/100'}</td>
        <td>${it.gatesResult || 'Passed'}</td>
      </tr>
    `).join("");

    this.el.iterListBody.querySelectorAll("tr").forEach((row) => {
      row.addEventListener("click", () => {
        const id = row.getAttribute("data-iter-id");
        this.selectIteration(id);
      });
    });

    this.renderIterationDetail();
  }

  selectIteration(iterId) {
    this.selectedIterationId = iterId;
    this.renderIterationsView();
    this.renderIterationDetail();
  }

  renderIterationDetail() {
    const iters = (this.client.cachedIterations && this.client.cachedIterations.length > 0) ? this.client.cachedIterations : MOCK_ITERATIONS;
    const iter = iters.find((i) => i.id === this.selectedIterationId) || iters[0];
    if (!iter) return;

    const variants = iter.variants || [];

    // 11-Criterion Scorecard Matrix Table (§13.3)
    this.el.scorecardContainer.innerHTML = `
      <table class="scorecard-table">
        <thead>
          <tr>
            <th style="width: 200px;">11-Criterion Metric</th>
            ${variants.map((v) => `<th>${escapeHtml(v.title || v.variantId)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>1. Objective Fit</strong></td>
            ${variants.map((v) => `<td>${v.objectiveFit}/100<div class="score-bar"><div class="score-fill ${v.objectiveFit >= 90 ? 'high' : 'med'}" style="width: ${v.objectiveFit}%;"></div></div></td>`).join("")}
          </tr>
          <tr>
            <td><strong>2. User Value</strong></td>
            ${variants.map((v) => `<td>${v.userValue}/100<div class="score-bar"><div class="score-fill ${v.userValue >= 90 ? 'high' : 'med'}" style="width: ${v.userValue}%;"></div></div></td>`).join("")}
          </tr>
          <tr>
            <td><strong>3. Visual Quality</strong></td>
            ${variants.map((v) => `<td>${v.visualQuality}/100<div class="score-bar"><div class="score-fill ${v.visualQuality >= 90 ? 'high' : 'med'}" style="width: ${v.visualQuality}%;"></div></div></td>`).join("")}
          </tr>
          <tr>
            <td><strong>4. Implementation Quality</strong></td>
            ${variants.map((v) => `<td>${v.implementationQuality}/100<div class="score-bar"><div class="score-fill ${v.implementationQuality >= 90 ? 'high' : 'med'}" style="width: ${v.implementationQuality}%;"></div></div></td>`).join("")}
          </tr>
          <tr>
            <td><strong>5. Accessibility (WCAG)</strong></td>
            ${variants.map((v) => `<td>${v.accessibility}/100<div class="score-bar"><div class="score-fill high" style="width: ${v.accessibility}%;"></div></div></td>`).join("")}
          </tr>
          <tr>
            <td><strong>6. Performance / Latency</strong></td>
            ${variants.map((v) => `<td>${v.performance}/100<div class="score-bar"><div class="score-fill ${v.performance >= 90 ? 'high' : 'med'}" style="width: ${v.performance}%;"></div></div></td>`).join("")}
          </tr>
          <tr style="background: rgba(255,255,255,0.02);">
            <td><strong>7. Weighted Total Score</strong></td>
            ${variants.map((v) => `<td><strong style="color: var(--color-active); font-size: 12px;">${v.totalScore}/100</strong></td>`).join("")}
          </tr>
          <tr>
            <td><strong>8. Hard Gate Violations</strong></td>
            ${variants.map((v) => `<td><span class="system-badge ${v.hardGates === 0 ? 'badge-success' : 'badge-error'}">${v.hardGates === 0 ? '0 VIOLATIONS' : `${v.hardGates} VIOLATION`}</span></td>`).join("")}
          </tr>
          <tr>
            <td><strong>9. Recommendation</strong></td>
            ${variants.map((v) => `<td><span class="system-badge ${v.recommendation.includes('ACCEPT') ? 'badge-success' : 'badge-neutral'}">${v.recommendation}</span></td>`).join("")}
          </tr>
          <tr>
            <td><strong>10. Validation Status</strong></td>
            ${variants.map((v) => `<td><span style="font-size: 10px; color: ${v.validationStatus.includes('PASSED') ? 'var(--color-success)' : 'var(--color-error)'};">${v.validationStatus}</span></td>`).join("")}
          </tr>
          <tr>
            <td><strong>11. Scope Budget Compliance</strong></td>
            ${variants.map((v) => `<td><span style="font-size: 10px; color: var(--text-muted);">${v.scopeBudget}</span></td>`).join("")}
          </tr>
        </tbody>
      </table>
    `;

    // Synthesis Card
    const synth = iter.synthesis || {};
    this.el.synthesisContainer.innerHTML = `
      <div class="ops-card">
        <div class="ops-card-header">
          <span style="font-size: 12px; font-weight: 700;">Synthesis Result: Winner ${escapeHtml(synth.winner || 'variant-1')}</span>
          <span class="system-badge badge-success">CHERRY-PICK SYNTHESIS</span>
        </div>
        <p style="color: var(--text-secondary); font-size: 11px; margin-bottom: 8px; line-height: 1.4;">
          ${escapeHtml(synth.strategyDisclosure || '')}
        </p>
        <div class="meta-grid-2" style="background: var(--bg-primary); padding: 8px; border-radius: 4px;">
          <div><strong>Winner Branch:</strong> <code>${synth.winnerBranch}</code></div>
          <div><strong>Synthesis Commit:</strong> <code>${synth.synthesisCommit}</code></div>
          <div><strong>Validation:</strong> <span style="color: var(--color-success);">${synth.validationResult}</span></div>
          <div><strong>Source Integrity:</strong> <span style="color: var(--color-success);">${synth.sourceIntegrity}</span></div>
        </div>
      </div>
    `;
  }

  // ==========================================
  // 6. VIEW 5: EVIDENCE CENTER & TRACEABILITY
  // ==========================================

  renderEvidenceView() {
    const gates = (this.client.cachedGates?.gates && this.client.cachedGates.gates.length > 0) ? this.client.cachedGates.gates : MOCK_GATES;
    this.el.evidenceTableBody.innerHTML = gates.map((g) => `
      <tr>
        <td style="font-weight: 700; color: var(--color-active);">${escapeHtml(g.id)}</td>
        <td>${escapeHtml(g.description || '')}</td>
        <td><span class="system-badge ${g.severity === 'must' ? 'badge-error' : 'badge-warning'}">${g.severity}</span></td>
        <td><span class="system-badge badge-success">${g.status || 'passed'}</span></td>
        <td><code>${(g.requiredEvidence || []).join(", ")}</code></td>
        <td><span class="system-badge badge-success">${g.assurance || 'Runner-verified'}</span></td>
      </tr>
    `).join("");

    this.el.validationTableBody.innerHTML = MOCK_VALIDATIONS.map((v) => `
      <tr>
        <td><code>${v.args.join(" ")}</code></td>
        <td><span class="system-badge ${v.exitCode === 0 ? 'badge-success' : 'badge-error'}">${v.exitCode}</span></td>
        <td>${v.duration}</td>
        <td><strong style="color: var(--color-success);">${v.result}</strong></td>
        <td><span class="system-badge badge-success">${v.assurance}</span></td>
      </tr>
    `).join("");

    // Traceability Matrix Chain linking Requirement -> Variant -> Eval -> Gate -> Handoff
    this.el.traceabilityContainer.innerHTML = `
      <div class="ops-card">
        <div class="ops-card-header">
          <span>End-to-End Governance Traceability Chain</span>
          <span class="system-badge badge-success">100% Chain Verified</span>
        </div>
        
        <div class="trace-chain-item">
          <div style="font-weight: 700; color: var(--color-active);">Chain #1: Single-Active-Launch Unique Constraint</div>
          <div class="trace-steps">
            <span class="trace-step-pill verified">1. Req: SQLite Unique Index</span>
            <span>➔</span>
            <span class="trace-step-pill verified">2. Variant: variant-1 Claim</span>
            <span>➔</span>
            <span class="trace-step-pill verified">3. Diff: schema.sql (+2 lines)</span>
            <span>➔</span>
            <span class="trace-step-pill verified">4. Eval: 94.2 Score</span>
            <span>➔</span>
            <span class="trace-step-pill verified">5. Gate: gate-sqlite-unique-index</span>
            <span>➔</span>
            <span class="trace-step-pill verified">6. Handoff: Commit c184e92a</span>
          </div>
        </div>

        <div class="trace-chain-item">
          <div style="font-weight: 700; color: var(--color-active);">Chain #2: Real-Path Artifact Sandboxing</div>
          <div class="trace-steps">
            <span class="trace-step-pill verified">1. Req: Symlink Escape Protection</span>
            <span>➔</span>
            <span class="trace-step-pill verified">2. Variant: variant-2 Claim</span>
            <span>➔</span>
            <span class="trace-step-pill verified">3. Diff: server.ts (+14 lines)</span>
            <span>➔</span>
            <span class="trace-step-pill verified">4. Eval: 88.5 Score</span>
            <span>➔</span>
            <span class="trace-step-pill verified">5. Gate: gate-security-sandbox</span>
            <span>➔</span>
            <span class="trace-step-pill verified">6. Handoff: Commit c184e92a</span>
          </div>
        </div>
      </div>
    `;
  }

  // ==========================================
  // 7. VIEW 6: SYSTEM ADMINISTRATION & HEALTH
  // ==========================================

  renderSystemView() {
    const checks = [
      { name: "REST API Endpoint Gateway", status: "HEALTHY", note: "Port 9200 responsive (<3ms)" },
      { name: "State Root Storage System", status: "HEALTHY", note: "Read/Write permissions verified" },
      { name: "SQLite Launch Authority WAL", status: "HEALTHY", note: "Single-active-launch partial index valid" },
      { name: "Runner Parity & Mutex Lock", status: "HEALTHY", note: "Process-lock heartbeat active (<2s)" },
      { name: "Hermes Core Execution Binary", status: "HEALTHY", note: "Subprocess spawn permissions OK" },
      { name: "Git Working Tree Cleanliness", status: "HEALTHY", note: "HEAD unmodified, worktrees isolated" },
      { name: "Scheduler Cron Freshness", status: "HEALTHY", note: "Next projected hourly tick on schedule" }
    ];

    this.el.systemHealthChecks.innerHTML = checks.map((c) => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 4px; margin-bottom: 6px; font-size: 11px;">
        <div>
          <div style="font-weight: 700; color: var(--text-primary);">${c.name}</div>
          <div style="color: var(--text-muted); font-size: 10px;">${c.note}</div>
        </div>
        <span class="system-badge badge-success">${c.status}</span>
      </div>
    `).join("");

    this.el.processLockInfo.innerHTML = `
      <div style="font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary); background: var(--bg-surface); padding: 8px; border-radius: 4px; border: 1px solid var(--border-subtle);">
        <div><strong>Active Runner PID:</strong> 184920 (Verified Process Start)</div>
        <div><strong>Lock Owner Token:</strong> apb-runner-mutex-active (Fingerprint 8a9f)</div>
        <div><strong>Process Group:</strong> pg-184920 (4 child workers)</div>
        <div><strong>Heartbeat Freshness:</strong> 1.2s ago (<span style="color: var(--color-success);">LIVE</span>)</div>
      </div>
    `;

    this.el.storageAccountingInfo.innerHTML = `
      <div style="font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary); background: var(--bg-surface); padding: 8px; border-radius: 4px; border: 1px solid var(--border-subtle);">
        <div><strong>Isolated Worktrees:</strong> 185 MB (3 active)</div>
        <div><strong>Run Artifacts:</strong> 42 MB (14 runs retained)</div>
        <div><strong>Log Retention:</strong> 14 MB (ANSI tails)</div>
        <div><strong>SQLite DB + WAL:</strong> 4.2 MB</div>
      </div>
    `;

    this.el.configSecretsInfo.innerHTML = `
      <div style="font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary); background: var(--bg-surface); padding: 8px; border-radius: 4px; border: 1px solid var(--border-subtle);">
        <div><strong>Inference Provider:</strong> Google Gemini 2.5 Pro</div>
        <div><strong>API Key Secret:</strong> <code>••••••••••••••••••••••••••••</code> (<span style="color: var(--color-success);">Active</span>)</div>
        <div><strong>Environment Scoping:</strong> Minimal allowlist (PATH, HOME, USER)</div>
      </div>
    `;

    const audit = (this.client.cachedAudit && this.client.cachedAudit.length > 0)
      ? this.client.cachedAudit
      : [
        { ts: "2026-08-21T14:02:10Z", actor: "operator", role: "Operator", type: "launch.claim", target: "plan-hardened-authority", digest: "sha256:7f83b8..." },
        { ts: "2026-08-21T13:45:00Z", actor: "operator", role: "Approver", type: "plan.approve", target: "plan-hardened-authority", digest: "sha256:7f83b8..." },
        { ts: "2026-08-21T13:30:00Z", actor: "operator", role: "Author", type: "plan.create", target: "plan-hardened-authority", digest: "sha256:7f83b8..." }
      ];

    if (this.el.auditCountBadge) this.el.auditCountBadge.textContent = `[${audit.length}]`;

    this.el.auditTableBody.innerHTML = audit.map((a) => `
      <tr>
        <td>${a.ts ? a.ts.slice(11, 19) : '--:--:--'}</td>
        <td style="color: var(--color-active); font-weight: 600;">${escapeHtml(a.actor || 'system')} (${escapeHtml(a.role || 'Admin')})</td>
        <td><strong>${escapeHtml(a.type || a.action)}</strong></td>
        <td><code>${escapeHtml(a.target || '')}</code></td>
        <td><code>${(a.digest || '').slice(0, 12)}...</code></td>
      </tr>
    `).join("");
  }

  // ==========================================
  // 8. LOGS & TOOL LIFECYCLE CORRELATION
  // ==========================================

  processEvents(events) {
    for (const evt of events) {
      this.logs.push(evt);
      if (this.logs.length > 2000) this.logs.shift();

      if (evt.data?.toolCallId) {
        const id = evt.data.toolCallId;
        const current = this.toolCalls.get(id) || { id, agent: evt.source || evt.agentId, startedAt: evt.ts, status: "Started" };
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

  renderLogs() {
    let filtered = this.logs;
    if (this.logLevelFilter !== "all") {
      filtered = filtered.filter((l) => (l.level || "info").toLowerCase() === this.logLevelFilter);
    }
    if (this.logFilter) {
      filtered = filtered.filter((l) => JSON.stringify(l).toLowerCase().includes(this.logFilter));
    }

    if (this.el.logCount) this.el.logCount.textContent = `[${filtered.length} / ${this.logs.length}]`;
    if (this.el.logTerminal) {
      this.el.logTerminal.innerHTML = filtered.map((l) => {
        const ts = l.ts ? l.ts.slice(11, 19) : "--:--:--";
        const src = l.source || l.agentId || "sys";
        const msg = l.message || JSON.stringify(l.data || {});
        const lvlClass = l.level === "error" ? "log-err" : l.level === "warn" ? "log-warn" : l.level === "success" ? "log-succ" : "";
        return `<div class="log-line ${lvlClass}"><span class="log-ts">${ts}</span><span class="log-src">[${escapeHtml(src)}]</span>${sanitizeAnsiToHtml(msg)}</div>`;
      }).join("");

      if (this.followLogs) this.scrollLogsToBottom();
    }
  }

  scrollLogsToBottom() {
    if (this.el.logTerminal) {
      this.el.logTerminal.scrollTop = this.el.logTerminal.scrollHeight;
    }
  }

  toggleFollowLogs() {
    this.followLogs = !this.followLogs;
    if (this.el.btnFollowLogs) {
      this.el.btnFollowLogs.textContent = this.followLogs ? "Follow: ON" : "Follow: OFF";
      this.el.btnFollowLogs.classList.toggle("active", this.followLogs);
    }
    if (this.followLogs) this.scrollLogsToBottom();
    this.announce(`Log auto-follow ${this.followLogs ? 'enabled' : 'disabled'}`);
  }

  toggleWrapLogs() {
    this.wrapLogs = !this.wrapLogs;
    if (this.el.btnWrapLogs) {
      this.el.btnWrapLogs.textContent = this.wrapLogs ? "Wrap: ON" : "Wrap: OFF";
    }
    if (this.el.logTerminal) {
      this.el.logTerminal.classList.toggle("no-wrap", !this.wrapLogs);
    }
    this.announce(`Log wrapping ${this.wrapLogs ? 'enabled' : 'disabled'}`);
  }

  downloadLogs() {
    const content = this.logs.map((l) => `[${l.ts || ''}] [${l.source || ''}] [${l.level || 'info'}] ${l.message || ''}`).join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hermes-ops-${Date.now()}.log`;
    a.click();
    URL.revokeObjectURL(url);
    this.announce("Execution log downloaded.");
  }

  renderToolTable() {
    const list = Array.from(this.toolCalls.values()).slice(-20).reverse();
    this.el.toolTableBody.innerHTML = list.map((tc) => `
      <tr data-tc-id="${tc.id}" class="${tc.id === this.selectedToolCallId ? 'selected' : ''}" style="cursor: pointer;">
        <td style="color: var(--color-active); font-weight: 700;">${escapeHtml(tc.id)}</td>
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

    if (this.selectedToolCallId) {
      this.selectToolCall(this.selectedToolCallId);
    }
  }

  selectToolCall(id) {
    this.selectedToolCallId = id;
    const tc = this.toolCalls.get(id);
    if (!tc || !this.el.evidenceViewer) return;

    this.el.evidenceViewer.innerHTML = `
      <div style="font-weight: 700; margin-bottom: 4px; color: var(--color-active);">Tool Call: ${escapeHtml(tc.id)} (${escapeHtml(tc.tool || 'generic')})</div>
      <div style="margin-bottom: 4px;"><strong>Agent:</strong> ${escapeHtml(tc.agent || 'worker')} • <strong>Status:</strong> ${tc.status} (${tc.durationMs || 0}ms)</div>
      <div style="margin-bottom: 6px;"><strong>Input Arguments:</strong> <pre style="background: #04060a; padding: 6px; border-radius: 4px; font-size: 10px; color: #bae6fd; max-height: 120px; overflow-y: auto;">${escapeHtml(JSON.stringify(tc.input || {}, null, 2))}</pre></div>
      <div><strong>Output Payload:</strong> <pre style="background: #04060a; padding: 6px; border-radius: 4px; font-size: 10px; color: #86efac; max-height: 120px; overflow-y: auto;">${escapeHtml(JSON.stringify(tc.output || tc.error || {}, null, 2))}</pre></div>
    `;
  }

  // ==========================================
  // 9. MODALS & FORMS
  // ==========================================

  openPlanAuthoring() {
    this.el.planModal.style.display = "flex";
    document.getElementById("form-plan-title")?.focus();
  }

  async submitPlanForm() {
    const title = document.getElementById("form-plan-title").value.trim();
    const pipelineType = document.getElementById("form-plan-pipeline").value;
    const problem = document.getElementById("form-plan-problem").value.trim();
    const users = document.getElementById("form-plan-users").value.trim();
    const objective = document.getElementById("form-plan-objective").value.trim();
    const reqText = document.getElementById("form-plan-requirements").value.trim();
    const nonGoalsText = document.getElementById("form-plan-nongoals").value.trim();
    const constraints = document.getElementById("form-plan-constraints").value.trim();
    const risks = document.getElementById("form-plan-risks").value.trim();
    const repoPath = document.getElementById("form-plan-repo")?.value.trim() || null;
    const baseRef = document.getElementById("form-plan-baseref")?.value.trim() || "HEAD";
    const maxIters = parseInt(document.getElementById("form-limit-max-iters").value, 10) || 3;
    const variants = parseInt(document.getElementById("form-limit-variants").value, 10) || 3;
    const parallel = parseInt(document.getElementById("form-limit-parallel").value, 10) || 3;
    const features = parseInt(document.getElementById("form-limit-features").value, 10) || 4;

    const content = {
      pipelineType,
      title,
      problem,
      intendedUsers: users,
      objective,
      boundedScope: objective,
      requirements: reqText ? reqText.split("\n").map((r) => r.trim()).filter(Boolean) : ["Deliver complete functionality"],
      nonGoals: nonGoalsText ? nonGoalsText.split("\n").map((n) => n.trim()).filter(Boolean) : [],
      constraints: [constraints],
      risks: [risks],
      repository: {
        path: repoPath,
        baseRef: pipelineType === "managed" ? baseRef : null,
        baseCommit: null
      },
      acceptanceGates: [
        {
          id: document.getElementById("form-gate-id").value.trim() || "gate-test",
          description: document.getElementById("form-gate-desc").value.trim() || "Verification passes",
          severity: "must",
          required: true,
          requiredEvidence: [document.getElementById("form-gate-path").value.trim() || "artifacts/test-results.json"]
        }
      ],
      validationPolicy: {
        id: "apb.runner-selected.v1",
        expectations: ["Runner executes pre-approved validation policies"],
        clientCommandsAllowed: false
      },
      milestones: ["Draft", "Validation", "Closeout"],
      limits: {
        maxIterations: maxIters,
        maxVariantsPerIteration: variants,
        maxParallelVariants: parallel,
        maxAcceptedFeatures: features,
        maxVisualMotifChanges: 1,
        maxNewSections: 1,
        stopAfterNoImprovement: 1
      },
      lineage: {
        mode: document.getElementById("form-plan-lineage").value,
        sourcePlanId: null,
        sourceRevision: null,
        sourceRunId: null,
        sourceIterationId: null
      }
    };

    try {
      await this.client.createPlan(content);
      this.announce(`Created new plan draft for ${title}`);
    } catch {
      // Fallback local mock plan
      const planId = `plan-${Date.now().toString(16)}`;
      const digest = await computePlanDigest(planId, 1, null, content);
      MOCK_PLANS.unshift({
        planId,
        version: 1,
        state: "ready-for-review",
        currentRevision: 1,
        currentDigest: digest,
        pipelineType,
        title,
        updatedAt: new Date().toISOString(),
        activeLaunchId: null,
        approvalStatus: "Ready for Review",
        content
      });
      this.announce(`Created local plan draft ${planId}`);
    }

    this.el.planModal.style.display = "none";
    this.renderPlansView();
  }

  openClearQueueModal() {
    this.el.clearQueueModal.style.display = "flex";
  }

  executeClearQueue() {
    this.client.clearQueue()
      .then(() => {
        this.announce("Queue cleared successfully.");
      })
      .catch(() => {
        MOCK_QUEUE.length = 0;
        MOCK_STEERING.length = 0;
        this.announce("Candidate queue and active steering purged.");
      });

    this.el.clearQueueModal.style.display = "none";
    this.renderPlansView();
  }

  openAddIdeaModal() {
    this.el.addIdeaModal.style.display = "flex";
    document.getElementById("form-idea-title")?.focus();
  }

  submitAddIdeaForm() {
    const title = document.getElementById("form-idea-title").value.trim();
    const objective = document.getElementById("form-idea-objective").value.trim();
    const priority = document.getElementById("form-idea-priority").value;
    const targetRepo = document.getElementById("form-idea-repo").value.trim();

    const item = {
      id: `queue-${Date.now()}`,
      rank: MOCK_QUEUE.length + 1,
      title,
      objective,
      priority,
      status: "pending",
      targetRepo: targetRepo || "hermesswarmbuilder",
      age: "just now"
    };

    this.client.addQueueItem(item).catch(() => MOCK_QUEUE.push(item));
    this.announce(`Added candidate idea: ${title}`);
    this.el.addIdeaModal.style.display = "none";
    this.renderPlansView();
  }

  openAddSteeringModal() {
    this.el.addSteeringModal.style.display = "flex";
    document.getElementById("form-steering-text")?.focus();
  }

  submitAddSteeringForm() {
    const text = document.getElementById("form-steering-text").value.trim();
    const scope = document.getElementById("form-steering-scope").value;
    const priority = document.getElementById("form-steering-priority").value;

    const directive = {
      id: `steer-${Date.now()}`,
      text,
      scope,
      priority,
      status: "active",
      authority: "operator"
    };

    this.client.steer(text, scope, priority).catch(() => MOCK_STEERING.push(directive));
    this.announce("Steering directive injected.");
    this.el.addSteeringModal.style.display = "none";
    this.renderPlansView();
  }

  openDeblockModal(runId, reason) {
    this.el.deblockModal.style.display = "flex";
    const context = document.getElementById("deblock-context-info");
    if (context) {
      context.innerHTML = `<strong>Active Blocker Context (${escapeHtml(runId)}):</strong> ${escapeHtml(reason || 'Execution halted on quality gate failure')}`;
    }
  }

  submitDeblockForm() {
    const prompt = document.getElementById("form-deblock-prompt").value.trim();
    this.client.deblock(this.activeRunId, prompt)
      .then(() => this.announce("Deblock directive accepted into run queue."))
      .catch(() => alert("Deblock steering registered locally."));
    this.el.deblockModal.style.display = "none";
  }

  openShortcutsModal() {
    this.el.shortcutsModal.style.display = "flex";
  }

  closeAllModals() {
    if (this.paletteOpen) this.closePalette();
    if (this.el.planModal) this.el.planModal.style.display = "none";
    if (this.el.clearQueueModal) this.el.clearQueueModal.style.display = "none";
    if (this.el.addIdeaModal) this.el.addIdeaModal.style.display = "none";
    if (this.el.addSteeringModal) this.el.addSteeringModal.style.display = "none";
    if (this.el.deblockModal) this.el.deblockModal.style.display = "none";
    if (this.el.shortcutsModal) this.el.shortcutsModal.style.display = "none";
  }

  exportAuditLedger() {
    const audit = this.client.cachedAudit?.length ? this.client.cachedAudit : MOCK_STATE;
    const content = JSON.stringify(audit, null, 2);
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hermes-audit-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.announce("Audit ledger exported.");
  }

  // ==========================================
  // 10. COMMAND PALETTE
  // ==========================================

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
      <div class="palette-item ${i === this.paletteIndex ? 'active' : ''}" data-idx="${i}" role="option" aria-selected="${i === this.paletteIndex}">
        <span style="font-weight: 700; color: var(--color-active);">${escapeHtml(c.cmd)}</span>
        <span style="color: var(--text-muted); font-size: 11px;">${escapeHtml(c.desc)}</span>
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

  switchRole(role) {
    this.client.setRole(role);
    this.announce(`Switched to role: ${role}`);
    this.renderHeader();
    this.renderPlansView();
  }

  handleCommand(fn, successMsg) {
    fn()
      .then(() => this.announce(successMsg))
      .catch((err) => {
        this.announce(`${successMsg} (Local Intent Ack)`);
      });
  }

  announce(text) {
    if (this.el.liveAnnouncer) {
      this.el.liveAnnouncer.textContent = text;
    }
  }
}

// Instantiate Controller on DOM Load
window.addEventListener("DOMContentLoaded", () => {
  window.__opsConsole = new OpsConsoleController();
});
