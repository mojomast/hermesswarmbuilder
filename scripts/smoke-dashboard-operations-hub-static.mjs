#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveOperationsHubState } from '../dashboard/public/operations-hub-state.js';

const repo = resolve(new URL('..', import.meta.url).pathname);
const dashboard = resolve(repo, 'dashboard', 'public');
const index = readFileSync(resolve(dashboard, 'index.html'), 'utf8');
const app = readFileSync(resolve(dashboard, 'app.js'), 'utf8');
const styles = readFileSync(resolve(dashboard, 'styles.css'), 'utf8');

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

const hubAt = index.indexOf('id="operationsHub"');
const cockpitAt = index.indexOf('id="steeringCockpit"');
expect(hubAt >= 0, 'Operations Hub region is missing from index.html');
expect(cockpitAt >= 0 && hubAt < cockpitAt, 'Operations Hub must appear above Mission Control');
expect(/import \{ deriveOperationsHubState \}/.test(app), 'Operations Hub must use the testable state derivation module');
expect(/function deriveOperationsHub\(/.test(app), 'Operations Hub status derivation is missing');
expect(/function renderOperationsHub\(/.test(app), 'Operations Hub renderer is missing');
expect(/projectLaunchRequest/.test(resolveModuleText()), 'Operations Hub state must include project launch requests');
expect(/data-operations-action="inspect-run"/.test(app), 'Operations Hub inspect-run action is missing');
expect(/data-operations-action="mission-control"/.test(app), 'Operations Hub Mission Control action is missing');
expect(/data-operations-action="project-planner"/.test(app), 'Operations Hub Project Planner action is missing');
expect(/data-operations-action="focus-current"/.test(app), 'Operations Hub focus-current action is missing');
expect(/aria-live="polite"/.test(app), 'Operations Hub live status is missing');
expect(/disabled aria-disabled="true"/.test(app), 'Unavailable Operations Hub actions must be disabled');
expect(/focusOperationsDestination/.test(app) && /skipNextFocusRestore/.test(app), 'Operations Hub navigation must preserve requested destination focus');
expect(/renderItem: r => `<button type="button" class="run-row/.test(app), 'Run rows must be keyboard focusable destinations');
expect(/refreshHubData\(\)/.test(app), 'Operations Hub data must refresh during SSE activity');
expect(/\.operations-hub/.test(styles), 'Operations Hub styles are missing');
expect(/#operationsHub\s*\{\s*order:1/.test(styles), 'Operations Hub must stay above Mission Control in activity ordering');
expect(!/@media\(max-width:900px\)[\s\S]*?\.operations-hub\{position:static/.test(styles), 'Operations Hub must not scroll away on mobile');
expect(/@media\(max-width:900px\)[\s\S]*?\.operations-hub\{position:sticky/.test(styles), 'Operations Hub must remain available on mobile');

function resolveModuleText() {
  return readFileSync(resolve(dashboard, 'operations-hub-state.js'), 'utf8');
}

const base = {
  state: { currentRunId: 'run-current', status: 'building' },
  runs: [{ id: 'run-current' }, { id: 'run-history' }],
  queue: { items: [
    { id: 'queued', status: 'queued' }, { id: 'held', status: 'held' }, { id: 'done', status: 'completed' }
  ] },
  control: {
    nextRunRequest: { status: 'pending' },
    projectLaunchRequest: { status: 'claimed' }
  },
  plans: [{ state: 'draft' }, { state: 'completed' }],
  plansLoaded: true,
  workflow: 'building'
};
const actionable = deriveOperationsHubState(base);
expect(actionable.pendingRequestCount === 2, 'pending and claimed requests must both be counted');
expect(actionable.queueCount === 1, 'only actionable queue items must be counted');
expect(actionable.currentRunId === 'run-current' && actionable.selectedIsCurrent, 'current run identity must be tracked separately');
expect(actionable.safeAction.type === 'focus-current', 'actionable requests must take precedence for the safe action');

const terminal = deriveOperationsHubState({ ...base, control: {
  nextRunRequest: { status: 'running' }, projectLaunchRequest: { status: 'blocked' }
}, queue: { items: [{ id: 'paused', status: 'paused' }, { id: 'blocked', status: 'blocked' }] } });
expect(terminal.pendingRequestCount === 0 && terminal.queueCount === 0, 'running, blocked, and paused items must not be counted as actionable');

const historical = deriveOperationsHubState({ ...base, control: {}, selectedRunId: 'run-history' });
expect(historical.selectedRunId === 'run-history' && !historical.selectedIsCurrent && historical.selectedRunLabel === 'Selected historical run', 'historical selection must not be labeled as current');

console.log('smoke-dashboard-operations-hub-static ok');
