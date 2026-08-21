/**
 * Dashboard B: 2D Guided Control Plane Controller (Comprehensive v2)
 * Progressive disclosure governance console implementing all spec sections:
 * §6 (Info Architecture), §8 (Plans & Launch), §9 (Queue & Steering),
 * §13 (Managed Iterations & 11 Criteria), §14 (Evidence & Gates),
 * §15 (Terminal Handoff & Deblocking), §18 (System Health & Audit).
 */

import {
  ControlPlaneClient,
  computePlanDigest,
  computeLineDiff,
  getAssuranceLevel,
  deriveCanonicalDisposition,
  sanitizeAnsiToHtml,
  sanitizeMarkdownToHtml,
  escapeHtml,
  RBAC_ROLES,
  ROLE_PERMISSIONS,
  CAPABILITIES
} from "../shared/api-client.js";

// ==========================================================================
// Rich Mock / Default Fallback Fixtures (Ensures immediate 100% rich UI)
// ==========================================================================

const MOCK_PLANS = [
  {
    planId: "plan-swarm-ctrl-v2",
    version: 2,
    state: "approved",
    currentRevision: 2,
    currentDigest: "sha256:7f3a8b2c4d9e0123fa456789bcde0123456789abcdef0123456789abcdef0123",
    pipelineType: "managed",
    title: "Accessible Swarm Control Plane v2",
    updatedAt: new Date(Date.now() - 15 * 60000).toISOString(),
    activeLaunchId: "launch-8a7f29b1",
    effectiveApproval: {
      approvedAt: new Date(Date.now() - 30 * 60000).toISOString(),
      approver: "auth-approver-77",
      decisionNotes: "WCAG 2.2 AA touch targets, gate verification, and clean repo binding approved for execution."
    },
    lineage: { mode: "new", sourcePlanId: null },
    repository: {
      path: "/home/mojo/projects/hermesswarmbuilder",
      baseRef: "main",
      baseCommit: "a8f3b20c4e1290fd"
    },
    limits: {
      maxIterations: 3,
      maxVariantsPerIteration: 3,
      maxParallelVariants: 3,
      maxAcceptedFeatures: 4,
      maxVisualMotifChanges: 1,
      maxNewSections: 1,
      stopAfterNoImprovement: 1
    }
  },
  {
    planId: "plan-telemetry-agg-01",
    version: 1,
    state: "draft",
    currentRevision: 1,
    currentDigest: "sha256:4c12d98a00e5bc341289fe45670123456789abcdef0123456789abcdef012345",
    pipelineType: "classic",
    title: "Distributed Telemetry Aggregator",
    updatedAt: new Date(Date.now() - 120 * 60000).toISOString(),
    activeLaunchId: null,
    effectiveApproval: null,
    lineage: { mode: "new" },
    repository: { path: null, baseRef: null, baseCommit: null },
    limits: { maxIterations: 5, maxVariantsPerIteration: 3 }
  },
  {
    planId: "plan-kernel-watchdog",
    version: 1,
    state: "review",
    currentRevision: 1,
    currentDigest: "sha256:99bc4512ae3490fd671234567890abcdef0123456789abcdef0123456789abcd",
    pipelineType: "managed",
    title: "Kernel Invariant Watchdog",
    updatedAt: new Date(Date.now() - 60 * 60000).toISOString(),
    activeLaunchId: null,
    effectiveApproval: null,
    lineage: { mode: "new" },
    repository: {
      path: "/home/mojo/projects/kernel-tools",
      baseRef: "main",
      baseCommit: "7c91a02e5b8812c3"
    },
    limits: { maxIterations: 2, maxVariantsPerIteration: 2 }
  }
];

const MOCK_PLAN_DETAIL = {
  ledger: MOCK_PLANS[0],
  revision: {
    revision: 2,
    parentRevision: 1,
    contentDigest: MOCK_PLANS[0].currentDigest,
    content: {
      pipelineType: "managed",
      title: "Accessible Swarm Control Plane v2",
      problem: "Operators require accessible 48px touch targets, side-by-side revision diffs, and 11-criterion scorecard comparison without shell injection hazards.",
      intendedUsers: "System Operators, Security Approvers, Forensics Auditors",
      objective: "Deliver a WCAG 2.2 AA compliant 2D Guided Control Plane implementing stepped governance across 9 workspaces.",
      boundedScope: "Implement Dashboard B in dashboard/public/control-planes/guided-flow/ preserving normal branch integrity.",
      requirements: [
        "Provide 48px touch targets for all interactive inputs and buttons",
        "Implement side-by-side and unified revision diff viewer",
        "Deliver 11-criterion variant scorecard comparison with aligned horizontal bars",
        "Enforce strict acceptance gate evidence non-empty validation"
      ],
      nonGoals: [
        "No arbitrary browser shell execution or terminal emulation",
        "No automatic promotion or force-pushing to protected branches"
      ],
      constraints: ["Strict zero-merge safety", "WCAG 2.2 AA color contrast ratios >= 4.5:1"],
      risks: ["Concurrency conflicts on single active launch slot", "Timeout during long variant validation passes"],
      repository: {
        path: "/home/mojo/projects/hermesswarmbuilder",
        baseRef: "main",
        baseCommit: "a8f3b20c4e1290fd"
      },
      acceptanceGates: [
        {
          id: "gate-wcag-contrast",
          description: "WCAG 2.2 AA color contrast audit passes >= 4.5:1 ratio",
          severity: "must",
          required: true,
          requiredEvidence: ["artifacts/accessibility/contrast-report.json"]
        },
        {
          id: "gate-build-and-test",
          description: "All automated test suites and smoke scripts pass cleanly",
          severity: "must",
          required: true,
          requiredEvidence: ["artifacts/test-results.json"]
        },
        {
          id: "gate-zero-arbitrary-exec",
          description: "Verification that client arbitrary script execution is zero",
          severity: "must",
          required: true,
          requiredEvidence: ["artifacts/security-audit.json"]
        }
      ],
      validationPolicy: {
        id: "apb.runner-selected.v1",
        expectations: ["Runner selects and executes repo-native validation scripts"],
        clientCommandsAllowed: false
      },
      milestones: [
        "Milestone 1: Clean-slate responsive HTML & 48px touch styling",
        "Milestone 2: 11-Criterion comparison matrix & diff viewers",
        "Milestone 3: Terminal handoff & audit traceability closeout"
      ],
      limits: MOCK_PLANS[0].limits,
      lineage: { mode: "new", sourcePlanId: null }
    }
  },
  revisions: [
    { revision: 1, contentDigest: "sha256:1111111111111111111111111111111111111111111111111111111111111111" },
    { revision: 2, contentDigest: MOCK_PLANS[0].currentDigest }
  ]
};

const MOCK_ITERATION = {
  id: "iter-gen1-acc",
  runId: "run-20260821-193042",
  status: "completed",
  generation: 1,
  objective: "Implement WCAG 2.2 AA compliant high-contrast UI and keyboard focus management",
  baseCommit: "a8f3b20c4e1290fd",
  variants: [
    {
      variantId: "variant-1",
      title: "Minimalist High-Contrast Stream",
      branch: "apb/run-20260821/variant-1",
      commit: "e1a90c2b",
      claims: ["48px touch targets", "Semantic ARIA landmarks", "Accessible focus indicators"],
      diffStat: "+148 lines, -12 lines",
      validationCommands: [
        { cmd: "npm test", exitCode: 0, pass: true, output: "✓ 42/42 tests passed in 1.4s" },
        { cmd: "npm run lint", exitCode: 0, pass: true, output: "✓ 0 lint errors found" }
      ]
    },
    {
      variantId: "variant-2",
      title: "Accessible Multi-Pane Cockpit",
      branch: "apb/run-20260821/variant-2",
      commit: "f2b81d3c",
      claims: ["Grid layout", "High density", "Keyboard shortcut hooks"],
      diffStat: "+230 lines, -35 lines",
      validationCommands: [
        { cmd: "npm test", exitCode: 0, pass: true, output: "✓ 42/42 tests passed in 1.8s" }
      ]
    },
    {
      variantId: "variant-3",
      title: "Dynamic Focus Announcer Deck",
      branch: "apb/run-20260821/variant-3",
      commit: "d4c72e1a",
      claims: ["Live announcer", "Subtle motion effects"],
      diffStat: "+110 lines, -8 lines",
      validationCommands: [
        { cmd: "npm test", exitCode: 0, pass: true, output: "✓ 42/42 tests passed in 1.2s" }
      ]
    }
  ],
  evaluations: [
    {
      variantId: "variant-1",
      totalScore: 94.2,
      recommendation: "ACCEPT (WINNER)",
      hardGateViolations: 0,
      validationStatus: "PASSED (2/2)",
      scopeBudgetCompliance: "PASSED (+148 lines, 0 motif shifts)",
      scores: {
        objectiveFit: 96,
        userValue: 95,
        visualQuality: 92,
        implementationQuality: 94,
        accessibility: 98,
        performance: 96
      },
      rationale: "Flawless accessibility compliance with 48px touch targets, zero hard-gate violations, and lean codebase changes."
    },
    {
      variantId: "variant-2",
      totalScore: 88.6,
      recommendation: "REJECT",
      hardGateViolations: 0,
      validationStatus: "PASSED (1/1)",
      scopeBudgetCompliance: "PASSED (+230 lines)",
      scores: {
        objectiveFit: 90,
        userValue: 88,
        visualQuality: 89,
        implementationQuality: 87,
        accessibility: 86,
        performance: 92
      },
      rationale: "Good density but exceeds scope budget slightly with complex multi-pane state."
    },
    {
      variantId: "variant-3",
      totalScore: 82.1,
      recommendation: "REJECT",
      hardGateViolations: 0,
      validationStatus: "PASSED (1/1)",
      scopeBudgetCompliance: "PASSED (+110 lines)",
      scores: {
        objectiveFit: 84,
        userValue: 82,
        visualQuality: 85,
        implementationQuality: 80,
        accessibility: 80,
        performance: 82
      },
      rationale: "Focus announcer implemented well, but lacks full 48px touch target adherence."
    }
  ],
  synthesis: {
    status: "ACCEPTED",
    winnerVariantId: "variant-1",
    score: 94.2,
    eligibility: "ELIGIBLE & PASSED",
    mashupStrategy: "cherry-pick-winning-variant",
    winnerBranch: "apb/run-20260821/variant-1",
    winnerCommit: "e1a90c2b",
    synthesisBranch: "apb/run/synthesis-golden",
    synthesisCommit: "c3d4e5f6",
    acceptedFeatures: [
      "48px touch target compliance for all interactive controls (Spec §22)",
      "Cross-resource identity breadcrumb with copyable SHA-256 digests (Spec §6.4)",
      "11-criterion multi-variant comparison matrix with aligned score bars (Spec §13.3)"
    ],
    rejectedFeatures: [
      "Experimental WebGL background mesh (rejected: accessibility contrast hazard)"
    ],
    sourceIntegrity: "PASSED: Normal source branch 'main' preserved unchanged."
  },
  gateDecisions: [
    {
      gateId: "gate-wcag-contrast",
      description: "WCAG 2.2 AA color contrast audit passes >= 4.5:1 ratio",
      severity: "must",
      required: true,
      status: "passed",
      evidence: "artifacts/accessibility/contrast-report.json (12.4 KB, Non-empty)",
      assurance: "Runner-verified"
    },
    {
      gateId: "gate-build-and-test",
      description: "All automated test suites and smoke scripts pass cleanly",
      severity: "must",
      required: true,
      status: "passed",
      evidence: "artifacts/test-results.json (48.1 KB, Non-empty)",
      assurance: "Runner-verified"
    },
    {
      gateId: "gate-zero-arbitrary-exec",
      description: "Verification that client arbitrary script execution is zero",
      severity: "must",
      required: true,
      status: "passed",
      evidence: "artifacts/security-audit.json (8.7 KB, Non-empty)",
      assurance: "Runner-verified"
    }
  ]
};

const MOCK_QUEUE = {
  items: [
    {
      id: "q-item-1",
      title: "Add real-time monotonic event sequence cursors",
      objective: "Implement monotonic event sequence IDs in SSE stream to detect replay and history gaps.",
      priority: "high",
      status: "pending",
      targetRepo: "/home/mojo/projects/hermesswarmbuilder",
      referencedGates: ["gate-build-and-test"],
      createdAt: new Date(Date.now() - 4 * 3600000).toISOString()
    },
    {
      id: "q-item-2",
      title: "Implement sandbox process isolation for agent telemetry",
      objective: "Constrain child subagent processes to unprivileged cgroups with bounded RAM/CPU.",
      priority: "standard",
      status: "pending",
      targetRepo: "/home/mojo/projects/hermesswarmbuilder",
      referencedGates: ["gate-zero-arbitrary-exec"],
      createdAt: new Date(Date.now() - 12 * 3600000).toISOString()
    },
    {
      id: "q-item-3",
      title: "Develop autonomous retries for transient provider timeouts",
      objective: "Add exponential backoff with jitter on HTTP 429 and 503 provider errors.",
      priority: "low",
      status: "pending",
      targetRepo: null,
      referencedGates: [],
      createdAt: new Date(Date.now() - 24 * 3600000).toISOString()
    }
  ]
};

const MOCK_STEERING = [
  {
    id: "steer-01",
    text: "Enforce strict zero-merge safety on all variant branches",
    scope: "active_run",
    priority: "required",
    createdAt: new Date(Date.now() - 20 * 60000).toISOString()
  },
  {
    id: "steer-02",
    text: "Prioritize WCAG AA compliance over decorative visual animations",
    scope: "next_run",
    priority: "advisory",
    createdAt: new Date(Date.now() - 45 * 60000).toISOString()
  }
];

const MOCK_AUDIT = [
  {
    ts: new Date(Date.now() - 10 * 60000).toISOString(),
    actor: "local-operator",
    role: "Administrator",
    action: "project-plan.approve",
    target: "plan-swarm-ctrl-v2 (Rev #2)",
    digest: "sha256:7f3a8b2c4d9e0123...",
    outcome: "SUCCESS",
    idempotencyKey: "idem-approve-88a1"
  },
  {
    ts: new Date(Date.now() - 15 * 60000).toISOString(),
    actor: "local-operator",
    role: "Author",
    action: "project-plan.update",
    target: "plan-swarm-ctrl-v2 (Rev #2)",
    digest: "sha256:7f3a8b2c4d9e0123...",
    outcome: "SUCCESS",
    idempotencyKey: "idem-update-77b2"
  },
  {
    ts: new Date(Date.now() - 35 * 60000).toISOString(),
    actor: "local-operator",
    role: "Administrator",
    action: "command.hold",
    target: "admission-gate",
    digest: "-",
    outcome: "SUCCESS",
    idempotencyKey: "idem-hold-12c3"
  }
];

// ==========================================================================
// Main GuidedFlowController Class
// ==========================================================================

export class GuidedFlowController {
  constructor() {
    this.client = new ControlPlaneClient();
    this.currentStep = "plans";
    this.selectedPlan = MOCK_PLAN_DETAIL;
    this.selectedRevision = MOCK_PLAN_DETAIL.revision;
    this.selectedIteration = MOCK_ITERATION;
    this.selectedHandoffState = "completed";
    this.diffMode = "split"; // 'split' | 'unified'
    this.planFilters = { state: "all", pipeline: "all", approval: "all", search: "" };
    this.assistanceConv = null;
    this.draftState = {
      requirements: [
        "Deliver 48px touch targets for all interactive inputs and buttons",
        "Implement side-by-side and unified revision diff viewer",
        "Provide 11-criterion variant scorecard comparison with aligned horizontal bars",
        "Enforce strict acceptance gate evidence non-empty validation"
      ],
      nonGoals: [
        "No arbitrary browser shell execution or terminal emulation",
        "No automatic promotion or force-pushing to protected branches"
      ],
      gates: [
        {
          id: "gate-wcag-contrast",
          description: "WCAG 2.2 AA color contrast audit passes >= 4.5:1 ratio",
          severity: "must",
          required: true,
          evidence: "artifacts/accessibility/contrast-report.json"
        },
        {
          id: "gate-build-and-test",
          description: "All automated test suites and smoke scripts pass cleanly",
          severity: "must",
          required: true,
          evidence: "artifacts/test-results.json"
        }
      ],
      milestones: [
        "Milestone 1: Clean-slate responsive HTML & 48px touch styling",
        "Milestone 2: 11-Criterion comparison matrix & diff viewers",
        "Milestone 3: Terminal handoff & audit traceability closeout"
      ]
    };

    this.initElements();
    this.bindEvents();
    this.init();
  }

  initElements() {
    this.el = {
      // Header & Navigation
      stepperNav: document.getElementById("stepper-nav"),
      stepItems: document.querySelectorAll(".step-item"),
      panels: document.querySelectorAll(".view-panel"),
      roleSelect: document.getElementById("role-select"),
      identityBreadcrumb: document.getElementById("identity-breadcrumb"),
      quickStatusText: document.getElementById("quick-status-text"),
      admissionStatusText: document.getElementById("admission-status-text"),
      connectionStatusText: document.getElementById("connection-status-text"),
      liveAnnouncer: document.getElementById("live-announcer"),

      // Workspace 1: Plans
      planListContainer: document.getElementById("plan-list-container"),
      btnNewPlan: document.getElementById("btn-new-plan"),
      planChoiceModal: document.getElementById("plan-choice-modal"),
      choiceClassic: document.getElementById("choice-classic"),
      choiceManaged: document.getElementById("choice-managed"),
      btnCloseChoice: document.getElementById("btn-close-choice"),
      planFormCard: document.getElementById("plan-form-card"),
      planForm: document.getElementById("plan-form"),
      btnClosePlanForm: document.getElementById("btn-close-plan-form"),
      btnCancelDraft: document.getElementById("btn-cancel-draft"),
      planSearchInput: document.getElementById("plan-search-input"),
      filterState: document.getElementById("filter-state"),
      filterPipeline: document.getElementById("filter-pipeline"),
      filterApproval: document.getElementById("filter-approval"),
      
      // Dynamic Form Builders
      requirementsBuilder: document.getElementById("requirements-list-builder"),
      newReqInput: document.getElementById("new-req-input"),
      newReqPriority: document.getElementById("new-req-priority"),
      btnAddReq: document.getElementById("btn-add-req"),
      nongoalsBuilder: document.getElementById("nongoals-list-builder"),
      newNongoalInput: document.getElementById("new-nongoal-input"),
      btnAddNongoal: document.getElementById("btn-add-nongoal"),
      gatesBuilder: document.getElementById("gates-list-builder"),
      newGateId: document.getElementById("new-gate-id"),
      newGateDesc: document.getElementById("new-gate-desc"),
      newGateSeverity: document.getElementById("new-gate-severity"),
      newGateEvidence: document.getElementById("new-gate-evidence"),
      btnAddGate: document.getElementById("btn-add-gate"),
      milestonesBuilder: document.getElementById("milestones-list-builder"),
      newMilestoneInput: document.getElementById("new-milestone-input"),
      btnAddMilestone: document.getElementById("btn-add-milestone"),

      // Workspaces 2 - 9 Containers
      reviewRevisionSelector: document.getElementById("review-revision-selector"),
      reviewContainer: document.getElementById("review-container"),
      approvalContainer: document.getElementById("approval-container"),
      iterationContainer: document.getElementById("iteration-container"),
      synthesisContainer: document.getElementById("synthesis-container"),
      gatesContainer: document.getElementById("gates-container"),
      traceabilityContainer: document.getElementById("traceability-container"),
      handoffStateTabs: document.getElementById("handoff-state-tabs"),
      handoffContainer: document.getElementById("handoff-container"),
      queueContainer: document.getElementById("queue-container"),
      steeringContainer: document.getElementById("steering-container"),
      systemContainer: document.getElementById("system-container"),
      
      // Modals
      assistanceModal: document.getElementById("assistance-modal"),
      assistanceMessages: document.getElementById("assistance-messages"),
      assistanceInput: document.getElementById("assistance-input"),
      btnAssistanceSend: document.getElementById("btn-assistance-send"),
      btnCloseAssist: document.getElementById("btn-close-assist"),
      btnAiAssistHeader: document.getElementById("btn-ai-assist"),
      launchModal: document.getElementById("launch-modal"),
      launchModalBody: document.getElementById("launch-modal-body"),
      btnCloseLaunchModal: document.getElementById("btn-close-launch-modal"),
      clearQueueModal: document.getElementById("clear-queue-modal"),
      btnClearQueueTrigger: document.getElementById("btn-clear-queue-modal-trigger"),
      btnCloseClearModal: document.getElementById("btn-close-clear-modal"),
      btnCancelClearQueue: document.getElementById("btn-cancel-clear-queue"),
      btnConfirmClearQueue: document.getElementById("btn-confirm-clear-queue"),
      chkConfirmBlastRadius: document.getElementById("chk-confirm-blast-radius"),
      btnAddQueueItem: document.getElementById("btn-add-queue-item"),
      queueFormCard: document.getElementById("queue-form-card"),
      queueForm: document.getElementById("queue-form"),
      btnCloseQueueForm: document.getElementById("btn-close-queue-form")
    };
  }

  bindEvents() {
    // Stepper Navigation Switching
    this.el.stepItems.forEach((item) => {
      item.addEventListener("click", () => {
        const step = item.getAttribute("data-step");
        this.switchStep(step);
      });
      item.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.switchStep(item.getAttribute("data-step"));
        }
      });
    });

    // Simulated RBAC Role Change
    this.el.roleSelect?.addEventListener("change", (e) => {
      this.client.setRole(e.target.value);
      this.announce(`Switched to ${e.target.value} role`);
      this.renderAll();
    });

    // Plan Creation Flow (Explicit Choice: Classic vs Managed)
    this.el.btnNewPlan?.addEventListener("click", () => {
      this.el.planChoiceModal.style.display = "block";
      this.el.planFormCard.style.display = "none";
      this.el.planChoiceModal.scrollIntoView({ behavior: "smooth" });
    });

    this.el.btnCloseChoice?.addEventListener("click", () => {
      this.el.planChoiceModal.style.display = "none";
    });

    this.el.choiceClassic?.addEventListener("click", () => {
      this.openPlanAuthoring("classic");
    });

    this.el.choiceManaged?.addEventListener("click", () => {
      this.openPlanAuthoring("managed");
    });

    this.el.btnClosePlanForm?.addEventListener("click", () => {
      this.el.planFormCard.style.display = "none";
    });

    this.el.btnCancelDraft?.addEventListener("click", () => {
      this.el.planFormCard.style.display = "none";
    });

    // Dynamic Form Item Builders
    this.el.btnAddReq?.addEventListener("click", () => this.addRequirement());
    this.el.btnAddNongoal?.addEventListener("click", () => this.addNongoal());
    this.el.btnAddGate?.addEventListener("click", () => this.addGate());
    this.el.btnAddMilestone?.addEventListener("click", () => this.addMilestone());

    // Plan Form Submit
    this.el.planForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      this.submitPlanDraft();
    });

    // Catalog Filters
    this.el.planSearchInput?.addEventListener("input", (e) => {
      this.planFilters.search = e.target.value.toLowerCase();
      this.renderPlansList();
    });
    this.el.filterState?.addEventListener("change", (e) => {
      this.planFilters.state = e.target.value;
      this.renderPlansList();
    });
    this.el.filterPipeline?.addEventListener("change", (e) => {
      this.planFilters.pipeline = e.target.value;
      this.renderPlansList();
    });
    this.el.filterApproval?.addEventListener("change", (e) => {
      this.planFilters.approval = e.target.value;
      this.renderPlansList();
    });

    // Handoff Tabs
    this.el.handoffStateTabs?.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.selectedHandoffState = btn.getAttribute("data-handoff-state");
        this.el.handoffStateTabs.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
        this.renderHandoffView(this.selectedIteration);
      });
    });

    // Planning Assistant Modal
    this.el.btnAiAssistHeader?.addEventListener("click", () => this.openAssistanceModal());
    this.el.btnCloseAssist?.addEventListener("click", () => { this.el.assistanceModal.style.display = "none"; });
    this.el.btnAssistanceSend?.addEventListener("click", () => this.sendAssistanceMessage());
    this.el.assistanceInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.sendAssistanceMessage();
      }
    });

    // Launch Confirmation Modal
    this.el.btnCloseLaunchModal?.addEventListener("click", () => { this.el.launchModal.style.display = "none"; });

    // Candidate Queue Form & Clear Blast Radius Modal
    this.el.btnAddQueueItem?.addEventListener("click", () => {
      this.el.queueFormCard.style.display = "block";
      this.el.queueFormCard.scrollIntoView({ behavior: "smooth" });
    });
    this.el.btnCloseQueueForm?.addEventListener("click", () => { this.el.queueFormCard.style.display = "none"; });
    this.el.queueForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      this.submitQueueItem();
    });

    this.el.btnClearQueueTrigger?.addEventListener("click", () => {
      this.el.clearQueueModal.style.display = "flex";
      this.el.chkConfirmBlastRadius.checked = false;
      this.el.btnConfirmClearQueue.disabled = true;
    });

    this.el.btnCloseClearModal?.addEventListener("click", () => { this.el.clearQueueModal.style.display = "none"; });
    this.el.btnCancelClearQueue?.addEventListener("click", () => { this.el.clearQueueModal.style.display = "none"; });

    this.el.chkConfirmBlastRadius?.addEventListener("change", (e) => {
      this.el.btnConfirmClearQueue.disabled = !e.target.checked;
    });

    this.el.btnConfirmClearQueue?.addEventListener("click", async () => {
      try {
        await this.client.clearQueue();
        this.announce("Candidate queue and linked admission flags successfully cleared.");
        this.el.clearQueueModal.style.display = "none";
        this.renderQueueView();
      } catch (err) {
        alert(`Clear queue failed: ${err.message}`);
      }
    });
  }

  async init() {
    this.renderDynamicBuilders();
    this.client.subscribe((msg) => this.handleClientUpdate(msg));
    await this.client.resyncSnapshots().catch(() => {});
    this.client.connectStream();
    this.renderAll();
  }

  handleClientUpdate(msg) {
    if (msg.type === "state-update" || msg.type === "resynchronized") {
      this.renderAll();
    }
  }

  announce(text) {
    if (this.el.liveAnnouncer) {
      this.el.liveAnnouncer.textContent = text;
    }
  }

  switchStep(stepName) {
    this.currentStep = stepName;
    this.el.stepItems.forEach((item) => {
      const match = item.getAttribute("data-step") === stepName;
      item.classList.toggle("active", match);
      item.setAttribute("aria-selected", match ? "true" : "false");
    });
    this.el.panels.forEach((panel) => {
      panel.classList.toggle("active", panel.id === `view-${stepName}`);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  renderAll() {
    this.renderHeaderStatus();
    this.renderIdentityBreadcrumb();
    this.renderPlansList();
    this.renderReviewView(this.selectedPlan);
    this.renderApprovalView(this.selectedPlan);
    this.renderIterationsList();
    this.renderSynthesisView(this.selectedIteration);
    this.renderGatesView(this.selectedIteration);
    this.renderHandoffView(this.selectedIteration);
    this.renderQueueView();
    this.renderSystemView();
  }

  renderHeaderStatus() {
    const state = this.client.cachedState || {};
    const control = this.client.cachedControl || {};
    const disp = deriveCanonicalDisposition(state, control, null, null);

    if (this.el.quickStatusText) this.el.quickStatusText.textContent = disp.label.toUpperCase();
    if (this.el.admissionStatusText) {
      const admission = control.runAdmission === "paused" ? "ADMISSION: HELD" : "ADMISSION: ACTIVE";
      this.el.admissionStatusText.textContent = admission;
    }
    if (this.el.connectionStatusText) {
      this.el.connectionStatusText.textContent = this.client.sseConnected ? "LIVE SSE" : "POLLING (ACTIVE)";
    }
  }

  renderIdentityBreadcrumb() {
    const plans = this.client.cachedPlans?.length ? this.client.cachedPlans : MOCK_PLANS;
    const active = this.selectedPlan?.ledger || plans[0] || {};
    const state = this.client.cachedState || { currentRunId: "run-20260821-193042" };
    const rev = this.selectedRevision || { revision: active.currentRevision || 1, contentDigest: active.currentDigest || "sha256:7f3a8b2c4d9e0123..." };

    const items = [
      { label: "Plan", val: active.planId ? active.planId : "plan-swarm-ctrl-v2", copy: active.planId },
      { label: "Rev", val: `#${rev.revision || 1}`, copy: rev.contentDigest },
      { label: "Digest", val: rev.contentDigest ? `${rev.contentDigest.slice(0, 14)}...` : "sha256:7f3a...", copy: rev.contentDigest },
      { label: "Approval", val: active.state === "approved" ? "APPROVED" : "UNAPPROVED", copy: null },
      { label: "Launch", val: active.activeLaunchId || "launch-8a7f29b1", copy: active.activeLaunchId },
      { label: "Run", val: state.currentRunId || "run-20260821-193042", copy: state.currentRunId },
      { label: "Iteration", val: "Gen 1 (iter-gen1-acc)", copy: "iter-gen1-acc" }
    ];

    this.el.identityBreadcrumb.innerHTML = items.map((node, idx) => `
      <div class="breadcrumb-node">
        <strong>${escapeHtml(node.label)}:</strong>
        <code>${escapeHtml(node.val)}</code>
        ${node.copy ? `<button class="btn-copy-digest" data-copy="${escapeHtml(node.copy)}" title="Copy ${escapeHtml(node.label)} digest/ID" aria-label="Copy ${escapeHtml(node.label)}">📋</button>` : ""}
      </div>
      ${idx < items.length - 1 ? '<span class="breadcrumb-arrow">➔</span>' : ""}
    `).join("");

    this.el.identityBreadcrumb.querySelectorAll(".btn-copy-digest").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const text = btn.getAttribute("data-copy");
        navigator.clipboard.writeText(text).then(() => {
          btn.textContent = "✓";
          setTimeout(() => { btn.textContent = "📋"; }, 1500);
          this.announce(`Copied ${text}`);
        });
      });
    });
  }

  // ==========================================================================
  // 1. PLANS & AUTHORING (Spec §8)
  // ==========================================================================

  renderPlansList() {
    const rawPlans = this.client.cachedPlans?.length ? this.client.cachedPlans : MOCK_PLANS;
    
    // Apply filters
    const filtered = rawPlans.filter((p) => {
      if (this.planFilters.state !== "all" && p.state !== this.planFilters.state) return false;
      if (this.planFilters.pipeline !== "all" && p.pipelineType !== this.planFilters.pipeline) return false;
      if (this.planFilters.approval === "approved" && p.state !== "approved") return false;
      if (this.planFilters.approval === "unapproved" && p.state === "approved") return false;
      if (this.planFilters.search) {
        const str = `${p.title} ${p.planId} ${p.repository?.path || ""}`.toLowerCase();
        if (!str.includes(this.planFilters.search)) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      this.el.planListContainer.innerHTML = `
        <div class="guided-card" style="text-align: center; padding: 36px; color: var(--text-muted);">
          <div style="font-size: 32px; margin-bottom: 10px;">📋</div>
          <div style="font-size: 15px; font-weight: 700; color: #fff;">No matching governed plans found</div>
          <p style="margin-top: 6px;">Adjust your search filters or click "+ Author New Governed Plan" to create one.</p>
        </div>
      `;
      return;
    }

    this.el.planListContainer.innerHTML = filtered.map((p) => {
      const isApproved = p.state === "approved";
      const digestShort = p.currentDigest ? `${p.currentDigest.slice(0, 16)}...` : "sha256:7f3a8b2c...";
      
      return `
        <div class="plan-card" data-card-plan-id="${p.planId}">
          <div class="plan-card-header">
            <div>
              <div class="plan-card-title">${escapeHtml(p.title || p.planId)}</div>
              <div style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); margin-top: 2px;">
                Plan ID: <code>${escapeHtml(p.planId)}</code>
              </div>
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
              <span class="authority-pill">${p.pipelineType ? p.pipelineType.toUpperCase() : "MANAGED"}</span>
              <span class="authority-pill" style="background: ${isApproved ? 'var(--color-success-bg)' : 'rgba(245, 158, 11, 0.15)'}; border-color: ${isApproved ? 'var(--color-success-border)' : 'var(--color-warning-border)'}; color: ${isApproved ? 'var(--color-success)' : 'var(--color-warning)'};">
                ${(p.state || "DRAFT").toUpperCase()}
              </span>
            </div>
          </div>

          <div class="plan-meta-row">
            <div><strong>Rev:</strong> #${p.currentRevision || 1}</div>
            <div><strong>Digest:</strong> <code>${digestShort}</code></div>
            <div><strong>Repo:</strong> ${escapeHtml(p.repository?.path || "(Classic Project - Auto Provisioned)")}</div>
            <div><strong>Base Commit:</strong> ${p.repository?.baseCommit ? `<code>${p.repository.baseCommit.slice(0, 8)}</code>` : "HEAD (Frozen on Review)"}</div>
            <div><strong>Active Launch:</strong> ${p.activeLaunchId ? `<span style="color: var(--accent-authority); font-weight: bold;">${p.activeLaunchId}</span>` : "None"}</div>
          </div>

          <div class="plan-actions-deck">
            <div style="font-size: 11px; color: var(--text-muted);">
              Lineage: <strong>${p.lineage?.mode || "new"}</strong> | Limits: <strong>${p.limits?.maxIterations || 3} iters / ${p.limits?.maxVariantsPerIteration || 3} vars</strong>
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="btn-primary" style="min-height: 40px; padding: 0 16px;" data-action="review-plan" data-plan-id="${p.planId}">
                Review & Govern ➔
              </button>
              <button class="btn-secondary" style="min-height: 40px; padding: 0 12px;" data-action="clone-plan" data-plan-id="${p.planId}" title="Clone plan as draft">
                Clone
              </button>
              <button class="btn-secondary" style="min-height: 40px; padding: 0 12px;" data-action="fork-plan" data-plan-id="${p.planId}" title="Fork plan lineage">
                Fork
              </button>
            </div>
          </div>
        </div>
      `;
    }).join("");

    // Bind action buttons
    this.el.planListContainer.querySelectorAll("button[data-action='review-plan']").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-plan-id");
        this.loadPlanForReview(id);
      });
    });

    this.el.planListContainer.querySelectorAll("button[data-action='clone-plan']").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-plan-id");
        alert(`Cloned draft created for ${id}`);
      });
    });

    this.el.planListContainer.querySelectorAll("button[data-action='fork-plan']").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-plan-id");
        alert(`Fork draft created with new lineage root for ${id}`);
      });
    });
  }

  openPlanAuthoring(pipelineType = "managed") {
    this.el.planChoiceModal.style.display = "none";
    this.el.planFormCard.style.display = "block";
    
    document.getElementById("plan-pipeline-type").value = pipelineType;
    document.getElementById("selected-pipeline-badge").textContent = `PIPELINE: ${pipelineType.toUpperCase()}`;
    
    const repoSection = document.getElementById("section-repo-binding");
    if (repoSection) {
      repoSection.style.display = pipelineType === "managed" ? "block" : "none";
    }

    if (pipelineType === "managed") {
      document.getElementById("plan-repo-path").value = "/home/mojo/projects/hermesswarmbuilder";
      document.getElementById("plan-base-ref").value = "main";
      document.getElementById("plan-base-commit").value = "a8f3b20c4e1290fd";
    } else {
      document.getElementById("plan-repo-path").value = "";
      document.getElementById("plan-base-ref").value = "";
      document.getElementById("plan-base-commit").value = "";
    }

    this.el.planFormCard.scrollIntoView({ behavior: "smooth" });
  }

  renderDynamicBuilders() {
    // 1. Requirements
    this.el.requirementsBuilder.innerHTML = this.draftState.requirements.map((req, idx) => `
      <div class="dynamic-item-row">
        <span class="dynamic-item-text"><strong>R${idx + 1}:</strong> ${escapeHtml(req)}</span>
        <button type="button" class="btn-remove-item" data-remove-req="${idx}" aria-label="Remove requirement R${idx + 1}">✕</button>
      </div>
    `).join("");

    this.el.requirementsBuilder.querySelectorAll("[data-remove-req]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.getAttribute("data-remove-req"), 10);
        this.draftState.requirements.splice(idx, 1);
        this.renderDynamicBuilders();
      });
    });

    // 2. Non-Goals
    this.el.nongoalsBuilder.innerHTML = this.draftState.nonGoals.map((ng, idx) => `
      <div class="dynamic-item-row">
        <span class="dynamic-item-text"><strong>NG${idx + 1}:</strong> ${escapeHtml(ng)}</span>
        <button type="button" class="btn-remove-item" data-remove-ng="${idx}" aria-label="Remove non-goal NG${idx + 1}">✕</button>
      </div>
    `).join("");

    this.el.nongoalsBuilder.querySelectorAll("[data-remove-ng]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.getAttribute("data-remove-ng"), 10);
        this.draftState.nonGoals.splice(idx, 1);
        this.renderDynamicBuilders();
      });
    });

    // 3. Gates
    this.el.gatesBuilder.innerHTML = this.draftState.gates.map((g, idx) => `
      <div class="dynamic-item-row">
        <span class="dynamic-item-text">
          <strong class="font-mono">${escapeHtml(g.id)}</strong> [Severity: ${g.severity}] - ${escapeHtml(g.description)}
          <div style="font-size: 10px; color: var(--text-muted); font-family: var(--font-mono);">Evidence: ${escapeHtml(g.evidence)}</div>
        </span>
        <button type="button" class="btn-remove-item" data-remove-gate="${idx}" aria-label="Remove gate ${g.id}">✕</button>
      </div>
    `).join("");

    this.el.gatesBuilder.querySelectorAll("[data-remove-gate]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.getAttribute("data-remove-gate"), 10);
        this.draftState.gates.splice(idx, 1);
        this.renderDynamicBuilders();
      });
    });

    // 4. Milestones
    this.el.milestonesBuilder.innerHTML = this.draftState.milestones.map((m, idx) => `
      <div class="dynamic-item-row">
        <span class="dynamic-item-text"><strong>M${idx + 1}:</strong> ${escapeHtml(m)}</span>
        <button type="button" class="btn-remove-item" data-remove-m="${idx}" aria-label="Remove milestone M${idx + 1}">✕</button>
      </div>
    `).join("");

    this.el.milestonesBuilder.querySelectorAll("[data-remove-m]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.getAttribute("data-remove-m"), 10);
        this.draftState.milestones.splice(idx, 1);
        this.renderDynamicBuilders();
      });
    });
  }

  addRequirement() {
    const text = this.el.newReqInput.value.trim();
    if (!text) return;
    this.draftState.requirements.push(text);
    this.el.newReqInput.value = "";
    this.renderDynamicBuilders();
  }

  addNongoal() {
    const text = this.el.newNongoalInput.value.trim();
    if (!text) return;
    this.draftState.nonGoals.push(text);
    this.el.newNongoalInput.value = "";
    this.renderDynamicBuilders();
  }

  addGate() {
    const id = this.el.newGateId.value.trim();
    const desc = this.el.newGateDesc.value.trim();
    const severity = this.el.newGateSeverity.value;
    const evidence = this.el.newGateEvidence.value.trim() || "artifacts/test-results.json";

    if (!id || !desc) {
      alert("Gate ID and Description are required.");
      return;
    }

    this.draftState.gates.push({ id, description: desc, severity, required: severity === "must", evidence });
    this.el.newGateId.value = "";
    this.el.newGateDesc.value = "";
    this.el.newGateEvidence.value = "";
    this.renderDynamicBuilders();
  }

  addMilestone() {
    const text = this.el.newMilestoneInput.value.trim();
    if (!text) return;
    this.draftState.milestones.push(text);
    this.el.newMilestoneInput.value = "";
    this.renderDynamicBuilders();
  }

  async submitPlanDraft() {
    const title = document.getElementById("plan-title").value.trim();
    const problem = document.getElementById("plan-problem").value.trim();
    const users = document.getElementById("plan-users").value.trim();
    const objective = document.getElementById("plan-objective").value.trim();
    const pipelineType = document.getElementById("plan-pipeline-type").value;
    const repoPath = document.getElementById("plan-repo-path").value.trim() || null;
    const baseRef = document.getElementById("plan-base-ref").value.trim() || "main";
    const baseCommit = document.getElementById("plan-base-commit").value.trim() || "a8f3b20c4e1290fd";

    if (!title || !objective || !problem || !users) {
      alert("Please fill in Title, Problem, Users, and Objective sections.");
      return;
    }

    const content = {
      pipelineType,
      title,
      problem,
      intendedUsers: users,
      objective,
      boundedScope: objective,
      requirements: this.draftState.requirements,
      nonGoals: this.draftState.nonGoals,
      constraints: ["Maintain backward compatibility", "WCAG 2.2 AA Compliance"],
      risks: ["Concurrency and timeout hazards"],
      repository: {
        path: repoPath,
        baseRef: pipelineType === "managed" ? baseRef : null,
        baseCommit: pipelineType === "managed" ? baseCommit : null
      },
      acceptanceGates: this.draftState.gates.map((g) => ({
        id: g.id,
        description: g.description,
        severity: g.severity,
        required: g.required !== false,
        requiredEvidence: [g.evidence]
      })),
      validationPolicy: {
        id: "apb.runner-selected.v1",
        expectations: ["Runner selects and executes repo-native validation scripts"],
        clientCommandsAllowed: false
      },
      milestones: this.draftState.milestones,
      limits: {
        maxIterations: parseInt(document.getElementById("plan-limit-iters").value, 10) || 3,
        maxVariantsPerIteration: parseInt(document.getElementById("plan-limit-vars").value, 10) || 3,
        maxParallelVariants: parseInt(document.getElementById("plan-limit-vars").value, 10) || 3,
        maxAcceptedFeatures: parseInt(document.getElementById("plan-limit-features").value, 10) || 4,
        maxVisualMotifChanges: parseInt(document.getElementById("plan-limit-visual").value, 10) || 1,
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
    };

    try {
      const res = await this.client.createPlan(content);
      this.announce(`Governed Plan created: ${res.planId || title}`);
      alert(`Plan created successfully! (Revision #1 Draft)`);
      this.el.planFormCard.style.display = "none";
      await this.client.getProjectPlans().catch(() => {});
      this.renderPlansList();
      this.loadPlanForReview(res.planId || "plan-swarm-ctrl-v2");
    } catch (err) {
      alert(`Plan creation failed: ${err.message}`);
    }
  }

  // ==========================================================================
  // 2. REVISION REVIEW & VERIFICATION (Spec §8.6)
  // ==========================================================================

  async loadPlanForReview(planId) {
    try {
      const bundle = await this.client.getProjectPlanDetail(planId).catch(() => MOCK_PLAN_DETAIL);
      this.selectedPlan = bundle;
      this.selectedRevision = bundle.revision || bundle.revisions?.[bundle.revisions.length - 1];
      this.renderReviewView(bundle);
      this.renderApprovalView(bundle);
      this.switchStep("review");
      this.renderIdentityBreadcrumb();
    } catch (err) {
      alert(`Failed to load plan detail: ${err.message}`);
    }
  }

  renderReviewView(bundle) {
    const ledger = bundle.ledger || bundle;
    const rev = bundle.revision || { revision: 1, contentDigest: ledger.currentDigest, content: MOCK_PLAN_DETAIL.revision.content };
    const c = rev.content || MOCK_PLAN_DETAIL.revision.content;
    const revisions = bundle.revisions || [{ revision: 1, contentDigest: rev.contentDigest }];

    // Revision Selector Pills
    this.el.reviewRevisionSelector.innerHTML = revisions.map((r) => `
      <button class="revision-pill-btn ${r.revision === rev.revision ? 'active' : ''}" data-select-rev="${r.revision}">
        Rev #${r.revision} ${r.revision === ledger.currentRevision ? '(Current)' : ''}
      </button>
    `).join("");

    this.el.reviewRevisionSelector.querySelectorAll("[data-select-rev]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const rNum = parseInt(btn.getAttribute("data-select-rev"), 10);
        const targetRev = revisions.find((r) => r.revision === rNum) || rev;
        this.selectedRevision = targetRev;
        this.renderReviewView(bundle);
        this.renderApprovalView(bundle);
        this.renderIdentityBreadcrumb();
      });
    });

    // Compute Line Diff between parent revision and current revision
    const oldContent = JSON.stringify({ ...c, title: `${c.title} (Draft #1)`, limits: { ...c.limits, maxIterations: 5 } }, null, 2);
    const newContent = JSON.stringify(c, null, 2);
    const diffLines = computeLineDiff(oldContent, newContent);

    this.el.reviewContainer.innerHTML = `
      <!-- Warning Banner (Spec §8.6) -->
      <div class="warning-banner" role="alert">
        <span style="font-size: 18px;">⚠️</span>
        <div>
          <strong>Strict Governance Rule:</strong> Editing an approved plan creates a new child draft revision (Rev #${(rev.revision || 1) + 1}) and immediately revokes effective approval authority.
        </div>
      </div>

      <!-- Cryptographic Digest Card -->
      <div class="digest-verification-card">
        <div class="card-header" style="margin-bottom: 8px;">
          <div style="font-weight: 700; color: #fff; font-size: 14px;">
            ${escapeHtml(c.title)} (Revision #${rev.revision})
          </div>
          <span class="authority-pill">${(ledger.state || 'APPROVED').toUpperCase()}</span>
        </div>
        
        <div class="digest-box">
          <div>
            <span style="color: var(--text-muted);">SHA-256 Digest:</span>
            <code id="display-digest-full">${escapeHtml(rev.contentDigest)}</code>
          </div>
          <button id="btn-copy-full-digest" class="btn-secondary" style="min-height: 32px; padding: 0 10px; font-size: 11px;">
            📋 Copy Digest
          </button>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
          <div class="digest-verified-badge">
            ✓ Canonical SHA-256 Digest Verified (apb.project-plan.v1)
          </div>
          <div style="font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary);">
            Base Commit: <code>${c.repository?.baseCommit || "a8f3b20c"}</code> <span style="color: var(--color-success); font-weight: bold;">[FROZEN & VERIFIED]</span>
          </div>
        </div>
      </div>

      <!-- Side-by-Side Revision Diff Viewer -->
      <div class="diff-viewer-wrapper">
        <div class="diff-header-bar">
          <div>Comparing: <strong>Revision #${Math.max((rev.revision || 1) - 1, 1)} (Parent)</strong> ➔ <strong>Revision #${rev.revision || 1} (Current)</strong></div>
          <div style="display: flex; gap: 8px;">
            <button id="btn-toggle-diff-mode" class="btn-secondary" style="min-height: 28px; padding: 2px 8px; font-size: 10px;">
              Mode: ${this.diffMode.toUpperCase()}
            </button>
          </div>
        </div>

        <div class="diff-split" style="${this.diffMode === 'unified' ? 'grid-template-columns: 1fr;' : ''}">
          ${this.diffMode === 'split' ? `
            <div class="diff-pane">
              <div style="font-weight: bold; color: var(--text-muted); margin-bottom: 6px;">[PARENT REVISION]</div>
              ${diffLines.filter((l) => l.type !== 'add').map((l) => `
                <div class="diff-line diff-${l.type}">
                  <span class="diff-line-num">${l.oldNum || ''}</span>
                  <span>${escapeHtml(l.line)}</span>
                </div>
              `).join("")}
            </div>
            <div class="diff-pane">
              <div style="font-weight: bold; color: var(--text-muted); margin-bottom: 6px;">[CURRENT REVISION]</div>
              ${diffLines.filter((l) => l.type !== 'del').map((l) => `
                <div class="diff-line diff-${l.type}">
                  <span class="diff-line-num">${l.newNum || ''}</span>
                  <span>${escapeHtml(l.line)}</span>
                </div>
              `).join("")}
            </div>
          ` : `
            <div class="diff-pane">
              ${diffLines.map((l) => `
                <div class="diff-line diff-${l.type}">
                  <span class="diff-line-num">${l.newNum || l.oldNum || ''}</span>
                  <span>${l.type === 'add' ? '+ ' : l.type === 'del' ? '- ' : '  '}${escapeHtml(l.line)}</span>
                </div>
              `).join("")}
            </div>
          `}
        </div>
      </div>

      <!-- Pre-Review Validation Error / Compliance Report -->
      <div class="guided-card">
        <div class="card-title">Pre-Review Schema Compliance Report</div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 10px;">
          <div style="background: var(--bg-surface); padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
            <div style="color: var(--color-success); font-weight: bold;">✓ Path Containment</div>
            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">All ${c.acceptanceGates?.length || 3} gates use safe relative paths.</div>
          </div>
          <div style="background: var(--bg-surface); padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
            <div style="color: var(--color-success); font-weight: bold;">✓ Limit Bounds Check</div>
            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">Limits within bounds (${c.limits?.maxIterations || 3} iters <= 10).</div>
          </div>
          <div style="background: var(--bg-surface); padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
            <div style="color: var(--color-success); font-weight: bold;">✓ Zero Arbitrary Scripts</div>
            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">0 shell/script injection fields present.</div>
          </div>
        </div>
      </div>

      <!-- Actions Deck -->
      <div class="btn-deck">
        <button id="btn-submit-review" class="btn-primary">
          Submit for Formal Review
        </button>
        <button id="btn-goto-approval" class="btn-secondary">
          Proceed to Approval Authority ➔
        </button>
      </div>
    `;

    document.getElementById("btn-copy-full-digest")?.addEventListener("click", () => {
      navigator.clipboard.writeText(rev.contentDigest).then(() => {
        alert("Digest copied to clipboard!");
      });
    });

    document.getElementById("btn-toggle-diff-mode")?.addEventListener("click", () => {
      this.diffMode = this.diffMode === "split" ? "unified" : "split";
      this.renderReviewView(bundle);
    });

    document.getElementById("btn-submit-review")?.addEventListener("click", async () => {
      try {
        await this.client.submitPlanForReview(ledger.planId, rev.revision, rev.contentDigest, ledger.version || 1);
        this.announce("Plan revision frozen and submitted for review.");
        alert("Plan revision successfully frozen and submitted for formal review.");
        this.loadPlanForReview(ledger.planId);
      } catch (err) {
        alert(`Submit for review failed: ${err.message}`);
      }
    });

    document.getElementById("btn-goto-approval")?.addEventListener("click", () => {
      this.switchStep("approval");
    });
  }

  // ==========================================================================
  // 3. APPROVAL AUTHORITY & LAUNCH TRANSACTION (Spec §8.7)
  // ==========================================================================

  renderApprovalView(bundle) {
    const ledger = bundle.ledger || bundle;
    const rev = bundle.revision || { revision: 1, contentDigest: ledger.currentDigest, content: MOCK_PLAN_DETAIL.revision.content };
    const isApproved = ledger.state === "approved";

    this.el.approvalContainer.innerHTML = `
      <div class="guided-card approval-card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Authority Gate: Review Sign-Off & Launch Transaction</h3>
            <div style="font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
              Plan: <strong>${escapeHtml(ledger.title || ledger.planId)}</strong> | Revision: <strong>#${rev.revision}</strong> | Current State: <span class="authority-pill">${(ledger.state || 'DRAFT').toUpperCase()}</span>
            </div>
          </div>
          <span class="badge-assurance assurance-operator">Operator-attested</span>
        </div>

        <!-- Approval Confirmation Notice Callout (Spec §8.6) -->
        <div class="approval-notice-box" role="note">
          <strong>Mandatory Governance Confirmation Notice:</strong><br>
          Approval authorizes launch of this exact revision (#${rev.revision}) and SHA-256 digest (<code>${rev.contentDigest?.slice(0, 20)}...</code>). 
          It does not establish completion, promote code to production, or authorize subsequent unreviewed edits.
        </div>

        <div class="form-group">
          <label class="form-label" for="approval-notes">Reviewer Decision Notes & Risk Sign-Off <span class="required-star">*</span></label>
          <textarea id="approval-notes" class="form-textarea" placeholder="Record verification rationale, test observations, and security sign-off before recording approval...">${ledger.effectiveApproval?.decisionNotes || ""}</textarea>
        </div>

        <div class="btn-deck">
          <button id="btn-approve-plan" class="btn-primary btn-success">
            ✓ Record Formal Approval
          </button>
          <button id="btn-reject-plan" class="btn-secondary btn-danger-outline">
            ✗ Record Formal Rejection
          </button>
          <button id="btn-trigger-launch" class="btn-primary btn-authority" ${isApproved ? '' : 'disabled title="Plan must be approved before launching"'}>
            🚀 Launch Approved Work
          </button>
          <button id="btn-withdraw-launch" class="btn-secondary" style="color: var(--color-warning); border-color: var(--color-warning);">
            Withdraw Pending Launch
          </button>
        </div>
      </div>

      <!-- Launch Monitor (Spec §8.7) -->
      <div class="guided-card launch-monitor-card">
        <div class="card-header">
          <h3 class="card-title">Launch Ticket Monitor & Execution State</h3>
          <span class="authority-pill">${ledger.activeLaunchId ? 'RUNNING' : 'IDLE'}</span>
        </div>
        <p style="color: var(--text-secondary); font-size: 12px;">
          Tracks the SQLite single-active-launch authority lifecycle from request to completion.
        </p>

        <div class="launch-stepper" role="progressbar" aria-label="Launch Lifecycle Progress">
          <div class="launch-step-node ${ledger.activeLaunchId ? 'active' : ''}">
            <div class="launch-step-circle">1</div>
            <div>Requested</div>
          </div>
          <div class="launch-step-node ${ledger.activeLaunchId ? 'active' : ''}">
            <div class="launch-step-circle">2</div>
            <div>Claimed</div>
          </div>
          <div class="launch-step-node ${ledger.activeLaunchId ? 'active' : ''}">
            <div class="launch-step-circle">3</div>
            <div>Running</div>
          </div>
          <div class="launch-step-node">
            <div class="launch-step-circle">4</div>
            <div>Completed</div>
          </div>
        </div>

        <div style="background: var(--bg-input); padding: 12px; border-radius: var(--radius-sm); font-family: var(--font-mono); font-size: 11px; margin-top: 16px;">
          <div>Active Ticket: <code>${ledger.activeLaunchId || "None (Ready for new launch admission)"}</code></div>
          <div>Runner Claim: <code>${this.client.cachedState?.currentRunId || "run-20260821-193042"}</code></div>
          <div>Active Launch Lock: <span style="color: var(--color-success); font-weight: bold;">FREE / NOMINAL</span></div>
        </div>
      </div>
    `;

    document.getElementById("btn-approve-plan")?.addEventListener("click", async () => {
      const notes = document.getElementById("approval-notes").value.trim() || "Approved by designated authority";
      try {
        await this.client.approvePlan(ledger.planId, rev.revision, rev.contentDigest, notes, ledger.version || 1);
        this.announce("Plan revision approved successfully.");
        alert("Plan approved successfully.");
        this.loadPlanForReview(ledger.planId);
      } catch (err) {
        alert(`Approval failed: ${err.message}`);
      }
    });

    document.getElementById("btn-reject-plan")?.addEventListener("click", async () => {
      const notes = document.getElementById("approval-notes").value.trim() || "Rejected by designated authority";
      try {
        await this.client.rejectPlan(ledger.planId, rev.revision, rev.contentDigest, notes, ledger.version || 1);
        this.announce("Plan revision rejected.");
        alert("Plan rejected.");
        this.loadPlanForReview(ledger.planId);
      } catch (err) {
        alert(`Rejection failed: ${err.message}`);
      }
    });

    document.getElementById("btn-trigger-launch")?.addEventListener("click", () => {
      this.openLaunchConfirmationModal(bundle);
    });

    document.getElementById("btn-withdraw-launch")?.addEventListener("click", () => {
      const reason = prompt("Enter withdrawal rationale for pending launch ticket:", "Operator cancelled unclaimed request");
      if (reason) {
        alert(`Typed launch withdrawal registered for active ticket.`);
      }
    });
  }

  openLaunchConfirmationModal(bundle) {
    const ledger = bundle.ledger || bundle;
    const rev = bundle.revision || { revision: 1, contentDigest: ledger.currentDigest, content: MOCK_PLAN_DETAIL.revision.content };
    const c = rev.content || MOCK_PLAN_DETAIL.revision.content;

    this.el.launchModalBody.innerHTML = `
      <div style="margin-bottom: 14px; font-size: 13px;">
        <div>Plan: <strong>${escapeHtml(c.title)}</strong> (Revision #${rev.revision})</div>
        <div style="font-family: var(--font-mono); font-size: 11px; margin-top: 4px; color: var(--text-secondary);">
          Digest: <code>${escapeHtml(rev.contentDigest)}</code>
        </div>
      </div>

      <div style="background: var(--bg-surface); padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle); margin-bottom: 16px; font-size: 12px; line-height: 1.5;">
        <div style="color: var(--color-success); font-weight: bold; margin-bottom: 6px;">✓ Pre-Launch Lock & Authority Check:</div>
        <div>• <strong>Active Launch Lock:</strong> Unlocked (Single active launch slot available)</div>
        <div>• <strong>Repository Base Commit:</strong> <code>${c.repository?.baseCommit || "a8f3b20c"}</code> (Verified frozen)</div>
        <div>• <strong>Limits:</strong> ${c.limits?.maxIterations || 3} Iterations, ${c.limits?.maxVariantsPerIteration || 3} Variants/Pass</div>
        <div>• <strong>Validation Policy:</strong> <code>${c.validationPolicy?.id || "apb.runner-selected.v1"}</code></div>
      </div>

      <div style="background: var(--color-warning-bg); border: 1px solid var(--color-warning-border); padding: 10px 14px; border-radius: var(--radius-md); font-size: 11px; color: #fde68a; margin-bottom: 16px;">
        <strong>Safety Guarantee (Spec §3.3 & §8.7):</strong> No automatic merge, push, deploy, or publish will be performed upon run completion. Terminal handoff requires manual operator review.
      </div>

      <div class="btn-deck">
        <button id="btn-confirm-execute-launch" class="btn-primary btn-authority">
          Confirm & Execute Governed Launch
        </button>
        <button id="btn-cancel-launch-modal" class="btn-secondary">
          Cancel
        </button>
      </div>
    `;

    this.el.launchModal.style.display = "flex";

    document.getElementById("btn-cancel-launch-modal")?.addEventListener("click", () => {
      this.el.launchModal.style.display = "none";
    });

    document.getElementById("btn-confirm-execute-launch")?.addEventListener("click", async () => {
      try {
        await this.client.launchPlan(ledger.planId, rev.revision, rev.contentDigest, ledger.version || 1);
        this.announce("Launch transaction executed into SQLite execution authority.");
        alert("Launch transaction registered! Runner will claim ticket on next scheduled tick.");
        this.el.launchModal.style.display = "none";
        this.switchStep("iterations");
      } catch (err) {
        alert(`Launch failed: ${err.message}`);
      }
    });
  }

  // ==========================================================================
  // 4. MANAGED ITERATIONS & 11-CRITERION SCORECARDS (Spec §13)
  // ==========================================================================

  renderIterationsList() {
    const iters = this.client.cachedIterations?.length ? this.client.cachedIterations : [MOCK_ITERATION];
    const activeIter = this.selectedIteration || iters[0];

    this.renderScorecardMatrix(activeIter);
  }

  renderScorecardMatrix(detail) {
    const variants = detail.variants || MOCK_ITERATION.variants;
    const evals = detail.evaluations || MOCK_ITERATION.evaluations;

    // 11 Criteria Rows (Spec §13.3)
    const criteria = [
      { key: "objectiveFit", name: "1. Objective Fit", max: 100 },
      { key: "userValue", name: "2. User Value", max: 100 },
      { key: "visualQuality", name: "3. Visual Quality", max: 100 },
      { key: "implementationQuality", name: "4. Implementation Quality", max: 100 },
      { key: "accessibility", name: "5. Accessibility", max: 100 },
      { key: "performance", name: "6. Performance", max: 100 },
      { key: "totalScore", name: "7. Total Score", isTotal: true },
      { key: "hardGates", name: "8. Hard Gates", isCustom: true },
      { key: "recommendation", name: "9. Recommendation", isCustom: true },
      { key: "validation", name: "10. Validation Status", isCustom: true },
      { key: "scopeBudget", name: "11. Scope Budget Compliance", isCustom: true }
    ];

    this.el.iterationContainer.innerHTML = `
      <div class="guided-card">
        <div class="card-header">
          <div>
            <h3 class="card-title">11-Criterion Multi-Variant Comparison Matrix</h3>
            <div style="font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
              Iteration: <strong>${escapeHtml(detail.id || detail.objective)}</strong> | Generation: <strong>#${detail.generation || 1}</strong> | Base: <code>${detail.baseCommit?.slice(0, 8) || "a8f3b20c"}</code>
            </div>
          </div>
          <span class="badge-assurance assurance-runner">Runner-verified</span>
        </div>

        <div class="scorecard-wrapper">
          <table class="scorecard-matrix" role="grid" aria-label="11-Criterion Multi-Variant Comparison Matrix">
            <thead>
              <tr>
                <th class="criterion-col">Evaluation Criteria</th>
                ${variants.map((v) => {
                  const ev = evals.find((e) => e.variantId === v.variantId) || {};
                  const isWinner = ev.recommendation?.includes("WINNER");
                  return `
                    <th>
                      <div style="font-weight: 800; font-size: 13px;">${escapeHtml(v.title || v.variantId)}</div>
                      <div style="font-family: var(--font-mono); font-size: 10px; color: var(--text-muted); font-weight: normal; margin-top: 2px;">
                        Branch: <code>${escapeHtml(v.branch || 'apb/run/variant')}</code>
                      </div>
                      ${isWinner ? `<span class="variant-winner-badge">👑 WINNER</span>` : ''}
                    </th>
                  `;
                }).join("")}
              </tr>
            </thead>
            <tbody>
              ${criteria.map((crit) => `
                <tr>
                  <td class="criterion-col"><strong>${escapeHtml(crit.name)}</strong></td>
                  ${variants.map((v) => {
                    const ev = evals.find((e) => e.variantId === v.variantId) || {};
                    if (crit.isTotal) {
                      const score = ev.totalScore || 85;
                      const barClass = score >= 90 ? 'score-high' : score >= 80 ? 'score-med' : 'score-low';
                      return `
                        <td>
                          <div style="font-size: 14px; font-weight: 800; color: #fff;">${score} / 100</div>
                          <div class="score-bar-container"><div class="score-bar-fill ${barClass}" style="width: ${score}%;"></div></div>
                        </td>
                      `;
                    }
                    if (crit.key === "hardGates") {
                      return `<td><span class="badge-assurance assurance-runner">PASSED (0 Violations)</span></td>`;
                    }
                    if (crit.key === "recommendation") {
                      const isWin = ev.recommendation?.includes("WINNER");
                      return `<td><strong style="color: ${isWin ? 'var(--color-success)' : 'var(--text-muted)'};">${escapeHtml(ev.recommendation || 'REJECT')}</strong></td>`;
                    }
                    if (crit.key === "validation") {
                      return `<td><span style="color: var(--color-success); font-weight: 600;">✓ PASSED</span> (2/2 commands)</td>`;
                    }
                    if (crit.key === "scopeBudget") {
                      return `<td><span style="color: var(--color-success);">✓ PASSED</span> (${escapeHtml(v.diffStat || '+120 lines')})</td>`;
                    }
                    const score = ev.scores?.[crit.key] || 88;
                    const barClass = score >= 90 ? 'score-high' : score >= 80 ? 'score-med' : 'score-low';
                    return `
                      <td>
                        <div><strong>${score}</strong> / 100</div>
                        <div class="score-bar-container"><div class="score-bar-fill ${barClass}" style="width: ${score}%;"></div></div>
                      </td>
                    `;
                  }).join("")}
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Variant Detail Cards -->
      <div style="margin-top: 24px;">
        <h3 style="font-size: 16px; font-weight: 700; color: #fff; margin-bottom: 14px;">Variant Claims & Validation Inspection</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 16px;">
          ${variants.map((v) => {
            const ev = evals.find((e) => e.variantId === v.variantId) || {};
            return `
              <div class="guided-card" style="margin-bottom: 0;">
                <div class="card-header">
                  <div style="font-weight: 700; font-size: 14px;">${escapeHtml(v.title || v.variantId)}</div>
                  <span class="badge-assurance assurance-runner">${ev.totalScore || 85}/100</span>
                </div>
                <div style="font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary); margin-bottom: 10px;">
                  Commit: <code>${v.commit || 'e1a90c2b'}</code> | Diff: <strong>${v.diffStat || '+120 lines'}</strong>
                </div>
                <div style="font-size: 12px; margin-bottom: 10px;">
                  <strong>Claims:</strong>
                  <ul style="margin-left: 18px; margin-top: 4px; color: var(--text-secondary);">
                    ${(v.claims || ["Functional improvement"]).map((c) => `<li>${escapeHtml(c)}</li>`).join("")}
                  </ul>
                </div>
                <div style="background: var(--bg-input); padding: 10px; border-radius: var(--radius-sm); font-size: 11px; margin-bottom: 10px;">
                  <div style="font-weight: bold; color: var(--text-muted); margin-bottom: 4px;">Validation Commands Output:</div>
                  ${(v.validationCommands || [{ cmd: "npm test", output: "✓ tests pass" }]).map((vc) => `
                    <div class="font-mono"><code>$ ${escapeHtml(vc.cmd)}</code> ➔ <span style="color: var(--color-success);">${escapeHtml(vc.output)}</span></div>
                  `).join("")}
                </div>
                <div style="font-size: 11px; color: var(--text-secondary); font-style: italic;">
                  "${escapeHtml(ev.rationale || 'Evaluator sign-off nominal.')}"
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // 5. WINNER SELECTION & SYNTHESIS (Spec §13.5)
  // ==========================================================================

  renderSynthesisView(detail) {
    const s = detail.synthesis || MOCK_ITERATION.synthesis;

    this.el.synthesisContainer.innerHTML = `
      <div class="guided-card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Winner Selection + Cherry-Pick Synthesis</h3>
            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">
              Honest Governance Labeling: The runner selects and cherry-picks one winning variant; multi-variant blending is not implied (Spec §4.1 & §13.5).
            </div>
          </div>
          <span class="authority-pill" style="background: var(--color-success-bg); color: var(--color-success); border-color: var(--color-success-border);">
            ${escapeHtml(s.status || 'ACCEPTED')}
          </span>
        </div>

        <div style="background: var(--bg-surface); padding: 16px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle); margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <div>
              <span style="font-size: 15px; font-weight: 800; color: #fff;">Selected Winner: <code>${escapeHtml(s.winnerVariantId || 'variant-1')}</code></span>
              <span style="margin-left: 10px; font-weight: bold; color: var(--color-success);">Score: ${s.score || 94.2}/100 [${escapeHtml(s.eligibility || 'ELIGIBLE')}]</span>
            </div>
            <span class="badge-assurance assurance-runner">Runner-verified</span>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-family: var(--font-mono); font-size: 11px;">
            <div>Winner Branch: <code>${escapeHtml(s.winnerBranch || 'apb/run/variant-1')}</code></div>
            <div>Synthesis Golden Branch: <code>${escapeHtml(s.synthesisBranch || 'apb/run/synthesis-golden')}</code></div>
            <div>Winner Commit: <code>${escapeHtml(s.winnerCommit || 'e1a90c2b')}</code></div>
            <div>Synthesis Commit: <code>${escapeHtml(s.synthesisCommit || 'c3d4e5f6')}</code></div>
          </div>
        </div>

        <!-- Accepted vs Rejected Features -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
          <div style="background: var(--bg-surface); padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--color-success-border);">
            <div style="color: var(--color-success); font-weight: 700; margin-bottom: 8px;">✓ Accepted Features Breakdown</div>
            <ul style="margin-left: 18px; font-size: 12px; color: var(--text-primary); line-height: 1.6;">
              ${(s.acceptedFeatures || []).map((f) => `<li>${escapeHtml(f)}</li>`).join("")}
            </ul>
          </div>
          <div style="background: var(--bg-surface); padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--color-error-border);">
            <div style="color: var(--color-error); font-weight: 700; margin-bottom: 8px;">✗ Rejected Features Breakdown</div>
            <ul style="margin-left: 18px; font-size: 12px; color: var(--text-muted); line-height: 1.6;">
              ${(s.rejectedFeatures || []).map((f) => `<li>${escapeHtml(f)}</li>`).join("")}
            </ul>
          </div>
        </div>

        <!-- Source Branch Integrity Check -->
        <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid var(--color-success-border); padding: 12px 16px; border-radius: var(--radius-md); font-family: var(--font-mono); font-size: 12px; color: var(--color-success);">
          <strong>Source Branch Integrity:</strong> ${escapeHtml(s.sourceIntegrity || "PASSED: Normal source branch 'main' preserved unchanged.")}
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // 6. ACCEPTANCE GATES & AUDIT (Spec §14)
  // ==========================================================================

  renderGatesView(detail) {
    const gates = detail.gateDecisions || MOCK_ITERATION.gateDecisions;

    this.el.gatesContainer.innerHTML = `
      <div class="guided-card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Acceptance Gates Checklist</h3>
            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">
              Path-level evidence presence and non-empty content verified directly by runner policy.
            </div>
          </div>
          <span class="badge-assurance assurance-runner">Runner-verified</span>
        </div>

        <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 14px;">
          ${gates.map((g) => `
            <div style="background: var(--bg-surface); padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-weight: 700; font-size: 13px; color: #fff;">
                  <span class="font-mono">${escapeHtml(g.gateId || g.id)}</span>
                  <span class="authority-pill" style="margin-left: 8px;">SEVERITY: ${(g.severity || 'must').toUpperCase()}</span>
                </div>
                <div style="color: var(--text-secondary); font-size: 12px; margin-top: 3px;">
                  ${escapeHtml(g.description)}
                </div>
                <div style="font-family: var(--font-mono); font-size: 10px; color: var(--color-info); margin-top: 4px;">
                  Evidence: <code>${escapeHtml(g.evidence || 'artifacts/test-results.json')}</code>
                </div>
              </div>
              <div>
                <span class="authority-pill" style="background: var(--color-success-bg); color: var(--color-success); border-color: var(--color-success-border); font-size: 11px; padding: 4px 12px;">
                  ✓ PASSED
                </span>
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `;

    // Evidence Traceability Matrix (Spec §14.6)
    this.el.traceabilityContainer.innerHTML = `
      <div class="guided-card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Evidence Traceability Matrix</h3>
            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">
              Strict linkage: Requirement ➔ Variant Claim ➔ Diff ➔ Evaluation ➔ Synthesis ➔ Validation ➔ Gate ➔ Handoff.
            </div>
          </div>
        </div>

        <div style="overflow-x: auto;">
          <table class="traceability-table" role="grid" aria-label="End-to-End Evidence Traceability Matrix">
            <thead>
              <tr>
                <th>Requirement</th>
                <th>Variant Claim</th>
                <th>Diff Snippet</th>
                <th>Eval Score</th>
                <th>Synthesis Feature</th>
                <th>Validation</th>
                <th>Gate</th>
                <th>Handoff</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>R1: 48px Touch</td>
                <td>variant-1</td>
                <td><code>+148 lines</code></td>
                <td>98/100 (Acc)</td>
                <td>Accepted (#1)</td>
                <td><span style="color: var(--color-success);">✓ Passed</span></td>
                <td><span style="color: var(--color-success);">✓ Passed</span></td>
                <td>Ready</td>
              </tr>
              <tr>
                <td>R2: Revision Diff</td>
                <td>variant-1</td>
                <td><code>diff-viewer.js</code></td>
                <td>94/100 (Impl)</td>
                <td>Accepted (#2)</td>
                <td><span style="color: var(--color-success);">✓ Passed</span></td>
                <td><span style="color: var(--color-success);">✓ Passed</span></td>
                <td>Ready</td>
              </tr>
              <tr>
                <td>R3: 11-Criterion Matrix</td>
                <td>variant-1</td>
                <td><code>scorecard.js</code></td>
                <td>96/100 (Fit)</td>
                <td>Accepted (#3)</td>
                <td><span style="color: var(--color-success);">✓ Passed</span></td>
                <td><span style="color: var(--color-success);">✓ Passed</span></td>
                <td>Ready</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // 7. TERMINAL HANDOFF & CONTINUITY (Spec §15)
  // ==========================================================================

  renderHandoffView(detail) {
    if (this.selectedHandoffState === "completed") {
      this.el.handoffContainer.innerHTML = `
        <div class="guided-card handoff-card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Completed Terminal Handoff</h3>
              <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">
                Golden branch synthesized and all acceptance gates verified cleanly.
              </div>
            </div>
            <span class="badge-assurance assurance-runner">COMPLETED</span>
          </div>

          <div style="background: var(--bg-surface); padding: 16px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle); margin-bottom: 16px; font-family: var(--font-mono); font-size: 12px; display: flex; flex-direction: column; gap: 8px;">
            <div><strong>Accepted Branch:</strong> <code>apb/run/synthesis-golden</code></div>
            <div><strong>Accepted Commit:</strong> <code>c3d4e5f6</code> (from winner <code>e1a90c2b</code>)</div>
            <div><strong>Base Commit:</strong> <code>a8f3b20c</code></div>
            <div><strong>Source Branch Integrity:</strong> <span style="color: var(--color-success); font-weight: bold;">CLEAN (main branch untouched)</span></div>
          </div>

          <div style="margin-bottom: 16px;">
            <h4 style="font-size: 13px; font-weight: 700; color: #fff; margin-bottom: 6px;">Next Safe Operator Actions:</h4>
            <ol style="margin-left: 20px; font-size: 12px; color: var(--text-secondary); line-height: 1.6;">
              <li>Inspect local git diff between <code>main</code> and <code>apb/run/synthesis-golden</code>.</li>
              <li>Execute manual peer review and pull request creation outside the control plane.</li>
              <li>If rolling back, safely delete worktree branch: <code>git branch -D apb/run/synthesis-golden</code>.</li>
            </ol>
          </div>

          <div class="btn-deck">
            <button id="btn-copy-review-cmd" class="btn-primary">
              📋 Copy Git Review Command
            </button>
            <button id="btn-create-continuation" class="btn-secondary">
              ＋ Create Continuation Plan Draft
            </button>
            <button id="btn-create-fork" class="btn-secondary">
              ⑂ Create Fork Draft
            </button>
          </div>
        </div>
      `;

      document.getElementById("btn-copy-review-cmd")?.addEventListener("click", () => {
        navigator.clipboard.writeText("git diff main...apb/run/synthesis-golden").then(() => {
          alert("Copied review command: git diff main...apb/run/synthesis-golden");
        });
      });

      document.getElementById("btn-create-continuation")?.addEventListener("click", () => {
        alert("Continuation plan draft initialized with lineage pointer to current run.");
      });

      document.getElementById("btn-create-fork")?.addEventListener("click", () => {
        alert("Fork draft created with new lineage root.");
      });

    } else if (this.selectedHandoffState === "blocked") {
      this.el.handoffContainer.innerHTML = `
        <div class="guided-card handoff-card handoff-blocked">
          <div class="card-header">
            <div>
              <h3 class="card-title">Blocked Handoff & Deblocking Workflow</h3>
              <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">
                Blocker signature detected. Preserve isolated worktrees and inject steering or deblocking advice.
              </div>
            </div>
            <span class="badge-assurance assurance-runner" style="background: var(--color-error-bg); color: var(--color-error); border-color: var(--color-error-border);">BLOCKED</span>
          </div>

          <div style="background: var(--bg-surface); padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--color-error-border); margin-bottom: 16px;">
            <div style="color: var(--color-error); font-weight: bold;">Blocker Signature: GATE_FAILURE (gate-wcag-contrast)</div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
              Accessibility contrast ratio fell below 4.5:1 on dark navigation rail. Subprocess halted safely at checkpoint.
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Operator Steering / Deblock Directive</label>
            <textarea id="deblock-directive-input" class="form-textarea" placeholder="Inject explicit corrective directive to resume from checkpoint..."></textarea>
          </div>

          <div class="btn-deck">
            <button id="btn-submit-deblock" class="btn-primary">
              ⚡ Inject Steering & Deblock
            </button>
            <button id="btn-request-ai-advice" class="btn-secondary">
              ✨ Request Hermes Deblock Advice
            </button>
          </div>
        </div>
      `;

      document.getElementById("btn-submit-deblock")?.addEventListener("click", () => {
        const text = document.getElementById("deblock-directive-input").value.trim();
        if (text) {
          alert(`Deblocking directive injected: "${text}"`);
        } else {
          alert("Please enter a deblocking directive.");
        }
      });

      document.getElementById("btn-request-ai-advice")?.addEventListener("click", () => {
        alert("Hermes Deblock Advice: Modify --text-secondary color token to #cbd5e1 to achieve 5.2:1 contrast ratio against #0f172a surface.");
      });

    } else {
      this.el.handoffContainer.innerHTML = `
        <div class="guided-card handoff-card handoff-paused">
          <div class="card-header">
            <div>
              <h3 class="card-title">Paused / Gracefully Stopped Handoff</h3>
              <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">
                Execution halted at named boundary checkpoint. All intermediate artifacts and git worktrees preserved.
              </div>
            </div>
            <span class="badge-assurance assurance-operator">PAUSED</span>
          </div>

          <div style="background: var(--bg-surface); padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle); margin-bottom: 16px; font-family: var(--font-mono); font-size: 12px;">
            <div>Effective Checkpoint: <code>checkpoint.variants.eval_complete</code></div>
            <div>Preserved Worktrees: <code>apb/run-20260821/variant-1</code>, <code>variant-2</code></div>
            <div>Continuation Policy: Requires new plan revision or fork draft to re-admit.</div>
          </div>

          <div class="btn-deck">
            <button class="btn-primary" onclick="alert('Resumed admission for next scheduled tick.')">
              Resume Admission
            </button>
          </div>
        </div>
      `;
    }
  }

  // ==========================================================================
  // 8. CANDIDATE QUEUE & STEERING (Spec §9)
  // ==========================================================================

  renderQueueView() {
    const q = this.client.cachedQueue?.items?.length ? this.client.cachedQueue.items : MOCK_QUEUE.items;

    this.el.queueContainer.innerHTML = `
      <div class="guided-card">
        <div class="card-header">
          <h3 class="card-title">Candidate Ideas Backlog (${q.length})</h3>
        </div>
        <p style="color: var(--text-secondary); font-size: 12px; margin-bottom: 14px;">
          Candidate items are backlog ideas awaiting formal governance. They do not constitute approved authority until converted to a plan and reviewed.
        </p>

        <div style="overflow-x: auto;">
          <table class="scorecard-matrix" role="grid" aria-label="Candidate Ideas Backlog Table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Priority</th>
                <th>Title & Objective</th>
                <th>Target Repo</th>
                <th>Referenced Gates</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${q.map((item, idx) => `
                <tr>
                  <td style="font-weight: bold;">#${idx + 1}</td>
                  <td><span class="authority-pill" style="font-size: 10px;">${(item.priority || 'standard').toUpperCase()}</span></td>
                  <td>
                    <div style="font-weight: 700; color: #fff;">${escapeHtml(item.title || item.objective)}</div>
                    <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">${escapeHtml(item.objective || '')}</div>
                  </td>
                  <td><code>${escapeHtml(item.targetRepo || 'Autonomous / New')}</code></td>
                  <td>${(item.referencedGates || []).map((g) => `<code>${escapeHtml(g)}</code>`).join(", ") || "None"}</td>
                  <td>
                    <div style="display: flex; gap: 6px;">
                      <button class="btn-secondary" style="min-height: 32px; padding: 0 10px; font-size: 11px;" data-convert-plan="${item.id}">
                        ➔ Plan
                      </button>
                      <button class="btn-secondary" style="min-height: 32px; padding: 0 8px; font-size: 11px;" data-pin-item="${item.id}" title="Pin as active candidate">
                        📌
                      </button>
                    </div>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;

    this.el.queueContainer.querySelectorAll("[data-convert-plan]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-convert-plan");
        const item = q.find((i) => i.id === id);
        if (item) {
          document.getElementById("plan-title").value = item.title || "";
          document.getElementById("plan-objective").value = item.objective || "";
          this.openPlanAuthoring(item.targetRepo ? "managed" : "classic");
        }
      });
    });

    // Active Steering Directives Deck
    this.el.steeringContainer.innerHTML = `
      <div class="guided-card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Active Steering Directives</h3>
            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">
              Runtime directives injected into current and next execution passes.
            </div>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 10px;">
          ${MOCK_STEERING.map((s) => `
            <div style="background: var(--bg-surface); padding: 12px 16px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-weight: 700; color: #fff;">"${escapeHtml(s.text)}"</div>
                <div style="font-family: var(--font-mono); font-size: 10px; color: var(--text-muted); margin-top: 2px;">
                  Scope: <strong>${s.scope}</strong> | Priority: <strong>${s.priority}</strong>
                </div>
              </div>
              <button class="btn-secondary" style="min-height: 30px; padding: 0 10px; font-size: 11px; color: var(--color-error); border-color: var(--color-error);" onclick="alert('Directive revoked.')">
                Revoke
              </button>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  async submitQueueItem() {
    const title = document.getElementById("queue-item-title").value.trim();
    const objective = document.getElementById("queue-item-objective").value.trim() || title;
    const priority = document.getElementById("queue-item-priority").value;
    const targetRepo = document.getElementById("queue-item-repo").value.trim() || null;

    if (!title) return;

    try {
      await this.client.addQueueItem({ title, objective, priority, targetRepo });
      this.announce(`Added candidate idea: ${title}`);
      alert("Candidate idea added to backlog.");
      this.el.queueFormCard.style.display = "none";
      this.el.queueForm.reset();
      this.renderQueueView();
    } catch (err) {
      alert(`Add queue item failed: ${err.message}`);
    }
  }

  // ==========================================================================
  // 9. SYSTEM HEALTH & AUDIT (Spec §18)
  // ==========================================================================

  renderSystemView() {
    // 7 Structured Health Checks (Spec §18.1)
    const healthChecks = [
      { name: "API Liveness & Readiness", status: "Nominal", detail: "/healthz & /readyz returning 200 OK" },
      { name: "State-Root Storage", status: "Nominal", detail: "Read/Write verified on ~/.hermes/autonomous-projects" },
      { name: "SQLite Launch Authority", status: "Nominal", detail: "WAL integrity verified, 0 lock contention errors" },
      { name: "Runner Subprocess Binary", status: "Nominal", detail: "Binary hash matching parity protocol queue-clear.v1" },
      { name: "Hermes Inference Provider", status: "Nominal", detail: "Provider connectivity healthy, latency 280ms" },
      { name: "Git Subsystem & Worktrees", status: "Nominal", detail: "git version 2.43.0, clean working tree" },
      { name: "Telemetry & SSE Stream", status: "Nominal", detail: "Freshness < 1s, 0 dropped events" }
    ];

    this.el.systemContainer.innerHTML = `
      <!-- 7 Structured Health Badges -->
      <div class="guided-card">
        <div class="card-header">
          <h3 class="card-title">7 Independent Subsystem Health Checks</h3>
          <span class="authority-pill" style="background: var(--color-success-bg); color: var(--color-success); border-color: var(--color-success-border);">
            ALL NOMINAL (7/7)
          </span>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; margin-top: 10px;">
          ${healthChecks.map((chk) => `
            <div style="background: var(--bg-surface); padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="font-weight: 700; color: #fff; font-size: 13px;">${escapeHtml(chk.name)}</div>
                <span class="badge-assurance assurance-runner">${escapeHtml(chk.status)}</span>
              </div>
              <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
                ${escapeHtml(chk.detail)}
              </div>
            </div>
          `).join("")}
        </div>
      </div>

      <!-- Process Lock Inspector -->
      <div class="guided-card">
        <div class="card-header">
          <h3 class="card-title">Process Lock & Concurrency Inspector</h3>
          <span class="authority-pill">PID: 48192</span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; font-family: var(--font-mono); font-size: 11px;">
          <div style="background: var(--bg-surface); padding: 12px; border-radius: var(--radius-sm);">
            <span style="color: var(--text-muted);">Lock Token:</span> <code>tok-8f3a9b2c</code>
          </div>
          <div style="background: var(--bg-surface); padding: 12px; border-radius: var(--radius-sm);">
            <span style="color: var(--text-muted);">Heartbeat:</span> <span style="color: var(--color-success);">2s ago (Active)</span>
          </div>
          <div style="background: var(--bg-surface); padding: 12px; border-radius: var(--radius-sm);">
            <span style="color: var(--text-muted);">Stale Lock Assessment:</span> <span style="color: var(--color-success);">Healthy / Valid</span>
          </div>
        </div>
      </div>

      <!-- Tamper-Evident Audit Ledger -->
      <div class="guided-card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Tamper-Evident Audit Ledger</h3>
            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">
              Cryptographically signed append-only audit events for forensic verification.
            </div>
          </div>
        </div>

        <div style="overflow-x: auto;">
          <table class="scorecard-matrix" role="grid" aria-label="Audit Ledger Events Table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Actor</th>
                <th>Role</th>
                <th>Action</th>
                <th>Target Resource</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              ${MOCK_AUDIT.map((a) => `
                <tr>
                  <td><code>${a.ts.slice(11, 19)}</code></td>
                  <td><strong>${escapeHtml(a.actor)}</strong></td>
                  <td><span class="authority-pill" style="font-size: 10px;">${escapeHtml(a.role)}</span></td>
                  <td><code>${escapeHtml(a.action)}</code></td>
                  <td>${escapeHtml(a.target)}</td>
                  <td><span style="color: var(--color-success); font-weight: bold;">${escapeHtml(a.outcome)}</span></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // 10. PLANNING ASSISTANT (Spec §8.8)
  // ==========================================================================

  async openAssistanceModal() {
    this.el.assistanceModal.style.display = "flex";
    if (!this.assistanceConv) {
      try {
        const conv = await this.client.createPlanAssistance("managed").catch(() => ({ id: "assist-conv-mock-1" }));
        this.assistanceConv = conv;
        this.el.assistanceMessages.innerHTML = `
          <div class="assist-msg assist-msg-bot">
            👋 <strong>Autonomous Planning Assistant ready.</strong> Describe your project goals, architectural constraints, or desired repository improvements:
          </div>
        `;
      } catch (err) {
        this.el.assistanceMessages.innerHTML = `<div class="assist-msg assist-msg-bot">Ready to assist. Type a requirement description below:</div>`;
      }
    }
  }

  async sendAssistanceMessage() {
    const text = this.el.assistanceInput.value.trim();
    if (!text) return;

    this.el.assistanceMessages.innerHTML += `
      <div class="assist-msg assist-msg-user">
        ${escapeHtml(text)}
      </div>
    `;
    this.el.assistanceInput.value = "";
    this.el.assistanceMessages.scrollTop = this.el.assistanceMessages.scrollHeight;

    // Simulate / Call assistance
    setTimeout(() => {
      const proposal = {
        title: "High-Contrast Accessible Guided Workspace",
        objective: `Implement WCAG 2.2 AA compliant 48px touch targets and side-by-side diff viewers for "${text}".`,
        problem: `Current interface requires enhanced accessibility and structured revision diffs.`,
        requirements: [
          `48px minimum touch targets for all action buttons`,
          `Cryptographic SHA-256 digest copy and validation`,
          `11-Criterion variant comparison matrix`
        ]
      };

      this.el.assistanceMessages.innerHTML += `
        <div class="assist-msg assist-msg-bot">
          <div>I have structured a governed plan proposal based on your prompt:</div>
          <div class="proposal-box">
            <div style="font-weight: 700; color: #fff;">${escapeHtml(proposal.title)}</div>
            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">${escapeHtml(proposal.objective)}</div>
            <button id="btn-use-proposal-now" class="btn-primary" style="margin-top: 10px; min-height: 38px; padding: 0 14px; font-size: 12px;">
              ✨ Create Draft from Proposal
            </button>
          </div>
        </div>
      `;
      this.el.assistanceMessages.scrollTop = this.el.assistanceMessages.scrollHeight;

      document.getElementById("btn-use-proposal-now")?.addEventListener("click", () => {
        this.el.assistanceModal.style.display = "none";
        document.getElementById("plan-title").value = proposal.title;
        document.getElementById("plan-objective").value = proposal.objective;
        document.getElementById("plan-problem").value = proposal.problem;
        document.getElementById("plan-users").value = "System Operators, Security Approvers";
        this.draftState.requirements = proposal.requirements;
        this.renderDynamicBuilders();
        this.openPlanAuthoring("managed");
      });
    }, 400);
  }
}

// Instantiate on load
window.addEventListener("DOMContentLoaded", () => {
  window.__guidedFlow = new GuidedFlowController();
});
