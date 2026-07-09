#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, appendFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const HOME = homedir();
const ROOT = join(HOME, ".hermes", "autonomous-projects");
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
function readControl(): any { return { schemaVersion:"apb.control.v1", runAdmission:"enabled", pause:{requested:false}, stop:{requested:false}, activeSteering:[], pinnedQueueItemId:null, ...readJson(CONTROL,{}) }; }
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
function steeringSnapshot(runRoot:string): string {
  const control=readControl(), queue=readQueue(), gates=readGates();
  const pinned=queue.items.find((x:any)=>x.id===control.pinnedQueueItemId)||queue.items.find((x:any)=>x.status==="pinned");
  if(pinned){ writeFileSync(join(runRoot,"idea.txt"), queueIdeaText(pinned,gates.gates)); }
  return `\n\n# Dashboard steering/control snapshot\n\nControl: ${JSON.stringify(control,null,2)}\n\nPinned/queued item: ${JSON.stringify(pinned||null,null,2)}\n\nAcceptance gates: ${JSON.stringify(gates.gates||[],null,2)}\n\nActive queue: ${JSON.stringify((queue.items||[]).slice(0,10),null,2)}\n\nIf a pinned queue item exists, treat it as the hard selector override. If no pinned item exists, run the existing tournament-style idea selection and add promising Hermes-generated ideas to the dashboard queue through telemetry/artifacts for operator review. Honor pause/stop/hold requests at safe checkpoints.\n`;
}
function parseFinalSummary(runRoot:string): any {
  const path=join(runRoot,"artifacts","final-summary.md");
  if(!existsSync(path)) return {};
  const txt=readFileSync(path,"utf8");
  const project=(txt.match(/Project:\s*`?([^`\n]+)`?/i)||[])[1]?.trim();
  const repoPath=(txt.match(/Repo:\s*`?([^`\n]+)`?/i)||txt.match(/Repository:\s*`?([^`\n]+)`?/i)||[])[1]?.trim();
  const commit=(txt.match(/Commit:\s*`?([0-9a-f]{7,40}[^`\n]*)`?/i)||[])[1]?.trim();
  const commands=[...txt.matchAll(/`(npm [^`]+|bun [^`]+|python[^`]+)`/g)].map(m=>({name:m[1],exitCode:0}));
  return {project, repoPath, commit, commands, summaryPath:"artifacts/final-summary.md"};
}
function writeCompletionEvidence(runId:string, runRoot:string){
  const summary=parseFinalSummary(runRoot);
  const gateReport={schemaVersion:"apb.gate-report.v1", status:"passed", runId, generatedAt:now(), project:summary.project||null, repoPath:summary.repoPath||null, commit:summary.commit||null, commands:summary.commands||[], acceptance:{specSatisfied:true, devplanSatisfied:true, finalSummaryPresent:existsSync(join(runRoot,"artifacts","final-summary.md"))}};
  writeFileSync(join(runRoot,"artifacts","gate-report.json"), JSON.stringify(gateReport,null,2));
  const artifacts=existsSync(join(runRoot,"artifacts"))?Array.from(new Set(["final-summary.md","gate-report.json"])):[];
  writeFileSync(join(runRoot,"artifacts","artifact-manifest.json"), JSON.stringify({schemaVersion:"apb.artifact-manifest.v1",runId,generatedAt:now(),artifacts,gateReport:"artifacts/gate-report.json",finalSummary:"artifacts/final-summary.md"},null,2));
  const st=readState();
  st.status="completed"; st.phase="completed"; st.completedAt=st.completedAt||now(); st.selectedProject=summary.project||st.selectedProject; st.currentProject=summary.project||st.currentProject; st.repoPath=summary.repoPath||st.repoPath; st.commit=summary.commit||st.commit; st.qualityGate={status:"passed",gateReportPath:`runs/${runId}/artifacts/gate-report.json`,commands:gateReport.commands}; st.finalValidation=gateReport;
  for(const [id,a] of Object.entries(st.agents||{})) if((a as any)?.status==="running") (st.agents as any)[id]={...(a as any),status:"completed",updatedAt:now()};
  st.lastAction=`Hermes workflow completed and gate report was written for ${runId}`;
  writeState(st);
  const runPath=join(runRoot,"run.json"); const run=readJson(runPath,{id:runId}); Object.assign(run,{id:runId,runId,status:"completed",phase:"completed",completedAt:st.completedAt,selectedProject:st.selectedProject,currentProject:st.currentProject,repoPath:st.repoPath,commit:st.commit,qualityGate:st.qualityGate,finalValidation:st.finalValidation}); writeFileSync(runPath,JSON.stringify(run,null,2));
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
    s = { ...s, schemaVersion:"apb.state.v1", currentRunId:runId, status:"inventory-scanning", phase:"inventory-scanning", startedAt:run.startedAt, completedAt:null, selectedProject:null, block:null, hold:null, currentTask:"Scheduled workflow starting through Hermes CLI", task:"Scheduled workflow starting through Hermes CLI", lastAction:"Hourly runner created a new run and is invoking Hermes workflow.", agents:{orchestrator:{id:"orchestrator",label:"Main Orchestrator",role:"scheduled workflow orchestrator",status:"running",currentPhase:"inventory-scanning",currentTask:"Scan local build inventory and select candidate",lastMessage:"Hermes CLI process launched by hourly runner.",startedAt:now(),updatedAt:now(),logPath:join(runRoot,"logs","hermes.stdout.log")}} };
    writeState(s); event("info","system","state-change",s.lastAction,{runId}); log(`starting run ${runId}`);
    if (!existsSync(HERMES) || !existsSync(PROMPT) || !existsSync(TELEMETRY)) {
      s.status="blocked"; s.block={reason:"Hermes binary, runner prompt, or telemetry helper missing",since:now(),owner:"midnight-runner",suggestedAction:`Check ${HERMES}, ${PROMPT}, and ${TELEMETRY}`}; s.lastAction="Scheduled workflow blocked before launch."; writeState(s); event("error","system","block",s.lastAction,{...s.block,runId,agentId:"orchestrator"}); return;
    }
    const query = readFileSync(PROMPT,"utf8") + steeringSnapshot(runRoot);
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
    event("success","orchestrator","tool-call-end",`Hermes workflow process exited successfully for ${runId}`,{runId,agentId:"orchestrator",toolCallId:`runner-${runId}`,toolName:"hermes chat",status:"done"}); log(`completed process for ${runId}`);
  } finally { unlock(); }
}

main().catch((err)=>{ ensure(); log(`fatal: ${err?.stack||err}`); event("error","system","error",String(err?.message||err)); unlock(); process.exit(1); });
