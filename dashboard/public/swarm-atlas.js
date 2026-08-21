const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const legend = document.querySelector('.map-legend');
const surveyLog = document.querySelector('.survey-log');
const legendToggle = document.getElementById('toggleLegend');
const surveyToggle = document.getElementById('toggleSurveyLog');

function setOverlay(panel, button, open, labels) {
  panel?.classList.toggle('atlas-open', open);
  button?.setAttribute('aria-expanded', String(open));
  if (button) button.textContent = open ? labels.close : labels.open;
}

function reveal(panel, button, labels, focusTarget) {
  setOverlay(panel, button, true, labels);
  panel?.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'nearest' });
  if (focusTarget) requestAnimationFrame(() => focusTarget.focus({ preventScroll: true }));
}

legendToggle?.addEventListener('click', () => {
  setOverlay(legend, legendToggle, !legend.classList.contains('atlas-open'), {
    open: 'Open legend',
    close: 'Close legend',
  });
});

surveyToggle?.addEventListener('click', () => {
  setOverlay(surveyLog, surveyToggle, !surveyLog.classList.contains('atlas-open'), {
    open: 'Expand log',
    close: 'Compact log',
  });
});

document.addEventListener('click', (event) => {
  const destination = event.target.closest('[data-command-center-target]')?.dataset.commandCenterTarget;
  if (destination === 'agents') {
    const target = document.getElementById('expeditionParty');
    target?.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
    target?.querySelector('button')?.focus({ preventScroll: true });
  }
  if (destination === 'telemetry') {
    reveal(surveyLog, surveyToggle, { open: 'Expand log', close: 'Compact log' }, surveyToggle);
  }

  if (event.target.closest('[data-inspector]') || event.target.closest('[data-operations-action="inspect-run"]')) {
    reveal(legend, legendToggle, { open: 'Open legend', close: 'Close legend' });
  }
});
