#!/usr/bin/env node
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repo = resolve(new URL('..', import.meta.url).pathname);
const writeJson = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2));

function runCase({ name, lifecycleState, control, expectedState, expectedRun, expectedAgentStatus, expectRestartBlock = false }) {
  const home = mkdtempSync(join(tmpdir(), `hsb-runner-stale-active-${name}-`));
  const root = join(home, 'state');
  const runId = `run-${name}`;
  const runRoot = join(root, 'runs', runId);
  try {
    mkdirSync(join(runRoot, 'artifacts'), { recursive: true });
    writeJson(join(root, 'state.json'), {
      schemaVersion: 'apb.state.v1', currentRunId: runId, status: 'inventory-scanning', phase: 'inventory-scanning', agents: {
        orchestrator: { id: 'orchestrator', status: 'running' }
      }
    });
    writeJson(join(runRoot, 'run.json'), { id: runId, runId, status: 'inventory-scanning', phase: 'inventory-scanning' });
    if (lifecycleState) writeJson(join(runRoot, 'lifecycle-contract.json'), { schemaVersion: 'apb.managed-lifecycle.v1', state: lifecycleState, terminalAt: '2026-08-20T00:00:00.000Z' });
    writeJson(join(root, 'control.json'), { schemaVersion: 'apb.control.v1', runAdmission: 'enabled', pause: { requested: false }, stop: { requested: false }, activeSteering: [], requestedRunNow: false, nextRunRequest: null, autoIteration: { enabled: false }, ...control });
    writeJson(join(root, 'queue.json'), { schemaVersion: 'apb.queue.v1', items: [] });
    writeJson(join(root, 'gates.json'), { schemaVersion: 'apb.gates.v1', gates: [] });
    writeFileSync(join(root, 'runner-prompt.md'), 'fixture prompt\n');
    writeFileSync(join(root, 'telemetry.py'), '# fixture\n');

    const result = spawnSync('bun', ['runner/autonomous-project-midnight-runner.ts'], {
      cwd: repo,
      env: { ...process.env, HOME: home, AUTONOMOUS_PROJECT_STATE_ROOT: root, HERMES_BIN: join(home, 'missing-hermes') },
      encoding: 'utf8'
    });
    if (result.status !== 0) throw new Error(`${name}: runner exited ${result.status}: ${result.stderr || result.stdout}`);
    const state = JSON.parse(readFileSync(join(root, 'state.json'), 'utf8'));
    const run = JSON.parse(readFileSync(join(runRoot, 'run.json'), 'utf8'));
    if (state.status !== expectedState || state.phase !== expectedState) throw new Error(`${name}: expected state ${expectedState}, got ${state.status}/${state.phase}`);
    if (run.status !== expectedRun || run.phase !== expectedRun) throw new Error(`${name}: expected run ${expectedRun}, got ${run.status}/${run.phase}`);
    if (expectedAgentStatus && state.agents?.orchestrator?.status !== expectedAgentStatus) throw new Error(`${name}: expected reconciled orchestrator ${expectedAgentStatus}, got ${state.agents?.orchestrator?.status}`);
    if (expectRestartBlock && !String(run.block?.reason || '').includes('restarted')) throw new Error(`${name}: interrupted run did not record restart reconciliation`);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

// Simulates a crash after terminal lifecycle persistence but before global state/run.json persistence.
runCase({ name: 'completed-lifecycle', lifecycleState: 'completed', expectedState: 'completed', expectedRun: 'completed' });
runCase({ name: 'paused-lifecycle', lifecycleState: 'paused', expectedState: 'on-hold', expectedRun: 'on-hold', expectedAgentStatus: 'on-hold' });
runCase({ name: 'stopped-lifecycle', lifecycleState: 'stopped', expectedState: 'on-hold', expectedRun: 'on-hold', expectedAgentStatus: 'on-hold' });
runCase({ name: 'blocked-lifecycle', lifecycleState: 'blocked', expectedState: 'blocked', expectedRun: 'blocked' });
// Control dispositions run after interrupted ownership is reconciled, so neither leaves a stale active run.
runCase({ name: 'paused-admission', control: { runAdmission: 'paused', pause: { requested: true, reason: 'fixture pause' } }, expectedState: 'on-hold', expectedRun: 'blocked', expectRestartBlock: true });
runCase({ name: 'stopped-admission', control: { stop: { requested: true, reason: 'fixture stop' } }, expectedState: 'on-hold', expectedRun: 'blocked', expectRestartBlock: true });

console.log('smoke-runner-stale-active-reconciliation ok');
