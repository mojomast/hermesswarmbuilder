#!/usr/bin/env node
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repo = resolve(new URL('..', import.meta.url).pathname);
const home = mkdtempSync(join(tmpdir(), 'hsb-runner-classic-completion-'));
const root = join(home, 'state');
const project = join(home, 'fixture-project');
const fakeHermes = join(home, 'fake-hermes.cjs');

function writeJson(path, value) { writeFileSync(path, JSON.stringify(value, null, 2)); }
function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')); }

mkdirSync(root, { recursive: true });
mkdirSync(project, { recursive: true });
writeFileSync(join(project, 'README.md'), '# Fixture Project\n');
for (const args of [['init'], ['config', 'user.email', 'smoke@example.test'], ['config', 'user.name', 'Smoke Test'], ['add', 'README.md'], ['commit', '-m', 'initial fixture']]) {
  const result = spawnSync('git', args, { cwd: project, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
}
const fixtureCommit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: project, encoding: 'utf8' }).stdout.trim();
writeFileSync(fakeHermes, `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.AUTONOMOUS_PROJECT_STATE_ROOT;
const runId = process.env.AUTONOMOUS_PROJECT_RUN_ID;
const runRoot = process.env.AUTONOMOUS_PROJECT_RUN_ROOT;
const statePath = path.join(root, 'state.json');
const runPath = path.join(runRoot, 'run.json');
const artifacts = path.join(runRoot, 'artifacts');
fs.writeFileSync(path.join(artifacts, 'final-audit.md'), [
  '# Final audit',
  'Project: Fixture Project',
  'Repo: ' + process.env.FIXTURE_PROJECT,
  'Commit: ' + process.env.FIXTURE_COMMIT,
  '',
  'Implemented scope: deterministic completion evidence fixture.',
  'Validation: fixture command passed.',
  'Known risks: none in fixture.',
  'Rollback: remove fixture changes.',
  'Next operator action: inspect the handoff.'
].join('\\n'));
fs.writeFileSync(path.join(artifacts, 'gate-report.json'), JSON.stringify({
  schemaVersion: 'apb.gate-report.v1', runId, status: 'passed', repoPath: process.env.FIXTURE_PROJECT,
  commit: process.env.FIXTURE_COMMIT, commands: [{ command: 'fixture-check', exitCode: 0, passed: true }]
}, null, 2));
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
state.status = 'completed'; state.phase = 'completed'; state.currentRunId = runId;
fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
const run = JSON.parse(fs.readFileSync(runPath, 'utf8'));
run.status = 'completed'; run.phase = 'completed';
fs.writeFileSync(runPath, JSON.stringify(run, null, 2));
console.log('APB_TELEMETRY ' + JSON.stringify({ level: 'info', source: 'fixture', type: 'completion-evidence', message: 'fixture completed' }));
`);
chmodSync(fakeHermes, 0o755);
writeJson(join(root, 'state.json'), { schemaVersion: 'apb.state.v1', status: 'idle', phase: 'idle', currentRunId: null, agents: {} });
writeJson(join(root, 'control.json'), { schemaVersion: 'apb.control.v1', runAdmission: 'enabled', pause: { requested: false }, stop: { requested: false }, activeSteering: [], requestedRunNow: true, nextRunRequest: null, autoIteration: { enabled: false } });
writeJson(join(root, 'queue.json'), { schemaVersion: 'apb.queue.v1', items: [] });
writeJson(join(root, 'gates.json'), { schemaVersion: 'apb.gates.v1', gates: [] });
writeFileSync(join(root, 'runner-prompt.md'), readFileSync(join(repo, 'prompts', 'runner-prompt.md'), 'utf8'));
writeFileSync(join(root, 'telemetry.py'), '# fixture telemetry helper\n');

try {
  const result = spawnSync('bun', ['runner/autonomous-project-midnight-runner.ts'], {
    cwd: repo,
    env: { ...process.env, HOME: home, AUTONOMOUS_PROJECT_STATE_ROOT: root, HERMES_BIN: fakeHermes, FIXTURE_PROJECT: project, FIXTURE_COMMIT: fixtureCommit },
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(`runner exited ${result.status}: ${result.stderr || result.stdout}`);
  const state = readJson(join(root, 'state.json'));
  if (state.status !== 'completed' || state.phase !== 'completed') throw new Error(`expected completed state, got ${state.status}/${state.phase}`);
  const runRoot = join(root, 'runs', state.currentRunId);
  const run = readJson(join(runRoot, 'run.json'));
  if (run.status !== 'completed' || run.commit !== fixtureCommit) throw new Error('runner did not preserve completed run evidence');
  const manifestPath = join(runRoot, 'artifacts', 'artifact-manifest.json');
  if (!existsSync(manifestPath)) throw new Error('runner did not write artifact manifest after valid completion evidence');
  const manifest = readJson(manifestPath);
  if (!manifest.artifacts.includes('final-audit.md') || !manifest.artifacts.includes('gate-report.json')) throw new Error('completion manifest is missing required terminal evidence');
  if (state.qualityGate?.status !== 'passed' || state.finalValidation?.status !== 'passed') throw new Error('state does not expose passed gate evidence');
  console.log('smoke-runner-classic-completion ok');
} finally {
  rmSync(home, { recursive: true, force: true });
}
