# Patchbay research and applied guidance

Research performed 2026-08-21. The implementation has no remote runtime dependencies; these sources informed the local HTML, CSS, and SVG behavior only.

## Sources

1. [Node-RED: Wires](https://nodered.org/docs/user-guide/editor/workspace/wires)
   - Node-RED makes ports visible, highlights wires associated with a selection, supports endpoint-based wiring, and documents alternate connection operations.
   - Applied: ports are visually distinct and cables are secondary flow annotations. Selection and operation do not depend on grabbing a cable. Each mutation is a labeled native button or form, avoiding hidden gestures.
2. [Node-RED: Arranging nodes](https://nodered.org/docs/user-guide/editor/workspace/arrange)
   - Node-based workspaces benefit from alignment, distribution, and automatic layout commands because arbitrary placement becomes hard to scan.
   - Applied: modules use a deterministic, responsive CSS Grid auto-arrangement rather than user-authored coordinates. The arrangement changes at desktop, compact desktop, and mobile widths while preserving semantic source order.
3. [Blender Manual: Node Parts](https://docs.blender.org/manual/en/latest/interface/controls/nodes/parts.html)
   - Node sockets distinguish inputs from outputs and labels communicate data meaning; node color and title help category recognition.
   - Applied: every operational domain has labeled identity, a left input and right output convention, category top rails, and textual state tags. Ports do not masquerade as actionable controls.
4. [Ableton Learning Synths: Signal Flow](https://learningsynths.ableton.com/en/get-started/signal-flow)
   - Modular synthesis teaches operation as a directed signal path through functional stages, making source, processing, modulation, and output legible as a chain.
   - Applied: cables flow from output ports to input ports, use only three semantic styles (signal, control, evidence), sit behind modules, and are deliberately sparse. On mobile and in linear mode they disappear entirely.
5. [W3C WCAG 2.2 Understanding 2.1.1: Keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html)
   - Pointer actions need keyboard equivalents; endpoint operations do not inherently require path-based pointer input. Native controls are a sufficient technique.
   - Applied: all operations use native buttons, inputs, selects, and forms. Arrow keys move focus among whole modules; normal Tab order reaches every action. The same DOM can switch to a nonvisual-friendly linear control layout.
6. [W3C WCAG 2.2 Understanding 1.4.1: Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)
   - Color must not be the only means of conveying information.
   - Applied: run, module, workflow, gate, loop, and connection states are always written as text. Current workflow position uses `aria-current`, labels, borders, and text in addition to color.
7. [W3C WCAG 2.2 Understanding 2.4.7: Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html)
   - Every keyboard-operable component needs a persistent visible focus indicator.
   - Applied: a high-contrast three-pixel `:focus-visible` outline is global. Modules also expose a visible focused boundary during arrow-key navigation.
8. [W3C WCAG 2.2 Understanding 2.3.3: Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)
   - Nonessential motion triggered by interaction should be disableable, and reduced-motion preferences should be respected.
   - Applied: cables are static, no signal pulses or animated graph movement are used, and the reduced-motion media query removes smooth scrolling and transitions.
9. [Google SRE: Managing Incidents](https://sre.google/sre-book/managing-incidents/)
   - Effective response uses explicit ownership, a recognized command post, a live state record, preserved evidence, and clear handoff rather than uncoordinated changes. The guidance prioritizes stopping harm, restoring operation, and preserving evidence for root-cause work.
   - Applied: the contextual inspector is Patchbay's command post. It reports owning run, affected agent/phase/tool/artifact/log, recent activity, audit evidence, suggested action, and whether remediation targets current or historical work. Recovery does not hide the source record.
10. [Google SRE: Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)
   - Monitoring should answer both what is broken and why, remain simple enough to reason about, pair dashboards with historical logs, and make human-facing signals actionable rather than noisy.
   - Applied: high-level requested/observed status remains on the physical modules; selection drills into correlated events, exact causes, resources, and raw authority. The interface avoids animated traffic and keeps alerts textual and actionable.
11. [OpenTelemetry: Signals](https://opentelemetry.io/docs/concepts/signals/)
   - Traces, metrics, logs, events, and contextual baggage are complementary views of the same distributed activity and should be correlated rather than presented as unrelated feeds.
   - Applied: run ID and agent/tool identities correlate events, tool calls, run resources, iterations, blockers, and audit records in one inspector. Raw records remain available alongside the derived operational view.
12. [MDN: Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
   - `EventSource` is a one-way stream with named events, event IDs, reconnect behavior, explicit close, and error handling; heartbeat messages can keep a stream active.
   - Applied: Patchbay exposes transport, connection state, last-signal age, pause/resume buffering, disconnect/reconnect, manual refresh, and polling degradation supplied by the shared client. The operator guide explains that stream pause freezes the view rather than pausing the runner.
13. [W3C WCAG 2.2 Understanding 4.1.3: Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)
   - Success, errors, waiting, and progress should be programmatically exposed without taking focus, while live regions should not become excessively chatty.
   - Applied: command receipts, connection summaries, save state, and toast outcomes use status/alert semantics. The high-volume event scope is not an assertive live region, so telemetry does not continually interrupt screen-reader work.
14. [WAI-ARIA APG: Modal Dialog Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
   - Modal dialogs need a visible label, contained tab sequence, Escape dismissal, initial focus inside, an explicit close control, and focus restoration to the invoker.
   - Applied: Help uses native `dialog`; the plan rack traps focus, closes with Escape, and returns focus. The contextual inspector is deliberately non-modal and reflows the desktop patch field instead of falsely claiming modal behavior.
15. [W3C WCAG 2.2 Understanding 3.3.5: Help](https://www.w3.org/WAI/WCAG22/Understanding/help.html)
   - Discoverable context-sensitive help reduces mistakes and lets operators learn an input or operation without losing task context.
   - Applied: persistent Help documents signal semantics, every supported operation and plan action, keyboard use, telemetry behavior, command acceptance, historical recovery, gate evidence, and planning safety. Field-level format hints remain adjacent to structured plan and gate inputs.
16. [W3C WCAG 2.2 Understanding 2.4.11: Focus Not Obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)
   - Sticky or persistent disclosures must not entirely obscure keyboard focus; reflowing content, moving focus into a disclosure, Escape dismissal, and scroll padding are supported approaches.
   - Applied: the desktop inspector reduces available patch-field width and moves focus to its heading; compact layouts make it a full-height operator-opened layer with Escape close. Stream rendering captures/restores focused controls, selection ranges, and drafts.

## Ergonomic decisions

- The patch field is not a card dashboard. It is one routed instrument surface made of differently sized operational modules, offset across an automatically arranged grid.
- Visual cables explain only the major data path: workflow to agents to events, controls through queue/lifecycle/gates, and run/gate outputs to evidence. They never imply that dragging is required.
- The linear-controls toggle keeps the exact same controls and semantic source order. This avoids parity drift between a visual UI and a separate accessibility UI.
- Dynamic output is inserted with DOM text properties, not interpreted as markup. Evidence previews use `textContent` in a bounded, scrollable `pre` element.
- Destructive or consequential operations are explicitly named. Queue clearing, stop actions, plan launch, approval, archive, and gate decisions require labeled controls; queue clear and plan launch add confirmation steps.
- At 4K the field expands to a 12-column instrument with larger spacing; at 1080p it remains a 12-column composition; compact screens use six columns; mobile becomes semantic linear order with no cables.
- Every module and visible cable route is inspectable. Cable interaction is optional: the same endpoints and meaning are available through module controls and Help, and mobile/linear layouts intentionally remove the cable drawing.
- Command state is split into sending, accepted intent, rejected, and outcome unknown. Accepted intent is never described as completed; operators are directed to observed state, event, audit, and evidence confirmation.
- Current blockers permit advice and deblock preparation only for the active owning run. Historical and terminal records expose continuation, fork, next-direction, and reviewed-plan recovery so immutable evidence is not confused with a mutable current run.
- Main patch-field drafts, focused controls, and text selection survive snapshot renders. Plan forms are not rebuilt by stream subscriptions; stale plan writes still use server `expectedVersion` conflict handling.

## Parity map

| Legacy capability | Patchbay module/scope |
| --- | --- |
| Stream pause/resume, refresh, connection status | Masthead signal controls |
| Run selection and resources | Run selector -> Evidence scope |
| Workflow phase and adherence | Workflow sequencer |
| Events and tools | Event and tool scope; agent channels show active tool modulation |
| Agents | Active modules |
| Pause, hold, resume, unhold, stop, run-now | Steering matrix transport |
| Steering add/remove and current objective | Steering matrix and queue direction actions |
| Deblocking and advice approval/denial | Deblock processor |
| Queue add, pin, archive, clear, use as direction | Direction queue |
| Gates add/update decision/evidence | Acceptance gates |
| Showcase start/pause/resume/stop/target | Lifecycle generator |
| Iteration start, selection, detail | Lifecycle generator -> Evidence scope |
| Continue/fork/use direction | Lifecycle lineage controls |
| SPEC, DEVPLAN, artifacts, logs, run, iteration, audit evidence | Evidence scope |
| Plan create/update/review/approve/reject/launch/clone/fork/archive | Project plan rack |
| Planning assistance create/resume/message/proposal-to-plan | Project plan rack Assistance pane |
| Authoritative inspection for every routed object | Context inspector with ownership, activity, raw record, resources, audit, and remediation |
| Requested versus observed controls and command receipts | Steering matrix meters and inspector command lifecycle |
| Freshness, SSE/polling degradation, pause/reconnect | Masthead live signal age and operator Help |
| Saved project-plan revision retrieval | Review pane immutable revision selector |
| Operator onboarding and safety semantics | Comprehensive Help dialog and field-level format guidance |
