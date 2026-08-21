const destinations = {
  agents: () => document.querySelector('.activity-pane > .section-title'),
  telemetry: () => document.querySelector('.bottom-console'),
};

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-command-center-target]');
  if (!button) return;
  const target = destinations[button.dataset.commandCenterTarget]?.();
  if (!target) return;
  const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  target.scrollIntoView({ behavior, block: 'start' });
  const focusTarget = target.querySelector('button, [tabindex]') || target;
  if (!focusTarget.matches('button, a, input, select, textarea, [tabindex]')) focusTarget.tabIndex = -1;
  focusTarget.focus({ preventScroll: true });
});
