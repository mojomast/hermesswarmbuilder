# Swarm Sequencer Research

Research performed before implementation on 2026-08-21. The interface borrows interaction structure, not musical ornament.

## Sources

- [Ableton Live 12: Arrangement View](https://www.ableton.com/en/live-manual/12/arrangement-view/) documents a linear arrangement with vertically stacked tracks, clips in main lanes, a beat-time ruler, locators, selection-driven editing, automation lanes, fit width/height, follow mode, and keyboard transport/zoom.
- [Logic Pro: Scroll and zoom in the Tracks area](https://support.apple.com/guide/logicpro/scroll-and-zoom-in-the-tracks-area-lgcpf7c0b924/mac) documents separate horizontal and vertical zoom, zoom focus, track zoom, and navigation within a persistent tracks area.
- [Logic Pro User Guide](https://support.apple.com/guide/logicpro/welcome/mac) establishes the main-window division of control bar, tracks area, inspector, event list, marker list, and automation editing.
- [WAI-ARIA APG: Slider Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/slider/) specifies arrow, Home, End, optional Page Up/Down behavior and accessible value text. The implementation uses a native range input rather than recreating the pattern.
- [WCAG 2.2 Understanding 2.1.1 Keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html) requires pointer functionality to have keyboard equivalents and recommends platform-native controls.
- [WCAG 2.2 Understanding 1.1.1 Non-text Content](https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html) requires equivalent text for canvas information and names for graphical controls.
- [WCAG 2.2 Understanding 1.4.1 Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html) requires text, shape, or pattern in addition to hue.
- [WCAG 2.2 Understanding 1.4.10 Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) permits a two-dimensional editing canvas when necessary while requiring surrounding controls and text panels to reflow.

## Adopted Principles

1. The arrangement is primary: workflow phases are fixed measures across a horizontal ruler; agent lanes are vertically stacked and retain their headers while time scrolls.
2. Transport is persistent and literal: live pause/resume and refresh are real data controls, position is reported as measure/beat, and Space toggles live updates outside form fields.
3. Selection precedes detail: clips carry short, text-safe labels; complete payloads and commands live in one inspector, avoiding unreadable labels and scattered cards.
4. Zoom and density are independent. Horizontal measure zoom does not silently alter track height; density is a separate explicit setting; Fit restores full-arrangement context.
5. Gates occupy a marker lane above tracks. Steering occupies an automation lane below tracks. These preserve distinct operational meaning rather than masquerading as audio.
6. Follow behavior is conservative. Live updates do not steal focus or force horizontal scrolling after the operator navigates.
7. Canvas is enhancement, not the only interface. A semantic event/tool list exposes the same selectable clips; all mutations use native buttons, forms, selects, and inputs.
8. Keyboard timeline navigation uses arrows, Home/End, Enter, plus/minus, and Space. Visible help and focus are provided; shortcuts do not fire while typing.
9. State is never color-only. Clip labels include type/status, selected items gain a high-contrast double outline, markers carry text, and statuses remain visible in the inspector/list.
10. The two-dimensional timeline scrolls within its own region. On mobile and at high zoom, transport and inspector reflow into one-column reading surfaces without removing functionality.
11. Motion is nonessential and disabled under `prefers-reduced-motion`; the playhead does not animate artificially.
12. No audio is produced and no faux knobs, waveforms, meters, instruments, or decorative notation are used. DAW structure serves operational clarity only.
