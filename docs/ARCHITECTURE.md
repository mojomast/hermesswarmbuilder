# Architecture

Hermes Swarm Builder has six bounded contexts.

## 1. Scheduler / Runner

`runner/autonomous-project-midnight-runner.ts` owns process orchestration:

- non-overlap lock,
- dashboard control/hold checks,
- run id creation,
- run directory creation,
- pinned queue export into run-local `idea.txt`,
- steering snapshot injection into the Hermes prompt,
- initial state write,
- Hermes CLI invocation,
- stdout/stderr capture,
- process-level events,
- final `gate-report.json` / `artifact-manifest.json` writeback when the Hermes process succeeds.

The file name is retained for compatibility, but the installer schedules it hourly. It does not decide project content itself; it passes dashboard steering, queue, gate, and prompt context to the Hermes agent.

When `control.nextRunRequest` or `control.autoIteration.enabled` is present, the runner switches from the classic single-agent fresh-build path to the managed worktree loop. It validates the target repo, requires a clean git status unless explicitly allowed, resolves the base ref, creates run-local worktrees/branches for `variant-N` and `mashup`, launches bounded Hermes sessions, captures each variant's diff and JSON claim, launches evaluator sessions, synthesizes the winning direction, records gate decisions, and updates iteration lineage. The prompt contract still exists, but side effects are now owned by the runner rather than left entirely to one generic agent session.

## 2. Steering Control Plane

The dashboard writes narrow, auditable local control files under `~/.hermes/autonomous-projects`:

- `control.json` is the desired mode/projection: pause, hold, stop, run admission, active steering, pinned queue item.
- `queue.json` is the operator/Hermes-generated idea queue.
- `gates.json` is the reusable acceptance-gate ledger.
- `commands.jsonl` is the append-only operator command log.
- `audit.jsonl` is the append-only command/result audit trail.

This context intentionally does **not** expose an arbitrary browser shell. Commands are declarative intent; the runner/orchestrator consumes them at safe checkpoints.

## 3. Telemetry Ledger

`telemetry/telemetry.py` owns canonical state and event writes:

- `state.json` is the current projection,
- `events.jsonl` is the append-only event stream,
- `runs/<run-id>/run.json` mirrors run-level state,
- artifacts/logs live under the run root.

The dashboard treats these files as the source of truth and defensively redacts output again at the server boundary.

## 4. Project Planning Ledger

`dashboard/src/project-plans.ts` owns the durable planning transaction under `~/.hermes/autonomous-projects/project-plans/`:

- `index.json` is the list projection and `idempotency.json` stores command subject digests and original results.
- `<plan-id>/revisions/<zero-padded-revision>.json` is an exclusively-created immutable `apb.project-plan.v1` snapshot.
- `<plan-id>/decisions/<decision-id>.json` is an exclusively-created digest-protected `apb.project-plan-decision.v1` approval/rejection.
- `<plan-id>/launches/<launch-id>.json` is the durable `apb.project-launch.v1` request/status record.
- `<plan-id>/ledger.json` is the mutable, versioned `apb.project-plan-ledger.v1` projection.
- `control.json.projectLaunchRequest` is the single `apb.project-launch-pointer.v1` runner admission pointer.

The revision digest is domain-separated SHA-256 over canonical JSON containing schema, plan id, revision, parent revision, and content; generated metadata is excluded. Approval binds the exact plan id, revision, digest, and pipeline type. Editing creates a child revision and clears effective approval. The runner verifies the revision digest, approval record digest, launch, ledger validation, and pointer as one exact binding before any Hermes work.

Command writes are optimistic: every non-create command must match `ledger.version`, including clone/fork against the source ledger, or fails with HTTP 409. Create, approve, launch, clone, and fork are idempotent by a persisted key plus command type/expected-version/payload subject. Identical retry returns the original result; different reuse fails with HTTP 409.

## 5. Agent Prompt / Governance

`prompts/runner-prompt.md` is the policy surface for the autonomous workflow. It defines:

- stable phases,
- required agent ids,
- telemetry protocol,
- dashboard queue/steering priority,
- tournament-style fallback selection over Hermes-generated ideas,
- inventory scan roots,
- spec/devplan review process,
- project quality gates,
- safety constraints,
- current steering directive.

Changing broad future project behavior should usually be done by editing this prompt or by adding dashboard queue/gate/steering entries rather than dashboard code.

## 6. Dashboard Projection

`dashboard/src/server.ts` serves static UI, JSON APIs, command APIs, and SSE over Bun:

- `/api/state`
- `/api/events?limit=&after=` — tail/cursor event reads, not full-history reparses
- `/api/runs`
- `/api/runs/:id`
- `/api/runs/:id/artifacts`
- `/api/runs/:id/logs`
- `/api/control`
- `/api/queue`
- `/api/gates`
- `/api/audit`
- `/api/commands`
- `GET /api/project-plans`
- `GET /api/project-plans/:planId`
- `GET /api/project-plans/:planId/revisions/:revision`
- `POST /api/project-plans/commands`
- `/api/stream`

`dashboard/public/app.js` projects events/state/control into the Studio steering cockpit, workflow strips, current-step/live-activity summaries, agent stacks, tool-call rows, artifact previews, and logs. Other views provide matrix/timeline/console/swarm projections.

Dashboard presentation preferences are intentionally client-local. Density mode, hidden/collapsed sections, expanded agent/tool rows, selected tabs, selected run, follow/pause behavior, and preview selections are stored in browser `localStorage` under `hermes.apb.dashboard.*`. They are not part of the steering control plane and must not be consumed by the runner.

The current-step/live-activity projection is derived from existing telemetry and run state such as `phase`, `task`, `lastAction`, selected project, `repoPath`, active agent status, recent events, and tool-call lifecycle events. It does not introduce a second source of truth for workflow state.

## Canonical vocabulary

Use these words consistently in code, telemetry, artifacts, and docs:

- **Run**: one scheduled/manual runner invocation. It owns `run.json`, logs, artifacts, events, and final validation.
- **Plan**: a durable project-planning container with a current ledger projection.
- **Revision**: an immutable planning input snapshot; revision number is local to a plan.
- **Approval**: an exact-revision planning decision. It grants launch authority only.
- **Launch**: the durable transaction connecting approved planning inputs to one request and, after claim, one run.
- **Request**: runner admission identity. A request is not a run; managed reconciliation retains it when adding run and iteration ids.
- **Iteration**: a bounded improvement pass with an objective, limits, lineage, source context, variants, evaluations, synthesis, and gate decisions.
- **Generation**: one diverge/evaluate/synthesize/verify cycle inside an iteration.
- **Variant**: one focused alternative generated against the same objective and constraints.
- **Evaluator**: the judging role or artifact that compares variants with evidence and a fixed rubric.
- **Synthesis / mashup**: the selected combination of compatible variant features. “Synthesis” is the preferred formal term; “mashup” may appear for backward compatibility.
- **Gate**: a required acceptance condition with required evidence.
- **Evidence**: durable proof used to judge a variant, gate, or final result: screenshots, test output, diffs, logs, accessibility checks, performance checks, or operator notes.
- **Decision**: a recorded outcome with rationale and evidence links, such as accept, reject, continue, fork, pass gate, fail gate, or needs evidence.
- **Resume point**: the smallest durable context needed to continue later: objective, source evidence, iteration state, latest synthesis, gate decisions, and artifact manifest.
- **Fork**: a new iteration whose lineage points to a prior iteration or run but intentionally explores a different direction.
- **Queue item**: a ranked candidate idea; may be user-provided or generated by Hermes tournament selection.
- **Pinned queue item**: the next hard selector override.
- **Control command**: an append-only operator intent such as pause, hold, resume, steer, add gate, continue, fork, or pin queue item.
- **Phase**: run-level workflow state such as `inventory-scanning`, `spec-review`, `building`, or `completed`.
- **Agent**: stable dashboard-visible role such as `orchestrator`, `variant-1`, `evaluator-1`, or `mashup`.
- **Tool call**: meaningful delegated action with `tool-start`, optional `tool-output`, and terminal `tool-end`/`tool-error`.
- **Artifact**: durable run output intended for review, evidence, resume, or handoff.
- **Handoff**: terminal operator guidance and accepted branch/commit or safe recovery action; it is distinct from approval and gate evidence.
- **Projection**: dashboard-derived view over state/events/control/artifacts.

## Data flow

```text
operator cockpit / cron / manual trigger
  -> planning ledger + control.json pointer, or legacy control/queue/gates intent
  -> autonomous-project-midnight-runner.ts
    -> hermes chat with runner-prompt.md + steering snapshot
      -> telemetry.py commands
        -> state.json + events.jsonl + runs/<run>/run.json
          -> Bun dashboard APIs/SSE
            -> browser dashboard projection
              -> browser-local layout preferences, density, hidden sections, and expanded rows
```

Only operator intent commands flow back into `control.json`, `queue.json`, `gates.json`, `commands.jsonl`, or `audit.jsonl`. UI density, hidden-section state, collapsed rows, and current inspector selections remain browser-local.

## Planned launch routing

Planning assistance is a separate pre-draft data plane. `apb.plan-assistance.v1` conversations live as bounded `0600` files under `$STATE_ROOT/project-plans/assistance/` and never enter `ProjectPlanStore.command`, `control.json`, approval, or launch code. The API derives pipeline authority server-side and uses optimistic conversation versions. A fixed no-tool Hermes invocation receives only a server-built prompt containing redacted untrusted discussion; runtime and output are bounded. Strictly marked JSON is accepted only after unknown/executable fields are rejected and `proposedContent` passes the exported project-plan content normalizer. Invalid output causes no conversation update. The only bridge is an explicit browser action that sends validated proposal content through the ordinary `project-plan.create` command.

At review, the server validates completeness. For a managed plan it resolves the absolute repository root and explicit base ref to an exact full commit, writing a new immutable revision if resolution changes the draft. Approval then binds that review revision. Launch writes one launch record and pointer; it accepts no launch-time repository, gate, limit, validation, command, or environment override.

The runner verifies the entire pointer/revision/approval/launch/ledger chain fail-closed, claims the launch once, and writes identical `approved-project-plan.json`, `project-plan-approval.json`, and `project-launch.json` snapshots at the run root and under `artifacts/project-plan/`. Stable identities reconcile as follows: `planId` owns revision numbers; `approvalId` identifies the exact decision; `launchId` identifies the launch transaction; `requestId` survives admission; `runId` is assigned on claim; managed routing additionally assigns `iterationId = iter-<runId>`. Generations occur inside the managed iteration and do not replace any of these ids.

`pipelineType: classic` bypasses project selection and injects exact approved content into the existing SPEC/DEVPLAN/build/final-audit path. It has a run but no managed iteration. `pipelineType: managed` converts only the approved content into a bounded request and snapshots exact repository/base, acceptance gates, evidence paths, and limits into the managed run. Mutable queue, steering, and `gates.json` values cannot replace approved planning inputs.

## Managed worktree loop

The managed loop is deliberately bounded and reversible:

1. **Launch contract and preflight**: before repository work, the runner validates the bounded request and writes `lifecycle-contract.json` plus `artifacts/lifecycle-contract.json` using `apb.managed-lifecycle.v1`. Approved inputs snapshot repository path, objective, bounded change request, lineage, exact base ref/commit, runner-selected validation policy, gates, dirty-repository policy, limits, and checkpoints. Lifecycle state, resolved execution details, blockers, and terminal timestamps remain mutable and are mirrored to both copies; `lifecycle-contract.json` itself is not an immutable object. `repoPath` must identify the approved absolute Git root, `baseRef` must still resolve to the approved `baseCommit`, and planned launches require a clean repo.
2. **Branching**: run-local worktrees live under `runs/<run-id>/worktrees/`; source branches use `apb/<runId>/variant-N` and `apb/<runId>/mashup`.
3. **Divergence**: the runner launches up to `maxParallelVariants` Hermes variant agents, never exceeding the configured variant cap.
4. **Evidence capture**: each variant must write `artifacts/variants/<variant-id>.json`; the runner captures `artifacts/variants/<variant-id>.diff` from git.
5. **Evaluation**: evaluator agents write `artifacts/evaluations/evaluation-<variant-id>.json` with finite rubric scores, hard-gate notes, and references to the real variant claim and diff. Missing/malformed records, partial/rejected recommendations, and hard-gate violations cannot win; the runner never synthesizes evaluator success.
6. **Synthesis**: the runner chooses the best acceptable evidence-backed direction, creates the mashup worktree, cherry-picks or integrates the accepted change, and writes `artifacts/synthesis/synthesis.json`.
7. **Checkpoint and gate closeout**: control is re-read at preflight, after variants, after evaluation, before mashup, and after validation. A pause/stop preserves worktrees and writes an honest handoff. Runner-selected validations and every required snapshotted gate must pass with non-empty run-local evidence before `gate-decisions.json`, `gate-report.json`, and `artifact-manifest.json` can close successfully.
8. **Handoff and lineage**: every terminal managed outcome writes `artifacts/handoff.json` using `apb.handoff.v1`. Accepted commit/branch/source evidence reconcile the original `iterations.json` request row to the real run/iteration and, in showcase-loop mode, queue the next generation until the target count or stop condition is reached.

Generated worktrees, run logs, screenshots, browser traces, build output, databases, and model artifacts are runtime evidence. They belong under the run root or generated project artifacts, not in this repository unless intentionally curated as documentation assets.

The dashboard is local-only by default (`127.0.0.1`), sanitizes API/SSE/artifact/log output for common secret shapes, bounds returned values, and rejects executable-shaped planning fields. Planning content must still be treated as local sensitive data and must not contain secrets. Assistance discussion can leave the host for the configured Hermes inference provider, so provider privacy policy applies even though common secret shapes are redacted. Validation argv comes only from runner policy (`git diff --check` and declared package test/build scripts); browser/client command strings are not accepted or executed. Neither route merges, pushes, deploys, publishes, or mutates the checked-out normal source branch.

## Iteration/resume data flow

```text
operator command
  -> control.nextRunRequest
  -> iterations.json lineage row
  -> runner creates iteration-state.json
  -> runner creates artifacts/iterations/iteration.json
  -> runner creates artifacts/source-evidence.json
  -> runner creates worktrees/variant-N + apb/<run>/variant-N branches
  -> variant/evaluator agents create artifacts/variants and artifacts/evaluations
  -> runner synthesizes/cherry-picks a mashup branch
  -> runner writes synthesis, gate decisions, gate report, manifest
  -> dashboard exposes /api/iterations and /api/iterations/:id
  -> future run can continue or fork from recorded source evidence
```

The dashboard records intent and lineage. The runner owns side-effectful worktree creation, bounded execution, final validation, and durable resume scaffolding.
