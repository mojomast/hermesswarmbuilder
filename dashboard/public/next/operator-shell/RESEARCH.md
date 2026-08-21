# Operator Shell Research

Research was performed before implementation on 2026-08-21. The implementation is dependency-free and uses browser-native controls plus the local headless dashboard client.

## Sources and applied findings

### Command palettes and keyboard discoverability

- [Visual Studio Code: User interface / Command Palette](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette)
  - Finding: a single keyboard-reachable palette should expose all application functionality, include common shortcuts, search commands and resources, and offer help from the input itself.
  - Applied: `Ctrl/Cmd+Shift+P` opens one searchable registry containing every read, stream, operation, project-plan, planning-assistance, view, and preference command. The same registry generates pointer menus. `?`, `help`, visible key hints, command descriptions, aliases, client method names, and result counts support recognition over recall.
  - Applied: split buffers use `Ctrl/Cmd+1` and `Ctrl/Cmd+2`, while resource paths and a persistent status line preserve location and context.
- [GNU Bash manual: Readline Interaction](https://www.gnu.org/software/bash/manual/html_node/Readline-Interaction.html)
  - Finding: command-line editing should preserve browser/platform text editing, accept the whole line from any cursor position, and support command history/search rather than forcing re-entry.
  - Applied: the prompt is a native text input, Enter executes regardless of caret position, Up/Down traverse bounded persisted history, and Tab completes the selected suggestion. JavaScript does not override normal Left/Right/Home/End editing keys.
- [GNU Bash manual: Searching for Commands in the History](https://www.gnu.org/software/bash/manual/html_node/Searching.html)
  - Finding: previous commands are an important recovery and acceleration mechanism in repetitive operational work.
  - Applied: successful command lines are retained locally (bounded to 100) and available from the prompt with Up/Down. Palette results also rank prefix and token matches ahead of description-only matches.

### Accessible autocomplete and dialogs

- [WAI-ARIA Authoring Practices: Combobox Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)
  - Finding: editable autocomplete keeps DOM focus in the input, exposes a controlled listbox, tracks the active option with `aria-activedescendant`, supports Arrow keys, Enter, Escape, and browser-native editing.
  - Applied: both prompt suggestions and the command palette use combobox/listbox semantics, `aria-expanded`, `aria-controls`, active options, Arrow navigation, Enter acceptance, Escape dismissal, and Tab completion at the prompt.
- [WAI-ARIA Authoring Practices: Modal Dialog Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
  - Finding: modal content must actually be modal, contain its tab sequence, close with Escape, move focus inside on open, and restore focus on close. For irreversible actions, initial focus should be on the least destructive action.
  - Applied: native `<dialog>` provides modal/inert behavior; custom focus containment handles Tab cycling; dialogs have visible titles and close controls; focus returns to the invoker. Confirmation dialogs focus Cancel first.

### Live logs and status messages

- [WCAG 2.2 Understanding SC 4.1.3: Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)
  - Finding: action results, waiting state, progress, and errors must be programmatically available without taking focus, but excessive live announcements make applications unusably chatty.
  - Applied: concise command/connection results use an atomic polite status region, and errors use an assertive alert. Rendering or refreshing a buffer never steals focus. Live-stream announcements are user-controllable.
- [W3C Technique ARIA23: Using `role=log`](https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA23)
  - Finding: sequential log updates are correctly identified with `role="log"`; appended items may be announced politely without moving focus.
  - Applied: the event buffer has `role="log"`. Its default `aria-live="off"` avoids hundreds of announcements during initial hydration; the status-line toggle enables polite streaming. New events are summarized in a separate atomic message rather than replaying an entire buffer.

### Safe confirmation design

- [Nielsen Norman Group: Confirmation Dialogs Can Prevent User Errors](https://www.nngroup.com/articles/confirmation-dialog/)
  - Finding: confirmation should be reserved for serious consequences, identify the exact target and consequence, use action-specific labels instead of Yes/No, avoid a destructive default, and require a typed phrase only for the highest-risk actions.
  - Applied: routine reads and reversible controls run directly. Stop, clear/archive, deny/approve advice, gate decisions, plan approval/rejection/launch/archive, and direct iteration launches are guarded with specific consequence text and payload previews. Cancel receives initial focus. Queue clearing and plan archiving require a target phrase.

## Typographic and visual decisions

- The interface avoids green-on-black terminal mimicry. The default theme is warm paper with blue structural accents; the alternate low-glare slate theme retains the same semantic hierarchy.
- Monospace is reserved for commands, identifiers, paths, telemetry, tables, and payloads. UI explanations use a system sans stack for sustained readability.
- Status is never color-only: every state has visible text, borders, and tokens. Color adds urgency but does not carry meaning alone.
- Tables use tabular monospace data, restrained rules, sticky headings, and safe wrapping. Buffers remain readable at 4K and 1080p; mobile presents one switchable buffer and a touch command-menu entry.
- All rendered API and operator data is inserted with DOM `textContent`; the shell does not interpolate untrusted output into HTML.
