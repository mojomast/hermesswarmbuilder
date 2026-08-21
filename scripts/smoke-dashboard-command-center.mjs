#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repo = resolve(new URL('..', import.meta.url).pathname);
const publicRoot = resolve(repo, 'dashboard', 'public');
const html = readFileSync(resolve(publicRoot, 'command-center.html'), 'utf8');
const css = readFileSync(resolve(publicRoot, 'command-center.css'), 'utf8');

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

for (const id of parityIds) expect(html.includes(`id="${id}"`), `Command Center parity element #${id} is missing`);
for (const tab of ['agent', 'spec', 'devplan', 'artifacts', 'logs', 'run']) expect(html.includes(`data-inspector="${tab}"`), `Inspector tab ${tab} is missing`);
for (const tab of ['events', 'tools', 'logs', 'artifacts', 'raw']) expect(html.includes(`data-console="${tab}"`), `Telemetry tab ${tab} is missing`);
expect(html.includes('src="/app.js"'), 'Command Center must reuse the parity-critical Studio controller');
expect(html.includes('href="/"'), 'Legacy Studio must remain linked and available');
expect(css.includes('@media (min-width: 2300px)'), '4K layout optimization is missing');
expect(css.includes('@media (max-width: 900px)'), '1080p/narrow responsive layout is missing');
expect(css.includes(':focus-visible'), 'Visible keyboard focus treatment is missing');
expect(html.includes('class="skip-link"'), 'Keyboard skip link is missing');

console.log('smoke-dashboard-command-center ok');
