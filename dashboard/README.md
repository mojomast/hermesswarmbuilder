# Autonomous Project Builder Dashboard

Read-only, multi-view live monitoring system for Hermes autonomous project builder runs on the host machine.

- **Service**: `autonomous-projects-dashboard.service`
- **URL**: `http://<hermes-hostname-or-ip>:9200/` or `http://127.0.0.1:9200/`
- **State root**: `~/.hermes/autonomous-projects`
- **Runner**: `~/.hermes/scripts/autonomous-project-midnight-runner.ts`

## Dynamic Dashboard Views & Real-time Switcher
The dashboard features an integrated real-time **Dashboard View Switcher** in the top navigation bar, allowing users to toggle seamlessly between 4 distinct visualization layouts:

1. **Classic Studio (`/`)**: Multi-pane overview featuring orchestrator status, subagent stack, event console, and resource inspectors.
2. **Command Matrix (`/matrix.html`)**: Cyberpunk high-density observability grid featuring real-time pulse stats, swarm node status matrix, container queries, and tool telemetry tables.
3. **Timeline Stream (`/timeline.html`)**: Chronological pipeline DAG and waterfall event stream with time deltas ($\Delta t$), SVG branch connectors, and bottleneck performance sparkbars.
4. **Developer Console (`/console.html`)**: Terminal/IDE split view with true monospace font ligatures, syntax-highlighted JSON trees, glowing prompt cursors, and instant SPEC/DEVPLAN markdown modal overlays.

The dashboard does not start builds. The midnight runner owns scheduled execution and writes state/events for this UI.

