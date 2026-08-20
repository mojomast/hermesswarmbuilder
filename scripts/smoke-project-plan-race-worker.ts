#!/usr/bin/env bun
import { ProjectPlanStore } from "../dashboard/src/project-plans";

const [root, idempotencyKey, title] = process.argv.slice(2);
if (!root || !idempotencyKey || !title) throw new Error("usage: smoke-project-plan-race-worker.ts ROOT KEY TITLE");

const content = {
  pipelineType: "classic", title, problem: "Exercise project-plan control-state serialization.", intendedUsers: "Local operators.", objective: "Create a race-test plan.", boundedScope: "Persist one isolated classic plan.",
  requirements: ["persist a plan"], nonGoals: ["do not launch"], constraints: ["local only"], risks: ["concurrent writers"],
  repository: { path: null, baseRef: null, baseCommit: null }, acceptanceGates: [], validationPolicy: { id: "apb.runner-selected.v1", expectations: ["smoke"], clientCommandsAllowed: false }, milestones: ["created"],
  limits: { maxIterations: 1, maxVariantsPerIteration: 1, maxParallelVariants: 1, maxAcceptedFeatures: 1, maxVisualMotifChanges: 0, maxNewSections: 0, stopAfterNoImprovement: 1 },
  lineage: { mode: "new", sourcePlanId: null, sourceRevision: null, sourceRunId: null, sourceIterationId: null }
};

const store = new ProjectPlanStore(root);
try { store.command({ schemaVersion: "apb.project-plan-command.v1", type: "project-plan.create", idempotencyKey, payload: { content } }); }
finally { (store as any).launchAuthority?.close(); }