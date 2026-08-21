const root = document.documentElement;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const destinations = {
  agents: () => document.querySelector('.channel-field'),
  notebook: () => document.querySelector('.notebook-workspace'),
  telemetry: () => document.querySelector('.time-ruler'),
};

function reveal(name, focus = true) {
  const target = destinations[name]?.();
  if (!target) return;
  if (name === 'notebook') root.classList.add('notebook-open');
  if (name === 'telemetry') root.classList.add('timeline-open');
  updateToggles();
  target.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'nearest' });
  if (!focus) return;
  const focusTarget = target.querySelector('button:not([disabled]), input:not([disabled]), [tabindex]') || target;
  if (!focusTarget.matches('button, a, input, select, textarea, [tabindex]')) focusTarget.tabIndex = -1;
  focusTarget.focus({ preventScroll: true });
}

function setShelf(open) {
  root.classList.toggle('observatory-shelf-open', open);
  const controls = document.getElementById('steeringCockpit');
  if (open && controls?.classList.contains('section-collapsed')) {
    controls.querySelector('[data-collapse-section="steering"]')?.click();
  }
  updateToggles();
}

function updateToggles() {
  const shelf = document.querySelector('[data-observatory-shelf]');
  const timeline = document.querySelector('[data-observatory-timeline]');
  if (shelf) shelf.setAttribute('aria-expanded', String(root.classList.contains('observatory-shelf-open')));
  if (timeline) {
    const open = root.classList.contains('timeline-open');
    timeline.setAttribute('aria-expanded', String(open));
    timeline.textContent = open ? 'Contract' : 'Expand';
  }
}

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-observatory-open-shelf]')) setShelf(true);
  const destination = event.target.closest('[data-observatory-target]');
  if (destination) reveal(destination.dataset.observatoryTarget);

  const shelf = event.target.closest('[data-observatory-shelf]');
  if (shelf) setShelf(!root.classList.contains('observatory-shelf-open'));

  const timeline = event.target.closest('[data-observatory-timeline]');
  if (timeline) {
    root.classList.toggle('timeline-open');
    updateToggles();
  }

  const close = event.target.closest('[data-observatory-close="notebook"]');
  if (close) {
    root.classList.remove('notebook-open');
    updateToggles();
    document.querySelector('[data-observatory-target="notebook"]')?.focus();
  }

  if (event.target.closest('[data-operations-action="mission-control"], [data-operations-action="deblock"]')) setShelf(true);
}, true);

document.addEventListener('focusin', (event) => {
  if (event.target.closest('.notebook-workspace')) root.classList.add('notebook-open');
  updateToggles();
});

const missionControl = document.getElementById('steeringCockpit');
if (missionControl) {
  new MutationObserver(() => {
    const blocker = missionControl.querySelector('.deblock-panel');
    root.classList.toggle('observatory-has-blocker', Boolean(blocker));
    if (blocker) setShelf(true);
  }).observe(missionControl, { childList: true, subtree: true });
}

updateToggles();
