#!/usr/bin/env bun
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

const repo = resolve(new URL("..", import.meta.url).pathname);
const home = mkdtempSync(join(tmpdir(), "hsb-project-launch-e2e-"));
const root = join(home, "state");
const project = join(home, "managed-project");
const classicEvidenceRepo = join(home, "classic-evidence");
const hermes = join(home, "fake-hermes.cjs");
const callsPath = join(home, "hermes-calls.jsonl");
const canary = join(home, "client-command-ran");
const port = 26000 + Math.floor(Math.random() * 2000);
const base = `http://127.0.0.1:${port}`;
let dashboard: ReturnType<typeof Bun.spawn> | null = null;

const assert = (condition: unknown, message: string): asserts condition => { if (!condition) throw new Error(message); };
const jsonFile = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path: string, value: unknown) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
const git = (cwd: string, args: string[]) => {
  const result = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  assert(result.exitCode === 0, `git ${args.join(" ")} failed: ${Buffer.from(result.stderr).toString()}`);
  return Buffer.from(result.stdout).toString().trim();
};

function initRepo(path: string, title: string) {
  mkdirSync(path, { recursive: true });
  git(path, ["init"]); git(path, ["config", "user.email", "smoke@example.test"]); git(path, ["config", "user.name", "Smoke Test"]);
  writeFileSync(join(path, "README.md"), `# ${title}\n`); git(path, ["add", "README.md"]); git(path, ["commit", "-m", "fixture"]);
  return git(path, ["rev-parse", "HEAD"]);
}

async function startDashboard() {
  dashboard = Bun.spawn(["bun", "src/server.ts"], {
    cwd: join(repo, "dashboard"),
    env: { ...process.env, HOME: home, AUTONOMOUS_PROJECTS_STATE_ROOT: root, AUTONOMOUS_PROJECTS_DASHBOARD_ROOT: join(repo, "dashboard"), AUTONOMOUS_PROJECTS_DASHBOARD_HOST: "127.0.0.1", AUTONOMOUS_PROJECTS_DASHBOARD_PORT: String(port) },
    stdout: "pipe", stderr: "pipe"
  });
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`${base}/api/state`)).ok) return; } catch {}
    await Bun.sleep(50);
  }
  throw new Error("dashboard did not become ready");
}

async function stopDashboard() {
  if (!dashboard) return;
  dashboard.kill(); await dashboard.exited; dashboard = null;
}

async function request(path: string, init?: RequestInit, expected = 200) {
  const response = await fetch(base + path, init);
  const text = await response.text();
  let body: any; try { body = JSON.parse(text); } catch { body = text; }
  assert(response.status === expected, `${path} expected ${expected}, got ${response.status}: ${text}`);
  return body;
}

let keyIndex = 0;
async function command(type: string, payload: any, expectedVersion?: number, expected = 200, idempotencyKey = `${type.replaceAll(".", "-")}-${++keyIndex}`) {
  return request("/api/project-plans/commands", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ schemaVersion: "apb.project-plan-command.v1", type, idempotencyKey, expectedVersion, actor: "e2e-operator", payload }) }, expected);
}

const limits = { maxIterations: 1, maxVariantsPerIteration: 1, maxParallelVariants: 1, maxAcceptedFeatures: 1, maxVisualMotifChanges: 0, maxNewSections: 0, stopAfterNoImprovement: 1 };
const validationPolicy = { id: "apb.runner-selected.v1", expectations: ["Runner-selected validation passes"], clientCommandsAllowed: false };
const lineage = { mode: "new", sourcePlanId: null, sourceRevision: null, sourceRunId: null, sourceIterationId: null };
function content(pipelineType: "classic" | "managed", complete: boolean, title: string) {
  return {
    pipelineType, title: complete ? title : "", problem: complete ? "Prove exact approved launch execution." : "", intendedUsers: complete ? "Local operators" : "", objective: complete ? `Execute ${title}` : "", boundedScope: complete ? "Make one deterministic fixture change only." : "",
    requirements: complete ? ["Preserve immutable launch identity"] : [], nonGoals: complete ? ["No deployment"] : [], constraints: complete ? ["No source branch mutation"] : [], risks: complete ? ["Fixture-only behavior"] : [],
    repository: pipelineType === "managed" ? { path: project, baseRef: "HEAD", baseCommit: null } : { path: null, baseRef: null, baseCommit: null },
    acceptanceGates: pipelineType === "managed" ? [{ id: "approved-gate", description: "Approved variant evidence exists", severity: "must", required: true, requiredEvidence: ["artifacts/variants/variant-1.json"] }] : [],
    validationPolicy: complete ? validationPolicy : { ...validationPolicy, expectations: [] }, milestones: complete ? ["Complete fixture"] : [], limits, lineage
  };
}

async function runRunner(extra: Record<string, string> = {}) {
  const child = Bun.spawn(["bun", "runner/autonomous-project-midnight-runner.ts"], { cwd: repo, env: { ...process.env, HOME: home, AUTONOMOUS_PROJECT_STATE_ROOT: root, HERMES_BIN: hermes, FAKE_HERMES_CALLS: callsPath, CLASSIC_REPO: classicEvidenceRepo, CLASSIC_COMMIT: git(classicEvidenceRepo, ["rev-parse", "HEAD"]), APB_DISABLE_AUTO_CONTINUATION: "1", ...extra }, stdout: "pipe", stderr: "pipe" });
  const stdout = new Response(child.stdout).text(); const stderr = new Response(child.stderr).text(); const exitCode = await child.exited;
  assert(exitCode === 0, `runner failed (${exitCode}): ${await stderr}\n${await stdout}`);
}

async function approveAndLaunch(plan: any, launchKey: string) {
  const ready = await command("project-plan.ready-for-review", { planId: plan.planId, revision: plan.revision.revision, planDigest: plan.revision.contentDigest }, plan.ledger.version);
  const approved = await command("project-plan.approve", { planId: plan.planId, revision: ready.revision.revision, planDigest: ready.revision.contentDigest, notes: "exact fixture approval" }, ready.ledger.version);
  const envelope = { planId: plan.planId, revision: ready.revision.revision, planDigest: ready.revision.contentDigest };
  const launched = await command("project-plan.launch", envelope, approved.ledger.version, 200, launchKey);
  return { ready, approved, launched, envelope };
}

try {
  mkdirSync(root, { recursive: true });
  const managedBase = initRepo(project, "Managed fixture");
  initRepo(classicEvidenceRepo, "Classic evidence fixture");
  writeJson(join(root, "state.json"), { schemaVersion: "apb.state.v1", status: "idle", phase: "idle", currentRunId: null, agents: {} });
  writeJson(join(root, "control.json"), { schemaVersion: "apb.control.v1", runAdmission: "enabled", pause: { requested: false }, stop: { requested: false }, activeSteering: [{ id: "poison", text: "MUTABLE-POISON" }], requestedRunNow: false, nextRunRequest: null, autoIteration: { enabled: false } });
  writeJson(join(root, "queue.json"), { schemaVersion: "apb.queue.v1", items: [] });
  writeJson(join(root, "gates.json"), { schemaVersion: "apb.gates.v1", gates: [{ id: "mutable-poison", description: "MUTABLE-POISON", requiredEvidence: ["artifacts/missing"] }] });
  writeFileSync(join(root, "runner-prompt.md"), readFileSync(join(repo, "prompts", "runner-prompt.md")));
  writeFileSync(join(root, "telemetry.py"), "# fixture\n");
  writeFileSync(hermes, `#!/usr/bin/env node
const fs=require('fs'),path=require('path');
const args=process.argv.slice(2),query=args[args.indexOf('--query')+1]||'',agent=process.env.APB_AGENT_ID||'classic';
fs.appendFileSync(process.env.FAKE_HERMES_CALLS,JSON.stringify({agent,args})+'\\n');
const runRoot=process.env.AUTONOMOUS_PROJECT_RUN_ROOT,root=process.env.AUTONOMOUS_PROJECT_STATE_ROOT;
if(agent.startsWith('variant-')) {
  fs.writeFileSync(path.join(process.cwd(),agent+'.txt'),'focused managed change\\n');
  fs.writeFileSync(path.join(runRoot,'artifacts','variants',agent+'.json'),JSON.stringify({schemaVersion:'apb.variant.v1',variantId:agent,title:'Focused fixture',claim:'Bounded approved change',objectiveMapping:['approved objective'],changes:[agent+'.txt'],risks:[],evidence:['artifacts/variants/'+agent+'.diff'],validationNotes:'runner validates',budget:{visualMotifChanges:0,newSections:0,techStackChurn:false,unrelatedFeatures:false}},null,2));
} else if(agent.startsWith('evaluator-')) {
  const variant=(query.match(/evaluation-(variant-[0-9]+)\\.json/)||[])[1]||'variant-1';
  fs.writeFileSync(path.join(runRoot,'artifacts','evaluations','evaluation-'+variant+'.json'),JSON.stringify({schemaVersion:'apb.evaluation.v1',variantId:variant,scores:{objectiveFit:90,userValue:85,visualQuality:80,implementationQuality:90,accessibility:85,performance:90,total:87},hardGateViolations:[],recommendation:'accept',rationale:'Evidence-backed fixture evaluation',evidenceArtifacts:['artifacts/variants/'+variant+'.json','artifacts/variants/'+variant+'.diff']},null,2));
} else {
  if(!query.includes('Exact approved classic fixture')||query.includes('MUTABLE-POISON')) process.exit(42);
  fs.writeFileSync(path.join(runRoot,'artifacts','final-audit.md'),'Project: Exact approved classic fixture\\nRepo: '+process.env.CLASSIC_REPO+'\\nCommit: '+process.env.CLASSIC_COMMIT+'\\nImplemented scope: approved fixture.\\nValidation: fixture passed.\\nKnown risks: none.\\nRollback: remove fixture.\\nNext operator action: review artifacts.\\n');
  fs.writeFileSync(path.join(runRoot,'artifacts','gate-report.json'),JSON.stringify({schemaVersion:'apb.gate-report.v1',runId:process.env.AUTONOMOUS_PROJECT_RUN_ID,status:'passed',repoPath:process.env.CLASSIC_REPO,commit:process.env.CLASSIC_COMMIT,commands:[{command:'fixture-check',exitCode:0,passed:true}]},null,2));
  for(const file of [path.join(root,'state.json'),path.join(runRoot,'run.json')]){const value=JSON.parse(fs.readFileSync(file));value.status='completed';value.phase='completed';fs.writeFileSync(file,JSON.stringify(value,null,2));}
}
`);
  chmodSync(hermes, 0o755);

  await startDashboard();
  const draft = await command("project-plan.create", { content: content("classic", false, "") });
  const originalRevision = JSON.stringify(draft.revision);
  assert((await request("/api/project-plans")).items.some((item: any) => item.planId === draft.planId && item.state === "draft"), "created draft not listed");
  await stopDashboard(); await startDashboard();
  let detail = await request(`/api/project-plans/${draft.planId}`);
  assert(detail.ledger.state === "draft" && detail.revision.contentDigest === draft.revision.contentDigest, "draft did not persist across dashboard restart");

  const incompleteUpdate = await command("project-plan.update", { planId: draft.planId, content: { ...content("classic", false, ""), problem: "still incomplete" } }, draft.ledger.version);
  assert(incompleteUpdate.revision.revision === 2 && incompleteUpdate.revision.parentRevision === 1, "update did not create a child revision");
  assert(JSON.stringify(await request(`/api/project-plans/${draft.planId}/revisions/1`)) === originalRevision, "revision 1 was mutated by update");
  await command("project-plan.ready-for-review", { planId: draft.planId, revision: 2, planDigest: incompleteUpdate.revision.contentDigest }, incompleteUpdate.ledger.version, 400);
  await command("project-plan.update", { planId: draft.planId, content: content("classic", true, "wrong version") }, draft.ledger.version, 409);
  await command("project-plan.ready-for-review", { planId: draft.planId, revision: 1, planDigest: incompleteUpdate.revision.contentDigest }, incompleteUpdate.ledger.version, 409);
  await command("project-plan.ready-for-review", { planId: draft.planId, revision: 2, planDigest: "sha256:" + "0".repeat(64) }, incompleteUpdate.ledger.version, 409);

  const completeUpdate = await command("project-plan.update", { planId: draft.planId, content: content("classic", true, "Exact approved classic fixture") }, incompleteUpdate.ledger.version);
  const firstReady = await command("project-plan.ready-for-review", { planId: draft.planId, revision: completeUpdate.revision.revision, planDigest: completeUpdate.revision.contentDigest }, completeUpdate.ledger.version);
  const firstApproval = await command("project-plan.approve", { planId: draft.planId, revision: firstReady.revision.revision, planDigest: firstReady.revision.contentDigest, notes: "first exact approval" }, firstReady.ledger.version);
  assert(firstApproval.decision.revision === firstReady.revision.revision && firstApproval.decision.planDigest === firstReady.revision.contentDigest, "approval did not bind exact revision/digest");
  const edited = await command("project-plan.update", { planId: draft.planId, content: { ...content("classic", true, "Exact approved classic fixture"), boundedScope: "Edited scope creates a new revision." } }, firstApproval.ledger.version);
  assert(edited.revision.revision === firstReady.revision.revision + 1 && edited.ledger.state === "draft" && edited.ledger.effectiveApprovalId === null, "post-approval edit did not invalidate effective approval");
  await command("project-plan.launch", { planId: draft.planId, revision: edited.revision.revision, planDigest: edited.revision.contentDigest }, edited.ledger.version, 409, "launch-without-approval");
  const classic = await approveAndLaunch(edited, "classic-launch-once");
  const repeated = await command("project-plan.launch", classic.envelope, classic.approved.ledger.version, 200, "classic-launch-once");
  assert(repeated.launch.launchId === classic.launched.launch.launchId && repeated.launch.requestId === classic.launched.launch.requestId, "repeated launch request was not idempotent");
  detail = await request(`/api/project-plans/${draft.planId}`);
  assert(detail.launches.length === 1 && detail.ledger.version === classic.launched.ledger.version, "idempotent launch created more than one durable transaction");
  const launchAudits = readFileSync(join(root, "audit.jsonl"), "utf8").trim().split(/\n/).map(JSON.parse).filter((row: any) => row.action === "project-plan.launch" && row.target.id === draft.planId);
  assert(launchAudits.length === 1, "idempotent launch wrote duplicate audit transactions");

  const collisionDraft = await command("project-plan.create", { content: content("classic", true, "Collision fixture") });
  const collisionReady = await command("project-plan.ready-for-review", { planId: collisionDraft.planId, revision: collisionDraft.revision.revision, planDigest: collisionDraft.revision.contentDigest }, collisionDraft.ledger.version);
  const collisionApproved = await command("project-plan.approve", { planId: collisionDraft.planId, revision: collisionReady.revision.revision, planDigest: collisionReady.revision.contentDigest, notes: "collision approval" }, collisionReady.ledger.version);
  await command("project-plan.launch", { planId: collisionDraft.planId, revision: collisionReady.revision.revision, planDigest: collisionReady.revision.contentDigest }, collisionApproved.ledger.version, 409, "colliding-launch");
  const collisionDetail = await request(`/api/project-plans/${collisionDraft.planId}`);
  assert(collisionDetail.ledger.state === "approved" && collisionDetail.ledger.activeLaunchId === null && collisionDetail.launches.length === 0, "colliding launch created an orphaned launch transaction");

  await command("project-plan.create", { content: { ...content("classic", true, "Executable payload"), validationCommands: [["touch", canary]] } }, undefined, 400, "reject-command-field");
  await command("project-plan.create", { content: { ...content("classic", true, "Executable payload"), validationPolicy: { ...validationPolicy, command: `touch ${canary}` } } }, undefined, 400, "reject-nested-command-field");
  assert(!existsSync(canary), "client-supplied validation command canary executed");

  await runRunner();
  let launch = jsonFile(join(root, "project-plans", draft.planId, "launches", `${classic.launched.launch.launchId}.json`));
  let runRoot = join(root, "runs", launch.runId); const classicRun = jsonFile(join(runRoot, "run.json"));
  detail = await request(`/api/project-plans/${draft.planId}`);
  assert(detail.ledger.state === "completed" && detail.ledger.activeLaunchId === null, "classic terminal reconciliation retained active launch ownership");
  assert(launch.status === "completed" && classicRun.planId === draft.planId && classicRun.revision === classic.ready.revision.revision && classicRun.planDigest === classic.ready.revision.contentDigest && classicRun.approvalId === classic.approved.decision.decisionId && classicRun.requestId === launch.requestId, `classic launch/run identities did not reconcile: ${JSON.stringify({ launch, classicRun, expected: { planId: draft.planId, revision: classic.ready.revision.revision, planDigest: classic.ready.revision.contentDigest, approvalId: classic.approved.decision.decisionId } })}`);
  for (const name of ["approved-project-plan.json", "project-plan-approval.json", "project-launch.json"]) assert(JSON.stringify(jsonFile(join(runRoot, name))) === JSON.stringify(jsonFile(join(runRoot, "artifacts", "project-plan", name))), `classic identity snapshot mismatch: ${name}`);
  await runRunner();
  assert(readdirSync(join(root, "runs")).filter((id) => jsonFile(join(root, "runs", id, "run.json")).launchId === launch.launchId).length === 1, "completed classic launch was claimed twice");

  const managedDraft = await command("project-plan.create", { content: content("managed", true, "Exact managed fixture") });
  const managed = await approveAndLaunch(managedDraft, "managed-launch-once");
  assert(managed.ready.revision.content.repository.baseCommit === managedBase, "managed review did not resolve exact base commit");
  writeJson(join(root, "gates.json"), { schemaVersion: "apb.gates.v1", gates: [{ id: "approved-gate", description: "MUTATED GATE", severity: "must", requiredEvidence: ["artifacts/never-exists"] }] });
  const sourceHead = git(project, ["rev-parse", "HEAD"]); const sourceStatus = git(project, ["status", "--porcelain=v1"]);
  await runRunner();
  launch = jsonFile(join(root, "project-plans", managedDraft.planId, "launches", `${managed.launched.launch.launchId}.json`)); runRoot = join(root, "runs", launch.runId);
  const managedRun = jsonFile(join(runRoot, "run.json")); const lifecycle = jsonFile(join(runRoot, "lifecycle-contract.json")); const iteration = jsonFile(join(runRoot, "iteration-state.json")); const row = jsonFile(join(root, "iterations.json")).items.find((item: any) => item.runId === launch.runId);
  detail = await request(`/api/project-plans/${managedDraft.planId}`);
  assert(detail.ledger.state === "completed" && detail.ledger.activeLaunchId === null, "managed terminal reconciliation retained active launch ownership");
  assert(launch.status === "completed" && launch.iterationId === `iter-${launch.runId}`, "managed launch did not complete with its iteration identity");
  for (const value of [managedRun, lifecycle, iteration, row]) assert(value.planId === managedDraft.planId && value.revision === managed.ready.revision.revision && value.planDigest === managed.ready.revision.contentDigest && value.approvalId === managed.approved.decision.decisionId && value.launchId === launch.launchId, "managed plan/run/iteration identity mismatch");
  assert(managedRun.requestId === launch.requestId && lifecycle.requestId === launch.requestId && iteration.requestId === launch.requestId && row.requestId === launch.requestId && row.iterationId === launch.iterationId, "managed request/run/iteration IDs did not reconcile");
  assert(lifecycle.base.ref === "HEAD" && lifecycle.base.commit === managedBase && lifecycle.repository.path === project, "managed runner did not use exact approved repository/base");
  assert(JSON.stringify(lifecycle.limits) === JSON.stringify(limits), "managed limits were not snapshotted exactly");
  assert(lifecycle.acceptanceGates.length === 1 && lifecycle.acceptanceGates[0].description === "Approved variant evidence exists" && lifecycle.acceptanceGates[0].requiredEvidence[0] === "artifacts/variants/variant-1.json", "mutable gates.json replaced approved gate snapshot");
  assert(existsSync(join(runRoot, "worktrees", "variant-1")) && existsSync(join(runRoot, "worktrees", "mashup")) && managedRun.branch && managedRun.commit, "managed launch did not execute the real worktree runner");
  assert(git(project, ["rev-parse", "HEAD"]) === sourceHead && git(project, ["status", "--porcelain=v1"]) === sourceStatus, "managed run mutated source branch HEAD/status");
  const dashboardDetail = await request(`/api/iterations/${encodeURIComponent(launch.iterationId)}`);
  assert(dashboardDetail.run.launchId === launch.launchId && dashboardDetail.iterationState.planId === managedDraft.planId && dashboardDetail.artifacts.some((artifact: any) => artifact.name === "handoff.json"), "terminal managed handoff/identity missing from dashboard iteration detail");
  const handoff = await request(`/api/runs/${launch.runId}/artifacts/handoff.json`);
  assert(handoff.state === "completed" && handoff.runId === launch.runId && handoff.iterationId === launch.iterationId && handoff.accepted?.branch === managedRun.branch && handoff.accepted?.commit === managedRun.commit, "terminal managed handoff unavailable or incomplete through dashboard artifact API");
  const continuation = await command("project-plan.clone", { planId: managedDraft.planId, revision: detail.revision.revision, planDigest: detail.revision.contentDigest, sourceRunId: launch.runId, sourceIterationId: launch.iterationId, baseRef: managedRun.commit }, detail.ledger.version, 200, "managed-terminal-clone");
  assert(continuation.revision.content.lineage.sourceRunId === launch.runId && continuation.revision.content.lineage.sourceIterationId === launch.iterationId && continuation.revision.content.repository.baseRef === managedRun.commit && continuation.revision.content.repository.baseCommit === null, "managed continuation draft lost terminal lineage or accepted base ref");
  assert(!existsSync(canary), "validation command canary executed during a runner launch");
  console.log("smoke-runner-project-launch ok");
} finally {
  await stopDashboard(); rmSync(home, { recursive: true, force: true });
}
