import {
  createDashboardClient,
  WORKFLOW_PHASES,
  OPERATION_COMMANDS,
  PROJECT_PLAN_ACTIONS
} from "../../headless-dashboard-client.js";

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const json = (value) => { try { return JSON.stringify(value, null, 2); } catch { return String(value); } };
const arr = (value) => Array.isArray(value) ? value : [];
const values = (value) => Array.isArray(value) ? value : value && typeof value === "object" ? Object.values(value) : [];
const lines = (value) => String(value || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
const idOf = (value, fallback = "unknown") => value?.id || value?.runId || value?.planId || value?.name || fallback;
const client = createDashboardClient({ maxEvents: 800, eventLimit: 300, pollIntervalMs: 4000, sseRefreshIntervalMs: 15000 });

let snapshot = client.getSnapshot();
let entities = [];
let entityKind = "all";
let selectedEntityKey = null;
let visualFrozen = matchMedia("(prefers-reduced-motion: reduce)").matches;
let activeWorkspace = null;
let operationTab = "control";
let evidenceTab = "summary";
let planTab = "plans";
let selectedPlanId = null;
let selectedAssistanceId = null;
let draftOverride = null;
let resourceRunId = null;
let resourceText = "";
let resourceTitle = "No resource loaded";
let pendingConfirmation = null;
let commandSequence = 0;
const commandRecords = [];
const workspaceDrafts = new Map();
const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
let motionUserOverride = false;

function announce(message) { $("liveStatus").textContent = message; }
function formatTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleTimeString([], { hour12: false });
}
function formatDate(value) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleString();
}
function itemName(item) { return typeof item === "string" ? item : item?.name || item?.path || item?.id || "unnamed"; }
function currentBlocker(snap = snapshot) { return snap.state?.blocker || snap.state?.block || snap.state?.hold || null; }
function blockerText(blocker) { return typeof blocker === "string" ? blocker : blocker?.message || blocker?.reason || blocker?.description || json(blocker); }
function selectedRun() { return snapshot.selectedRun?.run || snapshot.runs.find((run) => idOf(run) === snapshot.selectedRunId) || null; }
function selectedAgent() {
  const selected = entities.find((entity) => entity.key === selectedEntityKey && entity.kind === "agent");
  return selected?.source || null;
}
function selectedIterationId(item) { return item?.id || item?.runId || item?.iterationId; }
function first(...items) { return items.find((item) => item !== undefined && item !== null && item !== "") ?? ""; }
function currentRunId() { return snapshot.state?.currentRunId || null; }
function currentObjective() {
  const pinned = arr(snapshot.queue?.items).find((item) => item.id === snapshot.control?.pinnedQueueItemId);
  return first(snapshot.control?.currentObjective?.text, pinned?.objective, snapshot.state?.objective, snapshot.state?.task);
}
function canonicalLimits(source = {}, maxIterations = 1) {
  const integer = (key, fallback, min, max) => Math.min(max, Math.max(min, Number.isInteger(Number(source[key])) ? Number(source[key]) : fallback));
  const maxVariantsPerIteration = integer("maxVariantsPerIteration", 3, 1, 5);
  return {
    maxIterations: integer("maxIterations", maxIterations, 1, 10),
    maxVariantsPerIteration,
    maxParallelVariants: Math.min(maxVariantsPerIteration, integer("maxParallelVariants", 3, 1, 5)),
    maxAcceptedFeatures: integer("maxAcceptedFeatures", 4, 1, 4),
    maxVisualMotifChanges: integer("maxVisualMotifChanges", 1, 0, 1),
    maxNewSections: integer("maxNewSections", 1, 0, 1),
    stopAfterNoImprovement: integer("stopAfterNoImprovement", 1, 1, 3)
  };
}
function iterationLimits(source = {}, maxIterations = 1) {
  const base = canonicalLimits(source, maxIterations);
  const target = Math.min(10, Math.max(1, Number(source.targetGenerations || base.maxIterations)));
  const score = Number(source.minImprovementScore);
  return { ...base, maxIterations: target, targetGenerations: target, minImprovementScore: Number.isFinite(score) ? Math.min(1, Math.max(0, score)) : 0.05 };
}
function gateSnapshot(gate) {
  const requiredEvidence = arr(gate?.requiredEvidence).map(String).filter(Boolean);
  return { id: String(gate?.id || ""), description: String(gate?.description || gate?.title || ""), severity: gate?.severity === "should" ? "should" : "must", required: typeof gate?.required === "boolean" ? gate.required : requiredEvidence.length > 0, requiredEvidence };
}
function iterationContext(source = {}) {
  const id = selectedIterationId(source);
  const detail = id && snapshot.iterationDetail && [snapshot.iterationDetail.id, snapshot.iterationDetail.runId, snapshot.selectedIterationId].includes(id) ? snapshot.iterationDetail : {};
  const state = detail.iterationState || {};
  const sourceGates = arr(state.acceptanceGates).length ? state.acceptanceGates : source.acceptanceGates;
  const gates = arr(sourceGates).map(gateSnapshot).filter((gate) => gate.id);
  const sourceGateIds = arr(state.acceptanceGateIds).length ? state.acceptanceGateIds : arr(source.acceptanceGateIds).length ? source.acceptanceGateIds : gates.map((gate) => gate.id);
  const sourceLimits = state.limits && Object.keys(state.limits).length ? state.limits : source.limits && Object.keys(source.limits).length ? source.limits : {};
  return {
    sourceRunId: first(source.runId, source.sourceRunId, state.runId), sourceIterationId: first(source.id, source.iterationId, state.id),
    repoPath: first(source.repoPath, state.repoPath, snapshot.control?.autoIteration?.repoPath, snapshot.state?.repoPath),
    baseRef: first(source.baseRef, source.commit, state.baseRef, "HEAD"), objective: first(source.objective, state.objective, currentObjective()),
    changeText: first(source.nextRecommendedDirection, source.steeringText, state.changeText, "Complete one bounded objective-linked change without unrelated feature or stack churn."),
    acceptanceGateIds: arr(sourceGateIds), snapshottedAcceptanceGates: gates, limits: iterationLimits(sourceLimits)
  };
}
function buildIterationPayload(type, source = {}, overrides = {}) {
  const context = { ...iterationContext(source), ...overrides };
  const gateIds = arr(context.acceptanceGateIds).map(String).filter(Boolean);
  const gateMap = new Map([...arr(context.snapshottedAcceptanceGates), ...arr(snapshot.gates?.gates).filter((gate) => gateIds.includes(String(gate.id)))].map((gate) => [String(gate.id), gateSnapshot(gate)]));
  const payload = {
    sourceRunId: context.sourceRunId || null, sourceIterationId: context.sourceIterationId || null,
    repoPath: String(context.repoPath || "").trim(), baseRef: String(context.baseRef || "HEAD").trim(),
    objective: String(context.objective || "").trim(), changeText: String(context.changeText || "").trim(),
    acceptanceGateIds: gateIds,
    snapshottedAcceptanceGates: [...gateMap.values()].filter((gate) => gate.id),
    limits: iterationLimits(context.limits), sourceEvidencePolicy: "load-from-source-run"
  };
  if (context.queueItemId) payload.queueItemId = context.queueItemId;
  if (!payload.repoPath.startsWith("/")) throw new Error("Iteration repository path must be absolute.");
  if (!payload.baseRef || !payload.objective || !payload.changeText) throw new Error("Iteration base ref, objective, and bounded change are required.");
  if (["continue-from-iteration", "fork-from-iteration", "use-as-next-direction"].includes(type) && !payload.sourceIterationId && !payload.sourceRunId) throw new Error("Historical lineage requires a source iteration or run.");
  return payload;
}
function buildQueueIterationPayload(item) {
  if (!item) throw new Error("Queue item is no longer available. Refresh the queue.");
  const allGates = arr(snapshot.gates?.gates).filter((gate) => arr(item.acceptanceGateIds).includes(gate.id)).map(gateSnapshot);
  return buildIterationPayload("start-next-iteration", {}, {
    queueItemId: item.id, sourceRunId: null, sourceIterationId: null,
    repoPath: first(item.target?.preferredRepo, item.preferredRepo, snapshot.control?.autoIteration?.repoPath, snapshot.state?.repoPath),
    baseRef: first(item.target?.baseRef, "HEAD"), objective: item.objective,
    changeText: first(item.context, `Complete one bounded generation for ${item.title || item.id}.`),
    acceptanceGateIds: arr(item.acceptanceGateIds), snapshottedAcceptanceGates: allGates,
    limits: iterationLimits(item.limits || snapshot.control?.autoIteration || {})
  });
}

function field(label, value, options = {}) {
  const wide = options.wide ? " wide" : "";
  if (options.textarea) return `<label class="field${wide}">${esc(label)}<textarea name="${esc(options.name || label)}" ${options.required ? "required" : ""}>${esc(value || "")}</textarea></label>`;
  if (options.select) return `<label class="field${wide}">${esc(label)}<select name="${esc(options.name || label)}">${options.select.map(([key, text]) => `<option value="${esc(key)}" ${key === value ? "selected" : ""}>${esc(text)}</option>`).join("")}</select></label>`;
  return `<label class="field${wide}">${esc(label)}<input name="${esc(options.name || label)}" type="${options.type || "text"}" value="${esc(value || "")}" ${options.required ? "required" : ""}></label>`;
}
function dataPairs(value, limit = 8) {
  if (!value || typeof value !== "object") return `<p class="empty">No authoritative values reported.</p>`;
  return `<dl>${Object.entries(value).slice(0, limit).map(([key, child]) => `<div class="kv"><dt>${esc(key)}</dt><dd>${esc(typeof child === "object" ? json(child) : child)}</dd></div>`).join("")}</dl>`;
}

// Raw WebGL2 instanced cube renderer. CPU particles are a separate bounded point pass.
class FoundryRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = null;
    this.resources = null;
    this.scene = [];
    this.particles = [];
    this.lost = false;
    this.yaw = -0.72;
    this.pitch = 0.62;
    this.distance = 30;
    this.drag = null;
    this.lastFrame = 0;
    this.raf = 0;
    this.boundLoop = (time) => this.loop(time);
    this.bindEvents();
    this.initialize();
  }
  bindEvents() {
    this.canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      this.lost = true;
      cancelAnimationFrame(this.raf);
      $("contextNotice").hidden = false;
      $("gpuStatus").textContent = "CONTEXT LOST";
      announce("3D graphics context lost. Semantic cell remains available.");
    });
    this.canvas.addEventListener("webglcontextrestored", () => {
      this.lost = false;
      this.initialize(true);
      announce("3D graphics context restored and cell rebuilt.");
    });
    this.canvas.addEventListener("pointerdown", (event) => {
      this.canvas.setPointerCapture(event.pointerId);
      this.drag = { x: event.clientX, y: event.clientY, moved: false };
    });
    this.canvas.addEventListener("pointermove", (event) => {
      if (!this.drag) return;
      const dx = event.clientX - this.drag.x;
      const dy = event.clientY - this.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) this.drag.moved = true;
      this.yaw += dx * 0.007;
      this.pitch = Math.max(0.18, Math.min(1.28, this.pitch + dy * 0.006));
      this.drag.x = event.clientX;
      this.drag.y = event.clientY;
    });
    this.canvas.addEventListener("pointerup", (event) => {
      if (this.drag && !this.drag.moved) this.pick(event.clientX, event.clientY);
      this.drag = null;
    });
    this.canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      this.distance = Math.max(16, Math.min(52, this.distance + event.deltaY * 0.02));
    }, { passive: false });
    this.canvas.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") this.yaw -= 0.12;
      else if (event.key === "ArrowRight") this.yaw += 0.12;
      else if (event.key === "ArrowUp") this.pitch = Math.max(.18, this.pitch - .1);
      else if (event.key === "ArrowDown") this.pitch = Math.min(1.28, this.pitch + .1);
      else if (event.key === "+" || event.key === "=") this.distance = Math.max(16, this.distance - 2);
      else if (event.key === "-") this.distance = Math.min(52, this.distance + 2);
      else return;
      event.preventDefault();
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && !this.raf && !this.lost) this.raf = requestAnimationFrame(this.boundLoop);
    });
  }
  initialize(restored = false) {
    const gl = this.canvas.getContext("webgl2", { alpha: true, antialias: true, depth: true, powerPreference: "high-performance" });
    if (!gl) {
      $("contextNotice").hidden = false;
      $("contextNotice").textContent = "WebGL2 is unavailable. Use the complete semantic cell inventory and workstations.";
      $("gpuStatus").textContent = "WEBGL2 UNAVAILABLE";
      return;
    }
    this.gl = gl;
    try {
      this.resources = this.createResources(gl);
      this.uploadScene();
      $("contextNotice").hidden = true;
      $("gpuStatus").textContent = restored ? "WEBGL2 RESTORED" : "WEBGL2 INSTANCING";
      cancelAnimationFrame(this.raf);
      this.raf = requestAnimationFrame(this.boundLoop);
    } catch (error) {
      $("contextNotice").hidden = false;
      $("contextNotice").textContent = `Renderer initialization failed: ${error.message}`;
      $("gpuStatus").textContent = "RENDERER FAILED";
    }
  }
  shader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || "Shader compilation failed");
    return shader;
  }
  program(vertex, fragment) {
    const gl = this.gl;
    const program = gl.createProgram();
    const vs = this.shader(gl.VERTEX_SHADER, vertex);
    const fs = this.shader(gl.FRAGMENT_SHADER, fragment);
    gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "Shader link failed");
    return program;
  }
  createResources(gl) {
    const cubeVS = `#version 300 es
      layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNormal;
      layout(location=2) in vec3 iPosition; layout(location=3) in vec3 iScale;
      layout(location=4) in vec4 iColor; layout(location=5) in uint iId;
      uniform mat4 uVP; uniform float uTime; uniform bool uFrozen; out vec3 vNormal; out vec4 vColor; flat out uint vId;
      void main(){ vec3 p=aPos*iScale+iPosition; if(iColor.a>.90&&iColor.a<.94&&!uFrozen)p.z+=fract(uTime*.035+float(iId)*.071)*1.25; gl_Position=uVP*vec4(p,1.0); vNormal=aNormal; vColor=iColor; vId=iId; }`;
    const cubeFS = `#version 300 es
      precision highp float; in vec3 vNormal; in vec4 vColor; flat in uint vId; uniform uint uSelected; uniform bool uPick; out vec4 outColor;
      void main(){ if(uPick){ uint id=vId; outColor=vec4(float(id&255u),float((id>>8)&255u),float((id>>16)&255u),255.0)/255.0; return; }
        float light=.35+.65*max(dot(normalize(vNormal),normalize(vec3(.45,.8,.35))),0.0); vec3 c=vColor.rgb*light; if(vId==uSelected)c=mix(c,vec3(1.0,.92,.45),.65); outColor=vec4(c,vColor.a); }`;
    const pointVS = `#version 300 es
      layout(location=0) in vec3 aPosition; layout(location=1) in float aSeed; uniform mat4 uVP; uniform float uTime; uniform bool uFrozen; out float vLife;
      void main(){ float t=uFrozen?0.35:fract(uTime*.22+aSeed); vec3 p=aPosition+vec3(sin(aSeed*31.0)*t*1.8,t*3.2,cos(aSeed*23.0)*t*1.5); gl_Position=uVP*vec4(p,1.0); gl_PointSize=2.0+3.0*(1.0-t); vLife=1.0-t; }`;
    const pointFS = `#version 300 es
      precision mediump float; in float vLife; out vec4 outColor; void main(){ vec2 q=gl_PointCoord-.5; if(dot(q,q)>.25)discard; outColor=vec4(1.0,.46,.08,vLife); }`;
    const cubeProgram = this.program(cubeVS, cubeFS);
    const pointProgram = this.program(pointVS, pointFS);
    const positions = new Float32Array([
      -1,-1,1, 1,-1,1, 1,1,1, -1,1,1, 1,-1,-1, -1,-1,-1, -1,1,-1, 1,1,-1,
      -1,1,1, 1,1,1, 1,1,-1, -1,1,-1, -1,-1,-1, 1,-1,-1, 1,-1,1, -1,-1,1,
      1,-1,1, 1,-1,-1, 1,1,-1, 1,1,1, -1,-1,-1, -1,-1,1, -1,1,1, -1,1,-1
    ]);
    const normals = new Float32Array([...[0,0,1],...[0,0,1],...[0,0,1],...[0,0,1],...[0,0,-1],...[0,0,-1],...[0,0,-1],...[0,0,-1],...[0,1,0],...[0,1,0],...[0,1,0],...[0,1,0],...[0,-1,0],...[0,-1,0],...[0,-1,0],...[0,-1,0],...[1,0,0],...[1,0,0],...[1,0,0],...[1,0,0],...[-1,0,0],...[-1,0,0],...[-1,0,0],...[-1,0,0]]);
    const indices = new Uint16Array([0,1,2,0,2,3,4,5,6,4,6,7,8,9,10,8,10,11,12,13,14,12,14,15,16,17,18,16,18,19,20,21,22,20,22,23]);
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const pos = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,pos); gl.bufferData(gl.ARRAY_BUFFER,positions,gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,0,0);
    const normal = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,normal); gl.bufferData(gl.ARRAY_BUFFER,normals,gl.STATIC_DRAW); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,3,gl.FLOAT,false,0,0);
    const index = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,index); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,indices,gl.STATIC_DRAW);
    const instance = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,instance); gl.bufferData(gl.ARRAY_BUFFER,384*44,gl.DYNAMIC_DRAW);
    const stride=44; gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2,3,gl.FLOAT,false,stride,0); gl.vertexAttribDivisor(2,1);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3,3,gl.FLOAT,false,stride,12); gl.vertexAttribDivisor(3,1);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4,4,gl.FLOAT,false,stride,24); gl.vertexAttribDivisor(4,1);
    gl.enableVertexAttribArray(5); gl.vertexAttribIPointer(5,1,gl.UNSIGNED_INT,stride,40); gl.vertexAttribDivisor(5,1);
    const particleVao=gl.createVertexArray(); gl.bindVertexArray(particleVao); const particle=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,particle); gl.bufferData(gl.ARRAY_BUFFER,160*16,gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,16,0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,1,gl.FLOAT,false,16,12);
    const pickFb=gl.createFramebuffer(), pickTexture=gl.createTexture(), pickDepth=gl.createRenderbuffer();
    gl.bindTexture(gl.TEXTURE_2D,pickTexture); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER,pickFb); gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,pickTexture,0); gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,pickDepth);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null); gl.bindVertexArray(null);
    return { cubeProgram,pointProgram,vao,instance,particleVao,particle,pickFb,pickTexture,pickDepth,pickW:0,pickH:0,pickReady:false };
  }
  setScene(next, sparks) { this.scene = next.slice(0,384); this.particles = sparks.slice(0,160); this.uploadScene(); }
  uploadScene() {
    if (!this.gl || !this.resources || this.lost) return;
    const gl=this.gl, data=new ArrayBuffer(this.scene.length*44), view=new DataView(data);
    this.scene.forEach((item,index)=>{ const base=index*44; [...item.position,...item.scale,...item.color].forEach((value,i)=>view.setFloat32(base+i*4,value,true)); view.setUint32(base+40,item.pickId,true); });
    gl.bindBuffer(gl.ARRAY_BUFFER,this.resources.instance); gl.bufferSubData(gl.ARRAY_BUFFER,0,new Uint8Array(data));
    const points=new Float32Array(this.particles.length*4); this.particles.forEach((point,index)=>points.set([...point.position,point.seed],index*4)); gl.bindBuffer(gl.ARRAY_BUFFER,this.resources.particle); gl.bufferSubData(gl.ARRAY_BUFFER,0,points);
  }
  resetView(){this.yaw=-.72;this.pitch=.62;this.distance=30;}
  resize() {
    const gl=this.gl, rect=this.canvas.getBoundingClientRect(), dpr=Math.min(devicePixelRatio||1,1.75), scale=Math.min(1,2560/(rect.width*dpr),1440/(rect.height*dpr));
    const width=Math.max(1,Math.floor(rect.width*dpr*scale)), height=Math.max(1,Math.floor(rect.height*dpr*scale));
    if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;}
  }
  vp() {
    const aspect=this.canvas.width/this.canvas.height, f=1/Math.tan(.52), nf=1/(.1-100), p=new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(100+.1)*nf,-1,0,0,2*100*.1*nf,0]);
    const eye=[Math.sin(this.yaw)*Math.cos(this.pitch)*this.distance,Math.sin(this.pitch)*this.distance,Math.cos(this.yaw)*Math.cos(this.pitch)*this.distance], target=[0,2,0], up=[0,1,0];
    const z=norm(sub(eye,target)), x=norm(cross(up,z)), y=cross(z,x), v=new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]); return multiply(p,v);
  }
  draw(time,picking=false) {
    const gl=this.gl,r=this.resources,vp=this.vp(); gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.disable(gl.BLEND);gl.clearColor(.025,.035,.027,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(r.cubeProgram);gl.bindVertexArray(r.vao);gl.uniformMatrix4fv(gl.getUniformLocation(r.cubeProgram,"uVP"),false,vp);gl.uniform1f(gl.getUniformLocation(r.cubeProgram,"uTime"),time*.001);gl.uniform1i(gl.getUniformLocation(r.cubeProgram,"uFrozen"),visualFrozen);gl.uniform1ui(gl.getUniformLocation(r.cubeProgram,"uSelected"),entities.findIndex(e=>e.key===selectedEntityKey)+1);gl.uniform1i(gl.getUniformLocation(r.cubeProgram,"uPick"),picking);gl.drawElementsInstanced(gl.TRIANGLES,36,gl.UNSIGNED_SHORT,0,this.scene.length);
    if(!picking&&this.particles.length){gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.disable(gl.CULL_FACE);gl.useProgram(r.pointProgram);gl.bindVertexArray(r.particleVao);gl.uniformMatrix4fv(gl.getUniformLocation(r.pointProgram,"uVP"),false,vp);gl.uniform1f(gl.getUniformLocation(r.pointProgram,"uTime"),time*.001);gl.uniform1i(gl.getUniformLocation(r.pointProgram,"uFrozen"),visualFrozen);gl.drawArrays(gl.POINTS,0,this.particles.length);}
  }
  loop(time) {
    this.raf=0;if(document.hidden||this.lost||!this.gl)return;const interval=visualFrozen?80:33;if(time-this.lastFrame>=interval){this.resize();this.gl.bindFramebuffer(this.gl.FRAMEBUFFER,null);this.gl.viewport(0,0,this.canvas.width,this.canvas.height);this.draw(time);this.lastFrame=time;}this.raf=requestAnimationFrame(this.boundLoop);
  }
  pick(clientX,clientY) {
    const gl=this.gl,r=this.resources;if(!gl||this.lost||gl.isContextLost())return;this.resize();
    if(r.pickW!==this.canvas.width||r.pickH!==this.canvas.height){
      r.pickW=Math.max(1,Math.min(2560,this.canvas.width));r.pickH=Math.max(1,Math.min(1440,this.canvas.height));
      gl.bindTexture(gl.TEXTURE_2D,r.pickTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,r.pickW,r.pickH,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      gl.bindRenderbuffer(gl.RENDERBUFFER,r.pickDepth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,r.pickW,r.pickH);
      gl.bindFramebuffer(gl.FRAMEBUFFER,r.pickFb);r.pickReady=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
    }else gl.bindFramebuffer(gl.FRAMEBUFFER,r.pickFb);
    if(!r.pickReady){gl.bindFramebuffer(gl.FRAMEBUFFER,null);announce("GPU picking framebuffer is unavailable; use the semantic inventory.");return;}
    const rect=this.canvas.getBoundingClientRect();if(rect.width<=0||rect.height<=0){gl.bindFramebuffer(gl.FRAMEBUFFER,null);return;}
    const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
    const x=clamp(Math.floor((clientX-rect.left)*r.pickW/rect.width),0,r.pickW-1),y=clamp(Math.floor((rect.bottom-clientY)*r.pickH/rect.height),0,r.pickH-1);
    gl.viewport(0,0,r.pickW,r.pickH);this.draw(performance.now(),true);const pixel=new Uint8Array(4);gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    const id=pixel[0]+(pixel[1]<<8)+(pixel[2]<<16),entity=entities[id-1];if(entity)selectEntity(entity.key,true);
  }
}
const sub=(a,b)=>a.map((v,i)=>v-b[i]);const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];const norm=(a)=>{const l=Math.hypot(...a)||1;return a.map(v=>v/l);};
function multiply(a,b){const out=new Float32Array(16);for(let c=0;c<4;c++)for(let row=0;row<4;row++)out[c*4+row]=a[row]*b[c*4]+a[4+row]*b[c*4+1]+a[8+row]*b[c*4+2]+a[12+row]*b[c*4+3];return out;}

const renderer = new FoundryRenderer($("foundryCanvas"));

function rebuildEntities() {
  const next=[];
  const add=(kind,key,label,summary,source,position,scale,color)=>next.push({kind,key:`${kind}:${key}`,label,summary,source,position,scale,color});
  snapshot.runs.slice(0,18).forEach((run,index)=>{const id=idOf(run,`run-${index}`),x=-7+(index%6)*2.7,z=-3+Math.floor(index/6)*2.8;add("run",id,id,`${run.status||run.phase||"unknown"} / ${run.objective||run.task||run.project||"No objective reported"}`,run,[x,.5,z],[1.05,.5,1.05],run.status==="completed"?[.22,.68,.34,.92]:[.16,.52,.62,.92]);});
  values(snapshot.state?.agents).slice(0,16).forEach((agent,index)=>{const id=idOf(agent,`agent-${index}`),x=-8+(index%8)*2.25;add("agent",id,agent.label||id,`${agent.role||"Agent"} / ${agent.currentTask||agent.task||agent.status||"No task reported"}`,agent,[x,4.3,-6+(index%2)*1.2],[.55,.9,.55],[.95,.46,.09,1]);});
  arr(snapshot.gates?.gates).slice(0,12).forEach((gate,index)=>{const id=idOf(gate,`gate-${index}`),x=-7.5+(index%6)*3;add("gate",id,gate.name||gate.title||id,`${gate.status||"pending"} / ${gate.description||"No criterion reported"}`,gate,[x,2,5.3],[.25,2,.25],gate.status==="failed"?[.85,.12,.1,1]:[.7,.62,.18,1]);});
  arr(snapshot.queue?.items).slice(0,18).forEach((item,index)=>{const id=idOf(item,`queue-${index}`),x=7.4-(index%4)*1.35,z=-2+Math.floor(index/4)*1.25;add("queue",id,item.title||id,`${item.status||"queued"} / ${item.objective||"No objective reported"}`,item,[x,.28,z],[.58,.28,.58],[.52,.34,.15,1]);});
  const blocker=currentBlocker();if(blocker)add("blocker",idOf(blocker,"active"),"Active quarantine",blockerText(blocker),blocker,[0,2.2,0],[3.7,2.2,2.8],[.95,.08,.06,.62]);
  entities=next.slice(0,80);
  const scene=[];entities.forEach((entity,index)=>{const copies=entity.kind==="run"?5:entity.kind==="gate"?3:entity.kind==="agent"?2:entity.kind==="blocker"?8:1;for(let c=0;c<copies;c++){let p=[...entity.position],s=[...entity.scale];if(entity.kind==="run"){p[0]+=(c%3-1)*.62;p[1]+=.55*Math.floor(c/3);p[2]+=(c%2)*.4;s=[.46,.46,.46];}else if(entity.kind==="gate"){p[0]+=(c===0?-1:c===1?1:0)*1.05;p[1]=c===2?4:2;s=c===2?[1.3,.22,.25]:[.22,2,.25];}else if(entity.kind==="agent"){p[1]+=c*.9;s=c?[.22,.55,.22]:[.55,.35,.55];}else if(entity.kind==="blocker"){p=[(c&1?1:-1)*3.7,(c&2?1:0)*4.4,(c&4?1:-1)*2.8];s=[.22,c&2?.22:2.2,.22];}scene.push({...entity,position:p,scale:s,pickId:index+1});}});
  const sparks=snapshot.events.slice(-40).map((event,index)=>({position:[-4+(index%9),1+(index%3)*.25,-1+((index*7)%8)*.35],seed:((hash(event.id||index)%997)/997)}));
  renderer.setScene(scene,sparks);$("frameStatus").textContent=`${entities.length} ENTITIES / ${scene.length} VOXELS`;
  if(selectedEntityKey&&!entities.some(entity=>entity.key===selectedEntityKey))selectedEntityKey=null;
}
function hash(value){let h=2166136261;for(const char of String(value)){h^=char.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}

function renderHeader() {
  const connection=snapshot.connection||{}, badge=$("connectionBadge"), sample=connection.lastMessageAt||connection.lastRefreshAt, age=sample?Date.now()-new Date(sample).valueOf():Infinity, stale=age>15000;
  badge.textContent=connection.paused?"DATA FROZEN":String(connection.status||"disconnected").toUpperCase();badge.className=`badge ${connection.paused?"paused":connection.status||"disconnected"}`;
  $("transportBadge").textContent=`TRANSPORT ${(connection.transport||"--").toUpperCase()}`;$("freshnessBadge").textContent=!sample?"NO SAMPLE":stale?`STALE ${Math.floor(age/1000)}s`:`FRESH ${Math.floor(age/1000)}s`;$("freshnessBadge").className=`readout ${stale?"stale":""}`;
  $("phaseBadge").textContent=String(snapshot.state?.phase||"idle").toUpperCase();$("freezeData").textContent=connection.paused?"Resume data":"Freeze data";$("freezeVisual").textContent=visualFrozen?"Resume motion":"Freeze motion";
}
function renderPhases(){const index=WORKFLOW_PHASES.indexOf(snapshot.state?.phase||"idle");$("phaseRail").innerHTML=WORKFLOW_PHASES.map((phase,i)=>`<span class="phase-step ${i<index?"done":i===index?"current":""}" role="listitem" ${i===index?'aria-current="step"':""}>${esc(phase)}</span>`).join("");}
function renderControl() {
  const control=snapshot.control||{},state=snapshot.state||{};
  const requested={pause:control.pause?.requested??control.requestedPause??control.paused??"not reported",hold:control.hold?.requested??control.requestedHold??control.hold??"not reported",objective:control.currentObjective?.text??control.requestedObjective??"not reported",showcase:control.autoIteration?.status??control.showcase?.requestedState??"not reported"};
  const observed={phase:state.phase??"not reported",run:state.currentRunId??"not reported",hold:state.hold??"not reported",blocker:currentBlocker()?"quarantined":"clear"};
  $("controlComparison").innerHTML=`<section class="state-column"><h3>Requested intent</h3>${dataPairs(requested)}</section><section class="state-column"><h3>Observed process</h3>${dataPairs(observed)}</section>`;
}
function renderEntityDetail(){const entity=entities.find(item=>item.key===selectedEntityKey);if(!entity){$("entityDetail").innerHTML='<p class="empty">Select an object in the cell or semantic inventory.</p>';return;}const extra=entity.kind==="run"&&idOf(entity.source)===snapshot.selectedRunId?`<div class="button-row"><button data-open="evidence">Inspect authoritative resources</button></div>`:"";$("entityDetail").innerHTML=`<p class="detail-title">${esc(entity.label)}</p><p class="hint">${esc(entity.kind.toUpperCase())} / ${esc(entity.summary)}</p>${dataPairs(entity.source,10)}${extra}`;}
function renderEntityList(){const kinds=["all","run","agent","gate","queue","blocker"].map(kind=>[kind,kind==="all"?entities.length:entities.filter(e=>e.kind===kind).length]);$("entityTabs").innerHTML=kinds.map(([kind,count])=>`<button id="entity-tab-${kind}" role="tab" aria-selected="${kind===entityKind}" aria-controls="entityList" tabindex="${kind===entityKind?0:-1}" data-kind="${kind}">${kind} ${count}</button>`).join("");$("entityList").setAttribute("aria-labelledby",`entity-tab-${entityKind}`);const list=entityKind==="all"?entities:entities.filter(e=>e.kind===entityKind);$("entityList").innerHTML=list.length?list.map(entity=>`<button class="entity-row" role="option" aria-selected="${entity.key===selectedEntityKey}" data-entity="${esc(entity.key)}"><strong>${esc(entity.label)}</strong><small>${esc(entity.kind)} / ${esc(entity.summary)}</small></button>`).join(""):'<p class="empty">No entities of this type are reported.</p>';}
function renderEvents(){const query=$("eventFilter").value.toLowerCase(),events=snapshot.events.filter(event=>!query||json(event).toLowerCase().includes(query)).slice(-80).reverse();$("eventCount").textContent=snapshot.events.length;$("eventList").innerHTML=events.map(event=>`<li class="${event.level==="error"?"error":""}"><time datetime="${esc(event.ts)}">${formatTime(event.ts)}</time><b>${esc(event.agentId||event.source||"system")}</b><span>${esc(event.message||event.data?.action||event.data?.toolName||event.type)}</span></li>`).join("")||'<li><span class="empty">No matching events.</span></li>';}
function renderRecovery(){const blocker=currentBlocker();$("blockerSummary").innerHTML=blocker?`<div class="blocker-active"><strong>ACTIVE QUARANTINE</strong><p>${esc(blockerText(blocker))}</p></div>`:'<div class="blocker-clear"><strong>CELL CLEAR</strong><p>No current blocker reported by the authoritative state.</p></div>';$("auditList").innerHTML=arr(snapshot.audit).slice(0,40).map(item=>`<li><time>${esc(formatDate(item.ts||item.at||item.createdAt))}</time> ${esc(item.action||item.type||item.message||json(item))}</li>`).join("")||'<li>No historical audit records returned.</li>';}
function renderAll(){const focusedEntity=document.activeElement?.dataset?.entity,focusedKind=document.activeElement?.dataset?.kind;renderHeader();renderPhases();renderControl();rebuildEntities();renderEntityList();renderEntityDetail();renderEvents();renderRecovery();if(activeWorkspace)renderWorkspace();if(focusedEntity)$("entityList").querySelector(`[data-entity="${CSS.escape(focusedEntity)}"]`)?.focus({preventScroll:true});else if(focusedKind)$("entityTabs").querySelector(`[data-kind="${CSS.escape(focusedKind)}"]`)?.focus({preventScroll:true});}
function selectEntity(key, focus=false){selectedEntityKey=key;const entity=entities.find(item=>item.key===key);if(entity?.kind==="run"){resourceRunId=idOf(entity.source);if(snapshot.selectedRunId!==resourceRunId)client.selectRun(resourceRunId).catch(error=>announce(`Run selection failed: ${error.message}`));}renderEntityList();renderEntityDetail();if(focus)$(`entityList`).querySelector(`[data-entity="${CSS.escape(key)}"]`)?.focus();announce(`${entity?.kind||"Entity"} ${entity?.label||key} selected.`);}

function commandPayloadDefaults(type) {
  const runId=snapshot.selectedRunId||snapshot.state?.currentRunId;
  if(["start-next-iteration","continue-from-iteration","fork-from-iteration","use-as-next-direction"].includes(type)){const source=snapshot.iterations.find((item)=>selectedIterationId(item)===snapshot.selectedIterationId)||{};return buildIterationPayload(type,source);}
  const defaults={"run-now":{runId},steer:{text:"",scope:"current_run",priority:"required"},deblock:{prompt:"",runId:currentRunId()},"deblock-advice":{prompt:"Review the current blocker and propose a safe recovery",runId:currentRunId()},"set-current-objective":{text:""},"start-showcase-loop":{targetGenerations:10},"set-showcase-target":{targetGenerations:10},"gate-decision":{gateId:"",runId:resourceRunId||null,status:"needs-evidence",decision:"defer",evidenceArtifacts:[],notes:""},"attach-gate-evidence":{gateId:"",runId:resourceRunId||null,artifacts:[],notes:""},"add-queue-item":{title:"",objective:"",context:"",constraints:"",priority:50,acceptanceGateIds:[],target:{}},"pin-queue-item":{itemId:""},"archive-queue-item":{itemId:""},"add-gate":{id:"",phase:"final-audit",description:"",severity:"must",requiredEvidence:""},"update-gate":{gateId:"",description:""},"remove-steering":{steeringId:""},"approve-deblock-advice":{adviceId:""},"deny-deblock-advice":{adviceId:""}};
  return Object.fromEntries(Object.entries(defaults[type]||{}).filter(([,value])=>value!==undefined&&value!==null&&value!==""));
}
function reviewCommand(type,payload={},label=type){return new Promise(resolve=>{pendingConfirmation={type,payload,label,resolve};$("confirmTitle").textContent=`Confirm ${label}`;$("confirmSummary").textContent="This request will be sent to the Hermes command API. Requested intent may differ from observed state until authoritative telemetry confirms it.";$("confirmPayload").textContent=json({type,payload});$("confirmExecute").className=["stop","clear-queue","archive-queue-item","deny-deblock-advice"].includes(type)?"danger":"primary";$("confirmDialog").showModal();});}
async function validateDirectRecovery(runId){
  if(!runId||runId!==currentRunId())throw new Error("Direct recovery targets only the current run. Use continuation or fork for historical work.");
  await client.refreshState();snapshot=client.getSnapshot();
  const blocker=currentBlocker(snapshot);
  if(runId!==currentRunId()||!blocker||typeof blocker==="object"&&blocker.runId&&blocker.runId!==runId)throw new Error("The active blocker or current run changed. Recovery was not sent; inspect fresh state or use historical lineage.");
}
async function issueCommand(type,payload={},label=type){
  if(!OPERATION_COMMANDS.includes(type))throw new Error(`Unsupported operation ${type}`);
  const advice=type==="approve-deblock-advice"?arr(snapshot.control?.deblockAdvice).find((item)=>item.id===payload.adviceId):null;
  const recoveryRunId=advice?.runId||payload.runId;
  if(["deblock","deblock-advice","approve-deblock-advice"].includes(type))await validateDirectRecovery(recoveryRunId);
  const approved=await reviewCommand(type,payload,label);if(!approved)return null;
  if(["deblock","deblock-advice","approve-deblock-advice"].includes(type))await validateDirectRecovery(recoveryRunId);
  const record={id:++commandSequence,type,status:"pending",startedAt:new Date().toISOString()};commandRecords.unshift(record);renderCommandLog();announce(`${type} intent pending.`);
  try{const result=await client.command(type,payload,{refresh:true});record.status=result?.status==="accepted"?"accepted":"accepted";record.finishedAt=new Date().toISOString();record.result=result;record.commandId=result?.commandId||null;announce(`${type} intent accepted${record.commandId?` as ${record.commandId}`:""}; verify observed state.`);renderCommandLog();return result;}
  catch(error){record.status=error?.status==null?"outcome-unknown":"rejected";record.finishedAt=new Date().toISOString();record.error=error.message;announce(`${type} intent ${record.status}: ${error.message}`);renderCommandLog();throw error;}
}
async function issuePlanMutation(type,payload,execute){
  const approved=await reviewCommand(type,payload,type);
  if(!approved)return null;
  const record={id:++commandSequence,type,status:"pending",startedAt:new Date().toISOString()};
  commandRecords.unshift(record);renderCommandLog();announce(`${type} pending.`);
  try{const result=await execute();record.status="accepted";record.finishedAt=new Date().toISOString();record.result=result;announce(`${type} accepted; verify plan ledger state.`);renderCommandLog();return result;}
  catch(error){record.status=error?.status==null?"outcome-unknown":"rejected";record.finishedAt=new Date().toISOString();record.error=error.message;announce(`${type} ${record.status}: ${error.message}`);renderCommandLog();throw error;}
}
function renderCommandLog(){$("commandCount").textContent=commandRecords.length;$("commandLog").innerHTML=commandRecords.map(record=>`<li class="${record.status}"><b>#${record.id} ${esc(record.type)}</b> / ${esc(record.status)}${record.commandId?` / receipt ${esc(record.commandId)}`:""}<br><small>${esc(formatTime(record.startedAt))}${record.error?` / ${esc(record.error)}`:""}</small></li>`).join("");}

function workspaceTabs(tabs,active){return `<nav class="workspace-tabs" role="tablist" aria-label="${esc(activeWorkspace||"Workspace")} sections">${tabs.map(([key,label])=>`<button id="workspace-tab-${key}" role="tab" aria-selected="${key===active}" aria-controls="workspace-panel" tabindex="${key===active?0:-1}" data-workspace-tab="${key}" class="${key===active?"primary":""}">${esc(label)}</button>`).join("")}</nav>`;}
function workspaceKey(){return `${activeWorkspace}:${activeWorkspace==="operations"?operationTab:activeWorkspace==="planner"?planTab:activeWorkspace==="evidence"?evidenceTab:"help"}`;}
function datasetIdentity(element){
  const entries=Object.entries(element?.dataset||{}).sort(([a],[b])=>a.localeCompare(b));
  return entries.length?entries.map(([key,value])=>`${key}=${value}`).join("&"):null;
}
function formIdentity(form){
  if(!form)return "standalone";
  for(const key of ["gateId","planId","assistId","runId","sourceId","controlId"])if(form.dataset[key])return `${key}:${form.dataset[key]}`;
  if(form.id==="planForm")return `plan:${selectedPlanId||draftOverride?.pipelineType||"new"}`;
  if(form.id==="assistForm")return `assist:${selectedAssistanceId||snapshot.assistanceDetail?.id||"none"}`;
  if(["deblockForm","adviceForm"].includes(form.id))return `${form.id}:run:${currentRunId()||"none"}`;
  if(form.id==="lineageForm")return `lineage:${snapshot.selectedIterationId||"new"}`;
  if(form.id)return `form:${form.id}`;
  const data=datasetIdentity(form);
  if(data)return `form-data:${data}`;
  throw new Error("Workspace form requires a stable identity");
}
function objectIdentity(element){
  const form=element?.closest?.("form");if(form)return formIdentity(form);
  const object=element?.closest?.("[data-gate-id],[data-id],[data-plan],[data-assist],[data-artifact],[data-log],[data-document],[data-select-iteration],[data-historical-lineage]");
  const data=datasetIdentity(object);if(data)return `object:${data}`;
  if(activeWorkspace==="planner")return `plan:${selectedPlanId||selectedAssistanceId||"register"}`;
  if(activeWorkspace==="evidence")return `run:${resourceRunId||"none"}`;
  if(activeWorkspace==="operations")return `control:${operationTab}`;
  return "standalone";
}
function controlIdentity(control){
  const data=datasetIdentity(control);if(data)return `data:${data}`;
  if(control.id)return `id:${control.id}`;
  if(control.name)return `name:${control.name}${control.value&&["button","submit"].includes(control.type)?`=${control.value}`:""}`;
  return `${control.tagName.toLowerCase()}:${control.type||"control"}`;
}
function workspaceControlKey(control){return `${workspaceKey()}::${objectIdentity(control)}::${controlIdentity(control)}`;}
function saveWorkspaceDraft(){
  if(!activeWorkspace)return;
  for(const control of $("dialogBody").querySelectorAll("input,textarea,select"))workspaceDrafts.set(workspaceControlKey(control),{value:control.value,checked:control.checked});
}
function restoreWorkspaceDraft(){
  for(const control of $("dialogBody").querySelectorAll("input,textarea,select")){const value=workspaceDrafts.get(workspaceControlKey(control));if(value){control.value=value.value;if("checked" in control)control.checked=value.checked;}}
}
function clearWorkspaceDraft(scope){for(const key of [...workspaceDrafts.keys()])if(key.startsWith(`${scope}::`))workspaceDrafts.delete(key);}
function focusToken(){const active=document.activeElement;if(!active||!$("workspaceDialog").contains(active))return null;return {workspace:workspaceKey(),object:objectIdentity(active),control:controlIdentity(active),start:active.selectionStart,end:active.selectionEnd};}
function restoreFocus(token){if(!token||token.workspace!==workspaceKey())return;const candidates=$("workspaceDialog").querySelectorAll("button,input,textarea,select,a,[tabindex]");const node=[...candidates].find((candidate)=>objectIdentity(candidate)===token.object&&controlIdentity(candidate)===token.control);if(node){node.focus({preventScroll:true});if(typeof node.setSelectionRange==="function"&&token.start!=null)node.setSelectionRange(token.start,token.end);}}
function operationWorkspace(){
  const tabs=[["control","Run control"],["recovery","Recovery"],["queue","Feedstock queue"],["gates","Inspection gates"],["showcase","Showcase / lineage"],["advanced","All commands"]];let content="";
  if(operationTab==="control")content=`<div class="card-grid">${[["run-now","Run now","Request immediate execution"],["pause","Pause","Request runner pause"],["resume","Resume","Request runner resume"],["hold","Hold intake","Prevent admission of new runs"],["unhold","Release hold","Allow admission"],["stop","Stop","Request safe runner stop"]].map(([type,title,desc])=>`<article class="card"><h3>${title}</h3><p>${desc}. Observe requested and observed columns after completion.</p><button data-quick-command="${type}" class="${type==="stop"?"danger":""}">${title}</button></article>`).join("")}</div><form id="objectiveForm" data-control-id="current-objective" class="card"><h3>Current objective</h3><p>Publish an authoritative runner objective.</p>${field("Objective",snapshot.control?.currentObjective?.text||"",{name:"text",textarea:true,wide:true,required:true})}<button class="primary">Set objective</button></form><form id="steerForm" data-control-id="steering-create" class="card"><h3>Steering directive</h3><div class="form-grid">${field("Directive","",{name:"text",textarea:true,wide:true,required:true})}${field("Scope","current_run",{name:"scope",select:[["current_run","Current run"],["next_run","Next run"],["queue","Queue"]]})}${field("Priority","required",{name:"priority",select:[["required","Required"],["advisory","Advisory"]]})}</div><button class="primary">Add steering</button></form>`;
  if(operationTab==="recovery"){const blocker=currentBlocker(),advice=arr(snapshot.control?.deblockAdvice||snapshot.control?.advice),historicalRun=resourceRunId&&resourceRunId!==currentRunId()?resourceRunId:null,historicalIteration=snapshot.iterations.find((item)=>item.runId===historicalRun||item.sourceRunId===historicalRun);content=`${blocker?`<div class="blocker-active"><h3>Current blocker / run ${esc(currentRunId()||"none")}</h3><p>${esc(blockerText(blocker))}</p><pre>${esc(json(blocker))}</pre></div>`:'<div class="blocker-clear">No active blocker on the current run. Direct recovery is disabled by validation.</div>'}<div class="card-grid"><form id="deblockForm" class="card"><h3>Current-run recovery</h3><p>Targets only <code>${esc(currentRunId()||"no current run")}</code>. State and blocker are refreshed again before dispatch.</p>${field("Recovery prompt","",{name:"prompt",textarea:true,wide:true,required:true})}<button class="primary" ${blocker&&currentRunId()?"":"disabled"}>Review deblock</button></form><form id="adviceForm" class="card"><h3>Current-run advice</h3><p>Advice is inert until separately approved.</p>${field("Question","Review the current blocker and propose a safe recovery",{name:"prompt",textarea:true,wide:true})}<button ${blocker&&currentRunId()?"":"disabled"}>Request advice</button></form></div>${historicalRun?`<article class="card"><h3>Historical run ${esc(historicalRun)}</h3><p>Direct deblock is prohibited. Recover through immutable iteration lineage.</p><button data-historical-lineage="${esc(selectedIterationId(historicalIteration)||historicalRun)}">Prepare continuation</button></article>`:""}<h3>Reported advice</h3>${advice.length?advice.map(item=>`<article class="card"><p>${esc(item.answer||item.text||item.prompt||json(item))}</p><div class="button-row"><button class="good" data-advice="approve" data-id="${esc(idOf(item))}">Approve</button><button class="danger" data-advice="deny" data-id="${esc(idOf(item))}">Deny</button></div></article>`).join(""):'<p class="empty">No advice records reported.</p>'}<h3>Historical audit</h3><pre>${esc(json(snapshot.audit))}</pre>`;}
  if(operationTab==="queue"){const items=arr(snapshot.queue?.items);content=`<form id="queueForm" class="card"><h3>Add feedstock brief</h3><div class="form-grid">${field("Title","",{name:"title",required:true})}${field("Priority",50,{name:"priority",type:"number"})}${field("Objective","",{name:"objective",textarea:true,wide:true,required:true})}${field("Context / bounded change","",{name:"context",textarea:true,wide:true,required:true})}${field("Constraints, one per line","",{name:"constraints",textarea:true})}${field("Preferred absolute repository","",{name:"preferredRepo"})}${field("Acceptance gate IDs, one per line","",{name:"acceptanceGateIds",textarea:true,wide:true})}</div><button class="primary">Add queue item</button></form><div class="button-row"><button data-quick-command="clear-queue" class="danger">Clear queue</button></div><div class="card-grid">${items.map(item=>`<article class="card"><h3>${esc(item.title||idOf(item))}</h3><p>${esc(item.objective||"No objective reported")}</p><small>${esc(item.status||"queued")} / priority ${esc(item.priority??"not reported")} / repo ${esc(item.target?.preferredRepo||"not specified")}</small><div class="button-row"><button data-queue-action="pin" data-id="${esc(idOf(item))}">Pin</button><button data-queue-action="archive" data-id="${esc(idOf(item))}" class="danger">Archive</button><button data-queue-action="direction" data-id="${esc(idOf(item))}">Start bounded direction</button></div></article>`).join("")||'<p class="empty">Queue empty.</p>'}</div>`;}
  if(operationTab==="gates"){const gates=arr(snapshot.gates?.gates);content=`<form id="gateForm" class="card"><h3>Add inspection gate</h3><div class="form-grid">${field("Gate ID","",{name:"id",required:true})}${field("Severity","must",{name:"severity",select:[["must","Must"],["should","Should"]]})}${field("Description","",{name:"description",wide:true,required:true})}${field("Required evidence, one path per line","",{name:"requiredEvidence",textarea:true,wide:true})}</div><input type="hidden" name="phase" value="final-audit"><button class="primary">Add gate</button></form><div class="card-grid">${gates.map(gate=>`<form class="card gate-control" data-gate-id="${esc(idOf(gate))}"><h3>${esc(gate.title||gate.name||idOf(gate))}</h3><p>${esc(gate.description||"No criterion reported")}</p><small>Observed status ${esc(gate.status||"pending")}</small>${field("Status",gate.status==="pending"?"needs-evidence":gate.status||"needs-evidence",{name:"status",select:[["passed","Passed"],["needs-evidence","Needs evidence"],["failed","Failed"]]})}${field("Decision",gate.status==="passed"?"accepted":gate.status==="failed"?"rejected":"defer",{name:"decision",select:[["accepted","Accepted"],["defer","Defer"],["rejected","Rejected"]]})}${field("Evidence artifact paths, one per line","",{name:"artifacts",textarea:true,wide:true})}${field("Operator notes","",{name:"notes",textarea:true,wide:true})}${field("Description",gate.description||"",{name:"description",textarea:true,wide:true})}<div class="button-row"><button data-gate-submit="decision" class="good">Record decision</button><button data-gate-submit="evidence">Attach evidence</button><button data-gate-submit="update">Update definition</button></div></form>`).join("")||'<p class="empty">No gates reported.</p>'}</div>`;}
  if(operationTab==="showcase"){const iterations=arr(snapshot.iterations),showcase=snapshot.control?.autoIteration||snapshot.control?.showcase||{},selectedSource=iterations.find((item)=>selectedIterationId(item)===snapshot.selectedIterationId)||iterations[0]||{},defaults=iterationContext(selectedSource);content=`<form id="showcaseForm" class="card"><h3>Showcase loop</h3><p>Reported state: ${esc(showcase.status||showcase.state||"not reported")}</p><div class="form-grid">${field("Repository path",first(showcase.repoPath,defaults.repoPath),{name:"repoPath",required:true})}${field("Base ref",defaults.baseRef||"HEAD",{name:"baseRef",required:true})}${field("Objective",first(showcase.objective,defaults.objective),{name:"objective",textarea:true,wide:true,required:true})}${field("Bounded first change",defaults.changeText,{name:"changeText",textarea:true,wide:true,required:true})}${field("Target generations",showcase.targetGenerations||10,{name:"targetGenerations",type:"number"})}</div><div class="button-row"><button name="action" value="start" class="primary">Start</button><button name="action" value="target">Set target</button><button type="button" data-quick-command="pause-showcase-loop">Pause</button><button type="button" data-quick-command="resume-showcase-loop">Resume</button><button type="button" data-quick-command="stop-showcase-loop" class="danger">Stop</button></div></form><form id="lineageForm" class="card"><h3>Complete bounded lineage request</h3><div class="form-grid">${field("Mode","start-next-iteration",{name:"mode",select:[["start-next-iteration","Start next"],["continue-from-iteration","Continue"],["fork-from-iteration","Fork"],["use-as-next-direction","Use direction"]]})}${field("Source iteration",defaults.sourceIterationId,{name:"sourceIterationId"})}${field("Source run",defaults.sourceRunId,{name:"sourceRunId"})}${field("Repository path",defaults.repoPath,{name:"repoPath",required:true})}${field("Base ref",defaults.baseRef,{name:"baseRef",required:true})}${field("Objective",defaults.objective,{name:"objective",textarea:true,wide:true,required:true})}${field("Bounded change",defaults.changeText,{name:"changeText",textarea:true,wide:true,required:true})}${field("Gate IDs, one per line",defaults.acceptanceGateIds.join("\n"),{name:"acceptanceGateIds",textarea:true,wide:true})}</div><button class="primary">Review complete request</button></form><h3>Iteration lineage</h3><div class="card-grid">${iterations.map(item=>`<article class="card"><h3>${esc(selectedIterationId(item)||"iteration")}</h3><p>${esc(item.objective||item.summary||"No summary reported")}</p><small>${esc(item.status||"unknown")} / parent ${esc(item.parentIterationId||item.parentRunId||"none reported")}</small><div class="button-row"><button data-iteration-action="continue" data-id="${esc(selectedIterationId(item))}">Continue</button><button data-iteration-action="fork" data-id="${esc(selectedIterationId(item))}">Fork</button><button data-iteration-action="direction" data-id="${esc(selectedIterationId(item))}">Next direction</button><button data-select-iteration="${esc(selectedIterationId(item))}">Inspect</button></div></article>`).join("")||'<p class="empty">No iterations reported.</p>'}</div>`;}
  if(operationTab==="advanced")content=`<div class="card"><h3>Complete operation command index</h3><p>Every command exported by <code>OPERATION_COMMANDS</code> is listed. Supply only API-supported payload fields; malformed or non-object JSON is rejected before review.</p><form id="advancedCommandForm"><div class="form-grid">${field("Command",OPERATION_COMMANDS[0],{name:"type",select:OPERATION_COMMANDS.map(type=>[type,type])})}${field("Payload JSON","{}",{name:"payload",textarea:true,wide:true})}</div><button class="primary">Review command</button></form></div><pre>${esc(OPERATION_COMMANDS.join("\n"))}</pre>`;
  return workspaceTabs(tabs,operationTab)+`<div>${content}</div>`;
}

function defaultPlanContent(pipelineType = "classic") {
  return {
    pipelineType, title: "", problem: "", intendedUsers: "", objective: "", boundedScope: "",
    requirements: [], nonGoals: [], constraints: [], risks: [],
    repository: pipelineType === "managed" ? { path: null, baseRef: "HEAD", baseCommit: null } : { path: null, baseRef: null, baseCommit: null },
    acceptanceGates: [], validationPolicy: { id: "apb.runner-selected.v1", expectations: [], clientCommandsAllowed: false },
    milestones: [], limits: canonicalLimits({}, 1),
    lineage: { mode: "new", sourcePlanId: null, sourceRevision: null, sourceRunId: null, sourceIterationId: null }
  };
}
function planContent(detail=snapshot.planDetail){return draftOverride||detail?.revision?.content||detail?.content||defaultPlanContent("classic");}
function planVersion(detail=snapshot.planDetail){return detail?.ledger?.version||detail?.revision?.revision||detail?.ledger?.currentRevision||detail?.version||1;}
function planId(detail=snapshot.planDetail){return detail?.ledger?.planId||detail?.planId||selectedPlanId;}
function exactPlanSubject(detail = snapshot.planDetail) {
  const ledger = detail?.ledger, revision = detail?.revision;
  if (!ledger || !revision || ledger.currentRevision !== revision.revision || ledger.currentDigest !== revision.contentDigest) throw new Error("The loaded plan revision is not the ledger's exact current digest. Reload before acting.");
  return { planId: ledger.planId, revision: revision.revision, planDigest: revision.contentDigest };
}
function planGateText(gates) { return arr(gates).map((gate) => `${gate.id} | ${gate.description} | ${gate.severity || "must"} | ${arr(gate.requiredEvidence).join(", ")}`).join("\n"); }
function parsePlanGates(text) {
  return lines(text).map((row, index) => {
    const [id, description, severity = "must", evidence = ""] = row.split("|").map((part) => part.trim());
    const requiredEvidence = evidence.split(",").map((item) => item.trim()).filter(Boolean);
    return { id: id || `gate-${index + 1}`, description, severity: severity === "should" ? "should" : "must", required: requiredEvidence.length > 0, requiredEvidence };
  });
}
function plannerWorkspace(){const tabs=[["plans","Plan register"],["editor","Draft editor"],["review","Review / lifecycle"],["assist","Planning assistance"]];let content="";
  if(planTab==="plans")content=`<div class="button-row"><button data-new-plan="classic" class="primary">New classic plan</button><button data-new-plan="managed">New managed plan</button><button id="refreshPlans">Refresh plans</button></div><div class="card-grid">${snapshot.plans.map(plan=>`<button class="list-button ${plan.planId===selectedPlanId?"active":""}" data-plan="${esc(plan.planId)}"><strong>${esc(plan.title||plan.planId)}</strong><br><small>${esc(plan.state||plan.status||"draft")} / ${esc(plan.pipelineType||"classic")} / v${esc(plan.version||plan.currentRevision||1)}</small></button>`).join("")||'<p class="empty">No plans reported.</p>'}</div>`;
  if(planTab==="editor"){const contentData=planContent(),repository=contentData.repository||{},limitsData=contentData.limits||canonicalLimits();content=`<form id="planForm" class="form-grid">${field("Title",contentData.title||"",{name:"title",required:true})}${field("Pipeline",contentData.pipelineType||"classic",{name:"pipelineType",select:[["classic","Classic"],["managed","Managed"]]})}${field("Problem",contentData.problem||"",{name:"problem",textarea:true,wide:true,required:true})}${field("Intended users",contentData.intendedUsers||"",{name:"intendedUsers",textarea:true,required:true})}${field("Objective",contentData.objective||"",{name:"objective",textarea:true,required:true})}${field("Bounded scope",contentData.boundedScope||"",{name:"boundedScope",textarea:true,wide:true,required:true})}${field("Requirements, one per line",arr(contentData.requirements).join("\n"),{name:"requirements",textarea:true,required:true})}${field("Non-goals, one per line",arr(contentData.nonGoals).join("\n"),{name:"nonGoals",textarea:true,required:true})}${field("Constraints, one per line",arr(contentData.constraints).join("\n"),{name:"constraints",textarea:true,required:true})}${field("Risks, one per line",arr(contentData.risks).join("\n"),{name:"risks",textarea:true,required:true})}${field("Repository path (managed only)",repository.path||"",{name:"repoPath"})}${field("Base ref (managed only)",repository.baseRef||"HEAD",{name:"baseRef"})}${field("Acceptance gates: id | description | severity | evidence paths",planGateText(contentData.acceptanceGates),{name:"acceptanceGates",textarea:true,wide:true})}${field("Validation expectations, one per line",arr(contentData.validationPolicy?.expectations).join("\n"),{name:"validationExpectations",textarea:true,required:true})}${field("Milestones, one per line",arr(contentData.milestones).join("\n"),{name:"milestones",textarea:true,required:true})}${Object.keys(canonicalLimits()).map((key)=>field(key,limitsData[key],{name:key,type:"number"})).join("")}<div class="field wide"><p>Lineage is immutable for this draft: ${esc(json(contentData.lineage||defaultPlanContent().lineage))}</p></div><div class="field wide button-row"><button class="primary">${selectedPlanId?"Save revision draft":"Create draft"}</button>${selectedPlanId?'<button type="button" id="submitPlanReview">Ready for review</button>':""}</div></form>`;}
  if(planTab==="review"){const ledger=snapshot.planDetail?.ledger||{},revision=snapshot.planDetail?.revision||{};content=selectedPlanId?`<article class="card"><h3>${esc(revision.content?.title||selectedPlanId)}</h3><p>State ${esc(ledger.state||"not reported")} / ledger version ${esc(ledger.version)} / exact revision ${esc(revision.revision)}</p><p>Digest <code>${esc(revision.contentDigest||"not loaded")}</code></p>${field("Decision notes","",{name:"planNotes",textarea:true,wide:true})}<pre>${esc(json(revision.content||planContent()))}</pre><div class="button-row"><button data-plan-action="approve" class="good">Approve exact revision</button><button data-plan-action="reject" class="danger">Reject</button><button data-plan-action="launch" class="primary">Launch</button><button data-plan-action="clone">Clone</button><button data-plan-action="fork">Fork</button><button data-plan-action="archive" class="danger">Archive</button></div></article>`:'<p class="empty">Select or create a plan first.</p>';}
  if(planTab==="assist"){const detail=snapshot.assistanceDetail,threads=snapshot.assistance;content=`<div class="workspace-grid"><aside class="subpanel"><div class="button-row"><button data-new-assist="classic">New classic</button><button data-new-assist="managed">New managed</button></div>${threads.map(thread=>`<button class="list-button ${thread.id===selectedAssistanceId?"active":""}" data-assist="${esc(thread.id)}">${esc(thread.id)}<br><small>${esc(thread.pipelineType)} / ${esc(thread.messageCount||0)} messages</small></button>`).join("")||'<p class="empty">No assistance threads loaded.</p>'}</aside><section class="subpanel"><h3>Versioned planning conversation</h3><div>${arr(detail?.messages).map(message=>`<article class="card"><strong>${esc(message.role||"assistant")}</strong><p>${esc(message.content||message.message||message.text)}</p></article>`).join("")||'<p class="empty">Select or create a thread.</p>'}</div><form id="assistForm">${field("Message","",{name:"message",textarea:true,wide:true,required:true})}<button class="primary" ${detail?"":"disabled"}>Send message</button></form>${detail?.proposedContent?`<article class="card"><h3>Structured proposal</h3><pre>${esc(json(detail.proposedContent))}</pre><button id="applyProposal" class="good">Apply to draft editor</button></article>`:""}</section></div>`;}
  return workspaceTabs(tabs,planTab)+content;}

function evidenceWorkspace(){const tabs=[["summary","Run / agent"],["documents","Documents"],["artifacts","Artifacts"],["logs","Logs"],["iterations","Iterations / lineage"]],runId=resourceRunId,loaded=runId&&snapshot.selectedRunId===runId,resources=loaded?snapshot.selectedRun:{run:null,artifacts:[],logs:[]},run=resources.run||snapshot.runs.find((item)=>idOf(item)===runId)||null,agent=selectedAgent();let content="";
  if(evidenceTab==="summary")content=`<div class="card-grid"><article class="card"><h3>Selected run</h3>${dataPairs(run,30)}</article><article class="card"><h3>Selected agent</h3>${agent?dataPairs(agent,30):'<p class="empty">Select an agent toolhead in the cell inventory.</p>'}</article><article class="card"><h3>State</h3>${dataPairs(snapshot.state,30)}</article></div>`;
  if(evidenceTab==="documents")content=`<div class="button-row"><button data-document="spec" data-run-id="${esc(runId||"")}" class="primary">Load SPEC</button><button data-document="devplan" data-run-id="${esc(runId||"")}">Load DEVPLAN</button></div><h3>${esc(resourceTitle)}</h3><pre>${esc(resourceText||"Select a document. Content is loaded from the explicitly selected run.")}</pre>`;
  if(evidenceTab==="artifacts")content=`<div class="workspace-grid"><aside class="subpanel">${arr(resources.artifacts).map(item=>`<button class="list-button" data-artifact="${esc(itemName(item))}" data-run-id="${esc(runId||"")}">${esc(itemName(item))}</button>`).join("")||`<p class="empty">${loaded?"No artifacts reported.":"Selected run resources are loading."}</p>`}</aside><section class="subpanel"><h3>${esc(resourceTitle)}</h3><pre>${esc(resourceText||"Select an artifact.")}</pre></section></div>`;
  if(evidenceTab==="logs")content=`<div class="workspace-grid"><aside class="subpanel">${arr(resources.logs).map(item=>`<button class="list-button" data-log="${esc(itemName(item))}" data-run-id="${esc(runId||"")}">${esc(itemName(item))}</button>`).join("")||`<p class="empty">${loaded?"No logs reported.":"Selected run resources are loading."}</p>`}</aside><section class="subpanel"><h3>${esc(resourceTitle)}</h3><pre>${esc(resourceText||"Select a log. The viewer requests a bounded 400-line tail.")}</pre></section></div>`;
  if(evidenceTab==="iterations")content=`<div class="card-grid">${snapshot.iterations.map(item=>`<article class="card"><h3>${esc(selectedIterationId(item))}</h3><p>${esc(item.summary||item.objective||"No summary reported")}</p><small>Status ${esc(item.status||"unknown")} / parent ${esc(item.parentIterationId||item.parentRunId||"none reported")}</small><button data-select-iteration="${esc(selectedIterationId(item))}">Load detail</button></article>`).join("")||'<p class="empty">No iterations reported.</p>'}</div>${snapshot.iterationDetail?`<pre>${esc(json(snapshot.iterationDetail))}</pre>`:""}`;
  return `<div class="button-row"><label class="field">Resource run<select id="resourceRun"><option value="">Select a run</option>${snapshot.runs.map(item=>`<option value="${esc(idOf(item))}" ${idOf(item)===runId?"selected":""}>${esc(idOf(item))} / ${esc(item.status||"unknown")}</option>`).join("")}</select></label></div>${workspaceTabs(tabs,evidenceTab)}${content}`;}
function helpWorkspace(){return `<div class="card-grid"><article class="card"><h3>Fabrication metaphor</h3><p>Runs are voxel workpieces. Agents are robotic toolheads. Gates are inspection gantries. Queue items are feedstock pallets. Received events are sparks/chips. A current blocker is a red quarantine cage.</p></article><article class="card"><h3>Authority and freshness</h3><p>The 3D positions are layout only. Text panels show API values. Requested control intent is kept separate from observed process state. Freshness uses the latest SSE message or aggregate refresh; polling is the automatic fallback.</p></article><article class="card"><h3>Selection</h3><p>Click or tap a solid object for GPU ID picking. Drag to rotate and wheel/pinch-equivalent trackpad scroll to zoom. Use the semantic inventory for equivalent keyboard access.</p></article><article class="card"><h3>Safety</h3><p>All operational commands show exact JSON for confirmation and remain visible as pending, accepted intent, rejected, or outcome unknown. Acceptance never claims observed completion. Recovery advice requires a separate approval. The visualization itself never issues a command.</p></article></div><h3>Keyboard controls</h3><div class="card"><p><kbd>?</kbd> Help; <kbd>O</kbd> Operations; <kbd>P</kbd> Plans; <kbd>R</kbd> Resources; <kbd>F</kbd> freeze/resume visual motion; <kbd>0</kbd> reset camera; <kbd>Esc</kbd> close workstation. Canvas arrows rotate, plus/minus zoom. Inventory arrows move and Enter selects.</p></div><h3>Complete command coverage</h3><pre>${esc(OPERATION_COMMANDS.join("\n"))}</pre><h3>Complete plan lifecycle</h3><pre>${esc(PROJECT_PLAN_ACTIONS.join("\n"))}</pre>`;}
function renderWorkspace(){if(!activeWorkspace)return;const focus=focusToken(),scrollTop=$("dialogBody").scrollTop,titles={operations:["OPERATIONS PENDANT","Operations and recovery"],planner:["PATTERN SHOP","Project plans and assistance"],evidence:["MATERIAL LEDGER","Authoritative resources"],help:["OPERATOR HANDBOOK","Help and keyboard controls"]},[eyebrow,title]=titles[activeWorkspace];$("dialogEyebrow").textContent=eyebrow;$("dialogTitle").textContent=title;const tab=activeWorkspace==="operations"?operationTab:activeWorkspace==="planner"?planTab:activeWorkspace==="evidence"?evidenceTab:null,body=activeWorkspace==="operations"?operationWorkspace():activeWorkspace==="planner"?plannerWorkspace():activeWorkspace==="evidence"?evidenceWorkspace():helpWorkspace();let markup;if(tab){const navEnd=body.indexOf("</nav>")+6;markup=`${body.slice(0,navEnd)}<section id="workspace-panel" role="tabpanel" aria-labelledby="workspace-tab-${tab}">${body.slice(navEnd)}</section>`;}else markup=`<section id="workspace-panel" aria-label="Help">${body}</section>`;$("dialogBody").innerHTML=markup;restoreWorkspaceDraft();$("dialogBody").scrollTop=scrollTop;restoreFocus(focus);}
function openWorkspace(name){activeWorkspace=name;if(name==="evidence"&&!resourceRunId)resourceRunId=snapshot.selectedRunId||currentRunId();if(name==="planner"){client.refreshPlans().catch(()=>{});client.listPlanAssistance().catch(()=>{});}renderWorkspace();if(!$("workspaceDialog").open)$("workspaceDialog").showModal();}
function closeWorkspace(){activeWorkspace=null;$("workspaceDialog").close();}

function formObject(form){return Object.fromEntries(new FormData(form));}
function planPayload(form){
  const data=formObject(form),pipelineType=data.pipelineType,existing=planContent(),limits={};
  for(const key of Object.keys(canonicalLimits()))limits[key]=Number(data[key]);
  return {
    pipelineType,title:String(data.title),problem:String(data.problem),intendedUsers:String(data.intendedUsers),objective:String(data.objective),boundedScope:String(data.boundedScope),
    requirements:lines(data.requirements),nonGoals:lines(data.nonGoals),constraints:lines(data.constraints),risks:lines(data.risks),
    repository:pipelineType==="managed"?{path:String(data.repoPath||"")||null,baseRef:String(data.baseRef||"")||null,baseCommit:null}:{path:null,baseRef:null,baseCommit:null},
    acceptanceGates:parsePlanGates(data.acceptanceGates),validationPolicy:{id:"apb.runner-selected.v1",expectations:lines(data.validationExpectations),clientCommandsAllowed:false},
    milestones:lines(data.milestones),limits:canonicalLimits(limits),lineage:existing.lineage||defaultPlanContent(pipelineType).lineage
  };
}
const PLAN_ACTION_METHODS = Object.freeze({
  "project-plan.create": "createProjectPlan",
  "project-plan.update": "updateProjectPlan",
  "project-plan.ready-for-review": "submitProjectPlanForReview",
  "project-plan.approve": "approveProjectPlan",
  "project-plan.reject": "rejectProjectPlan",
  "project-plan.launch": "launchProjectPlan",
  "project-plan.clone": "cloneProjectPlan",
  "project-plan.fork": "forkProjectPlan",
  "project-plan.archive": "archiveProjectPlan"
});
if (!PROJECT_PLAN_ACTIONS.every((action) => PLAN_ACTION_METHODS[action] && typeof client[PLAN_ACTION_METHODS[action]] === "function")) throw new Error("Project plan client lifecycle is incomplete");
async function runPlanAction(action){
  const detail=snapshot.planDetail,id=planId(detail),version=detail?.ledger?.version;if(!id||!detail)return;
  const subject=exactPlanSubject(detail),notes=String($("dialogBody").querySelector('[name="planNotes"]')?.value||"").trim();
  if(action==="reject"&&!notes)throw new Error("Rejection notes are required.");
  const type=`project-plan.${action}`;
  let payload=action==="archive"?{planId:id}:{...subject};
  if(["approve","reject"].includes(action))payload={...payload,notes};
  if(["clone","fork"].includes(action))payload={...payload,sourceRunId:resourceRunId||snapshot.selectedRunId||null,sourceIterationId:snapshot.selectedIterationId||null,baseRef:detail.revision.content.pipelineType==="managed"?detail.revision.content.repository?.baseRef||"HEAD":null};
  const methods={approve:"approveProjectPlan",reject:"rejectProjectPlan",launch:"launchProjectPlan",clone:"cloneProjectPlan",fork:"forkProjectPlan",archive:"archiveProjectPlan"};
  const result=await issuePlanMutation(type,payload,()=>client[methods[action]](payload,{expectedVersion:version,refresh:true}));if(!result)return;
  clearWorkspaceDraft("planner:review");await client.refreshPlans();
  if(action==="archive"){selectedPlanId=null;planTab="plans";}
  else{selectedPlanId=result.planId||id;await client.getProjectPlan(selectedPlanId);}
  renderWorkspace();
}

document.addEventListener("click",async(event)=>{
  const button=event.target.closest("button");if(!button)return;
  try{
    if(button.dataset.open){openWorkspace(button.dataset.open);return;}if(button.dataset.close!==undefined){closeWorkspace();return;}
    if(button.dataset.kind){entityKind=button.dataset.kind;renderEntityList();return;}if(button.dataset.entity){selectEntity(button.dataset.entity);return;}
    if(button.dataset.workspaceTab){saveWorkspaceDraft();if(activeWorkspace==="operations")operationTab=button.dataset.workspaceTab;if(activeWorkspace==="planner")planTab=button.dataset.workspaceTab;if(activeWorkspace==="evidence")evidenceTab=button.dataset.workspaceTab;renderWorkspace();$("workspaceDialog").querySelector(`[data-workspace-tab="${CSS.escape(button.dataset.workspaceTab)}"]`)?.focus();return;}
    if(button.dataset.quickCommand){await issueCommand(button.dataset.quickCommand,commandPayloadDefaults(button.dataset.quickCommand));return;}
    if(button.dataset.queueAction){const item=arr(snapshot.queue?.items).find((entry)=>String(entry.id)===button.dataset.id);if(!item)throw new Error("Queue item is no longer present.");if(button.dataset.queueAction==="pin")await issueCommand("pin-queue-item",{itemId:item.id});if(button.dataset.queueAction==="archive")await issueCommand("archive-queue-item",{itemId:item.id});if(button.dataset.queueAction==="direction")await issueCommand("start-next-iteration",buildQueueIterationPayload(item),"start bounded queue direction");return;}
    if(button.dataset.advice){await issueCommand(`${button.dataset.advice}-deblock-advice`,{adviceId:button.dataset.id});return;}
    if(button.dataset.iterationAction){const map={continue:"continue-from-iteration",fork:"fork-from-iteration",direction:"use-as-next-direction"},type=map[button.dataset.iterationAction],item=snapshot.iterations.find((entry)=>selectedIterationId(entry)===button.dataset.id);if(!item)throw new Error("Iteration is no longer present.");if(snapshot.selectedIterationId!==button.dataset.id)await client.selectIteration(button.dataset.id);snapshot=client.getSnapshot();await issueCommand(type,buildIterationPayload(type,item));return;}
    if(button.dataset.historicalLineage){const item=snapshot.iterations.find((entry)=>[selectedIterationId(entry),entry.runId].includes(button.dataset.historicalLineage));if(!item)throw new Error("Historical recovery requires retained iteration lineage.");await client.selectIteration(selectedIterationId(item));snapshot=client.getSnapshot();operationTab="showcase";renderWorkspace();return;}
    if(button.dataset.selectIteration){await client.selectIteration(button.dataset.selectIteration);renderWorkspace();return;}
    if(button.dataset.plan){selectedPlanId=button.dataset.plan;draftOverride=null;clearWorkspaceDraft("planner:editor");clearWorkspaceDraft("planner:review");await client.getProjectPlan(selectedPlanId);planTab="editor";renderWorkspace();return;}
    if(button.dataset.newPlan){selectedPlanId=null;draftOverride=defaultPlanContent(button.dataset.newPlan);clearWorkspaceDraft("planner:editor");planTab="editor";renderWorkspace();return;}
    if(button.dataset.planAction){await runPlanAction(button.dataset.planAction);return;}
    if(button.dataset.newAssist){const detail=await client.createPlanAssistance(button.dataset.newAssist);selectedAssistanceId=detail.id;renderWorkspace();return;}
    if(button.dataset.assist){selectedAssistanceId=button.dataset.assist;await client.getPlanAssistance(selectedAssistanceId);renderWorkspace();return;}
    if(button.dataset.document){const runId=button.dataset.runId;if(!runId)throw new Error("Select an explicit resource run.");resourceTitle=`${button.dataset.document.toUpperCase()} / ${runId}`;resourceText="Loading...";renderWorkspace();try{const result=await client.loadDocument(button.dataset.document,runId);if(resourceRunId===runId)resourceText=result.text;}catch(error){if(resourceRunId===runId)resourceText=`Document unavailable: ${error.message}`;}renderWorkspace();return;}
    if(button.dataset.artifact){const runId=button.dataset.runId;if(!runId)throw new Error("Select an explicit resource run.");resourceTitle=`${button.dataset.artifact} / ${runId}`;resourceText="Loading...";renderWorkspace();try{const result=await client.loadArtifact(button.dataset.artifact,runId);if(resourceRunId===runId)resourceText=result.text;}catch(error){if(resourceRunId===runId)resourceText=`Artifact unavailable: ${error.message}`;}renderWorkspace();return;}
    if(button.dataset.log){const runId=button.dataset.runId;if(!runId)throw new Error("Select an explicit resource run.");resourceTitle=`${button.dataset.log} / ${runId}`;resourceText="Loading...";renderWorkspace();try{const result=await client.loadLog(button.dataset.log,runId,{tail:400});if(resourceRunId===runId)resourceText=result.text;}catch(error){if(resourceRunId===runId)resourceText=`Log unavailable: ${error.message}`;}renderWorkspace();return;}
    if(button.id==="freezeVisual"){motionUserOverride=true;visualFrozen=!visualFrozen;renderHeader();announce(`Visual motion ${visualFrozen?"frozen":"resumed"}.`);return;}
    if(button.id==="freezeData"){if(snapshot.connection.paused)await client.resume();else client.pause();return;}
    if(button.id==="resetView"){renderer.resetView();announce("3D camera reset.");return;}
    if(button.id==="openRecovery"){operationTab="recovery";openWorkspace("operations");return;}
    if(button.id==="refreshPlans"){await client.refreshPlans();renderWorkspace();return;}
    if(button.id==="submitPlanReview"){const payload=exactPlanSubject(),version=snapshot.planDetail.ledger.version;const result=await issuePlanMutation("project-plan.ready-for-review",payload,()=>client.submitProjectPlanForReview(payload,{expectedVersion:version,refresh:true}));if(result){clearWorkspaceDraft("planner:review");planTab="review";await client.getProjectPlan(selectedPlanId);renderWorkspace();}return;}
    if(button.id==="applyProposal"){draftOverride={...defaultPlanContent(snapshot.assistanceDetail.pipelineType||"classic"),...snapshot.assistanceDetail.proposedContent};selectedPlanId=null;clearWorkspaceDraft("planner:editor");planTab="editor";renderWorkspace();return;}
    if(button.id==="toggleCommandLog"){const list=$("commandLog"),expanded=list.hidden;list.hidden=!expanded;button.setAttribute("aria-expanded",expanded);return;}
  }catch(error){announce(error.message);}
});

$("dialogBody").addEventListener("submit",async(event)=>{
  event.preventDefault();const form=event.target;
  try{
    if(form.id==="objectiveForm")await issueCommand("set-current-objective",formObject(form));
    if(form.id==="steerForm")await issueCommand("steer",formObject(form));
    if(form.id==="deblockForm")await issueCommand("deblock",{...formObject(form),runId:currentRunId()});
    if(form.id==="adviceForm")await issueCommand("deblock-advice",{...formObject(form),runId:currentRunId()});
    if(form.id==="queueForm"){const data=formObject(form);data.priority=Number(data.priority);data.constraints=String(data.constraints||"");data.acceptanceGateIds=lines(data.acceptanceGateIds);data.target=data.preferredRepo?{preferredRepo:data.preferredRepo}:{};delete data.preferredRepo;await issueCommand("add-queue-item",data);}
    if(form.id==="gateForm"){const data=formObject(form);data.requiredEvidence=lines(data.requiredEvidence).join("\n");await issueCommand("add-gate",data);}
    if(form.matches(".gate-control")){const data=formObject(form),action=event.submitter?.dataset.gateSubmit,base={gateId:form.dataset.gateId,runId:resourceRunId||snapshot.selectedRunId||null,notes:String(data.notes||"")},artifacts=lines(data.artifacts);if(action==="decision")await issueCommand("gate-decision",{...base,status:data.status,decision:data.decision,evidenceArtifacts:artifacts});if(action==="evidence"){if(!artifacts.length)throw new Error("Attach evidence requires at least one existing artifact path.");await issueCommand("attach-gate-evidence",{...base,artifacts});}if(action==="update")await issueCommand("update-gate",{gateId:form.dataset.gateId,description:data.description});}
    if(form.id==="showcaseForm"){const data=formObject(form),action=event.submitter?.value,type=action==="start"?"start-showcase-loop":"set-showcase-target",target=Math.min(10,Math.max(1,Number(data.targetGenerations)||10));if(type==="set-showcase-target")await issueCommand(type,{targetGenerations:target});else{const source=snapshot.iterations.find((item)=>selectedIterationId(item)===snapshot.selectedIterationId)||{};const payload=buildIterationPayload(type,source,{repoPath:data.repoPath,baseRef:data.baseRef,objective:data.objective,changeText:data.changeText,limits:canonicalLimits({},target)});payload.targetGenerations=target;payload.limits.maxIterations=target;await issueCommand(type,payload);}}
    if(form.id==="lineageForm"){const data=formObject(form),type=data.mode,source=snapshot.iterations.find((item)=>selectedIterationId(item)===data.sourceIterationId||item.runId===data.sourceRunId)||{};const payload=buildIterationPayload(type,source,{sourceIterationId:data.sourceIterationId||null,sourceRunId:data.sourceRunId||null,repoPath:data.repoPath,baseRef:data.baseRef,objective:data.objective,changeText:data.changeText,acceptanceGateIds:lines(data.acceptanceGateIds)});await issueCommand(type,payload);}
    if(form.id==="advancedCommandForm"){const data=formObject(form);let payload;try{payload=JSON.parse(data.payload);}catch{throw new Error("Payload must be valid JSON.");}if(!payload||typeof payload!=="object"||Array.isArray(payload))throw new Error("Payload must be a JSON object.");if(["start-next-iteration","continue-from-iteration","fork-from-iteration","use-as-next-direction"].includes(data.type)){const source=snapshot.iterations.find((item)=>selectedIterationId(item)===(payload.sourceIterationId||payload.iterationId)||item.runId===(payload.sourceRunId||payload.runId))||{};payload=buildIterationPayload(data.type,source,payload);}await issueCommand(data.type,payload);}
    if(form.id==="planForm"){const content=planPayload(form);if(selectedPlanId){const update={planId:selectedPlanId,content},version=snapshot.planDetail?.ledger?.version;if(!Number.isInteger(version))throw new Error("Plan ledger version is unavailable.");const result=await issuePlanMutation("project-plan.update",update,()=>client.updateProjectPlan(update,{expectedVersion:version,refresh:true}));if(result){draftOverride=null;clearWorkspaceDraft("planner:editor");await client.getProjectPlan(selectedPlanId);}}else{const create={content};const result=await issuePlanMutation("project-plan.create",create,()=>client.createProjectPlan(create,{refresh:true}));if(result){selectedPlanId=result.planId;draftOverride=null;clearWorkspaceDraft("planner:editor");await client.getProjectPlan(selectedPlanId);}}renderWorkspace();}
    if(form.id==="assistForm"){const data=formObject(form),detail=snapshot.assistanceDetail;await client.messagePlanAssistance(detail.id,detail.version,data.message);renderWorkspace();}
  }catch(error){announce(error.message);}
});

$("confirmDialog").addEventListener("close",()=>{if(pendingConfirmation){pendingConfirmation.resolve($("confirmDialog").returnValue==="default");pendingConfirmation=null;}});
$("eventFilter").addEventListener("input",renderEvents);
$("entityList").addEventListener("keydown",event=>{const options=[...$("entityList").querySelectorAll('[role="option"]')];if(!options.length)return;let index=Math.max(0,options.indexOf(document.activeElement));if(["ArrowRight","ArrowDown"].includes(event.key))index=Math.min(options.length-1,index+1);else if(["ArrowLeft","ArrowUp"].includes(event.key))index=Math.max(0,index-1);else if(event.key==="Home")index=0;else if(event.key==="End")index=options.length-1;else if(event.key==="Enter"||event.key===" "){document.activeElement?.click();event.preventDefault();return;}else return;options[index].focus();event.preventDefault();});
$("entityTabs").addEventListener("keydown",event=>{const tabs=[...$("entityTabs").querySelectorAll('[role="tab"]')];if(!tabs.includes(event.target)||!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;const current=tabs.indexOf(event.target),next=event.key==="Home"?0:event.key==="End"?tabs.length-1:event.key==="ArrowRight"?(current+1)%tabs.length:(current-1+tabs.length)%tabs.length,kind=tabs[next].dataset.kind;tabs[next].click();$("entityTabs").querySelector(`[data-kind="${kind}"]`)?.focus();event.preventDefault();});
$("dialogBody").addEventListener("change",async event=>{saveWorkspaceDraft();if(event.target.id==="resourceRun"){const runId=event.target.value||null;resourceRunId=runId;resourceText="";resourceTitle="No resource loaded";clearWorkspaceDraft("evidence:summary");clearWorkspaceDraft("evidence:documents");clearWorkspaceDraft("evidence:artifacts");clearWorkspaceDraft("evidence:logs");if(runId)await client.selectRun(runId);renderWorkspace();}});
$("dialogBody").addEventListener("input",saveWorkspaceDraft);
$("dialogBody").addEventListener("keydown",event=>{const tab=event.target.closest('[role="tab"]');if(!tab||!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;const tabs=[...tab.parentElement.querySelectorAll('[role="tab"]')],current=tabs.indexOf(tab);let next=event.key==="Home"?0:event.key==="End"?tabs.length-1:event.key==="ArrowRight"?(current+1)%tabs.length:(current-1+tabs.length)%tabs.length;tabs[next].click();event.preventDefault();});
$("workspaceDialog").addEventListener("close",()=>{if(!$("workspaceDialog").open)activeWorkspace=null;});
window.addEventListener("keydown",event=>{if(event.target.matches("input,textarea,select"))return;if(event.key==="Escape"&&$("workspaceDialog").open){closeWorkspace();return;}if(event.key==="?"){openWorkspace("help");event.preventDefault();}else if(event.key.toLowerCase()==="o")openWorkspace("operations");else if(event.key.toLowerCase()==="p")openWorkspace("planner");else if(event.key.toLowerCase()==="r")openWorkspace("evidence");else if(event.key.toLowerCase()==="f"){motionUserOverride=true;visualFrozen=!visualFrozen;renderHeader();}else if(event.key==="0")renderer.resetView();});
motionPreference.addEventListener("change",event=>{if(event.matches)visualFrozen=true;else if(!motionUserOverride)visualFrozen=false;renderHeader();announce(`Reduced-motion preference ${event.matches?"enabled; cell motion frozen":"disabled"}.`);});
window.addEventListener("beforeunload",()=>client.disconnect());

client.subscribe(next=>{snapshot=next;renderAll();});
setInterval(renderHeader,1000);
client.connect().catch(error=>announce(`Initial connection failed; polling recovery active: ${error.message}`));
