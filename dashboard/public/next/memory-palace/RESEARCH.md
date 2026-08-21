# Memory Palace Research and Applied Decisions

Retrieved August 21, 2026. The implementation is isolated to `dashboard/public/next/memory-palace/`. It loads only the repository-local `../../headless-dashboard-client.js` and `../../dashboard-directory.js`; it has no CDN, font, image, framework, or runtime asset dependency.

1. **Khronos Group, WebGL 2.0 Specification**  
   https://registry.khronos.org/webgl/specs/latest/2.0/  
   Applied: one indexed cuboid mesh is expanded with `drawElementsInstanced` into the cutaway archive, bays, desks, rails, and the folio backing. Workstation controls are rasterized locally into a texture mapped onto a 16-by-9 world-space plane using the same perspective matrix and depth buffer as the palace.

2. **MDN, WebGL best practices**  
   https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices  
   Applied: geometry is batched, counts are bounded, DPR is adapted to device capacity, backing dimensions are capped against reported texture, renderbuffer, and viewport limits, and rendering is invalidation-driven while visible.

3. **WebGL2 Fundamentals, 3D camera and perspective**  
   https://webgl2fundamentals.org/webgl/lessons/webgl-3d-camera.html  
   Applied: the archive and physical control folio use one perspective projection and look-at orbit camera. Pointer rays are reconstructed from that camera, intersected with the folio plane, bounded in world space, and then converted to folio texture coordinates for control hit testing.

4. **MDN, `webglcontextlost` event**  
   https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextlost_event  
   Applied: loss is intercepted, rendering stops, and the complete semantic surface is exposed. WebGL absence, shader compilation failure, program link failure, and context loss all reach the same fallback. Restoration rebuilds GPU resources.

5. **Frances Yates, The Art of Memory, University of Chicago Press**  
   https://press.uchicago.edu/ucp/books/book/chicago/A/bo3683886.html  
   Applied: stable spatial loci organize categories. Runs, agents, evidence, plans, and controls have consistent architectural bays rather than an arbitrary particle cloud.

6. **W3C WAI, WCAG 2.2 Understanding 1.1.1 Non-text Content**  
   https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html  
   Applied: the canvas has a purpose description and a continuously updated semantic equivalent with the same evidence, selection, commands, and outcomes.

7. **W3C WAI, WCAG 2.2 Understanding 2.1.1 Keyboard**  
   https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html  
   Applied: arrows traverse scene controls, Enter activates, WASD orbits, plus/minus zooms, and M switches modes. Tab is deliberately not consumed, so keyboard focus can leave the canvas. Semantic mode uses native controls.

8. **W3C WAI, WCAG 2.2 Understanding 2.2.2 Pause, Stop, Hide**  
   https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html  
   Applied: there is no autonomous camera or decorative motion. Runtime preference changes invalidate and rebuild the presentation policy without being confused with workflow pause.

9. **NIST SP 800-61 Rev. 3, Incident Response Recommendations and Considerations for Cybersecurity Risk Management**  
   https://csrc.nist.gov/pubs/sp/800/61/r3/final  
   Applied: current blocker evidence, recovery advice, approval, command receipt, audit, and observed state remain separate records. Historical runs are recovered only through exact loaded lineage evidence.

10. **CISA/NSA AA20-205A, Immediate Actions for Operational Technology and Control Systems**  
    https://www.cisa.gov/news-events/cybersecurity-advisories/aa20-205a  
    Applied: requested intent is separated from observed state; explicit identities and confirmations are retained; loss of the visual plane falls back to an independent semantic control/evidence plane.

## Technical and Safety Decisions

- Normal mode contains no visible DOM application chrome. Architecture, labels, status, selectors, focus, help, and workstation controls are WebGL scene output in the full-window canvas. The repository dashboard directory is loaded but hidden until semantic mode.
- A local 2D canvas creates folio pixels only as a GPU texture source; it is never attached to the DOM. The visible presentation is a perspective/depth-tested WebGL2 world plane, not a fullscreen compositing quad.
- Scene workstations use bounded texture hit regions generated with the folio pass. Pointer rays map through the physical plane before using those regions. Arrow/Enter navigation uses the identical control list; Tab exits the canvas.
- Every exported operation and project-plan action is checked for parity at startup and represented both by a scene locus and a semantic native control.
- Operation payload builders cover lifecycle, steering, current-run recovery, queue, gates, bounded iterations, and showcase controls. Protected fields cannot be replaced by additional JSON. New gate IDs resolve from current definitions; historical gate snapshots come only from the exact loaded source detail.
- Confirmations deep-freeze the exact type and payload. Dispatch uses that object without normalization or reconstruction. Separate freshness guards reject stale lineage, gate definitions, recovery ownership, and retained artifact choices.
- Direct recovery refreshes state and control immediately before dispatch. Deblock, advice requests, and advice approval reject missing blockers, stale advice, historical runs, and ownership changes. Denial validates the advice identity but does not require a still-active blocker.
- Run artifacts, logs, SPEC, and DEVPLAN always call the client with an explicit selected run ID. Evidence attachment references existing paths; it never implies evidence creation.
- Plan lifecycle payloads use the loaded ledger's exact current revision, digest, and version. Clone/fork also require exact matching loaded iteration detail. Plans emit only the seven supported limit fields. A mismatch blocks dispatch, rejection requires operator-edited notes, and assistance proposals become editable JSON without implicit persistence.
- Command records use independent request identities and `pending`, `accepted intent`, `rejected`, and `outcome unknown`. No receipt is called an observed outcome.
- DPR adapts to viewport, hardware concurrency, and reported device memory, is capped at 1.6, and the backing buffer is bounded by WebGL device limits plus a conservative mobile/desktop ceiling. Visibility, runtime reduced motion, resize, context loss, and restoration are handled explicitly.
