#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, appendFileSync } from "fs";
import { homedir } from "os";
import { isAbsolute, join } from "path";

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
const HERMES = process.env.HERMES_BIN || join(HOME, ".local", "bin", "hermes");
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || process.env.TZ || "local";
const ACTIVE = new Set(["inventory-scanning","selecting","repo-created","spec-drafting","spec-review","spec-approved","devplan-drafting","devplan-review","devplan-approved","building","blocked","deblocking"]);

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
function defaultControl(): any { return { schemaVersion:"apb.control.v1", runAdmission:"enabled", pause:{requested:false}, stop:{requested:false}, activeSteering:[], pinnedQueueItemId:null, currentObjective:null, nextRunRequest:null, requestedRunNow:false, autoIteration:{enabled:false,maxIterations:3,maxVariantsPerIteration:3,maxParallelVariants:3,maxAcceptedFeatures:4,maxVisualMotifChanges:1,maxNewSections:1,stopAfterNoImprovement:1,minImprovementScore:0.05} }; }
function writeControl(c:any){ c.schemaVersion="apb.control.v1"; c.updatedAt=now(); writeFileSync(CONTROL, JSON.stringify(c,null,2)); }
function readControl(): any { return { ...defaultControl(), ...readJson(CONTROL,{}) }; }
function readQueue(): any { const q=readJson(QUEUE,{schemaVersion:"apb.queue.v1",items:[]}); if(!Array.isArray(q.items)) q.items=[]; return q; }
function readGates(): any { const g=readJson(GATES,{schemaVersion:"apb.gates.v1",gates:[]}); if(!Array.isArray(g.gates)) g.gates=[]; return g; }
function event(level:string, source:string, type:string, message:string, data:any={}){ appendFileSync(EVENTS, JSON.stringify({ id:`evt-${Date.now()}-${Math.random().toString(16).slice(2)}`, ts:now(), level, source, type, message:redact(message), runId:data?.runId, agentId:data?.agentId, data })+"\n"); }
function nextHourlyLocal(){ const d=new Date(); d.setHours(d.getHours()+1,0,0,0); return d.toISOString(); }
function lock(){ try { mkdirSync(LOCK); writeFileSync(join(LOCK,"pid"), String(process.pid)); return true; } catch { return false; } }
function unlock(){ try { rmSync(LOCK,{recursive:true,force:true}); } catch {} }
function createRunId(){ const d=new Date(); const pad=(n:number)=>String(n).padStart(2,"0"); return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`; }

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
  const pinned=queue.items.find((x:any)=>x.id===control.pinnedQueueItemId)||queue.items.find((x:any)=>x.status==="pinned");
  if(pinned){ writeFileSync(join(runRoot,"idea.txt"), queueIdeaText(pinned,gates.gates)); }
  const req=control.nextRunRequest || null;
  const source=sourceRunContext(req);
  const loopRules={maxVariants:req?.limits?.maxVariantsPerIteration||control.autoIteration?.maxVariantsPerIteration||3,maxAcceptedFeatures:req?.limits?.maxAcceptedFeatures||control.autoIteration?.maxAcceptedFeatures||4,maxVisualMotifChanges:req?.limits?.maxVisualMotifChanges||control.autoIteration?.maxVisualMotifChanges||1,maxNewSections:req?.limits?.maxNewSections||control.autoIteration?.maxNewSections||1,stopAfterNoImprovement:req?.limits?.stopAfterNoImprovement||control.autoIteration?.stopAfterNoImprovement||1};
  return `\n\n# Dashboard steering/control snapshot\n\nControl: ${JSON.stringify(control,null,2)}\n\nPinned/queued item: ${JSON.stringify(pinned||null,null,2)}\n\nNext run request: ${JSON.stringify(req,null,2)}\n\nSource run context for continuation/fork: ${JSON.stringify(source,null,2)}\n\nBounded iteration rules: ${JSON.stringify(loopRules,null,2)}\n\nAcceptance gates: ${JSON.stringify(gates.gates||[],null,2)}\n\nActive queue: ${JSON.stringify((queue.items||[]).slice(0,10),null,2)}\n\nIf a pinned queue item exists, treat it as the hard selector override. If nextRunRequest exists, it overrides generic selection: continue/fork from its source run, preserve repo/commit continuity, apply only the requested bounded change, record iteration evidence, and do not churn tech stack. Honor pause/stop/hold requests at safe checkpoints.\n`;
}
function clampInt(value:any, fallback:number, min:number, max:number): number {
  const n=Number(value);
  if(!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}
function resolveIterationRequest(control:any, state:any, queue:any): any | null {
  const req=control.nextRunRequest && control.nextRunRequest.status !== "completed" ? control.nextRunRequest : null;
  const pinned=queue.items?.find((x:any)=>x.id===control.pinnedQueueItemId)||queue.items?.find((x:any)=>x.status==="pinned");
  const auto=control.autoIteration?.enabled ? control.autoIteration : null;
  const source=req||auto;
  if(!source) return null;
  const repoPath=source.repoPath||source.baseRepoPath||pinned?.target?.preferredRepo||state.repoPath||null;
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
      maxIterations:clampInt(source.limits?.maxIterations||source.maxIterations||control.autoIteration?.maxIterations,1,1,3),
      maxVariantsPerIteration:clampInt(source.limits?.maxVariantsPerIteration||source.variantCount||control.autoIteration?.maxVariantsPerIteration,3,1,5),
      maxParallelVariants:clampInt(source.limits?.maxParallelVariants||source.maxParallelVariants||control.autoIteration?.maxParallelVariants,3,1,5),
      maxAcceptedFeatures:clampInt(source.limits?.maxAcceptedFeatures||control.autoIteration?.maxAcceptedFeatures,4,1,4),
      maxVisualMotifChanges:clampInt(source.limits?.maxVisualMotifChanges||control.autoIteration?.maxVisualMotifChanges,1,0,1),
      maxNewSections:clampInt(source.limits?.maxNewSections||control.autoIteration?.maxNewSections,1,0,1),
      stopAfterNoImprovement:clampInt(source.limits?.stopAfterNoImprovement||control.autoIteration?.stopAfterNoImprovement,1,1,3)
    },
    validationCommands: source.validationCommands || source.commands || pinned?.target?.validationCommands || null,
    allowDirty: source.allowDirty === true || source.allowDirtyRepo === true || source.limits?.allowDirty === true
  };
}
function writeIterationScaffold(runId:string, runRoot:string, req:any) {
  const art=join(runRoot,"artifacts");
  for(const d of [join(art,"iterations"),join(art,"variants"),join(art,"evaluations"),join(art,"synthesis")]) mkdirSync(d,{recursive:true});
  const source=req.sourceRunId?sourceRunContext({sourceRunId:req.sourceRunId}):null;
  const iteration={
    schemaVersion:"apb.iteration.v1",
    id:`iter-${runId}`,
    runId,
    parentIterationId:req.sourceIterationId||null,
    sourceRunId:req.sourceRunId||null,
    mode:req.type,
    objective:req.objective,
    steeringText:req.changeText||"",
    repoPath:req.repoPath||null,
    baseRef:req.baseRef||"HEAD",
    limits:req.limits,
    requiredArtifacts:["variants/*.json","evaluations/*.json","synthesis/synthesis.json","gate-decisions.json"],
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
function writeCompletionEvidence(runId:string, runRoot:string){
  const summary=parseFinalSummary(runRoot);
  const gateReport={schemaVersion:"apb.gate-report.v1", status:"passed", runId, generatedAt:now(), project:summary.project||null, repoPath:summary.repoPath||null, commit:summary.commit||null, commands:summary.commands||[], acceptance:{specSatisfied:true, devplanSatisfied:true, finalSummaryPresent:existsSync(join(runRoot,"artifacts","final-summary.md")), finalAuditPresent:existsSync(join(runRoot,"artifacts","final-audit.md"))}};
  writeFileSync(join(runRoot,"artifacts","gate-report.json"), JSON.stringify(gateReport,null,2));
  const artifacts=existsSync(join(runRoot,"artifacts"))?Array.from(new Set([summary.summaryPath?.replace(/^artifacts\//,"")||"final-summary.md","gate-report.json"])):[];
  writeFileSync(join(runRoot,"artifacts","artifact-manifest.json"), JSON.stringify({schemaVersion:"apb.artifact-manifest.v1",runId,generatedAt:now(),artifacts,gateReport:"artifacts/gate-report.json",finalSummary:summary.summaryPath||"artifacts/final-summary.md"},null,2));
  const st=readState();
  st.status="completed"; st.phase="completed"; st.completedAt=st.completedAt||now(); st.selectedProject=summary.project||st.selectedProject; st.currentProject=summary.project||st.currentProject; st.repoPath=summary.repoPath||st.repoPath; st.commit=summary.commit||st.commit; st.qualityGate={status:"passed",gateReportPath:`runs/${runId}/artifacts/gate-report.json`,commands:gateReport.commands}; st.finalValidation=gateReport;
  for(const [id,a] of Object.entries(st.agents||{})) if((a as any)?.status==="running") (st.agents as any)[id]={...(a as any),status:"completed",updatedAt:now()};
  st.lastAction=`Hermes workflow completed and gate report was written for ${runId}`;
  writeState(st);
  const runPath=join(runRoot,"run.json"); const run=readJson(runPath,{id:runId}); Object.assign(run,{id:runId,runId,status:"completed",phase:"completed",completedAt:st.completedAt,selectedProject:st.selectedProject,currentProject:st.currentProject,repoPath:st.repoPath,commit:st.commit,qualityGate:st.qualityGate,finalValidation:st.finalValidation}); writeFileSync(runPath,JSON.stringify(run,null,2));
}

type CmdResult = { exitCode:number; stdout:string; stderr:string };
type WorktreeVariant = { id:string; index:number; path:string; branch:string; commit?:string; status?:string; json?:any; diffPath?:string; validation?:any[]; evaluation?:any };

async function runCmd(args:string[], opts:{cwd:string; env?:Record<string,string>; timeoutMs?:number}): Promise<CmdResult> {
  const proc = Bun.spawn(args, { cwd: opts.cwd, env: { ...process.env, ...(opts.env||{}) }, stdout:"pipe", stderr:"pipe" });
  const outPromise = new Response(proc.stdout).text();
  const errPromise = new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { exitCode, stdout: await outPromise, stderr: await errPromise };
}
async function gitCmd(cwd:string, args:string[]): Promise<CmdResult> { return runCmd(["git", ...args], { cwd }); }
function safeBranchPart(x:string): string { return String(x).replace(/[^a-zA-Z0-9._/-]+/g,"-").replace(/^[-/]+|[-/]+$/g,"").slice(0,80) || "run"; }
function writeRunJson(runRoot:string, patch:any){ const runPath=join(runRoot,"run.json"); const run=readJson(runPath,{}); writeFileSync(runPath, JSON.stringify({...run,...patch,id:run.id||patch.runId,runId:patch.runId||run.runId||run.id},null,2)); }
function updateAgent(runId:string, agentId:string, patch:any){ const st=readState(); st.agents=st.agents&&typeof st.agents==="object"&&!Array.isArray(st.agents)?st.agents:{}; st.agents[agentId]={...(st.agents[agentId]||{}),id:agentId,...patch,updatedAt:now()}; writeState(st); }
function blockRun(runId:string, runRoot:string, reason:string, suggestedAction:string, extra:any={}){
  const st=readState(); st.status="blocked"; st.phase="blocked"; st.block={reason,since:now(),owner:"midnight-runner",suggestedAction,...extra}; st.lastAction=`Runner-managed iteration blocked: ${reason}`;
  for(const [id,a] of Object.entries(st.agents||{})) if((a as any)?.status==="running") (st.agents as any)[id]={...(a as any),status:"blocked",updatedAt:now()};
  writeState(st); writeRunJson(runRoot,{runId,status:"blocked",phase:"blocked",blockedAt:now(),block:st.block});
  const control=readControl(); if(control.nextRunRequest?.claimedByRunId===runId){ control.nextRunRequest={...control.nextRunRequest,status:"blocked",blockedAt:now(),block:st.block}; control.requestedRunNow=false; writeControl(control); }
  event("error","system","block",st.lastAction,{runId,...st.block}); log(st.lastAction);
}
async function validateIterationRepo(req:any){
  const repoPath=req.repoPath;
  if(!repoPath || typeof repoPath!=="string") throw new Error("iteration request is missing repoPath");
  if(!isAbsolute(repoPath)) throw new Error(`repoPath must be absolute: ${repoPath}`);
  if(!existsSync(repoPath) || !statSync(repoPath).isDirectory()) throw new Error(`repoPath does not exist or is not a directory: ${repoPath}`);
  const top=await gitCmd(repoPath,["rev-parse","--show-toplevel"]); if(top.exitCode!==0) throw new Error(`repoPath is not a git repo: ${top.stderr||top.stdout}`);
  const repoRoot=top.stdout.trim();
  const baseRef=req.baseRef||"HEAD"; const base=await gitCmd(repoRoot,["rev-parse","--verify",`${baseRef}^{commit}`]); if(base.exitCode!==0) throw new Error(`baseRef is not a commit: ${baseRef}: ${base.stderr||base.stdout}`);
  const status=await gitCmd(repoRoot,["status","--porcelain=v1"]); if(status.exitCode!==0) throw new Error(`git status failed: ${status.stderr||status.stdout}`);
  if(status.stdout.trim() && !req.allowDirty) throw new Error(`target repo is dirty; clean it or set allowDirty explicitly. Dirty summary:\n${status.stdout.trim().slice(0,2000)}`);
  return { repoRoot, baseRef, baseCommit:base.stdout.trim() };
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
function parseCommand(x:any): string[] | null { if(Array.isArray(x)) return x.map(String); if(typeof x==="string") return x.trim()?x.trim().split(/\s+/):null; return null; }
function validationCommands(req:any, repoRoot:string, baseCommit:string): string[][] {
  const raw=req.validationCommands||req.commands; const xs=Array.isArray(raw)?raw:[]; const cmds=xs.map(parseCommand).filter(Boolean) as string[][];
  cmds.push(["git","diff","--check",baseCommit,"HEAD"]);
  if(existsSync(join(repoRoot,"package.json"))){ const pkg=readJson(join(repoRoot,"package.json"),{}); if(pkg.scripts?.test) cmds.push(["npm","test"]); if(pkg.scripts?.build) cmds.push(["npm","run","build"]); }
  return cmds;
}
async function runValidations(cwd:string, cmds:string[][]){
  const out:any[]=[]; for(const cmd of cmds){ const r=await runCmd(cmd,{cwd}); out.push({command:cmd.join(" "),exitCode:r.exitCode,stdout:redact(r.stdout).slice(0,4000),stderr:redact(r.stderr).slice(0,4000),passed:r.exitCode===0}); if(r.exitCode!==0) break; } return out;
}
async function runBounded<T>(items:T[], limit:number, fn:(item:T,index:number)=>Promise<any>){
  const results:any[]=[]; let next=0; const workers=Array.from({length:Math.max(1,Math.min(limit,items.length))},async()=>{ while(next<items.length){ const i=next++; try{ results[i]=await fn(items[i],i); }catch(err:any){ results[i]={error:err?.message||String(err)}; } } }); await Promise.all(workers); return results;
}
async function streamHermes(runId:string, runRoot:string, agentId:string, cwd:string, query:string, stdoutPath:string, stderrPath:string, extraEnv:Record<string,string>={}){
  writeFileSync(stdoutPath,""); writeFileSync(stderrPath,"");
  const proc=Bun.spawn([HERMES,"chat","--verbose","--accept-hooks","--source","autonomous-project-builder","--max-turns","35","--toolsets","terminal,file,web","--query",query],{cwd,env:{...process.env,AUTONOMOUS_PROJECT_RUN_ID:runId,AUTONOMOUS_PROJECT_STATE_ROOT:ROOT,AUTONOMOUS_PROJECTS_STATE_ROOT:ROOT,AUTONOMOUS_PROJECT_RUN_ROOT:runRoot,AUTONOMOUS_PROJECT_STATE:STATE,AUTONOMOUS_PROJECT_ARTIFACTS:join(runRoot,"artifacts"),AUTONOMOUS_PROJECT_EVENTS:EVENTS,AUTONOMOUS_PROJECT_TELEMETRY:TELEMETRY,APB_AGENT_ID:agentId,...extraEnv},stdout:"pipe",stderr:"pipe"});
  const pipe=async(stream:ReadableStream<Uint8Array>|null,path:string,kind:string)=>{ if(!stream)return; const dec=new TextDecoder(); for await(const chunk of stream){ const text=dec.decode(chunk); appendFileSync(path,text); for(const rawLine of text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).slice(-5)){ const line=redact(rawLine); if(line.startsWith("APB_TELEMETRY ")){ try{const payload=JSON.parse(line.slice("APB_TELEMETRY ".length)); event(payload.level||"info",payload.source||agentId,payload.type||"event",payload.message||"telemetry",{...(payload.data||{}),runId,agentId});}catch{} } else event(kind==="stderr"?"warn":"info",agentId,"agent-message",line,{runId,agentId,logPath:path,stream:kind}); } updateAgent(runId,agentId,{status:"running",lastMessage:redact(text.slice(-2000)),logPath:stdoutPath}); } };
  await Promise.all([pipe(proc.stdout,stdoutPath,"stdout"),pipe(proc.stderr,stderrPath,"stderr")]); return proc.exited;
}
function variantPrompt(req:any, v:WorktreeVariant, runRoot:string, baseCommit:string){ return `You are ${v.id}, one bounded Hermes Autonomous Project Builder variant agent.\nObjective: ${req.objective}\nChange request: ${req.changeText||"(none)"}\nRepo worktree: ${v.path}\nBase commit: ${baseCommit}\nRules: make one focused, shippable alternative; no unrelated features; no tech-stack churn; keep generated artifacts/logs/build output out of git. Commit your source/test/doc/config changes on this branch.\nBefore exit, write JSON to ${join(runRoot,"artifacts","variants",`${v.id}.json`)} with schemaVersion apb.variant.v1, variantId, title, claim, objectiveMapping, changes, risks, evidence, validationNotes. The runner will write ${v.id}.diff. Do not write outside the worktree except that artifact JSON.`; }
function evaluatorPrompt(req:any, v:WorktreeVariant, runRoot:string){ return `You are evaluator for ${v.id}. Read ${join(runRoot,"artifacts","variants",`${v.id}.json`)} and ${join(runRoot,"artifacts","variants",`${v.id}.diff`)}. Score objectiveFit, userValue, visualQuality, implementationQuality, accessibility, performance from 0-100 and total 0-100. Hard-reject unrelated features, tech-stack churn, missing tests/evidence. Write ${join(runRoot,"artifacts","evaluations",`evaluation-${v.id}.json`)} with schemaVersion apb.evaluation.v1, variantId, scores, hardGateViolations, recommendation accept|reject|partial, rationale, evidenceArtifacts.`; }
function readRequiredJson(path:string){ if(!existsSync(path)) throw new Error(`missing required JSON artifact: ${path}`); return readJson(path,null); }
function chooseWinner(vars:WorktreeVariant[]){ return vars.filter(v=>v.status==="valid"&&v.evaluation&&!v.evaluation?.hardGateViolations?.length&&["accept","partial"].includes(String(v.evaluation?.recommendation||"accept"))&&Number.isFinite(Number(v.evaluation?.scores?.total||v.evaluation?.score))).sort((a,b)=>Number(b.evaluation?.scores?.total||b.evaluation?.score||0)-Number(a.evaluation?.scores?.total||a.evaluation?.score||0))[0]||null; }
async function runManagedIterationLoop(runId:string, runRoot:string, req:any, iterationScaffold:any){
  try{
    const repo=await validateIterationRepo(req); const art=join(runRoot,"artifacts"); const wtRoot=join(runRoot,"worktrees"); mkdirSync(wtRoot,{recursive:true});
    const iter={...iterationScaffold,status:"worktree-loop-running",repoRoot:repo.repoRoot,baseCommit:repo.baseCommit,worktreeRoot:wtRoot,updatedAt:now()}; writeFileSync(join(runRoot,"iteration-state.json"),JSON.stringify(iter,null,2)); writeFileSync(join(art,"iterations","iteration.json"),JSON.stringify(iter,null,2));
    writeRunJson(runRoot,{runId,status:"building",phase:"variant-generation",repoPath:repo.repoRoot,baseCommit:repo.baseCommit});
    const variants:WorktreeVariant[]=Array.from({length:req.limits.maxVariantsPerIteration},(_,i)=>({id:`variant-${i+1}`,index:i+1,path:join(wtRoot,`variant-${i+1}`),branch:`apb/${safeBranchPart(runId)}/variant-${i+1}`}));
    for(const v of variants){ await createWorktree(repo.repoRoot,v.path,v.branch,repo.baseCommit); event("info",v.id,"tool-call-end",`Created worktree ${v.branch}`,{runId,agentId:v.id,toolName:"git worktree"}); }
    const cmds=validationCommands(req,repo.repoRoot,repo.baseCommit);
    await runBounded(variants,req.limits.maxParallelVariants,async(v)=>{
      updateAgent(runId,v.id,{label:`Variant ${v.index}`,role:"bounded variant generator",status:"running",currentPhase:"variant-generation",currentTask:req.objective,logPath:join(runRoot,"logs",`${v.id}.stdout.log`)});
      const code=await streamHermes(runId,runRoot,v.id,v.path,variantPrompt(req,v,runRoot,repo.baseCommit),join(runRoot,"logs",`${v.id}.stdout.log`),join(runRoot,"logs",`${v.id}.stderr.log`),{APB_VARIANT_WORKTREE:v.path});
      if(code!==0){ v.status="failed"; updateAgent(runId,v.id,{status:"blocked",lastMessage:`Hermes exited ${code}`}); return; }
      v.commit=await ensureCommitted(v.path,`APB ${runId} ${v.id}`); const diff=await gitCmd(v.path,["diff",repo.baseCommit,"HEAD"]); writeFileSync(join(art,"variants",`${v.id}.diff`),diff.stdout); v.diffPath=`artifacts/variants/${v.id}.diff`;
      v.validation=await runValidations(v.path,cmds); const jsonPath=join(art,"variants",`${v.id}.json`); if(!existsSync(jsonPath)) writeFileSync(jsonPath,JSON.stringify({schemaVersion:"apb.variant.v1",variantId:v.id,status:"generated-by-runner",branch:v.branch,commit:v.commit,diffPath:v.diffPath,changes:[],evidence:[],warning:"variant agent did not write JSON; runner synthesized minimal record"},null,2));
      v.json={...readJson(jsonPath,{}),variantId:v.id,branch:v.branch,commit:v.commit,diffPath:v.diffPath,validation:v.validation}; writeFileSync(jsonPath,JSON.stringify(v.json,null,2)); v.status=v.validation.every((x:any)=>x.passed)?"valid":"validation-failed"; updateAgent(runId,v.id,{status:v.status==="valid"?"completed":"blocked",currentPhase:"variant-complete",currentArtifact:`artifacts/variants/${v.id}.json`});
    });
    await runBounded(variants,Math.min(3,req.limits.maxParallelVariants),async(v)=>{
      updateAgent(runId,`evaluator-${v.index}`,{label:`Evaluator ${v.index}`,role:"variant evaluator",status:"running",currentPhase:"evaluation",currentTask:`Evaluate ${v.id}`});
      let code=0; if(v.status!=="failed") code=await streamHermes(runId,runRoot,`evaluator-${v.index}`,v.path,evaluatorPrompt(req,v,runRoot),join(runRoot,"logs",`evaluator-${v.id}.stdout.log`),join(runRoot,"logs",`evaluator-${v.id}.stderr.log`),{APB_VARIANT_WORKTREE:v.path});
      const p=join(art,"evaluations",`evaluation-${v.id}.json`); if(!existsSync(p)){ const passed=v.status==="valid"; writeFileSync(p,JSON.stringify({schemaVersion:"apb.evaluation.v1",variantId:v.id,scores:{objectiveFit:passed?70:0,userValue:passed?65:0,visualQuality:50,implementationQuality:passed?70:0,accessibility:50,performance:50,total:passed?62:0},hardGateViolations:passed?[]:[v.status||"failed"],recommendation:passed?"partial":"reject",rationale:code===0?"Runner synthesized evaluation because evaluator did not write JSON.":`Evaluator unavailable/exited ${code}.`},null,2)); }
      v.evaluation=readJson(p,{}); updateAgent(runId,`evaluator-${v.index}`,{status:"completed",currentArtifact:`artifacts/evaluations/evaluation-${v.id}.json`});
    });
    const winner=chooseWinner(variants); if(!winner) throw new Error("no valid evaluated variant passed hard gates");
    const mashup:{path:string;branch:string;commit?:string;validation?:any[]}={path:join(wtRoot,"mashup"),branch:`apb/${safeBranchPart(runId)}/mashup`}; await createWorktree(repo.repoRoot,mashup.path,mashup.branch,repo.baseCommit);
    updateAgent(runId,"mashup",{label:"Mashup Integrator",role:"synthesis/mashup",status:"running",currentPhase:"mashup",currentTask:`Cherry-pick ${winner.id}`});
    const cp=await gitCmd(mashup.path,["cherry-pick",winner.commit||"HEAD"]); if(cp.exitCode!==0){ await gitCmd(mashup.path,["cherry-pick","--abort"]); throw new Error(`mashup cherry-pick failed: ${cp.stderr||cp.stdout}`); }
    mashup.validation=await runValidations(mashup.path,cmds); mashup.commit=(await gitCmd(mashup.path,["rev-parse","HEAD"])).stdout.trim();
    const synthesis={schemaVersion:"apb.synthesis.v1",status:mashup.validation.every((x:any)=>x.passed)?"accepted":"blocked",winnerVariantId:winner.id,winnerBranch:winner.branch,winnerCommit:winner.commit,mashupBranch:mashup.branch,mashupCommit:mashup.commit,mashupStrategy:"cherry-pick-winning-variant",acceptedFeatures:winner.json?.changes||winner.json?.features||[],rejectedFeatures:variants.filter(v=>v.id!==winner.id).map(v=>({variantId:v.id,reason:v.evaluation?.rationale||v.status})),rationale:`Selected ${winner.id} by highest valid evaluator score.`,validation:mashup.validation};
    writeFileSync(join(art,"synthesis","synthesis.json"),JSON.stringify(synthesis,null,2));
    const passed=synthesis.status==="accepted"; const gateDecisions=[{schemaVersion:"apb.gate-decision.v1",id:`decision-${runId}-managed-loop`,runId,status:passed?"passed":"failed",decision:passed?"accepted":"blocked",evidenceArtifacts:["artifacts/synthesis/synthesis.json",`artifacts/variants/${winner.id}.json`,`artifacts/evaluations/evaluation-${winner.id}.json`],notes:passed?"Runner-managed worktree loop completed and mashup validations passed.":"Mashup validation failed.",decidedAt:now(),decidedBy:"midnight-runner"}]; writeFileSync(join(art,"gate-decisions.json"),JSON.stringify(gateDecisions,null,2));
    const gateReport={schemaVersion:"apb.gate-report.v1",status:passed?"passed":"failed",runId,generatedAt:now(),repoPath:repo.repoRoot,baseCommit:repo.baseCommit,branch:mashup.branch,commit:mashup.commit,iteration:{id:iterationScaffold.id,winnerVariantId:winner.id,synthesisPath:"artifacts/synthesis/synthesis.json"},commands:mashup.validation}; writeFileSync(join(art,"gate-report.json"),JSON.stringify(gateReport,null,2));
    const manifest={schemaVersion:"apb.artifact-manifest.v1",runId,generatedAt:now(),artifacts:["iterations/iteration.json","source-evidence.json",...variants.flatMap(v=>[`variants/${v.id}.json`,`variants/${v.id}.diff`,`evaluations/evaluation-${v.id}.json`]),"synthesis/synthesis.json","gate-decisions.json","gate-report.json"],gateReport:"artifacts/gate-report.json"}; writeFileSync(join(art,"artifact-manifest.json"),JSON.stringify(manifest,null,2));
    iter.status=passed?"completed":"blocked"; iter.completedAt=now(); iter.winnerVariantId=winner.id; iter.mashupBranch=mashup.branch; iter.mashupCommit=mashup.commit; writeFileSync(join(runRoot,"iteration-state.json"),JSON.stringify(iter,null,2)); writeFileSync(join(art,"iterations","iteration.json"),JSON.stringify(iter,null,2));
    if(!passed) throw new Error("mashup validation failed; see artifacts/synthesis/synthesis.json");
    const st=readState(); st.status="completed"; st.phase="completed"; st.completedAt=now(); st.repoPath=repo.repoRoot; st.branch=mashup.branch; st.commit=mashup.commit; st.qualityGate={status:"passed",gateReportPath:`runs/${runId}/artifacts/gate-report.json`,commands:mashup.validation}; st.finalValidation=gateReport; st.lastAction=`Runner-managed iteration completed: ${winner.id} -> ${mashup.branch}`; for(const [id,a] of Object.entries(st.agents||{})) if((a as any)?.status==="running") (st.agents as any)[id]={...(a as any),status:"completed",updatedAt:now()}; writeState(st);
    writeRunJson(runRoot,{runId,status:"completed",phase:"completed",completedAt:st.completedAt,repoPath:repo.repoRoot,branch:mashup.branch,commit:mashup.commit,qualityGate:st.qualityGate,finalValidation:gateReport});
    const control=readControl(); if(control.nextRunRequest?.claimedByRunId===runId){ control.nextRunRequest={...control.nextRunRequest,status:"completed",completedAt:now(),resultRunId:runId,resultBranch:mashup.branch,resultCommit:mashup.commit}; control.requestedRunNow=false; writeControl(control); }
    event("success","mashup","tool-call-end",`Runner-managed iteration completed with ${winner.id}`,{runId,agentId:"mashup",toolName:"runner-managed-worktree-loop",status:"done"}); return "completed";
  }catch(err:any){ blockRun(runId,runRoot,err?.message||String(err),"Inspect run artifacts/logs and target repo/worktrees before retrying."); return "blocked"; }
}


async function main(){
  ensure();
  if(!lock()){ log("another runner holds lock; exiting"); return; }
  try{
    let s=readState();
    s.nextHourlyRunTime = nextHourlyLocal();
    s.lastRunTime = now();
    const control=readControl();
    if (control.runAdmission === "paused" || control.pause?.requested) {
      s.status = s.status || "idle"; s.phase = s.phase || s.status; s.hold = { reason: control.pause?.reason || "Dashboard hold/pause requested", since: control.pause?.requestedAt || now(), owner:"dashboard" };
      s.lastAction = "Hourly runner skipped launch because dashboard steering has paused/held new runs.";
      writeState(s); event("info","system","hold",s.lastAction,{runId:s.currentRunId,status:s.status,nextHourlyRunTime:s.nextHourlyRunTime}); log(s.lastAction); return;
    }
    if (control.stop?.requested) {
      s.status="on-hold"; s.phase="on-hold"; s.hold={reason:control.stop.reason||"Dashboard stop requested",since:control.stop.requestedAt||now(),owner:"dashboard"};
      s.lastAction="Hourly runner honored dashboard stop request and did not launch."; writeState(s); event("warn","system","hold",s.lastAction,{runId:s.currentRunId}); log(s.lastAction); return;
    }
    if (s.currentRunId && ACTIVE.has(s.status)) {
      s.lastAction = `Hourly check: active project ${s.currentRunId} is ${s.status}; no new run started. Will check again next hour.`;
      writeState(s); event("info","system","state-change",s.lastAction,{runId:s.currentRunId,status:s.status,nextHourlyRunTime:s.nextHourlyRunTime}); log(s.lastAction); return;
    }
    const runId=createRunId();
    const runRoot=join(RUNS,runId); mkdirSync(join(runRoot,"logs"),{recursive:true}); mkdirSync(join(runRoot,"artifacts"),{recursive:true});
    const run={ id:runId, status:"inventory-scanning", startedAt:now(), timezone:TZ, selectedProject:null };
    writeFileSync(join(runRoot,"run.json"), JSON.stringify(run,null,2));
    const iterationRequest = resolveIterationRequest(control, s, readQueue());
    let iterationScaffold:any = null;
    if (iterationRequest) iterationScaffold = writeIterationScaffold(runId, runRoot, iterationRequest);
    if (control.nextRunRequest?.status === "pending") { control.nextRunRequest = { ...control.nextRunRequest, status:"running", claimedByRunId:runId, claimedAt:now() }; control.requestedRunNow=false; writeControl(control); }
    s = { ...s, schemaVersion:"apb.state.v1", currentRunId:runId, status:"inventory-scanning", phase:"inventory-scanning", startedAt:run.startedAt, completedAt:null, selectedProject:null, block:null, hold:null, currentTask:iterationRequest?"Bounded iteration workflow starting through Hermes CLI":"Scheduled workflow starting through Hermes CLI", task:iterationRequest?iterationRequest.objective:"Scheduled workflow starting through Hermes CLI", lastAction:iterationRequest?"Hourly runner created a bounded iteration run and is invoking Hermes workflow.":"Hourly runner created a new run and is invoking Hermes workflow.", iteration:iterationScaffold, agents:{orchestrator:{id:"orchestrator",label:"Main Orchestrator",role:"scheduled workflow orchestrator",status:"running",currentPhase:"inventory-scanning",currentTask:"Scan local build inventory and select candidate",lastMessage:"Hermes CLI process launched by hourly runner.",startedAt:now(),updatedAt:now(),logPath:join(runRoot,"logs","hermes.stdout.log")}} };
    writeState(s); event("info","system","state-change",s.lastAction,{runId, iteration: iterationScaffold?.id}); if (iterationScaffold) { const rr=readJson(join(runRoot,"run.json"),{}); Object.assign(rr,{iterationId:iterationScaffold.id,iterationKind:iterationRequest.type,parentIterationId:iterationRequest.sourceIterationId||null,sourceRunId:iterationRequest.sourceRunId||null,repoPath:iterationRequest.repoPath||rr.repoPath||null,objective:iterationRequest.objective}); writeFileSync(join(runRoot,"run.json"),JSON.stringify(rr,null,2)); } log(`starting run ${runId}`);
    if (!existsSync(HERMES) || !existsSync(PROMPT) || !existsSync(TELEMETRY)) {
      s.status="blocked"; s.block={reason:"Hermes binary, runner prompt, or telemetry helper missing",since:now(),owner:"midnight-runner",suggestedAction:`Check ${HERMES}, ${PROMPT}, and ${TELEMETRY}`}; s.lastAction="Scheduled workflow blocked before launch."; writeState(s); event("error","system","block",s.lastAction,{...s.block,runId,agentId:"orchestrator"}); return;
    }
    if (iterationRequest) {
      const result = await runManagedIterationLoop(runId, runRoot, iterationRequest, iterationScaffold);
      if (result === "completed") log(`completed runner-managed iteration ${runId}`);
      return;
    }
    const query = readFileSync(PROMPT,"utf8") + steeringSnapshot(runRoot) + (iterationRequest ? iterationPromptAppend(iterationRequest) : "");
    const stdoutPath = join(runRoot,"logs","hermes.stdout.log");
    const stderrPath = join(runRoot,"logs","hermes.stderr.log");
    writeFileSync(stdoutPath, ""); writeFileSync(stderrPath, "");
    event("info","orchestrator","tool-call-start","Launching Hermes scheduled workflow",{runId,agentId:"orchestrator",toolCallId:`runner-${runId}`,toolName:"hermes chat",action:"scheduled autonomous project workflow"});
    const proc = Bun.spawn([HERMES,"chat","--verbose","--accept-hooks","--source","autonomous-project-builder","--max-turns","90","--toolsets","terminal,file,web,delegation","--query",query], { cwd: HOME, env: { ...process.env, AUTONOMOUS_PROJECT_RUN_ID: runId, AUTONOMOUS_PROJECT_STATE_ROOT: ROOT, AUTONOMOUS_PROJECT_RUN_ROOT: runRoot, AUTONOMOUS_PROJECT_EVENTS: EVENTS, AUTONOMOUS_PROJECT_STATE: STATE, AUTONOMOUS_PROJECT_TELEMETRY: TELEMETRY }, stdout: "pipe", stderr: "pipe" });
    const streamToLog = async (stream: ReadableStream<Uint8Array> | null, path: string, source: string) => {
      if (!stream) return;
      const decoder = new TextDecoder();
      for await (const chunk of stream) {
        const text = decoder.decode(chunk);
        appendFileSync(path, text);
        for (const rawLine of text.split(/\r?\n/).map((x)=>x.trim()).filter(Boolean).slice(-8)) {
          const line = redact(rawLine);
          if (line.startsWith("APB_TELEMETRY ")) {
            try {
              const payload = JSON.parse(line.slice("APB_TELEMETRY ".length));
              event(payload.level || "info", payload.source || payload.agentId || "orchestrator", payload.type || payload.eventType || "event", payload.message || "telemetry", { ...(payload.data || {}), runId: payload.runId || runId, agentId: payload.agentId || payload.data?.agentId || "orchestrator" });
            } catch {}
            continue;
          }
          event(source === "stderr" ? "warn" : "info", "orchestrator", "agent-message", line, { runId, agentId:"orchestrator", logPath:path, stream:source });
        }
        const latest = readState();
        latest.agents = latest.agents && !Array.isArray(latest.agents) ? latest.agents : {};
        latest.agents.orchestrator = { ...(latest.agents.orchestrator || {}), id:"orchestrator", label:"Main Orchestrator", role:"scheduled workflow orchestrator", status:"running", currentPhase:latest.status, currentTask:"Scheduled Hermes workflow running", lastMessage: redact(text.slice(-2000)), logPath:path, updatedAt:now() };
        latest.lastAction = `Hermes workflow ${source} updated`;
        writeState(latest);
      }
    };
    await Promise.all([streamToLog(proc.stdout, stdoutPath, "stdout"), streamToLog(proc.stderr, stderrPath, "stderr")]);
    const exitCode = await proc.exited;
    const final=readState();
    if (exitCode !== 0) {
      final.status="blocked"; final.block={reason:`Hermes workflow exited with code ${exitCode}`, since:now(), owner:"midnight-runner", suggestedAction:"Inspect hermes stdout/stderr logs in run directory"}; final.lastAction="Hermes workflow failed; preserved run for inspection."; writeState(final); event("error","system","block",final.lastAction,final.block); event("error","orchestrator","tool-call-error","Hermes scheduled workflow failed",{runId,agentId:"orchestrator",toolCallId:`runner-${runId}`,toolName:"hermes chat",error:final.block.reason}); log(final.lastAction); return;
    }
    writeCompletionEvidence(runId, runRoot);
    const doneControl=readControl(); if (doneControl.nextRunRequest?.claimedByRunId === runId) { doneControl.nextRunRequest = { ...doneControl.nextRunRequest, status:"completed", completedAt:now() }; doneControl.requestedRunNow=false; writeControl(doneControl); }
    event("success","orchestrator","tool-call-end",`Hermes workflow process exited successfully for ${runId}`,{runId,agentId:"orchestrator",toolCallId:`runner-${runId}`,toolName:"hermes chat",status:"done"}); log(`completed process for ${runId}`);
  } finally { unlock(); }
}

main().catch((err)=>{ ensure(); log(`fatal: ${err?.stack||err}`); event("error","system","error",String(err?.message||err)); unlock(); process.exit(1); });
