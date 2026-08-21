const destinations = {
  agents: () => document.querySelector('.activity-pane > .section-title'),
  telemetry: () => document.querySelector('.bottom-console'),
};

document.addEventListener('click', (event) => {
  const control = event.target.closest('[data-command-center-target]');
  if (!control) return;

  const target = destinations[control.dataset.commandCenterTarget]?.();
  if (!target) return;

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  const focusTarget = target.querySelector('button, a, input, [tabindex]') || target;
  if (!focusTarget.matches('button, a, input, select, textarea, [tabindex]')) focusTarget.tabIndex = -1;
  focusTarget.focus({ preventScroll: true });
});
