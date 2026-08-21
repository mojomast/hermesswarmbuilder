# Flowfield Command Research

Research was performed on 2026-08-21. The shipped dashboard has no CDN, external font, image, framework, or runtime network dependency beyond its same-origin dashboard API.

## Sources and applied decisions

1. [MDN: WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)
   - Recommends bounded VRAM, fewer batched draw calls, static VAOs, vertex-shader work, smaller back buffers, eager deletion, avoiding blocking readback, and accounting for device pixel ratio.
   - Applied: one transform-feedback update draw and one particle render draw, persistent paired VAOs/buffers, no per-frame `getParameter`, `getError`, `readPixels`, or `getBufferSubData`, capped DPR/back buffer, viewport-scaled particle caps, and explicit resource disposal before reconstruction.

2. [WebGL2 Fundamentals: GPGPU and transform feedback](https://webgl2fundamentals.org/webgl/lessons/webgl-gpgpu.html)
   - Demonstrates transform-feedback varyings, rasterizer discard, paired source/destination buffers, paired VAOs/transform-feedback objects, and swapping each frame without CPU readback.
   - Applied: particle position, velocity, age, and lane are interleaved in two GPU buffers. The update shader writes the next complete particle state under rasterizer discard; the render shader consumes that destination, then source/destination swap.

3. [MDN: `isContextLost`](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/isContextLost) and its linked WebGL context events
   - Contexts can be lost because of GPU switching, contention, resets, or driver changes and must be re-established before rendering.
   - Applied: `webglcontextlost` prevents the default terminal loss, cancels animation, marks and assertively announces the visual as stale, and preserves all semantic operations. `webglcontextrestored` recreates and revalidates shaders, buffers, VAOs, transform feedback, deterministic seed state, and selected-lane state before announcing recovery. Shader failures are not reported as ordinary faults when the context is lost.

4. [W3C WCAG 2.2, SC 1.1.1: Non-text Content](https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html)
   - Complex graphics need short identification plus an equivalent long description or data table; controls need accessible names; color alone must not carry meaning.
   - Applied: the canvas is named and described, and an always-available semantic run table exposes phase, objective, agents, events, blocker text, and selection. Status labels accompany color, and all graphics controls are native buttons.

5. [W3C WCAG 2.2, SC 2.2.2: Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)
   - Automatically moving and auto-updating content needs a user pause/stop mechanism; one global mechanism is preferred. Real-time content should reconcile to current state after resume.
   - Applied: Freeze Motion stops all canvas simulation independently of Pause Feed. Pause Feed uses the client's bounded pause buffer; resume reconciles current state. `prefers-reduced-motion` starts frozen and changes are observed live, with no pulsing CSS. Labels explicitly distinguish graphics motion from workflow and stream state.

6. [Google SRE: Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)
   - Dashboards should emphasize actionable service state, distinguish symptoms from causes, show latency/traffic/errors/saturation, retain useful debugging context, and avoid noisy decoration.
   - Applied: current phase and blocker symptom remain prominent; event count/age, duration, error records, active agents, and queue depth provide operational traffic and saturation proxies. Run-ID filtering prevents unrelated events and resources from entering the selected context.

7. [Google SRE Workbook: Incident Response](https://sre.google/workbook/incident-response/)
   - Recommends clear ownership, a working record, early incident declaration, mitigation before root-cause analysis, and safe generic mitigations prepared in advance.
   - Applied: blockers display exact affected run, agent/owner, phase, reason, timestamp, tool call, artifact/log, and reported safe action. Advice is visibly non-executing; approval is separate. Historical blocker remediation routes to continuation/fork rather than mis-targeted deblock. Audit records show command lifecycle.

8. [MDN: `Document.visibilityState`](https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilityState)
   - Exposes whether the page is foreground-visible and emits `visibilitychange` when that changes.
   - Applied: animation frames stop entirely while hidden and restart when visible. Delta time is clamped on return, preventing simulation explosions and unnecessary hidden-tab GPU work.

## Visualization model

The design intentionally avoids the existing orbital/constellation/nebula metaphor. Runs are parallel left-to-right rectilinear corridors with depth-separated currents. Agents vary the lane emitter origin. Events and tools alter pulse phase and brightness. Gate count establishes transverse crossing locations. Queue pressure is shown as a staging reservoir before corridor admission. A blocker changes the shader's velocity field locally around a run/phase coordinate, producing constrained turbulence and stoppage rather than a decorative red cloud.

The GPU representation is an operational projection, not a source of truth. Exact API records remain in semantic HTML and are used for selection, commands, resources, blocker recovery, queue/gates/showcase, lineage, plans, assistance, and audit. Table selection highlights the corresponding blue corridor; projected midpoint hit testing also permits pointer selection when unambiguous and otherwise directs the operator back to the exact semantic table.

## Performance and robustness budget

- Particle count is bounded to 3,000 on narrow screens, 7,000 normally, and 12,000 on wide/4K viewports.
- DPR is capped at 1.5; backing dimensions are capped at 2,560 by 1,440 even on 4K displays.
- Frame delta is capped at 33 ms. Reduced motion and explicit freeze draw a stable frame without transform-feedback updates.
- Hidden documents issue no animation frames. Resizing is observed, debounced by animation frame, and does not recreate particle buffers.
- GPU simulation performs no CPU readback and no per-particle DOM work. Semantic DOM updates follow client snapshots, not animation frames.
- Context loss leaves all operational forms and tables functional and automatically rebuilds only GPU resources on restoration.
