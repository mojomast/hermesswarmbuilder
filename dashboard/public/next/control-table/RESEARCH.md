# Control Table Research

Research conducted 2026-08-21 before implementation.

## Sources

1. [WAI-ARIA Authoring Practices: Grid Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/)
   - Interactive tabular data should use the grid pattern rather than a static table pattern.
   - A grid is one composite tab stop with managed focus. Arrow keys move one cell, Home/End move within a row, Ctrl+Home/End move to corners, and Page Up/Down move by a page.
   - Every data cell is focusable (or contains the single focused widget). Enter/F2 enters a cell's widget or editor; Escape restores grid navigation.
2. [WAI-ARIA Authoring Practices: Table Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/table/)
   - Static tables do not provide grid keyboard behavior. Native HTML table elements are preferred where possible, even when enhanced with `role="grid"` for interaction.
   - Sort state belongs on the relevant header with `aria-sort`; selected records use `aria-selected`.
3. [W3C WAI Tables Tutorial](https://www.w3.org/WAI/tutorials/tables/)
   - Use real `th` and `td` elements, column and row scopes, and a caption so assistive technology can preserve the relationship between dense cells and headers.
4. [Microsoft: Keyboard shortcuts in Excel](https://support.microsoft.com/en-us/office/keyboard-shortcuts-in-excel-1798d9d5-842a-42b8-9c99-9b7213f0040f)
   - Spreadsheet expectations include arrows for adjacent cells, Home/End and Ctrl+Home/End for boundaries, Page Up/Down for viewport movement, Ctrl+Page Up/Down for workbook sheets, F2 for editing, and Shift+Space for a row.
5. [MDN: CSS `position`](https://developer.mozilla.org/en-US/docs/Web/CSS/position)
   - Sticky elements attach to their nearest scrolling ancestor and require an inset. Sticky content creates a stacking context and can cause repaint/accessibility costs.
6. [WCAG 2.2: Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html)
   - Every keyboard-operable control needs a persistent visible focus indicator. Focus outlines also need non-text contrast.
7. [WCAG 2.2: Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)
   - Data grids may require two-dimensional scrolling, but that exception should be isolated to the table viewport. Adjacent tools must reflow, and sticky controls should be unfixed at narrow/zoomed widths if they can obscure focus.
8. [Google SRE: Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)
   - Operational dashboards should expose actionable, urgent signals with low noise. Pages/alerts should be simple, comprehensible, and tied to action; historical logs support diagnosis.

## Decisions

- **Authentic table, not cards:** each workbook dataset renders as one native HTML `table` enhanced with `role="grid"`. Records remain rows and fields remain columns at every viewport.
- **Spreadsheet orientation:** a name box and formula/status bar identify the selected cell and summarize the complete selected record. Workbook tabs switch datasets. The audit tab is a chronological sheet, not a detached feed panel.
- **Managed grid focus:** exactly one body cell is in the tab order. Arrow, Home, End, Page, Ctrl+Home/End, Shift+Space, Enter, F2, and Ctrl+Page Up/Down follow the researched grid/spreadsheet conventions. Interactive cell buttons are entered with Enter/F2 and escaped back to the cell.
- **Frozen context:** column headers and the first identity column stay visible inside the table's own scrolling viewport. The urgent blocker row is frozen above the grid, high contrast, concise, and directly opens deblock actions. It appears only for a real block/hold/pause/stop condition.
- **Density without ambiguity:** thin rules, tabular numerals, restrained status color, explicit status text, row numbers, sticky labels, and no decorative panels in the data region.
- **Control-room signal hierarchy:** connection and workflow remain quiet persistent context. Errors and blockers receive the strongest treatment. Audit history and detailed raw payloads remain available on demand rather than competing with current action.
- **Editing model:** queue/gate/plan creation and all mutations occur as inserted editor rows or a right side sheet. There are no floating card forms. Safety-bound plan review/approve/launch operations use persisted revision, digest, and expected version.
- **Responsive workbook:** at 4K the table grows to use the canvas; at 1080p it remains dense; on mobile the grid retains horizontal scrolling because row/column relationships are essential. The identity column is unfrozen on narrow screens, tools wrap, and the inspector becomes a full-width sheet so focused content is not obscured.
- **Safe rendering:** all API-derived values are assigned with `textContent` or passed through the local HTML escaper. Raw records are rendered only as escaped text in `pre` elements. No API value is treated as markup or used as executable content.
- **Live behavior:** the shared headless client owns SSE, polling fallback, pause/resume, refresh, resource loading, immutable snapshots, and error records. The sheet renderer follows those snapshots without bypassing the client.
