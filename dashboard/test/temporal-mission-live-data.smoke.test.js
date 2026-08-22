import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ControlPlaneClient, deriveCanonicalDisposition } from "../public/control-planes/shared/api-client.js";
import { projectTemporalMissionSnapshot, renderTemporalMissionLiveMarkup } from "../public/control-planes/temporal-mission/temporal-mission.js";

const dashboardRoot = resolve(import.meta.dir, "..");
const serverPath = join(dashboardRoot, "src/server.ts");
const processes = [];
const roots = [];

async function writeJson(root, relativePath, value) {
  const path = join(root, relativePath);
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function startDashboard(stateRoot) {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const proc = Bun.spawn([process.execPath, serverPath], {
    cwd: dashboardRoot,
    env: {
      ...process.env,
      AUTONOMOUS_PROJECTS_DASHBOARD_HOST: "127.0.0.1",
      AUTONOMOUS_PROJECTS_DASHBOARD_PORT: String(port),
      AUTONOMOUS_PROJECTS_DASHBOARD_ROOT: dashboardRoot,
      AUTONOMOUS_PROJECTS_STATE_ROOT: stateRoot
    },
    stdout: "ignore",
    stderr: "pipe"
  });
  processes.push(proc);
  const baseUrl = `http://127.0.0.1:${port}`;
  let lastError;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/state`);
      if (response.ok) return baseUrl;
    } catch (error) {
      lastError = error;
    }
    await Bun.sleep(20);
  }
  const stderr = await new Response(proc.stderr).text();
  throw new Error(`dashboard did not start: ${stderr || lastError}`);
}

afterEach(async () => {
  for (const proc of processes.splice(0)) proc.kill();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("Temporal Mission live-data contract resyncs fixture state instead of demo identities or success", async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), "temporal-mission-live-data-"));
  roots.push(stateRoot);
  const state = {
    schemaVersion: "apb.state.v1",
    currentRunId: "run-live-blocked-7",
    status: "blocked",
    phase: "awaiting-live-evidence",
    pipeline: "managed",
    planId: "plan-live-identity-7",
    revision: 17,
    launchId: "launch-live-identity-7",
    iterationId: "iter-live-identity-7",
    objective: "Prove Temporal Mission reads isolated live state",
    agents: {}
  };
  const control = {
    schemaVersion: "apb.control.v1",
    runAdmission: "paused",
    pause: { requested: true, reason: "fixture checkpoint" },
    stop: { requested: false },
    activeSteering: [{ id: "steer-live-7", text: "Do not report demo success" }]
  };
  const gate = { id: "gate-live-7", description: "Live fixture gate", required: true, status: "failed" };
  const event = { id: "evt-live-7", ts: "2026-08-21T16:00:00.000Z", type: "gate-failed", message: "Live fixture gate failed" };
  await Promise.all([
    writeJson(stateRoot, "state.json", state),
    writeJson(stateRoot, "control.json", control),
    writeJson(stateRoot, "gates.json", { schemaVersion: "apb.gates.v1", gates: [gate] }),
    writeJson(stateRoot, "iterations.json", { schemaVersion: "apb.iterations.v1", items: [{ id: "iter-live-identity-7", runId: "run-live-blocked-7", objective: state.objective, status: "blocked" }] }),
    writeJson(stateRoot, "project-plans/index.json", { schemaVersion: "apb.project-plan-index.v1", plans: { "plan-live-identity-7": { planId: "plan-live-identity-7", title: "Live fixture plan", pipelineType: "managed", state: "approved", version: 17, currentRevision: 17, updatedAt: "2026-08-21T16:00:00.000Z" } } }),
    writeJson(stateRoot, "runs/run-live-blocked-7/run.json", { id: "run-live-blocked-7", status: "blocked", startedAt: "2026-08-21T15:00:00.000Z", selectedProject: { name: "Live fixture project" } }),
    writeFile(join(stateRoot, "events.jsonl"), `${JSON.stringify(event)}\n`)
  ]);

  const baseUrl = await startDashboard(stateRoot);
  const client = new ControlPlaneClient(baseUrl);
  const messages = [];
  client.subscribe((message) => messages.push(message));
  await client.resyncSnapshots();

  expect(client.cachedState).toMatchObject(state);
  expect(client.cachedPlans).toEqual([expect.objectContaining({ planId: "plan-live-identity-7", title: "Live fixture plan" })]);
  expect(client.cachedControl).toMatchObject(control);
  expect(client.cachedIterations).toEqual([expect.objectContaining({ id: "iter-live-identity-7", runId: "run-live-blocked-7" })]);
  expect(client.cachedRuns).toEqual([expect.objectContaining({ id: "run-live-blocked-7", status: "blocked" })]);
  expect(client.cachedGates.gates).toEqual([gate]);
  expect(client.cachedEvents).toEqual([event]);
  expect(messages.at(-1)).toMatchObject({ type: "resynchronized", events: [event] });
  const temporalSource = await Bun.file(join(dashboardRoot, "public/control-planes/temporal-mission/temporal-mission.js")).text();
  expect(temporalSource).toContain('case "stage-view":\n        if (this.liveProjection) this.renderLiveInspector(ch);');
  expect(temporalSource).toContain('case "radar":\n        this.render2DRadarRubricView();');
  expect(temporalSource).toContain('case "variants":\n        this.renderVariantsAndDiffsView();');
  expect(temporalSource).toContain('case "synthesis":\n        this.renderSynthesisView();');
  expect(temporalSource).toContain('case "gates":\n        this.renderGatesView();');
  expect(temporalSource).toContain('case "handoff":\n        this.renderHandoffView();');
  expect(temporalSource).not.toContain('if (this.liveProjection) {\n      this.renderLiveInspector(ch);\n      return;\n    }');
  expect(temporalSource).toContain('this.selectChamber(this.selectedChamberIndex, { resetTab: false });');
  expect(temporalSource).toContain('selectChamber(idx, { resetTab = true } = {})');
  expect(temporalSource).toContain('if (resetTab) this.setActiveInspectorTab("stage-view");');
  expect(temporalSource).toContain("const stageFocus =");
  expect(temporalSource).toContain("Stage-specific observed activity");

  expect(temporalSource).toContain("await this.client.resyncSnapshots()");
  expect(temporalSource).toContain("deriveCanonicalDisposition({ status: live.runStatus, phase: live.phase }, live.control, null, live.handoff)");
  expect(temporalSource).not.toContain("this.el.hudRun.textContent = state.currentRunId || 'run-103-spatial'");
  expect(temporalSource).not.toContain('const approval = "sha256:7f4a2..."');
});

test("Temporal Mission projects one selected run's observed progress without stale iteration data", () => {
  const live = projectTemporalMissionSnapshot({
    cachedState: {
      currentRunId: "run-current",
      iterationId: "iter-current",
      status: "blocked",
      phase: "validation",
      currentTask: "Run focused smoke",
      startedAt: "2026-08-21T15:00:00.000Z",
      updatedAt: "2026-08-21T15:08:00.000Z",
      blockers: [{ id: "block-1", summary: "Missing evidence", suggestedAction: "Attach audit output" }]
    },
    cachedRuns: [
      {
        id: "run-stale",
        iterationId: "iter-stale",
        status: "completed",
        phase: "handoff",
        checkpoints: ["stale checkpoint"],
        artifacts: ["stale/artifact.json"]
      },
      {
        id: "run-current",
        iterationId: "iter-current",
        status: "blocked",
        phase: "validation",
        startedAt: "2026-08-21T15:00:00.000Z",
        updatedAt: "2026-08-21T15:08:00.000Z",
        checkpoints: [{ name: "after-evaluation", status: "passed", at: "2026-08-21T15:05:00.000Z" }],
        validation: { status: "failed", startedAt: "2026-08-21T15:06:00.000Z", completedAt: "2026-08-21T15:07:00.000Z", results: [{ name: "focused smoke", status: "failed" }] },
        artifacts: [{ path: "artifacts/handoff.json" }]
      }
    ],
    cachedIterations: [
      { id: "iter-stale", runId: "run-stale", variants: [{ id: "stale-variant" }] },
      {
        id: "iter-current",
        runId: "run-current",
        currentAgent: "evaluator-1",
        currentTask: "Evaluate candidate-a",
        variants: [{ id: "candidate-a", status: "complete" }],
        evaluations: [{ variantId: "candidate-a", status: "passed", recommendation: "accept" }],
        synthesis: { status: "pending" },
        mashup: { status: "queued" }
      }
    ],
    cachedGates: { gates: [{ id: "gate-current", status: "failed", decision: "reject", requiredEvidence: ["artifacts/handoff.json"] }] },
    cachedControl: {},
    cachedEvents: [
      { id: "evt-stale", runId: "run-stale", message: "ignore stale event" },
      { id: "evt-current", runId: "run-current", type: "tool", message: "focused smoke failed", ts: "2026-08-21T15:07:00.000Z" }
    ],
    cachedAudit: [{ id: "audit-current", runId: "run-current", action: "gate decision", ts: "2026-08-21T15:08:00.000Z" }]
  });

  expect(live.identity.runId).toBe("run-current");
  expect(live.progress.currentAgent).toBe("evaluator-1");
  expect(live.progress.checkpoints).toEqual([expect.objectContaining({ name: "after-evaluation" })]);
  expect(live.progress.validation).toMatchObject({ status: "failed", results: [expect.objectContaining({ name: "focused smoke" })] });
  expect(live.progress.blockers).toEqual([expect.objectContaining({ suggestedAction: "Attach audit output" })]);
  expect(live.progress.events).toEqual([expect.objectContaining({ id: "evt-current" })]);
  expect(live.progress.events).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: "evt-stale" })]));
  expect(renderTemporalMissionLiveMarkup(live, live.chambers[3])).toContain("Attach audit output");

  const empty = projectTemporalMissionSnapshot({ cachedState: {}, cachedRuns: [], cachedIterations: [] });
  expect(empty.progress.state).toBe("No active run");
  expect(renderTemporalMissionLiveMarkup(empty, empty.chambers[3])).toContain("No active run");
});