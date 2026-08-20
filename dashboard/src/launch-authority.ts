import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "fs";
import { randomUUID } from "crypto";
import { join, resolve } from "path";

const ACTIVE = new Set(["requested", "running"]);
const TERMINAL = new Set(["completed", "paused", "blocked", "rejected"]);
const STATUS = new Set([...ACTIVE, ...TERMINAL]);
const now = () => new Date().toISOString();
const monotonicUpdatedAt = (current: unknown, incoming: string) => typeof current === "string" && current > incoming ? current : incoming;
const readJson = (path: string, fallback: any = null) => { try { return JSON.parse(readFileSync(path, "utf8")); } catch { return fallback; } };
function atomicJson(path: string, value: unknown) {
  mkdirSync(resolve(path, ".."), { recursive: true });
  const temp = `${path}.tmp-${process.pid}-${randomUUID()}`;
  try { writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); renameSync(temp, path); }
  finally { if (existsSync(temp)) unlinkSync(temp); }
}

const pause = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
export function withProjectionLock<T>(root: string, action: () => T): T {
  const lock = join(root, ".launch-projection.lock");
  const token = randomUUID();
  const deadline = Date.now() + 10_000;
  while (true) {
    try {
      mkdirSync(lock);
      writeFileSync(join(lock, "owner.json"), JSON.stringify({ pid: process.pid, token, createdAt: now() }), { mode: 0o600 });
      break;
    } catch {
      let stale = false;
      try {
        const owner = readJson(join(lock, "owner.json"), null);
        if (owner && Number.isInteger(owner.pid)) {
          try { process.kill(owner.pid, 0); } catch (error: any) { stale = error?.code === "ESRCH"; }
        } else {
          stale = Date.now() - statSync(lock).mtimeMs > 30_000;
        }
      } catch {}
      if (stale) {
        const quarantine = `${lock}.stale-${token}`;
        try { renameSync(lock, quarantine); rmSync(quarantine, { recursive: true, force: true }); continue; } catch {}
      }
      if (Date.now() >= deadline) throw new Error("timed out acquiring launch projection lock");
      pause(10);
    }
  }
  try { return action(); }
  finally {
    const owner = readJson(join(lock, "owner.json"), null);
    if (owner?.token === token) rmSync(lock, { recursive: true, force: true });
  }
}

export type LaunchIdentity = {
  planId: string; revision: number; planDigest: string; approvalId: string; approvalDigest: string;
  launchId: string; requestId: string; pipelineType: "classic" | "managed";
};
export type LaunchRecord = LaunchIdentity & {
  idempotencyKey: string; status: string; runId: string | null; iterationId: string | null;
  ledgerVersion: number; launch: any; metadata: any; updatedAt: string;
};

type MutationResult = { status: string; record: LaunchRecord };

export class LaunchAuthority {
  private db: Database;
  private projectPlans: string;
  constructor(private root: string) {
    mkdirSync(root, { recursive: true });
    this.projectPlans = join(root, "project-plans");
    this.db = new Database(join(root, "launch-authority.sqlite"), { create: true, strict: true });
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;");
    this.db.exec(`CREATE TABLE IF NOT EXISTS launches (
      launch_id TEXT PRIMARY KEY,
      idempotency_key TEXT NOT NULL UNIQUE,
      plan_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      plan_digest TEXT NOT NULL,
      approval_id TEXT NOT NULL,
      approval_digest TEXT NOT NULL,
      request_id TEXT NOT NULL UNIQUE,
      pipeline_type TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('requested','running','completed','paused','blocked','rejected')),
      run_id TEXT,
      iteration_id TEXT,
      ledger_version INTEGER NOT NULL,
      launch_json TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS one_active_launch ON launches((1)) WHERE status IN ('requested','running');`);
    this.bootstrapLegacy();
  }

  close() { this.db.close(); }

  private row(raw: any): LaunchRecord {
    return {
      planId: raw.plan_id, revision: raw.revision, planDigest: raw.plan_digest, approvalId: raw.approval_id,
      approvalDigest: raw.approval_digest, launchId: raw.launch_id, requestId: raw.request_id,
      pipelineType: raw.pipeline_type, idempotencyKey: raw.idempotency_key, status: raw.status,
      runId: raw.run_id, iterationId: raw.iteration_id, ledgerVersion: raw.ledger_version,
      launch: JSON.parse(raw.launch_json), metadata: JSON.parse(raw.metadata_json || "{}"), updatedAt: raw.updated_at
    };
  }

  private get(launchId: string): LaunchRecord | null {
    const raw = this.db.query("SELECT * FROM launches WHERE launch_id = ?").get(launchId) as any;
    return raw ? this.row(raw) : null;
  }

  private assertIdentity(record: LaunchRecord, identity: LaunchIdentity) {
    for (const key of ["planId", "revision", "planDigest", "approvalId", "approvalDigest", "launchId", "requestId", "pipelineType"] as const) {
      if (record[key] !== identity[key]) throw new Error(`launch authority identity mismatch: ${key}`);
    }
  }

  private bootstrapLegacy() {
    if (!existsSync(this.projectPlans)) return;
    const control = readJson(join(this.root, "control.json"), {});
    const iterations = readJson(join(this.root, "iterations.json"), { items: [] });
    for (const planId of readdirSync(this.projectPlans)) {
      const planRoot = join(this.projectPlans, planId);
      const ledger = readJson(join(planRoot, "ledger.json"), null);
      const launchDir = join(planRoot, "launches");
      if (!ledger || !existsSync(launchDir)) continue;
      for (const file of readdirSync(launchDir).filter((name) => name.endsWith(".json"))) {
        const launch = readJson(join(launchDir, file), null);
        if (!launch?.launchId || this.get(launch.launchId) || !STATUS.has(launch.status)) continue;
        const pointer = control.projectLaunchRequest?.launchId === launch.launchId ? control.projectLaunchRequest : null;
        const iteration = Array.isArray(iterations.items) ? iterations.items.find((item: any) => item.launchId === launch.launchId) : null;
        const candidates = [launch.status, pointer?.status, ledger.activeLaunchId === launch.launchId ? ledger.state : null, iteration?.status].filter((value) => STATUS.has(value));
        const rank = (value: string) => value === "requested" ? 0 : value === "running" ? 1 : 2;
        const status = candidates.sort((a, b) => rank(b) - rank(a))[0] || launch.status;
        const runId = launch.runId || pointer?.runId || iteration?.runId || null;
        const iterationId = launch.iterationId || pointer?.iterationId || iteration?.iterationId || iteration?.id || null;
        const approvalDigest = launch.approvalDigest;
        if (!approvalDigest || !launch.idempotencyKey || !launch.requestId) continue;
        try {
          this.db.query(`INSERT INTO launches (launch_id,idempotency_key,plan_id,revision,plan_digest,approval_id,approval_digest,request_id,pipeline_type,status,run_id,iteration_id,ledger_version,launch_json,metadata_json,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(launch.launchId, launch.idempotencyKey, launch.planId, launch.revision, launch.planDigest, launch.approvalId, approvalDigest, launch.requestId, launch.pipelineType, status, runId, iterationId, Number(ledger.version || 0), JSON.stringify(launch), "{}", launch.updatedAt || launch.requestedAt || now());
        } catch (error: any) {
          if (!String(error?.message || error).includes("UNIQUE")) throw error;
        }
      }
    }
  }

  private runnerOwnerAlive(): boolean {
    const lock = join(this.root, "autonomous-project.lock");
    const owner = readJson(join(lock, "owner.json"), null);
    const legacyPid = Number(readJson(join(lock, "pid"), null));
    const pid = Number.isInteger(owner?.pid) ? owner.pid : (Number.isInteger(legacyPid) ? legacyPid : null);
    if (!pid) return false;
    try { process.kill(pid, 0); return true; }
    catch (error: any) { return error?.code === "EPERM"; }
  }

  admit(launch: any, approvedLedgerVersion: number): MutationResult {
    const running = this.db.query("SELECT launch_id FROM launches WHERE status='running' LIMIT 1").get() as any;
    if (running && !this.runnerOwnerAlive()) this.recoverStrandedRunning("next admission recovered a run abandoned by its prior runner process");
    const tx = this.db.transaction(() => {
      const byKey = this.db.query("SELECT * FROM launches WHERE idempotency_key = ?").get(launch.idempotencyKey) as any;
      if (byKey) {
        const record = this.row(byKey);
        for (const key of ["planId", "revision", "planDigest", "approvalId", "approvalDigest", "pipelineType"] as const) {
          if (record[key] !== launch[key]) throw new Error("idempotency key was already used for a different launch subject");
        }
        return { status: "existing", record };
      }
      const active = this.db.query("SELECT launch_id FROM launches WHERE status IN ('requested','running') LIMIT 1").get() as any;
      if (active) throw new Error("another project launch is already pending or running");
      const ts = now();
      this.db.query(`INSERT INTO launches (launch_id,idempotency_key,plan_id,revision,plan_digest,approval_id,approval_digest,request_id,pipeline_type,status,run_id,iteration_id,ledger_version,launch_json,metadata_json,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,'requested',NULL,NULL,?,?,?,?)`).run(launch.launchId, launch.idempotencyKey, launch.planId, launch.revision, launch.planDigest, launch.approvalId, launch.approvalDigest, launch.requestId, launch.pipelineType, approvedLedgerVersion + 1, JSON.stringify(launch), "{}", ts);
      return { status: "admitted", record: this.get(launch.launchId)! };
    });
    const result = tx(); this.reconcileRecord(result.record); return result;
  }

  rejectRequested(launchId: string, extra: any = {}): MutationResult {
    const tx = this.db.transaction(() => {
      const current = this.get(launchId); if (!current) throw new Error("launch authority record does not exist");
      if (current.status === "rejected") return { status: "already-terminal", record: current };
      if (current.status !== "requested") throw new Error("only an unclaimed project launch can be rejected");
      const ts = now(), metadata = { ...current.metadata, ...extra };
      this.db.query("UPDATE launches SET status='rejected', ledger_version=ledger_version+1, metadata_json=?, updated_at=? WHERE launch_id=? AND status='requested'").run(JSON.stringify(metadata), ts, launchId);
      return { status: "transitioned", record: this.get(launchId)! };
    });
    const result = tx(); this.reconcileRecord(result.record); return result;
  }

  claim(identity: LaunchIdentity, runId: string, iterationId: string | null): MutationResult {
    const tx = this.db.transaction(() => {
      const current = this.get(identity.launchId); if (!current) throw new Error("launch authority record does not exist"); this.assertIdentity(current, identity);
      if (current.status !== "requested") return { status: "already-claimed", record: current };
      const ts = now();
      const changed = this.db.query("UPDATE launches SET status='running', run_id=?, iteration_id=?, ledger_version=ledger_version+1, updated_at=? WHERE launch_id=? AND status='requested' AND run_id IS NULL").run(runId, iterationId, ts, identity.launchId).changes;
      const record = this.get(identity.launchId)!;
      return { status: changed === 1 ? "claimed" : "already-claimed", record };
    });
    const result = tx(); this.reconcileRecord(result.record); return result;
  }

  transition(identity: LaunchIdentity, status: "completed" | "paused" | "blocked" | "rejected", runId: string | null, iterationId: string | null, extra: any = {}): MutationResult {
    if (!TERMINAL.has(status)) throw new Error("invalid terminal launch status");
    const tx = this.db.transaction(() => {
      const current = this.get(identity.launchId); if (!current) throw new Error("launch authority record does not exist"); this.assertIdentity(current, identity);
      if (current.status === status && current.runId === runId) return { status: "already-terminal", record: current };
      const canReject = status === "rejected" && current.status === "requested" && runId === null;
      if (!canReject && (current.status !== "running" || current.runId !== runId)) throw new Error("project launch run identity changed during execution");
      const ts = now(), metadata = { ...current.metadata, ...extra };
      this.db.query("UPDATE launches SET status=?, iteration_id=COALESCE(?,iteration_id), ledger_version=ledger_version+1, metadata_json=?, updated_at=? WHERE launch_id=?").run(status, iterationId, JSON.stringify(metadata), ts, identity.launchId);
      return { status: "transitioned", record: this.get(identity.launchId)! };
    });
    const result = tx(); this.reconcileRecord(result.record); return result;
  }

  reconcile() {
    const rows = this.db.query("SELECT * FROM launches ORDER BY updated_at, launch_id").all() as any[];
    for (const raw of rows) this.reconcileRecord(this.row(raw));
  }

  recoverStrandedRunning(reason = "runner restarted after the prior launch owner exited"): LaunchRecord[] {
    const tx = this.db.transaction(() => {
      const rows = this.db.query("SELECT * FROM launches WHERE status='running' ORDER BY updated_at, launch_id").all() as any[];
      const recovered: LaunchRecord[] = [];
      for (const raw of rows) {
        const current = this.row(raw);
        const run = current.runId ? readJson(join(this.root, "runs", current.runId, "run.json"), {}) : {};
        const observed = run.status === "complete" ? "completed" : run.status;
        const status = ["completed", "paused", "blocked"].includes(observed) ? observed : "blocked";
        const ts = now();
        const metadata = { ...current.metadata, recoveredAt: ts, recoveryReason: reason, ...(status === "blocked" && observed && observed !== "blocked" ? { abandonedRunStatus: observed } : {}) };
        this.db.query("UPDATE launches SET status=?, ledger_version=ledger_version+1, metadata_json=?, updated_at=? WHERE launch_id=? AND status='running'").run(status, JSON.stringify(metadata), ts, current.launchId);
        recovered.push(this.get(current.launchId)!);
      }
      return recovered;
    });
    const recovered = tx();
    for (const record of recovered) this.reconcileRecord(record);
    return recovered;
  }

  private reconcileRecord(record: LaunchRecord) {
    withProjectionLock(this.root, () => this.projectRecord(record));
  }

  private projectRecord(record: LaunchRecord) {
    const ts = record.updatedAt;
    const planRoot = join(this.projectPlans, record.planId);
    const launchPath = join(planRoot, "launches", `${record.launchId}.json`);
    const launch = { ...record.launch, status: record.status, runId: record.runId, iterationId: record.iterationId, ...(record.status === "requested" ? {} : { updatedAt: ts }), ...record.metadata };
    atomicJson(launchPath, launch);

    const ledgerPath = join(planRoot, "ledger.json"), ledger = readJson(ledgerPath, null);
    if (ledger) {
      const ledgerVersion = Number(ledger.version || 0);
      const ownsActiveLaunch = ledger.activeLaunchId === record.launchId;
      const canRepairAdmission = ACTIVE.has(record.status)
        && ledgerVersion < record.ledgerVersion
        && ledger.currentRevision === record.revision
        && ledger.currentDigest === record.planDigest
        && ledger.effectiveApprovalId === record.approvalId;
      const canRepairOwnedLaunch = ownsActiveLaunch && ledgerVersion <= record.ledgerVersion;
      if (canRepairOwnedLaunch || canRepairAdmission) {
        Object.assign(ledger, { version: record.ledgerVersion, state: record.status === "requested" ? "launch-requested" : record.status, activeLaunchId: record.status === "running" || record.status === "requested" ? record.launchId : null, updatedAt: ts });
        atomicJson(ledgerPath, ledger);
        const revision = readJson(join(planRoot, "revisions", `${String(record.revision).padStart(6, "0")}.json`), {});
        const indexPath = join(this.projectPlans, "index.json"), index = readJson(indexPath, { schemaVersion: "apb.project-plan-index.v1", plans: {} });
        index.plans ||= {}; index.plans[record.planId] = { ...(index.plans[record.planId] || {}), planId: record.planId, title: revision.content?.title || index.plans[record.planId]?.title || "", pipelineType: record.pipelineType, state: ledger.state, version: ledger.version, currentRevision: ledger.currentRevision, currentDigest: ledger.currentDigest, activeLaunchId: ledger.activeLaunchId, updatedAt: ledger.updatedAt }; index.updatedAt = monotonicUpdatedAt(index.updatedAt, ts); atomicJson(indexPath, index);
      }
    }

    const controlPath = join(this.root, "control.json"), control = readJson(controlPath, { schemaVersion: "apb.control.v1" });
    const pointerStatus = record.status === "requested" ? "pending" : record.status;
    const pointer = { schemaVersion: "apb.project-launch-pointer.v1", planId: record.planId, revision: record.revision, planDigest: record.planDigest, approvalId: record.approvalId, launchId: record.launchId, requestId: record.requestId, pipelineType: record.pipelineType, status: pointerStatus, ...(record.runId ? { runId: record.runId } : {}), ...(record.iterationId ? { iterationId: record.iterationId } : {}), ...(record.status === "requested" ? {} : { updatedAt: ts }), ...record.metadata };
    if (!control.projectLaunchRequest || control.projectLaunchRequest.launchId === record.launchId || ACTIVE.has(record.status)) control.projectLaunchRequest = pointer;
    control.updatedAt = monotonicUpdatedAt(control.updatedAt, ts); atomicJson(controlPath, control);

    if (record.iterationId) {
      const path = join(this.root, "iterations.json"), doc = readJson(path, { schemaVersion: "apb.iterations.v1", items: [] });
      if (!Array.isArray(doc.items)) doc.items = [];
      let row = doc.items.find((item: any) => item.launchId === record.launchId || item.runId === record.runId || item.iterationId === record.iterationId || item.id === record.iterationId);
      const patch = { id: record.iterationId, iterationId: record.iterationId, requestId: record.requestId, runId: record.runId, status: record.status, planId: record.planId, revision: record.revision, planDigest: record.planDigest, approvalId: record.approvalId, launchId: record.launchId, projectLaunch: { planId: record.planId, revision: record.revision, planDigest: record.planDigest, approvalId: record.approvalId, approvalDigest: record.approvalDigest, launchId: record.launchId, requestId: record.requestId, pipelineType: record.pipelineType }, updatedAt: ts, ...record.metadata };
      if (row) Object.assign(row, patch); else doc.items.unshift(patch);
      doc.updatedAt = monotonicUpdatedAt(doc.updatedAt, ts); atomicJson(path, doc);
    }
  }
}
