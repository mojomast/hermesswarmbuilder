#!/usr/bin/env node
import assert from "node:assert/strict";
import { projectTemporalMissionSnapshot, renderTemporalMissionLiveMarkup } from "../dashboard/public/control-planes/temporal-mission/temporal-mission.js";

const fixture = {
  cachedState: { currentRunId: "run-live-742", iterationId: "iter-live-742", status: "completed", phase: "terminal-handoff", objective: "Ship the observed live mission" },
  cachedPlans: [{ planId: "plan-live-902", currentRevision: 7, state: "completed" }],
  cachedControl: { runAdmission: "paused", projectLaunchRequest: { planId: "plan-live-902", revision: 7, approvalId: "decision-live-31", approvalDigest: "sha256:live-approval", launchId: "launch-live-66", requestId: "request-live-89", runId: "run-live-742", iterationId: "iter-live-742", pipelineType: "managed", status: "completed" } },
  cachedRuns: [
    { id: "run-history-11", status: "blocked", objective: "Earlier observed mission" },
    { id: "run-live-742", status: "completed", phase: "terminal-handoff", planId: "plan-live-902", revision: 7, approvalId: "decision-live-31", launchId: "launch-live-66", requestId: "request-live-89", iterationId: "iter-live-742" }
  ],
  cachedIterations: [{ id: "iter-live-742", runId: "run-live-742", status: "completed", generation: 4, objective: "Ship the observed live mission", projectLaunch: { planId: "plan-live-902", revision: 7, approvalId: "decision-live-31", approvalDigest: "sha256:live-approval", launchId: "launch-live-66", requestId: "request-live-89", pipelineType: "managed" }, variants: [{ id: "variant-live-a", branch: "mission/live-a", commit: "abc742", status: "accepted" }], evaluations: [{ variantId: "variant-live-a", status: "passed", totalScore: 97.5, recommendation: "accept", scores: { objectiveFit: 98 } }], handoff: { state: "completed", accepted: { branch: "mission/live-a", commit: "abc742" }, artifacts: [{ name: "handoff.json" }] } }],
  cachedGates: { gates: [{ id: "gate-live-proof", description: "Live fixture evidence", severity: "must", status: "passed", requiredEvidence: ["artifacts/handoff.json"] }] },
  cachedAudit: [{ id: "audit-live-1", action: "completed" }]
};

const projection = projectTemporalMissionSnapshot(fixture);
const visibleText = renderTemporalMissionLiveMarkup(projection, projection.chambers[6]);
for (const expected of ["plan-live-902", "decision-live-31", "launch-live-66", "request-live-89", "run-live-742", "iter-live-742", "variant-live-a", "gate-live-proof", "completed", "handoff.json"]) assert(visibleText.includes(expected), `live projection did not render ${expected}`);
for (const demoId of ["plan-9021", "lnch-002", "req-11", "run-103-spatial", "iter-004-spatial", "v1-balanced"]) assert(!visibleText.includes(demoId), `connected projection leaked demo identifier ${demoId}`);
assert.equal(projection.chambers.find((chamber) => chamber.id === "gate").status, "passed");
assert.equal(projection.variants[0].totalScore, 97.5);
assert.equal(projection.historicalRuns[0].id, "run-history-11");
console.log("smoke-temporal-mission-live ok");
