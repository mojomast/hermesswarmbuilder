#!/usr/bin/env bun
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { LaunchAuthority, withProjectionLock } from "../dashboard/src/launch-authority";

const [mode, root, ready, proceed] = process.argv.slice(2);
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const waitFor = (path: string) => {
  const deadline = Date.now() + 5000;
  while (!existsSync(path) && Date.now() < deadline) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
  if (!existsSync(path)) throw new Error(`timed out waiting for ${path}`);
};

if (mode === "lock-writer") {
  withProjectionLock(root, () => {
    const controlPath = join(root, "control.json");
    const indexPath = join(root, "project-plans", "index.json");
    const iterationsPath = join(root, "iterations.json");
    const control = readJson(controlPath), index = readJson(indexPath), iterations = readJson(iterationsPath);
    writeFileSync(ready, "ready");
    waitFor(proceed);
    control.concurrentControlUpdate = { writer: process.pid };
    control.updatedAt = "2099-01-01T00:00:00.000Z";
    index.plans["unrelated-concurrent-plan"] = { planId: "unrelated-concurrent-plan", state: "draft", version: 7 };
    index.updatedAt = "2099-01-01T00:00:00.000Z";
    iterations.items.unshift({ id: "unrelated-concurrent-iteration", status: "running" });
    iterations.updatedAt = "2099-01-01T00:00:00.000Z";
    writeFileSync(controlPath, `${JSON.stringify(control, null, 2)}\n`);
    writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
    writeFileSync(iterationsPath, `${JSON.stringify(iterations, null, 2)}\n`);
  });
} else if (mode === "reconcile") {
  const authority = new LaunchAuthority(root);
  authority.reconcile();
  authority.close();
} else {
  throw new Error(`unknown mode ${mode}`);
}
