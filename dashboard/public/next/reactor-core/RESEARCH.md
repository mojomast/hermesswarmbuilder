# Reactor Core Operations Console: Research and Design Record

**Route:** `/next/reactor-core/index.html`

**Scope:** Hermes SwarmBuilder software control and monitoring
**Important boundary:** Reactor Core is a visual metaphor. It is not a nuclear instrumentation, control, protection, incident-response, or safety system. Nuclear-industry guidance was consulted for general human-factors lessons only; the UI does not claim regulatory compliance, safety classification, plant fidelity, or suitability for physical operations.

## Product Evidence Reviewed

The implementation was checked against these repository authorities:

- `dashboard/src/server.ts`: routes, operation semantics, iteration validation, command acknowledgements, queue/gate projections, SSE cadence, artifacts/logs, and project-plan/assistance endpoints.
- `dashboard/public/headless-dashboard-client.js`: the 29 `OPERATION_COMMANDS`, nine project-plan actions, SSE-to-polling fallback, reconnect, frozen-view buffering, freshness fields, run/iteration/resource selection, and request signatures.
- `dashboard/public/next/constellation/constellation.js`: the upgraded object dossier model, complete iteration payload construction, requested-versus-observed distinction, command correlation and lifecycle, evidence-aware gate actions, plan lifecycle, assistance threads, focus restoration, and stale-state validation.
- The legacy dashboard clients under `dashboard/public/`: established run, queue, gate, lineage, showcase, evidence, audit, and steering workflows.
- The previous Reactor Core implementation: retained its dark hex-core identity and dense three-column layout, but removed fabricated reactor values and repaired incomplete controls.

## High-Quality Sources and Applied Findings

1. **U.S. Nuclear Regulatory Commission, NUREG-0700, Human-System Interface Design Review Guidelines**
   https://www.nrc.gov/reading-rm/doc-collections/nuregs/staff/sr0700/
   Applied as general human-factors inspiration: overview-to-detail hierarchy, consistent coding, legible status grouping, task-oriented controls, alarm prioritization, and explicit display-system status. Not used to claim that this software console is an SPDS, Class 1E system, or NRC-conformant interface.

2. **International Atomic Energy Agency, SSG-39, Design of Instrumentation and Control Systems for Nuclear Power Plants**
   https://www.iaea.org/publications/10850/design-of-instrumentation-and-control-systems-for-nuclear-power-plants
   Applied only as a conceptual reminder to distinguish indication from control and requested action from observed outcome. Reactor Core therefore labels accepted commands as persisted intent and separately shows observed workflow state.

3. **UK Health and Safety Executive, CHIS7, Better Alarm Handling**
   https://www.hse.gov.uk/pubns/chis7.pdf
   Applied: alarms must be useful and actionable rather than decorative; the blocker dossier identifies reason, affected run/agent, location/evidence references, and supported recovery. Persistent flashing and indiscriminate alarm color were avoided.

4. **IEC 62682:2022, Management of Alarm Systems for the Process Industries**
   https://webstore.iec.ch/en/publication/65543
   Applied at a non-normative design level: separate alarm condition, operator action, and history; preserve event/audit evidence; avoid treating acknowledgement as resolution. No IEC conformance is asserted.

5. **NIST SP 800-61 Rev. 3, Incident Response Recommendations and Considerations for Cybersecurity Risk Management**
   https://csrc.nist.gov/pubs/sp/800/61/r3/final
   Applied to software incident mitigation: preserve evidence, establish scope and ownership, correlate events, choose bounded recovery, and verify the outcome. Historical terminal work is handled through continuation/fork rather than pretending a current-run command can mutate it.

6. **OpenTelemetry, Observability Primer**
   https://opentelemetry.io/docs/concepts/observability-primer/
   Applied: telemetry is correlated by run, agent, tool/event identifiers, and timestamps; raw sanitized records remain inspectable; transport freshness and degraded/polling states are visible. The console does not invent measurements when server data is absent.

7. **W3C WCAG 2.2, Understanding Success Criterion 2.2.2: Pause, Stop, Hide**
   https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html
   Applied: operators can freeze auto-updating presentation, the frozen state and age are explicit, resume catches up through the headless client, and reduced-motion preferences suppress animation and transitions.

8. **W3C WCAG 2.2, Understanding Success Criterion 4.1.3: Status Messages**
   https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html
   Applied: command and connection outcomes use programmatic status regions without unnecessarily moving focus; errors and accepted receipts include useful context.

9. **W3C WAI-ARIA Authoring Practices Guide, Dialog (Modal) Pattern**
   https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
   Applied: native modal dialogs, visible close controls, labelled dialogs, initial heading focus for structured dossiers, Escape behavior, and browser-managed focus containment/return.

10. **W3C WAI, Complex Images Tutorial**
    https://www.w3.org/WAI/tutorials/images/complex/
    Applied: the visual hex topology does not carry unique information by color alone. Every occupied channel is a keyboard-operable labelled control, and its complete textual dossier exposes the underlying record.

## Implemented Human-Factors Model

### Overview, selection, and authority

- The 61 cells are software channels populated deterministically from current server projections: blockers, agents, runs, iterations, queue items, gates, plans, and recent events/tools.
- Empty cells say `OPEN`; no synthetic flux, temperature, burnup, pressure, margin, or power is displayed.
- Every selectable channel, rod/agent, run, gate, queue item, iteration, plan, blocker, event, and tool opens the same dossier structure: identifier/type/status, ownership, current work, owning run, timestamp, correlated telemetry, evidence/resources, blocker location, recovery guidance, and the complete sanitized record.
- Blocker color is reserved for server-reported blocked/error states. Text and shape/labels carry the same meaning.

### Alarm and incident handling

- The blocker banner reports the server reason and affected run rather than a generic "trip."
- Recovery is contextual: deblock/advice for a current blocked run; continuation/fork for historical or terminal lineage; gate evidence and decisions for assurance gaps; plan revision/review for planned work.
- Evidence references are operator-entered or server-reported. Gate decisions never imply that evidence files were generated.

### Live telemetry and transport

- SSE status, polling fallback, disconnect/reconnect, complete refresh, last message/refresh age, and frozen presentation are exposed.
- Freeze View pauses presentation through the headless client; Resume applies buffered state/events and performs a complete refresh. Disconnect affects only browser transport, not workflow execution.
- The overview polygon displays bounded server-backed counts. It updates on model publication rather than running a decorative animation loop.

### Command lifecycle

- All 29 `OPERATION_COMMANDS` are exposed in the protocol console; guided forms cover common and payload-sensitive operations.
- Commands receive actor, correlation, and idempotency identifiers. The UI reports validating, sending, accepted, rejected, or outcome-unknown states and retains the command receipt for the session.
- A stale display triggers refresh before dispatch. "Accepted" is explicitly distinguished from runner-observed completion.
- Requested pause, stop, run-now, next-run, admission, and showcase state is shown beside observed phase and current run.

### Iteration, queue, gate, and showcase integrity

- Iteration requests include source run/iteration, absolute repository path, base ref, objective, bounded change text, gate IDs, snapshotted gates when loaded, and limits.
- Queue launch uses the selected brief's repository target, objective, context, and acceptance gates instead of misusing `use-as-next-direction` with a queue ID.
- Continue, fork, and use-direction share complete lineage payload construction.
- Showcase start includes source lineage, repository, base ref, objective, first bounded change, gate IDs, generation target, and limits. Target updates remain separately available.
- Gate decisions include status, notes, run, and evidence paths; evidence attachment requires explicit existing paths; gate definitions can be updated.

### Planning and assistance

- Project-plan client calls use the command schema expected by the headless client: `{content}` creation, `{planId, content}` revision updates, exact revision/digest lifecycle subjects, and `expectedVersion` options.
- Full lifecycle is available: create classic/managed draft, save immutable revision, ready for review, approve exact revision, reject with required notes, launch, clone, fork, and archive.
- Plan content includes boundaries, repository, gates, validation expectations, milestones, limits, and lineage fields.
- Assistance threads can be listed, opened, created, messaged with optimistic versioning, and converted into an editable draft. Help states that assistance is discussion and may contact the configured provider.

## Accessibility and Responsive Decisions

- Native buttons replace clickable `div` elements. SVG channels have names, roles, roving focus, arrow/Home/End navigation, and Enter/Space activation.
- Status output uses `role=status`; the telemetry feed remains a `role=log`.
- Keyboard shortcuts are ignored while editing inputs, textareas, and selects.
- Native dialogs provide focus containment and Escape close; the structured dossier initially focuses its heading.
- Focus is restored by stable element ID across live top-level renders. Modal editors are not re-rendered merely because telemetry arrives, preserving drafts and focus.
- `prefers-reduced-motion` disables pulsing, animation, smooth scrolling, and meaningful transition duration.
- At mobile widths, masthead controls remain directly available, dialogs become full-screen, forms collapse to one column, and action targets gain usable height.
- 1080p uses the dense three-column console; font and canvas/SVG scaling support high-DPI and 4K displays.

## Known Boundaries

- The dashboard server returns command acceptance, not asynchronous command completion records. Reactor Core can show the receipt and later observed projections/events, but cannot prove completion when the runner emits no corresponding state or event.
- Event correlation is strongest when records contain run, agent, gate, queue, iteration, or tool identifiers. Text fallback is used for gate/queue correlation only, so incomplete producer metadata can reduce precision.
- Only the latest 30 retained event/tool records occupy hex channels; the telemetry list and dossier correlation retain the larger client window.
- Server responses are sanitized and bounded. The complete dossier is authoritative for what the dashboard API exposes, not for unexposed runner internals.
