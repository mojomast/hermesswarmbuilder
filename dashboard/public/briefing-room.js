const destinations = {
  chronology: () => document.querySelector('#editionIndex'),
  agents: () => document.querySelector('.activity-pane > .section-title'),
  telemetry: () => document.querySelector('.wire-section'),
};

const sourceNotes = document.querySelector('#sourceNotes');
const sourceNotesToggle = document.querySelector('#sourceNotesToggle');
const sourceNotesClose = document.querySelector('#sourceNotesClose');
const sourceNotesScrim = document.querySelector('#sourceNotesScrim');
const wireHandle = document.querySelector('#bottomResizeHandle');
let sourceNotesReturnFocus = null;
let wireDrag = null;

function reducedMotion() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function setSourceNotes(open, { focusClose = false, restoreFocus = true } = {}) {
  if (!sourceNotes || (open && sourceNotes.hidden)) return;
  const wasOpen = sourceNotes.classList.contains('source-notes-open');
  if (open && !wasOpen) sourceNotesReturnFocus = document.activeElement;
  sourceNotes.classList.toggle('source-notes-open', open);
  sourceNotesScrim?.classList.toggle('source-notes-open', open);
  document.body.classList.toggle('source-notes-open', open);
  sourceNotes.setAttribute('aria-hidden', String(!open));
  sourceNotesToggle?.setAttribute('aria-expanded', String(open));
  if (open && focusClose) sourceNotesClose?.focus();
  if (!open && restoreFocus && sourceNotesReturnFocus instanceof HTMLElement) sourceNotesReturnFocus.focus();
}

function resizeWireBy(delta) {
  const consoleElement = document.querySelector('.bottom-console');
  const handle = document.querySelector('#bottomResizeHandle');
  if (!consoleElement || !handle) return;
  const maximum = Math.floor(window.innerHeight * 0.72);
  const height = Math.min(Math.max(consoleElement.getBoundingClientRect().height + delta, 120), maximum);
  const value = `${Math.round(height)}px`;
  document.documentElement.style.setProperty('--console-h', value);
  localStorage.setItem('hermes.apb.dashboard.bottomConsoleHeight', JSON.stringify(value));
  handle.setAttribute('aria-valuemax', String(maximum));
  handle.setAttribute('aria-valuenow', String(Math.round(height)));
}

document.addEventListener('click', (event) => {
  const navigationButton = event.target.closest('[data-command-center-target]');
  if (navigationButton) {
    const target = destinations[navigationButton.dataset.commandCenterTarget]?.();
    if (target) {
      target.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
      const focusTarget = target.querySelector('button, [tabindex]') || target;
      if (!focusTarget.matches('button, a, input, select, textarea, [tabindex]')) focusTarget.tabIndex = -1;
      focusTarget.focus({ preventScroll: true });
    }
  }

  if (event.target.closest('#sourceNotesToggle')) setSourceNotes(true, { focusClose: true });
  if (event.target.closest('#sourceNotesClose, #sourceNotesScrim')) setSourceNotes(false);
  if (event.target.closest('[data-inspector], [data-operations-action="inspect-run"]')) setSourceNotes(true, { restoreFocus: false });
});

document.addEventListener('focusin', (event) => {
  if (sourceNotes?.contains(event.target) && !sourceNotes.classList.contains('source-notes-open')) {
    setSourceNotes(true, { restoreFocus: false });
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && sourceNotes?.classList.contains('source-notes-open')) {
    event.preventDefault();
    setSourceNotes(false);
    return;
  }
  if (event.key === 'Tab' && sourceNotes?.classList.contains('source-notes-open')) {
    const focusable = [...sourceNotes.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((element) => element.getClientRects().length);
    if (focusable.length) {
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }
  if (event.target.id !== 'bottomResizeHandle') return;
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    resizeWireBy(24);
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    resizeWireBy(-24);
  } else if (event.key === 'Home') {
    event.preventDefault();
    resizeWireBy(-window.innerHeight);
  } else if (event.key === 'End') {
    event.preventDefault();
    resizeWireBy(window.innerHeight);
  }
});

wireHandle?.addEventListener('pointerdown', (event) => {
  event.stopImmediatePropagation();
  const consoleElement = document.querySelector('.bottom-console');
  if (!consoleElement) return;
  wireDrag = { pointerId: event.pointerId, startY: event.clientY, startHeight: consoleElement.getBoundingClientRect().height };
  wireHandle.setPointerCapture(event.pointerId);
  document.body.style.cursor = 'row-resize';
}, { capture: true });

wireHandle?.addEventListener('pointermove', (event) => {
  if (!wireDrag || wireDrag.pointerId !== event.pointerId) return;
  resizeWireBy(wireDrag.startHeight + wireDrag.startY - event.clientY - (document.querySelector('.bottom-console')?.getBoundingClientRect().height || 0));
});

wireHandle?.addEventListener('pointerup', (event) => {
  if (!wireDrag || wireDrag.pointerId !== event.pointerId) return;
  wireDrag = null;
  document.body.style.cursor = '';
});

wireHandle?.addEventListener('pointercancel', () => {
  wireDrag = null;
  document.body.style.cursor = '';
});
