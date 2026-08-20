#!/usr/bin/env node
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, utimesSync, watch, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const repo = resolve(new URL('..', import.meta.url).pathname);
const fixtures = [];
const cleanupPids = [];
const cleanupWatchers = [];
function json(path) { return JSON.parse(readFileSync(path, 'utf8')); }
function writeJson(path, value) { writeFileSync(path, JSON.stringify(value, null, 2)); }
function git(cwd, args) {
  const result=spawnSync('git',args,{cwd,encoding:'utf8'});
  if(result.status!==0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr||result.stdout}`);
  return result.stdout.trim();
}
function fixture(name, paused = true) {
  const home = mkdtempSync(join(tmpdir(), `hsb-timeout-lock-${name}-`)); fixtures.push(home);
  const root = join(home, 'state'); mkdirSync(root, { recursive: true });
  writeJson(join(root, 'state.json'), { schemaVersion:'apb.state.v1', status:'idle', phase:'idle', currentRunId:null, agents:{} });
  writeJson(join(root, 'control.json'), { schemaVersion:'apb.control.v1', runAdmission:paused?'paused':'enabled', pause:{requested:paused}, stop:{requested:false}, activeSteering:[], requestedRunNow:!paused, nextRunRequest:null, autoIteration:{enabled:false} });
  writeJson(join(root, 'queue.json'), { schemaVersion:'apb.queue.v1', items:[] });
  writeJson(join(root, 'gates.json'), { schemaVersion:'apb.gates.v1', gates:[] });
  writeFileSync(join(root, 'runner-prompt.md'), 'timeout fixture prompt\n');
  writeFileSync(join(root, 'telemetry.py'), '# fixture\n');
  return { home, root };
}
function managedFixture(name, packageJson=null) {
  const f=fixture(name,false), project=join(f.home,'project'); mkdirSync(project);
  git(project,['init']); git(project,['config','user.email','smoke@example.test']); git(project,['config','user.name','Smoke Test']);
  writeFileSync(join(project,'README.md'),`# ${name}\n`);
  if(packageJson) writeJson(join(project,'package.json'),packageJson);
  git(project,['add','.']); git(project,['commit','-m','initial fixture']);
  const request={schemaVersion:'apb.next-run-request.v1',id:`request-${name}`,status:'pending',type:'continue',sourceRunId:'source-run',sourceIterationId:'source-iteration',repoPath:project,baseRef:'HEAD',objective:`Exercise ${name}`,changeText:'Make one deterministic fixture change.',limits:{maxIterations:1,maxVariantsPerIteration:1,maxParallelVariants:1,maxAcceptedFeatures:1,maxVisualMotifChanges:0,maxNewSections:0,stopAfterNoImprovement:1}};
  writeJson(join(f.root,'control.json'),{schemaVersion:'apb.control.v1',runAdmission:'enabled',pause:{requested:false},stop:{requested:false},activeSteering:[],requestedRunNow:true,nextRunRequest:request,autoIteration:{enabled:false}});
  writeJson(join(f.root,'iterations.json'),{schemaVersion:'apb.iterations.v1',items:[{id:request.id,status:'requested'}]});
  return {...f,project,request};
}
function seedBlockedRun(f, runId, timeout, managed=false) {
  const runRoot=join(f.root,'runs',runId); mkdirSync(join(runRoot,'artifacts'),{recursive:true}); mkdirSync(join(runRoot,'logs'),{recursive:true});
  writeJson(join(runRoot,'run.json'),{id:runId,runId,status:'blocked',phase:'blocked',block:{reason:'fixture timeout',timeout}});
  if(managed) {
    writeJson(join(runRoot,'lifecycle-contract.json'),{schemaVersion:'apb.managed-lifecycle.v1',runId,iterationId:`iter-${runId}`,requestId:`request-${runId}`,state:'blocked',blocker:'fixture timeout',timeout});
    writeJson(join(runRoot,'iteration-state.json'),{id:`iter-${runId}`,runId,status:'blocked',blocker:'fixture timeout',timeout});
  }
  writeJson(join(f.root,'state.json'),{schemaVersion:'apb.state.v1',status:'blocked',phase:'blocked',currentRunId:runId,agents:{},block:{reason:'fixture timeout',timeout}});
  return runRoot;
}
function writeManagedHermes(path, timeoutAgent='') {
  writeFileSync(path,`#!/usr/bin/env node\nconst fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');\nconst id=process.env.APB_AGENT_ID; console.log('fixture '+id+' started');\nif(id===process.env.TIMEOUT_AGENT) setInterval(()=>{},1000);\nif(id.startsWith('variant-')){ fs.appendFileSync(path.join(process.cwd(),'README.md'),'fixture change\\n'); const p=path.join(process.env.AUTONOMOUS_PROJECT_ARTIFACTS,'variants',id+'.json'); fs.writeFileSync(p,JSON.stringify({schemaVersion:'apb.variant.v1',variantId:id,title:'fixture',claim:'fixture change',objectiveMapping:['fixture'],changes:['README'],risks:[],evidence:['README.md'],validationNotes:[],budget:{visualMotifChanges:0,newSections:0,techStackChurn:false,unrelatedFeatures:false}})); }\nelse { const variantId='variant-'+id.split('-')[1],p=path.join(process.env.AUTONOMOUS_PROJECT_ARTIFACTS,'evaluations','evaluation-'+variantId+'.json'); fs.writeFileSync(p,JSON.stringify({schemaVersion:'apb.evaluation.v1',variantId,scores:{objectiveFit:90,userValue:90,visualQuality:90,implementationQuality:90,accessibility:90,performance:90,total:90},hardGateViolations:[],recommendation:'accept',rationale:'fixture passed',evidenceArtifacts:['artifacts/variants/'+variantId+'.json','artifacts/variants/'+variantId+'.diff']})); }\n`, 'utf8');
  chmodSync(path,0o755);
  return {TIMEOUT_AGENT:timeoutAgent};
}
function run(f, extraEnv = {}) {
  return spawnSync('bun', ['runner/autonomous-project-midnight-runner.ts'], { cwd:repo, env:{...process.env, HOME:f.home, AUTONOMOUS_PROJECT_STATE_ROOT:f.root, APB_DISABLE_AUTO_CONTINUATION:'1', ...extraEnv}, encoding:'utf8', timeout:10000 });
}
function runAsync(f, extraEnv = {}) {
  const child=spawn('bun', ['runner/autonomous-project-midnight-runner.ts'], { cwd:repo, env:{...process.env, HOME:f.home, AUTONOMOUS_PROJECT_STATE_ROOT:f.root, APB_DISABLE_AUTO_CONTINUATION:'1', ...extraEnv}, stdio:['ignore','pipe','pipe'] });
  if(Number.isInteger(child.pid)) cleanupPids.push(child.pid);
  let stdout='',stderr=''; child.stdout.on('data',chunk=>stdout+=chunk); child.stderr.on('data',chunk=>stderr+=chunk);
  return {child,done:new Promise((resolve,reject)=>{ child.once('error',reject); child.once('exit',(status,signal)=>resolve({status,signal,stdout,stderr})); })};
}
async function waitUntil(predicate, label, timeoutMs=3000) {
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){ if(predicate()) return; await new Promise(resolve=>setTimeout(resolve,10)); }
  throw new Error(`timed out waiting for ${label}`);
}
function assertRunnerOk(result, label) {
  if(result.error) throw new Error(`${label}: runner spawn failed: ${result.error.message}`);
  if(result.status !== 0) throw new Error(`${label}: runner exited ${result.status}: ${result.stderr || result.stdout}`);
}
function alive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }

try {
  const live = fixture('live');
  const liveLock = join(live.root, 'autonomous-project.lock'); mkdirSync(liveLock);
  writeJson(join(liveLock, 'owner.json'), { schemaVersion:'apb.runner-lock.v1', pid:process.pid, token:'other-owner', createdAt:new Date().toISOString(), startIdentity:null });
  assertRunnerOk(run(live), 'live lock');
  if(!existsSync(liveLock) || json(join(liveLock, 'owner.json')).token !== 'other-owner') throw new Error('live lock was stolen or removed');

  const stale = fixture('stale');
  const staleLock = join(stale.root, 'autonomous-project.lock'); mkdirSync(staleLock);
  writeJson(join(staleLock, 'owner.json'), { schemaVersion:'apb.runner-lock.v1', pid:99999999, token:'dead-owner', createdAt:new Date().toISOString(), startIdentity:'1' });
  assertRunnerOk(run(stale), 'stale lock');
  if(existsSync(staleLock)) throw new Error('dead PID lock was not recovered and released');
  if(!json(join(stale.root, 'state.json')).lastAction?.includes('paused')) throw new Error('runner did not proceed after stale lock recovery');

  const contenders = fixture('stale-contenders', false);
  const contendersLock = join(contenders.root, 'autonomous-project.lock'); mkdirSync(contendersLock);
  writeJson(join(contendersLock, 'owner.json'), { schemaVersion:'apb.runner-lock.v1', pid:99999999, token:'contended-dead-owner', createdAt:new Date().toISOString(), startIdentity:'1' });
  const contenderHermes = join(contenders.home, 'contender-hermes.cjs');
  writeFileSync(contenderHermes, "#!/usr/bin/env node\nsetInterval(()=>{},1000);\n"); chmodSync(contenderHermes, 0o755);
  const staleReady=join(contenders.home,'stale-ready'), staleContinue=join(contenders.home,'stale-continue');
  const contenderA=runAsync(contenders,{HERMES_BIN:contenderHermes,APB_CLASSIC_TIMEOUT_MS:'1200',APB_TERMINATION_GRACE_MS:'50',APB_TEST_STALE_READY:staleReady,APB_TEST_STALE_CONTINUE:staleContinue});
  await waitUntil(()=>existsSync(staleReady),'first contender stale-classification barrier');
  const contenderB=runAsync(contenders,{HERMES_BIN:contenderHermes,APB_CLASSIC_TIMEOUT_MS:'1200',APB_TERMINATION_GRACE_MS:'50'});
  await waitUntil(()=>existsSync(join(contendersLock,'owner.json'))&&json(join(contendersLock,'owner.json')).pid===contenderB.child.pid,'second contender fresh lock');
  writeFileSync(staleContinue,'continue');
  assertRunnerOk(await contenderA.done,'first stale contender');
  if(!existsSync(contendersLock) || json(join(contendersLock,'owner.json')).pid!==contenderB.child.pid) throw new Error('stale contender renamed a fresh contender lock (ABA takeover)');
  assertRunnerOk(await contenderB.done,'second stale contender');

  const wrongRelease = fixture('wrong-owner-release', false);
  const wrongReleaseLock = join(wrongRelease.root, 'autonomous-project.lock');
  const wrongReleaseHermes = join(wrongRelease.home, 'wrong-release-hermes.cjs');
  writeFileSync(wrongReleaseHermes, "#!/usr/bin/env node\nsetInterval(()=>{},1000);\n"); chmodSync(wrongReleaseHermes, 0o755);
  const releasing=runAsync(wrongRelease,{HERMES_BIN:wrongReleaseHermes,APB_CLASSIC_TIMEOUT_MS:'400',APB_TERMINATION_GRACE_MS:'50'});
  await waitUntil(()=>existsSync(join(wrongReleaseLock,'owner.json')),'runner-owned lock before replacement');
  rmSync(wrongReleaseLock,{recursive:true,force:true}); mkdirSync(wrongReleaseLock);
  writeJson(join(wrongReleaseLock,'owner.json'),{schemaVersion:'apb.runner-lock.v1',pid:process.pid,token:'replacement-owner',createdAt:new Date().toISOString(),startIdentity:null});
  const lockEvents=[]; const watcher=watch(wrongRelease.root,(eventType,filename)=>{ if(String(filename).startsWith('autonomous-project.lock')) lockEvents.push({eventType,filename:String(filename)}); }); cleanupWatchers.push(watcher);
  assertRunnerOk(await releasing.done,'wrong-owner release'); watcher.close();
  if(!existsSync(wrongReleaseLock) || json(join(wrongReleaseLock,'owner.json')).token!=='replacement-owner') throw new Error('wrong-owner release removed the replacement lock');
  if(lockEvents.length) throw new Error(`wrong-owner release destructively renamed a lock before token verification: ${JSON.stringify(lockEvents)}`);

  const malformed = fixture('malformed');
  const malformedLock = join(malformed.root, 'autonomous-project.lock'); mkdirSync(malformedLock);
  writeFileSync(join(malformedLock, 'owner.json'), '{fresh-incomplete');
  assertRunnerOk(run(malformed, { APB_LOCK_INCOMPLETE_GRACE_MS:'2000' }), 'fresh malformed lock');
  if(!existsSync(malformedLock) || readFileSync(join(malformedLock, 'owner.json'), 'utf8') !== '{fresh-incomplete') throw new Error('fresh malformed lock was stolen or removed before grace elapsed');

  const legacyLive = fixture('legacy-live');
  const legacyLiveLock = join(legacyLive.root, 'autonomous-project.lock'); mkdirSync(legacyLiveLock);
  writeFileSync(join(legacyLiveLock, 'pid'), String(process.pid));
  const old = new Date(Date.now() - 60_000); utimesSync(legacyLiveLock, old, old);
  assertRunnerOk(run(legacyLive, { APB_LOCK_INCOMPLETE_GRACE_MS:'100' }), 'legacy live lock');
  if(!existsSync(legacyLiveLock) || readFileSync(join(legacyLiveLock, 'pid'), 'utf8') !== String(process.pid)) throw new Error('legacy lock with live pid was stolen after grace');

  const normalExitPipe = fixture('normal-exit-inherited-pipe', false);
  const normalExitHermes = join(normalExitPipe.home, 'normal-exit-hermes.cjs');
  const normalExitPidPath = join(normalExitPipe.home, 'normal-exit-descendant.pid');
  const normalExitCleanupPath = join(normalExitPipe.home, 'normal-exit-cleanup.json');
  writeFileSync(normalExitHermes, `#!/usr/bin/env node\nconst fs=require('node:fs'),cp=require('node:child_process');\nconst code=\"const fs=require('node:fs'); console.log('descendant incremental log'); process.on('SIGTERM',()=>{fs.writeFileSync(process.env.CLEANUP_EVIDENCE,JSON.stringify({lockPresent:fs.existsSync(process.env.RUNNER_LOCK),termObserved:true}))}); setInterval(()=>{},1000)\";\nconst child=cp.spawn(process.execPath,['-e',code],{stdio:['ignore','inherit','inherit'],env:{...process.env,CLEANUP_EVIDENCE:process.env.CLEANUP_EVIDENCE,RUNNER_LOCK:process.env.RUNNER_LOCK}});\nfs.writeFileSync(process.env.DESCENDANT_PID,String(child.pid));\nchild.unref();\nconsole.log('parent exited normally');\n`); chmodSync(normalExitHermes, 0o755);
  const normalExitStarted = Date.now();
  const normalExitResult = run(normalExitPipe, { HERMES_BIN:normalExitHermes, DESCENDANT_PID:normalExitPidPath, CLEANUP_EVIDENCE:normalExitCleanupPath, RUNNER_LOCK:join(normalExitPipe.root,'autonomous-project.lock'), APB_STREAM_DRAIN_TIMEOUT_MS:'100', APB_TERMINATION_GRACE_MS:'100' });
  const normalExitElapsed = Date.now() - normalExitStarted;
  assertRunnerOk(normalExitResult, 'normal exit inherited pipe');
  if(normalExitElapsed >= 1000) throw new Error(`normal Hermes exit waited ${normalExitElapsed}ms for a descendant-held pipe`);
  const normalExitPid=Number(readFileSync(normalExitPidPath,'utf8')); cleanupPids.push(normalExitPid);
  if(alive(normalExitPid)) throw new Error(`normal-exit stream descendant ${normalExitPid} survived bounded drain cleanup`);
  const normalExitCleanup=json(normalExitCleanupPath);
  if(!normalExitCleanup.lockPresent || !normalExitCleanup.termObserved) throw new Error('runner did not TERM the residual process group while retaining its lock');
  if(existsSync(join(normalExitPipe.root,'autonomous-project.lock'))) throw new Error('normal-exit cleanup left runner lock behind');
  const normalExitState = json(join(normalExitPipe.root, 'state.json'));
  if(normalExitState.block?.reason?.includes('stream drain timed out')) throw new Error(`normal parent exit was falsely classified as stream-drain failure: ${JSON.stringify(normalExitState.block)}`);
  const normalExitEvents=readFileSync(join(normalExitPipe.root,'events.jsonl'),'utf8').trim().split(/\n/).filter(Boolean).map(JSON.parse);
  if(!normalExitEvents.some(e=>e.type==='runner-stream-drain-truncated'&&e.data?.scope==='classic'&&e.data?.exitCode===0)) throw new Error('normal-exit residual cleanup warning/truncation evidence missing');
  const normalExitRunId = readdirSync(join(normalExitPipe.root, 'runs')).sort().at(-1);
  const normalExitLog = readFileSync(join(normalExitPipe.root, 'runs', normalExitRunId, 'logs', 'hermes.stdout.log'), 'utf8');
  if(!normalExitLog.includes('parent exited normally') || !normalExitLog.includes('descendant incremental log')) throw new Error('normal exit inherited pipe lost incremental stdout logging');

  const managedExitPipe = fixture('managed-normal-exit-inherited-pipe', false);
  const managedProject = join(managedExitPipe.home, 'project'); mkdirSync(managedProject);
  git(managedProject,['init']); git(managedProject,['config','user.email','smoke@example.test']); git(managedProject,['config','user.name','Smoke Test']);
  writeFileSync(join(managedProject,'README.md'),'# managed pipe fixture\n'); git(managedProject,['add','README.md']); git(managedProject,['commit','-m','initial fixture']);
  const managedExitHermes = join(managedExitPipe.home, 'managed-normal-exit-hermes.cjs');
  const managedExitPidPath=join(managedExitPipe.home,'managed-normal-exit-descendant.pid');
  const managedExitCleanupPath=join(managedExitPipe.home,'managed-normal-exit-cleanup.json');
  writeFileSync(managedExitHermes, `#!/usr/bin/env node\nconst fs=require('node:fs'),cp=require('node:child_process');\nconst code=\"const fs=require('node:fs'); console.log('managed descendant incremental log'); process.on('SIGTERM',()=>{fs.writeFileSync(process.env.CLEANUP_EVIDENCE,JSON.stringify({lockPresent:fs.existsSync(process.env.RUNNER_LOCK)})); process.exit(0)}); setInterval(()=>{},1000)\";\nconst child=cp.spawn(process.execPath,['-e',code],{stdio:['ignore','inherit','inherit'],env:{...process.env,CLEANUP_EVIDENCE:process.env.CLEANUP_EVIDENCE,RUNNER_LOCK:process.env.RUNNER_LOCK}});\nfs.writeFileSync(process.env.DESCENDANT_PID,String(child.pid));\nchild.unref();\nconsole.log('managed parent exited normally');\n`); chmodSync(managedExitHermes, 0o755);
  const managedRequest={schemaVersion:'apb.next-run-request.v1',id:'request-managed-pipe',status:'pending',type:'continue',sourceRunId:'source-run',sourceIterationId:'source-iteration',repoPath:managedProject,baseRef:'HEAD',objective:'Verify bounded managed stream draining',changeText:'Exercise one managed variant.',limits:{maxIterations:1,maxVariantsPerIteration:1,maxParallelVariants:1,maxAcceptedFeatures:1,maxVisualMotifChanges:0,maxNewSections:0,stopAfterNoImprovement:1}};
  writeJson(join(managedExitPipe.root,'control.json'),{schemaVersion:'apb.control.v1',runAdmission:'enabled',pause:{requested:false},stop:{requested:false},activeSteering:[],requestedRunNow:true,nextRunRequest:managedRequest,autoIteration:{enabled:false}});
  writeJson(join(managedExitPipe.root,'iterations.json'),{schemaVersion:'apb.iterations.v1',items:[{id:managedRequest.id,status:'requested'}]});
  const managedExitStarted=Date.now();
  const managedExitResult=run(managedExitPipe,{HERMES_BIN:managedExitHermes,DESCENDANT_PID:managedExitPidPath,CLEANUP_EVIDENCE:managedExitCleanupPath,RUNNER_LOCK:join(managedExitPipe.root,'autonomous-project.lock'),APB_STREAM_DRAIN_TIMEOUT_MS:'100',APB_TERMINATION_GRACE_MS:'100'});
  const managedExitElapsed=Date.now()-managedExitStarted;
  assertRunnerOk(managedExitResult,'managed normal exit inherited pipe');
  if(managedExitElapsed>=1000) throw new Error(`managed normal Hermes exit waited ${managedExitElapsed}ms for a descendant-held pipe`);
  const managedExitPid=Number(readFileSync(managedExitPidPath,'utf8')); cleanupPids.push(managedExitPid);
  if(alive(managedExitPid)) throw new Error(`managed normal-exit stream descendant ${managedExitPid} survived bounded drain cleanup`);
  if(!json(managedExitCleanupPath).lockPresent) throw new Error('runner unlocked before managed residual process-group cleanup');
  if(existsSync(join(managedExitPipe.root,'autonomous-project.lock'))) throw new Error('managed normal-exit cleanup left runner lock behind');
  const managedExitState=json(join(managedExitPipe.root,'state.json'));
  if(managedExitState.block?.reason?.includes('stream drain timed out')) throw new Error(`managed parent exit was falsely classified as stream-drain failure: ${JSON.stringify(managedExitState.block)}`);
  const managedExitEvents=readFileSync(join(managedExitPipe.root,'events.jsonl'),'utf8').trim().split(/\n/).filter(Boolean).map(JSON.parse);
  if(!managedExitEvents.some(e=>e.type==='runner-stream-drain-truncated'&&e.data?.scope==='variant'&&e.data?.exitCode===0)) throw new Error('managed residual cleanup warning/truncation evidence missing');
  const managedExitRunId=readdirSync(join(managedExitPipe.root,'runs')).sort().at(-1);
  const managedExitLog=readFileSync(join(managedExitPipe.root,'runs',managedExitRunId,'logs','variant-1.stdout.log'),'utf8');
  if(!managedExitLog.includes('managed parent exited normally')||!managedExitLog.includes('managed descendant incremental log')) throw new Error('managed normal exit inherited pipe lost incremental stdout logging');

  const nonLinuxTimeout=fixture('non-linux-timeout-proof',false), nonLinuxHermes=join(nonLinuxTimeout.home,'non-linux-hermes.cjs'), nonLinuxInvocations=join(nonLinuxTimeout.home,'non-linux-invocations');
  writeFileSync(nonLinuxHermes,`#!/usr/bin/env node\nrequire('node:fs').appendFileSync(process.env.INVOCATIONS,'called\\n'); process.on('SIGTERM',()=>process.exit(0)); setInterval(()=>{},1000);\n`); chmodSync(nonLinuxHermes,0o755);
  assertRunnerOk(run(nonLinuxTimeout,{HERMES_BIN:nonLinuxHermes,INVOCATIONS:nonLinuxInvocations,APB_CLASSIC_TIMEOUT_MS:'150',APB_TERMINATION_GRACE_MS:'50',APB_TEST_FORCE_NON_LINUX_TIMEOUT:'1'}),'non-Linux direct-parent timeout');
  const nonLinuxState=json(join(nonLinuxTimeout.root,'state.json'));
  if(nonLinuxState.block?.timeout?.cleanup?.terminationConfirmed!==false) throw new Error(`non-Linux direct-parent exit was incorrectly accepted as process-tree termination proof: ${JSON.stringify(nonLinuxState.block)}`);
  const nonLinuxControl=json(join(nonLinuxTimeout.root,'control.json')); nonLinuxControl.requestedRunNow=true; writeJson(join(nonLinuxTimeout.root,'control.json'),nonLinuxControl);
  assertRunnerOk(run(nonLinuxTimeout,{HERMES_BIN:nonLinuxHermes,INVOCATIONS:nonLinuxInvocations,APB_TEST_FORCE_NON_LINUX_TIMEOUT:'1'}),'recovery blocked after non-Linux timeout');
  if(readFileSync(nonLinuxInvocations,'utf8').trim().split(/\n/).length!==1||readdirSync(join(nonLinuxTimeout.root,'runs')).length!==1) throw new Error('non-Linux timeout without process-tree proof was released into recovery');

  if(process.platform === 'linux') {
    const identityUnreadable = fixture('identity-unreadable');
    const identityUnreadableLock = join(identityUnreadable.root, 'autonomous-project.lock'); mkdirSync(identityUnreadableLock);
    writeJson(join(identityUnreadableLock, 'owner.json'), { schemaVersion:'apb.runner-lock.v1', pid:process.pid, token:'identity-owner', createdAt:new Date().toISOString(), startIdentity:'expected-start' });
    assertRunnerOk(run(identityUnreadable, { APB_PROC_ROOT:join(identityUnreadable.home, 'missing-proc') }), 'unreadable live owner identity');
    if(!existsSync(identityUnreadableLock) || json(join(identityUnreadableLock, 'owner.json')).token !== 'identity-owner') throw new Error('kill-confirmed v1 owner was called stale when process identity could not be read');

    const commandTimed = managedFixture('command-timeout',{scripts:{test:'node -e "setInterval(()=>{},1000)"'}});
    const commandHermes=join(commandTimed.home,'command-hermes.cjs'); writeManagedHermes(commandHermes);
    const commandResult=run(commandTimed,{HERMES_BIN:commandHermes,APB_COMMAND_TIMEOUT_MS:'150',APB_TERMINATION_GRACE_MS:'50'});
    assertRunnerOk(commandResult,'managed validation command timeout');
    const commandState=json(join(commandTimed.root,'state.json')), commandRunId=commandState.currentRunId, commandRunRoot=join(commandTimed.root,'runs',commandRunId);
    if(commandState.status!=='blocked'||commandState.block?.timeout?.scope!=='command'||commandState.block?.timeout?.command!=='npm test'||commandState.block?.timeout?.timeoutMs!==150||commandState.block?.timeout?.exitCode!==124) throw new Error(`validation command timeout was not retained as structured block evidence: ${JSON.stringify(commandState.block)}`);
    const commandEvents=readFileSync(join(commandTimed.root,'events.jsonl'),'utf8').trim().split(/\n/).filter(Boolean).map(JSON.parse);
    if(!commandEvents.some(e=>e.type==='runner-timeout'&&e.data?.scope==='command'&&e.data?.command==='npm test'&&e.data?.timeoutMs===150&&e.data?.exitCode===124)) throw new Error('validation command runner-timeout event evidence missing');
    const commandHandoff=json(join(commandRunRoot,'artifacts','handoff.json')), commandIteration=json(join(commandRunRoot,'iteration-state.json')), commandControl=json(join(commandTimed.root,'control.json'));
    if(commandHandoff.state!=='blocked'||commandHandoff.timeout?.scope!=='command'||commandIteration.status!=='blocked'||commandControl.nextRunRequest?.status!=='blocked'||commandControl.requestedRunNow!==false) throw new Error('validation command timeout lifecycle/iteration/handoff/control evidence incomplete');
    if(!existsSync(join(commandRunRoot,'worktrees','variant-1'))||!readFileSync(join(commandRunRoot,'logs','variant-1.stdout.log'),'utf8').includes('fixture variant-1 started')) throw new Error('validation command timeout did not retain worktree and variant log');
    const commandVariant=json(join(commandRunRoot,'artifacts','variants','variant-1.json'));
    if(commandVariant.validation?.at(-1)?.command!=='npm test'||commandVariant.validation.at(-1).exitCode!==124||commandVariant.validation.at(-1).timedOut!==true||commandVariant.validation.at(-1).timeoutMs!==150) throw new Error(`validation command timeout result was not persisted in the variant artifact: ${JSON.stringify(commandVariant.validation)}`);

    const mashupTimed=managedFixture('mashup-command-timeout',{scripts:{test:'node -e "process.cwd().endsWith(\'/mashup\')?setInterval(()=>{},1000):process.exit(0)"'}});
    const mashupHermes=join(mashupTimed.home,'mashup-hermes.cjs'); writeManagedHermes(mashupHermes);
    assertRunnerOk(run(mashupTimed,{HERMES_BIN:mashupHermes,APB_COMMAND_TIMEOUT_MS:'150',APB_TERMINATION_GRACE_MS:'50'}),'mashup validation command timeout');
    const mashupState=json(join(mashupTimed.root,'state.json')), mashupRunRoot=join(mashupTimed.root,'runs',mashupState.currentRunId);
    const mashupFailure=json(join(mashupRunRoot,'artifacts','failure.json')), mashupSynthesis=json(join(mashupRunRoot,'artifacts','synthesis','synthesis.json'));
    if(mashupFailure.timeout?.scope!=='command'||mashupSynthesis.status!=='blocked'||mashupSynthesis.validation?.at(-1)?.command!=='npm test'||mashupSynthesis.validation.at(-1).exitCode!==124||mashupSynthesis.validation.at(-1).timedOut!==true||mashupSynthesis.validation.at(-1).timeoutMs!==150) throw new Error(`mashup timeout validation evidence was not persisted before blocking: ${JSON.stringify({failure:mashupFailure,synthesis:mashupSynthesis})}`);

    for(const [scope,agent,envName] of [['variant','variant-1','APB_VARIANT_TIMEOUT_MS'],['evaluator','evaluator-1','APB_EVALUATOR_TIMEOUT_MS']]) {
      const managedTimed=managedFixture(`${scope}-timeout`), managedHermes=join(managedTimed.home,`${scope}-hermes.cjs`);
      writeManagedHermes(managedHermes,agent);
      const managedResult=run(managedTimed,{HERMES_BIN:managedHermes,TIMEOUT_AGENT:agent,[envName]:'150',APB_TERMINATION_GRACE_MS:'50'});
      assertRunnerOk(managedResult,`managed ${scope} timeout`);
      const managedState=json(join(managedTimed.root,'state.json')), managedRunId=managedState.currentRunId, managedRunRoot=join(managedTimed.root,'runs',managedRunId);
      if(managedState.status!=='blocked'||!managedState.block?.reason?.includes(`Hermes ${scope} ${agent} timed out after 150ms`)) throw new Error(`managed ${scope} timeout did not block with scoped reason: ${JSON.stringify(managedState.block)}`);
      const managedEvents=readFileSync(join(managedTimed.root,'events.jsonl'),'utf8').trim().split(/\n/).filter(Boolean).map(JSON.parse);
      if(!managedEvents.some(e=>e.type==='runner-timeout'&&e.data?.scope===scope&&e.data?.agentId===agent&&e.data?.timeoutMs===150&&e.data?.exitCode===124)) throw new Error(`managed ${scope} runner-timeout event evidence missing`);
      const managedLifecycle=json(join(managedRunRoot,'lifecycle-contract.json')), managedIteration=json(join(managedRunRoot,'iteration-state.json')), managedHandoff=json(join(managedRunRoot,'artifacts','handoff.json')), managedControl=json(join(managedTimed.root,'control.json'));
      if(managedLifecycle.state!=='blocked'||managedIteration.status!=='blocked'||managedHandoff.state!=='blocked'||!managedHandoff.blocker.includes(`Hermes ${scope}`)||managedControl.nextRunRequest?.status!=='blocked'||managedControl.requestedRunNow!==false) throw new Error(`managed ${scope} timeout lifecycle/iteration/handoff/control evidence incomplete`);
      if(!existsSync(join(managedRunRoot,'worktrees','variant-1'))||!readFileSync(join(managedRunRoot,'logs',scope==='variant'?'variant-1.stdout.log':'evaluator-variant-1.stdout.log'),'utf8').includes(`fixture ${agent} started`)) throw new Error(`managed ${scope} timeout did not retain worktree and scoped log`);
      const managedFailure=json(join(managedRunRoot,'artifacts','failure.json'));
      for(const [label,value] of [['failure',managedFailure.timeout],['state',managedState.block?.timeout],['lifecycle',managedLifecycle.timeout],['iteration',managedIteration.timeout],['handoff',managedHandoff.timeout]]) if(value?.scope!==scope||value?.timeoutMs!==150||value?.exitCode!==124) throw new Error(`managed ${scope} structured timeout missing from ${label}: ${JSON.stringify(value)}`);
    }

    const activePending=managedFixture('active-pending-guard');
    seedBlockedRun(activePending,'run-active',{scope:'variant',timeoutMs:150,exitCode:124,cleanup:{terminationConfirmed:true,platform:process.platform}},true);
    const activeHermes=join(activePending.home,'active-hermes.cjs'), activeInvocations=join(activePending.home,'active-invocations');
    writeFileSync(activeHermes,`#!/usr/bin/env node\nrequire('node:fs').appendFileSync(process.env.INVOCATIONS,'called\\n');\n`); chmodSync(activeHermes,0o755);
    assertRunnerOk(run(activePending,{HERMES_BIN:activeHermes,INVOCATIONS:activeInvocations}),'pending managed request active guard');
    if(existsSync(activeInvocations)||readdirSync(join(activePending.root,'runs')).length!==1||json(join(activePending.root,'control.json')).nextRunRequest?.status!=='pending') throw new Error('pending nextRunRequest bypassed the active-run guard');
    const plainWakeControl=json(join(activePending.root,'control.json')); plainWakeControl.nextRunRequest=null; plainWakeControl.requestedRunNow=true; writeJson(join(activePending.root,'control.json'),plainWakeControl);
    assertRunnerOk(run(activePending,{HERMES_BIN:activeHermes,INVOCATIONS:activeInvocations}),'plain wake after managed timeout');
    if(existsSync(activeInvocations)||readdirSync(join(activePending.root,'runs')).length!==1) throw new Error('plain requestedRunNow bypassed a managed-timeout guard');
    const continueControl=json(join(activePending.root,'control.json')); continueControl.requestedRunNow=true; continueControl.nextRunRequest={...activePending.request,id:'request-explicit-managed-recovery',status:'pending',type:'continue',sourceRunId:'run-active',sourceIterationId:'iter-run-active'}; writeJson(join(activePending.root,'control.json'),continueControl);
    assertRunnerOk(run(activePending,{HERMES_BIN:activeHermes,INVOCATIONS:activeInvocations}),'explicit managed timeout continue');
    if(!existsSync(activeInvocations)||readdirSync(join(activePending.root,'runs')).length!==2) throw new Error('explicit managed continue did not bypass its matching timeout guard');

    const activeProject=fixture('active-project-launch-guard',false); seedBlockedRun(activeProject,'run-building',{scope:'variant',timeoutMs:150,exitCode:124},true);
    const activeProjectState=json(join(activeProject.root,'state.json')); activeProjectState.status='building'; activeProjectState.phase='building'; activeProjectState.block=null; writeJson(join(activeProject.root,'state.json'),activeProjectState);
    const activeProjectControl=json(join(activeProject.root,'control.json')); activeProjectControl.projectLaunchRequest={schemaVersion:'apb.project-launch-pointer.v1',launchId:'launch-must-wait',planId:'plan-must-wait',revision:1,status:'pending',pipelineType:'classic'}; writeJson(join(activeProject.root,'control.json'),activeProjectControl);
    assertRunnerOk(run(activeProject,{HERMES_BIN:activeHermes,INVOCATIONS:activeInvocations}),'pending project launch active guard');
    const guardedProjectState=json(join(activeProject.root,'state.json')), guardedProjectControl=json(join(activeProject.root,'control.json'));
    if(guardedProjectState.status!=='building'||guardedProjectControl.projectLaunchRequest?.status!=='pending'||readdirSync(join(activeProject.root,'runs')).length!==1) throw new Error('pending projectLaunchRequest bypassed or mutated through the active-run guard');

    const resistant = fixture('term-resistant-stream-descendant', false);
    const resistantHermes = join(resistant.home, 'resistant-hermes.cjs');
    const resistantPidPath = join(resistant.home, 'resistant-descendant.pid');
    writeFileSync(resistantHermes, `#!/usr/bin/env node\nconst fs=require('node:fs'),cp=require('node:child_process');\nconst code=\"const fs=require('node:fs'); process.on('SIGTERM',()=>{fs.writeFileSync(process.env.CLEANUP_EVIDENCE,JSON.stringify({lockPresent:fs.existsSync(process.env.RUNNER_LOCK),termObserved:true}))}); setInterval(()=>{},1000)\";\nconst child=cp.spawn(process.execPath,['-e',code],{stdio:'ignore',env:{...process.env,CLEANUP_EVIDENCE:process.env.CLEANUP_EVIDENCE,RUNNER_LOCK:process.env.RUNNER_LOCK}});\nfs.writeFileSync(process.env.DESCENDANT_PID,String(child.pid));\nprocess.on('SIGTERM',()=>process.exit(0));\nsetInterval(()=>{},1000);\n`); chmodSync(resistantHermes,0o755);
    const resistantCleanupPath=join(resistant.home,'resistant-cleanup.json');
    const resistantResult=run(resistant,{HERMES_BIN:resistantHermes,DESCENDANT_PID:resistantPidPath,CLEANUP_EVIDENCE:resistantCleanupPath,RUNNER_LOCK:join(resistant.root,'autonomous-project.lock'),APB_CLASSIC_TIMEOUT_MS:'250',APB_TERMINATION_GRACE_MS:'100'});
    if(existsSync(resistantPidPath)) cleanupPids.push(Number(readFileSync(resistantPidPath,'utf8')));
    assertRunnerOk(resistantResult,'TERM-resistant stream descendant timeout');
    const resistantState=json(join(resistant.root,'state.json'));
    if(resistantState.status!=='blocked'||!resistantState.block?.reason?.includes('timed out after 250ms')) throw new Error('TERM-resistant descendant timeout evidence missing');
    if(resistantState.block?.timeout?.cleanup?.terminationConfirmed!==true) throw new Error(`TERM-resistant descendant was marked safe before Linux process-group absence: ${JSON.stringify(resistantState.block?.timeout)}`);
    if(!existsSync(resistantCleanupPath)||!json(resistantCleanupPath).lockPresent||!json(resistantCleanupPath).termObserved) throw new Error('TERM-resistant descendant did not observe TERM while the runner retained its lock');
    if(existsSync(join(resistant.root,'autonomous-project.lock'))) throw new Error('TERM-resistant descendant timeout left runner lock behind');
    const resistantPid=Number(readFileSync(resistantPidPath,'utf8'));
    for(let i=0;i<20&&alive(resistantPid);i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,50);
    if(alive(resistantPid)) throw new Error(`TERM-resistant stream descendant ${resistantPid} survived timeout cleanup`);

    const probeDenied=fixture('process-group-probe-eperm',false), probeDeniedHermes=join(probeDenied.home,'probe-denied-hermes.cjs');
    writeFileSync(probeDeniedHermes,`#!/usr/bin/env node\nsetInterval(()=>{},1000);\n`); chmodSync(probeDeniedHermes,0o755);
    assertRunnerOk(run(probeDenied,{HERMES_BIN:probeDeniedHermes,APB_CLASSIC_TIMEOUT_MS:'150',APB_TERMINATION_GRACE_MS:'50',APB_TEST_PROCESS_GROUP_PROBE_ERROR:'EPERM'}),'EPERM process-group absence probe');
    const probeDeniedState=json(join(probeDenied.root,'state.json'));
    if(probeDeniedState.block?.timeout?.cleanup?.terminationConfirmed!==false) throw new Error(`EPERM process-group probe was incorrectly accepted as termination confirmation: ${JSON.stringify(probeDeniedState.block)}`);

    const drainProbeDenied=fixture('stream-drain-probe-eperm',false), drainProbeDeniedHermes=join(drainProbeDenied.home,'drain-probe-denied-hermes.cjs');
    writeFileSync(drainProbeDeniedHermes,`#!/usr/bin/env node\n`); chmodSync(drainProbeDeniedHermes,0o755);
    assertRunnerOk(run(drainProbeDenied,{HERMES_BIN:drainProbeDeniedHermes,APB_STREAM_DRAIN_TIMEOUT_MS:'50',APB_TERMINATION_GRACE_MS:'50',APB_TEST_FORCE_STREAM_DRAIN_TIMEOUT:'1',APB_TEST_PROCESS_GROUP_PROBE_ERROR:'EPERM'}),'EPERM stream-drain process-group absence probe');
    const drainProbeDeniedState=json(join(drainProbeDenied.root,'state.json'));
    if(drainProbeDeniedState.status!=='blocked'||!drainProbeDeniedState.block?.reason?.includes('stream cleanup could not confirm residual process-group termination')) throw new Error(`EPERM stream-drain process-group probe was incorrectly accepted as termination confirmation: ${JSON.stringify(drainProbeDeniedState.block)}`);

    const unconfirmed=fixture('unconfirmed-cleanup',false), unconfirmedHermes=join(unconfirmed.home,'unconfirmed-hermes.cjs'), unconfirmedInvocations=join(unconfirmed.home,'unconfirmed-invocations');
    writeFileSync(unconfirmedHermes,`#!/usr/bin/env node\nrequire('node:fs').appendFileSync(process.env.INVOCATIONS,'called\\n'); setInterval(()=>{},1000);\n`); chmodSync(unconfirmedHermes,0o755);
    assertRunnerOk(run(unconfirmed,{HERMES_BIN:unconfirmedHermes,INVOCATIONS:unconfirmedInvocations,APB_CLASSIC_TIMEOUT_MS:'150',APB_TERMINATION_GRACE_MS:'50',APB_TEST_SUPPRESS_EXIT_CONFIRMATION:'1'}),'unconfirmed process cleanup');
    const unconfirmedState=json(join(unconfirmed.root,'state.json'));
    if(unconfirmedState.block?.timeout?.cleanup?.terminationConfirmed!==false) throw new Error(`unconfirmed termination was not persisted as unsafe cleanup evidence: ${JSON.stringify(unconfirmedState.block)}`);
    const unconfirmedControl=json(join(unconfirmed.root,'control.json')); unconfirmedControl.requestedRunNow=true; writeJson(join(unconfirmed.root,'control.json'),unconfirmedControl);
    assertRunnerOk(run(unconfirmed,{HERMES_BIN:unconfirmedHermes,INVOCATIONS:unconfirmedInvocations,APB_CLASSIC_TIMEOUT_MS:'150',APB_TERMINATION_GRACE_MS:'50'}),'recovery blocked after unconfirmed cleanup');
    if(readFileSync(unconfirmedInvocations,'utf8').trim().split(/\n/).length!==1||readdirSync(join(unconfirmed.root,'runs')).length!==1) throw new Error('unconfirmed cleanup was released into recoverable concurrency');

    const missingClassic=fixture('missing-classic-cleanup-proof',false), missingClassicHermes=join(missingClassic.home,'missing-classic-hermes.cjs'), missingClassicInvocations=join(missingClassic.home,'missing-classic-invocations');
    writeFileSync(missingClassicHermes,`#!/usr/bin/env node\nrequire('node:fs').appendFileSync(process.env.INVOCATIONS,'called\\n');\n`); chmodSync(missingClassicHermes,0o755);
    const missingClassicRoot=seedBlockedRun(missingClassic,'run-missing-classic',{scope:'classic',timeoutMs:150,exitCode:124,cleanup:{terminationConfirmed:true,platform:process.platform}});
    const missingClassicRun=json(join(missingClassicRoot,'run.json')); delete missingClassicRun.block.timeout.cleanup; writeJson(join(missingClassicRoot,'run.json'),missingClassicRun);
    const missingClassicControl=json(join(missingClassic.root,'control.json')); missingClassicControl.requestedRunNow=true; writeJson(join(missingClassic.root,'control.json'),missingClassicControl);
    assertRunnerOk(run(missingClassic,{HERMES_BIN:missingClassicHermes,INVOCATIONS:missingClassicInvocations}),'classic recovery missing run cleanup proof');
    if(existsSync(missingClassicInvocations)||readdirSync(join(missingClassic.root,'runs')).length!==1) throw new Error('classic recovery admitted without matching state/run termination confirmation');

    const missingManaged=managedFixture('missing-managed-cleanup-proof'), missingManagedHermes=join(missingManaged.home,'missing-managed-hermes.cjs'), missingManagedInvocations=join(missingManaged.home,'missing-managed-invocations');
    writeFileSync(missingManagedHermes,`#!/usr/bin/env node\nrequire('node:fs').appendFileSync(process.env.INVOCATIONS,'called\\n');\n`); chmodSync(missingManagedHermes,0o755);
    const missingManagedRoot=seedBlockedRun(missingManaged,'run-missing-managed',{scope:'variant',timeoutMs:150,exitCode:124,cleanup:{terminationConfirmed:true,platform:process.platform}},true);
    const missingManagedLifecycle=json(join(missingManagedRoot,'lifecycle-contract.json')); delete missingManagedLifecycle.timeout.cleanup; writeJson(join(missingManagedRoot,'lifecycle-contract.json'),missingManagedLifecycle);
    const missingManagedControl=json(join(missingManaged.root,'control.json')); missingManagedControl.requestedRunNow=true; missingManagedControl.nextRunRequest={...missingManaged.request,id:'request-missing-managed-recovery',status:'pending',type:'continue',sourceRunId:'run-missing-managed',sourceIterationId:'iter-run-missing-managed'}; writeJson(join(missingManaged.root,'control.json'),missingManagedControl);
    assertRunnerOk(run(missingManaged,{HERMES_BIN:missingManagedHermes,INVOCATIONS:missingManagedInvocations}),'managed recovery missing lifecycle cleanup proof');
    if(existsSync(missingManagedInvocations)||readdirSync(join(missingManaged.root,'runs')).length!==1) throw new Error('managed recovery admitted without matching lifecycle termination confirmation');

    const timed = fixture('classic-timeout', false);
    const fakeHermes = join(timed.home, 'fake-hermes.cjs');
    const descendantPid = join(timed.home, 'descendant.pid');
    const classicInvocations = join(timed.home, 'classic-invocations');
    writeFileSync(fakeHermes, `#!/usr/bin/env node\nconst fs=require('node:fs'),cp=require('node:child_process');\nconst count=fs.existsSync(process.env.INVOCATIONS)?Number(fs.readFileSync(process.env.INVOCATIONS,'utf8'))+1:1; fs.writeFileSync(process.env.INVOCATIONS,String(count));\nif(count>1){ console.log('explicit recovery launched a fresh classic run'); process.exit(7); }\nconst child=cp.spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});\nfs.writeFileSync(process.env.DESCENDANT_PID,String(child.pid));\nconsole.log('fixture parent and descendant started');\nsetInterval(()=>{},1000);\n`);
    chmodSync(fakeHermes, 0o755);
    const result = run(timed, { HERMES_BIN:fakeHermes, DESCENDANT_PID:descendantPid, INVOCATIONS:classicInvocations, APB_CLASSIC_TIMEOUT_MS:'250', APB_TERMINATION_GRACE_MS:'100' });
    if(existsSync(descendantPid)) cleanupPids.push(Number(readFileSync(descendantPid,'utf8')));
    assertRunnerOk(result, 'classic timeout');
    const state = json(join(timed.root, 'state.json'));
    if(state.status !== 'blocked' || !state.block?.reason?.includes('timed out after 250ms')) throw new Error(`classic timeout did not produce blocked timeout evidence: ${JSON.stringify(state.block)}`);
    const events = readFileSync(join(timed.root, 'events.jsonl'), 'utf8').trim().split(/\n/).filter(Boolean).map(JSON.parse);
    if(!events.some(e => e.type === 'runner-timeout' && e.data?.timeoutMs === 250 && e.data?.scope === 'classic')) throw new Error('classic timeout event evidence missing');
    if(existsSync(join(timed.root, 'autonomous-project.lock'))) throw new Error('classic timeout left runner lock behind');
    const childPid = Number(readFileSync(descendantPid, 'utf8'));
    for(let i=0; i<20 && alive(childPid); i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    if(alive(childPid)) throw new Error(`classic timeout left descendant process ${childPid} alive`);
    const runId = readdirSync(join(timed.root, 'runs')).sort().at(-1);
    if(json(join(timed.root, 'runs', runId, 'run.json')).status !== 'blocked') throw new Error('classic timeout run evidence was not blocked');
    const classicProject=fixture('classic-project-launch-guard',false);
    seedBlockedRun(classicProject,'run-classic-project',{scope:'classic',timeoutMs:250,exitCode:124,cleanup:{terminationConfirmed:true,platform:process.platform}});
    const projectControl=json(join(classicProject.root,'control.json')); projectControl.requestedRunNow=true; projectControl.projectLaunchRequest={schemaVersion:'apb.project-launch-pointer.v1',launchId:'launch-blocked-classic-recovery',planId:'plan-blocked-classic-recovery',revision:1,status:'pending',pipelineType:'classic'}; writeJson(join(classicProject.root,'control.json'),projectControl);
    assertRunnerOk(run(classicProject,{HERMES_BIN:fakeHermes,DESCENDANT_PID:descendantPid,INVOCATIONS:classicInvocations,APB_CLASSIC_TIMEOUT_MS:'250',APB_TERMINATION_GRACE_MS:'100'}),'pending project launch after classic timeout');
    const guardedClassicProjectState=json(join(classicProject.root,'state.json')), guardedClassicProjectControl=json(join(classicProject.root,'control.json'));
    if(Number(readFileSync(classicInvocations,'utf8'))!==1||readdirSync(join(classicProject.root,'runs')).length!==1||guardedClassicProjectState.block?.timeout?.scope!=='classic'||guardedClassicProjectControl.projectLaunchRequest?.status!=='pending') throw new Error('pending projectLaunchRequest bypassed or mutated through the classic timeout guard');
    const unrelatedPending={schemaVersion:'apb.next-run-request.v1',id:'unrelated-pending',status:'pending',type:'continue',sourceRunId:'other-run',sourceIterationId:'other-iteration',repoPath:timed.home,baseRef:'HEAD',objective:'unrelated',changeText:'unrelated',limits:{maxIterations:1,maxVariantsPerIteration:1,maxParallelVariants:1,maxAcceptedFeatures:1,maxVisualMotifChanges:0,maxNewSections:0,stopAfterNoImprovement:1}};
    const pendingControl=json(join(timed.root,'control.json')); pendingControl.nextRunRequest=unrelatedPending; pendingControl.requestedRunNow=true; writeJson(join(timed.root,'control.json'),pendingControl);
    assertRunnerOk(run(timed,{HERMES_BIN:fakeHermes,DESCENDANT_PID:descendantPid,INVOCATIONS:classicInvocations,APB_CLASSIC_TIMEOUT_MS:'250',APB_TERMINATION_GRACE_MS:'100'}),'unrelated pending request after classic timeout');
    if(Number(readFileSync(classicInvocations,'utf8'))!==1||readdirSync(join(timed.root,'runs')).length!==1) throw new Error('pending nextRunRequest bypassed classic timeout guard');
    const clearPending=json(join(timed.root,'control.json')); clearPending.nextRunRequest=null; clearPending.requestedRunNow=false; writeJson(join(timed.root,'control.json'),clearPending);
    assertRunnerOk(run(timed, { HERMES_BIN:fakeHermes, DESCENDANT_PID:descendantPid, INVOCATIONS:classicInvocations, APB_CLASSIC_TIMEOUT_MS:'250', APB_TERMINATION_GRACE_MS:'100' }), 'ordinary tick after classic timeout');
    if(Number(readFileSync(classicInvocations,'utf8'))!==1 || readdirSync(join(timed.root,'runs')).length!==1) throw new Error('ordinary hourly tick automatically retried blocked classic work');
    const recoveryControl=json(join(timed.root,'control.json')); recoveryControl.requestedRunNow=true; writeJson(join(timed.root,'control.json'),recoveryControl);
    assertRunnerOk(run(timed, { HERMES_BIN:fakeHermes, DESCENDANT_PID:descendantPid, INVOCATIONS:classicInvocations, APB_CLASSIC_TIMEOUT_MS:'250', APB_TERMINATION_GRACE_MS:'100' }), 'explicit classic timeout recovery');
    const recoveredRuns=readdirSync(join(timed.root,'runs')).sort();
    if(Number(readFileSync(classicInvocations,'utf8'))!==2 || recoveredRuns.length!==2) throw new Error('explicit wake did not launch a fresh classic run after timeout');
    if(!existsSync(join(timed.root,'runs',runId,'logs','hermes.stdout.log'))) throw new Error('explicit recovery discarded previous classic timeout artifacts');
    if(!readFileSync(join(timed.root,'runs',recoveredRuns.at(-1),'logs','hermes.stdout.log'),'utf8').includes('explicit recovery launched')) throw new Error('fresh classic recovery run log missing');
  }

  console.log('smoke-runner-timeout-lock ok');
} finally {
  for(const watcher of cleanupWatchers) { try { watcher.close(); } catch {} }
  for(const pid of cleanupPids) { try { process.kill(pid,'SIGKILL'); } catch {} }
  for(const path of fixtures) rmSync(path, { recursive:true, force:true });
}
