# Swarm Nebula Research and Applied Decisions

Research was performed on 2026-08-21. The implementation has no remote runtime dependency: Three.js is loaded from the repository's existing `../../vendor/three.js`, while data and mutations use `../../headless-dashboard-client.js` and the shared dashboard chooser is loaded from `../../dashboard-directory.js`.

## Sources

1. [Three.js `Points`](https://threejs.org/docs/#api/en/objects/Points) and [BufferGeometry](https://threejs.org/docs/#api/en/core/BufferGeometry)
   - `Points` renders a geometry as point primitives, and `BufferGeometry` stores attributes in GPU buffers. Applied: retained event and tool activity is packed into one bounded point cloud with position and color buffer attributes instead of one DOM or mesh object per event.
2. [Three.js `InstancedMesh`](https://threejs.org/docs/#api/en/objects/InstancedMesh)
   - Instancing reduces draw calls when many objects share geometry and material, and ray intersections identify `instanceId`. Applied: run stars share one low-poly geometry/material and are selected through the returned instance ID.
3. [Three.js `Raycaster`](https://threejs.org/docs/#api/en/core/Raycaster)
   - Raycaster supports mesh, instanced-mesh, and point intersections; point picking uses a world-unit threshold. Applied: pointer coordinates are normalized against the canvas bounds, run/agent/shockwave meshes and points are intersected, and the point threshold is tuned to `0.16` for usable selection.
4. [Three.js responsive design and HD-DPI guidance](https://threejs.org/manual/en/responsive.html)
   - CSS display size and drawing-buffer size are distinct; camera aspect must follow the displayed canvas, and uncapped high-DPI rendering can multiply GPU work. Applied: a `ResizeObserver` updates camera and renderer only on size changes; DPR is capped at 1.5 and the buffer is scaled to at most 3840x2160 pixels.
5. [MDN: `webglcontextlost`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextlost_event) and [Khronos WebGL lost-context guidance](https://wikis.khronos.org/webgl/HandlingContextLost)
   - Context loss must stop rendering; preventing the loss event's default permits restoration, after which GPU resources must be recreated. Applied: loss cancels the animation frame, reports the outage, and leaves the semantic interface live. Restoration disposes stale scene references, rebuilds the renderer/scene from the latest client snapshot, and resumes only when visible.
6. [MDN: `prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)
   - Large-scale panning/scaling can be a vestibular trigger and non-essential motion should be reduced or replaced. Applied: the media query is observed in JavaScript; reduced mode stops nebula rotation, event drift, shockwave expansion, and CSS transitions while retaining selection, color, and text state.
7. [WCAG 2.2 Understanding SC 1.1.1: Non-text Content](https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html)
   - Complex visualizations need a brief identification and a longer equivalent that presents the same information. Applied: the canvas has an accessible description and every visual object/relationship is reproduced as live semantic tables with inspection buttons; those tables remain available when WebGL is unavailable.
8. [WCAG 2.2 Understanding SC 2.1.1: Keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html)
   - Pointer actions need keyboard equivalents using conventional controls. Applied: native buttons operate every command; the object index supports roving focus with arrows, Home, End, Enter, and Space; camera buttons duplicate drag/wheel endpoints; dialogs retain native keyboard behavior.
9. [Grafana dashboard design guidance: best practices](https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/best-practices/)
   - Operational dashboards should have a clear purpose, use meaningful names, avoid overload, and group related information. Applied: the 3D field answers topology/activity while fixed ledgers answer requested-vs-observed control, blocker, queue/gate, and lineage questions. Exact identifiers and freshness remain textual rather than encoded only in geometry.
10. [Cytoscape.js performance guidance](https://js.cytoscape.org/#performance)
    - Large graph views benefit from limiting rendered elements and expensive visual effects, while details can be shown on demand. Applied: only the newest 1,500 point records and 1,000 semantic relationships are visualized, activity detail is selection-scoped, labels stay in DOM inspection surfaces, and the scene avoids shadows/post-processing.

## Operational UX Decisions

- **Truth before metaphor:** spherical position is deterministic grouping, not causal proof. Exact run, agent, event, tool, queue, gate, plan, iteration, control, and resource records remain inspectable as text.
- **Requested is not observed:** persisted pause/stop/run-now/showcase intent is shown beside workflow phase/status and command acceptance never changes observed state locally.
- **Current and historical recovery differ:** current blockers offer deblock/advice workflows; historical blockers offer evidence inspection and lineage continuation/fork paths, never a misleading retry.
- **No unsupported retry:** there is no agent retry or task retry control because neither is in `OPERATION_COMMANDS`.
- **Mutation safety:** stop, clear queue, deblock/advice decisions, gate decisions, showcase start/stop, and consequential plan decisions require explicit confirmation. Each command has pending, accepted, or failed session lifecycle state and API errors/details remain visible.
- **Planning boundary:** assistance is explicitly non-executing. A proposal becomes a persisted project-plan draft only through a separate operator action. Plan commands carry current ledger version and immutable revision identity where relevant.
- **Transport distinction:** display freeze/resume uses client buffering; workflow pause/resume is only sent from the operation command surface. SSE fallback, polling, reconnect backoff, and maintenance refresh remain centralized in the shared client.

## Performance Budget

- One event/tool `THREE.Points` draw, one instanced run-star draw, bounded agent and blocker meshes, no shadows, textures, post-processing, or remote assets.
- Maximum 1,500 point particles and 1,000 relationship table rows; point buffers rebuild only when snapshots change.
- DPR <= 1.5, drawing buffer <= 3840x2160, animation suspended while the document is hidden, and static rendering under reduced motion.
- DOM lists are bounded to recent or relevant records; complete retained raw selection data remains available in the inspector.
