# Functional Spec: `split_view` Plugin — TUI Pane Layout Manager

## Overview

A plugin for OpenClaw TUI that splits the session view into **3 panes**:

1. **Chat** — conversational interaction (current behavior)
2. **File Actions** — real-time diff display + file action history from `write`, `edit`, and `apply_patch` operations
3. **Thinking Process** — visible reasoning/thinking trace for subagent and parent sessions

Layout is switchable by a button in the TUI toolbar. The default layout is single-pane (original chat-only).

---

## Goals

| Goal | Detail |
|---|---|
| Multi-pane visibility | Show chat, file diffs/actions, and thinking progress simultaneously or independently |
| Switchable layout | Single pane (chat only), dual pane (chat + one of [file actions, thinking]), three-pane (all three) |
| Per-session persistence | Remember user's chosen layout per session so it survives message turns |
| Non-intrusive | Falls back to standard chat-only when the plugin is not enabled or TUI lacks multi-pane support |
| No model-level changes | Purely TUI rendering; all data sources come from existing core tools (`write`, `sessions_spawn`, `dashboard`) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Toolbar: [☰ Layout] ── ○ Chat │ ● Files │ ● Thinking      │
├──────────┬──────────────────────┬───────────────────────────┤
│          │                      │                           │
│  PANE    │   PANE               │     PANE                  │
│  0       │   1                  │     2                       │
│  Chat    │  File Actions        │  Thinking Process         │
│  scroll  │  - live diffs        │  - raw reasoning output   │
│  stream  │  - edit summaries    │  - step-by-step markers   │
│  text    │  - patch summary     │  - collapsed by default   │
│          │  - added/removed     │                             │
│          │    line indicators   │                             │
└──────────┴──────────────────────┴───────────────────────────┘
```

### Data Sources

| Pane | Source | Mechanism |
|---|---|---|
| **Chat** | Standard conversation transcript | Existing TUI chat surface (no change) |
| **File Actions** | `write` / `edit` / `apply_patch` tool results | Hook into tool-output events; render `{diff}`, `{patch}`, `{summary: {added, deleted, modified}}` inline as syntax-highlighted diff views |
| **Thinking Process** | Subagent `thinking` parameter + session-level `model/thinking override` | Capture reasoning tokens streamed during generation; display in a collapsible panel |

---

## Panes — Detailed Behavior

### Pane 0: Chat

No changes to existing chat rendering. Remains the primary interactive surface. User can still type messages normally.

### Pane 1: File Actions

- Shows every file-operation tool result associated with the current session
- Each entry is a self-contained block:
  ```
  📄 edited: ./path/to/file.rs  [+4 lines] [-2 lines]
  ────────────────────────────────────────────────
  @@ -12,7 +12,9 @@
  - fn broken() -> Result<()> {
  ?              ^^^
  + fn fixed() -> std::io::Result<()> {
  ?              ^^^^^^^^^^
  [...]
  ```
- Supports expand/collapse per entry
- Filters: show only added, removed, or modified files; toggle full diff mode vs summary mode
- Updates in real time (streaming) as the agent writes/edits files during a turn

### Pane 2: Thinking Process

- Captures the reasoning/research/thinking blocks emitted by LLMs with chain-of-thought capability
- Displayed in collapsed form by default: `[▸ Thinking · 12 steps]`
- Click/tap expands to reveal raw reasoning output with timestamps
- Can optionally be auto-expanded on first encounter of a new thinking block
- Filtering: show all, show only current-turn, or hide entirely
- For subagent sessions spawned via `sessions_spawn`, thinking output from those children is aggregated under their session label

---

## Layout Modes

| Mode | Description | Shortcut / Button |
|---|---|---|
| **Single** | Only chat pane (default, original behaviour) | Button: "Chat only" |
| **Dual-Files** | Chat + File Actions side by side | Button: "Chat + Files" |
| **Dual-Thinking** | Chat + Thinking side by side | Button: "Chat + Think" |
| **Triple** | All three panes horizontally | Button: "Full view" |

### Switching Mechanism

- **Toolbar button**: A gear/menu icon in the TUI header opens a layout picker dropdown
- Keyboard shortcuts (optional, future):
  - `Ctrl+1` → Single
  - `Ctrl+2` → Dual-Files
  - `Ctrl+3` → Dual-Thinking
  - `Ctrl+4` → Triple

### Layout State Persistence

- Stored in `session-state.json` keyed by `sessionKey`:
  ```json
  {
    "layoutMode": "triple",
    "paneWidths": { "chat": 0.4, "files": 0.3, "thinking": 0.3 },
    "collapsedPanels": { "thinking": true }
  }
  ```
- On reconnect/reload, the saved state is restored automatically

---

## Configuration

Plugin config location: `~/.config/openclaw/plugins/split_view.config.yaml`

```yaml
plugins:
  entries:
    split_view:
      config:
        host:
          enabled: true                # Toggle feature globally
          default_layout: triple        # Single | dual-files | dual-thinking | triple
          auto_think_expand: false      # Auto-expand thinking blocks on first render
          max_diff_lines: 50           # Cap diff display per entry (collapse after N)
          show_additions: true          # Render "+" lines
          show_deletions: true          # Render "-" lines
          show_line_numbers: true       # Show diff gutter
```

Enable/disable via:
```bash
openclaw plugins enable split_view
openclaw plugins disable split_view
```

---

## Implementation Notes

### TUI Integration Points

1. **Pane splitter/drag resize**: Implement horizontal split panes with resizable gutters
2. **Diff renderer**: Reuse existing syntax highlighting library if available; otherwise simple ANSI-colored diffs
3. **Streaming event hooks**: Subscribe to:
   - Tool-call events (for `write`, `edit`, `apply_patch` output injection into File Actions pane)
   - Model-token-stream events (for reasoning/thinking capture in Thinking pane)
4. **Layout manager**: Coordinate pane widths across layout modes; animate transitions

### Fallback Behavior

- If `split_view` is not installed or disabled → TUI reverts to single-chat mode (zero disruption)
- If TUI does not support multiple panes → plugin gracefully degrades to single pane
- Diff capture failures → log warning; continue normal operation
- Thinking stream interruption → mark block as incomplete; no crash

### Performance Considerations

- Large diffs (>50 lines) are collapsed to summary with expand option
- Thinking process buffer is capped at ~5000 chars per block; older blocks are pruned when memory is needed
- No blocking I/O; all rendering updates are async/stream-based

---

## Future Extensions (Out of Scope v1)

- Vertical layout mode (top/bottom instead of left/right)
- Pin/resume: save pane positions between sessions across different projects
- Customizable colors/themes per pane
- Export diff history as a markdown artifact
- Merge thinking output with structured plan/checklist from `progress_card`

---

*Created: 2026-11-10*  
*Author: openclaw-engineer*  
*Status: draft spec*
