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

## Ergonomic decisions

- The patch field is not a card dashboard. It is one routed instrument surface made of differently sized operational modules, offset across an automatically arranged grid.
- Visual cables explain only the major data path: workflow to agents to events, controls through queue/lifecycle/gates, and run/gate outputs to evidence. They never imply that dragging is required.
- The linear-controls toggle keeps the exact same controls and semantic source order. This avoids parity drift between a visual UI and a separate accessibility UI.
- Dynamic output is inserted with DOM text properties, not interpreted as markup. Evidence previews use `textContent` in a bounded, scrollable `pre` element.
- Destructive or consequential operations are explicitly named. Queue clearing, stop actions, plan launch, approval, archive, and gate decisions require labeled controls; queue clear and plan launch add confirmation steps.
- At 4K the field expands to a 12-column instrument with larger spacing; at 1080p it remains a 12-column composition; compact screens use six columns; mobile becomes semantic linear order with no cables.

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
