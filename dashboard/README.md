# Autonomous Project Builder Dashboard

Read-only dashboard for monitoring Hermes autonomous project builder runs on the same host as the Hermes instance.

- Service: `autonomous-projects-dashboard.service`
- URL: `http://<hermes-hostname-or-ip>:9200/` or `http://127.0.0.1:9200/`
- State root: `~/.hermes/autonomous-projects`
- Runner: `~/.hermes/scripts/autonomous-project-midnight-runner.ts`

The dashboard does not start builds. The midnight runner owns scheduled execution and writes state/events for this UI.
