# Managed Project Launch and Handoff Contract

## Objective

The implemented managed path turns one existing-repository iteration into a fail-closed delivery transaction without merging, pushing, publishing, deploying, or changing the operator's normal source branch. It can be entered by a legacy explicit iteration request or by an exact approved planning-cockpit launch.

## Vertical slice

1. Isolated runner smokes use temporary Git repositories, state roots, HOME directories, ports, and fake Hermes executables. They cover success, missing evaluator/gate evidence, checkpoint pause/stop, invalid repository/base ref, request-row reconciliation, planning restart persistence, exact approval, launch idempotency, routing, and source-branch preservation.
2. Validate the normalized launch request before agent work. Persist `lifecycle-contract.json` and `artifacts/lifecycle-contract.json` with schema `apb.managed-lifecycle.v1`, frozen input fields, runner-derived validation argv, acceptance-gate snapshots, lineage, dirty-repository policy, limits, and checkpoint names. The contract as a whole is mutable: lifecycle state, resolved base, blockers, checkpoint, and terminal fields are updated during execution.
3. Re-read `control.json` at preflight, after variants, after evaluation, before mashup, and after validation. Pause or stop with preserved worktrees and an honest terminal handoff; never emit completion evidence for paused work.
4. Require valid variant and evaluator JSON for every requested variant. Accept only finite, non-hard-rejected evaluator results and remove runner-synthesized claims, scores, and partial-success fallbacks.
5. Run only deterministic runner-selected validations. Evaluate every required configured gate from non-empty run-local artifact evidence, and write one decision per gate plus the managed evidence-integrity and validation decisions.
6. Write `artifacts/handoff.json` for completed, blocked, paused, and stopped outcomes. Include promotion/rollback instructions on success and preserved paths/recovery instructions otherwise.
7. Reconcile the originating `iterations.json` request row to the real run and iteration IDs at claim and terminal status while retaining source run/iteration lineage.

## Planning-cockpit binding

The planning ledger is stored under `~/.hermes/autonomous-projects/project-plans/`. An immutable `apb.project-plan.v1` revision is approved by an append-only `apb.project-plan-decision.v1`, launched through an `apb.project-launch.v1`, and admitted through `control.json.projectLaunchRequest` (`apb.project-launch-pointer.v1`). The runner recomputes both digests and requires exact agreement across plan id, revision, plan digest, approval id/digest and approved pipeline, launch id, request id, ledger versioned projection, and pointer before claim.

Managed review resolves and records the exact full base commit. The approved revision is also the exact gate/evidence-path and limit snapshot. At claim, `runId` and `iterationId` are added without replacing `requestId`; all identities are copied into run/lifecycle/iteration/`iterations.json` projections. The run root and `artifacts/project-plan/` each receive `approved-project-plan.json`, `project-plan-approval.json`, and `project-launch.json`.

Classic planning launches use the same binding and snapshots but route to the established SPEC/DEVPLAN/build/final-audit contract and do not receive a managed iteration id. Managed launches route to this worktree contract. Approval permits launch only; generated gates, evidence, validation, and handoff determine completion.

Every non-create planning command uses optimistic `expectedVersion`; stale writes fail with HTTP 409. Create, approve, launch, clone, and fork persist idempotency results: an identical command subject returns the original result and a different subject under the same key conflicts. Editing creates a new revision and invalidates effective approval. Launch accepts no overrides.

## Safety invariants

- Preserve the classic completion-evidence contract unchanged.
- Never execute dashboard/client-supplied validation commands.
- Reject executable-shaped planning fields, including shell, argv, command, script, executable, and environment data.
- Use argv arrays for every spawned command.
- Keep worktrees and evidence under the isolated run root.
- Never merge, push, deploy, publish, or mutate the checked-out source branch.
- Missing or malformed required evidence blocks completion.
- Keep dashboard and planning state local-only by default, redact common secret shapes at API/log boundaries, and never put credentials in planning content.

## Recovery and handoff

Dashboard restarts reload the on-disk planning ledger. An unclaimed pending pointer remains eligible for a later runner tick. A claimed launch is not reclaimed after runner restart; its run-local snapshots and logs are the recovery evidence. Pause/stop preserve work at a safe checkpoint and write `handoff.json`. Continue/fork from a planned result creates a new draft and requires a new exact approval/launch.

Stale, tampered, malformed, already-claimed, or unapproved pointers are marked rejected before Hermes work. Never rewrite ids or digests to repair them. Preserve the audit trail, correct repository/evidence conditions, clone or fork into a new draft, and approve a new launch. A successful handoff names the accepted run-local branch/commit and manual promotion action; blocked/paused/stopped handoffs name preserved paths and a safe recovery action.
