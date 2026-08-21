#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { OPERATION_COMMANDS, PROJECT_PLAN_ACTIONS } from '../dashboard/public/headless-dashboard-client.js';

const repo = resolve(new URL('..', import.meta.url).pathname);
const publicRoot = resolve(repo, 'dashboard', 'public');
const clients = [
  ['radar', 'app.js', ['<svg id="radar"', 'class="target-scope"']],
  ['broadsheet', 'app.js', ['class="nameplate"', 'class="wire-list"']],
  ['sequencer', 'sequencer.js', ['<canvas id="timeline"', 'class="mode-rail"']],
  ['operator-shell', 'operator-shell.js', ['id="commandInput"', 'class="buffers"']],
  ['control-table', 'control-table.js', ['role="grid"', 'class="formula-region"']],
  ['field-guide', 'field-guide.js', ['class="binder"', 'class="bottom-nav"']],
  ['constellation', 'constellation.js', ['id="constellation"', 'id="semantic-network"']],
  ['casefiles', 'casefiles.js', ['class="cabinet-layout"', 'class="folder-tabs"']],
  ['patchbay', 'patchbay.js', ['id="cableLayer"', 'class="patch-field"']],
  ['gallery', 'app.js', ['class="wayfinding"', 'id="curator-desk"']],
];

const requiredMethods = [
  'createDashboardClient', 'selectRun', 'selectIteration', 'loadArtifact', 'loadLog',
  'loadDocument', 'getProjectPlan', 'listPlanAssistance',
];
const planMethods = [
  'createProjectPlan', 'updateProjectPlan', 'submitProjectPlanForReview',
  'approveProjectPlan', 'rejectProjectPlan', 'launchProjectPlan', 'cloneProjectPlan',
  'forkProjectPlan', 'archiveProjectPlan',
];

for (const [slug, scriptName, markers] of clients) {
  const root = resolve(publicRoot, 'next', slug);
  const htmlPath = resolve(root, 'index.html');
  const scriptPath = resolve(root, scriptName);
  const researchPath = resolve(root, 'RESEARCH.md');
  assert(existsSync(htmlPath) && existsSync(scriptPath) && existsSync(researchPath), `${slug}: required files missing`);
  const html = readFileSync(htmlPath, 'utf8');
  const script = readFileSync(scriptPath, 'utf8');
  const research = readFileSync(researchPath, 'utf8');
  const combined = `${html}\n${script}`;
  assert.doesNotMatch(combined, /(?:src|href)=["']\/(?:app\.js|styles\.css)["']/, `${slug}: legacy frontend asset imported`);
  assert.match(script, /\.\.\/\.\.\/headless-dashboard-client\.js/, `${slug}: headless client import missing`);
  assert.match(html, /\.\.\/\.\.\/dashboard-directory\.js/, `${slug}: shared dashboard directory missing`);
  assert(!existsSync(resolve(root, 'dashboard-directory.js')), `${slug}: local dashboard-directory copy must not drift`);
  assert((research.match(/https?:\/\//g) || []).length >= 3, `${slug}: research must cite at least three sources`);
  for (const marker of markers) assert(html.includes(marker), `${slug}: unique architecture marker ${marker} missing`);
  for (const method of requiredMethods) assert(script.includes(method), `${slug}: ${method} capability missing`);
  for (const [index, method] of planMethods.entries()) assert(script.includes(method) || script.includes(PROJECT_PLAN_ACTIONS[index]) || script.includes('PROJECT_PLAN_ACTIONS') || script.includes('projectPlanCommand') || script.includes('ProjectPlan`]'), `${slug}: ${method} capability missing`);
  const genericCommands = script.includes('OPERATION_COMMANDS');
  const literalCommands = OPERATION_COMMANDS.filter((command) => combined.includes(command));
  assert(genericCommands || literalCommands.length >= 24, `${slug}: operational command coverage is too narrow (${literalCommands.length}/${OPERATION_COMMANDS.length})`);
}

const directory = readFileSync(resolve(publicRoot, 'dashboard-directory.js'), 'utf8');
for (const [slug] of clients) assert(directory.includes(`/next/${slug}/index.html`), `global directory missing ${slug}`);
for (const action of PROJECT_PLAN_ACTIONS) assert(typeof action === 'string' && action.startsWith('project-plan.'));

console.log(`clean-slate frontend smoke passed (${clients.length} independent clients)`);
