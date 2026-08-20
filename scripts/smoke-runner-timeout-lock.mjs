#!/usr/bin/env node
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, utimesSync, watch, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const repo = resolve(new URL('..', import.meta.url).pathname);
const fixtures = [];
const cleanupPids = [];
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
function run(f, extraEnv = {}) {
  return spawnSync('bun', ['runner/autonomous-project-midnight-runner.ts'], { cwd:repo, env:{...process.env, HOME:f.home, AUTONOMOUS_PROJECT_STATE_ROOT:f.root, APB_DISABLE_AUTO_CONTINUATION:'1', ...extraEnv}, encoding:'utf8', timeout:5000 });
}
function runAsync(f, extraEnv = {}) {
  const child=spawn('bun', ['runner/autonomous-project-midnight-runner.ts'], { cwd:repo, env:{...process.env, HOME:f.home, AUTONOMOUS_PROJECT_STATE_ROOT:f.root, APB_DISABLE_AUTO_CONTINUATION:'1', ...extraEnv}, stdio:['ignore','pipe','pipe'] });
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
  const lockEvents=[]; const watcher=watch(wrongRelease.root,(eventType,filename)=>{ if(String(filename).startsWith('autonomous-project.lock')) lockEvents.push({eventType,filename:String(filename)}); });
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
  const normalExitPid=Number(readFileSync(normalExitPidPath,'utf8'));
  if(alive(normalExitPid)) { cleanupPids.push(normalExitPid); throw new Error(`normal-exit stream descendant ${normalExitPid} survived bounded drain cleanup`); }
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
  const managedExitPid=Number(readFileSync(managedExitPidPath,'utf8'));
  if(alive(managedExitPid)) { cleanupPids.push(managedExitPid); throw new Error(`managed normal-exit stream descendant ${managedExitPid} survived bounded drain cleanup`); }
  if(!json(managedExitCleanupPath).lockPresent) throw new Error('runner unlocked before managed residual process-group cleanup');
  if(existsSync(join(managedExitPipe.root,'autonomous-project.lock'))) throw new Error('managed normal-exit cleanup left runner lock behind');
  const managedExitState=json(join(managedExitPipe.root,'state.json'));
  if(managedExitState.block?.reason?.includes('stream drain timed out')) throw new Error(`managed parent exit was falsely classified as stream-drain failure: ${JSON.stringify(managedExitState.block)}`);
  const managedExitEvents=readFileSync(join(managedExitPipe.root,'events.jsonl'),'utf8').trim().split(/\n/).filter(Boolean).map(JSON.parse);
  if(!managedExitEvents.some(e=>e.type==='runner-stream-drain-truncated'&&e.data?.scope==='variant'&&e.data?.exitCode===0)) throw new Error('managed residual cleanup warning/truncation evidence missing');
  const managedExitRunId=readdirSync(join(managedExitPipe.root,'runs')).sort().at(-1);
  const managedExitLog=readFileSync(join(managedExitPipe.root,'runs',managedExitRunId,'logs','variant-1.stdout.log'),'utf8');
  if(!managedExitLog.includes('managed parent exited normally')||!managedExitLog.includes('managed descendant incremental log')) throw new Error('managed normal exit inherited pipe lost incremental stdout logging');

  if(process.platform === 'linux') {
    const identityUnreadable = fixture('identity-unreadable');
    const identityUnreadableLock = join(identityUnreadable.root, 'autonomous-project.lock'); mkdirSync(identityUnreadableLock);
    writeJson(join(identityUnreadableLock, 'owner.json'), { schemaVersion:'apb.runner-lock.v1', pid:process.pid, token:'identity-owner', createdAt:new Date().toISOString(), startIdentity:'expected-start' });
    assertRunnerOk(run(identityUnreadable, { APB_PROC_ROOT:join(identityUnreadable.home, 'missing-proc') }), 'unreadable live owner identity');
    if(!existsSync(identityUnreadableLock) || json(join(identityUnreadableLock, 'owner.json')).token !== 'identity-owner') throw new Error('kill-confirmed v1 owner was called stale when process identity could not be read');

    const resistant = fixture('term-resistant-stream-descendant', false);
    const resistantHermes = join(resistant.home, 'resistant-hermes.cjs');
    const resistantPidPath = join(resistant.home, 'resistant-descendant.pid');
    writeFileSync(resistantHermes, `#!/usr/bin/env node\nconst fs=require('node:fs'),cp=require('node:child_process');\nconst code=\"process.on('SIGTERM',()=>{}); console.log('resistant descendant'); setInterval(()=>{},1000)\";\nconst child=cp.spawn(process.execPath,['-e',code],{stdio:['ignore','inherit','inherit']});\nfs.writeFileSync(process.env.DESCENDANT_PID,String(child.pid));\nsetInterval(()=>{},1000);\n`); chmodSync(resistantHermes,0o755);
    const resistantResult=run(resistant,{HERMES_BIN:resistantHermes,DESCENDANT_PID:resistantPidPath,APB_CLASSIC_TIMEOUT_MS:'250',APB_TERMINATION_GRACE_MS:'100'});
    if(existsSync(resistantPidPath)) cleanupPids.push(Number(readFileSync(resistantPidPath,'utf8')));
    assertRunnerOk(resistantResult,'TERM-resistant stream descendant timeout');
    const resistantState=json(join(resistant.root,'state.json'));
    if(resistantState.status!=='blocked'||!resistantState.block?.reason?.includes('timed out after 250ms')) throw new Error('TERM-resistant descendant timeout evidence missing');
    if(existsSync(join(resistant.root,'autonomous-project.lock'))) throw new Error('TERM-resistant descendant timeout left runner lock behind');
    const resistantPid=Number(readFileSync(resistantPidPath,'utf8'));
    for(let i=0;i<20&&alive(resistantPid);i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,50);
    if(alive(resistantPid)) throw new Error(`TERM-resistant stream descendant ${resistantPid} survived timeout cleanup`);

    const timed = fixture('classic-timeout', false);
    const fakeHermes = join(timed.home, 'fake-hermes.cjs');
    const descendantPid = join(timed.home, 'descendant.pid');
    writeFileSync(fakeHermes, `#!/usr/bin/env node\nconst fs=require('node:fs'),cp=require('node:child_process');\nconst child=cp.spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});\nfs.writeFileSync(process.env.DESCENDANT_PID,String(child.pid));\nconsole.log('fixture parent and descendant started');\nsetInterval(()=>{},1000);\n`);
    chmodSync(fakeHermes, 0o755);
    const result = run(timed, { HERMES_BIN:fakeHermes, DESCENDANT_PID:descendantPid, APB_CLASSIC_TIMEOUT_MS:'250', APB_TERMINATION_GRACE_MS:'100' });
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
  }

  console.log('smoke-runner-timeout-lock ok');
} finally {
  for(const pid of cleanupPids) { try { process.kill(pid,'SIGKILL'); } catch {} }
  for(const path of fixtures) rmSync(path, { recursive:true, force:true });
}
