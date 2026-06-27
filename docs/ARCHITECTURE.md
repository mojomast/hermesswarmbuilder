# Architecture

Hermes Swarm Builder has four bounded contexts.

## 1. Scheduler / Runner

`runner/autonomous-project-midnight-runner.ts` owns process orchestration:

- non-overlap lock,
- run id creation,
- run directory creation,
- initial state write,
- Hermes CLI invocation,
- stdout/stderr capture,
- process-level events.

It does not decide project content itself. It delegates that to the Hermes agent through `runner-prompt.md`.

## 2. Telemetry Ledger

`telemetry/telemetry.py` owns canonical state and event writes:

- `state.json` is the current projection,
- `events.jsonl` is the append-only event stream,
- `runs/<run-id>/run.json` mirrors run-level state,
- artifacts/logs live under the run root.

The dashboard treats these files as the source of truth.

## 3. Agent Prompt / Governance

`prompts/runner-prompt.md` is the policy surface for the autonomous workflow. It defines:

- stable phases,
- required agent ids,
- telemetry protocol,
- inventory scan roots,
- spec/devplan review process,
- project quality gates,
- safety constraints,
- current steering directive.

Changing future project behavior should usually be done by editing this prompt rather than dashboard code.

## 4. Dashboard Projection

`dashboard/src/server.ts` serves static UI and read-only JSON APIs over Bun:

- `/api/state`
- `/api/events`
- `/api/runs`
- `/api/runs/:id`
- `/api/runs/:id/artifacts`
- `/api/runs/:id/logs`
- `/api/stream`

`dashboard/public/app.js` projects events/state into workflow strips, agent stacks, tool-call rows, artifact previews, and logs.

## Vocabulary

- **Run**: one scheduled/manual autonomous-project attempt.
- **Phase**: run-level workflow state such as `inventory-scanning`, `spec-review`, `building`, or `completed`.
- **Agent**: stable dashboard-visible role such as `orchestrator`, `spec-author`, or `testing-subagent`.
- **Tool call**: meaningful delegated action with `tool-start`, optional `tool-output`, and terminal `tool-end`/`tool-error`.
- **Artifact**: durable run output intended for review.
- **Log**: raw stdout/stderr or command log output.
- **Projection**: dashboard-derived view over state/events.

## Data flow

```text
cron/systemd/manual trigger
  -> autonomous-project-midnight-runner.ts
    -> hermes chat with runner-prompt.md
      -> telemetry.py commands
        -> state.json + events.jsonl + runs/<run>/run.json
          -> Bun dashboard APIs/SSE
            -> browser dashboard projection
```
