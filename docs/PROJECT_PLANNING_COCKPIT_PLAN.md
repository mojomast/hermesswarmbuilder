# Interactive Project Planning Cockpit Plan

## Goal

Add one persisted dashboard workflow that takes an operator from a project draft through exact-revision review, approval, idempotent launch, execution monitoring, and terminal handoff. The workflow is additive to the existing classic completion and managed lifecycle contracts. It does not create a browser shell, accept client validation commands, or grant the runner merge, push, deploy, or publish authority.

## Discovery synthesis

The current dashboard is a monitoring and mutable steering console. Its forms write directly to `control.json`, `queue.json`, and `gates.json`; there is no durable project entity, revision history, immutable review snapshot, approval boundary, or enforced launch idempotency. The browser rerenders form-bearing sections during refresh and stores only presentation preferences locally. Existing launch controls infer repository, base, gates, and limits from mutable projections and can create request rows before a runner claims them.

The runner already has the two execution paths that the cockpit needs:

- the classic path enforces `apb.gate-report.v1`, final audit/summary, real repository and commit, and non-empty passing command evidence before completion;
- the managed path enforces `apb.managed-lifecycle.v1`, structured variant/evaluator evidence, run-local configured-gate evidence, source-worktree invariants, and terminal `apb.handoff.v1`.

The smallest coherent integration is therefore a durable planning ledger plus an approved launch pointer. It must not replace either terminal contract or treat operator approval as execution evidence. The runner will verify and copy the approved inputs before work, explicitly select the requested pipeline, then execute the existing path.

## Decisions

1. Store plans under the APB state root, not in this repository or browser storage.
2. Store every content revision as an immutable file. A mutable index is only a projection.
3. Use deterministic canonical JSON with sorted object keys and SHA-256. Digests bind plan ID, revision, and content.
4. Snapshot acceptance gates into plan content. An empty gate selection means no additional operator gate, never "load whatever gates exist later."
5. Reject unknown command-bearing fields recursively, including `command`, `commands`, `argv`, `shell`, `script`, `executable`, `env`, `environment`, and `validationCommands`.
6. Use one narrow `POST /api/project-plans/commands` endpoint with optimistic `expectedVersion` checks and persisted idempotency records.
7. Derive the local actor on the server. Client-supplied actor fields do not become approval authority.
8. Persist an `apb.project-launch.v1` record before setting `control.projectLaunchRequest`. The control value is only a pointer containing plan, launch, pipeline, and digest identity.
9. A repeated launch idempotency key with identical approved content returns the existing launch. Reuse with different content fails with conflict.
10. The runner claims a launch once, writes the exact revision, approval, and launch snapshots under the run root, and records plan/request/run/iteration mappings without rewriting request identity.
11. A classic plan supplies its approved project context to the classic prompt. A managed plan supplies its approved existing-repository contract to the current worktree loop.
12. Pause and stop remain checkpoint-safe. Continue, retry, clone, and fork create a draft plan with lineage and require a new exact approval before launch.
13. Approval authorizes launch only. It cannot pass acceptance gates, fabricate runner validation, or authorize promotion.
14. Keep the service local-only by default and keep all spawned processes as Bun argv arrays.
15. Keep persisted planning assistance outside the command/approval/launch store. It may propose normalized content, but only an explicit operator action creates a draft.

## Storage layout

```text
$APB_STATE_ROOT/
  project-plans/
    index.json
    idempotency.json
    assistance/
      <assistance-id>.json          # apb.plan-assistance.v1, mutable optimistic version
    <plan-id>/
      ledger.json
      revisions/
        000001.json
      decisions/
        <decision-id>.json
      launches/
        <launch-id>.json
  runs/<run-id>/
    approved-project-plan.json
    project-plan-approval.json
    project-launch.json
    artifacts/project-plan/
      approved-project-plan.json
      project-plan-approval.json
      project-launch.json
```

## Persisted planning assistance

The optional pre-draft assistant stores bounded, redacted classic/managed transcripts and the latest validated proposal under `project-plans/assistance/`. Its list/create/detail/message APIs are separate from `/api/project-plans/commands`; create accepts only schema/pipeline and messages accept only schema/expected version/message. Pipeline authority, Hermes argv/environment, and prompt are server-derived. Hermes runs for one bounded turn with no toolsets, user config, rules, hooks, worktree, shell, terminal, file, web, skill, or delegation access. Output must be one marked JSON object containing a message and optional full proposal. Proposals use only `apb.project-plan.v1` content fields, pass the same normalizer as drafts, retain null managed `baseCommit`, and prohibit client validation commands. Malformed, unknown, or executable-shaped output fails closed without persisting a turn.

Conversation text may be sent to the configured inference provider and must not contain secrets. Assistance cannot save, approve, launch, or mutate control state. The UI keeps direct draft creation and exposes one explicit proposal-to-`project-plan.create` action.

Writes to mutable projections use temporary files and rename. Immutable revision, decision, and launch files use exclusive creation. Runtime plans, ledgers, launches, logs, artifacts, databases, and worktrees remain ignored runtime state.

## Plan revision schema

`apb.project-plan.v1` is an immutable revision:

```json
{
  "schemaVersion": "apb.project-plan.v1",
  "planId": "plan-...",
  "revision": 3,
  "parentRevision": 2,
  "createdAt": "ISO-8601",
  "createdBy": "local-operator",
  "content": {
    "pipelineType": "classic",
    "title": "Project title",
    "problem": "Problem and intended users",
    "intendedUsers": "Named user group",
    "objective": "Measurable objective",
    "boundedScope": "Bounded change or delivery scope",
    "requirements": ["required outcome"],
    "nonGoals": ["explicit exclusion"],
    "constraints": ["constraint"],
    "risks": ["risk"],
    "repository": {
      "path": null,
      "baseRef": null,
      "baseCommit": null
    },
    "acceptanceGates": [
      {
        "id": "gate-...",
        "description": "Acceptance condition",
        "severity": "must",
        "required": true,
        "requiredEvidence": ["relative/run-local/path"]
      }
    ],
    "validationPolicy": {
      "id": "apb.runner-selected.v1",
      "expectations": ["Expected validation outcome"],
      "clientCommandsAllowed": false
    },
    "milestones": ["phase or milestone"],
    "limits": {
      "maxIterations": 1,
      "maxVariantsPerIteration": 3,
      "maxParallelVariants": 3,
      "maxAcceptedFeatures": 4,
      "maxVisualMotifChanges": 1,
      "maxNewSections": 1,
      "stopAfterNoImprovement": 1
    },
    "lineage": {
      "mode": "new",
      "sourcePlanId": null,
      "sourceRevision": null,
      "sourceRunId": null,
      "sourceIterationId": null
    }
  },
  "contentDigest": "sha256:..."
}
```

`pipelineType` is `classic` or `managed`. A classic revision requires no existing repository and uses the classic SPEC/DEVPLAN/build/final-audit pipeline. A managed revision requires an absolute existing Git repository path, an explicit base ref resolved to `baseCommit` by the server before review, a bounded change, limits, and runner-selected validation policy.

The digest is SHA-256 over canonical JSON containing `schemaVersion`, `planId`, `revision`, `parentRevision`, and `content`, prefixed with the `apb.project-plan.v1` domain. Generated timestamps and `contentDigest` are excluded.

## Ledger schema and lifecycle

`apb.project-plan-ledger.v1` is the restart-safe projection:

```json
{
  "schemaVersion": "apb.project-plan-ledger.v1",
  "planId": "plan-...",
  "version": 7,
  "currentRevision": 3,
  "currentDigest": "sha256:...",
  "state": "approved",
  "validation": {
    "revision": 3,
    "digest": "sha256:...",
    "valid": true,
    "errors": []
  },
  "effectiveApprovalId": "decision-...",
  "activeLaunchId": null,
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

Supported states are:

- `draft`
- `ready-for-review`
- `approved`
- `launch-requested`
- `running`
- `paused`
- `blocked`
- `completed`
- `rejected`
- `archived`

Allowed content flow is `draft -> ready-for-review -> approved -> launch-requested -> running -> paused|blocked|completed`. Rejection is allowed from review or approved-before-claim. Editing `ready-for-review`, `approved`, `rejected`, `blocked`, `paused`, or `completed` creates a new revision in `draft`; historical decisions remain but cease to be effective. Active launches cannot be edited or archived. Clone/fork always creates a new plan in `draft`.

## Validation

All plans require non-empty title, problem, intended users, objective, bounded scope, at least one requirement, at least one non-goal, constraints, risks, validation expectations, and milestones. Acceptance gates require unique safe IDs, descriptions, and safe relative evidence paths when required.

Managed plans additionally require:

- an absolute existing Git repository root;
- an explicit non-empty base ref and server-resolved full base commit;
- limits within current runner bounds;
- `maxParallelVariants <= maxVariantsPerIteration`;
- validation policy exactly `apb.runner-selected.v1`.

Classic plans retain the same validation policy identifier but do not accept command text. The existing final completion evidence remains mandatory.

IDs use a bounded ASCII identifier syntax. Strings and collections have bounded sizes. Paths with NUL, traversal, URI schemes, or unsafe evidence segments are rejected. Client attempts to submit executable instructions in dedicated command-shaped properties are rejected before persistence.

## Decision schema

`apb.project-plan-decision.v1` is append-only:

```json
{
  "schemaVersion": "apb.project-plan-decision.v1",
  "decisionId": "decision-...",
  "decision": "approved",
  "planId": "plan-...",
  "revision": 3,
  "planDigest": "sha256:...",
  "approver": "local-operator",
  "approvedPipelineType": "managed",
  "notes": "Approval rationale",
  "decidedAt": "ISO-8601",
  "recordDigest": "sha256:..."
}
```

`decision` is `approved` or `rejected`. Rejection requires notes. Approval requires a passing validation record for the exact current revision and digest while the plan is `ready-for-review`. Editing never deletes a decision; it removes its effective binding by advancing the revision.

## Launch schema and idempotency

`apb.project-launch.v1` is append-only except for runner-owned status projection fields in its ledger representation:

```json
{
  "schemaVersion": "apb.project-launch.v1",
  "launchId": "launch-...",
  "idempotencyKey": "operator-generated-key",
  "planId": "plan-...",
  "revision": 3,
  "planDigest": "sha256:...",
  "approvalId": "decision-...",
  "approvalDigest": "sha256:...",
  "pipelineType": "managed",
  "status": "requested",
  "requestedAt": "ISO-8601",
  "requestedBy": "local-operator",
  "requestId": "request-...",
  "runId": null,
  "iterationId": null
}
```

The idempotency ledger stores the key, a digest of the launch subject, and the launch ID. An identical retry returns the original record. A reused key with a different subject returns HTTP 409. Only one active launch is allowed for a plan revision. Claim and terminal updates retain `requestId`; managed reconciliation adds, rather than substitutes, `runId` and `iterationId`.

## API and command contract

Read endpoints:

- `GET /api/project-plans`
- `GET /api/project-plans/:planId`
- `GET /api/project-plans/:planId/revisions/:revision`

Mutation endpoint:

- `POST /api/project-plans/commands`

Command envelope:

```json
{
  "schemaVersion": "apb.project-plan-command.v1",
  "type": "project-plan.update",
  "idempotencyKey": "required-for-create-approve-launch-clone-fork",
  "expectedVersion": 6,
  "payload": {}
}
```

Command types:

- `project-plan.create`
- `project-plan.update`
- `project-plan.ready-for-review`
- `project-plan.approve`
- `project-plan.reject`
- `project-plan.launch`
- `project-plan.archive`
- `project-plan.clone`
- `project-plan.fork`

Create/update use full content replacement rather than arbitrary JSON Patch. Every command after create includes `expectedVersion`; stale writes fail with HTTP 409. Review, approval, rejection, and launch include the exact revision and digest. Launch accepts no repository, gate, limit, validation, command, or environment overrides.

## Runner contract

The dashboard stores this pointer in `control.projectLaunchRequest` only after the launch record is durable:

```json
{
  "schemaVersion": "apb.project-launch-pointer.v1",
  "planId": "plan-...",
  "revision": 3,
  "planDigest": "sha256:...",
  "approvalId": "decision-...",
  "launchId": "launch-...",
  "requestId": "request-...",
  "pipelineType": "classic",
  "status": "pending"
}
```

Before creating worktrees or invoking Hermes, the runner:

1. loads the pointer, immutable revision, decision, and launch records;
2. recomputes all digests and checks exact identity bindings;
3. verifies state, pipeline, gate snapshot, limits, repository, and resolved base commit;
4. rejects any command-bearing content or client validation policy;
5. claims the launch and records one run ID;
6. writes exact run-local snapshots before agent work;
7. routes `classic` to the existing classic path with approved planning context appended to the prompt;
8. routes `managed` to the existing managed worktree loop using only snapshotted content;
9. updates plan, launch, request, run, and iteration projections at checkpoints and terminal outcomes.

Classic completion still requires the existing gate report and final audit evidence. Managed completion still requires lifecycle, variant, evaluator, synthesis, gate, validation, source-integrity, and handoff evidence. Approval cannot satisfy either contract.

## Dashboard workspace

Add a `Plan project` mode within the existing Studio visual language:

- a persisted plan list with state, pipeline, revision, save time, and launch/run status;
- guided steps for project, scope, delivery, repository, gates, limits, and review;
- persistent labels and field-level server validation;
- explicit dirty/saving/saved/conflict/error states and navigation warning;
- read-only review summary showing exact revision and digest;
- approval/rejection notes and immutable decision history;
- launch confirmation stating that the runner will not merge, push, deploy, publish, or mutate the normal source branch;
- disabled launch while unapproved or in flight;
- linked monitoring for run, iteration, artifacts, gates, logs, and handoff;
- terminal actions that create a new draft for retry, continue, clone, or fork.

Desktop keeps the plan list, editor, and review summary visible as a three-part workspace. Mobile uses full-width Plan, Edit, Review, Monitor, and Handoff modes; it does not hide run or artifact access. Controls remain keyboard reachable, use persistent labels, expose busy/error state, and meet touch-size expectations.

## Expected files

- `dashboard/src/server.ts`
- `dashboard/public/index.html`
- `dashboard/public/app.js`
- `dashboard/public/styles.css`
- `runner/autonomous-project-midnight-runner.ts`
- `prompts/runner-prompt.md` only if required to bind classic execution to approved context
- new planning/dashboard launch smoke scripts under `scripts/`
- `README.md`
- `dashboard/README.md`
- `docs/ARCHITECTURE.md`
- `docs/OPERATIONS.md`
- `docs/CREATIVE_ITERATION_LOOP.md`
- `docs/PROJECT_LAUNCH_HANDOFF_PLAN.md`

## Verification strategy

Use temporary state roots, repositories, HOME directories, ports, and fake Hermes executables. Exercise the actual dashboard server and runner processes. Assert draft restart persistence, immutable revisions, incomplete-plan rejection, exact approval invalidation, stale version conflicts, launch idempotency, classic/managed routing, plan/request/run/iteration reconciliation, checkpoint pause/stop, gate snapshot retention, handoff visibility, source-branch preservation, and rejection of client validation commands. Then run every existing classic, managed, dashboard, budget, and scaffold smoke plus dashboard type/build checks and runner compilation.

## Blockers

No user decision is required for this vertical slice. Authentication, network sandboxing of repository-owned package scripts, stale runner-lock recovery, and cryptographically tamper-evident audit chains are valuable follow-up hardening work, but are not prerequisites for adding the local-only exact-revision planning boundary without weakening current contracts.
