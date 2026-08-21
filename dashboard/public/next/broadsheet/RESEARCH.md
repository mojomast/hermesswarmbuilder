# Daily Swarm: Web Research and Design Derivations

Research was conducted before implementation on 2026-08-21. Sources are public web guidance rather than visual templates; the resulting interface is an original operational broadsheet.

## Editorial dashboard design and status

- Nielsen Norman Group, “10 Usability Heuristics for User Interface Design”: https://www.nngroup.com/articles/ten-usability-heuristics/
  - Derived decision: status is visible in the masthead at all times, commands report success or failure in a live notice, and dangerous or consequential actions require explicit confirmation.
  - Derived decision: controls retain plain operational verbs (`Pause`, `Resume`, `Hold`, `Stop`) even though their containers use editorial metaphors. The metaphor must not obscure outcome.
  - Derived decision: the lead contains only the current objective, current work, blocker, run, and phase. Secondary control detail moves into the decision folio so it does not compete with the primary operational story.

## Information scent

- Nielsen Norman Group, “Information Scent: How Users Decide Where to Go Next”: https://www.nngroup.com/articles/information-scent/
  - Derived decision: links and buttons name their destination or effect (`Read specification`, `Open plan ledger`, `Pass gate`) rather than using vague labels such as “More”.
  - Derived decision: edition, correspondent, source, and wire entries expose a useful preview before activation: status, time, title/task, source/type, and available record kind.
  - Derived decision: labels remain self-contained on mobile instead of relying on nearby columns for context.

## Long-form operational reading and typography

- GOV.UK Design System, “Type scale”: https://design-system.service.gov.uk/styles/type-scale/
  - Derived decision: typography uses a small, consistent responsive scale in relative units. Body copy remains at least 1rem with a stable vertical rhythm; display type shrinks deliberately on small screens.
  - Derived decision: serif editorial copy and sans-serif controls are separated by function, but both use local system fonts, avoiding remote font dependencies.
- W3C WAI, “Understanding Success Criterion 1.4.10: Reflow”: https://www.w3.org/WAI/WCAG22/Understanding/reflow.html
  - Derived decision: the broadsheet becomes a single reading column at narrow widths and at high zoom, without page-level horizontal scrolling or sticky chrome obscuring focused content.
  - Derived decision: long identifiers and source text wrap; preformatted evidence gets its own bounded overflow only where preserving formatting is meaningful.
  - Derived decision: readable prose is capped near 70 characters, while 4K and 1080p layouts use available width for multiple independent editorial columns rather than stretching lines.

## Accessible disclosure and modal patterns

- W3C WAI ARIA Authoring Practices Guide, “Disclosure (Show/Hide) Pattern”: https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/
  - Derived decision: expandable source, agent, edition, gate, and wire records use native `details`/`summary`, providing Enter/Space behavior and exposed expanded state without custom keyboard simulation.
- W3C WAI ARIA Authoring Practices Guide, “Dialog (Modal) Pattern”: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
  - Derived decision: Mission Control, plans, and confirmation use native modal dialogs. Focus moves to a visible heading, Tab is contained by the browser, Escape closes, and focus is restored to the invoking control.
  - Derived decision: irreversible or high-impact decisions put Cancel first and focus the dialog heading rather than the destructive action.
- W3C WAI, “Understanding Success Criterion 3.2.4: Consistent Identification”: https://www.w3.org/WAI/WCAG22/Understanding/consistent-identification.html
  - Derived decision: the same operation keeps the same accessible name wherever it appears, and controls use visible text rather than ambiguous icon-only affordances.

## Visual and interaction synthesis

- The headline is the current objective because it is the operator’s highest-value orientation cue.
- A blocker interrupts the page as a red breaking-news banner immediately below the masthead, rather than becoming one status among many.
- Runs are “editions,” agents are bylined correspondents, evidence is a numbered source folio, decisions are made at an editorial desk, and telemetry is a wire. These mappings describe operational roles while avoiding application chrome, cards, and admin-layout conventions.
- Hairline rules, a monochrome paper palette, restrained red, folio numbers, drop caps, and asymmetric column spans create print hierarchy. There are no card grids, left rails, top app bars, or persistent tool panels.
- Motion is limited to a subtle live-wire marker and is removed under `prefers-reduced-motion`. Focus uses a high-contrast double rule independent of color.
