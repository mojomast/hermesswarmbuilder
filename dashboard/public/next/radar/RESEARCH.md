# Radar Interface Research

Research completed before implementation on 2026-08-21. The dashboard borrows operational display principles, not literal avionics styling or safety claims.

## Sources and applied lessons

1. [FAA Aeronautical Information Manual, Chapter 4, Section 5: Surveillance Systems](https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap4_section_5.html)
   - TIS displays use relative bearing, range rings, altitude/trend tags, track-up orientation, and distinct symbols for proximate versus alert traffic. They limit the picture to significant intruders and explicitly expose stale/coasting/unavailable states.
   - Applied: Radar uses range rings for workflow distance, compact data tags, selected/threat symbol differences, a bounded operational picture, and persistent SSE/polling/paused freshness state. A blocker is presented as a collision alert rather than making every active target alarming.

2. [EUROCONTROL, Human Factors Integration in ATM System Design](https://www.eurocontrol.int/publication/human-factors-integration-atm-system-design)
   - Human factors should be integrated into system design proactively, with attention to successful everyday operation rather than only preventing failure.
   - Applied: normal progress remains legible and calm; the workflow scale, current-flight strip, target evidence, and reversible controls support routine work. Alerts are exceptional overlays rather than the interface's default visual language.

3. [UK Health and Safety Executive, Better Alarm Handling (Chemical Information Sheet 6)](https://www.hse.gov.uk/pubns/chis7.pdf)
   - Alarm systems should prioritize actionable abnormal conditions and avoid floods, nuisance alarms, poor prioritization, and over-reliance on color. Operators need enough information and time to diagnose and respond.
   - Applied: blockers alone become high-priority collision alerts; advice decisions and deblock input sit together; urgency uses symbol, label, border, and text as well as amber/red. Event noise stays in a filterable traffic scope instead of competing with alerts.

4. [W3C WAI, Complex Images Tutorial](https://www.w3.org/WAI/tutorials/images/complex/)
   - Complex diagrams need a short accessible identity and a structured textual equivalent that communicates essential relationships and values.
   - Applied: the SVG has a title and description, while the context scope and target list provide the same run/agent identities, states, tasks, phase, and evidence in semantic HTML.

5. [W3C SVG Accessibility API Mappings, keyboard navigation and semantics](https://www.w3.org/TR/svg-aam-1.0/)
   - Meaningful SVG elements need explicit names/roles, and interactive SVG requires keyboard focus support. Pure drawing directives should not pollute the accessibility tree.
   - Applied: decorative grid geometry is hidden, selectable `g` targets receive `role="button"`, names, selection state, and roving `tabindex`; arrow/Home/End navigation and Enter/Space activation mirror pointer selection. Reduced-motion mode removes the sweep and transition effects.

## Design boundary

Radar does not imply real collision prediction. Polar position is a deterministic visualization: radial distance represents workflow progression and bearing separates targets. The text scope is authoritative, and command results come from the Hermes API through `../../headless-dashboard-client.js`.
