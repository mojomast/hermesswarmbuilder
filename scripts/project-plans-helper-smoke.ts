#!/usr/bin/env bun
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { canonicalDigest, canonicalJson, ProjectPlanError, ProjectPlanStore, projectPlanDigest } from "../dashboard/src/project-plans";

function assert(condition: unknown, message: string) { if (!condition) throw new Error(message); }

assert(canonicalJson({ z: 1, a: { d: 4, b: 2 } }) === '{"a":{"b":2,"d":4},"z":1}', "canonical JSON must recursively sort keys");
assert(canonicalDigest("example.v1", { b: 2, a: 1 }) === canonicalDigest("example.v1", { a: 1, b: 2 }), "digest must ignore object insertion order");
assert(canonicalDigest("example.v1", { a: 1 }) !== canonicalDigest("other.v1", { a: 1 }), "digest must bind its domain");
const revision = { schemaVersion: "apb.project-plan.v1", planId: "plan-test", revision: 1, parentRevision: null, createdAt: "ignored", content: { b: 2, a: 1 } };
const digest = projectPlanDigest(revision);
assert(digest === projectPlanDigest({ ...revision, createdAt: "also-ignored", contentDigest: "ignored" }), "plan digest must exclude generated fields");
assert(/^sha256:[a-f0-9]{64}$/.test(digest), "digest must be a prefixed SHA-256 value");

const root = mkdtempSync(join(tmpdir(), "hsb-project-plan-authority-"));
try {
  const store = new ProjectPlanStore(root);
  const content = {
    pipelineType: "classic", title: "Lineage authority", problem: "Test retained lineage.", intendedUsers: "Operators", objective: "Reject forged lineage.", boundedScope: "One fixture.",
    requirements: [], nonGoals: [], constraints: [], risks: [], repository: { path: null, baseRef: null, baseCommit: null }, acceptanceGates: [],
    validationPolicy: { id: "apb.runner-selected.v1", expectations: [], clientCommandsAllowed: false }, milestones: [],
    limits: { maxIterations: 1, maxVariantsPerIteration: 1, maxParallelVariants: 1, maxAcceptedFeatures: 1, maxVisualMotifChanges: 0, maxNewSections: 0, stopAfterNoImprovement: 1 },
    lineage: { mode: "new", sourcePlanId: null, sourceRevision: null, sourceRunId: null, sourceIterationId: null }
  };
  const source = store.command({ schemaVersion: "apb.project-plan-command.v1", type: "project-plan.create", idempotencyKey: "create-source", payload: { content } });
  const foreign = store.command({ schemaVersion: "apb.project-plan-command.v1", type: "project-plan.create", idempotencyKey: "create-foreign", payload: { content: { ...content, title: "Foreign owner" } } });
  const command = (type: string, key: string, sourceRunId: string, sourceIterationId: string) => store.command({ schemaVersion: "apb.project-plan-command.v1", type, idempotencyKey: key, expectedVersion: source.ledger.version, payload: { planId: source.planId, revision: source.revision.revision, planDigest: source.revision.contentDigest, sourceRunId, sourceIterationId } });
  const rejected = (action: () => unknown, status: number) => { try { action(); } catch (error) { return error instanceof ProjectPlanError && error.status === status; } return false; };

  for (const [runId, planId] of [["run-source", source.planId], ["run-foreign", foreign.planId]]) {
    mkdirSync(join(root, "runs", runId), { recursive: true });
    writeFileSync(join(root, "runs", runId, "run.json"), JSON.stringify({ id: runId, planId }));
  }
  writeFileSync(join(root, "runs", "run-source", "iteration-state.json"), JSON.stringify({ id: "iter-source", runId: "run-source", planId: source.planId }));
  writeFileSync(join(root, "iterations.json"), JSON.stringify({ schemaVersion: "apb.iterations.v1", items: [{ id: "iter-source", iterationId: "iter-source", runId: "run-source", planId: source.planId }] }));

  assert(rejected(() => command("project-plan.clone", "missing-run", "run-missing", "iter-source"), 404), "clone must reject a missing source run");
  assert(rejected(() => command("project-plan.clone", "foreign-run", "run-foreign", "iter-source"), 409), "clone must reject a run owned by another plan");
  assert(rejected(() => command("project-plan.fork", "missing-iteration", "run-source", "iter-missing"), 404), "fork must reject a missing source iteration");
  assert(store.list().items.length === 2, "rejected lineage commands must not persist plans");
  const clone = command("project-plan.clone", "valid-lineage", "run-source", "iter-source");
  assert(clone.revision.content.lineage.sourceRunId === "run-source" && clone.revision.content.lineage.sourceIterationId === "iter-source", "valid retained lineage must persist exactly");
} finally {
  rmSync(root, { recursive: true, force: true });
}
console.log("project plan deterministic helper smoke: pass");
