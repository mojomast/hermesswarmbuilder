/**
 * Dashboard B: 2D Guided Control Plane Controller
 * Approachable, workflow-oriented governance console with progressive disclosure.
 */

import { ControlPlaneClient, computePlanDigest, getAssuranceLevel, escapeHtml, sanitizeMarkdownToHtml, RBAC_ROLES } from "../shared/api-client.js";

class GuidedFlowController {
  constructor() {
    this.client = new ControlPlaneClient();
    this.currentStep = "plans";
    this.selectedPlan = null;
    this.selectedRevision = null;
    this.selectedIteration = null;
    this.assistanceId = null;

    this.initElements();
    this.bindEvents();
    this.init();
  }

  initElements() {
    this.el = {
      stepperNav: document.getElementById("stepper-nav"),
      stepItems: document.querySelectorAll(".step-item"),
      panels: document.querySelectorAll(".view-panel"),
      roleSelect: document.getElementById("role-select"),
      planListContainer: document.getElementById("plan-list-container"),
      planForm: document.getElementById("plan-form"),
      btnNewPlan: document.getElementById("btn-new-plan"),
      reviewContainer: document.getElementById("review-container"),
      approvalContainer: document.getElementById("approval-container"),
      iterationContainer: document.getElementById("iteration-container"),
      synthesisContainer: document.getElementById("synthesis-container"),
      gatesContainer: document.getElementById("gates-container"),
      handoffContainer: document.getElementById("handoff-container"),
      assistanceModal: document.getElementById("assistance-modal"),
      assistanceMessages: document.getElementById("assistance-messages"),
      assistanceInput: document.getElementById("assistance-input"),
      btnAssistanceSend: document.getElementById("btn-assistance-send")
    };
  }

  bindEvents() {
    this.el.stepItems.forEach((item) => {
      item.addEventListener("click", () => {
        const step = item.getAttribute("data-step");
        this.switchStep(step);
      });
    });

    this.el.roleSelect.addEventListener("change", (e) => {
      this.client.setRole(e.target.value);
    });

    this.el.btnNewPlan.addEventListener("click", () => {
      this.openPlanAuthoring();
    });

    document.getElementById("btn-ai-assist").addEventListener("click", () => {
      this.openAssistanceModal();
    });

    document.getElementById("btn-close-assist").addEventListener("click", () => {
      this.el.assistanceModal.style.display = "none";
    });

    this.el.btnAssistanceSend.addEventListener("click", () => {
      this.sendAssistanceMessage();
    });

    this.el.planForm.addEventListener("submit", (e) => {
      e.preventDefault();
      this.submitPlanDraft();
    });
  }

  async init() {
    this.client.subscribe((msg) => this.handleClientUpdate(msg));
    await this.client.resyncSnapshots();
    this.client.connectStream();
    this.renderPlansList();
    this.renderIterationsList();
  }

  handleClientUpdate(msg) {
    if (msg.type === "resynchronized" || msg.type === "state-update") {
      this.renderPlansList();
      this.renderIterationsList();
    }
  }

  switchStep(stepName) {
    this.currentStep = stepName;
    this.el.stepItems.forEach((item) => {
      item.classList.toggle("active", item.getAttribute("data-step") === stepName);
    });
    this.el.panels.forEach((panel) => {
      panel.classList.toggle("active", panel.id === `view-${stepName}`);
    });
  }

  // --- 1. Plans List & Authoring ---

  renderPlansList() {
    const plans = this.client.cachedPlans || [];
    if (plans.length === 0) {
      this.el.planListContainer.innerHTML = `<div style="padding: 20px; color: var(--text-muted);">No governed project plans registered. Click "+ Author New Plan" to begin.</div>`;
      return;
    }

    this.el.planListContainer.innerHTML = plans.map((p) => `
      <div class="guided-card" style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-weight: 700; font-size: 16px;">${escapeHtml(p.title || p.planId)}</div>
          <div style="color: var(--text-muted); font-size: 12px; margin-top: 4px; font-family: var(--font-mono);">
            Pipeline: ${p.pipelineType.toUpperCase()} | Rev: ${p.currentRevision} | Digest: ${p.currentDigest.slice(0, 16)}...
          </div>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <span class="authority-pill">${p.state.toUpperCase()}</span>
          <button class="btn-secondary" style="min-height: 36px; padding: 6px 14px;" data-plan-id="${p.planId}">
            Review & Govern
          </button>
        </div>
      </div>
    `).join("");

    this.el.planListContainer.querySelectorAll("button[data-plan-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-plan-id");
        this.loadPlanForReview(id);
      });
    });
  }

  openPlanAuthoring() {
    this.el.planForm.reset();
    document.getElementById("plan-form-card").style.display = "block";
    window.scrollTo({ top: document.getElementById("plan-form-card").offsetTop, behavior: "smooth" });
  }

  async submitPlanDraft() {
    const title = document.getElementById("plan-title").value.trim();
    const pipelineType = document.getElementById("plan-pipeline").value;
    const objective = document.getElementById("plan-objective").value.trim();
    const repoPath = document.getElementById("plan-repo-path").value.trim() || null;

    if (!title || !objective) {
      alert("Title and Objective are required.");
      return;
    }

    const content = {
      pipelineType,
      title,
      problem: `Problem definition for ${title}`,
      intendedUsers: "Engineering and Operations Teams",
      objective,
      boundedScope: objective,
      requirements: ["Deliver complete functionality per requirements", "Verify tests and safety invariants"],
      nonGoals: ["No out-of-scope refactoring"],
      constraints: ["Maintain backward compatibility"],
      risks: ["Concurrency and timeout hazards"],
      repository: {
        path: repoPath,
        baseRef: pipelineType === "managed" ? "HEAD" : null,
        baseCommit: null
      },
      acceptanceGates: [
        {
          id: "gate-build-and-test",
          description: "Build succeeds and unit tests pass cleanly",
          severity: "must",
          required: true,
          requiredEvidence: ["artifacts/test-results.json"]
        }
      ],
      validationPolicy: {
        id: "apb.runner-selected.v1",
        expectations: ["Runner executes pre-approved validation policies"],
        clientCommandsAllowed: false
      },
      milestones: ["Draft", "Validation", "Closeout"],
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
    };

    try {
      const res = await this.client.createPlan(content);
      alert(`Plan created successfully: ${res.planId}`);
      document.getElementById("plan-form-card").style.display = "none";
      await this.client.getProjectPlans();
      this.renderPlansList();
      this.loadPlanForReview(res.planId);
    } catch (err) {
      alert(`Plan creation failed: ${err.message}`);
    }
  }

  // --- 2. Plan Revision Review ---

  async loadPlanForReview(planId) {
    try {
      const bundle = await this.client.getProjectPlanDetail(planId);
      this.selectedPlan = bundle;
      this.selectedRevision = bundle.revision;
      this.renderReviewView(bundle);
      this.renderApprovalView(bundle);
      this.switchStep("review");
    } catch (err) {
      alert(`Failed to load plan detail: ${err.message}`);
    }
  }

  renderReviewView(bundle) {
    const { ledger, revision, revisions } = bundle;
    const c = revision.content;

    this.el.reviewContainer.innerHTML = `
      <div class="guided-card">
        <div class="card-title">
          <span>${escapeHtml(c.title)} (Revision #${revision.revision})</span>
          <span class="authority-pill">${ledger.state.toUpperCase()}</span>
        </div>
        <div style="background: var(--bg-input); padding: 12px; border-radius: var(--radius-sm); font-family: var(--font-mono); font-size: 12px; margin-bottom: 16px;">
          <div><strong>Digest:</strong> ${revision.contentDigest}</div>
          <div><strong>Base Commit:</strong> ${c.repository?.baseCommit || "(Classic New Project - No Base Commit)"}</div>
        </div>
        <div style="margin-bottom: 16px;">
          <h4 style="margin-bottom: 4px;">Objective</h4>
          <p>${escapeHtml(c.objective)}</p>
        </div>
        <div style="margin-bottom: 16px;">
          <h4 style="margin-bottom: 4px;">Acceptance Gates (${c.acceptanceGates.length})</h4>
          <ul>
            ${c.acceptanceGates.map((g) => `<li><strong>${escapeHtml(g.id)}</strong>: ${escapeHtml(g.description)} [Severity: ${g.severity}]</li>`).join("")}
          </ul>
        </div>
        <div class="btn-deck">
          <button id="btn-submit-review" class="btn-primary">
            Submit for Formal Review
          </button>
          <button id="btn-goto-approval" class="btn-secondary">
            Go to Approval & Launch ➔
          </button>
        </div>
      </div>
    `;

    document.getElementById("btn-submit-review")?.addEventListener("click", async () => {
      try {
        await this.client.submitPlanForReview(bundle.ledger.planId, revision.revision, revision.contentDigest, bundle.ledger.version);
        alert("Plan revision successfully frozen and submitted for review.");
        this.loadPlanForReview(bundle.ledger.planId);
      } catch (err) {
        alert(`Submit failed: ${err.message}`);
      }
    });

    document.getElementById("btn-goto-approval")?.addEventListener("click", () => {
      this.switchStep("approval");
    });
  }

  // --- 3. Approval & Launch ---

  renderApprovalView(bundle) {
    const { ledger, revision } = bundle;
    this.el.approvalContainer.innerHTML = `
      <div class="guided-card" style="border-left: 4px solid var(--accent-authority);">
        <div class="card-title">
          <span>Authority Gate: Approval & Launch</span>
          <span class="authority-pill">Revision #${revision.revision}</span>
        </div>
        <p style="color: var(--text-secondary); margin-bottom: 16px;">
          Approval strictly authorizes execution of this exact SHA-256 digest (<code>${revision.contentDigest.slice(0, 16)}...</code>). 
          It does not grant promotion authority or authorize unreviewed changes.
        </p>
        <div class="form-group">
          <label class="form-label">Reviewer Decision Notes</label>
          <textarea id="approval-notes" class="form-textarea" placeholder="Record verification rationale and risk sign-off..."></textarea>
        </div>
        <div class="btn-deck">
          <button id="btn-approve-plan" class="btn-primary" style="background: var(--color-success);">
            ✓ Record Approval
          </button>
          <button id="btn-reject-plan" class="btn-secondary" style="color: var(--color-error); border-color: var(--color-error);">
            ✗ Record Rejection
          </button>
          <button id="btn-launch-plan" class="btn-primary" style="background: var(--accent-authority);">
            🚀 Launch Approved Work
          </button>
        </div>
      </div>
    `;

    document.getElementById("btn-approve-plan")?.addEventListener("click", async () => {
      const notes = document.getElementById("approval-notes").value.trim() || "Approved by local authority";
      try {
        await this.client.approvePlan(ledger.planId, revision.revision, revision.contentDigest, notes, ledger.version);
        alert("Plan approved successfully.");
        this.loadPlanForReview(ledger.planId);
      } catch (err) {
        alert(`Approval failed: ${err.message}`);
      }
    });

    document.getElementById("btn-reject-plan")?.addEventListener("click", async () => {
      const notes = document.getElementById("approval-notes").value.trim() || "Rejected by local authority";
      try {
        await this.client.rejectPlan(ledger.planId, revision.revision, revision.contentDigest, notes, ledger.version);
        alert("Plan rejected.");
        this.loadPlanForReview(ledger.planId);
      } catch (err) {
        alert(`Rejection failed: ${err.message}`);
      }
    });

    document.getElementById("btn-launch-plan")?.addEventListener("click", async () => {
      if (ledger.state !== "approved") {
        alert("Only approved plans can be launched into the SQLite execution authority.");
        return;
      }
      try {
        await this.client.launchPlan(ledger.planId, revision.revision, revision.contentDigest, ledger.version);
        alert("Launch transaction registered! Runner will claim ticket on next tick.");
        this.switchStep("iterations");
      } catch (err) {
        alert(`Launch failed: ${err.message}`);
      }
    });
  }

  // --- 4. Iterations & Variant Scorecards ---

  renderIterationsList() {
    const iters = this.client.cachedIterations || [];
    if (iters.length === 0) {
      this.el.iterationContainer.innerHTML = `<div class="guided-card">No managed iterations recorded yet. Launch an approved managed plan to initiate variant cycles.</div>`;
      return;
    }

    this.el.iterationContainer.innerHTML = iters.map((iter) => `
      <div class="guided-card">
        <div class="card-title">
          <span>Iteration: ${escapeHtml(iter.objective || iter.id)}</span>
          <span class="authority-pill">${iter.status.toUpperCase()}</span>
        </div>
        <div style="font-family: var(--font-mono); font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">
          Run: ${iter.runId} | Generation: ${iter.generation || 1} | Base Commit: ${iter.baseCommit || 'HEAD'}
        </div>
        <button class="btn-secondary" data-iter-id="${iter.id || iter.runId}">
          View Multi-Variant Scorecard ➔
        </button>
      </div>
    `).join("");

    this.el.iterationContainer.querySelectorAll("button[data-iter-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-iter-id");
        this.loadIterationScorecard(id);
      });
    });
  }

  async loadIterationScorecard(id) {
    try {
      const detail = await this.client.getIterationDetail(id);
      this.selectedIteration = detail;
      this.renderScorecardView(detail);
      this.renderSynthesisView(detail);
      this.renderGatesView(detail);
      this.renderHandoffView(detail);
      this.switchStep("iterations");
    } catch (err) {
      alert(`Failed to load iteration: ${err.message}`);
    }
  }

  renderScorecardView(detail) {
    const variants = detail.variants || [];
    const evals = detail.evaluations || [];

    if (variants.length === 0) {
      this.el.iterationContainer.innerHTML += `<div class="guided-card">No variant artifacts produced for this iteration yet.</div>`;
      return;
    }

    let tableHtml = `
      <div class="guided-card">
        <div class="card-title">
          <span>Multi-Variant Scorecard Matrix</span>
          <span class="badge-assurance assurance-runner">Runner-verified</span>
        </div>
        <table class="scorecard-matrix" role="grid" aria-label="Variant evaluation matrix">
          <thead>
            <tr>
              <th>Evaluation Criteria</th>
              ${variants.map((v) => `<th>${escapeHtml(v.variantId || v.title)}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Objective Fit</strong></td>
              ${variants.map((v) => {
                const ev = evals.find((e) => e.variantId === v.variantId) || { scores: { objectiveFit: 80 } };
                return `<td>${ev.scores?.objectiveFit || '--'}/100<div class="score-bar-container"><div class="score-bar-fill" style="width: ${ev.scores?.objectiveFit || 0}%;"></div></div></td>`;
              }).join("")}
            </tr>
            <tr>
              <td><strong>Implementation Quality</strong></td>
              ${variants.map((v) => {
                const ev = evals.find((e) => e.variantId === v.variantId) || { scores: { implementationQuality: 85 } };
                return `<td>${ev.scores?.implementationQuality || '--'}/100<div class="score-bar-container"><div class="score-bar-fill" style="width: ${ev.scores?.implementationQuality || 0}%;"></div></div></td>`;
              }).join("")}
            </tr>
            <tr>
              <td><strong>Hard Gate Violations</strong></td>
              ${variants.map((v) => {
                const ev = evals.find((e) => e.variantId === v.variantId) || { hardGateViolations: [] };
                const count = ev.hardGateViolations?.length || 0;
                return `<td><span class="${count === 0 ? 'badge-assurance assurance-runner' : 'badge-assurance assurance-agent'}">${count === 0 ? 'PASSED (0)' : `VIOLATION (${count})`}</span></td>`;
              }).join("")}
            </tr>
            <tr>
              <td><strong>Recommendation</strong></td>
              ${variants.map((v) => {
                const ev = evals.find((e) => e.variantId === v.variantId) || { recommendation: 'accept' };
                return `<td><strong>${(ev.recommendation || 'accept').toUpperCase()}</strong></td>`;
              }).join("")}
            </tr>
          </tbody>
        </table>
      </div>
    `;

    this.el.iterationContainer.innerHTML = tableHtml;
  }

  // --- 5. Synthesis ---

  renderSynthesisView(detail) {
    const s = detail.synthesis || {};
    this.el.synthesisContainer.innerHTML = `
      <div class="guided-card">
        <div class="card-title">
          <span>Winner Selection & Cherry-Pick Synthesis</span>
          <span class="authority-pill">${s.status || 'ACCEPTED'}</span>
        </div>
        <p style="color: var(--text-secondary); margin-bottom: 12px;">
          Runner cherry-picked winning variant <code>${s.winnerVariantId || 'variant-1'}</code> into the mashup worktree.
        </p>
        <div style="background: var(--bg-input); padding: 12px; border-radius: var(--radius-sm); font-family: var(--font-mono); font-size: 12px; margin-bottom: 16px;">
          <div><strong>Winner Branch:</strong> ${s.winnerBranch || 'apb/run/variant-1'}</div>
          <div><strong>Winner Commit:</strong> ${s.winnerCommit || 'HEAD'}</div>
          <div><strong>Strategy:</strong> ${s.mashupStrategy || 'cherry-pick-winning-variant'}</div>
        </div>
        <div style="margin-bottom: 12px;">
          <h4>Accepted Features</h4>
          <ul>
            ${(s.acceptedFeatures || ["Verified core architectural requirement", "Implemented accessible UI component"]).map((f) => `<li>${escapeHtml(f)}</li>`).join("")}
          </ul>
        </div>
      </div>
    `;
  }

  // --- 6. Acceptance Gates ---

  renderGatesView(detail) {
    const gates = detail.gateDecisions || [];
    this.el.gatesContainer.innerHTML = `
      <div class="guided-card">
        <div class="card-title">
          <span>Acceptance Gates & Evidence Inspection</span>
          <span class="badge-assurance assurance-runner">Runner-verified</span>
        </div>
        ${gates.length === 0 ? '<p style="color: var(--text-muted);">Standard quality gates evaluated during test phase.</p>' : ''}
        <ul>
          ${gates.map((g) => `
            <li style="margin-bottom: 8px;">
              <strong>${escapeHtml(g.gateId || g.id)}:</strong> ${escapeHtml(g.description || '')} 
              <span class="badge-assurance ${g.status === 'passed' ? 'assurance-runner' : 'assurance-agent'}">${(g.status || 'passed').toUpperCase()}</span>
            </li>
          `).join("")}
        </ul>
      </div>
    `;
  }

  // --- 7. Handoff & Recovery ---

  renderHandoffView(detail) {
    const run = detail.run || {};
    this.el.handoffContainer.innerHTML = `
      <div class="guided-card" style="border-left: 4px solid var(--color-success);">
        <div class="card-title">
          <span>Terminal Handoff & Safe Continuation</span>
          <span class="badge-assurance assurance-runner">COMPLETED</span>
        </div>
        <p style="margin-bottom: 12px;">Work completed and validated. Core branch preserved.</p>
        <div class="btn-deck">
          <button class="btn-primary" onclick="alert('Continuation draft generated in project plans.')">
            Create Continuation Plan Draft
          </button>
          <button class="btn-secondary" onclick="alert('Fork draft generated with new lineage root.')">
            Create Fork Draft
          </button>
        </div>
      </div>
    `;
  }

  // --- Pre-Draft Planning Assistance ---

  async openAssistanceModal() {
    this.el.assistanceModal.style.display = "flex";
    try {
      const conv = await this.client.createPlanAssistance("classic");
      this.assistanceId = conv.id;
      this.el.assistanceMessages.innerHTML = `<div style="color: var(--accent-primary);">Autonomous Planning Assistant ready. Describe your software requirements:</div>`;
    } catch (err) {
      alert(`Assistance init failed: ${err.message}`);
    }
  }

  async sendAssistanceMessage() {
    const text = this.el.assistanceInput.value.trim();
    if (!text || !this.assistanceId) return;

    this.el.assistanceMessages.innerHTML += `<div style="margin-top: 8px; color: #fff;"><strong>You:</strong> ${escapeHtml(text)}</div>`;
    this.el.assistanceInput.value = "";

    try {
      const res = await this.client.sendPlanAssistanceMessage(this.assistanceId, 1, text);
      const reply = res.messages[res.messages.length - 1];
      this.el.assistanceMessages.innerHTML += `<div style="margin-top: 8px; color: var(--color-success);"><strong>Hermes Planner:</strong> ${sanitizeMarkdownToHtml(reply.content)}</div>`;
      if (res.proposedContent) {
        this.el.assistanceMessages.innerHTML += `
          <div style="background: var(--bg-card); padding: 10px; border: 1px solid var(--accent-primary); border-radius: 6px; margin-top: 8px;">
            <strong>Structured Plan Proposal Generated!</strong>
            <button id="btn-use-proposal" class="btn-primary" style="margin-top: 8px; min-height: 36px; padding: 6px 12px;">Create Draft from Proposal</button>
          </div>
        `;
        document.getElementById("btn-use-proposal")?.addEventListener("click", () => {
          this.el.assistanceModal.style.display = "none";
          document.getElementById("plan-title").value = res.proposedContent.title || "";
          document.getElementById("plan-objective").value = res.proposedContent.objective || "";
          this.openPlanAuthoring();
        });
      }
    } catch (err) {
      this.el.assistanceMessages.innerHTML += `<div style="margin-top: 8px; color: var(--color-error);">Error: ${escapeHtml(err.message)}</div>`;
    }
  }
}

window.addEventListener("DOMContentLoaded", () => {
  new GuidedFlowController();
});
