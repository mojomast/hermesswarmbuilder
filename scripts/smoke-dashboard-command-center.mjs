#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repo = resolve(new URL('..', import.meta.url).pathname);
const publicRoot = resolve(repo, 'dashboard', 'public');
const app = readFileSync(resolve(publicRoot, 'app.js'), 'utf8');
const interfaceStudies = [
  ['command-center.html', 'command-center.css'],
  ['flight-deck.html', 'flight-deck.css'],
  ['briefing-room.html', 'briefing-room.css'],
  ['swarm-atlas.html', 'swarm-atlas.css'],
  ['switchyard.html', 'switchyard.css'],
  ['quiet-observatory.html', 'quiet-observatory.css'],
];
const uniqueTopologies = new Map([
  ['flight-deck.html', ['class="overhead-panel"', 'class="left-rail crew-manifest"', 'class="lower-pedestal"', 'id="flightRecorder"']],
  ['briefing-room.html', ['class="lead-spread"', 'class="action-desk"', 'id="sourceNotes"', 'class="wire-section"']],
  ['swarm-atlas.html', ['class="map-coordinate', 'class="route-axis"', 'class="inspector-pane map-legend"', 'class="bottom-console survey-log"']],
  ['switchyard.html', ['class="route-board left-rail"', 'class="dispatch-grid"', 'class="inspector-pane interlock-cabinet"', 'class="bottom-console recorder-bay"']],
  ['quiet-observatory.html', ['class="target-field"', 'class="instrument-shelf"', 'class="channel-field"', 'class="bottom-console time-ruler"']],
]);
const allDashboards = [
  'index.html', 'command-center.html', 'flight-deck.html', 'briefing-room.html',
  'swarm-atlas.html', 'switchyard.html', 'quiet-observatory.html', 'matrix.html',
  'timeline.html', 'console.html', 'ultimate.html',
];

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

const parityIds = [
  'globalFilter', 'streamState', 'refreshNow', 'pauseEvents', 'openPlanner', 'topStatus',
  'workflowStrip', 'operationsHub', 'orchestratorDeck', 'steeringCockpit', 'agentStack',
  'runsList', 'agentIndex', 'filterChips', 'inspectorContent', 'bottomResizeHandle',
  'consoleContent', 'followConsole', 'detailDrawer', 'planningWorkspace', 'planSaveState',
  'closePlanner', 'planGlobalError', 'projectPlanList', 'planAssistance', 'projectPlanEditor',
  'projectPlanReview', 'collapseAllAgents', 'expandActiveAgents'
];

for (const [htmlFile, cssFile] of interfaceStudies) {
  const html = readFileSync(resolve(publicRoot, htmlFile), 'utf8');
  const css = readFileSync(resolve(publicRoot, cssFile), 'utf8');
  for (const id of parityIds) expect(html.includes(`id="${id}"`), `${htmlFile}: parity element #${id} is missing`);
  for (const tab of ['agent', 'spec', 'devplan', 'artifacts', 'logs', 'run']) expect(html.includes(`data-inspector="${tab}"`), `${htmlFile}: inspector tab ${tab} is missing`);
  for (const tab of ['events', 'tools', 'logs', 'artifacts', 'raw']) expect(html.includes(`data-console="${tab}"`), `${htmlFile}: telemetry tab ${tab} is missing`);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  expect(new Set(ids).size === ids.length, `${htmlFile}: duplicate IDs are not allowed`);
  expect(html.includes('src="/app.js"'), `${htmlFile}: must reuse the parity-critical Studio controller`);
  expect(html.indexOf('src="/app.js"') < html.indexOf('src="/dashboard-directory.js"'), `${htmlFile}: dashboard directory must load after the controller`);
  expect(/@media\s*\(min-width:\s*(?:1[89]\d{2}|[2-9]\d{3})px\)/.test(css), `${cssFile}: wide/4K layout optimization is missing`);
  expect(/@media\s*\(max-width:\s*900px\)/.test(css), `${cssFile}: narrow responsive layout is missing`);
  expect(css.includes(':focus-visible'), `${cssFile}: visible keyboard focus treatment is missing`);
  expect(css.includes('prefers-reduced-motion'), `${cssFile}: reduced-motion treatment is missing`);
  expect(html.includes('class="skip-link"'), `${htmlFile}: keyboard skip link is missing`);
  for (const marker of uniqueTopologies.get(htmlFile) || []) expect(html.includes(marker), `${htmlFile}: unique topology marker ${marker} is missing`);
}

for (const htmlFile of allDashboards) {
  const html = readFileSync(resolve(publicRoot, htmlFile), 'utf8');
  expect(html.includes('src="/dashboard-directory.js"'), `${htmlFile}: shared dashboard directory is missing`);
}

const directory = readFileSync(resolve(publicRoot, 'dashboard-directory.js'), 'utf8');
for (const [htmlFile] of interfaceStudies) expect(directory.includes(`/${htmlFile}`), `Dashboard directory does not link ${htmlFile}`);
for (const path of ['/', '/matrix.html', '/timeline.html', '/console.html', '/ultimate.html']) expect(directory.includes(`path: '${path}'`), `Dashboard directory does not link ${path}`);
expect(app.includes('function revealDashboardSections('), 'Shared controller must restore hidden destinations before focusing them');
expect(/inspect-run[\s\S]*?revealDashboardSections\('inspector'\)/.test(app), 'Inspect run must reveal the evidence destination');
expect(/commandCenterTarget==='telemetry'[\s\S]*?revealDashboardSections\('console'\)/.test(app), 'Telemetry shortcuts must reveal the telemetry destination');

console.log('smoke-dashboard-interface-studies ok');
