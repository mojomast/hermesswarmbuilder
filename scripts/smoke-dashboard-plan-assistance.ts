#!/usr/bin/env bun
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

const repo = resolve(new URL("..", import.meta.url).pathname);
const home = mkdtempSync(join(tmpdir(), "hsb-plan-assistance-"));
const state = join(home, "state");
const hermes = join(home, "fake-hermes.cjs");
const calls = join(home, "hermes-calls.jsonl");
const canary = join(home, "shell-canary");
const port = 28000 + Math.floor(Math.random() * 2000);
const base = `http://127.0.0.1:${port}`;
const inputSecret = "sk-inputSecretValue123456789";
const outputSecret = "assistant-secret-value-123";
const quotedInputSecret = "quoted-input-secret-456";
const quotedOutputSecret = "quoted-output-secret-789";
let server: ReturnType<typeof Bun.spawn> | null = null;

const assert = (condition: unknown, message: string): asserts condition => { if (!condition) throw new Error(message); };
const read = (path: string) => readFileSync(path, "utf8");
const json = (path: string) => JSON.parse(read(path));
const writeJson = (path: string, value: unknown) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

const limits = { maxIterations: 1, maxVariantsPerIteration: 1, maxParallelVariants: 1, maxAcceptedFeatures: 1, maxVisualMotifChanges: 0, maxNewSections: 0, stopAfterNoImprovement: 1 };
const proposal = {
  pipelineType: "classic", title: "Trusted assisted draft", problem: "Operators need a bounded planning flow.", intendedUsers: "Local operators", objective: "Create one reviewed draft", boundedScope: "Planning only",
  requirements: ["Persist a safe proposal"], nonGoals: ["No automatic launch"], constraints: [`password=${outputSecret}`, `password: "${quotedOutputSecret}"`], risks: ["Provider disclosure"],
  repository: { path: "/forged/repository", baseRef: "forged", baseCommit: "a".repeat(40) }, acceptanceGates: [{ id: "review", description: "Operator reviews proposal", severity: "must", required: true, requiredEvidence: ["artifacts/review.json"] }],
  validationPolicy: { id: "forged", expectations: ["Runner-selected checks pass"], clientCommandsAllowed: true }, milestones: ["Review draft"], limits,
  lineage: { mode: "fork", sourcePlanId: "plan-forged", sourceRevision: 9, sourceRunId: "run-forged", sourceIterationId: "iter-forged" }
};

async function startServer() {
  server = Bun.spawn(["bun", "src/server.ts"], {
    cwd: join(repo, "dashboard"),
    env: { ...process.env, HOME: home, HERMES_BIN: hermes, PLAN_ASSISTANCE_TIMEOUT_MS: "1000", AUTONOMOUS_PROJECTS_STATE_ROOT: state, AUTONOMOUS_PROJECTS_DASHBOARD_ROOT: join(repo, "dashboard"), AUTONOMOUS_PROJECTS_DASHBOARD_HOST: "127.0.0.1", AUTONOMOUS_PROJECTS_DASHBOARD_PORT: String(port) },
    stdout: "pipe", stderr: "pipe"
  });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/api/state`)).ok) return; } catch {}
    await Bun.sleep(40);
  }
  throw new Error("dashboard did not become ready");
}

async function stopServer() {
  if (!server) return;
  server.kill(); await server.exited; server = null;
}

async function request(path: string, init?: RequestInit, expected = 200) {
  const response = await fetch(base + path, init);
  const text = await response.text();
  let body: any; try { body = JSON.parse(text); } catch { body = text; }
  assert(response.status === expected, `${path} expected ${expected}, got ${response.status}: ${text}`);
  return body;
}

const post = (path: string, body: unknown, expected = 200) => request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, expected);
const turn = (id: string, version: number, message: string, expected = 200) => post(`/api/plan-assistance/${encodeURIComponent(id)}/messages`, { schemaVersion: "apb.plan-assistance.v1", expectedVersion: version, message }, expected);
const snapshot = (path: string) => existsSync(path) ? read(path) : null;

try {
  mkdirSync(state, { recursive: true });
  writeJson(join(state, "control.json"), { schemaVersion: "apb.control.v1", marker: "must-not-change" });
  writeFileSync(hermes, `#!/usr/bin/env node
const fs=require('fs'),cp=require('child_process');
const args=process.argv.slice(2),query=args[args.indexOf('--query')+1]||'';
fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify({args,query,env:process.env})+'\\n');
const begin='APB_PLAN_ASSISTANCE_JSON_BEGIN',end='APB_PLAN_ASSISTANCE_JSON_END';
if(query.includes('CASE_TIMEOUT')) { cp.spawn(process.execPath,['-e','setTimeout(()=>{},10000)'],{stdio:['ignore',1,2]}); setTimeout(()=>{},10000); }
else if(query.includes('CASE_MALFORMED')) process.stdout.write(begin+'\\n{"message":\\n'+end+'\\n');
else if(query.includes('CASE_UNKNOWN')) process.stdout.write(begin+'\\n'+JSON.stringify({message:'no',unknown:true})+'\\n'+end+'\\n');
else if(query.includes('CASE_UNMARKED')) process.stdout.write(JSON.stringify({message:'otherwise valid but unmarked'}));
else if(query.includes('CASE_EXECUTABLE')) { const p=${JSON.stringify(proposal)}; p.validationPolicy.command='touch ${canary}'; process.stdout.write(begin+'\\n'+JSON.stringify({message:'no',proposedContent:p})+'\\n'+end+'\\n'); }
else if(query.includes('CASE_CONCURRENT')) setTimeout(()=>process.stdout.write(begin+'\\n'+JSON.stringify({message:'bounded concurrent reply'})+'\\n'+end+'\\n'),100);
else process.stdout.write(begin+'\\n'+JSON.stringify({message:'password=${outputSecret} and \\"password\\":\\"${quotedOutputSecret}\\"',proposedContent:${JSON.stringify(proposal)}})+'\\n'+end+'\\n');
`);
  chmodSync(hermes, 0o755);

  await startServer();
  const controlBefore = snapshot(join(state, "control.json"));
  const indexBefore = snapshot(join(state, "project-plans", "index.json"));
  const idempotencyBefore = snapshot(join(state, "project-plans", "idempotency.json"));
  const auditBefore = snapshot(join(state, "audit.jsonl"));

  await post("/api/plan-assistance", { schemaVersion: "apb.plan-assistance.v1", pipelineType: "classic", extra: true }, 400);
  const created = await post("/api/plan-assistance", { schemaVersion: "apb.plan-assistance.v1", pipelineType: "classic" }, 201);
  assert(created.version === 1 && created.messages.length === 0 && created.proposedContent === null, "conversation create response is incorrect");
  await request("/api/plan-assistance/not-a-safe-id", undefined, 400);
  await post(`/api/plan-assistance/${created.id}/messages`, { schemaVersion: "apb.plan-assistance.v1", expectedVersion: 1, message: "no", env: { DANGEROUS: "1" } }, 400);
  assert(!existsSync(calls), "invalid exact request invoked Hermes");

  for (const [name, status] of [["CASE_MALFORMED", 502], ["CASE_UNKNOWN", 502], ["CASE_EXECUTABLE", 502]] as const) {
    await turn(created.id, 1, name, status);
    const unchanged = await request(`/api/plan-assistance/${created.id}`);
    assert(unchanged.version === 1 && unchanged.messages.length === 0 && unchanged.proposedContent === null, `${name} persisted an invalid turn`);
  }
  const unmarked = await turn(created.id, 1, "CASE_UNMARKED", 502);
  assert(unmarked.error?.code === "invalid_model_output" && /provider\/model.*No planning turn was saved/i.test(unmarked.error?.message), `unmarked provider failure is not actionable: ${JSON.stringify(unmarked)}`);

  const timeoutStarted = Date.now();
  await turn(created.id, 1, "CASE_TIMEOUT", 504);
  assert(Date.now() - timeoutStarted < 5000, "timeout remained blocked on inherited output streams");
  let detail = await turn(created.id, 1, `CASE_TRUSTED token=${inputSecret} password: "${quotedInputSecret}" shell=$(touch ${canary}); & | >`, 200);
  assert(detail.version === 2 && detail.messages.length === 2 && detail.proposedContent.title === "Trusted assisted draft", "trusted response was not persisted");
  assert(detail.messages[0].content.includes("[REDACTED"), `input secret was not visibly redacted: ${JSON.stringify(detail.messages[0])}`);
  assert(!JSON.stringify(detail).includes(inputSecret), "API response leaked the input secret");
  assert(!JSON.stringify(detail).includes(outputSecret) && !JSON.stringify(detail).includes(quotedInputSecret) && !JSON.stringify(detail).includes(quotedOutputSecret), `API response leaked a secret: ${JSON.stringify(detail)}`);
  assert(detail.proposedContent.repository.path === null && detail.proposedContent.repository.baseRef === null && detail.proposedContent.repository.baseCommit === null, "classic proposal retained model repository identity");
  assert(JSON.stringify(detail.proposedContent.lineage) === JSON.stringify({ mode: "new", sourcePlanId: null, sourceRevision: null, sourceRunId: null, sourceIterationId: null }), "model forged proposal lineage");
  assert(detail.proposedContent.validationPolicy.id === "apb.runner-selected.v1" && detail.proposedContent.validationPolicy.clientCommandsAllowed === false, "proposal validation policy was not forced safe");
  assert(!existsSync(canary), "shell metacharacters executed");

  const managed = await post("/api/plan-assistance", { schemaVersion: "apb.plan-assistance.v1", pipelineType: "managed" }, 201);
  const managedDetail = await turn(managed.id, 1, "CASE_TRUSTED_MANAGED");
  assert(managedDetail.proposedContent.pipelineType === "managed" && managedDetail.proposedContent.repository.path === "/forged/repository" && managedDetail.proposedContent.repository.baseCommit === null, "managed proposal did not retain the fixed pipeline with an unresolved base commit");

  await turn(created.id, 1, "stale", 409);
  const concurrent = await post("/api/plan-assistance", { schemaVersion: "apb.plan-assistance.v1", pipelineType: "classic" }, 201);
  const concurrentRequest = (message: string) => fetch(`${base}/api/plan-assistance/${concurrent.id}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ schemaVersion: "apb.plan-assistance.v1", expectedVersion: 1, message }) }).then(async response => ({ status: response.status, value: await response.json() }));
  const concurrentResults = await Promise.all([
    concurrentRequest("CASE_CONCURRENT first"),
    concurrentRequest("CASE_CONCURRENT second")
  ]);
  assert(concurrentResults.map(result => result.status).sort().join(",") === "200,409", `same-version concurrent turns were not serialized: ${JSON.stringify(concurrentResults)}`);
  const concurrentCalls = read(calls).trim().split(/\n/).map(JSON.parse).filter((row: any) => row.query.includes("CASE_CONCURRENT"));
  assert(concurrentCalls.length === 1, `stale concurrent turn invoked Hermes instead of waiting for the conversation lock: ${concurrentCalls.length}`);
  const recordPath = join(state, "project-plans", "assistance", `${created.id}.json`);
  assert((statSync(recordPath).mode & 0o777) === 0o600, "conversation file mode is not 0600");
  const disk = read(recordPath);
  assert(!disk.includes(inputSecret) && !disk.includes(outputSecret) && !disk.includes(quotedInputSecret) && !disk.includes(quotedOutputSecret) && disk.includes("[REDACTED"), "conversation disk record leaked a secret");
  const callRows = read(calls).trim().split(/\n/).map(JSON.parse);
  const trustedCall = callRows.find((row: any) => row.query.includes("CASE_TRUSTED"));
  const expectedPrefix = ["chat", "--quiet", "--safe-mode", "--ignore-user-config", "--ignore-rules", "--source", "autonomous-project-planner", "--max-turns", "1", "--toolsets", "", "--query"];
  assert(JSON.stringify(trustedCall.args.slice(0, -1)) === JSON.stringify(expectedPrefix) && trustedCall.args.length === expectedPrefix.length + 1, `unsafe Hermes argv: ${JSON.stringify(trustedCall.args)}`);
  assert(trustedCall.args.at(-2) === "--query" && trustedCall.args.at(-1) === trustedCall.query && trustedCall.query.includes(`$(touch ${canary}); & | >`), "query was not passed as one literal argv value");
  assert(!trustedCall.query.includes(inputSecret) && !trustedCall.query.includes(quotedInputSecret) && trustedCall.query.includes("[REDACTED"), "prompt leaked the input secret");
  assert(trustedCall.env.PATH === process.env.PATH && trustedCall.env.HOME === home, `required child environment was not preserved: ${JSON.stringify(trustedCall.env)}`);
  assert(Object.keys(trustedCall.env).every((key: string) => ["PATH", "HOME", "TMPDIR"].includes(key)), `Hermes child inherited non-allowlisted environment: ${JSON.stringify(Object.keys(trustedCall.env))}`);

  const appSource = read(join(repo, "dashboard", "public", "app.js"));
  const cssSource = read(join(repo, "dashboard", "public", "styles.css"));
  assert(/function openPlanner\(\)\{[^}]*planning\.mobilePane=planning\.items\.length\?planning\.mobilePane:'plans';[^}]*applyPlanningMobilePane\(\);[^}]*Promise\.all/s.test(appSource), "planner does not synchronously expose the Plans pane before empty-state refresh");
  assert(appSource.includes(".then(()=>{if(planning.open)$('planningWorkspace')?.querySelector('button,input,textarea')?.focus()})"), "late planner refresh can steal focus back after Escape closes the modal");
  assert(appSource.includes("function trapPlannerFocus(event)"), "modal planner has no Tab focus trap");
  assert(/if\(planning\.open&&\w+\.key==='Tab'\)trapPlannerFocus\(\w+\)/.test(appSource), "planner focus trap is not wired to keyboard handling");
  assert(cssSource.includes('html[data-density="compact"] .planning-mobile-tabs button') && cssSource.includes('html[data-density="compact"] .planning-assist button') && cssSource.includes('min-height:38px'), "compact planner controls do not override density with 38px touch targets");

  assert(snapshot(join(state, "control.json")) === controlBefore, "chat mutated control.json");
  assert(snapshot(join(state, "project-plans", "index.json")) === indexBefore, "chat mutated project plan index");
  assert(snapshot(join(state, "project-plans", "idempotency.json")) === idempotencyBefore, "chat mutated project plan idempotency");
  assert(snapshot(join(state, "audit.jsonl")) === auditBefore, "chat mutated audit records");
  assert(readdirSync(join(state, "project-plans")).filter((name) => name.startsWith("plan-")).length === 0, "chat created a project plan");

  await stopServer(); await startServer();
  detail = await request(`/api/plan-assistance/${created.id}`);
  assert(detail.version === 2 && detail.messages.length === 2 && detail.proposedContent.title === "Trusted assisted draft", "conversation did not persist across restart");
  assert((statSync(recordPath).mode & 0o777) === 0o600, "conversation mode changed across restart");

  const createdPlan = await post("/api/project-plans/commands", { schemaVersion: "apb.project-plan-command.v1", type: "project-plan.create", idempotencyKey: "assistance-explicit-create", payload: { content: detail.proposedContent } });
  assert(createdPlan.revision.revision === 1 && createdPlan.revision.content.title === "Trusted assisted draft", "explicit proposal creation failed");
  const plans = await request("/api/project-plans");
  assert(plans.items.length === 1 && plans.items[0].planId === createdPlan.planId, "explicit create did not create exactly one plan revision");
  assert(json(join(state, "project-plans", createdPlan.planId, "revisions", "000001.json")).content.title === "Trusted assisted draft", "explicit revision was not persisted");
  assert(!existsSync(canary), "proposal handling executed the canary");
  console.log("smoke-dashboard-plan-assistance ok");
} finally {
  await stopServer();
  rmSync(home, { recursive: true, force: true });
}
