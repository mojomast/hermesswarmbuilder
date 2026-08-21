#!/usr/bin/env bun
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, realpathSync, statSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import { homedir } from "os";
import { basename, extname, isAbsolute, join, resolve, sep } from "path";
import { ProjectPlanError, ProjectPlanStore } from "./project-plans";
import { PlanAssistanceError, PlanAssistanceStore } from "./plan-assistance";
import { withProjectionLock } from "./launch-authority";

const HOME = homedir();
const PORT = Number(process.env.AUTONOMOUS_PROJECTS_DASHBOARD_PORT || "9200");
const STATE_ROOT = process.env.AUTONOMOUS_PROJECTS_STATE_ROOT || join(HOME, ".hermes", "autonomous-projects");
const APP_ROOT = resolve(process.env.AUTONOMOUS_PROJECTS_DASHBOARD_ROOT || join(HOME, ".hermes", "autonomous-projects-dashboard"));
const PUBLIC_ROOT = join(APP_ROOT, "public");
const RUNNER_PATH = process.env.AUTONOMOUS_PROJECTS_RUNNER_PATH || join(HOME, ".hermes", "scripts", "autonomous-project-midnight-runner.ts");
const RUNNER_PARITY_PROTOCOL = "queue-clear.v1";
const MAX_TEXT_BYTES = 1_500_000;
const EVENT_TAIL_BYTES = Number(process.env.AUTONOMOUS_PROJECTS_EVENT_TAIL_BYTES || "3000000");
const MAX_EVENTS_LIMIT = 1000;
const EVENT_CACHE_MAX = Number(process.env.AUTONOMOUS_PROJECTS_EVENT_CACHE_MAX || "5000");
type CachedEvent = { id: string; ts?: string; [key: string]: any };
let eventCache = { size: -1, mtimeMs: -1, events: [] as CachedEvent[] };

type StateName = "idle" | "inventory-scanning" | "selecting" | "repo-created" | "spec-drafting" | "spec-review" | "spec-approved" | "devplan-drafting" | "devplan-review" | "devplan-approved" | "building" | "blocked" | "deblocking" | "on-hold" | "completed" | "published";
const states: StateName[] = ["idle", "inventory-scanning", "selecting", "repo-created", "spec-drafting", "spec-review", "spec-approved", "devplan-drafting", "devplan-review", "devplan-approved", "building", "blocked", "deblocking", "on-hold", "completed", "published"];
const terminalStates = new Set(["idle", "on-hold", "completed", "published"]);

mkdirSync(STATE_ROOT, { recursive: true });
mkdirSync(join(STATE_ROOT, "runs"), { recursive: true });
mkdirSync(join(STATE_ROOT, "logs"), { recursive: true });
mkdirSync(join(STATE_ROOT, "artifacts"), { recursive: true });

const paths = {
  state: join(STATE_ROOT, "state.json"),
  events: join(STATE_ROOT, "events.jsonl"),
  control: join(STATE_ROOT, "control.json"),
  queue: join(STATE_ROOT, "queue.json"),
  gates: join(STATE_ROOT, "gates.json"),
  commands: join(STATE_ROOT, "commands.jsonl"),
  audit: join(STATE_ROOT, "audit.jsonl"),
  iterations: join(STATE_ROOT, "iterations.json"),
  idea: join(STATE_ROOT, "idea.txt"),
  runnerParity: join(STATE_ROOT, "runner-parity.json"),
};
const projectPlans = new ProjectPlanStore(STATE_ROOT);
const planAssistance = new PlanAssistanceStore(STATE_ROOT);

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/eyJ[a-zA-Z0-9._-]{20,}/g, "[REDACTED_JWT]"],
  [/sk-[a-zA-Z0-9_-]{16,}/g, "[REDACTED_OPENAI_KEY]"],
  [/gh[pousr]_[a-zA-Z0-9_]{16,}/g, "[REDACTED_GITHUB_TOKEN]"],
  [/(api[_-]?key|token|password|secret)\s*[:=]\s*[^\s,'\"}]+/gi, "$1=[REDACTED]"],
  [/-----BEGIN [^-]+ PRIVATE KEY-----[\s\S]*?-----END [^-]+ PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]"],
];

function now() { return new Date().toISOString(); }
function uid(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`; }
function clampLimit(n: number) { return Math.min(Math.max(Number.isFinite(n) ? n : 200, 1), MAX_EVENTS_LIMIT); }
function redactString(value: string) { return SECRET_PATTERNS.reduce((s, [pat, repl]) => s.replace(pat, repl), value); }
function sanitize<T = unknown>(value: T, depth = 0): T {
  if (value == null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return redactString(value).slice(0, 50_000) as T;
  if (depth > 8) return "[MaxDepth]" as T;
  if (Array.isArray(value)) return value.slice(0, 250).map((x) => sanitize(x, depth + 1)) as T;
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 250)) {
      const lk = k.toLowerCase();
      out[k] = /token|secret|password|api_?key|authorization|cookie/.test(lk) ? "[REDACTED]" : sanitize(v, depth + 1);
    }
    return out as T;
  }
  return String(value) as T;
}
function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(sanitize(data), null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
}
function text(data: string, status = 200): Response {
  return new Response(redactString(data), { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
function notFound(message = "not found") { return json({ error: message }, 404); }
function safeJoin(root: string, ...parts: string[]): string {
  const resolvedRoot = resolve(root);
  const target = resolve(resolvedRoot, ...parts);
  if (target !== resolvedRoot && !target.startsWith(resolvedRoot + sep)) throw new Error("path traversal rejected");
  return target;
}
function safeReadJson(path: string, fallback: any): any {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return fallback; }
}
function writeJson(path: string, value: unknown) { writeFileSync(path, JSON.stringify(sanitize(value), null, 2)); }
function appendJsonl(path: string, value: unknown) { appendFileSync(path, JSON.stringify(sanitize(value)) + "\n"); }
function defaultState() {
  return { schemaVersion: "apb.state.v1", currentRunId: null, status: "idle", phase: "idle", updatedAt: now(), agents: {}, decisions: [], capabilities: { readOnlyDashboard: false, browserTerminal: false, scheduledRunner: true, steeringCockpit: true } };
}
function normalizeState(s: any) {
  if (!s || typeof s !== "object" || Array.isArray(s)) s = defaultState();
  s.schemaVersion ||= "apb.state.v1";
  s.status = s.status === "complete" ? "completed" : (s.status || "idle");
  s.phase = s.phase === "complete" ? "completed" : (s.phase || s.status);
  if (Array.isArray(s.agents)) s.agents = Object.fromEntries(s.agents.filter((a: any) => a && typeof a === "object").map((a: any, i: number) => [a.id || `agent-${i}`, a]));
  if (!s.agents || typeof s.agents !== "object") s.agents = {};
  if (terminalStates.has(s.status)) for (const [id, a] of Object.entries(s.agents)) if ((a as any)?.status === "running") s.agents[id] = { ...(a as any), status: s.status === "on-hold" ? "on-hold" : "completed", updatedAt: s.updatedAt || now() };
  return s;
}
function readState() { return normalizeState(safeReadJson(paths.state, defaultState())); }
function writeState(state: any) {
  withProjectionLock(STATE_ROOT, () => {
    const next = normalizeState(state);
    next.updatedAt = now();
    writeJson(paths.state, next);
  });
}

function readTailUtf8(path: string, maxBytes = EVENT_TAIL_BYTES) {
  if (!existsSync(path)) return "";
  const st = statSync(path);
  const start = Math.max(0, st.size - maxBytes);
  const len = st.size - start;
  if (len <= 0) return "";
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, start);
    let body = buf.toString("utf8");
    if (start > 0) body = body.replace(/^[^\n]*(\n|$)/, "");
    return body;
  } finally { closeSync(fd); }
}
function loadEventCache() {
  if (!existsSync(paths.events)) { eventCache = { size: 0, mtimeMs: 0, events: [] }; return eventCache.events; }
  const st = statSync(paths.events);
  if (eventCache.size === st.size && eventCache.mtimeMs === st.mtimeMs) return eventCache.events;
  const parsed: CachedEvent[] = [];
  for (const line of readTailUtf8(paths.events).split(/\r?\n/).filter(Boolean)) {
    try {
      const e = sanitize(JSON.parse(line)) as CachedEvent;
      if (!e.id) e.id = `evt-cache-${parsed.length}-${e.ts || "unknown"}`;
      parsed.push(e);
    } catch {}
  }
  eventCache = { size: st.size, mtimeMs: st.mtimeMs, events: parsed.slice(-EVENT_CACHE_MAX) };
  return eventCache.events;
}
function readEvents(limit = 200, after?: string | null) {
  const wanted = clampLimit(limit);
  const parsed = loadEventCache();
  if (!after) return { events: parsed.slice(-wanted), historyGap: null };
  const idx = parsed.findIndex((e: any) => e?.id === after);
  if (idx >= 0) return { events: parsed.slice(idx + 1).slice(-wanted), historyGap: null };
  return { events: parsed.slice(-wanted), historyGap: { requestedAfter: after, recovery: "cache-tail" } };
}
function listDir(path: string, recursive = false, base = path): any[] {
  if (!existsSync(path)) return [];
  const rows: any[] = [];
  for (const name of readdirSync(path)) {
    const p = join(path, name); const st = statSync(p);
    const rel = p.slice(base.length).replace(/^\/+/, "");
    rows.push({ name: recursive ? rel : name, path: p.replace(STATE_ROOT, ""), kind: st.isDirectory() ? "directory" : "file", size: st.size, modifiedAt: st.mtime.toISOString() });
    if (recursive && st.isDirectory()) rows.push(...listDir(p, true, base));
  }
  return rows.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}
function listRuns() {
  const runsRoot = join(STATE_ROOT, "runs");
  return listDir(runsRoot).filter((x) => x.kind === "directory").map((entry) => {
    const run = safeReadJson(join(runsRoot, entry.name, "run.json"), {} as any) as any;
    return { id: entry.name, status: run.status || run.state || "unknown", startedAt: run.startedAt, completedAt: run.completedAt, selectedProject: run.selectedProject?.name || run.selectedProject || run.currentProject || null, repoPath: run.repoPath || null, qualityGate: run.qualityGate || run.finalValidation || null, modifiedAt: entry.modifiedAt };
  });
}

function runEvidence(runId: string) {
  const runRoot = safeJoin(STATE_ROOT, "runs", runId);
  const run = safeReadJson(join(runRoot, "run.json"), { id: runId });
  const gateReport = safeReadJson(join(runRoot, "artifacts", "gate-report.json"), null);
  const manifest = safeReadJson(join(runRoot, "artifacts", "artifact-manifest.json"), null);
  const screenshotManifest = safeReadJson(join(runRoot, "artifacts", "screenshot-manifest.json"), null);
  const artifacts = existsSync(join(runRoot, "artifacts")) ? listDir(join(runRoot, "artifacts"), true).filter((x) => x.kind === "file") : [];
  return { run, gateReport, manifest, screenshotManifest, artifacts };
}
function inferObjective(run: any, gateReport: any, control: any, queue: any) {
  const pinned = queue.items.find((x: any) => x.id === control.pinnedQueueItemId) || queue.items.find((x: any) => x.status === "pinned");
  return run.objective || run.task || run.selectedProject?.objective || gateReport?.objective || (run.id === control.currentObjective?.runId ? control.currentObjective?.text : null) || pinned?.objective || run.selectedProject?.name || run.currentProject || "Autonomous project iteration";
}
function listIterations() {
  const control = readControl(); const queue = readQueue();
  const stored = safeReadJson(paths.iterations, { schemaVersion: "apb.iterations.v1", items: [] });
  const lineageByRun = new Map((stored.items || []).filter((x: any) => x?.runId).map((x: any) => [x.runId, x]));
  const runNodes = listRuns().slice(0, 80).map((r: any, index: number) => {
    const evidence = runEvidence(r.id);
    const runRoot = safeJoin(STATE_ROOT, "runs", r.id);
    const iterationState = safeReadJson(join(runRoot, "iteration-state.json"), {});
    const iterationArtifact = safeReadJson(join(runRoot, "artifacts", "iterations", "iteration.json"), {});
    const lineage = { ...iterationArtifact, ...iterationState, ...(lineageByRun.get(r.id) || {}) };
    return {
      schemaVersion: "apb.iteration-node.v1",
      id: lineage.id || `iter-${r.id}`,
      iterationNumber: lineage.iterationNumber ?? index + 1,
      runId: r.id,
      sourceRunId: lineage.sourceRunId || evidence.run.sourceRunId || null,
      parentIterationId: lineage.parentIterationId || null,
      forkedFromIterationId: lineage.forkedFromIterationId || null,
      mode: lineage.mode || evidence.run.iterationKind || "run",
      objective: lineage.objective || inferObjective(evidence.run, evidence.gateReport, control, queue),
      steeringText: lineage.steeringText || evidence.run.steeringText || null,
      status: lineage.status || r.status,
      startedAt: r.startedAt || lineage.createdAt,
      completedAt: r.completedAt || lineage.completedAt,
      project: evidence.gateReport?.project || r.selectedProject || evidence.run.currentProject || null,
      repoPath: lineage.repoPath || evidence.gateReport?.repoPath || r.repoPath || evidence.run.repoPath || null,
      baseRef: lineage.baseRef || null,
      commit: evidence.gateReport?.commit || lineage.mashupCommit || evidence.run.commit || null,
      branch: evidence.gateReport?.branch || lineage.mashupBranch || evidence.run.branch || null,
      gateStatus: evidence.gateReport?.status || evidence.run.qualityGate?.status || null,
      artifactCount: evidence.artifacts.length,
      screenshots: evidence.screenshotManifest?.screenshots || evidence.screenshotManifest?.items || [],
      acceptedFeatures: lineage.acceptedFeatures || [],
      rejectedFeatures: lineage.rejectedFeatures || [],
      testResults: lineage.testResults || evidence.gateReport?.commands || [],
      acceptanceGateResults: lineage.acceptanceGateResults || evidence.gateReport?.acceptance || {},
      acceptanceGateIds: lineage.acceptanceGateIds || (lineage.acceptanceGates || []).map((gate: any) => gate.id).filter(Boolean),
      nextRecommendedDirection: lineage.nextRecommendedDirection || evidence.run.nextRecommendedDirection || null,
      updatedAt: lineage.updatedAt || evidence.run.updatedAt || r.modifiedAt
    };
  });
  const runIds = new Set(runNodes.map((x: any) => x.runId).filter(Boolean));
  const pending = (stored.items || []).filter((x: any) => !x.runId || !runIds.has(x.runId)).map((x: any) => ({
    schemaVersion: "apb.iteration-node.v1",
    id: x.id || uid("iter"),
    runId: x.runId || null,
    sourceRunId: x.sourceRunId || null,
    parentIterationId: x.parentIterationId || null,
    forkedFromIterationId: x.forkedFromIterationId || null,
    mode: x.mode || "requested",
    objective: x.objective || "Requested autonomous iteration",
    steeringText: x.steeringText || null,
    status: x.status || "requested",
    repoPath: x.repoPath || null,
    artifactCount: 0,
    acceptedFeatures: x.acceptedFeatures || [],
    rejectedFeatures: x.rejectedFeatures || [],
    testResults: [],
    acceptanceGateResults: {},
    updatedAt: x.updatedAt || null
  }));
  return [...pending, ...runNodes];
}
function readOptionalJson(path: string, fallback: any = null) { return safeReadJson(path, fallback); }
type ArtifactLoadWarning = { path: string; reason: "missing" | "parse-error" | "too-large"; message?: string };
type LoadedArtifact = { path: string; size?: number; modifiedAt?: string; data: any };
function relStatePath(path: string) { return path.replace(STATE_ROOT, "").replace(/^\/+/, ""); }
function readJsonWithWarning(path: string, warnings: ArtifactLoadWarning[], fallback: any = null): any {
  try {
    if (!existsSync(path)) return fallback;
    const st = statSync(path);
    if (st.size > MAX_TEXT_BYTES) { warnings.push({ path: relStatePath(path), reason: "too-large", message: `${st.size} bytes` }); return fallback; }
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err: any) {
    warnings.push({ path: relStatePath(path), reason: "parse-error", message: err?.message || String(err) });
    return fallback;
  }
}
function readFirstArtifactJson(artifactsRoot: string, candidates: string[], warnings: ArtifactLoadWarning[], fallback: any = null): LoadedArtifact | null {
  for (const rel of candidates) {
    const path = safeJoin(artifactsRoot, ...rel.split("/").filter(Boolean));
    if (!existsSync(path)) continue;
    const st = statSync(path);
    return { path: `artifacts/${rel}`, size: st.size, modifiedAt: st.mtime.toISOString(), data: readJsonWithWarning(path, warnings, fallback) };
  }
  return null;
}
function readArtifactJsonFiles(artifactsRoot: string, dirNames: string[], warnings: ArtifactLoadWarning[]): LoadedArtifact[] {
  const out: LoadedArtifact[] = [];
  for (const dir of dirNames) {
    const abs = safeJoin(artifactsRoot, ...dir.split("/").filter(Boolean));
    if (!existsSync(abs)) continue;
    for (const file of listDir(abs, true).filter((x) => x.kind === "file" && x.name.endsWith(".json"))) {
      const rel = `${dir}/${file.name}`.replace(/\/+/g, "/");
      const path = safeJoin(artifactsRoot, ...rel.split("/").filter(Boolean));
      const st = statSync(path);
      out.push({ path: `artifacts/${rel}`, size: st.size, modifiedAt: st.mtime.toISOString(), data: readJsonWithWarning(path, warnings, { name: file.name }) });
    }
  }
  return out.sort((a, b) => String(a.path).localeCompare(String(b.path)));
}
function iterationDetail(iter: any) {
  const warnings: ArtifactLoadWarning[] = [];
  const runRoot = safeJoin(STATE_ROOT, "runs", iter.runId);
  const artifactsRoot = safeJoin(runRoot, "artifacts");
  const run = readJsonWithWarning(join(runRoot, "run.json"), warnings, { id: iter.runId });
  const iterationState = readJsonWithWarning(join(runRoot, "iteration-state.json"), warnings, null);
  const iterationArtifact = readFirstArtifactJson(artifactsRoot, ["iterations/iteration.json", "iteration.json"], warnings, null);
  const sourceEvidence = readFirstArtifactJson(artifactsRoot, ["source-evidence.json", "iterations/source-evidence.json", "iteration/source-evidence.json"], warnings, null);
  const variants = readArtifactJsonFiles(artifactsRoot, ["variants", "iterations/variants"], warnings);
  const evaluations = readArtifactJsonFiles(artifactsRoot, ["evaluations", "evals", "iterations/evaluations"], warnings);
  const synthesis = readFirstArtifactJson(artifactsRoot, ["synthesis/synthesis.json", "synthesis.json", "mashup/mashup-report.json", "comparison.json", "iterations/synthesis.json"], warnings, null);
  const gateArtifact = readFirstArtifactJson(artifactsRoot, ["gate-decisions.json", "gates/gate-decisions.json", "iterations/gate-decisions.json"], warnings, []);
  const gateReport = readFirstArtifactJson(artifactsRoot, ["gate-report.json"], warnings, null);
  const gatesDoc = readGates();
  const gateDecisionsFromControl = (gatesDoc.gates || []).flatMap((g: any) => (g.decisions || []).map((d: any) => ({ gateId: g.id, gate: g, decision: d }))).filter((x: any) => !x.decision?.runId || x.decision.runId === iter.runId);
  const variantsData = variants.map((x) => ({ ...(x.data || {}), _artifact: { path: x.path, size: x.size, modifiedAt: x.modifiedAt } }));
  const evaluationsData = evaluations.map((x) => ({ ...(x.data || {}), _artifact: { path: x.path, size: x.size, modifiedAt: x.modifiedAt } }));
  return {
    ...iter,
    schemaVersion: "apb.iteration-detail.v1",
    redaction: { enabled: true, stringMaxBytes: 50_000, maxArrayItems: 250, maxObjectEntries: 250 },
    run,
    iterationState,
    iterationArtifact,
    evidence: { sourceEvidence, variants, evaluations, synthesis, gateDecisions: { artifact: gateArtifact, controlPlane: gateDecisionsFromControl }, gateReport },
    sourceEvidence: sourceEvidence?.data ?? null,
    variants: variantsData,
    evaluations: evaluationsData,
    synthesis: synthesis?.data ?? null,
    gateDecisions: gateArtifact?.data ?? [],
    gateDecisionsFromControl,
    artifacts: existsSync(artifactsRoot) ? listDir(artifactsRoot, true).filter((x) => x.kind === "file") : [],
    logs: existsSync(join(runRoot, "logs")) ? listDir(join(runRoot, "logs")) : [],
    warnings
  };
}
function normalizeCommandTarget(type: string, raw: any) {
  if (["continue-from-iteration", "fork-from-iteration", "use-as-next-direction"].includes(type)) return { kind: "iteration", id: raw.iterationId || raw.sourceIterationId || null, runId: raw.runId || raw.sourceRunId || null };
  if (["gate-decision", "attach-gate-evidence", "update-gate"].includes(type)) return { kind: "gate", id: raw.id || raw.gateId || null, runId: raw.runId || null };
  if (["pin-queue-item", "archive-queue-item"].includes(type)) return { kind: "queue-item", id: raw.id || raw.itemId || null };
  if (type === "add-queue-item") return { kind: "queue-item", id: null };
  if (["pause", "hold", "resume", "unhold", "stop", "run-now", "steer", "deblock", "remove-steering", "set-current-objective", "start-next-iteration", "start-showcase-loop", "pause-showcase-loop", "resume-showcase-loop", "stop-showcase-loop", "set-showcase-target"].includes(type)) return { kind: "control", id: null };
  return { kind: "unknown", id: null };
}
function makeCommand(body: any, actor: string, type: string, payload: any) {
  return { schemaVersion: "apb.command.v2", id: uid("cmd"), ts: now(), actor, type, target: body.target || normalizeCommandTarget(type, payload), payload, status: "accepted", source: "dashboard", correlationId: body.correlationId || null, idempotencyKey: body.idempotencyKey || null };
}
function normalizeIterationRequestPayload(type: string, payload: any, control: any, actor: string) {
  const reqType = type === "fork-from-iteration" ? "fork" : type === "continue-from-iteration" ? "continue" : type === "use-as-next-direction" ? "use-as-next-direction" : "start_next_iteration";
  const sourceRunId = payload.sourceRunId || payload.runId || null;
  const sourceIterationIdRaw = payload.sourceIterationId || payload.iterationId || null;
  const sourceIter = sourceIterationIdRaw ? listIterations().find((x: any) => x.id === sourceIterationIdRaw) : listIterations().find((x: any) => x.runId === sourceRunId);
  return { schemaVersion: "apb.next-run-request.v1", id: uid("req"), type: reqType, status: "pending", sourceRunId, sourceIterationId: sourceIterationIdRaw || sourceIter?.id || null, repoPath: payload.repoPath || payload.baseRepoPath || sourceIter?.repoPath || null, baseRef: payload.baseRef || payload.baseCommit || sourceIter?.commit || "HEAD", queueItemId: payload.queueItemId || control.pinnedQueueItemId || null, objective: payload.objective || payload.text || sourceIter?.objective || control.currentObjective?.text || "", changeText: payload.change || payload.changeText || payload.directive || payload.notes || "", acceptanceGateIds: Array.isArray(payload.acceptanceGateIds) ? payload.acceptanceGateIds : (sourceIter?.acceptanceGateIds || []), snapshottedAcceptanceGates: Array.isArray(payload.snapshottedAcceptanceGates) ? payload.snapshottedAcceptanceGates : undefined, createdAt: now(), createdBy: actor, limits: payload.limits || control.autoIteration, sourceEvidencePolicy: payload.sourceEvidencePolicy || "load-from-source-run", validationPolicy: "runner-selected-only", expectedArtifacts: ["artifacts/lifecycle-contract.json", "artifacts/source-evidence.json", "artifacts/variants/*.json", "artifacts/evaluations/*.json", "artifacts/synthesis/synthesis.json", "artifacts/gate-decisions.json", "artifacts/handoff.json"] };
}
function iterationRequestErrors(req: any) {
  const errors: string[] = [];
  if (!req.repoPath || typeof req.repoPath !== "string" || !isAbsolute(req.repoPath)) errors.push("repoPath must be an absolute path");
  if (!String(req.objective || "").trim()) errors.push("objective is required");
  if (!String(req.changeText || "").trim()) errors.push("bounded changeText is required");
  if (!String(req.baseRef || "").trim()) errors.push("baseRef is required");
  const lineageRequest = ["continue", "fork", "use-as-next-direction"].includes(req.type);
  if (lineageRequest) {
    if (!req.sourceRunId) errors.push("sourceRunId is required for lineage requests");
    else if (typeof req.sourceRunId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(req.sourceRunId)) errors.push("sourceRunId must be a bounded ASCII identifier");
    if (!req.sourceIterationId) errors.push("sourceIterationId is required for lineage requests");
    const source = req.sourceIterationId ? listIterations().find((item: any) => item.id === req.sourceIterationId) : null;
    if (req.sourceIterationId && !source) errors.push("sourceIterationId does not identify a retained iteration");
    if (source && req.sourceRunId !== source.runId) errors.push("sourceRunId does not match sourceIterationId");
  }
  const bounds: Record<string, [number, number]> = { maxIterations: [1, 10], maxVariantsPerIteration: [1, 5], maxParallelVariants: [1, 5], maxAcceptedFeatures: [1, 4], maxVisualMotifChanges: [0, 1], maxNewSections: [0, 1], stopAfterNoImprovement: [1, 3] };
  if (!req.limits || typeof req.limits !== "object" || Array.isArray(req.limits)) errors.push("iteration limits are required");
  else {
    for (const [key, [minimum, maximum]] of Object.entries(bounds)) if (!Number.isInteger(req.limits[key]) || req.limits[key] < minimum || req.limits[key] > maximum) errors.push(`${key} must be an integer from ${minimum} through ${maximum}`);
    if (Number.isInteger(req.limits.maxParallelVariants) && Number.isInteger(req.limits.maxVariantsPerIteration) && req.limits.maxParallelVariants > req.limits.maxVariantsPerIteration) errors.push("maxParallelVariants cannot exceed maxVariantsPerIteration");
  }
  if (!Array.isArray(req.acceptanceGateIds) || req.acceptanceGateIds.some((id: any) => typeof id !== "string" || !id.trim())) errors.push("acceptanceGateIds must be an array of non-empty strings");
  else if (new Set(req.acceptanceGateIds).size !== req.acceptanceGateIds.length) errors.push("acceptanceGateIds must be unique");
  if (lineageRequest && (req.acceptanceGateIds?.length || req.snapshottedAcceptanceGates?.length)) {
    if (req.acceptanceGateIds?.length && !Array.isArray(req.snapshottedAcceptanceGates)) errors.push("snapshottedAcceptanceGates are required for lineage gate IDs");
    else {
      const snapshots = req.snapshottedAcceptanceGates || [];
      const snapshottedIds = new Set(snapshots.map((gate: any) => gate?.id));
      if (snapshottedIds.size !== snapshots.length) errors.push("snapshottedAcceptanceGates must have unique IDs");
      for (const id of req.acceptanceGateIds) if (!snapshottedIds.has(id)) errors.push(`acceptance gate ${id} is missing its source snapshot`);
      const sourceRunRoot = typeof req.sourceRunId === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(req.sourceRunId) ? safeJoin(STATE_ROOT, "runs", req.sourceRunId) : null;
      const sources = sourceRunRoot ? [
        safeReadJson(join(sourceRunRoot, "iteration-state.json"), null),
        safeReadJson(join(sourceRunRoot, "lifecycle-contract.json"), null),
        safeReadJson(join(sourceRunRoot, "artifacts", "lifecycle-contract.json"), null),
        safeReadJson(join(sourceRunRoot, "artifacts", "iterations", "iteration.json"), null)
      ] : [];
      const authoritative = sources.find((source: any) => Array.isArray(source?.acceptanceGates))?.acceptanceGates;
      if (authoritative) {
        const definition = (gate: any) => ({ id: gate?.id, description: gate?.description, severity: gate?.severity, required: gate?.required, requiredEvidence: gate?.requiredEvidence });
        const authoritativeById = new Map(authoritative.map((gate: any) => [gate?.id, gate]));
        for (const snapshot of snapshots) {
          const sourceGate = authoritativeById.get(snapshot?.id);
          if (!sourceGate) errors.push(`acceptance gate ${snapshot?.id || "<missing-id>"} is not defined by the source iteration`);
          else if (JSON.stringify(definition(snapshot)) !== JSON.stringify(definition(sourceGate))) errors.push(`acceptance gate ${snapshot.id} does not match the source iteration definition`);
        }
      }
    }
  }
  return errors;
}
function runArtifactError(runId: any, artifacts: any) {
  if (typeof runId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(runId)) return "runId must be a bounded ASCII identifier";
  if (!Array.isArray(artifacts)) return "artifact paths must be an array";
  const runRoot = safeJoin(STATE_ROOT, "runs", runId);
  if (!existsSync(runRoot) || !statSync(runRoot).isDirectory()) return `run ${runId} is not retained`;
  const artifactsRoot = join(runRoot, "artifacts");
  if (!existsSync(artifactsRoot) || !statSync(artifactsRoot).isDirectory()) return `run ${runId} has no retained artifact root`;
  const realArtifactsRoot = realpathSync(artifactsRoot);
  for (const value of artifacts) {
    if (typeof value !== "string" || !value.trim()) return "artifact paths must be non-empty strings";
    const path = value.startsWith("artifacts/") ? value.slice("artifacts/".length) : value;
    if (path.includes("\0") || path.includes("\\") || isAbsolute(path) || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(path) || path.split("/").some((part) => !part || part === "." || part === "..")) return `artifact path ${value} is not a safe relative path`;
    const target = safeJoin(artifactsRoot, ...path.split("/"));
    if (!existsSync(target) || !statSync(target).isFile()) return `artifact ${value} does not exist for run ${runId}`;
    const realTarget = realpathSync(target);
    if (realTarget !== realArtifactsRoot && !realTarget.startsWith(realArtifactsRoot + sep)) return `artifact path ${value} escapes the run artifact root`;
  }
  return null;
}
function appendRunGateDecision(runId: string, decision: any) {
  const path = safeJoin(STATE_ROOT, "runs", runId, "artifacts", "gate-decisions.json");
  const existing = safeReadJson(path, []);
  const arr = Array.isArray(existing) ? existing : [];
  writeJson(path, [decision, ...arr].slice(0, 100));
}

function upsertIterationFromRequest(req: any, status = "requested") {
  return withProjectionLock(STATE_ROOT, () => {
    const doc = safeReadJson(paths.iterations, { schemaVersion: "apb.iterations.v1", items: [] });
    if (!Array.isArray(doc.items)) doc.items = [];
    const id = req.id || uid("iter");
    const old = doc.items.find((x: any) => x.id === id);
    const row = { ...(old || {}), id, runId: req.resultRunId || old?.runId || null, sourceRunId: req.sourceRunId || old?.sourceRunId || null, parentIterationId: req.type === "continue" ? (req.sourceIterationId || null) : old?.parentIterationId || null, forkedFromIterationId: req.type === "fork" ? (req.sourceIterationId || null) : old?.forkedFromIterationId || null, mode: req.type || old?.mode || "continue", objective: req.objective || old?.objective || "Continue autonomous iteration", steeringText: req.changeText || req.notes || old?.steeringText || null, repoPath: req.repoPath || old?.repoPath || null, generation: req.generation || old?.generation || null, targetGenerations: req.targetGenerations || old?.targetGenerations || req.limits?.targetGenerations || null, status, updatedAt: now() };
    if (old) Object.assign(old, row); else doc.items.unshift(row);
    doc.updatedAt = now(); writeJson(paths.iterations, doc);
    return row;
  });
}

function tailFile(path: string, lines = 400) {
  const body = readTailUtf8(path, MAX_TEXT_BYTES);
  return body.split(/\r?\n/).slice(-lines).join("\n");
}
function contentTypeFor(path: string) {
  const ext = extname(path).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js" || ext === ".ts") return "application/javascript; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  return "text/plain; charset=utf-8";
}
async function staticFile(pathname: string) {
  const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const path = safeJoin(PUBLIC_ROOT, rel);
  if (!existsSync(path) || statSync(path).isDirectory()) return notFound();
  return new Response(Bun.file(path), { headers: { "content-type": contentTypeFor(path), "cache-control": "no-store" } });
}

function defaultControl() {
  return {
    schemaVersion: "apb.control.v1",
    updatedAt: now(),
    desiredMode: "running",
    runAdmission: "enabled",
    pause: { requested: false, mode: "checkpoint", reason: null },
    stop: { requested: false, mode: null, reason: null },
    activeSteering: [],
    pinnedQueueItemId: null,
    requestedRunNow: false,
    currentObjective: null,
    nextRunRequest: null,
    autoIteration: { enabled: false, mode: "manual", targetGenerations: 10, completedGenerations: 0, currentGeneration: 0, lineageRootIterationId: null, catalogueScope: null, repoPath: null, objective: null, maxIterations: 10, maxVariantsPerIteration: 3, maxParallelVariants: 3, maxAcceptedFeatures: 4, maxVisualMotifChanges: 1, maxNewSections: 1, stopAfterNoImprovement: 1, minImprovementScore: 0.05, lastRunId: null, lastIterationId: null, lastCommit: null, lastBranch: null, startedAt: null, completedAt: null, stoppedAt: null, stopReason: null },
    safety: { requireApprovalBeforePublish: true, requireApprovalBeforePush: true, allowDestructiveGit: false, maxRunHours: 24 }
  };
}
function defaultQueue() { return { schemaVersion: "apb.queue.v1", updatedAt: now(), items: [] as any[] }; }
function defaultGates() { return { schemaVersion: "apb.gates.v1", updatedAt: now(), gates: [] as any[] }; }
function readControl() { return { ...defaultControl(), ...safeReadJson(paths.control, defaultControl()) }; }
function readQueue() { const q = safeReadJson(paths.queue, defaultQueue()); if (!Array.isArray(q.items)) q.items = []; return { ...defaultQueue(), ...q, items: q.items }; }
function readGates() { const g = safeReadJson(paths.gates, defaultGates()); if (!Array.isArray(g.gates)) g.gates = []; return { ...defaultGates(), ...g, gates: g.gates }; }
function activeBlocker(state: any) {
  return state.block || state.blocker || state.hold || (Array.isArray(state.blockers) ? state.blockers[0] : null) || (["blocked", "on-hold"].includes(state.status) ? { status: state.status, phase: state.phase } : null);
}
function currentRecoveryError(state: any, runId: any) {
  if (!runId || typeof runId !== "string") return json({ error: "runId is required for current-run recovery" }, 400);
  if (!state.currentRunId || runId !== state.currentRunId) return json({ error: "recovery runId does not match the current run", currentRunId: state.currentRunId || null }, 409);
  const blocker = activeBlocker(state);
  if (!blocker) return json({ error: "the current run is not blocked or on hold" }, 409);
  if (typeof blocker === "object" && blocker.runId && blocker.runId !== runId) return json({ error: "the active blocker belongs to a different run", blockerRunId: blocker.runId }, 409);
  return null;
}
function blockerSignature(blocker: any) {
  if (!blocker || typeof blocker !== "object") return String(blocker || "");
  return JSON.stringify(Object.fromEntries(["id", "blockerId", "runId", "agentId", "toolCallId", "reason", "message", "phase", "status"].filter((key) => blocker[key] != null).map((key) => [key, blocker[key]])));
}
function requiredEvidence(value: any) {
  if (value == null) return [];
  const entries = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\r?\n/) : null;
  if (!entries) return null;
  return entries.map((item: any) => String(item).trim()).filter(Boolean);
}
function writeControl(c: any) {
  withProjectionLock(STATE_ROOT, () => {
    const current = safeReadJson(paths.control, {}), currentPointer = current.projectLaunchRequest, incomingPointer = c.projectLaunchRequest;
    const rank = (status: any) => status === "pending" ? 0 : status === "running" ? 1 : ["completed", "paused", "blocked", "rejected"].includes(status) ? 2 : -1;
    const preservePointer = currentPointer && (!incomingPointer || (currentPointer.launchId === incomingPointer.launchId && rank(currentPointer.status) > rank(incomingPointer.status)));
    const next = { ...current, ...c, ...(preservePointer ? { projectLaunchRequest: currentPointer } : {}) };
    next.schemaVersion = "apb.control.v1"; next.updatedAt = now(); writeJson(paths.control, next);
  });
}
function writeQueue(q: any) { q.schemaVersion = "apb.queue.v1"; q.updatedAt = now(); q.items = (q.items || []).sort((a: any, b: any) => (b.priority || 0) - (a.priority || 0) || (a.rank || 9999) - (b.rank || 9999)); writeJson(paths.queue, q); }
function writeGates(g: any) { g.schemaVersion = "apb.gates.v1"; g.updatedAt = now(); writeJson(paths.gates, g); }
function runnerParity() {
  const receipt = safeReadJson(paths.runnerParity, null);
  if (!receipt || receipt.schemaVersion !== "apb.runner-parity.v1") return { status: "unverified", protocol: RUNNER_PARITY_PROTOCOL, reason: "No runner parity receipt has been written by the installed runner." };
  if (receipt.protocol !== RUNNER_PARITY_PROTOCOL || typeof receipt.sourceDigest !== "string") return { status: "incompatible", protocol: RUNNER_PARITY_PROTOCOL, receipt };
  if (!existsSync(RUNNER_PATH)) return { status: "unverified", protocol: RUNNER_PARITY_PROTOCOL, receipt, reason: "The configured installed runner path is unavailable for digest verification." };
  const installedDigest = createHash("sha256").update(readFileSync(RUNNER_PATH)).digest("hex");
  return { status: installedDigest === receipt.sourceDigest ? "compatible" : "incompatible", protocol: RUNNER_PARITY_PROTOCOL, receipt, installedDigest };
}
function isQueueLinkedSteering(steering: any, queueItemIds: Set<string>) {
  return steering?.scope === "queue" || steering?.scope === "queue_item" || queueItemIds.has(steering?.queueItemId) || queueItemIds.has(steering?.target?.queueItemId) || (Array.isArray(steering?.queueItemIds) && steering.queueItemIds.some((id: any) => queueItemIds.has(id)));
}
function readAudit(limit = 100) {
  const lines = readTailUtf8(paths.audit, 1_000_000).split(/\r?\n/).filter(Boolean).slice(-clampLimit(limit));
  return lines.map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
}
function commandAck(command: any, result: any = {}) {
  appendJsonl(paths.commands, command);
  appendJsonl(paths.audit, { schemaVersion: "apb.audit.v1", id: uid("audit"), ts: now(), actor: command.actor, action: command.type, target: command.target, payload: command.payload, result });
  appendJsonl(paths.events, { id: uid("evt"), ts: now(), level: "info", source: "operator", type: "operator-command", message: `${command.type} accepted`, data: { commandId: command.id, type: command.type, result } });
  return { commandId: command.id, status: "accepted", ...result };
}
function queueItemText(item: any) {
  const gates = readGates().gates.filter((g: any) => (item.acceptanceGateIds || []).includes(g.id));
  return [`# ${item.title || "Queued autonomous project"}`, "", `Objective: ${item.objective || ""}`, "", item.context ? `Context: ${item.context}` : "", "", "Constraints:", ...(item.constraints || []).map((x: string) => `- ${x}`), "", "Acceptance gates:", ...gates.map((g: any) => `- ${g.id}: ${g.description || g.title || "gate"}`), "", item.target?.preferredRepo ? `Preferred repo: ${item.target.preferredRepo}` : ""].filter(Boolean).join("\n");
}
async function readJsonBody(req: Request) { try { return await req.json(); } catch { return {}; } }
async function requestDeblockAdvice(prompt: string, blocker: unknown) {
  const hermes = process.env.HERMES_BIN || join(homedir(), ".local", "bin", "hermes");
  const query = `You are a local autonomous-workflow recovery adviser. The operator needs advice for a blocked run. Give a concise, safe recovery recommendation: identify the likely cause, the smallest non-destructive repair, what evidence to verify, and whether to continue or fork. Do not claim to execute anything.\n\nBLOCKER_JSON=${JSON.stringify(blocker)}\nOPERATOR_PROMPT_JSON=${JSON.stringify(prompt)}`;
  const proc = Bun.spawn([hermes, "--profile", "apbplanner", "chat", "--quiet", "--safe-mode", "--source", "autonomous-project-deblock-advice", "--max-turns", "4", "--toolsets", "web", "--query", query], { cwd: STATE_ROOT, env: Object.fromEntries(["PATH", "HOME", "TMPDIR"].filter((key) => process.env[key]).map((key) => [key, process.env[key]!])), stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; try { proc.kill(); } catch {} }, 120_000);
  try {
    const [code, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
    if (timedOut) throw new Error("advice request timed out after 120 seconds");
    if (code !== 0) throw new Error(`advice request failed: ${redactString(stderr).slice(0, 500)}`);
    const answer = redactString(stdout).trim();
    if (!answer) throw new Error("advice request returned no answer");
    return answer.slice(0, 24_000);
  } finally { clearTimeout(timer); }
}
async function handleCommand(req: Request) {
  const body = await readJsonBody(req);
  const type = String(body.type || "");
  const payload = body.payload || body;
  const actor = body.actor || "dashboard-user";
  const command = makeCommand(body, actor, type, payload);
  const control = readControl(); const queue = readQueue(); const gates = readGates();
  if (["pause", "pause-showcase-loop"].includes(type)) { control.pause = { requested: true, mode: payload.mode || "checkpoint", requestedBy: actor, requestedAt: now(), reason: payload.reason || null }; writeControl(control); return json(commandAck(command, { effective: "next_checkpoint", autoIteration: control.autoIteration })); }
  if (type === "hold") { control.runAdmission = "paused"; writeControl(control); return json(commandAck(command, { effective: "new_runs_held", autoIteration: control.autoIteration })); }
  if (["resume", "resume-showcase-loop"].includes(type)) { control.pause = { requested: false, mode: "checkpoint", reason: null }; control.stop = { requested: false, mode: null, reason: null }; control.runAdmission = "enabled"; if(type === "resume-showcase-loop") control.autoIteration = { ...(control.autoIteration || {}), enabled: true, mode: control.autoIteration?.mode || "showcase-loop", updatedAt: now() }; writeControl(control); return json(commandAck(command, { effective: "immediate", autoIteration: control.autoIteration })); }
  if (type === "unhold") { control.runAdmission = "enabled"; writeControl(control); return json(commandAck(command, { effective: "new_runs_enabled", autoIteration: control.autoIteration })); }
  if (["stop", "stop-showcase-loop"].includes(type)) { control.stop = { requested: true, mode: payload.mode || "graceful", requestedBy: actor, requestedAt: now(), reason: payload.reason || null }; if(type === "stop-showcase-loop") { control.autoIteration = { ...(control.autoIteration || {}), enabled: false, stoppedAt: now(), stopReason: payload.reason || "dashboard-stop-showcase-loop", updatedAt: now() }; control.nextRunRequest = null; control.requestedRunNow = false; } writeControl(control); return json(commandAck(command, { effective: "next_checkpoint", autoIteration: control.autoIteration })); }
  if (type === "set-showcase-target") { const targetGenerations = Math.min(Math.max(Number(payload.targetGenerations || 10), 1), 10); control.autoIteration = { ...(control.autoIteration || {}), targetGenerations, maxIterations: targetGenerations, updatedAt: now() }; writeControl(control); return json(commandAck(command, { autoIteration: control.autoIteration })); }
  if (type === "start-showcase-loop") {
    const targetGenerations = Math.min(Math.max(Number(payload.targetGenerations || payload.limits?.maxIterations || 10), 1), 10);
    const repoPath = payload.repoPath || payload.baseRepoPath || "/home/mojo/autonomous-projects/hermes-showcase-site";
    const objective = payload.objective || payload.text || control.currentObjective?.text || "Build the Hermes Unique Showcase Website through a visible 10-generation catalogue loop";
    const limits = { ...(control.autoIteration || {}), ...(payload.limits || {}), maxIterations: targetGenerations, targetGenerations, maxVariantsPerIteration: Math.min(Math.max(Number(payload.limits?.maxVariantsPerIteration || payload.maxVariantsPerIteration || 3), 1), 5), maxParallelVariants: Math.min(Math.max(Number(payload.limits?.maxParallelVariants || payload.maxParallelVariants || 3), 1), 5), maxAcceptedFeatures: Math.min(Math.max(Number(payload.limits?.maxAcceptedFeatures || payload.maxAcceptedFeatures || 4), 1), 4), maxVisualMotifChanges: Math.min(Math.max(Number(payload.limits?.maxVisualMotifChanges || payload.maxVisualMotifChanges || 1), 0), 1), maxNewSections: Math.min(Math.max(Number(payload.limits?.maxNewSections || payload.maxNewSections || 1), 0), 1), stopAfterNoImprovement: Math.min(Math.max(Number(payload.limits?.stopAfterNoImprovement || payload.stopAfterNoImprovement || 1), 1), 3), minImprovementScore: Number(payload.limits?.minImprovementScore || payload.minImprovementScore || 0.05) };
    const acceptanceGateIds = Array.isArray(payload.acceptanceGateIds) ? payload.acceptanceGateIds : gates.gates.map((gate: any) => gate.id).filter(Boolean);
    control.autoIteration = { ...(control.autoIteration || {}), ...limits, enabled: true, mode: "showcase-loop", repoPath, objective, acceptanceGateIds, targetGenerations, maxIterations: targetGenerations, completedGenerations: 0, currentGeneration: 1, sourceRunId: payload.sourceRunId || payload.runId || null, sourceIterationId: payload.sourceIterationId || payload.iterationId || null, lineageRootIterationId: payload.sourceIterationId || payload.iterationId || null, catalogueScope: payload.catalogueScope || { repoPath, objectiveKey: objective }, startedAt: now(), completedAt: null, stoppedAt: null, stopReason: null, updatedAt: now() };
    control.pause = { requested: false, mode: "checkpoint", reason: null }; control.stop = { requested: false, mode: null, reason: null }; control.runAdmission = "enabled";
    const req = normalizeIterationRequestPayload("start-next-iteration", { ...payload, repoPath, objective, acceptanceGateIds, baseRef: payload.baseRef || "HEAD", changeText: payload.changeText || `Generation 1/${targetGenerations}: start a bounded same-site showcase catalogue loop.`, limits }, control, actor);
    const requestErrors = iterationRequestErrors(req); if (requestErrors.length) return json({ error: "invalid managed launch request", details: requestErrors }, 400);
    req.type = "showcase-loop-generation"; req.generation = 1; req.targetGenerations = targetGenerations;
    control.nextRunRequest = req; control.requestedRunNow = true; control.currentObjective = { text: objective, source: "showcase-loop", queueItemId: req.queueItemId, runId: req.sourceRunId, updatedAt: now(), updatedBy: actor };
    upsertIterationFromRequest(req, "requested"); writeControl(control); return json(commandAck(command, { autoIteration: control.autoIteration, nextRunRequest: req, effective: "next_runner_tick" }));
  }
  if (type === "steer") { const steeringText = String(payload.text || payload.objective || "").trim(); if (!steeringText) return json({ error: "steering text is required" }, 400); const steer = { id: uid("steer"), scope: payload.scope || "next_run", priority: payload.priority || "required", text: steeringText, createdBy: actor, createdAt: now(), expires: payload.expires || { type: "until_removed" } }; control.activeSteering = [steer, ...(control.activeSteering || [])].slice(0, 20); writeControl(control); return json(commandAck(command, { steeringId: steer.id })); }
  if (type === "deblock") {
    const prompt = String(payload.prompt || payload.text || "").trim();
    if (!prompt) return json({ error: "a deblock prompt is required" }, 400);
    if (Buffer.byteLength(prompt) > 8_000) return json({ error: "deblock prompt exceeds 8000 bytes" }, 413);
    const state = readState();
    const recoveryError = currentRecoveryError(state, payload.runId); if (recoveryError) return recoveryError;
    const request = { id: uid("deblock"), prompt, runId: payload.runId, blocker: activeBlocker(state), status: "pending", requestedBy: actor, requestedAt: now() };
    const steer = { id: uid("steer"), scope: "current_run", priority: "required", text: `DEBLOCK REQUEST ${request.id}: ${prompt}`, createdBy: actor, createdAt: request.requestedAt, expires: { type: "until_removed" }, deblockRequestId: request.id };
    control.deblockRequests = [request, ...(Array.isArray(control.deblockRequests) ? control.deblockRequests : [])].slice(0, 20);
    control.activeSteering = [steer, ...(control.activeSteering || [])].slice(0, 20);
    control.requestedRunNow = true;
    writeControl(control);
    if (state.status === "blocked" || state.status === "on-hold") { state.status = "deblocking"; state.phase = "deblocking"; state.lastAction = `Operator supplied deblock request ${request.id}; runner should evaluate it before further work.`; writeState(state); }
    return json(commandAck(command, { deblockRequest: request, steeringId: steer.id, effective: "current-run steering queued" }));
  }
  if (type === "deblock-advice") {
    const prompt = String(payload.prompt || "").trim() || "Analyze the reported blocker, inspect the available evidence, and recommend the smallest safe recovery path.";
    if (Buffer.byteLength(prompt) > 8_000) return json({ error: "advice question exceeds 8000 bytes" }, 413);
    const state = readState(); const recoveryError = currentRecoveryError(state, payload.runId); if (recoveryError) return recoveryError; const blocker = activeBlocker(state);
    try {
      const advice = { id: uid("advice"), runId: payload.runId, prompt, blocker, answer: await requestDeblockAdvice(prompt, blocker), status: "pending", requestedBy: actor, requestedAt: now() };
      control.deblockAdvice = [advice, ...(Array.isArray(control.deblockAdvice) ? control.deblockAdvice : [])].slice(0, 20);
      writeControl(control);
      return json(commandAck(command, { advice, effective: "operator review required" }));
    } catch (error: any) { return json({ error: `advice request failed: ${error?.message || error}` }, 502); }
  }
  if (["approve-deblock-advice", "deny-deblock-advice"].includes(type)) {
    const advice = (control.deblockAdvice || []).find((item: any) => item.id === payload.adviceId);
    if (!payload.adviceId) return json({ error: "adviceId is required" }, 400);
    if (!advice) return json({ error: `deblock advice ${payload.adviceId} not found` }, 404);
    if (advice.status !== "pending") return json({ error: `deblock advice ${payload.adviceId} is already ${advice.status}` }, 409);
    if (type === "approve-deblock-advice") {
      const state = readState();
      const recoveryError = currentRecoveryError(state, advice.runId); if (recoveryError) return recoveryError;
      const currentBlocker = activeBlocker(state);
      if (advice.blocker && blockerSignature(advice.blocker) !== blockerSignature(currentBlocker)) return json({ error: "deblock advice no longer matches the current blocker" }, 409);
      if (!String(advice.answer || "").trim()) return json({ error: "deblock advice has no recommendation to approve" }, 409);
    }
    advice.status = type === "approve-deblock-advice" ? "approved" : "denied"; advice.decidedAt = now(); advice.decidedBy = actor;
    if (advice.status === "approved") {
      const state = readState(); const runId = advice.runId; const request = { id: uid("deblock"), prompt: advice.answer, runId, blocker: activeBlocker(state), status: "pending", requestedBy: actor, requestedAt: now(), adviceId: advice.id };
      control.deblockRequests = [request, ...(Array.isArray(control.deblockRequests) ? control.deblockRequests : [])].slice(0, 20);
      control.activeSteering = [{ id: uid("steer"), scope: "current_run", priority: "required", text: `APPROVED DEBLOCK ADVICE ${advice.id}: ${advice.answer}`, createdBy: actor, createdAt: request.requestedAt, expires: { type: "until_removed" }, deblockRequestId: request.id }, ...(control.activeSteering || [])].slice(0, 20);
      const sourceIter = listIterations().find((item: any) => item.runId === runId);
      const sourceState = runId ? safeReadJson(safeJoin(STATE_ROOT, "runs", runId, "iteration-state.json"), {}) : {};
      const sourceLimits = sourceState.limits || sourceIter?.limits || control.autoIteration;
      const sourceGates = Array.isArray(sourceState.acceptanceGates) ? sourceState.acceptanceGates : [];
      const continuation = normalizeIterationRequestPayload("continue-from-iteration", {
        runId, sourceRunId: runId, sourceIterationId: sourceIter?.id || sourceIter?.iterationId || null,
        repoPath: sourceState.repoPath || sourceIter?.repoPath, baseRef: sourceState.baseRef || sourceIter?.baseRef || sourceIter?.commit || "HEAD",
        objective: sourceState.objective || sourceIter?.objective || control.currentObjective?.text || "",
        changeText: `Execute approved deblock advice ${advice.id}: ${advice.answer}`,
        acceptanceGateIds: sourceGates.map((gate: any) => gate.id).filter(Boolean).length ? sourceGates.map((gate: any) => gate.id) : (sourceIter?.acceptanceGateIds || []),
        snapshottedAcceptanceGates: sourceGates, limits: sourceLimits
      }, control, actor);
      const errors = iterationRequestErrors(continuation);
      if (errors.length) return json({ error: "approved deblock advice could not be converted into a continuation", details: errors }, 409);
      control.nextRunRequest = continuation;
      control.requestedRunNow = true;
      upsertIterationFromRequest(continuation, "requested");
      if (state.status === "blocked" || state.status === "on-hold") { state.status = "deblocking"; state.phase = "deblocking"; state.lastAction = `Approved deblock advice ${advice.id}; continuation ${continuation.id} queued for the next runner tick.`; writeState(state); }
    }
    writeControl(control);
    return json(commandAck(command, { adviceId: advice.id, status: advice.status, nextRunRequest: advice.status === "approved" ? control.nextRunRequest : null, effective: advice.status === "approved" ? "continuation queued" : "no run changes" }));
  }
  if (type === "remove-steering") { const id = payload.id || payload.steeringId; if (!id) return json({ error: "steering id is required" }, 400); if (!(control.activeSteering || []).some((x: any) => x.id === id)) return json({ error: `active steering ${id} not found` }, 404); control.activeSteering = (control.activeSteering || []).filter((x: any) => x.id !== id); writeControl(control); return json(commandAck(command, { removedSteeringId: id })); }
  if (type === "set-current-objective") { const objective = String(payload.text || payload.objective || "").trim(); if (!objective) return json({ error: "objective text is required" }, 400); control.currentObjective = { text: objective, source: payload.source || "operator", queueItemId: payload.queueItemId || null, runId: payload.runId || null, updatedAt: now(), updatedBy: actor }; writeControl(control); return json(commandAck(command, { currentObjective: control.currentObjective })); }
  if (["start-next-iteration", "continue-from-iteration", "fork-from-iteration", "use-as-next-direction"].includes(type)) {
    const req = normalizeIterationRequestPayload(type, payload, control, actor);
    const requestErrors = iterationRequestErrors(req); if (requestErrors.length) return json({ error: "invalid managed launch request", details: requestErrors }, 400);
    control.nextRunRequest = req; control.requestedRunNow = true; if (req.objective) control.currentObjective = { text: req.objective, source: req.type, queueItemId: req.queueItemId, runId: req.sourceRunId, updatedAt: now(), updatedBy: actor };
    upsertIterationFromRequest(req, "requested"); writeControl(control); return json(commandAck(command, { nextRunRequest: req, effective: "next_runner_tick" }));
  }
  if (type === "gate-decision") {
    const id = payload.id || payload.gateId;
    if (!id) return json({ error: "gate id is required" }, 400);
    if (!gates.gates.some((gate: any) => gate.id === id)) return json({ error: `gate ${id} not found` }, 404);
    if (payload.runId) { const error = runArtifactError(payload.runId, payload.evidenceArtifacts || []); if (error) return json({ error }, 400); }
    const decision = { schemaVersion: "apb.gate-decision.v1", id: uid("decision"), gateId: id, runId: payload.runId || null, status: payload.status || "needs-evidence", decision: payload.decision || payload.status || "noted", evidenceArtifacts: payload.evidenceArtifacts || [], notes: payload.notes || "", decidedAt: now(), decidedBy: actor };
    for (const gate of gates.gates) if (gate.id === id) { gate.decisions = [decision, ...(gate.decisions || [])].slice(0, 20); gate.status = decision.status; gate.updatedAt = now(); gate.updatedBy = actor; }
    writeGates(gates); if (decision.runId) appendRunGateDecision(decision.runId, decision); return json(commandAck(command, { gateId: id, decision }));
  }
  if (type === "attach-gate-evidence") { const id = payload.id || payload.gateId; if (!id) return json({ error: "gate id is required" }, 400); if (!gates.gates.some((gate: any) => gate.id === id)) return json({ error: `gate ${id} not found` }, 404); const artifacts = payload.artifacts || payload.evidenceArtifacts || []; if (payload.runId) { const error = runArtifactError(payload.runId, artifacts); if (error) return json({ error }, 400); } for (const gate of gates.gates) if (gate.id === id) { gate.evidence = [{ id: uid("evidence"), runId: payload.runId || null, artifacts, notes: payload.notes || "", attachedAt: now(), attachedBy: actor }, ...(gate.evidence || [])].slice(0, 30); gate.updatedAt = now(); gate.updatedBy = actor; } writeGates(gates); return json(commandAck(command, { gateId: id })); }
  if (type === "run-now") { control.requestedRunNow = true; writeControl(control); return json(commandAck(command, { effective: "next_runner_tick" })); }
  if (type === "add-queue-item") { const objective = String(payload.objective || "").trim(); if (!objective) return json({ error: "queue item objective is required" }, 400); const item = { id: uid("queue"), rank: queue.items.length + 1, priority: Number(payload.priority || 50), status: payload.pin ? "pinned" : "queued", title: payload.title || "Untitled project", objective, context: payload.context || "", constraints: String(payload.constraints || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean), acceptanceGateIds: payload.acceptanceGateIds || [], target: payload.target || {}, createdBy: actor, createdAt: now(), updatedAt: now(), source: payload.source || "dashboard" }; queue.items.push(item); if (payload.pin) control.pinnedQueueItemId = item.id; writeQueue(queue); writeControl(control); return json(commandAck(command, { item })); }
  if (type === "clear-queue") {
    const clearedAt = now(), items = queue.items || [], queueItemIds = new Set(items.map((item: any) => item.id).filter(Boolean));
    if (control.pinnedQueueItemId) queueItemIds.add(control.pinnedQueueItemId);
    const activeSteering = Array.isArray(control.activeSteering) ? control.activeSteering : [];
    const retiredSteering = activeSteering.filter((steering: any) => isQueueLinkedSteering(steering, queueItemIds));
    control.activeSteering = activeSteering.filter((steering: any) => !retiredSteering.includes(steering));
    if (retiredSteering.length) control.steeringHistory = [...(Array.isArray(control.steeringHistory) ? control.steeringHistory : []), ...retiredSteering.map((steering: any) => ({ ...steering, status: "cleared", clearedAt, clearedBy: actor, clearedReason: "queue-cleared" }))].slice(-100);
    control.pinnedQueueItemId = null; control.currentObjective = null; control.nextRunRequest = null; control.requestedRunNow = false;
    queue.items = []; queue.clearHistory = [...(Array.isArray(queue.clearHistory) ? queue.clearHistory : []), { id: uid("queue-clear"), clearedAt, clearedBy: actor, items }].slice(-20);
    writeQueue(queue); writeControl(control);
    return json(commandAck(command, { clearedQueueItemCount: items.length, clearedSteeringCount: retiredSteering.length, runnerParity: runnerParity() }));
  }
  if (type === "pin-queue-item") { const id = payload.id || payload.itemId; if (!id) return json({ error: "queue item id is required" }, 400); const item = queue.items.find((x: any) => x.id === id); if (!item) return json({ error: `queue item ${id} not found` }, 404); if (item.status === "archived") return json({ error: `queue item ${id} is archived` }, 409); if (control.pinnedQueueItemId === id && item.status === "pinned") return json({ error: `queue item ${id} is already pinned` }, 409); for (const row of queue.items) row.status = row.id === id ? "pinned" : (row.status === "pinned" ? "queued" : row.status); control.pinnedQueueItemId = id; writeQueue(queue); writeControl(control); writeFileSync(paths.idea, queueItemText(item)); return json(commandAck(command, { pinnedQueueItemId: id, exportedIdeaTxt: true })); }
  if (type === "archive-queue-item") { const id = payload.id || payload.itemId; if (!id) return json({ error: "queue item id is required" }, 400); const item = queue.items.find((x: any) => x.id === id); if (!item) return json({ error: `queue item ${id} not found` }, 404); if (item.status === "archived") return json({ error: `queue item ${id} is already archived` }, 409); item.status = "archived"; if (control.pinnedQueueItemId === id) control.pinnedQueueItemId = null; writeQueue(queue); writeControl(control); return json(commandAck(command, { archived: id })); }
  if (type === "add-gate") { const evidence = requiredEvidence(payload.requiredEvidence); if (!evidence) return json({ error: "requiredEvidence must be an array or newline-delimited string" }, 400); const gate = { id: payload.id || uid("gate"), phase: payload.phase || "final-audit", severity: payload.severity || "must", description: payload.description || payload.title || "Acceptance gate", requiredEvidence: evidence, status: "pending", createdAt: now(), createdBy: actor }; const added = withProjectionLock(STATE_ROOT, () => { const current = readGates(); if (current.gates.some((row: any) => row.id === gate.id)) return false; current.gates.push(gate); writeGates(current); return true; }); if (!added) return json({ error: `gate ${gate.id} already exists` }, 409); return json(commandAck(command, { gate })); }
  if (type === "update-gate") { const id = payload.id || payload.gateId; if (!id) return json({ error: "gate id is required" }, 400); const gate = gates.gates.find((row: any) => row.id === id); if (!gate) return json({ error: `gate ${id} not found` }, 404); const allowed = new Set(["phase", "severity", "description", "requiredEvidence"]); const prohibited = Object.keys(payload).filter((key) => !["id", "gateId"].includes(key) && !allowed.has(key)); if (prohibited.length) return json({ error: `update-gate cannot mutate fields: ${prohibited.join(", ")}` }, 400); const updates = Object.fromEntries(Object.entries(payload).filter(([key]) => allowed.has(key))); if (!Object.keys(updates).length) return json({ error: `gate ${id} update has no definition fields` }, 400); if ("requiredEvidence" in updates) { const evidence = requiredEvidence(updates.requiredEvidence); if (!evidence) return json({ error: "requiredEvidence must be an array or newline-delimited string" }, 400); updates.requiredEvidence = evidence; } const changed = Object.entries(updates).some(([key, value]) => JSON.stringify(gate[key]) !== JSON.stringify(value)); if (!changed) return json({ error: `gate ${id} update has no changes` }, 409); Object.assign(gate, updates, { updatedAt: now(), updatedBy: actor }); writeGates(gates); return json(commandAck(command, { gateId: id })); }
  return json({ error: `unknown command type ${type}` }, 400);
}

async function route(req: Request): Promise<Response> {
  const url = new URL(req.url);
  try {
    if (url.pathname === "/api/state") return json(readState());
    if (url.pathname === "/api/project-plans" && req.method === "GET") return json(projectPlans.list());
    if (url.pathname === "/api/plan-assistance" && req.method === "GET") return json(planAssistance.list());
    if (url.pathname === "/api/plan-assistance" && req.method === "POST") return json(planAssistance.create(await readJsonBody(req)), 201);
    const assistanceMessageMatch = url.pathname.match(/^\/api\/plan-assistance\/([^/]+)\/messages$/);
    if (assistanceMessageMatch && req.method === "POST") return json(await planAssistance.message(decodeURIComponent(assistanceMessageMatch[1]), await readJsonBody(req)));
    const assistanceMatch = url.pathname.match(/^\/api\/plan-assistance\/([^/]+)$/);
    if (assistanceMatch && req.method === "GET") return json(planAssistance.detail(decodeURIComponent(assistanceMatch[1])));
    if (url.pathname === "/api/project-plans/commands" && req.method === "POST") return json(projectPlans.command(await readJsonBody(req)));
    const planRevisionMatch = url.pathname.match(/^\/api\/project-plans\/([^/]+)\/revisions\/(\d+)$/);
    if (planRevisionMatch && req.method === "GET") return json(projectPlans.getRevision(decodeURIComponent(planRevisionMatch[1]), Number(planRevisionMatch[2])));
    const planMatch = url.pathname.match(/^\/api\/project-plans\/([^/]+)$/);
    if (planMatch && req.method === "GET") return json(projectPlans.detail(decodeURIComponent(planMatch[1])));
    if (url.pathname === "/api/capabilities") return json({ browserTerminal: false, sse: true, readOnly: false, steeringCockpit: true, stateRoot: STATE_ROOT, runnerParity: runnerParity() });
    if (url.pathname === "/api/states") return json({ states });
    if (url.pathname === "/api/events") { const result = readEvents(Number(url.searchParams.get("limit") || "200"), url.searchParams.get("after") || url.searchParams.get("lastEventId")); return json(result.events, 200, result.historyGap ? { "x-event-history-gap": "true", "x-event-history-recovery": result.historyGap.recovery } : {}); }
    if (url.pathname === "/api/runs") return json(listRuns());
    if (url.pathname === "/api/iterations") return json({ schemaVersion: "apb.iterations.v1", items: listIterations() });
    const iterationMatch = url.pathname.match(/^\/api\/iterations\/([^/]+)$/);
    if (iterationMatch) { const iter = listIterations().find((x: any) => x.id === decodeURIComponent(iterationMatch[1]) || x.runId === decodeURIComponent(iterationMatch[1])); if (!iter) return notFound("iteration not found"); return json(iterationDetail(iter)); }
    if (url.pathname === "/api/control") return req.method === "GET" ? json(readControl()) : handleCommand(req);
    if (url.pathname === "/api/queue") return req.method === "GET" ? json(readQueue()) : handleCommand(req);
    if (url.pathname === "/api/gates") return req.method === "GET" ? json(readGates()) : handleCommand(req);
    if (url.pathname === "/api/audit") return json(readAudit(Number(url.searchParams.get("limit") || "100")));
    if (url.pathname === "/api/commands" && req.method === "POST") return handleCommand(req);
    const runMatch = url.pathname.match(/^\/api\/runs\/([^/]+)(?:\/(.*))?$/);
    if (runMatch) {
      const runId = basename(decodeURIComponent(runMatch[1]));
      const rest = runMatch[2] || "";
      const runRoot = safeJoin(STATE_ROOT, "runs", runId);
      if (!existsSync(runRoot)) return notFound("run not found");
      if (!rest) return json(safeReadJson(join(runRoot, "run.json"), { id: runId }));
      if (rest === "logs") return json(listDir(safeJoin(runRoot, "logs")));
      if (rest.startsWith("logs/")) {
        const name = basename(decodeURIComponent(rest.slice(5)));
        const path = safeJoin(runRoot, "logs", name);
        if (!existsSync(path)) return notFound("log not found");
        return text(tailFile(path, Number(url.searchParams.get("tail") || "400")));
      }
      if (rest === "artifacts") return json(listDir(safeJoin(runRoot, "artifacts"), true).filter((x) => x.kind === "file"));
      if (rest.startsWith("artifacts/")) {
        const name = decodeURIComponent(rest.slice(10));
        const path = safeJoin(runRoot, "artifacts", ...name.split("/").filter(Boolean));
        if (!existsSync(path)) return notFound("artifact not found");
        if (statSync(path).size > MAX_TEXT_BYTES) return json({ error: "artifact too large for inline preview", size: statSync(path).size }, 413);
        return text(readFileSync(path, "utf8"));
      }
    }
    if (url.pathname === "/api/stream") {
      let timer: Timer | undefined;
      const lastHeader = req.headers.get("last-event-id");
      let lastId: string | null = lastHeader || url.searchParams.get("after") || url.searchParams.get("lastEventId");
      const stream = new ReadableStream({
        start(controller) {
          const enc = new TextEncoder();
          const send = (event: string, payload: any, id?: string) => { try { controller.enqueue(enc.encode(`${id ? `id: ${id}\n` : ""}event: ${event}\ndata: ${JSON.stringify(sanitize(payload))}\n\n`)); } catch { if (timer) clearInterval(timer); } };
          const initial = readEvents(50, lastId);
          if (initial.historyGap) send("history-gap", initial.historyGap);
          if (initial.events.length) lastId = initial.events[initial.events.length - 1].id || lastId;
          send("state", readState()); send("events", initial.events, lastId || undefined);
          timer = setInterval(() => {
            const next = readEvents(100, lastId);
            if (next.historyGap) send("history-gap", next.historyGap);
            if (next.events.length) { lastId = next.events[next.events.length - 1].id || lastId; send("events", next.events, lastId || undefined); }
            send("state", readState()); send("heartbeat", { ts: now() });
          }, 2500);
        },
        cancel() { if (timer) clearInterval(timer); }
      });
      return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" } });
    }
    return staticFile(url.pathname);
  } catch (err: any) {
    if (err instanceof PlanAssistanceError) return json({ schemaVersion: err.schemaVersion, error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } }, err.status);
    return json({ error: err?.message || String(err), ...(err instanceof ProjectPlanError && err.details ? { details: err.details } : {}) }, err instanceof ProjectPlanError ? err.status : 500);
  }
}

const HOST = process.env.AUTONOMOUS_PROJECTS_DASHBOARD_HOST || "127.0.0.1";
Bun.serve({ port: PORT, hostname: HOST, fetch: route });
console.log(`Autonomous Project Builder dashboard listening on http://${HOST}:${PORT}`);
console.log(`State root: ${STATE_ROOT}`);
