#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
expect(/function deriveOperationsHub\(/.test(app), 'Operations Hub status derivation is missing');
expect(/function renderOperationsHub\(/.test(app), 'Operations Hub renderer is missing');
expect(/data-operations-action="inspect-run"/.test(app), 'Operations Hub inspect-run action is missing');
expect(/data-operations-action="mission-control"/.test(app), 'Operations Hub Mission Control action is missing');
expect(/data-operations-action="project-planner"/.test(app), 'Operations Hub Project Planner action is missing');
expect(/data-operations-action="focus-current"/.test(app), 'Operations Hub focus-current action is missing');
expect(/aria-live="polite"/.test(app), 'Operations Hub live status is missing');
expect(/\.operations-hub/.test(styles), 'Operations Hub styles are missing');
expect(/#operationsHub\s*\{\s*order:1/.test(styles), 'Operations Hub must stay above Mission Control in activity ordering');
console.log('smoke-dashboard-operations-hub-static ok');
