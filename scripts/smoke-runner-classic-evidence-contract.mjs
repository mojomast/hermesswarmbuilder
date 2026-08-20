#!/usr/bin/env node
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repo = resolve(new URL('..', import.meta.url).pathname);
const git = (cwd, args) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
};

function runScenario(name, gate) {
  const home = mkdtempSync(join(tmpdir(), `hsb-runner-evidence-contract-${name}-`));
  const root = join(home, 'state');
  const fakeHermes = join(home, 'fake-hermes.cjs');
  const project = join(home, 'fixture-project');
  const writeJson = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2));
  mkdirSync(root, { recursive: true });
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, 'README.md'), '# Fixture Project\n');
  for (const args of [['init'], ['config', 'user.email', 'smoke@example.test'], ['config', 'user.name', 'Smoke Test'], ['add', 'README.md'], ['commit', '-m', 'initial fixture']]) git(project, args);
  const commit = git(project, ['rev-parse', 'HEAD']);
  writeFileSync(fakeHermes, `#!/usr/bin/env node
const fs=require('node:fs'), path=require('node:path');
const root=process.env.AUTONOMOUS_PROJECT_STATE_ROOT, runId=process.env.AUTONOMOUS_PROJECT_RUN_ID, runRoot=process.env.AUTONOMOUS_PROJECT_RUN_ROOT;
fs.writeFileSync(path.join(runRoot,'artifacts','final-audit.md'),['Project: Fixture','Repo: '+process.env.FIXTURE_PROJECT,'Commit: '+process.env.FIXTURE_COMMIT,'Implemented scope: fixture','Validation: fixture-check','Known risks: none','Rollback: remove fixture','Next operator action: inspect fixture'].join('\\n'));
fs.writeFileSync(path.join(runRoot,'artifacts','gate-report.json'),JSON.stringify({schemaVersion:'apb.gate-report.v1',runId,status:'passed',repoPath:process.env.GATE_REPO==='null'?null:process.env.FIXTURE_PROJECT,commit:process.env.GATE_COMMIT==='null'?null:process.env.FIXTURE_COMMIT,commands:process.env.GATE_COMMANDS==='empty'?[]:[{command:'fixture-check',exitCode:0,passed:true}]}));
for (const p of [path.join(root,'state.json'),path.join(runRoot,'run.json')]) { const x=JSON.parse(fs.readFileSync(p,'utf8')); x.status='completed'; x.phase='completed'; fs.writeFileSync(p,JSON.stringify(x,null,2)); }
`);
  chmodSync(fakeHermes, 0o755);
  writeJson(join(root, 'state.json'), { schemaVersion:'apb.state.v1', status:'idle', phase:'idle', currentRunId:null, agents:{} });
  writeJson(join(root, 'control.json'), { schemaVersion:'apb.control.v1', runAdmission:'enabled', pause:{requested:false}, stop:{requested:false}, activeSteering:[], requestedRunNow:true, nextRunRequest:null, autoIteration:{enabled:false} });
  writeJson(join(root, 'queue.json'), { schemaVersion:'apb.queue.v1', items:[] });
  writeJson(join(root, 'gates.json'), { schemaVersion:'apb.gates.v1', gates:[] });
  writeFileSync(join(root, 'runner-prompt.md'), readFileSync(join(repo, 'prompts', 'runner-prompt.md'), 'utf8'));
  writeFileSync(join(root, 'telemetry.py'), '# fixture\n');
  try {
    const result=spawnSync('bun',['runner/autonomous-project-midnight-runner.ts'],{cwd:repo,env:{...process.env,HOME:home,AUTONOMOUS_PROJECT_STATE_ROOT:root,HERMES_BIN:fakeHermes,FIXTURE_PROJECT:project,FIXTURE_COMMIT:commit,...gate},encoding:'utf8'});
    if(result.status!==0) throw new Error(`${name}: runner exited ${result.status}: ${result.stderr||result.stdout}`);
    const state=JSON.parse(readFileSync(join(root,'state.json'),'utf8'));
    if(state.status!=='blocked') throw new Error(`${name}: malformed gate report was accepted as ${state.status}`);
    if(!String(state.block?.reason||'').includes('explicit completed disposition')) throw new Error(`${name}: blocked state did not record completion-evidence contract failure`);
  } finally { rmSync(home,{recursive:true,force:true}); }
}

runScenario('null-repo', { GATE_REPO: 'null' });
runScenario('null-commit', { GATE_COMMIT: 'null' });
runScenario('empty-commands', { GATE_COMMANDS: 'empty' });
console.log('smoke-runner-classic-evidence-contract ok');
