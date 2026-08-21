# Constellation Research

Research captured 2026-08-21. The implementation has no remote runtime dependencies.

## Sources

1. Ben Shneiderman, "The Eyes Have It: A Task by Data Type Taxonomy for Information Visualizations" (1996): https://www.cs.umd.edu/users/ben/papers/Shneiderman1996eyes.pdf
   - The visual information seeking mantra is "overview first, zoom and filter, then details-on-demand."
   - Applied: Constellation starts with a complete, stable overview and opens object detail on selection. Because this operational graph is bounded, filtering is offered in the semantic navigator but zoom is deliberately omitted to preserve orientation.

2. W3C WAI, Complex Images Tutorial: https://www.w3.org/WAI/tutorials/images/complex/
   - Complex diagrams need both a short identification and a long description that preserves essential structure. Structured information should remain structured rather than being flattened into one `aria-describedby` paragraph.
   - Applied: the SVG has a title and concise description; adjacent HTML tables provide the full object and relationship equivalent with captions, headers, status, and inspection controls.

3. W3C, WAI-ARIA Graphics Module 1.0: https://www.w3.org/TR/graphics-aria-1.0/
   - Structured diagrams can expose a `graphics-document` and meaningful `graphics-object` components, while decorative geometry should remain presentational.
   - Applied: the SVG is a named `graphics-document document`; selectable bodies are named graphical objects/buttons, while grid, orbit, and decorative geometry are excluded. HTML remains the compatibility-first interaction equivalent.

4. W3C WCAG 2.2, Understanding SC 1.4.1 Use of Color: https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html
   - Color must not be the only visual means of conveying information; use shape, text, pattern, or other redundant cues.
   - Applied: object kinds use shape plus direct labels and color. Blockers use a double/dashed anomaly halo and status text. Event and tool paths use different dash patterns. The semantic tables state every type and status in text.

5. Masataka Okabe and Kei Ito, Color Universal Design: https://jfly.uni-koeln.de/color/
   - Use redundant coding, direct labels, thicker marks, differences in shape and line style, and colors selected for broad distinguishability. Avoid requiring users to compare a remote color key.
   - Applied: bodies are directly labelled; circles, squares, diamonds, hexagons, and capsules encode categories; tool/event links differ by dash pattern; the palette uses blue, sky blue, orange, amber, bluish green, violet, and high-lightness text on a dark field.

6. W3C WAI-ARIA Authoring Practices, Grid Pattern: https://www.w3.org/WAI/ARIA/apg/patterns/grid/
   - A composite grid uses one tab stop, arrow-key movement, Home/End, and managed focus. It can efficiently group many navigation controls.
   - Applied: the node index implements roving `tabindex`, Left/Right/Up/Down navigation with wrapping, Home/End, and Enter/Space selection. Each item has a textual name, type, and status.

7. W3C WCAG 2.2, Understanding SC 2.4.7 Focus Visible: https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html
   - Every keyboard-operable item needs a persistent visible focus indicator; focus styling is also subject to non-text contrast.
   - Applied: all native and SVG controls receive a high-contrast, offset focus treatment; selected map objects receive a separate solid halo.

8. W3C WCAG 2.2, Understanding SC 1.4.10 Reflow: https://www.w3.org/WAI/WCAG22/Understanding/reflow.html
   - Two-dimensional diagrams may retain their spatial layout, but surrounding content should reflow and equivalent functionality must remain available. Small-screen layouts should avoid fixed regions that obscure focus.
   - Applied: the SVG scales as a single two-dimensional figure; at mobile widths the inspector moves below it, controls stack, sticky positioning is removed, tables are isolated in their own scroll containers, and all diagram functionality remains in reflowing HTML.

## Interaction Principles

- **Stable geography over simulation.** The orchestrator remains centered, agents occupy deterministic role orbits, recent runs form a left-side system belt, and queue/gate/plan clusters occupy fixed satellite zones. Data refreshes do not rearrange the whole sky.
- **Overview without zoom.** The complete active system fits the viewport at 1080p and 4K. Density is bounded in the SVG, while the complete data set stays available in navigation lists and semantic tables.
- **Spatial selection, semantic detail.** Pointer or keyboard selection in the SVG, node index, lists, or tables all resolves to the same object inspector.
- **Relationships are secondary marks.** Event and tool paths explain activity without becoming the only navigation mechanism. Detailed relationship records remain rows with source, run, time, kind, and description.
- **Motion is exceptional.** Only blocker anomaly halos pulse. `prefers-reduced-motion` replaces the pulse with a static heavy dashed halo.
- **No color-only state.** Shape, labels, border/dash language, status notches, and textual tables duplicate color signals.
- **Safe insertion.** API values are inserted with DOM `textContent`, form properties, or SVG DOM methods. Dynamic API data is never concatenated into `innerHTML`; URL segments are handled by the imported client.

## Composition Targets

- **3840 x 2160:** wider inspector, larger gutters, and a bounded map height keep the network and controls readable rather than merely scaling everything up.
- **1920 x 1080:** map and dock fit side-by-side; the SVG uses its fixed viewBox to preserve orbital proportions.
- **Mobile / reflow:** the network becomes a compact overview followed by the keyboard index, semantic equivalent, and then the full dock. No functionality is discarded.
