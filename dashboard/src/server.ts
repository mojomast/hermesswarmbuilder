#!/usr/bin/env bun
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "fs";
import { homedir } from "os";
import { basename, extname, join, resolve, sep } from "path";

const HOME = homedir();
const PORT = Number(process.env.AUTONOMOUS_PROJECTS_DASHBOARD_PORT || "9200");
const STATE_ROOT = process.env.AUTONOMOUS_PROJECTS_STATE_ROOT || join(HOME, ".hermes", "autonomous-projects");
const APP_ROOT = resolve(process.env.AUTONOMOUS_PROJECTS_DASHBOARD_ROOT || join(HOME, ".hermes", "autonomous-projects-dashboard"));
const PUBLIC_ROOT = join(APP_ROOT, "public");
const MAX_TEXT_BYTES = 1_500_000;

type StateName = "idle" | "inventory-scanning" | "selecting" | "repo-created" | "spec-drafting" | "spec-review" | "spec-approved" | "devplan-drafting" | "devplan-review" | "devplan-approved" | "building" | "blocked" | "deblocking" | "on-hold" | "completed" | "published";
const states: StateName[] = ["idle", "inventory-scanning", "selecting", "repo-created", "spec-drafting", "spec-review", "spec-approved", "devplan-drafting", "devplan-review", "devplan-approved", "building", "blocked", "deblocking", "on-hold", "completed", "published"];

mkdirSync(STATE_ROOT, { recursive: true });
mkdirSync(join(STATE_ROOT, "runs"), { recursive: true });
mkdirSync(join(STATE_ROOT, "logs"), { recursive: true });
mkdirSync(join(STATE_ROOT, "artifacts"), { recursive: true });

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function text(data: string, status = 200): Response {
  return new Response(data, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
function notFound(message = "not found") { return json({ error: message }, 404); }
function safeJoin(root: string, ...parts: string[]): string {
  const resolvedRoot = resolve(root);
  const target = resolve(resolvedRoot, ...parts);
  if (target !== resolvedRoot && !target.startsWith(resolvedRoot + sep)) throw new Error("path traversal rejected");
  return target;
}
function safeReadJson(path: string, fallback: unknown): unknown {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return fallback; }
}
function defaultState() {
  return { currentRunId: null, status: "idle", updatedAt: new Date().toISOString(), agents: {}, decisions: [], capabilities: { readOnlyDashboard: true, browserTerminal: false, scheduledRunner: true } };
}
function readState() { return safeReadJson(join(STATE_ROOT, "state.json"), defaultState()); }
function readEvents(limit = 200, after?: string | null) {
  const path = join(STATE_ROOT, "events.jsonl");
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf8").trim().split(/\n+/).filter(Boolean);
  const parsed = lines.map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
  const start = after ? Math.max(0, parsed.findIndex((e: any) => e.id === after) + 1) : Math.max(0, parsed.length - limit);
  return parsed.slice(start).slice(-limit);
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
    return { id: entry.name, status: run.status || run.state || "unknown", startedAt: run.startedAt, completedAt: run.completedAt, selectedProject: run.selectedProject?.name || run.selectedProject || null, modifiedAt: entry.modifiedAt };
  });
}
function tailFile(path: string, lines = 400) {
  const st = statSync(path);
  const start = Math.max(0, st.size - MAX_TEXT_BYTES);
  const file = Bun.file(path);
  return file.slice(start).text().then((body) => body.split(/\r?\n/).slice(-lines).join("\n"));
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
async function route(req: Request): Promise<Response> {
  const url = new URL(req.url);
  try {
    if (url.pathname === "/api/state") return json(readState());
    if (url.pathname === "/api/capabilities") return json({ browserTerminal: false, sse: true, readOnly: true, stateRoot: STATE_ROOT });
    if (url.pathname === "/api/states") return json({ states });
    if (url.pathname === "/api/events") return json(readEvents(Number(url.searchParams.get("limit") || "200"), url.searchParams.get("after")));
    if (url.pathname === "/api/runs") return json(listRuns());
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
        return text(await tailFile(path, Number(url.searchParams.get("tail") || "400")));
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
      const stream = new ReadableStream({
        start(controller) {
          const enc = new TextEncoder();
          const send = (event: string, payload: unknown) => controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
          send("state", readState()); send("events", readEvents(50));
          timer = setInterval(() => { send("state", readState()); send("events", readEvents(25)); send("heartbeat", { ts: new Date().toISOString() }); }, 2500);
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
