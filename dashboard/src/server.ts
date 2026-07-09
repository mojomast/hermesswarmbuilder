#!/usr/bin/env bun
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, statSync, writeFileSync } from "fs";
import { homedir } from "os";
import { basename, extname, join, resolve, sep } from "path";

const HOME = homedir();
const PORT = Number(process.env.AUTONOMOUS_PROJECTS_DASHBOARD_PORT || "9200");
const STATE_ROOT = process.env.AUTONOMOUS_PROJECTS_STATE_ROOT || join(HOME, ".hermes", "autonomous-projects");
const APP_ROOT = resolve(process.env.AUTONOMOUS_PROJECTS_DASHBOARD_ROOT || join(HOME, ".hermes", "autonomous-projects-dashboard"));
const PUBLIC_ROOT = join(APP_ROOT, "public");
const MAX_TEXT_BYTES = 1_500_000;
const EVENT_TAIL_BYTES = Number(process.env.AUTONOMOUS_PROJECTS_EVENT_TAIL_BYTES || "3000000");
const MAX_EVENTS_LIMIT = 1000;

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
  idea: join(STATE_ROOT, "idea.txt"),
};

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
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(sanitize(data), null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
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
function readEvents(limit = 200, after?: string | null) {
  const wanted = clampLimit(limit);
  const lines = readTailUtf8(paths.events).split(/\r?\n/).filter(Boolean);
  const parsed: any[] = [];
  for (const line of lines) {
    try { parsed.push(sanitize(JSON.parse(line))); } catch {}
  }
  let sliced = parsed;
  if (after) {
    const idx = parsed.findIndex((e: any) => e?.id === after);
    sliced = idx >= 0 ? parsed.slice(idx + 1) : [];
  }
  return sliced.slice(-wanted);
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
  return { schemaVersion: "apb.control.v1", updatedAt: now(), desiredMode: "running", runAdmission: "enabled", pause: { requested: false, mode: "checkpoint", reason: null }, stop: { requested: false, mode: null, reason: null }, activeSteering: [], pinnedQueueItemId: null, requestedRunNow: false, safety: { requireApprovalBeforePublish: true, requireApprovalBeforePush: true, allowDestructiveGit: false, maxRunHours: 24 } };
}
function defaultQueue() { return { schemaVersion: "apb.queue.v1", updatedAt: now(), items: [] as any[] }; }
function defaultGates() { return { schemaVersion: "apb.gates.v1", updatedAt: now(), gates: [] as any[] }; }
function readControl() { return { ...defaultControl(), ...safeReadJson(paths.control, defaultControl()) }; }
function readQueue() { const q = safeReadJson(paths.queue, defaultQueue()); if (!Array.isArray(q.items)) q.items = []; return { ...defaultQueue(), ...q, items: q.items }; }
function readGates() { const g = safeReadJson(paths.gates, defaultGates()); if (!Array.isArray(g.gates)) g.gates = []; return { ...defaultGates(), ...g, gates: g.gates }; }
function writeControl(c: any) { c.schemaVersion = "apb.control.v1"; c.updatedAt = now(); writeJson(paths.control, c); }
function writeQueue(q: any) { q.schemaVersion = "apb.queue.v1"; q.updatedAt = now(); q.items = (q.items || []).sort((a: any, b: any) => (b.priority || 0) - (a.priority || 0) || (a.rank || 9999) - (b.rank || 9999)); writeJson(paths.queue, q); }
function writeGates(g: any) { g.schemaVersion = "apb.gates.v1"; g.updatedAt = now(); writeJson(paths.gates, g); }
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
async function handleCommand(req: Request) {
  const body = await readJsonBody(req);
  const type = String(body.type || "");
  const payload = body.payload || body;
  const actor = body.actor || "dashboard-user";
  const command = { schemaVersion: "apb.command.v1", id: uid("cmd"), ts: now(), actor, type, target: body.target || {}, payload, status: "accepted" };
  const control = readControl(); const queue = readQueue(); const gates = readGates();
  if (["pause", "hold"].includes(type)) { control.pause = { requested: true, mode: payload.mode || "checkpoint", requestedBy: actor, requestedAt: now(), reason: payload.reason || null }; if (type === "hold") control.runAdmission = "paused"; writeControl(control); return json(commandAck(command, { effective: "next_checkpoint" })); }
  if (["resume", "unhold"].includes(type)) { control.pause = { requested: false, mode: "checkpoint", reason: null }; control.stop = { requested: false, mode: null, reason: null }; control.runAdmission = "enabled"; writeControl(control); return json(commandAck(command, { effective: "immediate" })); }
  if (type === "stop") { control.stop = { requested: true, mode: payload.mode || "graceful", requestedBy: actor, requestedAt: now(), reason: payload.reason || null }; writeControl(control); return json(commandAck(command, { effective: "next_checkpoint" })); }
  if (type === "steer") { const steer = { id: uid("steer"), scope: payload.scope || "next_run", priority: payload.priority || "required", text: payload.text || payload.objective || "", createdBy: actor, createdAt: now(), expires: payload.expires || { type: "until_removed" } }; control.activeSteering = [steer, ...(control.activeSteering || [])].slice(0, 20); writeControl(control); return json(commandAck(command, { steeringId: steer.id })); }
  if (type === "run-now") { control.requestedRunNow = true; writeControl(control); return json(commandAck(command, { effective: "next_runner_tick" })); }
  if (type === "add-queue-item") { const item = { id: uid("queue"), rank: queue.items.length + 1, priority: Number(payload.priority || 50), status: payload.pin ? "pinned" : "queued", title: payload.title || "Untitled project", objective: payload.objective || "", context: payload.context || "", constraints: String(payload.constraints || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean), acceptanceGateIds: payload.acceptanceGateIds || [], target: payload.target || {}, createdBy: actor, createdAt: now(), updatedAt: now(), source: payload.source || "dashboard" }; queue.items.push(item); if (payload.pin) control.pinnedQueueItemId = item.id; writeQueue(queue); writeControl(control); return json(commandAck(command, { item })); }
  if (type === "pin-queue-item") { const id = payload.id || payload.itemId; for (const item of queue.items) item.status = item.id === id ? "pinned" : (item.status === "pinned" ? "queued" : item.status); control.pinnedQueueItemId = id; writeQueue(queue); writeControl(control); const item = queue.items.find((x: any) => x.id === id); if (item) writeFileSync(paths.idea, queueItemText(item)); return json(commandAck(command, { pinnedQueueItemId: id, exportedIdeaTxt: !!item })); }
  if (type === "archive-queue-item") { const id = payload.id || payload.itemId; for (const item of queue.items) if (item.id === id) item.status = "archived"; if (control.pinnedQueueItemId === id) control.pinnedQueueItemId = null; writeQueue(queue); writeControl(control); return json(commandAck(command, { archived: id })); }
  if (type === "add-gate") { const gate = { id: payload.id || uid("gate"), phase: payload.phase || "final-audit", severity: payload.severity || "must", description: payload.description || payload.title || "Acceptance gate", requiredEvidence: String(payload.requiredEvidence || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean), status: "pending", createdAt: now(), createdBy: actor }; gates.gates.push(gate); writeGates(gates); return json(commandAck(command, { gate })); }
  if (type === "update-gate") { const id = payload.id || payload.gateId; for (const gate of gates.gates) if (gate.id === id) Object.assign(gate, payload, { updatedAt: now(), updatedBy: actor }); writeGates(gates); return json(commandAck(command, { gateId: id })); }
  return json({ error: `unknown command type ${type}` }, 400);
}

async function route(req: Request): Promise<Response> {
  const url = new URL(req.url);
  try {
    if (url.pathname === "/api/state") return json(readState());
    if (url.pathname === "/api/capabilities") return json({ browserTerminal: false, sse: true, readOnly: false, steeringCockpit: true, stateRoot: STATE_ROOT });
    if (url.pathname === "/api/states") return json({ states });
    if (url.pathname === "/api/events") return json(readEvents(Number(url.searchParams.get("limit") || "200"), url.searchParams.get("after")));
    if (url.pathname === "/api/runs") return json(listRuns());
    if (url.pathname === "/api/control") return req.method === "GET" ? json(readControl()) : handleCommand(req);
    if (url.pathname === "/api/queue") return req.method === "GET" ? json(readQueue()) : handleCommand(new Request(req, { method: "POST" }));
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
      let lastId: string | null = lastHeader || null;
      const stream = new ReadableStream({
        start(controller) {
          const enc = new TextEncoder();
          const send = (event: string, payload: any, id?: string) => controller.enqueue(enc.encode(`${id ? `id: ${id}\n` : ""}event: ${event}\ndata: ${JSON.stringify(sanitize(payload))}\n\n`));
          const initial = readEvents(50, lastId);
          if (initial.length) lastId = initial[initial.length - 1].id || lastId;
          send("state", readState()); send("events", initial, lastId || undefined);
          timer = setInterval(() => {
            const next = readEvents(100, lastId);
            if (next.length) { lastId = next[next.length - 1].id || lastId; send("events", next, lastId || undefined); }
            send("state", readState()); send("heartbeat", { ts: now() });
          }, 2500);
        },
        cancel() { if (timer) clearInterval(timer); }
      });
      return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" } });
    }
    return staticFile(url.pathname);
  } catch (err: any) { return json({ error: err?.message || String(err) }, 500); }
}

Bun.serve({ port: PORT, hostname: "0.0.0.0", fetch: route });
console.log(`Autonomous Project Builder dashboard listening on http://0.0.0.0:${PORT}`);
console.log(`State root: ${STATE_ROOT}`);
