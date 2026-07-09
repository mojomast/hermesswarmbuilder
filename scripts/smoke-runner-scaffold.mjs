#!/usr/bin/env node
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repo = resolve(new URL('..', import.meta.url).pathname);
const home = mkdtempSync(join(tmpdir(), 'hsb-runner-smoke-home-'));
const root = join(home, '.hermes', 'autonomous-projects');
const target = join(home, 'fixture-repo');
mkdirSync(root, { recursive: true });
mkdirSync(target, { recursive: true });
spawnSync('git', ['init'], { cwd: target, stdio: 'ignore' });
spawnSync('git', ['config', 'user.email', 'smoke@example.test'], { cwd: target, stdio: 'ignore' });
spawnSync('git', ['config', 'user.name', 'Smoke Test'], { cwd: target, stdio: 'ignore' });
writeFileSync(join(target, 'README.md'), '# Fixture\n');
spawnSync('git', ['add', 'README.md'], { cwd: target, stdio: 'ignore' });
spawnSync('git', ['commit', '-m', 'initial fixture'], { cwd: target, stdio: 'ignore' });
writeFileSync(join(root, 'state.json'), JSON.stringify({ schemaVersion: 'apb.state.v1', status: 'idle', phase: 'idle', agents: {} }, null, 2));
writeFileSync(join(root, 'control.json'), JSON.stringify({ schemaVersion: 'apb.control.v1', runAdmission: 'enabled', activeSteering: [], requestedRunNow: true, nextRunRequest: { id: 'req-smoke', status: 'pending', type: 'continue', repoPath: target, objective: 'Smoke scaffold iteration', limits: { maxVariantsPerIteration: 2, maxParallelVariants: 2 } }, autoIteration: { enabled: false, maxIterations: 1, maxVariantsPerIteration: 2, maxParallelVariants: 2, maxAcceptedFeatures: 2, maxVisualMotifChanges: 1, maxNewSections: 1 } }, null, 2));
writeFileSync(join(root, 'queue.json'), JSON.stringify({ schemaVersion: 'apb.queue.v1', items: [] }, null, 2));
writeFileSync(join(root, 'gates.json'), JSON.stringify({ schemaVersion: 'apb.gates.v1', gates: [] }, null, 2));
try {
  const res = spawnSync('bun', ['runner/autonomous-project-midnight-runner.ts'], { cwd: repo, env: { ...process.env, HOME: home, HERMES_BIN: join(home, 'missing-hermes') }, encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`runner exited ${res.status}: ${res.stderr || res.stdout}`);
  const runsRoot = join(root, 'runs');
  const runs = readdirSync(runsRoot);
  if (!runs.length) throw new Error('runner did not create a run');
  const runRoot = join(runsRoot, runs[0]);
  for (const rel of ['iteration-state.json', 'artifacts/iterations/iteration.json', 'artifacts/source-evidence.json', 'artifacts/gate-decisions.json']) {
    if (!existsSync(join(runRoot, rel))) throw new Error(`missing scaffold artifact ${rel}`);
  }
  const iter = JSON.parse(readFileSync(join(runRoot, 'iteration-state.json'), 'utf8'));
  if (!iter.limits || iter.requiredArtifacts?.length < 4) throw new Error('iteration contract incomplete');
  const state = JSON.parse(readFileSync(join(root, 'state.json'), 'utf8'));
  if (state.status !== 'blocked') throw new Error('runner smoke expected preflight block after scaffold');
  console.log('smoke-runner-scaffold ok');
} finally {
  rmSync(home, { recursive: true, force: true });
}
