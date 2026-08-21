const root = document.documentElement;
const shell = document.getElementById('app');
const inspectorToggle = document.getElementById('toggleInspectorCabinet');
const recorderToggle = document.getElementById('toggleRecorderBay');
const resizeHandle = document.getElementById('bottomResizeHandle');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const generatedControls = '.agent-row, .agent-summary, .tool-summary, .event-summary, .file-row';

function setCabinet(stowed, focus = false) {
  root.classList.toggle('cabinet-stowed', stowed);
  inspectorToggle?.setAttribute('aria-expanded', String(!stowed));
  if (inspectorToggle) inspectorToggle.textContent = stowed ? 'Open evidence' : 'Stow cabinet';
  localStorage.setItem('hermes.switchyard.cabinetStowed', JSON.stringify(stowed));
  if (focus && !stowed) {
    document.getElementById('inspectorContent')?.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'nearest' });
  }
}

function setRecorder(open, focus = false) {
  shell?.classList.toggle('recorder-open', open);
  recorderToggle?.setAttribute('aria-expanded', String(open));
  if (recorderToggle) recorderToggle.textContent = open ? 'Collapse recorder' : 'Expand recorder';
  localStorage.setItem('hermes.switchyard.recorderOpen', JSON.stringify(open));
  if (focus && open) {
    document.getElementById('consoleContent')?.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'nearest' });
  }
}

function storedBoolean(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return typeof value === 'boolean' ? value : fallback;
  } catch {
    return fallback;
  }
}

setCabinet(storedBoolean('hermes.switchyard.cabinetStowed', false));
setRecorder(storedBoolean('hermes.switchyard.recorderOpen', false));

inspectorToggle?.addEventListener('click', () => setCabinet(!root.classList.contains('cabinet-stowed'), true));
recorderToggle?.addEventListener('click', () => setRecorder(!shell?.classList.contains('recorder-open'), true));
resizeHandle?.addEventListener('pointerdown', () => setRecorder(true));

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-inspector]')) setCabinet(false);
  if (event.target.closest('[data-operations-action="inspect-run"]')) setCabinet(false, true);
  if (event.target.closest('[data-console]')) setRecorder(true);
  const destination = event.target.closest('[data-command-center-target]')?.dataset.commandCenterTarget;
  if (destination === 'telemetry') setRecorder(true);
});

document.addEventListener('keydown', (event) => {
  const generatedControl = event.target.closest(generatedControls);
  const nativeControl = event.target.closest('button, a, input, select, textarea, summary');
  if (generatedControl && !nativeControl && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    generatedControl.click();
    return;
  }
  if (event.target === resizeHandle && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    event.preventDefault();
    setRecorder(true);
    const current = document.querySelector('.bottom-console')?.getBoundingClientRect().height || 220;
    const height = Math.min(Math.max(current + (event.key === 'ArrowUp' ? 24 : -24), 150), window.innerHeight * .72);
    const value = `${Math.round(height)}px`;
    root.style.setProperty('--console-h', value);
    localStorage.setItem('hermes.apb.dashboard.bottomConsoleHeight', JSON.stringify(value));
    resizeHandle.setAttribute('aria-valuenow', String(Math.round(height)));
    return;
  }
  if (event.key === 'Escape' && shell?.classList.contains('recorder-open') && !document.body.classList.contains('planner-open')) setRecorder(false);
});

function prepareGeneratedControls(scope = document) {
  scope.querySelectorAll?.(generatedControls).forEach((element) => {
    if (element.matches('button, a, input, select, textarea')) return;
    element.tabIndex = 0;
    element.setAttribute('role', 'button');
  });
}

new MutationObserver((records) => {
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (!(node instanceof Element)) continue;
      if (node.matches(generatedControls)) prepareGeneratedControls(node.parentElement);
      else prepareGeneratedControls(node);
    }
  }
}).observe(document.getElementById('app'), { childList: true, subtree: true });

prepareGeneratedControls();
