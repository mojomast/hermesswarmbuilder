# Command Cavern Research

All sources below were retrieved on August 21, 2026. The implementation is confined to `dashboard/public/next/command-cavern/`, uses no CDN or remote runtime assets, and loads only the local shared dashboard client and directory modules.

1. **Khronos Group, WebGL 2.0 Specification**
   https://registry.khronos.org/webgl/specs/latest/2.0/
   Applied: the renderer explicitly requests WebGL2, uses GLSL ES 3.00, one fullscreen triangle, bounded texture allocation, and reconstructable context-owned resources.

2. **MDN, WebGL Best Practices**
   https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices
   Applied: one batched draw, no per-frame readback, an 800,000-pixel backbuffer budget, low bounded ray-step counts, in-place texture updates, visibility sleep, and deletion of replaced resources.

3. **Inigo Quilez, 3D Signed Distance Functions**
   https://iquilezles.org/articles/distfunctions/
   Applied: exact sphere, box, capsule, torus, and octahedral bounds construct the cavern, cores, drones, seed crystals, pressure locks, tablets, and resonant monoliths. Conservative stepping is used around displaced rock.

4. **WebGL2 Fundamentals, Picking**
   https://webgl2fundamentals.org/webgl/lessons/webgl-picking.html
   Applied: pointer coordinates construct the same camera ray used by the fragment shader. The ray must intersect the physical tablet front plane, then the world hit is transformed through tablet-local coordinates into texture UV before bounded engraving hit testing. No fullscreen or direct screen-region shortcut is used.

5. **MDN, `webglcontextlost` Event**
   https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextlost_event
   Applied: default loss is prevented, rendering stops, the complete semantic application becomes visible, and restoration recompiles shaders, recreates textures, and validates linking. The Return control also retries initialization in a conservative performance tier after ordinary compiler or allocation failure.

6. **MDN, `prefers-reduced-motion`**
   https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
   Applied: decorative motion is disabled by default and remains off under reduced motion. Operators may opt in with `F`; operational freshness and data-driven redraws remain live without continuous rendering.

7. **W3C WAI, WCAG 2.2 Understanding 1.1.1 Non-text Content**
   https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html
   Applied: a synchronized semantic application exposes equivalent names, values, lists, editors, resources, commands, receipts, and help. Graphics failure automatically selects it.

8. **W3C WAI-ARIA Authoring Practices, Dialog Modal Pattern**
   https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
   Applied: consequential review is modeled as an explicit confirm/cancel state with focus retained in the active canvas or semantic form. The scene never claims a modal semantic role while its custom interface is active.

9. **NIST SP 800-61 Rev. 3, Incident Response Recommendations and Considerations**
   https://csrc.nist.gov/pubs/sp/800/61/r3/final
   Applied: current evidence, current-run recovery, immutable historical lineage, command receipts, and audit records remain distinct. Advice is inert until separately approved.

10. **WHATWG HTML Living Standard, Page Visibility**
    https://html.spec.whatwg.org/multipage/interaction.html#page-visibility
    Applied: animation and ray marching stop while hidden, timestamps remain authoritative, and rendering resumes with a fresh frame instead of integrating hidden elapsed time.

## Technical Decisions

- The cavern is ray marched in the fragment shader from signed distance functions. No mesh library, framework, image, font file, or remote asset is used.
- UI glyphs are generated locally into a bounded 1600 x 900 inscription, then allocated within the queried `MAX_TEXTURE_SIZE`. Portrait stacks its two logical halves into a 900 x 1600 texture and uses the inverse mapping for picking. Subsequent updates use `texSubImage2D` rather than reallocating the texture. The texture is sampled only when the ray marcher hits the front face of the lit SDF tectonic tablet.
- Runs are stratified core columns; agents are orbiting bioluminescent survey drones; events and tool calls are mineral inclusions; queue items are seed crystals; gates are pressure locks; iterations are branching excavations; plans are engraved tablets; operation commands are resonant monoliths. Bounded shader loops receive live counts, while blocker, unhealthy agent/error, pinned queue, and failed gate aggregates alter the corresponding materials.
- Picking performs an analytic camera-ray/tablet-plane intersection that exactly matches shader camera and tablet dimensions, rejects misses, converts the world hit to tablet UV, applies the active landscape or stacked-portrait inverse transform, and only then resolves an engraving. All decorative entity geometry is behind the tablet front plane.
- Quality starts conservatively at 24-28 ray steps with an 800,000-pixel backbuffer budget. Slow submissions can only reduce quality; they never increase it automatically. The backing-store uses one uniform scale so its aspect ratio remains identical to the CSS viewport. Optional motion is capped at ten frames per second.
- Every operation and project-plan action is derived from the imported arrays and checked for exact parity at startup. Generic scene and semantic JSON editors prevent UI drift when payload schemas evolve.
- Recovery refreshes state/control and verifies the current blocked run before executable recovery or approval; denying pending advice depends only on the refreshed advice record. Lineage is completed before review, frozen with exact gate snapshots and limits, then reloaded and fingerprint-compared before dispatch.
- Resource requests always pass the selected run ID. Plan lifecycle requests carry exact revision, digest, and ledger `expectedVersion`. Clone/fork add source lineage. Assistance proposals remain inert until explicitly converted to a persisted draft.
- Receipts distinguish validating, sending, accepted intent, rejected, and outcome unknown. Requested control projections are stored separately, authoritative process state is displayed separately, and operator-command or audit acceptance is never interpreted as observation.
