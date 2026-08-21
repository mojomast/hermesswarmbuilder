#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OPERATION_COMMANDS } from '../dashboard/public/headless-dashboard-client.js';

const repo = resolve(new URL('..', import.meta.url).pathname);
const root = resolve(repo, 'dashboard/public/next/constellation');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const script = readFileSync(resolve(root, 'constellation.js'), 'utf8');
const research = readFileSync(resolve(root, 'RESEARCH.md'), 'utf8');
const implementation = `${html}\n${script}`;

for (const marker of [
  'id="selection-context"', 'id="control-state"', 'id="blocker-list"',
  'id="help-dialog"', 'id="open-help"', 'id="lineage-section"',
]) assert(html.includes(marker), `Constellation is missing ${marker}`);

for (const capability of [
  'deriveBlockers', 'selectionRunId', 'relatedEvents', 'selectedBlocker',
  'renderSelectionContext', 'associatedIteration', 'prepareContextAction',
  'Anomaly track', 'Agent activity', 'Run flight record', 'Control-plane state',
  'The current run changed while validating this recovery', 'accepted does not mean completed',
]) assert(script.includes(capability), `Constellation is missing ${capability}`);

assert.match(script, /client\.loadArtifact\(artifact\.dataset\.loadArtifact, artifact\.dataset\.resourceRun\)/, 'artifacts must be bound to the inspected run');
assert.match(script, /client\.loadLog\(log\.dataset\.loadLog, log\.dataset\.resourceRun\)/, 'logs must be bound to the inspected run');
assert.match(script, /client\.selectRun\(runId\)/, 'selected agents and runs must load owning-run resources');
assert.match(script, /data\.sourceIterationId = selected\.type === "iteration"/, 'continuations must preserve explicit iteration lineage');
assert.match(script, /if \(!status\).*Choose a gate decision/s, 'gate decisions must not default to passed');
assert.match(script, /if \(!submittedRunId \|\| !currentRunId\)/, 'deblock must require the same current run before and after validation');
assert.match(script, /if \(!activeBlocker\)/, 'deblock must require an active blocker');
assert.doesNotMatch(script, /target:\s*lastCommand\.target/, 'display labels must not replace normalized command targets');
assert.doesNotMatch(script, /item\.runId === runId \|\| item\.sourceRunId === runId/, 'continuation lineage must not select descendant iterations');
assert.doesNotMatch(script, /\.innerHTML\s*=/, 'dynamic operational data must not use innerHTML');

for (const command of OPERATION_COMMANDS) assert(implementation.includes(command), `Constellation command coverage is missing ${command}`);
for (const method of [
  'createProjectPlan', 'updateProjectPlan', 'submitProjectPlanForReview',
  'approveProjectPlan', 'rejectProjectPlan', 'launchProjectPlan',
  'cloneProjectPlan', 'forkProjectPlan', 'archiveProjectPlan',
  'listPlanAssistance', 'createPlanAssistance', 'getPlanAssistance',
  'messagePlanAssistance',
]) assert(script.includes(method), `Constellation planning coverage is missing ${method}`);

for (const guidance of [
  'Inspect agents and runs', 'Remediate a blocker', 'Control builds',
  'Steering, queue, gates, and iterations', 'Plans and planning assistance',
  'Connection and keyboard operation',
]) assert(html.includes(guidance), `operator manual is missing ${guidance}`);

for (const source of [
  'sre.google/sre-book/monitoring-distributed-systems',
  'opentelemetry.io/docs/concepts/signals/traces',
  'w3.org/WAI/ARIA/apg/patterns/dialog-modal',
]) assert(research.includes(source), `research is missing ${source}`);

console.log('Constellation control parity smoke passed');
