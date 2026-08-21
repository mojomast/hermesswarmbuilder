# Jacquard Swarmworks Research

Research was checked in August 2026. The implementation has no CDN, remote font, image, analytics, or runtime package dependency. It imports only `../../vendor/three.js`, `../../headless-dashboard-client.js`, and `../../dashboard-directory.js`; network traffic is the same-origin Hermes API used by the shared client.

## Sources And Applied Decisions

1. **Victoria and Albert Museum, The Jacquard Loom**  
   https://www.vam.ac.uk/articles/the-jacquard-loom  
   Applied: punched cards are modeled as command carriers and the pattern drum as persisted planning, rather than decorating a generic dashboard with textile colors.

2. **Science Museum Group Collection, Jacquard loom**  
   https://collection.sciencemuseumgroup.org.uk/objects/co62245/jacquard-loom-loom  
   Applied: the scene uses a mechanical frame, card chain, heddle field, shuttle race, cloth take-up, and inspection comb as distinct working zones.

3. **The Metropolitan Museum of Art, The Invention of the Jacquard Loom**  
   https://www.metmuseum.org/perspectives/jacquard-loom  
   Applied: iteration lineage appears as successive woven cloth rows whose pattern is inherited from prior rows.

4. **Three.js documentation, InstancedMesh**  
   https://threejs.org/docs/#api/en/objects/InstancedMesh  
   Applied: warp threads, heddles, card holes, queue spool flanges, cloth cells, and event pins use bounded instancing instead of one draw call per repeated part.

5. **Three.js manual, Picking**  
   https://threejs.org/manual/en/picking.html  
   Applied: telemetry objects and a complete camera-relative mechanical key bank use explicit raycast registries. Operator controls are tested before the console click shield, and run-cloth instance IDs resolve to their exact run row, so every visible control and rendered live entity remains actionable.

6. **MDN, WebGL best practices**  
   https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices  
   Applied: entity caps are fixed, render resolution and DPR are capped and adaptive, shadows are omitted, textures are bounded, and rendering sleeps while hidden.

7. **MDN, HTMLCanvasElement webglcontextlost event**  
   https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextlost_event  
   Applied: context loss stops animation and immediately exposes the synchronized semantic application. Restoration rebuilds the renderer, materials, textures, instanced geometry, and selection.

8. **Three.js documentation, Object3D and MeshBasicMaterial**
   https://threejs.org/docs/#api/en/core/Object3D
   https://threejs.org/docs/#api/en/materials/MeshBasicMaterial
   Applied: the compact-by-default operator readout and its navigation, action, access, camera, detail, and minimize latches are Three.js meshes parented to the perspective camera and fitted from the current FOV/aspect on every render. Fixed-aspect 44px-high keys form a mechanical lever bank rather than stretched cards. Exact reviews temporarily receive detail sizing; the labelled readout latch remains available when the panel is physically hidden. Unlit materials render last through orbit, resize, portrait layout, reduced motion, and context restoration.

9. **W3C WAI, WCAG 2.2, Non-text Content (1.1.1)**
   https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html  
   Applied: a synchronized semantic application includes the same status, entities, selection, resources, controls, planning, help, and receipts. It is hidden and inert only while the 3D application is authoritative.

10. **W3C WAI-ARIA Authoring Practices, Keyboard Interface**
   https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/  
   Applied: there is always one canvas focus target; arrow keys move spatial selection, Enter activates, Escape backs out, `?` opens help, and `A` switches to ordinary semantic controls.

11. **W3C, Page Visibility Level 2**
    https://www.w3.org/TR/page-visibility-2/  
    Applied: animation and texture churn stop while hidden; returning forces size reconciliation and a fresh frame without claiming data freshness.

12. **MDN, prefers-reduced-motion**
    https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion  
    Applied: shuttles, heddles, drums, and card chains stop automatically; essential selection and status changes remain immediate.

13. **NIST SP 800-53 Rev. 5, AU and AC control families**
    https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final  
    Applied: command intent, receipts, rejected requests, uncertain transport outcomes, audit history, exact resource ownership, and observed telemetry are presented separately.

## Safety And Performance

- Operation and plan requests are reviewed before dispatch. A successful POST is labeled `accepted intent`, never completion. Network ambiguity is `outcome unknown`; server refusal is `rejected`; only subsequent telemetry is `observed`.
- Direct deblock and advice are refreshed and revalidated against the current run and its active blocker immediately before dispatch. Historical failures offer lineage, not direct recovery.
- Resource reads carry an explicit owning run ID. Selection changes invalidate old resource display; no artifact, log, SPEC, or DEVPLAN is borrowed from another run.
- Iteration requests include an absolute repository path, base ref, source identity, objective, bounded change, copied gate definitions, evidence policy, and canonical limits. Historical lineage requires an exact retained source iteration and matching run.
- Plan lifecycle requests use the loaded ledger version plus exact current revision and digest. A mismatch between ledger and loaded revision blocks dispatch.
- Scene caps: 24 runs, 24 agents, 20 queue items, 20 gates, 30 iterations, 24 plans, 160 event/tool marks, 512 cloth cells, and 192 warp/heddle instances. The operator texture is 1280 by 900. Eight world labels use one persistent 2048 by 1024 atlas, one material, and one indexed quad mesh; snapshot or selected-label changes redraw that atlas without allocating textures, while console keystrokes update only the console texture.
- World labels identify literal function plus loom metaphor and rendered/total inventory for cloth runs, shuttle agents, queue spools, inspection gates, pattern-drum plans, workflow heddles, and punched-card commands. Status colors distinguish failed/blocked, active/ready, and pending/draft entities. The selected label is placed first, reports the actual record label, type, status, and bounded ID, and follows an exact entity mesh or pickable cloth-row anchor. Labels reserve the readout and every key rectangle and collapse lower-priority labels first when no collision-free placement exists.
- DPR begins at 1.5 maximum, falls when rolling frame cost exceeds budget, and is also bounded by a 4K internal back buffer. Mobile uses a tighter DPR and farther camera; reduced motion renders only on changes.
