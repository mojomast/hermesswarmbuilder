#!/usr/bin/env node
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repo = resolve(new URL('..', import.meta.url).pathname);
const home = mkdtempSync(join(tmpdir(), 'hsb-runner-stale-active-'));
const root = join(home, 'state');
const runId = 'run-orphaned';
const runRoot = join(root, 'runs', runId);
const writeJson = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2));

mkdirSync(join(runRoot, 'artifacts'), { recursive: true });
writeJson(join(root, 'state.json'), {
  schemaVersion: 'apb.state.v1', currentRunId: runId, status: 'inventory-scanning', phase: 'inventory-scanning', agents: {
    orchestrator: { id: 'orchestrator', status: 'running' }
  }
});
writeJson(join(runRoot, 'run.json'), { id: runId, runId, status: 'inventory-scanning', phase: 'inventory-scanning' });
writeJson(join(root, 'control.json'), { schemaVersion: 'apb.control.v1', runAdmission: 'enabled', pause: { requested: false }, stop: { requested: false }, activeSteering: [], requestedRunNow: false, nextRunRequest: null, autoIteration: { enabled: false } });
writeJson(join(root, 'queue.json'), { schemaVersion: 'apb.queue.v1', items: [] });
writeJson(join(root, 'gates.json'), { schemaVersion: 'apb.gates.v1', gates: [] });
writeFileSync(join(root, 'runner-prompt.md'), 'fixture prompt\n');
writeFileSync(join(root, 'telemetry.py'), '# fixture\n');

try {
  const result = spawnSync('bun', ['runner/autonomous-project-midnight-runner.ts'], {
    cwd: repo,
    env: { ...process.env, HOME: home, AUTONOMOUS_PROJECT_STATE_ROOT: root, HERMES_BIN: join(home, 'missing-hermes') },
    encoding: 'utf8'
  });
  if (result.status !== 0) throw new Error(`runner exited ${result.status}: ${result.stderr || result.stdout}`);
  const state = JSON.parse(readFileSync(join(root, 'state.json'), 'utf8'));
  const run = JSON.parse(readFileSync(join(runRoot, 'run.json'), 'utf8'));
  if (state.status !== 'blocked' || state.phase !== 'blocked') throw new Error(`orphaned active state remained ${state.status}/${state.phase}`);
  if (run.status !== 'blocked' || run.phase !== 'blocked') throw new Error(`orphaned active run remained ${run.status}/${run.phase}`);
  if (!String(state.block?.reason || '').includes('restarted')) throw new Error('orphaned active state did not record restart reconciliation');
  console.log('smoke-runner-stale-active-reconciliation ok');
} finally {
  rmSync(home, { recursive: true, force: true });
}
