#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OPERATION_COMMANDS } from '../dashboard/public/headless-dashboard-client.js';

const repo = resolve(new URL('..', import.meta.url).pathname);
const publicRoot = resolve(repo, 'dashboard/public');
const clients = [
  {
    slug: 'swarm-nebula',
    route: '/next/swarm-nebula/index.html',
    markers: ['THREE.InstancedMesh', 'THREE.Points', 'THREE.Raycaster', 'webglcontextlost'],
  },
  {
    slug: 'flowfield-command',
    route: '/next/flowfield-command/index.html',
    markers: ['transformFeedbackVaryings', 'beginTransformFeedback', 'drawArraysInstanced', 'webglcontextlost'],
  },
  {
    slug: 'voxel-foundry',
    route: '/next/voxel-foundry/index.html',
    markers: ['drawElementsInstanced', 'checkFramebufferStatus', 'readPixels', 'webglcontextlost'],
  },
];

const planMethods = [
  'createProjectPlan', 'updateProjectPlan', 'submitProjectPlanForReview',
  'approveProjectPlan', 'rejectProjectPlan', 'launchProjectPlan',
  'cloneProjectPlan', 'forkProjectPlan', 'archiveProjectPlan',
];

for (const client of clients) {
  const root = resolve(publicRoot, 'next', client.slug);
  for (const file of ['index.html', 'styles.css', 'app.js', 'RESEARCH.md']) {
    assert(existsSync(resolve(root, file)), `${client.slug}: ${file} missing`);
  }
  const html = readFileSync(resolve(root, 'index.html'), 'utf8');
  const script = readFileSync(resolve(root, 'app.js'), 'utf8');
  const research = readFileSync(resolve(root, 'RESEARCH.md'), 'utf8');
  const combined = `${html}\n${script}`;

  assert.match(script, /\.\.\/\.\.\/headless-dashboard-client\.js/, `${client.slug}: headless client missing`);
  assert.match(html, /\.\.\/\.\.\/dashboard-directory\.js/, `${client.slug}: dashboard directory missing`);
  assert.doesNotMatch(combined, /https?:\/\/(?:cdn|unpkg|jsdelivr|cdnjs)/i, `${client.slug}: remote runtime dependency found`);
  assert((research.match(/https?:\/\//g) || []).length >= 5, `${client.slug}: fewer than five research sources`);
  for (const marker of client.markers) assert(script.includes(marker), `${client.slug}: renderer marker ${marker} missing`);
  for (const command of OPERATION_COMMANDS) assert(combined.includes(command) || script.includes('OPERATION_COMMANDS'), `${client.slug}: operation ${command} missing`);
  for (const method of planMethods) assert(script.includes(method) || script.includes('projectPlanCommand'), `${client.slug}: plan method ${method} missing`);
  for (const method of ['listPlanAssistance', 'createPlanAssistance', 'getPlanAssistance', 'messagePlanAssistance']) assert(script.includes(method), `${client.slug}: assistance method ${method} missing`);
  assert.match(combined, /semantic|non-WebGL/i, `${client.slug}: semantic WebGL alternative missing`);
  assert.match(combined, /Help|Manual|Handbook/i, `${client.slug}: operator help missing`);
  assert.match(script, /prefers-reduced-motion/, `${client.slug}: reduced-motion handling missing`);
  assert.match(script, /currentRunId/, `${client.slug}: current-run authority missing`);
  assert.match(script, /blocker/i, `${client.slug}: blocker handling missing`);
  assert.match(script, /accepted/i, `${client.slug}: accepted-intent lifecycle missing`);
}

const directory = readFileSync(resolve(publicRoot, 'dashboard-directory.js'), 'utf8');
for (const client of clients) assert(directory.includes(client.route), `directory missing ${client.route}`);

assert(readFileSync(resolve(publicRoot, 'vendor/three.js'), 'utf8').length > 500, 'local Three.js vendor bundle missing');
console.log('WebGL control dashboard smoke passed (3 distinct renderers)');
