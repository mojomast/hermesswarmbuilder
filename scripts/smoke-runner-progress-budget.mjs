#!/usr/bin/env node
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repo = resolve(new URL('..', import.meta.url).pathname);
const home = mkdtempSync(join(tmpdir(), 'hsb-runner-progress-smoke-'));
const root = join(home, 'state');
const fakeHermes = join(home, 'fake-hermes.cjs');
const callsPath = join(home, 'calls.jsonl');
mkdirSync(root, { recursive: true });

function writeJson(path, value) { writeFileSync(path, JSON.stringify(value, null, 2)); }
function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')); }
function runRunner() {
  const result = spawnSync('bun', ['runner/autonomous-project-midnight-runner.ts'], {
    cwd: repo,
    env: {
      ...process.env,
      HOME: home,
      AUTONOMOUS_PROJECT_STATE_ROOT: root,
      HERMES_BIN: fakeHermes,
      FAKE_HERMES_CALLS: callsPath,
      APB_DISABLE_AUTO_CONTINUATION: '1',
    },
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(`runner failed: ${result.stderr || result.stdout}`);
}
function calls() {
  if (!existsSync(callsPath)) return [];
  return readFileSync(callsPath, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
}

writeFileSync(fakeHermes, `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_HERMES_CALLS, JSON.stringify({args}) + '\\n');
const root = process.env.AUTONOMOUS_PROJECT_STATE_ROOT;
const runId = process.env.AUTONOMOUS_PROJECT_RUN_ID;
const statePath = path.join(root, 'state.json');
const runPath = path.join(root, 'runs', runId, 'run.json');
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
state.status = 'on-hold';
state.phase = 'on-hold';
state.hold = {reason: 'fixture authority unchanged', owner: 'fixture'};
state.lastAction = 'Fixture preserved a truthful hold.';
fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
const run = JSON.parse(fs.readFileSync(runPath, 'utf8'));
run.status = 'on-hold';
run.phase = 'on-hold';
fs.writeFileSync(runPath, JSON.stringify(run, null, 2));
fs.writeFileSync(path.join(root, 'runs', runId, 'artifacts', 'final-audit.md'), '# Final audit\\n\\nON HOLD: fixture authority unchanged.\\n');
process.exit(0);
`);
chmodSync(fakeHermes, 0o755);

writeJson(join(root, 'state.json'), {schemaVersion:'apb.state.v1', currentRunId:null, status:'idle', phase:'idle', agents:{}});
writeJson(join(root, 'control.json'), {
  schemaVersion:'apb.control.v1', runAdmission:'enabled', pause:{requested:false}, stop:{requested:false},
  pinnedQueueItemId:'held-project', currentObjective:{text:'Finish held project',queueItemId:'held-project'},
  activeSteering:[{id:'old-next',scope:'next_run',priority:'required',text:'Start Held Project now',expires:{type:'until_removed'}}],
  nextRunRequest:null, requestedRunNow:false, autoIteration:{enabled:false,completedGenerations:10,targetGenerations:10,stopReason:'target-generations-reached'}
});
writeJson(join(root, 'queue.json'), {schemaVersion:'apb.queue.v1',items:[{id:'held-project',status:'pinned',priority:100,title:'Held Project',objective:'Repeat no more',target:{preferredRepo:join(home,'held-project')}}]});
writeJson(join(root, 'gates.json'), {schemaVersion:'apb.gates.v1',gates:[]});
writeFileSync(join(root, 'runner-prompt.md'), 'Build one genuinely actionable project.');
writeFileSync(join(root, 'telemetry.py'), '# fixture');

try {
  // First tick: Hermes truthfully holds the pinned project. Runner must preserve
  // that outcome, defer the stale pin, and request one immediate fallback run.
  runRunner();
  let state = readJson(join(root, 'state.json'));
  let control = readJson(join(root, 'control.json'));
  let queue = readJson(join(root, 'queue.json'));
  let callRows = calls();
  if (callRows.length !== 1) throw new Error(`expected one Hermes call, got ${callRows.length}`);
  if (state.status !== 'on-hold') throw new Error(`truthful hold was overwritten: ${state.status}`);
  if (control.pinnedQueueItemId !== null) throw new Error('held pin was not cleared');
  if (control.currentObjective !== null) throw new Error('completed/held pinned objective was not cleared');
  if (control.requestedRunNow !== true) throw new Error('fallback continuation was not requested');
  if (queue.items[0].status !== 'held') throw new Error(`queue item was not deferred: ${queue.items[0].status}`);
  if (control.activeSteering.some((x) => x.id === 'old-next')) throw new Error('consumed next-run steering remained active');
  const firstRun = readdirSync(join(root, 'runs')).sort()[0];
  const gatePath = join(root, 'runs', firstRun, 'artifacts', 'gate-report.json');
  if (existsSync(gatePath) && readJson(gatePath).status === 'passed') throw new Error('runner fabricated a passed gate for held work');
  const argv = callRows[0].args;
  const turnIndex = argv.indexOf('--max-turns');
  if (turnIndex < 0 || argv[turnIndex + 1] !== '24') throw new Error(`classic max-turn budget is not 24: ${argv.join(' ')}`);
  if (!argv.includes('--ignore-rules')) throw new Error('scheduled workflow did not use isolated lean context');

  // Second tick: the explicit fallback request bypasses held-state suppression,
  // and the prompt must not force the deferred project again.
  runRunner();
  callRows = calls();
  if (callRows.length !== 2) throw new Error(`fallback did not launch exactly once: ${callRows.length}`);
  const secondArgs = callRows[1].args;
  const queryIndex = secondArgs.indexOf('--query');
  const query = queryIndex >= 0 ? secondArgs[queryIndex + 1] : '';
  if (!query.includes('Do not select held/deferred queue items')) throw new Error('fallback prompt lacks held-item exclusion');
  control = readJson(join(root, 'control.json'));
  if (control.requestedRunNow) throw new Error('one-shot fallback request was not consumed');

  // Third unchanged tick: no pin, no request, same hold fingerprint => zero LLM.
  runRunner();
  if (calls().length !== 2) throw new Error('unchanged held fallback spent another model call');
  const admission = readJson(join(root, 'runner-admission.json'));
  if (admission.disposition !== 'held-unchanged' || admission.suppressedTickCount < 1) throw new Error('held-state suppression receipt missing');

  console.log('smoke-runner-progress-budget ok');
} finally {
  rmSync(home, {recursive:true, force:true});
}
