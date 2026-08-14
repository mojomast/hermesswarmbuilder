#!/usr/bin/env bun
import { canonicalDigest, canonicalJson, projectPlanDigest } from "../dashboard/src/project-plans";

function assert(condition: unknown, message: string) { if (!condition) throw new Error(message); }

assert(canonicalJson({ z: 1, a: { d: 4, b: 2 } }) === '{"a":{"b":2,"d":4},"z":1}', "canonical JSON must recursively sort keys");
assert(canonicalDigest("example.v1", { b: 2, a: 1 }) === canonicalDigest("example.v1", { a: 1, b: 2 }), "digest must ignore object insertion order");
assert(canonicalDigest("example.v1", { a: 1 }) !== canonicalDigest("other.v1", { a: 1 }), "digest must bind its domain");
const revision = { schemaVersion: "apb.project-plan.v1", planId: "plan-test", revision: 1, parentRevision: null, createdAt: "ignored", content: { b: 2, a: 1 } };
const digest = projectPlanDigest(revision);
assert(digest === projectPlanDigest({ ...revision, createdAt: "also-ignored", contentDigest: "ignored" }), "plan digest must exclude generated fields");
assert(/^sha256:[a-f0-9]{64}$/.test(digest), "digest must be a prefixed SHA-256 value");
console.log("project plan deterministic helper smoke: pass");
