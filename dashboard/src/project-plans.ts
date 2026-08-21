import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "fs";
import { createHash, randomUUID } from "crypto";
import { isAbsolute, join, resolve } from "path";
import { LaunchAuthority, withProjectionLock } from "./launch-authority";

export const PLAN_SCHEMA = "apb.project-plan.v1";
const ACTOR = "local-operator";
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40,64}$/;
const PROHIBITED_KEYS = new Set(["command", "commands", "argv", "shell", "script", "executable", "env", "environment", "validationcommands"]);
const CONTENT_KEYS = new Set(["pipelineType", "title", "problem", "intendedUsers", "objective", "boundedScope", "requirements", "nonGoals", "constraints", "risks", "repository", "acceptanceGates", "scopeBundles", "validationPolicy", "milestones", "limits", "lineage"]);
const LIMIT_BOUNDS: Record<string, [number, number]> = {
  maxIterations: [1, 10], maxVariantsPerIteration: [1, 5], maxParallelVariants: [1, 5], maxAcceptedFeatures: [1, 4],
  maxVisualMotifChanges: [0, 1], maxNewSections: [0, 1], stopAfterNoImprovement: [1, 3]
};
const EDITABLE_STATES = new Set(["draft", "ready-for-review", "approved", "rejected", "blocked", "paused", "completed"]);

export class ProjectPlanError extends Error {
  constructor(message: string, public status = 400, public details?: string[]) { super(message); }
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new ProjectPlanError("non-finite numbers are not allowed");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  throw new ProjectPlanError("unsupported JSON value");
}

export function canonicalDigest(domain: string, value: unknown): string {
  return `sha256:${createHash("sha256").update(`${domain}\n`).update(canonicalJson(value)).digest("hex")}`;
}

export function projectPlanDigest(revision: any): string {
  return canonicalDigest(PLAN_SCHEMA, { schemaVersion: revision.schemaVersion, planId: revision.planId, revision: revision.revision, parentRevision: revision.parentRevision, content: revision.content });
}

function now() { return new Date().toISOString(); }
function newId(prefix: string) { return `${prefix}-${randomUUID()}`; }
function object(value: unknown, name: string): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ProjectPlanError(`${name} must be an object`);
  return value as Record<string, any>;
}
function exactKeys(value: Record<string, any>, allowed: Set<string>, name: string) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new ProjectPlanError(`${name} has unknown fields`, 400, unknown.slice(0, 20));
}
function boundedString(value: unknown, name: string, max = 10_000, required = false): string {
  if (typeof value !== "string") throw new ProjectPlanError(`${name} must be a string`);
  if (Buffer.byteLength(value) > max) throw new ProjectPlanError(`${name} exceeds ${max} bytes`);
  if (required && !value.trim()) throw new ProjectPlanError(`${name} is required`);
  return value;
}
function nullableString(value: unknown, name: string, max = 4096): string | null {
  return value === null ? null : boundedString(value, name, max);
}
function stringList(value: unknown, name: string, requireNonEmpty = false): string[] {
  if (!Array.isArray(value) || value.length > 50) throw new ProjectPlanError(`${name} must be an array with at most 50 items`);
  const result = value.map((item, i) => boundedString(item, `${name}[${i}]`, 2000, true));
  if (requireNonEmpty && !result.length) throw new ProjectPlanError(`${name} must not be empty`);
  return result;
}
function assertId(value: unknown, name: string): string {
  if (typeof value !== "string" || !ID.test(value)) throw new ProjectPlanError(`${name} must be a bounded ASCII identifier`);
  return value;
}
function rejectExecutableShape(value: unknown, path = "payload", depth = 0) {
  if (depth > 12) throw new ProjectPlanError(`${path} exceeds maximum nesting depth`);
  if (Array.isArray(value)) {
    if (value.length > 250) throw new ProjectPlanError(`${path} has too many items`);
    value.forEach((item, i) => rejectExecutableShape(item, `${path}[${i}]`, depth + 1));
  } else if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > 100) throw new ProjectPlanError(`${path} has too many fields`);
    for (const [key, item] of entries) {
      const normalized = key.toLowerCase().replace(/[^a-z]/g, "");
      if (PROHIBITED_KEYS.has(normalized)) throw new ProjectPlanError(`${path}.${key} is a prohibited executable field`);
      rejectExecutableShape(item, `${path}.${key}`, depth + 1);
    }
  }
}
function evidencePath(value: unknown, name: string): string {
  const path = boundedString(value, name, 512, true);
  if (path.includes("\0") || path.includes("\\") || isAbsolute(path) || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(path)) throw new ProjectPlanError(`${name} must be a safe relative path`);
  const parts = path.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) throw new ProjectPlanError(`${name} must not contain traversal or empty segments`);
  return path;
}

export function normalizeProjectPlanContent(raw: unknown, complete = false, enforcedPipelineType?: "classic" | "managed"): any {
  rejectExecutableShape(raw, "content");
  let content = object(raw, "content");
  exactKeys(content, CONTENT_KEYS, "content");
  if (enforcedPipelineType) {
    const repository = object(content.repository, "content.repository");
    object(content.lineage, "content.lineage");
    content = {
      ...content,
      pipelineType: enforcedPipelineType,
      repository: enforcedPipelineType === "classic"
        ? { path: null, baseRef: null, baseCommit: null }
        : { ...repository, baseCommit: null },
      validationPolicy: { ...object(content.validationPolicy, "content.validationPolicy"), id: "apb.runner-selected.v1", clientCommandsAllowed: false },
      lineage: { mode: "new", sourcePlanId: null, sourceRevision: null, sourceRunId: null, sourceIterationId: null }
    };
  }
  if (content.pipelineType !== "classic" && content.pipelineType !== "managed") throw new ProjectPlanError("content.pipelineType must be classic or managed");
  const text = (key: string, max = 10_000) => boundedString(content[key], `content.${key}`, max, complete);
  const repository = object(content.repository, "content.repository");
  exactKeys(repository, new Set(["path", "baseRef", "baseCommit"]), "content.repository");
  const validationPolicy = object(content.validationPolicy, "content.validationPolicy");
  exactKeys(validationPolicy, new Set(["id", "expectations", "clientCommandsAllowed"]), "content.validationPolicy");
  if (validationPolicy.id !== "apb.runner-selected.v1" || validationPolicy.clientCommandsAllowed !== false) throw new ProjectPlanError("validationPolicy must require runner-selected validation and prohibit client commands");
  const gatesRaw = content.acceptanceGates;
  if (!Array.isArray(gatesRaw) || gatesRaw.length > 50) throw new ProjectPlanError("content.acceptanceGates must have at most 50 items");
  const gateIds = new Set<string>();
  const acceptanceGates = gatesRaw.map((rawGate: unknown, i: number) => {
    const gate = object(rawGate, `content.acceptanceGates[${i}]`);
    exactKeys(gate, new Set(["id", "description", "severity", "required", "requiredEvidence"]), `content.acceptanceGates[${i}]`);
    const id = assertId(gate.id, `content.acceptanceGates[${i}].id`);
    if (gateIds.has(id)) throw new ProjectPlanError(`duplicate acceptance gate id ${id}`);
    gateIds.add(id);
    if (!['must', 'should'].includes(gate.severity)) throw new ProjectPlanError(`content.acceptanceGates[${i}].severity must be must or should`);
    if (typeof gate.required !== "boolean") throw new ProjectPlanError(`content.acceptanceGates[${i}].required must be boolean`);
    const requiredEvidence = stringList(gate.requiredEvidence, `content.acceptanceGates[${i}].requiredEvidence`).map((item, j) => evidencePath(item, `content.acceptanceGates[${i}].requiredEvidence[${j}]`));
    if (gate.required && !requiredEvidence.length) throw new ProjectPlanError(`content.acceptanceGates[${i}] requires evidence paths`);
    return { id, description: boundedString(gate.description, `content.acceptanceGates[${i}].description`, 2000, true), severity: gate.severity, required: gate.required, requiredEvidence };
  });
  const bundlesRaw = content.scopeBundles ?? [];
  if (!Array.isArray(bundlesRaw) || bundlesRaw.length > 50) throw new ProjectPlanError("content.scopeBundles must have at most 50 items");
  const bundleIds = new Set<string>();
  const gateIdsForBundles = new Set(acceptanceGates.map((gate) => gate.id));
  const scopeBundles = bundlesRaw.map((rawBundle: unknown, i: number) => {
    const bundle = object(rawBundle, `content.scopeBundles[${i}]`);
    exactKeys(bundle, new Set(["id", "description", "capabilities", "acceptanceGateIds"]), `content.scopeBundles[${i}]`);
    const id = assertId(bundle.id, `content.scopeBundles[${i}].id`);
    if (bundleIds.has(id)) throw new ProjectPlanError(`duplicate scope bundle id ${id}`);
    bundleIds.add(id);
    const acceptanceGateIds = stringList(bundle.acceptanceGateIds, `content.scopeBundles[${i}].acceptanceGateIds`);
    if (new Set(acceptanceGateIds).size !== acceptanceGateIds.length || acceptanceGateIds.some((gateId) => !gateIdsForBundles.has(gateId))) throw new ProjectPlanError(`content.scopeBundles[${i}].acceptanceGateIds must name unique plan acceptance gates`);
    return { id, description: boundedString(bundle.description, `content.scopeBundles[${i}].description`, 2000, true), capabilities: stringList(bundle.capabilities, `content.scopeBundles[${i}].capabilities`, true), acceptanceGateIds };
  });
  const limits = object(content.limits, "content.limits");
  exactKeys(limits, new Set(Object.keys(LIMIT_BOUNDS)), "content.limits");
  const normalizedLimits: Record<string, number> = {};
  for (const [key, [min, max]] of Object.entries(LIMIT_BOUNDS)) {
    const value = limits[key];
    if (!Number.isInteger(value) || value < min || value > max) throw new ProjectPlanError(`content.limits.${key} must be an integer from ${min} to ${max}`);
    normalizedLimits[key] = value;
  }
  if (normalizedLimits.maxParallelVariants > normalizedLimits.maxVariantsPerIteration) throw new ProjectPlanError("maxParallelVariants must not exceed maxVariantsPerIteration");
  const lineage = object(content.lineage, "content.lineage");
  exactKeys(lineage, new Set(["mode", "sourcePlanId", "sourceRevision", "sourceRunId", "sourceIterationId"]), "content.lineage");
  if (!["new", "clone", "fork"].includes(lineage.mode)) throw new ProjectPlanError("content.lineage.mode must be new, clone, or fork");
  for (const key of ["sourcePlanId", "sourceRunId", "sourceIterationId"]) if (lineage[key] !== null) assertId(lineage[key], `content.lineage.${key}`);
  if (lineage.sourceRevision !== null && (!Number.isInteger(lineage.sourceRevision) || lineage.sourceRevision < 1)) throw new ProjectPlanError("content.lineage.sourceRevision must be null or a positive integer");
  let repoPath = nullableString(repository.path, "content.repository.path");
  let baseRef = nullableString(repository.baseRef, "content.repository.baseRef", 512);
  let baseCommit = nullableString(repository.baseCommit, "content.repository.baseCommit", 64);
  if (repoPath?.includes("\0") || baseRef?.includes("\0")) throw new ProjectPlanError("repository values must not contain NUL");
  if (repoPath?.split(/[\\/]/).includes("..")) throw new ProjectPlanError("repository.path must not contain traversal segments");
  if (content.pipelineType === "classic") {
    if (repoPath !== null || baseRef !== null || baseCommit !== null) throw new ProjectPlanError("classic plans must not specify an existing repository");
    repoPath = null; baseRef = null; baseCommit = null;
  }
  if (content.pipelineType === "managed") {
    if (repoPath !== null && (!isAbsolute(repoPath) || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(repoPath))) throw new ProjectPlanError("managed repository.path must be an absolute local path");
    if (baseCommit !== null && !COMMIT.test(baseCommit)) throw new ProjectPlanError("repository.baseCommit must be a full hexadecimal commit");
    if (complete && (!repoPath || !baseRef || !baseCommit)) throw new ProjectPlanError("managed plans require repository path, base ref, and resolved base commit");
  }
  return {
    pipelineType: content.pipelineType, title: text("title", 300), problem: text("problem"), intendedUsers: text("intendedUsers", 2000), objective: text("objective"), boundedScope: text("boundedScope"),
    requirements: stringList(content.requirements, "content.requirements", complete), nonGoals: stringList(content.nonGoals, "content.nonGoals", complete), constraints: stringList(content.constraints, "content.constraints", complete), risks: stringList(content.risks, "content.risks", complete),
    repository: { path: repoPath, baseRef, baseCommit }, acceptanceGates, scopeBundles,
    validationPolicy: { id: validationPolicy.id, expectations: stringList(validationPolicy.expectations, "content.validationPolicy.expectations", complete), clientCommandsAllowed: false },
    milestones: stringList(content.milestones, "content.milestones", complete), limits: normalizedLimits,
    lineage: { mode: lineage.mode, sourcePlanId: lineage.sourcePlanId, sourceRevision: lineage.sourceRevision, sourceRunId: lineage.sourceRunId, sourceIterationId: lineage.sourceIterationId }
  };
}

function resolveManagedBase(content: any): any {
  if (content.pipelineType !== "managed") return normalizeProjectPlanContent(content, true);
  const repoPath = content.repository.path;
  const baseRef = content.repository.baseRef;
  if (!repoPath || !isAbsolute(repoPath) || !existsSync(repoPath)) throw new ProjectPlanError("managed repository.path must be an existing absolute Git repository root");
  const git = (args: string[]) => {
    const result = Bun.spawnSync(["git", "-C", repoPath, ...args], { stdout: "pipe", stderr: "pipe" });
    if (result.exitCode !== 0) throw new ProjectPlanError(`unable to validate managed repository: ${Buffer.from(result.stderr).toString("utf8").trim().slice(0, 500)}`);
    return Buffer.from(result.stdout).toString("utf8").trim();
  };
  const root = realpathSync(git(["rev-parse", "--show-toplevel"]));
  if (root !== realpathSync(repoPath)) throw new ProjectPlanError("repository.path must identify the Git repository root");
  if (!baseRef || baseRef.startsWith("-")) throw new ProjectPlanError("managed repository.baseRef must be explicit and must not start with '-'");
  const baseCommit = git(["rev-parse", "--verify", `${baseRef}^{commit}`]).toLowerCase();
  if (!COMMIT.test(baseCommit)) throw new ProjectPlanError("baseRef did not resolve to a full commit");
  return normalizeProjectPlanContent({ ...content, repository: { path: root, baseRef, baseCommit } }, true);
}

function readJson(path: string, fallback?: any): any {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch (error) { if (fallback !== undefined) return fallback; throw error; }
}
function atomicJson(path: string, value: unknown) {
  mkdirSync(resolve(path, ".."), { recursive: true });
  const temp = `${path}.tmp-${process.pid}-${randomUUID()}`;
  try { writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); renameSync(temp, path); } finally { if (existsSync(temp)) unlinkSync(temp); }
}
function exclusiveJson(path: string, value: unknown) {
  mkdirSync(resolve(path, ".."), { recursive: true });
  const fd = openSync(path, "wx", 0o600);
  try { writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`); } finally { closeSync(fd); }
}

export class ProjectPlanStore {
  private root: string;
  private indexPath: string;
  private idempotencyPath: string;
  private launchAuthority: LaunchAuthority;
  constructor(private stateRoot: string) {
    this.root = join(stateRoot, "project-plans"); this.indexPath = join(this.root, "index.json"); this.idempotencyPath = join(this.root, "idempotency.json");
    mkdirSync(this.root, { recursive: true });
    if (!existsSync(this.indexPath)) atomicJson(this.indexPath, { schemaVersion: "apb.project-plan-index.v1", updatedAt: now(), plans: {} });
    if (!existsSync(this.idempotencyPath)) atomicJson(this.idempotencyPath, { schemaVersion: "apb.project-plan-idempotency.v1", records: {} });
    this.launchAuthority = new LaunchAuthority(stateRoot); this.launchAuthority.reconcile();
  }
  private planRoot(planId: string) { return join(this.root, assertId(planId, "planId")); }
  private revisionPath(planId: string, revision: number) { return join(this.planRoot(planId), "revisions", `${String(revision).padStart(6, "0")}.json`); }
  private ledger(planId: string) { const path = join(this.planRoot(planId), "ledger.json"); if (!existsSync(path)) throw new ProjectPlanError("plan not found", 404); return readJson(path); }
  private revision(planId: string, revision: number) { if (!Number.isInteger(revision) || revision < 1) throw new ProjectPlanError("revision must be a positive integer"); const path = this.revisionPath(planId, revision); if (!existsSync(path)) throw new ProjectPlanError("plan revision not found", 404); return readJson(path); }
  private writeRevision(planId: string, revision: number, parentRevision: number | null, content: any) {
    const record: any = { schemaVersion: PLAN_SCHEMA, planId, revision, parentRevision, createdAt: now(), createdBy: ACTOR, content };
    record.contentDigest = projectPlanDigest(record); exclusiveJson(this.revisionPath(planId, revision), record); return record;
  }
  private updateIndex(ledger: any, revision: any) {
    const index = readJson(this.indexPath, { schemaVersion: "apb.project-plan-index.v1", plans: {} });
    index.plans ||= {}; index.plans[ledger.planId] = { planId: ledger.planId, title: revision.content.title, pipelineType: revision.content.pipelineType, state: ledger.state, version: ledger.version, currentRevision: ledger.currentRevision, currentDigest: ledger.currentDigest, activeLaunchId: ledger.activeLaunchId, updatedAt: ledger.updatedAt };
    index.updatedAt = now(); atomicJson(this.indexPath, index);
  }
  private saveLedger(ledger: any, revision: any) { withProjectionLock(this.stateRoot, () => { atomicJson(join(this.planRoot(ledger.planId), "ledger.json"), ledger); this.updateIndex(ledger, revision); }); }
  private exactSubject(payload: any, ledger: any) {
    if (payload.revision !== ledger.currentRevision || payload.planDigest !== ledger.currentDigest) throw new ProjectPlanError("revision or digest does not match the current plan", 409);
  }
  private validateLineageSource(sourcePlanId: string, sourceRunId: string | null, sourceIterationId: string | null) {
    let run: any = null;
    if (sourceRunId) {
      const runPath = join(this.stateRoot, "runs", sourceRunId, "run.json");
      if (!existsSync(runPath)) throw new ProjectPlanError("sourceRunId does not identify a retained run", 404);
      run = readJson(runPath);
      if (run.planId !== sourcePlanId) throw new ProjectPlanError("sourceRunId is not owned by the source plan", 409);
    }
    if (!sourceIterationId) return;
    const iterations = readJson(join(this.stateRoot, "iterations.json"), { items: [] });
    let iteration = (Array.isArray(iterations.items) ? iterations.items : []).find((item: any) => item?.id === sourceIterationId || item?.iterationId === sourceIterationId);
    if (!iteration && sourceRunId) {
      const candidate = readJson(join(this.stateRoot, "runs", sourceRunId, "iteration-state.json"), null);
      if (candidate?.id === sourceIterationId || candidate?.iterationId === sourceIterationId) iteration = candidate;
    }
    if (!iteration) throw new ProjectPlanError("sourceIterationId does not identify a retained iteration", 404);
    if (sourceRunId && iteration.runId !== sourceRunId) throw new ProjectPlanError("sourceIterationId is not owned by sourceRunId", 409);
    const iterationRun = run || (iteration.runId ? readJson(join(this.stateRoot, "runs", iteration.runId, "run.json"), null) : null);
    const ownerPlanId = iteration.planId || iteration.projectLaunch?.planId || iterationRun?.planId;
    if (ownerPlanId !== sourcePlanId) throw new ProjectPlanError("sourceIterationId is not owned by the source plan", 409);
  }
  private audit(type: string, result: any) {
    appendFileSync(join(this.stateRoot, "audit.jsonl"), `${JSON.stringify({ schemaVersion: "apb.audit.v1", id: newId("audit"), ts: now(), actor: ACTOR, action: type, target: { kind: "project-plan", id: result.planId || null }, summary: { planId: result.planId || null, revision: result.revision || result.currentRevision || null, state: result.state || null, decisionId: result.decisionId || null, launchId: result.launchId || null } })}\n`);
  }
  private idempotent(type: string, key: unknown, subject: unknown, action: () => any): any {
    const idempotencyKey = assertId(key, "idempotencyKey");
    const doc = readJson(this.idempotencyPath, { schemaVersion: "apb.project-plan-idempotency.v1", records: {} });
    const ready = process.env.APB_TEST_PLAN_IDEMPOTENCY_READY, proceed = process.env.APB_TEST_PLAN_IDEMPOTENCY_CONTINUE;
    if (ready && proceed) {
      writeFileSync(ready, "ready");
      const deadline = Date.now() + 5_000;
      while (!existsSync(proceed) && Date.now() < deadline) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
      if (!existsSync(proceed)) throw new Error("timed out waiting for project-plan idempotency test barrier");
    }
    const subjectDigest = canonicalDigest("apb.project-plan-command-subject.v1", { type, subject });
    const existing = doc.records?.[idempotencyKey];
    if (existing) {
      if (existing.subjectDigest !== subjectDigest || existing.type !== type) throw new ProjectPlanError("idempotency key was already used for a different subject", 409);
      return existing.result;
    }
    const result = action();
    doc.records ||= {}; doc.records[idempotencyKey] = { schemaVersion: "apb.project-plan-idempotency-record.v1", idempotencyKey, type, subjectDigest, result, createdAt: now() };
    atomicJson(this.idempotencyPath, doc); return result;
  }
  list() { const index = readJson(this.indexPath, { plans: {} }); return { schemaVersion: "apb.project-plan-list.v1", items: Object.values(index.plans || {}).sort((a: any, b: any) => String(b.updatedAt).localeCompare(String(a.updatedAt))) }; }
  detail(planId: string) {
    const ledger = this.ledger(planId); const revision = this.revision(planId, ledger.currentRevision); const root = this.planRoot(planId);
    const loadDir = (name: string) => { const dir = join(root, name); if (!existsSync(dir)) return []; return Array.from(new Bun.Glob("*.json").scanSync(dir)).sort().map((file) => readJson(join(dir, file))); };
    return { schemaVersion: "apb.project-plan-detail.v1", ledger, revision, revisions: loadDir("revisions"), decisions: loadDir("decisions"), launches: loadDir("launches") };
  }
  getRevision(planId: string, revision: number) { return this.revision(planId, revision); }
  command(envelopeRaw: unknown): any {
    return withProjectionLock(this.stateRoot, () => {
      rejectExecutableShape(envelopeRaw);
      const envelope = object(envelopeRaw, "command");
      exactKeys(envelope, new Set(["schemaVersion", "type", "idempotencyKey", "expectedVersion", "payload", "actor"]), "command");
      if (envelope.schemaVersion !== "apb.project-plan-command.v1") throw new ProjectPlanError("unsupported project plan command schemaVersion");
      const type = boundedString(envelope.type, "type", 100, true); const payload = object(envelope.payload, "payload");
      if (!type.startsWith("project-plan.")) throw new ProjectPlanError("unknown project plan command type");
      const needIdempotency = new Set(["project-plan.create", "project-plan.approve", "project-plan.launch", "project-plan.withdraw-launch", "project-plan.clone", "project-plan.fork"]).has(type);
      if (needIdempotency) return this.idempotent(type, envelope.idempotencyKey, { expectedVersion: envelope.expectedVersion ?? null, payload }, () => this.execute(type, payload, envelope.expectedVersion, envelope.idempotencyKey));
      return this.execute(type, payload, envelope.expectedVersion);
    });
  }
  private execute(type: string, payload: Record<string, any>, expectedVersion: unknown, idempotencyKey?: string): any {
    if (type === "project-plan.create") {
      exactKeys(payload, new Set(["content"]), "payload"); const content = normalizeProjectPlanContent(payload.content); if (content.pipelineType === "managed") content.repository.baseCommit = null; const planId = newId("plan"); const revision = this.writeRevision(planId, 1, null, content); const ts = now();
      const ledger = { schemaVersion: "apb.project-plan-ledger.v1", planId, version: 1, currentRevision: 1, currentDigest: revision.contentDigest, state: "draft", validation: { revision: 1, digest: revision.contentDigest, valid: false, errors: ["not submitted for review"] }, effectiveApprovalId: null, activeLaunchId: null, createdAt: ts, updatedAt: ts };
      this.saveLedger(ledger, revision); const result = { planId, ledger, revision }; this.audit(type, { planId, revision: 1, state: "draft" }); return result;
    }
    if (type === "project-plan.clone" || type === "project-plan.fork") {
      exactKeys(payload, new Set(["planId", "revision", "planDigest", "sourceRunId", "sourceIterationId", "baseRef"]), "payload"); const sourceId = assertId(payload.planId, "payload.planId"); const sourceLedger = this.ledger(sourceId);
      if (!Number.isInteger(expectedVersion) || expectedVersion !== sourceLedger.version) throw new ProjectPlanError("expectedVersion does not match source ledger version", 409);
      if (payload.revision !== sourceLedger.currentRevision || payload.planDigest !== sourceLedger.currentDigest) throw new ProjectPlanError("revision or digest does not match the current source plan", 409);
      const source = this.revision(sourceId, payload.revision); const mode = type.endsWith("fork") ? "fork" : "clone";
      const sourceRunId = payload.sourceRunId == null ? null : assertId(payload.sourceRunId, "payload.sourceRunId");
      const sourceIterationId = payload.sourceIterationId == null ? null : assertId(payload.sourceIterationId, "payload.sourceIterationId");
      this.validateLineageSource(sourceId, sourceRunId, sourceIterationId);
      const baseRef = payload.baseRef == null ? source.content.repository.baseRef : boundedString(payload.baseRef, "payload.baseRef", 512, true);
      const content = normalizeProjectPlanContent({ ...source.content, repository: { ...source.content.repository, baseRef, baseCommit: null }, lineage: { mode, sourcePlanId: sourceId, sourceRevision: source.revision, sourceRunId, sourceIterationId } });
      const planId = newId("plan"); const revision = this.writeRevision(planId, 1, null, content); const ts = now(); const ledger = { schemaVersion: "apb.project-plan-ledger.v1", planId, version: 1, currentRevision: 1, currentDigest: revision.contentDigest, state: "draft", validation: { revision: 1, digest: revision.contentDigest, valid: false, errors: ["not submitted for review"] }, effectiveApprovalId: null, activeLaunchId: null, createdAt: ts, updatedAt: ts };
      this.saveLedger(ledger, revision); const result = { planId, ledger, revision }; this.audit(type, { planId, revision: 1, state: "draft" }); return result;
    }
    const planId = assertId(payload.planId, "payload.planId"); const ledger = this.ledger(planId);
    if (!Number.isInteger(expectedVersion) || expectedVersion !== ledger.version) throw new ProjectPlanError("expectedVersion does not match current ledger version", 409);
    if (type === "project-plan.update") {
      exactKeys(payload, new Set(["planId", "content"]), "payload"); if (!EDITABLE_STATES.has(ledger.state) || ledger.activeLaunchId) throw new ProjectPlanError(`plans in ${ledger.state} cannot be edited`, 409);
      const content = normalizeProjectPlanContent(payload.content); if (content.pipelineType === "managed") content.repository.baseCommit = null;
      const revision = this.writeRevision(planId, ledger.currentRevision + 1, ledger.currentRevision, content); Object.assign(ledger, { version: ledger.version + 1, currentRevision: revision.revision, currentDigest: revision.contentDigest, state: "draft", validation: { revision: revision.revision, digest: revision.contentDigest, valid: false, errors: ["not submitted for review"] }, effectiveApprovalId: null, updatedAt: now() });
      this.saveLedger(ledger, revision); this.audit(type, { planId, revision: revision.revision, state: ledger.state }); return { planId, ledger, revision };
    }
    if (type === "project-plan.ready-for-review") {
      exactKeys(payload, new Set(["planId", "revision", "planDigest"]), "payload"); if (ledger.state !== "draft") throw new ProjectPlanError("only draft plans can be submitted for review", 409); this.exactSubject(payload, ledger);
      const oldRevision = this.revision(planId, ledger.currentRevision); let content = resolveManagedBase(oldRevision.content); let revision = oldRevision;
      if (canonicalJson(content) !== canonicalJson(oldRevision.content)) revision = this.writeRevision(planId, oldRevision.revision + 1, oldRevision.revision, content);
      Object.assign(ledger, { version: ledger.version + 1, currentRevision: revision.revision, currentDigest: revision.contentDigest, state: "ready-for-review", validation: { revision: revision.revision, digest: revision.contentDigest, valid: true, errors: [] }, effectiveApprovalId: null, updatedAt: now() });
      this.saveLedger(ledger, revision); this.audit(type, { planId, revision: revision.revision, state: ledger.state }); return { planId, ledger, revision };
    }
    if (type === "project-plan.approve" || type === "project-plan.reject") {
      exactKeys(payload, new Set(["planId", "revision", "planDigest", "notes"]), "payload"); const decision = type.endsWith("approve") ? "approved" : "rejected";
      if (decision === "approved" && (ledger.state !== "ready-for-review" || !ledger.validation?.valid)) throw new ProjectPlanError("only the valid review revision can be approved", 409);
      if (decision === "rejected" && !["ready-for-review", "approved"].includes(ledger.state)) throw new ProjectPlanError("plan cannot be rejected in its current state", 409);
      this.exactSubject(payload, ledger); const notes = boundedString(payload.notes ?? "", "payload.notes", 4000, decision === "rejected"); const revision = this.revision(planId, ledger.currentRevision); const decisionId = newId("decision");
      const record: any = { schemaVersion: "apb.project-plan-decision.v1", decisionId, decision, planId, revision: revision.revision, planDigest: revision.contentDigest, approver: ACTOR, approvedPipelineType: revision.content.pipelineType, notes, decidedAt: now() };
      record.recordDigest = canonicalDigest(record.schemaVersion, record); exclusiveJson(join(this.planRoot(planId), "decisions", `${decisionId}.json`), record);
      Object.assign(ledger, { version: ledger.version + 1, state: decision, effectiveApprovalId: decision === "approved" ? decisionId : null, updatedAt: now() }); this.saveLedger(ledger, revision); this.audit(type, { planId, revision: revision.revision, state: ledger.state, decisionId }); return { planId, ledger, decision: record };
    }
    if (type === "project-plan.launch") {
      exactKeys(payload, new Set(["planId", "revision", "planDigest"]), "payload"); if (ledger.state !== "approved" || !ledger.effectiveApprovalId) throw new ProjectPlanError("plan must have an effective approval before launch", 409); this.exactSubject(payload, ledger);
      if (ledger.activeLaunchId) return { planId, ledger, launch: readJson(join(this.planRoot(planId), "launches", `${ledger.activeLaunchId}.json`)) };
      const revision = this.revision(planId, ledger.currentRevision); const approval = readJson(join(this.planRoot(planId), "decisions", `${ledger.effectiveApprovalId}.json`));
      if (approval.revision !== revision.revision || approval.planDigest !== revision.contentDigest || approval.decision !== "approved") throw new ProjectPlanError("effective approval does not bind the current revision", 409);
      const launchId = newId("launch"), requestId = newId("request"); const launch = { schemaVersion: "apb.project-launch.v1", launchId, idempotencyKey: assertId(idempotencyKey, "idempotencyKey"), planId, revision: revision.revision, planDigest: revision.contentDigest, approvalId: approval.decisionId, approvalDigest: approval.recordDigest, pipelineType: revision.content.pipelineType, status: "requested", requestedAt: now(), requestedBy: ACTOR, requestId, runId: null, iterationId: null };
      let admitted;
      try { admitted = this.launchAuthority.admit(launch, ledger.version); }
      catch (error: any) { throw new ProjectPlanError(error?.message || String(error), 409); }
      const durableLedger = this.ledger(planId), durableLaunch = readJson(join(this.planRoot(planId), "launches", `${admitted.record.launchId}.json`));
      if (admitted.status === "admitted") this.audit(type, { planId, revision: revision.revision, state: durableLedger.state, launchId: durableLaunch.launchId });
      return { planId, ledger: durableLedger, launch: durableLaunch };
    }
    if (type === "project-plan.withdraw-launch") {
      exactKeys(payload, new Set(["planId", "launchId", "notes"]), "payload");
      const launchId = assertId(payload.launchId, "payload.launchId");
      if (ledger.state !== "launch-requested" || ledger.activeLaunchId !== launchId) throw new ProjectPlanError("only the plan's unclaimed requested launch can be withdrawn", 409);
      const notes = boundedString(payload.notes ?? "", "payload.notes", 4000, false);
      let rejected;
      try { rejected = this.launchAuthority.rejectRequested(launchId, { rejectedAt: now(), rejectedBy: ACTOR, rejectionReason: notes || "operator withdrew requested launch" }); }
      catch (error: any) { throw new ProjectPlanError(error?.message || String(error), 409); }
      const durableLedger = this.ledger(planId), durableLaunch = readJson(join(this.planRoot(planId), "launches", `${launchId}.json`));
      this.audit(type, { planId, launchId, state: durableLedger.state, authorityStatus: rejected.status });
      return { planId, ledger: durableLedger, launch: durableLaunch, authorityStatus: rejected.status };
    }
    if (type === "project-plan.archive") {
      exactKeys(payload, new Set(["planId"]), "payload"); if (ledger.activeLaunchId || ["launch-requested", "running"].includes(ledger.state)) throw new ProjectPlanError("active plans cannot be archived", 409); const revision = this.revision(planId, ledger.currentRevision); Object.assign(ledger, { version: ledger.version + 1, state: "archived", effectiveApprovalId: null, updatedAt: now() }); this.saveLedger(ledger, revision); this.audit(type, { planId, revision: revision.revision, state: ledger.state }); return { planId, ledger };
    }
    throw new ProjectPlanError(`unknown project plan command type ${type}`);
  }
}
