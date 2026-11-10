# OpenClaw Split View

> Split an OpenClaw TUI session into **Chat**, **File Actions**, and **Thinking** panes — with a layout you can switch on the fly.

`split-view` is an OpenClaw plugin. It keeps the normal chat surface intact while adding side panes that surface
what the agent is *doing*: the files it touches and the reasoning it produces. The layout is switchable per
session, and the chosen layout survives reconnects and message turns.

---

## Table of contents

- [Why](#why)
- [Layouts](#layouts)
- [Panes](#panes)
- [Tools](#tools)
- [Hooks](#hooks)
- [Configuration](#configuration)
- [Installation](#installation)
- [Development](#development)
- [Project layout](#project-layout)
- [How it works](#how-it-works)
- [Status & limitations](#status--limitations)
- [License](#license)

---

## Why

During a long coding session the chat transcript becomes the only visible output, so three useful signals get lost:

| Signal | Where it normally goes |
|---|---|
| What changed on disk | Buried in the chat log as tool results |
| What the model was reasoning about | Invisible, or truncated into the transcript |
| How far along a subagent is | Only visible as a spinner |

Split View promotes those to their own panes. Nothing about the model, the tools, or the host changes — the plugin
only observes and renders what already happened.

## Layouts

| Mode | Panes shown | `set_layout` argument |
|---|---|---|
| **Single** | Chat only (default host behaviour) | `single` |
| **Dual — Files** | Chat + File Actions | `dual-files` |
| **Dual — Think** | Chat + Thinking Process | `dual-thinking` |
| **Triple** | Chat + File Actions + Thinking Process | `triple` |

```
┌──────────────────────────────────────────────────────────────┐
│  Toolbar: [☰ Layout] ── ○ Chat │ ● Files │ ● Thinking        │
├───────────┬──────────────────────┬───────────────────────────┤
│  PANE 0   │  PANE 1              │  PANE 2                   │
│  Chat     │  File Actions        │  Thinking Process         │
│  scroll   │  - live diffs        │  - reasoning markers      │
│  stream   │  - edit summaries    │  - subagent lifecycle     │
│  text     │  - patch summaries   │  - collapsed by default   │
│           │  - +/- line counts   │                           │
└───────────┴──────────────────────┴───────────────────────────┘
```

## Panes

### Pane 0 — Chat

Unchanged. The plugin never rewrites, filters, or reorders conversation output. If the plugin is missing, disabled,
or the host does not support multiple panes, the session behaves exactly as it did before.

### Pane 1 — File Actions

Every `write`, `edit`, and `apply_patch` tool call is captured as a self-contained entry:

```
📄 edited: ./src/index.ts   [+12 lines] [-3 lines]
────────────────────────────────────────────────
@@ -42,7 +42,9 @@
- export function old() {
+ export function next() {
```

Entries can be expanded/collapsed individually. Diffs larger than `max_diff_lines` collapse to a summary with an
expand affordance, so a large rewrite never floods the pane.

### Pane 2 — Thinking Process

Records that reasoning happened, plus subagent lifecycle markers, so a parent session can follow children:

```
[▸ Thinking · anthropic/claude-opus-4]
[▸ ▶ Subagent started · sub-1234]
[▸ ◼ Subagent ended (completed)]
```

Blocks are collapsed by default and can be auto-expanded on first render via `auto_think_expand`.

## Tools

Both tools are exposed to the agent and are listed in the manifest `contracts.tools`.

| Tool | Purpose | Parameters |
|---|---|---|
| `split-view.set_layout` | Switch the layout mode for the active session | `mode: single \| dual-files \| dual-thinking \| triple` |
| `split-view.get_layout` | Read the current layout mode, pane widths, and collapsed panels | — |

```jsonc
// split-view.set_layout
{ "mode": "triple" }
```

Both tools are declared for every tool profile (`minimal`, `coding`, `messaging`, `full`) via manifest
`toolMetadata`, so they are available regardless of the active profile.

## Hooks

| Hook | Source | Used for |
|---|---|---|
| `before_tool_call` | `write`, `edit`, `apply_patch` | Streaming file-action entries into the File Actions pane |
| `model_call_ended` | model/provider call metadata | Recording a reasoning block per provider call |
| `subagent_spawned` | subagent lifecycle | Marking child session start |
| `subagent_ended` | subagent lifecycle | Marking child session completion |

Every hook is defensive: a malformed event, a missing session key, or a disabled plugin makes the handler return
early instead of throwing.

## Configuration

Plugin config lives under `plugins.entries.split-view.config` in the OpenClaw config, and is validated against the
`configSchema` in `openclaw.plugin.json`.

```yaml
plugins:
  entries:
    split-view:
      enabled: true
      config:
        host:
          enabled: true                 # global on/off switch
          default_layout: triple        # single | dual-files | dual-thinking | triple
          auto_think_expand: false      # expand thinking blocks on first render
          max_diff_lines: 50            # collapse diffs after N lines
          show_additions: true          # render "+" lines
          show_deletions: true          # render "-" lines
          show_line_numbers: true       # show the diff gutter
```

| Option | Type | Default | Effect |
|---|---|---|---|
| `host.enabled` | boolean | `true` | Master switch; when `false` the tools report "disabled" and no data is captured |
| `host.default_layout` | enum | `triple` | Layout used for sessions with no stored state |
| `host.auto_think_expand` | boolean | `false` | Expand a thinking block the first time it is rendered |
| `host.max_diff_lines` | number | `50` | Collapse a diff entry after this many lines |
| `host.show_additions` | boolean | `true` | Render added lines in the diff view |
| `host.show_deletions` | boolean | `true` | Render removed lines in the diff view |
| `host.show_line_numbers` | boolean | `true` | Render the diff gutter / line numbers |

Enable or disable the plugin at runtime:

```bash
openclaw plugins enable split-view
openclaw plugins disable split-view
```

## Installation

### From a local build (recommended while developing)

```bash
npm install
npm run build
npm pack --pack-destination /tmp
openclaw plugins install npm-pack:/tmp/openclaw-plugins-split-view-0.1.0.tgz --force
openclaw plugins inspect split-view --runtime --json
```

### From a git checkout

```bash
openclaw plugins install git+https://github.com/ysofologis/PLUGIN__OpenClaw_SplitView.git
```

### From ClawHub (once published)

```bash
openclaw plugins install clawhub:@openclaw-plugins/split-view
```

Runtime dependencies (`typebox`) ship in `dependencies`; `openclaw` is a peer dependency so the plugin always
matches the host it is installed into.

## Development

Requirements: **Node 24.16+ or 26.1+**, and `npm` (or `pnpm`).

```bash
npm install       # install dependencies
npm run build     # tsc -> dist/
npm run validate  # openclaw plugins validate --entry ./dist/index.js
```

Useful while iterating:

```bash
npm run build
openclaw plugins reload split-view
openclaw plugins inspect split-view --runtime --json
```

The plugin is pure TypeScript and has no test suite yet — `npm run validate` plus the runtime inspection command
above is the current verification path.

### Compatibility

| Requirement | Version |
|---|---|
| `openclaw` (peer) | `>=2026.3.24-beta.2` |
| Plugin API | `>=2026.3.24-beta.2` |
| Minimum gateway | `2026.3.24-beta.2` |

## Project layout

```
.
├── src/
│   ├── index.ts              # plugin entry (definePluginEntry) — registers tools + hooks
│   ├── types/layout.ts       # shared types: LayoutMode, SessionLayoutState, DiffEntry, ThinkingBlock
│   ├── layout/registry.ts    # per-session state store (durable keyed state + live buffers)
│   ├── hooks/
│   │   ├── diff-hook.ts      # captures write/edit/apply_patch into the File Actions pane
│   │   └── thinking-hook.ts  # captures reasoning + subagent lifecycle into the Thinking pane
│   └── tools/
│       ├── set-layout.ts     # split-view.set_layout
│       └── get-layout.ts     # split-view.get_layout
├── openclaw.plugin.json      # plugin manifest (id, contracts, toolMetadata, configSchema)
├── package.json              # package metadata + openclaw extension/compat declarations
├── tsconfig.json
├── SPEC.md                   # functional spec the implementation follows
└── dist/                     # build output (git-ignored)
```

## How it works

```
 tool call / model event
          │
          ▼
   hook handler (diff-hook / thinking-hook)
          │
          ▼
   LayoutRegistry.pushDiff() / pushThinking()
          │
          ├──▶ in-memory live buffers  (per session, reset on flush)
          │
          └──▶ keyed state store      (durable, per session key, 24h TTL)
                      │
                      ▼
            split-view.get_layout / set_layout
```

- **Durable state** — the chosen layout mode, pane widths, and collapsed panels live in OpenClaw's keyed state
  runtime (`api.runtime.state.openKeyedStoreV2`), namespaced per plugin and capped at 500 entries with a 24-hour
  TTL. They are restored on reconnect.
- **Live buffers** — diff and thinking entries are kept in memory per session so a pane can render the newest
  activity first, without writing every event to disk.
- **Degradation** — if the plugin is not installed, disabled, or the host has no multi-pane support, the session
  falls back to a single chat pane with no disruption.

## Status & limitations

This is an **alpha** implementation. The tool surface, hook wiring, and state layer are in place; the pane
rendering itself is the remaining work.

Known gaps:

- Pane rendering is not yet wired into the TUI — layout state is stored and queryable, but not drawn.
- The tools currently operate on the `current-session` key rather than the calling session's key.
- Reasoning capture records that a reasoning step occurred, not the raw reasoning text.
- No automated tests yet.
- Keyboard shortcuts (`Ctrl+1` … `Ctrl+4`) and the toolbar layout picker are specified but not implemented.

See [`SPEC.md`](./SPEC.md) for the full functional spec, including the v1 design intent and out-of-scope items.

## License

MIT — see [LICENSE](./LICENSE).
