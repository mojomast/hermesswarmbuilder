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

const cavern = readFileSync(resolve(publicRoot, 'next/command-cavern/app.js'), 'utf8');
assert.match(cavern, /function attempt3D\(\)/, 'Command Cavern: return-to-3D retry path missing');
assert.match(cavern, /retry\(\)\s*\{/, 'Command Cavern: renderer retry method missing');
assert.match(cavern, /returnToCavern"\)\.addEventListener\("click", attempt3D\)/, 'Command Cavern: Return button is not wired to renderer retry');
assert.match(cavern, /if \(!renderer\.ready && !renderer\.retry\(\)\)[\s\S]{0,400}setMode\(false\)/, 'Command Cavern: retry does not enter 3D after readiness');
assert.match(cavern, /TABLET_TEXTURE_WIDTH = 1600/, 'Command Cavern: bounded tablet texture missing');
assert.match(cavern, /texSubImage2D/, 'Command Cavern: in-place tablet updates missing');
assert.match(cavern, /motionDemoRequested[\s\S]{0,200}visualFrozen = !motionDemoRequested/, 'Command Cavern: local-only motion demo opt-in missing');
assert.match(cavern, /\?motion=demo/, 'Command Cavern: motion demo query contract missing');
assert.match(cavern, /this\.steps = innerWidth < 700 \? 18 : 22/, 'Command Cavern: bounded initial ray steps missing');
assert.match(cavern, /STATIC_TABLET_SHARPNESS_POLICY/, 'Command Cavern: static text sharpness policy missing');
assert.match(cavern, /tablet: \{ scale: 1, pixels: 1_440_000 \}[\s\S]{0,120}motion: \{ scale: \.45, pixels: 500_000 \}/, 'Command Cavern: bounded static and motion pixel budgets missing');
assert.match(cavern, /this\.quality = 1/, 'Command Cavern: static tablet quality remains capped below the sharpness policy');
assert.doesNotMatch(cavern, /for\(int i=0;i<(?:9|1[0-6]);i\+\+\)/, 'Command Cavern: expensive SDF entity loops returned');
assert.match(cavern, /setTimeout\(\(\) => \{ this\.animationTimer = 0; this\.requestFrame\(false\); \}, 100\)/, 'Command Cavern: bounded optional animation cadence missing');
assert.match(cavern, /function cavernRenderSignature\(value\)/, 'Command Cavern: snapshot-diff invalidation missing');
assert.match(cavern, /if \(changed\) renderer\.requestFrame\(\)/, 'Command Cavern: unchanged telemetry still renders');
assert.match(cavern, /MINIMIZABLE_TECTONIC_TABLET/, 'Command Cavern: minimizable tablet marker missing');
assert.match(cavern, /function drawMinimizedUi\(\)/, 'Command Cavern: minimized restore inscription missing');
assert.match(cavern, /tabletMinimized\) return this\.isPortrait\(aspect\) \? \[\.3, \.675\] : \[1\.05, \.59\]/, 'Command Cavern: minimized physical SDF bounds missing');
assert.match(cavern, /RESTORE TABLET \[T\]/, 'Command Cavern: scene-native restore control missing');
assert.match(cavern, /event\.key\.toLowerCase\(\) === "t"/, 'Command Cavern: tablet keyboard toggle missing');
assert.match(cavern, /const LANDMARK_META = \[/, 'Command Cavern: exposed scene landmark catalogue missing');
assert.match(cavern, /function selectCavernLandmark\(index\)/, 'Command Cavern: scene landmark selection missing');
assert.match(cavern, /if\(uLandmarks>\.5\)for\(int i=0;i<8;i\+\+\)/, 'Command Cavern: scene-native landmark geometry missing');
assert.doesNotMatch(cavern.match(/function slab\([\s\S]*?\n\}/)?.[0] || '', /lineTo\(/, 'Command Cavern: generic tablet slabs still draw diagonal artifacts');

const palace = readFileSync(resolve(publicRoot, 'next/memory-palace/app.js'), 'utf8');
for (const marker of ['FOLIO_CLEARANCE_PORTAL', 'WORLD_LABEL_ATLAS', 'BATCHED_LABEL_QUADS', 'FRONT_CAMERA_ENVELOPE', 'RESPONSIVE_FOLIO_GUARD', 'READABLE_PROJECTED_TYPE']) assert(palace.includes(marker), `Memory Palace: ${marker} missing`);
assert.match(palace, /const FOLIO = Object\.freeze\(/, 'Memory Palace: shared folio descriptor missing');
assert.match(palace, /center: Object\.freeze\(\[0, 4\.1, 11\.4\]\)/, 'Memory Palace: front clearance portal moved');
assert.match(palace, /PHYSICAL_FOLIO_TOGGLE/, 'Memory Palace: physical folio minimizer missing');
assert.match(palace, /resetCamera\(\)\{const camera=scene\.folioMinimized\?ARCHITECTURE_CAMERA:FOLIO\.camera/, 'Memory Palace: camera reset does not follow the active spatial envelope');
assert.match(palace, /narrowPortraitRequiresSemantic\(\)/, 'Memory Palace: narrow portrait guard missing');
assert.match(palace, /gl\.depthMask\(false\)[\s\S]{0,400}gl\.depthMask\(true\)/, 'Memory Palace: label depth-write restoration missing');
assert.match(palace, /rayBox\(ray,center,size\)/, 'Memory Palace: architecture ray picking missing');
assert.match(palace, /if\(scene\.folioMinimized\)return/, 'Memory Palace: full folio plane still renders while minimized');
assert.match(palace, /event\.key\.toLowerCase\(\)==="t"/, 'Memory Palace: folio keyboard toggle missing');

const jacquard = readFileSync(resolve(publicRoot, 'next/jacquard-swarmworks/app.js'), 'utf8');
for (const marker of ['CAMERA_RELATIVE_OPERATOR_RIG', 'UNOBSTRUCTED_OPERATOR_SCREEN', 'WORLD_LABEL_ATLAS', 'BATCHED_LABEL_QUADS', 'CAMERA_OPERATOR_CONTROLS', 'ENTITY_ANCHORED_SELECTED_LABEL']) assert(jacquard.includes(marker), `Jacquard: ${marker} missing`);
assert.match(jacquard, /depthTest:false,depthWrite:false,fog:false,toneMapped:false/, 'Jacquard: unobstructed console material invariant missing');
assert.match(jacquard, /this\.camera\.add\(this\.operatorRig\)/, 'Jacquard: operator rig is not camera relative');
assert.match(jacquard, /const controlHit=this\.ray\.intersectObjects\(this\.operatorControls/, 'Jacquard: visible operator controls are not pick-prioritized');
assert.match(jacquard, /const key=`agent:\$\{idOf\(agent\)\}`[\s\S]{0,300}this\.entityAnchors\.set\(key,shuttle\)/, 'Jacquard: entity-anchored agent labels missing');
assert.match(jacquard, /if\(!force&&signature===this\.worldLabelSignature\)return/, 'Jacquard: unchanged label atlas still uploads');
assert.match(jacquard, /MINIMIZABLE_LOOM_CONSOLE/, 'Jacquard: minimizable console marker missing');
assert.match(jacquard, /toggleConsole\(force\)/, 'Jacquard: scene readout toggle missing');
assert.match(jacquard, /panelWidth=detail\?Math\.min\(width-margin\*2,900\):Math\.min\(width-margin\*2,portrait\?width-24:500\)/, 'Jacquard: compact readout bounds missing');
assert.match(jacquard, /keyWidth=clamp\([\s\S]{0,100},84,104\)/, 'Jacquard: compact fixed-width loom keys missing');
assert.match(jacquard, /cloth\.userData\.instanceAction=/, 'Jacquard: run-cloth instance picking missing');

console.log('fully spatial 3D control-plane smoke passed (3 distinct environments)');
