#!/usr/bin/env bun
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync, appendFileSync } from "fs";
import { createHash, randomUUID } from "crypto";
import { homedir } from "os";
import { isAbsolute, join, sep } from "path";

// Run artifacts can contain source paths and operational evidence; keep them owner-only.
process.umask(0o077);

const HOME = homedir();
const ROOT = process.env.AUTONOMOUS_PROJECT_STATE_ROOT || process.env.AUTONOMOUS_PROJECTS_STATE_ROOT || join(HOME, ".hermes", "autonomous-projects");
const RUNS = join(ROOT, "runs");
const LOGS = join(ROOT, "logs");
const LOCK = join(ROOT, "autonomous-project.lock");
const STATE = join(ROOT, "state.json");
const EVENTS = join(ROOT, "events.jsonl");
const PROMPT = join(ROOT, "runner-prompt.md");
const TELEMETRY = join(ROOT, "telemetry.py");
const CONTROL = join(ROOT, "control.json");
const QUEUE = join(ROOT, "queue.json");
const GATES = join(ROOT, "gates.json");
const ITERATIONS = join(ROOT, "iterations.json");
const ADMISSION = join(ROOT, "runner-admission.json");
const PROJECT_PLANS = join(ROOT, "project-plans");
const HERMES = process.env.HERMES_BIN || join(HOME, ".local", "bin", "hermes");
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || process.env.TZ || "local";
const ACTIVE = new Set(["inventory-scanning","selecting","repo-created","spec-drafting","spec-review","spec-approved","devplan-drafting","devplan-review","devplan-approved","building","blocked","deblocking"]);
const HELD = new Set(["on-hold","held","blocked","deblocking"]);

function now(){ return new Date().toISOString(); }
function ensure(){ for (const p of [ROOT,RUNS,LOGS,join(ROOT,"artifacts")]) mkdirSync(p,{recursive:true}); }
function log(msg:string){ appendFileSync(join(LOGS,"midnight-runner.log"), `[${now()}] ${msg}\n`); }
function redact(text:string): string {
  return text
    .replace(/eyJ[a-zA-Z0-9._-]{20,}/g, "[REDACTED_JWT]")
    .replace(/sk-[a-zA-Z0-9_-]{16,}/g, "[REDACTED_OPENAI_KEY]")
    .replace(/gh[pousr]_[a-zA-Z0-9_]{16,}/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/(api[_-]?key|token|password|secret)\s*[:=]\s*[^\s,'\"}]+/gi, "$1=[REDACTED]")
    .slice(0, 1000);
}
function normalizeStatus(x:any): any { return x === "complete" ? "completed" : x; }
function normalizeState(s:any): any {
  if (!s || typeof s !== "object" || Array.isArray(s)) s = { currentRunId:null, status:"idle" };
  s.schemaVersion = s.schemaVersion || "apb.state.v1";
  s.status = normalizeStatus(s.status || "idle");
  s.phase = normalizeStatus(s.phase || s.status);
  if (Array.isArray(s.agents)) {
    s.agents = Object.fromEntries(s.agents.filter((a:any)=>a && typeof a === "object").map((a:any, i:number)=>[a.id || `agent-${i}`, { ...a, status: normalizeStatus(a.status) }]));
  } else if (!s.agents || typeof s.agents !== "object") {
    s.agents = {};
  } else {
    for (const [id, a] of Object.entries(s.agents)) if (a && typeof a === "object") (s.agents as any)[id] = { ...(a as any), status: normalizeStatus((a as any).status) };
  }
  return s;
}
function readJson(path:string, fallback:any): any { try { return JSON.parse(readFileSync(path,"utf8")); } catch { return fallback; } }
function readState(): any { return normalizeState(readJson(STATE,{ currentRunId:null, status:"idle", updatedAt:now(), agents:{} })); }
function writeState(s:any){ s=normalizeState(s); s.updatedAt=now(); s.timezone=TZ; writeFileSync(STATE, JSON.stringify(s,null,2)); }
function defaultControl(): any { return { schemaVersion:"apb.control.v1", runAdmission:"enabled", pause:{requested:false}, stop:{requested:false}, activeSteering:[], pinnedQueueItemId:null, currentObjective:null, nextRunRequest:null, requestedRunNow:false, autoIteration:{enabled:false,mode:"manual",targetGenerations:10,completedGenerations:0,currentGeneration:0,repoPath:null,objective:null,maxIterations:10,maxVariantsPerIteration:3,maxParallelVariants:3,maxAcceptedFeatures:4,maxVisualMotifChanges:1,maxNewSections:1,stopAfterNoImprovement:1,minImprovementScore:0.05,lastRunId:null,lastIterationId:null,lastCommit:null,lastBranch:null,startedAt:null,completedAt:null,stoppedAt:null,stopReason:null} }; }
function writeControl(c:any){ c.schemaVersion="apb.control.v1"; c.updatedAt=now(); writeFileSync(CONTROL, JSON.stringify(c,null,2)); }
function readControl(): any { return { ...defaultControl(), ...readJson(CONTROL,{}) }; }
function readQueue(): any { const q=readJson(QUEUE,{schemaVersion:"apb.queue.v1",items:[]}); if(!Array.isArray(q.items)) q.items=[]; return q; }
function writeQueue(q:any){ q.schemaVersion="apb.queue.v1"; q.updatedAt=now(); writeFileSync(QUEUE, JSON.stringify(q,null,2)); }
function readGates(): any { const g=readJson(GATES,{schemaVersion:"apb.gates.v1",gates:[]}); if(!Array.isArray(g.gates)) g.gates=[]; return g; }
function event(level:string, source:string, type:string, message:string, data:any={}){ appendFileSync(EVENTS, JSON.stringify({ id:`evt-${Date.now()}-${Math.random().toString(16).slice(2)}`, ts:now(), level, source, type, message:redact(message), runId:data?.runId, agentId:data?.agentId, data })+"\n"); }
function nextHourlyLocal(){ const d=new Date(); d.setHours(d.getHours()+1,0,0,0); return d.toISOString(); }
type LockOwner={schemaVersion:"apb.runner-lock.v1";pid:number;token:string;createdAt:string;startIdentity:string|null};
let lockToken:string|null=null;
function linuxStartIdentity(pid:number): string|null {
  if(process.platform!=="linux") return null;
  try { const procRoot=process.env.APB_PROC_ROOT||"/proc"; const stat=readFileSync(join(procRoot,String(pid),"stat"),"utf8"), rest=stat.slice(stat.lastIndexOf(")")+2).trim().split(/\s+/); return rest[19]||null; } catch { return null; }
}
function readLockOwner(path=LOCK): LockOwner|null {
  try { const owner=JSON.parse(readFileSync(join(path,"owner.json"),"utf8")); if(owner?.schemaVersion!=="apb.runner-lock.v1"||!Number.isInteger(owner.pid)||owner.pid<=0||typeof owner.token!=="string"||!owner.token||!Number.isFinite(Date.parse(owner.createdAt))||!(owner.startIdentity===null||typeof owner.startIdentity==="string")) return null; return owner; } catch { return null; }
}
function readLegacyLockPid(path=LOCK): number|null {
  try { const pid=Number(readFileSync(join(path,"pid"),"utf8").trim()); return Number.isInteger(pid)&&pid>0?pid:null; } catch { return null; }
}
function pidMayBeLive(pid:number): boolean {
  try { process.kill(pid,0); return true; } catch(err:any) { return err?.code==="EPERM"; }
}
type LockIdentityStatus="owned"|"stale"|"unknown";
function processIdentityStatus(owner:LockOwner): LockIdentityStatus {
  try { process.kill(owner.pid,0); } catch(err:any) { return err?.code==="ESRCH"?"stale":"unknown"; }
  if(process.platform==="linux"&&owner.startIdentity){ const current=linuxStartIdentity(owner.pid); if(current===null) return "unknown"; return current===owner.startIdentity?"owned":"stale"; }
  return "owned";
}
type LockSnapshot={dev:number;ino:number;ownerText:string|null;pidText:string|null};
function lockSnapshot(path=LOCK): LockSnapshot|null {
  try { const stat=lstatSync(path); let ownerText:string|null=null,pidText:string|null=null; try { ownerText=readFileSync(join(path,"owner.json"),"utf8"); } catch {} try { pidText=readFileSync(join(path,"pid"),"utf8"); } catch {} return {dev:stat.dev,ino:stat.ino,ownerText,pidText}; } catch { return null; }
}
function sameLockSnapshot(expected:LockSnapshot, path=LOCK): boolean { const current=lockSnapshot(path); return !!current&&current.dev===expected.dev&&current.ino===expected.ino&&current.ownerText===expected.ownerText&&current.pidText===expected.pidText; }
function staleTakeoverTestBarrier(){
  const ready=process.env.APB_TEST_STALE_READY, proceed=process.env.APB_TEST_STALE_CONTINUE; if(!ready||!proceed) return;
  try { writeFileSync(ready,"ready"); const deadline=Date.now()+5000; while(!existsSync(proceed)&&Date.now()<deadline) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10); } catch {}
}
function createOwnedLock(token:string): boolean {
  try { mkdirSync(LOCK); const owner:LockOwner={schemaVersion:"apb.runner-lock.v1",pid:process.pid,token,createdAt:now(),startIdentity:linuxStartIdentity(process.pid)}; writeFileSync(join(LOCK,"owner.json"),JSON.stringify(owner,null,2)); writeFileSync(join(LOCK,"pid"),String(process.pid)); lockToken=token; return true; } catch { return false; }
}
function lock(){
  const token=randomUUID(); if(createOwnedLock(token)) return true;
  const observed=lockSnapshot(); if(!observed) return false;
  let stale=false;
  try {
    const owner=readLockOwner();
    if(owner) stale=processIdentityStatus(owner)==="stale";
    else { const legacyPid=readLegacyLockPid(); if(legacyPid!==null&&pidMayBeLive(legacyPid)) return false; const grace=clampInt(process.env.APB_LOCK_INCOMPLETE_GRACE_MS,30000,100,300000); stale=Date.now()-statSync(LOCK).mtimeMs>=grace; }
  } catch { return false; }
  if(!stale) return false;
  staleTakeoverTestBarrier();
  if(!sameLockSnapshot(observed)) return false;
  const quarantine=`${LOCK}.stale-${token}`;
  try { renameSync(LOCK,quarantine); } catch { return false; }
  if(!sameLockSnapshot(observed,quarantine)){
    try { if(!existsSync(LOCK)) renameSync(quarantine,LOCK); } catch {}
    return false;
  }
  const acquired=createOwnedLock(token);
  try { rmSync(quarantine,{recursive:true,force:true}); } catch {}
  return acquired;
}
function unlock(){
  const token=lockToken; lockToken=null; if(!token) return;
  const observed=lockSnapshot(), current=readLockOwner();
  if(!observed||current?.token!==token) return;
  const release=`${LOCK}.release-${token}`;
  try { renameSync(LOCK,release); } catch { return; }
  if(!sameLockSnapshot(observed,release)){
    try { if(!existsSync(LOCK)) renameSync(release,LOCK); } catch {}
    return;
  }
  try { rmSync(release,{recursive:true,force:true}); } catch {}
}
function createRunId(){ const d=new Date(); const pad=(n:number)=>String(n).padStart(2,"0"); const base=`${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`; let id=base,index=2; while(existsSync(join(RUNS,id))) id=`${base}-${index++}`; return id; }

function canonical(value:any): any {
  if(Array.isArray(value)) return value.map(canonical);
  if(value && typeof value==="object") return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  return value;
}
function digest(value:any): string { return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex"); }
function canonicalJson(value:any): string {
  if(value===null||typeof value==="boolean"||typeof value==="string") return JSON.stringify(value);
  if(typeof value==="number"){ if(!Number.isFinite(value)) throw new Error("project launch contains a non-finite number"); return JSON.stringify(value); }
  if(Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if(value&&typeof value==="object") return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  throw new Error("project launch contains an unsupported JSON value");
}
function canonicalDigest(domain:string,value:any): string { return `sha256:${createHash("sha256").update(`${domain}\n`).update(canonicalJson(value)).digest("hex")}`; }
const PROJECT_ID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const PROJECT_DIGEST=/^sha256:[a-f0-9]{64}$/;
const PROJECT_COMMIT=/^[a-f0-9]{40,64}$/;
const PROJECT_PROHIBITED=new Set(["command","commands","argv","shell","script","executable","env","environment","validationcommands"]);
const PROJECT_LIMITS:any={maxIterations:[1,10],maxVariantsPerIteration:[1,5],maxParallelVariants:[1,5],maxAcceptedFeatures:[1,4],maxVisualMotifChanges:[0,1],maxNewSections:[0,1],stopAfterNoImprovement:[1,3]};
function projectObject(value:any,name:string): any { if(!value||typeof value!=="object"||Array.isArray(value)) throw new Error(`${name} must be an object`); return value; }
function projectId(value:any,name:string): string { if(typeof value!=="string"||!PROJECT_ID.test(value)) throw new Error(`${name} is not a bounded ASCII identifier`); return value; }
function projectExactKeys(value:any,allowed:string[],name:string){ const unknown=Object.keys(projectObject(value,name)).filter(key=>!allowed.includes(key)); if(unknown.length) throw new Error(`${name} contains unknown fields: ${unknown.slice(0,10).join(", ")}`); }
function rejectProjectExecutableShape(value:any,path="project plan",depth=0){
  if(depth>12) throw new Error(`${path} exceeds maximum nesting depth`);
  if(Array.isArray(value)){ if(value.length>250) throw new Error(`${path} has too many items`); value.forEach((item,i)=>rejectProjectExecutableShape(item,`${path}[${i}]`,depth+1)); return; }
  if(value&&typeof value==="object") for(const [key,item] of Object.entries(value)){ if(PROJECT_PROHIBITED.has(key.toLowerCase().replace(/[^a-z]/g,""))) throw new Error(`${path}.${key} is a prohibited executable field`); rejectProjectExecutableShape(item,`${path}.${key}`,depth+1); }
}
function readExactProjectJson(path:string,name:string): any { if(!existsSync(path)) throw new Error(`${name} record does not exist`); try { return JSON.parse(readFileSync(path,"utf8")); } catch { throw new Error(`${name} record is malformed JSON`); } }
function validateApprovedProjectContent(content:any,pipelineType:string){
  projectExactKeys(content,["pipelineType","title","problem","intendedUsers","objective","boundedScope","requirements","nonGoals","constraints","risks","repository","acceptanceGates","validationPolicy","milestones","limits","lineage"],"project plan content");
  rejectProjectExecutableShape(content);
  if(content.pipelineType!==pipelineType||!["classic","managed"].includes(content.pipelineType)) throw new Error("project plan pipeline binding is invalid");
  for(const key of ["title","problem","intendedUsers","objective","boundedScope"]) if(typeof content[key]!=="string"||!content[key].trim()) throw new Error(`project plan content.${key} is required`);
  for(const key of ["requirements","nonGoals","constraints","risks","milestones"]) if(!Array.isArray(content[key])||!content[key].length||content[key].some((x:any)=>typeof x!=="string"||!x.trim())) throw new Error(`project plan content.${key} must contain non-empty strings`);
  const policy=projectObject(content.validationPolicy,"project plan validationPolicy"); projectExactKeys(policy,["id","expectations","clientCommandsAllowed"],"project plan validationPolicy");
  if(policy.id!=="apb.runner-selected.v1"||policy.clientCommandsAllowed!==false||!Array.isArray(policy.expectations)||!policy.expectations.length) throw new Error("project plan must prohibit client commands and use runner-selected validation");
  const gates=content.acceptanceGates; if(!Array.isArray(gates)||gates.length>50) throw new Error("project plan acceptanceGates is malformed"); const gateIds=new Set<string>();
  for(const gate of gates){ projectExactKeys(gate,["id","description","severity","required","requiredEvidence"],"project plan acceptance gate"); const id=projectId(gate.id,"acceptance gate id"); if(gateIds.has(id)) throw new Error(`duplicate acceptance gate ${id}`); gateIds.add(id); if(typeof gate.description!=="string"||!gate.description.trim()||!["must","should"].includes(gate.severity)||typeof gate.required!=="boolean"||!Array.isArray(gate.requiredEvidence)) throw new Error(`acceptance gate ${id} is malformed`); for(const path of gate.requiredEvidence){ if(typeof path!=="string"||!path||isAbsolute(path)||path.includes("\\")||path.split("/").some((x:string)=>!x||x==="."||x==="..")||/^[A-Za-z][A-Za-z0-9+.-]*:/.test(path)) throw new Error(`acceptance gate ${id} contains unsafe evidence`); } if(gate.required&&!gate.requiredEvidence.length) throw new Error(`acceptance gate ${id} requires evidence`); }
  const limits=projectObject(content.limits,"project plan limits"); projectExactKeys(limits,Object.keys(PROJECT_LIMITS),"project plan limits"); for(const [key,bounds] of Object.entries(PROJECT_LIMITS) as any){ if(!Number.isInteger(limits[key])||limits[key]<bounds[0]||limits[key]>bounds[1]) throw new Error(`project plan limit ${key} is out of bounds`); } if(limits.maxParallelVariants>limits.maxVariantsPerIteration) throw new Error("project plan parallel variant limit exceeds variant limit");
  const lineage=projectObject(content.lineage,"project plan lineage"); projectExactKeys(lineage,["mode","sourcePlanId","sourceRevision","sourceRunId","sourceIterationId"],"project plan lineage"); if(!["new","clone","fork"].includes(lineage.mode)) throw new Error("project plan lineage mode is invalid");
  const repository=projectObject(content.repository,"project plan repository"); projectExactKeys(repository,["path","baseRef","baseCommit"],"project plan repository");
  if(pipelineType==="classic"&&[repository.path,repository.baseRef,repository.baseCommit].some((x:any)=>x!==null)) throw new Error("classic project plan must not contain repository inputs");
  if(pipelineType==="managed"&&(!isAbsolute(repository.path)||typeof repository.baseRef!=="string"||!repository.baseRef.trim()||!PROJECT_COMMIT.test(repository.baseCommit))) throw new Error("managed project plan repository binding is malformed");
}
type ProjectLaunchBinding={pointer:any;plan:any;approval:any;launch:any;ledger:any;content:any;identity:any};
function loadProjectLaunch(pointer:any): ProjectLaunchBinding {
  projectExactKeys(pointer,["schemaVersion","planId","revision","planDigest","approvalId","launchId","requestId","pipelineType","status"],"project launch pointer");
  if(pointer.schemaVersion!=="apb.project-launch-pointer.v1"||pointer.status!=="pending") throw new Error("project launch pointer is not pending");
  const planId=projectId(pointer.planId,"pointer planId"), approvalId=projectId(pointer.approvalId,"pointer approvalId"), launchId=projectId(pointer.launchId,"pointer launchId"), requestId=projectId(pointer.requestId,"pointer requestId");
  if(!Number.isInteger(pointer.revision)||pointer.revision<1||!PROJECT_DIGEST.test(pointer.planDigest)||!["classic","managed"].includes(pointer.pipelineType)) throw new Error("project launch pointer identity is malformed");
  const planRoot=join(PROJECT_PLANS,planId); const plan=readExactProjectJson(join(planRoot,"revisions",`${String(pointer.revision).padStart(6,"0")}.json`),"project plan revision"); const approval=readExactProjectJson(join(planRoot,"decisions",`${approvalId}.json`),"project plan approval"); const launch=readExactProjectJson(join(planRoot,"launches",`${launchId}.json`),"project launch"); const ledger=readExactProjectJson(join(planRoot,"ledger.json"),"project plan ledger");
  projectExactKeys(plan,["schemaVersion","planId","revision","parentRevision","createdAt","createdBy","content","contentDigest"],"project plan revision"); projectExactKeys(approval,["schemaVersion","decisionId","decision","planId","revision","planDigest","approver","approvedPipelineType","notes","decidedAt","recordDigest"],"project plan approval"); projectExactKeys(launch,["schemaVersion","launchId","idempotencyKey","planId","revision","planDigest","approvalId","approvalDigest","pipelineType","status","requestedAt","requestedBy","requestId","runId","iterationId"],"project launch");
  const planDigest=canonicalDigest("apb.project-plan.v1",{schemaVersion:plan.schemaVersion,planId:plan.planId,revision:plan.revision,parentRevision:plan.parentRevision,content:plan.content}); const approvalBody={...approval}; delete approvalBody.recordDigest; const approvalDigest=canonicalDigest("apb.project-plan-decision.v1",approvalBody);
  if(plan.schemaVersion!=="apb.project-plan.v1"||plan.contentDigest!==planDigest||planDigest!==pointer.planDigest) throw new Error("project plan digest binding is invalid");
  if(approval.schemaVersion!=="apb.project-plan-decision.v1"||approval.recordDigest!==approvalDigest||approval.decision!=="approved") throw new Error("project plan approval digest or decision is invalid");
  if(plan.planId!==planId||plan.revision!==pointer.revision||approval.planId!==planId||approval.revision!==pointer.revision||approval.planDigest!==planDigest||approval.decisionId!==approvalId||approval.approvedPipelineType!==pointer.pipelineType) throw new Error("project plan approval does not bind the exact revision");
  if(launch.schemaVersion!=="apb.project-launch.v1"||launch.launchId!==launchId||launch.planId!==planId||launch.revision!==pointer.revision||launch.planDigest!==planDigest||launch.approvalId!==approvalId||launch.approvalDigest!==approvalDigest||launch.pipelineType!==pointer.pipelineType||launch.requestId!==requestId||launch.status!=="requested"||launch.runId!==null||launch.iterationId!==null) throw new Error("project launch record does not bind the pointer exactly or was already claimed");
  if(ledger.schemaVersion!=="apb.project-plan-ledger.v1"||ledger.planId!==planId||ledger.currentRevision!==pointer.revision||ledger.currentDigest!==planDigest||ledger.effectiveApprovalId!==approvalId||ledger.activeLaunchId!==launchId||ledger.state!=="launch-requested"||ledger.validation?.revision!==pointer.revision||ledger.validation?.digest!==planDigest||ledger.validation?.valid!==true) throw new Error("project plan ledger is stale or unapproved");
  validateApprovedProjectContent(plan.content,pointer.pipelineType);
  const identity={planId,revision:pointer.revision,planDigest,approvalId,approvalDigest,launchId,requestId,pipelineType:pointer.pipelineType}; return {pointer,plan,approval,launch,ledger,content:plan.content,identity};
}
function writeProjectPlanIndex(ledger:any,content:any){ const path=join(PROJECT_PLANS,"index.json"), index=readJson(path,{schemaVersion:"apb.project-plan-index.v1",plans:{}}); index.plans=index.plans||{}; index.plans[ledger.planId]={...(index.plans[ledger.planId]||{}),planId:ledger.planId,title:content.title,pipelineType:content.pipelineType,state:ledger.state,version:ledger.version,currentRevision:ledger.currentRevision,currentDigest:ledger.currentDigest,activeLaunchId:ledger.activeLaunchId,updatedAt:ledger.updatedAt}; index.updatedAt=now(); writeFileSync(path,JSON.stringify(index,null,2)); }
function updateProjectLaunch(binding:ProjectLaunchBinding,status:"running"|"paused"|"blocked"|"completed",runId:string,iterationId:string|null=null,extra:any={}){
  const ts=now(), {identity}=binding; const launchPath=join(PROJECT_PLANS,identity.planId,"launches",`${identity.launchId}.json`), ledgerPath=join(PROJECT_PLANS,identity.planId,"ledger.json");
  const launch=readExactProjectJson(launchPath,"project launch"); if(launch.launchId!==identity.launchId||launch.requestId!==identity.requestId||launch.planDigest!==identity.planDigest||launch.approvalId!==identity.approvalId) throw new Error("project launch identity changed during execution");
  if(status==="running"&&!(launch.status==="requested"&&launch.runId===null)) throw new Error("project launch was already claimed");
  if(status!=="running"&&launch.runId!==runId) throw new Error("project launch run identity changed during execution");
  Object.assign(launch,{status,runId,iterationId:iterationId||launch.iterationId||null,updatedAt:ts,...extra}); writeFileSync(launchPath,JSON.stringify(launch,null,2));
  const ledger=readExactProjectJson(ledgerPath,"project plan ledger"); if(ledger.planId!==identity.planId||ledger.currentRevision!==identity.revision||ledger.currentDigest!==identity.planDigest||ledger.activeLaunchId!==identity.launchId) throw new Error("project plan ledger identity changed during execution"); Object.assign(ledger,{version:Number(ledger.version||0)+1,state:status,activeLaunchId:status==="running"?identity.launchId:null,updatedAt:ts}); writeFileSync(ledgerPath,JSON.stringify(ledger,null,2)); writeProjectPlanIndex(ledger,binding.content);
  const control=readControl(); if(control.projectLaunchRequest?.launchId===identity.launchId){ const current=control.projectLaunchRequest; if(current.requestId!==identity.requestId||current.planDigest!==identity.planDigest) throw new Error("project launch control pointer identity changed during execution"); control.projectLaunchRequest={...current,status,runId,iterationId:iterationId||current.iterationId||null,updatedAt:ts,...extra}; writeControl(control); }
}
function snapshotProjectLaunch(runRoot:string,binding:ProjectLaunchBinding){ const dir=join(runRoot,"artifacts","project-plan"); mkdirSync(dir,{recursive:true}); for(const [name,value] of [["approved-project-plan.json",binding.plan],["project-plan-approval.json",binding.approval],["project-launch.json",binding.launch]] as any){ writeFileSync(join(runRoot,name),JSON.stringify(value,null,2)); writeFileSync(join(dir,name),JSON.stringify(value,null,2)); } }
function projectManagedRequest(binding:ProjectLaunchBinding): any { const content=binding.content, lineage=content.lineage; return {id:binding.identity.requestId,type:"project-plan",status:"pending",repoPath:content.repository.path,baseRef:content.repository.baseRef,expectedBaseCommit:content.repository.baseCommit,objective:content.objective,changeText:content.boundedScope,limits:{...content.limits},snapshottedAcceptanceGates:content.acceptanceGates.map((gate:any)=>({...gate,requiredEvidence:[...gate.requiredEvidence]})),acceptanceGateIds:content.acceptanceGates.map((gate:any)=>gate.id),allowDirty:false,generation:1,targetGenerations:content.limits.maxIterations,sourceRunId:lineage.sourceRunId,sourceIterationId:lineage.sourceIterationId,projectLaunch:{...binding.identity,lineage:{...lineage}}}; }
function projectClassicContext(binding:ProjectLaunchBinding): string { return `\n\n# Hard approved project planning and execution context\n\nThis is an exact approved project-plan launch. Do not select another project and do not infer or replace any planning input from dashboard control, queue, gates, prior runs, or mutable state. Approval authorizes launch only and is not completion evidence. Execute the existing classic SPEC, DEVPLAN, build, final-audit, and gate-report workflow. The existing explicit completion evidence contract remains mandatory. Never merge, push, deploy, publish, or mutate an existing normal source branch.\n\nApproved identity:\n${JSON.stringify(binding.identity,null,2)}\n\nExact approved content:\n${JSON.stringify(binding.content,null,2)}\n`; }
function bindingFromRun(runRoot:string): ProjectLaunchBinding|null { const plan=readJson(join(runRoot,"approved-project-plan.json"),null), approval=readJson(join(runRoot,"project-plan-approval.json"),null), launch=readJson(join(runRoot,"project-launch.json"),null); if(!plan||!approval||!launch) return null; const pointer={schemaVersion:"apb.project-launch-pointer.v1",planId:launch.planId,revision:launch.revision,planDigest:launch.planDigest,approvalId:launch.approvalId,launchId:launch.launchId,requestId:launch.requestId,pipelineType:launch.pipelineType,status:"pending"}; return {pointer,plan,approval,launch,ledger:{},content:plan.content,identity:{planId:launch.planId,revision:launch.revision,planDigest:launch.planDigest,approvalId:launch.approvalId,approvalDigest:launch.approvalDigest,launchId:launch.launchId,requestId:launch.requestId,pipelineType:launch.pipelineType}}; }
function reconcileProjectRun(runId:string,runRoot:string,status:"paused"|"blocked"|"completed",iterationId:string|null=null,extra:any={}){ const binding=bindingFromRun(runRoot); if(binding) updateProjectLaunch(binding,status,runId,iterationId,extra); }
function pinnedItem(control:any, queue:any): any | null { return queue.items?.find((x:any)=>x.id===control.pinnedQueueItemId)||queue.items?.find((x:any)=>x.status==="pinned")||null; }
function stableBlockers(state:any): any[] {
  return (Array.isArray(state?.blockers)?state.blockers:[]).map((b:any)=>({id:b?.id||null,code:b?.code||null,status:b?.status||null,severity:b?.severity||null,summary:b?.summary||null}));
}
async function admissionFingerprint(state:any, control:any, queue:any): Promise<string> {
  const pinned=pinnedItem(control,queue);
  const repoPath=pinned?.target?.preferredRepo||state?.repoPath||null;
  let repo:any=null;
  if(repoPath && existsSync(repoPath)){
    const head=await gitCmd(repoPath,["rev-parse","HEAD"]);
    const status=await gitCmd(repoPath,["status","--porcelain=v1"]);
    repo={path:repoPath,head:head.exitCode===0?head.stdout.trim():null,statusDigest:status.exitCode===0?digest(status.stdout.split(/\r?\n/).filter(Boolean).sort()):null};
  }
  return digest({
    state:{status:normalizeStatus(state?.status),phase:normalizeStatus(state?.phase),currentRunId:state?.currentRunId||null,holdReason:state?.hold?.reason||null,blockReason:state?.block?.reason||null,blockers:stableBlockers(state)},
    control:{runAdmission:control?.runAdmission,pinnedQueueItemId:control?.pinnedQueueItemId||null,currentObjective:control?.currentObjective?.text||null,nextRunRequest:control?.nextRunRequest||null,requestedRunNow:!!control?.requestedRunNow,activeSteering:(control?.activeSteering||[]).map((x:any)=>({id:x.id,scope:x.scope,priority:x.priority,text:x.text,status:x.status||"active"}))},
    queue:(queue?.items||[]).map((x:any)=>({id:x.id,status:x.status,title:x.title,objective:x.objective,updatedAt:x.updatedAt||null})),repo
  });
}
function writeAdmissionReceipt(fingerprint:string, disposition:string, prior:any={}, extra:any={}){
  writeFileSync(ADMISSION,JSON.stringify({schemaVersion:"apb.runner-admission.v1",fingerprint,disposition,firstObservedAt:prior?.fingerprint===fingerprint?prior.firstObservedAt||now():now(),lastObservedAt:now(),suppressedTickCount:prior?.fingerprint===fingerprint?Number(prior.suppressedTickCount||0):0,...extra},null,2));
}
function deferHeldPinnedItem(runId:string, state:any): boolean {
  const control=readControl(), queue=readQueue(), pinned=pinnedItem(control,queue);
  if(!pinned) return false;
  const reason=state?.hold?.reason||state?.block?.reason||"Pinned project reached a held terminal disposition";
  queue.items=queue.items.map((x:any)=>x.id===pinned.id?{...x,previousStatus:x.status,status:"held",heldAt:now(),heldByRunId:runId,heldReason:reason}:x);
  writeQueue(queue);
  control.pinnedQueueItemId=null;
  if(control.currentObjective?.queueItemId===pinned.id || String(control.currentObjective?.text||"").toLowerCase().includes(String(pinned.title||"").toLowerCase())) control.currentObjective=null;
  const active=Array.isArray(control.activeSteering)?control.activeSteering:[];
  const retired=active.filter((x:any)=>x?.scope==="next_run"||String(x?.text||"").toLowerCase().includes(String(pinned.title||"").toLowerCase()));
  control.activeSteering=active.filter((x:any)=>!retired.includes(x));
  if(retired.length) control.steeringHistory=[...(Array.isArray(control.steeringHistory)?control.steeringHistory:[]),...retired.map((x:any)=>({...x,status:"deferred",deferredAt:now(),deferredReason:reason}))];
  control.requestedRunNow=true;
  control.progressHandoff={status:"pending",sourceRunId:runId,deferredQueueItemId:pinned.id,reason:"Rotate away from unchanged held work and select a different actionable project",createdAt:now()};
  writeControl(control);
  event("warn","system","queue-item-deferred",`Deferred held pinned project ${pinned.title||pinned.id}; next run must select different actionable work`,{runId,queueItemId:pinned.id,reason});
  return true;
}

function queueIdeaText(item:any, gates:any[]): string {
  const wanted=new Set(item?.acceptanceGateIds||[]);
  const gateLines=gates.filter((g:any)=>wanted.size===0||wanted.has(g.id)).map((g:any)=>`- ${g.id}: ${g.description||g.title||"gate"} Evidence: ${(g.requiredEvidence||[]).join("; ")}`);
  return [`# ${item?.title||"Queued autonomous project"}`, "", `Objective: ${item?.objective||""}`, item?.context?`Context: ${item.context}`:"", "", "Constraints:", ...((item?.constraints||[]).map((x:string)=>`- ${x}`)), "", "Acceptance gates:", ...(gateLines.length?gateLines:["- Produce tests, benchmarks, docs, and final evidence."]), item?.target?.preferredRepo?`Preferred repo: ${item.target.preferredRepo}`:""].filter(Boolean).join("\n");
}
function sourceRunContext(req:any): any {
  if(!req?.sourceRunId) return null;
  const root=join(RUNS, String(req.sourceRunId));
  const run=readJson(join(root,"run.json"),{});
  const gate=readJson(join(root,"artifacts","gate-report.json"),{});
  const auditPath=join(root,"artifacts","final-audit.md");
  return { runId:req.sourceRunId, run, gateReport:gate, finalAuditPath:existsSync(auditPath)?auditPath:null };
}
function steeringSnapshot(runRoot:string): string {
  const control=readControl(), queue=readQueue(), gates=readGates();
  const pinned=pinnedItem(control,queue);
  if(pinned){ writeFileSync(join(runRoot,"idea.txt"), queueIdeaText(pinned,gates.gates)); }
  const req=control.nextRunRequest || null;
  const source=sourceRunContext(req);
  const loopRules={maxVariants:req?.limits?.maxVariantsPerIteration||control.autoIteration?.maxVariantsPerIteration||3,maxAcceptedFeatures:req?.limits?.maxAcceptedFeatures||control.autoIteration?.maxAcceptedFeatures||4,maxVisualMotifChanges:req?.limits?.maxVisualMotifChanges||control.autoIteration?.maxVisualMotifChanges||1,maxNewSections:req?.limits?.maxNewSections||control.autoIteration?.maxNewSections||1,stopAfterNoImprovement:req?.limits?.stopAfterNoImprovement||control.autoIteration?.stopAfterNoImprovement||1};
  const packet={control:{runAdmission:control.runAdmission,currentObjective:control.currentObjective||null,nextRunRequest:req,requestedRunNow:!!control.requestedRunNow,activeSteering:control.activeSteering||[],progressHandoff:control.progressHandoff||null},pinnedItem:pinned||null,heldItems:(queue.items||[]).filter((x:any)=>["held","deferred","blocked"].includes(x.status)).map((x:any)=>({id:x.id,title:x.title,status:x.status,heldReason:x.heldReason||null,target:x.target||null})),actionableQueue:(queue.items||[]).filter((x:any)=>["queued","pinned","ready"].includes(x.status)).slice(0,6),nextRunRequest:req,sourceRunContext:source,boundedIterationRules:loopRules,acceptanceGates:(gates.gates||[]).slice(0,12)};
  return `\n\n# Bounded dashboard steering packet\n\n${JSON.stringify(packet,null,2)}\n\nDo not select held/deferred queue items unless a new explicit nextRunRequest or materially changed authority/evidence makes them actionable. If no pin/request exists, select a genuinely different actionable project or unfinished project slice with a clean progress path. Never repeat an unchanged hold review. A pin is a hard override only while its status is pinned. Honor pause/stop at safe checkpoints.\n`;
}
function clampInt(value:any, fallback:number, min:number, max:number): number {
  const n=Number(value);
  if(!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}
function resolveIterationRequest(control:any, state:any, queue:any): any | null {
  const req=control.nextRunRequest?.status === "pending" ? control.nextRunRequest : null;
  const pinned=pinnedItem(control,queue);
  const auto=control.autoIteration?.enabled ? control.autoIteration : null;
  const source=req||auto;
  if(!source) return null;
  const repoPath=source.repoPath||source.baseRepoPath||control.autoIteration?.repoPath||pinned?.target?.preferredRepo||state.repoPath||"/home/mojo/autonomous-projects/hermes-showcase-site";
  const objective=source.objective||source.text||control.currentObjective?.text||pinned?.objective||"Continue bounded autonomous product iteration";
  return {
    id: source.id||`auto-${Date.now()}`,
    type: source.type||source.kind||"start_next_iteration",
    status: source.status||"pending",
    sourceRunId: source.sourceRunId||source.runId||state.currentRunId||null,
    sourceIterationId: source.sourceIterationId||source.iterationId||null,
    repoPath,
    baseRef: source.baseRef||source.baseCommit||"HEAD",
    objective,
    changeText: source.changeText||source.change||source.directive||"",
    limits:{
      maxIterations:clampInt(source.limits?.maxIterations||source.maxIterations||source.targetGenerations||control.autoIteration?.targetGenerations||control.autoIteration?.maxIterations,10,1,10),
      maxVariantsPerIteration:clampInt(source.limits?.maxVariantsPerIteration||source.variantCount||control.autoIteration?.maxVariantsPerIteration,3,1,5),
      maxParallelVariants:clampInt(source.limits?.maxParallelVariants||source.maxParallelVariants||control.autoIteration?.maxParallelVariants,3,1,5),
      maxAcceptedFeatures:clampInt(source.limits?.maxAcceptedFeatures||control.autoIteration?.maxAcceptedFeatures,4,1,4),
      maxVisualMotifChanges:clampInt(source.limits?.maxVisualMotifChanges||control.autoIteration?.maxVisualMotifChanges,1,0,1),
      maxNewSections:clampInt(source.limits?.maxNewSections||control.autoIteration?.maxNewSections,1,0,1),
      stopAfterNoImprovement:clampInt(source.limits?.stopAfterNoImprovement||control.autoIteration?.stopAfterNoImprovement,1,1,3)
    },
    acceptanceGateIds: Array.isArray(source.acceptanceGateIds)?source.acceptanceGateIds:(Array.isArray(pinned?.acceptanceGateIds)?pinned.acceptanceGateIds:[]),
    allowDirty: source.allowDirty === true || source.allowDirtyRepo === true || source.limits?.allowDirty === true,
    generation: clampInt(source.generation||source.currentGeneration||control.autoIteration?.currentGeneration,1,1,10),
    targetGenerations: clampInt(source.targetGenerations||source.limits?.targetGenerations||control.autoIteration?.targetGenerations||control.autoIteration?.maxIterations,10,1,10)
  };
}
function validateLaunchRequest(req:any) {
  const missing:string[]=[];
  if(!req || typeof req!=="object") throw new Error("managed launch request must be an object");
  for(const [key,value] of [["id",req.id],["repoPath",req.repoPath],["objective",req.objective],["changeText",req.changeText],["baseRef",req.baseRef]]) if(typeof value!=="string"||!value.trim()) missing.push(key);
  if(!req.limits || typeof req.limits!=="object") missing.push("limits");
  if(missing.length) throw new Error(`managed launch request is incomplete: ${missing.join(", ")}`);
}
function snapshotAcceptanceGates(req:any): any[] {
  if(Array.isArray(req.snapshottedAcceptanceGates)) return req.snapshottedAcceptanceGates.map((g:any)=>({id:g.id,description:g.description,severity:g.severity,required:g.required,requiredEvidence:[...g.requiredEvidence]}));
  const configured=readGates().gates||[];
  const wanted=new Set(Array.isArray(req.acceptanceGateIds)?req.acceptanceGateIds:[]);
  const selected=configured.filter((g:any)=>wanted.size===0||wanted.has(g.id));
  const missing=[...wanted].filter(id=>!selected.some((g:any)=>g.id===id)); if(missing.length) throw new Error(`managed launch request references unknown acceptance gates: ${missing.join(", ")}`);
  return selected.map((g:any)=>({
    id:String(g.id||""), description:String(g.description||g.title||"Acceptance gate"), severity:String(g.severity||"must"),
    required:g.required!==false&&String(g.severity||"must")!=="optional", requiredEvidence:Array.isArray(g.requiredEvidence)?g.requiredEvidence.map(String):[]
  }));
}
function lifecyclePaths(runRoot:string){ return [join(runRoot,"lifecycle-contract.json"),join(runRoot,"artifacts","lifecycle-contract.json")]; }
function writeLifecycle(runRoot:string, lifecycle:any){ for(const path of lifecyclePaths(runRoot)) writeFileSync(path,JSON.stringify(lifecycle,null,2)); }
function patchLifecycle(runRoot:string, patch:any){ const lifecycle=readJson(join(runRoot,"lifecycle-contract.json"),{}); const next={...lifecycle,...patch,updatedAt:now()}; writeLifecycle(runRoot,next); return next; }
function writeIterationScaffold(runId:string, runRoot:string, req:any) {
  validateLaunchRequest(req);
  const art=join(runRoot,"artifacts");
  for(const d of [join(art,"iterations"),join(art,"variants"),join(art,"evaluations"),join(art,"synthesis")]) mkdirSync(d,{recursive:true});
  const source=req.sourceRunId?sourceRunContext({sourceRunId:req.sourceRunId}):null;
  const iterationId=`iter-${runId}`;
  const acceptanceGates=snapshotAcceptanceGates(req);
  const lifecycle={
    schemaVersion:"apb.managed-lifecycle.v1", runId, iterationId, requestId:req.id, state:"launching", createdAt:now(), updatedAt:now(),
    repository:{path:req.repoPath}, objective:req.objective, boundedChangeRequest:req.changeText,
    lineage:{sourceRunId:req.sourceRunId||null,sourceIterationId:req.sourceIterationId||null},
    base:{ref:req.baseRef,commit:null}, validationPlan:{source:"runner-policy",commands:[],policy:["git diff --check from base commit","declared package test/build scripts when present"]},
    acceptanceGates, dirtyRepoPolicy:{allowDirty:req.allowDirty===true,policy:req.allowDirty===true?"explicitly-allowed":"require-clean"}, limits:req.limits,
    checkpoints:["preflight","after-variants","after-evaluation","before-mashup","after-validation"]
  };
  if(req.projectLaunch) Object.assign(lifecycle,{projectLaunch:{...req.projectLaunch},planId:req.projectLaunch.planId,revision:req.projectLaunch.revision,planDigest:req.projectLaunch.planDigest,approvalId:req.projectLaunch.approvalId,launchId:req.projectLaunch.launchId});
  writeLifecycle(runRoot,lifecycle);
  const iteration={
    schemaVersion:"apb.iteration.v1",
    id:iterationId,
    runId,
    parentIterationId:req.sourceIterationId||null,
    sourceRunId:req.sourceRunId||null,
    mode:req.type,
    objective:req.objective,
    steeringText:req.changeText||"",
    repoPath:req.repoPath||null,
    baseRef:req.baseRef||"HEAD",
    generation:req.generation||1,
    targetGenerations:req.targetGenerations||req.limits?.maxIterations||10,
    limits:req.limits,
    requestId:req.id,
    acceptanceGates,
    requiredArtifacts:["lifecycle-contract.json","variants/*.json","evaluations/*.json","synthesis/synthesis.json","gate-decisions.json","gate-report.json","handoff.json"],
    loopContract:{
      variantCount:req.limits.maxVariantsPerIteration,
      evaluatorCount:Math.min(3, Math.max(1, req.limits.maxParallelVariants)),
      acceptedFeaturesMax:req.limits.maxAcceptedFeatures,
      visualMotifChangesMax:req.limits.maxVisualMotifChanges,
      newSectionsMax:req.limits.maxNewSections,
      rule:"Every accepted feature must map to the objective and evidence gate. No unrelated features or tech-stack churn."
    },
    status:"orchestrator-running",
    createdAt:now()
  };
  if(req.projectLaunch) Object.assign(iteration,{projectLaunch:{...req.projectLaunch},planId:req.projectLaunch.planId,revision:req.projectLaunch.revision,planDigest:req.projectLaunch.planDigest,approvalId:req.projectLaunch.approvalId,launchId:req.projectLaunch.launchId});
  writeFileSync(join(runRoot,"iteration-state.json"), JSON.stringify(iteration,null,2));
  writeFileSync(join(art,"iterations","iteration.json"), JSON.stringify(iteration,null,2));
  writeFileSync(join(art,"source-evidence.json"), JSON.stringify({schemaVersion:"apb.source-evidence.v1",runId,sourceRunId:req.sourceRunId||null,source,createdAt:now()},null,2));
  writeFileSync(join(art,"gate-decisions.json"), JSON.stringify([],null,2));
  return iteration;
}
function iterationPromptAppend(req:any): string {
  return `\n\n# Runner-managed bounded iteration contract\n\nThis run has an explicit iteration request. You MUST treat it as product iteration, not new-project selection.\n\nObjective: ${req.objective}\nChange request: ${req.changeText||"(none)"}\nRepository: ${req.repoPath||"resolve from pinned/source context"}\nBase ref: ${req.baseRef||"HEAD"}\nSource run: ${req.sourceRunId||"none"}\n\nBounds:\n- Generate ${req.limits.maxVariantsPerIteration} parallel variant directions/subagents.\n- Accept at most ${req.limits.maxAcceptedFeatures} features.\n- Change at most ${req.limits.maxVisualMotifChanges} visual motif.\n- Add at most ${req.limits.maxNewSections} new section/screen.\n- No unrelated features. No tech-stack churn unless explicitly justified.\n\nRequired persisted artifacts:\n- artifacts/variants/variant-<id>.json with objective mapping, diff summary, screenshots/tests considered.\n- artifacts/evaluations/evaluation-<variant-id>.json with design/content/performance/accessibility scores.\n- artifacts/synthesis/synthesis.json with accepted/rejected feature rationale.\n- artifacts/gate-decisions.json with evidence links.\n\nUse the telemetry helper to expose variant/evaluator/mashup agents in the dashboard.\n`;
}
function parseFinalSummary(runRoot:string): any {
  const finalSummaryPath=join(runRoot,"artifacts","final-summary.md");
  const finalAuditPath=join(runRoot,"artifacts","final-audit.md");
  const path=existsSync(finalSummaryPath)?finalSummaryPath:(existsSync(finalAuditPath)?finalAuditPath:finalSummaryPath);
  if(!existsSync(path)) return {};
  const txt=readFileSync(path,"utf8");
  const project=(txt.match(/Project:\s*`?([^`\n]+)`?/i)||[])[1]?.trim();
  const repoPath=(txt.match(/Repo:\s*`?([^`\n]+)`?/i)||txt.match(/Repository:\s*`?([^`\n]+)`?/i)||[])[1]?.trim();
  const commit=(txt.match(/Commit:\s*`?([0-9a-f]{7,40}[^`\n]*)`?/i)||[])[1]?.trim();
  const commands=[...txt.matchAll(/`(npm [^`]+|bun [^`]+|python[^`]+)`/g)].map(m=>({name:m[1],exitCode:0}));
  return {project, repoPath, commit, commands, summaryPath:path.endsWith("final-audit.md")?"artifacts/final-audit.md":"artifacts/final-summary.md"};
}
function terminalAuditEvidence(runRoot:string, gateReport:any): boolean {
  const paths=[join(runRoot,"artifacts","final-summary.md"),join(runRoot,"artifacts","final-audit.md")].filter(existsSync);
  return paths.some(path=>{
    const text=readFileSync(path,"utf8");
    const repo=(text.match(/(?:Repo|Repository):\s*`?([^`\n]+)`?/i)||[])[1]?.trim();
    const commit=(text.match(/Commit:\s*`?([0-9a-f]{7,40})`?/i)||[])[1]?.trim();
    return !!repo && !!commit && repo===gateReport.repoPath && commit===gateReport.commit &&
      /(?:Implemented scope|Summary):\s*\S/i.test(text) && /Validation:\s*\S/i.test(text) &&
      /Known risks:\s*\S/i.test(text) && /(?:Rollback|Recovery):\s*\S/i.test(text) &&
      /Next operator action:\s*\S/i.test(text);
  });
}
function hasPassingCompletionGateReport(runId:string, gateReport:any): boolean {
  if(!gateReport || gateReport.schemaVersion!=="apb.gate-report.v1" || gateReport.runId!==runId || gateReport.status!=="passed") return false;
  if(typeof gateReport.repoPath!=="string" || !gateReport.repoPath.trim() || !isAbsolute(gateReport.repoPath) || !existsSync(gateReport.repoPath) || typeof gateReport.commit!=="string" || !gateReport.commit.trim()) return false;
  const rev=Bun.spawnSync(["git","rev-parse","--verify",`${gateReport.commit}^{commit}`],{cwd:gateReport.repoPath,stdout:"ignore",stderr:"ignore"});
  return rev.exitCode===0 && Array.isArray(gateReport.commands) && gateReport.commands.length>0 && gateReport.commands.every((command:any)=>
    command && typeof command.command==="string" && command.command.trim() && command.exitCode===0 && command.passed===true
  );
}
function writeCompletionEvidence(runId:string, runRoot:string): boolean {
  const st=readState();
  const runPath=join(runRoot,"run.json");
  const run=readJson(runPath,{id:runId});
  const gatePath=join(runRoot,"artifacts","gate-report.json");
  const gateReport=readJson(gatePath,null);
  if(normalizeStatus(st.status)!=="completed" || normalizeStatus(run.status)!=="completed" || !hasPassingCompletionGateReport(runId,gateReport) || !terminalAuditEvidence(runRoot,gateReport)) return false;
  const summary=parseFinalSummary(runRoot);
  const artifacts=Array.from(new Set([summary.summaryPath?.replace(/^artifacts\//,"")||"final-summary.md","gate-report.json"]));
  writeFileSync(join(runRoot,"artifacts","artifact-manifest.json"), JSON.stringify({schemaVersion:"apb.artifact-manifest.v1",runId,generatedAt:now(),artifacts,gateReport:"artifacts/gate-report.json",finalSummary:summary.summaryPath||"artifacts/final-summary.md"},null,2));
  st.completedAt=st.completedAt||now(); st.selectedProject=summary.project||st.selectedProject; st.currentProject=summary.project||st.currentProject; st.repoPath=summary.repoPath||st.repoPath; st.commit=summary.commit||st.commit; st.qualityGate={status:"passed",gateReportPath:`runs/${runId}/artifacts/gate-report.json`,commands:gateReport.commands||[]}; st.finalValidation=gateReport;
  for(const [id,a] of Object.entries(st.agents||{})) if((a as any)?.status==="running") (st.agents as any)[id]={...(a as any),status:"completed",updatedAt:now()};
  st.lastAction=`Hermes workflow completed with explicit passing evidence for ${runId}`;
  writeState(st);
  Object.assign(run,{id:runId,runId,status:"completed",phase:"completed",completedAt:st.completedAt,selectedProject:st.selectedProject,currentProject:st.currentProject,repoPath:st.repoPath,commit:st.commit,qualityGate:st.qualityGate,finalValidation:st.finalValidation}); writeFileSync(runPath,JSON.stringify(run,null,2));
  return true;
}

type CmdResult = { exitCode:number; stdout:string; stderr:string; timedOut?:boolean; timeoutMs?:number; terminationConfirmed?:boolean };
type TimeoutEvidence = { scope:TimeoutScope; command?:string; agentId?:string; timeoutMs:number; exitCode:124; cleanup?:{terminationConfirmed:boolean; platform:string} };
class RunnerTimeoutError extends Error {
  timeout:TimeoutEvidence;
  constructor(message:string, timeout:TimeoutEvidence){ super(message); this.name="RunnerTimeoutError"; this.timeout=timeout; }
}
type WorktreeVariant = { id:string; index:number; path:string; branch:string; commit?:string; status?:string; json?:any; diffPath?:string; validation?:any[]; evaluation?:any };

type TimeoutScope="command"|"classic"|"variant"|"evaluator";
type ProcessOutcome={exitCode:number;timedOut:boolean;timeoutMs:number;terminationConfirmed?:boolean;streamDrainTimedOut?:boolean;streamDrainTimeoutMs?:number;residualTerminationConfirmed?:boolean};
type ProcessStreamPump={done:Promise<void>;cancel:()=>void};
function timeoutMs(scope:TimeoutScope, override?:number): number {
  const defaults={command:600000,classic:7200000,variant:2700000,evaluator:1200000};
  const names={command:"APB_COMMAND_TIMEOUT_MS",classic:"APB_CLASSIC_TIMEOUT_MS",variant:"APB_VARIANT_TIMEOUT_MS",evaluator:"APB_EVALUATOR_TIMEOUT_MS"};
  return clampInt(override??process.env[names[scope]],defaults[scope],100,7200000);
}
function signalProcessTree(proc:any, signal:"SIGTERM"|"SIGKILL"){
  if(process.platform==="linux"&&Number.isInteger(proc.pid)){ try { process.kill(-proc.pid,signal); return; } catch {} }
  try { proc.kill(signal); } catch {}
}
async function raceWithDelay<T,F>(promise:Promise<T>, delayMs:number, fallback:F): Promise<T|F> {
  let timer:ReturnType<typeof setTimeout>|undefined;
  try { return await Promise.race([promise,new Promise<F>(resolve=>{ timer=setTimeout(()=>resolve(fallback),delayMs); })]); }
  finally { if(timer!==undefined) clearTimeout(timer); }
}
async function waitForProcess(proc:any, scope:TimeoutScope, override?:number): Promise<ProcessOutcome> {
  const bounded=timeoutMs(scope,override), exited=Promise.resolve(proc.exited).then((exitCode:number)=>({kind:"exit" as const,exitCode}));
  const first=await raceWithDelay(exited,bounded,{kind:"timeout" as const,exitCode:124});
  if(first.kind==="exit") return {exitCode:first.exitCode,timedOut:false,timeoutMs:bounded};
  signalProcessTree(proc,"SIGTERM");
  const grace=clampInt(process.env.APB_TERMINATION_GRACE_MS,5000,10,60000);
  let confirmed=(await raceWithDelay(exited,grace,null))!==null;
  if(!confirmed){ signalProcessTree(proc,"SIGKILL"); confirmed=(await raceWithDelay(exited,grace,null))!==null; }
  if(process.env.APB_TEST_SUPPRESS_EXIT_CONFIRMATION==="1") confirmed=false;
  return {exitCode:124,timedOut:true,timeoutMs:bounded,terminationConfirmed:confirmed};
}
function pumpProcessStream(stream:ReadableStream<Uint8Array>|null, onChunk:(chunk:Uint8Array)=>void): ProcessStreamPump {
  if(!stream) return {done:Promise.resolve(),cancel:()=>{}};
  const reader=stream.getReader(); let cancelled=false;
  const done=(async()=>{
    try { while(true){ const next=await reader.read(); if(next.done) break; onChunk(next.value); } }
    catch(err){ if(!cancelled) throw err; }
    finally { try { reader.releaseLock(); } catch {} }
  })();
  return {done,cancel:()=>{ cancelled=true; void reader.cancel("runner stream drain timeout").catch(()=>{}); }};
}
async function drainProcessStreams(proc:any, outcome:ProcessOutcome, streams:ProcessStreamPump[]): Promise<void> {
  const draining=Promise.all(streams.map(stream=>stream.done));
  const drainMs=clampInt(process.env.APB_STREAM_DRAIN_TIMEOUT_MS,5000,10,60000), marker=Symbol("stream-drain-timeout");
  if(await raceWithDelay(draining,drainMs,marker)!==marker) return;
  outcome.streamDrainTimedOut=true; outcome.streamDrainTimeoutMs=drainMs;
  signalProcessTree(proc,"SIGTERM");
  const grace=clampInt(process.env.APB_TERMINATION_GRACE_MS,5000,10,60000);
  await raceWithDelay(draining,grace,marker);
  signalProcessTree(proc,"SIGKILL");
  for(const stream of streams) stream.cancel();
  await raceWithDelay(Promise.allSettled(streams.map(stream=>stream.done)),grace,null);
  if(process.platform==="linux"&&Number.isInteger(proc.pid)){
    let alive=true; for(let i=0;i<10&&alive;i++){ try{ process.kill(-proc.pid,0); await Bun.sleep(10); }catch{ alive=false; } }
    outcome.residualTerminationConfirmed=!alive;
  } else outcome.residualTerminationConfirmed=false;
}
function spawnOptions(options:any): any { return {...options,...(process.platform==="linux"?{detached:true}:{})}; }
async function runCmd(args:string[], opts:{cwd:string; env?:Record<string,string>; timeoutMs?:number}): Promise<CmdResult> {
  const proc = Bun.spawn(args, spawnOptions({ cwd: opts.cwd, env: { ...process.env, ...(opts.env||{}) }, stdout:"pipe", stderr:"pipe" }));
  const decoderOut=new TextDecoder(), decoderErr=new TextDecoder(); let stdout="",stderr="";
  const outPump=pumpProcessStream(proc.stdout,chunk=>{ stdout+=decoderOut.decode(chunk,{stream:true}); });
  const errPump=pumpProcessStream(proc.stderr,chunk=>{ stderr+=decoderErr.decode(chunk,{stream:true}); });
  const outcome = await waitForProcess(proc,"command",opts.timeoutMs);
  await drainProcessStreams(proc,outcome,[outPump,errPump]);
  stdout+=decoderOut.decode(); stderr+=decoderErr.decode();
  if(outcome.streamDrainTimedOut) stderr+=`${stderr?"\n":""}runner stream drain exceeded its bounded timeout`;
  return { ...outcome, stdout, stderr };
}
async function gitCmd(cwd:string, args:string[]): Promise<CmdResult> { return runCmd(["git", ...args], { cwd }); }
function safeBranchPart(x:string): string { return String(x).replace(/[^a-zA-Z0-9._/-]+/g,"-").replace(/^[-/]+|[-/]+$/g,"").slice(0,80) || "run"; }
function writeRunJson(runRoot:string, patch:any){ const runPath=join(runRoot,"run.json"); const run=readJson(runPath,{}); writeFileSync(runPath, JSON.stringify({...run,...patch,id:run.id||patch.runId,runId:patch.runId||run.runId||run.id},null,2)); }
function updateAgent(runId:string, agentId:string, patch:any){ const st=readState(); st.agents=st.agents&&typeof st.agents==="object"&&!Array.isArray(st.agents)?st.agents:{}; st.agents[agentId]={...(st.agents[agentId]||{}),id:agentId,...patch,updatedAt:now()}; writeState(st); }
function reconcileIteration(req:any, runId:string, iterationId:string, status:string, extra:any={}){
  const doc=readJson(ITERATIONS,{schemaVersion:"apb.iterations.v1",items:[]}); if(!Array.isArray(doc.items)) doc.items=[];
  const old=doc.items.find((x:any)=>x.requestId===req.id||x.id===req.id||x.runId===runId);
  const row={...(old||{}),id:iterationId,iterationId,requestId:req.id,runId,status,mode:req.type,objective:req.objective,steeringText:req.changeText,repoPath:req.repoPath,
    acceptanceGateIds:Array.isArray(req.acceptanceGateIds)?req.acceptanceGateIds:(old?.acceptanceGateIds||[]),
    sourceRunId:req.sourceRunId||old?.sourceRunId||null,parentIterationId:req.type!=="fork"?(req.sourceIterationId||old?.parentIterationId||null):(old?.parentIterationId||null),
    forkedFromIterationId:req.type==="fork"?(req.sourceIterationId||old?.forkedFromIterationId||null):(old?.forkedFromIterationId||null),...(req.projectLaunch?{projectLaunch:{...req.projectLaunch},planId:req.projectLaunch.planId,revision:req.projectLaunch.revision,planDigest:req.projectLaunch.planDigest,approvalId:req.projectLaunch.approvalId,launchId:req.projectLaunch.launchId}:{}),updatedAt:now(),...extra};
  if(old) Object.assign(old,row); else doc.items.unshift(row); doc.updatedAt=now(); writeFileSync(ITERATIONS,JSON.stringify(doc,null,2));
}
function preservedPaths(runRoot:string){ return [join(runRoot,"lifecycle-contract.json"),join(runRoot,"iteration-state.json"),join(runRoot,"artifacts"),join(runRoot,"logs"),join(runRoot,"worktrees")].filter(existsSync); }
function writeHandoff(runId:string, runRoot:string, state:string, data:any={}){
  const handoff={schemaVersion:"apb.handoff.v1",runId,iterationId:data.iterationId||readJson(join(runRoot,"iteration-state.json"),{}).id||null,state,generatedAt:now(),...data};
  writeFileSync(join(runRoot,"artifacts","handoff.json"),JSON.stringify(handoff,null,2)); return handoff;
}
function blockRun(runId:string, runRoot:string, reason:string, suggestedAction:string, extra:any={}){
  const st=readState(); st.status="blocked"; st.phase="blocked"; st.block={reason,since:now(),owner:"midnight-runner",suggestedAction,...extra}; st.lastAction=`Runner-managed iteration blocked: ${reason}`;
  for(const [id,a] of Object.entries(st.agents||{})) if((a as any)?.status==="running") (st.agents as any)[id]={...(a as any),status:"blocked",updatedAt:now()};
  writeState(st); writeRunJson(runRoot,{runId,status:"blocked",phase:"blocked",blockedAt:now(),block:st.block});
  if(!existsSync(join(runRoot,"lifecycle-contract.json"))){
    const control=readControl(); if(control.nextRunRequest?.claimedByRunId===runId){ control.nextRunRequest={...control.nextRunRequest,status:"blocked",blockedAt:now(),block:st.block}; control.requestedRunNow=false; writeControl(control); }
    reconcileProjectRun(runId,runRoot,"blocked",null,{blockedAt:now(),reason}); event("error","system","block",st.lastAction,{runId,...st.block}); log(st.lastAction); return;
  }
  patchLifecycle(runRoot,{state:"blocked",terminalAt:now(),blocker:reason,...extra});
  const iter=readJson(join(runRoot,"iteration-state.json"),null); if(iter){ Object.assign(iter,{status:"blocked",blockedAt:now(),blocker:reason,...extra}); writeFileSync(join(runRoot,"iteration-state.json"),JSON.stringify(iter,null,2)); writeFileSync(join(runRoot,"artifacts","iterations","iteration.json"),JSON.stringify(iter,null,2)); }
  writeHandoff(runId,runRoot,"blocked",{iterationId:iter?.id||null,blocker:reason,preservedArtifactPaths:preservedPaths(runRoot),safeRecoveryAction:suggestedAction,...extra});
  const control=readControl(), claimed=control.nextRunRequest?.claimedByRunId===runId?control.nextRunRequest:null;
  if(claimed) control.nextRunRequest={...claimed,status:"blocked",blockedAt:now(),resultRunId:runId,resultIterationId:iter?.id||null,block:st.block};
  if(control.autoIteration?.enabled) control.autoIteration={...control.autoIteration,enabled:false,stoppedAt:now(),stopReason:"managed-iteration-blocked",lastRunId:runId,lastIterationId:iter?.id||null};
  control.requestedRunNow=false; writeControl(control);
  const lifecycle=readJson(join(runRoot,"lifecycle-contract.json"),{}), lineageReq=claimed||{id:lifecycle.requestId||iter?.requestId||`request-${runId}`,type:iter?.mode||"managed",objective:iter?.objective||"Managed iteration",changeText:iter?.steeringText||"",repoPath:iter?.repoPath||null,sourceRunId:iter?.sourceRunId||null,sourceIterationId:iter?.parentIterationId||null};
  reconcileIteration(lineageReq,runId,iter?.id||`iter-${runId}`,"blocked",{blocker:reason});
  reconcileProjectRun(runId,runRoot,"blocked",iter?.id||null,{blockedAt:now(),reason});
  event("error","system","block",st.lastAction,{runId,...st.block}); log(st.lastAction);
}
function pauseManagedRun(runId:string, runRoot:string, req:any, checkpoint:string, kind:"paused"|"stopped", reason:string){
  const status="on-hold", st=readState(); st.status=status; st.phase=status; st.hold={reason,since:now(),owner:"midnight-runner",checkpoint,kind}; st.lastAction=`Runner-managed iteration ${kind} at ${checkpoint}: ${reason}`; writeState(st);
  writeRunJson(runRoot,{runId,status,phase:status,heldAt:now(),hold:st.hold}); patchLifecycle(runRoot,{state:kind,terminalAt:now(),checkpoint,pauseReason:reason});
  const iter=readJson(join(runRoot,"iteration-state.json"),{}); Object.assign(iter,{status:kind,pausedAt:now(),checkpoint,pauseReason:reason}); writeFileSync(join(runRoot,"iteration-state.json"),JSON.stringify(iter,null,2)); writeFileSync(join(runRoot,"artifacts","iterations","iteration.json"),JSON.stringify(iter,null,2));
  writeHandoff(runId,runRoot,kind,{iterationId:iter.id,checkpoint,[kind==="paused"?"pauseReason":"blocker"]:reason,preservedArtifactPaths:preservedPaths(runRoot),safeRecoveryAction:"Clear the pause/stop control, inspect preserved artifacts and worktrees, then issue a new continue-from-iteration request from this run."});
  const control=readControl(); if(control.nextRunRequest?.claimedByRunId===runId) control.nextRunRequest={...control.nextRunRequest,status:kind,resultRunId:runId,resultIterationId:iter.id,[`${kind}At`]:now(),checkpoint,reason}; control.requestedRunNow=false; writeControl(control); reconcileIteration(req,runId,iter.id||`iter-${runId}`,kind,{checkpoint,reason});
  reconcileProjectRun(runId,runRoot,"paused",iter.id||null,{pausedAt:now(),checkpoint,reason,disposition:kind}); event(kind==="paused"?"info":"warn","system",kind,st.lastAction,{runId,checkpoint,reason}); return {status:kind,runId,iterationId:iter.id};
}
function checkpointDisposition(runId:string, runRoot:string, req:any, checkpoint:string): any | null {
  const control=readControl();
  if(control.stop?.requested) return pauseManagedRun(runId,runRoot,req,checkpoint,"stopped",control.stop.reason||"Operator requested a graceful stop");
  if(control.pause?.requested||control.runAdmission==="paused") return pauseManagedRun(runId,runRoot,req,checkpoint,"paused",control.pause?.reason||"Operator requested a checkpoint pause");
  return null;
}
async function validateIterationRepo(req:any){
  const repoPath=req.repoPath;
  if(!repoPath || typeof repoPath!=="string") throw new Error("iteration request is missing repoPath");
  if(!isAbsolute(repoPath)) throw new Error(`repoPath must be absolute: ${repoPath}`);
  if(!existsSync(repoPath) || !statSync(repoPath).isDirectory()) throw new Error(`repoPath does not exist or is not a directory: ${repoPath}`);
  const top=await gitCmd(repoPath,["rev-parse","--show-toplevel"]); if(top.exitCode!==0) throw new Error(`repoPath is not a git repo: ${top.stderr||top.stdout}`);
  const repoRoot=realpathSync(top.stdout.trim()); if(req.expectedBaseCommit&&realpathSync(repoPath)!==repoRoot) throw new Error("approved repository path no longer identifies the Git repository root");
  const baseRef=req.baseRef||"HEAD"; const base=await gitCmd(repoRoot,["rev-parse","--verify",`${baseRef}^{commit}`]); if(base.exitCode!==0) throw new Error(`baseRef is not a commit: ${baseRef}: ${base.stderr||base.stdout}`);
  const baseCommit=base.stdout.trim().toLowerCase(); if(req.expectedBaseCommit&&baseCommit!==req.expectedBaseCommit) throw new Error(`approved base ref no longer resolves to approved baseCommit ${req.expectedBaseCommit}`);
  const status=await gitCmd(repoRoot,["status","--porcelain=v1"]); if(status.exitCode!==0) throw new Error(`git status failed: ${status.stderr||status.stdout}`);
  if(status.stdout.trim() && !req.allowDirty) throw new Error(`target repo is dirty; clean it or set allowDirty explicitly. Dirty summary:\n${status.stdout.trim().slice(0,2000)}`);
  const sourceHead=await gitCmd(repoRoot,["rev-parse","HEAD"]); if(sourceHead.exitCode!==0) throw new Error(`source HEAD could not be resolved: ${sourceHead.stderr||sourceHead.stdout}`);
  return { repoRoot, baseRef, baseCommit, sourceHead:sourceHead.stdout.trim(), sourceStatus:status.stdout };
}
async function createWorktree(repoRoot:string, path:string, branch:string, baseCommit:string){
  if(existsSync(path)) throw new Error(`worktree path already exists: ${path}`);
  const branchExists=await gitCmd(repoRoot,["show-ref","--verify","--quiet",`refs/heads/${branch}`]);
  if(branchExists.exitCode===0) throw new Error(`branch already exists: ${branch}`);
  mkdirSync(join(path,".."),{recursive:true});
  const added=await gitCmd(repoRoot,["worktree","add","-b",branch,path,baseCommit]);
  if(added.exitCode!==0) throw new Error(`git worktree add failed for ${branch}: ${added.stderr||added.stdout}`);
}
async function ensureCommitted(path:string, message:string){
  const status=await gitCmd(path,["status","--porcelain=v1"]); if(status.stdout.trim()){ await gitCmd(path,["add","-A"]); const commit=await gitCmd(path,["commit","-m",message]); if(commit.exitCode!==0) throw new Error(`git commit failed: ${commit.stderr||commit.stdout}`); }
  const rev=await gitCmd(path,["rev-parse","HEAD"]); if(rev.exitCode!==0) throw new Error(`git rev-parse failed: ${rev.stderr||rev.stdout}`); return rev.stdout.trim();
}
async function validationCommands(repoRoot:string, baseCommit:string, worktreePath?:string): Promise<string[][]> {
  const cmds:string[][]=[];
  cmds.push(["git","diff","--check",baseCommit,"HEAD"]);
  const scripts=new Set<string>(); const packageAtBase=await gitCmd(repoRoot,["show",`${baseCommit}:package.json`]); if(packageAtBase.exitCode===0){ try{ const pkg=JSON.parse(packageAtBase.stdout); if(pkg.scripts?.test) scripts.add("test"); if(pkg.scripts?.build) scripts.add("build"); }catch{} }
  if(worktreePath&&existsSync(join(worktreePath,"package.json"))){ const pkg=readJson(join(worktreePath,"package.json"),{}); if(pkg.scripts?.test) scripts.add("test"); if(pkg.scripts?.build) scripts.add("build"); }
  if(scripts.has("test")) cmds.push(["npm","test"]); if(scripts.has("build")) cmds.push(["npm","run","build"]);
  return cmds;
}
async function runValidations(runId:string, cwd:string, cmds:string[][], persist?:(results:any[])=>void){
  const out:any[]=[]; for(const cmd of cmds){
    const r=await runCmd(cmd,{cwd}), command=cmd.join(" ");
    out.push({argv:cmd,command,exitCode:r.exitCode,stdout:redact(r.stdout).slice(0,4000),stderr:redact(r.stderr).slice(0,4000),passed:r.exitCode===0,timedOut:!!r.timedOut,...(r.timedOut?{timeoutMs:r.timeoutMs}: {})});
    persist?.(out);
    if(r.timedOut){ const timeout:TimeoutEvidence={scope:"command",command,timeoutMs:r.timeoutMs||timeoutMs("command"),exitCode:124,cleanup:{terminationConfirmed:r.terminationConfirmed===true,platform:process.platform}}; const reason=`Validation command timed out after ${timeout.timeoutMs}ms: ${command}`; event("error","validation","runner-timeout",reason,{runId,...timeout}); throw new RunnerTimeoutError(reason,timeout); }
    if(r.exitCode!==0) break;
  } return out;
}
async function runBounded<T>(items:T[], limit:number, fn:(item:T,index:number)=>Promise<any>){
  const results:any[]=[]; let next=0; const workers=Array.from({length:Math.max(1,Math.min(limit,items.length))},async()=>{ while(next<items.length){ const i=next++; try{ results[i]=await fn(items[i],i); }catch(err:any){ results[i]={error:err?.message||String(err),...(err?.timeout?{timeout:err.timeout}:{})}; } } }); await Promise.all(workers); return results;
}
async function streamHermes(runId:string, runRoot:string, agentId:string, cwd:string, query:string, stdoutPath:string, stderrPath:string, extraEnv:Record<string,string>={}){
  writeFileSync(stdoutPath,""); writeFileSync(stderrPath,"");
  const maxTurns=agentId.startsWith("evaluator-")?clampInt(process.env.APB_EVALUATOR_MAX_TURNS,8,4,16):clampInt(process.env.APB_VARIANT_MAX_TURNS,18,8,30);
  const proc=Bun.spawn([HERMES,"chat","--verbose","--accept-hooks","--ignore-rules","--source","autonomous-project-builder","--max-turns",String(maxTurns),"--toolsets","terminal,file,web","--query",query],spawnOptions({cwd,env:{...process.env,AUTONOMOUS_PROJECT_RUN_ID:runId,AUTONOMOUS_PROJECT_STATE_ROOT:ROOT,AUTONOMOUS_PROJECTS_STATE_ROOT:ROOT,AUTONOMOUS_PROJECT_RUN_ROOT:runRoot,AUTONOMOUS_PROJECT_STATE:STATE,AUTONOMOUS_PROJECT_ARTIFACTS:join(runRoot,"artifacts"),AUTONOMOUS_PROJECT_EVENTS:EVENTS,AUTONOMOUS_PROJECT_TELEMETRY:TELEMETRY,APB_AGENT_ID:agentId,...extraEnv},stdout:"pipe",stderr:"pipe"}));
  const pipe=(stream:ReadableStream<Uint8Array>|null,path:string,kind:string)=>{ const dec=new TextDecoder(); return pumpProcessStream(stream,chunk=>{ const text=dec.decode(chunk); appendFileSync(path,text); for(const rawLine of text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).slice(-5)){ const line=redact(rawLine); if(line.startsWith("APB_TELEMETRY ")){ try{const payload=JSON.parse(line.slice("APB_TELEMETRY ".length)); event(payload.level||"info",payload.source||agentId,payload.type||"event",payload.message||"telemetry",{...(payload.data||{}),runId,agentId});}catch{} } else event(kind==="stderr"?"warn":"info",agentId,"agent-message",line,{runId,agentId,logPath:path,stream:kind}); } updateAgent(runId,agentId,{status:"running",lastMessage:redact(text.slice(-2000)),logPath:stdoutPath}); }); };
  const scope:TimeoutScope=agentId.startsWith("evaluator-")?"evaluator":"variant", outPump=pipe(proc.stdout,stdoutPath,"stdout"), errPump=pipe(proc.stderr,stderrPath,"stderr");
  const outcome=await waitForProcess(proc,scope);
  await drainProcessStreams(proc,outcome,[outPump,errPump]);
  if(outcome.timedOut){ const timeout:TimeoutEvidence={scope,agentId,timeoutMs:outcome.timeoutMs,exitCode:124,cleanup:{terminationConfirmed:outcome.terminationConfirmed===true,platform:process.platform}}; const reason=`Hermes ${scope} ${agentId} timed out after ${outcome.timeoutMs}ms`; event("error",agentId,"runner-timeout",reason,{runId,...timeout}); throw new RunnerTimeoutError(reason,timeout); }
  if(outcome.streamDrainTimedOut&&outcome.residualTerminationConfirmed!==true) throw new Error(`Hermes ${scope} ${agentId} stream cleanup could not confirm residual process-group termination on ${process.platform}`);
  if(outcome.streamDrainTimedOut){ const warning=`Hermes ${scope} ${agentId} output was truncated after stream drain exceeded ${outcome.streamDrainTimeoutMs}ms; residual process group terminated`; event("warn",agentId,"runner-stream-drain-truncated",warning,{runId,agentId,scope,streamDrainTimeoutMs:outcome.streamDrainTimeoutMs,exitCode:outcome.exitCode,truncated:true,residualProcessGroupTerminated:true}); }
  return outcome.exitCode;
}
function variantPrompt(req:any, v:WorktreeVariant, runRoot:string, baseCommit:string){ return `You are ${v.id}, one bounded Hermes Autonomous Project Builder variant agent.\nObjective: ${req.objective}\nChange request: ${req.changeText||"(none)"}\nRepo worktree: ${v.path}\nBase commit: ${baseCommit}\nRules: make one focused, shippable alternative; no unrelated features; no tech-stack churn; keep generated artifacts/logs/build output out of git. Commit your source/test/doc/config changes on this branch.\nBefore exit, write JSON to ${join(runRoot,"artifacts","variants",`${v.id}.json`)} with schemaVersion apb.variant.v1, variantId, title, claim, objectiveMapping, changes, risks, evidence, validationNotes, and budget containing numeric visualMotifChanges/newSections plus boolean techStackChurn/unrelatedFeatures. The runner will write ${v.id}.diff. Do not write outside the worktree except that artifact JSON.`; }
function evaluatorPrompt(req:any, v:WorktreeVariant, runRoot:string){ return `You are evaluator for ${v.id}. Read ${join(runRoot,"artifacts","variants",`${v.id}.json`)} and ${join(runRoot,"artifacts","variants",`${v.id}.diff`)}. Score objectiveFit, userValue, visualQuality, implementationQuality, accessibility, performance from 0-100 and total 0-100. Hard-reject unrelated features, tech-stack churn, missing tests/evidence. Write ${join(runRoot,"artifacts","evaluations",`evaluation-${v.id}.json`)} with schemaVersion apb.evaluation.v1, variantId, scores, hardGateViolations, recommendation accept|reject|partial, rationale, evidenceArtifacts.`; }
function readRequiredJson(path:string){
  if(!existsSync(path)) throw new Error(`missing required JSON artifact: ${path}`);
  const value=readJson(path,null); if(!value||typeof value!=="object"||Array.isArray(value)) throw new Error(`malformed required JSON artifact: ${path}`); return value;
}
function readVariantArtifact(path:string, variantId:string){
  const value=readRequiredJson(path);
  if(value.schemaVersion!=="apb.variant.v1"||value.variantId!==variantId||typeof value.claim!=="string"||!value.claim.trim()||!Array.isArray(value.objectiveMapping)||!Array.isArray(value.changes)||!Array.isArray(value.evidence)||!value.budget||!Number.isInteger(value.budget.visualMotifChanges)||!Number.isInteger(value.budget.newSections)||typeof value.budget.techStackChurn!=="boolean"||typeof value.budget.unrelatedFeatures!=="boolean") throw new Error(`malformed variant artifact for ${variantId}: ${path}`);
  return value;
}
function readEvaluationArtifact(path:string, variantId:string){
  const value=readRequiredJson(path), scoreNames=["objectiveFit","userValue","visualQuality","implementationQuality","accessibility","performance","total"];
  if(value.schemaVersion!=="apb.evaluation.v1"||value.variantId!==variantId||!value.scores||!scoreNames.every(name=>typeof value.scores[name]==="number"&&Number.isFinite(value.scores[name])&&value.scores[name]>=0&&value.scores[name]<=100)||!Array.isArray(value.hardGateViolations)||!Array.isArray(value.evidenceArtifacts)||typeof value.rationale!=="string"||!value.rationale.trim()||!["accept","reject","partial"].includes(value.recommendation)) throw new Error(`malformed or non-finite evaluator artifact for ${variantId}: ${path}`);
  return value;
}
function chooseWinner(vars:WorktreeVariant[]){ return vars.filter(v=>v.status==="valid"&&v.evaluation&&!v.evaluation.hardGateViolations.length&&v.evaluation.recommendation==="accept"&&Number.isFinite(Number(v.evaluation.scores.total))).sort((a,b)=>Number(b.evaluation.scores.total)-Number(a.evaluation.scores.total))[0]||null; }
function artifactEvidence(runRoot:string, requested:string){
  const raw=String(requested||"").replace(/\\/g,"/");
  if(!raw||isAbsolute(raw)||raw.split("/").includes("..")) return {requested,path:null,present:false,reason:"unsafe-or-empty-artifact-path"};
  const rel=raw.replace(/^\.\//,"").replace(/^artifacts\//,"");
  if(!rel) return {requested,path:null,present:false,reason:"unsafe-or-empty-artifact-path"};
  const artifactsRoot=join(runRoot,"artifacts"), path=join(artifactsRoot,rel); let present=false;
  try{ const realRoot=realpathSync(artifactsRoot), realPath=realpathSync(path); present=lstatSync(path).isFile()&&(realPath===realRoot||realPath.startsWith(realRoot+sep))&&statSync(path).size>0; }catch{}
  return {requested,path:`artifacts/${rel}`,present,reason:present?null:"missing-or-empty"};
}
function evaluateAcceptanceGates(runId:string, runRoot:string, gates:any[]){
  return gates.map((gate:any)=>{
    const evidence=(gate.requiredEvidence||[]).map((x:string)=>artifactEvidence(runRoot,x));
    const passed=!gate.required||(evidence.length>0&&evidence.every((x:any)=>x.present));
    return {schemaVersion:"apb.gate-decision.v1",id:gate.id,gateId:gate.id,runId,status:passed?"passed":"failed",decision:passed?"accepted":"blocked",required:gate.required,description:gate.description,evidence,decidedAt:now(),decidedBy:"midnight-runner"};
  });
}
function shouldContinueAutoIteration(control:any): boolean {
  const auto=control.autoIteration||{};
  if(!auto.enabled || !["continuous","showcase-loop"].includes(String(auto.mode||""))) return false;
  if(control.stop?.requested || control.pause?.requested || control.runAdmission==="paused") return false;
  const target=clampInt(auto.targetGenerations||auto.maxIterations,10,1,10);
  const completed=clampInt(auto.completedGenerations||0,0,0,target);
  return completed < target;
}
function scheduleContinuationRunner(){
  if(process.env.APB_DISABLE_AUTO_CONTINUATION==="1") return;
  try{
    Bun.spawn([process.execPath,import.meta.path],{cwd:HOME,env:{...process.env,APB_DELAY_START_MS:"2000"},stdout:"ignore",stderr:"ignore"});
  }catch(err:any){ log(`failed to spawn continuous follow-up runner: ${err?.message||err}`); }
}
function scheduleNextAutoIteration(previousRunId:string, result:any): boolean {
  const control=readControl();
  const auto=control.autoIteration||{};
  if(!shouldContinueAutoIteration(control)) return false;
  const target=clampInt(auto.targetGenerations||auto.maxIterations,10,1,10);
  const completed=Math.min(target, clampInt(auto.completedGenerations||0,0,0,target)+1);
  const repoPath=result?.repoPath||auto.repoPath||"/home/mojo/autonomous-projects/hermes-showcase-site";
  const objective=auto.objective||control.currentObjective?.text||result?.objective||"Continue improving the Hermes Unique Showcase Website as a catalogue of generations";
  control.autoIteration={...auto,enabled:completed<target,mode:auto.mode||"showcase-loop",targetGenerations:target,maxIterations:target,completedGenerations:completed,currentGeneration:completed<target?completed+1:completed,repoPath,objective,lastRunId:previousRunId,lastIterationId:result?.iterationId||auto.lastIterationId||null,lastCommit:result?.commit||auto.lastCommit||null,lastBranch:result?.branch||auto.lastBranch||null,updatedAt:now(),completedAt:completed>=target?now():auto.completedAt||null,stopReason:completed>=target?"target-generations-reached":null};
  if(completed>=target){
    control.nextRunRequest=null; control.requestedRunNow=false; writeControl(control);
    event("success","system","auto-iteration-complete",`Continuous showcase loop completed ${completed}/${target} generations`,{runId:previousRunId,completedGenerations:completed,targetGenerations:target});
    return false;
  }
  control.nextRunRequest={schemaVersion:"apb.next-run-request.v1",id:`auto-cont-${Date.now()}`,type:"showcase-loop-generation",status:"pending",generation:completed+1,targetGenerations:target,sourceRunId:previousRunId,sourceIterationId:result?.iterationId||auto.lastIterationId||null,repoPath,baseRef:result?.commit||auto.lastCommit||"HEAD",objective,changeText:auto.changeText||`Generation ${completed+1}/${target}: continue one bounded catalogue iteration of the same Hermes showcase site. Preserve continuity, visible evidence, responsive polish, and avoid unrelated tech-stack churn.`,acceptanceGateIds:Array.isArray(auto.acceptanceGateIds)?auto.acceptanceGateIds:[],createdAt:now(),createdBy:"midnight-runner:auto-continuation",limits:{maxIterations:target,targetGenerations:target,maxVariantsPerIteration:clampInt(auto.maxVariantsPerIteration,3,1,5),maxParallelVariants:clampInt(auto.maxParallelVariants,3,1,5),maxAcceptedFeatures:clampInt(auto.maxAcceptedFeatures,4,1,4),maxVisualMotifChanges:clampInt(auto.maxVisualMotifChanges,1,0,1),maxNewSections:clampInt(auto.maxNewSections,1,0,1),stopAfterNoImprovement:clampInt(auto.stopAfterNoImprovement,1,1,3),minImprovementScore:auto.minImprovementScore||0.05}};
  control.requestedRunNow=true; writeControl(control);
  event("info","system","auto-iteration-scheduled",`Scheduled showcase generation ${completed+1}/${target}`,{runId:previousRunId,completedGenerations:completed,targetGenerations:target,nextRunRequest:control.nextRunRequest.id});
  return true;
}

async function runManagedIterationLoop(runId:string, runRoot:string, req:any, iterationScaffold:any){
  try{
    const repo=await validateIterationRepo(req); const art=join(runRoot,"artifacts"); const wtRoot=join(runRoot,"worktrees"); mkdirSync(wtRoot,{recursive:true});
    const cmds=await validationCommands(repo.repoRoot,repo.baseCommit);
    patchLifecycle(runRoot,{state:"running",base:{ref:repo.baseRef,commit:repo.baseCommit},repository:{path:repo.repoRoot},validationPlan:{source:"runner-policy",commands:cmds.map(argv=>({argv})),policy:["git diff --check from base commit","declared package test/build scripts when present"]}});
    const iter={...iterationScaffold,status:"worktree-loop-running",repoRoot:repo.repoRoot,baseCommit:repo.baseCommit,worktreeRoot:wtRoot,updatedAt:now()}; writeFileSync(join(runRoot,"iteration-state.json"),JSON.stringify(iter,null,2)); writeFileSync(join(art,"iterations","iteration.json"),JSON.stringify(iter,null,2));
    writeRunJson(runRoot,{runId,status:"building",phase:"variant-generation",repoPath:repo.repoRoot,baseCommit:repo.baseCommit});
    const preflightControl=checkpointDisposition(runId,runRoot,req,"preflight"); if(preflightControl) return preflightControl;
    const variants:WorktreeVariant[]=Array.from({length:req.limits.maxVariantsPerIteration},(_,i)=>({id:`variant-${i+1}`,index:i+1,path:join(wtRoot,`variant-${i+1}`),branch:`apb/${safeBranchPart(runId)}/variant-${i+1}`}));
    for(const v of variants){ await createWorktree(repo.repoRoot,v.path,v.branch,repo.baseCommit); event("info",v.id,"tool-call-end",`Created worktree ${v.branch}`,{runId,agentId:v.id,toolName:"git worktree"}); }
    const variantRuns=await runBounded(variants,req.limits.maxParallelVariants,async(v)=>{
      updateAgent(runId,v.id,{label:`Variant ${v.index}`,role:"bounded variant generator",status:"running",currentPhase:"variant-generation",currentTask:req.objective,logPath:join(runRoot,"logs",`${v.id}.stdout.log`)});
      const code=await streamHermes(runId,runRoot,v.id,v.path,variantPrompt(req,v,runRoot,repo.baseCommit),join(runRoot,"logs",`${v.id}.stdout.log`),join(runRoot,"logs",`${v.id}.stderr.log`),{APB_VARIANT_WORKTREE:v.path});
      if(code!==0){ v.status="failed"; updateAgent(runId,v.id,{status:"blocked",lastMessage:`Hermes exited ${code}`}); return; }
      v.commit=await ensureCommitted(v.path,`APB ${runId} ${v.id}`); const diff=await gitCmd(v.path,["diff",repo.baseCommit,"HEAD"]); writeFileSync(join(art,"variants",`${v.id}.diff`),diff.stdout); v.diffPath=`artifacts/variants/${v.id}.diff`;
      const jsonPath=join(art,"variants",`${v.id}.json`); v.json={...readVariantArtifact(jsonPath,v.id),branch:v.branch,commit:v.commit,diffPath:v.diffPath,validation:[]}; writeFileSync(jsonPath,JSON.stringify(v.json,null,2));
      v.validation=await runValidations(runId,v.path,await validationCommands(repo.repoRoot,repo.baseCommit,v.path),(validation)=>{ v.validation=[...validation]; v.json={...v.json,validation:v.validation}; writeFileSync(jsonPath,JSON.stringify(v.json,null,2)); });
      v.status=v.validation.length>0&&v.validation.every((x:any)=>x.passed)?"valid":"validation-failed"; updateAgent(runId,v.id,{status:v.status==="valid"?"completed":"blocked",currentPhase:"variant-complete",currentArtifact:`artifacts/variants/${v.id}.json`});
    });
    const variantError=variantRuns.find((result:any)=>result?.error); if(variantError) { if(variantError.timeout) throw new RunnerTimeoutError(variantError.error,variantError.timeout); throw new Error(variantError.error); }
    for(const v of variants){
      if(!v.json) v.json=readVariantArtifact(join(art,"variants",`${v.id}.json`),v.id);
      const diffPath=join(art,"variants",`${v.id}.diff`); if(!existsSync(diffPath)||statSync(diffPath).size===0||!v.commit||v.commit===repo.baseCommit) throw new Error(`variant ${v.id} is missing a non-empty committed diff`);
      if(v.json.changes.length>req.limits.maxAcceptedFeatures||v.json.budget.visualMotifChanges>req.limits.maxVisualMotifChanges||v.json.budget.newSections>req.limits.maxNewSections||v.json.budget.techStackChurn||v.json.budget.unrelatedFeatures) throw new Error(`variant ${v.id} exceeds the contracted feature, motif, section, or scope budget`);
    }
    const afterVariants=checkpointDisposition(runId,runRoot,req,"after-variants"); if(afterVariants) return afterVariants;
    writeRunJson(runRoot,{runId,status:"building",phase:"evaluation"});
    const evaluatorRuns=await runBounded(variants,Math.min(3,req.limits.maxParallelVariants),async(v)=>{
      updateAgent(runId,`evaluator-${v.index}`,{label:`Evaluator ${v.index}`,role:"variant evaluator",status:"running",currentPhase:"evaluation",currentTask:`Evaluate ${v.id}`});
      const code=await streamHermes(runId,runRoot,`evaluator-${v.index}`,v.path,evaluatorPrompt(req,v,runRoot),join(runRoot,"logs",`evaluator-${v.id}.stdout.log`),join(runRoot,"logs",`evaluator-${v.id}.stderr.log`),{APB_VARIANT_WORKTREE:v.path});
      if(code!==0) throw new Error(`evaluator for ${v.id} exited ${code}`);
      const p=join(art,"evaluations",`evaluation-${v.id}.json`); v.evaluation=readEvaluationArtifact(p,v.id); updateAgent(runId,`evaluator-${v.index}`,{status:"completed",currentArtifact:`artifacts/evaluations/evaluation-${v.id}.json`});
    });
    const evaluatorError=evaluatorRuns.find((result:any)=>result?.error); if(evaluatorError) { if(evaluatorError.timeout) throw new RunnerTimeoutError(evaluatorError.error,evaluatorError.timeout); throw new Error(evaluatorError.error); }
    for(const v of variants){
      v.evaluation=readEvaluationArtifact(join(art,"evaluations",`evaluation-${v.id}.json`),v.id);
      const refs=new Set(v.evaluation.evidenceArtifacts.map((x:string)=>String(x).replace(/^\.\//,"")));
      for(const required of [`artifacts/variants/${v.id}.json`,`artifacts/variants/${v.id}.diff`]) if(!refs.has(required)||!artifactEvidence(runRoot,required).present) throw new Error(`evaluator for ${v.id} is missing required evidence reference ${required}`);
    }
    const afterEvaluation=checkpointDisposition(runId,runRoot,req,"after-evaluation"); if(afterEvaluation) return afterEvaluation;
    const winner=chooseWinner(variants); if(!winner) throw new Error("no valid evaluated variant passed hard gates");
    const beforeMashup=checkpointDisposition(runId,runRoot,req,"before-mashup"); if(beforeMashup) return beforeMashup;
    const mashup:{path:string;branch:string;commit?:string;validation?:any[]}={path:join(wtRoot,"mashup"),branch:`apb/${safeBranchPart(runId)}/mashup`}; await createWorktree(repo.repoRoot,mashup.path,mashup.branch,repo.baseCommit);
    updateAgent(runId,"mashup",{label:"Mashup Integrator",role:"synthesis/mashup",status:"running",currentPhase:"mashup",currentTask:`Cherry-pick ${winner.id}`});
    const cp=await gitCmd(mashup.path,["cherry-pick",winner.commit||"HEAD"]); if(cp.exitCode!==0){ await gitCmd(mashup.path,["cherry-pick","--abort"]); throw new Error(`mashup cherry-pick failed: ${cp.stderr||cp.stdout}`); }
    mashup.commit=(await gitCmd(mashup.path,["rev-parse","HEAD"])).stdout.trim();
    const synthesisPath=join(art,"synthesis","synthesis.json"), pendingSynthesis={schemaVersion:"apb.synthesis.v1",status:"validating",winnerVariantId:winner.id,winnerBranch:winner.branch,winnerCommit:winner.commit,mashupBranch:mashup.branch,mashupCommit:mashup.commit,mashupStrategy:"cherry-pick-winning-variant",acceptedFeatures:winner.json?.changes||winner.json?.features||[],rejectedFeatures:variants.filter(v=>v.id!==winner.id).map(v=>({variantId:v.id,reason:v.evaluation?.rationale||v.status})),rationale:`Selected ${winner.id} by highest valid evaluator score.`,validation:[]}; writeFileSync(synthesisPath,JSON.stringify(pendingSynthesis,null,2));
    mashup.validation=await runValidations(runId,mashup.path,await validationCommands(repo.repoRoot,repo.baseCommit,mashup.path),(validation)=>writeFileSync(synthesisPath,JSON.stringify({...pendingSynthesis,status:validation.some((x:any)=>x.timedOut)?"blocked":"validating",validation:[...validation]},null,2)));
    const synthesis={schemaVersion:"apb.synthesis.v1",status:mashup.validation.every((x:any)=>x.passed)?"accepted":"blocked",winnerVariantId:winner.id,winnerBranch:winner.branch,winnerCommit:winner.commit,mashupBranch:mashup.branch,mashupCommit:mashup.commit,mashupStrategy:"cherry-pick-winning-variant",acceptedFeatures:winner.json?.changes||winner.json?.features||[],rejectedFeatures:variants.filter(v=>v.id!==winner.id).map(v=>({variantId:v.id,reason:v.evaluation?.rationale||v.status})),rationale:`Selected ${winner.id} by highest valid evaluator score.`,validation:mashup.validation};
    writeFileSync(synthesisPath,JSON.stringify(synthesis,null,2));
    const afterValidation=checkpointDisposition(runId,runRoot,req,"after-validation"); if(afterValidation) return afterValidation;
    const finalSourceHead=await gitCmd(repo.repoRoot,["rev-parse","HEAD"]), finalSourceStatus=await gitCmd(repo.repoRoot,["status","--porcelain=v1"]);
    if(finalSourceHead.exitCode!==0||finalSourceStatus.exitCode!==0||finalSourceHead.stdout.trim()!==repo.sourceHead||finalSourceStatus.stdout!==repo.sourceStatus) throw new Error("normal source branch or working tree changed during managed execution; completion is blocked and no automatic rollback was attempted");
    const lifecycle=readJson(join(runRoot,"lifecycle-contract.json"),{}); const configuredDecisions=evaluateAcceptanceGates(runId,runRoot,lifecycle.acceptanceGates||[]);
    const evidenceDecision={schemaVersion:"apb.gate-decision.v1",id:`managed-evidence-${runId}`,gateId:"managed-evidence-integrity",runId,status:"passed",decision:"accepted",required:true,evidence:variants.flatMap(v=>[`artifacts/variants/${v.id}.json`,`artifacts/variants/${v.id}.diff`,`artifacts/evaluations/evaluation-${v.id}.json`]),decidedAt:now(),decidedBy:"midnight-runner"};
    const validationPassed=synthesis.status==="accepted"&&mashup.validation.length>0&&mashup.validation.every((x:any)=>x.passed); const validationDecision={schemaVersion:"apb.gate-decision.v1",id:`managed-validation-${runId}`,gateId:"managed-validation",runId,status:validationPassed?"passed":"failed",decision:validationPassed?"accepted":"blocked",required:true,evidence:["artifacts/synthesis/synthesis.json","artifacts/gate-report.json"],decidedAt:now(),decidedBy:"midnight-runner"};
    const gateDecisions=[evidenceDecision,validationDecision,...configuredDecisions]; const passed=validationPassed&&configuredDecisions.every((x:any)=>x.status==="passed"); writeFileSync(join(art,"gate-decisions.json"),JSON.stringify(gateDecisions,null,2));
    const gateReport={schemaVersion:"apb.gate-report.v1",status:passed?"passed":"failed",runId,generatedAt:now(),repoPath:repo.repoRoot,baseCommit:repo.baseCommit,branch:mashup.branch,commit:mashup.commit,iteration:{id:iterationScaffold.id,winnerVariantId:winner.id,synthesisPath:"artifacts/synthesis/synthesis.json"},commands:mashup.validation,gates:configuredDecisions}; writeFileSync(join(art,"gate-report.json"),JSON.stringify(gateReport,null,2));
    const manifest={schemaVersion:"apb.artifact-manifest.v1",runId,generatedAt:now(),artifacts:["lifecycle-contract.json","iterations/iteration.json","source-evidence.json",...variants.flatMap(v=>[`variants/${v.id}.json`,`variants/${v.id}.diff`,`evaluations/evaluation-${v.id}.json`]),"synthesis/synthesis.json","gate-decisions.json","gate-report.json","handoff.json"],gateReport:"artifacts/gate-report.json",handoff:"artifacts/handoff.json"}; writeFileSync(join(art,"artifact-manifest.json"),JSON.stringify(manifest,null,2));
    iter.status=passed?"completed":"blocked"; iter.completedAt=now(); iter.winnerVariantId=winner.id; iter.mashupBranch=mashup.branch; iter.mashupCommit=mashup.commit; writeFileSync(join(runRoot,"iteration-state.json"),JSON.stringify(iter,null,2)); writeFileSync(join(art,"iterations","iteration.json"),JSON.stringify(iter,null,2));
    if(!passed) throw new Error(configuredDecisions.some((x:any)=>x.status!=="passed")?"required acceptance gate evidence is missing; see artifacts/gate-decisions.json":"mashup validation failed; see artifacts/synthesis/synthesis.json");
    patchLifecycle(runRoot,{state:"completed",terminalAt:now(),accepted:{winnerVariantId:winner.id,branch:mashup.branch,commit:mashup.commit}});
    writeHandoff(runId,runRoot,"completed",{iterationId:iterationScaffold.id,baseCommit:repo.baseCommit,accepted:{branch:mashup.branch,commit:mashup.commit},winner:{variantId:winner.id,branch:winner.branch,commit:winner.commit,score:winner.evaluation.scores.total},validations:mashup.validation,gates:gateDecisions,risks:Array.isArray(winner.json?.risks)?winner.json.risks:[],rollbackInstructions:`No source branch was changed. Remove worktrees under ${wtRoot} and branches under apb/${safeBranchPart(runId)}/ only after review.`,operatorNextAction:`Review with git -C ${repo.repoRoot} diff ${repo.baseCommit}..${mashup.commit}; if accepted, explicitly promote commit ${mashup.commit} from branch ${mashup.branch}.`});
    const st=readState(); st.status="completed"; st.phase="completed"; st.completedAt=now(); st.repoPath=repo.repoRoot; st.branch=mashup.branch; st.commit=mashup.commit; st.qualityGate={status:"passed",gateReportPath:`runs/${runId}/artifacts/gate-report.json`,commands:mashup.validation}; st.finalValidation=gateReport; st.lastAction=`Runner-managed iteration completed: ${winner.id} -> ${mashup.branch}`; for(const [id,a] of Object.entries(st.agents||{})) if((a as any)?.status==="running") (st.agents as any)[id]={...(a as any),status:"completed",updatedAt:now()}; writeState(st);
    writeRunJson(runRoot,{runId,status:"completed",phase:"completed",completedAt:st.completedAt,repoPath:repo.repoRoot,branch:mashup.branch,commit:mashup.commit,qualityGate:st.qualityGate,finalValidation:gateReport});
    const control=readControl(); if(control.nextRunRequest?.claimedByRunId===runId){ control.nextRunRequest={...control.nextRunRequest,status:"completed",completedAt:now(),resultRunId:runId,resultIterationId:iterationScaffold.id,resultBranch:mashup.branch,resultCommit:mashup.commit}; control.requestedRunNow=false; writeControl(control); } reconcileIteration(req,runId,iterationScaffold.id,"completed",{completedAt:now(),commit:mashup.commit,branch:mashup.branch});
    reconcileProjectRun(runId,runRoot,"completed",iterationScaffold.id,{completedAt:now(),resultBranch:mashup.branch,resultCommit:mashup.commit});
    event("success","mashup","tool-call-end",`Runner-managed iteration completed with ${winner.id}`,{runId,agentId:"mashup",toolName:"runner-managed-worktree-loop",status:"done"}); return {status:"completed",runId,iterationId:iterationScaffold.id,repoPath:repo.repoRoot,branch:mashup.branch,commit:mashup.commit,winnerVariantId:winner.id,objective:req.objective};
  }catch(err:any){ const reason=err?.message||String(err), timeout=err?.timeout; writeFileSync(join(runRoot,"artifacts","failure.json"),JSON.stringify({schemaVersion:"apb.managed-failure.v1",runId,failedAt:now(),reason,...(timeout?{timeout}:{}),preservedPaths:preservedPaths(runRoot)},null,2)); blockRun(runId,runRoot,reason,"Inspect the handoff, run artifacts/logs, and preserved worktrees; then issue an explicit continue-from-iteration request.",timeout?{timeout}:{}); return {status:"blocked",runId}; }
}

function verifiedActiveTimeoutRecovery(state:any, control:any): "classic"|"managed"|null {
  const runId=state?.currentRunId;
  if(!runId||!ACTIVE.has(state?.status)) return null;
  const runRoot=join(RUNS,runId), run=readJson(join(runRoot,"run.json"),null), stateTimeout=state?.block?.timeout, runTimeout=run?.block?.timeout;
  if(run?.status!=="blocked"||!stateTimeout||!runTimeout||stateTimeout.scope!==runTimeout.scope||stateTimeout.timeoutMs!==runTimeout.timeoutMs||stateTimeout.exitCode!==124||runTimeout.exitCode!==124) return null;
  if(stateTimeout.cleanup?.terminationConfirmed===false||runTimeout.cleanup?.terminationConfirmed===false) return null;
  const lifecycle=readJson(join(runRoot,"lifecycle-contract.json"),null);
  if(lifecycle){
    const req=control?.nextRunRequest;
    if(lifecycle.state!=="blocked"||lifecycle.timeout?.scope!==stateTimeout.scope||lifecycle.timeout?.timeoutMs!==stateTimeout.timeoutMs||lifecycle.timeout?.exitCode!==124) return null;
    return req?.status==="pending"&&req?.type==="continue"&&req?.sourceRunId===runId&&req?.sourceIterationId===lifecycle.iterationId ? "managed" : null;
  }
  if(stateTimeout.scope!=="classic"||control?.requestedRunNow!==true||control?.nextRunRequest?.status==="pending") return null;
  return "classic";
}


async function main(){
  const delay=clampInt(process.env.APB_DELAY_START_MS,0,0,10000); if(delay) await Bun.sleep(delay);
  ensure();
  if(!lock()){ log("another runner holds lock; exiting"); return; }
  try{
    let s=readState();
    s.nextHourlyRunTime = nextHourlyLocal();
    s.lastRunTime = now();
    let control=readControl();
    let queue=readQueue();
    let projectBinding:ProjectLaunchBinding|null=null;
    let iterationRequest=resolveIterationRequest(control,s,queue);
    let explicitWake=!!control.requestedRunNow || control.nextRunRequest?.status==="pending" || control.projectLaunchRequest?.status==="pending";
    if (control.runAdmission === "paused" || control.pause?.requested) {
      s.status = s.status || "idle"; s.phase = s.phase || s.status; s.hold = { reason: control.pause?.reason || "Dashboard hold/pause requested", since: control.pause?.requestedAt || now(), owner:"dashboard" };
      s.lastAction = "Hourly runner skipped launch because dashboard steering has paused/held new runs.";
      writeState(s); event("info","system","hold",s.lastAction,{runId:s.currentRunId,status:s.status,nextHourlyRunTime:s.nextHourlyRunTime}); log(s.lastAction); return;
    }
    if (control.stop?.requested) {
      s.status="on-hold"; s.phase="on-hold"; s.hold={reason:control.stop.reason||"Dashboard stop requested",since:control.stop.requestedAt||now(),owner:"dashboard"};
      s.lastAction="Hourly runner honored dashboard stop request and did not launch."; writeState(s); event("warn","system","hold",s.lastAction,{runId:s.currentRunId}); log(s.lastAction); return;
    }
    const activeRecovery=verifiedActiveTimeoutRecovery(s,control);
    if(s.currentRunId&&ACTIVE.has(s.status)&&!activeRecovery){
      s.lastAction=`Hourly check: active project ${s.currentRunId} is ${s.status}; no verified timeout recovery request was admitted.`;
      writeState(s); event("info","system","state-change",s.lastAction,{runId:s.currentRunId,status:s.status,nextHourlyRunTime:s.nextHourlyRunTime}); log(s.lastAction); return;
    }
    if(control.projectLaunchRequest?.status==="pending"){
      try { projectBinding=loadProjectLaunch(control.projectLaunchRequest); if(projectBinding.identity.pipelineType==="managed") iterationRequest=projectManagedRequest(projectBinding); else iterationRequest=null; }
      catch(err:any){ const reason=err?.message||String(err); control.projectLaunchRequest={...control.projectLaunchRequest,status:"rejected",rejectedAt:now(),rejectionReason:reason}; writeControl(control); s.status="blocked"; s.phase="blocked"; s.block={reason:`Project launch rejected before runner work: ${reason}`,since:now(),owner:"midnight-runner",suggestedAction:"Inspect the immutable project plan, approval, launch, ledger, and control pointer; create a newly approved launch after correcting the records."}; s.lastAction="Runner rejected a stale, malformed, tampered, or unapproved project launch pointer before Hermes work."; writeState(s); event("error","system","project-launch-rejected",s.lastAction,{planId:control.projectLaunchRequest?.planId||null,launchId:control.projectLaunchRequest?.launchId||null,reason}); log(s.lastAction); return; }
    }
    if (HELD.has(s.status) && !explicitWake && pinnedItem(control,queue)) {
      deferHeldPinnedItem(s.currentRunId||"unknown",s);
      control=readControl(); queue=readQueue(); iterationRequest=resolveIterationRequest(control,s,queue); explicitWake=true;
      s.status="idle"; s.phase="idle"; s.lastAction="Held pinned work was deferred before model launch; selecting a different actionable project."; writeState(s);
    }
    if (HELD.has(s.status) && !explicitWake) {
      const fingerprint=await admissionFingerprint(s,control,queue);
      const prior=readJson(ADMISSION,{});
      if(prior.fingerprint===fingerprint && ["held","held-unchanged"].includes(prior.disposition)){
        s.lastAction="Hourly runner skipped an unchanged held state before LLM launch."; writeState(s);
        writeAdmissionReceipt(fingerprint,"held-unchanged",prior,{suppressedTickCount:Number(prior.suppressedTickCount||0)+1,runId:s.currentRunId||null});
        event("info","system","held-unchanged",s.lastAction,{runId:s.currentRunId,fingerprint,suppressedTickCount:Number(prior.suppressedTickCount||0)+1}); log(s.lastAction); return;
      }
    }
    if (s.currentRunId && ACTIVE.has(s.status) && !iterationRequest && !explicitWake) {
      s.lastAction = `Hourly check: active project ${s.currentRunId} is ${s.status}; no new run started. Will check again next hour.`;
      writeState(s); event("info","system","state-change",s.lastAction,{runId:s.currentRunId,status:s.status,nextHourlyRunTime:s.nextHourlyRunTime}); log(s.lastAction); return;
    }
    const runId=createRunId();
    const runRoot=join(RUNS,runId); mkdirSync(join(runRoot,"logs"),{recursive:true}); mkdirSync(join(runRoot,"artifacts"),{recursive:true});
    const projectIdentity=projectBinding?{...projectBinding.identity,...(projectBinding.identity.pipelineType==="managed"?{iterationId:`iter-${runId}`}:{})}:{};
    const run={ id:runId, runId, status:"inventory-scanning", startedAt:now(), timezone:TZ, selectedProject:null, ...projectIdentity };
    writeFileSync(join(runRoot,"run.json"), JSON.stringify(run,null,2));
    if(projectBinding){ const iterationId=projectBinding.identity.pipelineType==="managed"?`iter-${runId}`:null; updateProjectLaunch(projectBinding,"running",runId,iterationId,{claimedAt:now()}); snapshotProjectLaunch(runRoot,projectBinding); }
    let iterationScaffold:any = null;
    if (iterationRequest) {
      try { iterationScaffold = writeIterationScaffold(runId, runRoot, iterationRequest); }
      catch(err:any){
        const reason=err?.message||String(err); writeLifecycle(runRoot,{schemaVersion:"apb.managed-lifecycle.v1",runId,iterationId:`iter-${runId}`,requestId:iterationRequest?.id||null,state:"rejected",createdAt:now(),updatedAt:now(),terminalAt:now(),rejectionReason:reason});
        s={...s,currentRunId:runId,status:"blocked",phase:"blocked",startedAt:run.startedAt,agents:{}}; writeState(s);
        if(!projectBinding&&control.nextRunRequest?.status==="pending"){ control.nextRunRequest={...control.nextRunRequest,status:"running",claimedByRunId:runId,claimedAt:now()}; writeControl(control); }
        blockRun(runId,runRoot,reason,"Correct the managed launch request and submit a new explicit iteration request."); return;
      }
    }
    if (!projectBinding&&control.nextRunRequest?.status === "pending") { control.nextRunRequest = { ...control.nextRunRequest, status:"running", claimedByRunId:runId, claimedAt:now() }; control.requestedRunNow=false; writeControl(control); }
    else if(!projectBinding&&control.requestedRunNow){ control.requestedRunNow=false; if(control.progressHandoff?.status==="pending") control.progressHandoff={...control.progressHandoff,status:"running",claimedByRunId:runId,claimedAt:now()}; writeControl(control); }
    s = { ...s, schemaVersion:"apb.state.v1", currentRunId:runId, status:"inventory-scanning", phase:"inventory-scanning", startedAt:run.startedAt, completedAt:null, selectedProject:null, block:null, hold:null, ...(projectBinding?{projectLaunch:{...projectIdentity}}:{}), currentTask:iterationRequest?"Bounded iteration workflow starting through Hermes CLI":"Scheduled workflow starting through Hermes CLI", task:iterationRequest?iterationRequest.objective:"Scheduled workflow starting through Hermes CLI", lastAction:iterationRequest?"Hourly runner created a bounded iteration run and is invoking Hermes workflow.":"Hourly runner created a new run and is invoking Hermes workflow.", iteration:iterationScaffold, agents:{orchestrator:{id:"orchestrator",label:"Main Orchestrator",role:"scheduled workflow orchestrator",status:"running",currentPhase:"inventory-scanning",currentTask:"Scan local build inventory and select candidate",lastMessage:"Hermes CLI process launched by hourly runner.",startedAt:now(),updatedAt:now(),logPath:join(runRoot,"logs","hermes.stdout.log")}} };
    writeState(s); event("info","system","state-change",s.lastAction,{runId, iteration: iterationScaffold?.id}); if (iterationScaffold) { const rr=readJson(join(runRoot,"run.json"),{}); Object.assign(rr,{iterationId:iterationScaffold.id,iterationKind:iterationRequest.type,generation:iterationRequest.generation||null,targetGenerations:iterationRequest.targetGenerations||null,parentIterationId:iterationRequest.sourceIterationId||null,sourceRunId:iterationRequest.sourceRunId||null,repoPath:iterationRequest.repoPath||rr.repoPath||null,objective:iterationRequest.objective}); writeFileSync(join(runRoot,"run.json"),JSON.stringify(rr,null,2)); } log(`starting run ${runId}`);
    if(iterationScaffold) reconcileIteration(iterationRequest,runId,iterationScaffold.id,"running",{startedAt:run.startedAt});
    if (!existsSync(HERMES) || !existsSync(PROMPT) || !existsSync(TELEMETRY)) {
      if(iterationRequest){ blockRun(runId,runRoot,"Hermes binary, runner prompt, or telemetry helper missing",`Check ${HERMES}, ${PROMPT}, and ${TELEMETRY}`); return; }
      s.status="blocked"; s.block={reason:"Hermes binary, runner prompt, or telemetry helper missing",since:now(),owner:"midnight-runner",suggestedAction:`Check ${HERMES}, ${PROMPT}, and ${TELEMETRY}`}; s.lastAction="Scheduled workflow blocked before launch."; writeState(s); writeRunJson(runRoot,{runId,status:"blocked",phase:"blocked",blockedAt:now(),block:s.block}); reconcileProjectRun(runId,runRoot,"blocked",null,{blockedAt:now(),reason:s.block.reason}); event("error","system","block",s.lastAction,{...s.block,runId,agentId:"orchestrator"}); return;
    }
    if (iterationRequest) {
      const result = await runManagedIterationLoop(runId, runRoot, iterationRequest, iterationScaffold);
      if (result?.status === "completed") {
        log(`completed runner-managed iteration ${runId}`);
        if (!projectBinding&&scheduleNextAutoIteration(runId, result)) scheduleContinuationRunner();
      }
      return;
    }
    const budgetContract=`\n\n# Hard efficiency contract\n- Parent budget: at most ${clampInt(process.env.APB_CLASSIC_MAX_TURNS,24,8,40)} model turns.\n- The mandatory spec, devplan, audit, build, and test roles in the workflow contract take precedence over any generic child-session count; keep every role focused, avoid duplicate rediscovery, and cap concurrency at 2.\n- Use only the review rounds required by the base workflow, plus one bounded correction round only when concrete failing evidence requires it.\n- Persist full evidence to files; return compact summaries and paths.\n- Do not re-audit unchanged held work. If blocked, record a truthful hold once and exit.\n- Prefer implementation plus tests over repeated planning prose.\n`;
    const query = readFileSync(PROMPT,"utf8") + (projectBinding?projectClassicContext(projectBinding):steeringSnapshot(runRoot)) + budgetContract;
    const stdoutPath = join(runRoot,"logs","hermes.stdout.log");
    const stderrPath = join(runRoot,"logs","hermes.stderr.log");
    writeFileSync(stdoutPath, ""); writeFileSync(stderrPath, "");
    event("info","orchestrator","tool-call-start","Launching Hermes scheduled workflow",{runId,agentId:"orchestrator",toolCallId:`runner-${runId}`,toolName:"hermes chat",action:"scheduled autonomous project workflow"});
    const classicMaxTurns=clampInt(process.env.APB_CLASSIC_MAX_TURNS,24,8,40);
    const proc = Bun.spawn([HERMES,"chat","--verbose","--accept-hooks","--ignore-rules","--source","autonomous-project-builder","--max-turns",String(classicMaxTurns),"--toolsets","terminal,file,web,delegation","--query",query], spawnOptions({ cwd: HOME, env: { ...process.env, AUTONOMOUS_PROJECT_RUN_ID: runId, AUTONOMOUS_PROJECT_STATE_ROOT: ROOT, AUTONOMOUS_PROJECTS_STATE_ROOT:ROOT, AUTONOMOUS_PROJECT_RUN_ROOT: runRoot, AUTONOMOUS_PROJECT_ARTIFACTS:join(runRoot,"artifacts"), AUTONOMOUS_PROJECT_EVENTS: EVENTS, AUTONOMOUS_PROJECT_STATE: STATE, AUTONOMOUS_PROJECT_TELEMETRY: TELEMETRY, APB_AGENT_ID:"orchestrator" }, stdout: "pipe", stderr: "pipe" }));
    const streamToLog = (stream: ReadableStream<Uint8Array> | null, path: string, source: string) => {
      const decoder = new TextDecoder();
      return pumpProcessStream(stream,chunk=>{
        const text = decoder.decode(chunk);
        appendFileSync(path, text);
        for (const rawLine of text.split(/\r?\n/).map((x)=>x.trim()).filter(Boolean).slice(-8)) {
          const line = redact(rawLine);
          if (line.startsWith("APB_TELEMETRY ")) {
            try {
              const payload = JSON.parse(line.slice("APB_TELEMETRY ".length));
              event(payload.level || "info", payload.source || payload.agentId || "orchestrator", payload.type || payload.eventType || "event", payload.message || "telemetry", { ...(payload.data || {}), runId: payload.runId || runId, agentId: payload.agentId || payload.data?.agentId || "orchestrator" });
            } catch {}
          } else event(source === "stderr" ? "warn" : "info", "orchestrator", "agent-message", line, { runId, agentId:"orchestrator", logPath:path, stream:source });
        }
        const latest = readState();
        latest.agents = latest.agents && !Array.isArray(latest.agents) ? latest.agents : {};
        latest.agents.orchestrator = { ...(latest.agents.orchestrator || {}), id:"orchestrator", label:"Main Orchestrator", role:"scheduled workflow orchestrator", status:"running", currentPhase:latest.status, currentTask:"Scheduled Hermes workflow running", lastMessage: redact(text.slice(-2000)), logPath:path, updatedAt:now() };
        latest.lastAction = `Hermes workflow ${source} updated`;
        writeState(latest);
      });
    };
    const outPump=streamToLog(proc.stdout,stdoutPath,"stdout"), errPump=streamToLog(proc.stderr,stderrPath,"stderr");
    const outcome=await waitForProcess(proc,"classic");
    await drainProcessStreams(proc,outcome,[outPump,errPump]);
    const exitCode = outcome.exitCode;
    if(outcome.timedOut){ const timeout:TimeoutEvidence={scope:"classic",timeoutMs:outcome.timeoutMs,exitCode:124,cleanup:{terminationConfirmed:outcome.terminationConfirmed===true,platform:process.platform}}; const reason=`Hermes classic workflow timed out after ${outcome.timeoutMs}ms`; event("error","orchestrator","runner-timeout",reason,{runId,agentId:"orchestrator",...timeout}); blockRun(runId,runRoot,reason,"Inspect the preserved run and Hermes logs, then explicitly launch or continue recovered work.",{timeout}); return; }
    if(outcome.streamDrainTimedOut&&outcome.residualTerminationConfirmed!==true){ blockRun(runId,runRoot,`Hermes classic stream cleanup could not confirm residual process-group termination on ${process.platform}`,"Verify and terminate the residual process tree before creating a new run.",{cleanup:{terminationConfirmed:false,platform:process.platform}}); return; }
    if(outcome.streamDrainTimedOut){ const warning=`Hermes classic workflow output was truncated after stream drain exceeded ${outcome.streamDrainTimeoutMs}ms; residual process group terminated`; event("warn","orchestrator","runner-stream-drain-truncated",warning,{runId,agentId:"orchestrator",scope:"classic",streamDrainTimeoutMs:outcome.streamDrainTimeoutMs,exitCode,truncated:true,residualProcessGroupTerminated:true}); }
    const final=readState();
    if (exitCode !== 0) {
      final.status="blocked"; final.block={reason:`Hermes workflow exited with code ${exitCode}`, since:now(), owner:"midnight-runner", suggestedAction:"Inspect hermes stdout/stderr logs in run directory"}; final.lastAction="Hermes workflow failed; preserved run for inspection."; writeState(final); writeRunJson(runRoot,{runId,status:"blocked",phase:"blocked",blockedAt:now(),block:final.block}); reconcileProjectRun(runId,runRoot,"blocked",null,{blockedAt:now(),reason:final.block.reason}); event("error","system","block",final.lastAction,final.block); event("error","orchestrator","tool-call-error","Hermes scheduled workflow failed",{runId,agentId:"orchestrator",toolCallId:`runner-${runId}`,toolName:"hermes chat",error:final.block.reason}); log(final.lastAction); return;
    }
    const finalRun=readJson(join(runRoot,"run.json"),{});
    if(HELD.has(normalizeStatus(final.status)) || HELD.has(normalizeStatus(finalRun.status))){
      if(!HELD.has(normalizeStatus(final.status))){ final.status=normalizeStatus(finalRun.status); final.phase=normalizeStatus(finalRun.phase||finalRun.status); writeState(final); }
      const deferred=projectBinding?false:deferHeldPinnedItem(runId,final);
      const receiptControl=readControl(), receiptQueue=readQueue();
      const fingerprint=await admissionFingerprint(readState(),receiptControl,receiptQueue);
      writeAdmissionReceipt(fingerprint,"held",readJson(ADMISSION,{}),{runId,deferredPinnedItem:deferred});
      reconcileProjectRun(runId,runRoot,"paused",null,{pausedAt:now(),reason:final.hold?.reason||final.block?.reason||"Hermes preserved a held disposition"});
      event("warn","orchestrator","tool-call-end",`Hermes workflow preserved held disposition for ${runId}`,{runId,agentId:"orchestrator",toolCallId:`runner-${runId}`,toolName:"hermes chat",status:"held",deferredPinnedItem:deferred});
      log(`preserved held disposition for ${runId}`);
      if(deferred) scheduleContinuationRunner();
      return;
    }
    if(!writeCompletionEvidence(runId, runRoot)){
      blockRun(runId,runRoot,"Hermes exited successfully without an explicit completed disposition and passing gate report","Resume from preserved artifacts or select a different actionable project; do not infer product completion from process exit.");
      const fingerprint=await admissionFingerprint(readState(),readControl(),readQueue());
      writeAdmissionReceipt(fingerprint,"held",readJson(ADMISSION,{}),{runId,reason:"missing-explicit-completion-evidence"});
      return;
    }
    reconcileProjectRun(runId,runRoot,"completed",null,{completedAt:now()});
    const doneControl=readControl(); if (!projectBinding&&doneControl.nextRunRequest?.claimedByRunId === runId) { doneControl.nextRunRequest = { ...doneControl.nextRunRequest, status:"completed", completedAt:now() }; doneControl.requestedRunNow=false; writeControl(doneControl); }
    else if(!projectBinding&&doneControl.progressHandoff?.claimedByRunId===runId){ doneControl.progressHandoff={...doneControl.progressHandoff,status:"completed",completedAt:now()}; writeControl(doneControl); }
    event("success","orchestrator","tool-call-end",`Hermes workflow process exited successfully for ${runId}`,{runId,agentId:"orchestrator",toolCallId:`runner-${runId}`,toolName:"hermes chat",status:"done"}); log(`completed process for ${runId}`);
  } finally { unlock(); }
}

main().catch((err)=>{ ensure(); log(`fatal: ${err?.stack||err}`); event("error","system","error",String(err?.message||err)); unlock(); process.exit(1); });
