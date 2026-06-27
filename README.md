# Hermes Swarm Builder

Hermes Swarm Builder packages a local autonomous-project workflow for a Hermes host: a midnight runner, governed runner prompt, telemetry helper, read-only live dashboard, systemd/cron install scaffolding, and operational docs.

The system lets a Hermes agent run a complete local build cycle later on a schedule:

1. scan prior local builds and project inventory,
2. select a coherent project candidate,
3. create a local repo,
4. generate and review a substantial SPEC,
5. generate and review a substantial DEVPLAN,
6. orchestrate implementation with visible subagents,
7. validate tests/docs/artifacts,
8. publish only completed validated work to an external showcase if configured.

It intentionally does **not** expose arbitrary browser shells, secrets, ROMs, credentials, or runtime artifacts.

## Quick install prompt for a Hermes agent

Copy this prompt into a Hermes agent on the target machine:

```text
Install Hermes Swarm Builder from GitHub and link me to the dashboard.

Repository: https://github.com/mojomast/hermesswarmbuilder

Requirements and constraints:
- Use my normal user account, not root.
- Install source under ~/repos/hermesswarmbuilder unless I specify otherwise.
- Use Bun for the dashboard and runner. If bun is not installed, stop and tell me exactly what is missing.
- Install the dashboard to ~/.hermes/autonomous-projects-dashboard.
- Install state/runtime directories under ~/.hermes/autonomous-projects.
- Install the runner at ~/.hermes/scripts/autonomous-project-midnight-runner.ts.
- Install telemetry.py at ~/.hermes/autonomous-projects/telemetry.py.
- Install runner-prompt.md at ~/.hermes/autonomous-projects/runner-prompt.md.
- Create/enable/start the user systemd service autonomous-projects-dashboard.service on port 9200.
- Add the midnight cron entry for the runner, replacing any old autonomous-project-midnight-runner entry.
- Do not start a full autonomous project run unless I explicitly ask after installation.
- Do not push anything to GitHub.
- Verify with curl -I http://127.0.0.1:9200/ and systemctl --user status autonomous-projects-dashboard.service --no-pager.
- If my hostname is available, give me the dashboard URL as http://HOSTNAME:9200/; otherwise give http://127.0.0.1:9200/.

Commands you may use:
  mkdir -p ~/repos
  cd ~/repos
  git clone https://github.com/mojomast/hermesswarmbuilder.git
  cd hermesswarmbuilder
  ./scripts/install.sh
  ./scripts/add-webhub-card.sh   # only if ~/.hermes/web-hub/index.html exists
```

Expected dashboard link on the Hermes host:

```text
http://<hermes-hostname-or-ip>:9200/
```

Local fallback:

```text
http://127.0.0.1:9200/
```

## What is included

```text
dashboard/       Bun read-only live operations dashboard (5 dynamic views)
runner/          Midnight runner that invokes `hermes chat` with telemetry env vars
telemetry/       Canonical Python telemetry writer for state/events/run mirrors
prompts/         Governed autonomous-builder runner prompt
systemd/         User service template
scripts/         Installer, one-shot runner wrapper, web-hub card helper
docs/            Architecture and operations notes
```

## 🐝 The Builder Swarm: From Idea to Working Product

Hermes Swarm Builder coordinates an autonomous multi-agent swarm to engineer complete software products from start to finish. The system provides flexible idea ingestion alongside a structured subagent pipeline.

### 💡 1. Flexible Idea Selection & Ingestion

Users can either provide their own target project ideas or let the swarm pick autonomously:

* **Custom User-Provided Ideas (Direct Input)**:
  Place your software ideas in `~/.hermes/autonomous-projects/ideas.md` (or `ideas.json` / `idea.txt`). During the selection phase, the `selector` subagent prioritizes your explicit ideas list and picks your target prompt to build.
* **Autonomous Inventory Selection (Autonomous Mode)**:
  If no custom idea file is found, the `selector` subagent scans local skills, repositories, and frameworks (e.g., local game engines or tools under `~/.hermes/skills`), picking an optimal project candidate based on current steering directives.

### ⚙️ 2. The Multi-Agent Swarm Lifecycle

Once an idea is selected, specialized subagents collaborate through strict quality-gated phases:

1. **Selection & Discovery (`selector`)**: Analyzes candidate ideas or local inventory to establish the architecture foundation.
2. **Exhaustive Specification (`spec-author`, `research-reviewer`, `safety-reviewer`, `spec-auditor`)**:
   `spec-author` drafts a comprehensive 3,000+ word technical specification (`SPEC.md`). Reviewer subagents perform safety checks, novelty analysis, and architecture validation before approval.
3. **Competing DevPlans & Reconciliation (`devplan-writer-a`, `devplan-writer-b`, `devplan-reconciler`)**:
   Two writer subagents propose competing step-by-step development plans. The reconciler subagent synthesizes the best approaches into a unified `DEVPLAN.md`.
4. **Parallel Implementation Swarm (`build-orchestrator`, `worker-core`, `worker-cli`, `worker-risk`, `testing-subagent`, `docs-subagent`)**:
   The build orchestrator delegates modules across specialized worker subagents who write code, construct test suites, implement CLI/web interfaces, and author documentation in parallel.
5. **Autonomous Deblocking & Self-Correction (`deblocker`)**:
   If test failures or execution blockers arise during implementation, the `deblocker` subagent diagnoses errors, applies code patches, and validates fixes in real time.
6. **Final Audit & Verification (`final-auditor`)**:
   Validates test suite execution, security constraints, and artifact completion before finalizing the build product.


## Installed runtime layout

The installer copies source into this layout:

```text
~/.hermes/autonomous-projects-dashboard/
  src/server.ts
  public/index.html    (Classic Studio)
  public/matrix.html   (Command Matrix)
  public/timeline.html (Timeline Stream)
  public/console.html  (Developer Console)
  public/*.js
  public/*.css

~/.hermes/autonomous-projects/
  state.json
  events.jsonl
  telemetry.py
  runner-prompt.md
  runs/
  logs/
  artifacts/

~/.hermes/scripts/
  autonomous-project-midnight-runner.ts
```

The dashboard is read-only. It reads `state.json`, `events.jsonl`, run artifacts, and logs. It does not provide arbitrary shell execution.

## Install manually

```bash
git clone https://github.com/mojomast/hermesswarmbuilder.git ~/repos/hermesswarmbuilder
cd ~/repos/hermesswarmbuilder
./scripts/install.sh
```

Optional environment overrides:

```bash
PORT=9300 ./scripts/install.sh
HERMES_HOME=/path/to/hermes-home ./scripts/install.sh
INSTALL_CRON=0 ./scripts/install.sh
INSTALL_SERVICE=0 ./scripts/install.sh
BUN_BIN=/home/me/.bun/bin/bun ./scripts/install.sh
PUBLIC_HOST=<hermes-hostname-or-ip> ./scripts/install.sh
```

Add a card to an existing static local web hub if present:

```bash
./scripts/add-webhub-card.sh
```

## Verify

```bash
systemctl --user status autonomous-projects-dashboard.service --no-pager
curl -I http://127.0.0.1:9200/
crontab -l | grep autonomous-project-midnight-runner
```

Open:

```text
http://127.0.0.1:9200/
```

or on any reachable LAN/VPN/DNS host:

```text
http://<host>:9200/
```

## Running one build manually

The cron runs at midnight. To trigger a run manually after install:

```bash
~/.npm-global/bin/bun ~/.hermes/scripts/autonomous-project-midnight-runner.ts \
  >> ~/.hermes/autonomous-projects/logs/manual-runner-$(date +%Y%m%d-%H%M%S).log 2>&1
```

or from this repository after install:

```bash
./scripts/run-once.sh
```

The dashboard should show a new run under `/api/state` and the run list.

## Dashboard behavior

The dashboard shows:

- top-level workflow phase strip,
- run list,
- agent/subagent list,
- subagent activity stack,
- tool-call lifecycle rows,
- event console,
- SPEC and DEVPLAN preview tabs,
- artifact and log previews,
- raw run JSON.

Live updates use SSE from `/api/stream`. Artifact/log previews are cached client-side per run/file so live refreshes do not flash the preview back to `Loading...` while you are reading.

## Telemetry protocol

`telemetry.py` is the canonical writer. It updates:

- `events.jsonl`
- `state.json`
- `$RUN_ROOT/run.json`

Important commands:

```bash
python3 "$APB_TELEMETRY" set-phase ...
python3 "$APB_TELEMETRY" upsert-agent ...
python3 "$APB_TELEMETRY" tool-start ...
python3 "$APB_TELEMETRY" tool-output ...
python3 "$APB_TELEMETRY" tool-end ...
python3 "$APB_TELEMETRY" tool-error ...
python3 "$APB_TELEMETRY" event ...
python3 "$APB_TELEMETRY" complete ...
```

The helper normalizes state shape, keeps agents keyed by stable id, writes schema versions, caps payloads, and redacts common secrets/tokens/private keys.

## Runner behavior

`runner/autonomous-project-midnight-runner.ts`:

- creates a lock directory so overlapping runs do not start,
- initializes run directories and state,
- invokes `hermes chat --verbose --accept-hooks --source autonomous-project-builder --max-turns 90 --toolsets terminal,file,web,delegation`,
- passes telemetry env vars into the Hermes process,
- streams stdout/stderr into run logs,
- recognizes explicit `APB_TELEMETRY {json}` lines,
- records process start/end/error events,
- avoids clobbering `state.agents` arrays over object state.

## Current project-quality gates

The packaged runner prompt has strong gates to avoid weak AI slop:

- select substantial projects, not generic wrappers or tiny utilities,
- require multi-component systems,
- require substantial SPEC and DEVPLAN documents,
- require reviewed spec/devplan phases,
- require tests, measurable validation, and final audit,
- require generated runtime artifacts to stay out of commits,
- require safe local-only defaults.

The current steering directive in `prompts/runner-prompt.md` asks the next run to select a local game foundation and build a browser game system with:

- web interface,
- full in-app help,
- level/scenario editor,
- 3D graphics layer,
- local level persistence,
- tests for editor, serialization, renderer-safe state, and gameplay integration.

You can edit `~/.hermes/autonomous-projects/runner-prompt.md` after install to steer the next run.

## How this was made

This repository was extracted from an active Hermes build session. The workflow evolved in stages:

1. A dashboard scaffold was created under `~/.hermes/autonomous-projects-dashboard` to visualize autonomous runs without exposing an arbitrary browser shell.
2. A midnight runner was created under `~/.hermes/scripts/autonomous-project-midnight-runner.ts` to start real autonomous-project work later via cron rather than immediately.
3. State files were standardized under `~/.hermes/autonomous-projects`: `state.json`, `events.jsonl`, `runs/`, `logs/`, and `artifacts/`.
4. A Python telemetry helper was added to stop the workflow from relying on ad-hoc model-written JSON. It introduced canonical commands for phases, agents, tool calls, events, completion, redaction, and run mirroring.
5. The dashboard frontend was patched to derive subagents from both `state.agents` and telemetry events, preserve scroll/focus during live updates, and cache artifact/log previews to prevent flashing.
6. The runner prompt was strengthened after early runs produced specs/devplans that were too small. It now requires ambitious project selection, substantial docs, reviewed gates, tests, and measurable validation.
7. The prompt was further steered toward game-based builds with web interface, help, level editor, and 3D graphics after the user requested that direction.
8. This repository was packaged from the source-only pieces, excluding runtime state, logs, generated artifacts, credentials, and local project outputs.

## Safety and privacy

- Do not commit `~/.hermes/autonomous-projects/runs`, logs, artifacts, databases, `.env`, credentials, ROMs, or private generated files.
- The dashboard is read-only and intentionally does not expose arbitrary terminal execution.
- The runner should publish externally only after a completed/validated project if you explicitly wire that behavior.
- Review generated projects before trusting or deploying them.

## License

MIT
