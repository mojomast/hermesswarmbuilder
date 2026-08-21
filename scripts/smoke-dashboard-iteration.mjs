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
const fixtureRepoPath = '/tmp/example';
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
writeFileSync(join(state, 'state.json'), JSON.stringify({ schemaVersion: 'apb.state.v1', currentRunId: runId, status: 'blocked', phase: 'blocked', agents: {} }, null, 2));
writeFileSync(join(state, 'control.json'), JSON.stringify({ schemaVersion: 'apb.control.v1', activeSteering: [], autoIteration: { enabled: false, maxVariantsPerIteration: 3 }, deblockAdvice: [{ id: 'advice-fixture', runId, answer: 'Repair the isolated artifact contract and continue safely.', status: 'pending' }] }, null, 2));
writeFileSync(join(state, 'queue.json'), JSON.stringify({ schemaVersion: 'apb.queue.v1', items: [] }, null, 2));
writeFileSync(join(state, 'gates.json'), JSON.stringify({ schemaVersion: 'apb.gates.v1', gates: [{ id: 'gate-1', description: 'fixture gate', decisions: [] }] }, null, 2));
writeFileSync(join(runRoot, 'run.json'), JSON.stringify({ id: runId, status: 'completed', startedAt: new Date().toISOString(), repoPath: fixtureRepoPath, objective: 'Fixture objective' }, null, 2));
writeFileSync(join(runRoot, 'iteration-state.json'), JSON.stringify({ id: `iter-${runId}`, runId, status: 'completed', objective: 'Fixture objective', repoPath: fixtureRepoPath, baseRef: 'HEAD', limits: { maxIterations: 1, maxVariantsPerIteration: 1, maxParallelVariants: 1, maxAcceptedFeatures: 1, maxVisualMotifChanges: 0, maxNewSections: 0, stopAfterNoImprovement: 1 }, acceptanceGates: [{ id: 'fixture-gate', description: 'fixture gate', severity: 'must', required: true, requiredEvidence: ['artifacts/variants/variant-1.json'] }] }, null, 2));
writeFileSync(join(runRoot, 'artifacts', 'iterations', 'iteration.json'), JSON.stringify({ id: `iter-${runId}`, runId, objective: 'Fixture objective', repoPath: fixtureRepoPath }, null, 2));
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
async function reject(type, payload, status) { const r = await fetch(base + '/api/commands', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type, actor: 'smoke', payload }) }); const body = await r.json(); if (r.status !== status || !body.error) throw new Error(`${type} expected ${status}, received ${r.status}: ${JSON.stringify(body)}`); return body; }
function acceptedCommandCount() { try { return readFileSync(join(state, 'commands.jsonl'), 'utf8').trim().split(/\n/).filter(Boolean).length; } catch { return 0; } }
function acceptedAuditCount() { try { return readFileSync(join(state, 'audit.jsonl'), 'utf8').trim().split(/\n/).filter(Boolean).length; } catch { return 0; } }
try {
  await waitReady();
  const events = await get('/api/events?after=missing&limit=2');
  if (events.length !== 2 || events[0].id !== 'evt-2') throw new Error('event cursor recovery failed');
  const iterations = await get('/api/iterations');
  if (!iterations.items?.some(x => x.runId === runId)) throw new Error('iteration node missing');
  const detail = await get(`/api/iterations/iter-${runId}`);
  if (detail.schemaVersion !== 'apb.iteration-detail.v1') throw new Error('detail schema missing: '+JSON.stringify(detail).slice(0,500));
  if (!detail.variants?.length || !detail.evaluations?.length || !detail.synthesis || !detail.gateDecisions?.length) throw new Error('detail artifacts missing');
  if (detail.run?.id !== runId || detail.iterationState?.id !== `iter-${runId}` || detail.iterationArtifact?.data?.id !== `iter-${runId}`) throw new Error('detail lineage envelope missing');
  if (!detail.sourceEvidence || !Array.isArray(detail.artifacts) || !Array.isArray(detail.logs) || detail.redaction?.enabled !== true) throw new Error('detail product envelope incomplete');
  if (!detail.variants[0]._artifact?.path || !detail.evaluations[0]._artifact?.path) throw new Error('artifact metadata missing');
  const invalid = await fetch(base + '/api/commands', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'start-next-iteration', payload: { repoPath: 'relative/repo', objective: '', changeText: '' } }) });
  if (invalid.status !== 400) throw new Error('malformed managed launch request was not rejected early');
  const acceptedBeforeRejections = acceptedCommandCount();
  const auditBeforeRejections = acceptedAuditCount();
  await reject('steer', { text: '   ' }, 400);
  await reject('set-current-objective', { objective: '' }, 400);
  await reject('add-queue-item', { title: 'empty objective', objective: ' ' }, 400);
  await reject('deblock', { runId: 'historical-run', prompt: 'retry' }, 409);
  await reject('deblock-advice', { runId: 'historical-run', prompt: 'assess' }, 409);
  writeFileSync(join(state, 'state.json'), JSON.stringify({ schemaVersion: 'apb.state.v1', currentRunId: runId, status: 'blocked', phase: 'blocked', block: { runId: 'other-run', reason: 'stale blocker' }, agents: {} }, null, 2));
  await reject('deblock', { runId, prompt: 'retry stale blocker' }, 409);
  writeFileSync(join(state, 'state.json'), JSON.stringify({ schemaVersion: 'apb.state.v1', currentRunId: runId, status: 'blocked', phase: 'blocked', agents: {} }, null, 2));
  await reject('remove-steering', { id: 'missing-steering' }, 404);
  await reject('gate-decision', { gateId: 'missing-gate', status: 'passed' }, 404);
  await reject('attach-gate-evidence', { gateId: 'missing-gate', artifacts: ['artifact.json'] }, 404);
  await reject('update-gate', { gateId: 'missing-gate', description: 'missing' }, 404);
  await reject('pin-queue-item', { itemId: 'missing-queue-item' }, 404);
  await reject('archive-queue-item', { itemId: 'missing-queue-item' }, 404);
  writeFileSync(join(state, 'state.json'), JSON.stringify({ schemaVersion: 'apb.state.v1', currentRunId: runId, status: 'building', phase: 'building', agents: {} }, null, 2));
  await reject('deblock', { runId, prompt: 'retry' }, 409);
  writeFileSync(join(state, 'state.json'), JSON.stringify({ schemaVersion: 'apb.state.v1', currentRunId: 'replacement-run', status: 'blocked', phase: 'blocked', agents: {} }, null, 2));
  await reject('approve-deblock-advice', { adviceId: 'advice-fixture' }, 409);
  writeFileSync(join(state, 'state.json'), JSON.stringify({ schemaVersion: 'apb.state.v1', currentRunId: runId, status: 'blocked', phase: 'blocked', agents: {} }, null, 2));
  if (acceptedCommandCount() !== acceptedBeforeRejections) throw new Error('rejected zero-effect commands emitted accepted command records');
  if (acceptedAuditCount() !== auditBeforeRejections) throw new Error('rejected zero-effect commands emitted accepted audit records');
  const arrayGate = await post('add-gate', { id: 'gate-array', description: 'array evidence', requiredEvidence: ['artifacts/one.json', 'artifacts/two.json'] });
  if (arrayGate.gate.requiredEvidence.join(',') !== 'artifacts/one.json,artifacts/two.json') throw new Error('add-gate corrupted array evidence');
  const stringGate = await post('add-gate', { id: 'gate-lines', description: 'line evidence', requiredEvidence: 'artifacts/one.json\nartifacts/two.json' });
  if (stringGate.gate.requiredEvidence.join(',') !== 'artifacts/one.json,artifacts/two.json') throw new Error('add-gate did not split newline evidence');
  await reject('update-gate', { gateId: 'gate-lines', description: 'line evidence' }, 409);
  const sourceLimits = { maxIterations: 1, maxVariantsPerIteration: 1, maxParallelVariants: 1, maxAcceptedFeatures: 1, maxVisualMotifChanges: 0, maxNewSections: 0, stopAfterNoImprovement: 1 };
  await reject('continue-from-iteration', { sourceRunId: 'wrong-run', sourceIterationId: `iter-${runId}`, repoPath: fixtureRepoPath, objective: 'invalid lineage', changeText: 'Do not accept.', limits: sourceLimits }, 400);
  await reject('continue-from-iteration', { sourceRunId: runId, sourceIterationId: `iter-${runId}`, repoPath: fixtureRepoPath, objective: 'invalid limits', changeText: 'Do not accept.', limits: { ...sourceLimits, maxParallelVariants: 2 } }, 400);
  const approved = await post('approve-deblock-advice', { adviceId: 'advice-fixture' });
  if (approved.effective !== 'continuation queued') throw new Error('approved deblock advice did not queue a continuation');
  const approvedControl = JSON.parse(readFileSync(join(state, 'control.json'), 'utf8'));
  if (!approvedControl.nextRunRequest || !approvedControl.requestedRunNow || approvedControl.nextRunRequest.type !== 'continue') throw new Error('approved deblock advice did not persist a managed continuation');
  if (approvedControl.nextRunRequest.limits?.maxNewSections !== 0 || approvedControl.nextRunRequest.limits?.maxVariantsPerIteration !== 1 || approvedControl.nextRunRequest.snapshottedAcceptanceGates?.[0]?.id !== 'fixture-gate') throw new Error('approved deblock advice did not preserve the source iteration contract');
  const deblockingState = JSON.parse(readFileSync(join(state, 'state.json'), 'utf8'));
  if (deblockingState.status !== 'deblocking') throw new Error('approved deblock advice did not leave blocked state for deblocking');
  await post('continue-from-iteration', { sourceRunId: runId, sourceIterationId: `iter-${runId}`, repoPath: fixtureRepoPath, objective: 'continue fixture', changeText: 'Complete one bounded fixture change.', acceptanceGateIds: ['fixture-gate'], snapshottedAcceptanceGates: [{ id: 'fixture-gate', description: 'fixture gate', severity: 'must', required: true, requiredEvidence: ['artifacts/variants/variant-1.json'] }], limits: sourceLimits });
  const control = JSON.parse(readFileSync(join(state, 'control.json'), 'utf8'));
  if (!control.nextRunRequest || !control.requestedRunNow) throw new Error('nextRunRequest not persisted');
  if (control.nextRunRequest.repoPath !== fixtureRepoPath || control.nextRunRequest.sourceIterationId !== `iter-${runId}` || control.nextRunRequest.sourceRunId !== runId) throw new Error('nextRunRequest source context not preserved');
  const commands = readFileSync(join(state, 'commands.jsonl'), 'utf8').trim().split(/\n/).map(JSON.parse);
  const lastCommand = commands.at(-1);
  if (lastCommand.payload.repoPath !== fixtureRepoPath || lastCommand.target.runId !== runId) throw new Error('command payload/target context not preserved');
  await post('gate-decision', { gateId: 'gate-1', runId, status: 'passed', evidenceArtifacts: ['artifacts/gate-report.json'] });
  const gateArtifact = JSON.parse(readFileSync(join(runRoot, 'artifacts', 'gate-decisions.json'), 'utf8'));
  if (!gateArtifact.find(x => x.evidenceArtifacts?.includes('artifacts/gate-report.json'))) throw new Error('run gate decision artifact not updated');
  await post('start-showcase-loop', { sourceRunId: runId, sourceIterationId: `iter-${runId}`, repoPath: fixtureRepoPath, objective: '10 gen fixture catalogue', targetGenerations: 10 });
  const loopControl = JSON.parse(readFileSync(join(state, 'control.json'), 'utf8'));
  if (loopControl.autoIteration?.mode !== 'showcase-loop' || loopControl.autoIteration?.targetGenerations !== 10 || loopControl.autoIteration?.currentGeneration !== 1) throw new Error('showcase loop control not persisted');
  if (loopControl.nextRunRequest?.type !== 'showcase-loop-generation' || loopControl.nextRunRequest?.targetGenerations !== 10 || !loopControl.requestedRunNow) throw new Error('showcase loop request not queued');
  await post('stop-showcase-loop', { reason: 'smoke complete' });
  const stoppedControl = JSON.parse(readFileSync(join(state, 'control.json'), 'utf8'));
  if (stoppedControl.autoIteration?.enabled !== false || stoppedControl.nextRunRequest !== null) throw new Error('showcase stop did not disable loop and clear request');
  console.log('smoke-dashboard-iteration ok');
} finally {
  child.kill('SIGTERM');
  rmSync(state, { recursive: true, force: true });
}
