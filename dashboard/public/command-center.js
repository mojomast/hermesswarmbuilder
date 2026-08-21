const destinations = {
  agents: () => document.querySelector('.activity-pane > .section-title'),
  telemetry: () => document.querySelector('.bottom-console'),
};

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-command-center-target]');
  if (!button) return;
  const target = destinations[button.dataset.commandCenterTarget]?.();
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const focusTarget = target.querySelector('button, [tabindex]') || target;
  if (!focusTarget.matches('button, a, input, select, textarea, [tabindex]')) focusTarget.tabIndex = -1;
  focusTarget.focus({ preventScroll: true });
});
