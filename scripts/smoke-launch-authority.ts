#!/usr/bin/env bun
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { LaunchAuthority } from "../dashboard/src/launch-authority";

const assert = (condition: unknown, message: string): asserts condition => { if (!condition) throw new Error(message); };
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path: string, value: unknown) => { mkdirSync(join(path, ".."), { recursive: true }); writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`); };
const waitFor = (path: string) => { const deadline = Date.now() + 5000; while (!existsSync(path) && Date.now() < deadline) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10); assert(existsSync(path), `timed out waiting for ${path}`); };
const root = mkdtempSync(join(tmpdir(), "hsb-launch-authority-"));
const planId = "plan-fixture", launchId = "launch-fixture", requestId = "request-fixture", approvalId = "decision-fixture";
const planRoot = join(root, "project-plans", planId);
const launchPath = join(planRoot, "launches", `${launchId}.json`);
const ledgerPath = join(planRoot, "ledger.json");
const controlPath = join(root, "control.json");
const iterationsPath = join(root, "iterations.json");
const identity = { planId, revision: 1, planDigest: `sha256:${"1".repeat(64)}`, approvalId, approvalDigest: `sha256:${"2".repeat(64)}`, launchId, requestId, pipelineType: "managed" };

try {
  writeJson(join(planRoot, "revisions", "000001.json"), { schemaVersion: "apb.project-plan.v1", planId, revision: 1, contentDigest: identity.planDigest, content: { title: "Fixture", pipelineType: "managed" } });
  writeJson(launchPath, { schemaVersion: "apb.project-launch.v1", launchId, idempotencyKey: "fixture-key", ...identity, status: "requested", requestedAt: "2026-01-01T00:00:00.000Z", requestedBy: "test", runId: null, iterationId: null });
  writeJson(ledgerPath, { schemaVersion: "apb.project-plan-ledger.v1", planId, version: 4, currentRevision: 1, currentDigest: identity.planDigest, state: "launch-requested", effectiveApprovalId: approvalId, activeLaunchId: launchId, validation: { revision: 1, digest: identity.planDigest, valid: true }, updatedAt: "2026-01-01T00:00:00.000Z" });
  writeJson(join(root, "project-plans", "index.json"), { schemaVersion: "apb.project-plan-index.v1", plans: {} });
  writeJson(controlPath, { schemaVersion: "apb.control.v1", requestedRunNow: false });
  writeJson(iterationsPath, { schemaVersion: "apb.iterations.v1", items: [] });

  const authority = new LaunchAuthority(root);
  authority.reconcile();
  assert(existsSync(join(root, "launch-authority.sqlite")), "authority database was not created");
  assert(readJson(controlPath).projectLaunchRequest?.launchId === launchId && readJson(controlPath).projectLaunchRequest?.status === "pending", "partial legacy admission did not restore the compatible pending control pointer");

  const first = authority.claim(identity, "run-fixture", "iter-run-fixture");
  const second = authority.claim(identity, "run-other", "iter-run-other");
  assert(first.status === "claimed", "first atomic claim did not succeed");
  assert(second.status === "already-claimed" && second.record.runId === "run-fixture", "second claim was not rejected exactly once");
  assert(readJson(launchPath).status === "running" && readJson(ledgerPath).state === "running", "claim projections were not reconciled");
  assert(readJson(controlPath).projectLaunchRequest.runId === "run-fixture", "control claim projection is stale");
  assert(readJson(iterationsPath).items.some((row: any) => row.launchId === launchId && row.runId === "run-fixture" && row.iterationId === "iter-run-fixture"), "iteration mapping was not projected");

  // Simulate a crash leaving every legacy projection behind the committed authority row.
  const staleLaunch = readJson(launchPath); Object.assign(staleLaunch, { status: "requested", runId: null, iterationId: null }); writeJson(launchPath, staleLaunch);
  const staleLedger = readJson(ledgerPath); Object.assign(staleLedger, { version: 4, state: "launch-requested" }); writeJson(ledgerPath, staleLedger);
  const staleControl = readJson(controlPath); delete staleControl.projectLaunchRequest; writeJson(controlPath, staleControl);
  writeJson(iterationsPath, { schemaVersion: "apb.iterations.v1", items: [] });
  authority.reconcile();
  assert(readJson(launchPath).status === "running" && readJson(launchPath).runId === "run-fixture", "running launch did not recover after partial projection crash");
  assert(readJson(ledgerPath).version === first.record.ledgerVersion, "ledger version did not recover from authority");
  assert(readJson(controlPath).projectLaunchRequest.status === "running", "running control pointer did not recover");

  // Freeze a second process after it reads the running authority generation.
  // A terminal transition must win when the stale reconciler subsequently gets
  // the projection lock; otherwise it would restore the old running generation.
  const staleReady = join(root, "stale-authority.ready"), staleProceed = join(root, "stale-authority.continue");
  const staleReconciler = Bun.spawn(["bun", "scripts/smoke-launch-authority-worker.ts", "reconcile", root], {
    cwd: join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe",
    env: { ...process.env, APB_TEST_AUTHORITY_RECONCILE_READY: staleReady, APB_TEST_AUTHORITY_RECONCILE_CONTINUE: staleProceed }
  });
  waitFor(staleReady);
  const terminal = authority.transition(identity, "completed", "run-fixture", "iter-run-fixture", { resultCommit: "abc123" });
  writeFileSync(staleProceed, "continue");
  assert(await staleReconciler.exited === 0, "stale authority reconciler failed");
  assert(readJson(launchPath).status === "completed" && readJson(ledgerPath).state === "completed", "stale authority reconciliation overwrote the terminal launch generation");
  assert(readJson(controlPath).projectLaunchRequest.status === "completed", "stale authority reconciliation overwrote the terminal control generation");
  assert(readJson(iterationsPath).items.find((row: any) => row.launchId === launchId)?.status === "completed", "stale authority reconciliation overwrote the terminal iteration generation");

  assert(terminal.status === "transitioned", "terminal transition failed");
  assert(readJson(launchPath).status === "completed" && readJson(ledgerPath).activeLaunchId === null, "terminal launch/ledger projections are stale");
  assert(readJson(controlPath).projectLaunchRequest.status === "completed", "terminal control projection is stale");
  assert(readJson(iterationsPath).items.find((row: any) => row.launchId === launchId)?.status === "completed", "terminal iteration projection is stale");

  // A later plan mutation owns the ledger after launch authority has terminalized its launch.
  const mutatedLedger = readJson(ledgerPath);
  Object.assign(mutatedLedger, { version: terminal.record.ledgerVersion + 2, state: "archived", currentRevision: 2, currentDigest: `sha256:${"3".repeat(64)}`, effectiveApprovalId: null, updatedAt: "2026-01-02T00:00:00.000Z" });
  writeJson(ledgerPath, mutatedLedger);
  authority.close();
  const restarted = new LaunchAuthority(root);
  restarted.reconcile();
  const recoveredLedger = readJson(ledgerPath);
  assert(recoveredLedger.version === mutatedLedger.version && recoveredLedger.state === "archived", "restart overwrote a post-terminal ledger transition");
  assert(recoveredLedger.currentRevision === 2 && recoveredLedger.currentDigest === mutatedLedger.currentDigest, "restart reverted a post-terminal plan mutation");

  // Simulate a process crash immediately after the durable requested -> running claim.
  const crashPlanId = "plan-crash", crashLaunchId = "launch-crash";
  const crashIdentity = { ...identity, planId: crashPlanId, launchId: crashLaunchId, requestId: "request-crash" };
  const crashRoot = join(root, "project-plans", crashPlanId);
  writeJson(join(crashRoot, "revisions", "000001.json"), { schemaVersion: "apb.project-plan.v1", planId: crashPlanId, revision: 1, contentDigest: crashIdentity.planDigest, content: { title: "Crash fixture", pipelineType: "managed" } });
  writeJson(join(crashRoot, "ledger.json"), { schemaVersion: "apb.project-plan-ledger.v1", planId: crashPlanId, version: 1, currentRevision: 1, currentDigest: crashIdentity.planDigest, state: "approved", effectiveApprovalId: approvalId, activeLaunchId: null, validation: { revision: 1, digest: crashIdentity.planDigest, valid: true }, updatedAt: "2026-01-03T00:00:00.000Z" });
  const crashLaunch = { schemaVersion: "apb.project-launch.v1", idempotencyKey: "crash-key", ...crashIdentity, status: "requested", requestedAt: "2026-01-03T00:00:00.000Z", requestedBy: "test", runId: null, iterationId: null };
  restarted.admit(crashLaunch, 1);
  restarted.claim(crashIdentity, "run-crash", "iter-run-crash");
  restarted.close();
  const recovered = new LaunchAuthority(root);
  const nextPlanId = "plan-after-crash", nextLaunchId = "launch-after-crash";
  const nextIdentity = { ...identity, planId: nextPlanId, launchId: nextLaunchId, requestId: "request-after-crash" };
  const nextRoot = join(root, "project-plans", nextPlanId);
  writeJson(join(nextRoot, "revisions", "000001.json"), { schemaVersion: "apb.project-plan.v1", planId: nextPlanId, revision: 1, contentDigest: nextIdentity.planDigest, content: { title: "After crash", pipelineType: "managed" } });
  writeJson(join(nextRoot, "ledger.json"), { schemaVersion: "apb.project-plan-ledger.v1", planId: nextPlanId, version: 1, currentRevision: 1, currentDigest: nextIdentity.planDigest, state: "approved", effectiveApprovalId: approvalId, activeLaunchId: null, validation: { revision: 1, digest: nextIdentity.planDigest, valid: true }, updatedAt: "2026-01-04T00:00:00.000Z" });
  const nextLaunch = { schemaVersion: "apb.project-launch.v1", idempotencyKey: "after-crash-key", ...nextIdentity, status: "requested", requestedAt: "2026-01-04T00:00:00.000Z", requestedBy: "test", runId: null, iterationId: null };
  const nextAdmission = recovered.admit(nextLaunch, 1);
  assert(nextAdmission.status === "admitted", "next admission remained blocked by a stranded running launch");
  const recoveredCrashLaunch = readJson(join(crashRoot, "launches", `${crashLaunchId}.json`));
  assert(recoveredCrashLaunch.status === "blocked", "stranded running launch was not terminalized on next admission");
  assert(readJson(join(crashRoot, "ledger.json")).state === "blocked" && readJson(join(crashRoot, "ledger.json")).activeLaunchId === null, "stranded launch recovery did not release its ledger slot");
  recovered.rejectRequested(nextLaunchId, { rejectionReason: "test cleanup" });
  recovered.close();

  // Hold an unrelated read-modify-write across a second process' reconciliation.
  const crashLaunchPath = join(crashRoot, "launches", `${crashLaunchId}.json`);
  const staleCrashLaunch = readJson(crashLaunchPath); Object.assign(staleCrashLaunch, { status: "running" }); writeJson(crashLaunchPath, staleCrashLaunch);
  const staleCrashLedger = readJson(join(crashRoot, "ledger.json")); Object.assign(staleCrashLedger, { version: Number(staleCrashLedger.version) - 1, state: "running", activeLaunchId: crashLaunchId }); writeJson(join(crashRoot, "ledger.json"), staleCrashLedger);
  const ready = join(root, "projection-writer.ready"), proceed = join(root, "projection-writer.continue");
  const writer = Bun.spawn(["bun", "scripts/smoke-launch-authority-worker.ts", "lock-writer", root, ready, proceed], { cwd: join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" });
  waitFor(ready);
  const reconciler = Bun.spawn(["bun", "scripts/smoke-launch-authority-worker.ts", "reconcile", root], { cwd: join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" });
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  writeFileSync(proceed, "continue");
  assert(await writer.exited === 0, "concurrent projection writer failed");
  assert(await reconciler.exited === 0, "concurrent authority reconciler failed");
  assert(readJson(controlPath).concurrentControlUpdate?.writer, "authority reconciliation lost an unrelated concurrent control update");
  assert(readJson(controlPath).updatedAt === "2099-01-01T00:00:00.000Z", "authority reconciliation regressed the concurrent control generation");
  assert(readJson(join(root, "project-plans", "index.json")).plans["unrelated-concurrent-plan"], "authority reconciliation lost an unrelated concurrent index update");
  assert(readJson(join(root, "project-plans", "index.json")).updatedAt === "2099-01-01T00:00:00.000Z", "authority reconciliation regressed the concurrent index generation");
  assert(readJson(iterationsPath).items.some((row: any) => row.id === "unrelated-concurrent-iteration"), "authority reconciliation lost an unrelated concurrent iteration update");
  assert(readJson(iterationsPath).updatedAt === "2099-01-01T00:00:00.000Z", "authority reconciliation regressed the concurrent iteration generation");
  assert(readJson(crashLaunchPath).status === "blocked", "concurrent writer overwrote the authority launch projection");
  console.log("smoke-launch-authority ok");
} finally {
  rmSync(root, { recursive: true, force: true });
}
