# Voxel Foundry Research and Applied Decisions

The dashboard is implemented only in `/dashboard/public/next/voxel-foundry/`. It has no CDN, font, image, framework, or runtime network dependency beyond the existing same-origin Hermes APIs used by `../../headless-dashboard-client.js`. `../../dashboard-directory.js` is also loaded locally.

## Quality Sources

1. **Khronos Group, WebGL 2.0 Specification**  
   https://registry.khronos.org/webgl/specs/latest/2.0/  
   Applied: WebGL2 core vertex array objects and `drawElementsInstanced` provide the cell's actual cube architecture. The renderer does not use Three.js, orbital point clouds, or transform feedback. A single indexed cube is expanded with per-instance position, scale, color, and integer identity attributes.

2. **MDN, WebGL Best Practices**  
   https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices  
   Applied: draw calls are batched, VAOs are stable, buffers and entity counts are bounded, device pixel ratio is capped, the back buffer is resolution-limited, and synchronous GPU queries are not performed per frame. Picking reads one pixel only on deliberate activation.

3. **WebGL2 Fundamentals, Picking**  
   https://webgl2fundamentals.org/webgl/lessons/webgl-picking.html  
   Applied: selectable entities are rendered to a dedicated offscreen RGBA8 framebuffer using encoded object IDs and depth testing. A click reads one pixel and resolves it to the same authoritative entity shown in the semantic inventory. ID zero means no selection.

4. **MDN, `webglcontextlost` event**  
   https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextlost_event  
   Applied: context loss is prevented from completing its default behavior, animation stops, a text notice is exposed, and restoration recreates shaders, VAOs, buffers, picking attachments, and the bounded scene from CPU-side snapshot data. The semantic dashboard remains usable if WebGL2 is absent or permanently unavailable.

5. **NVIDIA GPU Gems, Chapter 39: Volume Rendering Techniques**  
   https://developer.nvidia.com/gpugems/gpugems/part-vi-beyond-triangles/chapter-39-volume-rendering-techniques  
   Applied: voxel classification is treated as a transfer function: workpieces, toolheads, inspection gates, feedstock, and quarantine regions have stable material/color classes. Empty space is not represented by geometry. Instanced surface voxels were chosen over full volume ray integration to keep rasterization and memory bounded on mobile and 4K displays.

6. **W3C WAI, WCAG 2.2 Understanding 1.1.1 Non-text Content**  
   https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html  
   Applied: the canvas has a concise purpose description and a continuously updated semantic inventory provides the same entities, state, selection, and details. Visual selection is never the only route to telemetry or resources.

7. **W3C WAI, WCAG 2.2 Understanding 2.2.2 Pause, Stop, Hide**  
   https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html  
   Applied: one control freezes all cell movement/particles, another invokes the client's buffered stream pause, and reduced-motion starts with motion frozen. Resuming live data jumps through the client's reconciliation refresh rather than pretending old state is current.

8. **CISA/NSA, AA20-205A: Immediate Actions for Operational Technology and Control Systems**  
   https://www.cisa.gov/news-events/cybersecurity-advisories/aa20-205a  
   Applied: requested control intent is presented separately from observed process state; selected assets and historical audit remain visible; recovery commands require review; and no fabricated local toggle is represented as machine authority. This responds directly to the source's warnings about partial loss of view and control acting contrary to safe operation.

9. **NIST SP 800-61 Rev. 2, Computer Security Incident Handling Guide**  
   https://csrc.nist.gov/pubs/sp/800/61/r2/final  
   Applied: blocker handling separates current detection/context from historical audit, advice request from approval/denial, and command request from completion. Recovery actions preserve an operator-visible lifecycle and do not erase prior evidence.

## Architecture and Safety Choices

- **Instanced voxel cell:** one indexed cube mesh and one instanced draw for a maximum of 384 solid objects. Workpieces are assembled voxel shells; agents are elevated toolhead clusters; gates are gantry uprights/crossbeams; queue items are feedstock pallets; blockers are translucent-looking red quarantine cages represented by solid sparse voxels.
- **Particles without transform feedback:** up to 160 event sparks/chips are deterministic CPU-seeded points uploaded to one dynamic buffer and drawn in one point pass. They represent only received events and stop under motion freeze.
- **GPU picking:** performed only on click/tap, not hover, to avoid continuous `readPixels` stalls. Keyboard users use the equivalent listbox and arrow/Enter interaction.
- **Bounded rendering:** DPR is capped at 1.75 and the internal buffer at 2560 x 1440; entity and particle caps are fixed; rendering sleeps when the page is hidden and renders at 12 FPS while static, 30 FPS while moving.
- **Freshness:** the display reports age from the latest stream message or refresh and labels data stale after 15 seconds. Connection transport reports SSE, polling fallback, paused, degraded, or disconnected exactly from the client snapshot.
- **Authority:** run detail, resources, agent detail, events, queue, gates, iterations, lineage fields, audit, plans, and control values are rendered from snapshots. Visual coordinates are deterministic layout metadata only and are not described as operational measurements.
- **Commands:** all exported `OPERATION_COMMANDS` are available in the advanced command index. JSON must parse to an object. Every command is reviewed in a confirmation dialog and recorded as pending, accepted intent, rejected, or outcome unknown. An accepted receipt is never presented as observed completion. Tailored forms exist for lifecycle, recovery, steering/objective, showcase, queue, gates, and lineage actions.
- **Planning:** create/update/review/approve/reject/launch/clone/fork/archive are wired through project-plan client methods with expected versions. Assistance supports classic/managed thread creation, list/detail retrieval, versioned messages, and proposal application into an editable draft.
- **No unsupported controls:** camera reset, data freeze, animation freeze, resource selection, and workstation navigation are explicitly display controls. Operational controls only call methods exposed by `headless-dashboard-client.js`; there are no fake speed, temperature, robot jog, or local process-state controls.
