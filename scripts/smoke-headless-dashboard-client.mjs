import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sourceUrl = new URL("../dashboard/public/headless-dashboard-client.js", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
for (const forbidden of [
  /\bdocument\s*[.[]/, /\bwindow\s*[.[]/, /\blocalStorage\b/, /\bsessionStorage\b/,
  /\bHTMLElement\b/, /\bquerySelector(?:All)?\s*\(/, /\.classList\b/, /\.innerHTML\b/
]) assert.doesNotMatch(source, forbidden, `client must not access DOM API ${forbidden}`);

const module = await import(sourceUrl.href);
const { createDashboardClient, WORKFLOW_PHASES, OPERATION_COMMANDS, PROJECT_PLAN_ACTIONS } = module;
assert.equal(WORKFLOW_PHASES.length, 16);
assert(OPERATION_COMMANDS.includes("deblock-advice"));
assert(PROJECT_PLAN_ACTIONS.includes("project-plan.launch"));

const calls = [];
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const text = (body, status = 200) => new Response(body, { status, headers: { "content-type": "text/plain" } });
const assistanceId = "assistance-00000000-0000-0000-0000-000000000000";

async function mockFetch(url, init = {}) {
  const parsed = new URL(url, "http://dashboard.test");
  const body = init.body ? JSON.parse(init.body) : null;
  calls.push({ path: parsed.pathname + parsed.search, method: init.method || "GET", body });
  if (parsed.pathname === "/api/state") return json({ currentRunId: "run-1", status: "building" });
  if (parsed.pathname === "/api/runs") return json([{ id: "run-1", status: "building" }]);
  if (parsed.pathname === "/api/events") return json([{ id: "e1", message: "first" }, { id: "e2", message: "second" }]);
  if (parsed.pathname === "/api/control") return json({ desiredMode: "running" });
  if (parsed.pathname === "/api/queue") return json({ items: [] });
  if (parsed.pathname === "/api/gates") return json({ gates: [] });
  if (parsed.pathname === "/api/audit") return json([]);
  if (parsed.pathname === "/api/iterations") return json({ items: [{ id: "iter-1", runId: "run-1" }] });
  if (parsed.pathname === "/api/iterations/iter-1") return json({ id: "iter-1", runId: "run-1", variants: [] });
  if (parsed.pathname === "/api/project-plans" && !init.method) return json({ items: [{ planId: "plan-1" }] });
  if (parsed.pathname === "/api/project-plans/plan-1") return json({ ledger: { planId: "plan-1", version: 1 }, revision: { revision: 1 } });
  if (parsed.pathname === "/api/project-plans/plan-1/revisions/1") return json({ planId: "plan-1", revision: 1 });
  if (parsed.pathname === "/api/project-plans/commands") return json({ status: "accepted", echoed: body });
  if (parsed.pathname === "/api/runs/run-1") return json({ id: "run-1" });
  if (parsed.pathname === "/api/runs/run-1/artifacts") return json([{ name: "SPEC.md" }]);
  if (parsed.pathname === "/api/runs/run-1/logs") return json([{ name: "run.log" }]);
  if (parsed.pathname === "/api/runs/run-1/artifacts/spec.md") return text("missing", 404);
  if (parsed.pathname === "/api/runs/run-1/artifacts/SPEC.approved-candidate-v2.md") return text("missing", 404);
  if (parsed.pathname === "/api/runs/run-1/artifacts/SPEC.approved-candidate.md") return text("missing", 404);
  if (parsed.pathname === "/api/runs/run-1/artifacts/SPEC.md") return text("# Spec");
  if (parsed.pathname === "/api/runs/run-1/logs/run.log") return text("log tail");
  if (parsed.pathname === "/api/commands") return json({ status: "accepted", echoed: body });
  if (parsed.pathname === "/api/plan-assistance" && init.method === "POST") return json({ id: assistanceId, version: 1, pipelineType: body.pipelineType, messages: [] }, 201);
  if (parsed.pathname === "/api/plan-assistance") return json({ items: [{ id: assistanceId }] });
  if (parsed.pathname === `/api/plan-assistance/${assistanceId}/messages`) return json({ id: assistanceId, version: 2, messages: [{ role: "user", content: body.message }] });
  if (parsed.pathname === `/api/plan-assistance/${assistanceId}`) return json({ id: assistanceId, version: 1, messages: [] });
  throw new Error(`unexpected request ${parsed.pathname}${parsed.search}`);
}

class MockEventSource {
  static instances = [];
  constructor(url) { this.url = url; this.listeners = new Map(); this.closed = false; MockEventSource.instances.push(this); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  emit(type, payload) { this.listeners.get(type)?.({ data: JSON.stringify(payload) }); }
  emitRaw(type, data) { this.listeners.get(type)?.({ data }); }
  close() { this.closed = true; }
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

function fakeTimers() {
  let nextId = 1;
  const intervals = new Map(), timeouts = new Map();
  return {
    intervals, timeouts,
    setInterval(callback, delay) { const id = nextId++; intervals.set(id, { callback, delay }); return id; },
    clearInterval(id) { intervals.delete(id); },
    setTimeout(callback, delay) { const id = nextId++; timeouts.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timeouts.delete(id); },
    runIntervals() { for (const { callback } of [...intervals.values()]) callback(); },
    runNextTimeout() { const entry = timeouts.entries().next().value; if (!entry) return false; const [id, timer] = entry; timeouts.delete(id); timer.callback(); return true; }
  };
}

function standardFetch(overrides = {}) {
  const requests = [];
  const fetch = async (url, init = {}) => {
    const parsed = new URL(url, "http://dashboard.test");
    const key = parsed.pathname + parsed.search;
    requests.push({ path: key, method: init.method || "GET", body: init.body ? JSON.parse(init.body) : null });
    if (overrides[key]) return overrides[key](parsed, init, requests);
    if (overrides[parsed.pathname]) return overrides[parsed.pathname](parsed, init, requests);
    if (parsed.pathname === "/api/state") return json({ currentRunId: "run-1", status: "building" });
    if (parsed.pathname === "/api/runs") return json([{ id: "run-1", status: "building" }]);
    if (parsed.pathname === "/api/events") return json([]);
    if (parsed.pathname === "/api/control") return json({ desiredMode: "running" });
    if (parsed.pathname === "/api/queue") return json({ items: [] });
    if (parsed.pathname === "/api/gates") return json({ gates: [] });
    if (parsed.pathname === "/api/audit") return json([]);
    if (parsed.pathname === "/api/iterations") return json({ items: [] });
    if (parsed.pathname === "/api/project-plans") return json({ items: [] });
    if (parsed.pathname === "/api/runs/run-1") return json({ id: "run-1" });
    if (parsed.pathname === "/api/runs/run-1/artifacts") return json([]);
    if (parsed.pathname === "/api/runs/run-1/logs") return json([]);
    throw new Error(`unexpected request ${key}`);
  };
  return { fetch, requests };
}

let intervalCallback = null;
const client = createDashboardClient({
  baseUrl: "http://dashboard.test", fetch: mockFetch, EventSource: MockEventSource,
  maxEvents: 3, maxRawMessages: 2, setInterval: (callback) => { intervalCallback = callback; return 1; },
  clearInterval: () => { intervalCallback = null; }
});

const expectedMethods = [
  "getSnapshot", "subscribe", "unsubscribe", "refresh", "refreshState", "refreshRuns", "refreshEvents",
  "refreshControl", "refreshQueue", "refreshGates", "refreshAudit", "refreshIterations", "refreshPlans",
  "connect", "pause", "resume", "disconnect", "ingestEvents", "selectRun", "loadRunResources",
  "selectIteration", "loadIterationDetail", "loadArtifact", "loadLog", "loadDocument", "command",
  "projectPlanCommand", "getProjectPlan", "getProjectPlanRevision", "createProjectPlan", "updateProjectPlan",
  "submitProjectPlanForReview", "approveProjectPlan", "rejectProjectPlan", "launchProjectPlan",
  "cloneProjectPlan", "forkProjectPlan", "archiveProjectPlan", "listPlanAssistance",
  "createPlanAssistance", "getPlanAssistance", "messagePlanAssistance"
];
assert.deepEqual(Object.keys(client), expectedMethods);
assert(Object.isFrozen(client));

let notifications = 0;
const listener = (snapshot) => { notifications += 1; assert(Object.isFrozen(snapshot)); };
const unsubscribe = client.subscribe(listener);
await client.refresh();
assert.equal(client.getSnapshot().selectedRun.run.id, "run-1");
assert.equal(client.getSnapshot().eventCursor, "e2");
assert(Object.isFrozen(client.getSnapshot().selectedRun.artifacts));

client.ingestEvents([{ id: "e2" }, { id: "e3" }, { id: "e4" }, { id: "e5" }]);
assert.deepEqual(client.getSnapshot().events.map((event) => event.id), ["e3", "e4", "e5"]);
client.ingestEvents([{ id: "e5" }]);
assert.equal(client.getSnapshot().events.length, 3, "events are deduplicated");
const callerEvent = { id: "caller-owned", data: { mutable: true } };
client.ingestEvents([callerEvent]);
assert.equal(Object.isFrozen(callerEvent), false, "ingestion does not freeze caller-owned events");
assert.equal(Object.isFrozen(callerEvent.data), false, "ingestion does not freeze caller-owned nested values");

await client.connect({ refresh: false });
const stream = MockEventSource.instances.at(-1);
stream.emit("open", {});
stream.emit("events", [{ id: "e6" }]);
stream.emit("heartbeat", { ts: "now" });
stream.emit("state", { currentRunId: "run-1", status: "completed" });
assert.equal(client.getSnapshot().rawMessages.length, 2);
assert.equal(client.getSnapshot().events.at(-1).id, "e6");
client.pause();
const pausedSnapshot = client.getSnapshot();
stream.emit("events", [{ id: "paused-event" }]);
stream.emit("state", { currentRunId: "run-1", status: "paused-frame" });
stream.emit("heartbeat", { ts: "paused" });
assert.strictEqual(client.getSnapshot(), pausedSnapshot, "SSE frames do not publish while paused");
await client.resume();
assert.equal(client.getSnapshot().events.at(-1).id, "paused-event", "bounded paused events are applied on resume");
assert.equal(client.getSnapshot().state.status, "building", "resume refreshes current server state after applying buffered frames");

const commandResult = await client.command("steer", { text: "Stay bounded" }, { actor: "operator", correlationId: "corr-1" });
assert.equal(commandResult.status, "accepted");
assert.deepEqual(calls.find((call) => call.path === "/api/commands").body, {
  type: "steer", payload: { text: "Stay bounded" }, actor: "operator", correlationId: "corr-1"
});

await client.createProjectPlan({ content: { pipelineType: "classic" } });
const planEnvelope = calls.find((call) => call.path === "/api/project-plans/commands").body;
assert.equal(planEnvelope.schemaVersion, "apb.project-plan-command.v1");
assert.equal(planEnvelope.type, "project-plan.create");
assert.match(planEnvelope.idempotencyKey, /^create-/);

await client.listPlanAssistance();
await client.createPlanAssistance("managed");
await client.getPlanAssistance(assistanceId);
await client.messagePlanAssistance(assistanceId, 1, "Help bound this project");
const assistanceEnvelope = calls.find((call) => call.path.endsWith("/messages")).body;
assert.deepEqual(assistanceEnvelope, { schemaVersion: "apb.plan-assistance.v1", expectedVersion: 1, message: "Help bound this project" });

const document = await client.loadDocument("spec", "run-1");
assert.equal(document.name, "SPEC.md");
assert.equal(document.text, "# Spec");
assert.equal((await client.loadLog("run.log", "run-1")).text, "log tail");
await client.selectIteration("iter-1");
assert.equal(client.getSnapshot().iterationDetail.id, "iter-1");

unsubscribe();
const before = notifications;
client.ingestEvents([{ id: "e7" }]);
assert.equal(notifications, before);
client.disconnect();
assert.equal(stream.closed, true);
assert.equal(client.getSnapshot().connection.status, "disconnected");
assert.equal(intervalCallback, null);

// Full refreshes are single-flight and reconcile stale selected runs before loading resources.
{
  const stateGate = deferred();
  const fixture = standardFetch({ "/api/state": () => stateGate.promise });
  const raceClient = createDashboardClient({ baseUrl: "http://dashboard.test", fetch: fixture.fetch, EventSource: null, selectedRunId: "deleted-run" });
  const first = raceClient.refresh();
  const second = raceClient.refresh();
  assert.strictEqual(first, second, "concurrent full refresh calls share one promise");
  assert.equal(fixture.requests.filter((call) => call.path === "/api/runs").length, 1);
  stateGate.resolve(json({ currentRunId: "run-1", status: "building" }));
  await first;
  assert.equal(raceClient.getSnapshot().selectedRunId, "run-1");
  assert.equal(raceClient.getSnapshot().selectedRun.run.id, "run-1");
}

// A list response started before an explicit selection cannot clear that newer selection.
{
  const runsGate = deferred();
  const fixture = standardFetch({ "/api/runs": () => runsGate.promise });
  const raceClient = createDashboardClient({ baseUrl: "http://dashboard.test", fetch: fixture.fetch, EventSource: null });
  const pending = raceClient.refresh();
  await raceClient.selectRun("run-2", { load: false });
  runsGate.resolve(json([{ id: "run-1" }]));
  await pending;
  assert.equal(raceClient.getSnapshot().selectedRunId, "run-2", "newer run selection survives stale list data");
}

// A delayed HTTP event response cannot regress a cursor already advanced by live events.
{
  const eventsGate = deferred();
  const fixture = standardFetch({ "/api/events?limit=250&after=cursor-1": () => eventsGate.promise });
  const raceClient = createDashboardClient({ baseUrl: "http://dashboard.test", fetch: fixture.fetch, EventSource: null });
  raceClient.ingestEvents([{ id: "cursor-1" }]);
  const pending = raceClient.refreshEvents();
  raceClient.ingestEvents([{ id: "cursor-3" }]);
  eventsGate.resolve(json([{ id: "cursor-2" }]));
  await pending;
  assert.equal(raceClient.getSnapshot().eventCursor, "cursor-3");
  assert.deepEqual(raceClient.getSnapshot().events.map((event) => event.id), ["cursor-1", "cursor-3", "cursor-2"], "unseen stale-response events merge without moving the cursor");
  raceClient.ingestEvents([{ id: "cursor-1" }]);
  assert.equal(raceClient.getSnapshot().eventCursor, "cursor-3", "duplicate ingestion cannot move the cursor backward");
}

// Healthy SSE performs coalesced non-streamed maintenance without polling state/events.
{
  MockEventSource.instances.length = 0;
  const controlGate = deferred();
  let delayed = true;
  const fixture = standardFetch({ "/api/control": () => delayed ? controlGate.promise : json({ desiredMode: "running" }) });
  const timers = fakeTimers();
  const liveClient = createDashboardClient({ baseUrl: "http://dashboard.test", fetch: fixture.fetch, EventSource: MockEventSource, ...timers, sseRefreshIntervalMs: 100 });
  await liveClient.connect({ refresh: false });
  const source = MockEventSource.instances.at(-1);
  source.emit("open", {});
  timers.runIntervals();
  timers.runIntervals();
  assert.equal(fixture.requests.filter((call) => call.path === "/api/control").length, 1, "maintenance is coalesced");
  assert.equal(fixture.requests.filter((call) => call.path === "/api/state").length, 0, "healthy SSE maintenance does not duplicate streamed state");
  assert.equal(fixture.requests.filter((call) => call.path.startsWith("/api/events")).length, 0, "healthy SSE maintenance does not poll events");
  delayed = false;
  controlGate.resolve(json({ desiredMode: "running" }));
  await new Promise((resolve) => setImmediate(resolve));
  liveClient.disconnect();
  assert.equal(timers.intervals.size, 0);
  assert.equal(timers.timeouts.size, 0);
}

// Reconnect supersedes old EventSources, rejects malformed frames, and retains degraded polling only until reopen.
{
  MockEventSource.instances.length = 0;
  const fixture = standardFetch();
  const timers = fakeTimers();
  const liveClient = createDashboardClient({ baseUrl: "http://dashboard.test", fetch: fixture.fetch, EventSource: MockEventSource, ...timers, reconnectBaseMs: 10, reconnectMaxMs: 20 });
  await liveClient.connect({ refresh: false });
  const oldSource = MockEventSource.instances.at(-1);
  await liveClient.connect({ refresh: false });
  const currentSource = MockEventSource.instances.at(-1);
  assert.equal(oldSource.closed, true);
  oldSource.emit("events", [{ id: "stale-source-event" }]);
  currentSource.emit("events", [{ id: "current-source-event" }]);
  assert.deepEqual(liveClient.getSnapshot().events.map((event) => event.id), ["current-source-event"]);
  currentSource.emitRaw("events", "not-json");
  assert.equal(currentSource.closed, true);
  assert.equal(liveClient.getSnapshot().connection.status, "polling");
  assert.equal(timers.timeouts.size, 1, "SSE failure schedules bounded reconnect");
  timers.runNextTimeout();
  const replacement = MockEventSource.instances.at(-1);
  assert.notStrictEqual(replacement, currentSource);
  replacement.emit("open", {});
  assert.equal(liveClient.getSnapshot().connection.status, "connected");
  liveClient.disconnect();
}

// Ambiguous network failures retain a project-plan idempotency key for caller retry.
{
  const envelopes = [];
  let attempts = 0;
  const retryClient = createDashboardClient({ fetch: async (url, init) => {
    const parsed = new URL(url, "http://dashboard.test");
    if (parsed.pathname !== "/api/project-plans/commands") throw new Error(`unexpected ${parsed.pathname}`);
    envelopes.push(JSON.parse(init.body));
    attempts += 1;
    if (attempts === 1) throw new Error("response lost");
    return json({ planId: "plan-retried", status: "accepted" });
  }, EventSource: null });
  const payload = { content: { pipelineType: "classic" } };
  await assert.rejects(retryClient.createProjectPlan(payload), /response lost/);
  await retryClient.createProjectPlan(payload);
  assert.equal(envelopes[0].idempotencyKey, envelopes[1].idempotencyKey);
  await assert.rejects(retryClient.command("not-a-command", {}), /unknown operation command/);
  await assert.rejects(retryClient.command("steer", []), /plain object/);
  await assert.rejects(retryClient.projectPlanCommand("project-plan.nope", {}), /unknown project plan action/);
}

// A refreshed mutation reloads the active plan detail and request generations prevent stale detail publication.
{
  const oldPlanGate = deferred();
  let detailCalls = 0;
  const fixture = standardFetch({
    "/api/project-plans/plan-1": () => {
      detailCalls += 1;
      if (detailCalls === 1) return oldPlanGate.promise;
      return json({ ledger: { planId: "plan-1", version: 2 }, revision: { revision: 2 } });
    },
    "/api/project-plans/plan-2": () => json({ ledger: { planId: "plan-2", version: 1 }, revision: { revision: 1 } }),
    "/api/project-plans": () => json({ items: [{ planId: "plan-1", version: 2 }, { planId: "plan-2", version: 1 }] }),
    "/api/project-plans/commands": () => json({ planId: "plan-1", ledger: { planId: "plan-1", version: 2 } })
  });
  const planClient = createDashboardClient({ baseUrl: "http://dashboard.test", fetch: fixture.fetch, EventSource: null });
  const stalePlan = planClient.getProjectPlan("plan-1");
  await planClient.getProjectPlan("plan-2");
  oldPlanGate.resolve(json({ ledger: { planId: "plan-1", version: 1 }, revision: { revision: 1 } }));
  await stalePlan;
  assert.equal(planClient.getSnapshot().planDetail.ledger.planId, "plan-2", "stale plan response is ignored");
  await planClient.getProjectPlan("plan-1");
  await planClient.updateProjectPlan({ planId: "plan-1", content: {} }, { expectedVersion: 1, refresh: true });
  assert.equal(planClient.getSnapshot().planDetail.ledger.version, 2, "active plan detail reloads after mutation");
}

// Resource and assistance request generations keep the latest selection when responses finish out of order.
{
  const artifactA = deferred(), assistanceA = deferred();
  const assistanceB = "assistance-11111111-1111-1111-1111-111111111111";
  const fixture = standardFetch({
    "/api/runs/run-1/artifacts/a.txt": () => artifactA.promise,
    "/api/runs/run-1/artifacts/b.txt": () => text("B"),
    [`/api/plan-assistance/${assistanceId}`]: () => assistanceA.promise,
    [`/api/plan-assistance/${assistanceB}`]: () => json({ id: assistanceB, version: 1, messages: [] })
  });
  const selectionClient = createDashboardClient({ baseUrl: "http://dashboard.test", fetch: fixture.fetch, EventSource: null });
  await selectionClient.selectRun("run-1", { load: false });
  const oldArtifact = selectionClient.loadArtifact("a.txt");
  await selectionClient.loadArtifact("b.txt");
  artifactA.resolve(text("A"));
  await oldArtifact;
  assert.equal(selectionClient.getSnapshot().selectedRun.artifact.name, "b.txt");
  const oldAssistance = selectionClient.getPlanAssistance(assistanceId);
  await selectionClient.getPlanAssistance(assistanceB);
  assistanceA.resolve(json({ id: assistanceId, version: 1, messages: [] }));
  await oldAssistance;
  assert.equal(selectionClient.getSnapshot().assistanceDetail.id, assistanceB);
}

console.log(`headless dashboard client smoke passed (${expectedMethods.length} methods)`);
