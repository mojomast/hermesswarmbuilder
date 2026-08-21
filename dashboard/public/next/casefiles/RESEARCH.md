# Casefiles Interface Research

Research completed 2026-08-21 before implementation. Casefiles translates swarm operations into a structured case-management record; it does not reproduce the visual language or page hierarchy of the existing Broadsheet/Briefing Room.

## Sources

1. [NISTIR 8387, Digital Evidence Preservation: Considerations for Evidence Handlers](https://doi.org/10.6028/NIST.IR.8387), National Institute of Standards and Technology, 2022.
   - Digital evidence has preservation concerns beyond physical evidence and can include storage media, digital objects, and system-generated material.
   - Concrete UI decision: artifacts and logs appear as exhibits with stable file names, run identity, size, modified time, and source context. The preview is visually separate from metadata so content is not mistaken for provenance.
2. [NIJ, Electronic Crime Scene Investigation: A Guide for First Responders, Second Edition](https://nij.ojp.gov/library/publications/electronic-crime-scene-investigation-guide-first-responders-second-edition), National Institute of Justice, 2008.
   - Collection and handling should be documented, and digital evidence must be protected from alteration.
   - Concrete UI decision: exhibit ribbons show source run and custody state; gate findings link to named evidence rather than presenting an unexplained pass/fail badge.
3. [U.S. Department of Justice, Justice Manual 9-13.000: Obtaining Evidence](https://www.justice.gov/jm/jm-9-13000-obtaining-evidence), including evidence handling and legal-process context.
   - Evidence acquisition, authorization, and accountability are distinct but connected records.
   - Concrete UI decision: plans are called warrants/authorizations and retain separate draft, review, approval, launch, and archive controls. Actions never masquerade as evidence.
4. [NARA, Records Management](https://www.archives.gov/records-mgmt), U.S. National Archives and Records Administration.
   - Records require organization, identification, retention context, and reliable retrieval throughout a lifecycle.
   - Concrete UI decision: each run is a stable folder in a cabinet; a persistent file number, lifecycle stamp, chronological notes, and separate folder tabs make retrieval predictable.
5. [W3C WAI-ARIA APG: Tabs Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/).
   - Tabs need `tablist`, `tab`, and `tabpanel` semantics, one tab stop, arrow-key movement, Home/End, and synchronized `aria-selected`/`tabindex` state.
   - Concrete UI decision: folder tabs use automatic activation because panels are locally rendered. Left/Right, Home, and End work without interfering with vertical page scrolling.
6. [W3C WAI-ARIA APG: Dialog (Modal) Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).
   - Modal content must contain focus, close on Escape, move initial focus inside, make the background inert, and return focus to its invoker.
   - Concrete UI decision: authorization planning and raw-record inspection use native `dialog`, explicit close controls, focus restoration, and a lightweight focus trap fallback.
7. [WCAG 2.2 Understanding SC 2.4.3: Focus Order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html).
   - Focus sequence must preserve meaning and operation; DOM order should reinforce reading order.
   - Concrete UI decision: the mobile layout keeps brief, controls, tabs, and record content in DOM order. Desktop columns are CSS layout only, with no positive `tabindex` values.
8. [W3C WAI-ARIA APG: Grid Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/).
   - Interactive grids impose managed focus and arrow-key behavior; ordinary tables are preferable when cells do not need spreadsheet interaction.
   - Concrete UI decision: Casefiles avoids an unnecessary ARIA grid. Cabinet folders are a single-selection list, chronological notes are an ordered list, and tabular metadata uses native tables.
9. [Axon Evidence](https://www.axon.com/products/axon-evidence), vendor product overview.
   - The system groups collection, review, disclosure, search, audit history, and role-aware handling around a case from initial call through closure. Its product description treats each file action as part of an audit trail and distinguishes file integrity from user access.
   - Concrete UI decision: search spans the operational record, exhibits remain connected to their containing case, and the interface labels retrieval/custody facts separately. Casefiles deliberately does not claim a fingerprint, immutable file, permission state, or full audit history when Hermes does not report one.
10. [Thomson Reuters Case Center](https://legal.thomsonreuters.com/en/products/case-center), vendor product overview.
   - Case preparation centers on an indexed, searchable case file with documents, media, notes, exhibit marking, controlled sharing, and evidence presentation in one browser context.
   - Concrete UI decision: the case folder is the durable master context; exhibits use an index plus an in-context preview, while notes, findings, and authorizations remain separate record classes instead of becoming undifferentiated dashboard tiles.

## Product Takeaways

- Provenance is a relationship, not decoration: every loaded exhibit identifies its case/run, file, observed metadata, and retrieval time. The UI does not claim cryptographic verification the API does not supply.
- Chain of custody must not be fabricated. “System record” and “retrieved” stamps describe observable dashboard facts; unknown handlers, hashes, or transfer history are explicitly shown as not reported.
- Master-detail navigation should preserve context. Selecting a folder updates the file without replacing the cabinet, while mobile turns the same DOM into a linear case reader.
- Chronology is the primary narrative. Journal entries use semantic `<ol>` markup, exact timestamps, source, type, run, and expandable raw records.
- Findings connect decisions to evidence. Gate status, decision, notes, required evidence, and attached evidence remain visible together.
- Dense does not mean cramped. 4K uses wider cabinet columns and multi-column investigator/exhibit indexes; 1080p retains three distinct working zones; mobile uses 44px controls, sticky folder tabs, and no horizontal dependency.
- Records language is systematic: run = case folder, objective = brief, agent = investigator, event = journal entry, artifact/log = exhibit, gate = finding, queue = intake, plan = warrant/authorization.
- Visual cues support but never replace text: folder tabs, red document stamps, colored evidence ribbons, ruled paper, file labels, and monospaced identifiers create a records-office character without generic card tiles.
- Motion is nonessential. All transitions are removed under `prefers-reduced-motion`, and status updates use polite live regions.
