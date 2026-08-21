# Swarm Field Guide research

Research performed online on 2026-08-21 before implementation.

1. [Nielsen Norman Group: Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/)
   - Put frequent, important actions in the first view and defer specialist controls to a clearly labelled secondary surface.
   - Keep disclosure shallow. The guide therefore has one primary task per mobile page and one level of action sheets, rather than nested control-room panels.
2. [W3C WCAG 2.2: Understanding Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
   - WCAG's 24 CSS pixel minimum is a floor, and larger targets materially help one-handed users, people with tremor, and people working in moving environments.
   - All Field Guide controls use a 44px minimum target, spacing, visible focus, and full-row labels. Primary actions sit in the lower thumb reach area.
3. [MDN: Offline and background operation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation)
   - Cache the application shell, distinguish locally available data from fresh network state, and assume connectivity is intermittent rather than simply present or absent.
   - The shell is service-worker cached, the evidence journal is local-first, stale status is explicit, and server mutations remain disabled/failed honestly instead of pretending they synchronized.
4. [WAI-ARIA Authoring Practices: Modal Dialog Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
   - A modal must contain focus, close with Escape, have an accessible name, move focus inside on open, and restore focus to its invoker on close.
   - Native semantic `dialog` elements provide the sheet foundation; code adds initial focus, a Tab loop, Escape handling, and deterministic focus restoration. Consequential flows focus the least destructive action first.
5. [Microsoft Learn: Mobile offline for model-driven apps](https://learn.microsoft.com/en-us/power-apps/mobile/mobile-offline-overview)
   - Remote workers need a consistent local working set across spotty connections; offline-first systems save locally, synchronize deliberately, and account for conflicts when network access returns.
   - The guide keeps its field journal device-local and continuously usable, while clearly separating that journal from server evidence. Live controls disclose connectivity and fail honestly because this frontend cannot invent server-side conflict resolution.

## Product lessons

- Field-service software must privilege the next safe action, current assignment, location/context identity, and evidence recording over global monitoring density.
- A checkable gate is more useful in the field than a tiny status visualization. Evidence, decision, and consequence belong in one guided flow.
- Offline resilience is primarily a truthfulness problem: show when data was last fresh, preserve drafts locally, and never style a queued local note as a completed server action.
- Wide screens should add simultaneous page context, not inflate mobile components. The 4K layout is a bounded, multi-leaf binder with readable line lengths and a persistent spine.
- Persistent bottom navigation should use a small, stable set of labelled destinations with a visible current-page state; the five mobile destinations become physical binder tabs on wide displays.
