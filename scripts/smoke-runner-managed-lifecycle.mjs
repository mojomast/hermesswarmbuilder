#!/usr/bin/env node
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const sourceRepo = resolve(new URL('..', import.meta.url).pathname);

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}
function json(path) { return JSON.parse(readFileSync(path, 'utf8')); }
function writeJson(path, value) { writeFileSync(path, JSON.stringify(value, null, 2)); }
function latestRun(root) { const id = readdirSync(join(root, 'runs')).sort().at(-1); return { id, root: join(root, 'runs', id) }; }

function runScenario(name, options = {}) {
  const home = mkdtempSync(join(tmpdir(), `hsb-managed-${name}-`));
  const root = join(home, 'state');
  const project = join(home, 'project');
  const fakeHermes = join(home, 'fake-hermes.cjs');
  mkdirSync(root, { recursive: true });
  mkdirSync(project, { recursive: true });
  git(project, ['init']);
  git(project, ['config', 'user.email', 'smoke@example.test']);
  git(project, ['config', 'user.name', 'Smoke Test']);
  writeFileSync(join(project, 'README.md'), '# Managed fixture\n');
  git(project, ['add', 'README.md']);
  git(project, ['commit', '-m', 'initial fixture']);
  const baseCommit = git(project, ['rev-parse', 'HEAD']);

  writeFileSync(fakeHermes, `#!/usr/bin/env node
const fs=require('node:fs'), path=require('node:path'), cp=require('node:child_process');
const agent=process.env.APB_AGENT_ID, runRoot=process.env.AUTONOMOUS_PROJECT_RUN_ROOT, root=process.env.AUTONOMOUS_PROJECT_STATE_ROOT;
const args=process.argv.slice(2), query=args[args.indexOf('--query')+1]||'';
if(agent.startsWith('variant-')){
  fs.writeFileSync(path.join(process.cwd(),agent+'.txt'),'focused managed change\\n');
  fs.writeFileSync(path.join(runRoot,'artifacts','variants',agent+'.json'),JSON.stringify({schemaVersion:'apb.variant.v1',variantId:agent,title:'Focused fixture',claim:'Bounded change',objectiveMapping:['fixture objective'],changes:[agent+'.txt'],risks:[],evidence:['artifacts/variants/'+agent+'.diff'],validationNotes:'runner validates',budget:{visualMotifChanges:0,newSections:0,techStackChurn:false,unrelatedFeatures:false}},null,2));
  if(process.env.FAKE_SCENARIO==='pause') { const p=path.join(root,'control.json'), c=JSON.parse(fs.readFileSync(p,'utf8')); c.pause={requested:true,mode:'checkpoint',reason:'fixture pause'}; fs.writeFileSync(p,JSON.stringify(c,null,2)); }
} else if(agent.startsWith('evaluator-') && process.env.FAKE_SCENARIO!=='missing-evaluator'){
  const variant=(query.match(/evaluation-(variant-[0-9]+)\\.json/)||[])[1]||'variant-1';
  fs.writeFileSync(path.join(runRoot,'artifacts','evaluations','evaluation-'+variant+'.json'),JSON.stringify({schemaVersion:'apb.evaluation.v1',variantId:variant,scores:{objectiveFit:90,userValue:85,visualQuality:80,implementationQuality:90,accessibility:85,performance:90,total:87},hardGateViolations:[],recommendation:'accept',rationale:'Evidence-backed fixture evaluation',evidenceArtifacts:['artifacts/variants/'+variant+'.json','artifacts/variants/'+variant+'.diff']},null,2));
}
`);
  chmodSync(fakeHermes, 0o755);

  const requestId = `request-${name}`;
  const gateEvidence = options.missingGate ? 'artifacts/operator-approval.json' : 'artifacts/variants/variant-1.json';
  const repoPath = options.invalidRepo ? join(home, 'missing-repo') : project;
  const baseRef = options.invalidBase ? 'missing-base-ref' : 'HEAD';
  const request = {
    schemaVersion: 'apb.next-run-request.v1', id: requestId, status: 'pending', type: 'continue',
    sourceRunId: 'source-run', sourceIterationId: 'source-iteration', repoPath, baseRef,
    objective: 'Deliver one trustworthy fixture improvement', changeText: 'Add one focused fixture file and validate its evidence.',
    validationCommands: [['touch', join(home, 'client-command-ran')]],
    limits: { maxIterations: 1, maxVariantsPerIteration: 1, maxParallelVariants: 1, maxAcceptedFeatures: 1, maxVisualMotifChanges: 0, maxNewSections: 0, stopAfterNoImprovement: 1 }
  };
  writeJson(join(root, 'state.json'), { schemaVersion:'apb.state.v1', status:'idle', phase:'idle', currentRunId:null, agents:{} });
  writeJson(join(root, 'control.json'), { schemaVersion:'apb.control.v1', runAdmission:'enabled', pause:{requested:false}, stop:{requested:false}, activeSteering:[], requestedRunNow:true, nextRunRequest:request, autoIteration:{enabled:false} });
  writeJson(join(root, 'queue.json'), { schemaVersion:'apb.queue.v1', items:[] });
  writeJson(join(root, 'gates.json'), { schemaVersion:'apb.gates.v1', gates:[{id:'fixture-gate',severity:'must',description:'Fixture evidence exists',requiredEvidence:[gateEvidence]}] });
  writeJson(join(root, 'iterations.json'), { schemaVersion:'apb.iterations.v1', items:[{id:requestId,status:'requested',sourceRunId:'source-run',parentIterationId:'source-iteration'}] });
  writeFileSync(join(root, 'runner-prompt.md'), 'fixture prompt\n');
  writeFileSync(join(root, 'telemetry.py'), '# fixture\n');

  const result = spawnSync('bun', ['runner/autonomous-project-midnight-runner.ts'], {
    cwd: sourceRepo,
    env: { ...process.env, HOME:home, AUTONOMOUS_PROJECT_STATE_ROOT:root, HERMES_BIN:fakeHermes, FAKE_SCENARIO:options.fakeScenario || name, APB_DISABLE_AUTO_CONTINUATION:'1' },
    encoding:'utf8'
  });
  if(result.status !== 0) throw new Error(`${name}: runner exited ${result.status}: ${result.stderr || result.stdout}`);
  return { home, root, project, baseCommit, requestId, ...latestRun(root) };
}

const fixtures=[];
try {
  const success=runScenario('success'); fixtures.push(success.home);
  const lifecycle=json(join(success.root,'lifecycle-contract.json'));
  if(lifecycle.schemaVersion!=='apb.managed-lifecycle.v1' || lifecycle.base.commit!==success.baseCommit) throw new Error('success: lifecycle contract/base commit missing');
  if(lifecycle.validationPlan.source!=='runner-policy' || !lifecycle.acceptanceGates?.length) throw new Error('success: validation/gate snapshot missing');
  if(existsSync(join(success.home,'client-command-ran')) || lifecycle.validationPlan.commands.some(x=>x.argv?.[0]==='touch')) throw new Error('success: client-supplied validation command was executed or persisted');
  const successRun=json(join(success.root,'run.json'));
  const successHandoff=json(join(success.root,'artifacts','handoff.json'));
  if(successRun.status!=='completed' || successHandoff.state!=='completed') throw new Error('success: terminal state/handoff not completed');
  if(git(success.project,['rev-parse','HEAD'])!==success.baseCommit || git(success.project,['status','--porcelain'])) throw new Error('success: normal source branch or working tree was mutated');
  if(!successHandoff.accepted?.commit || successHandoff.baseCommit!==success.baseCommit || !successHandoff.operatorNextAction?.includes('git')) throw new Error('success: handoff promotion data incomplete');
  const gateReport=json(join(success.root,'artifacts','gate-report.json'));
  if(gateReport.status!=='passed' || !gateReport.commands?.length || !gateReport.gates?.every(g=>g.status==='passed')) throw new Error('success: gate report incomplete');
  const rows=json(join(success.root,'..','..','iterations.json')).items;
  const row=rows.find(x=>x.requestId===success.requestId || x.id===success.requestId);
  if(!row || row.runId!==success.id || row.iterationId!==`iter-${success.id}` || row.status!=='completed') throw new Error('success: request row was not reconciled');
  if(row.sourceRunId!=='source-run' || row.parentIterationId!=='source-iteration') throw new Error('success: source lineage was lost');

  const missingEval=runScenario('missing-evaluator'); fixtures.push(missingEval.home);
  if(json(join(missingEval.root,'run.json')).status!=='blocked') throw new Error('missing evaluator: run did not block');
  if(existsSync(join(missingEval.root,'artifacts','evaluations','evaluation-variant-1.json'))) throw new Error('missing evaluator: runner fabricated evaluator artifact');
  if(json(join(missingEval.root,'artifacts','handoff.json')).state!=='blocked') throw new Error('missing evaluator: blocked handoff missing');
  const blockedRows=json(join(missingEval.root,'..','..','iterations.json')).items;
  if(!blockedRows.some(x=>x.runId===missingEval.id&&x.iterationId===`iter-${missingEval.id}`&&x.status==='blocked')) throw new Error('missing evaluator: request row was not reconciled to blocked iteration');

  const missingGate=runScenario('missing-gate',{missingGate:true}); fixtures.push(missingGate.home);
  const missingGateReport=json(join(missingGate.root,'artifacts','gate-report.json'));
  if(json(join(missingGate.root,'run.json')).status!=='blocked' || missingGateReport.status!=='failed') throw new Error('missing gate: completion was not blocked');
  if(!missingGateReport.gates?.find(g=>g.id==='fixture-gate'&&g.status==='failed')) throw new Error('missing gate: per-gate failure absent');

  const paused=runScenario('pause',{fakeScenario:'pause'}); fixtures.push(paused.home);
  const pausedRun=json(join(paused.root,'run.json')), pausedHandoff=json(join(paused.root,'artifacts','handoff.json'));
  if(pausedRun.status!=='on-hold' || pausedHandoff.state!=='paused' || pausedHandoff.checkpoint!=='after-variants') throw new Error('pause: checkpoint disposition missing');
  if(existsSync(join(paused.root,'worktrees','mashup')) || !existsSync(join(paused.root,'worktrees','variant-1'))) throw new Error('pause: work was continued or variant worktree was removed');

  for (const [name,opts] of [['invalid-repo',{invalidRepo:true}],['invalid-base',{invalidBase:true}]]) {
    const invalid=runScenario(name,opts); fixtures.push(invalid.home);
    const handoff=json(join(invalid.root,'artifacts','handoff.json'));
    if(json(join(invalid.root,'run.json')).status!=='blocked' || handoff.state!=='blocked') throw new Error(`${name}: invalid launch did not block with handoff`);
  }
  console.log('smoke-runner-managed-lifecycle ok');
} finally {
  for(const path of fixtures) rmSync(path,{recursive:true,force:true});
}
