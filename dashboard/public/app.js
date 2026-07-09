const stateNames=["idle","inventory-scanning","selecting","repo-created","spec-drafting","spec-review","spec-approved","devplan-drafting","devplan-review","devplan-approved","building","blocked","deblocking","on-hold","completed","published"];
const shortState={"inventory-scanning":"scan","repo-created":"repo","spec-drafting":"spec","spec-review":"spec review","spec-approved":"spec ok","devplan-drafting":"devplan","devplan-review":"plan review","devplan-approved":"plan ok",building:"build",deblocking:"deblock","on-hold":"hold",completed:"done"};
const theme={idle:"",selecting:"info","inventory-scanning":"info","repo-created":"info","spec-drafting":"active","spec-review":"review","spec-approved":"success","devplan-drafting":"active","devplan-review":"review","devplan-approved":"success",building:"active",blocked:"danger",deblocking:"warning","on-hold":"warning",completed:"success",published:"success"};
const terminalStates=new Set(["idle","done","error","blocked","complete","completed","published"]);
const $=id=>document.getElementById(id); const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
const pref=(k,d=null)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}}; const setPref=(k,v)=>localStorage.setItem(k,JSON.stringify(v));

let model={state:null,control:null,queue:null,gates:null,audit:[],iterations:[],selectedIterationId:pref('hermes.apb.dashboard.selectedIterationId'),iterationDetail:null,iterationRawOpen:new Set(),eventCursor:null,events:[],seenEventIds:new Set(),runs:[],artifacts:[],logs:[],raw:[],toolCalls:new Map(),toolsByAgent:new Map(),lastResourceLoad:0,resourceSig:'',selectedRunId:pref('hermes.apb.dashboard.selectedRunId'),selectedAgentId:pref('hermes.apb.dashboard.selectedAgentId','orchestrator'),inspector:pref('hermes.apb.dashboard.inspectorTab','agent'),console:pref('hermes.apb.dashboard.consoleTab','events'),expanded:new Set(pref('hermes.apb.dashboard.expandedAgents',['main-orchestrator'])),expandedTools:new Set(),expandedEvents:new Set(pref('hermes.apb.dashboard.expandedEvents',[])),paused:pref('hermes.apb.dashboard.pauseRealtime',false),followConsole:pref('hermes.apb.dashboard.followConsole',true),bottomConsoleHeight:pref('hermes.apb.dashboard.bottomConsoleHeight','32vh'),filter:'all',query:'',selectedArtifact:pref('hermes.apb.dashboard.selectedArtifact'),selectedLog:pref('hermes.apb.dashboard.selectedLog'),artifactCache:new Map(),logCache:new Map(),docCache:new Map(),loadingPreview:new Set(),loadingDocs:new Set(),lastInspectorKey:null};

function isNearBottom(el,px=36){return !el||el.scrollHeight-el.scrollTop-el.clientHeight<=px}
function scrollBottom(el){if(el)requestAnimationFrame(()=>{el.scrollTop=el.scrollHeight})}
function preserveFollow(el,fn){const follow=model.followConsole&&isNearBottom(el); const top=el?.scrollTop??0; fn(); if(follow)scrollBottom(el); else if(el)requestAnimationFrame(()=>{el.scrollTop=top})}
function focusKey(el=document.activeElement){if(!el||el===document.body)return null; return {id:el.id, name:el.getAttribute('name'), data:[...el.attributes||[]].filter(a=>a.name.startsWith('data-')).map(a=>`[${a.name}="${CSS.escape(a.value)}"]`).join(''), tag:el.tagName, start:el.selectionStart, end:el.selectionEnd}}
function restoreFocus(k){if(!k)return; let el=k.id?$(k.id):null; if(!el&&k.data)el=document.querySelector(`${k.tag}${k.data}`); if(!el&&k.name)el=document.querySelector(`${k.tag}[name="${CSS.escape(k.name)}"]`); if(el&&document.activeElement!==el){el.focus({preventScroll:true}); if(k.start!=null&&el.setSelectionRange)try{el.setSelectionRange(k.start,k.end)}catch{}}}
function stableRender(fn){const scroll=[...document.querySelectorAll('.panel-scroll')].map(el=>[el,el.scrollTop,isNearBottom(el)]); const fk=focusKey(); fn(); requestAnimationFrame(()=>{for(const [el,top,bottom] of scroll){if(el.id==='consoleContent'&&model.followConsole&&bottom)el.scrollTop=el.scrollHeight; else el.scrollTop=top} restoreFocus(fk)})}

function clipText(v,n=4000){const s=typeof v==='string'?v:JSON.stringify(v,null,2); return s&&s.length>n?s.slice(0,n)+`\n… truncated ${s.length-n} chars`:s}
function fmt(s){if(!s)return'—';try{return new Date(s).toLocaleTimeString()}catch{return s}} function dt(s){if(!s)return'—';try{return new Date(s).toLocaleString()}catch{return s}} function dur(start,end){if(!start)return'—';const ms=(end?Date.parse(end):Date.now())-Date.parse(start);if(!Number.isFinite(ms)||ms<0)return'—';const h=Math.floor(ms/36e5),m=Math.floor(ms%36e5/6e4),sec=Math.floor(ms%6e4/1000);return h?`${h}h ${m}m`:`${m}m ${sec}s`}
function dot(status){return `<span class="dot ${theme[status]||status||''}" title="${esc(status)}"></span>`}

async function getJson(url){const r=await fetch(url); if(!r.ok)throw new Error(await r.text()); return r.json()} async function getText(url){const r=await fetch(url); if(!r.ok)throw new Error(await r.text()); return r.text()}
function normalizeEvent(e){const typ=e.type||e.eventType||'event', dat={...(e.data||{})}; for(const k of ['runId','agentId','toolCallId','toolName','action','sanitizedInput','sanitizedOutput','status','durationMs','error']) if(e[k]!==undefined&&dat[k]===undefined) dat[k]=e[k]; return {id:e.id||`${e.ts}-${e.source||e.agentId}-${e.message||typ}`.slice(0,160),ts:e.ts||new Date().toISOString(),level:e.level||(typ.includes('error')?'error':'info'),source:e.source||e.agentId||'unknown',type:typ,message:e.message||e.action||e.toolName||'',agentId:e.agentId||dat.agentId||inferAgent(e.source),runId:e.runId||dat.runId||model.state?.currentRunId,data:dat,raw:e}}
function inferAgent(src=''){const s=String(src); if(s.includes('spec'))return'spec'; if(s.includes('devplan'))return'devplan'; if(s.includes('test'))return'tester'; if(s.includes('doc'))return'docs'; if(s.includes('builder'))return'builder'; if(s.includes('deblock'))return'deblocker'; if(s.includes('select'))return'selector'; if(s.includes('invent'))return'inventory'; return s||'system'}
function extractTool(e){const d=e.data||{}; const isTool=String(e.type).startsWith('tool-call')||d.toolName||d.toolCallId||d.tool||/\b(tool|terminal|read_file|patch|write_file|delegate_task|execute_code)\b/i.test(e.message); if(!isTool)return null; const id=d.toolCallId||d.id||e.id; const old=model.toolCalls.get(id)||{}; const status=e.type?.includes('error')?'error':e.type?.includes('end')?'done':d.status||old.status||'running'; return {...old,id,agentId:e.agentId||d.agentId,source:e.source,toolName:d.toolName||d.tool||d.name||guessTool(e.message)||old.toolName||'tool',action:d.action||d.command||d.summary||e.message||old.action||'',input:d.input??d.args??d.sanitizedInput??old.input,output:d.output??d.result??d.sanitizedOutput??old.output,error:d.error??old.error,status,durationMs:d.durationMs??old.durationMs,startedAt:old.startedAt||e.ts,updatedAt:e.ts,events:[...(old.events||[]),e].slice(-10)}}
function guessTool(m=''){return (m.match(/\b(terminal|read_file|write_file|patch|delegate_task|execute_code|web_search|web_extract|search_files)\b/)||[])[1]}
function rebuildToolIndex(){model.toolsByAgent=new Map(); for(const t of model.toolCalls.values()){const id=t.agentId||inferAgent(t.source); if(!model.toolsByAgent.has(id))model.toolsByAgent.set(id,[]); model.toolsByAgent.get(id).push(t)}}
function ingestEvents(list){let changed=false; for(const raw of list||[]){const e=normalizeEvent(raw); if(model.seenEventIds.has(e.id))continue; model.seenEventIds.add(e.id); model.events.push(e); model.eventCursor=e.id; const t=extractTool(e); if(t)model.toolCalls.set(t.id,t); changed=true} model.events=model.events.slice(-1000); model.seenEventIds=new Set(model.events.map(e=>e.id)); if(model.toolCalls.size>500){const keep=[...model.toolCalls.entries()].slice(-500); model.toolCalls=new Map(keep)} rebuildToolIndex(); if(changed)model.agentsCacheKey=null}
function workflowStatus(s=model.state||{}){if(s.status==='complete')return 'completed'; if(stateNames.includes(s.status))return s.status; const p=String(s.phase||''); if(p==='complete')return 'completed'; if(stateNames.includes(p))return p; if(p==='implementation'||p==='build'||p==='building')return 'building'; if(p.includes('devplan-approved'))return 'devplan-approved'; if(p.includes('devplan'))return 'devplan-drafting'; if(p.includes('spec-approved'))return 'spec-approved'; if(p.includes('spec'))return 'spec-drafting'; if(s.status==='running')return 'building'; return s.status||'idle'}
function statusLine(){const s=model.state||{}; const project=s.selectedProject?.name||s.currentProject||'no project'; const ws=workflowStatus(s); return `${dot(ws)} <b>${esc(s.status||ws)}</b> <code>${esc(s.currentRunId||'no-run')}</code> phase: <code>${esc(s.phase||ws)}</code> project: <b>${esc(project)}</b> spec: <b>${esc(adherenceLabel(s.specAdherence))}</b> devplan: <b>${esc(adherenceLabel(s.devplanAdherence))}</b> updated ${dt(s.updatedAt)} <span class="chip">steering enabled</span>`}
function adherenceLabel(a){return typeof a==='string'?a:(a?.status||'not-started')}

// --- DOM Reconciliation Engine ---
function parseHTML(html) {
  const t = document.createElement('template');
  t.innerHTML = String(html).trim();
  return t.content.firstElementChild;
}

function reconcileList(container, items, options) {
  if (!container) return;
  const { keyAttr, emptyHTML, renderItem, updateItem, getItemKey } = options;
  
  if (!items || items.length === 0) {
    if (emptyHTML) {
      if (container.firstElementChild?.classList.contains('empty')) {
        container.firstElementChild.outerHTML = emptyHTML;
      } else {
        container.innerHTML = emptyHTML;
      }
    } else {
      container.innerHTML = '';
    }
    return;
  }

  const emptyEl = container.querySelector('.empty');
  if (emptyEl) emptyEl.remove();

  const existingMap = new Map();
  for (const child of Array.from(container.children)) {
    const key = child.getAttribute(keyAttr);
    if (key != null) {
      existingMap.set(key, child);
    }
  }

  items.forEach((item, index) => {
    const key = String(getItemKey(item));
    let el = existingMap.get(key);

    if (el) {
      existingMap.delete(key);
      const wasExpanded = el.classList.contains('expanded');
      const wasOpen = el.tagName === 'DETAILS' ? el.open : null;
      const openDetails = Array.from(el.querySelectorAll('details')).filter(d => d.open);

      if (wasExpanded) {
        if (keyAttr === 'data-agent' && item.id) model.expanded.add(item.id);
        else if (keyAttr === 'data-tool' && item.id) model.expandedTools.add(item.id);
        else if (keyAttr === 'data-event' && item.id) model.expandedEvents.add(item.id);
      }

      if (updateItem) {
        updateItem(el, item);
      }

      if (wasExpanded) el.classList.add('expanded');
      if (wasOpen !== null) el.open = wasOpen;
      openDetails.forEach(d => d.open = true);
    } else {
      const html = renderItem(item);
      el = parseHTML(html);
    }

    const targetChild = container.children[index];
    if (targetChild !== el) {
      container.insertBefore(el, targetChild || null);
    }
  });

  for (const [key, oldEl] of existingMap) {
    oldEl.remove();
  }
}

function renderTop(){
  const s=model.state||{}, ws=workflowStatus(s);
  if($('topStatus')) $('topStatus').innerHTML=statusLine();
  if($('pauseEvents')) $('pauseEvents').textContent=model.paused?'Resume Stream':'Pause Stream';
  const strip = $('workflowStrip');
  if(!strip) return;
  const idx = stateNames.indexOf(ws);
  reconcileList(strip, stateNames, {
    keyAttr: 'data-phase',
    getItemKey: x => x,
    renderItem: x => {
      const i = stateNames.indexOf(x);
      const cur = ws === x;
      const done = idx >= 0 && i < idx && !['blocked','deblocking','on-hold'].includes(x);
      return `<button class="phase-chip ${cur?'current':''} ${done?'done':''} ${['blocked','on-hold','deblocking'].includes(x)?'interrupt':''}" data-phase="${esc(x)}">${esc(shortState[x]||x)}</button>`;
    },
    updateItem: (el, x) => {
      const i = stateNames.indexOf(x);
      const cur = ws === x;
      const done = idx >= 0 && i < idx && !['blocked','deblocking','on-hold'].includes(x);
      el.className = `phase-chip ${cur?'current':''} ${done?'done':''} ${['blocked','on-hold','deblocking'].includes(x)?'interrupt':''}`;
    }
  });
}

function renderRuns(){
  const active=model.selectedRunId||model.state?.currentRunId;
  const list = $('runsList');
  if(!list) return;
  reconcileList(list, model.runs || [], {
    keyAttr: 'data-run',
    emptyHTML: '<div class="empty">No runs recorded.</div>',
    getItemKey: r => r.id,
    renderItem: r => `<div class="run-row ${r.id===active?'active':''}" data-run="${esc(r.id)}"><div class="row-main">${dot(r.status)}<span class="row-title">${esc(r.id)}</span></div><div class="row-sub">${esc(r.selectedProject||'no project')} · ${dt(r.startedAt)}</div></div>`,
    updateItem: (el, r) => {
      el.className = `run-row ${r.id===active?'active':''}`;
      const dotSpan = el.querySelector('.dot');
      if(dotSpan) {
        dotSpan.className = `dot ${theme[r.status]||r.status||''}`;
        dotSpan.title = r.status || '';
      }
      const titleSpan = el.querySelector('.row-title');
      if(titleSpan) titleSpan.textContent = r.id;
      const subDiv = el.querySelector('.row-sub');
      if(subDiv) subDiv.textContent = `${r.selectedProject||'no project'} · ${dt(r.startedAt)}`;
    }
  });
}

async function postCommand(type,payload={}){const r=await fetch('/api/commands',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type,payload})}); if(!r.ok)throw new Error(await r.text()); await refresh(); return r.json()}
let steeringErrorTimer;
function showSteeringError(error){
  const el=document.querySelector('.steering-error');
  if(!el)return;
  clearTimeout(steeringErrorTimer);
  el.textContent=`Command failed: ${error?.message||error||'Unknown error'}`;
  el.hidden=false;
  steeringErrorTimer=setTimeout(()=>{el.hidden=true;el.textContent=''},6000);
}
function currentObjective(control, pinned){return control.currentObjective?.text||pinned?.objective||model.state?.task||model.state?.currentTask||model.state?.currentProject||'No objective selected yet'}
function renderSteering(){
  const c=$('steeringCockpit'); if(!c)return;
  const control=model.control||{}, queue=model.queue?.items||[], gates=model.gates?.gates||[], audit=model.audit||[], iterations=model.iterations||[];
  const pinned=queue.find(x=>x.id===control.pinnedQueueItemId)||queue.find(x=>x.status==='pinned');
  const steering=(control.activeSteering||[]).slice(0,6);
  const activeRun=model.state?.currentRunId||model.selectedRunId;
  const objective=currentObjective(control,pinned);
  const recentIterations=iterations.slice(0,6);
  c.innerHTML=`<div class="steering-head"><div><b>Mission Control</b><span class="muted"> product steering, resumable iteration lineage, and bounded swarm controls</span></div><div class="steering-actions"><button data-command="pause">Pause checkpoint</button><button data-command="resume">Resume</button><button data-command="hold">Hold new runs</button><button data-start-next-iteration>Start next iteration</button></div></div><div class="steering-error" role="alert" aria-live="polite" hidden></div><div class="mission-strip"><div class="objective-card"><span>current objective</span><strong>${esc(objective)}</strong><small>run ${esc(activeRun||'none')} · phase ${esc(model.state?.phase||'idle')} · admission ${esc(control.runAdmission||'enabled')}</small></div><div class="objective-card"><span>pinned direction</span><strong>${pinned?esc(pinned.title):'No pinned queue item'}</strong><small>${pinned?esc(pinned.objective||'no objective text'):'Add or pin a queue item to steer the next run.'}</small></div><div class="objective-card"><span>bounded loop</span><strong>${control.autoIteration?.enabled?'enabled':'manual'} · ${esc(control.autoIteration?.maxVariantsPerIteration||3)} variants</strong><small>max features ${esc(control.autoIteration?.maxAcceptedFeatures||4)}, motif changes ${esc(control.autoIteration?.maxVisualMotifChanges||1)}, new sections ${esc(control.autoIteration?.maxNewSections||1)}</small></div></div><div class="steering-grid"><section class="steering-card"><h3>Steer objective</h3><form id="steerForm" class="stack-form"><textarea name="text" placeholder="Directive or change request for current/next iteration" required></textarea><select name="scope"><option value="next_iteration">next iteration</option><option value="current_run">current run</option><option value="future_iterations">future iterations</option><option value="global">global</option></select><select name="priority"><option value="required">required</option><option value="should">should</option><option value="note">note</option></select><button>Add directive</button></form><ul class="compact-list">${steering.map(s=>`<li><b>${esc(s.priority)}</b> ${esc(s.scope)} — ${esc(s.text)} <button data-remove-steering="${esc(s.id)}">remove</button></li>`).join('')||'<li class="muted">No active steering directives.</li>'}</ul></section><section class="steering-card"><h3>Queue / pinned item</h3><form id="queueForm" class="stack-form"><input name="title" placeholder="Project title / Hermes self-idea" required><textarea name="objective" placeholder="Objective: what should the swarm build or improve?" required></textarea><textarea name="constraints" placeholder="Constraints, one per line: local-only, tests, benchmark, UX gates…"></textarea><label><input type="checkbox" name="pin" checked> Pin as next build and export to idea.txt</label><button>Add to queue</button></form><div class="queue-list">${queue.slice(0,8).map(item=>`<div class="queue-row ${item.id===control.pinnedQueueItemId?'active':''}"><div><b>${esc(item.title)}</b><div class="row-sub">${esc(item.status)} · priority ${esc(item.priority||0)} · ${esc(item.source||'user')}</div></div><div><button data-pin-queue="${esc(item.id)}">Pin</button><button data-use-queue-direction="${esc(item.id)}">Use next</button><button data-archive-queue="${esc(item.id)}">Archive</button></div></div>`).join('')||'<div class="empty">No queue items yet.</div>'}</div></section><section class="steering-card span-2"><h3>Iteration timeline</h3><div class="iteration-list">${recentIterations.map(it=>`<article class="iteration-node" data-iteration="${esc(it.id)}"><div class="row-main"><b>${esc(it.id)}</b><span class="badged">${esc(it.status)}</span><span class="badged">gate ${esc(it.gateStatus||'unknown')}</span></div><div class="row-sub">${esc(it.objective||'no objective')} · ${esc(it.repoPath||'no repo')} · ${esc(it.commit||'no commit')}</div><div class="iteration-actions"><button data-continue-run="${esc(it.runId)}">Continue</button><button data-fork-run="${esc(it.runId)}">Fork with change</button><button data-use-run-direction="${esc(it.runId)}">Use as next direction</button></div></article>`).join('')||'<div class="empty">No iteration nodes yet.</div>'}</div></section><section class="steering-card"><h3>Acceptance gates</h3><form id="gateForm" class="stack-form"><input name="description" placeholder="New acceptance gate"><input name="requiredEvidence" placeholder="Required evidence"><button>Add gate</button></form><div class="gate-list">${gates.slice(0,8).map(g=>`<div class="gate-row"><b>${esc(g.id||g.description)}</b><span class="badged">${esc(g.status||'pending')}</span><div class="row-sub">${esc(g.description||'')} · evidence ${(g.requiredEvidence||[]).length}</div><button data-gate-pass="${esc(g.id)}">mark pass</button><button data-gate-needs-evidence="${esc(g.id)}">needs evidence</button></div>`).join('')||'<div class="empty">No gates yet.</div>'}</div></section><section class="steering-card"><h3>Recent decisions/artifacts</h3><div class="row-sub">${model.artifacts.length} artifacts · ${model.logs.length} logs · ${audit.length} audit entries</div><ol>${audit.slice(0,6).map(a=>`<li>${fmt(a.ts)} ${esc(a.action||a.type)} ${esc(a.result?.item?.title||a.result?.pinnedQueueItemId||a.result?.gateId||'')}</li>`).join('')||'<li class="muted">No operator audit yet.</li>'}</ol></section></div>`;
}

function agents(){const s=model.state||{}, a=s.agents||{}; const raw=Array.isArray(a)?a:Object.values(a); const arr=raw.map(x=>{const id=x.id||x.label||x.role; const role=x.role||'agent'; const isBuild=String(role).toLowerCase().includes('build orchestrator')||id==='build-orchestrator'; return {id:isBuild?'build-orchestrator':id,label:x.label||role||id,role:role,status:x.status||'idle',currentTask:x.currentTask||x.task||'',currentPhase:x.currentPhase||s.phase||s.status,lastMessage:x.lastMessage||x.message||''}}); const seen=new Map(arr.map(x=>[x.id,x])); for(const e of model.events){const id=e.agentId||e.data?.agentId; if(!id||seen.has(id)||id==='system')continue; seen.set(id,{id,label:id,role:'event-derived subagent',status:'seen',currentTask:e.message||e.type,currentPhase:e.data?.phase||s.phase||s.status,lastMessage:e.message||''})} const main={id:'main-orchestrator',label:'Main Orchestrator',role:'scheduled workflow',status:s.status||'idle',currentTask:s.task||s.currentTask||s.lastAction||'monitor scheduled run',currentPhase:s.phase||s.status,lastMessage:s.lastAction||''}; if(!seen.has('main-orchestrator'))seen.set('main-orchestrator',main); const rank={'main-orchestrator':0,orchestrator:0,'build-orchestrator':1,'inventory-scanner':5,selector:6,'spec-author':10,'research-reviewer':11,'safety-reviewer':12,'spec-auditor':13,'devplan-writer-a':20,'devplan-writer-b':21,'devplan-reconciler':22,'devplan-auditor':23,'worker-core':30,'worker-risk':31,'worker-cli':32,'docs-subagent':40,'testing-subagent':41,deblocker:50,'final-auditor':60,auditor:61}; return [...seen.values()].sort((x,y)=>(rank[x.id]??80)-(rank[y.id]??80)||String(x.id).localeCompare(String(y.id)))}

function renderAgentIndex(){
  const vals=agents();
  const list = $('agentIndex');
  if(!list) return;
  reconcileList(list, vals, {
    keyAttr: 'data-agent',
    emptyHTML: '<div class="empty">No subagents.</div>',
    getItemKey: a => a.id,
    renderItem: a => `<div class="agent-row ${a.id===model.selectedAgentId?'active':''}" data-agent="${esc(a.id)}"><div class="row-main">${dot(a.status)}<span class="row-title">${esc(a.label||a.id)}</span><span class="badged">${esc(a.status)}</span></div><div class="row-sub">${esc(a.currentTask||'idle')}</div></div>`,
    updateItem: (el, a) => {
      el.className = `agent-row ${a.id===model.selectedAgentId?'active':''}`;
      const dotSpan = el.querySelector('.dot');
      if(dotSpan) {
        dotSpan.className = `dot ${theme[a.status]||a.status||''}`;
        dotSpan.title = a.status || '';
      }
      const titleSpan = el.querySelector('.row-title');
      if(titleSpan) titleSpan.textContent = a.label||a.id;
      const badgeSpan = el.querySelector('.badged');
      if(badgeSpan) badgeSpan.textContent = a.status;
      const subDiv = el.querySelector('.row-sub');
      if(subDiv) subDiv.textContent = a.currentTask||'idle';
    }
  });
}

function selectAgent(id){model.selectedAgentId=id;setPref('hermes.apb.dashboard.selectedAgentId',id);model.inspector='agent';setPref('hermes.apb.dashboard.inspectorTab','agent');renderAll()}

function renderDeck(){
  const s=model.state||{}, list=agents(), o=list.find(a=>a.id==='main-orchestrator')||{};
  const blocked=s.block||s.hold;
  const deck = $('orchestratorDeck');
  if(!deck) return;
  deck.className = `orchestrator-deck ${blocked?'blocked':''}`;

  const statusStr = o.status||s.status||'idle';
  const phaseStr = o.currentPhase||s.phase||s.status||'idle';
  const taskStr = o.currentTask||s.currentTask||s.task||'—';
  const actionStr = s.lastAction||'—';
  const blockerStr = blocked?.reason||'none';
  const elapsedStr = dur(s.startedAt, s.completedAt);
  const decisions = (s.decisions||[]).slice(-5).reverse();

  if(!deck.firstElementChild || !deck.querySelector('.deck-grid')){
    deck.innerHTML=`<div class="row-main">${dot(statusStr)}<b>ORCHESTRATOR</b><span class="badged">${esc(statusStr)}</span><span class="muted">phase ${esc(phaseStr)}</span></div><div class="deck-grid"><div class="kv"><span>task</span><strong title="${esc(taskStr)}">${esc(taskStr)}</strong></div><div class="kv"><span>last action</span><strong title="${esc(actionStr)}">${esc(actionStr)}</strong></div><div class="kv"><span>blocker</span><strong>${esc(blockerStr)}</strong></div><div class="kv"><span>elapsed</span><strong>${esc(elapsedStr)}</strong></div></div><ol class="decision-list"></ol>`;
  } else {
    const dotSpan = deck.querySelector('.row-main .dot');
    if(dotSpan) {
      dotSpan.className = `dot ${theme[statusStr]||statusStr||''}`;
      dotSpan.title = statusStr;
    }
    const badgeSpan = deck.querySelector('.row-main .badged');
    if(badgeSpan) badgeSpan.textContent = statusStr;
    const mutedSpan = deck.querySelector('.row-main .muted');
    if(mutedSpan) mutedSpan.textContent = `phase ${phaseStr}`;

    const strongs = deck.querySelectorAll('.deck-grid .kv strong');
    if(strongs.length >= 4){
      strongs[0].textContent = taskStr; strongs[0].title = taskStr;
      strongs[1].textContent = actionStr; strongs[1].title = actionStr;
      strongs[2].textContent = blockerStr;
      strongs[3].textContent = elapsedStr;
    }
  }

  const ol = deck.querySelector('ol.decision-list');
  if(ol){
    reconcileList(ol, decisions, {
      keyAttr: 'data-decision',
      emptyHTML: '<li class="muted">No decisions recorded.</li>',
      getItemKey: d => d,
      renderItem: d => `<li data-decision="${esc(d)}">${esc(d)}</li>`,
      updateItem: (el, d) => { el.textContent = d; }
    });
  }
}

function agentTools(agentId){return model.toolsByAgent.get(agentId)||[]}

function renderAgentStack(){
  const pane=document.querySelector('.activity-pane');
  preserveFollow(pane,()=>{
    const vals=agents().filter(a=>model.filter!=='active'||!terminalStates.has(a.status));
    const stack = $('agentStack');
    if(!stack) return;
    reconcileList(stack, vals, {
      keyAttr: 'data-agent',
      emptyHTML: '<div class="empty">No matching agents.</div>',
      getItemKey: a => a.id,
      renderItem: a => agentCard(a),
      updateItem: (el, a) => updateAgentCard(el, a)
    });
  });
}

function updateAgentCard(el, a) {
  if (el && el.classList.contains('expanded')) {
    model.expanded.add(a.id);
  }
  const expanded = model.expanded.has(a.id) || (el && el.classList.contains('expanded'));
  if (expanded) model.expanded.add(a.id);
  const tools = agentTools(a.id);

  const openDetails = el ? Array.from(el.querySelectorAll('details')).filter(d => d.open) : [];

  el.className = `agent-card ${expanded?'expanded':''} ${a.status==='blocked'?'blocked':''}`;
  const summary = el.querySelector('.agent-summary');
  if (summary) {
    summary.setAttribute('data-toggle-agent', a.id);
    const arrow = summary.firstElementChild;
    if (arrow) arrow.textContent = expanded ? '▾' : '▸';
    const dotSpan = summary.querySelector('.dot');
    if (dotSpan) {
      dotSpan.className = `dot ${theme[a.status]||a.status||''}`;
      dotSpan.title = a.status || '';
    }
    const titleB = summary.querySelector('b');
    if (titleB) titleB.textContent = a.label || a.id;

    const spans = summary.querySelectorAll('span');
    for (const s of spans) {
      if (!s.classList.contains('dot') && !s.classList.contains('badged') && s !== arrow) {
        s.textContent = a.currentTask || 'idle';
      } else if (s.classList.contains('badged')) {
        s.textContent = a.role || 'agent';
      }
    }
    const selectBtn = summary.querySelector('button[data-select-agent]');
    if (selectBtn) selectBtn.setAttribute('data-select-agent', a.id);
  }

  const body = el.querySelector('.agent-body');
  if (body) {
    const kvs = body.querySelectorAll('.deck-grid .kv strong');
    if (kvs.length >= 4) {
      kvs[0].textContent = a.status;
      kvs[1].textContent = a.currentPhase || '—';
      kvs[2].textContent = a.currentArtifact || '—';
      kvs[3].textContent = `${a.blocked||a.status==='blocked'?'blocked':'clear'} / ${a.deblockerActive?'active':'off'}`;
    }

    const h4s = body.querySelectorAll('h4');
    if (h4s[0]) h4s[0].textContent = `Tool calls (${tools.length})`;

    const toolList = body.querySelector('.tool-list');
    if (toolList) {
      reconcileToolsList(toolList, tools);
    }

    const rawBox = body.querySelector('pre.raw-box');
    if (rawBox) {
      rawBox.textContent = a.lastMessage || 'No recent logs.';
    }
  }

  openDetails.forEach(d => d.open = true);
}

function agentCard(a){
  const active=!terminalStates.has(a.status), expanded=model.expanded.has(a.id);
  const tools=agentTools(a.id);
  return `<article class="agent-card ${expanded?'expanded':''} ${a.status==='blocked'?'blocked':''}" data-agent="${esc(a.id)}"><div class="agent-summary" data-toggle-agent="${esc(a.id)}"><span>${expanded?'▾':'▸'}</span>${dot(a.status)}<b>${esc(a.label||a.id)}</b><span>${esc(a.currentTask||'idle')}</span><span class="badged">${esc(a.role||'agent')}</span><button data-select-agent="${esc(a.id)}">inspect</button></div><div class="agent-body"><div class="deck-grid"><div class="kv"><span>status</span><strong>${esc(a.status)}</strong></div><div class="kv"><span>phase</span><strong>${esc(a.currentPhase||'—')}</strong></div><div class="kv"><span>artifact</span><strong>${esc(a.currentArtifact||'—')}</strong></div><div class="kv"><span>blocked/deblocker</span><strong>${a.blocked||a.status==='blocked'?'blocked':'clear'} / ${a.deblockerActive?'active':'off'}</strong></div></div><h4>Tool calls (${tools.length})</h4><div class="tool-list">${tools.map(toolRow).join('')||'<div class="empty">No tool calls observed for this agent yet.</div>'}</div><h4>Recent message/log tail</h4><pre class="raw-box">${esc(a.lastMessage||'No recent logs.')}</pre></div></article>`;
}

function reconcileToolsList(container, tools) {
  reconcileList(container, tools, {
    keyAttr: 'data-tool',
    emptyHTML: '<div class="empty">No tool calls observed for this agent yet.</div>',
    getItemKey: t => t.id,
    renderItem: t => toolRow(t),
    updateItem: (el, t) => updateToolRow(el, t)
  });
}

function updateToolRow(el, t) {
  if (el && el.classList.contains('expanded')) {
    model.expandedTools.add(t.id);
  }
  const expanded = model.expandedTools.has(t.id) || (el && el.classList.contains('expanded'));
  if (expanded) model.expandedTools.add(t.id);
  const input = expanded&&t.input!==undefined?clipText(t.input):'';
  const output = expanded&&t.output!==undefined?clipText(t.output):'';

  const openDetails = el ? Array.from(el.querySelectorAll('details')).filter(d => d.open) : [];

  el.className = `tool-row ${expanded?'expanded':''} ${t.status==='error'?'level-error':''}`;
  const summary = el.querySelector('.tool-summary');
  if (summary) {
    summary.setAttribute('data-toggle-tool', t.id);
    const arrow = summary.firstElementChild;
    if (arrow) arrow.textContent = expanded ? '▾' : '▸';
    const dotSpan = summary.querySelector('.dot');
    if (dotSpan) {
      dotSpan.className = `dot ${theme[t.status]||t.status||''}`;
      dotSpan.title = t.status || '';
    }
    const bName = summary.querySelector('b');
    if (bName) bName.textContent = t.toolName;

    const spans = Array.from(summary.children).filter(c => c.tagName === 'SPAN' && c !== arrow && !c.classList.contains('dot'));
    if (spans.length >= 3) {
      spans[0].textContent = t.action;
      spans[0].title = t.action;
      spans[1].textContent = t.status;
      spans[2].textContent = t.durationMs ? `${t.durationMs}ms` : fmt(t.updatedAt);
    }
  }

  const drawerBtn = el.querySelector('button[data-drawer-tool]');
  if (drawerBtn) drawerBtn.setAttribute('data-drawer-tool', t.id);

  const body = el.querySelector('.tool-body');
  if (body) {
    const pres = body.querySelectorAll('pre.raw-box');
    if (pres.length >= 2) {
      pres[0].textContent = input || '—';
      pres[1].textContent = output || '—';
    }
    if (t.error) {
      let errPre = pres[2];
      if (!errPre) {
        body.insertAdjacentHTML('beforeend', `<h4>Error</h4><pre class="raw-box">${esc(t.error)}</pre>`);
      } else {
        errPre.textContent = t.error;
      }
    } else if (pres[2]) {
      const h4s = body.querySelectorAll('h4');
      if (h4s[2]) h4s[2].remove();
      pres[2].remove();
    }
  }

  openDetails.forEach(d => d.open = true);
}

function toolRow(t){
  const expanded=model.expandedTools.has(t.id);
  const input=expanded&&t.input!==undefined?clipText(t.input):'';
  const output=expanded&&t.output!==undefined?clipText(t.output):'';
  return `<div class="tool-row ${expanded?'expanded':''} ${t.status==='error'?'level-error':''}" data-tool="${esc(t.id)}"><div class="tool-summary" data-toggle-tool="${esc(t.id)}"><span>${expanded?'▾':'▸'}</span>${dot(t.status)}<b>${esc(t.toolName)}</b><span title="${esc(t.action)}">${esc(t.action)}</span><span>${esc(t.status)}</span><span>${t.durationMs?`${t.durationMs}ms`:fmt(t.updatedAt)}</span></div><div class="tool-body"><div class="mini-toolbar"><b>${esc(t.toolName)}</b><button data-drawer-tool="${esc(t.id)}">open drawer</button></div><p class="muted">agent ${esc(t.agentId||t.source||'unknown')} · call ${esc(t.id)}</p><h4>Input</h4><pre class="raw-box">${expanded?esc(input||'—'):'Expand or open drawer for input preview.'}</pre><h4>Output</h4><pre class="raw-box">${expanded?esc(output||'—'):'Expand or open drawer for output preview.'}</pre>${t.error?`<h4>Error</h4><pre class="raw-box">${esc(t.error)}</pre>`:''}</div></div>`;
}

function bindToolToggles(){}

function renderInspector(){
  document.querySelectorAll('[data-inspector]').forEach(b=>b.classList.toggle('active',b.dataset.inspector===model.inspector));
  const c=$('inspectorContent');
  if(!c) return;
  const key=inspectorRenderKey();
  if(key&&key===model.lastInspectorKey)return;
  model.lastInspectorKey=key;
  if(model.inspector==='agent')return renderAgentInspector(c);
  if(model.inspector==='spec')return renderDoc(c,'spec.md','SPEC',model.state?.specAdherence);
  if(model.inspector==='devplan')return renderDoc(c,'devplan.md','DEVPLAN',model.state?.devplanAdherence);
  if(model.inspector==='artifacts')return renderArtifacts(c);
  if(model.inspector==='logs')return renderLogs(c);
  if(model.inspector==='run')return renderRunJson(c);
}
function resourceSig(xs){return (xs||[]).map(x=>`${x.name}:${x.size}:${x.modifiedAt}`).join('|')}
function inspectorRenderKey(){
  if(model.inspector==='agent')return null;
  if(model.inspector==='spec')return `spec:${model.selectedRunId||''}:${adherenceLabel(model.state?.specAdherence)}:${resourceSig(model.artifacts)}`;
  if(model.inspector==='devplan')return `devplan:${model.selectedRunId||''}:${adherenceLabel(model.state?.devplanAdherence)}:${resourceSig(model.artifacts)}`;
  if(model.inspector==='artifacts')return `artifacts:${model.selectedRunId||''}:${model.selectedArtifact||''}:${resourceSig(model.artifacts)}`;
  if(model.inspector==='logs')return `logs:${model.selectedRunId||''}:${model.selectedLog||''}:${resourceSig(model.logs)}`;
  if(model.inspector==='run')return `run:${model.selectedRunId||''}:${model.selectedIterationId||''}:${model.iterationDetail?.schemaVersion||''}:${model.state?.updatedAt||''}`;
  return `${model.inspector}:${model.selectedRunId||''}`;
}

function renderAgentInspector(c){
  const a=agents().find(x=>x.id===model.selectedAgentId)||agents()[0];
  if(!a){c.innerHTML='<div class="empty">No agent selected.</div>';return}
  const ev=model.events.filter(e=>e.agentId===a.id).slice(-30);
  c.innerHTML=`<div class="inspector-section"><div class="mini-toolbar"><b>${esc(a.label||a.id)}</b><span class="badged">${esc(a.status)}</span></div><div class="deck-grid"><div class="kv"><span>role</span><strong>${esc(a.role)}</strong></div><div class="kv"><span>phase</span><strong>${esc(a.currentPhase||'—')}</strong></div><div class="kv"><span>blocked</span><strong>${a.blocked||a.status==='blocked'?'yes':'no'}</strong></div><div class="kv"><span>deblocker</span><strong>${a.deblockerActive?'active':'off'}</strong></div></div><pre class="raw-box">${esc(a.lastMessage||'No message.')}</pre><h4>Agent tool calls</h4><div class="tool-list">${agentTools(a.id).map(toolRow).join('')||'<div class="empty">No tool calls.</div>'}</div><h4>Agent events</h4><div class="event-list">${ev.map(eventRow).join('')||'<div class="empty">No events.</div>'}</div><details><summary>Raw agent payload</summary><pre class="raw-box">${esc(JSON.stringify(a,null,2))}</pre></details></div>`;
}

async function renderDoc(c,file,label,adh){
  const status=adherenceLabel(adh);
  const runId=model.selectedRunId;
  const key=`${runId||'no-run'}:${file}`;
  const candidates=file==='spec.md'?['spec.md','SPEC.approved-candidate-v2.md','SPEC.approved-candidate.md','SPEC.md']:file==='devplan.md'?['devplan.md','DEVPLAN.approved-candidate-v2.md','DEVPLAN.reconciled.md','DEVPLAN.md']:[file];
  const cached=model.docCache.get(key);
  if(cached){c.dataset.docKey=key;c.innerHTML=`<div class="inspector-section"><div class="mini-toolbar"><b>${label}</b><span>${esc(status)} · ${adh?.completed||0}/${adh?.total||0}</span></div><article class="markdown raw-box"><p class="muted">Showing <code>${esc(cached.name)}</code></p>${md(cached.text)}</article></div>`;return}
  if(c.dataset.docKey!==key||!c.querySelector('article')){c.dataset.docKey=key;c.innerHTML=`<div class="inspector-section"><div class="mini-toolbar"><b>${label}</b><span>${esc(status)} · ${adh?.completed||0}/${adh?.total||0}</span></div><article class="markdown raw-box">Loading ${label}…</article></div>`;}
  if(!runId){c.querySelector('article').textContent=`${label} has not been generated yet.`;return}
  if(model.loadingDocs.has(key))return;
  model.loadingDocs.add(key);
  for(const candidate of candidates){
    try{
      const txt=await getText(`/api/runs/${encodeURIComponent(runId)}/artifacts/${candidate}`);
      model.docCache.set(key,{name:candidate,text:txt});
      if(model.selectedRunId===runId&&model.inspector===(file==='spec.md'?'spec':'devplan'))c.querySelector('article').innerHTML=`<p class="muted">Showing <code>${esc(candidate)}</code></p>`+md(txt);
      model.loadingDocs.delete(key);
      return;
    }catch{}
  }
  model.loadingDocs.delete(key);
  if(model.selectedRunId===runId)c.querySelector('article').textContent=`No final ${label} artifact found. Tried: ${candidates.join(', ')}. Dashboard state reports adherence: ${status}.`;
}

function md(src){return esc(src).replace(/^### (.*)$/gm,'<h3>$1</h3>').replace(/^## (.*)$/gm,'<h2>$1</h2>').replace(/^# (.*)$/gm,'<h1>$1</h1>').replace(/^- \[x\] (.*)$/gim,'<p>✅ $1</p>').replace(/^- \[ \] (.*)$/gim,'<p>⬜ $1</p>').replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\n\n/g,'<br><br>')}
function previewKey(kind,name){return `${model.selectedRunId||'no-run'}:${kind}:${name||''}`}
async function loadPreview(kind,name){if(!name||!model.selectedRunId)return; const key=previewKey(kind,name), cache=kind==='artifact'?model.artifactCache:model.logCache; if(cache.has(key)||model.loadingPreview.has(key))return; model.loadingPreview.add(key); try{const url=kind==='artifact'?`/api/runs/${encodeURIComponent(model.selectedRunId)}/artifacts/${encodeURIComponent(name)}`:`/api/runs/${encodeURIComponent(model.selectedRunId)}/logs/${encodeURIComponent(name)}?tail=400`; const txt=clipText(await getText(url),100000); cache.set(key,txt); const p=$(kind==='artifact'?'artifactPreview':'logPreview'); if(p&&((kind==='artifact'&&model.selectedArtifact===name)||(kind==='log'&&model.selectedLog===name)))p.textContent=txt}finally{model.loadingPreview.delete(key)}}
async function openArtifact(name){model.selectedArtifact=name;setPref('hermes.apb.dashboard.selectedArtifact',name);model.inspector='artifacts';setPref('hermes.apb.dashboard.inspectorTab','artifacts');model.lastInspectorKey=null;renderInspector(); loadPreview('artifact',name)}
async function openLog(name){model.selectedLog=name;setPref('hermes.apb.dashboard.selectedLog',name);model.inspector='logs';setPref('hermes.apb.dashboard.inspectorTab','logs');model.lastInspectorKey=null;renderInspector(); loadPreview('log',name)}

function renderArtifacts(c){
  const key=previewKey('artifact',model.selectedArtifact), cached=model.artifactCache.get(key);
  c.innerHTML=`<div class="inspector-section"><div class="mini-toolbar"><b>Artifacts</b><span>${model.artifacts.length} files</span></div><div class="file-list">${model.artifacts.map(f=>`<div class="file-row ${f.name===model.selectedArtifact?'active':''}" data-artifact="${esc(f.name)}"><b>${esc(f.name)}</b><div class="row-sub">${f.size} bytes · ${dt(f.modifiedAt)}</div></div>`).join('')||'<div class="empty">No artifacts for selected run.</div>'}</div><pre id="artifactPreview" class="preview">${esc(cached??(model.selectedArtifact?'Loading '+model.selectedArtifact+'…':'Select an artifact.'))}</pre></div>`;
  if(model.selectedArtifact&&model.artifacts.some(f=>f.name===model.selectedArtifact))loadPreview('artifact',model.selectedArtifact);
}

function renderLogs(c){
  const key=previewKey('log',model.selectedLog), cached=model.logCache.get(key);
  c.innerHTML=`<div class="inspector-section"><div class="mini-toolbar"><b>Logs</b><span>${model.logs.length} files</span></div><div class="file-list">${model.logs.map(f=>`<div class="file-row ${f.name===model.selectedLog?'active':''}" data-log="${esc(f.name)}"><b>${esc(f.name)}</b><div class="row-sub">${f.size} bytes · ${dt(f.modifiedAt)}</div></div>`).join('')||'<div class="empty">No logs for selected run.</div>'}</div><pre id="logPreview" class="preview">${esc(cached??(model.selectedLog?'Loading '+model.selectedLog+'…':'Select a log.'))}</pre></div>`;
  if(model.selectedLog&&model.logs.some(f=>f.name===model.selectedLog))loadPreview('log',model.selectedLog);
}

function arr(x){if(Array.isArray(x))return x;if(!x)return[];if(typeof x==='object')return Object.values(x);return[x]}
function first(...xs){return xs.find(x=>x!==undefined&&x!==null&&x!==''&&!(Array.isArray(x)&&!x.length))}
function variantKey(v,i){return String(first(v?.variantId,v?.id,v?.name,v?.label,`variant-${i+1}`))}
function variantTitle(v,i){return String(first(v?.title,v?.name,v?.claim,variantKey(v,i)))}
function evaluationVariantKey(e){return String(first(e?.variantId,e?.variant,e?.targetVariant,e?.id,e?.name,''))}
function normKey(x){return String(x||'').toLowerCase().replace(/[^a-z0-9]+/g,'')}
function findEvaluationForVariant(v,i,evaluations){const k=normKey(variantKey(v,i));return evaluations.find(e=>normKey(evaluationVariantKey(e))===k)||evaluations[i]||null}
function metricValue(obj,keys){const root=obj?.scores||obj?.metrics||obj||{};for(const k of keys){const v=root[k]??obj?.[k];if(Number.isFinite(Number(v)))return Number(v)}return null}
function normalizeScore(n){if(n==null||!Number.isFinite(Number(n)))return null;let v=Number(n);if(v<=5)v*=20;return Math.max(0,Math.min(100,v))}
function totalScore(e,v){return normalizeScore(first(e?.scores?.total,e?.weightedScore,e?.weighted_score,e?.score,e?.total,v?.weightedScore,v?.score))??normalizeScore(metricRows(e,v).map(x=>x[1]).filter(x=>x!=null).reduce((a,b)=>a+b,0)/(metricRows(e,v).filter(x=>x[1]!=null).length||1))}
function scoreClass(score){if(score==null)return'score-unknown';if(score>=85)return'score-strong';if(score>=70)return'score-good';if(score>=50)return'score-mid';return'score-low'}
function scoreLabel(score){return score==null?'—':String(Math.round(score))}
function verdictFor(score,e,v){return first(e?.verdict,e?.decision,e?.recommendation,v?.verdict,score>=85?'strong candidate':score>=70?'selective':score>=50?'needs evidence':'reject')}
function metricRows(e,v){const o={...(v||{}),...(e||{}),scores:{...(v?.scores||{}),...(e?.scores||{})}};return [['Objective fit',normalizeScore(metricValue(o,['objectiveFit','objective_fit','objective','fit']))],['User value',normalizeScore(metricValue(o,['userValue','user_value','clarity','value']))],['Visual / UX',normalizeScore(metricValue(o,['visualQuality','visualUx','visualUX','visual','experience']))],['Implementation',normalizeScore(metricValue(o,['implementationQuality','implementation','impl','feasibility']))],['A11y',normalizeScore(metricValue(o,['accessibility','a11y']))],['Performance',normalizeScore(metricValue(o,['performance','perf','complexity']))]]}
function artifactHref(runId,name){return `/api/runs/${encodeURIComponent(runId)}/artifacts/${String(name||'').split('/').map(encodeURIComponent).join('/')}`}
function evidenceItems(...sources){const out=[];const add=x=>{if(!x)return;if(Array.isArray(x)){x.forEach(add);return}if(typeof x==='string'){out.push({label:x.split('/').pop()||x,href:/^https?:/.test(x)?x:null,artifactName:/^https?:/.test(x)?null:x,kind:'artifact'});return}if(typeof x==='object'){const href=x.href||x.url||x.link;const art=x.artifact||x.path||x.file||x.name;out.push({label:x.label||x.title||art||href||x.kind||'evidence',href,artifactName:art&&!/^https?:/.test(art)?art:null,kind:x.kind||'evidence'})}};for(const s of sources){if(!s)continue;['evidence','evidenceLinks','evidence_links','screenshots','screenshot','artifacts','artifact','checks','diff','diffPath','traceability','evidenceArtifacts'].forEach(k=>add(s[k]));}return out.slice(0,12)}
function renderEvidenceLinks(items,runId){const xs=arr(items);if(!xs.length)return'<span class="muted">No evidence linked.</span>';return `<div class="evidence-links">${xs.map(x=>{const href=x.href||x.url||(x.artifactName?artifactHref(runId,x.artifactName):null);return href?`<a class="evidence-chip" href="${esc(href)}" target="_blank" rel="noopener">${esc(x.label||x.artifactName||href)}</a>`:`<span class="evidence-chip">${esc(x.label||x.kind||'evidence')}</span>`}).join('')}</div>`}
function synthesisAcceptedFeatures(s,d){return arr(first(s?.acceptedFeatures,s?.accepted,d?.acceptedFeatures,s?.features?.filter?.(f=>/accept/i.test(f.status||f.decision||''))))}
function synthesisRejectedFeatures(s,d){return arr(first(s?.rejectedFeatures,s?.rejected,d?.rejectedFeatures,s?.doNotInclude,s?.do_not_include,s?.features?.filter?.(f=>/reject|defer/i.test(f.status||f.decision||''))))}
function featureText(f){return typeof f==='string'?f:first(f?.title,f?.feature,f?.description,f?.name,clipText(f,240))}
function featureMeta(f){if(!f||typeof f==='string')return'';return [f.variantId||f.sourceVariant,f.evidence?.length?`${f.evidence.length} evidence`:null,f.budget?`budget ${f.budget}`:null].filter(Boolean).join(' · ')}
function renderMetricBars(rows){return `<div class="score-bars">${rows.map(([label,val])=>`<div class="score-row"><span>${esc(label)}</span><div class="score-track"><div class="score-fill" style="--score-pct:${val??0}%"></div></div><b>${scoreLabel(val)}</b></div>`).join('')}</div>`}
function renderIterationControls(d,acceptedCount){return `<div class="iteration-controlbar"><button class="primary" data-continue-run="${esc(d.runId)}">Resume from this iteration</button><button data-fork-run="${esc(d.runId)}">Fork with change</button><button class="accepted" data-use-run-direction="${esc(d.runId)}" ${acceptedCount?'':'title="No accepted features recorded yet"'}>Use accepted direction</button></div>`}
function renderVariantCard(v,e,i,d){const score=totalScore(e,v), verdict=verdictFor(score,e,v);const ev=evidenceItems(v,e);const strong=score>=70?'strong':score<50?'rejected':'';return `<article class="variant-card ${strong}"><div class="variant-head"><b title="${esc(variantTitle(v,i))}">${esc(variantTitle(v,i))}</b><span class="score-pill ${scoreClass(score)}">${scoreLabel(score)}</span></div><span class="chip">${esc(verdict)}</span><p class="muted">${esc(first(v.claim,v.summary,v.rationale,e?.rationale,'No claim recorded.'))}</p>${renderMetricBars(metricRows(e,v))}${renderEvidenceLinks(ev,d.runId)}<div class="mini-toolbar"><button data-iteration-raw="variant:${esc(variantKey(v,i))}">raw variant</button><button data-iteration-raw="evaluation:${esc(variantKey(v,i))}">raw eval</button></div></article>`}
function renderSynthesisPanel(d){const s=d.synthesis||{};const accepted=synthesisAcceptedFeatures(s,d), rejected=synthesisRejectedFeatures(s,d);return `<section class="iteration-section"><div class="mini-toolbar"><b>Synthesis / mashup</b><span>${accepted.length} accepted · ${rejected.length} rejected</span><button data-iteration-raw="synthesis">raw synthesis</button></div><div class="synthesis-grid"><div><h4>Accepted features</h4><ul class="feature-list">${accepted.map(f=>`<li class="feature-item accepted"><b>${esc(featureText(f))}</b><small>${esc(featureMeta(f)||'accepted into next direction')}</small></li>`).join('')||'<li class="empty">No accepted features recorded.</li>'}</ul></div><div><h4>Rejected / do not include</h4><ul class="feature-list">${rejected.map(f=>`<li class="feature-item rejected"><b>${esc(featureText(f))}</b><small>${esc(featureMeta(f)||'rejected or deferred')}</small></li>`).join('')||'<li class="empty">No rejected features recorded.</li>'}</ul></div></div><p class="muted">${esc(first(s.rationale,s.summary,s.mashupStrategy,'No synthesis rationale recorded yet.'))}</p></section>`}
function gateRowsFromIteration(d){let rows=arr(d.gateDecisions).concat(arr(d.gateDecisionsFromControl).map(x=>x.decision||x));if(!rows.length&&d.acceptanceGateResults&&typeof d.acceptanceGateResults==='object')rows=Object.entries(d.acceptanceGateResults).map(([id,status])=>({id,status,decision:status}));if(!rows.length&&d.gateStatus)rows=[{id:'final-gate',status:d.gateStatus,decision:d.gateStatus}];return rows}
function renderGateMatrix(d){const rows=gateRowsFromIteration(d);return `<section class="iteration-section"><div class="mini-toolbar"><b>Gate matrix</b><span>${rows.length} decisions</span><button data-iteration-raw="gates">raw gates</button></div><div class="gate-matrix"><div class="gate-matrix-row header"><span>Gate</span><span>Status</span><span>Decision</span><span>Evidence</span><span>Notes</span><span>Action</span></div>${rows.map((g,i)=>`<div class="gate-matrix-row"><b>${esc(g.gateId||g.id||g.name||`gate-${i+1}`)}</b><span class="badged">${esc(g.status||'unknown')}</span><span>${esc(g.decision||'—')}</span>${renderEvidenceLinks(evidenceItems(g),d.runId)}<span class="muted">${esc(g.notes||g.rationale||'—')}</span><span><button data-gate-pass="${esc(g.gateId||g.id||'final-gate')}">pass</button><button data-gate-needs-evidence="${esc(g.gateId||g.id||'final-gate')}">needs evidence</button></span></div>`).join('')||'<div class="empty">No gate decisions recorded yet.</div>'}</div></section>`}
function renderIterationEvidenceSummary(d){return `<section class="iteration-section"><div class="mini-toolbar"><b>Evidence</b><span>${(d.artifacts||[]).length} artifacts · ${(d.logs||[]).length} logs</span><button data-iteration-raw="sourceEvidence">raw source</button></div><div class="deck-grid"><div class="kv"><span>repo</span><strong>${esc(d.repoPath||d.run?.repoPath||'—')}</strong></div><div class="kv"><span>commit</span><strong>${esc(d.commit||d.run?.commit||'—')}</strong></div><div class="kv"><span>screenshots</span><strong>${esc(arr(d.screenshots).length)}</strong></div><div class="kv"><span>tests</span><strong>${esc(arr(d.testResults).length||arr(d.evidence?.gateReport?.data?.commands).length)}</strong></div></div>${renderEvidenceLinks(evidenceItems(d.sourceEvidence,d.evidence?.gateReport?.data),d.runId)}</section>`}
function iterationRawPayload(d,key){if(!d)return null;if(key==='detail')return d;if(key==='variants')return d.variants;if(key==='evaluations')return d.evaluations;if(key==='synthesis')return d.synthesis;if(key==='gates')return {gateDecisions:d.gateDecisions,gateDecisionsFromControl:d.gateDecisionsFromControl};if(key==='sourceEvidence')return d.sourceEvidence;if(key?.startsWith('variant:')){const id=normKey(key.slice(8));return arr(d.variants).find((v,i)=>normKey(variantKey(v,i))===id)}if(key?.startsWith('evaluation:')){const id=normKey(key.slice(11));return arr(d.evaluations).find(e=>normKey(evaluationVariantKey(e))===id)}return d[key]||d}
function openIterationRaw(key){openDrawer(`Iteration raw: ${key}`,iterationRawPayload(model.iterationDetail,key))}
function renderIterationDetail(d){const variants=arr(d.variants), evals=arr(d.evaluations), accepted=synthesisAcceptedFeatures(d.synthesis||{},d);return `<div class="iteration-detail"><section class="iteration-hero"><div class="iteration-hero-top"><div class="iteration-title"><b>${esc(d.objective||d.id)}</b><small>${esc(d.id)} · run ${esc(d.runId)} · ${esc(d.mode||'run')} · ${dt(d.startedAt)}</small></div>${renderIterationControls(d,accepted.length)}</div><div class="iteration-stats"><div class="iteration-stat"><span>status</span><strong>${esc(d.status||'unknown')}</strong></div><div class="iteration-stat"><span>gate</span><strong>${esc(d.gateStatus||d.evidence?.gateReport?.data?.status||'unknown')}</strong></div><div class="iteration-stat"><span>variants</span><strong>${variants.length}</strong></div><div class="iteration-stat"><span>artifacts</span><strong>${arr(d.artifacts).length}</strong></div></div></section>${renderIterationEvidenceSummary(d)}<section class="iteration-section"><div class="mini-toolbar"><b>Variant scorecards</b><span>${variants.length} variants · ${evals.length} evaluations</span><button data-iteration-raw="variants">raw variants</button><button data-iteration-raw="evaluations">raw evals</button></div><div class="variant-grid">${variants.map((v,i)=>renderVariantCard(v,findEvaluationForVariant(v,i,evals),i,d)).join('')||'<div class="empty">No variant artifacts yet.</div>'}</div></section>${renderSynthesisPanel(d)}${renderGateMatrix(d)}<section class="iteration-section"><div class="mini-toolbar"><b>Raw payloads</b></div><div class="iteration-raw-actions"><button data-iteration-raw="detail">raw detail</button><button data-iteration-raw="sourceEvidence">source evidence</button><button data-iteration-raw="synthesis">synthesis</button><button data-iteration-raw="gates">gates</button></div></section></div>`}
async function renderRunJson(c){
  const iterId=model.selectedIterationId;
  if(iterId){
    try{
      const d=(model.iterationDetail&&(model.iterationDetail.id===iterId||model.iterationDetail.runId===iterId))?model.iterationDetail:await getJson(`/api/iterations/${encodeURIComponent(iterId)}`);
      model.iterationDetail=d; c.innerHTML=renderIterationDetail(d); return;
    }catch(err){c.innerHTML=`<div class="empty">Iteration detail unavailable: ${esc(err?.message||err)}</div>`;return}
  }
  if(!model.selectedRunId){c.innerHTML='<div class="empty">No run selected.</div>';return}
  try{c.innerHTML=`<pre class="raw-box">${esc(clipText(await getJson(`/api/runs/${encodeURIComponent(model.selectedRunId)}`),16000))}</pre>`}catch{c.innerHTML='<div class="empty">Run JSON unavailable.</div>'}
}

function eventSearchText(e){if(!e._search)e._search=[e.ts,e.level,e.source,e.type,e.message,e.agentId,e.runId].join(' ').toLowerCase(); return e._search} function filteredEvents(){let xs=model.events; const q=model.query.toLowerCase(); if(q)xs=xs.filter(e=>eventSearchText(e).includes(q)); if(model.filter==='tools')xs=xs.filter(e=>String(e.type).startsWith('tool-call')||e.data?.toolName||e.data?.toolCallId); if(model.filter==='errors')xs=xs.filter(e=>['error','warn'].includes(e.level)||/error|failed|blocked/i.test(e.message)); if(model.filter==='artifacts')xs=xs.filter(e=>e.type?.includes('artifact')); return xs}

let lastConsoleTab = null;

function renderConsole(){
  const c=$('consoleContent');
  if(!c) return;
  preserveFollow(c,()=>{
    document.querySelectorAll('[data-console]').forEach(b=>b.classList.toggle('active',b.dataset.console===model.console));
    if(lastConsoleTab !== model.console) {
      c.innerHTML = '';
      lastConsoleTab = model.console;
    }
    if(model.console==='events'){
      const events = filteredEvents().slice(-250);
      reconcileList(c, events, {
        keyAttr: 'data-event',
        emptyHTML: '<div class="empty">No events.</div>',
        getItemKey: e => e.id,
        renderItem: e => eventRow(e),
        updateItem: (el, e) => updateEventRow(el, e)
      });
      return;
    }
    if(model.console==='tools'){
      const tools = [...model.toolCalls.values()].slice(-250);
      reconcileList(c, tools, {
        keyAttr: 'data-tool',
        emptyHTML: '<div class="empty">No tool calls observed yet. Future structured tool-call events will appear here collapsed by default.</div>',
        getItemKey: t => t.id,
        renderItem: t => toolRow(t),
        updateItem: (el, t) => updateToolRow(el, t)
      });
      return;
    }
    if(model.console==='logs'){
      reconcileList(c, model.logs, {
        keyAttr: 'data-console-log',
        emptyHTML: '<div class="empty">No run logs yet.</div>',
        getItemKey: f => f.name,
        renderItem: f => `<div class="file-row" data-console-log="${esc(f.name)}"><b>${esc(f.name)}</b><span class="muted"> ${f.size} bytes · ${dt(f.modifiedAt)}</span></div>`,
        updateItem: (el, f) => {
          const b = el.querySelector('b'); if(b) b.textContent = f.name;
          const s = el.querySelector('.muted'); if(s) s.textContent = ` ${f.size} bytes · ${dt(f.modifiedAt)}`;
        }
      });
      return;
    }
    if(model.console==='artifacts'){
      reconcileList(c, model.artifacts, {
        keyAttr: 'data-console-artifact',
        emptyHTML: '<div class="empty">No artifacts yet.</div>',
        getItemKey: f => f.name,
        renderItem: f => `<div class="file-row" data-console-artifact="${esc(f.name)}"><b>${esc(f.name)}</b><span class="muted"> ${f.size} bytes · ${dt(f.modifiedAt)}</span></div>`,
        updateItem: (el, f) => {
          const b = el.querySelector('b'); if(b) b.textContent = f.name;
          const s = el.querySelector('.muted'); if(s) s.textContent = ` ${f.size} bytes · ${dt(f.modifiedAt)}`;
        }
      });
      return;
    }
    const rawList = model.raw.slice(-40);
    reconcileList(c, rawList, {
      keyAttr: 'data-raw-idx',
      emptyHTML: '<div class="empty">No raw SSE payloads.</div>',
      getItemKey: (x, idx) => x.ts + '-' + x.type,
      renderItem: x => `<details data-raw-idx="${esc(x.ts + '-' + x.type)}"><summary>${esc(x.type)} ${fmt(x.ts)}</summary><pre class="raw-box">${esc(JSON.stringify(x.payload,null,2))}</pre></details>`,
      updateItem: (el, x) => {
        const sum = el.querySelector('summary'); if(sum) sum.textContent = `${x.type} ${fmt(x.ts)}`;
        const pre = el.querySelector('pre'); if(pre) pre.textContent = JSON.stringify(x.payload,null,2);
      }
    });
  });
}

function updateEventRow(el, e) {
  if (el && el.classList.contains('expanded')) {
    model.expandedEvents.add(e.id);
  }
  const expanded = model.expandedEvents.has(e.id) || (el && el.classList.contains('expanded'));
  if (expanded) model.expandedEvents.add(e.id);

  const openDetails = el ? Array.from(el.querySelectorAll('details')).filter(d => d.open) : [];

  el.className = `event-row level-${esc(e.level)} ${expanded?'expanded':''}`;
  const summary = el.querySelector('.event-summary');
  if (summary) {
    summary.setAttribute('data-event', e.id);
    const spans = summary.querySelectorAll('span');
    if (spans.length >= 5) {
      spans[0].textContent = fmt(e.ts);
      spans[1].textContent = e.level;
      spans[2].textContent = e.source;
      spans[3].textContent = e.type;
      spans[4].textContent = e.message;
      spans[4].title = e.message;
    }
  }
  const pre = el.querySelector('.event-body pre.raw-box');
  if (pre) {
    pre.textContent = expanded ? clipText(e.raw||e) : 'Expand for event payload preview.';
  }

  openDetails.forEach(d => d.open = true);
}

function eventRow(e){
  return `<div class="event-row level-${esc(e.level)} ${model.expandedEvents.has(e.id)?'expanded':''}" data-event="${esc(e.id)}"><div class="event-summary" data-event="${esc(e.id)}"><span>${fmt(e.ts)}</span><span>${esc(e.level)}</span><span>${esc(e.source)}</span><span>${esc(e.type)}</span><span title="${esc(e.message)}">${esc(e.message)}</span></div><div class="event-body"><pre class="raw-box">${model.expandedEvents.has(e.id)?esc(clipText(e.raw||e)):'Expand for event payload preview.'}</pre></div></div>`;
}

function bindEventRows(){}

function openDrawer(title,obj){const d=$('detailDrawer'); if(!d)return; d.hidden=false; d.innerHTML=`<div class="drawer-head"><b>${esc(title)}</b><button id="closeDrawer">Close</button></div><pre class="raw-box">${esc(JSON.stringify(obj,null,2))}</pre>`; $('closeDrawer').onclick=()=>d.hidden=true}
let renderQueued=false; function scheduleRender(){if(renderQueued)return; renderQueued=true; requestAnimationFrame(()=>{renderQueued=false;renderAll()})}
function renderAll(){stableRender(()=>{renderTop();renderSteering();renderRuns();renderAgentIndex();renderDeck();renderAgentStack();renderInspector();renderConsole()})}
async function loadRunResources(force=false){if(!model.selectedRunId){model.artifacts=[];model.logs=[];return false} const now=Date.now(); if(!force&&now-model.lastResourceLoad<30000)return false; model.lastResourceLoad=now; let artifacts=[],logs=[]; try{artifacts=await getJson(`/api/runs/${encodeURIComponent(model.selectedRunId)}/artifacts`)}catch{} try{logs=await getJson(`/api/runs/${encodeURIComponent(model.selectedRunId)}/logs`)}catch{} const sig=resourceSig(artifacts)+'|'+resourceSig(logs); if(!force&&sig===model.resourceSig)return false; model.resourceSig=sig; model.artifacts=artifacts; model.logs=logs; return true}
async function refresh(){try{const [state,runs,events,control,queue,gates,audit,iterationsDoc]=await Promise.all([getJson('/api/state'),getJson('/api/runs'),getJson('/api/events?limit=250'+(model.eventCursor?`&after=${encodeURIComponent(model.eventCursor)}`:'')),getJson('/api/control'),getJson('/api/queue'),getJson('/api/gates'),getJson('/api/audit?limit=50'),getJson('/api/iterations')]); model.state=state; model.runs=runs; model.control=control; model.queue=queue; model.gates=gates; model.audit=audit; model.iterations=iterationsDoc.items||[]; if(!model.selectedRunId)model.selectedRunId=model.state.currentRunId||(model.runs[0]?.id??null); ingestEvents(events); await loadRunResources(true); scheduleRender()}catch(e){if($('streamState')) $('streamState').textContent='API error'}}
let eventSource=null,pollTimer=null; function pushRaw(x){model.raw.push(x); model.raw=model.raw.slice(-80)} function startPolling(){if(pollTimer)return; pollTimer=setInterval(refresh,4000)} function connect(){try{if(eventSource)eventSource.close(); const es=new EventSource('/api/stream'); eventSource=es; es.addEventListener('open',()=>{$('streamState')&&($('streamState').textContent='SSE live'); if(pollTimer){clearInterval(pollTimer); pollTimer=null}}); es.addEventListener('state',e=>{const p=JSON.parse(e.data); pushRaw({type:'state',ts:new Date().toISOString(),payload:p}); if(!model.paused){model.state=p; if(!model.selectedRunId)model.selectedRunId=p.currentRunId; scheduleRender()}}); es.addEventListener('events',e=>{const p=JSON.parse(e.data); pushRaw({type:'events',ts:new Date().toISOString(),payload:p}); if(!model.paused){ingestEvents(p); scheduleRender()}}); es.addEventListener('heartbeat',e=>{pushRaw({type:'heartbeat',ts:new Date().toISOString(),payload:JSON.parse(e.data)}); if(!model.paused&&model.selectedRunId)loadRunResources(false).then(changed=>{if(changed)scheduleRender()})}); es.onerror=()=>{$('streamState')&&($('streamState').textContent='SSE disconnected; polling'); es.close(); eventSource=null; startPolling()}}catch{startPolling()}}

// --- Global Delegation Handler ---
function initGlobalDelegation() {
  document.addEventListener('click', async (e) => {
    const runEl = e.target.closest('[data-run]');
    if (runEl && $('runsList')?.contains(runEl)) {
      model.selectedRunId = runEl.dataset.run;
      setPref('hermes.apb.dashboard.selectedRunId', model.selectedRunId);
      loadRunResources();
      renderAll();
      return;
    }

    const agentIndexEl = e.target.closest('[data-agent]');
    if (agentIndexEl && $('agentIndex')?.contains(agentIndexEl)) {
      selectAgent(agentIndexEl.dataset.agent);
      return;
    }

    const toggleAgentBtn = e.target.closest('[data-toggle-agent]');
    if (toggleAgentBtn && $('agentStack')?.contains(toggleAgentBtn)) {
      e.stopPropagation();
      const id = toggleAgentBtn.dataset.toggleAgent;
      const card = toggleAgentBtn.closest('.agent-card');
      if (model.expanded.has(id)) {
        model.expanded.delete(id);
        if (card) card.classList.remove('expanded');
      } else {
        model.expanded.add(id);
        if (card) card.classList.add('expanded');
      }
      setPref('hermes.apb.dashboard.expandedAgents', [...model.expanded]);
      renderAgentStack();
      return;
    }

    const selectAgentBtn = e.target.closest('[data-select-agent]');
    if (selectAgentBtn) {
      e.stopPropagation();
      selectAgent(selectAgentBtn.dataset.selectAgent);
      return;
    }

    const toggleToolEl = e.target.closest('[data-toggle-tool]');
    if (toggleToolEl) {
      e.stopPropagation();
      const id = toggleToolEl.dataset.toggleTool;
      const row = toggleToolEl.closest('.tool-row');
      if (model.expandedTools.has(id)) {
        model.expandedTools.delete(id);
        if (row) row.classList.remove('expanded');
      } else {
        model.expandedTools.add(id);
        if (row) row.classList.add('expanded');
      }
      renderAll();
      return;
    }

    const drawerToolBtn = e.target.closest('[data-drawer-tool]');
    if (drawerToolBtn) {
      e.stopPropagation();
      openDrawer('Tool call', model.toolCalls.get(drawerToolBtn.dataset.drawerTool));
      return;
    }

    const iterationRawBtn = e.target.closest('[data-iteration-raw]');
    if(iterationRawBtn){
      e.stopPropagation();
      openIterationRaw(iterationRawBtn.dataset.iterationRaw);
      return;
    }

    const eventEl = e.target.closest('[data-event]');
    if (eventEl) {
      const id = eventEl.dataset.event;
      const row = eventEl.closest('.event-row');
      if (model.expandedEvents.has(id)) {
        model.expandedEvents.delete(id);
        if (row) row.classList.remove('expanded');
      } else {
        model.expandedEvents.add(id);
        if (row) row.classList.add('expanded');
      }
      model.expandedEvents = new Set([...model.expandedEvents].slice(-80));
      setPref('hermes.apb.dashboard.expandedEvents', [...model.expandedEvents]);
      return;
    }

    const iterationEl = e.target.closest('[data-iteration]');
    if (iterationEl) {
      model.selectedIterationId = iterationEl.dataset.iteration;
      model.iterationDetail = null;
      setPref('hermes.apb.dashboard.selectedIterationId', model.selectedIterationId);
      try { model.iterationDetail = await getJson(`/api/iterations/${encodeURIComponent(model.selectedIterationId)}`); } catch {}
      model.inspector = 'run';
      setPref('hermes.apb.dashboard.inspectorTab', model.inspector);
      renderInspector();
      return;
    }

    const artifactEl = e.target.closest('[data-artifact]');
    if (artifactEl) {
      openArtifact(artifactEl.dataset.artifact);
      return;
    }

    const logEl = e.target.closest('[data-log]');
    if (logEl) {
      openLog(logEl.dataset.log);
      return;
    }

    const consoleLogEl = e.target.closest('[data-console-log]');
    if (consoleLogEl) {
      openLog(consoleLogEl.dataset.consoleLog);
      return;
    }

    const consoleArtifactEl = e.target.closest('[data-console-artifact]');
    if (consoleArtifactEl) {
      openArtifact(consoleArtifactEl.dataset.consoleArtifact);
      return;
    }
  });
}

document.addEventListener('submit',async e=>{
  const f=e.target;
  if(f?.id==='queueForm'){
    e.preventDefault();
    const d=Object.fromEntries(new FormData(f).entries());
    try{await postCommand('add-queue-item',{...d,pin:!!f.querySelector('[name="pin"]')?.checked,source:'dashboard'}); f.reset()}
    catch(err){showSteeringError(err)}
  }
  if(f?.id==='steerForm'){
    e.preventDefault();
    const d=Object.fromEntries(new FormData(f).entries());
    try{await postCommand('steer',d); f.reset()}
    catch(err){showSteeringError(err)}
  }
  if(f?.id==='gateForm'){
    e.preventDefault();
    const d=Object.fromEntries(new FormData(f).entries());
    try{await postCommand('add-gate',d); f.reset()}
    catch(err){showSteeringError(err)}
  }
});
document.addEventListener('click',async e=>{
  const cmd=e.target.closest('[data-command]')?.dataset.command;
  if(cmd){
    try{await postCommand(cmd,{reason:'Dashboard operator command'})}
    catch(err){showSteeringError(err)}
    return;
  }
  const pin=e.target.closest('[data-pin-queue]')?.dataset.pinQueue;
  if(pin){
    try{await postCommand('pin-queue-item',{id:pin})}
    catch(err){showSteeringError(err)}
    return;
  }
  const removeSteer=e.target.closest('[data-remove-steering]')?.dataset.removeSteering;
  if(removeSteer){try{await postCommand('remove-steering',{id:removeSteer})}catch(err){showSteeringError(err)} return;}
  const startNext=e.target.closest('[data-start-next-iteration]');
  if(startNext){try{await postCommand('start-next-iteration',{runId:model.state?.currentRunId||model.selectedRunId,objective:currentObjective(model.control||{},(model.queue?.items||[]).find(x=>x.id===model.control?.pinnedQueueItemId)||null)})}catch(err){showSteeringError(err)} return;}
  const cont=e.target.closest('[data-continue-run]')?.dataset.continueRun;
  if(cont){try{await postCommand('continue-from-iteration',{runId:cont,objective:`Continue improving run ${cont}`})}catch(err){showSteeringError(err)} return;}
  const fork=e.target.closest('[data-fork-run]')?.dataset.forkRun;
  if(fork){const change=prompt('Change request for forked iteration?','Try a bounded alternate direction while preserving tests, evidence, accessibility, and repo continuity.'); if(change!==null)try{await postCommand('fork-from-iteration',{runId:fork,change,objective:`Fork run ${fork} with operator change`})}catch(err){showSteeringError(err)} return;}
  const useRun=e.target.closest('[data-use-run-direction]')?.dataset.useRunDirection;
  if(useRun){try{await postCommand('use-as-next-direction',{runId:useRun,objective:`Use run ${useRun} as the next baseline direction`})}catch(err){showSteeringError(err)} return;}
  const useQueue=e.target.closest('[data-use-queue-direction]')?.dataset.useQueueDirection;
  if(useQueue){try{await postCommand('start-next-iteration',{queueItemId:useQueue})}catch(err){showSteeringError(err)} return;}
  const gatePass=e.target.closest('[data-gate-pass]')?.dataset.gatePass;
  if(gatePass){try{await postCommand('gate-decision',{gateId:gatePass,status:'passed',decision:'accepted',runId:model.selectedRunId})}catch(err){showSteeringError(err)} return;}
  const gateNeeds=e.target.closest('[data-gate-needs-evidence]')?.dataset.gateNeedsEvidence;
  if(gateNeeds){try{await postCommand('gate-decision',{gateId:gateNeeds,status:'needs-evidence',decision:'defer',runId:model.selectedRunId})}catch(err){showSteeringError(err)} return;}
  const arc=e.target.closest('[data-archive-queue]')?.dataset.archiveQueue;
  if(arc){
    try{await postCommand('archive-queue-item',{id:arc})}
    catch(err){showSteeringError(err)}
    return;
  }
});
document.querySelectorAll('[data-inspector]').forEach(b=>b.onclick=()=>{model.inspector=b.dataset.inspector;setPref('hermes.apb.dashboard.inspectorTab',model.inspector);renderInspector()});
document.querySelectorAll('[data-console]').forEach(b=>b.onclick=()=>{model.console=b.dataset.console;setPref('hermes.apb.dashboard.consoleTab',model.console);renderConsole()});
if($('followConsole')){$('followConsole').textContent=model.followConsole?'Follow: on':'Follow: off';$('followConsole').onclick=()=>{model.followConsole=!model.followConsole;setPref('hermes.apb.dashboard.followConsole',model.followConsole);$('followConsole').textContent=model.followConsole?'Follow: on':'Follow: off'; if(model.followConsole)scrollBottom($('consoleContent'))}};
if($('refreshNow')) $('refreshNow').onclick=refresh;
if($('pauseEvents')) $('pauseEvents').onclick=()=>{model.paused=!model.paused;setPref('hermes.apb.dashboard.pauseRealtime',model.paused);renderTop()};
if($('globalFilter')) $('globalFilter').oninput=e=>{model.query=e.target.value;renderConsole()};
document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{model.filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));renderAll()});
if($('collapseAllAgents')) $('collapseAllAgents').onclick=()=>{model.expanded.clear();setPref('hermes.apb.dashboard.expandedAgents',[]);renderAgentStack()};
if($('expandActiveAgents')) $('expandActiveAgents').onclick=()=>{for(const a of agents())if(!terminalStates.has(a.status)||a.status==='blocked')model.expanded.add(a.id);setPref('hermes.apb.dashboard.expandedAgents',[...model.expanded]);renderAgentStack()};

function initResize(){document.documentElement.style.setProperty('--console-h',model.bottomConsoleHeight); const h=$('bottomResizeHandle'); if(!h)return; let dragging=false; h.addEventListener('pointerdown',e=>{dragging=true;h.setPointerCapture(e.pointerId);document.body.style.cursor='row-resize'}); h.addEventListener('pointermove',e=>{if(!dragging)return; const vh=window.innerHeight; const px=Math.min(Math.max(vh-e.clientY,120),Math.floor(vh*0.72)); const val=px+'px'; model.bottomConsoleHeight=val; setPref('hermes.apb.dashboard.bottomConsoleHeight',val); document.documentElement.style.setProperty('--console-h',val)}); h.addEventListener('pointerup',()=>{dragging=false;document.body.style.cursor=''})}

window.addEventListener('keydown',e=>{if(e.key==='/'&&document.activeElement!==$('globalFilter')){e.preventDefault();$('globalFilter')?.focus()} if(e.key==='Escape'){$('detailDrawer')&&($('detailDrawer').hidden=true)}});
initGlobalDelegation(); initResize(); refresh(); connect();
