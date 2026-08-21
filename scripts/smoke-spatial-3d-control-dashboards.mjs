#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OPERATION_COMMANDS, PROJECT_PLAN_ACTIONS } from '../dashboard/public/headless-dashboard-client.js';

const repo = resolve(new URL('..', import.meta.url).pathname);
const publicRoot = resolve(repo, 'dashboard/public');
const clients = [
  {
    slug: 'memory-palace',
    route: '/next/memory-palace/index.html',
    renderer: ['drawElementsInstanced', 'MAX_TEXTURE_SIZE', 'overlayTexture'],
    sceneControls: ['operation-detail', 'plan-editor', 'sceneTextBridge'],
  },
  {
    slug: 'jacquard-swarmworks',
    route: '/next/jacquard-swarmworks/index.html',
    renderer: ['THREE.InstancedMesh', 'THREE.Raycaster', 'CanvasTexture'],
    sceneControls: ['PUNCHED CARD', 'PATTERN DRUM', 'canvasEditor'],
  },
  {
    slug: 'command-cavern',
    route: '/next/command-cavern/index.html',
    renderer: ['float sphere', 'uTabletHalf', 'cameraZ'],
    sceneControls: ['Resonant monoliths', 'CONFIRM INTENT', 'canvasKeyboard'],
  },
];

const assistanceMethods = ['listPlanAssistance', 'createPlanAssistance', 'getPlanAssistance', 'messagePlanAssistance'];
const resourceMethods = ['selectRun', 'selectIteration', 'loadArtifact', 'loadLog', 'loadDocument'];
const safetyMarkers = ['currentRunId', 'sourceEvidencePolicy', 'snapshottedAcceptanceGates', 'expectedVersion', 'accepted intent', 'outcome unknown'];

for (const client of clients) {
  const root = resolve(publicRoot, 'next', client.slug);
  for (const file of ['index.html', 'styles.css', 'app.js', 'RESEARCH.md']) assert(existsSync(resolve(root, file)), `${client.slug}: ${file} missing`);
  const html = readFileSync(resolve(root, 'index.html'), 'utf8');
  const css = readFileSync(resolve(root, 'styles.css'), 'utf8');
  const script = readFileSync(resolve(root, 'app.js'), 'utf8');
  const research = readFileSync(resolve(root, 'RESEARCH.md'), 'utf8');
  const combined = `${html}\n${css}\n${script}`;

  assert.match(script, /\.\.\/\.\.\/headless-dashboard-client\.js/, `${client.slug}: headless client missing`);
  assert.match(html, /\.\.\/\.\.\/dashboard-directory\.js/, `${client.slug}: dashboard directory missing`);
  assert.doesNotMatch(combined, /https?:\/\/(?:cdn|unpkg|jsdelivr|cdnjs)/i, `${client.slug}: remote runtime dependency found`);
  assert((research.match(/https?:\/\//g) || []).length >= 8, `${client.slug}: fewer than eight research sources`);
  for (const marker of client.renderer) assert(script.includes(marker) || research.includes(marker), `${client.slug}: renderer marker ${marker} missing`);
  for (const marker of client.sceneControls) assert(combined.includes(marker), `${client.slug}: scene-native marker ${marker} missing`);
  for (const command of OPERATION_COMMANDS) assert(script.includes(command) || script.includes('OPERATION_COMMANDS'), `${client.slug}: operation ${command} missing`);
  for (const action of PROJECT_PLAN_ACTIONS) assert(script.includes(action) || script.includes('PROJECT_PLAN_ACTIONS'), `${client.slug}: plan action ${action} missing`);
  for (const method of [...assistanceMethods, ...resourceMethods]) assert(script.includes(method), `${client.slug}: ${method} missing`);
  for (const marker of safetyMarkers) assert(script.toLowerCase().includes(marker.toLowerCase()), `${client.slug}: safety marker ${marker} missing`);
  assert.match(combined, /semantic/i, `${client.slug}: semantic equivalent missing`);
  assert.match(script, /prefers-reduced-motion/, `${client.slug}: reduced motion missing`);
  assert.match(script, /webglcontextlost/, `${client.slug}: context loss recovery missing`);
  assert.match(script, /visibilitychange/, `${client.slug}: page visibility handling missing`);
  assert.match(script, /devicePixelRatio/, `${client.slug}: high-DPI handling missing`);
  assert.match(css, /global-dashboard-directory[^}]*display\s*:\s*none/i, `${client.slug}: DOM directory must stay hidden in 3D mode`);
}

assert.notEqual(clients[0].renderer.join(), clients[1].renderer.join(), 'Memory Palace and Jacquard renderer signatures overlap');
assert.notEqual(clients[1].renderer.join(), clients[2].renderer.join(), 'Jacquard and Command Cavern renderer signatures overlap');

const directory = readFileSync(resolve(publicRoot, 'dashboard-directory.js'), 'utf8');
for (const client of clients) assert(directory.includes(client.route), `directory missing ${client.route}`);

console.log('fully spatial 3D control-plane smoke passed (3 distinct environments)');
