# The Swarm Gallery: research and applied insights

Research performed 2026-08-21. The interface uses no remote runtime, fonts, images, or framework.

## Sources

- [W3C WAI, Carousels Tutorial](https://www.w3.org/WAI/tutorials/carousels/): carousel content can be difficult to discover; motion needs pause controls; keyboard operation, sensible focus, and announcements are required.
- [W3C ARIA APG, Carousel Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/carousel/): automatic rotation can disorient assistive-technology users and must stop on focus/hover. Grouped picker controls also add excessive tab stops.
- [National Park Service, Wayside Exhibits: A Guide to Developing Outdoor Interpretive Exhibits](https://www.nps.gov/subjects/hfc/upload/Wayside-Guide-First-Edition.pdf): interpretive exhibits need a clear purpose, a visual hierarchy that works from a distance, concise layered content, accessible placement, and integration with the visitor's physical route.
- [Nielsen Norman Group, Information Scent](https://www.nngroup.com/articles/information-scent/): destination labels, nearby explanatory copy, context, and prior expectations determine whether people can predict where a route leads. Specific labels matter even more on small screens where context disappears.
- [Nielsen Norman Group, 10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/): “you are here” status supports orientation; visible actions reduce recall; system status, user control, error recovery, and focused minimalism remain essential.
- [Mark Weiser and John Seely Brown, Designing Calm Technology](https://calmtech.com/papers/designing-calm-technology.html): calm systems let information move between attention's periphery and center, increasing awareness without overload while preserving the person's control.
- [Mark Weiser and John Seely Brown, The Coming Age of Calm Technology](https://calmtech.com/papers/coming-age-calm-technology.html): peripheral information should offer rather than demand, and “locatedness” comes from understanding what happened, what is happening, and what may happen next.
- [Interaction Design Foundation, Calm Computing](https://www.interaction-design.org/literature/topics/calm-technology): practical calm-design guidance includes glanceable status, progressive disclosure, minimal interruption, graceful failure, restrained motion, and explicit user control.

## Applied insights

- **Physical wayfinding, not tabs as architecture:** six numbered rooms form a real document outline and scroll route. A persistent “You are here” marker, descriptive room names, native anchors, and `Alt+Arrow` shortcuts support both novice recognition and expert speed.
- **No carousel:** every agent room and telemetry event remains in a semantic ordered list. Nothing rotates, disappears on a timer, or requires sequential next/previous controls to discover.
- **Exhibition hierarchy:** the current objective is the sole monumental object. Its short title is readable at wall distance; status, run identity, phase, and timestamps become a nearby object label; deeper source material moves to archive drawers.
- **Layered labels:** room heading, one-sentence introduction, label metadata, then opt-in raw evidence. This follows the museum pattern of orientation, interpretation, and detail rather than presenting equal-weight panels.
- **Calm ambient telemetry:** connection state is a small persistent light, workflow is a quiet route line, and the chronological wall uses restrained markers. Only errors and blocked states gain the red attention color. No decorative live animation competes with work.
- **Center/periphery control:** the exhibition summarizes the system; selecting a room, event, tool, or drawer deliberately brings detail to the center. Closing the drawer returns focus to its invoker.
- **Separate authority:** Mission Control is a dark, staff-only curator room after the public sequence. Operational controls do not masquerade as exhibit objects, and potentially consequential actions remain plainly labeled.
- **Scale without delay:** CSS typography and whitespace create 4K drama without media downloads. The same semantic sequence reflows at 1080p and becomes a mobile guided route with bottom wayfinding.
- **Accessibility:** landmarks, ordered lists, native controls, visible focus, live status regions, focus restoration, dialog focus trapping, reduced-motion handling, and escaped API text are built in. Status never depends on color alone.
- **Graceful failure:** SSE can be paused/resumed/disconnected/reconnected through the headless client; its polling fallback remains available. Errors surface as text without replacing navigable content.
