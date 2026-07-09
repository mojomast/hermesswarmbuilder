#!/usr/bin/env node
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const repo = resolve(new URL('..', import.meta.url).pathname);
const state = mkdtempSync(join(tmpdir(), 'hsb-dashboard-smoke-'));
const port = 24000 + Math.floor(Math.random() * 1000);
const runId = 'run-fixture';
const runRoot = join(state, 'runs', runId);
mkdirSync(join(runRoot, 'artifacts', 'variants'), { recursive: true });
mkdirSync(join(runRoot, 'artifacts', 'evaluations'), { recursive: true });
mkdirSync(join(runRoot, 'artifacts', 'synthesis'), { recursive: true });
mkdirSync(join(runRoot, 'artifacts', 'iterations'), { recursive: true });
mkdirSync(join(runRoot, 'logs'), { recursive: true });
writeFileSync(join(state, 'events.jsonl'), [
  JSON.stringify({ id: 'evt-1', ts: new Date().toISOString(), level: 'info', type: 'event', message: 'one' }),
  JSON.stringify({ id: 'evt-2', ts: new Date().toISOString(), level: 'info', type: 'event', message: 'two' }),
  JSON.stringify({ id: 'evt-3', ts: new Date().toISOString(), level: 'info', type: 'event', message: 'three' })
].join('\n') + '\n');
writeFileSync(join(state, 'state.json'), JSON.stringify({ schemaVersion: 'apb.state.v1', currentRunId: runId, status: 'completed', phase: 'completed', agents: {} }, null, 2));
writeFileSync(join(state, 'control.json'), JSON.stringify({ schemaVersion: 'apb.control.v1', activeSteering: [], autoIteration: { enabled: false, maxVariantsPerIteration: 3 } }, null, 2));
writeFileSync(join(state, 'queue.json'), JSON.stringify({ schemaVersion: 'apb.queue.v1', items: [] }, null, 2));
writeFileSync(join(state, 'gates.json'), JSON.stringify({ schemaVersion: 'apb.gates.v1', gates: [{ id: 'gate-1', description: 'fixture gate', decisions: [] }] }, null, 2));
writeFileSync(join(runRoot, 'run.json'), JSON.stringify({ id: runId, status: 'completed', startedAt: new Date().toISOString(), repoPath: '/tmp/example', objective: 'Fixture objective' }, null, 2));
writeFileSync(join(runRoot, 'iteration-state.json'), JSON.stringify({ id: `iter-${runId}`, runId, status: 'completed', objective: 'Fixture objective' }, null, 2));
writeFileSync(join(runRoot, 'artifacts', 'iterations', 'iteration.json'), JSON.stringify({ id: `iter-${runId}`, runId, objective: 'Fixture objective' }, null, 2));
writeFileSync(join(runRoot, 'artifacts', 'source-evidence.json'), JSON.stringify({ sourceRunId: null, note: 'fixture' }, null, 2));
writeFileSync(join(runRoot, 'artifacts', 'variants', 'variant-1.json'), JSON.stringify({ variantId: 'variant-1', title: 'Hero timeline', changes: ['timeline'] }, null, 2));
writeFileSync(join(runRoot, 'artifacts', 'evaluations', 'evaluation-variant-1.json'), JSON.stringify({ variantId: 'variant-1', scores: { total: 88, objectiveFit: 90 }, recommendation: 'accept' }, null, 2));
writeFileSync(join(runRoot, 'artifacts', 'synthesis', 'synthesis.json'), JSON.stringify({ winnerVariantId: 'variant-1', acceptedFeatures: ['timeline'], rejectedFeatures: [] }, null, 2));
writeFileSync(join(runRoot, 'artifacts', 'gate-decisions.json'), JSON.stringify([{ gateId: 'gate-1', status: 'passed' }], null, 2));
writeFileSync(join(runRoot, 'artifacts', 'gate-report.json'), JSON.stringify({ status: 'passed', commands: [] }, null, 2));
writeFileSync(join(runRoot, 'logs', 'hermes.stdout.log'), 'fixture log');

const child = spawn('bun', ['src/server.ts'], { cwd: join(repo, 'dashboard'), env: { ...process.env, AUTONOMOUS_PROJECTS_STATE_ROOT: state, AUTONOMOUS_PROJECTS_DASHBOARD_ROOT: join(repo, 'dashboard'), AUTONOMOUS_PROJECTS_DASHBOARD_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
const base = `http://127.0.0.1:${port}`;
async function waitReady() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(base + '/api/state'); if (r.ok) return; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('dashboard did not become ready');
}
async function get(path) { const r = await fetch(base + path); if (!r.ok) throw new Error(`${path} ${r.status}: ${await r.text()}`); return r.json(); }
async function post(type, payload) { const r = await fetch(base + '/api/commands', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type, actor: 'smoke', payload }) }); if (!r.ok) throw new Error(`${type} ${r.status}: ${await r.text()}`); return r.json(); }
try {
  await waitReady();
  const events = await get('/api/events?after=missing&limit=2');
  if (events.length !== 2 || events[0].id !== 'evt-2') throw new Error('event cursor recovery failed');
  const iterations = await get('/api/iterations');
  if (!iterations.items?.some(x => x.runId === runId)) throw new Error('iteration node missing');
  const detail = await get(`/api/iterations/iter-${runId}`);
  if (detail.schemaVersion !== 'apb.iteration-detail.v1') throw new Error('detail schema missing: '+JSON.stringify(detail).slice(0,500));
  if (!detail.variants?.length || !detail.evaluations?.length || !detail.synthesis || !detail.gateDecisions?.length) throw new Error('detail artifacts missing');
  await post('continue-from-iteration', { runId, objective: 'continue fixture' });
  const control = JSON.parse(readFileSync(join(state, 'control.json'), 'utf8'));
  if (!control.nextRunRequest || !control.requestedRunNow) throw new Error('nextRunRequest not persisted');
  await post('gate-decision', { gateId: 'gate-1', runId, status: 'passed', evidenceArtifacts: ['artifacts/gate-report.json'] });
  const gateArtifact = JSON.parse(readFileSync(join(runRoot, 'artifacts', 'gate-decisions.json'), 'utf8'));
  if (!gateArtifact.find(x => x.evidenceArtifacts?.includes('artifacts/gate-report.json'))) throw new Error('run gate decision artifact not updated');
  console.log('smoke-dashboard-iteration ok');
} finally {
  child.kill('SIGTERM');
  rmSync(state, { recursive: true, force: true });
}
