# Architecture

Hermes Swarm Builder has five bounded contexts.

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

## 4. Agent Prompt / Governance

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

## 5. Dashboard Projection

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
- `/api/stream`

`dashboard/public/app.js` projects events/state/control into the Studio steering cockpit, workflow strips, agent stacks, tool-call rows, artifact previews, and logs. Other views provide matrix/timeline/console/swarm projections.

## Canonical vocabulary

Use these words consistently in code, telemetry, artifacts, and docs:

- **Run**: one scheduled/manual runner invocation. It owns `run.json`, logs, artifacts, events, and final validation.
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
- **Projection**: dashboard-derived view over state/events/control/artifacts.

## Data flow

```text
operator cockpit / cron / manual trigger
  -> control.json + queue.json + gates.json
  -> autonomous-project-midnight-runner.ts
    -> hermes chat with runner-prompt.md + steering snapshot
      -> telemetry.py commands
        -> state.json + events.jsonl + runs/<run>/run.json
          -> Bun dashboard APIs/SSE
            -> browser dashboard projection
```

## Managed worktree loop

The managed loop is deliberately bounded and reversible:

1. **Preflight**: `repoPath` must be absolute, exist, be a git repo, resolve `baseRef`, and be clean unless `allowDirty` is true.
2. **Branching**: run-local worktrees live under `runs/<run-id>/worktrees/`; source branches use `apb/<runId>/variant-N` and `apb/<runId>/mashup`.
3. **Divergence**: the runner launches up to `maxParallelVariants` Hermes variant agents, never exceeding the configured variant cap.
4. **Evidence capture**: each variant must write `artifacts/variants/<variant-id>.json`; the runner captures `artifacts/variants/<variant-id>.diff` from git.
5. **Evaluation**: evaluator agents write `artifacts/evaluations/evaluation-<variant-id>.json` with rubric scores, hard-gate notes, and evidence references.
6. **Synthesis**: the runner chooses the best acceptable evidence-backed direction, creates the mashup worktree, cherry-picks or integrates the accepted change, and writes `artifacts/synthesis/synthesis.json`.
7. **Gate closeout**: final checks produce `artifacts/gate-decisions.json`, `artifacts/gate-report.json`, and `artifacts/artifact-manifest.json`.
8. **Lineage**: accepted commit/branch/source evidence update `iterations.json` and, in showcase-loop mode, queue the next generation until the target count or stop condition is reached.

Generated worktrees, run logs, screenshots, browser traces, build output, databases, and model artifacts are runtime evidence. They belong under the run root or generated project artifacts, not in this repository unless intentionally curated as documentation assets.

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
