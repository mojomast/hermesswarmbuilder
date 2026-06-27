# Autonomous Project Builder Dashboard

Read-only Kimi dashboard for monitoring Hermes autonomous project builder runs.

- Service: `autonomous-projects-dashboard.service`
- URL: `http://kimi.tailec998.ts.net:9200/`
- State root: `/home/mojo/.hermes/autonomous-projects`
- Runner: `/home/mojo/.hermes/scripts/autonomous-project-midnight-runner.ts`

The dashboard does not start builds. The midnight runner owns scheduled execution and writes state/events for this UI.
