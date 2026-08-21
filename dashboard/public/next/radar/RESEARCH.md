# Radar Interface Research

Research completed before implementation on 2026-08-21. Radar borrows interaction and information-management principles from air-traffic control; it is not an avionics product and does not claim collision prediction or operational aviation safety.

## Authoritative sources and applied lessons

1. [FAA Order JO 7110.65BB, 2-1-1 through 2-1-6: ATC service, duty priority, and safety alerts](https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap2_section_1.html)
   - Safety alerts take priority, urgency language is reserved for imminent conditions, and an alternate course should be offered when feasible. The controller must not assume another owner has already recognized an unsafe condition.
   - Applied: reported blockers alone receive alert symbology and move to the front of the scope. Their strip names the affected run, agent, phase, owner, evidence location, and smallest reported safe action. Current and historical remediation routes are explicit rather than inferred.

2. [FAA Order JO 7110.65BB, Section 2-3: Flight Progress Strips](https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap2_section_3.html)
   - Flight strips keep necessary current data, stable identity, revision/control status, route, times, remarks, and coordination data in consistent fields. Control status must remain current, and changes must not create ambiguity with prior data.
   - Applied: every selectable run, agent, event, tool call, gate, queue item, iteration, plan, and blocker opens the same stable flight-strip structure: type, identity, owning run, status, update time, current activity, object-specific facts, evidence, telemetry, and authority. Live-run changes do not silently retarget an inspected historical strip.

3. [FAA Order JO 7110.65BB, 5-2-15: Validation of Mode C Altitude Readout](https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap5_section_2.html#5-2-15)
   - A readout must be validated after initial track start, coast/frozen recovery, unreliable data, and some handoffs; unvalidated data must not be used for separation.
   - Applied: Radar exposes transport, message age, refresh age, frozen state, and client errors. Unfreezing performs synchronization. Commands refresh stale state before submission, and recovery revalidates the current run and blocker instead of trusting the previously rendered strip.

4. [FAA Aeronautical Information Manual, Chapter 4, Section 5: Surveillance Systems](https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap4_section_5.html)
   - Traffic displays use relative bearing, range rings, trend/data tags, distinct alert symbols, and explicit unavailable or stale states. They bound displayed traffic to preserve a usable picture.
   - Applied: the scope uses deterministic bearing, workflow range rings, direct labels, separate run/blip/alert shapes, and a bounded mark count. The complete set remains available on the flight-data board, so scope decluttering never removes access.

5. [Google Site Reliability Engineering, Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)
   - Monitoring should answer what is broken and why, keep alert signal high and noise low, expose errors and latency, and make human alerts actionable rather than merely unusual.
   - Applied: ordinary event volume remains filterable telemetry while blockers become alerts. Tool duration, errors, queue pressure, event counts, activity, resources, and control requests are available for diagnosis. Every alert strip offers evidence and only supported remediation.

6. [OpenTelemetry, Traces](https://opentelemetry.io/docs/concepts/signals/traces/)
   - Context propagation, parent relationships, timestamps, attributes, events, links, and status reconstruct distributed work across processes; asynchronous producer/consumer work may require causal links rather than a false direct parent.
   - Applied: event and tool records retain their own identity and payload while resolving through reported `runId`, `agentId`, source iteration, and queue/plan lineage. Missing ownership is shown as not reported; Radar never substitutes the currently selected run merely to make a resource link work.

7. [W3C WAI, Complex Images Tutorial](https://www.w3.org/WAI/tutorials/images/complex/)
   - Complex diagrams need a concise accessible identity plus a structured textual equivalent preserving essential relationships and values.
   - Applied: the SVG has a title and description; the adjacent flight-data board contains every operational object in HTML, and every mark opens a semantic dossier. Position and color are not required to retrieve any record.

8. [W3C WAI-ARIA Authoring Practices, Developing a Keyboard Interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/)
   - Composite widgets should have one tab stop, predictable arrow navigation, persistent visible focus, a distinction between focus and selection, and logical focus restoration after rerender or dialog closure.
   - Applied: scope marks and strip tabs use roving `tabindex`, Arrow/Home/End movement, and Enter/Space activation. Selection has a white ring distinct from amber keyboard focus. Telemetry renders preserve focus and draft fields instead of dropping the operator at the document body.

9. [W3C WAI-ARIA Authoring Practices, Modal Dialog Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
   - A modal needs a visible label and close control, contained keyboard interaction, suitable initial focus for structured content, Escape dismissal, and focus restoration.
   - Applied: native dialogs provide control, planning, and contextual Help workspaces. Their static headings receive initial focus, close controls remain visible, and native modal behavior supplies containment, Escape handling, and invoker focus restoration.

10. [W3C WCAG 2.2, Understanding 1.4.10 Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)
    - Text and controls must reflow without lost functionality at narrow effective widths. A two-dimensional diagram can retain layout, but its surrounding content and equivalent controls still need one-direction reflow; sticky regions must not obscure focus.
    - Applied: the radar remains a bounded scalable figure while the data board, dossier, controls, plans, and Help stack at mobile and zoom widths. The footer reduces rather than covering the focused content, dialog layouts become one column, and no command disappears on mobile.

11. [W3C WCAG 2.2, Understanding 1.4.1 Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)
    - Color cannot be the only means of conveying status or category.
    - Applied: runs, agents, and blockers use diamond, point/leader, and triangle marks; alerts also use a dashed ring and textual `ALERT` dossier. Every status appears in text, and forced-color mode retains outlines.

12. [W3C WCAG 2.2, Understanding 2.3.3 Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)
    - Nonessential motion triggered by interaction should be disableable when users request reduced motion.
    - Applied: the sweep is decorative and disappears under `prefers-reduced-motion`; all transitions and smooth movement are removed while selection, freshness, and alerts remain fully legible.

## Control-plane findings

- `../../headless-dashboard-client.js` is the supported browser boundary. It provides full refresh, SSE with polling fallback and reconnect, freeze buffering, run/iteration/resource loading, all operation commands, project-plan commands, and planning assistance.
- `/api/commands` acknowledges persisted intent. `pause` and `stop` report checkpoint effectiveness; `run-now` and iteration requests report next-runner-tick effectiveness. Radar therefore says **accepted**, never **completed**, and keeps requested state separate from observed `/api/state`.
- `deblock` and `deblock-advice` are current-run operations. Managed terminal or historical work is recovered through `continue-from-iteration` or `fork-from-iteration`, not by pretending an old process can resume.
- Iteration requests require an absolute `repoPath`, objective, bounded `changeText`, `baseRef`, and an object-valued limits contract. Radar constructs only supported numeric limit fields and loads source iteration detail to carry acceptance gate IDs and snapshotted gates. It never sends the entire `autoIteration` control object as `limits`.
- Gate evidence commands record paths and decisions but do not create artifacts. Radar requires entered existing paths for attachment and does not inject fictional default evidence files.
- Resource requests take an explicit owning run ID. This prevents a selected event, tool, gate, or historical iteration from reading artifacts belonging to the client's previously selected run.

## Design boundary

Range is deterministic workflow progression; bearing separates overlapping records. Neither represents physical distance, time, priority, or predicted conflict. The textual flight strip and API payload are authoritative. Scope selection, current command authority, selected resource run, requested control intent, and observed workflow state are deliberately separate identities.
