const destinations = {
  agents: () => document.querySelector('.crew-manifest'),
  telemetry: () => document.querySelector('.bottom-console'),
};

const recorder = document.querySelector('.bottom-console');
const recorderToggle = document.querySelector('[data-recorder-toggle]');
const resizeHandle = document.querySelector('#bottomResizeHandle');

function setRecorderExpanded(expanded, focusContent = false) {
  document.documentElement.classList.toggle('recorder-expanded', expanded);
  recorderToggle?.setAttribute('aria-expanded', String(expanded));
  if (recorderToggle) recorderToggle.textContent = expanded ? 'Stow recorder' : 'Expand recorder';
  if (focusContent && expanded) {
    const target = document.querySelector('#consoleContent');
    if (target) {
      target.tabIndex = -1;
      target.focus({ preventScroll: true });
    }
  }
}

recorderToggle?.addEventListener('click', () => {
  setRecorderExpanded(!document.documentElement.classList.contains('recorder-expanded'), true);
});

resizeHandle?.addEventListener('pointerdown', () => setRecorderExpanded(true), { capture: true });

document.addEventListener('click', (event) => {
  const control = event.target.closest('[data-command-center-target]');
  if (!control) return;

  const destination = control.dataset.commandCenterTarget;
  const target = destinations[destination]?.();
  if (!target) return;

  if (destination === 'telemetry') setRecorderExpanded(true);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  const focusTarget = target.querySelector('button, a, input, [tabindex]') || target;
  if (!focusTarget.matches('button, a, input, select, textarea, [tabindex]')) focusTarget.tabIndex = -1;
  focusTarget.focus({ preventScroll: true });
});

recorder?.addEventListener('focusin', (event) => {
  if (innerWidth > 900 && event.target.closest('.console-tabs, .console-content')) setRecorderExpanded(true);
});
