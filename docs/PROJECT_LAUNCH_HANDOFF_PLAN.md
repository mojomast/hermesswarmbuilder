# Managed Project Launch and Handoff Plan

## Objective

Turn one existing-repository managed iteration into a fail-closed delivery transaction without merging, publishing, deploying, or changing the operator's normal source branch.

## Vertical slice

1. Add an isolated runner smoke that uses a temporary Git repository, state root, and fake Hermes executable. Cover success, missing evaluator evidence, missing configured-gate evidence, checkpoint pause, invalid repository/base ref, and request-row reconciliation.
2. Validate the normalized launch request before agent work. Persist `lifecycle-contract.json` and `artifacts/lifecycle-contract.json` with schema `apb.managed-lifecycle.v1`, immutable launch inputs, runner-derived validation argv, configured acceptance-gate snapshots, lineage, dirty-repository policy, limits, and checkpoint names.
3. Re-read `control.json` at preflight, after variants, after evaluation, before mashup, and after validation. Pause or stop with preserved worktrees and an honest terminal handoff; never emit completion evidence for paused work.
4. Require valid variant and evaluator JSON for every requested variant. Accept only finite, non-hard-rejected evaluator results and remove runner-synthesized claims, scores, and partial-success fallbacks.
5. Run only deterministic runner-selected validations. Evaluate every required configured gate from non-empty run-local artifact evidence, and write one decision per gate plus the managed evidence-integrity and validation decisions.
6. Write `artifacts/handoff.json` for completed, blocked, paused, and stopped outcomes. Include promotion/rollback instructions on success and preserved paths/recovery instructions otherwise.
7. Reconcile the originating `iterations.json` request row to the real run and iteration IDs at claim and terminal status while retaining source run/iteration lineage.

## Safety invariants

- Preserve the classic completion-evidence contract unchanged.
- Never execute dashboard/client-supplied validation commands.
- Use argv arrays for every spawned command.
- Keep worktrees and evidence under the isolated run root.
- Never merge, push, deploy, publish, or mutate the checked-out source branch.
- Missing or malformed required evidence blocks completion.
