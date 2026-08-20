#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const repo = resolve(new URL('..', import.meta.url).pathname);
const runner = join(repo, 'runner', 'autonomous-project-midnight-runner.ts');
const state = mkdtempSync(join(tmpdir(), 'hsb-queue-clear-smoke-'));
const port = 25000 + Math.floor(Math.random() * 1000);
const runnerDigest = createHash('sha256').update(readFileSync(runner)).digest('hex');
const writeJson = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2));
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

mkdirSync(state, { recursive: true });
writeJson(join(state, 'state.json'), { schemaVersion: 'apb.state.v1', currentRunId: null, status: 'idle', phase: 'idle', agents: {} });
writeJson(join(state, 'control.json'), {
  schemaVersion: 'apb.control.v1', runAdmission: 'paused',
  pause: { requested: true, mode: 'checkpoint', reason: 'fixture safety pause' },
  stop: { requested: true, mode: 'graceful', reason: 'fixture safety stop' },
  pinnedQueueItemId: 'queue-pinned',
  currentObjective: { text: 'Complete queued fixture', queueItemId: 'queue-pinned' },
  nextRunRequest: { id: 'req-fixture', status: 'pending', queueItemId: 'queue-pinned', objective: 'Complete queued fixture' },
  requestedRunNow: true,
  activeSteering: [
    { id: 'queue-scope', scope: 'queue', text: 'Use queued work' },
    { id: 'queue-id', scope: 'next_run', queueItemId: 'queue-pinned', text: 'Use pinned queued work' },
    { id: 'global', scope: 'global', text: 'Preserve accessibility' }
  ],
  autoIteration: { enabled: false }
});
writeJson(join(state, 'queue.json'), { schemaVersion: 'apb.queue.v1', items: [
  { id: 'queue-pinned', status: 'pinned', title: 'Pinned fixture', objective: 'Complete queued fixture' },
  { id: 'queue-other', status: 'queued', title: 'Queued fixture', objective: 'Later work' }
] });
writeJson(join(state, 'gates.json'), { schemaVersion: 'apb.gates.v1', gates: [] });
writeFileSync(join(state, 'runner-prompt.md'), 'fixture prompt');
writeFileSync(join(state, 'telemetry.py'), '# fixture');

const runnerResult = spawnSync('bun', ['runner/autonomous-project-midnight-runner.ts'], {
  cwd: repo,
  env: { ...process.env, AUTONOMOUS_PROJECT_STATE_ROOT: state, APB_DISABLE_AUTO_CONTINUATION: '1' },
  encoding: 'utf8'
});
if (runnerResult.status !== 0) throw new Error(`paused runner fixture failed: ${runnerResult.stderr || runnerResult.stdout}`);
const parityReceipt = readJson(join(state, 'runner-parity.json'));
if (parityReceipt.sourceDigest !== runnerDigest || parityReceipt.protocol !== 'queue-clear.v1') throw new Error('runner did not write the expected durable parity receipt');

const child = spawn('bun', ['src/server.ts'], {
  cwd: join(repo, 'dashboard'),
  env: { ...process.env, AUTONOMOUS_PROJECTS_STATE_ROOT: state, AUTONOMOUS_PROJECTS_DASHBOARD_ROOT: join(repo, 'dashboard'), AUTONOMOUS_PROJECTS_DASHBOARD_PORT: String(port), AUTONOMOUS_PROJECTS_RUNNER_PATH: runner },
  stdio: ['ignore', 'pipe', 'pipe']
});
const base = `http://127.0.0.1:${port}`;
async function waitReady() {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(base + '/api/state')).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('dashboard did not become ready');
}
async function get(path) { const response = await fetch(base + path); if (!response.ok) throw new Error(`${path} ${response.status}: ${await response.text()}`); return response.json(); }
async function post(type) { const response = await fetch(base + '/api/commands', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type, actor: 'smoke', payload: {} }) }); if (!response.ok) throw new Error(`${type} ${response.status}: ${await response.text()}`); return response.json(); }

try {
  await waitReady();
  if ((await get('/api/capabilities')).runnerParity?.status !== 'compatible') throw new Error('matching durable runner receipt was not reported as compatible');
  const cleared = await post('clear-queue');
  if (cleared.clearedQueueItemCount !== 2 || cleared.clearedSteeringCount !== 2 || cleared.runnerParity?.status !== 'compatible') throw new Error('clear-queue acknowledgement did not report the complete queue-clearing result');
  const control = readJson(join(state, 'control.json'));
  const queue = readJson(join(state, 'queue.json'));
  if (queue.items.length !== 0 || queue.clearHistory?.at(-1)?.items?.length !== 2) throw new Error('queue items were not cleared with recoverable history');
  if (control.pinnedQueueItemId !== null || control.currentObjective !== null || control.nextRunRequest !== null || control.requestedRunNow !== false) throw new Error('queue-linked launch state was not cleared together');
  if (control.activeSteering.map(x => x.id).join(',') !== 'global') throw new Error('queue-linked steering was not cleared while global steering was preserved');
  if (control.steeringHistory?.filter(x => x.status === 'cleared').length !== 2) throw new Error('cleared steering was not retained in history');
  if (!control.pause?.requested || !control.stop?.requested || control.runAdmission !== 'paused') throw new Error('queue clear changed pause/stop safety state');
  writeJson(join(state, 'runner-parity.json'), { ...parityReceipt, sourceDigest: '0'.repeat(64) });
  if ((await get('/api/capabilities')).runnerParity?.status !== 'incompatible') throw new Error('stale runner parity receipt was not detected durably');
  console.log('smoke-queue-clearing ok');
} finally {
  child.kill('SIGTERM');
  rmSync(state, { recursive: true, force: true });
}
