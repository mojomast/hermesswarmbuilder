#!/usr/bin/env bun
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const assert = (condition: unknown, message: string): asserts condition => { if (!condition) throw new Error(message); };
const waitFor = (path: string) => { const deadline = Date.now() + 5_000; while (!existsSync(path) && Date.now() < deadline) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10); assert(existsSync(path), `timed out waiting for ${path}`); };
const root = mkdtempSync(join(tmpdir(), "hsb-project-plan-race-"));

try {
  const ready = join(root, "first-ready"), proceed = join(root, "first-proceed"), cwd = join(import.meta.dir, "..");
  const first = Bun.spawn(["bun", "scripts/smoke-project-plan-race-worker.ts", root, "race-create-first", "First writer"], {
    cwd, stdout: "pipe", stderr: "pipe", env: { ...process.env, APB_TEST_PLAN_IDEMPOTENCY_READY: ready, APB_TEST_PLAN_IDEMPOTENCY_CONTINUE: proceed }
  });
  waitFor(ready);
  const second = Bun.spawn(["bun", "scripts/smoke-project-plan-race-worker.ts", root, "race-create-second", "Second writer"], { cwd, stdout: "pipe", stderr: "pipe" });
  const secondFinishedWhileFirstHeld = await Promise.race([second.exited.then(() => true), Bun.sleep(100).then(() => false)]);
  assert(!secondFinishedWhileFirstHeld, "second project-plan command bypassed the first command's control-state lock");
  writeFileSync(proceed, "continue");
  assert(await first.exited === 0, "first project-plan race worker failed");
  assert(await second.exited === 0, "second project-plan race worker failed");
  const idempotency = JSON.parse(readFileSync(join(root, "project-plans", "idempotency.json"), "utf8"));
  const index = JSON.parse(readFileSync(join(root, "project-plans", "index.json"), "utf8"));
  assert(idempotency.records["race-create-first"] && idempotency.records["race-create-second"], "stale project-plan idempotency write lost a concurrent admission");
  const planIds = Object.keys(index.plans || {});
  assert(planIds.length === 2, "stale project-plan index write lost a concurrent plan");
  console.log("smoke-project-plan-race ok");
} finally {
  rmSync(root, { recursive: true, force: true });
}