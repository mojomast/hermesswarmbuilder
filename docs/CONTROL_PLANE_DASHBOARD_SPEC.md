# Hermes Swarm Builder Control Plane Dashboard Specification

## 1. Purpose

This document specifies a fully featured, user-friendly dashboard for monitoring, governing, and controlling Hermes Swarm Builder. It is based on the runner, telemetry, planning ledger, launch authority, API, artifacts, and operational behavior in this repository.

Existing dashboard layouts and frontend implementations are intentionally excluded as design inputs. Existing backend interfaces are referenced only to distinguish what can be built now from what requires backend work.

The target product is an engineering control plane, not a decorative swarm visualization, generic chat client, or browser terminal.

## 2. Product Outcomes

The dashboard must let an operator answer these questions quickly and reliably:

1. Is the system healthy and safe to run?
2. What is running, waiting, held, blocked, or completed?
3. What exact work was authorized, by whom, and from which revision?
4. What are agents doing now, and is their activity fresh?
5. Which controls are available, when will they take effect, and are they reversible?
6. What evidence supports a completion, evaluation, or gate decision?
7. Did managed work preserve the normal source branch?
8. Why did a run fail, pause, or block, and what is the next safe action?
9. What resources, time, provider usage, and cost are being consumed?
10. What needs operator attention now?

The dashboard succeeds when operators can run the complete workflow without reading state files directly, while retaining access to raw evidence for forensic review.

## 3. Product Principles

### 3.1 Evidence before claims

`Completed` must mean that the relevant completion contract passed, not merely that a process exited successfully. Gate results, validation commands, commits, audits, and handoffs must be directly inspectable.

### 3.2 Intent is not execution

The UI must keep these identities distinct:

```text
Plan -> Revision -> Approval -> Launch -> Request -> Run -> Iteration
```

A launch request is not a run. An accepted command is not an executed command. Approval authorizes launch, not completion or promotion.

### 3.3 Safety is structural

The control plane must use narrow, typed operations. It must not expose an arbitrary shell, arbitrary validation command entry, raw environment injection, or one-click merge, push, deploy, or publish controls.

### 3.4 Honest state

Blocked, paused, stopped, timed out, rejected, stale, and missing-evidence states are first-class outcomes. The UI must not collapse them into a generic failure or success label.

### 3.5 Progressive disclosure

The default view presents disposition, impact, and next action. Detailed identities, events, artifacts, logs, raw JSON, and process metadata remain available without overwhelming routine operation.

### 3.6 Local-first, remote-ready only after hardening

The current service is suitable for a trusted local operator and binds to loopback by default. A remotely reachable or multi-user dashboard must not ship until authentication, authorization, request forgery protection, and authoritative actor identity are implemented.

### 3.7 Control state is server-owned

Layout preferences, density, expanded rows, filters, and selected tabs are browser-local. Plans, approvals, commands, gates, schedules, and run controls are server-owned and auditable.

## 4. System Capability Model

### 4.1 Execution pipelines

#### Classic pipeline

Classic runs create new projects through inventory scanning, project selection, repository creation, specification, plan generation, delegated implementation, testing, and final audit.

Key dashboard implications:

- Show the full SPEC and DEVPLAN workflow.
- Show stable subagent roles and tool telemetry.
- Clearly label classic command evidence as agent-attested unless the backend independently reruns it.
- Explain that live pause and stop are less enforceable than in managed mode.
- Do not show an iteration identity for a planned classic run.

#### Managed pipeline

Managed runs improve an existing Git repository through preflight, isolated variants, evaluation, winner selection, synthesis, validation, gate closeout, and handoff.

Key dashboard implications:

- Show repository root, base ref, exact base commit, and source integrity.
- Show worktree, branch, and commit identities for every variant.
- Compare evaluator scores and hard-gate violations.
- Show runner-selected validation separately from agent claims.
- Show safe control checkpoints.
- Report the actual synthesis strategy. Today the runner selects and cherry-picks one winning variant; the UI must not imply multi-variant blending.

### 4.2 Authority and persistence

The dashboard must represent four different types of state:

| State type | Examples | UI treatment |
|---|---|---|
| Authoritative immutable records | Plan revisions, approval decisions, launch snapshots | Read-only identity, digest, comparison, audit trail |
| Authoritative mutable records | SQLite launch lifecycle | Status, transition history, reconciliation health |
| Desired state | Pause, hold, stop, steering, queue, next-run request | Pending intent, acknowledgement, effective checkpoint |
| Observed projections | Current state, run mirrors, events, iteration summaries | Freshness, source, reconciliation warning |

The product must not present filesystem projections as transactionally consistent when they are not. When projections disagree, surface an integrity incident instead of silently choosing the most convenient value.

### 4.3 Core resource vocabulary

| Resource | Meaning |
|---|---|
| Plan | Durable project-planning container |
| Revision | Immutable planning snapshot |
| Decision | Approval or rejection bound to an exact revision |
| Launch | Durable approved transaction |
| Request | Stable runner-admission identity |
| Run | One runner invocation owning logs and evidence |
| Iteration | One bounded managed improvement pass |
| Generation | One diverge/evaluate/synthesize/verify cycle |
| Variant | One focused implementation alternative |
| Evaluation | Evidence-backed judgment of a variant |
| Synthesis | Selected accepted direction and integration record |
| Gate | Acceptance condition requiring evidence |
| Evidence | Durable proof supporting a claim or decision |
| Handoff | Terminal result and next safe operator action |
| Queue item | Ranked candidate idea, not approved authority |
| Agent | Stable role or managed worker identity |
| Tool call | Correlated delegated action lifecycle |

## 5. Users and Permissions

### 5.1 Personas

#### Operator

Monitors current work, controls admission, pauses or stops runs, handles blockers, and reviews handoffs.

#### Plan author

Creates and revises classic or managed plans, requirements, limits, risks, gates, and evidence expectations.

#### Reviewer or approver

Reviews an immutable revision, repository binding, limits, and gates, then records approval or rejection.

#### Evidence reviewer

Compares variants, validations, diffs, screenshots, gate evidence, and final audits.

#### System administrator

Maintains service health, scheduler configuration, storage, provider connectivity, retention, security, and upgrades.

#### Auditor

Reviews authenticated actor history, authority transitions, control commands, evidence provenance, and policy decisions.

### 5.2 Required RBAC model

The production control plane should support these permissions:

| Permission area | Viewer | Author | Operator | Approver | Administrator | Auditor |
|---|---:|---:|---:|---:|---:|---:|
| Read runs and redacted evidence | Yes | Yes | Yes | Yes | Yes | Yes |
| Edit draft plans | No | Yes | Optional | No | Yes | No |
| Submit for review | No | Yes | Optional | No | Yes | No |
| Approve or reject revisions | No | No | No | Yes | Yes | No |
| Launch approved work | No | No | Yes | Optional | Yes | No |
| Pause, hold, resume, stop | No | No | Yes | No | Yes | No |
| Manage queue and gates | No | Optional | Yes | Optional | Yes | No |
| Configure schedules and budgets | No | No | No | No | Yes | No |
| View unredacted sensitive output | No | No | Optional | No | Yes | Optional |
| Export audit records | No | No | No | No | Yes | Yes |

Current backend status: RBAC and authentication do not exist and must be implemented before non-local or multi-user operation.

### 5.3 High-risk action policy

Approval, launch, immediate cancellation, destructive cleanup, retention deletion, secret access, and future promotion operations require:

- authenticated server-derived actor identity;
- role authorization;
- a current-state recheck immediately before mutation;
- a human-readable reason for destructive actions;
- an idempotency key;
- an audit record containing before and after state;
- optional re-authentication or two-person approval by policy.

## 6. Information Architecture

### 6.1 Primary navigation

1. **Overview**: system disposition, active work, attention queue, and next actions.
2. **Work**: plans, launches, and candidate queue.
3. **Runs**: active and historical execution.
4. **Iterations**: managed variants, evaluations, synthesis, and lineage.
5. **Evidence**: gates, artifacts, validation, and cross-run search.
6. **Activity**: events, agents, tool calls, alerts, and incidents.
7. **System**: scheduler, workers, providers, resources, storage, policy, security, and audit.

### 6.2 Persistent global header

The header must include:

- overall disposition: healthy, degraded, unsafe, or unknown;
- active run and current phase;
- admission state: enabled, held, paused, or stopped;
- pending command count;
- projected next hourly tick, clearly labeled non-authoritative until scheduler health is independently verified;
- live connection and data freshness;
- attention count;
- global command menu;
- current environment or host;
- authenticated user and role when authentication exists.

### 6.3 Global command menu

Only typed controls appear:

- request next run;
- hold new admission;
- pause at next checkpoint;
- graceful stop;
- resume admission;
- create plan;
- add queue item;
- add gate;
- acknowledge active incident.

Immediate cancellation must not appear until runner IPC and verified process ownership exist.

### 6.4 Cross-resource identity strip

Plan, launch, run, and iteration pages share a linked strip:

```text
Plan  Revision  Approval  Launch  Request  Run  Iteration
```

Each node shows its ID, state, and integrity status. Missing identities are shown as `Not assigned`, not omitted.

## 7. Overview Page

### 7.1 Five-second questions

The page must make these immediately visible:

- Is work active?
- Is it safe?
- Does an operator need to act?
- What happens next?
- Is telemetry fresh?

### 7.2 Suggested desktop layout

```text
+-----------------------------------------------------------------------+
| Global status | Active run | Admission | Next tick | Live | Commands  |
+----------------------------------------------+------------------------+
| Current work and pipeline                    | Operator attention     |
| 8 columns                                    | 4 columns              |
+----------------------------------------------+------------------------+
| Agents and meaningful activity               | Pending and queued     |
| 7 columns                                    | 5 columns              |
+----------------------------------------------+------------------------+
| Recent outcomes, reliability, duration, resource and cost trends      |
+-----------------------------------------------------------------------+
```

### 7.3 Current work panel

Show:

- project or objective;
- pipeline type;
- run, launch, and iteration IDs;
- current phase and task;
- elapsed time and phase duration;
- latest meaningful activity;
- next safe checkpoint;
- repository, base, branch, and commit where applicable;
- gate summary;
- resource and cost budget progress when available;
- primary `Open run` action.

### 7.4 Attention queue

Sort by severity and actionability:

1. Unconfirmed process cleanup or source mutation.
2. Authentication, integrity, storage, or launch-authority incident.
3. Active blocker or timeout.
4. Missing required evidence or failed gate.
5. Paused or stopped handoff awaiting action.
6. Pending approval or launch conflict.
7. Stale runner, scheduler, event stream, or agent telemetry.
8. Disk, cost, or quota warning.
9. Empty queue or no actionable work.

Each item provides one recommended action, impact, owner, age, and evidence link.

### 7.5 Pipeline display

Classic stages:

```text
Inventory -> Selection -> Repository -> SPEC -> SPEC review -> DEVPLAN
-> DEVPLAN review -> Build -> Validation -> Final audit -> Handoff
```

Managed stages:

```text
Preflight -> Variants -> Evaluation -> Synthesis -> Validation
-> Gate closeout -> Handoff
```

Use a horizontal strip on wide screens and a vertical stepper on narrow screens. Show stage duration, responsible agents, artifacts, retries, and blocker inline.

### 7.6 Overview metrics

When authoritative telemetry exists, show:

- active and queued work;
- completion, block, timeout, and cancellation rates;
- median and percentile run duration;
- phase duration and queue wait;
- validation and gate pass rates;
- current CPU, memory, disk, and process pressure;
- provider token usage, cost, and budget remaining;
- event ingestion lag and SSE client health.

Do not estimate cost or resource use from weak proxies. Hide or label unavailable metrics.

## 8. Work and Planning

### 8.1 Work landing page

Provide three clear entry points:

- **Plans**: governed, exact-revision authority.
- **Launches**: pending, active, and terminal launch transactions. This workspace requires a paginated launch-authority list/detail API; the current API only embeds launches in individual plan details.
- **Candidate queue**: ideas awaiting planning or classic selection.

Do not combine these into a generic job list.

### 8.2 Plans list

Columns:

- title;
- pipeline;
- state;
- current revision;
- current digest short form;
- effective approval;
- active launch;
- source lineage;
- repository;
- update time;
- attention reason.

Filters:

- state;
- pipeline;
- approved or unapproved;
- active launch;
- repository;
- lineage mode;
- date and owner.

Available actions must be state-aware. `Launch` is shown only when the exact current revision has effective approval and launch admission allows it.

### 8.3 Plan creation

The first choice is explicit:

#### Build a new project

Routes to classic execution and does not target an existing repository.

#### Improve an existing repository

Routes to managed execution and requires an absolute repository root, base ref, and resolved base commit before approval.

Plan editor sections:

1. Intent and title.
2. Problem and intended users.
3. Objective and bounded scope.
4. Requirements.
5. Non-goals.
6. Constraints and risks.
7. Repository binding for managed plans.
8. Acceptance gates and evidence paths.
9. Validation expectations.
10. Milestones.
11. Iteration and scope limits.
12. Lineage.
13. Review readiness.

No command, shell, argument, script, executable, environment, or client validation command fields are permitted.

### 8.4 Plan limits

Present hard bounds and enforcement status:

| Limit | Current bound |
|---|---:|
| Plan `maxIterations` | 1-10, currently persisted but does not cause planned managed launches to auto-continue |
| Variants | 1-5 |
| Parallel variants | 1-5, not above variants |
| Accepted features | 1-4 |
| Visual motif changes | 0-1 |
| New sections | 0-1 |
| Stop-after-no-improvement count | 1-3 |

`stopAfterNoImprovement` is accepted in project-plan limits but is not enforced. `minImprovementScore` is not a project-plan field; it exists only in legacy showcase-loop control. Neither currently stops showcase continuation. The UI must separate plan limits from showcase controls and mark these values as non-enforcing until runner support is added.

### 8.5 Gate editor

Each gate includes:

- safe ID;
- description;
- must or should severity;
- required status;
- evidence paths;
- evidence type and schema when backend support is added;
- provenance requirement;
- policy source.

Validate evidence paths as safe, relative, run-local paths. Explain that current managed enforcement checks existence and non-empty content, not semantic correctness.

Governed plan gates and legacy reusable gates must remain visibly distinct. Plan gates have strict schema and safe-path validation; the current reusable-gate API accepts permissive IDs, severities, evidence strings, and updates. A unified editor requires backend allowlists, enums, path validation, optimistic versions, and idempotency for reusable gates.

### 8.6 Revision review

Review is read-only and visually distinct from editing. Show:

- revision and parent revision;
- full digest and copy action;
- diff from the prior revision;
- validation result;
- frozen repository/base commit;
- requirements, exclusions, gates, limits, risks, and milestones;
- previous decisions and launch history;
- assurance and backend warnings.

Approval confirmation must state:

> Approval authorizes launch of this exact revision and digest. It does not establish completion, promote code, or authorize later edits.

Saving an edit after approval must warn that a new child revision will not inherit effective approval.

### 8.7 Launch confirmation and monitor

Before launch, show:

- exact plan, revision, and digest;
- approval and approver;
- pipeline;
- repository and base commit;
- limits and gates;
- validation policy;
- no-override statement;
- no automatic merge, push, deploy, or publish statement;
- idempotency behavior;
- active-launch conflict, if any.

After submission, open a launch monitor showing `requested`, `running`, `completed`, `paused`, `blocked`, or `rejected`. Do not optimistically invent a run ID before runner claim.

An unclaimed `requested` launch needs a typed `Withdraw pending launch` operation. Withdrawal must bind the exact launch identity, recheck that no run has claimed it, transition it idempotently to a terminal state, release the global active-launch slot, and write an audit record. This is separate from cancellation of running work and requires an API over the launch authority.

### 8.8 Planning assistant

Planning assistance is an advanced, clearly separated pre-draft feature:

- disclose that text can be sent to the configured inference provider;
- warn against secrets;
- show enabled tools accurately;
- preserve bounded conversation history;
- validate structured proposals;
- require an explicit `Create draft from proposal` action;
- grant no approval, launch, control, terminal, or file authority.

## 9. Queue, Steering, and Scheduling

### 9.1 Candidate queue

Queue items show:

- title and objective;
- context and constraints;
- priority and rank;
- target repository;
- referenced gates;
- source;
- status;
- pin state;
- hold/defer reason;
- age and owner.

Core actions:

- add;
- edit, requiring backend support;
- rank or reorder, requiring backend support;
- pin;
- unpin, requiring explicit backend support;
- convert to plan;
- archive;
- clear queue with a complete impact preview and strong confirmation.

Current queue clearing also removes the pin, current objective, pending next-run request, requested-run-now flag, and queue-linked steering. The confirmation must enumerate every affected resource. The preferred backend design separates deleting queue items from cancelling pending admission, objective, and steering state.

Explain that a queue item is a candidate, not a durable executable job, and that non-pinned selection may be performed by Hermes rather than deterministic scheduling.

### 9.2 Steering

Steering directives include:

- text;
- scope;
- priority;
- target run or next run;
- creation and expiration;
- status;
- authority source.

The UI must not imply that steering can rewrite an approved plan or that active classic sessions will consume new steering immediately.

### 9.3 Scheduler

The system page must show the current fixed hourly scheduler and runner freshness. A full scheduler should add:

- named schedules;
- one-time and recurring execution;
- timezone and daylight-saving behavior;
- enable or disable state;
- maintenance windows;
- priority;
- repository concurrency keys;
- rate and cost limits;
- next and previous fire times;
- missed-tick policy;
- schedule audit history.

This requires a scheduler service and durable schedule API. Current `run-now` only requests admission on a future runner invocation.

## 10. Runs

### 10.1 Runs list

Columns:

- run ID and start time;
- project or objective;
- classic or managed pipeline;
- current or terminal state;
- phase;
- duration;
- gate result;
- assurance level;
- plan, launch, and iteration relationships;
- resource and cost total;
- handoff status;
- attention indicator.

Filters:

- active, held, blocked, completed, rejected, or timed out;
- classic or managed;
- planned or unplanned;
- gate status;
- assurance level;
- repository;
- date range;
- timeout or cleanup uncertainty;
- owner and initiator.

### 10.2 Run detail tabs

1. **Overview**: status, objective, identities, timing, blocker, and recommended action.
2. **Pipeline**: stages, checkpoints, durations, and retries.
3. **Agents**: roles, tasks, statuses, and activity.
4. **Activity**: correlated events and tool calls.
5. **Evidence**: gates, validations, audits, and provenance.
6. **Artifacts**: safe previews and metadata.
7. **Logs**: searchable bounded output.
8. **Resources**: CPU, memory, disk, provider usage, and cost.
9. **Handoff**: result or recovery instruction.
10. **Raw**: sanitized structured records and schema versions.

### 10.3 Run summary

Show:

- current disposition and phase;
- current and next checkpoint;
- objective;
- pipeline;
- start, elapsed, completed, and last activity times;
- repository, base, branch, and commit;
- source branch integrity result;
- quality gate and validation status;
- assurance level;
- blocker owner and scope;
- pending controls;
- primary recommended action.

### 10.4 Control behavior

| Control | Required presentation |
|---|---|
| Hold admission | Required design: prevents future runs without affecting active work. Current `hold` also requests checkpoint pause for active managed work and has no live effect on classic work, so the UI must label it `Hold and pause managed work` until backend intents are separated |
| Pause | Takes effect at the next supported managed checkpoint |
| Graceful stop | Ends at a checkpoint and preserves evidence |
| Resume | Clears hold, pause, or stop intent for future admission |
| Request run | Does not bypass locks, active work, or admission policy |
| Cancel now | Hidden until runner IPC can safely terminate owned process groups |

After a command, show three distinct states:

```text
Submitted -> Accepted as intent -> Effective at checkpoint
```

### 10.5 Canonical dispositions

The control plane needs a normalized, resource-specific disposition model rather than assuming raw status strings are interchangeable:

| UI disposition | Current source mapping |
|---|---|
| Paused | Run `on-hold` plus pause hold kind or handoff state; launch `paused` |
| Stopped | Run `on-hold` plus stop hold kind or handoff disposition; planned launch may still be `paused` |
| Timed out | Run `blocked` plus structured timeout evidence |
| Rejected before claim | Launch `rejected`; no run exists |
| Rejected after scaffold | Run/lifecycle blocker or rejection evidence |
| Held admission | Control projection, not necessarily a run state |

Filters and badges must use this normalized mapping, retain the raw resource status, and explain derivation. Backend schemas should eventually expose canonical dispositions directly.

### 10.6 Retries and attempts

A proper control plane needs first-class task and attempt records. Add:

- retryable versus terminal error classes;
- attempt count and history;
- max attempts;
- backoff and next retry time;
- retry stage or retry from checkpoint;
- dead-letter disposition;
- operator-supplied retry reason;
- preserved logical task identity with a new attempt identity.

Current backend status: execution retries are not implemented. The dashboard must not offer a fake retry button that merely duplicates a run.

## 11. Agents, Tasks, and Tool Calls

### 11.1 Agent inventory

Group agents by function:

- orchestration;
- inventory and selection;
- specification and review;
- planning;
- implementation;
- testing and documentation;
- managed variants;
- evaluators;
- synthesis;
- deblocking and final audit.

### 11.2 Agent row

Show:

- stable ID and label;
- role;
- status;
- phase;
- current task;
- latest meaningful message;
- last update and freshness;
- current artifact;
- runtime, turn, token, and cost totals when available;
- tool call counts;
- log link.

Freshness labels are display heuristics, not authoritative failures: `Fresh`, `Quiet`, `Stale`, or `Terminal`.

### 11.3 Agent detail

Show:

- status history;
- task and parent-child relationships;
- event timeline;
- tool calls;
- produced artifacts;
- stdout and stderr;
- model/provider and toolset;
- resource and budget consumption;
- retry attempts;
- process identity for administrators.

### 11.4 Agent controls requiring backend work

- cancel one agent;
- retry one agent;
- pause one agent;
- change priority;
- reassign a task;
- adjust per-agent budget;
- approve a high-risk tool call;
- quarantine an agent output.

Agents are currently telemetry projections, not independently scheduler-owned resources. These controls require a task/attempt model and runner IPC.

### 11.5 Tool-call lifecycle

Correlate by tool-call ID:

```text
Started -> Output updates -> Ended
Started -> Output updates -> Errored
```

Show tool, action, input summary, output summary, duration, result, agent, and evidence. If a terminal event is missing, show `In progress` for active runs and `No terminal telemetry` for terminal runs. Never infer success.

## 12. Activity, Logs, and Traces

### 12.1 Activity timeline

Each event contains:

- timestamp;
- level;
- source;
- type;
- run, iteration, agent, task, and tool IDs;
- message;
- expandable structured data;
- sequence and ingestion state when backend support exists.

Filters:

- severity;
- source;
- event type;
- phase;
- agent;
- tool;
- errors only;
- current run or all runs;
- time range and text.

### 12.2 Live behavior

- Follow live only while the user is at the newest event.
- Scrolling upward suspends follow.
- A fixed `N new events` button returns to live.
- Live updates never move keyboard focus or collapse rows.
- Coalesce repetitive output and heartbeat updates.
- Prioritize blockers, timeouts, controls, gates, and terminal changes.

### 12.3 Event gaps

The client must know whether it is caught up. Required backend additions:

- monotonic event sequence;
- durable cursor;
- explicit `history_gap` response;
- retention boundary;
- resynchronization token.

The current bounded JSONL tail silently falls back to recent events when a cursor leaves cache. Until fixed, the UI must label reconnects as potentially incomplete and reload authoritative projections.

### 12.4 Logs

Required log experience:

- stream or tail with follow control;
- search, level filter, and agent/process filter;
- line numbers and timestamps where available;
- ANSI-safe rendering;
- wrapping toggle;
- truncation and redaction indicators;
- download subject to permission and size policy;
- links from errors to related events and artifacts;
- retention and byte usage.

Backend additions needed:

- structured global runner/service logs;
- indexed search;
- pagination or byte ranges;
- rotation and retention;
- storage-level redaction or secret-safe capture;
- checksums and provenance.

### 12.5 Tracing

Add spans for:

- admission;
- plan claim;
- runner stages;
- each variant and evaluator;
- Hermes calls;
- Git operations;
- validation commands;
- gate evaluation;
- projection reconciliation.

Propagate trace context across runner, Hermes, telemetry, and subprocesses. Render a waterfall view with task relationships. Current IDs help correlation but are not distributed traces.

## 13. Managed Iteration Workspace

### 13.1 Iterations list

Columns:

- objective;
- status;
- repository and base commit;
- generation counters;
- source run or iteration;
- variant count;
- winning variant;
- best score;
- gate result;
- accepted branch and commit;
- update time.

### 13.2 Iteration detail layout

```text
[Objective, limits, generation, status, controls]
[Lineage and immutable launch context]
[Variant comparison matrix]
[Synthesis and accepted direction]
[Validation and gate evidence]
[Handoff and next action]
```

### 13.3 Variant comparison matrix

Use variants as columns and these criteria as rows:

- objective fit;
- user value;
- visual quality;
- implementation quality;
- accessibility;
- performance;
- total score;
- hard-gate violations;
- recommendation;
- validation status;
- scope budget compliance.

Use aligned horizontal bars or dot plots with exact values. Do not use radar charts as the primary comparison.

A high score never overrides a hard-gate violation or non-accept recommendation.

### 13.4 Variant detail

Show:

- claim and title;
- objective mapping;
- branch and commit;
- changes and accepted feature claims;
- risks;
- artifact and diff links;
- budget use;
- validation results;
- evaluator rationale and evidence;
- stdout and stderr;
- provider and cost when available.

### 13.5 Synthesis

Show:

- winner;
- score and eligibility;
- selection rationale;
- accepted and rejected features;
- winner and synthesis branches and commits;
- integration strategy;
- synthesis validation;
- source integrity result.

Describe the current strategy honestly as winner selection plus cherry-pick. Reserve multi-variant synthesis language for a future integrator that actually combines compatible changes.

The current synthesis writer derives accepted features from winner `changes` or `features` rather than the required variant `acceptedFeatures` field. Correct and test this artifact contract before treating accepted-feature traceability as authoritative.

### 13.6 Screenshot and visual evidence

When image artifacts exist, provide:

- side-by-side comparison;
- before/after slider;
- synchronized zoom and pan;
- overlay mode;
- viewport and commit metadata;
- keyboard-selectable pairs;
- text alternatives and downloadable originals.

## 14. Evidence, Gates, and Assurance

### 14.1 Evidence center

Group evidence by purpose:

- planning authority;
- repository/source identity;
- variant claims and diffs;
- evaluations;
- synthesis;
- validation;
- acceptance gates;
- final audit;
- handoff;
- failure and timeout evidence;
- logs and traces.

### 14.2 Assurance levels

Every completion and evidence item should expose assurance:

| Level | Meaning |
|---|---|
| Runner-verified | Produced or independently checked by runner policy |
| Agent-attested | Reported by Hermes or a child agent but not independently rerun |
| Operator-attested | Added or decided by an operator |
| Derived projection | Inferred by the API or dashboard from other records |
| Unknown | Provenance cannot be established |

Classic command evidence should default to `Agent-attested`; managed runner-selected validation should be `Runner-verified`.

### 14.3 Gate view

Each gate shows:

- ID and description;
- required or optional;
- must or should severity;
- source definition and snapshotted revision;
- decision;
- required paths;
- per-path presence, size, checksum, type, and provenance;
- decision actor and time;
- semantic verifier when available.

Use specific failure language, for example:

> Failed: `artifacts/accessibility/report.json` is missing or empty.

### 14.4 Validation view

Each command shows:

- runner-selected argument vector;
- start and end time;
- duration;
- exit code;
- timeout and cleanup result;
- bounded stdout and stderr;
- pass or fail;
- persisted artifact;
- assurance level.

The UI must not allow client-provided validation commands.

Current validation records provide arguments, bounded output, exit code, pass/fail, timeout flag, and timeout limit, but do not persist start time, end time, duration, or ordinary cleanup outcome. Those fields require structured validation-attempt records and must display as unavailable until implemented.

### 14.5 Artifact browser

Support safe previews for:

- Markdown;
- JSON tree and raw modes;
- text;
- unified and side-by-side diffs;
- images;
- bounded logs;
- metadata-only unknown binary files.

Security requirements:

- resolve and verify real paths remain under the run root;
- do not follow escaping symlinks;
- do not execute or render artifact HTML as trusted active content;
- apply content security policy and sandboxing;
- show redaction and truncation indicators;
- provide MIME, size, checksum, creation source, and retention metadata;
- require permission for unredacted access.

The current artifact API needs symlink containment hardening and binary-safe metadata/download support.

### 14.6 Evidence traceability

Provide a matrix linking:

```text
Requirement or objective -> Variant claim -> Diff -> Evaluation
-> Synthesis feature -> Validation -> Gate -> Handoff
```

Missing links remain visible. Do not infer proof from narrative text.

## 15. Handoff and Recovery

### 15.1 Completed handoff

Lead with:

- accepted branch and commit;
- base commit;
- winning variant and score;
- gate and validation summary;
- source integrity;
- known risks;
- rollback guidance;
- exact next operator action.

Actions:

- open diff;
- inspect evidence;
- copy review command;
- create continuation draft;
- create fork draft.

There is no automatic promotion action in the core product.

### 15.2 Blocked handoff

Show:

- blocker and owning subsystem;
- failure scope;
- last completed stage and checkpoint;
- timeout and cleanup confirmation;
- preserved worktrees and artifacts;
- whether concurrent work is safe;
- safe recovery action;
- actions that must not be taken.

### 15.3 Pause and stop handoff

Explain:

- the named checkpoint where control became effective;
- preserved evidence and worktrees;
- that a planned launch does not simply resume in place;
- whether continuation requires a new plan revision, review, approval, and launch.

### 15.4 Deblocking

The blocked-run workflow includes:

- current blocker signature;
- direct steering submission;
- optional provider-generated advice with privacy disclosure;
- advice review, approval, or denial;
- stale-advice rejection when the blocker changes;
- conversion to a correctly bound continuation.

Never offer generic recovery against a historical or non-current blocker.

## 16. Resources, Cost, and Budgets

### 16.1 Required resource telemetry

Collect by host, run, stage, task, and agent:

- CPU time and current utilization;
- resident and peak memory;
- disk bytes for worktrees, artifacts, and logs;
- process count and file descriptors;
- network bytes and destinations where policy allows;
- wall-clock duration;
- provider calls, model, input/output tokens, and rate-limit state;
- estimated and billed cost;
- cache usage where applicable.

### 16.2 Budget controls

Allow administrators or plan policy to set:

- max run duration;
- max phase or agent duration;
- max tokens and provider calls;
- max cost per run and per period;
- max disk and artifact size;
- max process count, CPU, and memory;
- max variants, parallelism, and turns;
- network egress policy.

Show budget consumed, forecast, warning threshold, and enforced action. Enforcement belongs in the runner or sandbox, not only the UI.

### 16.3 Capacity and admission

The overview and system pages should show:

- worker availability;
- current capacity;
- repository concurrency conflicts;
- active launch lock;
- queue pressure;
- disk pressure;
- provider rate limits;
- admission reasons.

Current backend enforcement also includes exact plan/approval/launch binding, clean managed repositories, frozen planned base commits, runner-selected validation, variant scope budgets, evaluator eligibility and evidence rules, non-empty contained gate evidence, and source-branch preservation. Missing controls include host resource quotas, provider budgets, repository concurrency across installations, and host-pressure admission.

## 17. Alerts and Incidents

### 17.1 Alert rules

Support rules for:

- run blocked or timed out;
- process cleanup unconfirmed;
- source branch mutation;
- launch integrity rejection;
- runner or scheduler stale;
- state corruption or projection disagreement;
- disk, CPU, memory, or cost threshold;
- gate or validation failure;
- event stream lag;
- provider unavailable or rate-limited;
- repeated failures or retry exhaustion;
- authentication or authorization anomaly.

### 17.2 Notification channels

Add configurable in-app, webhook, email, and collaboration/incident integrations. Every delivery needs retry history and status. Secrets must be referenced from a secrets manager, not stored in dashboard forms as plain configuration.

### 17.3 Incident workflow

An incident contains:

- severity;
- affected resources;
- detected and acknowledged times;
- owner;
- current status;
- evidence links;
- timeline;
- runbook;
- mitigation;
- resolution and follow-up.

The initial release can derive an attention queue from blocked states, but real alerts and incidents require backend persistence and workers.

## 18. System Administration

### 18.1 Health page

Show independent checks for:

- API liveness and readiness;
- state-root readability and writability;
- SQLite integrity and WAL health;
- runner binary and parity;
- Hermes binary and provider connectivity;
- Git availability;
- scheduler freshness;
- active lock owner and validity;
- event and telemetry freshness;
- disk space and inode pressure;
- service version and schema compatibility;
- configuration warnings;
- remote exposure without authentication.

Required endpoints: `/healthz`, `/readyz`, `/version`, and a structured dependency-health API.

### 18.2 Lock and process view

Show:

- runner PID and verified process-start identity;
- lock age and owner token fingerprint;
- current run and process group;
- last heartbeat;
- stale-lock assessment;
- cleanup status.

Do not provide `Delete lock` as a casual action. Recovery must validate process ownership and quarantine stale locks through runner logic.

### 18.3 Storage and retention

Show usage by:

- runs;
- worktrees;
- branches;
- logs;
- artifacts;
- event and audit ledgers;
- planning assistance;
- SQLite and WAL.

Add policies for:

- log rotation;
- event retention;
- artifact retention by outcome;
- archive before delete;
- branch and worktree cleanup;
- protected evidence;
- legal or audit hold;
- dry-run cleanup preview;
- backup and restore.

Cleanup must be a backend-owned audited job that verifies no active references.

### 18.4 Configuration and secrets

Separate:

- runtime configuration;
- policy;
- provider configuration;
- secret references;
- feature flags;
- environment-specific overrides.

Never return secret values after creation. Show scope, owner, last rotation, last use, and health. Agents should receive an allowlisted minimal environment rather than the runner's inherited environment.

### 18.5 Audit

Audit records should include:

- authenticated actor and role;
- action and target;
- request/correlation/idempotency IDs;
- before and after state;
- authorization policy result;
- timestamp, client, and source;
- outcome and error;
- linked plan, launch, run, or incident;
- integrity hash or signature.

Provide search, filters, pagination, export, retention, and tamper detection. Current JSONL audit is useful but not compliance-grade.

## 19. Real-Time Data Model

### 19.1 Client synchronization

Use this sequence:

1. Load an authoritative snapshot and resource versions.
2. Subscribe from the returned event cursor.
3. Apply ordered events idempotently.
4. Periodically reconcile authoritative projections.
5. Detect gaps and perform an explicit resync.

### 19.2 Connection states

Display:

- connecting;
- live;
- reconnecting;
- offline;
- stale snapshot;
- history gap;
- resynchronized.

Preserve route, filters, scroll, selected resources, and expanded rows through reconnects.

### 19.3 Mutation contracts

Every mutation should return:

- command or operation ID;
- accepted/rejected status;
- resource version;
- idempotency result;
- expected execution semantics;
- link to audit record;
- terminal status endpoint or event correlation.

Generic commands currently record but do not enforce idempotency and do not expose command status. This needs backend correction.

## 20. Error, Empty, and Conflict States

### 20.1 Loading

Use stable layout skeletons, not full-page spinners. Load state, events, artifacts, logs, and command results independently.

### 20.2 Empty states

#### No plans

Explain exact-revision governance and offer `Create plan`.

#### No runs

Offer `Create plan`, `Add queue item`, or `Request runner tick` as permitted.

#### No queue items

Explain that unplanned classic work may use governed autonomous selection.

#### No evidence

For active work, state that evidence is not yet produced. For terminal work, label completion as incomplete or blocked rather than assuming success.

#### No handoff

For a terminal managed run, treat a missing handoff as an integrity issue.

### 20.3 Read failures

Keep the last successful data visible with a stale banner, source, age, and retry action. Do not silently replace malformed records with empty defaults.

### 20.4 Version conflicts

For optimistic conflicts, show:

- server revision and version;
- local unsaved change summary;
- comparison;
- reload option;
- explicit creation of a new child revision when valid.

Never overwrite silently.

### 20.5 Artifact errors

Differentiate:

- missing;
- empty;
- unsafe path;
- symlink escape;
- too large;
- redacted;
- truncated;
- unsupported type;
- permission denied;
- checksum mismatch.

## 21. Responsive Layout

### 21.1 Desktop

- Persistent navigation rail.
- Global status header.
- Two- and three-column operational layouts.
- Sticky contextual inspector.
- Side-by-side variant and evidence comparison.
- Dense tables with selectable columns.

### 21.2 Tablet

- Collapsible navigation rail.
- Two-column overview where space permits.
- Editor and review summary in switchable tabs.
- Horizontally scrollable comparison with sticky criterion column.

### 21.3 Mobile

- Compact primary navigation for Overview, Work, Runs, Iterations, and More.
- One major task per screen.
- Vertical identity timeline and pipeline stepper.
- Tables converted to labeled cards.
- Two-variant selector rather than compressed all-variant matrix.
- Full-screen log and artifact readers.
- Sticky action bar with at most one primary and one secondary action.
- Full monitoring and control capability, not a read-only subset.

## 22. Accessibility

Target WCAG 2.2 AA.

Requirements:

- semantic headings, landmarks, tables, and ordered process lists;
- complete keyboard operation;
- visible focus and reliable focus return from dialogs;
- live updates that never steal focus;
- restrained announcements for command outcomes and major state changes;
- no status conveyed by color alone;
- text/table alternatives for every chart and graph;
- support for reduced motion;
- minimum touch targets near 44 by 44 CSS pixels;
- user-controlled log wrapping and density;
- queue reordering alternatives to drag and drop;
- accessible diff and image comparison controls.

## 23. Visual Direction

Use a calm, high-density engineering instrument aesthetic:

- neutral surfaces and strong typography;
- restrained use of status color;
- monospace only for IDs, paths, commits, commands, and logs;
- human-readable labels before schema terms;
- clear separation between approval authority and successful completion;
- subtle activity motion that respects reduced-motion settings;
- no decorative agent avatars, glowing AI motifs, or graph-first home screen.

Suggested status semantics:

| Status | Treatment |
|---|---|
| Draft, idle, queued | Neutral |
| Active | Blue |
| Completed and passed | Green |
| Held, stale, needs evidence | Amber |
| Blocked, failed, unsafe | Red |
| Approved authority | Distinct purple or neutral accent |

## 24. Backend Capability Matrix

Legend:

- **Available**: exposed by current backend or artifacts.
- **Derivable**: can be computed with caveats from existing data.
- **Required**: needs backend authority, instrumentation, or hardening.

| Dashboard capability | Status | Notes |
|---|---|---|
| Current run state and phase | Available | `/api/state` and SSE |
| Event timeline | Available | Bounded JSONL tail; no explicit gap signal |
| Runs and run detail | Available | No pagination or robust filtering |
| Agents and tool calls | Available | Telemetry projections, not controllable tasks |
| Logs and artifacts | Available | Bounded text reads; symlink and binary handling need work |
| Plans, revisions, decisions | Available | Strong immutable revision model |
| Exact approval and launch | Available | SQLite single-active-launch authority |
| Managed iteration detail | Available | Variants, evaluations, synthesis, gates, handoff |
| Queue and steering | Available | Legacy command contracts are permissive; clear queue has broad side effects |
| Governed plan gates | Available | Strict plan schema and safe evidence paths |
| Reusable legacy gates | Required | Reads/writes exist, but backend schema and path hardening are required for a safe unified editor |
| Pause, hold, stop, resume | Available | Declarative; managed checkpoint enforcement only |
| Immediate cancellation | Required | Runner IPC and process ownership needed |
| Per-agent controls and retries | Required | First-class task/attempt model needed |
| Assurance labeling | Derivable | Requires consistent provenance metadata for full fidelity |
| Pipeline durations | Derivable | Better with scheduler-owned stage events |
| Source integrity | Derivable | Runner blocks on change, but success lacks a structured before/after integrity artifact |
| Pending launch withdrawal | Required | Launch authority can reject requested records internally, but no typed API exposes safe withdrawal |
| Cost and token analytics | Required | Provider usage ingestion needed |
| CPU, memory, disk quotas | Required | Instrumentation and enforcement needed |
| Alerts and incidents | Required | Rule engine, persistence, and delivery workers needed |
| Authentication and RBAC | Required | Mandatory before remote/multi-user use |
| Authoritative actor audit | Required | Legacy actor is client-supplied |
| Health/readiness | Required | Current state endpoint is insufficient |
| Durable event cursors | Required | Current cache fallback hides gaps |
| Log search and retention | Required | Files are unindexed and unbounded |
| Artifact provenance/checksums | Required | Current metadata is limited |
| Safe artifact serving | Required | Enforce real-path containment and content safety |
| Custom schedules | Required | Current schedule is fixed cron |
| Multi-host workers | Required | Current runner is single-host and globally locked |
| Cleanup and retention | Required | No automated lifecycle exists |
| Backup, restore, migrations | Required | No formal subsystem exists |
| Deployment and promotion | Out of core scope | Current product ends at manual handoff |

## 25. Backend Work Required Before Full Control-Plane Delivery

### Priority 0: Security and integrity

1. Add authentication, server-derived identity, RBAC, CSRF/origin protection, and rate limiting.
2. Harden artifact and log reads with real-path containment and safe content handling.
3. Stop inheriting unrestricted environment and privileges into agents; add sandbox and secret scoping.
4. Add server-side high-risk action policy and immutable audit identity.
5. Fix installed runner module-resolution packaging and test the installed layout.

### Priority 1: Control authority

1. Add runner IPC and verified immediate cancellation.
2. Add first-class task and attempt resources.
3. Add retry policy, backoff, checkpoint retry, and dead-letter state.
4. Normalize run, launch, request, lifecycle, and control status vocabularies.
5. Unify legacy and planned admission under a clear authority model.
6. Enforce declared safety, duration, and no-improvement controls.
7. Add typed withdrawal for unclaimed launches and separate queue clearing from cancellation of pending intent.
8. Correct synthesis accepted-feature propagation and persist structured source-integrity results.

### Priority 2: Reliability

1. Establish transactional ownership or consistent locking for projections.
2. Surface corruption instead of silently substituting defaults.
3. Add health, readiness, version, and dependency checks.
4. Add storage accounting, retention, cleanup, backup, and restore.
5. Add schema definitions, migrations, OpenAPI, and generated clients.
6. Add durable event sequences and gap detection.

### Priority 3: Observability

1. Emit scheduler, run, stage, task, and command metrics.
2. Record model, token, provider request, and cost data.
3. Add trace context and scheduler-owned spans.
4. Add structured logs, indexing, rotation, and retention.
5. Add evidence checksums, provenance, MIME types, and semantic gate verifiers.

### Priority 4: Operations at scale

1. Add alert rules, notification channels, and incidents.
2. Add durable scheduling and queue claims.
3. Add worker registry, leases, heartbeats, and capacity.
4. Add resource quotas and host-pressure admission.
5. Add environments and policy packs if deployment scope expands.

## 26. Delivery Phases

### Phase 1: Safe local control plane

- Overview and attention queue.
- Plans, revisions, review, approval, and launch.
- A launch workspace after adding a global launch list/detail API and safe pending-launch withdrawal.
- Queue, steering, and gates.
- Runs, pipeline, agents, activity, artifacts, logs, and handoff.
- Managed variant comparison and evidence.
- Existing checkpoint controls with accurate semantics.
- Responsive and accessible baseline.
- Security hardening for artifacts and installed packaging.

### Phase 2: Production operations foundation

- Authentication and RBAC.
- Health/readiness and integrity incidents.
- Typed command status and idempotency.
- Task/attempt model, cancellation, and retries.
- Durable event sequencing.
- Retention and cleanup.
- Formal APIs and schemas.

### Phase 3: Resource and reliability control

- Metrics, traces, structured logs.
- CPU, memory, disk, token, and cost telemetry.
- Budgets and enforced quotas.
- Alerts, notifications, and incidents.
- Custom schedules and maintenance windows.

### Phase 4: Fleet and advanced governance

- Multi-host workers and capacity scheduling.
- Advanced audit integrity.
- Policy packs and templates.
- Cross-run evidence search and analytics.
- True multi-variant synthesis if the runner gains an integrator.
- Environment and promotion workflows only if product scope explicitly expands.

## 27. Acceptance Criteria

The dashboard is complete when an authorized operator can:

1. Determine system safety, admission, scheduler, active work, and freshness within five seconds.
2. Create complete classic and managed plans without executable fields.
3. Review immutable revisions and exact digests.
4. Approve and launch only the current reviewed content.
5. Distinguish plans, launches, requests, runs, iterations, and generations.
6. Monitor phases, agents, tool calls, events, logs, resources, and cost in real time.
7. Understand the assurance and provenance of every completion claim.
8. Pause or stop managed work with explicit checkpoint semantics.
9. Immediately cancel owned work only when verified runner support exists.
10. Compare variants, scores, hard gates, diffs, evidence, and synthesis.
11. Inspect each required gate and exact missing evidence.
12. Verify runner-selected validation and source-branch integrity.
13. Receive a complete terminal handoff for every run outcome, and receive launch-level rejection evidence with recovery guidance when rejection occurs before a run exists.
14. Continue or fork work while preserving lineage and requiring fresh authority.
15. Detect stale data, event gaps, projection disagreement, and storage or process hazards.
16. Manage retention, budgets, alerts, and incidents through audited backend operations.
17. Use critical workflows on desktop, tablet, and mobile.
18. Use all functionality with keyboard and assistive technology.
19. Never encounter an arbitrary browser shell, client-supplied validation execution, or misleading automatic promotion control.
20. Preview the full blast radius of queue clearing and safely withdraw an unclaimed launch without process cancellation.

## 28. Repository Evidence

Primary implementation references shaping this specification:

- `runner/autonomous-project-midnight-runner.ts`: admission, locks, subprocesses, managed variants, evaluators, synthesis, checkpoints, validation, evidence, and recovery.
- `telemetry/telemetry.py`: current state, append-only events, agents, phases, and tool-call lifecycle.
- `dashboard/src/project-plans.ts`: immutable revisions, exact digest approval, optimistic versions, and strict planning schemas.
- `dashboard/src/launch-authority.ts`: SQLite launch admission and single-active-launch authority.
- `dashboard/src/plan-assistance.ts`: bounded pre-draft assistance and provider boundary.
- `dashboard/src/server.ts`: current REST, command, artifact, audit, iteration, and SSE interfaces.
- `prompts/runner-prompt.md`: classic phases, stable roles, delegation, governance, and completion requirements.
- `docs/ARCHITECTURE.md`: bounded contexts, vocabulary, data flow, and managed lifecycle.
- `docs/OPERATIONS.md`: installation, scheduler, timeout, recovery, and cleanup procedures.
- `scripts/smoke-*.{mjs,ts}`: executable evidence for launch, lifecycle, race, timeout, queue, and assistance contracts.

This specification intentionally treats current backend gaps as requirements rather than hiding them with frontend-only affordances.
